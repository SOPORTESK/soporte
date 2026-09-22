import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

function getSupabaseAdmin() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
      },
    }
  );
}

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const channel = searchParams.get("channel");
    if (!channel) {
      return NextResponse.json({ error: "Canal no especificado" }, { status: 400 });
    }

    const supabase = getSupabaseAdmin();
    const { data, error } = await supabase
      .from("sek_app_settings")
      .select("value")
      .eq("key", `channel_${channel}_config`)
      .maybeSingle();

    if (error) throw error;

    if (!data?.value) {
      return NextResponse.json({ success: true, config: {} });
    }

    const parsed = typeof data.value === "string" ? JSON.parse(data.value) : data.value;
    return NextResponse.json({ success: true, config: parsed });
  } catch (error: any) {
    console.error("Error reading channel config:", error);
    return NextResponse.json({ success: false, error: error.message, config: {} }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { channel, config } = body;
    if (!channel || typeof config !== "object") {
      return NextResponse.json({ error: "Datos inválidos" }, { status: 400 });
    }

    const supabase = getSupabaseAdmin();
    const { error } = await supabase
      .from("sek_app_settings")
      .upsert(
        {
          key: `channel_${channel}_config`,
          value: JSON.stringify(config),
          updated_at: new Date().toISOString(),
          iv: "none",
          tag: "none",
        },
        { onConflict: "key" }
      );

    if (error) throw error;

    return NextResponse.json({ success: true, config });
  } catch (error: any) {
    console.error("Error saving channel config:", error);
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}
