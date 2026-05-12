import { createClient } from "@/lib/supabase/server";
import { NextRequest, NextResponse } from "next/server";

// GET - Listar agentes
export async function GET() {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  
  const { data, error } = await supabase
    .from("sek_agent_config")
    .select("*")
    .order("created_at", { ascending: false });
    
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  
  return NextResponse.json({ data });
}

// PATCH - Actualizar rol de agente
export async function PATCH(req: NextRequest) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  
  const { data: currentAgent } = await supabase
    .from("sek_agent_config")
    .select("rol")
    .ilike("email", user.email!)
    .single();
    
  if (!currentAgent || currentAgent.rol !== "superadmin") {
    return NextResponse.json({ error: "Forbidden - Superadmin only" }, { status: 403 });
  }
  
  const body = await req.json();
  const { email, rol, ...updates } = body;
  
  const { data, error } = await supabase
    .from("sek_agent_config")
    .update({ rol, ...updates })
    .ilike("email", email)
    .select()
    .single();
    
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  
  return NextResponse.json({ data });
}

// DELETE - Eliminar agente
export async function DELETE(req: NextRequest) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  
  const { data: agent } = await supabase
    .from("sek_agent_config")
    .select("rol")
    .ilike("email", user.email!)
    .single();
    
  if (!agent || agent.rol !== "superadmin") {
    return NextResponse.json({ error: "Forbidden - Superadmin only" }, { status: 403 });
  }
  
  const { searchParams } = new URL(req.url);
  const email = searchParams.get("email");
  
  if (!email) return NextResponse.json({ error: "Email required" }, { status: 400 });
  
  const { error } = await supabase
    .from("sek_agent_config")
    .delete()
    .ilike("email", email);
    
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  
  return NextResponse.json({ success: true });
}
