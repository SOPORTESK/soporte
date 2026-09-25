import { createServiceClient } from "@/lib/supabase/service";
import type { SupabaseClient } from "@supabase/supabase-js";
import { cacheGetFresh, cacheSet, cacheDelete } from "@/lib/supabase/cache";
import { computeUnifiedActivityMetrics } from "@/lib/activity-engine";

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

export interface DayScheduleRule {
  start: string;
  end: string;
  targetHours: number;
}

export interface AgentScheduleOverride {
  scheduleStart: string;
  scheduleEnd: string;
  scheduleEnabled: boolean;
  workDays: number[];
  targetDailyHours: number;
  custom: boolean;
  useMixedSchedule?: boolean;
  daySchedules?: Record<number, DayScheduleRule>;
}

export interface WorkScheduleConfig {
  scheduleStart: string;
  scheduleEnd: string;
  scheduleEnabled: boolean;
  workDays: number[]; // 1=Lun, 2=Mar, 3=Mié, 4=Jue, 5=Vie, 6=Sáb, 0=Dom
  targetDailyHours: number; // Meta oficial de jornada diaria en horas (por defecto 10 horas)
  toleranceMinutes?: number; // Tolerancia oficial de pausas menores en minutos (por defecto 5 min)
  useMixedSchedule?: boolean;
  daySchedules?: Record<number, DayScheduleRule>;
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
  const cached = cacheGetFresh("app_work_schedule", 60000);
  if (cached) return cached;

  const supabase = getClient();
  try {
    const { data, error } = await supabase
      .from("sek_app_settings")
      .select("value")
      .eq("key", SCHEDULE_SETTING_KEY)
      .maybeSingle();

    if (!error && data?.value) {
      const parsed = JSON.parse(data.value);
      const res: WorkScheduleConfig = {
        scheduleStart: parsed.scheduleStart || "06:00",
        scheduleEnd: parsed.scheduleEnd || "18:00",
        scheduleEnabled: parsed.scheduleEnabled !== undefined ? Boolean(parsed.scheduleEnabled) : true,
        workDays: Array.isArray(parsed.workDays) && parsed.workDays.length > 0 ? parsed.workDays : [1, 2, 3, 4, 5],
        targetDailyHours: Number(parsed.targetDailyHours) || 10,
        toleranceMinutes: Number(parsed.toleranceMinutes) || 5,
        useMixedSchedule: Boolean(parsed.useMixedSchedule),
        daySchedules: parsed.daySchedules && typeof parsed.daySchedules === "object" ? parsed.daySchedules : undefined,
        agentSchedules: parsed.agentSchedules && typeof parsed.agentSchedules === "object" ? parsed.agentSchedules : {},
      };
      cacheSet("app_work_schedule", res);
      return res;
    }
  } catch (err) {
    console.error("[getWorkSchedule] error:", err);
  }

