import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";

export const dynamic = "force-dynamic";

let cachedModoNoAtendido: boolean | null = null;
let lastCacheTime = 0;
const CACHE_TTL_MS = 30000; // 30s cache

export async function GET() {
  try {
    const now = Date.now();
    if (cachedModoNoAtendido !== null && (now - lastCacheTime) < CACHE_TTL_MS) {
      return NextResponse.json({ modo_no_atendido: cachedModoNoAtendido });
    }

    const supabase = createServiceClient();
    const { data } = await supabase
      .from("sek_agent_config")
      .select("modo_no_atendido")
      .eq("email", "system_prompt@sekunet.com")
      .maybeSingle();

    const val = data?.modo_no_atendido ?? false;
    cachedModoNoAtendido = val;
    lastCacheTime = now;

    return NextResponse.json({ modo_no_atendido: val });
  } catch (e: any) {
    return NextResponse.json({ modo_no_atendido: cachedModoNoAtendido ?? false });
  }
}

export async function POST(req: NextRequest) {
  try {
    const supabase = createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: "No autorizado" }, { status: 401 });

    const { data: agentRow } = await supabase
      .from("sek_agent_config")
      .select("rol")
      .ilike("email", user.email!)
      .maybeSingle();

    if (!["admin", "superadmin"].includes(agentRow?.rol || "")) {
      return NextResponse.json({ error: "Solo el superadmin puede cambiar este ajuste." }, { status: 403 });
    }

    const { modo_no_atendido } = await req.json();
    if (typeof modo_no_atendido !== "boolean") {
      return NextResponse.json({ error: "Valor inválido" }, { status: 400 });
    }

    const svc = createServiceClient();
    await svc
      .from("sek_agent_config")
      .update({ modo_no_atendido })
      .eq("email", "system_prompt@sekunet.com");

    cachedModoNoAtendido = modo_no_atendido;
    lastCacheTime = Date.now();

    return NextResponse.json({ success: true, modo_no_atendido });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
