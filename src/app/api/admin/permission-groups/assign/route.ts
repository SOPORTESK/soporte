import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  try {
    const supabase = createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: "No autorizado" }, { status: 401 });

    const { data: caller } = await supabase
      .from("sek_agent_config")
      .select("rol")
      .ilike("email", user.email!)
      .single();

    if (!caller || !["admin", "superadmin"].includes(caller.rol)) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const { email, groupId } = await req.json();
    if (!email || !groupId) {
      return NextResponse.json({ error: "Faltan parámetros" }, { status: 400 });
    }

    // Proteger superadmin
    const { data: target } = await supabase
      .from("sek_agent_config")
      .select("rol")
      .ilike("email", email)
      .single();

    if (target?.rol === "superadmin" && caller.rol !== "superadmin") {
      return NextResponse.json({ error: "No tienes permiso para modificar a un Superadministrador." }, { status: 403 });
    }

    if (groupId === "superadmin" && caller.rol !== "superadmin") {
      return NextResponse.json({ error: "Solo un Superadmin puede asignar ese grupo." }, { status: 403 });
    }

    const { data, error } = await supabase
      .from("sek_agent_config")
      .update({ rol: groupId, updated_at: new Date().toISOString() })
      .ilike("email", email)
      .select()
      .single();

    if (error) throw error;

    return NextResponse.json({ success: true, data });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}