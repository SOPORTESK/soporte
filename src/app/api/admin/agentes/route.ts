import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";
import { cacheDelete } from "@/lib/supabase/cache";
import { revalidatePath } from "next/cache";
import { NextRequest, NextResponse } from "next/server";

function clearAllAgentCaches(email?: string) {
  cacheDelete("all_agents_config");
  cacheDelete("app_work_schedule");
  cacheDelete("app_overtime_all");
  cacheDelete("equipo_all_casos");
  if (email) {
    const norm = email.trim().toLowerCase();
    cacheDelete(`agent_config_${email}`);
    cacheDelete(`agent_config_${norm}`);
    cacheDelete(`agent_full_${email}`);
    cacheDelete(`agent_full_${norm}`);
    cacheDelete(`agent_casos_${email}`);
    cacheDelete(`agent_casos_${norm}`);
    cacheDelete(`active_manual_${norm}`);
  }
  try {
    revalidatePath("/admin/equipo");
    revalidatePath("/admin/equipo/perfil");
    revalidatePath("/admin/actividad");
    revalidatePath("/admin/settings");
    revalidatePath("/admin");
  } catch {}
}

// GET - Listar agentes activos del sistema
export async function GET() {
  const supabase = createServiceClient();
  const { data, error } = await supabase
    .from("sek_agent_config")
    .select("*")
    .not("email", "ilike", "%system_prompt%")
    .not("email", "ilike", "%whatsapp_agent%")
    .not("email", "ilike", "%technician_assistant%")
    .not("rol", "in", '("bot","sistema")')
    .order("nombre", { ascending: true });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ data: data || [], agents: data || [] });
}

