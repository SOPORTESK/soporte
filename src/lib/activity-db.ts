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

export interface WorkScheduleConfig {
  scheduleStart: string;
  scheduleEnd: string;
  scheduleEnabled: boolean;
  workDays: number[]; // 1=Lun, 2=Mar, 3=Mié, 4=Jue, 5=Vie, 6=Sáb, 0=Dom
}

const SCHEDULE_SETTING_KEY = "activity_work_schedule";

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
        scheduleStart: parsed.scheduleStart || "08:00",
        scheduleEnd: parsed.scheduleEnd || "17:00",
        scheduleEnabled: parsed.scheduleEnabled !== undefined ? Boolean(parsed.scheduleEnabled) : true,
        workDays: Array.isArray(parsed.workDays) && parsed.workDays.length > 0 ? parsed.workDays : [1, 2, 3, 4, 5],
      };
    }
  } catch (err) {
    console.error("[getWorkSchedule] error:", err);
  }

  return { scheduleStart: "08:00", scheduleEnd: "17:00", scheduleEnabled: true, workDays: [1, 2, 3, 4, 5] };
}

export async function saveWorkSchedule(config: WorkScheduleConfig): Promise<void> {
  const supabase = getClient();
  const val = JSON.stringify({
    scheduleStart: config.scheduleStart || "08:00",
    scheduleEnd: config.scheduleEnd || "17:00",
    scheduleEnabled: Boolean(config.scheduleEnabled),
    workDays: Array.isArray(config.workDays) && config.workDays.length > 0 ? config.workDays : [1, 2, 3, 4, 5],
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
  const { error } = await supabase.from("activity_log").insert({
    agent_email: entry.agent_email,
    agent_name: entry.agent_name,
    action: entry.action,
    category: entry.category,
    case_id: entry.case_id || null,
    metadata: entry.metadata || null,
    duration_ms: entry.duration_ms || null,
  });
  if (error) console.error("[activity-db] insert error:", error.message);
}

export async function getActivityTimeline(
  agentEmail?: string,
  date?: string
): Promise<ActivityLog[]> {
  const supabase = getClient();
  let query = supabase
    .from("activity_log")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(2000);

  if (agentEmail) query = query.eq("agent_email", agentEmail);
  if (date) {
    const start = `${date}T00:00:00`;
    const end = `${date}T23:59:59`;
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
  let totalIdleMs = 0;
  const categoryTimeMs: Record<string, number> = {};
  const categoryEvents: Record<string, number> = {};
  const LUNCH_GAP_MS = 30 * 60 * 1000;

  for (let i = 0; i < sorted.length; i++) {
    const item = sorted[i];
    const currTime = new Date(item.created_at!).getTime();
    const nextTime = i < sorted.length - 1 ? new Date(sorted[i + 1].created_at!).getTime() : currTime + 60000;
    const gap = Math.max(0, nextTime - currTime);
    const meta = (item.metadata || {}) as Record<string, any>;

    const isExplicitPause = meta.reason === "lock_screen" || meta.reason === "suspend" || item.category === "Pausa personal";

    if (isExplicitPause) {
      totalIdleMs += Math.min(gap, 60 * 60 * 1000);
      continue;
    }

    let cat = item.category || "Operación Sekunet";
    if (cat === "Navegación" || cat === "Inactividad") {
      const page = meta.page || "";
      if (page.includes("soporte-avanzado")) cat = "Soporte Avanzado (N2)";
      else if (page.includes("smart-inbox")) cat = "Smart Inbox & Casos";
      else if (page.includes("mi-gestion")) cat = "Mi Bandeja de Gestión";
      else if (page.includes("admin")) cat = "Panel de Administración";
      else if (page.includes("inbox")) cat = "Seka Chat (Bandeja)";
      else cat = "Operación Sekunet";
    }

    const effectiveDuration = Math.min(gap, LUNCH_GAP_MS);
    categoryTimeMs[cat] = (categoryTimeMs[cat] || 0) + effectiveDuration;
    categoryEvents[cat] = (categoryEvents[cat] || 0) + 1;
    totalActiveMs += effectiveDuration;

    if (gap > LUNCH_GAP_MS) {
      totalIdleMs += (gap - LUNCH_GAP_MS);
    }
  }

  const totalDayMs = totalActiveMs + totalIdleMs;
  const productivityScore = totalDayMs > 0 ? Math.round((totalActiveMs / totalDayMs) * 100) : 100;

  return {
    totalActiveMs,
    totalIdleMs,
    totalActiveTime: formatDuration(totalActiveMs),
    totalIdleTime: formatDuration(totalIdleMs),
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
