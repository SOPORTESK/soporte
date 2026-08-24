import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createClient as createAdminClient } from "@supabase/supabase-js";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

function admin() {
  return createAdminClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } }
  );
}

async function requireAdmin() {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { ok: false as const, res: NextResponse.json({ error: "No autenticado" }, { status: 401 }) };
  const { data: agent } = await supabase.from("sek_agent_config").select("rol").ilike("email", user.email!).maybeSingle();
  if (!["admin", "superadmin"].includes(agent?.rol ?? "")) {
    return { ok: false as const, res: NextResponse.json({ error: "Sin permisos" }, { status: 403 }) };
  }
  return { ok: true as const, email: user.email! };
}

function maskKey(key: string | null): string | null {
  if (!key) return null;
  if (key.length <= 10) return "•".repeat(key.length);
  return `${key.slice(0, 6)}${"•".repeat(Math.min(key.length - 10, 20))}${key.slice(-4)}`;
}

// GET: listar proveedores + modelos
export async function GET() {
  const auth = await requireAdmin();
  if (!auth.ok) return auth.res;

  const db = admin();
  const [{ data: providers, error: pErr }, { data: models, error: mErr }] = await Promise.all([
    db.from("sek_ai_providers").select("*").order("orden"),
    db.from("sek_ai_models").select("*").order("provider_id").order("orden"),
  ]);

  if (pErr || mErr) {
    return NextResponse.json({ error: pErr?.message || mErr?.message, providers: [], models: [] }, { status: 500 });
  }

  // Enmascarar keys, nunca devolver la key completa
  const safeProviders = (providers ?? []).map(p => ({
    ...p,
    api_key: undefined,
    api_key_masked: maskKey(p.api_key),
    has_key: !!p.api_key,
  }));

  return NextResponse.json({ providers: safeProviders, models: models ?? [] });
}

// PATCH: actualizar API key o estado de un proveedor
export async function PATCH(req: NextRequest) {
  const auth = await requireAdmin();
  if (!auth.ok) return auth.res;

  const body = await req.json();
  const { provider_id, api_key, activo, base_url } = body;
  if (!provider_id) return NextResponse.json({ error: "provider_id requerido" }, { status: 400 });

  const patch: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (api_key !== undefined) patch.api_key = api_key || null;
  if (activo !== undefined) patch.activo = activo;
  if (base_url !== undefined) patch.base_url = base_url;

  const { error } = await admin().from("sek_ai_providers").update(patch).eq("id", provider_id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ success: true });
}
