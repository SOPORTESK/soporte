import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/service";
import { getEvolutionConfig } from "@/lib/evolution-config";

export const maxDuration = 60; // Evita el timeout de 10s en Vercel Hobby

const get = (obj: any, path: string) => path.split(".").reduce((o, k) => (o && o[k] !== undefined ? o[k] : undefined), obj);

// Map global para trackear mensajes procesados recientemente (evita duplicados)
const processedMessages = new Map<string, number>();
const DUPLICATE_WINDOW_MS = 30000; // 30 segundos

// Cola en memoria para operaciones de base de datos atómicas por usuario (evita sobreescribir histcliente)
const dbMutexMap = new Map<string, Promise<void>>();
async function atomicDbUpdate(jid: string, updateFn: () => Promise<void>) {
  const current = dbMutexMap.get(jid) || Promise.resolve();
  const next = current.then(updateFn).catch((e) => console.error("[evo-webhook] Error en atomicDbUpdate:", e));
  dbMutexMap.set(jid, next);
  await next;
}

function getMessageKey(jid: string | null | undefined, content: string | null | undefined, mediaUrl?: string): string {
  const key = mediaUrl ? `${jid}:${mediaUrl}` : `${jid}:${content?.slice(0, 50)}`;
  return key;
}

function isDuplicateMessage(jid: string | null | undefined, content: string | null | undefined, mediaUrl?: string): boolean {
  // No procesar como duplicado si no hay JID válido
  if (!jid) return false;
  
  const key = getMessageKey(jid, content, mediaUrl);
  const now = Date.now();
  const lastProcessed = processedMessages.get(key);
  
  if (lastProcessed && (now - lastProcessed) < DUPLICATE_WINDOW_MS) {
    console.log(`[evo-webhook] DUPLICADO IGNORADO: ${key}`);
    return true;
  }
  
  processedMessages.set(key, now);
  // Limpiar entradas antiguas
  for (const [k, v] of processedMessages) {
    if (now - v > DUPLICATE_WINDOW_MS) processedMessages.delete(k);
  }
  return false;
}

// Helper para enviar mensaje de texto por WhatsApp vía Evolution
async function sendWhatsAppText(phone: string, text: string, evoCfg: any, delayMs: number = 0): Promise<boolean> {
  try {
    if (!evoCfg?.url || !evoCfg?.apiKey || !evoCfg?.instance) {
      console.error("[evo-webhook] Evo config incompleta:", { url: !!evoCfg?.url, key: !!evoCfg?.apiKey, instance: !!evoCfg?.instance });
      return false;
    }
    const to = phone.toString().trim();
    const formattedTo = to.replace(/[^0-9]/g, "");
    const url = `${evoCfg.url.replace(/\/$/, "")}/message/sendText/${encodeURIComponent(evoCfg.instance)}`;
    console.log(`[evo-webhook] Enviando WhatsApp a ${formattedTo}:`, text.slice(0, 60) + "...");
    
    const payload: any = { number: formattedTo, text };
    if (delayMs > 0) {
      payload.delay = delayMs;
    }

    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json", apikey: evoCfg.apiKey },
      body: JSON.stringify(payload)
    });
    if (!res.ok) {
      const err = await res.text();
      console.error("[evo-webhook] Error sending text:", res.status, err);
      return false;
    }
    console.log("[evo-webhook] Mensaje enviado exitosamente");
    return true;
  } catch (e: any) {
    console.error("[evo-webhook] Exception sending text:", e.message);
    return false;
  }
}

// Helper para enviar listas interactivas por WhatsApp vía Evolution
async function sendWhatsAppList(phone: string, listData: any, evoCfg: any, delayMs: number = 0): Promise<boolean> {
  try {
    if (!evoCfg?.url || !evoCfg?.apiKey || !evoCfg?.instance) {
      return false;
    }
    const to = phone.toString().trim();
    const formattedTo = to.replace(/[^0-9]/g, "");
    const url = `${evoCfg.url.replace(/\/$/, "")}/message/sendList/${encodeURIComponent(evoCfg.instance)}`;
    console.log(`[evo-webhook] Enviando lista WhatsApp a ${formattedTo}:`, listData.title);

    const payload: any = { number: formattedTo, ...listData };
    if (delayMs > 0) {
      payload.delay = delayMs;
    }

    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json", apikey: evoCfg.apiKey },
      body: JSON.stringify(payload)
    });
    if (!res.ok) {
      const err = await res.text();
      console.error("[evo-webhook] Error sending list:", res.status, err);
      return false;
    }
    console.log("[evo-webhook] Lista enviada exitosamente");
    return true;
  } catch (e: any) {
    console.error("[evo-webhook] Exception sending list:", e.message);
    return false;
  }
}

// Helper para enviar estado de escribiendo (composing)
async function sendWhatsAppPresence(phone: string, evoCfg: any, presence: "composing" | "available" | "unavailable" = "composing"): Promise<boolean> {
  try {
    if (!evoCfg?.url || !evoCfg?.apiKey || !evoCfg?.instance) return false;
    const to = phone.toString().trim().replace(/[^0-9]/g, "");
    const url = `${evoCfg.url.replace(/\/$/, "")}/chat/sendPresence/${encodeURIComponent(evoCfg.instance)}`;
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json", apikey: evoCfg.apiKey },
      body: JSON.stringify({ number: to, presence, delay: 0 })
    });
    return res.ok;
  } catch (e: any) {
    console.error("[evo-webhook] Exception sending presence:", e.message);
    return false;
  }
}

// Enviar uno o varios mensajes con pausa entre ellos (simula conversación natural)
async function sendWhatsAppMessages(phone: string, reply: any | any[], evoCfg: any): Promise<void> {
  const messages = Array.isArray(reply) ? reply : [reply];
  for (let i = 0; i < messages.length; i++) {
    const msg = messages[i];
    if (!msg) continue;
    
    // Evolution API mostrará "escribiendo..." durante este tiempo
    const delayMs = 800;

    let sent = false;

    // Interceptar pregunta corta y convertirla en el menú de texto completo
    let text = typeof msg === "object" ? msg.content : msg;
    if (text && (text.includes("¿En relación con qué tema") || text.includes("¿En relación a qué tema"))) {
      text = "¿En relación con qué tema sería su consulta?\n\n1. Configuraciones\n2. Reset\n3. Desvinculación\n4. Firmware\n5. Software\n6. Licencias\n7. Otro\n\nResponda con el número o el nombre del tema.";
    }

    if (!text || !text.trim()) continue;

    if (typeof msg === "object" && msg.type === "list") {
      sent = await sendWhatsAppList(phone || "", msg.listData, evoCfg, delayMs);
    } else {
      sent = await sendWhatsAppText(phone || "", text, evoCfg, delayMs);
    }

    if (!sent) {
      console.error(`[evo-webhook] FALLÓ envío WhatsApp mensaje ${i + 1}/${messages.length}`);
    }

    // Breve pausa entre mensajes para mantener orden sin hacerlo lento
    if (i < messages.length - 1) {
      await new Promise(resolve => setTimeout(resolve, 600));
    }
  }
}

