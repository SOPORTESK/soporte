import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/service";

function pickPhone(c: any): string | null {
  // 1. Usar customer_phone como prioridad
  const cust = (c?.customer_phone || "").toString().trim();
  if (cust) {
    if (cust.includes("@")) return cust;
    return `${cust.replace(/[^0-9]/g, "")}@s.whatsapp.net`;
  }
  
  // 2. Fallback a cliente.telefono_real o cliente.telefono
  if (typeof c?.cliente === "object") {
    const telReal = String(c.cliente?.telefono_real || "").trim();
    if (telReal) return telReal.includes("@") ? telReal : `${telReal.replace(/[^0-9]/g, "")}@s.whatsapp.net`;
    
    const tel = String(c.cliente?.telefono || "").trim();
    if (tel) return tel.includes("@") ? tel : `${tel.replace(/[^0-9]/g, "")}@s.whatsapp.net`;
  }
  
  return null;
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

  const EVO_URL = process.env.EVOLUTION_API_URL || "";
  const EVO_KEY = process.env.EVOLUTION_API_KEY || "";
  const EVO_INSTANCE = process.env.EVOLUTION_INSTANCE || "";
  if (!EVO_URL || !EVO_KEY || !EVO_INSTANCE) return NextResponse.json({ error: "not_configured" }, { status: 503 });

  const supabase = createServiceClient();
  const { data: c } = await supabase.from("sek_cases").select("id, canal, customer_phone, cliente").eq("id", case_id).maybeSingle();
  if (!c || String(c.canal).toLowerCase() !== "whatsapp") return NextResponse.json({ error: "case_not_whatsapp" }, { status: 400 });

  const to = pickPhone(c);
  if (!to) return NextResponse.json({ error: "no_phone" }, { status: 400 });

  try {
    if (mediaUrl) {
      const mediatype = detectMediaType(mediaType);
      const res = await fetch(`${EVO_URL.replace(/\/$/, "")}/message/sendMedia/${encodeURIComponent(EVO_INSTANCE)}` ,{
        method: "POST",
        headers: { "Content-Type": "application/json", apikey: EVO_KEY },
        body: JSON.stringify({
          number: to,
          mediatype,
          mimetype: mediaType || undefined,
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
    return NextResponse.json({ ok: false, error: e?.message || "send_failed" }, { status: 500 });
  }
}
