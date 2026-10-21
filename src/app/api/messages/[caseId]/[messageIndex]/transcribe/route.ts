import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/service";
import { transcribeAudio } from "@/lib/ai/vision";

export const dynamic = "force-dynamic";

export async function POST(
  req: NextRequest,
  { params }: { params: { caseId: string; messageIndex: string } }
) {
  const supabase = createServiceClient();
  const body = await req.json().catch(() => ({}));
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

  // Ya transcrito: se devuelve lo guardado
  if ((message as any).transcription) {
    return NextResponse.json({ ok: true, transcription: (message as any).transcription, cached: true });
  }

  const mediaUrl = (message as any).mediaUrl;
  if (!mediaUrl) {
    return NextResponse.json({ ok: false, error: "El mensaje no tiene audio" }, { status: 400 });
  }

  const transcription = await transcribeAudio(mediaUrl, (message as any).mediaType);
  if (!transcription) {
    return NextResponse.json({ ok: false, error: "No se pudo transcribir el audio" }, { status: 502 });
  }

  // Se relee el historial antes de escribir para no pisar cambios
  const { data: fresh } = await supabase
    .from("sek_cases")
    .select(historyType)
    .eq("id", params.caseId)
    .single();

  const freshRow = fresh as any;
  const freshHistory = Array.isArray(freshRow?.[historyType]) ? [...freshRow[historyType]] : [...history];
  if (freshHistory[msgIndex] && typeof freshHistory[msgIndex] === "object") {
    freshHistory[msgIndex] = {
      ...freshHistory[msgIndex],
      transcription,
      _visionAnalysis: `Transcripción de nota de voz: "${transcription}"`,
    };
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
