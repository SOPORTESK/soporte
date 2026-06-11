import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/service";

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;

/* ============================================================
   POST /api/test/whatsapp
   Simula un mensaje entrante de WhatsApp desde un cliente.
   Crea o actualiza un caso con canal="whatsapp_test",
   guarda en histcliente y dispara la edge function ia-agent.
   ============================================================ */
export async function POST(req: NextRequest) {
  try {
    const { message, case_id, client_name, phone } = await req.json();
    if (!message || !message.trim()) {
      return NextResponse.json({ error: "Mensaje vacío" }, { status: 400 });
    }

    const adminDb = createServiceClient();
    const now = new Date().toISOString();
    let targetCaseId: string = case_id;

    if (!targetCaseId) {
      // Crear caso de prueba nuevo
      const { data: newCase, error } = await adminDb
        .from("sek_cases")
        .insert({
          canal: "whatsapp_test",
          estado: "ia_atendiendo",
          prioridad: "media",
          title: `Prueba WhatsApp — ${client_name || phone || "Cliente"}`,
          cliente: {
            nombre: client_name || "Cliente de Prueba",
            telefono: phone || "50600000000",
          },
          customer_phone: phone ? `${phone}@s.whatsapp.net` : "50600000000@s.whatsapp.net",
          histcliente: [{ role: "user", content: message.trim(), time: now }],
          histtecnico: [],
        })
        .select("id")
        .single();

      if (error || !newCase) {
        console.error("[test-whatsapp] Error creando caso:", error);
        return NextResponse.json({ error: "No se pudo crear el caso de prueba" }, { status: 500 });
      }
      targetCaseId = newCase.id;
    } else {
      // Actualizar caso existente
      const { data: existing } = await adminDb
        .from("sek_cases")
        .select("histcliente, estado, canal")
        .eq("id", targetCaseId)
        .maybeSingle();

      if (!existing || existing.canal !== "whatsapp_test") {
        return NextResponse.json({ error: "Caso de prueba no encontrado" }, { status: 404 });
      }

      // Si está cerrado, reabrir
      const est = String(existing.estado || "").toLowerCase();
      const updates: any = {
        histcliente: [...(existing.histcliente ?? []), { role: "user", content: message.trim(), time: now }],
      };
      if (est === "cerrado" || est === "resuelto") {
        updates.estado = "ia_atendiendo";
      }
      await adminDb.from("sek_cases").update(updates).eq("id", targetCaseId);
    }

    // Invocar ia-agent (igual que el simulador del admin)
    const iaRes = await fetch(`${SUPABASE_URL}/functions/v1/ia-agent`, {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${SERVICE_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ case_id: targetCaseId }),
    });

    if (!iaRes.ok) {
      const errText = await iaRes.text();
      console.error("[test-whatsapp] ia-agent error:", iaRes.status, errText);
      return NextResponse.json({
        error: "La IA no respondió",
        detail: errText.slice(0, 500),
        case_id: targetCaseId,
      }, { status: 502 });
    }

    const iaData = await iaRes.json().catch(() => ({}));

    // Refrescar caso para devolver historial completo
    const { data: refreshed } = await adminDb
      .from("sek_cases")
      .select("histtecnico, histcliente, estado, updated_at")
      .eq("id", targetCaseId)
      .maybeSingle();

    return NextResponse.json({
      case_id: targetCaseId,
      reply: iaData?.response || "",
      escalated: !!iaData?.escalated,
      closed: !!iaData?.closed,
      histtecnico: refreshed?.histtecnico ?? [],
      histcliente: refreshed?.histcliente ?? [],
      estado: refreshed?.estado ?? "ia_atendiendo",
    });
  } catch (e: any) {
    console.error("[test-whatsapp] POST error:", e);
    return NextResponse.json({ error: e?.message || "Error interno" }, { status: 500 });
  }
}

/* ============================================================
   GET /api/test/whatsapp?case_id=xxx
   Polling para recibir respuestas del agente humano.
   ============================================================ */
export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const caseId = searchParams.get("case_id");
    if (!caseId) {
      return NextResponse.json({ error: "case_id requerido" }, { status: 400 });
    }

    const adminDb = createServiceClient();
    const { data } = await adminDb
      .from("sek_cases")
      .select("histtecnico, histcliente, estado, updated_at")
      .eq("id", caseId)
      .eq("canal", "whatsapp_test")
      .maybeSingle();

    if (!data) {
      return NextResponse.json({ error: "Caso no encontrado" }, { status: 404 });
    }

    return NextResponse.json({
      histtecnico: data.histtecnico ?? [],
      histcliente: data.histcliente ?? [],
      estado: data.estado,
      updated_at: data.updated_at,
    });
  } catch (e: any) {
    console.error("[test-whatsapp] GET error:", e);
    return NextResponse.json({ error: e?.message || "Error interno" }, { status: 500 });
  }
}
