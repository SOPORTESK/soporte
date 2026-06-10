import { createServiceClient } from "@/lib/supabase/service";

const CLOSE_MSG = "Al no haber recibido respuesta, procederemos a cerrar esta conversación. Si necesita asistencia adicional, puede contactarnos nuevamente y con gusto le atenderemos. ¡Que tenga un excelente día!";

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

export function startLocalCronJobs() {
  const isDev = process.env.NODE_ENV === "development";
  console.log(`[local-cron-bridge] Iniciando bridge local para retransmitir mensajes de auto-close e IA (isDev: ${isDev})...`);
  
  // Ejecutar cada 15 segundos
  setInterval(async () => {
    try {
      const EVO_URL = process.env.EVOLUTION_API_URL || "";
      const EVO_KEY = process.env.EVOLUTION_API_KEY || "";
      const EVO_INSTANCE = process.env.EVOLUTION_INSTANCE || "";

      if (!EVO_URL || !EVO_KEY || !EVO_INSTANCE) {
        // Silenciosamente retornar para no contaminar logs si no está configurado localmente
        return;
      }

      const supabase = createServiceClient();
      
      // Consultar casos de whatsapp pendientes o cerrados recientes
      const { data: cases, error } = await supabase
        .from("sek_cases")
        .select("id, canal, customer_phone, cliente, histcliente, histtecnico, estado")
        .eq("canal", "whatsapp")
        .order("updated_at", { ascending: false })
        .limit(50);

      if (error || !cases) return;

      for (const c of cases) {
        let changed = false;
        
        // 1. Revisar histtecnico (auto-close messages)
        const histTec = Array.isArray(c.histtecnico) ? [...c.histtecnico] : [];
        for (let i = 0; i < histTec.length; i++) {
          const m = histTec[i];
          if (m && m.role === "tecnico" && m.content === CLOSE_MSG && !m.messageId) {
            console.log(`[local-cron-bridge] Detectado mensaje de cierre auto-close pendiente para caso ${c.id}`);
            const phone = pickPhone(c);
            if (phone) {
              try {
                const endpoint = `${EVO_URL.replace(/\/$/, "")}/message/sendText/${encodeURIComponent(EVO_INSTANCE)}`;
                const res = await fetch(endpoint, {
                  method: "POST",
                  headers: { "Content-Type": "application/json", apikey: EVO_KEY },
                  body: JSON.stringify({ number: phone, text: CLOSE_MSG })
                });
                
                const resData = await res.json().catch(() => ({}));
                if (res.ok && resData?.key?.id) {
                  const msgId = resData.key.id;
                  histTec[i] = {
                    ...m,
                    messageId: msgId,
                    fromMe: true
                  };
                  changed = true;
                  console.log(`[local-cron-bridge] Mensaje de cierre enviado con éxito a ${phone}, id: ${msgId}`);
                } else {
                  console.error(`[local-cron-bridge] Error enviando mensaje de cierre a ${phone}:`, res.status, resData);
                }
              } catch (err: any) {
                console.error(`[local-cron-bridge] Excepción enviando mensaje de cierre a ${phone}:`, err.message);
              }
            }
          }
        }

        // 2. Revisar histcliente (IA agent messages)
        const histCli = Array.isArray(c.histcliente) ? [...c.histcliente] : [];
        for (let i = 0; i < histCli.length; i++) {
          const m = histCli[i];
          // Los mensajes de la IA se guardan con role: "assistant", author: "Asistente Sekunet" y sin messageId
          if (m && m.role === "assistant" && m.author === "Asistente Sekunet" && !m.messageId && m.content) {
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
                if (res.ok && resData?.key?.id) {
                  const msgId = resData.key.id;
                  histCli[i] = {
                    ...m,
                    messageId: msgId,
                    fromMe: true
                  };
                  changed = true;
                  console.log(`[local-cron-bridge] Mensaje de IA enviado con éxito a ${phone}, id: ${msgId}`);
                } else {
                  console.error(`[local-cron-bridge] Error enviando mensaje de IA a ${phone}:`, res.status, resData);
                }
              } catch (err: any) {
                console.error(`[local-cron-bridge] Excepción enviando mensaje de IA a ${phone}:`, err.message);
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
    }
  }, 15000);
}
