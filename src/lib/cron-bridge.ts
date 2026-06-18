import { createServiceClient } from "@/lib/supabase/service";

function pickPhone(c: any): string | null {
  if (typeof c?.cliente === "object") {
    const telReal = String(c.cliente?.telefono_real || "").trim();
    if (telReal) return telReal.includes("@") ? telReal : `${telReal.replace(/[^0-9]/g, "")}@s.whatsapp.net`;
  }
  const cust = (c?.customer_phone || "").toString().trim();
  if (cust) {
    if (cust.includes("@")) return cust;
    return `${cust.replace(/[^0-9]/g, "")}@s.whatsapp.net`;
  }
  if (typeof c?.cliente === "object") {
    const tel = String(c.cliente?.telefono || "").trim();
    if (tel) return tel.includes("@") ? tel : `${tel.replace(/[^0-9]/g, "")}@s.whatsapp.net`;
  }
  return null;
}

// Guarda en memoria: mensajes ya enviados por este proceso (caseId:time).
// Evita reenviar el mismo mensaje en cada tick si la confirmación no trae key.id.
const alreadySent = new Set<string>();
// Evita que dos ticks se solapen (setInterval no espera a que termine el anterior).
let running = false;

export function startLocalCronJobs() {
  const isDev = process.env.NODE_ENV === "development";
  console.log(`[local-cron-bridge] Iniciando bridge local para retransmitir mensajes de auto-close e IA (isDev: ${isDev})...`);
  
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
        .order("updated_at", { ascending: false })
        .limit(50);

      if (error || !cases) return;

      for (const c of cases) {
        let changed = false;
        
        // NOTA: El cron-bridge SOLO maneja mensajes del widget (histcliente).
        // Los mensajes de WhatsApp IA (histtecnico, role=ia) son enviados
        // directamente por route.ts a través de sendWhatsAppMessages.
        // Los mensajes de cierre (auto-close) son enviados por la Supabase
        // Edge Function auto-close directamente. No reenviar ninguno de esos aquí.

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
}
