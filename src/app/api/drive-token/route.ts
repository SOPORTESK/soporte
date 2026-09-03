import { NextResponse } from "next/server";
import { refreshAccessToken } from "@/lib/google-drive";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 30;

// Devuelve un access token de corta duración para que el navegador
// suba directo a Google Drive sin pasar el archivo por Vercel.
export async function GET() {
  try {
    const accessToken = await refreshAccessToken();
    const folderId =
      process.env.GOOGLE_DRIVE_FOLDER_ID || "1GpDjU1Tu3n_FRF-BwwRJuMISOIjhsVht";
    return NextResponse.json({ accessToken, folderId });
  } catch (e: any) {
    return NextResponse.json(
      { error: e?.message || "No se pudo obtener token de Drive" },
      { status: 500 }
    );
  }
}
