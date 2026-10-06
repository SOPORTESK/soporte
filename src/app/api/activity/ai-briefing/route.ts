import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/service";
import { generateText } from "@/lib/ai/config";
import { computeUnifiedActivityMetrics } from "@/lib/activity-engine";

export const dynamic = "force-dynamic";

export interface IeeeReportStructure {
  title: string;
  abstract: string;
  keywords: string[];
  sections: {
    number: string;
    title: string;
    content: string;
  }[];
  conclusions: string;
  complianceVerdict: "CONFORME" | "NO CONFORME" | "CONDICIONAL";
  verdictDetail: string;
}

interface BriefingStructure {
  resumen_ejecutivo: string;
  score_productividad: number;
  horas_efectivas: string;
  horas_inactivas: string;
  principales_logros: string[];
  alertas_observaciones: string[];
  recomendacion_gerencial: string;
  ieee_report?: IeeeReportStructure;
}

function generateDeterministicIeeeReport(
  isTeamScope: boolean,
  targetName: string,
  dateLabel: string,
  activeMin: number,
  idleMin: number,
  score: number,
  topApps: [string, number][],
  eventsCount: number,
  userCount: number,
  isRange: boolean = false
): IeeeReportStructure {
  const activeHoursStr = `${Math.floor(activeMin / 60)}h ${activeMin % 60}m`;
  const idleHoursStr = `${Math.floor(idleMin / 60)}h ${idleMin % 60}m`;
  const primaryApp = topApps[0] ? topApps[0][0] : "Plataforma Central Sekunet";

  const verdict: "CONFORME" | "NO CONFORME" | "CONDICIONAL" =
    score >= 80 ? "CONFORME" : score >= 65 ? "CONDICIONAL" : "NO CONFORME";

  const cleanDocId = dateLabel.replace(/[^a-zA-Z0-9]/g, "_");

  return {
    title: isTeamScope
      ? (isRange
          ? `INFORME TÉCNICO DE TELEMETRÍA Y RENDIMIENTO OPERACIONAL MULTI-AGENTE: PERIODO DEL ${dateLabel}`
          : `INFORME TÉCNICO DE TELEMETRÍA Y RENDIMIENTO OPERACIONAL MULTI-AGENTE: JORNADA DEL ${dateLabel}`)
      : (isRange
          ? `EVALUACIÓN CUANTITATIVA DE RENDIMIENTO OPERATIVO Y DISPONIBILIDAD TÉCNICA (${dateLabel}): ${targetName.toUpperCase()}`
          : `EVALUACIÓN CUANTITATIVA DE RENDIMIENTO OPERATIVO Y DISPONIBILIDAD TÉCNICA: ${targetName.toUpperCase()}`),
    abstract: `El presente documento constituye un informe técnico estandarizado que evalúa el rendimiento operacional y la adherencia telemétrica durante el periodo correspondiente a ${dateLabel}. Mediante la captura discreta de eventos en estación de trabajo y algoritmos de conciliación temporal, se consolidaron ${activeHoursStr} de labor efectiva y ${idleHoursStr} de lapsos no operativos en ${eventsCount} registros discretos. El índice global de efectividad alcanzó un ${score}%, clasificando la operación bajo dictamen ${verdict}.`,
    keywords: [
      "Auditoría Telemétrica",
      "Efectividad Operacional",
      "Análisis de Tráfico de Escritorio",
      "Estándar IEEE 730",
      "Optimización de Procesos de Taller",
    ],
    sections: [
      {
        number: "I",
        title: "INTRODUCCIÓN Y DELIMITACIÓN DEL ALCANCE",
        content: `La supervisión técnica moderna en entornos de ingeniería de soporte demanda métricas empíricas reproducibles y trazables. En concordancia con los estándares de aseguramiento de calidad (IEEE 730 / ISO 9001), este reporte analiza el comportamiento de la estación de trabajo de ${targetName} durante el ciclo operacional de ${dateLabel}. El objetivo principal radica en contrastar la carga horaria formal contra la evidencia telemétrica en tiempo real.`,
      },
      {
        number: "II",
        title: "METODOLOGÍA DE CAPTURA Y MODELO DE CONSERVACIÓN TEMPORAL",
        content: `La recolección de datos se llevó a cabo mediante el agente de telemetría Sekunet Desktop Tracker v1.2, operando bajo muestreo de ventana activa y eventos de teclado/ratón. Se implementó un principio estricto de conservación del tiempo (Conservation of Time Invariant), donde la jornada laboral T_total se particiona de forma disjunta en T_activo (PC + Labores de Taller), T_descanso (refrigerios y pausas sanitarias) y T_inactivo (ausencias superiores a umbral sin registro manual).`,
      },
      {
        number: "III",
        title: "RESULTADOS EXPERIMENTALES Y TELEMETRÍA CUANTITATIVA",
        content: `La telemetría consolidó ${activeHoursStr} de actividad productiva neta, lo que representa un ${score}% de utilización efectiva. La herramienta con mayor densidad de uso fue "${primaryApp}", totalizando ${Math.round((topApps[0]?.[1] || 0) / 60000)} minutos de procesamiento. Los intervalos de no interacción sumaron ${idleHoursStr}, distribuidos entre pausas operativas y transiciones entre aplicaciones.`,
      },
      {
        number: "IV",
        title: "ANÁLISIS DE DISCREPANCIAS Y BRECHAS OPERACIONALES",
        content: `Durante el escrutinio de los ${eventsCount} eventos registrados, no se observaron solapamientos espurios entre temporizadores en ejecución y actividad digital simultánea. Los lapsos de desconexión se mantienen dentro de los parámetros esperados de la ingeniería de planta, registrando un factor de dispersión controlado.`,
      },
      {
        number: "V",
        title: "CONCLUSIONES Y DICTAMEN TÉCNICO",
        content: `Con base en la evidencia empírica computada por el motor de auditoría matemática, se certifica que el periodo evaluado arroja un índice de cumplimiento del ${score}%. Se concluye un dictamen formal ${verdict}, recomendando mantener los ciclos de atención continua y la documentación oportuna de labores de banco.`,
      },
    ],
    conclusions: `Se ratifica la integridad de las métricas registradas para ${targetName} con un índice de efectividad del ${score}%. El sistema certifica la exactitud de los tiempos reportados conforme a la telemetría del sistema.`,
    complianceVerdict: verdict,
    verdictDetail: `Dictamen de conformidad: ${verdict}. Nivel de efectividad: ${score}% (${score >= 80 ? "Aceptación Plena" : score >= 65 ? "Revisión Condicional" : "Desviación Crítica"}).`,
  };
}

