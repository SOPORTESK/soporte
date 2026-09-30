import { NextRequest, NextResponse } from "next/server";
import { getActivityTimeline, getActivityMetrics } from "@/lib/activity-db";

export const dynamic = "force-dynamic";
export const revalidate = 0;

interface CacheEntry {
  data: any;
  expires: number;
}
const timelineCache = new Map<string, CacheEntry>();
const CACHE_TTL_MS = 5000; // 5s TTL para evitar consultas duplicadas en ráfagas de navegación/foco

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const agent = searchParams.get("agent") || undefined;
    const date = searchParams.get("date") || new Date().toISOString().split("T")[0];
    const endDate = searchParams.get("endDate") || undefined;
    const metricsParam = searchParams.get("metrics");
    const lastMinutes = searchParams.get("lastMinutes");

    const cacheKey = `${agent || "all"}_${date}_${endDate || ""}_${metricsParam || ""}_${lastMinutes || ""}`;
    const cached = timelineCache.get(cacheKey);
    if (cached && Date.now() < cached.expires) {
      const res = NextResponse.json(cached.data);
      res.headers.set("Cache-Control", "no-store, no-cache, must-revalidate, proxy-revalidate");
      res.headers.set("X-Cache", "HIT");
      return res;
    }

    if (metricsParam === "only" && agent) {
      const m = await getActivityMetrics(agent, date);
      timelineCache.set(cacheKey, { data: m, expires: Date.now() + CACHE_TTL_MS });
      const res = NextResponse.json(m);
      res.headers.set("Cache-Control", "no-store, no-cache, must-revalidate, proxy-revalidate");
      return res;
    }

    // Fast-path ultrarrápido para chequeos de sincronización de fondo (lastMinutes):
    // Consulta directa de 100 registros con solo los campos necesarios en vez de 3500 filas pesadas
    if (lastMinutes) {
      const minutesAgo = parseInt(lastMinutes, 10);
      if (!isNaN(minutesAgo) && minutesAgo > 0) {
        const cutoff = new Date(Date.now() - minutesAgo * 60 * 1000).toISOString();
        const { createServiceClient } = await import("@/lib/supabase/service");
        const supabase = createServiceClient();
        let query = supabase
          .from("activity_log")
          .select("id, action, category, metadata, created_at")
          .gte("created_at", cutoff)
          .order("created_at", { ascending: false })
          .limit(100);
        if (agent) query = query.eq("agent_email", agent);
        const { data } = await query;
        const result = { timeline: data || [], metrics: null };
        timelineCache.set(cacheKey, { data: result, expires: Date.now() + CACHE_TTL_MS });
        const res = NextResponse.json(result);
        res.headers.set("Cache-Control", "no-store, no-cache, must-revalidate, proxy-revalidate");
        return res;
      }
    }

    let timeline = await getActivityTimeline(agent, date, endDate);

    let metricsData = null;
    const shouldComputeMetrics = metricsParam === "true" || metricsParam === "1";
    if (agent && shouldComputeMetrics) {
      try {
        metricsData = await getActivityMetrics(agent, date, timeline);
      } catch (err) {
        console.error("[activity/timeline] Error getting metrics:", err);
      }
    }

    const result = { timeline, metrics: metricsData };
    timelineCache.set(cacheKey, { data: result, expires: Date.now() + CACHE_TTL_MS });
    if (timelineCache.size > 200) {
      const oldestKey = timelineCache.keys().next().value;
      if (oldestKey) timelineCache.delete(oldestKey);
    }

    const res = NextResponse.json(result);
    res.headers.set("Cache-Control", "no-store, no-cache, must-revalidate, proxy-revalidate");
    return res;
  } catch (error: any) {
    console.error("[activity/timeline] Error:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
