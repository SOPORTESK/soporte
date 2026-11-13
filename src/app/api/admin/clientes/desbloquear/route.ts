import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/service";
import { createClient } from "@/lib/supabase/server";
import { unblockContact } from "@/lib/blocked-contacts";

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

    const { cedula, phone } = await req.json();
    if (!cedula && !phone) {
      return NextResponse.json({ error: "Cédula o teléfono requerido" }, { status: 400 });
    }

    await unblockContact(supabase, { cedula: cedula || undefined, phone: phone || undefined });

    return NextResponse.json({ ok: true });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message ?? "Error inesperado" }, { status: 500 });
  }
}
