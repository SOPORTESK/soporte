import { NextRequest, NextResponse } from "next/server";
import { getActivitySummaries } from "@/lib/activity-db";

export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const agent = searchParams.get("agent") || undefined;
    const date = searchParams.get("date") || new Date().toISOString().split("T")[0];

    const summaries = await getActivitySummaries(agent, date);
    return NextResponse.json({ summaries });
  } catch (error: any) {
    console.error("[activity/summary] Error:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
