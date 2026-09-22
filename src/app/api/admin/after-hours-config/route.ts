import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export const runtime = "nodejs";

const DEFAULT_AFTER_HOURS = {
  enabled: false,
  message:
    "Estimado cliente, en este momento nos encontramos fuera de nuestro horario de atención. Con gusto le daremos respuesta en cuanto iniciemos nuestra próxima jornada laboral. ¡Gracias por contactar a Sekunet!",
};

const DEFAULT_DAILY_CLOSE = {
  enabled: false,
  close_time: "18:00",
  message:
    "Estimado cliente, informamos que nuestra jornada de atención ha finalizado por hoy. Procedemos al cierre de esta sesión. Si requiere asistencia adicional, por favor escríbanos en nuestro horario habitual y con gusto le atenderemos.",
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

    const { data: rows, error } = await supabase
      .from("sek_app_settings")
      .select("key, value")
      .in("key", ["after_hours_config", "daily_close_config"]);

    if (error) throw error;

    let afterHours = { ...DEFAULT_AFTER_HOURS };
    let dailyClose = { ...DEFAULT_DAILY_CLOSE };

    if (rows && rows.length > 0) {
      for (const row of rows) {
        if (!row.value) continue;
        try {
          const parsed = typeof row.value === "string" ? JSON.parse(row.value) : row.value;
          if (row.key === "after_hours_config" && parsed) {
            afterHours = {
              enabled: Boolean(parsed.enabled),
              message: parsed.message || DEFAULT_AFTER_HOURS.message,
            };
          } else if (row.key === "daily_close_config" && parsed) {
            dailyClose = {
              enabled: Boolean(parsed.enabled),
              close_time: parsed.close_time || DEFAULT_DAILY_CLOSE.close_time,
              message: parsed.message || DEFAULT_DAILY_CLOSE.message,
            };
          }
        } catch (_parseErr) {
          // Mantener defaults si hay error de formato
        }
      }
    }

    return NextResponse.json({
      success: true,
      after_hours: afterHours,
      daily_close: dailyClose,
    });
  } catch (error: any) {
    console.error("Error fetching after-hours and daily-close config:", error);
    return NextResponse.json(
      {
        success: false,
        error: error.message,
        after_hours: DEFAULT_AFTER_HOURS,
        daily_close: DEFAULT_DAILY_CLOSE,
      },
      { status: 500 }
    );
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const supabase = getSupabaseAdmin();

    const afterHours = {
      enabled: Boolean(body?.after_hours?.enabled),
      message: String(body?.after_hours?.message || DEFAULT_AFTER_HOURS.message).trim(),
    };

    const dailyClose = {
      enabled: Boolean(body?.daily_close?.enabled),
      close_time: String(body?.daily_close?.close_time || DEFAULT_DAILY_CLOSE.close_time).trim(),
      message: String(body?.daily_close?.message || DEFAULT_DAILY_CLOSE.message).trim(),
    };

    const nowIso = new Date().toISOString();

    const upserts = [
      {
        key: "after_hours_config",
        value: JSON.stringify(afterHours),
        updated_at: nowIso,
        iv: "none",
        tag: "none",
      },
      {
        key: "daily_close_config",
        value: JSON.stringify(dailyClose),
        updated_at: nowIso,
        iv: "none",
        tag: "none",
      },
    ];

    const { error } = await supabase
      .from("sek_app_settings")
      .upsert(upserts, { onConflict: "key" });

    if (error) throw error;

    return NextResponse.json({
      success: true,
      after_hours: afterHours,
      daily_close: dailyClose,
    });
  } catch (error: any) {
    console.error("Error saving after-hours and daily-close config:", error);
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}