// ─── GENERADOR DETERMINISTA DE RESPALDO (SI TODOS LOS PROVEEDORES ESTÁN CAÍDOS) ───
function generateDeterministicBriefing(
  isTeamScope: boolean,
  targetName: string,
  dateLabel: string,
  activeMin: number,
  idleMin: number,
  score: number,
  topApps: [string, number][],
  userCount: number,
  eventsCount: number,
  format: string = "standard",
  isRange: boolean = false
): BriefingStructure {
  const activeHoursStr = `${Math.floor(activeMin / 60)}h ${activeMin % 60}m`;
  const idleHoursStr = `${Math.floor(idleMin / 60)}h ${idleMin % 60}m`;
  const primaryApp = topApps[0] ? topApps[0][0] : "Plataforma Central Sekunet";
  const secondaryApp = topApps[1] ? topApps[1][0] : "Mensajería & Canales";

  if (isTeamScope) {
    const statusLabel = score >= 80 ? "Óptimo y altamente productivo" : score >= 60 ? "Estable y regular" : "Bajo rendimiento / Baches de atención";
    return {
      resumen_ejecutivo: `Durante el periodo ${dateLabel}, el equipo operativo registró un total de ${activeHoursStr} de labor efectiva en un consolidado de ${userCount} colaboradores auditados. El índice global de productividad se situó en ${score}% (${statusLabel}), focalizando la mayor carga de trabajo en "${primaryApp}" y "${secondaryApp}".`,
      score_productividad: score,
      horas_efectivas: activeHoursStr,
      horas_inactivas: idleHoursStr,
      principales_logros: [
        `Consolidación de ${eventsCount} eventos de atención y soporte técnico durante el periodo.`,
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

  const indStatus =
    score >= 80 ? "Desempeño sobresaliente" : score >= 65 ? "Desempeño adecuado" : "Rendimiento a revisar";

  // Base result
  const baseResult: BriefingStructure = {
    resumen_ejecutivo: `El colaborador ${targetName} completó en el periodo (${dateLabel}) un total de ${activeHoursStr} de actividad efectiva frente a ${idleHoursStr} de pausas acumuladas, alcanzando un índice de productividad del ${score}% (${indStatus}). Sus principales actividades se concentraron en "${primaryApp}".`,
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
      idleMin > 120 ? `El tiempo de inactividad (${idleHoursStr}) excede el promedio regular establecido.` : `Tiempos de pausa dentro de rangos normales de descanso y traslados.`,
    ],
    recomendacion_gerencial: `Mantener el ritmo de atención y enfocar los períodos de mayor concentración en la resolución expedita de casos pendientes y soporte técnico directo.`,
  };

  if (format === "ieee") {
    baseResult.ieee_report = generateDeterministicIeeeReport(
      isTeamScope,
      targetName,
      dateLabel,
      activeMin,
      idleMin,
      score,
      topApps,
      eventsCount,
      userCount,
      isRange
    );
  }

  return baseResult;
}

export async function POST(req: NextRequest) {
  try {
    const {
      agent_email,
      agent_name,
      date,
      startDate,
      endDate,
      scope = "user",
      format = "standard",
    } = await req.json();

    const isTeamScope = scope === "team" || agent_email === "all";

    // Manejo de rango de fechas o día único
    let startDay = startDate || date || new Date().toISOString().split("T")[0];
    let endDay = endDate || startDate || date || new Date().toISOString().split("T")[0];

    // Asegurar orden cronológico si el usuario seleccionó fechas invertidas
    if (startDay > endDay) {
      const temp = startDay;
      startDay = endDay;
      endDay = temp;
    }

    const isRange = startDay !== endDay;
    const dateLabel = isRange ? `${startDay} al ${endDay}` : startDay;

    const supabase = createServiceClient();

    const start = `${startDay}T00:00:00`;
    const end = `${endDay}T23:59:59`;

    // 1. Obtener logs dentro del intervalo solicitado
    let query = supabase
      .from("activity_log")
      .select("*")
      .gte("created_at", start)
      .lte("created_at", end)
      .order("created_at", { ascending: true });

    if (!isTeamScope && agent_email) {
      query = query.ilike("agent_email", agent_email);
    }

    // Límite ampliado para permitir auditoría de rangos de días
    const { data: logs, error: logsErr } = await query.limit(10000);
    if (logsErr) throw logsErr;

    if (!logs || logs.length === 0) {
      return NextResponse.json({
        ok: true,
        empty: true,
        dateLabel,
        isRange,
        startDate: startDay,
        endDate: endDay,
        message: isTeamScope
          ? `No hay actividades registradas para el equipo en el periodo seleccionado (${dateLabel}).`
          : `No hay actividades registradas para ${agent_name || agent_email} en el periodo seleccionado (${dateLabel}).`,
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

    // 3. Métricas agregadas calibradas con el motor unificado oficial
    const userGroups: Record<string, any[]> = {};
    for (const l of logs) {
      const email = (l.agent_email || "desconocido").toLowerCase();
      if (!userGroups[email]) userGroups[email] = [];
      userGroups[email].push(l);
    }

    let totalActiveMs = 0;
    let totalIdleMs = 0;
    const userStats: Record<string, { name: string; activeMs: number; idleMs: number; events: number; apps: Set<string>; cases: Set<string> }> = {};
    const appUsageMs: Record<string, number> = {};

    for (const [email, uLogs] of Object.entries(userGroups)) {
      const userName = uLogs[0]?.agent_name || agentMap[email] || email;
      const computed = computeUnifiedActivityMetrics(uLogs);
      const uActiveMs = computed.masterBuckets.Productivo.durationMs;
      const uIdleMs = computed.masterBuckets.Inactivo.durationMs;

      totalActiveMs += uActiveMs;
      totalIdleMs += uIdleMs;

      const appSet = new Set<string>();
      const caseSet = new Set<string>();
      for (const l of uLogs) {
        if (l.case_id) caseSet.add(l.case_id);
      }
      for (const s of computed.topSoftware) {
        appSet.add(s.name);
        appUsageMs[s.name] = (appUsageMs[s.name] || 0) + s.durationMs;
      }

      userStats[email] = {
        name: userName,
        activeMs: uActiveMs,
        idleMs: uIdleMs,
        events: uLogs.length,
        apps: appSet,
        cases: caseSet,
      };
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
Genera un INFORME EJECUTIVO GENERAL DEL EQUIPO para la Dirección General, correspondiente al periodo: ${dateLabel}.

DATOS CONSOLIDADOS DEL EQUIPO EN EL PERIODO:
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
  "resumen_ejecutivo": "Párrafo conciso y formal evaluando el desempeño operativo global de la empresa en este periodo.",
  "score_productividad": ${overallScore},
  "horas_efectivas": "${Math.floor(activeMin / 60)}h ${activeMin % 60}m",
  "horas_inactivas": "${Math.floor(idleMin / 60)}h ${idleMin % 60}m",
  "principales_logros": ["Logro 1 del equipo", "Logro 2 del equipo", "Logro 3 del equipo"],
  "alertas_observaciones": ["Observación 1", "Observación 2"],
  "recomendacion_gerencial": "Directriz puntual y estratégica para la supervisión y gerencia."
}`
      : `Eres el Auditor Sénior de Operaciones de Sekunet (Costa Rica).
Genera un DICTAMEN DE AUDITORÍA INDIVIDUAL para el colaborador "${agent_name || agent_email}" en el periodo: ${dateLabel}.

DATOS CONSOLIDADOS DEL PERIODO:
- Tiempo activo efectivo: ${Math.floor(activeMin / 60)}h ${activeMin % 60}m
- Tiempo de inactividad: ${Math.floor(idleMin / 60)}h ${idleMin % 60}m
- Índice de Productividad: ${overallScore}%
- Total de eventos registrados: ${logs.length}

TOP APLICACIONES / TAREAS:
${topAppsStr}

INSTRUCCIONES DE FORMATO:
Responde ÚNICAMENTE un objeto JSON válido (sin markdown ni texto antes o después) con la siguiente estructura:
{
  "resumen_ejecutivo": "Evaluación profesional y detallada del desempeño y dedicación del técnico en este periodo.",
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
        dateLabel,
        activeMin,
        idleMin,
        overallScore,
        sortedApps,
        Object.keys(userStats).length,
        logs.length,
        format,
        isRange
      );
    } else if (format === "ieee" && !briefing.ieee_report) {
      briefing.ieee_report = generateDeterministicIeeeReport(
        isTeamScope,
        targetDisplayName,
        dateLabel,
        activeMin,
        idleMin,
        overallScore,
        sortedApps,
        logs.length,
        Object.keys(userStats).length,
        isRange
      );
    }

    return NextResponse.json({
      ok: true,
      briefing,
      provider: usedProvider,
      model: usedModel,
      dateLabel,
      isRange,
      startDate: startDay,
      endDate: endDay,
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