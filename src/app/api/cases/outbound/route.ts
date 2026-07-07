import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";
import { getEvolutionConfig } from "@/lib/evolution-config";

export const dynamic = "force-dynamic";

/** Intenta obtener el nombre de perfil de WhatsApp del número vía Evolution. */
async function fetchWhatsAppProfileName(cleanPhone: string): Promise<string> {
  try {
    const evoCfg = await getEvolutionConfig();
    if (!evoCfg.url || !evoCfg.apiKey || !evoCfg.instance) return "";
    const res = await fetch(`${evoCfg.url.replace(/\/$/, "")}/chat/fetchProfile/${encodeURIComponent(evoCfg.instance)}`, {
      method: "POST",
      headers: { "Content-Type": "application/json", apikey: evoCfg.apiKey },
      body: JSON.stringify({ number: cleanPhone }),
    });
    if (!res.ok) return "";
    const data = await res.json().catch(() => ({}));
    return String(data?.name || data?.pushName || data?.verifiedName || "").trim();
  } catch (e: any) {
    console.error("[outbound] fetchProfile error:", e?.message);
    return "";
  }
}

export async function POST(req: NextRequest) {
  try {
    const { channel, phone } = await req.json();

    if (!channel || !["whatsapp", "widget"].includes(channel)) {
      return NextResponse.json({ error: "Canal inválido" }, { status: 400 });
    }
    if (!phone || typeof phone !== "string" || !phone.trim()) {
      return NextResponse.json({ error: "Teléfono requerido" }, { status: 400 });
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
    if (cleanPhone.length < 8) {
      return NextResponse.json({ error: "Número inválido" }, { status: 400 });
    }

    // ── 1. Buscar caso EXISTENTE por número (sincronizar en vez de duplicar) ──
    const { data: existing } = await serviceClient
      .from("sek_cases")
      .select("id, assigned_to, canal")
      .neq("canal", "simulator")
      .ilike("customer_phone", `%${cleanPhone}%`)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (existing) {
      // Tomar el caso si aún no tiene agente asignado; no robar casos de otros.
      if (!existing.assigned_to) {
        await serviceClient
          .from("sek_cases")
          .update({ assigned_to: agent.email })
          .eq("id", existing.id);
      }
      return NextResponse.json({ ok: true, case_id: existing.id, phone: cleanPhone, existing: true });
    }

    // ── 2. Número NUEVO: crear caso con datos vacíos (o nombre de perfil WhatsApp) ──
    let profileName = "";
    if (channel === "whatsapp") {
      profileName = await fetchWhatsAppProfileName(cleanPhone);
    }
    const displayName = profileName || `+${cleanPhone}`;

    const cliente: Record<string, unknown> = {
      nombre: profileName || "",
      correo: "",
      telefono: cleanPhone,
      cuenta: "",
    };

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
        tags: ["saliente"],
        histcliente: [],
        histtecnico: [],
      })
      .select("id")
      .single();

    if (createError || !newCase) {
      console.error("[outbound] Error creando caso:", createError);
      return NextResponse.json({ error: createError?.message || "Error creando caso" }, { status: 500 });
    }

    return NextResponse.json({ ok: true, case_id: newCase.id, phone: cleanPhone, existing: false });
  } catch (e: any) {
    console.error("[outbound] error:", e.message);
    return NextResponse.json({ error: e?.message || "Error inesperado" }, { status: 500 });
  }
}
