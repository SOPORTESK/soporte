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

    const { password } = body;
    if (!password || password.length < 6) {
      return NextResponse.json({ error: "La contraseña inicial es obligatoria y debe tener al menos 6 caracteres" }, { status: 400 });
    }

    // 1. Crear usuario en Auth directamente (flujo original que funciona sin SMTP)
    const { data: authUser, error: authError } = await supabaseAdmin.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: { nombre, apellido }
    });

    if (authError) {
      // Si ya existe, solo registramos/actualizamos en sek_agent_config
      const msg = authError.message || "";
      if (msg.toLowerCase().includes("already been registered") || msg.toLowerCase().includes("user already registered")) {
        const { data: usersData } = await supabaseAdmin.auth.admin.listUsers({});
        const existingUser = (usersData?.users || []).find((u: any) => u.email?.toLowerCase() === email);
        if (!existingUser) return NextResponse.json({ error: "No se pudo encontrar el usuario existente" }, { status: 500 });
      } else {
        throw authError;
      }
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

    return NextResponse.json({ success: true, user: authUser?.user || null });

  } catch (error: any) {
    console.error("Invite error:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
