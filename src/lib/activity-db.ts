import { createServiceClient } from "@/lib/supabase/service";
import type { SupabaseClient } from "@supabase/supabase-js";

export interface ActivityLog {
  id?: number;
  agent_email: string;
  agent_name: string;
  action: string;
  category: string;
  case_id?: string | null;
  metadata?: Record<string, any> | null;
  duration_ms?: number | null;
  created_at?: string;
}

export interface ActivitySummary {
  id?: number;
  agent_email: string;
  date: string;
  summary: string;
  category: string;
  time_block: string;
  created_at?: string;
}

function getClient(): SupabaseClient {
  return createServiceClient();
}

export interface AgentScheduleOverride {
  scheduleStart: string;
  scheduleEnd: string;
  scheduleEnabled: boolean;
  workDays: number[];
  targetDailyHours: number;
  custom: boolean;
}

export interface WorkScheduleConfig {
  scheduleStart: string;
  scheduleEnd: string;
  scheduleEnabled: boolean;
  workDays: number[]; // 1=Lun, 2=Mar, 3=Mié, 4=Jue, 5=Vie, 6=Sáb, 0=Dom
  targetDailyHours: number; // Meta oficial de jornada diaria en horas (por defecto 10 horas)
  agentSchedules?: Record<string, AgentScheduleOverride>;
}

export interface OvertimeRequest {
  id: string; // ej: "ot-cbatista@sekunet.com-2026-09-17"
  agent_email: string;
  agent_name: string;
  date: string;
  overtime_minutes: number;
  total_active_minutes: number;
  status: "pending" | "approved" | "rejected";
  requested_at: string;
  reviewed_at?: string | null;
  reviewed_by?: string | null;
  notes?: string | null;
}

const SCHEDULE_SETTING_KEY = "activity_work_schedule";
const OVERTIME_SETTING_KEY = "activity_overtime_requests";

export async function getWorkSchedule(): Promise<WorkScheduleConfig> {
  const supabase = getClient();
  try {
    const { data, error } = await supabase
      .from("sek_app_settings")
      .select("value")
      .eq("key", SCHEDULE_SETTING_KEY)
      .maybeSingle();

    if (!error && data?.value) {
      const parsed = JSON.parse(data.value);
      return {
        scheduleStart: parsed.scheduleStart || "06:00",
        scheduleEnd: parsed.scheduleEnd || "18:00",
        scheduleEnabled: parsed.scheduleEnabled !== undefined ? Boolean(parsed.scheduleEnabled) : true,
        workDays: Array.isArray(parsed.workDays) && parsed.workDays.length > 0 ? parsed.workDays : [1, 2, 3, 4, 5],
        targetDailyHours: Number(parsed.targetDailyHours) || 10,
        agentSchedules: parsed.agentSchedules && typeof parsed.agentSchedules === "object" ? parsed.agentSchedules : {},
      };
    }
  } catch (err) {
    console.error("[getWorkSchedule] error:", err);
  }

  return { scheduleStart: "06:00", scheduleEnd: "18:00", scheduleEnabled: true, workDays: [1, 2, 3, 4, 5], targetDailyHours: 10, agentSchedules: {} };
}

export async function getAgentSchedule(agentEmail: string): Promise<WorkScheduleConfig & { isCustom: boolean; globalSchedule: Omit<WorkScheduleConfig, "agentSchedules"> }> {
  const global = await getWorkSchedule();
  const normalizedEmail = (agentEmail || "").trim().toLowerCase();
  const custom = global.agentSchedules ? global.agentSchedules[normalizedEmail] : null;

  const globalSchedule = {
    scheduleStart: global.scheduleStart,
    scheduleEnd: global.scheduleEnd,
    scheduleEnabled: global.scheduleEnabled,
    workDays: global.workDays,
    targetDailyHours: global.targetDailyHours,
  };

  if (custom && custom.custom) {
    return {
      scheduleStart: custom.scheduleStart || global.scheduleStart,
      scheduleEnd: custom.scheduleEnd || global.scheduleEnd,
      scheduleEnabled: custom.scheduleEnabled !== undefined ? Boolean(custom.scheduleEnabled) : global.scheduleEnabled,
      workDays: Array.isArray(custom.workDays) && custom.workDays.length > 0 ? custom.workDays : global.workDays,
      targetDailyHours: Number(custom.targetDailyHours) || global.targetDailyHours,
      isCustom: true,
      globalSchedule,
    };
  }

  return {
    ...global,
    isCustom: false,
    globalSchedule,
  };
}

