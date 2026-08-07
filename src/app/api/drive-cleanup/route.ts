import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/service";
import { deleteFromDrive } from "@/lib/google-drive";

export const runtime = "nodejs";
export const maxDuration = 60;

export async function GET(req: NextRequest) {
  try {
    const supabase = createServiceClient();
    const now = new Date().toISOString();

    const { data: expired, error } = await supabase
      .from("sek_drive_files")
      .select("id, drive_file_id, file_name")
      .eq("deleted", false)
      .lt("expires_at", now)
      .limit(50);

    if (error) throw error;

    let deleted = 0;
    let failed = 0;

    for (const file of expired || []) {
      const ok = await deleteFromDrive(file.drive_file_id);
      if (ok) {
        await supabase
          .from("sek_drive_files")
          .update({ deleted: true, deleted_at: now })
          .eq("id", file.id);
        deleted++;
      } else {
        failed++;
      }
    }

    const result = { ok: true, checked: expired?.length || 0, deleted, failed };
    console.log("[drive-cleanup]", JSON.stringify(result));
    return NextResponse.json(result);
  } catch (e: any) {
    console.error("[drive-cleanup] Error:", e?.message);
    return NextResponse.json({ ok: false, error: e?.message }, { status: 500 });
  }
}