  const def: WorkScheduleConfig = { scheduleStart: "06:00", scheduleEnd: "18:00", scheduleEnabled: true, workDays: [1, 2, 3, 4, 5], targetDailyHours: 10, toleranceMinutes: 5, agentSchedules: {} };
  cacheSet("app_work_schedule", def);
  return def;
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
    toleranceMinutes: global.toleranceMinutes,
    useMixedSchedule: global.useMixedSchedule,
    daySchedules: global.daySchedules,
  };

  if (custom && custom.custom) {
    return {
      scheduleStart: custom.scheduleStart || global.scheduleStart,
      scheduleEnd: custom.scheduleEnd || global.scheduleEnd,
      scheduleEnabled: custom.scheduleEnabled !== undefined ? Boolean(custom.scheduleEnabled) : global.scheduleEnabled,
      workDays: Array.isArray(custom.workDays) && custom.workDays.length > 0 ? custom.workDays : global.workDays,
      targetDailyHours: Number(custom.targetDailyHours) || global.targetDailyHours,
      toleranceMinutes: global.toleranceMinutes,
      useMixedSchedule: Boolean(custom.useMixedSchedule),
      daySchedules: custom.daySchedules || global.daySchedules,
      isCustom: true,
      globalSchedule,
    };
  }

  return {
    ...global,
    toleranceMinutes: global.toleranceMinutes,
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
    toleranceMinutes: Math.max(1, Math.min(60, Number(config.toleranceMinutes) || 5)),
    useMixedSchedule: Boolean(config.useMixedSchedule),
    daySchedules: config.daySchedules || existing.daySchedules || undefined,
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
  cacheDelete("app_work_schedule");
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
      useMixedSchedule: Boolean(schedule.useMixedSchedule),
      daySchedules: schedule.daySchedules || undefined,
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
  cacheDelete("app_work_schedule");
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

export async function getActivityMetrics(agentEmail: string, date: string, existingTimeline?: ActivityLog[]) {
  const timeline = existingTimeline || await getActivityTimeline(agentEmail, date);
  const schedule = agentEmail ? await getAgentSchedule(agentEmail) : await getWorkSchedule();
  let targetDailyHours = schedule.targetDailyHours || 10;
  let scheduleStart = schedule.scheduleStart || "08:00";
  let scheduleEnd = schedule.scheduleEnd || "17:00";
  const toleranceMinutes = schedule.toleranceMinutes || 5;

  if (schedule.useMixedSchedule && schedule.daySchedules && date) {
    const parts = date.split("-").map(Number);
    if (parts.length === 3) {
      const dObj = new Date(parts[0], parts[1] - 1, parts[2]);
      const dayOfWeek = dObj.getDay();
      const dayRule = schedule.daySchedules[dayOfWeek];
      if (dayRule) {
        if (dayRule.targetHours) targetDailyHours = Number(dayRule.targetHours);
        if (dayRule.start) scheduleStart = dayRule.start;
        if (dayRule.end) scheduleEnd = dayRule.end;
      }
    }
  }

  const computed = computeUnifiedActivityMetrics(timeline as any[], {
    toleranceMinutes,
    targetDailyHours,
    scheduleStart,
    scheduleEnd,
    useMixedSchedule: schedule.useMixedSchedule,
    daySchedules: schedule.daySchedules,
  });

  const productiveMs = computed.masterBuckets.Productivo.durationMs;
  const idleMs = computed.masterBuckets.Inactivo.durationMs;
  const breakMs = computed.masterBuckets.Descanso.durationMs;
  const sanitaryMs = computed.masterBuckets["Pausa Sanitaria"].durationMs;

  const targetMs = targetDailyHours * 60 * 60 * 1000;
  const overtimeRequests = await getOvertimeRequests(date, agentEmail);
  const otReq = overtimeRequests[0] || null;
  const isOvertimeApproved = otReq?.status === "approved";
  const rawOvertimeMs = Math.max(0, productiveMs - targetMs);
  const deficitMs = Math.max(0, targetMs - productiveMs);
  const activeDisplayMs = (rawOvertimeMs > 0 && !isOvertimeApproved) ? targetMs : productiveMs;

  const categoryTimeMs: Record<string, number> = {};
  computed.operationalBuckets.forEach((b) => {
    categoryTimeMs[b.label || b.id] = b.durationMs;
  });

  return {
    totalActiveMs: activeDisplayMs,
    rawActiveMs: productiveMs,
    targetDailyHours,
    deficitMs,
    rawOvertimeMs,
    isOvertimeApproved,
    overtimeStatus: otReq?.status || (rawOvertimeMs > 0 ? "pending" : "none"),
    totalIdleMs: idleMs,
    totalBreakMs: breakMs,
    totalSanitaryMs: sanitaryMs,
    totalActiveTime: formatDuration(activeDisplayMs),
    totalBreakTime: formatDuration(breakMs),
    totalSanitaryTime: formatDuration(sanitaryMs),
    totalIdleTime: formatDuration(idleMs),
    deficitTime: formatDuration(deficitMs),
    overtimeTime: formatDuration(rawOvertimeMs),
    firstLoginTime: computed.firstLoginTime,
    lastLogoutTime: computed.lastLogoutTime,
    productivityScore: computed.productivityScore,
    totalEvents: timeline.length,
    activeEvents: timeline.length,
    idleEvents: 0,
    pcWorkMs: computed.pcWorkMs,
    pcWorkTime: computed.pcWorkTime,
    manualJustificationMs: computed.manualJustificationMs,
    manualJustificationTime: computed.manualJustificationTime,
    detectedGaps: computed.detectedGaps,
    categories: {},
    categoryTimeMs,
    trackingStatus: productiveMs > 0 ? "ACTIVE" : "IDLE",
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
