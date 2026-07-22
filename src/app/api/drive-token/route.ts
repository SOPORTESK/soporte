import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/service";

export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  try {
    const supabase = createServiceClient();
    const { data, error } = await supabase
      .from("sek_drive_config")
      .select("refresh_token")
      .eq("id", 1)
      .single();

    if (error || !data?.refresh_token) {
      return NextResponse.json({ error: "Google Drive no autorizado" }, { status: 500 });
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
      return NextResponse.json({ error: "Token refresh failed" }, { status: 500 });
    }

    const tokens = await res.json();
    return NextResponse.json({
      accessToken: tokens.access_token,
      folderId: process.env.GOOGLE_DRIVE_FOLDER_ID,
    });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message }, { status: 500 });
  }
}
