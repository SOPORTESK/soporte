import { NextRequest, NextResponse } from "next/server";
import { cleanExpiredDriveFiles } from "@/lib/google-drive";

export const runtime = "nodejs";
export const maxDuration = 60;
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  try {
    const result = await cleanExpiredDriveFiles();
    console.log("[drive-cleanup]", JSON.stringify(result));
    return NextResponse.json({ ok: true, ...result });
  } catch (e: any) {
    console.error("[drive-cleanup] Error:", e?.message);
    return NextResponse.json({ ok: false, error: e?.message }, { status: 500 });
  }
}
