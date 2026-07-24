import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

// GET — cargar el flujo activo
export async function GET() {
  const supabase = createClient();

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { data: flow } = await supabase
    .from("sek_flow_configs")
    .select("*")
    .eq("activo", true)
    .maybeSingle();

  return NextResponse.json({ flow });
}

// PUT — guardar flujo
export async function PUT(req: NextRequest) {
  const supabase = createClient();

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json();
  const { id, nombre, flow_data } = body;

  if (id) {
    const { data, error } = await supabase
      .from("sek_flow_configs")
      .update({ nombre, flow_data, updated_at: new Date().toISOString() })
      .eq("id", id)
      .select()
      .single();

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ flow: data });
  } else {
    const { data, error } = await supabase
      .from("sek_flow_configs")
      .insert({ nombre, flow_data, activo: true })
      .select()
      .single();

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ flow: data });
  }
}
