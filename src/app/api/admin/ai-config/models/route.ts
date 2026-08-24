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
  return { ok: true as const };
}

// POST: crear modelo
export async function POST(req: NextRequest) {
  const auth = await requireAdmin();
  if (!auth.ok) return auth.res;

  const { provider_id, modelo, proposito, usado_en, orden, roles } = await req.json();
  if (!provider_id || !modelo) {
    return NextResponse.json({ error: "provider_id y modelo son requeridos" }, { status: 400 });
  }

  const { data, error } = await admin().from("sek_ai_models").insert({
    provider_id,
    modelo: modelo.trim(),
    proposito: proposito?.trim() || null,
    usado_en: Array.isArray(usado_en) ? usado_en : [],
    orden: orden ?? 99,
    roles: Array.isArray(roles) ? roles : [],
  }).select().single();

  if (error) {
    const msg = error.code === "23505" ? "Ese modelo ya existe para este proveedor" : error.message;
    return NextResponse.json({ error: msg }, { status: 400 });
  }
  invalidateAiConfigCache();
  return NextResponse.json({ success: true, model: data });
}

// PATCH: actualizar modelo
export async function PATCH(req: NextRequest) {
  const auth = await requireAdmin();
  if (!auth.ok) return auth.res;

  const { id, modelo, proposito, usado_en, activo, orden, roles } = await req.json();
  if (!id) return NextResponse.json({ error: "id requerido" }, { status: 400 });

  const patch: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (modelo !== undefined) patch.modelo = modelo.trim();
  if (proposito !== undefined) patch.proposito = proposito?.trim() || null;
  if (usado_en !== undefined) patch.usado_en = usado_en;
  if (activo !== undefined) patch.activo = activo;
  if (orden !== undefined) patch.orden = orden;
  if (roles !== undefined) patch.roles = roles;

  const { error } = await admin().from("sek_ai_models").update(patch).eq("id", id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  invalidateAiConfigCache();
  return NextResponse.json({ success: true });
}

// DELETE: eliminar modelo
export async function DELETE(req: NextRequest) {
  const auth = await requireAdmin();
  if (!auth.ok) return auth.res;

  const { searchParams } = new URL(req.url);
  const id = searchParams.get("id");
  if (!id) return NextResponse.json({ error: "id requerido" }, { status: 400 });

  const { error } = await admin().from("sek_ai_models").delete().eq("id", id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  invalidateAiConfigCache();
  return NextResponse.json({ success: true });
}
