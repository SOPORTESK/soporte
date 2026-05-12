import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function POST(req: NextRequest) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "No autorizado" }, { status: 401 });

  const { status } = await req.json();
  const valid = ["online", "away", "busy", "offline"];
  if (!valid.includes(status)) return NextResponse.json({ error: "Estado inválido" }, { status: 400 });

  await supabase.from("sek_agent_config")
    .update({ status, last_seen_at: new Date().toISOString() })
    .ilike("email", user.email!);

  return NextResponse.json({ ok: true });
}
