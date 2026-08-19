import { createServiceClient } from "@/lib/supabase/service";
import { pickPhone } from "@/lib/evolution-phone";

async function refreshDriveTokenDaily() {
  try {
    const supabase = createServiceClient();
    const { data } = await supabase
      .from("sek_drive_config")
      .select("refresh_token, updated_at")
      .eq("id", 1)
      .single();

    if (!data?.refresh_token) return;

    const lastUpdated = data.updated_at ? new Date(data.updated_at).getTime() : 0;
    const hoursSinceUpdate = (Date.now() - lastUpdated) / (1000 * 60 * 60);
    if (hoursSinceUpdate < 20) return;

    const res = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        refresh_token: data.refresh_token,
        client_id: process.env.GOOGLE_OAUTH_CLIENT_ID!,
        client_secret: process.env.GOOGLE_OAUTH_CLIENT_SECRET!,
        grant_type: "refresh_token",
      }),
    });

    if (res.ok) {
      await supabase
        .from("sek_drive_config")
        .update({ updated_at: new Date().toISOString() })
        .eq("id", 1);
      console.log("[drive-keepalive] Token de Google Drive refrescado correctamente.");
    } else {
      const errText = await res.text();
      console.warn("[drive-keepalive] No se pudo refrescar el token de Google Drive:", errText.substring(0, 200));
    }
  } catch (e: any) {
    console.warn("[drive-keepalive] Error:", e.message);
  }
}

// Guarda en memoria: mensajes ya enviados por este proceso (caseId:time).
// Evita reenviar el mismo mensaje en cada tick si la confirmación no trae key.id.
const alreadySent = new Set<string>();
// Evita que dos ticks se solapen (setInterval no espera a que termine el anterior).
let running = false;

