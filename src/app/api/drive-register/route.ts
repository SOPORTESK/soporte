import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/service";
import { DRIVE_RETENTION_HOURS } from "@/lib/google-drive";

export const runtime = "nodejs";
export const maxDuration = 30;

// Registra un archivo ya subido a Drive en la BD (sin subir el archivo)
export async function POST(req: NextRequest) {
  try {
    const { fileId, fileName, mimeType, fileSize, shareableLink, caseId, agentEmail } =
      await req.json();

    if (!fileId || !caseId) {
      return NextResponse.json({ error: "fileId y caseId requeridos" }, { status: 400 });
    }

    const supabase = createServiceClient();
    const expiresAt = new Date(
      Date.now() + DRIVE_RETENTION_HOURS * 60 * 60 * 1000
    ).toISOString();

    await supabase.from("sek_drive_files").insert({
      drive_file_id: fileId,
      case_id: caseId,
      file_name: fileName,
      mime_type: mimeType,
      file_size: fileSize,
      shareable_link: shareableLink,
      uploaded_by: agentEmail || null,
      expires_at: expiresAt,
      deleted: false,
    });

    return NextResponse.json({ ok: true });
  } catch (e: any) {
    return NextResponse.json(
      { error: e?.message || "Error al registrar archivo" },
      { status: 500 }
    );
  }
}
