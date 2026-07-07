import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

function normalizeEmail(raw: string): string {
  return raw
    .toLowerCase()
    .trim()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "") // quitar tildes
    .replace(/ñ/g, "n")
    .replace(/[^a-z0-9._%+-@]/g, ""); // mantener caracteres válidos de email
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const email = normalizeEmail(body.email || "");
    const { nombre, apellido, rol } = body;
    if (!email || !email.includes("@")) return NextResponse.json({ error: "El email es obligatorio o tiene formato inválido" }, { status: 400 });

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

    // 1. Intentar enviar invitación por email. Si ya existe, enviar reset de contraseña.
    let authUser: any = null;
    let isExisting = false;
    const { data: inviteData, error: inviteError } = await supabaseAdmin.auth.admin.inviteUserByEmail(email, {
      redirectTo: `${siteUrl}/login`,
      data: { nombre, apellido }
    });

    if (inviteError) {
      const msg = inviteError.message || "";
      if (msg.toLowerCase().includes("already been registered") || msg.toLowerCase().includes("user already registered")) {
        isExisting = true;
        // Buscar el usuario existente
        const { data: usersData } = await supabaseAdmin.auth.admin.listUsers({});
        authUser = (usersData?.users || []).find((u: any) => u.email?.toLowerCase() === email);
      } else {
        throw inviteError;
      }
    } else {
      authUser = inviteData.user;
    }

    if (!authUser && !isExisting) {
      return NextResponse.json({ error: "No se pudo obtener el usuario de Auth" }, { status: 500 });
    }

    // 2. Crear/actualizar entrada en sek_agent_config
    const { error: dbError } = await supabaseAdmin
      .from("sek_agent_config")
      .upsert({
        email,
        nombre,
        apellido,
        rol: rol || "tecnico",
        updated_at: new Date().toISOString()
      }, { onConflict: "email" });

    if (dbError) throw dbError;

    return NextResponse.json({ success: true, user: authUser, existing: isExisting });

  } catch (error: any) {
    console.error("Invite error:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
