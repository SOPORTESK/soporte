import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/service";
import { createClient } from "@/lib/supabase/server";

export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  try {
    const auth = createClient();
    const { data: { user } } = await auth.auth.getUser();
    if (!user?.email) return NextResponse.json({ error: "No autenticado" }, { status: 401 });

    const supabase = createServiceClient();
    const { data: agent } = await supabase
      .from("sek_agent_config")
      .select("rol")
      .ilike("email", user.email)
      .maybeSingle();

    if (!agent || !["admin", "superadmin"].includes(agent.rol)) {
      return NextResponse.json({ error: "Sin permisos" }, { status: 403 });
    }

    const { cedula } = await req.json();
    if (!cedula) return NextResponse.json({ error: "Cédula requerida" }, { status: 400 });

    const { error } = await supabase
      .from("sek_clientes")
      .update({
        bloqueado: false,
        bloqueo_contador: 0,
        fecha_bloqueo: null,
        motivo_bloqueo: null,
      })
      .eq("cedula", cedula);

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    return NextResponse.json({ ok: true });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message ?? "Error inesperado" }, { status: 500 });
  }
}