export async function saveWorkSchedule(config: WorkScheduleConfig): Promise<void> {
  const supabase = getClient();
  // Preservar agentSchedules existentes si no vienen en config
  const existing = await getWorkSchedule();
  const val = JSON.stringify({
    scheduleStart: config.scheduleStart || "06:00",
    scheduleEnd: config.scheduleEnd || "18:00",
    scheduleEnabled: Boolean(config.scheduleEnabled),
    workDays: Array.isArray(config.workDays) && config.workDays.length > 0 ? config.workDays : [1, 2, 3, 4, 5],
    targetDailyHours: Number(config.targetDailyHours) || 10,
    agentSchedules: config.agentSchedules || existing.agentSchedules || {},
  });

  const { error } = await supabase.from("sek_app_settings").upsert(
    {
      key: SCHEDULE_SETTING_KEY,
      value: val,
      iv: "none",
      tag: "none",
      updated_at: new Date().toISOString(),
    },
    { onConflict: "key" }
  );

  if (error) {
    console.error("[saveWorkSchedule] error:", error);
    throw error;
  }
}

export async function saveAgentSchedule(
  agentEmail: string,
  schedule: Partial<AgentScheduleOverride> & { custom: boolean }
): Promise<void> {
  const supabase = getClient();
  const existing = await getWorkSchedule();
  const normalizedEmail = (agentEmail || "").trim().toLowerCase();
  const agentSchedules = { ...(existing.agentSchedules || {}) };

  if (schedule.custom) {
    agentSchedules[normalizedEmail] = {
      scheduleStart: schedule.scheduleStart || existing.scheduleStart || "08:00",
      scheduleEnd: schedule.scheduleEnd || existing.scheduleEnd || "17:00",
      scheduleEnabled: schedule.scheduleEnabled !== undefined ? Boolean(schedule.scheduleEnabled) : true,
      workDays: Array.isArray(schedule.workDays) && schedule.workDays.length > 0 ? schedule.workDays : existing.workDays || [1, 2, 3, 4, 5],
      targetDailyHours: Number(schedule.targetDailyHours) || existing.targetDailyHours || 10,
      custom: true,
    };
  } else {
    // Si se desactiva el personalizado, se elimina o se marca custom: false
    delete agentSchedules[normalizedEmail];
  }

  const val = JSON.stringify({
    ...existing,
    agentSchedules,
  });

  const { error } = await supabase.from("sek_app_settings").upsert(
    {
      key: SCHEDULE_SETTING_KEY,
      value: val,
      iv: "none",
      tag: "none",
      updated_at: new Date().toISOString(),
    },
    { onConflict: "key" }
  );

  if (error) {
    console.error("[saveAgentSchedule] error:", error);
    throw error;
  }
}

export async function getOvertimeRequests(date?: string, agentEmail?: string): Promise<OvertimeRequest[]> {
  const supabase = getClient();
  try {
    const { data, error } = await supabase
      .from("sek_app_settings")
      .select("value")
      .eq("key", OVERTIME_SETTING_KEY)
      .maybeSingle();

    if (!error && data?.value) {
      let list: OvertimeRequest[] = JSON.parse(data.value);
      if (!Array.isArray(list)) list = [];
      if (date) {
        list = list.filter((r) => r.date === date);
      }
      if (agentEmail) {
        list = list.filter((r) => r.agent_email.toLowerCase() === agentEmail.toLowerCase());
      }
      return list;
    }
  } catch (err) {
    console.error("[getOvertimeRequests] error:", err);
  }
  return [];
}

