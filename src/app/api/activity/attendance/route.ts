import { NextRequest, NextResponse } from "next/server";
import {
  getActivityTimeline,
  getAgentSchedule,
  getAppMappings,
  getOvertimeRequests,
  getTodayCostaRica,
  type ActivityLog,
} from "@/lib/activity-db";
import { computeUnifiedActivityMetrics } from "@/lib/activity-engine";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export interface AttendanceDayRecord {
  date: string;
  dayOfWeek: number;
  dayLabel: string;
  dateFormatted: string;
  isToday: boolean;
  isWorkDay: boolean;
  scheduledStart: string;
  scheduledEnd: string;
  targetDailyHours: number;
  firstLoginTime: string | null;
  lastLogoutTime: string | null;
  isShiftActive: boolean;
  lateMinutes: number;
  earlyLeaveMinutes: number;
  activeMinutes: number;
  workdayMinutes: number;
  idleMinutes: number;
  breakMinutes: number;
  justifiedMinutes: number;
  compliancePercent: number;
  overtimeMinutes: number;
  overtimeStatus: "approved" | "pending" | "rejected" | "none";
  overtimeRequestId: string | null;
  overtimeNotes: string | null;
  overtimeReviewedBy: string | null;
  status: "en_curso" | "puntual" | "tardia" | "salida_anticipada" | "justificado" | "ausente" | "dia_libre" | "extra_dia_libre";
}

const DAY_NAMES_SHORT = ["Dom", "Lun", "Mar", "Mié", "Jue", "Vie", "Sáb"];

