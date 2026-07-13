import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/service";
import { getEvolutionConfig } from "@/lib/evolution-config";

export const maxDuration = 60;

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

function detectMediaType(mime: string): "image" | "video" | "audio" | "document" {
  const m = mime.toLowerCase();
  if (m.startsWith("image/")) return "image";
  if (m.startsWith("video/")) return "video";
  if (m.startsWith("audio/")) return "audio";
  return "document";
}

export async function POST(req: NextRequest) {
  try {
    const { case_id, base64, mediaUrl, mimeType, fileName } = await req.json().catch(() => ({}));

    if (!case_id || (!base64 && !mediaUrl) || !mimeType || !fileName) {
      return NextResponse.json({ error: "Faltan parámetros" }, { status: 400 });
    }

    const evoCfg = await getEvolutionConfig();
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
    const baseUrl = evoCfg.url.replace(/\/$/, "");
    const instance = encodeURIComponent(evoCfg.instance);

    let evoBody: Record<string, unknown>;
    let evoEndpoint: string;

    if (mediaUrl) {
      // Archivo grande: enviar por URL pública (sin pasar base64 por Vercel)
      evoEndpoint = `${baseUrl}/message/sendMedia/${instance}`;
      evoBody = { number: to, mediatype, mimetype: mimeType, media: mediaUrl, fileName };
    } else {
      // Archivo pequeño: base64 directo
      const mediaData = base64.startsWith("data:") ? base64.split(",")[1] : base64;
      evoEndpoint = `${baseUrl}/message/sendMedia/${instance}`;
      evoBody = { number: to, mediatype, mimetype: mimeType, media: mediaData, fileName };
    }

    const res = await fetch(evoEndpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json", apikey: evoCfg.apiKey },
      body: JSON.stringify(evoBody),
    });

    if (!res.ok) {
      const errText = await res.text().catch(() => "");
      console.error("[send-base64] Evolution error:", res.status, errText);
      return NextResponse.json({ error: `Evolution ${res.status}: ${errText}` }, { status: 502 });
    }

    return NextResponse.json({ ok: true });
  } catch (e: any) {
    console.error("[send-base64] error:", e.message);
    return NextResponse.json({ error: e?.message || "Error inesperado" }, { status: 500 });
  }
}
