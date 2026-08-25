import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createClient as createAdminClient } from "@supabase/supabase-js";
import { invalidateAiConfigCache } from "@/lib/ai/config";

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
  const [{ data: providers, error: pErr }, { data: models, error: mErr }, { data: roles }] = await Promise.all([
    db.from("sek_ai_providers").select("*").order("orden"),
    db.from("sek_ai_models").select("*").order("provider_id").order("orden"),
    db.from("sek_ai_roles").select("*").order("orden"),
  ]);

  if (pErr || mErr) {
    return NextResponse.json({ error: pErr?.message || mErr?.message, providers: [], models: [] }, { status: 500 });
  }

  // Estado de la key derivado de los modelos ya validados:
  // - algún modelo UP        -> key funcionando
  // - todos DOWN por auth    -> key rechazada
  // - sin key                -> no configurada
  const authRe = /api[_ ]?key|unauthorized|invalid.*key|permission|401|403|credential/i;

  const safeProviders = (providers ?? []).map(p => {
    const own = (models ?? []).filter(m => m.provider_id === p.id);
    const up = own.filter(m => m.last_status === "up").length;
    const checked = own.filter(m => m.last_status).length;
    const authFails = own.filter(m => m.last_status === "down" && authRe.test(m.last_error ?? "")).length;

    let key_status: "valid" | "invalid" | "no-key" | "unchecked" = "unchecked";
    if (!p.api_key) key_status = "no-key";
    else if (up > 0) key_status = "valid";
    else if (checked > 0 && authFails === checked) key_status = "invalid";

    return {
      ...p,
      api_key: undefined,
      api_key_masked: maskKey(p.api_key),
      has_key: !!p.api_key,
      key_status,
      models_up: up,
      models_total: own.length,
    };
  });

  return NextResponse.json({ providers: safeProviders, models: models ?? [], roles: roles ?? [] });
}

// PATCH: actualizar API key o estado de un proveedor
export async function PATCH(req: NextRequest) {
  const auth = await requireAdmin();
  if (!auth.ok) return auth.res;

  const body = await req.json();
  const { provider_id, api_key, activo, base_url, nombre, docs_url } = body;
  if (!provider_id) return NextResponse.json({ error: "provider_id requerido" }, { status: 400 });

  const patch: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (api_key !== undefined) patch.api_key = api_key || null;
  if (activo !== undefined) patch.activo = activo;
  if (base_url !== undefined) patch.base_url = base_url || null;
  if (nombre !== undefined) patch.nombre = nombre;
  if (docs_url !== undefined) patch.docs_url = docs_url || null;

  const { error } = await admin().from("sek_ai_providers").update(patch).eq("id", provider_id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  invalidateAiConfigCache();
  return NextResponse.json({ success: true });
}

// POST: crear un nuevo proveedor
export async function POST(req: NextRequest) {
  const auth = await requireAdmin();
  if (!auth.ok) return auth.res;

  const body = await req.json();
  const { id, nombre, base_url, docs_url, api_key } = body;
  if (!id || !nombre) {
    return NextResponse.json({ error: "id y nombre son requeridos" }, { status: 400 });
  }

  // id en minúsculas, sin espacios
  const cleanId = String(id).trim().toLowerCase().replace(/\s+/g, "_");

  const { data: existing } = await admin().from("sek_ai_providers").select("id").eq("id", cleanId).maybeSingle();
  if (existing) {
    return NextResponse.json({ error: `Ya existe un proveedor con id "${cleanId}"` }, { status: 409 });
  }

  const { data, error } = await admin().from("sek_ai_providers").insert({
    id: cleanId,
    nombre: String(nombre).trim(),
    base_url: base_url?.trim() || null,
    docs_url: docs_url?.trim() || null,
    api_key: api_key?.trim() || null,
    activo: true,
    orden: 99,
  }).select("id").single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  invalidateAiConfigCache();
  return NextResponse.json({ success: true, id: data.id });
}

// DELETE: eliminar un proveedor (cascade elimina sus modelos)
export async function DELETE(req: NextRequest) {
  const auth = await requireAdmin();
  if (!auth.ok) return auth.res;

  const { searchParams } = new URL(req.url);
  const provider_id = searchParams.get("provider_id");
  if (!provider_id) return NextResponse.json({ error: "provider_id requerido" }, { status: 400 });

  const { error } = await admin().from("sek_ai_providers").delete().eq("id", provider_id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  invalidateAiConfigCache();
  return NextResponse.json({ success: true });
}
