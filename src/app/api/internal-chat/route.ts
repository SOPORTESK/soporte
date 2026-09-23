import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getChannelMessages, saveChannelMessage, markChannelMessagesAsRead } from "@/lib/internal-chat-db";
import type { InternalMessage } from "@/lib/internal-chat-types";
import { randomUUID } from "crypto";

export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  try {
    const supabase = createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user?.email) {
      return NextResponse.json({ error: "No autenticado" }, { status: 401 });
    }

    const channelId = req.nextUrl.searchParams.get("channelId");
    if (!channelId) {
      return NextResponse.json({ error: "channelId requerido" }, { status: 400 });
    }

    const messages = await getChannelMessages(channelId);

    // Auto-marcar como leídos al abrir el chat
    await markChannelMessagesAsRead(channelId, user.email);

    return NextResponse.json({ success: true, messages });
  } catch (err: any) {
    console.error("[GET /api/internal-chat] error:", err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const supabase = createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user?.email) {
      return NextResponse.json({ error: "No autenticado" }, { status: 401 });
    }

    const { data: agent } = await supabase
      .from("sek_agent_config")
      .select("nombre, apellido, avatar_url")
      .ilike("email", user.email)
      .maybeSingle();

    const fullName = [agent?.nombre, agent?.apellido].filter(Boolean).join(" ") || user.email;

    const body = await req.json();
    const { channelId, content, mediaUrl, mediaType, fileName, fileSize } = body;

    if (!channelId) {
      return NextResponse.json({ error: "channelId es obligatorio" }, { status: 400 });
    }

    if ((!content || !content.trim()) && !mediaUrl) {
      return NextResponse.json({ error: "El mensaje no puede estar vacío" }, { status: 400 });
    }

    const newMessage: InternalMessage = {
      id: `im_${Date.now()}_${randomUUID().slice(0, 8)}`,
      channelId,
      senderEmail: user.email.toLowerCase(),
      senderName: fullName,
      senderAvatar: agent?.avatar_url || null,
      content: (content || "").trim(),
      mediaUrl: mediaUrl || null,
      mediaType: mediaType || null,
      fileName: fileName || null,
      fileSize: fileSize || null,
      createdAt: new Date().toISOString(),
      readBy: [user.email.toLowerCase()],
    };

    const saved = await saveChannelMessage(channelId, newMessage);

    return NextResponse.json({ success: true, message: saved });
  } catch (err: any) {
    console.error("[POST /api/internal-chat] error:", err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
