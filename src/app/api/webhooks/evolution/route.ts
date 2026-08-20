import { NextRequest, NextResponse } from "next/server";
import crypto from "crypto";
import { createServiceClient } from "@/lib/supabase/service";
import { getEvolutionConfig } from "@/lib/evolution-config";

export const maxDuration = 60; // Evita el timeout de 10s en Vercel Hobby

const get = (obj: any, path: string) => path.split(".").reduce((o, k) => (o && o[k] !== undefined ? o[k] : undefined), obj);

const MSG_HORARIO = "Gracias por contactarnos.\n\nEn este momento nos encontramos fuera de nuestro horario de atención.\n\nLe invitamos a comunicarse con nosotros en nuestro horario de servicio, de lunes a viernes, de 7:30 a. m. a 5:00 p. m.";

// Horario de atención: lunes a viernes 7:30 a.m. - 5:00 p.m. (Costa Rica, UTC-6).
// Misma lógica que seka-whatsapp/index.ts para que ambos caminos coincidan.
function isOpenNowCR(): boolean {
  const now = new Date();
  const utcH = now.getUTCHours();
  const utcM = now.getUTCMinutes();
  let crH = utcH - 6;
  if (crH < 0) crH += 24;
  const crMin = crH * 60 + utcM;
  let dow = now.getUTCDay();
  if (crH > utcH) dow = (dow + 6) % 7;
  if (dow === 0 || dow === 6) return false;
  return crMin >= 450 && crMin < 1020; // 7:30 = 450, 17:00 = 1020
}

// El mensaje de fuera de horario es editable desde el editor visual de flujos.
async function getFueraHorarioMsg(supabase: any): Promise<string> {
  try {
    const { data } = await supabase.from("sek_flow_configs").select("flow_data").eq("activo", true).maybeSingle();
    const node = data?.flow_data?.nodes?.find((n: any) => n.id === "fuera_horario");
    return node?.data?.message || MSG_HORARIO;
  } catch {
    return MSG_HORARIO;
  }
}

// Map global para trackear mensajes procesados recientemente (evita duplicados)
const processedMessages = new Map<string, number>();
const DUPLICATE_WINDOW_MS = 30000; // 30 segundos

// El mutex en memoria que había aquí no servía: el webhook corre en serverless,
// donde cada invocación puede caer en otra instancia, así que no se compartía
// nada entre mensajes concurrentes. El append ahora es atómico en Postgres
// mediante la función sek_append_hist (ver supabase/migrations).

function getMessageKey(jid: string | null | undefined, content: string | null | undefined, mediaUrl?: string, messageId?: string | null): string {
  // El messageId de WhatsApp identifica cada mensaje de forma única: es la clave
  // correcta. Solo se cae al texto/media cuando el payload no lo trae.
  if (messageId) return `id:${messageId}`;
  const key = mediaUrl ? `${jid}:${mediaUrl}` : `${jid}:${content?.slice(0, 50)}`;
  return key;
}