// PATCH - Actualizar datos de un agente y sincronizar en todos los procesos del sistema
export async function PATCH(req: NextRequest) {
  const supabase = createClient();
  const supabaseAdmin = createServiceClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { data: currentAgent } = await supabaseAdmin
    .from("sek_agent_config")
    .select("rol")
    .ilike("email", user.email!)
    .maybeSingle();

  if (!currentAgent || !["admin", "superadmin"].includes(currentAgent.rol)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const body = await req.json();
  const { email, rol, nombre, apellido, telefono, ...updates } = body;
  if (!email) {
    return NextResponse.json({ error: "Email es requerido" }, { status: 400 });
  }

  const normEmail = String(email).trim().toLowerCase();

  const { data: targetAgent } = await supabaseAdmin
    .from("sek_agent_config")
    .select("*")
    .ilike("email", normEmail)
    .maybeSingle();

  if (targetAgent?.rol === "superadmin" && currentAgent.rol !== "superadmin") {
    return NextResponse.json(
      { error: "No tienes permiso para modificar a un Superadministrador." },
      { status: 403 }
    );
  }

  if (rol === "superadmin" && currentAgent.rol !== "superadmin") {
    return NextResponse.json(
      { error: "Solo un Superadministrador puede asignar el rol de Superadmin." },
      { status: 403 }
    );
  }

  const updatePayload: Record<string, any> = {
    ...updates,
    updated_at: new Date().toISOString(),
  };
  if (rol !== undefined) updatePayload.rol = rol;
  if (nombre !== undefined) updatePayload.nombre = nombre;
  if (apellido !== undefined) updatePayload.apellido = apellido;
  if (telefono !== undefined) updatePayload.telefono = telefono;

  // 1. Actualizar en sek_agent_config
  const { data: updatedAgent, error } = await supabaseAdmin
    .from("sek_agent_config")
    .update(updatePayload)
    .ilike("email", normEmail)
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const fullName = [updatedAgent.nombre, updatedAgent.apellido].filter(Boolean).join(" ").trim();

  // 2. Sincronizar nombre y rol en Supabase Auth (user_metadata)
  try {
    const { data: usersList } = await supabaseAdmin.auth.admin.listUsers({ perPage: 1000 });
    const authUser = (usersList?.users || []).find(
      (u) => (u.email || "").toLowerCase() === normEmail
    );
    if (authUser) {
      await supabaseAdmin.auth.admin.updateUserById(authUser.id, {
        user_metadata: {
          ...(authUser.user_metadata || {}),
          nombre: updatedAgent.nombre,
          apellido: updatedAgent.apellido,
          full_name: fullName || normEmail,
          rol: updatedAgent.rol,
        },
      });
    }
  } catch (e) {
    console.error("[admin/agentes PATCH] Error syncing Auth metadata:", e);
  }

  // 3. Si cambió el nombre, sincronizar en registros de horas extras y logs recientes
  if (fullName) {
    try {
      const { data: otSetting } = await supabaseAdmin
        .from("sek_app_settings")
        .select("value")
        .eq("key", "activity_overtime_requests")
        .maybeSingle();

      if (otSetting?.value) {
        const list = JSON.parse(otSetting.value);
        if (Array.isArray(list)) {
          let changed = false;
          const updatedList = list.map((item: any) => {
            if ((item.agent_email || "").toLowerCase() === normEmail && item.agent_name !== fullName) {
              changed = true;
              return { ...item, agent_name: fullName };
            }
            return item;
          });
          if (changed) {
            await supabaseAdmin.from("sek_app_settings").upsert(
              {
                key: "activity_overtime_requests",
                value: JSON.stringify(updatedList),
                iv: "none",
                tag: "none",
                updated_at: new Date().toISOString(),
              },
              { onConflict: "key" }
            );
          }
        }
      }

      await supabaseAdmin
        .from("activity_log")
        .update({ agent_name: fullName })
        .ilike("agent_email", normEmail);
    } catch (e) {
      console.error("[admin/agentes PATCH] Error syncing name across logs/overtime:", e);
    }
  }

  clearAllAgentCaches(normEmail);
  return NextResponse.json({ data: updatedAgent, success: true });
}

// DELETE - Eliminar agente de TODOS los procesos del sistema
export async function DELETE(req: NextRequest) {
  const supabase = createClient();
  const supabaseAdmin = createServiceClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { data: agent } = await supabaseAdmin
    .from("sek_agent_config")
    .select("rol")
    .ilike("email", user.email!)
    .maybeSingle();

  if (!agent || !["admin", "superadmin"].includes(agent.rol)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { searchParams } = new URL(req.url);
  const email = searchParams.get("email");
  if (!email) return NextResponse.json({ error: "Email required" }, { status: 400 });

  const normEmail = email.trim().toLowerCase();

  // Evitar que un admin normal elimine a un superadmin
  const { data: targetAgent } = await supabaseAdmin
    .from("sek_agent_config")
    .select("rol")
    .ilike("email", normEmail)
    .maybeSingle();

  if (targetAgent?.rol === "superadmin" && agent.rol !== "superadmin") {
    return NextResponse.json(
      { error: "Solo un Superadministrador puede eliminar a otro Superadministrador." },
      { status: 403 }
    );
  }

  // 1. Eliminar de sek_agent_config
  const { error } = await supabaseAdmin
    .from("sek_agent_config")
    .delete()
    .ilike("email", normEmail);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // 2. Eliminar cuenta de acceso en Supabase Auth para revocar acceso inmediato
  try {
    const { data: usersList } = await supabaseAdmin.auth.admin.listUsers({ perPage: 1000 });
    const authUser = (usersList?.users || []).find(
      (u) => (u.email || "").toLowerCase() === normEmail
    );
    if (authUser) {
      await supabaseAdmin.auth.admin.deleteUser(authUser.id);
    }
  } catch (e) {
    console.error("[admin/agentes DELETE] Error deleting Auth user:", e);
  }

  // 3. Limpiar horario personalizado del agente en activity_work_schedule
  try {
    const { data: schedSetting } = await supabaseAdmin
      .from("sek_app_settings")
      .select("value")
      .eq("key", "activity_work_schedule")
      .maybeSingle();

    if (schedSetting?.value) {
      const parsed = JSON.parse(schedSetting.value);
      if (parsed.agentSchedules && parsed.agentSchedules[normEmail]) {
        delete parsed.agentSchedules[normEmail];
        await supabaseAdmin.from("sek_app_settings").upsert(
          {
            key: "activity_work_schedule",
            value: JSON.stringify(parsed),
            iv: "none",
            tag: "none",
            updated_at: new Date().toISOString(),
          },
          { onConflict: "key" }
        );
      }
    }
  } catch (e) {
    console.error("[admin/agentes DELETE] Error cleaning agent schedule:", e);
  }

  // 4. Limpiar solicitudes de horas extras del usuario eliminado
  try {
    const { data: otSetting } = await supabaseAdmin
      .from("sek_app_settings")
      .select("value")
      .eq("key", "activity_overtime_requests")
      .maybeSingle();

    if (otSetting?.value) {
      const list = JSON.parse(otSetting.value);
      if (Array.isArray(list)) {
        const filtered = list.filter(
          (item: any) => (item.agent_email || "").toLowerCase() !== normEmail
        );
        if (filtered.length !== list.length) {
          await supabaseAdmin.from("sek_app_settings").upsert(
            {
              key: "activity_overtime_requests",
              value: JSON.stringify(filtered),
              iv: "none",
              tag: "none",
              updated_at: new Date().toISOString(),
            },
            { onConflict: "key" }
          );
        }
      }
    }
  } catch (e) {
    console.error("[admin/agentes DELETE] Error cleaning overtime requests:", e);
  }

  // 5. Liberar casos abiertos que estuvieran asignados al usuario eliminado
  try {
    await supabaseAdmin
      .from("sek_cases")
      .update({ assigned_to: null, updated_at: new Date().toISOString() })
      .ilike("assigned_to", normEmail)
      .in("estado", ["abierto", "asignado", "pendiente", "en_proceso"]);
  } catch (e) {
    console.error("[admin/agentes DELETE] Error releasing open cases:", e);
  }

  // 6. Limpiar logs de actividad del usuario eliminado para que no aparezca como fantasma en rankings
  try {
    await supabaseAdmin.from("activity_log").delete().ilike("agent_email", normEmail);
    await supabaseAdmin.from("activity_summary").delete().ilike("agent_email", normEmail);
  } catch (e) {
    console.error("[admin/agentes DELETE] Error cleaning activity logs:", e);
  }

  clearAllAgentCaches(normEmail);
  return NextResponse.json({ success: true });
}