export function startLocalCronJobs() {
  const isDev = process.env.NODE_ENV === "development";
  console.log(`[local-cron-bridge] Iniciando bridge local para retransmitir mensajes de auto-close e IA (isDev: ${isDev})...`);

  // Refresh del token de Google Drive cada hora (solo actúa si pasaron 20+ horas)
  setInterval(() => { refreshDriveTokenDaily(); }, 60 * 60 * 1000);
  // Ejecutar también al arrancar
  refreshDriveTokenDaily();

  // Ejecutar cada 15 segundos
  setInterval(async () => {
    if (running) return;
    running = true;
    try {
      const EVO_URL = process.env.EVOLUTION_API_URL || "";
      const EVO_KEY = process.env.EVOLUTION_API_KEY || "";
      const EVO_INSTANCE = process.env.EVOLUTION_INSTANCE || "";

      if (!EVO_URL || !EVO_KEY || !EVO_INSTANCE) {
        // Silenciosamente retornar para no contaminar logs si no está configurado localmente
        return;
      }

      const supabase = createServiceClient();
      
      // Consultar solo casos de whatsapp ABIERTOS (no cerrados/resueltos/escalados)
      // Los casos cerrados ya fueron atendidos por auto-close, no reenviar nada.
      const { data: cases, error } = await supabase
        .from("sek_cases")
        .select("id, canal, customer_phone, cliente, histcliente, histtecnico, estado")
        .eq("canal", "whatsapp")
        .not("estado", "in", '("cerrado","resuelto","escalado")')
        .neq("es_test", true)
        .order("updated_at", { ascending: false })
        .limit(50);

      if (error || !cases) return;

      for (const c of cases) {
        let changed = false;
        
        // NOTA: los mensajes de cierre (auto-close) son enviados directamente por la
        // Supabase Edge Function "auto-close". El cron-bridge NO debe reenviarlos
        // para evitar duplicados. Solo manejamos mensajes de la IA de Widget aquí.
        // Los mensajes de WhatsApp (histtecnico) son enviados por el Webhook de Vercel.

        const histTec = Array.isArray(c.histtecnico) ? [...c.histtecnico] : [];

        const histCli = Array.isArray(c.histcliente) ? [...c.histcliente] : [];
        for (let i = 0; i < histCli.length; i++) {
          const m = histCli[i];
          // Los mensajes de la IA se guardan con role: "assistant", author: "Asistente Sekunet" y sin messageId
          if (m && m.role === "assistant" && m.author === "Asistente Sekunet" && !m.messageId && m.content) {
            const guardKey = `ia:${c.id}:${m.time}`;
            if (alreadySent.has(guardKey)) continue;
            console.log(`[local-cron-bridge] Detectado mensaje de IA pendiente para caso ${c.id}`);
            const phone = pickPhone(c);
            if (phone) {
              try {
                const endpoint = `${EVO_URL.replace(/\/$/, "")}/message/sendText/${encodeURIComponent(EVO_INSTANCE)}`;
                const res = await fetch(endpoint, {
                  method: "POST",
                  headers: { "Content-Type": "application/json", apikey: EVO_KEY },
                  body: JSON.stringify({ number: phone, text: m.content })
                });
                
                const resData = await res.json().catch(() => ({}));
                // Marcar como enviado incluso si falla (ej. 400 Bad Request por nÃºmero invÃ¡lido)
                // para evitar loops infinitos DDoSeando la API.
                alreadySent.add(guardKey);
                if (res.ok) {
                  const msgId = resData?.key?.id || `local-${Date.now()}`;
                  histCli[i] = {
                    ...m,
                    messageId: msgId,
                    fromMe: true
                  };
                  changed = true;
                  console.log(`[local-cron-bridge] Mensaje de IA enviado con Ã©xito a ${phone}, id: ${msgId}`);
                } else {
                  console.error(`[local-cron-bridge] Error enviando mensaje de IA a ${phone}:`, res.status, resData);
                }
              } catch (err: any) {
                // Si hay excepciÃ³n de red, aÃºn asÃ­ lo marcamos para no trabar el thread indefinidamente
                alreadySent.add(guardKey);
                console.error(`[local-cron-bridge] ExcepciÃ³n enviando mensaje de IA a ${phone}:`, err.message);
              }
            }
          }
        }

        if (changed) {
          const { error: updateErr } = await supabase
            .from("sek_cases")
            .update({
              histtecnico: histTec,
              histcliente: histCli
            })
            .eq("id", c.id);
            
          if (updateErr) {
            console.error(`[local-cron-bridge] Error actualizando historial del caso ${c.id} en BD:`, updateErr.message);
          } else {
            console.log(`[local-cron-bridge] Caso ${c.id} actualizado con messageIds correspondientes.`);
          }
        }
      }
    } catch (e: any) {
      console.error("[local-cron-bridge] Error general en loop de bridge:", e.message);
    } finally {
      running = false;
    }
  }, 15000);

  // Cleanup de activity_log >60 días, 1 vez al día
  let lastCleanup = 0;
  setInterval(async () => {
    const now = Date.now();
    if (now - lastCleanup < 24 * 60 * 60 * 1000) return;
    lastCleanup = now;
    try {
      const { cleanupOldEvents } = await import("@/lib/activity-db");
      await cleanupOldEvents(60);
      console.log("[local-cron-bridge] Activity log cleanup completado (>60 días)");
    } catch (e: any) {
      console.error("[local-cron-bridge] Error en activity cleanup:", e.message);
    }
  }, 60 * 60 * 1000); // revisar cada hora

  // Generar reportes IA de actividad cada 10 minutos para todos los agentes
  let lastReportRun = 0;
  setInterval(async () => {
    // Solo en Vercel (producción cloud). En local, aunque sea NODE_ENV=production,
    // no correr para no saturar Supabase con consultas pesadas.
    if (!process.env.VERCEL) return;

    const now = Date.now();
    if (now - lastReportRun < 10 * 60 * 1000) return;
    lastReportRun = now;
    try {
      const supabase = createServiceClient();
      const today = new Date().toISOString().split("T")[0];

      // Obtener agentes activos (con actividad en los últimos 30 min)
      const { data: recentAgents } = await supabase
        .from("activity_log")
        .select("agent_email, agent_name")
        .gte("created_at", new Date(Date.now() - 30 * 60 * 1000).toISOString())
        .order("created_at", { ascending: false });

      if (!recentAgents || recentAgents.length === 0) return;

      // Agentes únicos
      const unique = new Map<string, string>();
      recentAgents.forEach((a: any) => {
        if (!unique.has(a.agent_email)) unique.set(a.agent_email, a.agent_name || a.agent_email);
      });

      console.log(`[local-cron-bridge] Generando reportes IA para ${unique.size} agentes activos`);

      for (const [email, name] of unique) {
        try {
          const res = await fetch(
            `${process.env.NEXT_PUBLIC_BASE_URL || "http://localhost:3100"}/api/activity/process`,
            {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ agent_email: email, agent_name: name, date: today }),
            }
          );
          const data = await res.json();
          console.log(`[local-cron-bridge] Reporte ${email}: ${data.provider || "fallback"}`);
        } catch (e: any) {
          console.error(`[local-cron-bridge] Error reporte ${email}:`, e.message);
        }
      }
    } catch (e: any) {
      console.error("[local-cron-bridge] Error en generación automática de reportes:", e.message);
    }
  }, 60 * 1000); // revisar cada 1 min, ejecuta cada 10 min
}
