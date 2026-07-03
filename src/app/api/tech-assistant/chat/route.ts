import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createClient as createServiceClient } from "@supabase/supabase-js";

export const dynamic = "force-dynamic";

interface TechMessage {
  role: "user" | "assistant";
  content: string;
  time: string;
}

export async function POST(req: NextRequest) {
  try {
    const { message, case_id, session_id } = await req.json();

    if (!message || typeof message !== "string" || !message.trim()) {
      return NextResponse.json({ error: "Mensaje requerido" }, { status: 400 });
    }

    const supabase = createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user?.email) {
      return NextResponse.json({ error: "No autenticado" }, { status: 401 });
    }

    // Verificar que sea staff
    const { data: agent } = await supabase
      .from("sek_agent_config")
      .select("email")
      .ilike("email", user.email)
      .maybeSingle();
    if (!agent) {
      return NextResponse.json({ error: "Acceso denegado" }, { status: 403 });
    }

    const serviceClient = createServiceClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    );

    // Recuperar o crear sesión de chat
    let chatId = session_id;
    let messages: TechMessage[] = [];

    if (chatId) {
      const { data: existing } = await serviceClient
        .from("sek_tech_assistant_chats")
        .select("messages")
        .eq("id", chatId)
        .eq("agent_id", user.email)
        .maybeSingle();
      if (existing) {
        messages = Array.isArray(existing.messages) ? existing.messages as TechMessage[] : [];
      } else {
        chatId = undefined;
      }
    }

    if (!chatId) {
      const { data: created, error: createErr } = await serviceClient
        .from("sek_tech_assistant_chats")
        .insert({ agent_id: user.email, case_id: case_id || null, messages: [] })
        .select("id")
        .single();
      if (createErr || !created) {
        return NextResponse.json({ error: createErr?.message || "Error creando sesión" }, { status: 500 });
      }
      chatId = created.id;
    }

    const now = new Date().toISOString();
    const userMsg: TechMessage = { role: "user", content: message.trim(), time: now };
    const updatedMessages = [...messages, userMsg];

    // Guardar mensaje del usuario
    await serviceClient
      .from("sek_tech_assistant_chats")
      .update({ messages: updatedMessages, case_id: case_id || null })
      .eq("id", chatId)
      .eq("agent_id", user.email);

    // Llamar ia-agent en modo técnico
    const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || "";
    const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || "";
    let responseText = "Disculpe, no pude obtener una respuesta en este momento.";

    if (SUPABASE_URL && SERVICE_KEY) {
      try {
        const iaRes = await fetch(`${SUPABASE_URL}/functions/v1/ia-agent`, {
          method: "POST",
          headers: {
            "Authorization": `Bearer ${SERVICE_KEY}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            mode: "tecnico",
            case_id: case_id || undefined,
            messages: updatedMessages.map(m => ({ role: m.role, content: m.content })),
          }),
        });
        if (iaRes.ok) {
          const iaData = await iaRes.json();
          responseText = iaData.response || responseText;
        } else {
          const errText = await iaRes.text();
          console.error("[tech-assistant] ia-agent error:", iaRes.status, errText);
        }
      } catch (e: any) {
        console.error("[tech-assistant] fetch ia-agent error:", e.message);
      }
    }

    const assistantMsg: TechMessage = { role: "assistant", content: responseText, time: new Date().toISOString() };
    const finalMessages = [...updatedMessages, assistantMsg];

    // Guardar respuesta del asistente
    await serviceClient
      .from("sek_tech_assistant_chats")
      .update({ messages: finalMessages })
      .eq("id", chatId)
      .eq("agent_id", user.email);

    return NextResponse.json({
      ok: true,
      session_id: chatId,
      response: responseText,
      messages: finalMessages,
    });
  } catch (e: any) {
    console.error("[tech-assistant] error:", e.message);
    return NextResponse.json({ error: e?.message || "Error inesperado" }, { status: 500 });
  }
}
