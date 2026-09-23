const { createClient } = require("@supabase/supabase-js");
const dotenv = require("dotenv");
const path = require("path");

dotenv.config({ path: path.join(__dirname, "..", ".env.local") });

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

const EVO_URL = process.env.EVOLUTION_API_URL || "";
const EVO_KEY = process.env.EVOLUTION_API_KEY || "";
const EVO_INSTANCE = process.env.EVOLUTION_INSTANCE || "";

async function sendWhatsApp(phone, text) {
  if (!EVO_URL || !EVO_KEY || !EVO_INSTANCE || !phone) return null;
  let to = String(phone).trim();
  if (!to.includes("@")) to = `${to.replace(/[^0-9]/g, "")}@s.whatsapp.net`;
  const endpoint = `${EVO_URL.replace(/\/$/, "")}/message/sendText/${encodeURIComponent(EVO_INSTANCE)}`;
  try {
    const res = await fetch(endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json", apikey: EVO_KEY },
      body: JSON.stringify({ number: to, text }),
    });
    if (res.ok) {
      const data = await res.json().catch(() => ({}));
      return data?.key?.id || "sent";
    }
  } catch (e) {
    console.error("[auto-close] Error enviando WhatsApp:", e.message);
  }
  return null;
}

async function runAutoClose() {
  try {
    // 1. Leer configuración oficial desde sek_app_settings
    const { data: settingsRows } = await supabase
      .from("sek_app_settings")
      .select("key, value")
      .in("key", ["auto_close_config", "daily_close_config"]);

    let config = {
      enabled: false,
      inactivity_minutes: 20,
      close_message: "Al no haber recibido respuesta, procederemos a cerrar esta conversación. Si necesita asistencia adicional, puede contactarnos nuevamente y con gusto le atenderemos. ¡Que tenga un excelente día!"
    };

    let dailyClose = {
      enabled: false,
      close_time: "17:15",
      message: "Estimado cliente, nuestra jornada de atención ha finalizado por hoy. Procedemos al cierre de esta sesión."
    };

    if (settingsRows && settingsRows.length > 0) {
      for (const row of settingsRows) {
        if (!row.value) continue;
        try {
          const parsed = typeof row.value === "string" ? JSON.parse(row.value) : row.value;
          if (row.key === "auto_close_config" && parsed) {
            config.enabled = Boolean(parsed.enabled);
            config.inactivity_minutes = Number(parsed.inactivity_minutes) || 20;
            config.close_message = parsed.close_message || config.close_message;
          } else if (row.key === "daily_close_config" && parsed) {
            dailyClose.enabled = Boolean(parsed.enabled);
            dailyClose.close_time = parsed.close_time || "17:15";
            dailyClose.message = parsed.message || dailyClose.message;
          }
        } catch {}
      }
    }

    // Si ambas funciones están desactivadas en el panel de gestión, no hacer nada
    if (!config.enabled && !dailyClose.enabled) return;

    // Evaluar cierre diario de fin de jornada (Costa Rica UTC-6)
    const nowObj = new Date();
    const utcH = nowObj.getUTCHours();
    const utcM = nowObj.getUTCMinutes();
    let crH = utcH - 6;
    if (crH < 0) crH += 24;
    const currentCrMin = crH * 60 + utcM;

    let isDailyCloseWindow = false;
    if (dailyClose.enabled && dailyClose.close_time) {
      const [dcH, dcM] = dailyClose.close_time.split(":").map(Number);
      const dcMin = (dcH || 17) * 60 + (dcM || 15);
      if (currentCrMin >= dcMin || crH < 5) {
        isDailyCloseWindow = true;
      }
    }

    const { data: casos, error } = await supabase
      .from("sek_cases")
      .select("id, canal, estado, histcliente, histtecnico, created_at, accepted_at, updated_at, assigned_to, customer_phone, cliente, auto_close_paused, tags")
      .in("estado", ["abierto", "ia_atendiendo"])
      .neq("canal", "simulator")
      .neq("es_test", true)
      .limit(50);

    if (error || !casos || casos.length === 0) return;

    const now = Date.now();
    const thresholdMs = config.inactivity_minutes * 60 * 1000;

    for (const caso of casos) {
      const canalLower = String(caso.canal || "").toLowerCase().trim();
      const clienteObj = typeof caso.cliente === "object" ? caso.cliente : {};
      const realPhone = clienteObj?.telefono_real || clienteObj?.telefono || caso.customer_phone || "";
      const tags = Array.isArray(caso.tags) ? caso.tags : [];
      const isReopen = tags.some(t => String(t).toLowerCase() === "re-open");
      const isSaliente = tags.some(t => String(t).toLowerCase() === "saliente");

      // 1. CIERRE POR FIN DE JORNADA (Prioridad absoluta: nadie queda abierto fuera del horario laboral)
      if (isDailyCloseWindow) {
        const msg = dailyClose.message;
        const entry = { role: "tecnico", content: msg, time: new Date().toISOString(), author: "Soporte Sekunet" };
        const newHist = [...(caso.histtecnico || []), entry];
        const { data: updated } = await supabase
          .from("sek_cases")
          .update({
            estado: "cerrado",
            closed_at: new Date().toISOString(),
            histtecnico: newHist,
            last_message_at: new Date().toISOString(),
            last_message_preview: msg.slice(0, 200)
          })
          .eq("id", caso.id)
          .eq("estado", caso.estado)
          .select("id");

        if (updated && updated.length > 0) {
          console.log(`[auto-close] Caso ${caso.id} cerrado por fin de jornada (${dailyClose.close_time}).`);
          if (canalLower === "whatsapp" && realPhone) {
            await sendWhatsApp(realPhone, msg);
          }
        }
        continue;
      }

      // 2. PROTECCIÓN DURANTE JORNADA LABORAL
      if (caso.auto_close_paused) continue;
      if (isSaliente) continue;

      // 3. CIERRE POR INACTIVIDAD SEGÚN TIEMPO CONFIGURADO EN EL PANEL
      if (!config.enabled) continue;

      const clientMsgs = (caso.histcliente || []).filter(m => m?.time && m?.role === "user");
      const lastClientTime = clientMsgs.length > 0 ? Math.max(...clientMsgs.map(m => new Date(m.time).getTime())) : 0;

      const agentMsgs = (caso.histtecnico || []).filter(m => m?.time && m?.role !== "nota");
      const lastAgentTime = agentMsgs.length > 0 ? Math.max(...agentMsgs.map(m => new Date(m.time).getTime())) : 0;

      // Si es un caso reabierto (re-open):
      // Se le da mayor margen de atención durante la jornada (mínimo 60 min),
      // pero si transcurre ese tiempo sin actividad de ninguna parte, se auto-cierra para no quedar abandonado.
      if (isReopen) {
        const reopenGraceMs = Math.max(thresholdMs * 2, 60 * 60 * 1000);
        const caseAcceptedTime = caso.accepted_at ? new Date(caso.accepted_at).getTime() : 0;
        const lastAnyActivity = Math.max(lastAgentTime, lastClientTime, caseAcceptedTime);

        if (lastAnyActivity > 0 && (now - lastAnyActivity) >= reopenGraceMs) {
          const msg = config.close_message;
          const entry = { role: "tecnico", content: msg, time: new Date().toISOString(), author: "Soporte Sekunet" };
          const newHist = [...(caso.histtecnico || []), entry];

          const { data: updated } = await supabase
            .from("sek_cases")
            .update({
              estado: "cerrado",
              closed_at: new Date().toISOString(),
              histtecnico: newHist,
              last_message_at: new Date().toISOString(),
              last_message_preview: msg.slice(0, 200),
            })
            .eq("id", caso.id)
            .eq("estado", caso.estado)
            .select("id");

          if (updated && updated.length > 0) {
            console.log(`[auto-close] Caso reabierto ${caso.id} cerrado por inactividad (${Math.round((now - lastAnyActivity) / 60000)} min >= ${Math.round(reopenGraceMs / 60000)} min).`);
            if (canalLower === "whatsapp" && realPhone) {
              await sendWhatsApp(realPhone, msg);
            }
          }
        }
        continue;
      }

      // Caso regular:
      // Si el agente nunca respondió, no cerrar por inactividad de cliente
      if (lastAgentTime === 0) continue;

      // Si el cliente respondió después del agente, el cliente está esperando respuesta -> NO cerrar
      if (lastClientTime > lastAgentTime) continue;

      // Respetar estrictamente los minutos configurados en el panel
      const elapsed = now - lastAgentTime;
      if (elapsed < thresholdMs) continue;

      // CERRAR DIRECTAMENTE CON EL MENSAJE OFICIAL (SIN ENCUESTAS DE NINGÚN TIPO)
      const msg = config.close_message;
      const entry = { role: "tecnico", content: msg, time: new Date().toISOString(), author: "Soporte Sekunet" };
      const newHist = [...(caso.histtecnico || []), entry];

      const { data: updated } = await supabase
        .from("sek_cases")
        .update({
          estado: "cerrado",
          closed_at: new Date().toISOString(),
          histtecnico: newHist,
          last_message_at: new Date().toISOString(),
          last_message_preview: msg.slice(0, 200),
        })
        .eq("id", caso.id)
        .eq("estado", caso.estado)
        .select("id");

      if (updated && updated.length > 0) {
        console.log(`[auto-close] Caso ${caso.id} cerrado por inactividad (${Math.round(elapsed / 60000)} min >= ${config.inactivity_minutes} min). Mensaje de cierre enviado.`);
        if (canalLower === "whatsapp" && realPhone) {
          await sendWhatsApp(realPhone, msg);
        }
      }
    }
  } catch (err) {
    console.error("[auto-close] Error en ciclo:", err.message);
  }
}

module.exports = { runAutoClose };
