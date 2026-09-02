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
    const { email, newPassword } = await req.json();
    const normalizedEmail = normalizeEmail(email || "");

    const { createClient: createServerClient } = require("@/lib/supabase/server");
    const serverSupabase = createServerClient();
    const { data: { user: callerUser } } = await serverSupabase.auth.getUser();
    if (!callerUser) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { data: caller } = await serverSupabase
      .from("sek_agent_config")
      .select("rol")
      .ilike("email", callerUser.email!)
      .single();

    if (!caller || !["admin", "superadmin"].includes(caller.rol)) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const { data: targetAgent } = await serverSupabase
      .from("sek_agent_config")
      .select("rol")
      .ilike("email", normalizedEmail)
      .single();

    if (targetAgent?.rol === "superadmin" && caller.rol !== "superadmin") {
      return NextResponse.json({ error: "No tienes permiso para restablecer la contraseña de un Superadministrador." }, { status: 403 });
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

    // 1. Buscar el ID del usuario por su email en Auth
    const { data: users, error: listError } = await supabaseAdmin.auth.admin.listUsers();
    if (listError) throw listError;

    const user = users.users.find(u => u.email?.toLowerCase() === normalizedEmail);
    if (!user) throw new Error("Usuario no encontrado en Auth");

    // 2. Actualizar contraseña y asegurar que el email esté confirmado
    const { error: updateError } = await supabaseAdmin.auth.admin.updateUserById(
      user.id,
      { password: newPassword, email_confirm: true }
    );

    if (updateError) throw updateError;

    return NextResponse.json({ success: true });

  } catch (error: any) {
    console.error("Reset password error:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
