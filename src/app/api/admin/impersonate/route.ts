import { createClient } from "@/lib/supabase/server";
import { createClient as createServiceClient } from "@supabase/supabase-js";
import { NextResponse, type NextRequest } from "next/server";

export async function POST(req: NextRequest) {
  try {
    // Service role client — no depende de cookies de sesión
    const serviceClient = createServiceClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    );

    // 1. Verificar sesión actual con el cliente de cookies
    const supabase = createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: "No autorizado" }, { status: 401 });

    const { data: caller } = await serviceClient
      .from("sek_agent_config")
      .select("rol")
      .ilike("email", user.email!)
      .maybeSingle();

    if (caller?.rol !== "superadmin") {
      return NextResponse.json({ error: "Solo superadmin puede impersonar" }, { status: 403 });
    }

    // 2. Obtener el email objetivo (JSON)
    let body: any;
    try { body = await req.json(); } catch { return NextResponse.json({ error: "Body inválido" }, { status: 400 }); }
    const email = body.email as string;
    const agentName = (body.agentName as string) || email;
    if (!email) {
      return NextResponse.json({ error: "Email requerido" }, { status: 400 });
    }

    // Solo validar que el agente objetivo existe
    const { data: targetAgent } = await serviceClient
      .from("sek_agent_config")
      .select("email, nombre, apellido")
      .ilike("email", email.toLowerCase())
      .maybeSingle();

    if (!targetAgent) {
      return NextResponse.json({ error: "Agente no encontrado" }, { status: 404 });
    }

    const fullName = [targetAgent.nombre, targetAgent.apellido].filter(Boolean).join(" ");

    return NextResponse.json({
      agentName: fullName || email,
      email: targetAgent.email,
    });
  } catch (err: any) {
    console.error("[impersonate] error:", err);
    return NextResponse.json({ error: err?.message || "Error interno" }, { status: 500 });
  }
}
