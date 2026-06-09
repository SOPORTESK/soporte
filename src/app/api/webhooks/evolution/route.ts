import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/service";

const get = (obj: any, path: string) => path.split(".").reduce((o, k) => (o && o[k] !== undefined ? o[k] : undefined), obj);

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
    "50660160394@s.whatsapp.net", // Tu bot
    "50660160394:1@s.whatsapp.net"
  ];

  let rawJid: string | null = null;
  const msg = get(payload, "data.messages.0");
  
  // Buscar pnJid en otros campos
  let possiblePnJid = get(msg, "verifiedBizName") || get(payload, "data.pnJid");

  if (msg) {
    const fromMe = !!get(msg, "key.fromMe");
    const remoteJid = get(msg, "key.remoteJid") || get(msg, "remoteJid");
    const participant = get(msg, "key.participant") || get(msg, "participant");
    
    if (fromMe) {
      // Mensaje saliente: el JID relevante es el destinatario (remoteJid)
      if (remoteJid && !selfJids.some(sj => remoteJid.includes(sj || "NON_EXISTENT"))) {
        rawJid = remoteJid;
      }
    } else if (participant && !selfJids.some(sj => participant.includes(sj || "NON_EXISTENT"))) {
      rawJid = participant;
    } else if (remoteJid && !selfJids.some(sj => remoteJid.includes(sj || "NON_EXISTENT"))) {
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
    for (const c of candidates) {
      if (c && !selfJids.some(sj => c.includes(sj || "NON_EXISTENT"))) {
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
  const supabase = createServiceClient();
  let payload: any = null;
  try { payload = await req.json(); } catch { payload = null; }

  if (!payload) return NextResponse.json({ ok: true });

  const EVO_URL = process.env.EVOLUTION_API_URL || "";
  const EVO_KEY = process.env.EVOLUTION_API_KEY || "";
  const EVO_INSTANCE = process.env.EVOLUTION_INSTANCE || "";

  // Detectar si es un mensaje saliente (enviado desde nuestro número)
  let isOutgoing = false;
  try {
    const fromMe = !!(payload?.data?.key?.fromMe || payload?.key?.fromMe || payload?.data?.messages?.[0]?.key?.fromMe);
    const pushNameRaw = get(payload, "data.pushName") || get(payload, "pushName");
    const isBotName = pushNameRaw && (pushNameRaw.includes("Sekunet") || pushNameRaw.includes("Soporte Sekunet"));
    const participant = get(payload, "data.key.participant") || get(payload, "key.participant") || "";
    const isOfficialNumber = participant.includes("50660160394");
    isOutgoing = !!(fromMe || isBotName || isOfficialNumber);
  } catch {}

  // Diagnóstico para ver por qué no reconoce el número
  const jid = await extractJid(payload, EVO_URL, EVO_KEY, EVO_INSTANCE);
  const phone = jidToPhone(jid);
  let text = extractText(payload);
  const msgObj = get(payload, "data.messages.0.message") || get(payload, "data.message") || get(payload, "message");
  
  let mediaType = "";
  let originalFileName = "";
  if (msgObj) {
    if (msgObj.audioMessage) mediaType = "audio";
    else if (msgObj.imageMessage) mediaType = "image";
    else if (msgObj.videoMessage) mediaType = "video";
    else if (msgObj.documentMessage) {
      mediaType = "document";
      originalFileName = msgObj.documentMessage.fileName || msgObj.documentMessage.title || "";
    }
    else if (msgObj.stickerMessage) mediaType = "sticker";
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
    console.log("[evo-webhook-debug] PAYLOAD COMPLETO:", JSON.stringify(payload, null, 2));
    return NextResponse.json({ ok: true });
  }

  // EXCEPCIÓN: Si viene pushName o senderPn en cualquier evento (ej. contacts.update), actualizamos el cliente
  const pushNameRaw = get(payload, "data.pushName") || get(payload, "pushName") || 
                   (Array.isArray(payload?.data) ? get(payload?.data[0], "pushName") : undefined);
  const pushName = (pushNameRaw === "Você" || pushNameRaw === "Tú") ? null : pushNameRaw;

  if (pushName || senderPn) {
    try {
      const { data: existing } = await supabase
        .from("sek_cases")
        .select("id, cliente, title")
        .eq("canal", "whatsapp")
        .eq("customer_phone", jid)
        .not("estado", "in", '("cerrado","resuelto")')
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();

      if (existing) {
        const currentCliente = typeof existing.cliente === "object" ? existing.cliente : {};
        const updatedCliente = { 
          ...currentCliente, 
          nombre: pushName || currentCliente.nombre,
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

          if (originalFileName?.toLowerCase().endsWith(".xml")) {
             mime = "text/xml";
          }

          console.log("[evo-webhook] base64 recibido", { mime, base64Length: base64.length });

          let finalExt = ext;
          if (originalFileName && originalFileName.includes(".")) {
             finalExt = originalFileName.split(".").pop() || ext;
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

  const now = new Date().toISOString();
  const entry = isOutgoing
    ? { role: "tecnico", time: now, content: text || "", author: "Soporte Sekunet", mediaUrl, mediaType: finalMediaType, fileName } as any
    : { role: "user", time: now, content: text || "", mediaUrl, mediaType: finalMediaType, fileName } as any;

  try {
    const { data: openCases } = await supabase
      .from("sek_cases")
      .select("id, histcliente, histtecnico, estado, customer_phone, cliente, title")
      .eq("canal", "whatsapp")
      .not("estado", "in", '("cerrado","resuelto")')
      .order("created_at", { ascending: false })
      .limit(50);



    let existing = null;
    if (openCases) {
      existing = openCases.find((c: any) => {
        if (c.customer_phone === jid) return true;
        if (phone && c.customer_phone === phone) return true;
        const t = typeof c.cliente === "object" ? c.cliente?.telefono : null;
        const tReal = typeof c.cliente === "object" ? c.cliente?.telefono_real : null;
        if (phone && (t === phone || tReal === phone || t === jid || tReal === jid)) return true;
        if (senderPn && (t === senderPn || tReal === senderPn || c.customer_phone === senderPn)) return true;
        return false;
      });
    }



    if (existing) {
      if (isOutgoing) {
        // Mensaje saliente: guardar en histtecnico
        const hist = Array.isArray(existing.histtecnico) ? existing.histtecnico : [];
        
        // Anti-duplicación: evitar que el webhook guarde el mensaje si la UI ya lo guardó
        const isDuplicate = hist.some((m: any) => {
          const timeDiff = Math.abs(new Date(now).getTime() - new Date(m.time).getTime());
          if (timeDiff < 20000) { // Ventana de 20 segundos
            // Si tiene texto, comparamos el texto
            if (m.content && text && m.content.trim() === text.trim()) return true;
            // Si es un archivo sin texto, comparamos el tipo (puede haber falsos positivos si mandan 2 fotos seguidas, pero es aceptable para evitar duplicados del bot)
            if (!text && !m.content && m.mediaType && finalMediaType && m.mediaType === finalMediaType) return true;
          }
          return false;
        });

        if (isDuplicate) {
          console.log("[evo-webhook] Ignorando mensaje saliente duplicado (la UI ya lo guardó)");
          return NextResponse.json({ ok: true, duplicate: true });
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
        const hist = Array.isArray(existing.histcliente) ? existing.histcliente : [];
        const updated = [...hist, entry];

        const { data: currentCase } = await supabase
          .from("sek_cases")
          .select("cliente, title")
          .eq("id", existing.id)
          .maybeSingle();

        const currentCliente = typeof currentCase?.cliente === "object" ? currentCase.cliente : {};
        const updatedCliente = { 
          ...currentCliente, 
          nombre: pushName || currentCliente.nombre,
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
            title: pushName ? `WhatsApp — ${pushName}` : (currentCase?.title || `WhatsApp — ${jid}`)
          })
          .eq("id", existing.id);
      }
      return NextResponse.json({ ok: true });
    }

    if (isOutgoing) {
      await supabase.from("sek_cases").insert({
        canal: "whatsapp",
        estado: "pendiente",
        prioridad: "media",
        customer_phone: jid,
        cliente: { telefono: phone || jid, nombre: null },
        histcliente: [],
        histtecnico: [entry],
        title: `WhatsApp — ${phone || jid}`,
        last_message_at: now,
        last_message_preview: (text || "").slice(0, 200),
      });
    } else {
      await supabase.from("sek_cases").insert({
        canal: "whatsapp",
        estado: "pendiente",
        prioridad: "media",
        customer_phone: jid,
        cliente: { 
          telefono: senderPn || phone || jid,
          nombre: pushName || null,
          telefono_real: senderPn || null
        },
        histcliente: [entry],
        histtecnico: [],
        title: pushName ? `WhatsApp — ${pushName}` : `WhatsApp — ${phone || jid}`,
        last_message_at: now,
        last_message_preview: (text || "").slice(0, 200),
      });
    }
    return NextResponse.json({ ok: true });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message || "error" }, { status: 500 });
  }
}

export async function GET() {
  return NextResponse.json({ ok: true });
}
