import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createClient as createAdminClient } from "@supabase/supabase-js";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 60;

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

interface Result {
  id: string;
  status: "up" | "down" | "no-key";
  latencyMs: number;
  error?: string;
}

async function pingModel(
  providerId: string,
  baseUrl: string | null,
  apiKey: string | null,
  modelId: string,
  modelo: string
): Promise<Result> {
  const start = Date.now();
  if (!apiKey) return { id: modelId, status: "no-key", latencyMs: 0, error: "API key no configurada" };

  try {
    let res: Response;

    if (providerId === "google") {
      const base = baseUrl || "https://generativelanguage.googleapis.com/v1beta";
      res = await fetch(`${base}/models/${modelo}:generateContent?key=${apiKey}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contents: [{ parts: [{ text: "OK" }] }],
          generationConfig: { maxOutputTokens: 5, temperature: 0 },
        }),
        signal: AbortSignal.timeout(15000),
      });
    } else {
      // OpenAI-compatible: groq, openrouter, nvidia, openai
      const defaults: Record<string, string> = {
        groq: "https://api.groq.com/openai/v1",
        openrouter: "https://openrouter.ai/api/v1",
        nvidia: "https://integrate.api.nvidia.com/v1",
        openai: "https://api.openai.com/v1",
      };
      const base = baseUrl || defaults[providerId] || "";
      if (!base) return { id: modelId, status: "down", latencyMs: 0, error: "base_url no configurada" };

      res = await fetch(`${base}/chat/completions`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "Authorization": `Bearer ${apiKey}` },
        body: JSON.stringify({
          model: modelo,
          messages: [{ role: "user", content: "OK" }],
          max_tokens: 5,
          temperature: 0,
        }),
        signal: AbortSignal.timeout(15000),
      });
    }

    const latencyMs = Date.now() - start;
    if (res.ok) return { id: modelId, status: "up", latencyMs };

    const data = await res.json().catch(() => ({} as any));
    const msg = data?.error?.message || data?.error || `HTTP ${res.status}`;
    return { id: modelId, status: "down", latencyMs, error: String(msg).slice(0, 200) };
  } catch (e: any) {
    return { id: modelId, status: "down", latencyMs: Date.now() - start, error: (e?.message || "Timeout").slice(0, 200) };
  }
}

// POST: validar todos los modelos (o uno específico si se pasa model_id)
export async function POST(req: NextRequest) {
  const auth = await requireAdmin();
  if (!auth.ok) return auth.res;

  const body = await req.json().catch(() => ({}));
  const onlyId: string | undefined = body?.model_id;

  const db = admin();
  const [{ data: providers }, { data: models }] = await Promise.all([
    db.from("sek_ai_providers").select("id, api_key, base_url"),
    onlyId
      ? db.from("sek_ai_models").select("id, provider_id, modelo").eq("id", onlyId)
      : db.from("sek_ai_models").select("id, provider_id, modelo").eq("activo", true),
  ]);

  const keyMap = new Map((providers ?? []).map(p => [p.id, { key: p.api_key as string | null, base: p.base_url as string | null }]));

  const results = await Promise.all(
    (models ?? []).map(m => {
      const cfg = keyMap.get(m.provider_id);
      return pingModel(m.provider_id, cfg?.base ?? null, cfg?.key ?? null, m.id, m.modelo);
    })
  );

  // Persistir resultados
  const now = new Date().toISOString();
  await Promise.all(
    results.map(r =>
      db.from("sek_ai_models").update({
        last_status: r.status,
        last_latency_ms: r.latencyMs,
        last_error: r.error ?? null,
        last_checked_at: now,
      }).eq("id", r.id)
    )
  );

  return NextResponse.json({ results, checkedAt: now });
}
