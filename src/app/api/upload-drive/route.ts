import { NextRequest, NextResponse } from "next/server";
import { uploadToDrive, DRIVE_RETENTION_HOURS } from "@/lib/google-drive";
import { createServiceClient } from "@/lib/supabase/service";

export const runtime = "nodejs";
export const maxDuration = 300;

export async function POST(req: NextRequest) {
  try {
    const formData = await req.formData();
    const file = formData.get("file") as File | null;
    const caseId = formData.get("caseId") as string | null;
    const agentEmail = formData.get("agentEmail") as string | null;

    if (!file) {
      return NextResponse.json({ error: "No se recibió archivo" }, { status: 400 });
    }
    if (!caseId) {
      return NextResponse.json({ error: "caseId requerido" }, { status: 400 });
    }

    const fileBuffer = Buffer.from(await file.arrayBuffer());
    const fileName = file.name || `archivo_${Date.now()}`;
    const mimeType = file.type || "application/octet-stream";

    console.log(`[upload-drive] Subiendo "${fileName}" (${(file.size / 1024 / 1024).toFixed(1)} MB) a Google Drive...`);

    const { fileId, shareableLink } = await uploadToDrive(fileBuffer, fileName, mimeType);

    console.log(`[upload-drive] Archivo subido. fileId=${fileId}, link=${shareableLink}`);

    const supabase = createServiceClient();
    const expiresAt = new Date(Date.now() + DRIVE_RETENTION_HOURS * 60 * 60 * 1000).toISOString();

    await supabase.from("sek_drive_files").insert({
      drive_file_id: fileId,
      case_id: caseId,
      file_name: fileName,
      mime_type: mimeType,
      file_size: file.size,
      shareable_link: shareableLink,
      uploaded_by: agentEmail || null,
      expires_at: expiresAt,
      deleted: false,
    });

    return NextResponse.json({
      ok: true,
      shareableLink,
      fileId,
      fileName,
      expiresAt,
    });
  } catch (e: any) {
    console.error("[upload-drive] Error:", e);
    return NextResponse.json({ error: e?.message || "Error al subir a Drive" }, { status: 500 });
  }
}
