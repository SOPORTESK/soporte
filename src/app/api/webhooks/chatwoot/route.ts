import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

function getSupabaseAdmin() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
      },
    }
  );
}

export async function GET() {
  return NextResponse.json({
    status: "ok",
    service: "sekunet-chatwoot-webhook",
    version: "1.0",
    time: new Date().toISOString(),
  });
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();

    // Validar evento de Chatwoot
    const event = body?.event;
    const messageType = body?.message_type;

    // Solo procesamos mensajes entrantes del cliente
    if (event !== "message_created" || messageType !== "incoming") {
      return NextResponse.json({ received: true, ignored: true, reason: "No es mensaje entrante" });
    }

    const conversation = body?.conversation || {};
    const conversationId = conversation?.id;
    const inbox = body?.inbox || {};
    const channelType = String(inbox?.channel_type || conversation?.channel || "").toLowerCase();

    // Determinar canal específico
    let canal = "chatwoot";
    if (channelType.includes("telegram")) canal = "telegram";
    else if (channelType.includes("facebook") || channelType.includes("messenger")) canal = "messenger";
    else if (channelType.includes("instagram")) canal = "instagram";

    const sender = body?.sender || {};
    const senderName = sender?.name || sender?.available_name || "Cliente " + canal.toUpperCase();
    const content = body?.content || "[Archivo o contenido multimedia]";
    const chatwootRef = `chatwoot_conv_${conversationId}`;

    const supabase = getSupabaseAdmin();

    // Buscar si ya existe un caso abierto para esta conversación de Chatwoot
    const { data: existingCase } = await supabase
      .from("sek_cases")
      .select("id, histcliente, unread_count, estado")
      .or(`channel_id.eq.${chatwootRef},title.ilike.%${chatwootRef}%`)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    const nowIso = new Date().toISOString();
    const newMsg = {
      role: "user",
      time: nowIso,
      content: content,
      author: senderName,
    };

    if (existingCase) {
      // Agregar mensaje al historial existente
      const hist = Array.isArray(existingCase.histcliente) ? [...existingCase.histcliente, newMsg] : [newMsg];
      await supabase
        .from("sek_cases")
        .update({
          histcliente: hist,
          last_message_at: nowIso,
          last_message_preview: content.slice(0, 100),
          unread_count: (existingCase.unread_count || 0) + 1,
          updated_at: nowIso,
          estado: existingCase.estado === "cerrado" || existingCase.estado === "resuelto" ? "abierto" : existingCase.estado,
        })
        .eq("id", existingCase.id);
    } else {
      // Crear nuevo caso en Sekunet
      await supabase.from("sek_cases").insert({
        canal: canal,
        channel_id: chatwootRef,
        title: `[${canal.toUpperCase()}] ${senderName} (#${conversationId})`,
        cliente: {
          nombre: senderName,
          email: sender?.email || "",
          telefono: sender?.phone_number || "",
          chatwoot_conversation_id: conversationId,
          chatwoot_inbox_id: inbox?.id,
        },
        estado: "abierto",
        prioridad: "media",
        histcliente: [newMsg],
        last_message_at: nowIso,
        last_message_preview: content.slice(0, 100),
        unread_count: 1,
        created_at: nowIso,
        updated_at: nowIso,
      });
    }

    return NextResponse.json({ success: true, canal, conversationId });
  } catch (error: any) {
    console.error("[chatwoot-webhook] Error procesando webhook:", error);
    return NextResponse.json({ error: error.message || "Error procesando webhook" }, { status: 500 });
  }
}
