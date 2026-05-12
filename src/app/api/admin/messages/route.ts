import { createClient } from "@/lib/supabase/server";
import { NextRequest, NextResponse } from "next/server";

async function getSuperadmin() {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "No autenticado", supabase: null };
  const { data: agent } = await supabase
    .from("sek_agent_config").select("rol").ilike("email", user.email!).maybeSingle();
  if (agent?.rol !== "superadmin") return { error: "Solo superadmin puede realizar esta acción", supabase: null };
  return { error: null, supabase };
}

// DELETE /api/admin/messages — elimina todos los mensajes
// DELETE /api/admin/messages?id=123 — elimina un mensaje por ID
export async function DELETE(req: NextRequest) {
  const { error, supabase } = await getSuperadmin();
  if (error || !supabase) return NextResponse.json({ error }, { status: 403 });

  const id = req.nextUrl.searchParams.get("id");

  if (id) {
    const { error: delErr } = await supabase.from("sek_messages").delete().eq("id", id);
    if (delErr) return NextResponse.json({ error: delErr.message }, { status: 500 });
    return NextResponse.json({ ok: true, deleted: "one", id });
  }

  // Borrar todos
  const { error: delErr } = await supabase.from("sek_messages").delete().neq("id", 0);
  if (delErr) return NextResponse.json({ error: delErr.message }, { status: 500 });
  return NextResponse.json({ ok: true, deleted: "all" });
}

// GET /api/admin/messages — lista mensajes paginados
export async function GET(req: NextRequest) {
  const { error, supabase } = await getSuperadmin();
  if (error || !supabase) return NextResponse.json({ error }, { status: 403 });

  const page = parseInt(req.nextUrl.searchParams.get("page") || "1");
  const limit = 50;
  const from = (page - 1) * limit;

  const { data, error: fetchErr, count } = await supabase
    .from("sek_messages")
    .select("id, channel, from_number, from_name, content, status, case_id, created_at", { count: "exact" })
    .order("created_at", { ascending: false })
    .range(from, from + limit - 1);

  if (fetchErr) return NextResponse.json({ error: fetchErr.message }, { status: 500 });
  return NextResponse.json({ data, count, page, limit });
}
