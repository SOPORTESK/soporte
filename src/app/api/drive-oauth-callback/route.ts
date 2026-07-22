import { NextRequest, NextResponse } from "next/server";
import { exchangeCodeForTokens } from "@/lib/google-drive";
import { createServiceClient } from "@/lib/supabase/service";

export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  const code = req.nextUrl.searchParams.get("code");
  const error = req.nextUrl.searchParams.get("error");

  if (error) {
    return NextResponse.json({ error: `Google OAuth error: ${error}` }, { status: 400 });
  }
  if (!code) {
    return NextResponse.json({ error: "No code provided" }, { status: 400 });
  }

  try {
    const tokens = await exchangeCodeForTokens(code);
    console.log("[drive-oauth-callback] Tokens obtenidos. Refresh token presente:", !!tokens.refresh_token);

    if (!tokens.refresh_token) {
      return NextResponse.json({
        error: "No se obtuvo refresh_token. Revoca el acceso en https://myaccount.google.com/permissions e inténtelo de nuevo.",
      }, { status: 400 });
    }

    const supabase = createServiceClient();
    await supabase.from("sek_drive_config").upsert({
      id: 1,
      refresh_token: tokens.refresh_token,
      updated_at: new Date().toISOString(),
    }, { onConflict: "id" });

    const html = `<!DOCTYPE html><html><body style="font-family:sans-serif;text-align:center;padding:40px;">
    <h2>✅ Autorización exitosa</h2>
    <p>Google Drive está conectado. Puede cerrar esta ventana.</p>
    <p><small>Refresh token guardado en la base de datos.</small></p>
    </body></html>`;

    return new NextResponse(html, {
      headers: { "Content-Type": "text/html" },
    });
  } catch (e: any) {
    console.error("[drive-oauth-callback] Error:", e);
    return NextResponse.json({ error: e?.message }, { status: 500 });
  }
}
