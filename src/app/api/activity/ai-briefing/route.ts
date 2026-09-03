import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/service";
import { generateText } from "@/lib/ai/config";

export const dynamic = "force-dynamic";

interface BriefingStructure {
  resumen_ejecutivo: string;
  score_productividad: number;
  horas_efectivas: string;
  horas_inactivas: string;
  principales_logros: string[];
  alertas_observaciones: string[];
  recomendacion_gerencial: string;
}

// ─── GENERADOR DETERMINISTA DE RESPALDO (SI TODOS LOS PROVEEDORES ESTÁN CAÍDOS) ───
function generateDeterministicBriefing(
  isTeamScope: boolean,
  targetName: string,
  selectedDate: string,
  activeMin: number,
  idleMin: number,
  score: number,
  topApps: [string, number][],
  userCount: number,
  eventsCount: number
): BriefingStructure {
  const activeHoursStr = `${Math.floor(activeMin / 60)}h ${activeMin % 60}m`;
  const idleHoursStr = `${Math.floor(idleMin / 60)}h ${idleMin % 60}m`;
  const primaryApp = topApps[0] ? topApps[0][0] : "Plataforma Central Sekunet";
  const secondaryApp = topApps[1] ? topApps[1][0] : "Mensajería & Canales";

  if (isTeamScope) {
    const statusLabel = score >= 80 ? "Óptimo y altamente productivo" : score >= 60 ? "Estable y regular" : "Bajo rendimiento / Baches de atención";
    return {
      resumen_ejecutivo: `Durante la jornada del ${selectedDate}, el equipo operativo registró un total de ${activeHoursStr} de labor efectiva en un consolidado de ${userCount} colaboradores auditados. El índice global de productividad se situó en ${score}% (${statusLabel}), focalizando la mayor carga de trabajo en "${primaryApp}" y "${secondaryApp}".`,
      score_productividad: score,
      horas_efectivas: activeHoursStr,
      horas_inactivas: idleHoursStr,
      principales_logros: [
        `Consolidación de ${eventsCount} eventos de atención y soporte técnico durante el día.`,
        `Alta concentración operativa en "${primaryApp}" (${Math.round((topApps[0]?.[1] || 0) / 60000)} minutos acumulados).`,
        `Despliegue de cobertura en canales de soporte y herramientas administrativas.`,
      ],
      alertas_observaciones: [
        `Se acumularon ${idleHoursStr} de pausas o inactividad general en el conjunto de la plantilla.`,
        score < 70 ? `El índice global de productividad (${score}%) está por debajo del estándar óptimo del 80%.` : `Monitoreo continuo en transiciones y cambios de guardia.`,
      ],
      recomendacion_gerencial: `Optimizar la distribución de carga en horas pico, coordinar las pausas de descanso escalonadas para evitar ventanas descubiertas en los canales de atención y mantener el foco en la resolución de casos de primer contacto.`,
    };
  }

  // Individual
  const indStatus = score >= 85 ? "Desempeño sobresaliente" : score >= 70 ? "Desempeño satisfactorio" : "Atención requerida por inactividad";
  return {
    resumen_ejecutivo: `El colaborador ${targetName} completó una jornada laboral de ${activeHoursStr} de actividad efectiva frente a ${idleHoursStr} de pausas acumuladas, alcanzando un índice de productividad del ${score}% (${indStatus}). Sus principales actividades se concentraron en "${primaryApp}".`,
    score_productividad: score,
    horas_efectivas: activeHoursStr,
    horas_inactivas: idleHoursStr,
    principales_logros: [
      `Dedicación principal a "${primaryApp}" con ${Math.round((topApps[0]?.[1] || 0) / 60000)} minutos de interacción efectiva.`,
      `Registro continuo de ${eventsCount} acciones registradas en el espacio de trabajo.`,
      `Seguimiento activo a tareas operativas y consultas asignadas.`,
    ],
    alertas_observaciones: [
      `Se registraron ${idleHoursStr} acumuladas en pausas o períodos sin actividad en la estación.`,
      idleMin > 120 ? `El tiempo de inactividad (${idleHoursStr}) excede el promedio regular de la jornada.` : `Tiempos de pausa dentro de rangos normales de descanso y traslados.`,
    ],
    recomendacion_gerencial: `Mantener el ritmo de atención y enfocar los períodos de mayor concentración en la resolución expedita de casos pendientes y soporte técnico directo.`,
  };
}

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

    // 2. Obtener lista de agentes para nombres reales
    const { data: agents } = await supabase
      .from("sek_agent_config")
      .select("email, nombre, apellido, rol")
      .not("email", "ilike", "%bot%")
      .not("email", "ilike", "%system%");

    const agentMap: Record<string, string> = {};
    agents?.forEach((a) => {
      agentMap[a.email.toLowerCase()] = [a.nombre, a.apellido].filter(Boolean).join(" ") || a.email;
    });

    // 3. Métricas agregadas calibradas con intervalos cronológicos reales
    let totalActiveMs = 0;
    let totalIdleMs = 0;
    const userStats: Record<string, { name: string; activeMs: number; idleMs: number; events: number; apps: Set<string>; cases: Set<string> }> = {};
    const appUsageMs: Record<string, number> = {};

    const IDLE_GAP_MS = 15 * 60 * 1000;

    for (let i = 0; i < logs.length; i++) {
      const l = logs[i];
      const email = (l.agent_email || "desconocido").toLowerCase();
      const userName = l.agent_name || agentMap[email] || email;

      const currTime = new Date(l.created_at).getTime();
      const nextTime = i < logs.length - 1 ? new Date(logs[i + 1].created_at).getTime() : currTime + 60000;
      const gap = Math.max(0, nextTime - currTime);

      if (!userStats[email]) {
        userStats[email] = { name: userName, activeMs: 0, idleMs: 0, events: 0, apps: new Set(), cases: new Set() };
      }
      userStats[email].events++;
      if (l.case_id) userStats[email].cases.add(l.case_id);

      if (l.category === "Inactividad") {
        totalIdleMs += gap;
        userStats[email].idleMs += gap;
      } else {
        const effectiveDur = Math.min(gap, IDLE_GAP_MS);
        totalActiveMs += effectiveDur;
        userStats[email].activeMs += effectiveDur;

        const meta = (l.metadata || {}) as Record<string, any>;
        const app = meta.app_name || meta.label || (l.category === "Navegación" ? (meta.page || "Seka Chat") : l.category) || "Plataforma Sekunet";
        appUsageMs[app] = (appUsageMs[app] || 0) + effectiveDur;
        userStats[email].apps.add(app);

        if (gap > IDLE_GAP_MS) {
          const idleGap = gap - IDLE_GAP_MS;
          totalIdleMs += idleGap;
          userStats[email].idleMs += idleGap;
        }
      }
    }

    const activeMin = Math.round(totalActiveMs / 60000);
    const idleMin = Math.round(totalIdleMs / 60000);
    const totalMin = activeMin + idleMin;
    const overallScore = totalMin > 0 ? Math.round((activeMin / totalMin) * 100) : 100;

    const sortedApps = Object.entries(appUsageMs).sort((a, b) => b[1] - a[1]);
    const topAppsStr = sortedApps
      .slice(0, 8)
      .map(([app, ms]) => `- ${app}: ${Math.round(ms / 60000)} minutos`)
      .join("\n");

    const teamTableSummary = Object.entries(userStats)
      .map(([em, s]) => {
        const uActiveMin = Math.round(s.activeMs / 60000);
        const uIdleMin = Math.round(s.idleMs / 60000);
        const uTotal = uActiveMin + uIdleMin;
        const uScore = uTotal > 0 ? Math.round((uActiveMin / uTotal) * 100) : 100;
        return `- ${s.name} (${em}): ${Math.floor(uActiveMin / 60)}h ${uActiveMin % 60}m activo | ${Math.floor(uIdleMin / 60)}h ${uIdleMin % 60}m inactivo | Score: ${uScore}% | Casos: ${s.cases.size}`;
      })
      .join("\n");

    const targetDisplayName = isTeamScope ? "Equipo General" : agent_name || agent_email;

    const systemPrompt = isTeamScope
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

