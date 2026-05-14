import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createClient as createServiceClient } from "@supabase/supabase-js";

// Simulación FIEL: invoca la MISMA Edge Function ia-agent que atiende clientes
// reales en producción, usando un caso "sandbox" con canal=simulator. Así se
// ejercitan exactamente las mismas reglas (RAG, inventario, web, reglas
// inmutables, escalado, cierre, aprendizaje), sin contaminar producción.
export async function POST(req: NextRequest) {
  try {
    const { message, case_id: existingCaseId, reset } = await req.json();

    const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
    const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;
    if (!SUPABASE_URL || !SERVICE_KEY) {
      return NextResponse.json({ error: "Supabase no configurado" }, { status: 500 });
    }

    // Verificar autenticación del admin que llama
    const supabase = createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: "No autorizado" }, { status: 401 });
    }

    // Cliente con service_role para gestionar el caso sandbox
    const adminDb = createServiceClient(SUPABASE_URL, SERVICE_KEY);

    let caseId: string | null = existingCaseId || null;

    // RESET: borrar el caso sandbox anterior y empezar de cero
    if (reset && caseId) {
      await adminDb.from("sek_cases").delete().eq("id", caseId).eq("canal", "simulator");
      caseId = null;
    }

    // Si no hay mensaje, solo era reset; devolver ok
    if (!message || !message.trim()) {
      return NextResponse.json({ reply: "", case_id: null, reset: true });
    }

    const nowIso = new Date().toISOString();

    if (!caseId) {
      // Crear caso sandbox nuevo
      const userMsg = { role: "user", content: message, time: nowIso };
      const { data: newCase, error: insertErr } = await adminDb
        .from("sek_cases")
        .insert({
          canal: "simulator",
          estado: "ia_atendiendo",
          prioridad: "media",
          title: `Simulación · ${user.email || "admin"}`,
          cliente: {
            nombre: "Cliente Simulado",
            correo: user.email || "simulator@sekunet.com",
            simulator: true,
          },
          customer_phone: null,
          histcliente: [userMsg],
          histtecnico: [],
        })
        .select("id")
        .single();

      if (insertErr || !newCase) {
        console.error("[simulate] Error creando caso sandbox:", insertErr?.message);
        return NextResponse.json({ error: "No se pudo crear el caso de simulación" }, { status: 500 });
      }
      caseId = newCase.id;
    } else {
      // Caso existente: anexar mensaje del "cliente" al histcliente
      const { data: existing } = await adminDb
        .from("sek_cases")
        .select("histcliente, estado, canal")
        .eq("id", caseId)
        .maybeSingle();

      if (!existing || existing.canal !== "simulator") {
        return NextResponse.json({ error: "Caso sandbox no encontrado" }, { status: 404 });
      }

      // Si el caso ya está cerrado/escalado, devolver señal para que el cliente reinicie
      if (existing.estado === "cerrado" || existing.estado === "resuelto") {
        return NextResponse.json({
          reply: "(El caso de simulación ya fue cerrado por SEKA. Pulse 'Reiniciar' para iniciar una nueva simulación.)",
          case_id: caseId,
          closed: true,
        });
      }

      const newHist = [...(existing.histcliente ?? []), { role: "user", content: message, time: nowIso }];
      await adminDb.from("sek_cases").update({ histcliente: newHist }).eq("id", caseId);
    }

    // Invocar la Edge Function ia-agent (la misma que atiende clientes reales)
    const r = await fetch(`${SUPABASE_URL}/functions/v1/ia-agent`, {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${SERVICE_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ case_id: caseId }),
    });

    if (!r.ok) {
      const errText = await r.text();
      console.error("[simulate] Error invocando ia-agent:", r.status, errText);
      return NextResponse.json({
        error: `ia-agent respondió ${r.status}`,
        detail: errText.slice(0, 500),
        case_id: caseId,
      }, { status: 502 });
    }

    const data = await r.json().catch(() => ({}));
    let aiReply: string = data?.response || "";

    // Si ia-agent no devolvió texto (p.ej. modo manual: solo escala sin responder),
    // releer el caso y tomar el último mensaje del técnico.
    if (!aiReply) {
      const { data: refreshed } = await adminDb
        .from("sek_cases")
        .select("histtecnico, estado")
        .eq("id", caseId)
        .maybeSingle();
      const ht = (refreshed?.histtecnico ?? []) as Array<{ role: string; content: string }>;
      const lastTech = [...ht].reverse().find((m) => m && m.role !== "nota" && m.content);
      if (lastTech) aiReply = lastTech.content;
      else if (refreshed?.estado === "escalado") aiReply = "(SEKA escaló el caso a un agente humano. En producción aquí intervendría un técnico real.)";
    }

    return NextResponse.json({
      reply: aiReply || "(sin respuesta)",
      case_id: caseId,
      escalated: !!data?.escalated,
      closed: !!data?.closed,
    });
  } catch (error: any) {
    console.error("[simulate] Error:", error);
    return NextResponse.json({ error: error.message || "Error interno" }, { status: 500 });
  }
}
