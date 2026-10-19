import { NextRequest, NextResponse } from "next/server";
import {
  getOvertimeRequests,
  requestOvertime,
  updateOvertimeStatus,
  getWorkSchedule,
  getAppMappings,
  getTodayCostaRica,
  type OvertimeRequest,
} from "@/lib/activity-db";
import { createServiceClient } from "@/lib/supabase/service";
import { computeUnifiedActivityMetrics } from "@/lib/activity-engine";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const date = searchParams.get("date") || undefined;
    const rawAgent = searchParams.get("agent") || undefined;
    const agent = rawAgent && rawAgent !== "all" ? rawAgent.trim().toLowerCase() : undefined;

    const supabase = createServiceClient();

    // 1. Obtener todos los colaboradores activos de sek_agent_config
    const { data: agentRows } = await supabase
      .from("sek_agent_config")
      .select("email, nombre, apellido, rol")
      .not("email", "ilike", "%system_prompt%")
      .not("email", "ilike", "%whatsapp_agent%")
      .not("email", "ilike", "%technician_assistant%")
      .not("rol", "in", '("bot","sistema")')
      .order("nombre", { ascending: true });

    const agentsList = (agentRows || []).map((a) => ({
      email: (a.email || "").toLowerCase(),
      name: [a.nombre, a.apellido].filter(Boolean).join(" ").trim() || a.email,
      rol: a.rol || "tecnico",
    }));

    const agentNameMap = new Map<string, string>();
    for (const a of agentsList) {
      agentNameMap.set(a.email, a.name);
    }

    // 2. Obtener las solicitudes guardadas y detectar automáticamente horas extras recientes para TODOS los usuarios
    const [storedRequests, globalSchedule, appMappings] = await Promise.all([
      getOvertimeRequests(date, agent),
      getWorkSchedule(),
      getAppMappings(),
    ]);

    const mergedMap = new Map<string, OvertimeRequest>();
    for (const reqItem of storedRequests) {
      // Filtrar si el usuario ya fue eliminado de sek_agent_config
      const normEmail = (reqItem.agent_email || "").toLowerCase();
      if (agentNameMap.size > 0 && !agentNameMap.has(normEmail)) continue;
      mergedMap.set(reqItem.id, {
        ...reqItem,
        agent_name: agentNameMap.get(normEmail) || reqItem.agent_name || normEmail,
      });
    }

    // Auto-detectar horas extras de los últimos 14 días en activity_log para que ningún colaborador quede por fuera
    const todayCR = getTodayCostaRica();
    const [ty, tm, td] = todayCR.split("-").map(Number);
    const startObj = new Date(Date.UTC(ty, tm - 1, td, 12, 0, 0));
    startObj.setUTCDate(startObj.getUTCDate() - 14);
    const startStr = `${startObj.getUTCFullYear()}-${String(startObj.getUTCMonth() + 1).padStart(2, "0")}-${String(startObj.getUTCDate()).padStart(2, "0")}`;

    let logQuery = supabase
      .from("activity_log")
      .select("id, agent_email, agent_name, action, category, metadata, duration_ms, created_at")
      .gte("created_at", `${date || startStr}T00:00:00-06:00`)
      .lte("created_at", `${date || todayCR}T23:59:59.999-06:00`)
      .order("created_at", { ascending: true })
      .limit(10000);

    if (agent) {
      logQuery = logQuery.ilike("agent_email", agent);
    }

    const { data: recentLogs } = await logQuery;

    if (recentLogs && recentLogs.length > 0) {
      // Agrupar por email y fecha CR
      const grouped = new Map<string, any[]>();
      for (const l of recentLogs) {
        if (!l.created_at || !l.agent_email) continue;
        const em = l.agent_email.toLowerCase().trim();
        if (agentNameMap.size > 0 && !agentNameMap.has(em)) continue;
        const dStr = new Date(l.created_at).toLocaleDateString("en-CA", {
          timeZone: "America/Costa_Rica",
        });
        const key = `${em}|${dStr}`;
        const arr = grouped.get(key) || [];
        arr.push(l);
        grouped.set(key, arr);
      }

      const toleranceMinutes = Math.max(1, Number(globalSchedule.toleranceMinutes) || 3);

      for (const [key, dayLogs] of Array.from(grouped.entries())) {
        const [em, dStr] = key.split("|");
        const otId = `ot-${em}-${dStr}`;

        const custom = globalSchedule.agentSchedules?.[em];
        const useCustom = Boolean(custom?.custom);
        const workDays =
          useCustom && Array.isArray(custom?.workDays) && custom.workDays.length > 0
            ? custom.workDays
            : globalSchedule.workDays || [1, 2, 3, 4, 5];
        const useMixed = useCustom ? Boolean(custom?.useMixedSchedule) : Boolean(globalSchedule.useMixedSchedule);
        const daySchedules = useCustom ? custom?.daySchedules || globalSchedule.daySchedules : globalSchedule.daySchedules;

        const [y, m, d] = dStr.split("-").map(Number);
        const dayOfWeek = new Date(Date.UTC(y, m - 1, d, 12, 0, 0)).getUTCDay();
        const isWorkDay = workDays.includes(dayOfWeek);

        let schedStart = (useCustom ? custom?.scheduleStart : globalSchedule.scheduleStart) || "08:00";
        let schedEnd = (useCustom ? custom?.scheduleEnd : globalSchedule.scheduleEnd) || "17:00";
        let targetDailyHours = Number((useCustom ? custom?.targetDailyHours : globalSchedule.targetDailyHours) || 8);

        if (useMixed && daySchedules && daySchedules[dayOfWeek]) {
          if (daySchedules[dayOfWeek].start) schedStart = daySchedules[dayOfWeek].start;
          if (daySchedules[dayOfWeek].end) schedEnd = daySchedules[dayOfWeek].end;
          if (daySchedules[dayOfWeek].targetHours) targetDailyHours = Number(daySchedules[dayOfWeek].targetHours);
        }

        const computed = computeUnifiedActivityMetrics(dayLogs, {
          toleranceMinutes,
          targetDailyHours,
          scheduleStart: schedStart,
          scheduleEnd: schedEnd,
          useMixedSchedule: useMixed,
          daySchedules,
          appMappings,
        });

        const productiveMs = computed.masterBuckets.Productivo.durationMs;
        const breakMs = computed.masterBuckets.Descanso.durationMs;
        const sanitaryMs = computed.masterBuckets["Pausa Sanitaria"].durationMs;
        const totalWorkdayMs = computed.totalWorkdayMs || (productiveMs + breakMs + sanitaryMs);

        let offScheduleMs = 0;
        if (!isWorkDay) {
          offScheduleMs = productiveMs;
        } else {
          const targetMs = targetDailyHours * 3600 * 1000;
          const overTargetMs = Math.max(0, totalWorkdayMs - targetMs);
          const schedStartMs = new Date(`${dStr}T${schedStart.padStart(5, "0")}:00-06:00`).getTime();
          const schedEndMs = new Date(`${dStr}T${schedEnd.padStart(5, "0")}:00-06:00`).getTime();
          let outsideWindowMs = 0;
          for (const ev of dayLogs) {
            const catL = String(ev.category || "").toLowerCase();
            if (catL === "inactividad" || catL === "descansos" || catL === "pausa sanitaria") continue;
            const evMs = new Date(ev.created_at || "").getTime();
            const dur = Number(ev.duration_ms || (ev.metadata?.duration_seconds ? ev.metadata.duration_seconds * 1000 : 0)) || 0;
            if (!isNaN(evMs) && dur > 0 && (evMs < schedStartMs || evMs >= schedEndMs)) {
              outsideWindowMs += Math.min(dur, 30 * 60 * 1000);
            }
          }
          offScheduleMs = Math.max(overTargetMs, outsideWindowMs);
        }

        const overtimeMinutes = Math.round(offScheduleMs / 60000);
        const totalActiveMinutes = Math.round(productiveMs / 60000);

        if (overtimeMinutes >= 5) {
          const existing = mergedMap.get(otId);
          if (!existing) {
            mergedMap.set(otId, {
              id: otId,
              agent_email: em,
              agent_name: agentNameMap.get(em) || dayLogs[0]?.agent_name || em,
              date: dStr,
              overtime_minutes: overtimeMinutes,
              total_active_minutes: totalActiveMinutes,
              status: "pending",
              requested_at: dayLogs[dayLogs.length - 1]?.created_at || new Date().toISOString(),
              reviewed_at: null,
              reviewed_by: null,
              notes: isWorkDay
                ? `Detectado automáticamente fuera de turno (${schedStart} - ${schedEnd})`
                : "Trabajo activo en día libre",
            });
          } else if (existing.status === "pending" && overtimeMinutes > existing.overtime_minutes) {
            mergedMap.set(otId, {
              ...existing,
              overtime_minutes: overtimeMinutes,
              total_active_minutes: Math.max(existing.total_active_minutes || 0, totalActiveMinutes),
            });
          }
        }
      }
    }

    const finalRequests = Array.from(mergedMap.values()).sort((a, b) =>
      (b.date || "").localeCompare(a.date || "")
    );

    return NextResponse.json({
      success: true,
      requests: finalRequests,
      agents: agentsList,
    });
  } catch (err: any) {
    console.error("[api/activity/overtime] GET error:", err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { action } = body;

    if (action === "request") {
      const { agentEmail, agentName, date, overtimeMinutes, totalActiveMinutes } = body;
      if (!agentEmail || !date) {
        return NextResponse.json({ error: "Faltan datos obligatorios" }, { status: 400 });
      }
      const item = await requestOvertime({
        agentEmail,
        agentName: agentName || agentEmail,
        date,
        overtimeMinutes: Number(overtimeMinutes) || 0,
        totalActiveMinutes: Number(totalActiveMinutes) || 0,
      });
      return NextResponse.json({ success: true, request: item });
    }

    if (action === "review") {
      const { id, status, reviewedBy, notes, agentEmail, agentName, date, overtimeMinutes, totalActiveMinutes } = body;
      if (!id || !status || !["approved", "rejected"].includes(status)) {
        return NextResponse.json({ error: "Parámetros inválidos" }, { status: 400 });
      }
      let updated = await updateOvertimeStatus(id, status, reviewedBy || "Administración", notes);
      // Si era una hora extra auto-detectada que aún no estaba persistida en sek_app_settings, crearla primero y aprobarla/rechazarla
      if (!updated && agentEmail && date) {
        await requestOvertime({
          agentEmail,
          agentName: agentName || agentEmail,
          date,
          overtimeMinutes: Number(overtimeMinutes) || 0,
          totalActiveMinutes: Number(totalActiveMinutes) || 0,
        });
        updated = await updateOvertimeStatus(id, status, reviewedBy || "Administración", notes);
      }
      if (!updated) {
        return NextResponse.json({ error: "Solicitud no encontrada" }, { status: 404 });
      }
      return NextResponse.json({ success: true, request: updated });
    }

    return NextResponse.json({ error: "Acción no soportada" }, { status: 400 });
  } catch (err: any) {
    console.error("[api/activity/overtime] POST error:", err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
