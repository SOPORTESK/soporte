import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/service";

export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}));
    const { session_id, nombre, correo, telefono, cedula } = body as Record<string, string>;

    const supabase = createServiceClient();

    if (session_id) {
      const { data, error } = await supabase
        .from("sek_cases")
        .select("id, histcliente, histtecnico, estado, cliente")
        .eq("id", session_id)
        .eq("canal", "widget")
        .maybeSingle();

      if (!error && data) {
        return NextResponse.json({ session_id: String(data.id), case: data });
      }
    }

    const cliente = {
      nombre: nombre || "Visitante web",
      correo: correo || "",
      telefono: telefono || "",
      cedula: cedula || "",
    };

    const { data: newCase, error: insertErr } = await supabase
      .from("sek_cases")
      .insert({
        title: `Chat web — ${cliente.nombre}`,
        canal: "widget",
        estado: "abierto",
        prioridad: "media",
        cliente,
        histcliente: [],
        histtecnico: [],
      })
      .select("id, histcliente, histtecnico, estado, cliente")
      .single();

    if (insertErr) {
      console.error("[widget/session] insert error:", insertErr.message);
      return NextResponse.json({ error: insertErr.message }, { status: 500 });
    }

    return NextResponse.json({ session_id: String(newCase.id), case: newCase }, { status: 201 });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message ?? "Error inesperado" }, { status: 500 });
  }
}
