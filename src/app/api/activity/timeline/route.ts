import { NextRequest, NextResponse } from "next/server";
import { getActivityTimeline, getActivityMetrics } from "@/lib/activity-db";

export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const agent = searchParams.get("agent") || undefined;
    const date = searchParams.get("date") || new Date().toISOString().split("T")[0];
    const metrics = searchParams.get("metrics") === "true";
    const lastMinutes = searchParams.get("lastMinutes");

    if (metrics && agent) {
      const m = await getActivityMetrics(agent, date);
      return NextResponse.json(m);
    }

    let timeline = await getActivityTimeline(agent, date);

    // Filtrar últimos N minutos si se especifica
    if (lastMinutes) {
      const minutesAgo = parseInt(lastMinutes, 10);
      if (!isNaN(minutesAgo) && minutesAgo > 0) {
        const cutoff = new Date(Date.now() - minutesAgo * 60 * 1000);
        timeline = timeline.filter((e) => {
          if (!e.created_at) return false;
          return new Date(e.created_at) >= cutoff;
        });
      }
    }

    return NextResponse.json({ timeline });
  } catch (error: any) {
    console.error("[activity/timeline] Error:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
