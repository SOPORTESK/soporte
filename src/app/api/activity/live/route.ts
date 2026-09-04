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

    // 2. Obtener los últimos eventos de actividad de las últimas 24 horas
    const now = new Date();
    const oneDayAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000).toISOString();

    const { data: recentLogs, error: logErr } = await supabase
      .from("activity_log")
      .select("id, agent_email, agent_name, action, category, case_id, metadata, duration_ms, created_at")
      .gte("created_at", oneDayAgo)
      .order("created_at", { ascending: false })
      .limit(1000);

    if (logErr) throw logErr;

    // 3. Mapear estado en vivo por agente
    const todayStr = now.toISOString().split("T")[0];
    const liveAgents = (agents || []).map((ag) => {
      const email = ag.email.toLowerCase();
      const agLogs = (recentLogs || []).filter((l) => (l.agent_email || "").toLowerCase() === email);
      const latestLog = agLogs[0] || null;

      const todayLogs = agLogs.filter((l) => l.created_at && l.created_at.startsWith(todayStr));
      const sortedLogs = [...todayLogs].sort((a, b) => new Date(a.created_at!).getTime() - new Date(b.created_at!).getTime());

      let activeMs = 0;
      let idleMs = 0;
      const MAX_GAP = 10 * 60 * 1000; // 10 min max gap

      for (let i = 0; i < sortedLogs.length - 1; i++) {
        const curr = new Date(sortedLogs[i].created_at!).getTime();
        const next = new Date(sortedLogs[i + 1].created_at!).getTime();
        const gap = next - curr;
        if (gap > 0 && gap <= MAX_GAP) {
          const cat = sortedLogs[i].category || "";
          if (cat === "Inactividad" || cat === "Pausa personal") {
            idleMs += gap;
          } else {
            activeMs += gap;
          }
        }
      }

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