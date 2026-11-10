import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/service";
import { getEvolutionConfig } from "@/lib/evolution-config";
import { normalizePhone, pickPhone } from "@/lib/evolution-phone";
import { enqueueWaOutbox, generateQueuedMessageId } from "@/lib/wa-outbox";

export const dynamic = "force-dynamic";
export const fetchCache = "force-no-store";

function inferMimeFromExt(ext: string): string {
  const map: Record<string, string> = {
    xml: "text/xml",
    pdf: "application/pdf",
    doc: "application/msword",
    docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    xls: "application/vnd.ms-excel",
    xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    csv: "text/csv",
    txt: "text/plain",
    png: "image/png",
    jpg: "image/jpeg",
    jpeg: "image/jpeg",
    gif: "image/gif",
    mp4: "video/mp4",
    mp3: "audio/mpeg",
    ogg: "audio/ogg",
    wav: "audio/wav",
    zip: "application/zip",
    rar: "application/x-rar-compressed",
    exe: "application/x-msdownload",
    msi: "application/x-msi",
    dmg: "application/x-apple-diskimage",
    apk: "application/vnd.android.package-archive",
    ipa: "application/octet-stream",
  };
  return map[ext.toLowerCase()] || "application/octet-stream";
}

function detectMediaType(mime: string | null | undefined): "image" | "video" | "audio" | "document" {
  const m = (mime || "").toLowerCase();
  if (m.startsWith("image/")) return "image";
  if (m.startsWith("video/")) return "video";
  if (m.startsWith("audio/")) return "audio";
  return "document";
}

