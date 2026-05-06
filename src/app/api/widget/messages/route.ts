import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/service";

export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const session_id = searchParams.get("session_id");

  if (!session_id) {
    return NextResponse.json({ error: "Falta session_id" }, { status: 400 });
  }

  const supabase = createServiceClient();

  const { data, error } = await supabase
    .from("sek_cases")
    .select("histcliente, histtecnico, estado, cliente")
    .eq("id", session_id)
    .eq("canal", "widget")
    .maybeSingle();

  if (error || !data) {
    return NextResponse.json({ error: "Sesión no encontrada" }, { status: 404 });
  }

  // Rechazar sesiones sin cédula (creadas antes del reset)
  const cliente = typeof data.cliente === "object" && data.cliente ? data.cliente as Record<string, unknown> : null;
  if (!cliente?.cedula) {
    return NextResponse.json({ error: "Sesión requiere re-autenticación con cédula" }, { status: 404 });
  }

  return NextResponse.json({
    histcliente: data.histcliente ?? [],
    histtecnico: data.histtecnico ?? [],
    estado: data.estado,
  });
}
