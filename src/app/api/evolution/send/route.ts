import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/service";
import { getEvolutionConfig } from "@/lib/evolution-config";
import { normalizePhone, pickPhone } from "@/lib/evolution-phone";

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

function detectMediaType(mime: string | null | undefined): "image" | "video" | "audio" | "document" {
  const m = (mime || "").toLowerCase();
  if (m.startsWith("image/")) return "image";
  if (m.startsWith("video/")) return "video";
  if (m.startsWith("audio/")) return "audio";
  return "document";
}

export async function POST(req: NextRequest) {
  const { case_id, phone, text, mediaUrl, mediaType, fileName, entry } = await req.json().catch(() => ({}));
  if ((!case_id && !phone) || (!text && !mediaUrl)) return NextResponse.json({ error: "invalid" }, { status: 400 });

  const evoCfg = await getEvolutionConfig();
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
    const row = await supabase.from("sek_cases").select("id, canal, customer_phone, cliente").eq("id", case_id).maybeSingle();
    c = row.data;
    if (!c || String(c.canal).toLowerCase() !== "whatsapp") return NextResponse.json({ error: "case_not_whatsapp" }, { status: 400 });
    to = pickPhone(c);
  }
  if (!to) return NextResponse.json({ error: "no_phone" }, { status: 400 });

  try {
    let msgId: string | null = null;

    if (mediaUrl) {
      let finalMimeType = mediaType;
      if (!finalMimeType || finalMimeType === "application/octet-stream") {
        if (fileName && fileName.includes(".")) {
          const ext = fileName.split(".").pop();
          if (ext) finalMimeType = inferMimeFromExt(ext);
        }
      }

      const mediatype = detectMediaType(finalMimeType);
      const baseUrl = EVO_URL.replace(/\/$/, "");
      const instance = encodeURIComponent(EVO_INSTANCE);

      let evoEndpoint: string;
      let evoBody: Record<string, unknown>;

      if (mediatype === "audio") {
        evoEndpoint = `${baseUrl}/message/sendWhatsAppAudio/${instance}`;
        evoBody = { number: to, audio: mediaUrl };
      } else {
        evoEndpoint = `${baseUrl}/message/sendMedia/${instance}`;
        evoBody = {
          number: to,
          mediatype,
          mimetype: finalMimeType || undefined,
          caption: text || undefined,
          media: mediaUrl,
          fileName: fileName || undefined,
        };
      }

      const res = await fetch(evoEndpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json", apikey: EVO_KEY },
        body: JSON.stringify(evoBody),
      });
      const mediaRes = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(`evolution ${res.status}: ${JSON.stringify(mediaRes)}`);
      msgId = mediaRes?.key?.id || mediaRes?.messageId || null;
      console.log("[evo-send] Éxito enviando media. messageId:", msgId);
    } else {
      console.log("[evo-send] Intentando enviar texto a:", to);
      const res = await fetch(`${EVO_URL.replace(/\/$/, "")}/message/sendText/${encodeURIComponent(EVO_INSTANCE)}`, {
        method: "POST",
        headers: { "Content-Type": "application/json", apikey: EVO_KEY },
        body: JSON.stringify({ number: to, text })
      });
      const resData = await res.json().catch(() => ({}));
      if (!res.ok) {
        console.error("[evo-send] Error en respuesta de Evolution:", res.status, resData);
        throw new Error(`evolution ${res.status}: ${JSON.stringify(resData)}`);
      }
      msgId = resData?.key?.id || resData?.messageId || null;
      console.log("[evo-send] Éxito enviando mensaje. messageId:", msgId);
    }

    // WhatsApp confirmó la entrega. Ahora sí guardar en la BD con el ID real.
    if (msgId && case_id && entry) {
      const finalEntry = { ...entry, messageId: msgId, fromMe: true };
      const { error: appendErr } = await supabase.rpc("sek_append_hist", {
        p_case_id: String(case_id),
        p_entry: finalEntry as any,
        p_col: "histtecnico",
        p_preview: (text || fileName || "").slice(0, 200),
      });
      if (appendErr) {
        console.error("[evo-send] Error guardando en BD tras envío exitoso:", appendErr);
        // El mensaje SÍ se entregó a WhatsApp, pero no se pudo guardar en BD.
        // Lo reportamos pero no fallamos el response.
      }
    }

    return NextResponse.json({ ok: true, messageId: msgId });
  } catch (e: any) {
    console.error("[evo-send] ERROR FATAL ENVIANDO MENSAJE:", e);
    return NextResponse.json({ ok: false, error: e?.message || "send_failed" }, { status: 500 });
  }
}