async function processIncomingReaction(supabase: any, targetMessageId: string, emoji: string | null, author: string) {
  console.log("[evo-webhook] Buscando mensaje para reacción en base de datos:", { targetMessageId, emoji, author });
  
  const { data: openCases } = await supabase
    .from("sek_cases")
    .select("id, histcliente, histtecnico")
    .not("estado", "in", '("cerrado","resuelto")')
    .limit(50);

  if (!openCases) return false;

  for (const c of openCases) {
    let updated = false;
    let historyType = "";
    let updatedHistory: any[] = [];

    // Buscar en histcliente
    const histCliente = Array.isArray(c.histcliente) ? c.histcliente : [];
    const idxCliente = histCliente.findIndex((m: any) => m.messageId === targetMessageId);
    if (idxCliente >= 0) {
      historyType = "histcliente";
      updatedHistory = [...histCliente];
      const msg = { ...updatedHistory[idxCliente] };
      const reactions = Array.isArray(msg.reactions) ? [...msg.reactions] : [];
      const existingIdx = reactions.findIndex((r: any) => r.author === author);
      if (emoji) {
        if (existingIdx >= 0) {
          reactions[existingIdx] = { emoji, author, time: new Date().toISOString() };
        } else {
          reactions.push({ emoji, author, time: new Date().toISOString() });
        }
      } else {
        if (existingIdx >= 0) reactions.splice(existingIdx, 1);
      }
      msg.reactions = reactions;
      updatedHistory[idxCliente] = msg;
      updated = true;
    }

    // Buscar en histtecnico
    if (!updated) {
      const histTecnico = Array.isArray(c.histtecnico) ? c.histtecnico : [];
      const idxTecnico = histTecnico.findIndex((m: any) => m.messageId === targetMessageId);
      if (idxTecnico >= 0) {
        historyType = "histtecnico";
        updatedHistory = [...histTecnico];
        const msg = { ...updatedHistory[idxTecnico] };
        const reactions = Array.isArray(msg.reactions) ? [...msg.reactions] : [];
        const existingIdx = reactions.findIndex((r: any) => r.author === author);
        if (emoji) {
          if (existingIdx >= 0) {
            reactions[existingIdx] = { emoji, author, time: new Date().toISOString() };
          } else {
            reactions.push({ emoji, author, time: new Date().toISOString() });
          }
        } else {
          if (existingIdx >= 0) reactions.splice(existingIdx, 1);
        }
        msg.reactions = reactions;
        updatedHistory[idxTecnico] = msg;
        updated = true;
      }
    }

    if (updated) {
      console.log(`[evo-webhook] Reacción actualizada con éxito en DB (${historyType}) para caso:`, c.id);
      const { error } = await supabase
        .from("sek_cases")
        .update({ [historyType]: updatedHistory })
        .eq("id", c.id);
      if (error) {
        console.error("[evo-webhook] Error actualizando caso con reacción:", error);
      }
      return true;
    }
  }
  return false;
}

// Procesar confirmación de lectura de mensajes
async function processReadReceipt(supabase: any, messageId: string): Promise<boolean> {
  console.log("[evo-webhook] Procesando confirmación de lectura para mensaje:", messageId);
  
  const { data: openCases } = await supabase
    .from("sek_cases")
    .select("id, histcliente, histtecnico")
    .not("estado", "in", '("cerrado","resuelto")')
    .limit(50);

  if (!openCases) return false;

  const now = new Date().toISOString();

  for (const c of openCases) {
    // Buscar en histtecnico (mensajes enviados por el agente)
    const histTecnico = Array.isArray(c.histtecnico) ? c.histtecnico : [];
    const idxTecnico = histTecnico.findIndex((m: any) => m.messageId === messageId);
    if (idxTecnico >= 0) {
      // Si ya tiene read_at, no actualizar
      if (histTecnico[idxTecnico].read_at) {
        console.log("[evo-webhook] Mensaje ya estaba leído:", messageId);
        return true;
      }
      
      const updatedHistory = [...histTecnico];
      updatedHistory[idxTecnico] = { ...updatedHistory[idxTecnico], read_at: now };
      
      const { error } = await supabase
        .from("sek_cases")
        .update({ histtecnico: updatedHistory })
        .eq("id", c.id);
      
      if (error) {
        console.error("[evo-webhook] Error actualizando read_at:", error);
        return false;
      }
      console.log(`[evo-webhook] Confirmación de lectura actualizada para mensaje ${messageId} en caso ${c.id}`);
      return true;
    }
  }
  return false;
}

function inferMimeFromExt(ext: string): string {
  const map: Record<string, string> = {
    "xml": "text/xml",
    "pdf": "application/pdf",
    "doc": "application/msword",
    "docx": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    "xls": "application/vnd.ms-excel",
    "xlsx": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    "csv": "text/csv",
    "txt": "text/plain",
    "png": "image/png",
    "jpg": "image/jpeg",
    "jpeg": "image/jpeg",
    "gif": "image/gif",
    "mp4": "video/mp4",
    "mp3": "audio/mpeg",
    "ogg": "audio/ogg",
    "wav": "audio/wav",
    "zip": "application/zip",
    "rar": "application/x-rar-compressed",
    "exe": "application/x-msdownload",
    "msi": "application/x-msi",
    "dmg": "application/x-apple-diskimage",
    "apk": "application/vnd.android.package-archive",
    "ipa": "application/octet-stream"
  };
  return map[ext.toLowerCase()] || "application/octet-stream";
}

const jidToPhone = (jid?: string | null) => {
  if (!jid) return null;
  let s = String(jid).trim();
  s = s.split("@")[0].split(":")[0];
  const num = s.replace(/[^0-9]/g, "");
  return (num.length >= 8 && num.length <= 15) ? num : null;
};

