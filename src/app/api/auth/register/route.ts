import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

function normalizeEmail(raw: string): string {
  return raw
    .toLowerCase()
    .trim()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/ñ/g, "n")
    .replace(/[^a-z0-9._%+-@]/g, "");
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const email = normalizeEmail(body.email || "");
    const { nombre, apellido, password } = body;

    if (!email || !email.includes("@")) {
      return NextResponse.json({ error: "El email es obligatorio o tiene formato inválido" }, { status: 400 });
    }
    if (!password || password.length < 6) {
      return NextResponse.json({ error: "La contraseña debe tener al menos 6 caracteres" }, { status: 400 });
    }
    if (!nombre || nombre.trim().length < 2) {
      return NextResponse.json({ error: "El nombre es obligatorio" }, { status: 400 });
    }

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

    // 1. Crear usuario en Auth con email confirmado
    const { data: authUser, error: authError } = await supabaseAdmin.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: { nombre, apellido }
    });

    if (authError) {
      throw authError;
    }

    // 2. Crear entrada en sek_agent_config con rol por defecto tecnico
    const { error: dbError } = await supabaseAdmin
      .from("sek_agent_config")
      .insert({
        email,
        nombre,
        apellido,
        rol: "tecnico"
      });

    if (dbError) {
      // Si falla la insercion, no es critico si es por duplicado
      if (!dbError.message?.toLowerCase().includes("duplicate")) {
        console.error("[register] Error creando agent config:", dbError);
      }
    }

    return NextResponse.json({ success: true, user: authUser.user });
  } catch (error: any) {
    console.error("Register error:", error);
    return NextResponse.json({ error: error.message || "No se pudo crear la cuenta" }, { status: 500 });
  }
}
