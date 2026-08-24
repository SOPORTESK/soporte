// deno-lint-ignore-file no-explicit-any
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

/**
 * Resolución de modelos y API keys desde la base de datos, para edge functions.
 *
 * El administrador configura en /admin/agente-ia qué modelo cumple cada rol y
 * con qué API key. Si la base no responde se usa FALLBACK_CHAINS para que el
 * sistema nunca quede sin atender.
 */

export type AiRole =
  | "chat" | "web_search" | "vision" | "transcribe"
  | "meta_chat" | "learn" | "auto_close" | "extract" | "activity";

export interface ResolvedModel {
  provider: string;
  modelo: string;
  apiKey: string;
  baseUrl: string;
}

const DEFAULT_BASE: Record<string, string> = {
  google: "https://generativelanguage.googleapis.com/v1beta",
  groq: "https://api.groq.com/openai/v1",
  openrouter: "https://openrouter.ai/api/v1",
  nvidia: "https://integrate.api.nvidia.com/v1",
  openai: "https://api.openai.com/v1",
};

const FALLBACK_CHAINS: Record<string, { provider: string; modelo: string }[]> = {
  chat:       [{ provider: "google", modelo: "gemini-3.5-flash-lite" }, { provider: "google", modelo: "gemini-flash-lite-latest" }],
  web_search: [{ provider: "google", modelo: "gemini-3.5-flash" }],
  vision:     [{ provider: "google", modelo: "gemini-3.5-flash-lite" }],
  transcribe: [{ provider: "google", modelo: "gemini-3.5-flash-lite" }],
  meta_chat:  [{ provider: "google", modelo: "gemini-3.5-flash-lite" }],
  learn:      [{ provider: "google", modelo: "gemini-3.5-flash-lite" }],
  auto_close: [{ provider: "google", modelo: "gemini-3.5-flash-lite" }],
  extract:    [{ provider: "google", modelo: "gemini-3.5-flash-lite" }],
  activity:   [{ provider: "google", modelo: "gemini-3.5-flash-lite" }],
};

function envKey(provider: string): string {
  const e = (k: string) => Deno.env.get(k) ?? "";
  switch (provider) {
    case "google": return e("GEMINI_API_KEY") || e("GEMINI_API_KEY_2");
    case "groq": return e("GROQ_API_KEY");
    case "openrouter": return e("OPENROUTER_API_KEY");
    case "nvidia": return e("NIM_API_KEY") || e("NVIDIA_API_KEY") || e("OPENROUTER_API_KEY");
    case "openai": return e("OPENAI_API_KEY");
    default: return "";
  }
}

interface ConfigCache {
  at: number;
  providers: Map<string, { apiKey: string | null; baseUrl: string | null; activo: boolean }>;
  byRole: Map<string, { provider: string; modelo: string; orden: number }[]>;
}

let cache: ConfigCache | null = null;
const TTL_MS = 45_000;

async function loadConfig(): Promise<ConfigCache> {
  if (cache && Date.now() - cache.at < TTL_MS) return cache;

  const providers = new Map<string, { apiKey: string | null; baseUrl: string | null; activo: boolean }>();
  const byRole = new Map<string, { provider: string; modelo: string; orden: number }[]>();

  try {
    const db = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
      { auth: { persistSession: false } }
    );

    const [{ data: provs }, { data: models }] = await Promise.all([
      db.from("sek_ai_providers").select("id, api_key, base_url, activo"),
      db.from("sek_ai_models").select("provider_id, modelo, roles, orden").eq("activo", true).order("orden"),
    ]);

    (provs ?? []).forEach((p: any) => {
      providers.set(p.id, { apiKey: p.api_key, baseUrl: p.base_url, activo: p.activo });
    });

    (models ?? []).forEach((m: any) => {
      if (!providers.get(m.provider_id)?.activo) return;
      (m.roles ?? []).forEach((role: string) => {
        const list = byRole.get(role) ?? [];
        list.push({ provider: m.provider_id, modelo: m.modelo, orden: m.orden ?? 99 });
        byRole.set(role, list);
      });
    });

    byRole.forEach(list => list.sort((a, b) => a.orden - b.orden));
  } catch (e) {
    console.warn("[ai-config] fallback por error de lectura:", (e as Error)?.message);
  }

  cache = { at: Date.now(), providers, byRole };
  return cache;
}

