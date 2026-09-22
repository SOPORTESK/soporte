import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export const runtime = "nodejs";

const DEFAULT_CONFIG = {
  enabled: true,
  inactivity_minutes: 10,
  close_message:
    "Debido a que no hemos recibido respuesta, vamos a cerrar esta conversación. Si necesita ayuda, con gusto le atendemos. ¡Que tenga un buen día!",
};

const DEFAULT_AFTER_HOURS = {
  enabled: false,
  message:
    "Gracias por contactarnos.\n\nEn este momento nos encontramos fuera de nuestro horario de atención.\n\nLe invitamos a comunicarse con nosotros en nuestro horario de servicio, de lunes a viernes, de 7:30 a. m. a 5:00 p. m.",
};

const DEFAULT_DAILY_CLOSE = {
  enabled: false,
  close_time: "18:00",
  message:
    "Estimado cliente, informamos que nuestra jornada de atención ha finalizado por hoy. Procedemos al cierre de esta sesión. Si requiere asistencia adicional, por favor escríbanos en nuestro horario habitual y con gusto le atenderemos.",
};

const DEFAULT_SURVEY = {
  enabled: false,
  message:
    "¿Cómo calificaría la atención recibida? Responda con un número del 1 al 5, donde 1 es muy mala y 5 es excelente.",
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
      .in("key", ["auto_close_config", "after_hours_config", "daily_close_config", "survey_config"]);

    if (error) throw error;

    let config = { ...DEFAULT_CONFIG };
    let afterHours = { ...DEFAULT_AFTER_HOURS };
    let dailyClose = { ...DEFAULT_DAILY_CLOSE };
    let survey = { ...DEFAULT_SURVEY };

    if (rows && rows.length > 0) {
      for (const row of rows) {
        if (!row.value) continue;
        try {
          const parsed = typeof row.value === "string" ? JSON.parse(row.value) : row.value;
          if (row.key === "auto_close_config" && parsed) {
            config = {
              enabled: parsed.enabled !== undefined ? Boolean(parsed.enabled) : DEFAULT_CONFIG.enabled,
              inactivity_minutes: Number(parsed.inactivity_minutes) || DEFAULT_CONFIG.inactivity_minutes,
              close_message: parsed.close_message || DEFAULT_CONFIG.close_message,
            };
          } else if (row.key === "after_hours_config" && parsed) {
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
          } else if (row.key === "survey_config" && parsed) {
            survey = {
              enabled: Boolean(parsed.enabled),
              message: parsed.message || DEFAULT_SURVEY.message,
            };
          }
        } catch (_e) {}
      }
    }

    return NextResponse.json({
      success: true,
      config,
      after_hours: afterHours,
      daily_close: dailyClose,
      survey,
    });
  } catch (error: any) {
    console.error("Error reading auto-close config:", error);
    return NextResponse.json(
      {
        success: false,
        error: error.message,
        config: DEFAULT_CONFIG,
        after_hours: DEFAULT_AFTER_HOURS,
        daily_close: DEFAULT_DAILY_CLOSE,
        survey: DEFAULT_SURVEY,
      },
      { status: 500 }
    );
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const supabase = getSupabaseAdmin();

    const nowIso = new Date().toISOString();
    const upserts = [];

    // Auto-cierre por inactividad
    const configToSave = {
      enabled: body?.enabled !== undefined ? Boolean(body.enabled) : DEFAULT_CONFIG.enabled,
      inactivity_minutes: Math.max(1, Math.min(10080, Number(body.inactivity_minutes) || 10)),
      close_message: String(body.close_message || DEFAULT_CONFIG.close_message).trim(),
    };
    upserts.push({
      key: "auto_close_config",
      value: JSON.stringify(configToSave),
      updated_at: nowIso,
      iv: "none",
      tag: "none",
    });

    // Respuestas fuera de horario
    if (body.after_hours) {
      const afterHoursToSave = {
        enabled: Boolean(body.after_hours.enabled),
        message: String(body.after_hours.message || DEFAULT_AFTER_HOURS.message).trim(),
      };
      upserts.push({
        key: "after_hours_config",
        value: JSON.stringify(afterHoursToSave),
        updated_at: nowIso,
        iv: "none",
        tag: "none",
      });
    }

    // Cierre diario al fin de jornada
    if (body.daily_close) {
      const dailyCloseToSave = {
        enabled: Boolean(body.daily_close.enabled),
        close_time: String(body.daily_close.close_time || DEFAULT_DAILY_CLOSE.close_time).trim(),
        message: String(body.daily_close.message || DEFAULT_DAILY_CLOSE.message).trim(),
      };
      upserts.push({
        key: "daily_close_config",
        value: JSON.stringify(dailyCloseToSave),
        updated_at: nowIso,
        iv: "none",
        tag: "none",
      });
    }

    // Encuesta de Satisfacción (WhatsApp)
    if (body.survey) {
      const surveyToSave = {
        enabled: Boolean(body.survey.enabled),
        message: String(body.survey.message || DEFAULT_SURVEY.message).trim(),
      };
      upserts.push({
        key: "survey_config",
        value: JSON.stringify(surveyToSave),
        updated_at: nowIso,
        iv: "none",
        tag: "none",
      });
    }

    const { error } = await supabase
      .from("sek_app_settings")
      .upsert(upserts, { onConflict: "key" });

    if (error) throw error;

    return NextResponse.json({
      success: true,
      config: configToSave,
      after_hours: body.after_hours,
      daily_close: body.daily_close,
      survey: body.survey,
    });
  } catch (error: any) {
    console.error("Error saving auto-close config:", error);
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}
