import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/service";

const MAX_AUDIO_BYTES = 15 * 1024 * 1024; // Gemini acepta inline_data hasta ~20 MB

// WhatsApp manda notas de voz en ogg/opus; el resto son subidas del agente.
function audioMime(mediaType: string | undefined, url: string): string {
  const t = String(mediaType || "");
  if (t.startsWith("audio/")) return t === "audio/webm" ? "audio/ogg" : t;
  const ext = url.split("?")[0].split(".").pop()?.toLowerCase() || "";
  const map: Record<string, string> = {
    ogg: "audio/ogg",
    opus: "audio/ogg",
    webm: "audio/ogg",
    mp3: "audio/mp3",
    m4a: "audio/mp4",
    aac: "audio/aac",
    wav: "audio/wav",
  };
  return map[ext] || "audio/ogg";
}

export async function POST(
  req: NextRequest,
  { params }: { params: { caseId: string; messageIndex: string } }
) {
  const geminiKey = process.env.GEMINI_API_KEY;
  if (!geminiKey) {
    return NextResponse.json({ ok: false, error: "GEMINI_API_KEY no configurada" }, { status: 500 });
  }

  const supabase = createServiceClient();
  const body = await req.json();
  const msgIndex = parseInt(params.messageIndex, 10);

  if (body?.historyType !== "histcliente" && body?.historyType !== "histtecnico") {
    return NextResponse.json({ ok: false, error: "historyType inválido" }, { status: 400 });
  }
  const historyType: "histcliente" | "histtecnico" = body.historyType;

  const { data: caseData, error: caseError } = await supabase
    .from("sek_cases")
    .select("id, histcliente, histtecnico")
    .eq("id", params.caseId)
    .single();

  if (caseError || !caseData) {
    return NextResponse.json({ ok: false, error: "Caso no encontrado" }, { status: 404 });
  }

  const history = Array.isArray(caseData[historyType]) ? caseData[historyType] : [];
  const message = history[msgIndex];
  if (!message || typeof message !== "object") {
    return NextResponse.json({ ok: false, error: "Mensaje no encontrado" }, { status: 404 });
  }

  // Ya transcrito: se devuelve lo guardado en vez de gastar cuota otra vez.
  if ((message as any).transcription) {
    return NextResponse.json({ ok: true, transcription: (message as any).transcription, cached: true });
  }

  const mediaUrl = (message as any).mediaUrl;
  if (!mediaUrl) {
    return NextResponse.json({ ok: false, error: "El mensaje no tiene audio" }, { status: 400 });
  }

  let base64: string;
  let mime: string;
  try {
    const audioRes = await fetch(mediaUrl);
    if (!audioRes.ok) throw new Error(`descarga falló (${audioRes.status})`);
    const buf = Buffer.from(await audioRes.arrayBuffer());
    if (buf.byteLength > MAX_AUDIO_BYTES) {
      return NextResponse.json({ ok: false, error: "El audio es demasiado largo para transcribir" }, { status: 413 });
    }
    base64 = buf.toString("base64");
    mime = audioMime((message as any).mediaType, mediaUrl);
  } catch (e: any) {
    console.error("[TRANSCRIBE] Error descargando audio:", e);
    return NextResponse.json({ ok: false, error: "No se pudo descargar el audio" }, { status: 502 });
  }

  let transcription = "";
  try {
    const res = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-3.1-flash-lite:generateContent?key=${geminiKey}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contents: [{
            parts: [
              { text: "Transcribe literalmente este audio en español. Devuelve únicamente el texto transcrito, sin comentarios, sin comillas y sin marcas de tiempo. Si el audio no tiene voz audible, responde exactamente: (audio sin voz audible)" },
              { inline_data: { mime_type: mime, data: base64 } },
            ],
          }],
          generationConfig: { temperature: 0, maxOutputTokens: 2048 },
        }),
      }
    );

    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      console.error("[TRANSCRIBE] Error de Gemini:", res.status, JSON.stringify(data).slice(0, 500));
      return NextResponse.json({ ok: false, error: data?.error?.message || `Gemini ${res.status}` }, { status: 502 });
    }

    transcription = String(data?.candidates?.[0]?.content?.parts?.[0]?.text || "").trim();
    if (!transcription) {
      return NextResponse.json({ ok: false, error: "Gemini no devolvió texto" }, { status: 502 });
    }
  } catch (e: any) {
    console.error("[TRANSCRIBE] Error llamando a Gemini:", e);
    return NextResponse.json({ ok: false, error: "Error conectando con Gemini" }, { status: 502 });
  }

  // Se relee el historial antes de escribir: entre la descarga y la respuesta de
  // Gemini pudo llegar un mensaje nuevo y no se debe pisar el array completo.
  const { data: fresh } = await supabase
    .from("sek_cases")
    .select(historyType)
    .eq("id", params.caseId)
    .single();

  const freshRow = fresh as any;
  const freshHistory = Array.isArray(freshRow?.[historyType]) ? [...freshRow[historyType]] : [...history];
  if (freshHistory[msgIndex] && typeof freshHistory[msgIndex] === "object") {
    freshHistory[msgIndex] = { ...freshHistory[msgIndex], transcription };
    const { error: updateError } = await supabase
      .from("sek_cases")
      .update({ [historyType]: freshHistory })
      .eq("id", params.caseId);
    if (updateError) {
      console.error("[TRANSCRIBE] Error guardando transcripción:", updateError);
    }
  }

  return NextResponse.json({ ok: true, transcription });
}