function keyFor(cfg: ConfigCache, provider: string): string {
  return cfg.providers.get(provider)?.apiKey || envKey(provider);
}

function baseFor(cfg: ConfigCache, provider: string): string {
  return cfg.providers.get(provider)?.baseUrl || DEFAULT_BASE[provider] || "";
}

export async function getChain(role: AiRole): Promise<ResolvedModel[]> {
  const cfg = await loadConfig();
  const configured = cfg.byRole.get(role) ?? [];
  const source = configured.length > 0 ? configured : (FALLBACK_CHAINS[role] ?? []);

  return source
    .map(m => ({
      provider: m.provider,
      modelo: m.modelo,
      apiKey: keyFor(cfg, m.provider),
      baseUrl: baseFor(cfg, m.provider),
    }))
    .filter(m => m.apiKey.length > 0);
}

export async function getModel(role: AiRole): Promise<ResolvedModel | null> {
  return (await getChain(role))[0] ?? null;
}

export async function getProviderKey(provider: string): Promise<string> {
  const cfg = await loadConfig();
  return keyFor(cfg, provider);
}

export interface GenerateOptions {
  system?: string;
  messages: { role: "user" | "assistant"; content: string }[];
  temperature?: number;
  maxTokens?: number;
  timeoutMs?: number;
  tools?: unknown[];
}

/** Genera texto probando la cadena del rol hasta que un modelo responda. */
export async function generateText(
  role: AiRole,
  opts: GenerateOptions
): Promise<{ text: string; modelo: string; provider: string } | null> {
  const chain = await getChain(role);
  const { system, messages, temperature = 0.3, maxTokens = 1024, timeoutMs = 20_000, tools } = opts;

  for (const m of chain) {
    try {
      let text = "";

      if (m.provider === "google") {
        const body: Record<string, unknown> = {
          contents: messages.map(x => ({
            role: x.role === "assistant" ? "model" : "user",
            parts: [{ text: x.content }],
          })),
          generationConfig: { temperature, maxOutputTokens: maxTokens },
        };
        if (system) body.system_instruction = { parts: [{ text: system }] };
        if (tools) body.tools = tools;

        const res = await fetch(`${m.baseUrl}/models/${m.modelo}:generateContent?key=${m.apiKey}`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
          signal: AbortSignal.timeout(timeoutMs),
        });
        if (!res.ok) {
          console.warn(`[ai-config] ${m.provider}/${m.modelo} respondió ${res.status}`);
          continue;
        }
        const data = await res.json();
        text = data.candidates?.[0]?.content?.parts?.map((p: any) => p.text).filter(Boolean).join("") ?? "";
      } else {
        const msgs = system ? [{ role: "system", content: system }, ...messages] : messages;
        const res = await fetch(`${m.baseUrl}/chat/completions`, {
          method: "POST",
          headers: { "Content-Type": "application/json", "Authorization": `Bearer ${m.apiKey}` },
          body: JSON.stringify({ model: m.modelo, messages: msgs, temperature, max_tokens: maxTokens }),
          signal: AbortSignal.timeout(timeoutMs),
        });
        if (!res.ok) {
          console.warn(`[ai-config] ${m.provider}/${m.modelo} respondió ${res.status}`);
          continue;
        }
        const data = await res.json();
        text = data.choices?.[0]?.message?.content ?? "";
      }

      if (text.trim()) return { text, modelo: m.modelo, provider: m.provider };
    } catch (e) {
      console.warn(`[ai-config] ${m.provider}/${m.modelo} error:`, (e as Error)?.message);
    }
  }

  return null;
}