function isDuplicateMessage(jid: string | null | undefined, content: string | null | undefined, mediaUrl?: string, messageId?: string | null): boolean {
  // No procesar como duplicado si no hay JID válido
  if (!jid) return false;
  
  const key = getMessageKey(jid, content, mediaUrl, messageId);
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
// Devuelve el messageId que asigna WhatsApp: sin él, el mensaje no se puede
// revocar después ("eliminar para todos").
async function sendWhatsAppText(phone: string, text: string, evoCfg: any, delayMs: number = 0): Promise<{ ok: boolean; messageId: string | null }> {
  try {
    if (!evoCfg?.url || !evoCfg?.apiKey || !evoCfg?.instance) {
      console.error("[evo-webhook] Evo config incompleta:", { url: !!evoCfg?.url, key: !!evoCfg?.apiKey, instance: !!evoCfg?.instance });
      return { ok: false, messageId: null };
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
      return { ok: false, messageId: null };
    }
    const data = await res.json().catch(() => ({} as any));
    const messageId = data?.key?.id || null;
    console.log("[evo-webhook] Mensaje enviado exitosamente. messageId:", messageId);
    return { ok: true, messageId };
  } catch (e: any) {
    console.error("[evo-webhook] Exception sending text:", e.message);
    return { ok: false, messageId: null };
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
async function sendWhatsAppMessages(phone: string, reply: any | any[], evoCfg: any, flowSettings?: { typingDelayMs?: number; betweenMessagesDelayMs?: number }): Promise<void> {
  const messages = Array.isArray(reply) ? reply : [reply];
  const typingDelay = flowSettings?.typingDelayMs ?? 800;
  const betweenDelay = flowSettings?.betweenMessagesDelayMs ?? 600;
  for (let i = 0; i < messages.length; i++) {
    const msg = messages[i];
    if (!msg) continue;
    
    // Evolution API mostrará "escribiendo..." durante este tiempo
    const delayMs = typingDelay;

    let sent = false;

    // Interceptar pregunta corta y convertirla en el menú de texto completo
    let text = typeof msg === "object" ? msg.content : msg;
    if (text && (text.includes("¿En relación con qué tema") || text.includes("¿En relación a qué tema"))) {
      text = "¿En relación con qué tema sería su consulta?\n\n1. Configuraciones\n2. Reset\n3. Desvinculación\n4. Firmware\n5. Software\n6. Licencias\n7. Otro\n\nResponda con el número o el nombre del tema.";
    }

    if (!text || !text.trim()) continue;

    if (typeof msg === "object" && msg.type === "list") {
      sent = await sendWhatsAppList(phone || "", msg.listData, evoCfg, delayMs);
      if (!sent && text) {
        console.log("[evo-webhook] Lista fallo, enviando texto plano como fallback");
        sent = (await sendWhatsAppText(phone || "", text, evoCfg, delayMs)).ok;
      }
    } else {
      sent = (await sendWhatsAppText(phone || "", text, evoCfg, delayMs)).ok;
    }

    if (!sent) {
      console.error(`[evo-webhook] FALLÓ envío WhatsApp mensaje ${i + 1}/${messages.length}`);
    }

    // Breve pausa entre mensajes para mantener orden sin hacerlo lento
    if (i < messages.length - 1) {
      await new Promise(resolve => setTimeout(resolve, betweenDelay));
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

// HKDF-SHA256 (RFC 5869) para derivar claves de media de WhatsApp
function hkdfExpand(key: Buffer, length: number, info: string): Buffer {
  const salt = Buffer.alloc(32, 0);
  const prk = crypto.createHmac("sha256", salt).update(key).digest();
  const infoBuf = Buffer.from(info, "utf-8");
  let previous = Buffer.alloc(0);
  const blocks = Math.ceil(length / 32);
  const buffers: Buffer[] = [];
  for (let i = 0; i < blocks; i++) {
    const hmac = crypto.createHmac("sha256", prk);
    hmac.update(Buffer.concat([previous, infoBuf, Buffer.from([i + 1])]));
    previous = hmac.digest();
    buffers.push(previous);
  }
  return Buffer.concat(buffers).slice(0, length);
}

const MEDIA_HKDF_INFO: Record<string, string> = {
  image: "WhatsApp Image Keys",
  video: "WhatsApp Video Keys",
  audio: "WhatsApp Audio Keys",
  document: "WhatsApp Document Keys",
  sticker: "WhatsApp Image Keys",
};

// Convierte mediaKey (string base64 o objeto {0:..,1:..}) a Buffer
function mediaKeyToBuffer(mediaKey: any): Buffer | null {
  if (!mediaKey) return null;
  if (typeof mediaKey === "string") return Buffer.from(mediaKey, "base64");
  if (typeof mediaKey === "object") {
    const values = Object.values(mediaKey).filter((v) => typeof v === "number") as number[];
    if (values.length > 0) return Buffer.from(values);
  }
  return null;
}

// Descarga y desencripta media de WhatsApp directamente (AES-256-CBC + HKDF),
// sin depender de getBase64FromMediaMessage de Evolution (que falla en Render).
async function decryptWhatsAppMedia(
  encUrl: string,
  mediaKey: any,
  type: string
): Promise<{ buffer: Buffer } | null> {
  const keyBuf = mediaKeyToBuffer(mediaKey);
  if (!keyBuf) return null;

  const info = MEDIA_HKDF_INFO[type] || MEDIA_HKDF_INFO.document;
  const expanded = hkdfExpand(keyBuf, 112, info);
  const iv = expanded.slice(0, 16);
  const cipherKey = expanded.slice(16, 48);

  const res = await fetch(encUrl, { signal: AbortSignal.timeout(45000) });
  if (!res.ok) {
    console.error("[evo-webhook] descarga media WhatsApp NO OK", res.status);
    return null;
  }
  const enc = Buffer.from(await res.arrayBuffer());
  if (enc.length <= 10) return null;
  // Los últimos 10 bytes son el MAC; el resto es el ciphertext
  const cipherText = enc.slice(0, enc.length - 10);

  const decipher = crypto.createDecipheriv("aes-256-cbc", cipherKey, iv);
  const decrypted = Buffer.concat([decipher.update(cipherText), decipher.final()]);
  return { buffer: decrypted };
}

// Extrae { url, directPath, mediaKey, mimetype, fileName } del objeto de mensaje
function extractMediaInfo(msgObj: any): {
  url?: string;
  directPath?: string;
  mediaKey?: any;
  mimetype?: string;
  fileName?: string;
} | null {
  if (!msgObj) return null;
  const unwrapped =
    msgObj.ephemeralMessage?.message ||
    msgObj.viewOnceMessage?.message ||
    msgObj.documentWithCaptionMessage?.message ||
    msgObj;
  const media =
    unwrapped.documentMessage ||
    unwrapped.imageMessage ||
    unwrapped.videoMessage ||
    unwrapped.audioMessage ||
    unwrapped.ptvMessage ||
    unwrapped.stickerMessage;
  if (!media) return null;
  return {
    url: media.url,
    directPath: media.directPath,
    mediaKey: media.mediaKey,
    mimetype: media.mimetype,
    fileName: media.fileName || media.title,
  };
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
  
  // Buscar pnJid o senderPn en otros campos (senderPn viene en key.senderPn en v2.3)
  let possiblePnJid = get(msg, "verifiedBizName") || get(payload, "data.pnJid") || get(msg, "key.senderPn") || get(msg, "senderPn") || get(payload, "data.key.senderPn") || get(payload, "data.senderPn") || get(payload, "senderPn");

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
    
    // Último recurso: si el payload trae senderPn (número real @s.whatsapp.net),
    // usarlo en vez del LID opaco. En v2.3 está en key.senderPn.
    const senderPnFallback = get(msg, "key.senderPn") || get(msg, "senderPn") || get(payload, "data.key.senderPn") || get(payload, "data.senderPn") || get(payload, "senderPn");
    if (senderPnFallback && String(senderPnFallback).endsWith("@s.whatsapp.net")) {
      console.log("[evo-webhook] LID no resuelto por contacts, usando senderPn como JID:", senderPnFallback);
      return String(senderPnFallback);
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
    // Lista interactiva (listResponseMessage) — el cliente toca una opción
    "message.listResponseMessage.title",
    "data.message.listResponseMessage.title",
    "data.messages.0.message.listResponseMessage.title",
    "message.listResponseMessage.singleSelectReply.selectedRowId",
    "data.message.listResponseMessage.singleSelectReply.selectedRowId",
    "data.messages.0.message.listResponseMessage.singleSelectReply.selectedRowId",
    // Botones interactivos (buttonsResponseMessage)
    "message.buttonsResponseMessage.selectedButtonId",
    "data.message.buttonsResponseMessage.selectedButtonId",
    "data.messages.0.message.buttonsResponseMessage.selectedButtonId",
    "message.buttonsResponseMessage.selectedDisplayText",
    "data.message.buttonsResponseMessage.selectedDisplayText",
    "data.messages.0.message.buttonsResponseMessage.selectedDisplayText",
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

// Hora real en que WhatsApp envió el mensaje (messageTimestamp), no la hora en
// que este servidor recibió el webhook. Baileys lo manda en segundos Unix y a
// veces como objeto Long ({ low, high }). Si no viene o es absurdo, se cae a
// la hora actual.
function extractMessageTime(payload: any): string {
  const raw =
    get(payload, "data.messages.0.messageTimestamp") ??
    get(payload, "data.messageTimestamp") ??
    get(payload, "messageTimestamp");

  let secs: number | null = null;
  if (typeof raw === "number") secs = raw;
  else if (typeof raw === "string" && /^\d+$/.test(raw)) secs = Number(raw);
  else if (raw && typeof raw === "object" && typeof (raw as any).low === "number") secs = (raw as any).low;

  if (secs && secs > 0) {
    // Valores menores a 1e12 vienen en segundos; mayores ya están en ms.
    const ms = secs < 1e12 ? secs * 1000 : secs;
    const d = new Date(ms);
    // Descartar fechas corruptas o fuera de un rango razonable (± 1 año).
    if (!isNaN(d.getTime()) && Math.abs(Date.now() - ms) < 365 * 24 * 60 * 60 * 1000) {
      return d.toISOString();
    }
    console.warn("[evo-webhook] messageTimestamp fuera de rango, usando hora actual:", raw);
  }
  return new Date().toISOString();
}

export async function POST(req: NextRequest) {
  console.log("[evo-webhook] === INICIO WEBHOOK ===");
  const supabase = createServiceClient();
  let payload: any = null;
  try { payload = await req.json(); } catch { payload = null; }
  console.log("[evo-webhook] Payload recibido, event:", payload?.event);
  // DEBUG: log completo del payload para ver dónde viene senderPn
  if (payload?.event === "MESSAGES_UPSERT") {
    try {
      await supabase.from("sek_app_settings").upsert({
        key: "debug_last_payload",
        value: JSON.stringify(payload).slice(0, 5000),
        iv: "debug",
        tag: "debug",
        updated_at: new Date().toISOString(),
      });
    } catch {}
  }

  // LOG: si el mensaje tiene documentMessage, guardar el payload completo para debug
  const _dbgMsg = payload?.data?.message || payload?.data?.messages?.[0]?.message || payload?.message;
  if (_dbgMsg?.documentMessage) {
    console.log("[evo-webhook] DOCUMENT MESSAGE DETECTADO - documentMessage keys:", Object.keys(_dbgMsg.documentMessage));
    console.log("[evo-webhook] documentMessage.url:", _dbgMsg.documentMessage.url?.slice(0, 80));
    console.log("[evo-webhook] documentMessage.mediaKey type:", typeof _dbgMsg.documentMessage.mediaKey);
    console.log("[evo-webhook] documentMessage.fileName:", _dbgMsg.documentMessage.fileName);
    console.log("[evo-webhook] documentMessage.mimetype:", _dbgMsg.documentMessage.mimetype);
  }

  console.log("[evo-webhook] Paso 1: getEvolutionConfig...");
  const evoCfg = await getEvolutionConfig();
  const EVO_URL = evoCfg.url;
  const EVO_KEY = evoCfg.apiKey;
  const EVO_INSTANCE = evoCfg.instance;
  console.log("[evo-webhook] Paso 1 OK - Evo config:", { url: EVO_URL, instance: EVO_INSTANCE, keyPresente: !!EVO_KEY });

  // Cargar settings del flow (delays configurables) y nodos para encuesta
  let flowSettings: { typingDelayMs?: number; betweenMessagesDelayMs?: number } | undefined;
  let flowNodes: any[] = [];
  try {
    const supabaseForFlow = createServiceClient();
    const { data: flowRow } = await supabaseForFlow
      .from("sek_flow_configs")
      .select("flow_data")
      .limit(1)
      .single();
    if (flowRow?.flow_data?.settings) {
      flowSettings = flowRow.flow_data.settings;
      console.log("[evo-webhook] Flow settings cargados:", flowSettings);
    }
    if (flowRow?.flow_data?.nodes) {
      flowNodes = flowRow.flow_data.nodes;
    }
  } catch (e: any) {
    console.warn("[evo-webhook] No se pudieron cargar flow settings:", e.message);
  }

  // ── Verificar Modo No Atendido (jerarquía máxima) ──
  let modoNoAtendido = false;
  try {
    const { data: unattendedRow } = await supabase
      .from("sek_agent_config")
      .select("modo_no_atendido")
      .eq("email", "system_prompt@sekunet.com")
      .maybeSingle();
    modoNoAtendido = unattendedRow?.modo_no_atendido ?? false;
    console.log(`[evo-webhook] Modo No Atendido: ${modoNoAtendido ? "ON" : "OFF"}`);
  } catch (e: any) {
    console.warn("[evo-webhook] No se pudo verificar modo_no_atendido:", e.message);
  }

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

  // messageId que WhatsApp asigna a cada mensaje. Se usa para deduplicar en vez
  // de comparar el texto, que descartaba respuestas repetidas legítimas del
  // cliente ("1", "si", "ok") dentro de la ventana de 30s.
  const keyId: string | null =
    get(payload, "data.key.id") || get(payload, "key.id") || get(payload, "data.messages.0.key.id") || null;

  // Hora real de envío según WhatsApp. La UI ordena los mensajes por este campo,
  // así que usar la hora de recepción hacía que el orden no coincidiera con el
  // de la app de WhatsApp.
  const msgTime = extractMessageTime(payload);

  console.log("[evo-webhook] Paso 5: verificar duplicado...", { keyId, msgTime });
  if (isDuplicateMessage(jid, text, dupMediaUrl, keyId)) {
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
  let mediaDebug: any = null;

  if (mediaType) {
    console.log("[evo-webhook] media detectada", mediaType);
  }

  if (mediaType && EVO_URL && EVO_KEY && EVO_INSTANCE) {
    try {
      // Evolution manda el mensaje en payload.data, pero puede venir en dos formatos:
      // 1. Directo: { key, message, ... }
      // 2. messages.upsert: { messages: [{ key, message, ... }] }
      const rawData = payload?.data;
      const messageToExtract = rawData?.messages?.[0] || rawData;

      // Con webhookBase64:true, Evolution incluye el archivo ya codificado dentro del
      // payload (message.base64). Lo leemos directo para NO depender del round-trip a
      // /getBase64FromMediaMessage, que falla o expira en Render (tier gratuito).
      let base64: string | null = null;
      let b64Data: any = null;
      const inlineB64 = msgObj?.base64
        || messageToExtract?.message?.base64
        || messageToExtract?.base64
        || rawData?.message?.base64
        || rawData?.base64
        || null;

      mediaDebug = {
        mediaType,
        inlineB64: !!inlineB64,
        msgObjKeys: msgObj ? Object.keys(msgObj) : [],
        messageKeys: messageToExtract?.message ? Object.keys(messageToExtract.message) : [],
        dataKeys: rawData ? Object.keys(rawData) : [],
      };

      // MÉTODO PRIMARIO: descargar y desencriptar el media directamente desde WhatsApp,
      // sin depender de getBase64FromMediaMessage de Evolution (que devuelve 502 en Render).
      const mediaInfo = extractMediaInfo(msgObj);
      const encUrl = mediaInfo?.url
        || (mediaInfo?.directPath ? `https://mmg.whatsapp.net${mediaInfo.directPath}` : null);
      mediaDebug.hasMediaKey = !!mediaInfo?.mediaKey;
      mediaDebug.hasEncUrl = !!encUrl;
      mediaDebug.encUrlPreview = encUrl ? encUrl.slice(0, 80) : null;
      mediaDebug.mediaKeyType = mediaInfo?.mediaKey ? typeof mediaInfo.mediaKey : null;
      mediaDebug.mediaKeyPreview = mediaInfo?.mediaKey
        ? (typeof mediaInfo.mediaKey === "string" ? mediaInfo.mediaKey.slice(0, 40) : "object:" + Object.keys(mediaInfo.mediaKey).length + "keys")
        : null;
      mediaDebug.docMsgKeys = msgObj?.documentMessage ? Object.keys(msgObj.documentMessage) : [];

      if (inlineB64) {
        base64 = String(inlineB64);
        console.log("[evo-webhook] base64 inline detectado en payload, longitud:", base64.length);
      } else if (encUrl && mediaInfo?.mediaKey) {
        try {
          console.log("[evo-webhook] desencriptando media directo de WhatsApp", { mediaType });
          const dec = await decryptWhatsAppMedia(encUrl, mediaInfo.mediaKey, mediaType);
          if (dec?.buffer) {
            base64 = dec.buffer.toString("base64");
            b64Data = { mimetype: mediaInfo.mimetype };
            mediaDebug.directDecrypt = true;
            mediaDebug.directBytes = dec.buffer.length;
            console.log("[evo-webhook] media desencriptada OK, bytes:", dec.buffer.length);
          } else {
            mediaDebug.directDecrypt = false;
            console.error("[evo-webhook] desencriptado directo devolvió null");
          }
        } catch (decErr: any) {
          mediaDebug.directDecrypt = false;
          mediaDebug.directError = decErr?.message;
          console.error("[evo-webhook] Error desencriptando media directo:", decErr?.message);
        }
      }

      if (!base64 && !inlineB64 && (!messageToExtract || !messageToExtract.key || !messageToExtract.message)) {
        console.error("[evo-webhook] sin base64 inline/directo y sin key+message para getBase64", mediaDebug);
      } else if (!base64) {
        console.log("[evo-webhook] fallback: solicitando a Evolution getBase64", { mediaType });
        // Evolution espera solo { key, message } — campos extra causan errores
        const cleanMsg = {
          key: messageToExtract.key,
          message: messageToExtract.message,
        };
        const b64Res = await fetch(`${EVO_URL.replace(/\/$/, "")}/chat/getBase64FromMediaMessage/${encodeURIComponent(EVO_INSTANCE)}`, {
          method: "POST",
          headers: { "Content-Type": "application/json", apikey: EVO_KEY },
          body: JSON.stringify({ message: cleanMsg, convertToMp4: false }),
          signal: AbortSignal.timeout(55000)
        });
        if (!b64Res.ok) {
          const body = await b64Res.text().catch(() => "<no-body>");
          console.error("[evo-webhook] getBase64FromMediaMessage NO OK", b64Res.status, body.slice(0, 500));
          mediaDebug.getBase64Status = b64Res.status;
          mediaDebug.getBase64Body = body.slice(0, 300);
        } else {
          b64Data = await b64Res.json().catch(() => null);
          base64 = b64Data?.base64 || null;
          if (!base64) console.error("[evo-webhook] getBase64FromMediaMessage sin base64 en respuesta", b64Data);
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

        console.log("[evo-webhook] base64 recibido", { mime, base64Length: base64.length });

        let finalExt = ext;
        if (originalFileName && originalFileName.includes(".")) {
           finalExt = originalFileName.split(".").pop() || ext;
           // Si no hay mime específico o es genérico, lo inferimos por la extensión original
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
    } catch (e: any) {
      console.error("[evo-webhook] Error fetching/uploading base64 media:", e.message);
      try {
        await supabase.from("sek_app_settings").upsert({
          key: "debug_base64_error",
          value: JSON.stringify({ mediaType, error: e.message, time: new Date().toISOString() }),
          updated_at: new Date().toISOString(),
        });
      } catch {}
    }
  } else if (mediaType) {
    console.error("[evo-webhook] media detectada pero faltan envs EVO_URL/EVO_KEY/EVO_INSTANCE");
  }

  const now = new Date().toISOString();
  // time = hora de WhatsApp (msgTime), no la de recepción, para que el orden
  // en el chat coincida con el de la app.
  // Extraer cita (reply) del mensaje de WhatsApp si existe
  let replyTo: { content: string; author: string } | null = null;
  try {
    const msgObj = get(payload, "data.messages.0.message") || get(payload, "data.message") || get(payload, "message") || {};
    // contextInfo puede venir en cualquier tipo de mensaje (conversation, extendedText, image, video, document, etc.)
    const ctx = msgObj?.extendedTextMessage?.contextInfo
      || msgObj?.conversation?.contextInfo
      || msgObj?.imageMessage?.contextInfo
      || msgObj?.videoMessage?.contextInfo
      || msgObj?.ptvMessage?.contextInfo
      || msgObj?.audioMessage?.contextInfo
      || msgObj?.documentMessage?.contextInfo
      || msgObj?.documentWithCaptionMessage?.message?.contextInfo
      || msgObj?.viewOnceMessage?.message?.contextInfo
      || msgObj?.ephemeralMessage?.message?.extendedTextMessage?.contextInfo
      || msgObj?.ephemeralMessage?.message?.conversation?.contextInfo
      || msgObj?.ephemeralMessage?.message?.imageMessage?.contextInfo
      || msgObj?.ephemeralMessage?.message?.videoMessage?.contextInfo
      || msgObj?.contextInfo;
    if (ctx?.quotedMessage) {
      const qm = ctx.quotedMessage;
      const quotedText = qm.conversation || qm.extendedTextMessage?.text || qm.imageMessage?.caption || qm.videoMessage?.caption || qm.documentMessage?.caption || qm.documentWithCaptionMessage?.message?.caption || "";
      if (quotedText) {
        const authorPhone = jidToPhone(ctx.participant) || ctx.participant || "Cliente";
        replyTo = { content: quotedText.slice(0, 200), author: authorPhone };
      }
    }
  } catch {}

  const entry = isOutgoing
    ? { role: "tecnico", time: msgTime, content: text || "", author: "Soporte Sekunet", mediaUrl, mediaType: finalMediaType, fileName, messageId: keyId, fromMe: true, ...(replyTo ? { replyTo } : {}) } as any
    : { role: "user", time: msgTime, content: text || "", mediaUrl, mediaType: finalMediaType, fileName, messageId: keyId, fromMe: false, ...(replyTo ? { replyTo } : {}) } as any;

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
      const ACTIVE_STATES = ["ia_atendiendo", "pendiente", "escalado", "abierto", "calificacion_pendiente"];
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
        // Re-leer histtecnico fresco desde BD para evitar race condition con el append
        // que la UI pudo haber hecho justo antes de este webhook.
        const { data: freshRow } = await supabase
          .from("sek_cases")
          .select("histtecnico")
          .eq("id", existing.id)
          .maybeSingle();
        const hist = Array.isArray(freshRow?.histtecnico) ? freshRow.histtecnico : [];

        // Anti-duplicación: evitar que el webhook guarde el mensaje si la UI ya lo guardó.
        // Sin ventana de tiempo: el eco puede llegar tarde y aún debe deduplicar.
        let duplicateIndex = -1;
        const isDuplicate = hist.some((m: any, idx: number) => {
          // Si tiene el mismo messageId, es duplicado
          if (m.messageId && keyId && m.messageId === keyId) {
            duplicateIndex = idx;
            return true;
          }
          // Si tiene texto, comparamos el texto (sin ventana de tiempo)
          if (m.content && text && m.content.trim() === text.trim()) {
            // Solo deduplicar si el mensaje existente no tiene messageId
            // (si ya tiene messageId, fue guardado por el webhook y no es duplicado de la UI)
            if (!m.messageId) {
              duplicateIndex = idx;
              return true;
            }
          }
          // Si es un archivo, comparamos por mediaUrl
          if (mediaUrl && m.mediaUrl) {
            const url1 = mediaUrl.split('/').pop()?.split('?')[0];
            const url2 = m.mediaUrl.split('/').pop()?.split('?')[0];
            if (url1 && url2 && url1 === url2 && !m.messageId) {
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
            fromMe: true,
            time: msgTime,
          };
          await supabase
            .from("sek_cases")
            .update({ histtecnico: updatedHist })
            .eq("id", existing.id);
          return NextResponse.json({ ok: true, duplicate: true, updatedId: true });
        }

        // Append atómico en Postgres (un solo UPDATE con jsonb || bajo bloqueo de
        // fila), en lugar de leer y reescribir el array completo desde aquí.
        const { error: appendOutErr } = await supabase.rpc("sek_append_hist", {
          p_case_id: String(existing.id),
          p_entry: entry,
          p_col: "histtecnico",
          p_preview: (text || "").slice(0, 200),
          p_customer_phone: jid,
        });
        if (appendOutErr) {
          console.error("[evo-webhook] Error en sek_append_hist (histtecnico):", appendOutErr);
        }
      } else {
        // Mensaje entrante: guardar en histcliente
        console.log("[evo-webhook] Paso 9: guardando mensaje entrante en histcliente de forma atómica...");
        
        // Append atómico en Postgres. Antes se leía histcliente, se concatenaba en
        // JS y se reescribía el array completo; dos mensajes concurrentes leían la
        // misma base y el segundo pisaba al primero, perdiendo el mensaje.
        const { data: appended, error: appendErr } = await supabase.rpc("sek_append_hist", {
          p_case_id: String(existing.id),
          p_entry: entry,
          p_col: "histcliente",
          p_preview: (text || "").slice(0, 200),
          p_customer_phone: jid,
        });
        if (appendErr) {
          console.error("[evo-webhook] Error en sek_append_hist (histcliente):", appendErr);
        } else if (appended === false) {
          console.log("[evo-webhook] Mensaje ya estaba en el historial, no se duplica:", keyId);
        }

        // Metadatos del caso: van en un update aparte porque no tocan el historial.
        // Se relee cliente/title para no pisar datos que la IA haya extraído mientras
        // procesábamos este mensaje.
        const { data: latestCase } = await supabase.from("sek_cases").select("title, cliente").eq("id", existing.id).maybeSingle();
        const currentCliente = (latestCase?.cliente && typeof latestCase.cliente === "object") ? latestCase.cliente as Record<string, unknown> : {};
        const metaUpdate: Record<string, unknown> = {
          cliente: {
            ...currentCliente,
            whatsapp_name: pushName || currentCliente.whatsapp_name,
            telefono_real: senderPn || currentCliente.telefono_real,
          },
          title: pushName ? `WhatsApp — ${pushName}` : (latestCase?.title || `WhatsApp — ${jid}`),
          ...(reopenClosedCase ? { estado: "ia_atendiendo" } : {}),
        };
        await supabase.from("sek_cases").update(metaUpdate).eq("id", existing.id);
        
        console.log("[evo-webhook] Paso 9 OK - mensaje guardado en histcliente");
      }

      // ── Modo No Atendido: mensaje guardado, no procesar nada más ──
      if (modoNoAtendido) {
        console.log(`[evo-webhook] Modo No Atendido — mensaje guardado en caso ${existing.id}, sin procesamiento adicional`);
        return NextResponse.json({ ok: true, unattended: true });
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
          // ── ENCUESTA: interceptar respuestas de calificación antes de IA ──
          if (currentEstado === "calificacion_pendiente") {
            console.log(`[evo-webhook] Caso ${existing.id} en calificacion_pendiente — interceptando respuesta de encuesta`);
            const findFlowMsg = (nodeId: string, fallback: string) => {
              const node = flowNodes.find((n: any) => n.id === nodeId);
              return node?.data?.message || fallback;
            };

            const rawText = (text || "").trim();
            const ratingMatch = rawText.match(/\b([1-5])\b/);
            const rating = ratingMatch ? parseInt(ratingMatch[1]) : NaN;
            console.log(`[evo-webhook] Encuesta — text="${rawText}", rating=${rating}`);
            let reply: string;
            let newEstado: string;

            if (rating >= 1 && rating <= 5) {
              reply = findFlowMsg("agradecer_calificacion", "Gracias por su calificación. Que tenga un excelente día.");
              newEstado = "cerrado";
            } else {
              reply = "Esta conversación ha sido finalizada. Si requiere asistencia más adelante, puede comunicarse con nosotros nuevamente. Con gusto le atenderemos.";
              newEstado = "cerrado";
            }

            // Enviar respuesta por WhatsApp
            const replySent = await sendWhatsAppText(phone || jid || "", reply, evoCfg, 800);

            // Guardar respuesta en histtecnico (atómico). El messageId queda
            // registrado para poder revocar el mensaje más adelante.
            const replyEntry = {
              role: "ia",
              author: "Asistente Sekunet",
              time: new Date().toISOString(),
              content: reply,
              fromMe: true,
              ...(replySent.messageId ? { messageId: replySent.messageId } : {}),
            };
            await supabase.rpc("sek_append_hist", {
              p_case_id: String(existing.id),
              p_entry: replyEntry,
              p_col: "histtecnico",
              p_preview: (reply || "").slice(0, 200),
              p_customer_phone: jid,
            });

            // Actualizar estado + calificación
            const stateUpdates: Record<string, unknown> = {
              estado: newEstado,
              last_message_at: now,
            };

            if (newEstado === "cerrado") {
              // Re-fetch cliente to avoid overwriting metadata updated earlier in this webhook
              const { data: freshCliente } = await supabase.from("sek_cases").select("cliente").eq("id", existing.id).maybeSingle();
              const currentCliente = (freshCliente?.cliente && typeof freshCliente.cliente === "object") ? freshCliente.cliente as Record<string, unknown> : {};
              stateUpdates.cliente = {
                ...currentCliente,
                calificacion_cliente: rating,
                fecha_calificacion_cliente: new Date().toISOString(),
              };
            }

            await supabase.from("sek_cases").update(stateUpdates).eq("id", existing.id);

            console.log(`[evo-webhook] Encuesta procesada: caso ${existing.id}, rating=${rating}, estado=${newEstado}`);

            if (newEstado === "cerrado") {
              try {
                await fetch(`${SUPABASE_URL}/functions/v1/learn-case`, {
                  method: "POST",
                  headers: { "Authorization": `Bearer ${SERVICE_KEY}`, "Content-Type": "application/json" },
                  body: JSON.stringify({ case_id: existing.id }),
                });
              } catch {}
              try {
                await fetch(`${SUPABASE_URL}/functions/v1/send-transcript`, {
                  method: "POST",
                  headers: { "Authorization": `Bearer ${SERVICE_KEY}`, "Content-Type": "application/json" },
                  body: JSON.stringify({ case_id: existing.id }),
                });
              } catch {}
            }

            return NextResponse.json({ ok: true, survey: true, rating: rating >= 1 && rating <= 5 ? rating : null });
          }

          // Estados donde la IA NUNCA debe actuar: escalado, ya tomado por humano, o cerrado
          const skipIAStates = ["escalado", "abierto", "cerrado", "resuelto", "calificacion_pendiente"];
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
                await sendWhatsAppMessages(phone || jid || "", iaData.reply, evoCfg, flowSettings);
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

    // ── AUTO-RELLENO: buscar casos previos del mismo teléfono para reutilizar datos ──
    let knownClient: Record<string, unknown> = {};
    let knownProblema: string | null = null;
    let knownMarca: string | null = null;
    let knownModelo: string | null = null;
    if (!isOutgoing && contactPhone) {
      const cleanPhone = contactPhone.replace(/[^0-9]/g, "");
      const phoneWithSuffix = `${cleanPhone}@s.whatsapp.net`;
      const { data: prevCases } = await supabase
        .from("sek_cases")
        .select("cliente, problema, marca, modelo, created_at")
        .or(`customer_phone.eq.${cleanPhone},customer_phone.eq.${cleanPhone}@s.whatsapp.net,customer_phone.eq.+${cleanPhone},customer_phone.eq.+${cleanPhone}@s.whatsapp.net`)
        .order("created_at", { ascending: false })
        .limit(20);

      if (prevCases && prevCases.length > 0) {
        // Buscar el caso más reciente que tenga datos útiles (nombre, correo o cuenta)
        for (const pc of prevCases) {
          const pcCliente = (pc.cliente && typeof pc.cliente === "object") ? pc.cliente as Record<string, unknown> : {};
          if (pcCliente.nombre || pcCliente.correo || pcCliente.cuenta) {
            knownClient = pcCliente;
            // Copiar también tema y descripcion del caso previo
            if (pcCliente.tema) knownClient.tema = pcCliente.tema;
            if (pcCliente.descripcion) knownClient.descripcion = pcCliente.descripcion;
            // Copiar problema/marca/modelo del caso previo
            if (pc.problema) knownProblema = pc.problema;
            if (pc.marca) knownMarca = pc.marca;
            if (pc.modelo) knownModelo = pc.modelo;
            console.log(`[evo-webhook] Auto-relleno: datos previos encontrados para ${cleanPhone} — nombre: ${pcCliente.nombre || "N/A"}, correo: ${pcCliente.correo || "N/A"}, cuenta: ${pcCliente.cuenta || "N/A"}, tema: ${pcCliente.tema || "N/A"}, problema: ${pc.problema || "N/A"}`);
            break;
          }
        }
      } else {
        console.log(`[evo-webhook] Auto-relleno: sin casos previos para ${cleanPhone}`);
      }
    }

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
        last_message_at: msgTime,
        last_message_preview: (text || "").slice(0, 200),
      });
    } else {
      const clienteData: Record<string, unknown> = {
        telefono: contactPhone,
        nombre: knownClient.nombre || null,
        correo: knownClient.correo || null,
        cuenta: knownClient.cuenta || null,
        whatsapp_name: pushName || null,
        telefono_real: senderPn || null,
        ...(knownClient.cedula ? { cedula: knownClient.cedula } : {}),
        ...(knownClient.equipo ? { equipo: knownClient.equipo } : {}),
        ...(knownClient.tema ? { tema: knownClient.tema } : {}),
        ...(knownClient.descripcion ? { descripcion: knownClient.descripcion } : {}),
        ...(mediaType && !mediaUrl && mediaDebug ? { debug_media: mediaDebug } : {}),
      };

      const hasKnownData = !!(knownClient.nombre || knownClient.correo || knownClient.cuenta);

      // ── Fuera de horario: tiene prioridad sobre el Modo No Atendido ──
      // Sin esta verificación, un cliente que escribe de madrugada recibía la
      // bienvenida prometiendo un agente que no está disponible.
      if (modoNoAtendido && !isOpenNowCR()) {
        const msgHorario = await getFueraHorarioMsg(supabase);
        // Se envía antes de insertar para poder guardar el messageId en el
        // historial; el caso queda cerrado y el eco del webhook ya no lo rellena.
        const horarioSent = await sendWhatsAppText(phone || jid || "", msgHorario, evoCfg, 500);
        const horarioEntry = {
          role: "ia",
          author: "Asistente Sekunet",
          time: new Date().toISOString(),
          content: msgHorario,
          fromMe: true,
          ...(horarioSent.messageId ? { messageId: horarioSent.messageId } : {}),
        };
        const nowIso = new Date().toISOString();
        const { data: newCase } = await supabase.from("sek_cases").insert({
          canal: "whatsapp",
          estado: "cerrado",
          prioridad: "media",
          customer_phone: contactPhone,
          cliente: clienteData,
          histcliente: [entry],
          histtecnico: [horarioEntry],
          closed_at: nowIso,
          title: pushName ? `WhatsApp — ${pushName}` : (knownClient.nombre ? `WhatsApp — ${knownClient.nombre}` : `WhatsApp — ${contactPhone}`),
          last_message_at: msgTime,
          last_message_preview: (text || "").slice(0, 200),
          ...(knownProblema ? { problema: knownProblema } : {}),
          ...(knownMarca ? { marca: knownMarca } : {}),
          ...(knownModelo ? { modelo: knownModelo } : {}),
        }).select("id").single();

        console.log(`[evo-webhook] Modo No Atendido + fuera de horario — caso ${newCase?.id} creado cerrado`);
        return NextResponse.json({ ok: true, unattended: true, fueraHorario: true });
      }

      // ── Modo No Atendido: crear como escalado, mandar bienvenida, sin IA ──
      if (modoNoAtendido) {
        const WELCOME_MSG = "Hola\n\nBienvenido al soporte técnico de Sekunet.\n\nAgradecemos su preferencia. En un momento será atendido por uno de nuestros agentes.";
        const welcomeSent = await sendWhatsAppText(phone || jid || "", WELCOME_MSG, evoCfg, 500);
        const welcomeEntry = {
          role: "ia",
          author: "Asistente Sekunet",
          time: new Date().toISOString(),
          content: WELCOME_MSG,
          fromMe: true,
          ...(welcomeSent.messageId ? { messageId: welcomeSent.messageId } : {}),
        };
        const { data: newCase } = await supabase.from("sek_cases").insert({
          canal: "whatsapp",
          estado: "escalado",
          prioridad: "media",
          customer_phone: contactPhone,
          cliente: clienteData,
          histcliente: [entry],
          histtecnico: [welcomeEntry],
          escalado_at: new Date().toISOString(),
          title: pushName ? `WhatsApp — ${pushName}` : (knownClient.nombre ? `WhatsApp — ${knownClient.nombre}` : `WhatsApp — ${contactPhone}`),
          last_message_at: msgTime,
          last_message_preview: (text || "").slice(0, 200),
          ...(knownProblema ? { problema: knownProblema } : {}),
          ...(knownMarca ? { marca: knownMarca } : {}),
          ...(knownModelo ? { modelo: knownModelo } : {}),
        }).select("id").single();

        console.log(`[evo-webhook] Modo No Atendido — caso ${newCase?.id} creado como escalado, bienvenida enviada`);
        return NextResponse.json({ ok: true, unattended: true });
      }

      const { data: newCase } = await supabase.from("sek_cases").insert({
        canal: "whatsapp",
        estado: "ia_atendiendo",
        prioridad: "media",
        customer_phone: contactPhone,
        cliente: clienteData,
        histcliente: [entry],
        histtecnico: [],
        title: pushName ? `WhatsApp — ${pushName}` : (knownClient.nombre ? `WhatsApp — ${knownClient.nombre}` : `WhatsApp — ${contactPhone}`),
        last_message_at: msgTime,
        last_message_preview: (text || "").slice(0, 200),
        ...(knownProblema ? { problema: knownProblema } : {}),
        ...(knownMarca ? { marca: knownMarca } : {}),
        ...(knownModelo ? { modelo: knownModelo } : {}),
      }).select("id").single();

      if (hasKnownData) {
        console.log(`[evo-webhook] Caso ${newCase?.id} creado con datos auto-rellenados: nombre=${knownClient.nombre || "N/A"}, correo=${knownClient.correo || "N/A"}, cuenta=${knownClient.cuenta || "N/A"}, problema=${knownProblema || "N/A"}, marca=${knownMarca || "N/A"}, modelo=${knownModelo || "N/A"}`);
      }

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
            await sendWhatsAppMessages(phone || jid || "", iaData.reply, evoCfg, flowSettings);
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
