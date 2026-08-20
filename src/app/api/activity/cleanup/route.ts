import { NextResponse } from "next/server";
import { cleanupOldEvents } from "@/lib/activity-db";

export async function GET() {
  try {
    await cleanupOldEvents(60);
    return NextResponse.json({ ok: true, cleaned: true, message: "Logs older than 60 days deleted" });
  } catch (e: any) {
    console.error("[activity/cleanup] Error:", e?.message);
    return NextResponse.json({ error: e?.message }, { status: 500 });
  }
}