function getDatesBetween(startDateStr: string, endDateStr: string): string[] {
  const dates: string[] = [];
  const [sy, sm, sd] = startDateStr.split("-").map(Number);
  const [ey, em, ed] = endDateStr.split("-").map(Number);
  const cur = new Date(Date.UTC(sy, sm - 1, sd, 12, 0, 0));
  const end = new Date(Date.UTC(ey, em - 1, ed, 12, 0, 0));

  while (cur <= end && dates.length < 95) {
    const yyyy = cur.getUTCFullYear();
    const mm = String(cur.getUTCMonth() + 1).padStart(2, "0");
    const dd = String(cur.getUTCDate()).padStart(2, "0");
    dates.push(`${yyyy}-${mm}-${dd}`);
    cur.setUTCDate(cur.getUTCDate() + 1);
  }
  return dates;
}

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const agentEmail = searchParams.get("agent");
    if (!agentEmail) {
      return NextResponse.json({ error: "El parámetro 'agent' es requerido" }, { status: 400 });
    }

    const todayCR = getTodayCostaRica();
    const endDate = searchParams.get("endDate") || todayCR;
    let startDate = searchParams.get("startDate") || "";

    if (!startDate) {
      const daysParam = Math.min(90, Math.max(1, parseInt(searchParams.get("days") || "15", 10) || 15));
      const [ey, em, ed] = endDate.split("-").map(Number);
      const d = new Date(Date.UTC(ey, em - 1, ed, 12, 0, 0));
      d.setUTCDate(d.getUTCDate() - (daysParam - 1));
      startDate = `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}-${String(d.getUTCDate()).padStart(2, "0")}`;
    }

    const [allLogs, schedule, appMappings, overtimeList] = await Promise.all([
      getActivityTimeline(agentEmail, startDate, endDate),
      getAgentSchedule(agentEmail),
      getAppMappings(),
      getOvertimeRequests(undefined, agentEmail),
    ]);

    const logsByDate = new Map<string, ActivityLog[]>();
    for (const log of allLogs) {
      if (!log.created_at) continue;
      const dStr = new Date(log.created_at).toLocaleDateString("en-CA", {
        timeZone: "America/Costa_Rica",
      });
      const arr = logsByDate.get(dStr) || [];
      arr.push(log);
      logsByDate.set(dStr, arr);
    }

    const otByDate = new Map<string, (typeof overtimeList)[number]>();
    for (const ot of overtimeList) {
      if (ot.date) {
        otByDate.set(ot.date, ot);
      }
    }

    const workDays = Array.isArray(schedule.workDays) && schedule.workDays.length > 0
      ? schedule.workDays
      : [1, 2, 3, 4, 5];
    const toleranceMinutes = Math.max(1, Number(schedule.toleranceMinutes) || 3);

    const allDates = getDatesBetween(startDate, endDate).filter((d) => d <= todayCR);
    const records: AttendanceDayRecord[] = [];

    for (const dateStr of allDates) {
      const [y, m, d] = dateStr.split("-").map(Number);
      const dateObjUTC = new Date(Date.UTC(y, m - 1, d, 12, 0, 0));
      const dayOfWeek = dateObjUTC.getUTCDay();
      const dayLabel = DAY_NAMES_SHORT[dayOfWeek] || "";
      const dateFormatted = dateObjUTC.toLocaleDateString("es-CR", {
        day: "2-digit",
        month: "short",
        timeZone: "UTC",
      });
      const isToday = dateStr === todayCR;
      const isWorkDay = workDays.includes(dayOfWeek);

      let scheduledStart = schedule.scheduleStart || "08:00";
      let scheduledEnd = schedule.scheduleEnd || "17:00";
      let targetDailyHours = Number(schedule.targetDailyHours) || 8;

      if (schedule.useMixedSchedule && schedule.daySchedules && schedule.daySchedules[dayOfWeek]) {
        const rule = schedule.daySchedules[dayOfWeek];
        if (rule.start) scheduledStart = rule.start;
        if (rule.end) scheduledEnd = rule.end;
        if (rule.targetHours) targetDailyHours = Number(rule.targetHours);
      }

      const dayLogs = logsByDate.get(dateStr) || [];
      const otReq = otByDate.get(dateStr) || null;

      if (dayLogs.length === 0 && !otReq) {
        records.push({
          date: dateStr,
          dayOfWeek,
          dayLabel,
          dateFormatted,
          isToday,
          isWorkDay,
          scheduledStart,
          scheduledEnd,
          targetDailyHours,
          firstLoginTime: null,
          lastLogoutTime: null,
          isShiftActive: false,
          lateMinutes: 0,
          earlyLeaveMinutes: 0,
          activeMinutes: 0,
          workdayMinutes: 0,
          idleMinutes: 0,
          breakMinutes: 0,
          justifiedMinutes: 0,
          compliancePercent: 0,
          overtimeMinutes: 0,
          overtimeStatus: "none",
          overtimeRequestId: null,
          overtimeNotes: null,
          overtimeReviewedBy: null,
          status: isWorkDay ? (isToday ? "en_curso" : "ausente") : "dia_libre",
        });
        continue;
      }

      const computed = computeUnifiedActivityMetrics(dayLogs as any[], {
        toleranceMinutes,
        targetDailyHours,
        scheduleStart: scheduledStart,
        scheduleEnd: scheduledEnd,
        useMixedSchedule: schedule.useMixedSchedule,
        daySchedules: schedule.daySchedules,
        appMappings,
      });

      const productiveMs = computed.masterBuckets.Productivo.durationMs;
      const idleMs = computed.masterBuckets.Inactivo.durationMs;
      const breakMs = computed.masterBuckets.Descanso.durationMs;
      const sanitaryMs = computed.masterBuckets["Pausa Sanitaria"].durationMs;
      const totalWorkdayMs = computed.totalWorkdayMs || (productiveMs + breakMs + sanitaryMs);

      const activeMinutes = Math.round(productiveMs / 60000);
      const workdayMinutes = Math.round(totalWorkdayMs / 60000);
      const idleMinutes = Math.round(idleMs / 60000);
      const breakMinutes = Math.round((breakMs + sanitaryMs) / 60000);
      const justifiedMinutes = Math.round((computed.manualJustificationMs || 0) / 60000);

      const lateGap = computed.detectedGaps.find((g) => g.id === "gap-inicio-tardio");
      const earlyGap = computed.detectedGaps.find((g) => g.id === "gap-salida-anticipada");
      const lateMinutes = isWorkDay && lateGap ? lateGap.minutes : 0;
      const earlyLeaveMinutes = isWorkDay && earlyGap ? earlyGap.minutes : 0;

      // Calcular minutos activos realizados estrictamente fuera del horario laboral (antes de entrada, después de salida o en día libre)
      let offScheduleActiveMs = 0;
      const schedStartMs = new Date(`${dateStr}T${scheduledStart.padStart(5, "0")}:00-06:00`).getTime();
      const schedEndMs = new Date(`${dateStr}T${scheduledEnd.padStart(5, "0")}:00-06:00`).getTime();
      const isShiftStillOpenToday = isToday && Date.now() < schedEndMs;

      if (!isWorkDay) {
        offScheduleActiveMs = productiveMs;
      } else {
        const targetMs = targetDailyHours * 3600 * 1000;
        const overTargetMs = Math.max(0, productiveMs - targetMs);
        let outsideWindowMs = 0;
        for (const ev of dayLogs) {
          const catL = String(ev.category || "").toLowerCase();
          if (catL === "inactividad" || catL === "descansos" || catL === "pausa sanitaria") continue;
          const evEndMs = new Date(ev.created_at || "").getTime();
          const rawDur = Number(ev.duration_ms || (ev.metadata?.duration_seconds ? ev.metadata.duration_seconds * 1000 : 0)) || 0;
          const dur = Math.min(Math.max(0, rawDur), 30 * 60 * 1000);
          if (!isNaN(evEndMs) && dur > 0) {
            const evStartMs = evEndMs - dur;
            const beforeShiftMs = Math.max(0, Math.min(evEndMs, schedStartMs) - evStartMs);
            const afterShiftMs = Math.max(0, evEndMs - Math.max(evStartMs, schedEndMs));
            outsideWindowMs += beforeShiftMs + afterShiftMs;
          }
        }
        offScheduleActiveMs = Math.max(overTargetMs, outsideWindowMs);
      }

      const rawDetectedOvertimeMin = Math.round(offScheduleActiveMs / 60000);
      // Evitar falsos positivos por 1-4 minutos residuales al cerrar sesión tras la hora de salida
      const detectedOvertimeMin = rawDetectedOvertimeMin >= 5 ? rawDetectedOvertimeMin : 0;
      const overtimeMinutes = otReq ? (otReq.overtime_minutes || detectedOvertimeMin) : detectedOvertimeMin;
      const overtimeStatus: AttendanceDayRecord["overtimeStatus"] = otReq
        ? otReq.status
        : overtimeMinutes > 0
        ? "pending"
        : "none";

      const targetMinutes = Math.round(targetDailyHours * 60);
      const compliancePercent = isWorkDay && targetMinutes > 0
        ? Math.min(100, Math.round((workdayMinutes / targetMinutes) * 100))
        : (activeMinutes > 0 ? 100 : 0);

      const effectiveShiftActive = Boolean(computed.isShiftActive || isShiftStillOpenToday);

      let status: AttendanceDayRecord["status"] = "puntual";
      if (!isWorkDay) {
        status = activeMinutes > 0 || overtimeMinutes > 0 ? "extra_dia_libre" : "dia_libre";
      } else if (isToday && effectiveShiftActive) {
        status = lateMinutes > 0 ? "tardia" : "en_curso";
      } else if (activeMinutes === 0 && justifiedMinutes > 0) {
        status = "justificado";
      } else if (activeMinutes === 0 && workdayMinutes === 0) {
        status = "ausente";
      } else if (lateMinutes > 0) {
        status = "tardia";
      } else if (earlyLeaveMinutes > 0 && compliancePercent < 95) {
        status = "salida_anticipada";
      } else {
        status = "puntual";
      }

      records.push({
        date: dateStr,
        dayOfWeek,
        dayLabel,
        dateFormatted,
        isToday,
        isWorkDay,
        scheduledStart,
        scheduledEnd,
        targetDailyHours,
        firstLoginTime: computed.firstLoginTime,
        lastLogoutTime: computed.lastLogoutTime,
        isShiftActive: effectiveShiftActive,
        lateMinutes,
        earlyLeaveMinutes,
        activeMinutes,
        workdayMinutes,
        idleMinutes,
        breakMinutes,
        justifiedMinutes,
        compliancePercent,
        overtimeMinutes,
        overtimeStatus,
        overtimeRequestId: otReq?.id || null,
        overtimeNotes: otReq?.notes || null,
        overtimeReviewedBy: otReq?.reviewed_by || null,
        status,
      });
    }

    // Ordenar del día más reciente al más antiguo
    records.sort((a, b) => b.date.localeCompare(a.date));

    // Resumen ejecutivo del período
    const workDayRecords = records.filter((r) => r.isWorkDay);
    const attendedDays = workDayRecords.filter((r) => r.activeMinutes > 0 || r.justifiedMinutes > 0).length;
    const punctualDays = workDayRecords.filter((r) => (r.activeMinutes > 0 || r.justifiedMinutes > 0) && r.lateMinutes === 0).length;
    const lateDaysCount = workDayRecords.filter((r) => r.lateMinutes > 0).length;
    const totalLateMinutes = workDayRecords.reduce((acc, r) => acc + r.lateMinutes, 0);
    const earlyLeaveCount = workDayRecords.filter((r) => r.earlyLeaveMinutes > 0).length;
    const totalEarlyLeaveMinutes = workDayRecords.reduce((acc, r) => acc + r.earlyLeaveMinutes, 0);
    const absentDaysCount = workDayRecords.filter((r) => r.status === "ausente").length;
    const punctualityRate = attendedDays > 0 ? Math.round((punctualDays / attendedDays) * 100) : 100;

    const totalOvertimeApprovedMin = records
      .filter((r) => r.overtimeStatus === "approved")
      .reduce((acc, r) => acc + r.overtimeMinutes, 0);
    const totalOvertimePendingMin = records
      .filter((r) => r.overtimeStatus === "pending")
      .reduce((acc, r) => acc + r.overtimeMinutes, 0);

    return NextResponse.json({
      success: true,
      startDate,
      endDate,
      schedule: {
        isCustom: schedule.isCustom,
        scheduleStart: schedule.scheduleStart,
        scheduleEnd: schedule.scheduleEnd,
        workDays: schedule.workDays,
        targetDailyHours: schedule.targetDailyHours,
        useMixedSchedule: schedule.useMixedSchedule,
        daySchedules: schedule.daySchedules,
      },
      summary: {
        totalWorkDays: workDayRecords.length,
        attendedDays,
        punctualDays,
        punctualityRate,
        lateDaysCount,
        totalLateMinutes,
        earlyLeaveCount,
        totalEarlyLeaveMinutes,
        absentDaysCount,
        totalOvertimeApprovedMin,
        totalOvertimePendingMin,
      },
      records,
    });
  } catch (err: any) {
    console.error("[api/activity/attendance] GET error:", err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
