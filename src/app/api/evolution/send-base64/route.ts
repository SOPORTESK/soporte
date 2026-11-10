import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/service";
import { getEvolutionConfig } from "@/lib/evolution-config";
import { pickPhone } from "@/lib/evolution-phone";
import { enqueueWaOutbox, generateQueuedMessageId } from "@/lib/wa-outbox";

export const dynamic = "force-dynamic";
export const fetchCache = "force-no-store";
export const maxDuration = 60;

function detectMediaType(mime: string): "image" | "video" | "audio" | "document" {
  const m = mime.toLowerCase();
  if (m.startsWith("image/")) return "image";
  if (m.startsWith("video/")) return "video";
  if (m.startsWith("audio/")) return "audio";
  return "document";
}

export async function POST(req: NextRequest) {
  try {
    const { case_id, base64, mediaUrl, mimeType, fileName, quotedMessageId, quotedText, quotedFromMe } = await req.json().catch(() => ({}));

    if (!case_id || (!base64 && !mediaUrl) || !mimeType || !fileName) {
      return NextResponse.json({ error: "Faltan parámetros" }, { status: 400 });
    }

    let evoCfg = await getEvolutionConfig(false);
    if (!evoCfg.url || !evoCfg.apiKey || !evoCfg.instance) {
      evoCfg = await getEvolutionConfig(true);
    }
    if (!evoCfg.url || !evoCfg.apiKey || !evoCfg.instance) {
      return NextResponse.json({ error: "Evolution no configurado" }, { status: 503 });
    }

    const supabase = createServiceClient();
    const { data: c } = await supabase
      .from("sek_cases")
      .select("id, canal, customer_phone, cliente")
      .eq("id", case_id)
      .maybeSingle();

    if (!c || String(c.canal).toLowerCase() !== "whatsapp") {
      return NextResponse.json({ error: "Caso no es WhatsApp" }, { status: 400 });
    }

    const to = pickPhone(c);
    if (!to) return NextResponse.json({ error: "Sin teléfono" }, { status: 400 });

    const mediatype = detectMediaType(mimeType);
    const candidateUrls = Array.from(new Set([
      !process.env.VERCEL ? "http://127.0.0.1:28080" : "",
      !process.env.VERCEL ? "http://localhost:28080" : "",
      (evoCfg.url || "").replace(/\/$/, ""),
      ...(evoCfg.candidates || []).map((u) => (u || "").replace(/\/$/, "")),
    ].filter(Boolean)));
    const instance = encodeURIComponent(evoCfg.instance);

    const isFromMe = quotedFromMe === true || quotedFromMe === "true";
    const quoted = quotedMessageId ? {
      key: {
        id: quotedMessageId,
        remoteJid: to,
        fromMe: isFromMe,
        ...(isFromMe ? {} : { participant: to }),
      },
      message: { conversation: quotedText || "" }
    } : undefined;

    let res: Response | null = null;
    let lastError: any = null;
    let lastStatus = 0;
    const startedAt = Date.now();
    const isVercel = Boolean(process.env.VERCEL);
    const reqTimeoutMs = isVercel ? 5500 : 18000;

    const trySendToUrl = async (baseUrl: string, apiKey: string, preferUrl = false): Promise<Response | null> => {
      let evoBody: Record<string, unknown>;
      let evoEndpoint: string;
      const useMediaUrl = (preferUrl || !base64) && mediaUrl;

      if (mediatype === "audio") {
        evoEndpoint = `${baseUrl}/message/sendWhatsAppAudio/${instance}`;
        if (useMediaUrl) {
          evoBody = { number: to, audio: mediaUrl, ...(quoted ? { quoted } : {}) };
        } else {
          const mediaData = base64.startsWith("data:") ? base64.split(",")[1] : base64;
          evoBody = { number: to, audio: mediaData, ...(quoted ? { quoted } : {}) };
        }
      } else if (useMediaUrl) {
        evoEndpoint = `${baseUrl}/message/sendMedia/${instance}`;
        evoBody = { number: to, mediatype, mimetype: mimeType, media: mediaUrl, fileName, ...(quoted ? { quoted } : {}) };
      } else {
        const mediaData = base64.startsWith("data:") ? base64.split(",")[1] : base64;
        evoEndpoint = `${baseUrl}/message/sendMedia/${instance}`;
        evoBody = { number: to, mediatype, mimetype: mimeType, media: mediaData, fileName, ...(quoted ? { quoted } : {}) };
      }

      try {
        let attemptRes = await fetch(evoEndpoint, {
          method: "POST",
          headers: { "Content-Type": "application/json", apikey: apiKey },
          body: JSON.stringify(evoBody),
          signal: AbortSignal.timeout(reqTimeoutMs),
        });
        lastStatus = attemptRes.status;

        if (!attemptRes.ok && quoted && (attemptRes.status === 400 || attemptRes.status === 422 || attemptRes.status === 500) && (!isVercel || Date.now() - startedAt < 5000)) {
          console.warn(`[send-base64] Falló con cita en ${baseUrl}, reintentando sin cita...`);
          const fallbackBody = { ...evoBody };
          delete fallbackBody.quoted;
          attemptRes = await fetch(evoEndpoint, {
            method: "POST",
            headers: { "Content-Type": "application/json", apikey: apiKey },
            body: JSON.stringify(fallbackBody),
            signal: AbortSignal.timeout(reqTimeoutMs),
          });
          lastStatus = attemptRes.status;
        }

        if (attemptRes.ok) {
          return attemptRes;
        }
        const errText = await attemptRes.text().catch(() => "");
        console.warn(`[send-base64] Error desde ${baseUrl}:`, attemptRes.status, errText);
        lastError = new Error(`Evolution ${attemptRes.status}: ${errText}`);
      } catch (fetchErr: any) {
        console.warn(`[send-base64] Falló conexión a ${baseUrl}:`, fetchErr.message);
        lastError = fetchErr;
      }
      return null;
    };

    for (const baseUrl of candidateUrls) {
      if (isVercel && Date.now() - startedAt > 5800) break;
      res = await trySendToUrl(baseUrl, evoCfg.apiKey);
      if (res && res.ok) break;
    }

    if ((!res || !res.ok) && (!isVercel || Date.now() - startedAt < 4800)) {
      const freshCfg = await getEvolutionConfig(true);
      const freshUrls = Array.from(new Set([
        (freshCfg.url || "").replace(/\/$/, ""),
        ...(freshCfg.candidates || []).map((u) => (u || "").replace(/\/$/, "")),
      ].filter((u) => u && !candidateUrls.includes(u))));

      for (const baseUrl of freshUrls) {
        if (isVercel && Date.now() - startedAt > 5800) break;
        res = await trySendToUrl(baseUrl, freshCfg.apiKey || evoCfg.apiKey);
        if (res && res.ok) break;
      }
    }

    if (!res || !res.ok) {
      if (mediaUrl && lastStatus !== 400) {
        const queuedId = generateQueuedMessageId();
        const enqueued = await enqueueWaOutbox(supabase, {
          id: queuedId,
          case_id: String(case_id),
          to,
          mediaUrl,
          mediaType: mimeType,
          fileName,
          ...(quoted ? { quoted } : {}),
          created_at: new Date().toISOString(),
          status: "pending",
          attempts: 0,
          last_error: lastError?.message || `status_${lastStatus}`,
        });
        console.warn(`[send-base64] Túnel no disponible (${lastError?.message || lastStatus}). Archivo encolado (outbox=${enqueued}): ${queuedId}`);
        return NextResponse.json({ ok: true, queued: true, messageId: queuedId, id: queuedId, to });
      }

      console.error("[send-base64] Todos los candidatos fallaron:", lastError?.message);
      const errStatus = lastStatus === 400 ? 400 : 502;
      return NextResponse.json({ error: lastError?.message || "Error al enviar multimedia a WhatsApp" }, { status: errStatus });
    }

    const mediaRes = await res.json().catch(() => ({}));
    const msgId = mediaRes?.key?.id || mediaRes?.messageId || null;

    return NextResponse.json({ ok: true, messageId: msgId });
  } catch (e: any) {
    console.error("[send-base64] error:", e.message);
    return NextResponse.json({ error: e?.message || "Error inesperado" }, { status: 500 });
  }
}
