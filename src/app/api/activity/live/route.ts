import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/service";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function GET(_req: NextRequest) {
  try {
    const supabase = createServiceClient();

    // 1. Obtener todos los agentes registrados (excluyendo bots y cuentas del sistema)
    const { data: agents, error: agentErr } = await supabase
      .from("sek_agent_config")
      .select("email, nombre, apellido, rol, avatar_url, modo_no_atendido, status, last_seen_at")
      .not("email", "ilike", "%system_prompt%")
      .not("email", "ilike", "%whatsapp_agent%")
      .not("email", "ilike", "%technician_assistant%")
      .not("rol", "in", '("bot","sistema")')
      .order("nombre", { ascending: true });

    if (agentErr) throw agentErr;

    // 2. Obtener los eventos de actividad del día de hoy
    const now = new Date();
    const todayStr = now.toISOString().split("T")[0];
    const startOfToday = `${todayStr}T00:00:00`;

    const { data: recentLogs, error: logErr } = await supabase
      .from("activity_log")
      .select("id, agent_email, agent_name, action, category, case_id, metadata, duration_ms, created_at")
      .gte("created_at", startOfToday)
      .order("created_at", { ascending: false })
      .limit(10000);

    if (logErr) throw logErr;

    // 3. Mapear estado en vivo por agente
    const liveAgents = (agents || []).map((ag) => {
      const email = ag.email.toLowerCase();
      const agLogs = (recentLogs || []).filter((l) => (l.agent_email || "").toLowerCase() === email);
      const latestLog = agLogs[0] || null;

      const todayLogs = agLogs.filter((l) => l.created_at && l.created_at.startsWith(todayStr));
      const sortedLogs = [...todayLogs].sort((a, b) => new Date(a.created_at!).getTime() - new Date(b.created_at!).getTime());

      let activeMs = 0;
      let idleMs = 0;

      // Recolectar intervalos y fusionar solapamientos
      const rawIntervals: { start: number; end: number }[] = [];
      const firstEventMs = sortedLogs.length > 0 ? new Date(sortedLogs[0].created_at!).getTime() : 0;

      for (let i = 0; i < sortedLogs.length; i++) {
        const item = sortedLogs[i];
        const currTime = new Date(item.created_at!).getTime();
        const nextTime = i < sortedLogs.length - 1 ? new Date(sortedLogs[i + 1].created_at!).getTime() : currTime + 60000;
        const gap = Math.max(0, nextTime - currTime);
        const meta = (item.metadata || {}) as Record<string, any>;
        const act = (item.action || "").toLowerCase();

        const isExplicitPause = meta.reason === "lock_screen" || meta.reason === "suspend" || item.category === "Pausa personal" || item.category === "Pausa Sanitaria" || item.category === "Descanso";
        if (isExplicitPause) {
          idleMs += Math.min(gap, 60 * 60 * 1000);
          continue;
        }

        const isManualStart = (act.startsWith("inició:") || act.startsWith("inicio:")) && (meta.manual || meta.task);
        const isManualEnd = (act.startsWith("terminó:") || act.startsWith("termino:")) && (meta.manual || meta.task);
        const isJustification = Boolean(meta.justification || item.category === "Justificación" || act.startsWith("justificación:") || act.startsWith("justificacion:"));

        if (isManualStart) {
          const dur = Math.min(gap, 4 * 60 * 60 * 1000);
          rawIntervals.push({ start: currTime, end: currTime + dur });
          continue;
        }

        if (isManualEnd || isJustification) {
          const discreteMs = Number(
            item.duration_ms ||
            (meta.duration_seconds ? meta.duration_seconds * 1000 : 0) ||
            (meta.minutes ? meta.minutes * 60000 : 0)
          ) || 0;
          const prev = i > 0 ? sortedLogs[i - 1] : null;
          const prevAct = (prev?.action || "").toLowerCase();
          const prevWasStart = prev && (prevAct.startsWith("inició:") || prevAct.startsWith("inicio:"));
          if (!prevWasStart && discreteMs > 0) {
            const dur = Math.min(discreteMs, 4 * 60 * 60 * 1000);
            const rStart = Math.max(firstEventMs, currTime - dur);
            rawIntervals.push({ start: rStart, end: currTime });
          }
          continue;
        }

        const ACTIVE_GAP_LIMIT = 5 * 60 * 1000;
        const dur = Math.min(gap > 0 ? gap : 60000, ACTIVE_GAP_LIMIT);
        rawIntervals.push({ start: currTime, end: currTime + dur });
        if (gap > ACTIVE_GAP_LIMIT) {
          idleMs += (gap - ACTIVE_GAP_LIMIT);
        }
      }

      // Consolidar intervalos sin duplicación ni solapamiento
      rawIntervals.sort((a, b) => a.start - b.start);
      const mergedIntervals: { start: number; end: number }[] = [];
      for (const interval of rawIntervals) {
        if (mergedIntervals.length === 0) {
          mergedIntervals.push({ start: interval.start, end: interval.end });
        } else {
          const last = mergedIntervals[mergedIntervals.length - 1];
          if (interval.start <= last.end) {
            last.end = Math.max(last.end, interval.end);
          } else {
            mergedIntervals.push({ start: interval.start, end: interval.end });
          }
        }
      }
      activeMs = mergedIntervals.reduce((sum, int) => sum + (int.end - int.start), 0);

      const totalMs = activeMs + idleMs;
      const productivityScore = totalMs > 0 ? Math.round((activeMs / totalMs) * 100) : 100;

      // Calcular estado online/away/offline
      let status: "active" | "away" | "idle" | "offline" = "offline";
      let currentApp = "Sin actividad reciente";
      let secondsAgo = 999999;

      if (latestLog && latestLog.created_at) {
        const logTime = new Date(latestLog.created_at).getTime();
        secondsAgo = Math.max(0, Math.floor((now.getTime() - logTime) / 1000));

        // Determinar app actual desde metadatos o acción
        const meta = (latestLog.metadata || {}) as Record<string, any>;
        currentApp = meta.app_name || meta.label || meta.page || latestLog.action || "Plataforma Sekunet";

        if (latestLog.category === "Inactividad" || secondsAgo > 600) {
          status = "offline";
        } else if (secondsAgo <= 180) {
          status = "active";
        } else {
          status = "away";
        }
      }

      const fullName = [ag.nombre, ag.apellido].filter(Boolean).join(" ") || ag.email;

      return {
        email: ag.email,
        name: fullName,
        role: ag.rol,
        avatar_url: ag.avatar_url,
        status,
        currentApp,
        secondsAgo,
        lastSeen: latestLog?.created_at || null,
        activeMinutes: Math.round(activeMs / 60000),
        idleMinutes: Math.round(idleMs / 60000),
        productivityScore,
        todayEventsCount: todayLogs.length,
        hasDesktopApp: todayLogs.some((l) => {
          const m = (l.metadata || {}) as Record<string, any>;
          return m.source === "desktop" || !!m.app_name;
        }),
      };
    });

    return NextResponse.json({
      ok: true,
      timestamp: now.toISOString(),
      agents: liveAgents,
    });
  } catch (err: any) {
    console.error("[api/activity/live] Error:", err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}