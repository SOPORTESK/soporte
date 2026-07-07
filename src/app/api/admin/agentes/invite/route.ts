import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export async function POST(req: NextRequest) {
  try {
    const { email, nombre, apellido, rol } = await req.json();
    if (!email) return NextResponse.json({ error: "El email es obligatorio" }, { status: 400 });

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

    const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || "http://localhost:3100";

    // 1. Enviar invitación por email. Supabase Auth envía el correo con link de confirmación.
    const { data: inviteData, error: inviteError } = await supabaseAdmin.auth.admin.inviteUserByEmail(email, {
      redirectTo: `${siteUrl}/login`,
      data: { nombre, apellido }
    });

    if (inviteError) throw inviteError;

    // 2. Crear entrada en sek_agent_config (pre-registro del agente)
    const { error: dbError } = await supabaseAdmin
      .from("sek_agent_config")
      .insert({
        email,
        nombre,
        apellido,
        rol: rol || "tecnico"
      });

    if (dbError) throw dbError;

    return NextResponse.json({ success: true, user: inviteData.user });

  } catch (error: any) {
    console.error("Invite error:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
