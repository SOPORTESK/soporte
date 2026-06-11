import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/service";
import { getEvolutionConfig } from "@/lib/evolution-config";

function pickPhone(c: any): string | null {
  // 1. Prioridad: telefono_real (es el número verdadero desencriptado o vinculado manualmente)
  if (typeof c?.cliente === "object") {
    const telReal = String(c.cliente?.telefono_real || "").trim();
    if (telReal) return telReal.includes("@") ? telReal : `${telReal.replace(/[^0-9]/g, "")}@s.whatsapp.net`;
  }

  // 2. Fallback a customer_phone (puede ser un @lid o jid normal)
  const cust = (c?.customer_phone || "").toString().trim();
  if (cust) {
    if (cust.includes("@")) return cust;
    return `${cust.replace(/[^0-9]/g, "")}@s.whatsapp.net`;
  }
  
  // 3. Fallback a cliente.telefono
  if (typeof c?.cliente === "object") {
    const tel = String(c.cliente?.telefono || "").trim();
    if (tel) return tel.includes("@") ? tel : `${tel.replace(/[^0-9]/g, "")}@s.whatsapp.net`;
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
    "rar": "application/x-rar-compressed"
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
  const { case_id, text, mediaUrl, mediaType, fileName } = await req.json().catch(() => ({}));
  if (!case_id || (!text && !mediaUrl)) return NextResponse.json({ error: "invalid" }, { status: 400 });

  const evoCfg = await getEvolutionConfig();
  const EVO_URL = evoCfg.url;
  const EVO_KEY = evoCfg.apiKey;
  const EVO_INSTANCE = evoCfg.instance;
  if (!EVO_URL || !EVO_KEY || !EVO_INSTANCE) return NextResponse.json({ error: "not_configured" }, { status: 503 });

  const supabase = createServiceClient();
  const { data: c } = await supabase.from("sek_cases").select("id, canal, customer_phone, cliente").eq("id", case_id).maybeSingle();
  if (!c || String(c.canal).toLowerCase() !== "whatsapp") return NextResponse.json({ error: "case_not_whatsapp" }, { status: 400 });

  const to = pickPhone(c);
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
      if (!res.ok) throw new Error(`evolution ${res.status}`);
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
      console.log("[evo-send] Éxito enviando mensaje.");
    }
    return NextResponse.json({ ok: true });
  } catch (e: any) {
    console.error("[evo-send] ERROR FATAL ENVIANDO MENSAJE:", e);
    return NextResponse.json({ ok: false, error: e?.message || "send_failed" }, { status: 500 });
  }
}
