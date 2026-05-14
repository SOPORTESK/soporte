// GET /api/admin/reset-operational-data/counts
// Devuelve los conteos actuales de datos operacionales (solo superadmin).
import { createClient } from "@/lib/supabase/server";
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

export async function GET() {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "No autenticado" }, { status: 401 });
  const { data: agent } = await supabase
    .from("sek_agent_config").select("rol").ilike("email", user.email!).maybeSingle();
  if (agent?.rol !== "superadmin") {
    return NextResponse.json({ error: "Solo superadmin" }, { status: 403 });
  }

  const [cases, clientes, messages, learnings] = await Promise.all([
    supabase.from("sek_cases").select("id", { count: "exact", head: true }),
    supabase.from("sek_clientes").select("id", { count: "exact", head: true }),
    supabase.from("sek_messages").select("id", { count: "exact", head: true }),
    supabase
      .from("sek_doc_chunks")
      .select("id", { count: "exact", head: true })
      .eq("source_label", "Aprendizaje de conversación"),
  ]);

  return NextResponse.json({
    counts: {
      cases: cases.count || 0,
      clientes: clientes.count || 0,
      messages: messages.count || 0,
      learnings: learnings.count || 0,
    },
  });
}
