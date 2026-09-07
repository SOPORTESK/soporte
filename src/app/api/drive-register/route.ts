import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/service";
import { DRIVE_RETENTION_HOURS, refreshAccessToken } from "@/lib/google-drive";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 30;

// Registra un archivo ya subido a Drive en la BD y le asigna permiso público
export async function POST(req: NextRequest) {
  try {
    const { fileId, fileName, mimeType, fileSize, caseId, agentEmail } =
      await req.json();

    if (!fileId || !caseId) {
      return NextResponse.json({ error: "fileId y caseId requeridos" }, { status: 400 });
    }

    // Asegurar permiso público en Drive desde el servidor con el access token activo
    try {
      const accessToken = await refreshAccessToken();
      await fetch(`https://www.googleapis.com/drive/v3/files/${fileId}/permissions`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ role: "reader", type: "anyone" }),
      });
    } catch (permErr: any) {
      console.warn("[drive-register] Warning al asignar permisos en Drive:", permErr?.message);
    }

    const shareableLink = `https://drive.google.com/file/d/${fileId}/view?usp=sharing`;

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

    return NextResponse.json({ ok: true, shareableLink });
  } catch (e: any) {
    return NextResponse.json(
      { error: e?.message || "Error al registrar archivo" },
      { status: 500 }
    );
  }
}
