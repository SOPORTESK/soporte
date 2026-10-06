import { NextRequest, NextResponse } from "next/server";
import { insertActivityLog, hasActiveManualTask, getAgentSchedule } from "@/lib/activity-db";
import { createServiceClient } from "@/lib/supabase/service";

export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { agent_email, agent_name, action, category, case_id, metadata, duration_ms, created_at } = body;

    if (!agent_email || !action || !category) {
      return NextResponse.json(
        { error: "agent_email, action and category are required" },
        { status: 400 }
      );
    }

    const actLower = String(action).toLowerCase();
    const catLower = String(category || "").toLowerCase();
    const isManualAction = Boolean(
      metadata?.manual ||
      metadata?.task ||
      metadata?.justification ||
      actLower.startsWith("inició:") ||
      actLower.startsWith("inicio:") ||
      actLower.startsWith("terminó:") ||
      actLower.startsWith("termino:") ||
      actLower.startsWith("justificación:") ||
      actLower.startsWith("justificacion:") ||
      catLower === "labores manuales" ||
      catLower === "capacitación" ||
      catLower === "capacitacion" ||
      catLower === "tiempo de descanso" ||
      catLower === "pausa personal" ||
      catLower === "reunión interna" ||
      catLower === "reunion interna" ||
      catLower === "atención presencial" ||
      catLower === "atencion presencial" ||
      catLower === "mantenimiento" ||
      catLower === "inventario"
    );

    // Si el usuario tiene una labor manual activa en curso, SE PAUSAN TODOS LOS DEMÁS LOGS
    if (!isManualAction) {
      const activeManual = await hasActiveManualTask(agent_email);
      if (activeManual) {
        return NextResponse.json({
          success: true,
          paused: true,
          message: "Logs automáticos pausados debido a una labor manual activa en curso."
        });
      }

      // Jerarquía de Horario: Prioriza horario individual del empleado; si no tiene, usa el horario operativo global
      try {
        const sched = await getAgentSchedule(agent_email);
        if (sched.scheduleEnabled) {
          const nowCostaRica = new Date(new Date().toLocaleString("en-US", { timeZone: "America/Costa_Rica" }));
          const dayOfWeek = nowCostaRica.getDay(); // 0 = Domingo, 1 = Lunes, ..., 6 = Sábado
          const workDays = sched.workDays && sched.workDays.length > 0 ? sched.workDays : [1, 2, 3, 4, 5];

          // 1. Descartar si hoy no es día laboral
          if (!workDays.includes(dayOfWeek)) {
            return NextResponse.json({
              success: true,
              discarded: true,
              message: "Día no laboral: nada se mide",
            });
          }

          // 2. Descartar si está fuera de la hora de jornada
          const [startH, startM] = (sched.scheduleStart || "07:00").split(":").map(Number);
          const [endH, endM] = (sched.scheduleEnd || "17:00").split(":").map(Number);

          const currentMinutes = nowCostaRica.getHours() * 60 + nowCostaRica.getMinutes();
          const startMinutes = startH * 60 + startM;
          const endMinutes = endH * 60 + endM;

          if (currentMinutes < startMinutes || currentMinutes > endMinutes) {
            return NextResponse.json({
              success: true,
              discarded: true,
              message: "Fuera de horario laboral: nada se mide",
            });
          }
        }
      } catch (err) {
        console.error("[activity/log] Error checking schedule:", err);
      }
    }

    try {
      await insertActivityLog({
        agent_email,
        agent_name: agent_name || agent_email,
        action,
        category,
        case_id: case_id || null,
        metadata: metadata || null,
        duration_ms: duration_ms || null,
        created_at: created_at || undefined,
      });
    } catch (e: any) {
      console.error("[activity/log] Async insert error:", e.message);
    }

    return NextResponse.json({ success: true });
  } catch (error: any) {
    console.error("[activity/log] Error:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function PATCH(req: NextRequest) {
  try {
    const body = await req.json();
    const { id, duration_ms, category, subcategory, action, reason, adjusted_by } = body;

    if (!id) {
      return NextResponse.json({ error: "El parámetro 'id' es requerido" }, { status: 400 });
    }

    const supabase = createServiceClient();
    const { data: existing, error: fetchErr } = await supabase
      .from("activity_log")
      .select("*")
      .eq("id", id)
      .single();

    if (fetchErr || !existing) {
      return NextResponse.json({ error: "Registro no encontrado en activity_log" }, { status: 404 });
    }

    const currentMeta = (existing.metadata || {}) as Record<string, any>;
    const updatePayload: Record<string, any> = {};

    if (duration_ms !== undefined) {
      updatePayload.duration_ms = duration_ms;
    }
    if (category) {
      updatePayload.category = category;
    }
    if (action) {
      updatePayload.action = action;
    }

    const updatedMeta: Record<string, any> = {
      ...currentMeta,
      adjusted_at: new Date().toISOString(),
      adjusted_by: adjusted_by || "Administrador",
      adjusted_reason: reason || "Ajuste manual de registro administrativo",
    };

    if (duration_ms !== undefined) {
      updatedMeta.duration_seconds = Math.round(duration_ms / 1000);
      if (!currentMeta.original_duration_seconds) {
        updatedMeta.original_duration_seconds = Math.round((existing.duration_ms || 0) / 1000);
      }
    }
    if (subcategory) {
      updatedMeta.subcategory = subcategory;
      updatedMeta.manual_subcategory = subcategory;
    }

    updatePayload.metadata = updatedMeta;

    const { data: updated, error: updateErr } = await supabase
      .from("activity_log")
      .update(updatePayload)
      .eq("id", id)
      .select()
      .single();

    if (updateErr) {
      return NextResponse.json({ error: updateErr.message }, { status: 500 });
    }

    return NextResponse.json({ success: true, record: updated });
  } catch (error: any) {
    console.error("[activity/log PATCH] Error:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const id = searchParams.get("id");

    if (!id) {
      return NextResponse.json({ error: "El parámetro 'id' es requerido" }, { status: 400 });
    }

    const supabase = createServiceClient();
    const { error: deleteErr } = await supabase
      .from("activity_log")
      .delete()
      .eq("id", id);

    if (deleteErr) {
      return NextResponse.json({ error: deleteErr.message }, { status: 500 });
    }

    return NextResponse.json({ success: true, deletedId: id });
  } catch (error: any) {
    console.error("[activity/log DELETE] Error:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
