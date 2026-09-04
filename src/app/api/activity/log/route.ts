import { NextRequest, NextResponse } from "next/server";
import { insertActivityLog } from "@/lib/activity-db";

export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { agent_email, agent_name, action, category, case_id, metadata, duration_ms } = body;

    if (!agent_email || !action || !category) {
      return NextResponse.json(
        { error: "agent_email, action and category are required" },
        { status: 400 }
      );
    }

    try {
      await insertActivityLog({
        agent_email,
        agent_name: agent_name || agent_email,
        action,
        category,
        case_id: case_id || null,
        metadata: metadata || null,
        duration_ms: duration_ms || null,
      });
    } catch (e: any) {
      console.error("[activity/log] Async insert error:", e.message);
    }

    return NextResponse.json({ success: true });
  } catch (error: any) {
    console.error("[activity/log] Error:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