async function resolveLidToPhone(lidJid: string, evoUrl: string, evoKey: string, evoInstance: string): Promise<string | null> {
  try {
    if (!evoUrl || !evoKey || !evoInstance) {
      console.warn("[evo-webhook] No se puede resolver LID, variables de entorno faltantes.");
      return null;
    }
    const url = `${evoUrl.replace(/\/$/, "")}/chat/findContacts/${encodeURIComponent(evoInstance)}`;
    console.log("[evo-webhook] Intentando resolver LID a Teléfono:", lidJid, "en", url);
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json", apikey: evoKey },
      body: JSON.stringify({ where: { id: lidJid } })
    });
    if (!res.ok) {
      console.error("[evo-webhook] Error resolviendo LID:", res.status);
      return null;
    }
    const contacts = await res.json().catch(() => []);
    if (Array.isArray(contacts) && contacts.length > 0) {
      const contact = contacts.find((c: any) => c && (c.remoteJid === lidJid || c.id === lidJid));
      if (contact) {
        const pn = get(contact, "pnJid") || get(contact, "phoneNumber") || get(contact, "number");
        const phone = jidToPhone(pn);
        if (phone) {
          console.log("[evo-webhook] LID resuelto con éxito a PN:", phone);
          return phone;
        }
      } else {
        console.warn("[evo-webhook] No se encontró el contacto buscado en la lista devuelta.");
      }
    }
  } catch (e: any) {
    console.error("[evo-webhook] Excepción al resolver LID:", e?.message);
  }
  return null;
}

async function extractJid(payload: any, evoUrl: string, evoKey: string, evoInstance: string): Promise<string | null> {
  const selfJids = [
    get(payload, "data.wuid"),
    get(payload, "instance.wuid"),
    get(payload, "wuid"),
    get(payload, "instance.user"),
    get(payload, "data.instance.user"),
    "50662777500@s.whatsapp.net", // Tu bot
    "50662777500:1@s.whatsapp.net"
  ];

  let rawJid: string | null = null;
  const msg = get(payload, "data.messages.0");
  
  // Buscar pnJid en otros campos
  let possiblePnJid = get(msg, "verifiedBizName") || get(payload, "data.pnJid");

  if (msg) {
    const fromMe = !!get(msg, "key.fromMe");
    const remoteJid = get(msg, "key.remoteJid") || get(msg, "remoteJid");
    const participant = get(msg, "key.participant") || get(msg, "participant");
    
    const isSelf = (target: string, sj: string) => {
      if (!sj || !target) return false;
      const t = String(target).split('@')[0].split(':')[0];
      const s = String(sj).split('@')[0].split(':')[0];
      return t === s;
    };

    if (fromMe) {
      // Mensaje saliente: el JID relevante es el destinatario (remoteJid)
      if (remoteJid && !selfJids.some(sj => isSelf(remoteJid, sj))) {
        rawJid = remoteJid;
      }
    } else if (participant && !selfJids.some(sj => isSelf(participant, sj))) {
      rawJid = participant;
    } else if (remoteJid && !selfJids.some(sj => isSelf(remoteJid, sj))) {
      rawJid = remoteJid;
    }
  }

  if (!rawJid) {
    const candidates = [
      get(payload, "data.key.remoteJid"),
      get(payload, "key.remoteJid"),
      get(payload, "remoteJid"),
      get(payload, "data.from"),
      get(payload, "from"),
      get(payload, "data.participant"),
      get(payload, "participant")
    ];
    
    const isSelf = (target: string, sj: string) => {
      if (!sj || !target) return false;
      const t = String(target).split('@')[0].split(':')[0];
      const s = String(sj).split('@')[0].split(':')[0];
      return t === s;
    };

    for (const c of candidates) {
      if (c && !selfJids.some(sj => isSelf(c, sj))) {
        rawJid = c;
        break;
      }
    }
  }

  if (!rawJid) return null;

  // Si es un LID (Linked Identity), intentamos resolverlo al JID real (@s.whatsapp.net)
  if (String(rawJid).endsWith("@lid")) {
    if (possiblePnJid && String(possiblePnJid).endsWith("@s.whatsapp.net")) {
      console.log("[evo-webhook] LID resuelto por payload alternativo a JID real:", possiblePnJid);
      return possiblePnJid;
    }
    
    try {
      if (evoUrl && evoKey && evoInstance) {
        const url = `${evoUrl.replace(/\/$/, "")}/chat/findContacts/${encodeURIComponent(evoInstance)}`;
        const res = await fetch(url, {
          method: "POST",
          headers: { "Content-Type": "application/json", apikey: evoKey },
          body: JSON.stringify({ where: { id: rawJid } })
        });
        if (res.ok) {
          const contacts = await res.json().catch(() => []);
          if (Array.isArray(contacts) && contacts.length > 0) {
            const contact = contacts.find((c: any) => c && (c.remoteJid === rawJid || c.id === rawJid));
            if (contact) {
              const pnJid = get(contact, "pnJid");
              if (pnJid && String(pnJid).endsWith("@s.whatsapp.net")) {
                console.log("[evo-webhook] LID resuelto con éxito a JID real:", pnJid);
                return pnJid;
              }
            }
          }
        }
      }
    } catch (e: any) {
      console.error("[evo-webhook] Error resolviendo LID en extractJid:", e?.message);
    }
  }

  return rawJid;
}

function extractText(payload: any): string | null {
  const get = (obj: any, path: string) => path.split(".").reduce((o, k) => (o && o[k] !== undefined ? o[k] : undefined), obj);
  const fields = [
    "message.conversation",
    "message.extendedTextMessage.text",
    "text",
    "body",
    "message.imageMessage.caption",
    "message.videoMessage.caption",
    "data.message.conversation",
    "data.message.extendedTextMessage.text",
    // Baileys messages.upsert style (array)
    "data.messages.0.message.conversation",
    "data.messages.0.message.extendedTextMessage.text",
    "data.messages.0.message.imageMessage.caption",
    "data.messages.0.message.videoMessage.caption",
    // Ephemeral wrapper
    "data.messages.0.message.ephemeralMessage.message.conversation",
    "data.messages.0.message.ephemeralMessage.message.extendedTextMessage.text",
    "data.messages.0.message.ephemeralMessage.message.imageMessage.caption",
    "data.messages.0.message.ephemeralMessage.message.videoMessage.caption",
    // ptvMessage (video note / "videito circular")
    "data.messages.0.message.ptvMessage.caption",
    "message.ptvMessage.caption",
    "data.message.ptvMessage.caption",
    // viewOnceMessage with video
    "data.messages.0.message.viewOnceMessage.message.videoMessage.caption",
    "message.viewOnceMessage.message.videoMessage.caption",
    "data.message.viewOnceMessage.message.videoMessage.caption",
    // documentWithCaptionMessage (video sent as document with caption)
    "data.messages.0.message.documentWithCaptionMessage.message.caption",
    "message.documentWithCaptionMessage.message.caption",
    "data.message.documentWithCaptionMessage.message.caption",
  ];
  for (const f of fields) {
    const v = get(payload, f);
    if (typeof v === "string" && v.trim()) return v.trim();
  }
  try {
    if (typeof payload?.message === "string" && payload.message.trim()) return payload.message.trim();
  } catch {}
  return null;
}

