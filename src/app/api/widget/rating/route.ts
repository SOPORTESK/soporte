import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/service";

export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  try {
    const { session_id, rating } = await req.json().catch(() => ({}));

    if (!session_id || typeof rating !== "number" || rating < 1 || rating > 5) {
      return NextResponse.json({ error: "Datos inválidos" }, { status: 400 });
    }

    const supabase = createServiceClient();

    const { data: existing } = await supabase
      .from("sek_cases")
      .select("cliente")
      .eq("id", session_id)
      .eq("canal", "widget")
      .maybeSingle();

    if (!existing) {
      return NextResponse.json({ error: "Sesión no encontrada" }, { status: 404 });
    }

    const currentCliente = typeof existing.cliente === "object" && existing.cliente
      ? existing.cliente as Record<string, unknown>
      : {};

    const updatedCliente = {
      ...currentCliente,
      calificacion_cliente: rating,
      fecha_calificacion_cliente: new Date().toISOString(),
    };

    const { error } = await supabase
      .from("sek_cases")
      .update({ cliente: updatedCliente })
      .eq("id", session_id);

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    return NextResponse.json({ ok: true });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message ?? "Error inesperado" }, { status: 500 });
  }
}
