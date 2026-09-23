import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getConversationsSummary } from "@/lib/internal-chat-db";

export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  try {
    const supabase = createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user?.email) {
      return NextResponse.json({ error: "No autenticado" }, { status: 401 });
    }

    const { data: allAgents } = await supabase
      .from("sek_agent_config")
      .select("email, nombre, apellido, avatar_url, rol, status")
      .eq("activo", true)
      .order("nombre", { ascending: true });

    const conversations = await getConversationsSummary(user.email, allAgents || []);

    const totalUnread = conversations.reduce((acc, c) => acc + c.unreadCount, 0);

    return NextResponse.json({
      success: true,
      conversations,
      totalUnread,
    });
  } catch (err: any) {
    console.error("[GET /api/internal-chat/conversations] error:", err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
