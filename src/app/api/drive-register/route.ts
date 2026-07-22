import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/service";
import { DRIVE_RETENTION_HOURS } from "@/lib/google-drive";

export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { fileId, fileName, mimeType, fileSize, shareableLink, caseId, agentEmail } = body;

    if (!fileId || !shareableLink) {
      return NextResponse.json({ error: "Faltan datos" }, { status: 400 });
    }

    const supabase = createServiceClient();
    const expiresAt = new Date(Date.now() + DRIVE_RETENTION_HOURS * 60 * 60 * 1000).toISOString();

    await supabase.from("sek_drive_files").insert({
      drive_file_id: fileId,
      case_id: caseId || null,
      file_name: fileName || null,
      mime_type: mimeType || null,
      file_size: fileSize || null,
      shareable_link: shareableLink,
      uploaded_by: agentEmail || null,
      expires_at: expiresAt,
      deleted: false,
    });

    return NextResponse.json({ ok: true, expiresAt });
  } catch (e: any) {
    console.error("[drive-register] Error:", e);
    return NextResponse.json({ error: e?.message }, { status: 500 });
  }
}