export async function POST(req: NextRequest) {
  const { case_id, phone, text, mediaUrl, mediaType, fileName, entry, quotedMessageId, quotedText, quotedFromMe } =
    await req.json().catch(() => ({}));
  if ((!case_id && !phone) || (!text && !mediaUrl)) return NextResponse.json({ error: "invalid" }, { status: 400 });

  let evoCfg = await getEvolutionConfig(false);
  if (!evoCfg.url || !evoCfg.apiKey || !evoCfg.instance) {
    evoCfg = await getEvolutionConfig(true);
  }
  const EVO_URL = evoCfg.url;
  const EVO_KEY = evoCfg.apiKey;
  const EVO_INSTANCE = evoCfg.instance;
  if (!EVO_URL || !EVO_KEY || !EVO_INSTANCE) return NextResponse.json({ error: "not_configured" }, { status: 503 });

  const supabase = createServiceClient();

  let to: string | null = null;
  let c: any = null;

  if (phone) {
    to = `${normalizePhone(phone)}@s.whatsapp.net`;
  } else {
    const row = await supabase
      .from("sek_cases")
      .select("id, canal, customer_phone, cliente, histcliente, histtecnico")
      .eq("id", case_id)
      .maybeSingle();
    c = row.data;
    if (!c || String(c.canal).toLowerCase() !== "whatsapp") return NextResponse.json({ error: "case_not_whatsapp" }, { status: 400 });
    to = pickPhone(c);
  }
  if (!to) return NextResponse.json({ error: "no_phone" }, { status: 400 });

  if (case_id && !c) {
    const row = await supabase
      .from("sek_cases")
      .select("id, canal, customer_phone, cliente, histcliente, histtecnico")
      .eq("id", case_id)
      .maybeSingle();
    c = row.data;
  }

  // Lista priorizada de URLs candidatas (conexión local directa primero cuando no esté en Vercel, luego túnel externo)
  const rawCandidates = [
    !process.env.VERCEL ? "http://127.0.0.1:28080" : "",
    !process.env.VERCEL ? "http://localhost:28080" : "",
    evoCfg.url,
    ...(evoCfg.candidates || []),
  ];
  const candidateUrls = Array.from(new Set(rawCandidates.map((u) => (u || "").replace(/\/$/, "")).filter(Boolean)));

  try {
    let msgId: string | null = null;

    // Cita / respuesta a mensaje previo en WhatsApp (requiere id, remoteJid y fromMe)
    let targetQuotedId = quotedMessageId || entry?.replyTo?.messageId;
    let targetQuotedText = quotedText || entry?.replyTo?.content || "";
    let targetQuotedFromMe = quotedFromMe !== undefined ? Boolean(quotedFromMe) : Boolean(entry?.replyTo?.fromMe);

    // Auto-resolver si no viene el messageId pero sí el texto citado
    if (!targetQuotedId && targetQuotedText && c) {
      try {
        const allMsgs = [
          ...(Array.isArray(c.histcliente) ? c.histcliente : []),
          ...(Array.isArray(c.histtecnico) ? c.histtecnico : []),
        ];
        const match = allMsgs.slice().reverse().find((m: any) => m && m.content && m.content.trim() === targetQuotedText.trim() && m.messageId);
        if (match) {
          targetQuotedId = match.messageId;
          targetQuotedFromMe = Boolean(match.fromMe || match.role === "tecnico" || match.role === "assistant");
          console.log("[evo-send] Cita vinculada automáticamente por texto:", { targetQuotedId, targetQuotedFromMe });
        }
      } catch {}
    }

    const quoted = targetQuotedId
      ? {
          key: {
            id: targetQuotedId,
            remoteJid: to,
            fromMe: targetQuotedFromMe,
            ...(targetQuotedFromMe ? {} : { participant: to }),
          },
          message: {
            conversation: targetQuotedText,
          },
        }
      : undefined;

    const startedAt = Date.now();
    const isVercel = Boolean(process.env.VERCEL);
    const mediaTimeoutMs = isVercel ? 5500 : 18000;
    const textTimeoutMs = isVercel ? 4200 : 10000;

    let sendSuccess = false;
    let lastError: any = null;
    let lastStatus = 0;
    let resolvedMediaType: string | undefined = mediaType || undefined;

    if (mediaUrl) {
      let finalMimeType = mediaType;
      if (!finalMimeType || finalMimeType === "application/octet-stream") {
        if (fileName && fileName.includes(".")) {
          const ext = fileName.split(".").pop();
          if (ext) finalMimeType = inferMimeFromExt(ext);
        }
      }
      resolvedMediaType = finalMimeType || mediaType || undefined;

      const mediatype = detectMediaType(finalMimeType);
      const instance = encodeURIComponent(EVO_INSTANCE);

      for (const baseUrl of candidateUrls) {
        if (isVercel && Date.now() - startedAt > 5800) break;
        let evoEndpoint: string;
        let evoBody: Record<string, unknown>;

        if (mediatype === "audio") {
          evoEndpoint = `${baseUrl}/message/sendWhatsAppAudio/${instance}`;
          evoBody = { number: to, audio: mediaUrl, ...(quoted ? { quoted } : {}) };
        } else {
          evoEndpoint = `${baseUrl}/message/sendMedia/${instance}`;
          evoBody = {
            number: to,
            mediatype,
            mimetype: finalMimeType || undefined,
            caption: text || undefined,
            media: mediaUrl,
            fileName: fileName || undefined,
            ...(quoted ? { quoted } : {}),
          };
        }

        try {
          console.log(`[evo-send] Intentando enviar media (${mediatype}) a ${to} vía ${baseUrl}...`);
          let res = await fetch(evoEndpoint, {
            method: "POST",
            headers: { "Content-Type": "application/json", apikey: EVO_KEY },
            body: JSON.stringify(evoBody),
            signal: AbortSignal.timeout(mediaTimeoutMs),
          });
          lastStatus = res.status;

          // Solo reintentar sin cita si Evolution respondió 400/422/500 (no en fallos de túnel 502/503/504/530)
          if (!res.ok && quoted && (res.status === 400 || res.status === 422 || res.status === 500) && (!isVercel || Date.now() - startedAt < 5000)) {
            console.warn(`[evo-send] Falló con cita en ${baseUrl}, reintentando media sin cita...`);
            const fallbackBody = { ...evoBody };
            delete fallbackBody.quoted;
            res = await fetch(evoEndpoint, {
              method: "POST",
              headers: { "Content-Type": "application/json", apikey: EVO_KEY },
              body: JSON.stringify(fallbackBody),
              signal: AbortSignal.timeout(mediaTimeoutMs),
            });
            lastStatus = res.status;
          }

          const mediaRes = await res.json().catch(() => ({}));
          if (res.ok) {
            msgId = mediaRes?.key?.id || mediaRes?.messageId || null;
            console.log(`[evo-send] Éxito enviando media vía ${baseUrl}. messageId:`, msgId);
            sendSuccess = true;
            break;
          } else {
            console.warn(`[evo-send] Error HTTP ${res.status} desde ${baseUrl}:`, mediaRes);
            lastError = new Error(`evolution ${res.status}: ${JSON.stringify(mediaRes)}`);
          }
        } catch (fetchErr: any) {
          console.warn(`[evo-send] Falló fetch hacia ${baseUrl}: ${fetchErr.message}. Probando siguiente candidato...`);
          lastError = fetchErr;
        }
      }
    } else {
      const sendTextBody: Record<string, unknown> = {
        number: to,
        text,
        ...(quoted ? { quoted } : {}),
      };

      for (const baseUrl of candidateUrls) {
        if (isVercel && Date.now() - startedAt > 5200) break;
        const evoEndpoint = `${baseUrl}/message/sendText/${encodeURIComponent(EVO_INSTANCE)}`;
        try {
          console.log(`[evo-send] Intentando enviar texto a ${to} vía ${baseUrl}...`);
          let res = await fetch(evoEndpoint, {
            method: "POST",
            headers: { "Content-Type": "application/json", apikey: EVO_KEY },
            body: JSON.stringify(sendTextBody),
            signal: AbortSignal.timeout(textTimeoutMs),
          });
          lastStatus = res.status;

          if (!res.ok && quoted && (res.status === 400 || res.status === 422 || res.status === 500) && (!isVercel || Date.now() - startedAt < 5000)) {
            console.warn(`[evo-send] Falló sendText con cita en ${baseUrl}, reintentando sin cita...`);
            res = await fetch(evoEndpoint, {
              method: "POST",
              headers: { "Content-Type": "application/json", apikey: EVO_KEY },
              body: JSON.stringify({ number: to, text }),
              signal: AbortSignal.timeout(textTimeoutMs),
            });
            lastStatus = res.status;
          }

          const resData = await res.json().catch(() => ({}));
          if (res.ok) {
            msgId = resData?.key?.id || resData?.messageId || null;
            console.log(`[evo-send] Éxito enviando mensaje vía ${baseUrl}. messageId:`, msgId);
            sendSuccess = true;
            break;
          } else {
            console.warn(`[evo-send] Error HTTP ${res.status} desde ${baseUrl}:`, resData);
            lastError = new Error(`evolution ${res.status}: ${JSON.stringify(resData)}`);
          }
        } catch (fetchErr: any) {
          console.warn(`[evo-send] Falló fetch hacia ${baseUrl}: ${fetchErr.message}. Probando siguiente candidato...`);
          lastError = fetchErr;
        }
      }

      if (!sendSuccess && (!isVercel || Date.now() - startedAt < 4800)) {
        const freshCfg = await getEvolutionConfig(true);
        const freshUrl = (freshCfg.url || "").replace(/\/$/, "");
        if (freshUrl && !candidateUrls.includes(freshUrl)) {
          try {
            const evoEndpoint = `${freshUrl}/message/sendText/${encodeURIComponent(freshCfg.instance || EVO_INSTANCE)}`;
            const res = await fetch(evoEndpoint, {
              method: "POST",
              headers: { "Content-Type": "application/json", apikey: freshCfg.apiKey || EVO_KEY },
              body: JSON.stringify({ number: to, text }),
              signal: AbortSignal.timeout(textTimeoutMs),
            });
            lastStatus = res.status;
            const resData = await res.json().catch(() => ({}));
            if (res.ok) {
              msgId = resData?.key?.id || resData?.messageId || null;
              sendSuccess = true;
            } else {
              lastError = new Error(`evolution ${res.status}: ${JSON.stringify(resData)}`);
            }
          } catch (e) {
            lastError = e;
          }
        }
      }
    }

    // Si falló por túnel/red/timeout (no rechazo 400 de WhatsApp), encolar en outbox local y persistir en BD
    if (!sendSuccess) {
      const canQueue = Boolean(to) && lastStatus !== 400;
      if (canQueue) {
        const queuedId = generateQueuedMessageId();
        if (case_id && entry) {
          const queuedEntry: Record<string, any> = {
            ...entry,
            messageId: queuedId,
            queued: true,
            fromMe: true,
          };
          if (targetQuotedId) {
            queuedEntry.replyTo = {
              ...(queuedEntry.replyTo || {}),
              messageId: targetQuotedId,
              content: targetQuotedText || queuedEntry.replyTo?.content || "",
              fromMe: targetQuotedFromMe,
              author: entry?.replyTo?.author || (targetQuotedFromMe ? "Soporte Sekunet" : "Cliente"),
            };
          }
          const { error: appendErr } = await supabase.rpc("sek_append_hist", {
            p_case_id: String(case_id),
            p_entry: queuedEntry as any,
            p_col: "histtecnico",
            p_preview: (text || fileName || "").slice(0, 200),
          });
          if (appendErr) {
            console.error("[evo-send] Error guardando mensaje encolado en BD:", appendErr);
          }
        }

        const enqueued = await enqueueWaOutbox(supabase, {
          id: queuedId,
          case_id: case_id ? String(case_id) : "",
          to,
          ...(text ? { text } : {}),
          ...(mediaUrl ? { mediaUrl } : {}),
          ...(resolvedMediaType ? { mediaType: resolvedMediaType } : {}),
          ...(fileName ? { fileName } : {}),
          ...(quoted ? { quoted } : {}),
          ...(!entry && text ? { matchContent: text } : {}),
          created_at: new Date().toISOString(),
          status: "pending",
          attempts: 0,
          last_error: lastError?.message || `status_${lastStatus}`,
        });

        console.warn(`[evo-send] Túnel/Evolution no disponible (${lastError?.message || lastStatus}). Mensaje encolado (outbox=${enqueued}): ${queuedId}`);
        return NextResponse.json({
          ok: true,
          queued: true,
          messageId: queuedId,
          id: queuedId,
          to,
        });
      }

      throw lastError || new Error("No se pudo entregar el mensaje a través de Evolution API");
    }

    // WhatsApp confirmó la entrega. Guardar en la BD (incluso si Evolution no devolvió messageId).
    if (case_id && entry) {
      const finalEntry: Record<string, any> = {
        ...entry,
        ...(msgId ? { messageId: msgId } : {}),
        fromMe: true,
      };
      if (targetQuotedId) {
        finalEntry.replyTo = {
          ...(finalEntry.replyTo || {}),
          messageId: targetQuotedId,
          content: targetQuotedText || finalEntry.replyTo?.content || "",
          fromMe: targetQuotedFromMe,
          author: entry?.replyTo?.author || (targetQuotedFromMe ? "Soporte Sekunet" : "Cliente"),
        };
      }
      const { error: appendErr } = await supabase.rpc("sek_append_hist", {
        p_case_id: String(case_id),
        p_entry: finalEntry as any,
        p_col: "histtecnico",
        p_preview: (text || fileName || "").slice(0, 200),
      });
      if (appendErr) {
        console.error("[evo-send] Error guardando en BD tras envío exitoso:", appendErr);
      }
    }

    return NextResponse.json({ ok: true, messageId: msgId });
  } catch (e: any) {
    console.error("[evo-send] ERROR FATAL ENVIANDO MENSAJE:", e);
    return NextResponse.json({ ok: false, error: e?.message || "send_failed" }, { status: 500 });
  }
}
