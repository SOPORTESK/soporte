import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/service";

export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}));
    const { 
      session_id, 
      content, 
      role = "user",
      mediaUrl,
      mediaType,
      fileName
    } = body as Record<string, string>;

    if (!session_id || (!content?.trim() && !mediaUrl)) {
      return NextResponse.json({ error: "Faltan datos requeridos" }, { status: 400 });
    }

    const supabase = createServiceClient();

    const { data: existing, error: fetchErr } = await supabase
      .from("sek_cases")
      .select("id, histcliente")
      .eq("id", session_id)
      .eq("canal", "widget")
      .maybeSingle();

    if (fetchErr || !existing) {
      return NextResponse.json({ error: "Sesión no encontrada" }, { status: 404 });
    }

    const entry = {
      role,
      time: new Date().toISOString(),
      content: content?.trim() || fileName || "Archivo adjunto",
      mediaUrl,
      mediaType,
      fileName
    };

    const newHist = [...(Array.isArray(existing.histcliente) ? existing.histcliente : []), entry];

    const { error: updateErr } = await supabase
      .from("sek_cases")
      .update({ histcliente: newHist })
      .eq("id", session_id);

    if (updateErr) {
      return NextResponse.json({ error: updateErr.message }, { status: 500 });
    }

    return NextResponse.json({ ok: true, entry });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message ?? "Error inesperado" }, { status: 500 });
  }
}
