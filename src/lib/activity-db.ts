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
    .limit(200);

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
  const activeEntries = timeline.filter((e) => e.category !== "Inactividad");
  const idleEntries = timeline.filter((e) => e.category === "Inactividad");

  const totalActiveMs = activeEntries.reduce((sum, e) => sum + (e.duration_ms || 0), 0);
  const totalIdleMs = idleEntries.reduce((sum, e) => sum + (e.duration_ms || 0), 0);

  // Tiempo por categoría (sumar duration_ms)
  const categoryTimeMs: Record<string, number> = {};
  // Eventos únicos por categoría (deduplicar consecutivos)
  const categoryEvents: Record<string, number> = {};
  let lastCat = "";

  // Timeline viene ordenado descendente (más nuevo primero), invertir para cronológico
  const chrono = [...timeline].reverse();

  for (const e of chrono) {
    if (e.category === "Inactividad") continue;
    // Sumar tiempo
    const dur = e.duration_ms || 0;
    if (dur > 0) {
      categoryTimeMs[e.category] = (categoryTimeMs[e.category] || 0) + dur;
    }
    // Contar evento único solo si cambió la categoría respecto al anterior
    if (e.category !== lastCat) {
      categoryEvents[e.category] = (categoryEvents[e.category] || 0) + 1;
      lastCat = e.category;
    }
  }

  // Si no hay duration_ms, estimar por diferencia de timestamps
  for (let i = 0; i < chrono.length; i++) {
    const e = chrono[i];
    if (e.category === "Inactividad") continue;
    const dur = e.duration_ms || 0;
    if (dur === 0 && i < chrono.length - 1) {
      const next = chrono[i + 1];
      if (next && e.created_at && next.created_at) {
        const diff = new Date(e.created_at).getTime() - new Date(next.created_at).getTime();
        if (diff > 0 && diff < 30 * 60 * 1000) { // max 30 min entre logs
          categoryTimeMs[e.category] = (categoryTimeMs[e.category] || 0) + diff;
        }
      }
    }
  }

  const productivityScore =
    timeline.length > 0
      ? Math.round((activeEntries.length / timeline.length) * 100)
      : 0;

  return {
    totalActiveMs,
    totalIdleMs,
    totalActiveTime: formatDuration(totalActiveMs),
    totalIdleTime: formatDuration(totalIdleMs),
    productivityScore,
    totalEvents: timeline.length,
    activeEvents: activeEntries.length,
    idleEvents: idleEntries.length,
    categories: categoryEvents,
    categoryTimeMs,
    trackingStatus: activeEntries.length > 0 ? "ACTIVE" : "IDLE",
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
