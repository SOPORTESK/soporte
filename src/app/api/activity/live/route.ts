import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/service";
import { computeUnifiedActivityMetrics } from "@/lib/activity-engine";

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

      const computed = computeUnifiedActivityMetrics(todayLogs as any[]);
      const activeMs = computed.masterBuckets.Productivo.durationMs;
      const idleMs = computed.masterBuckets.Inactivo.durationMs;
      const productivityScore = computed.productivityScore;

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