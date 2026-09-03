import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/service";
import { getModel } from "@/lib/ai/config";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  try {
    const { agent_email, agent_name, date, scope = "user" } = await req.json();
    const isTeamScope = scope === "team" || agent_email === "all";

    const selectedDate = date || new Date().toISOString().split("T")[0];
    const supabase = createServiceClient();

    const start = `${selectedDate}T00:00:00`;
    const end = `${selectedDate}T23:59:59`;

    // 1. Obtener logs
    let query = supabase
      .from("activity_log")
      .select("*")
      .gte("created_at", start)
      .lte("created_at", end)
      .order("created_at", { ascending: true });

    if (!isTeamScope && agent_email) {
      query = query.ilike("agent_email", agent_email);
    }

    const { data: logs, error: logsErr } = await query.limit(1500);
    if (logsErr) throw logsErr;

    if (!logs || logs.length === 0) {
      return NextResponse.json({
        ok: true,
        empty: true,
        message: isTeamScope
          ? "No hay actividades registradas para el equipo en la fecha seleccionada."
          : `No hay actividades registradas para ${agent_name || agent_email} en la fecha seleccionada.`,
      });
    }

    // 2. Obtener lista de agentes para cruzar nombres
    const { data: agents } = await supabase
      .from("sek_agent_config")
      .select("email, nombre, apellido, rol")
      .not("email", "ilike", "%bot%")
      .not("email", "ilike", "%system%");

    const agentMap: Record<string, string> = {};
    agents?.forEach((a) => {
      agentMap[a.email.toLowerCase()] = [a.nombre, a.apellido].filter(Boolean).join(" ") || a.email;
    });

    // 3. Métricas agregadas
    let totalActiveMs = 0;
    let totalIdleMs = 0;
    const userStats: Record<string, { name: string; activeMs: number; idleMs: number; events: number; apps: Set<string>; cases: Set<string> }> = {};
    const appUsageMs: Record<string, number> = {};

    logs.forEach((l) => {
      const email = (l.agent_email || "desconocido").toLowerCase();
      const userName = l.agent_name || agentMap[email] || email;
      const dur = l.duration_ms || 60000;

      if (!userStats[email]) {
        userStats[email] = { name: userName, activeMs: 0, idleMs: 0, events: 0, apps: new Set(), cases: new Set() };
      }
      userStats[email].events++;
      if (l.case_id) userStats[email].cases.add(l.case_id);

      if (l.category === "Inactividad") {
        totalIdleMs += dur;
        userStats[email].idleMs += dur;
      } else {
        totalActiveMs += dur;
        userStats[email].activeMs += dur;
        const meta = (l.metadata || {}) as Record<string, any>;
        const app = meta.app_name || meta.label || l.category || "Plataforma Sekunet";
        appUsageMs[app] = (appUsageMs[app] || 0) + dur;
        userStats[email].apps.add(app);
      }
    });

    const activeMin = Math.round(totalActiveMs / 60000);
    const idleMin = Math.round(totalIdleMs / 60000);
    const totalMin = activeMin + idleMin;
    const overallScore = totalMin > 0 ? Math.round((activeMin / totalMin) * 100) : 100;

    const teamTableSummary = Object.entries(userStats)
      .map(([em, s]) => {
        const uActiveMin = Math.round(s.activeMs / 60000);
        const uIdleMin = Math.round(s.idleMs / 60000);
        const uTotal = uActiveMin + uIdleMin;
        const uScore = uTotal > 0 ? Math.round((uActiveMin / uTotal) * 100) : 100;
        return `- ${s.name} (${em}): ${Math.floor(uActiveMin / 60)}h ${uActiveMin % 60}m activo | ${Math.floor(uIdleMin / 60)}h ${uIdleMin % 60}m inactivo | Score: ${uScore}% | Casos: ${s.cases.size} | Apps: ${Array.from(s.apps).slice(0, 4).join(", ")}`;
      })
      .join("\n");

    const topAppsStr = Object.entries(appUsageMs)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 8)
      .map(([app, ms]) => `- ${app}: ${Math.round(ms / 60000)} minutos`)
      .join("\n");

    // 4. Consultar IA (Gemini)
    const aiModel = await getModel("extract");
    const apiKey = aiModel?.apiKey || process.env.GEMINI_API_KEY;

    if (!apiKey) {
      return NextResponse.json({ error: "Sin API key de IA configurada" }, { status: 500 });
    }

    const systemAuditorPrompt = isTeamScope
      ? `Eres el Auditor Sénior de Operaciones y Productividad de Sekunet (Costa Rica).
Genera un INFORME EJECUTIVO GENERAL DEL EQUIPO para la Dirección General, correspondiente a la jornada del ${selectedDate}.

DATOS CONSOLIDADOS DEL EQUIPO:
- Colaboradores activos auditados: ${Object.keys(userStats).length}
- Tiempo total activo efectivo del equipo: ${Math.floor(activeMin / 60)}h ${activeMin % 60}m
- Tiempo total de inactividad del equipo: ${Math.floor(idleMin / 60)}h ${idleMin % 60}m
- Índice Global de Productividad: ${overallScore}%

DESGLOSE POR COLABORADOR:
${teamTableSummary}

TOP SOFTWARE Y APLICACIONES USADAS POR EL EQUIPO:
${topAppsStr}

INSTRUCCIONES DE REDACCIÓN:
1. Redacta de forma formal, ejecutiva, elegante, clara y puntual.
2. Proporciona un dictamen estructurado en formato JSON con la siguiente estructura exacta:
{
  "resumen_ejecutivo": "Párrafo conciso y formal evaluando el desempeño operativo global de la empresa hoy.",
  "score_productividad": ${overallScore},
  "horas_efectivas": "${Math.floor(activeMin / 60)}h ${activeMin % 60}m",
  "horas_inactivas": "${Math.floor(idleMin / 60)}h ${idleMin % 60}m",
  "principales_logros": ["Logro 1 del equipo", "Logro 2 del equipo", "Logro 3 del equipo"],
  "alertas_observaciones": ["Observación 1", "Observación 2"],
  "recomendacion_gerencial": "Directriz puntual y estratégica para la supervisión y gerencia."
}`
      : `Eres el Auditor Sénior de Operaciones de Sekunet (Costa Rica).
Genera un DICTAMEN DE AUDITORÍA INDIVIDUAL para el colaborador "${agent_name || agent_email}" en la fecha ${selectedDate}.

DATOS CONSOLIDADOS:
- Tiempo activo efectivo: ${Math.floor(activeMin / 60)}h ${activeMin % 60}m
- Tiempo de inactividad: ${Math.floor(idleMin / 60)}h ${idleMin % 60}m
- Índice de Productividad: ${overallScore}%
- Total de eventos registrados: ${logs.length}

TOP APLICACIONES / TAREAS:
${topAppsStr}

INSTRUCCIONES DE REDACCIÓN:
1. Redacta de forma profesional, clara, precisa y directa al punto.
2. Proporciona un dictamen estructurado en formato JSON con la siguiente estructura exacta:
{
  "resumen_ejecutivo": "Evaluación profesional y detallada de la jornada laboral del técnico.",
  "score_productividad": ${overallScore},
  "horas_efectivas": "${Math.floor(activeMin / 60)}h ${activeMin % 60}m",
  "horas_inactivas": "${Math.floor(idleMin / 60)}h ${idleMin % 60}m",
  "principales_logros": ["Actividad de alto impacto 1", "Actividad 2", "Actividad 3"],
  "alertas_observaciones": ["Alerta o patrón detectado 1", "Alerta 2"],
  "recomendacion_gerencial": "Recomendación constructiva y puntual para mejorar la eficiencia del colaborador."
}`;

    const geminiUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${apiKey}`;

    const aiRes = await fetch(geminiUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [{ role: "user", parts: [{ text: systemAuditorPrompt }] }],
        generationConfig: {
          temperature: 0.2,
          responseMimeType: "application/json",
        },
      }),
    });

    if (!aiRes.ok) {
      const errTxt = await aiRes.text();
      console.error("[ai-briefing] Gemini error:", errTxt);
      return NextResponse.json({ error: "Fallo al generar análisis de IA" }, { status: 500 });
    }

    const aiJson = await aiRes.json();
    const rawText = aiJson.candidates?.[0]?.content?.parts?.[0]?.text;
    const briefing = JSON.parse(rawText || "{}");

    return NextResponse.json({
      ok: true,
      briefing,
      stats: {
        totalActiveMinutes: activeMin,
        totalIdleMinutes: idleMin,
        score: overallScore,
        userCount: Object.keys(userStats).length,
        userBreakdown: Object.values(userStats).map((u) => ({
          name: u.name,
          activeMinutes: Math.round(u.activeMs / 60000),
          idleMinutes: Math.round(u.idleMs / 60000),
          eventsCount: u.events,
          casesCount: u.cases.size,
          score: Math.round((u.activeMs / Math.max(1, u.activeMs + u.idleMs)) * 100),
        })),
      },
    });
  } catch (error: any) {
    console.error("[ai-briefing] Error:", error);
    return NextResponse.json({ error: error.message || "Error interno del servidor" }, { status: 500 });
  }
}