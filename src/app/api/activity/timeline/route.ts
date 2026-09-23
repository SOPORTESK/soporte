import { NextRequest, NextResponse } from "next/server";
import { getActivityTimeline, getActivityMetrics } from "@/lib/activity-db";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const agent = searchParams.get("agent") || undefined;
    const date = searchParams.get("date") || new Date().toISOString().split("T")[0];
    const endDate = searchParams.get("endDate") || undefined;
    const metrics = searchParams.get("metrics") === "true";
    const lastMinutes = searchParams.get("lastMinutes");

    if (metrics && agent) {
      const m = await getActivityMetrics(agent, date);
      const res = NextResponse.json(m);
      res.headers.set("Cache-Control", "no-store, no-cache, must-revalidate, proxy-revalidate");
      return res;
    }

    // Fast-path ultrarrápido para chequeos de sincronización (lastMinutes):
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
        const res = NextResponse.json({ timeline: data || [], metrics: null });
        res.headers.set("Cache-Control", "no-store, no-cache, must-revalidate, proxy-revalidate");
        return res;
      }
    }

    let timeline = await getActivityTimeline(agent, date, endDate);

    let metricsData = null;
    if (agent && metrics) {
      try {
        metricsData = await getActivityMetrics(agent, date);
      } catch (err) {
        console.error("[activity/timeline] Error getting metrics:", err);
      }
    }

    const res = NextResponse.json({ timeline, metrics: metricsData });
    res.headers.set("Cache-Control", "no-store, no-cache, must-revalidate, proxy-revalidate");
    return res;
  } catch (error: any) {
    console.error("[activity/timeline] Error:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
