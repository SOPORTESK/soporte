import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/service";

export const runtime = "nodejs";
export const maxDuration = 30;

export async function GET(req: NextRequest) {
  const authHeader = req.headers.get("authorization");
  const expectedToken = process.env.CRON_SECRET;
  if (!expectedToken || authHeader !== `Bearer ${expectedToken}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const supabase = createServiceClient();
    const { data, error } = await supabase
      .from("sek_drive_config")
      .select("refresh_token, updated_at")
      .eq("id", 1)
      .single();

    if (error || !data?.refresh_token) {
      console.error("[drive-keepalive] No hay refresh_token en BD");
      return NextResponse.json({ ok: false, error: "No hay refresh_token configurado" }, { status: 500 });
    }

    const res = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        refresh_token: data.refresh_token,
        client_id: process.env.GOOGLE_OAUTH_CLIENT_ID!,
        client_secret: process.env.GOOGLE_OAUTH_CLIENT_SECRET!,
        grant_type: "refresh_token",
      }),
    });

    if (!res.ok) {
      const errBody = await res.text();
      console.error("[drive-keepalive] Refresh falló:", errBody.substring(0, 300));
      return NextResponse.json({
        ok: false,
        error: "Refresh token inválido o expirado. Re-autorice en /api/drive-oauth-start",
        needsReauth: true,
      }, { status: 401 });
    }

    await supabase
      .from("sek_drive_config")
      .update({ updated_at: new Date().toISOString() })
      .eq("id", 1);

    console.log("[drive-keepalive] Token refrescado correctamente");
    return NextResponse.json({ ok: true });
  } catch (e: any) {
    console.error("[drive-keepalive] Error:", e?.message);
    return NextResponse.json({ ok: false, error: e?.message }, { status: 500 });
  }
}