export async function requestOvertime(params: {
  agentEmail: string;
  agentName: string;
  date: string;
  overtimeMinutes: number;
  totalActiveMinutes: number;
}): Promise<OvertimeRequest> {
  const supabase = getClient();
  const currentRequests = await getOvertimeRequests();
  const id = `ot-${params.agentEmail.toLowerCase().trim()}-${params.date}`;
  const existingIdx = currentRequests.findIndex((r) => r.id === id);

  let updatedRequest: OvertimeRequest;

  if (existingIdx >= 0) {
    // Si ya existe y está aprobada o rechazada, conservar su estatus a menos que cambien los minutos sustancialmente
    updatedRequest = {
      ...currentRequests[existingIdx],
      overtime_minutes: params.overtimeMinutes,
      total_active_minutes: params.totalActiveMinutes,
      agent_name: params.agentName || currentRequests[existingIdx].agent_name,
    };
    currentRequests[existingIdx] = updatedRequest;
  } else {
    updatedRequest = {
      id,
      agent_email: params.agentEmail.toLowerCase().trim(),
      agent_name: params.agentName,
      date: params.date,
      overtime_minutes: params.overtimeMinutes,
      total_active_minutes: params.totalActiveMinutes,
      status: "pending",
      requested_at: new Date().toISOString(),
      reviewed_at: null,
      reviewed_by: null,
      notes: null,
    };
    currentRequests.push(updatedRequest);
  }

  // Guardar en la base de datos
  await supabase.from("sek_app_settings").upsert(
    {
      key: OVERTIME_SETTING_KEY,
      value: JSON.stringify(currentRequests),
      iv: "none",
      tag: "none",
      updated_at: new Date().toISOString(),
    },
    { onConflict: "key" }
  );

  return updatedRequest;
}

export async function updateOvertimeStatus(
  id: string,
  status: "approved" | "rejected",
  reviewedBy: string,
  notes?: string
): Promise<OvertimeRequest | null> {
  const supabase = getClient();
  const currentRequests = await getOvertimeRequests();
  const idx = currentRequests.findIndex((r) => r.id === id);
  if (idx < 0) return null;

  currentRequests[idx] = {
    ...currentRequests[idx],
    status,
    reviewed_at: new Date().toISOString(),
    reviewed_by: reviewedBy,
    notes: notes || currentRequests[idx].notes || null,
  };

  await supabase.from("sek_app_settings").upsert(
    {
      key: OVERTIME_SETTING_KEY,
      value: JSON.stringify(currentRequests),
      iv: "none",
      tag: "none",
      updated_at: new Date().toISOString(),
    },
    { onConflict: "key" }
  );

  return currentRequests[idx];
}

export async function hasActiveManualTask(agentEmail: string): Promise<boolean> {
  const supabase = getClient();
  const today = new Date().toISOString().split("T")[0];
  const { data, error } = await supabase
    .from("activity_log")
    .select("id, action, category, metadata, created_at")
    .eq("agent_email", agentEmail)
    .gte("created_at", `${today}T00:00:00`)
    .order("created_at", { ascending: false })
    .limit(20);

  if (error || !data || data.length === 0) return false;

  for (const it of data) {
    const act = (it.action || "").toLowerCase();
    const meta = (it.metadata || {}) as Record<string, any>;
    const isEnd = act.startsWith("terminó:") || act.startsWith("termino:");
    const isStart = (act.startsWith("inició:") || act.startsWith("inicio:")) && (meta.manual || meta.task);
    if (isEnd) return false;
    if (isStart) {
      const startMs = new Date(it.created_at).getTime();
      return Date.now() - startMs < 10 * 60 * 60 * 1000;
    }
  }
  return false;
}

export async function insertActivityLog(entry: ActivityLog): Promise<void> {
  const supabase = getClient();
  const insertPayload: any = {
    agent_email: entry.agent_email,
    agent_name: entry.agent_name,
    action: entry.action,
    category: entry.category,
    case_id: entry.case_id || null,
    metadata: entry.metadata || null,
    duration_ms: entry.duration_ms || null,
  };
  if (entry.created_at) {
    insertPayload.created_at = entry.created_at;
  }
  const { error } = await supabase.from("activity_log").insert(insertPayload);
  if (error) console.error("[activity-db] insert error:", error.message);
}

export async function getActivityTimeline(
  agentEmail?: string,
  date?: string,
  endDate?: string
): Promise<ActivityLog[]> {
  const supabase = getClient();
  let query = supabase
    .from("activity_log")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(3500);

  if (agentEmail) query = query.eq("agent_email", agentEmail);
  if (date) {
    const start = `${date}T00:00:00`;
    const finalDate = endDate || date;
    const end = `${finalDate}T23:59:59`;
    query = query.gte("created_at", start).lte("created_at", end);
  }

  const { data, error } = await query;
  if (error) console.error("[activity-db] timeline error:", error.message);
  return (data || []) as ActivityLog[];
}

export async function getActivitySummaries(
  agentEmail?: string,
  date?: string
): Promise<ActivitySummary[]> {
  const supabase = getClient();
  let query = supabase
    .from("activity_summary")
    .select("*")
    .order("created_at", { ascending: false });

  if (agentEmail) query = query.eq("agent_email", agentEmail);
  if (date) query = query.eq("date", date);

  const { data, error } = await query;
  if (error) console.error("[activity-db] summaries error:", error.message);
  return (data || []) as ActivitySummary[];
}

