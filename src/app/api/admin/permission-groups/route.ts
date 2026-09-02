import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getActiveGroups } from "@/lib/permissions";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const supabase = createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: "No autorizado" }, { status: 401 });

    const [groups, { data: agents }] = await Promise.all([
      getActiveGroups(),
      supabase.from("sek_agent_config").select("email, nombre, apellido, rol, avatar_url").neq("email", "system_prompt@sekunet.com"),
    ]);

    return NextResponse.json({ groups, agents: agents || [] });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}

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

    const { groups } = await req.json();
    if (!Array.isArray(groups)) {
      return NextResponse.json({ error: "Formato inválido" }, { status: 400 });
    }

    const { error } = await supabase
      .from("sek_app_settings")
      .upsert({
        key: "permission_groups",
        value: JSON.stringify(groups),
        updated_at: new Date().toISOString(),
      }, { onConflict: "key" });

    if (error) throw error;

    return NextResponse.json({ success: true, groups });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}