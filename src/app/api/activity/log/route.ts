import { NextRequest, NextResponse } from "next/server";
import { insertActivityLog, hasActiveManualTask, getWorkSchedule } from "@/lib/activity-db";

export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { agent_email, agent_name, action, category, case_id, metadata, duration_ms } = body;

    if (!agent_email || !action || !category) {
      return NextResponse.json(
        { error: "agent_email, action and category are required" },
        { status: 400 }
      );
    }

    const actLower = String(action).toLowerCase();
    const isManualAction = Boolean(
      metadata?.manual ||
      metadata?.task ||
      metadata?.justification ||
      actLower.startsWith("inició:") ||
      actLower.startsWith("inicio:") ||
      actLower.startsWith("terminó:") ||
      actLower.startsWith("termino:") ||
      actLower.startsWith("justificación:") ||
      actLower.startsWith("justificacion:")
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

      // Si el horario laboral está activo, fuera de ese horario o día NADA se mide
      try {
        const sched = await getWorkSchedule();
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
          const minOfDay = nowCostaRica.getHours() * 60 + nowCostaRica.getMinutes();
          const parseMin = (t: string) => {
            const parts = (t || "").split(":");
            return (parseInt(parts[0], 10) || 0) * 60 + (parseInt(parts[1], 10) || 0);
          };
          const startMin = parseMin(sched.scheduleStart);
          const endMin = parseMin(sched.scheduleEnd);
          if (minOfDay < startMin || minOfDay >= endMin) {
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
