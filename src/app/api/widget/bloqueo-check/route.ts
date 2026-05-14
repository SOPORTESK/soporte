import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/service";

export const runtime = "nodejs";

const LIMITE_BLOQUEO = 5;

export async function POST(req: NextRequest) {
  try {
    const { cedula, incrementar } = await req.json();
    if (!cedula) return NextResponse.json({ error: "Cédula requerida" }, { status: 400 });

    const supabase = createServiceClient();

    const { data: cliente, error: fetchErr } = await supabase
      .from("sek_clientes")
      .select("bloqueado, bloqueo_contador")
      .eq("cedula", cedula)
      .maybeSingle();

    if (fetchErr) return NextResponse.json({ error: fetchErr.message }, { status: 500 });

    // Solo verificar bloqueo (sin incrementar)
    if (!incrementar) {
      return NextResponse.json({ bloqueado: cliente?.bloqueado ?? false });
    }

    // Incrementar contador
    const nuevoContador = (cliente?.bloqueo_contador ?? 0) + 1;
    const debeBloquear = nuevoContador >= LIMITE_BLOQUEO;

    const updates: Record<string, unknown> = { bloqueo_contador: nuevoContador };
    if (debeBloquear) {
      updates.bloqueado = true;
      updates.fecha_bloqueo = new Date().toISOString();
      updates.motivo_bloqueo = `Bloqueo automático: ${nuevoContador} calificaciones menores a 2 estrellas`;
    }

    await supabase.from("sek_clientes").update(updates).eq("cedula", cedula);

    return NextResponse.json({ bloqueado: debeBloquear, contador: nuevoContador });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message ?? "Error inesperado" }, { status: 500 });
  }
}