export async function getActivityMetrics(agentEmail: string, date: string) {
  const timeline = await getActivityTimeline(agentEmail, date);
  const sorted = [...timeline]
    .filter((t) => Boolean(t.created_at))
    .sort((a, b) => new Date(a.created_at!).getTime() - new Date(b.created_at!).getTime());

  let totalActiveMs = 0;
  let totalBreakMs = 0;
  let totalSanitaryMs = 0;
  let totalIdleMs = 0;
  const categoryTimeMs: Record<string, number> = {};
  const categoryEvents: Record<string, number> = {};
  const LUNCH_GAP_MS = 30 * 60 * 1000;

  // 1. Detectar rangos de pausas explícitas (Almuerzo, Descanso, Pausa personal/sanitaria)
  interface PauseRange {
    start: number;
    end: number;
    reason: string;
    type: "break" | "sanitary" | "idle";
  }
  const pauseRanges: PauseRange[] = [];
  let currentPauseStart: number | null = null;
  let currentPauseReason = "";
  let currentPauseType: "break" | "sanitary" | "idle" = "break";

  for (const item of sorted) {
    const act = (item.action || "").toLowerCase();
    const cat = item.category || "";
    const meta = (item.metadata || {}) as Record<string, any>;
    const t = new Date(item.created_at!).getTime();

    const isSanitary =
      cat === "Pausa Sanitaria" ||
      cat === "Pausa personal" ||
      act.includes("sanitaria") ||
      act.includes("baño") ||
      act.includes("bano");

    const isBreak =
      cat === "Pausas y Descansos" ||
      cat === "Descanso" ||
      act.includes("almuerzo") ||
      act.includes("descanso") ||
      act.includes("comida") ||
      act.includes("café") ||
      act.includes("cafe") ||
      meta.task === "Almuerzo" ||
      meta.subcategory === "Almuerzo";

    const isPauseStart = (act.startsWith("inició:") || act.startsWith("inicio:")) && (isSanitary || isBreak);
    const isPauseEnd = (act.startsWith("terminó:") || act.startsWith("termino:")) && (isSanitary || isBreak);

    if (isPauseStart) {
      currentPauseStart = t;
      currentPauseReason = act;
      currentPauseType = isSanitary ? "sanitary" : "break";
    } else if (isPauseEnd) {
      const pType = isSanitary ? "sanitary" : "break";
      if (currentPauseStart) {
        pauseRanges.push({ start: currentPauseStart, end: t, reason: currentPauseReason || act, type: currentPauseType });
        currentPauseStart = null;
      } else {
        const discreteMs = Number(
          item.duration_ms ||
          (meta.duration_seconds ? meta.duration_seconds * 1000 : 0) ||
          (meta.minutes ? meta.minutes * 60000 : 0)
        ) || 0;
        if (discreteMs > 0) {
          pauseRanges.push({ start: t - discreteMs, end: t, reason: act, type: pType });
        }
      }
    }
  }

  // 2. Recolectar intervalos activos reales (software y labores manuales)
  interface ActiveInterval {
    start: number;
    end: number;
    cat: string;
  }
  const rawIntervals: ActiveInterval[] = [];

  const firstEventMs = sorted.length > 0 ? new Date(sorted[0].created_at!).getTime() : 0;

  for (let i = 0; i < sorted.length; i++) {
    const item = sorted[i];
    const currTime = new Date(item.created_at!).getTime();
    const nextTime = i < sorted.length - 1 ? new Date(sorted[i + 1].created_at!).getTime() : currTime + 60000;
    const gap = Math.max(0, nextTime - currTime);
    const meta = (item.metadata || {}) as Record<string, any>;
    const act = (item.action || "").toLowerCase();
    const catRaw = item.category || "";
    const appStr = (meta.app || meta.app_name || "").toLowerCase();

    // 2.1 Comprobar si cae dentro de una pausa explícita declarada (ej. Almuerzo, Baño)
    const matchedPause = pauseRanges.find((p) => currTime >= p.start && currTime < p.end);
    if (matchedPause) {
      const dur = Math.min(gap > 0 ? gap : 60000, 60 * 60 * 1000);
      if (matchedPause.type === "sanitary") {
        totalSanitaryMs += dur;
      } else {
        totalBreakMs += dur;
      }
      continue;
    }

    const isScreensaver =
      act.includes(".scr") ||
      act.includes("mystify") ||
      act.includes("lockapp") ||
      appStr.includes(".scr") ||
      appStr.includes("mystify") ||
      appStr.includes("lockapp");

    const isSanitary =
      catRaw === "Pausa Sanitaria" ||
      catRaw === "Pausa personal" ||
      act.includes("sanitaria") ||
      act.includes("baño") ||
      act.includes("bano");

    const isBreak =
      catRaw === "Pausas y Descansos" ||
      catRaw === "Descanso" ||
      act.includes("almuerzo") ||
      act.includes("descanso") ||
      act.includes("comida") ||
      act.includes("café") ||
      act.includes("cafe") ||
      meta.task === "Almuerzo" ||
      meta.subcategory === "Almuerzo";

    if (isSanitary) {
      totalSanitaryMs += Math.min(gap > 0 ? gap : 60000, 60 * 60 * 1000);
      continue;
    }

    if (isBreak) {
      totalBreakMs += Math.min(gap > 0 ? gap : 60000, 60 * 60 * 1000);
      continue;
    }

    if (isScreensaver || meta.reason === "lock_screen" || meta.reason === "suspend") {
      totalIdleMs += Math.min(gap > 0 ? gap : 60000, 60 * 60 * 1000);
      continue;
    }

    const isManualStart = (act.startsWith("inició:") || act.startsWith("inicio:")) && (meta.manual || meta.task);
    const isManualEnd = (act.startsWith("terminó:") || act.startsWith("termino:")) && (meta.manual || meta.task);
    const isJustification = Boolean(meta.justification || catRaw === "Justificación" || act.startsWith("justificación:") || act.startsWith("justificacion:"));

    if (isManualStart) {
      const dur = Math.min(gap, 4 * 60 * 60 * 1000);
      const cat = catRaw || meta.task || "Labores de Taller";
      rawIntervals.push({ start: currTime, end: currTime + dur, cat });
      categoryEvents[cat] = (categoryEvents[cat] || 0) + 1;
      continue;
    }

    if (isManualEnd || isJustification) {
      const discreteMs = Number(
        item.duration_ms ||
        (meta.duration_seconds ? meta.duration_seconds * 1000 : 0) ||
        (meta.minutes ? meta.minutes * 60000 : 0)
      ) || 0;
      const prev = i > 0 ? sorted[i - 1] : null;
      const prevAct = (prev?.action || "").toLowerCase();
      const prevWasStart = prev && (prevAct.startsWith("inició:") || prevAct.startsWith("inicio:"));
      if (!prevWasStart && discreteMs > 0) {
        const dur = Math.min(discreteMs, 4 * 60 * 60 * 1000);
        const cat = catRaw || meta.task || "Labores de Taller";
        const rStart = Math.max(firstEventMs, currTime - dur);
        rawIntervals.push({ start: rStart, end: currTime, cat });
        categoryEvents[cat] = (categoryEvents[cat] || 0) + 1;
      }
      continue;
    }

    let cat = catRaw || "Operación Sekunet";
    if (cat === "Navegación" || cat === "Inactividad") {
      const page = meta.page || "";
      if (page.includes("soporte-avanzado")) cat = "Soporte Avanzado (N2)";
      else if (page.includes("smart-inbox")) cat = "Smart Inbox & Casos";
      else if (page.includes("mi-gestion")) cat = "Mi Bandeja de Gestión";
      else if (page.includes("admin")) cat = "Panel de Administración";
      else if (page.includes("inbox")) cat = "Seka Chat (Bandeja)";
      else cat = "Operación Sekunet";
    }

    const ACTIVE_GAP_LIMIT = 5 * 60 * 1000;
    const dur = Math.min(gap > 0 ? gap : 60000, ACTIVE_GAP_LIMIT);
    rawIntervals.push({ start: currTime, end: currTime + dur, cat });
    if (gap > ACTIVE_GAP_LIMIT) {
      totalIdleMs += (gap - ACTIVE_GAP_LIMIT);
    }
    categoryEvents[cat] = (categoryEvents[cat] || 0) + 1;
  }

  // 2. Consolidar intervalos activos sin duplicación ni solapamiento
  rawIntervals.sort((a, b) => a.start - b.start);
  const mergedIntervals: { start: number; end: number }[] = [];
  for (const interval of rawIntervals) {
    const dur = interval.end - interval.start;
    categoryTimeMs[interval.cat] = (categoryTimeMs[interval.cat] || 0) + dur;

    if (mergedIntervals.length === 0) {
      mergedIntervals.push({ start: interval.start, end: interval.end });
    } else {
      const last = mergedIntervals[mergedIntervals.length - 1];
      if (interval.start <= last.end) {
        last.end = Math.max(last.end, interval.end);
      } else {
        mergedIntervals.push({ start: interval.start, end: interval.end });
      }
    }
  }

  totalActiveMs = mergedIntervals.reduce((sum, int) => sum + (int.end - int.start), 0);

  const totalDayMs = totalActiveMs + totalIdleMs;
  const productivityScore = totalDayMs > 0 ? Math.round((totalActiveMs / totalDayMs) * 100) : 100;

  // Jornada y Horas extras
  const schedule = await getWorkSchedule();
  const targetDailyHours = schedule.targetDailyHours || 10;
  const targetMs = targetDailyHours * 60 * 60 * 1000;
  const overtimeRequests = await getOvertimeRequests(date, agentEmail);
  const otReq = overtimeRequests[0] || null;
  const isOvertimeApproved = otReq?.status === "approved";
  const rawOvertimeMs = Math.max(0, totalActiveMs - targetMs);
  const deficitMs = Math.max(0, targetMs - totalActiveMs);
  const activeDisplayMs = (rawOvertimeMs > 0 && !isOvertimeApproved) ? targetMs : totalActiveMs;

  // Primer evento del día (hora real de entrada) y último evento
  let firstLoginTime: string | null = null;
  let lastLogoutTime: string | null = null;
  if (sorted.length > 0) {
    const firstEvt = sorted[0];
    if (firstEvt?.created_at) {
      const d = new Date(firstEvt.created_at);
      firstLoginTime = isNaN(d.getTime()) ? null : d.toLocaleTimeString("es-CR", { hour: "2-digit", minute: "2-digit", timeZone: "America/Costa_Rica" });
    }

    const lastEvt = sorted[sorted.length - 1];
    if (lastEvt?.created_at) {
      const d = new Date(lastEvt.created_at);
      lastLogoutTime = isNaN(d.getTime()) ? null : d.toLocaleTimeString("es-CR", { hour: "2-digit", minute: "2-digit", timeZone: "America/Costa_Rica" });
    }
  }

  return {
    totalActiveMs: activeDisplayMs,
    rawActiveMs: totalActiveMs,
    targetDailyHours,
    deficitMs,
    rawOvertimeMs,
    isOvertimeApproved,
    overtimeStatus: otReq?.status || (rawOvertimeMs > 0 ? "pending" : "none"),
    totalIdleMs,
    totalBreakMs,
    totalSanitaryMs,
    totalActiveTime: formatDuration(activeDisplayMs),
    totalBreakTime: formatDuration(totalBreakMs),
    totalSanitaryTime: formatDuration(totalSanitaryMs),
    totalIdleTime: formatDuration(totalIdleMs),
    deficitTime: formatDuration(deficitMs),
    overtimeTime: formatDuration(rawOvertimeMs),
    firstLoginTime,
    lastLogoutTime,
    productivityScore,
    totalEvents: timeline.length,
    activeEvents: sorted.length,
    idleEvents: 0,
    categories: categoryEvents,
    categoryTimeMs,
    trackingStatus: totalActiveMs > 0 ? "ACTIVE" : "IDLE",
  };
}

export async function insertActivitySummary(entry: ActivitySummary): Promise<void> {
  const supabase = getClient();
  const { error } = await supabase.from("activity_summary").insert({
    agent_email: entry.agent_email,
    date: entry.date,
    summary: entry.summary,
    category: entry.category,
    time_block: entry.time_block,
  });
  if (error) console.error("[activity-db] summary insert error:", error.message);
}

export async function cleanupOldEvents(daysToKeep: number = 60): Promise<void> {
  const supabase = getClient();
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - daysToKeep);
  const cutoffStr = cutoff.toISOString();

  await supabase.from("activity_log").delete().lt("created_at", cutoffStr);
  await supabase.from("activity_summary").delete().lt("created_at", cutoffStr);
}

function formatDuration(ms: number): string {
  const totalMin = Math.floor(ms / 60000);
  const h = Math.floor(totalMin / 60);
  const m = totalMin % 60;
  if (h > 0) return `${h}h ${m}m`;
  return `${m}m`;
}