INSTRUCCIONES DE FORMATO:
Responde ÚNICAMENTE un objeto JSON válido (sin markdown ni texto antes o después) con la siguiente estructura:
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

INSTRUCCIONES DE FORMATO:
Responde ÚNICAMENTE un objeto JSON válido (sin markdown ni texto antes o después) con la siguiente estructura:
{
  "resumen_ejecutivo": "Evaluación profesional y detallada de la jornada laboral del técnico.",
  "score_productividad": ${overallScore},
  "horas_efectivas": "${Math.floor(activeMin / 60)}h ${activeMin % 60}m",
  "horas_inactivas": "${Math.floor(idleMin / 60)}h ${idleMin % 60}m",
  "principales_logros": ["Actividad de alto impacto 1", "Actividad 2", "Actividad 3"],
  "alertas_observaciones": ["Alerta o patrón detectado 1", "Alerta 2"],
  "recomendacion_gerencial": "Recomendación constructiva y puntual para mejorar la eficiencia del colaborador."
}`;

    // 4. Llamar a la cadena de modelos configurada en el Panel de Agente IA
    let briefing: BriefingStructure | null = null;
    let usedProvider = "deterministic";
    let usedModel = "internal-engine";

    try {
      const aiResult = await generateText("activity", {
        system: systemPrompt,
        messages: [{ role: "user", content: "Genera el informe ejecutivo de auditoría en JSON." }],
        temperature: 0.2,
        maxTokens: 2048,
        timeoutMs: 25000,
      });

      if (aiResult && aiResult.text) {
        usedProvider = aiResult.provider;
        usedModel = aiResult.modelo;
        // Limpiar backticks si el modelo los devuelve
        let cleanJson = aiResult.text.trim();
        if (cleanJson.startsWith("```json")) cleanJson = cleanJson.replace(/^```json/, "").replace(/```$/, "").trim();
        else if (cleanJson.startsWith("```")) cleanJson = cleanJson.replace(/^```/, "").replace(/```$/, "").trim();
        briefing = JSON.parse(cleanJson);
      }
    } catch (err: any) {
      console.warn("[ai-briefing] Cadena de IA configurada falló, recurriendo al motor de respaldo:", err?.message);
    }

    // Si la IA no respondió o devolvió JSON inválido, activar motor determinista
    if (!briefing || !briefing.resumen_ejecutivo) {
      briefing = generateDeterministicBriefing(
        isTeamScope,
        targetDisplayName,
        selectedDate,
        activeMin,
        idleMin,
        overallScore,
        sortedApps,
        Object.keys(userStats).length,
        logs.length
      );
    }

    return NextResponse.json({
      ok: true,
      briefing,
      provider: usedProvider,
      model: usedModel,
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
    console.error("[ai-briefing] Error crítico:", error);
    return NextResponse.json({ error: error.message || "Error interno del servidor" }, { status: 500 });
  }
}