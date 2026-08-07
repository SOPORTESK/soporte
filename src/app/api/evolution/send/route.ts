import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/service";
import { getEvolutionConfig } from "@/lib/evolution-config";

function normalizePhone(raw: string): string {
  const digits = raw.replace(/[^0-9]/g, "");
  // Números de Costa Rica móviles tienen 8 dígitos; si no tiene prefijo, agregar 506.
  if (digits.length === 8 && !raw.replace(/[^0-9]/g, "").startsWith("506")) return `506${digits}`;
  return digits;
}

function pickPhone(c: any): string | null {
  // 1. Prioridad: telefono_real (es el número verdadero desencriptado o vinculado manualmente)
  if (typeof c?.cliente === "object") {
    const telReal = String(c.cliente?.telefono_real || "").trim();
    if (telReal) return telReal.includes("@") ? telReal : `${normalizePhone(telReal)}@s.whatsapp.net`;
  }

  // 2. Fallback a customer_phone (puede ser un @lid o jid normal)
  const cust = (c?.customer_phone || "").toString().trim();
  if (cust) {
    if (cust.includes("@")) return cust;
    return `${normalizePhone(cust)}@s.whatsapp.net`;
  }
  
  // 3. Fallback a cliente.telefono
  if (typeof c?.cliente === "object") {
    const tel = String(c.cliente?.telefono || "").trim();
    if (tel) return tel.includes("@") ? tel : `${normalizePhone(tel)}@s.whatsapp.net`;
  }
  
  return null;
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

function detectMediaType(mime: string | null | undefined): "image" | "video" | "audio" | "document" {
  const m = (mime || "").toLowerCase();
  if (m.startsWith("image/")) return "image";
  if (m.startsWith("video/")) return "video";
  if (m.startsWith("audio/")) return "audio";
  return "document";
}

// El eco de los mensajes salientes no siempre llega al webhook, así que el
// messageId se guarda aquí mismo. Sin él no se puede revocar el mensaje después.
// Se relee el historial justo antes de escribir para no pisar mensajes nuevos.
async function persistMessageId(
  supabase: any,
  caseId: string,
  messageId: string,
  match: { text?: string; mediaUrl?: string }
): Promise<void> {
  try {
    const { data } = await supabase.from("sek_cases").select("histtecnico").eq("id", caseId).maybeSingle();
    const hist = Array.isArray(data?.histtecnico) ? [...data.histtecnico] : [];
    const wanted = String(match.text || "").trim();
    console.log("[evo-send] persistMessageId buscando:", { caseId, wanted: wanted.slice(0, 50), histLength: hist.length, lastEntryContent: String(hist[hist.length-1]?.content || "").slice(0, 50) });

    // Se recorre de atrás hacia adelante: el mensaje recién enviado es el último.
    for (let i = hist.length - 1; i >= 0; i--) {
      const e = hist[i];
      if (typeof e !== "object" || e === null || e.messageId) continue;
      const sameMedia = match.mediaUrl && e.mediaUrl === match.mediaUrl;
      const sameText = wanted && String(e.content || "").trim() === wanted;
      if (!sameMedia && !sameText) continue;

      hist[i] = { ...e, messageId, fromMe: true };
      const { error } = await supabase.from("sek_cases").update({ histtecnico: hist }).eq("id", caseId);
      if (error) console.error("[evo-send] Error guardando messageId:", error);
      console.log("[evo-send] messageId guardado en histtecnico[" + i + "]:", messageId);
      return;
    }
    console.warn("[evo-send] No se encontró el mensaje en histtecnico para guardar el messageId. Buscando:", wanted.slice(0, 80));
  } catch (e) {
    console.error("[evo-send] Excepción guardando messageId:", e);
  }
}

export async function POST(req: NextRequest) {
  const { case_id, phone, text, mediaUrl, mediaType, fileName } = await req.json().catch(() => ({}));
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
    if (mediaUrl) {
      let finalMimeType = mediaType;
      if (!finalMimeType || finalMimeType === "application/octet-stream") {
        if (fileName && fileName.includes(".")) {
          const ext = fileName.split(".").pop();
          if (ext) finalMimeType = inferMimeFromExt(ext);
        }
      }

      const mediatype = detectMediaType(finalMimeType);
      const res = await fetch(`${EVO_URL.replace(/\/$/, "")}/message/sendMedia/${encodeURIComponent(EVO_INSTANCE)}` ,{
        method: "POST",
        headers: { "Content-Type": "application/json", apikey: EVO_KEY },
        body: JSON.stringify({
          number: to,
          mediatype,
          mimetype: finalMimeType || undefined,
          caption: text || undefined,
          media: mediaUrl,
          fileName: fileName || undefined,
        })
      });
      const mediaRes = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(`evolution ${res.status}: ${JSON.stringify(mediaRes)}`);
      const msgId = mediaRes?.key?.id || mediaRes?.messageId || null;
      console.log("[evo-send] Éxito enviando media. messageId:", msgId);
      if (msgId && case_id) await persistMessageId(supabase, case_id, msgId, { text, mediaUrl });
      return NextResponse.json({ ok: true, messageId: msgId });
    } else {
      console.log("[evo-send] Intentando enviar texto a:", to);
      const res = await fetch(`${EVO_URL.replace(/\/$/, "")}/message/sendText/${encodeURIComponent(EVO_INSTANCE)}` ,{
        method: "POST",
        headers: { "Content-Type": "application/json", apikey: EVO_KEY },
        body: JSON.stringify({ number: to, text })
      });
      const resData = await res.json().catch(() => ({}));
      if (!res.ok) {
        console.error("[evo-send] Error en respuesta de Evolution:", res.status, resData);
        throw new Error(`evolution ${res.status}: ${JSON.stringify(resData)}`);
      }
      const msgId = resData?.key?.id || resData?.messageId || null;
      console.log("[evo-send] Éxito enviando mensaje. messageId:", msgId);
      if (msgId && case_id) await persistMessageId(supabase, case_id, msgId, { text });
      return NextResponse.json({ ok: true, messageId: msgId });
    }
  } catch (e: any) {
    console.error("[evo-send] ERROR FATAL ENVIANDO MENSAJE:", e);
    return NextResponse.json({ ok: false, error: e?.message || "send_failed" }, { status: 500 });
  }
}
