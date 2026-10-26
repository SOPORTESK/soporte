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

    // Evaluar horario de oficina en Costa Rica (UTC-6)
    // Horario laboral estándar: Lunes a Viernes de 07:30 a close_time (ej: 17:15).
    // Sábados y Domingos: cerrado las 24 horas.
    const crDateParts = new Intl.DateTimeFormat("en-US", {
      timeZone: "America/Costa_Rica",
      weekday: "short",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "numeric",
      minute: "numeric",
      hour12: false,
    }).formatToParts(nowObj);

    const getPart = (type) => crDateParts.find(p => p.type === type)?.value || "";
    const crWeekday = getPart("weekday"); // "Mon", "Tue", ..., "Sat", "Sun"
    const crTodayDateStr = `${getPart("year")}-${getPart("month")}-${getPart("day")}`;
    const crHour = Number(getPart("hour")) || 0;
    const crMinute = Number(getPart("minute")) || 0;
    const currentCrMin = crHour * 60 + crMinute;

    const isWeekend = crWeekday === "Sat" || crWeekday === "Sun";
    const [dcH, dcM] = (dailyClose.close_time || "17:15").split(":").map(Number);
    const dcMin = (dcH || 17) * 60 + (dcM || 15);
    const workStartMin = 7 * 60 + 30; // 07:30 a. m.

    // Fuera de jornada si es fin de semana, o si es antes de 07:30 am, o después de la hora de corte
    const isOutsideWorkHours = isWeekend || currentCrMin >= dcMin || currentCrMin < workStartMin;

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

      // Fecha del último mensaje del caso en hora de Costa Rica
      const lastMsgDate = new Date(caso.last_message_at || caso.created_at);
      const caseDateParts = new Intl.DateTimeFormat("en-US", {
        timeZone: "America/Costa_Rica",
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
      }).formatToParts(lastMsgDate);
      const getCasePart = (type) => caseDateParts.find(p => p.type === type)?.value || "";
      const caseDayDateStr = `${getCasePart("year")}-${getCasePart("month")}-${getCasePart("day")}`;
      const isFromPreviousDay = caseDayDateStr < crTodayDateStr;

      // 1. CIERRE POR FIN DE JORNADA (Prioridad absoluta: nadie queda abierto fuera del horario laboral ni de días anteriores)
      const shouldCloseByDayEnd = dailyClose.enabled && (isOutsideWorkHours || isFromPreviousDay);
      if (shouldCloseByDayEnd) {
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
          const reason = isFromPreviousDay ? "día anterior rezagado" : `fin de jornada (${dailyClose.close_time})`;
          console.log(`[auto-close] Caso ${caso.id} cerrado automáticamente por ${reason}.`);
          if (canalLower === "whatsapp" && realPhone) {
            await sendWhatsApp(realPhone, msg);
          }
          fetch(`http://localhost:3100/api/cases/${caso.id}/auto-extract`, { method: "POST" })
            .catch(err => console.warn(`[auto-close] Auto-extract error en ${caso.id}:`, err?.message));
        }
        continue;
      }

      // 2. PROTECCIÓN DURANTE JORNADA LABORAL
      if (caso.auto_close_paused) continue;
      if (isSaliente) continue;

      // 3. CIERRE POR INACTIVIDAD SEGÚN TIEMPO CONFIGURADO EN EL PANEL
      if (!config.enabled) continue;

      const clientMsgs = (caso.histcliente || []).filter(m => m?.time && m?.role === "user");
      const agentMsgs = (caso.histtecnico || []).filter(m => m?.time && m?.role !== "nota");

      // Si el agente nunca respondió, no cerrar por inactividad de cliente
      if (agentMsgs.length === 0) continue;

      // Unir y ordenar todos los mensajes conversacionales con el mismo criterio cronológico del chat (time + seq)
      const allMsgs = [
        ...clientMsgs.map(m => ({ ...m, isClient: true })),
        ...agentMsgs.map(m => ({ ...m, isClient: false }))
      ];

      allMsgs.sort((a, b) => {
        const ta = new Date(a.time).getTime();
        const tb = new Date(b.time).getTime();
        const va = isNaN(ta) ? 0 : ta;
        const vb = isNaN(tb) ? 0 : tb;
        const sa = typeof a.seq === "number" ? a.seq : undefined;
        const sb = typeof b.seq === "number" ? b.seq : undefined;
        if (sa !== undefined && sb !== undefined && Math.abs(va - vb) < 120000) {
          return sa - sb;
        }
        return va - vb;
      });

      const lastMsg = allMsgs[allMsgs.length - 1];
      if (!lastMsg) continue;

      // Si el último mensaje fue del cliente, el cliente está esperando respuesta -> NO cerrar
      if (lastMsg.isClient) continue;

      // Debe haber al menos una respuesta del agente humano (no solo IA de bienvenida)
      const hasHumanAgent = agentMsgs.some(m => m.role === "tecnico" && m.author !== "Soporte Sekunet");
      if (!hasHumanAgent && caso.estado !== "ia_atendiendo") continue;

      // Tiempo transcurrido desde el último mensaje del agente
      const lastAgentTime = new Date(lastMsg.time).getTime();
      const effectiveLastTime = Math.max(lastAgentTime, caso.accepted_at ? new Date(caso.accepted_at).getTime() : 0);
      const elapsed = now - effectiveLastTime;

      // Si es un caso reabierto (re-open):
      // Se le da mayor margen de atención durante la jornada (mínimo 60 min),
      // pero si transcurre ese tiempo sin actividad de ninguna parte, se auto-cierra para no quedar abandonado.
      if (isReopen) {
        const reopenGraceMs = Math.max(thresholdMs * 2, 60 * 60 * 1000);
        if (effectiveLastTime > 0 && elapsed >= reopenGraceMs) {
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
            console.log(`[auto-close] Caso reabierto ${caso.id} cerrado por inactividad (${Math.round(elapsed / 60000)} min >= ${Math.round(reopenGraceMs / 60000)} min).`);
            if (canalLower === "whatsapp" && realPhone) {
              await sendWhatsApp(realPhone, msg);
            }
            fetch(`http://localhost:3100/api/cases/${caso.id}/auto-extract`, { method: "POST" })
              .catch(err => console.warn(`[auto-close] Auto-extract error en ${caso.id}:`, err?.message));
          }
        }
        continue;
      }

      // Respetar estrictamente los minutos configurados en el panel
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
        fetch(`http://localhost:3100/api/cases/${caso.id}/auto-extract`, { method: "POST" })
          .catch(err => console.warn(`[auto-close] Auto-extract error en ${caso.id}:`, err?.message));
      }
    }
  } catch (err) {
    console.error("[auto-close] Error en ciclo:", err.message);
  }
}

module.exports = { runAutoClose };
