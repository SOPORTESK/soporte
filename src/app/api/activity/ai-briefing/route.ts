import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/service";
import { getModel } from "@/lib/ai/config";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  try {
    const { agent_email, agent_name, date } = await req.json();
    if (!agent_email) {
      return NextResponse.json({ error: "agent_email es requerido" }, { status: 400 });
    }

    const selectedDate = date || new Date().toISOString().split("T")[0];
    const supabase = createServiceClient();

    // 1. Obtener logs del día
    const start = `${selectedDate}T00:00:00`;
    const end = `${selectedDate}T23:59:59`;

    const { data: logs, error: logsErr } = await supabase
      .from("activity_log")
      .select("*")
      .ilike("agent_email", agent_email)
      .gte("created_at", start)
      .lte("created_at", end)
      .order("created_at", { ascending: true })
      .limit(600);

    if (logsErr) throw logsErr;

    if (!logs || logs.length === 0) {
      return NextResponse.json({
        ok: true,
        empty: true,
        message: "No se registraron actividades para este agente en la fecha seleccionada.",
      });
    }

    // 2. Calcular agregados
    let totalActiveMs = 0;
    let totalIdleMs = 0;
    const appUsageMs: Record<string, number> = {};
    const categoryMs: Record<string, number> = {};

    logs.forEach((l) => {
      const dur = l.duration_ms || 60000;
      if (l.category === "Inactividad") {
        totalIdleMs += dur;
      } else {
        totalActiveMs += dur;
        const meta = (l.metadata || {}) as Record<string, any>;
        const app = meta.app_name || meta.label || l.category || "Plataforma Sekunet";
        appUsageMs[app] = (appUsageMs[app] || 0) + dur;
        categoryMs[l.category] = (categoryMs[l.category] || 0) + dur;
      }
    });

    const activeMin = Math.round(totalActiveMs / 60000);
    const idleMin = Math.round(totalIdleMs / 60000);
    const totalMin = activeMin + idleMin;
    const score = totalMin > 0 ? Math.round((activeMin / totalMin) * 100) : 100;

    // Resumen cronológico para el prompt
    const timelineSample = logs
      .slice(0, 100)
      .map((l) => {
        const time = new Date(l.created_at).toLocaleTimeString("es-CR", { hour: "2-digit", minute: "2-digit" });
        return `[${time}] (${l.category}) ${l.action}`;
      })
      .join("\n");

    const topAppsStr = Object.entries(appUsageMs)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 8)
      .map(([app, ms]) => `- ${app}: ${Math.round(ms / 60000)} minutos`)
      .join("\n");

    // 3. Consultar IA
    const aiModel = await getModel("extract");
    const apiKey = aiModel?.apiKey || process.env.GEMINI_API_KEY;

    if (!apiKey) {
      return NextResponse.json({ error: "Sin API key de IA configurada" }, { status: 500 });
    }

    const prompt = `Eres un auditor sénior de operaciones y recursos humanos para Sekunet (Costa Rica).
Analiza la siguiente telemetría laboral de la jornada del colaborador "${agent_name || agent_email}" en la fecha ${selectedDate}.

DATOS CONSOLIDADOS:
- Tiempo activo efectivo: ${Math.floor(activeMin / 60)}h ${activeMin % 60}m
- Tiempo de inactividad: ${Math.floor(idleMin / 60)}h ${idleMin % 60}m
- Índice de Productividad: ${score}%
- Total de eventos registrados: ${logs.length}

TOP APLICACIONES / TAREAS:
${topAppsStr}

MUESTRA CRONOLÓGICA DE ACTIVIDADES:
${timelineSample}

Genera un dictamen ejecutivo en formato JSON estructurado EXACTAMENTE con estas claves:
{
  "resumen_ejecutivo": "Texto de 2 párrafos evaluando el ritmo de trabajo, cumplimiento y foco del colaborador.",
  "score_productividad": ${score},
  "horas_efectivas": "${Math.floor(activeMin / 60)}h ${activeMin % 60}m",
  "horas_inactivas": "${Math.floor(idleMin / 60)}h ${idleMin % 60}m",
  "principales_logros": ["Logro o actividad clave 1", "Actividad 2", "Actividad 3"],
  "alertas_observaciones": ["Observación 1 sobre pausas o tiempos", "Observación 2"],
  "recomendacion_gerencial": "Recomendación constructiva y concreta para el supervisor o jefatura."
}`;

    const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-3.5-flash-lite:generateContent?key=${apiKey}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: { temperature: 0.2, maxOutputTokens: 1000 },
      }),
      signal: AbortSignal.timeout(30000),
    });

    if (!res.ok) {
      throw new Error(`Gemini API error: ${res.status} ${await res.text()}`);
    }

    const data = await res.json();
    const rawText = data.candidates?.[0]?.content?.parts?.map((p: any) => p.text).join("") || "";
    const jsonMatch = rawText.match(/\{[\s\S]*\}/);
    const briefing = jsonMatch ? JSON.parse(jsonMatch[0]) : null;

    if (!briefing) {
      throw new Error("No se pudo estructurar el dictamen de IA");
    }

    return NextResponse.json({
      ok: true,
      agent_email,
      agent_name,
      date: selectedDate,
      briefing,
      stats: {
        activeMin,
        idleMin,
        score,
        totalEvents: logs.length,
        topApps: Object.entries(appUsageMs)
          .sort((a, b) => b[1] - a[1])
          .slice(0, 8)
          .map(([name, ms]) => ({ name, minutes: Math.round(ms / 60000) })),
      },
    });
  } catch (err: any) {
    console.error("[api/activity/ai-briefing] Error:", err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}