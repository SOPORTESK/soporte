import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export async function POST(req: NextRequest) {
  try {
    const { email, password, nombre, apellido, rol } = await req.json();

    // Usar SERVICE ROLE KEY para gestionar Auth
    const supabaseAdmin = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
      {
        auth: {
          autoRefreshToken: false,
          persistSession: false
        }
      }
    );

    // 1. Crear usuario en Auth
    const { data: authUser, error: authError } = await supabaseAdmin.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: { nombre, apellido }
    });

    if (authError) throw authError;

    // 2. Crear entrada en sek_agent_config
    const { error: dbError } = await supabaseAdmin
      .from("sek_agent_config")
      .insert({
        email,
        nombre,
        apellido,
        rol: rol || "tecnico"
      });

    if (dbError) throw dbError;

    return NextResponse.json({ success: true, user: authUser.user });

  } catch (error: any) {
    console.error("Invite error:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
