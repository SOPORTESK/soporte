// src/app/api/activity/period-metrics/route.ts
// Motor de Métricas Periódicas y Mensuales de Actividad (Sin Truncamiento)
// Agrega la actividad día a día para cada colaborador dentro del rango seleccionado
// garantizando que 1 mes de trabajo sume exactamente las horas reales trabajadas.
import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/service";
import { computeUnifiedActivityMetrics } from "@/lib/activity-engine";
import { getAgentSchedule, getAppMappings, type ActivityLog } from "@/lib/activity-db";

export const dynamic = "force-dynamic";
export const revalidate = 0;

interface CacheEntry {
  data: any;
  expires: number;
}

const metricsCache = new Map<string, CacheEntry>();
const CACHE_TTL_MS = 30000; // 30 segundos

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const startDate = searchParams.get("startDate") || searchParams.get("date") || new Date().toISOString().split("T")[0];
    const endDate = searchParams.get("endDate") || startDate;
    const agentEmail = searchParams.get("agent") || undefined;
    const forceRefresh = searchParams.has("_t") || req.headers.get("cache-control")?.includes("no-cache");

    const cacheKey = `${startDate}_${endDate}_${agentEmail || "all"}`;
    if (!forceRefresh) {
      const cached = metricsCache.get(cacheKey);
      if (cached && Date.now() < cached.expires) {
        const res = NextResponse.json(cached.data);
        res.headers.set("Cache-Control", "no-store, no-cache, must-revalidate");
        return res;
      }
    }

    const supabase = createServiceClient();

    // 1. Lectura paginada completa sin tope de 8000 (trae hasta 100,000 registros si es el mes completo)
    const allLogs: ActivityLog[] = [];
    let from = 0;
    const batchSize = 1000;
    const maxRecords = 100000;

    const startIso = `${startDate}T00:00:00-06:00`;
    const endIso = `${endDate}T23:59:59.999-06:00`;

    while (from < maxRecords) {
      let query = supabase
        .from("activity_log")
        .select("id, agent_email, agent_name, action, category, case_id, metadata, duration_ms, created_at")
        .gte("created_at", startIso)
        .lte("created_at", endIso)
        .order("created_at", { ascending: true });

      if (agentEmail) {
        query = query.eq("agent_email", agentEmail);
      }

      const { data, error } = await query.range(from, from + batchSize - 1);
      if (error) {
        console.error("[period-metrics] query error:", error.message);
        break;
      }
      const batch = (data || []) as ActivityLog[];
      allLogs.push(...batch);
      if (batch.length < batchSize) break;
      from += batchSize;
    }

    // 2. Mapeos de apps y configuración
    const appMappings = await getAppMappings();

    // 3. Agrupación por agente y por fecha de Costa Rica (YYYY-MM-DD)
    const byAgentAndDay = new Map<string, Map<string, ActivityLog[]>>();
    const agentNames = new Map<string, string>();

    for (const it of allLogs) {
      const email = (it.agent_email || "").toLowerCase().trim();
      if (!email) continue;
      if (it.agent_name && !agentNames.has(email)) {
        agentNames.set(email, it.agent_name);
      }
      const dStr = new Date(it.created_at as string).toLocaleDateString("en-CA", {
        timeZone: "America/Costa_Rica",
      });

      if (!byAgentAndDay.has(email)) {
        byAgentAndDay.set(email, new Map<string, ActivityLog[]>());
      }
      const dayMap = byAgentAndDay.get(email)!;
      if (!dayMap.has(dStr)) {
        dayMap.set(dStr, []);
      }
      dayMap.get(dStr)!.push(it);
    }

    // 4. Cálculo riguroso día a día para cada agente
    interface AgentPeriodRow {
      email: string;
      name: string;
      avatarUrl?: string;
      status: string;
      activePcMs: number;
      activeManualMs: number;
      activeTotalMs: number;
      breakMs: number;
      sanitaryMs: number;
      idleMs: number;
      daysWorked: number;
      eventsCount: number;
      productivityScore: number;
    }

    const agentBreakdown: AgentPeriodRow[] = [];
    let teamPcMs = 0;
    let teamManualMs = 0;
    let teamActiveMs = 0;
    let teamBreakMs = 0;
    let teamSanitaryMs = 0;
    let teamIdleMs = 0;

    // Métricas para modo individual si se especificó agente
    let individualDailyBreakdown: any[] = [];
    const individualSoftwareMap: Record<string, { durationMs: number; count: number; category: string }> = {};

    for (const [email, dayMap] of Array.from(byAgentAndDay.entries())) {
      let agPcMs = 0;
      let agManualMs = 0;
      let agActiveMs = 0;
      let agBreakMs = 0;
      let agSanitaryMs = 0;
      let agIdleMs = 0;
      let daysWorked = 0;
      let totalEvents = 0;

      // Obtener horario del agente
      let sched: any = {};
      try {
        sched = await getAgentSchedule(email);
      } catch {}

      const targetDailyHours = Number(sched?.targetDailyHours) || 10;
      const toleranceMinutes = Math.max(1, Number(sched?.toleranceMinutes) || 3);
      const scheduleStart = sched?.scheduleStart || "08:00";
      const scheduleEnd = sched?.scheduleEnd || "17:00";
      const useMixedSchedule = sched?.useMixedSchedule;
      const daySchedules = sched?.daySchedules;

      const isTargetAgent = agentEmail && agentEmail.toLowerCase().trim() === email;

      for (const [dayStr, dayLogs] of Array.from(dayMap.entries())) {
        if (!dayLogs || dayLogs.length === 0) continue;
        totalEvents += dayLogs.length;

        const m = computeUnifiedActivityMetrics(dayLogs as any, {
          targetDailyHours,
          toleranceMinutes,
          scheduleStart,
          scheduleEnd,
          useMixedSchedule,
          daySchedules,
          appMappings,
        });

        const pc = m.pcWorkMs || 0;
        const man = m.manualJustificationMs || 0;
        const act = m.masterBuckets?.Productivo?.durationMs ?? (pc + man);
        const brk = m.masterBuckets?.Descanso?.durationMs || 0;
        const san = m.masterBuckets?.["Pausa Sanitaria"]?.durationMs || 0;
        const idl = m.masterBuckets?.Inactivo?.durationMs || 0;

        if (act > 0) daysWorked++;
        agPcMs += pc;
        agManualMs += man;
        agActiveMs += act;
        agBreakMs += brk;
        agSanitaryMs += san;
        agIdleMs += idl;

        if (isTargetAgent) {
          individualDailyBreakdown.push({
            date: dayStr,
            activeMs: act,
            pcWorkMs: pc,
            manualMs: man,
            breakMs: brk,
            sanitaryMs: san,
            idleMs: idl,
            score: m.productivityScore ?? 0,
            eventsCount: dayLogs.length,
          });

          // Agregar software del día
          if (Array.isArray(m.topSoftware)) {
            for (const s of m.topSoftware) {
              if (!individualSoftwareMap[s.name]) {
                individualSoftwareMap[s.name] = { durationMs: 0, count: 0, category: s.category };
              }
              individualSoftwareMap[s.name].durationMs += s.durationMs;
              individualSoftwareMap[s.name].count += s.count;
            }
          }
        }
      }

      teamPcMs += agPcMs;
      teamManualMs += agManualMs;
      teamActiveMs += agActiveMs;
      teamBreakMs += agBreakMs;
      teamSanitaryMs += agSanitaryMs;
      teamIdleMs += agIdleMs;

      const denom = agActiveMs + agIdleMs;
      const score = denom > 0 ? Math.round((agActiveMs / denom) * 100) : 0;

      agentBreakdown.push({
        email,
        name: agentNames.get(email) || email.split("@")[0],
        status: "offline", // se sobreescribe con el estado live del cliente
        activePcMs: agPcMs,
        activeManualMs: agManualMs,
        activeTotalMs: agActiveMs,
        breakMs: agBreakMs,
        sanitaryMs: agSanitaryMs,
        idleMs: agIdleMs,
        daysWorked,
        eventsCount: totalEvents,
        productivityScore: score,
      });
    }

    // Ordenar de mayor a menor tiempo activo
    agentBreakdown.sort((a, b) => b.activeTotalMs - a.activeTotalMs);

    const teamDenom = teamActiveMs + teamIdleMs;
    const teamScore = teamDenom > 0 ? Math.round((teamActiveMs / teamDenom) * 100) : 0;

    const teamTotals = {
      totalActiveMs: teamActiveMs,
      pcWorkMs: teamPcMs,
      manualJustificationMs: teamManualMs,
      totalBreakMs: teamBreakMs,
      totalSanitaryMs: teamSanitaryMs,
      totalIdleMs: teamIdleMs,
      productivityScore: teamScore,
      activeAgentsCount: agentBreakdown.filter((a) => a.activeTotalMs > 0).length,
      totalEvents: allLogs.length,
    };

    // Formatear software top para individual
    const topSoftwareList = Object.entries(individualSoftwareMap)
      .map(([name, val]) => ({
        name,
        durationMs: val.durationMs,
        count: val.count,
        category: val.category,
      }))
      .sort((a, b) => b.durationMs - a.durationMs)
      .slice(0, 10);

    const responseData = {
      success: true,
      startDate,
      endDate,
      totalLogs: allLogs.length,
      agentBreakdown,
      teamTotals,
      individualDailyBreakdown: individualDailyBreakdown.sort((a, b) => b.date.localeCompare(a.date)),
      topSoftware: topSoftwareList,
    };

    metricsCache.set(cacheKey, { data: responseData, expires: Date.now() + CACHE_TTL_MS });

    const res = NextResponse.json(responseData);
    res.headers.set("Cache-Control", "no-store, no-cache, must-revalidate");
    return res;
  } catch (err: any) {
    console.error("[api/activity/period-metrics] error:", err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
