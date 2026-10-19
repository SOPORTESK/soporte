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
    const appMetaLower = String(metadata?.app || metadata?.app_name || metadata?.process || "").toLowerCase();

    // Descartar únicamente cuando clientes antiguos intentan reportar LockApp o protectores .scr como software productivo repetitivo,
    // pero PERMITIR siempre los registros legítimos de categoría 'Inactividad'.
    if (
      catLower !== "inactividad" &&
      (
        appMetaLower === "lockapp" ||
        appMetaLower === "logonui" ||
        appMetaLower.endsWith(".scr") ||
        actLower.startsWith("en curso • lockapp") ||
        actLower.startsWith("lockapp:") ||
        actLower.includes("mystify") ||
        actLower.includes(".scr")
      )
    ) {
      return NextResponse.json({
        success: true,
        discarded: true,
        message: "Evento de protector/bloqueo de pantalla como software productivo ignorado",
      });
    }

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

      // El tracking mide tiempo activo 24/7 (para horas extras), pero el tiempo inactivo SOLO se envía dentro del horario laboral.
      let configuredToleranceMin = 3;
      let withinSchedule = true;
      try {
        const sched = await getAgentSchedule(agent_email);
        configuredToleranceMin = Math.max(1, Number(sched.toleranceMinutes) || 3);

        if (sched && sched.scheduleEnabled !== false) {
          const refDate = created_at ? new Date(created_at) : new Date();
          const crDate = new Date(refDate.toLocaleString("en-US", { timeZone: "America/Costa_Rica" }));
          const day = crDate.getDay();
          if (Array.isArray(sched.workDays) && !sched.workDays.includes(day)) {
            withinSchedule = false;
          } else {
            let sStart = sched.scheduleStart || "08:00";
            let sEnd = sched.scheduleEnd || "17:00";
            if (sched.useMixedSchedule && sched.daySchedules && sched.daySchedules[day]) {
              if (sched.daySchedules[day].start) sStart = sched.daySchedules[day].start;
              if (sched.daySchedules[day].end) sEnd = sched.daySchedules[day].end;
            }
            const [startH, startM] = sStart.split(":").map(Number);
            const [endH, endM] = sEnd.split(":").map(Number);
            const curMin = crDate.getHours() * 60 + crDate.getMinutes();
            const startMin = startH * 60 + startM;
            const endMin = endH * 60 + endM;
            withinSchedule = startMin <= endMin
              ? (curMin >= startMin && curMin <= endMin)
              : (curMin >= startMin || curMin <= endMin);
          }
        }
      } catch (err) {
        console.error("[activity/log] Error checking schedule:", err);
      }

      if (catLower === "inactividad" && !withinSchedule) {
        return NextResponse.json({
          success: true,
          discarded: true,
          message: "Tiempo inactivo fuera de horario laboral no se envía a ningún proceso.",
        });
      }

      const finalAction = catLower === "inactividad"
        ? String(action).replace(/^Sin actividad por \d+ minutos/i, `Sin actividad por ${configuredToleranceMin} minutos`)
        : action;

      try {
        await insertActivityLog({
          agent_email,
          agent_name: agent_name || agent_email,
          action: finalAction,
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