export async function POST(req: NextRequest) {
  console.log("[evo-webhook] === INICIO WEBHOOK ===");
  const supabase = createServiceClient();
  let payload: any = null;
  try { payload = await req.json(); } catch { payload = null; }
  console.log("[evo-webhook] Payload recibido, event:", payload?.event);

  console.log("[evo-webhook] Paso 1: getEvolutionConfig...");
  const evoCfg = await getEvolutionConfig();
  const EVO_URL = evoCfg.url;
  const EVO_KEY = evoCfg.apiKey;
  const EVO_INSTANCE = evoCfg.instance;
  console.log("[evo-webhook] Paso 1 OK - Evo config:", { url: EVO_URL, instance: EVO_INSTANCE, keyPresente: !!EVO_KEY });

  console.log("[evo-webhook] Paso 2: extractText...");
  let text = extractText(payload);
  console.log("[evo-webhook] Paso 2 OK - text:", text?.slice(0, 50));

  // DEBUG: si no hay texto, guardar payload crudo para diagnosticar videos/media que no se detectan
  if (!text) {
    try {
      const msgObjDbg = get(payload, "data.messages.0.message") || get(payload, "data.message") || get(payload, "message");
      const msgKeys = msgObjDbg ? Object.keys(msgObjDbg) : [];
      const debugEntry = {
        event: payload?.event,
        time: new Date().toISOString(),
        msgKeys,
        dataKeys: payload?.data ? Object.keys(payload.data) : [],
        hasKey: !!payload?.data?.key,
        hasMessage: !!payload?.data?.message,
        messageType: payload?.data?.messageType || payload?.data?.messages?.[0]?.messageType,
      };
      await supabase.from("sek_app_settings").upsert({
        key: "debug_last_notext",
        value: JSON.stringify(debugEntry),
        updated_at: new Date().toISOString(),
      });
    } catch {}
  }

  // FILTRAR TYPOS: Ignorar mensajes que sean un solo carácter no alfanumérico (ej: "}", "{", "]", etc.)
  if (text && text.trim().length === 1 && !/^[a-zA-Z0-9áéíóúÁÉÍÓÚñÑ¿?¡!]$/.test(text.trim())) {
    console.log(`[evo-webhook] Ignorando mensaje por posible typo: "${text.trim()}"`);
    return NextResponse.json({ ok: true, skipped: "typo" });
  }

  console.log("[evo-webhook] Paso 3: extractJid...");
  const jid = await extractJid(payload, EVO_URL, EVO_KEY, EVO_INSTANCE);
  console.log("[evo-webhook] Paso 3 OK - jid:", jid);

  // Ignorar mensajes de grupos de WhatsApp
  if (jid && String(jid).endsWith("@g.us")) {
    console.log(`[evo-webhook] Ignorando mensaje de grupo: ${jid}`);
    return NextResponse.json({ ok: true, skipped: "group" });
  }

  console.log("[evo-webhook] Paso 4: jidToPhone...");
  const phone = jidToPhone(jid);
  console.log("[evo-webhook] Paso 4 OK - phone:", phone);

  const msgObj = get(payload, "data.messages.0.message") || get(payload, "data.message") || get(payload, "message");
  // Unwrap ephemeral/viewOnce wrappers to get the real media object
  const unwrappedMsgObj = msgObj?.ephemeralMessage?.message || msgObj?.viewOnceMessage?.message || msgObj?.documentWithCaptionMessage?.message || msgObj;
  const dupMediaUrl = msgObj?.imageMessage?.url || msgObj?.videoMessage?.url || msgObj?.ptvMessage?.url || unwrappedMsgObj?.videoMessage?.url || msgObj?.documentMessage?.url;
  
  console.log("[evo-webhook] Paso 5: verificar duplicado...");
  if (isDuplicateMessage(jid, text, dupMediaUrl)) {
    console.log("[evo-webhook] Paso 5: DUPLICADO, saliendo");
    return NextResponse.json({ ok: true, duplicate: true });
  }
  console.log("[evo-webhook] Paso 5 OK - no es duplicado");

  if (!payload) return NextResponse.json({ ok: true });

  const event = String(payload?.event || "").toUpperCase();

  // 1. Interceptar eventos dedicados de Reacciones de Evolution (SEND_REACTION)
  if (event === "SEND_REACTION") {
    const reaction = payload?.data?.reaction || payload?.reaction;
    const key = payload?.data?.key || payload?.key;
    const targetMessageId = key?.id;
    const emoji = reaction?.text;
    const sender = payload?.data?.key?.participant || payload?.data?.sender || payload?.sender;
    const author = jidToPhone(sender) || sender || "WhatsApp";

    console.log("[evo-webhook] Recibido evento SEND_REACTION:", { targetMessageId, emoji, author });
    if (targetMessageId) {
      await processIncomingReaction(supabase, targetMessageId, emoji, author);
    }
    return NextResponse.json({ ok: true });
  }

  // 2. Interceptar eventos de actualización (MESSAGES_UPDATE) para reacciones Y confirmaciones de lectura
  if (event === "MESSAGES_UPDATE") {
    const updates = payload?.data;
    if (Array.isArray(updates)) {
      for (const item of updates) {
        const reactions = item.update?.reactions;
        const status = item.update?.status || item.status;
        const targetMessageId = item.key?.id || item.messageId || item.keyId;

        // Procesar reacciones
        if (Array.isArray(reactions) && targetMessageId) {
          console.log("[evo-webhook] Recibido evento MESSAGES_UPDATE con reacciones:", { targetMessageId, count: reactions.length });
          for (const r of reactions) {
            const emoji = r.text;
            const sender = r.key?.participant || r.key?.remoteJid;
            const author = jidToPhone(sender) || sender || "WhatsApp";
            await processIncomingReaction(supabase, targetMessageId, emoji, author);
          }
        }

        // Procesar confirmación de lectura (READ) o entrega (DELIVERY_ACK)
        if (targetMessageId && (status === "READ" || status === "DELIVERY_ACK")) {
          console.log("[evo-webhook] Recibido evento de lectura/entrega:", { targetMessageId, status, fromMe: item.key?.fromMe });
          // Solo procesar si es un mensaje saliente (fromMe: true) - mensajes enviados por nosotros
          if (item.key?.fromMe || item.fromMe) {
            await processReadReceipt(supabase, targetMessageId);
          }
        }
      }
    }
    return NextResponse.json({ ok: true });
  }

  // 3. Interceptar reacción incrustada en mensaje normal (MESSAGES_UPSERT)
  const upsertMsgObj = get(payload, "data.messages.0.message") || get(payload, "data.message") || get(payload, "message");
  const reactionMsg = upsertMsgObj?.reactionMessage || payload?.data?.message?.reactionMessage || payload?.message?.reactionMessage;

  if (reactionMsg) {
    const targetMessageId = reactionMsg.key?.id;
    const emoji = reactionMsg.text;
    const sender = payload?.data?.messages?.[0]?.key?.participant || payload?.data?.messages?.[0]?.key?.remoteJid;
    const author = jidToPhone(sender) || sender || "WhatsApp";

    console.log("[evo-webhook] Recibido reactionMessage en UPSERT:", { targetMessageId, emoji, author });
    if (targetMessageId) {
      await processIncomingReaction(supabase, targetMessageId, emoji, author);
    }
    return NextResponse.json({ ok: true });
  }

  // ANTI-BUCLE: si fromMe=true, es respuesta enviada por nosotros (ej. la IA) — salir de inmediato
  const rawFromMe = !!(
    payload?.data?.key?.fromMe ||
    payload?.key?.fromMe ||
    payload?.data?.messages?.[0]?.key?.fromMe ||
    payload?.data?.message?.key?.fromMe ||
    payload?.message?.key?.fromMe ||
    payload?.data?.fromMe ||
    payload?.fromMe
  );
  if (rawFromMe) {
    console.log("[evo-webhook] fromMe=true — mensaje propio, ignorado para evitar bucle");
    return NextResponse.json({ ok: true, skipped: "fromMe" });
  }

  // Detectar si es un mensaje saliente (enviado desde nuestro número)
  let isOutgoing = false;
  try {
    const fromMe = rawFromMe;
    const pushNameRaw = get(payload, "data.pushName") || 
                        get(payload, "pushName") || 
                        payload?.data?.messages?.[0]?.pushName ||
                        payload?.data?.message?.pushName;
    const isBotName = pushNameRaw && /^(Soporte Sekunet|Asistente Sekunet|Sekunet)$/i.test(pushNameRaw);
    const participant = get(payload, "data.key.participant") || 
                        get(payload, "key.participant") || 
                        payload?.data?.messages?.[0]?.key?.participant || 
                        payload?.data?.message?.key?.participant ||
                        "";
    const instanceUser = get(payload, "instance.user") || 
                         get(payload, "data.instance.user") || 
                         get(payload, "wuid") || 
                         get(payload, "data.wuid") || 
                         "";
    const officialPhone = jidToPhone(instanceUser) || "50662777500";
    const participantPhone = jidToPhone(participant);
    const isOfficialNumber = !!(participantPhone && participantPhone === officialPhone);
    isOutgoing = !!(fromMe || isBotName || isOfficialNumber);
  } catch {}

  
  let mediaType = "";
  let originalFileName = "";
  if (msgObj) {
    if (msgObj.audioMessage) mediaType = "audio";
    else if (msgObj.imageMessage) mediaType = "image";
    else if (msgObj.videoMessage) mediaType = "video";
    else if (msgObj.ptvMessage) mediaType = "video"; // video note ("videito circular")
    else if (msgObj.viewOnceMessage?.message?.videoMessage) mediaType = "video";
    else if (msgObj.viewOnceMessage?.message?.imageMessage) mediaType = "image";
    else if (msgObj.ephemeralMessage?.message?.videoMessage) mediaType = "video";
    else if (msgObj.ephemeralMessage?.message?.imageMessage) mediaType = "image";
    else if (msgObj.ephemeralMessage?.message?.audioMessage) mediaType = "audio";
    else if (msgObj.documentWithCaptionMessage?.message) {
      // Document with caption — could be video, image, or other
      const docMsg = msgObj.documentWithCaptionMessage.message;
      if (docMsg.mimetype?.startsWith("video/")) mediaType = "video";
      else if (docMsg.mimetype?.startsWith("image/")) mediaType = "image";
      else if (docMsg.mimetype?.startsWith("audio/")) mediaType = "audio";
      else mediaType = "document";
      originalFileName = docMsg.fileName || docMsg.title || "";
    }
    else if (msgObj.documentMessage) {
      const docMime = msgObj.documentMessage.mimetype || "";
      if (docMime.startsWith("video/")) mediaType = "video";
      else if (docMime.startsWith("image/")) mediaType = "image";
      else if (docMime.startsWith("audio/")) mediaType = "audio";
      else mediaType = "document";
      originalFileName = msgObj.documentMessage.fileName || msgObj.documentMessage.title || "";
    }
    else if (msgObj.stickerMessage) mediaType = "sticker";
    else {
      console.log("[evo-webhook] msgObj keys sin mediaType detectado:", msgObj ? Object.keys(msgObj) : "null");
    }
  }

  // Si es un archivo pero no tiene texto, poner un placeholder para que no lo ignore
  if (!text && mediaType) {
    text = `[Archivo adjunto: ${mediaType}]`;
  }

  const senderPnRaw = get(payload, "data.messages.0.senderPn") || 
                      get(payload, "data.senderPn") || 
                      get(payload, "senderPn") ||
                      (Array.isArray(payload?.data) ? get(payload?.data[0], "senderPn") : undefined);
  const senderPn = senderPnRaw ? String(senderPnRaw).replace(/[^0-9]/g, "") : null;

  console.log("[evo-webhook]", { 
    event: payload?.event, 
    jid,
    phone, 
    senderPn,
    text: (text || "").slice(0, 40),
    mediaType,
    isOutgoing
  });

  if (!jid) {
    console.log("[evo-webhook] JID es null, intentando extraer de más campos...");
    // Log detallado del payload para debuggear
    const debugPayload = {
      event: payload?.event,
      dataKeys: payload?.data ? Object.keys(payload.data) : null,
      messageKeys: payload?.data?.message ? Object.keys(payload.data.message) : null,
      keys0: payload?.data?.messages?.[0]?.key,
      remoteJid: payload?.data?.remoteJid,
      sender: payload?.data?.sender,
      from: payload?.data?.from,
      instance: payload?.instance,
      wuid: payload?.data?.wuid || payload?.wuid,
    };
    console.log("[evo-webhook-debug] Estructura del payload:", JSON.stringify(debugPayload, null, 2));
    return NextResponse.json({ ok: true, error: "no_jid" });
  }

  // EXCEPCIÓN: Si viene pushName o senderPn en cualquier evento (ej. contacts.update), actualizamos el cliente
  const pushNameRaw = get(payload, "data.pushName") || get(payload, "pushName") || 
                   (Array.isArray(payload?.data) ? get(payload?.data[0], "pushName") : undefined);
  const pushName = (pushNameRaw === "Você" || pushNameRaw === "Tú") ? null : pushNameRaw;

  if (pushName || senderPn) {
    try {
      const searchPhone = phone || senderPn || jid;
      const { data: existing } = await supabase
        .from("sek_cases")
        .select("id, cliente, title")
        .eq("canal", "whatsapp")
        .eq("customer_phone", searchPhone)
        .not("estado", "in", '("cerrado","resuelto")')
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();

      if (existing) {
        const currentCliente = (existing.cliente && typeof existing.cliente === "object") ? existing.cliente : {};
        const updatedCliente = { 
          ...currentCliente, 
          whatsapp_name: pushName || currentCliente.whatsapp_name,
          telefono_real: senderPn || currentCliente.telefono_real
        };
        await supabase
          .from("sek_cases")
          .update({ 
            cliente: updatedCliente,
            title: pushName ? `WhatsApp — ${pushName}` : existing.title
          })
          .eq("id", existing.id);
        console.log(`[evo-webhook] Cliente actualizado: pushName=${pushName}, senderPn=${senderPn} para JID: ${jid}`);
      }
    } catch (err: any) {
      console.error("[evo-webhook] Error actualizando datos de cliente:", err.message);
    }
  }

  if (!text && !mediaType) return NextResponse.json({ ok: true });

  let mediaUrl = "";
  let finalMediaType = mediaType;
  let fileName = "";

  if (mediaType) {
    console.log("[evo-webhook] media detectada", mediaType);
  }

  if (mediaType && EVO_URL && EVO_KEY && EVO_INSTANCE) {
    try {
      // Evolution manda el mensaje completo en payload.data (con key + message)
      // payload.data YA tiene la estructura { key, pushName, message, messageType, ... }
      const messageToExtract = payload?.data;
      if (!messageToExtract || !messageToExtract.key || !messageToExtract.message) {
        console.error("[evo-webhook] payload.data no tiene key+message, no se puede extraer base64", { hasData: !!payload?.data, hasKey: !!messageToExtract?.key, hasMessage: !!messageToExtract?.message });
        return NextResponse.json({ ok: true }); // salir sin llamar a Evolution para evitar 400
      }
      console.log("[evo-webhook] solicitando base64 a Evolution", { mediaType, hasKey: !!messageToExtract.key, hasMessage: !!messageToExtract.message });
      const b64Res = await fetch(`${EVO_URL.replace(/\/$/, "")}/chat/getBase64FromMediaMessage/${encodeURIComponent(EVO_INSTANCE)}`, {
        method: "POST",
        headers: { "Content-Type": "application/json", apikey: EVO_KEY },
        body: JSON.stringify({ message: messageToExtract })
      });
      if (!b64Res.ok) {
        const body = await b64Res.text().catch(() => "<no-body>");
        console.error("[evo-webhook] getBase64FromMediaMessage NO OK", b64Res.status, body.slice(0, 500));
        if (messageToExtract) {
          try {
            console.error("[evo-webhook] mensaje enviado a getBase64", JSON.stringify(messageToExtract).slice(0, 2000));
          } catch {}
        }
      } else {
        const b64Data = await b64Res.json().catch(() => null);
        console.log("[evo-webhook] respuesta getBase64", b64Data);
        const base64 = b64Data?.base64;
        if (!base64) {
          console.error("[evo-webhook] getBase64FromMediaMessage sin base64 en respuesta", b64Data);
          if (messageToExtract) {
            try {
              console.error("[evo-webhook] mensaje enviado a getBase64", JSON.stringify(messageToExtract).slice(0, 2000));
            } catch {}
          }
        }
        if (base64) {
          let dataStr = "";
          let mime = b64Data?.mimetype || "application/octet-stream";
          let ext = mime.split("/")[1]?.split(";")[0] || "bin";

          if (base64.includes(",")) {
            const [prefix, rest] = base64.split(",");
            dataStr = rest || "";
            if (!b64Data?.mimetype) {
              mime = prefix.split(":")[1]?.split(";")[0] || "application/octet-stream";
              ext = mime.split("/")[1]?.split(";")[0] || "bin";
            }
          } else {
            // Base64 sin cabecera
            dataStr = base64;
            if (!b64Data?.mimetype) {
              if (mediaType === "sticker") { mime = "image/webp"; ext = "webp"; }
              else if (mediaType === "image") { mime = "image/jpeg"; ext = "jpg"; }
              else if (mediaType === "video") { mime = "video/mp4"; ext = "mp4"; }
              else if (mediaType === "audio") { mime = "audio/ogg"; ext = "ogg"; }
              else if (mediaType === "document") { mime = "application/pdf"; ext = "pdf"; }
              else { mime = "application/octet-stream"; ext = "bin"; }
            }
          }

          // Limpiado el bloque de xml quemado, ahora usamos inferMimeFromExt
          console.log("[evo-webhook] base64 recibido", { mime, base64Length: base64.length });

          let finalExt = ext;
          if (originalFileName && originalFileName.includes(".")) {
             finalExt = originalFileName.split(".").pop() || ext;
             // Si el webhook no traía mime específico o era genérico, adivinamos por la extensión original
             if (!b64Data?.mimetype || b64Data.mimetype === "application/octet-stream") {
               mime = inferMimeFromExt(finalExt);
             }
          }

          const buffer = Buffer.from(dataStr, "base64");
          fileName = `${Date.now()}_${phone || "media"}.${finalExt}`;
          
          const { data: uploadData, error: uploadErr } = await supabase.storage
            .from("attachments")
            .upload(`cases/evolution/${fileName}`, buffer, { contentType: mime });
            
          if (uploadErr) {
            console.error("[evo-webhook] Error subiendo media a Supabase", uploadErr.message || uploadErr);
          }
          if (!uploadErr && uploadData) {
            const { data: urlData } = supabase.storage.from("attachments").getPublicUrl(`cases/evolution/${fileName}`);
            mediaUrl = urlData.publicUrl;
            finalMediaType = mime;
            if (text === `[Archivo adjunto: ${mediaType}]`) text = ""; // Limpiar el placeholder si se subió con éxito
            console.log("[evo-webhook] media subida OK", { mediaUrl, mime, fileName });
          }
        }
      }
    } catch (e: any) {
      console.error("[evo-webhook] Error fetching/uploading base64 media:", e.message);
    }
  } else if (mediaType) {
    console.error("[evo-webhook] media detectada pero faltan envs EVO_URL/EVO_KEY/EVO_INSTANCE");
  }

  const keyId = get(payload, "data.key.id") || get(payload, "key.id") || get(payload, "data.messages.0.key.id") || get(payload, "data.messages.0.key.id");
  const now = new Date().toISOString();
  const entry = isOutgoing
    ? { role: "tecnico", time: now, content: text || "", author: "Soporte Sekunet", mediaUrl, mediaType: finalMediaType, fileName, messageId: keyId, fromMe: true } as any
    : { role: "user", time: now, content: text || "", mediaUrl, mediaType: finalMediaType, fileName, messageId: keyId, fromMe: false } as any;

  console.log("[evo-webhook] Paso 6: buscando casos recientes...");
  try {
    const { data: openCases } = await supabase
      .from("sek_cases")
      .select("id, histcliente, histtecnico, estado, customer_phone, cliente, title, created_at, accepted_at, escalado_at, tags, assigned_to")
      .eq("canal", "whatsapp")
      .order("created_at", { ascending: false })
      .limit(50);
    console.log("[evo-webhook] Paso 6 OK - casos encontrados:", openCases?.length || 0);

    let existing = null;
    let reopenClosedCase = false;
    if (openCases) {
      const matchesPhone = (c: any) => {
        if (c.customer_phone === jid) return true;
        if (phone && c.customer_phone === phone) return true;
        const t = typeof c.cliente === "object" ? c.cliente?.telefono : null;
        const tReal = typeof c.cliente === "object" ? c.cliente?.telefono_real : null;
        if (phone && (t === phone || tReal === phone || t === jid || tReal === jid)) return true;
        if (senderPn && (t === senderPn || tReal === senderPn || c.customer_phone === senderPn)) return true;
        return false;
      };

      // 1. Buscar primero un caso ACTIVO (no cerrado/resuelto)
      const ACTIVE_STATES = ["ia_atendiendo", "pendiente", "escalado", "abierto"];
      existing = openCases.find((c: any) => ACTIVE_STATES.includes(c.estado) && matchesPhone(c)) || null;

      // 2. Si no hay caso activo, NO reabrir el cerrado — se crea un caso nuevo.
      //    Solo un humano puede reabrir un caso cerrado (desde la UI).
      //    La re-apertura automatica causaba: historial viejo confundiendo a la IA,
      //    datos corruptos persistiendo, y la IA sin saludar al continuar el flujo.

    }
    console.log("[evo-webhook] Paso 7: caso existente:", existing ? existing.id : "ninguno");

    if (existing) {
      console.log("[evo-webhook] Paso 8: procesando caso existente, isOutgoing:", isOutgoing);
      if (isOutgoing) {
        // Mensaje saliente: guardar en histtecnico
        const hist = Array.isArray(existing.histtecnico) ? existing.histtecnico : [];
        
        // Anti-duplicación: evitar que el webhook guarde el mensaje si la UI ya lo guardó
        let duplicateIndex = -1;
        const isDuplicate = hist.some((m: any, idx: number) => {
          const timeDiff = Math.abs(new Date(now).getTime() - new Date(m.time).getTime());
          if (timeDiff < 60000) { // Ventana de 60 segundos (aumentada)
            // Si tiene el mismo messageId, es duplicado
            if (m.messageId && keyId && m.messageId === keyId) {
              duplicateIndex = idx;
              return true;
            }
            // Si tiene texto, comparamos el texto
            if (m.content && text && m.content.trim() === text.trim()) {
              duplicateIndex = idx;
              return true;
            }
            // Si es un archivo, comparamos por mediaUrl o mediaType
            if (mediaUrl && m.mediaUrl) {
              // Extraer el nombre del archivo del URL
              const url1 = mediaUrl.split('/').pop()?.split('?')[0];
              const url2 = m.mediaUrl.split('/').pop()?.split('?')[0];
              if (url1 && url2 && url1 === url2) {
                duplicateIndex = idx;
                return true;
              }
            }
            // Si es un archivo sin texto, comparamos el tipo
            if (!text && !m.content && m.mediaType && finalMediaType && m.mediaType === finalMediaType) {
              duplicateIndex = idx;
              return true;
            }
          }
          return false;
        });

        if (isDuplicate && duplicateIndex >= 0) {
          console.log("[evo-webhook] Ignorando mensaje saliente duplicado, actualizando con messageId:", keyId);
          const updatedHist = [...hist];
          updatedHist[duplicateIndex] = {
            ...updatedHist[duplicateIndex],
            messageId: keyId,
            fromMe: true
          };
          await supabase
            .from("sek_cases")
            .update({ histtecnico: updatedHist })
            .eq("id", existing.id);
          return NextResponse.json({ ok: true, duplicate: true, updatedId: true });
        }

        const updated = [...hist, entry];
        await supabase
          .from("sek_cases")
          .update({ 
            histtecnico: updated, 
            last_message_at: now, 
            last_message_preview: (text || "").slice(0, 200),
            customer_phone: jid
          })
          .eq("id", existing.id);
      } else {
        // Mensaje entrante: guardar en histcliente
        console.log("[evo-webhook] Paso 9: guardando mensaje entrante en histcliente de forma atómica...");
        
        await atomicDbUpdate(existing.id, async () => {
          // Refetch del historial más reciente para evitar la condición de carrera
          const { data: latestCase } = await supabase.from("sek_cases").select("histcliente, title, cliente").eq("id", existing.id).single();
          const hist = Array.isArray(latestCase?.histcliente) ? latestCase.histcliente : [];
          const updated = [...hist, entry];

          const currentCliente = (latestCase?.cliente && typeof latestCase.cliente === "object") ? latestCase.cliente : {};
          const updatedCliente = { 
            ...currentCliente, 
            whatsapp_name: pushName || currentCliente.whatsapp_name,
            telefono_real: senderPn || currentCliente.telefono_real
          };

          await supabase
            .from("sek_cases")
            .update({ 
              histcliente: updated, 
              last_message_at: now, 
              last_message_preview: (text || "").slice(0, 200),
              customer_phone: jid,
              cliente: updatedCliente,
              title: pushName ? `WhatsApp — ${pushName}` : (latestCase?.title || `WhatsApp — ${jid}`),
              ...(reopenClosedCase ? { estado: "ia_atendiendo" } : {})
            })
            .eq("id", existing.id);
        });
        
        console.log("[evo-webhook] Paso 9 OK - mensaje guardado en histcliente");
      }
      if (!isOutgoing) {
        console.log("[evo-webhook] Paso 10: preparando envío de respuesta...");
        const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || "";
        const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || "";
        if (SUPABASE_URL && SERVICE_KEY) {
          // Re-fetch del estado REAL del caso en este momento (evita race condition
          // donde el caso fue aceptado por un humano mientras procesábamos el mensaje)
          const { data: freshCase } = await supabase.from("sek_cases").select("estado").eq("id", existing.id).single();
          let currentEstado = reopenClosedCase ? "ia_atendiendo" : (freshCase?.estado || existing.estado);

          if (currentEstado === "pendiente") {
            const { error: updErr } = await supabase.from("sek_cases").update({ estado: "ia_atendiendo" }).eq("id", existing.id);
            if (!updErr) {
              currentEstado = "ia_atendiendo";
              console.log(`[evo-webhook] Caso ${existing.id} actualizado a ia_atendiendo`);
            } else {
              console.error(`[evo-webhook] Error actualizando estado del caso ${existing.id}:`, updErr);
            }
          }
          // Estados donde la IA NUNCA debe actuar: escalado, ya tomado por humano, o cerrado
          const skipIAStates = ["escalado", "abierto", "cerrado", "resuelto"];
          if (skipIAStates.includes(currentEstado)) {
            console.log(`[evo-webhook] Caso ${existing.id} en estado "${currentEstado}" — no se invoca IA, esperando agente humano.`);
          }
          // Solo invocar la IA si el caso está siendo atendido por ella — NUNCA interferir con agentes humanos
          if (currentEstado === "ia_atendiendo") {
            
            // INDICADOR DE ESCRIBIENDO Y DEBOUNCING (Evita llamar a la IA en ráfaga)
            await sendWhatsAppPresence(phone || jid || "", evoCfg, "composing");
            console.log(`[evo-webhook] Pausa de 1s para agrupar mensajes concurrentes...`);
            await new Promise(resolve => setTimeout(resolve, 1000));
            
            const { data: checkCase } = await supabase.from("sek_cases").select("last_message_at, histcliente").eq("id", existing.id).single();
            if (checkCase) {
              const nowMs = new Date(now).getTime();
              const lastMsgMs = new Date(checkCase.last_message_at).getTime();
              // Solo abortar si llegó un mensaje del usuario con timestamp significativamente posterior (>500ms)
              // Ignorar actualizaciones mínimas (ACKs, presence) que tienen la misma marca de tiempo
              if (lastMsgMs > nowMs + 500) {
                console.log(`[evo-webhook] Abortando IA para caso ${existing.id}, llegó un mensaje más reciente (${lastMsgMs - nowMs}ms después).`);
                return NextResponse.json({ ok: true, skipped: "newer_message" });
              }
            }

            console.log(`[evo-webhook] Invocando seka-whatsapp para caso existente ${existing.id}, estado: ${currentEstado}`);
            try {
              const iaRes = await fetch(`${SUPABASE_URL}/functions/v1/seka-whatsapp`, {
                method: "POST",
                headers: {
                  "Authorization": `Bearer ${SERVICE_KEY}`,
                  "Content-Type": "application/json",
                },
                body: JSON.stringify({ case_id: existing.id, force_estado: currentEstado }),
              });
              console.log(`[evo-webhook] seka-whatsapp status:`, iaRes.status);
              const iaData = await iaRes.json().catch((e) => {
                console.error(`[evo-webhook] Error parseando respuesta JSON:`, e);
                return {};
              });
              console.log(`[evo-webhook] seka-whatsapp reply:`, iaData.reply ? (Array.isArray(iaData.reply) ? `${iaData.reply.length} mensajes` : "1 mensaje") : "ausente", "error:", iaData.error || "ninguno");
              if (iaData.reply) {
                await sendWhatsAppMessages(phone || jid || "", iaData.reply, evoCfg);
              } else {
                console.warn(`[evo-webhook] seka-whatsapp no devolvió reply para caso ${existing.id}:`, iaData);
              }
            } catch (err: any) {
              console.error(`[evo-webhook] Error invocando seka-whatsapp para caso ${existing.id}:`, err?.message || err);
            }
          }
        }
      }
      console.log("[evo-webhook] === FIN CASO EXISTENTE - retornando ok ===");
      return NextResponse.json({ ok: true });
    }

    console.log("[evo-webhook] Paso 11: creando nuevo caso...");
    const contactPhone = phone || senderPn || jid;

    if (isOutgoing) {
      await supabase.from("sek_cases").insert({
        canal: "whatsapp",
        estado: "pendiente",
        prioridad: "media",
        customer_phone: contactPhone,
        cliente: { telefono: contactPhone, nombre: null },
        histcliente: [],
        histtecnico: [entry],
        title: `WhatsApp — ${contactPhone}`,
        last_message_at: now,
        last_message_preview: (text || "").slice(0, 200),
      });
    } else {
      const { data: newCase } = await supabase.from("sek_cases").insert({
        canal: "whatsapp",
        estado: "ia_atendiendo",
        prioridad: "media",
        customer_phone: contactPhone,
        cliente: { 
          telefono: contactPhone,
          nombre: null,
          whatsapp_name: pushName || null,
          telefono_real: senderPn || null
        },
        histcliente: [entry],
        histtecnico: [],
        title: pushName ? `WhatsApp — ${pushName}` : `WhatsApp — ${contactPhone}`,
        last_message_at: now,
        last_message_preview: (text || "").slice(0, 200),
      }).select("id").single();

      // Disparar ia-agent para nuevo caso entrante
      const SUPABASE_URL2 = process.env.NEXT_PUBLIC_SUPABASE_URL || "";
      const SERVICE_KEY2 = process.env.SUPABASE_SERVICE_ROLE_KEY || "";
      console.log(`[evo-webhook] Env vars check: SUPABASE_URL=${SUPABASE_URL2 ? "present" : "missing"}, SERVICE_KEY=${SERVICE_KEY2 ? "present" : "missing"}, newCase.id=${newCase?.id}`);
      if (SUPABASE_URL2 && SERVICE_KEY2 && newCase?.id) {
        console.log(`[evo-webhook] Invocando seka-whatsapp para NUEVO caso ${newCase.id}`);
        try {
          const iaRes = await fetch(`${SUPABASE_URL2}/functions/v1/seka-whatsapp`, {
            method: "POST",
            headers: {
              "Authorization": `Bearer ${SERVICE_KEY2}`,
              "Content-Type": "application/json",
            },
            body: JSON.stringify({ case_id: newCase.id, force_estado: "ia_atendiendo" }),
          });
          console.log(`[evo-webhook] seka-whatsapp status (nuevo caso):`, iaRes.status);
          const iaData = await iaRes.json().catch((e) => {
            console.error(`[evo-webhook] Error parseando respuesta JSON (nuevo caso):`, e);
            return {};
          });
          console.log(`[evo-webhook] seka-whatsapp reply (nuevo caso):`, iaData.reply ? (Array.isArray(iaData.reply) ? `${iaData.reply.length} mensajes` : "1 mensaje") : "ausente", "error:", iaData.error || "ninguno");
          if (iaData.reply) {
            await sendWhatsAppMessages(phone || jid || "", iaData.reply, evoCfg);
          } else {
            console.warn(`[evo-webhook] seka-whatsapp no devolvió reply para nuevo caso ${newCase.id}:`, iaData);
          }
        } catch (err: any) {
          console.error(`[evo-webhook] Error invocando seka-whatsapp para nuevo caso ${newCase.id}:`, err?.message || err);
        }
      }
    }
    return NextResponse.json({ ok: true });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message || "error" }, { status: 500 });
  }
}

export async function GET() {
  return NextResponse.json({ ok: true });
}
