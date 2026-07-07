import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";
import { getEvolutionConfig } from "@/lib/evolution-config";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  try {
    const { channel, phone, name, email, account, cedula, message } = await req.json();

    if (!channel || !["whatsapp", "widget"].includes(channel)) {
      return NextResponse.json({ error: "Canal inválido" }, { status: 400 });
    }
    if (!phone || typeof phone !== "string" || !phone.trim()) {
      return NextResponse.json({ error: "Teléfono requerido" }, { status: 400 });
    }
    if (!message || typeof message !== "string" || !message.trim()) {
      return NextResponse.json({ error: "Mensaje requerido" }, { status: 400 });
    }

    const supabase = createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user?.email) {
      return NextResponse.json({ error: "No autenticado" }, { status: 401 });
    }

    const serviceClient = createServiceClient();
    const { data: agent } = await serviceClient
      .from("sek_agent_config")
      .select("email, nombre, apellido")
      .eq("email", user.email)
      .maybeSingle();
    if (!agent) {
      return NextResponse.json({ error: "Acceso denegado" }, { status: 403 });
    }

    const cleanPhone = phone.replace(/[^0-9]/g, "");
    const displayName = name?.trim() || "Cliente";
    const agentName = `${agent.nombre || ""} ${agent.apellido || ""}`.trim() || agent.email;

    const cliente: Record<string, unknown> = {
      nombre: displayName,
      correo: email?.trim() || "",
      telefono: cleanPhone,
      cuenta: account?.trim() || "",
    };
    if (cedula?.trim()) cliente.cedula = cedula.trim();

    const now = new Date().toISOString();

    const { data: newCase, error: createError } = await serviceClient
      .from("sek_cases")
      .insert({
        title: `${channel === "whatsapp" ? "WhatsApp" : "Widget"} — ${displayName}`,
        canal: channel,
        estado: channel === "whatsapp" ? "abierto" : "ia_atendiendo",
        prioridad: "media",
        cliente,
        customer_phone: cleanPhone,
        assigned_to: agent.email,
        accepted_at: channel === "whatsapp" ? now : null,
        histcliente: [],
        histtecnico: [{
          role: "tecnico",
          author: agentName,
          content: message.trim(),
          time: now,
        }],
      })
      .select("id")
      .single();

    if (createError || !newCase) {
      console.error("[outbound] Error creando caso:", createError);
      return NextResponse.json({ error: createError?.message || "Error creando caso" }, { status: 500 });
    }

    if (channel === "whatsapp") {
      const evoCfg = await getEvolutionConfig();
      if (evoCfg.url && evoCfg.apiKey && evoCfg.instance) {
        try {
          const to = `${cleanPhone}@s.whatsapp.net`;
          const res = await fetch(`${evoCfg.url.replace(/\/$/, "")}/message/sendText/${encodeURIComponent(evoCfg.instance)}`, {
            method: "POST",
            headers: { "Content-Type": "application/json", apikey: evoCfg.apiKey },
            body: JSON.stringify({ number: to, text: message.trim() }),
          });
          if (!res.ok) {
            const body = await res.json().catch(() => ({}));
            console.error("[outbound] Evolution error:", res.status, body);
          }
        } catch (e: any) {
          console.error("[outbound] Error enviando WhatsApp:", e.message);
        }
      }
    }

    return NextResponse.json({ ok: true, case_id: newCase.id });
  } catch (e: any) {
    console.error("[outbound] error:", e.message);
    return NextResponse.json({ error: e?.message || "Error inesperado" }, { status: 500 });
  }
}
