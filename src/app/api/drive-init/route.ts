import { NextRequest, NextResponse } from "next/server";
import { refreshAccessToken } from "@/lib/google-drive";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 30;

export async function POST(req: NextRequest) {
  try {
    const { fileName, fileSize, mimeType } = await req.json();
    if (!fileName || !fileSize) {
      return NextResponse.json({ error: "fileName y fileSize requeridos" }, { status: 400 });
    }

    const accessToken = await refreshAccessToken(true);
    const folderId = process.env.GOOGLE_DRIVE_FOLDER_ID || "1GpDjU1Tu3n_FRF-BwwRJuMISOIjhsVht";

    const origin = req.headers.get("origin") || req.headers.get("referer")?.replace(/\/$/, "") || "https://sekachat.vercel.app";

    const initRes = await fetch(
      "https://www.googleapis.com/upload/drive/v3/files?uploadType=resumable&fields=id",
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "Content-Type": "application/json; charset=UTF-8",
          "X-Upload-Content-Type": mimeType || "application/octet-stream",
          "X-Upload-Content-Length": String(fileSize),
          Origin: origin,
        },
        body: JSON.stringify({ name: fileName, parents: [folderId] }),
      }
    );

    if (!initRes.ok) {
      const err = await initRes.text();
      console.error("[drive-init] Error de Google:", initRes.status, err);
      return NextResponse.json({ error: `Google Drive init falló: ${err}` }, { status: 502 });
    }

    const uploadUrl = initRes.headers.get("Location") || initRes.headers.get("location");
    if (!uploadUrl) {
      return NextResponse.json({ error: "No se obtuvo URL de subida de Google" }, { status: 500 });
    }

    return NextResponse.json({ uploadUrl });
  } catch (e: any) {
    console.error("[drive-init] error:", e?.message);
    return NextResponse.json({ error: e?.message || "Error al inicializar subida a Drive" }, { status: 500 });
  }
}
