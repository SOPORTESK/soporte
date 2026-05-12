import { createClient } from "@/lib/supabase/server";
import { NextRequest, NextResponse } from "next/server";

// GET - Listar inventario con paginación
export async function GET(req: NextRequest) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  
  const { searchParams } = new URL(req.url);
  const page = parseInt(searchParams.get("page") || "1");
  const limit = parseInt(searchParams.get("limit") || "50");
  const offset = (page - 1) * limit;
  
  const { data, error, count } = await supabase
    .from("sek_inventario")
    .select("*", { count: "exact" })
    .order("created_at", { ascending: false })
    .range(offset, offset + limit - 1);
    
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  
  return NextResponse.json({ data, count, page, limit });
}

// POST - Crear item
export async function POST(req: NextRequest) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  
  // Verificar rol admin/superadmin
  const { data: agent } = await supabase
    .from("sek_agent_config")
    .select("rol")
    .ilike("email", user.email!)
    .single();
    
  if (!agent || !["admin", "superadmin"].includes(agent.rol)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  
  const body = await req.json();
  const { data, error } = await supabase
    .from("sek_inventario")
    .insert(body)
    .select()
    .single();
    
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  
  return NextResponse.json({ data });
}

// PATCH - Actualizar item
export async function PATCH(req: NextRequest) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  
  const { data: agent } = await supabase
    .from("sek_agent_config")
    .select("rol")
    .ilike("email", user.email!)
    .single();
    
  if (!agent || !["admin", "superadmin"].includes(agent.rol)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  
  const body = await req.json();
  const { id, ...updates } = body;
  
  const { data, error } = await supabase
    .from("sek_inventario")
    .update(updates)
    .eq("id", id)
    .select()
    .single();
    
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  
  return NextResponse.json({ data });
}

// DELETE - Eliminar item
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
  const id = searchParams.get("id");
  
  if (!id) return NextResponse.json({ error: "ID required" }, { status: 400 });
  
  const { error } = await supabase
    .from("sek_inventario")
    .delete()
    .eq("id", id);
    
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  
  return NextResponse.json({ success: true });
}
