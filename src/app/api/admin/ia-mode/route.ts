import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function GET() {
  try {
    const supabase = createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: "No autorizado" }, { status: 401 });

    const { data } = await supabase
      .from("sek_agent_config")
      .select("ia_activa")
      .eq("email", "system_prompt@sekunet.com")
      .maybeSingle();

    return NextResponse.json({ ia_activa: data?.ia_activa ?? true });
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

    const { ia_activa } = await req.json();
    if (typeof ia_activa !== "boolean") {
      return NextResponse.json({ error: "Valor inválido" }, { status: 400 });
    }

    await supabase
      .from("sek_agent_config")
      .update({ ia_activa })
      .eq("email", "system_prompt@sekunet.com");

    return NextResponse.json({ success: true, ia_activa });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
