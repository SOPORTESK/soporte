import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/service";
import { blockContact, isContactBlocked } from "@/lib/blocked-contacts";

export const runtime = "nodejs";

const LIMITE_BLOQUEO = 5;

export async function POST(req: NextRequest) {
  try {
    const { cedula, phone, incrementar } = await req.json();
    if (!cedula && !phone) return NextResponse.json({ error: "Cédula o teléfono requerido" }, { status: 400 });

    const supabase = createServiceClient();

    const { data: cliente, error: fetchErr } = cedula
      ? await supabase
          .from("sek_clientes")
          .select("nombre, telefono, bloqueado, bloqueo_contador")
          .eq("cedula", cedula)
          .maybeSingle()
      : { data: null, error: null };

    if (fetchErr) return NextResponse.json({ error: fetchErr.message }, { status: 500 });

    // Solo verificar bloqueo (sin incrementar) — unificado en todos los canales
    if (!incrementar) {
      const blockedEntry = await isContactBlocked(supabase, {
        cedula: cedula || undefined,
        phone: phone || cliente?.telefono || undefined,
      });
      return NextResponse.json({ bloqueado: Boolean(cliente?.bloqueado || blockedEntry) });
    }

    if (!cedula) {
      return NextResponse.json({ bloqueado: false, contador: 0 });
    }

    // Incrementar contador
    const nuevoContador = (cliente?.bloqueo_contador ?? 0) + 1;
    const debeBloquear = nuevoContador >= LIMITE_BLOQUEO;

    const updates: Record<string, unknown> = { bloqueo_contador: nuevoContador };
    if (debeBloquear) {
      updates.bloqueado = true;
      updates.fecha_bloqueo = new Date().toISOString();
      updates.motivo_bloqueo = `Bloqueo automático: ${nuevoContador} calificaciones menores a 2 estrellas`;
      await blockContact(supabase, {
        cedula: String(cedula),
        phone: cliente?.telefono || phone || undefined,
        name: cliente?.nombre || undefined,
        reason: String(updates.motivo_bloqueo),
      });
    }

    await supabase.from("sek_clientes").update(updates).eq("cedula", cedula);

    return NextResponse.json({ bloqueado: debeBloquear, contador: nuevoContador });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message ?? "Error inesperado" }, { status: 500 });
  }
}
