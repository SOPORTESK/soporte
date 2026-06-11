import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/service";

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;

export async function POST(req: NextRequest) {
  try {
    const { nombre, telefono, canal, mensaje } = await req.json();
    if (!mensaje || !mensaje.trim()) {
      return NextResponse.json({ error: "Mensaje requerido" }, { status: 400 });
    }

    const adminDb = createServiceClient();
    const now = new Date().toISOString();
    const canalFinal = canal || "web";
    const jid = telefono ? `${telefono.replace(/\D/g, "")}@s.whatsapp.net` : null;

    const { data: newCase, error } = await adminDb
      .from("sek_cases")
      .insert({
        canal: canalFinal,
        estado: canalFinal === "whatsapp_test" ? "ia_atendiendo" : "pendiente",
        prioridad: "media",
        title: `${canalFinal === "whatsapp" ? "WhatsApp" : canalFinal === "whatsapp_test" ? "Prueba WhatsApp" : "Web"} — ${nombre || telefono || "Cliente"}`,
        cliente: {
          nombre: nombre || null,
          telefono: telefono || null,
        },
        customer_phone: jid,
        histcliente: [{ role: "user", content: mensaje.trim(), time: now }],
        histtecnico: [],
      })
      .select("id")
      .single();

    if (error || !newCase) {
      console.error("[cases/create] Error:", error);
      return NextResponse.json({ error: "No se pudo crear el caso" }, { status: 500 });
    }

    // Disparar ia-agent si es prueba o si es web con IA activa
    if (canalFinal === "whatsapp_test" || canalFinal === "simulator") {
      fetch(`${SUPABASE_URL}/functions/v1/ia-agent`, {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${SERVICE_KEY}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ case_id: newCase.id }),
      }).catch(() => {});
    }

    return NextResponse.json({ case_id: newCase.id, ok: true });
  } catch (e: any) {
    console.error("[cases/create] Error:", e);
    return NextResponse.json({ error: e?.message || "Error interno" }, { status: 500 });
  }
}
