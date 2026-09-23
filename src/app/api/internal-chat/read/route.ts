import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { markChannelMessagesAsRead } from "@/lib/internal-chat-db";

export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  try {
    const supabase = createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user?.email) {
      return NextResponse.json({ error: "No autenticado" }, { status: 401 });
    }

    const { channelId } = await req.json();
    if (!channelId) {
      return NextResponse.json({ error: "channelId requerido" }, { status: 400 });
    }

    await markChannelMessagesAsRead(channelId, user.email);

    return NextResponse.json({ success: true });
  } catch (err: any) {
    console.error("[POST /api/internal-chat/read] error:", err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
