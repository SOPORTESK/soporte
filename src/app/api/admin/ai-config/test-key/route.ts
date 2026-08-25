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
  return { ok: true as const };
}

const listEndpoints: Record<string, string> = {
  groq: "https://api.groq.com/openai/v1/models",
  openrouter: "https://openrouter.ai/api/v1/models",
  nvidia: "https://integrate.api.nvidia.com/v1/models",
  openai: "https://api.openai.com/v1/models",
};

// POST: validar la API KEY de un proveedor (no un modelo) listando sus modelos
export async function POST(req: NextRequest) {
  const auth = await requireAdmin();
  if (!auth.ok) return auth.res;

  const { provider_id } = await req.json();
  if (!provider_id) return NextResponse.json({ error: "provider_id requerido" }, { status: 400 });

  const { data: p } = await admin()
    .from("sek_ai_providers")
    .select("id, nombre, api_key, base_url")
    .eq("id", provider_id)
    .maybeSingle();

  if (!p) return NextResponse.json({ error: "Proveedor no encontrado" }, { status: 404 });
  if (!p.api_key) return NextResponse.json({ status: "no-key", error: "API key no configurada" });

  const start = Date.now();
  try {
    let res: Response;
    if (provider_id === "google") {
      const base = p.base_url || "https://generativelanguage.googleapis.com/v1beta";
      res = await fetch(`${base}/models?key=${p.api_key}`, { signal: AbortSignal.timeout(12000) });
    } else if (provider_id === "cloudflare" || (p.base_url || "").includes("api.cloudflare.com")) {
      // Cloudflare no soporta /v1/models (405). Usa /ai/models/search propio.
      if (!p.base_url) return NextResponse.json({ status: "unknown", error: "base_url no configurada. Edite el proveedor y agregue la URL con su Account ID." });
      if (p.base_url.includes("{ACCOUNT_ID}")) return NextResponse.json({ status: "unknown", error: "La base_url todavía tiene {ACCOUNT_ID}. Edite el proveedor y reemplácelo por su Account ID real." });
      const base = (p.base_url || "").replace(/\/ai\/v1\/?$/, "").replace(/\/+$/, "");
      if (!base) return NextResponse.json({ status: "unknown", error: "base_url no configurada para Cloudflare" });
      res = await fetch(`${base}/ai/models/search?task=Text%20Generation`, {
        headers: { "Authorization": `Bearer ${p.api_key}` },
        signal: AbortSignal.timeout(12000),
      });
    } else {
      // Para proveedores OpenAI-compatible: usar endpoint conocido o derivar de base_url
      let url = listEndpoints[provider_id];
      if (!url) {
        const base = (p.base_url || "").replace(/\/+$/, "");
        if (!base) return NextResponse.json({ status: "unknown", error: "base_url no configurada para este proveedor" });
        url = `${base}/models`;
      }
      res = await fetch(url, {
        headers: { "Authorization": `Bearer ${p.api_key}` },
        signal: AbortSignal.timeout(12000),
      });
    }

    const latencyMs = Date.now() - start;
    if (res.ok) {
      const data = await res.json().catch(() => ({} as any));
      // Cloudflare /ai/models/search devuelve { success, result: [{ id: UUID, name: "@cf/..." }] }
      // Otros proveedores devuelven { data: [{ id: "model-name" }] } o { models: [...] }
      const raw = data?.models ?? data?.data ?? data?.result ?? [];
      const isCloudflare = provider_id === "cloudflare" || (p.base_url || "").includes("api.cloudflare.com");
      const modelList: string[] = Array.isArray(raw)
        ? raw.map((m: any) => {
            // Cloudflare: usar "name" (ej: @cf/meta/llama-3.1-8b-instruct), no "id" (UUID)
            if (isCloudflare) return m.name || m.id || m;
            return m.id || m.name || m;
          })
          .filter((s: any) => typeof s === "string" && s.length > 0)
          .sort()
        : [];
      return NextResponse.json({ status: "valid", latencyMs, modelsAvailable: modelList.length, modelList });
    }

    const data = await res.json().catch(() => ({} as any));
    const msg = data?.error?.message || data?.error || `HTTP ${res.status}`;
    return NextResponse.json({ status: "invalid", latencyMs, error: String(msg).slice(0, 200) });
  } catch (e: any) {
    return NextResponse.json({
      status: "invalid",
      latencyMs: Date.now() - start,
      error: (e?.message || "Timeout").slice(0, 200),
    });
  }
}
