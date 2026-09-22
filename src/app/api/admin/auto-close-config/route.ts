import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const DEFAULT_CONFIG = {
  enabled: true,
  inactivity_minutes: 10,
  close_message: "Al no haber recibido respuesta, procederemos a cerrar esta conversación. Si necesita asistencia adicional, puede contactarnos nuevamente y con gusto le atenderemos. ¡Que tenga un excelente día!",
};

function getSupabaseAdmin() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
      },
    }
  );
}

export async function GET() {
  try {
    const supabase = getSupabaseAdmin();
    const { data, error } = await supabase
      .from("sek_app_settings")
      .select("value")
      .eq("key", "auto_close_config")
      .maybeSingle();

    if (error) throw error;

    if (!data?.value) {
      return NextResponse.json({ success: true, config: DEFAULT_CONFIG });
    }

    const parsed = typeof data.value === "string" ? JSON.parse(data.value) : data.value;
    return NextResponse.json({
      success: true,
      config: {
        enabled: parsed.enabled ?? DEFAULT_CONFIG.enabled,
        inactivity_minutes: Number(parsed.inactivity_minutes) || DEFAULT_CONFIG.inactivity_minutes,
        close_message: parsed.close_message || DEFAULT_CONFIG.close_message,
      },
    });
  } catch (error: any) {
    console.error("Error reading auto-close config:", error);
    return NextResponse.json({ success: false, error: error.message, config: DEFAULT_CONFIG }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const supabase = getSupabaseAdmin();

    const configToSave = {
      enabled: Boolean(body.enabled),
      inactivity_minutes: Math.max(1, Math.min(10080, Number(body.inactivity_minutes) || 10)),
      close_message: String(body.close_message || DEFAULT_CONFIG.close_message).trim(),
    };

    const { error } = await supabase
      .from("sek_app_settings")
      .upsert(
        {
          key: "auto_close_config",
          value: JSON.stringify(configToSave),
          updated_at: new Date().toISOString(),
          iv: "none",
          tag: "none",
        },
        { onConflict: "key" }
      );

    if (error) throw error;

    return NextResponse.json({ success: true, config: configToSave });
  } catch (error: any) {
    console.error("Error saving auto-close config:", error);
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}
