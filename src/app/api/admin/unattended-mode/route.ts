import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function GET() {
  try {
    const supabase = createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: "No autorizado" }, { status: 401 });

    const { data } = await supabase
      .from("sek_agent_config")
      .select("modo_no_atendido")
      .eq("email", "system_prompt@sekunet.com")
      .maybeSingle();

    return NextResponse.json({ modo_no_atendido: data?.modo_no_atendido ?? false });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const supabase = createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: "No autorizado" }, { status: 401 });

    const { data: agentRow } = await supabase
      .from("sek_agent_config")
      .select("rol")
      .ilike("email", user.email!)
      .maybeSingle();

    if (agentRow?.rol !== "superadmin") {
      return NextResponse.json({ error: "Solo el superadmin puede cambiar este ajuste." }, { status: 403 });
    }

    const { modo_no_atendido } = await req.json();
    if (typeof modo_no_atendido !== "boolean") {
      return NextResponse.json({ error: "Valor inválido" }, { status: 400 });
    }

    await supabase
      .from("sek_agent_config")
      .update({ modo_no_atendido })
      .eq("email", "system_prompt@sekunet.com");

    return NextResponse.json({ success: true, modo_no_atendido });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
