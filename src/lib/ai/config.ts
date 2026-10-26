import { createClient } from "@supabase/supabase-js";

/**
 * Resolución de modelos y API keys desde la base de datos.
 *
 * El administrador configura en /admin/agente-ia qué modelo cumple cada rol y
 * con qué API key. Este módulo lee esa configuración con un cache corto para no
 * consultar la base en cada mensaje.
 *
 * Si la base no responde o no hay nada configurado para un rol se usa
 * FALLBACK_CHAINS, de modo que el sistema nunca quede sin atender.
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
  "67d3697263e070f885c00bb2aff07a0c": "https://api.cloudflare.com/client/v4/accounts/67d3697263e070f885c00bb2aff07a0c/ai/v1",
};

/** Red de seguridad si la BD no tiene configuración para un rol. */
const FALLBACK_CHAINS: Record<AiRole, { provider: string; modelo: string }[]> = {
  chat: [
    { provider: "google", modelo: "gemini-3.5-flash-lite" },
    { provider: "groq", modelo: "openai/gpt-oss-120b" },
    { provider: "67d3697263e070f885c00bb2aff07a0c", modelo: "@cf/meta/llama-3.1-70b-instruct" },
    { provider: "openrouter", modelo: "meta-llama/llama-3.3-70b-instruct" },
    { provider: "google", modelo: "gemini-3-flash-preview" },
  ],
  web_search: [{ provider: "google", modelo: "gemini-3.5-flash-lite" }],
  vision:     [{ provider: "google", modelo: "gemini-3.5-flash-lite" }, { provider: "google", modelo: "gemini-3-flash-preview" }],
  transcribe: [{ provider: "google", modelo: "gemini-3.5-flash-lite" }],
  meta_chat:  [
    { provider: "google", modelo: "gemini-3.5-flash-lite" },
    { provider: "groq", modelo: "openai/gpt-oss-120b" },
    { provider: "openrouter", modelo: "meta-llama/llama-3.3-70b-instruct" },
  ],
  learn:      [{ provider: "google", modelo: "gemini-3.5-flash-lite" }],
  auto_close: [{ provider: "google", modelo: "gemini-3.5-flash-lite" }],
  extract:    [{ provider: "google", modelo: "gemini-3.5-flash-lite" }, { provider: "groq", modelo: "openai/gpt-oss-20b" }],
  activity:   [{ provider: "google", modelo: "gemini-3.5-flash-lite" }, { provider: "groq", modelo: "openai/gpt-oss-120b" }],
};

function envKey(provider: string): string | undefined {
  switch (provider) {
    case "google": return process.env.GEMINI_API_KEY;
    case "groq": return process.env.GROQ_API_KEY;
    case "openrouter": return process.env.OPENROUTER_API_KEY;
    case "nvidia": return process.env.NIM_API_KEY || process.env.OPENROUTER_API_KEY;
    case "openai": return process.env.OPENAI_API_KEY;
    default: return undefined;
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
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
      { auth: { persistSession: false } }
    );

    const [{ data: provs }, { data: models }] = await Promise.all([
      db.from("sek_ai_providers").select("id, api_key, base_url, activo"),
      db.from("sek_ai_models").select("provider_id, modelo, roles, orden").eq("activo", true).order("orden"),
    ]);

    (provs ?? []).forEach(p => {
      providers.set(p.id, { apiKey: p.api_key, baseUrl: p.base_url, activo: p.activo });
    });

    (models ?? []).forEach(m => {
      if (!providers.get(m.provider_id)?.activo) return;
      ((m.roles as string[] | null) ?? []).forEach(role => {
        const list = byRole.get(role) ?? [];
        list.push({ provider: m.provider_id, modelo: m.modelo, orden: m.orden ?? 99 });
        byRole.set(role, list);
      });
    });

    byRole.forEach(list => list.sort((a, b) => a.orden - b.orden));
  } catch (e) {
    console.warn("[ai-config] no se pudo leer la configuración, se usa fallback:", e);
  }

  cache = { at: Date.now(), providers, byRole };
  return cache;
}

/** Invalida el cache. Se llama al guardar cambios en el panel. */
export function invalidateAiConfigCache() {
  cache = null;
}

function keyFor(cfg: ConfigCache, provider: string): string {
  return cfg.providers.get(provider)?.apiKey || envKey(provider) || "";
}

function baseFor(cfg: ConfigCache, provider: string): string {
  return cfg.providers.get(provider)?.baseUrl || DEFAULT_BASE[provider] || "";
}

/**
 * Cadena de modelos configurada para un rol, en orden de intento.
 * Solo incluye los que tienen API key disponible.
 */
export async function getChain(role: AiRole): Promise<ResolvedModel[]> {
  const cfg = await loadConfig();
  const configured = cfg.byRole.get(role) ?? [];
  const source = configured.length > 0 ? configured : FALLBACK_CHAINS[role];

  return source
    .map(m => ({
      provider: m.provider,
      modelo: m.modelo,
      apiKey: keyFor(cfg, m.provider),
      baseUrl: baseFor(cfg, m.provider),
    }))
    .filter(m => m.apiKey.length > 0);
}

/** Primer modelo disponible para un rol, o null si ninguno tiene key. */
export async function getModel(role: AiRole): Promise<ResolvedModel | null> {
  return (await getChain(role))[0] ?? null;
}

/** API key de un proveedor: BD primero, variable de entorno como respaldo. */
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
  /** Tools de Gemini, por ejemplo [{ google_search: {} }] */
  tools?: unknown[];
}

/**
 * Circuit Breaker en memoria para recordar modelos con cuota agotada (429) o caídos,
 * evitando perder segundos reintentando un proveedor que acaba de fallar.
 */
const modelCooldownUntil = new Map<string, number>();
const COOLDOWN_QUOTA_MS = 180_000; // 3 minutos si devuelve 429 / 402 / 404
const COOLDOWN_ERROR_MS = 60_000;  // 1 minuto si da timeout o error 5xx

function compressSystemPrompt(sys: string | undefined, maxChars = 10_000): string | undefined {
  if (!sys || sys.length <= maxChars) return sys;
  const head = Math.floor(maxChars * 0.68);
  const tail = maxChars - head;
  return `${sys.substring(0, head)}\n\n[...Contexto histórico secundario resumido para optimizar ventana...]\n\n${sys.substring(sys.length - tail)}`;
}

/**
 * Genera texto probando la cadena del rol hasta que un modelo responda.
 * Devuelve el texto junto al modelo que respondió, o null si falló toda la cadena.
 */
export async function generateText(
  role: AiRole,
  opts: GenerateOptions
): Promise<{ text: string; modelo: string; provider: string } | null> {
  const rawChain = await getChain(role);
  if (rawChain.length === 0) return null;

  const now = Date.now();
  // Priorizar modelos sanos; dejar los que están en enfriamiento al final como último recurso
  const chain = [
    ...rawChain.filter(m => (modelCooldownUntil.get(`${m.provider}/${m.modelo}`) ?? 0) <= now),
    ...rawChain.filter(m => (modelCooldownUntil.get(`${m.provider}/${m.modelo}`) ?? 0) > now),
  ];

  const { system, messages, temperature = 0.3, maxTokens = 2048, timeoutMs = 25_000, tools } = opts;

  const deadline = Date.now() + timeoutMs;
  const safeMaxTokens = Math.min(maxTokens, 2048);

  for (let idx = 0; idx < chain.length; idx++) {
    const m = chain[idx];
    const modelKey = `${m.provider}/${m.modelo}`;
    const remainingTime = deadline - Date.now();
    if (remainingTime < 2000) {
      console.warn(`[ai-fallback] ⏱️ Tiempo global agotado (${timeoutMs}ms), abortando cadena.`);
      break;
    }
    const timeoutPerModel = Math.min(remainingTime, 12_000);
    const t0 = Date.now();
    try {
      console.log(`[ai-fallback] Intentando con ${modelKey} (timeout: ${timeoutPerModel}ms)...`);
      let text = "";

      if (m.provider === "google") {
        const effectiveSystem = compressSystemPrompt(system, 24_000);
        const body: Record<string, unknown> = {
          contents: messages.map(x => ({
            role: x.role === "assistant" ? "model" : "user",
            parts: [{ text: x.content }],
          })),
          generationConfig: { temperature, maxOutputTokens: safeMaxTokens },
        };
        if (effectiveSystem) body.system_instruction = { parts: [{ text: effectiveSystem }] };
        if (tools) body.tools = tools;

        const res = await fetch(`${m.baseUrl}/models/${m.modelo}:generateContent?key=${m.apiKey}`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
          signal: AbortSignal.timeout(timeoutPerModel),
        });
        if (!res.ok) {
          const errBody = await res.text().catch(() => "");
          const cooldown = res.status === 429 || res.status === 402 || res.status === 404 ? COOLDOWN_QUOTA_MS : COOLDOWN_ERROR_MS;
          modelCooldownUntil.set(modelKey, Date.now() + cooldown);
          console.warn(`[ai-fallback] ❌ ${modelKey} falló con status ${res.status} (${Date.now() - t0}ms, enfriamiento ${cooldown / 1000}s): ${errBody.substring(0, 100)} -> Saltando al siguiente...`);
          continue;
        }
        const data = await res.json();
        text = data.candidates?.[0]?.content?.parts?.map((p: any) => p.text).filter(Boolean).join("") ?? "";
      } else {
        // Proveedores secundarios (Groq, Cloudflare, OpenRouter): mantener margen amplio para no recortar precedentes ni manuales
        const effectiveSystem = compressSystemPrompt(system, m.provider === "groq" ? 15_000 : 18_000);
        const msgs = effectiveSystem ? [{ role: "system", content: effectiveSystem }, ...messages] : messages;
        const res = await fetch(`${m.baseUrl}/chat/completions`, {
          method: "POST",
          headers: { "Content-Type": "application/json", "Authorization": `Bearer ${m.apiKey}` },
          body: JSON.stringify({ model: m.modelo, messages: msgs, temperature, max_tokens: safeMaxTokens }),
          signal: AbortSignal.timeout(timeoutPerModel),
        });
        if (!res.ok) {
          const errBody = await res.text().catch(() => "");
          const cooldown = res.status === 429 || res.status === 402 || res.status === 404 ? COOLDOWN_QUOTA_MS : COOLDOWN_ERROR_MS;
          modelCooldownUntil.set(modelKey, Date.now() + cooldown);
          console.warn(`[ai-fallback] ❌ ${modelKey} falló con status ${res.status} (${Date.now() - t0}ms, enfriamiento ${cooldown / 1000}s): ${errBody.substring(0, 100)} -> Saltando al siguiente...`);
          continue;
        }
        const data = await res.json();
        const choice = data.choices?.[0];
        text = choice?.message?.content || choice?.message?.reasoning || "";
        if (text) {
          text = text.replace(/<think>[\s\S]*?<\/think>/gi, "").trim();
        }
      }

      if (text.trim()) {
        modelCooldownUntil.delete(modelKey);
        console.log(`[ai-fallback] ✅ Éxito con ${modelKey} en ${Date.now() - t0}ms`);
        return { text: text.trim(), modelo: m.modelo, provider: m.provider };
      }
    } catch (e: any) {
      modelCooldownUntil.set(modelKey, Date.now() + COOLDOWN_ERROR_MS);
      console.warn(`[ai-fallback] ⚠️ Excepción/Timeout en ${modelKey} (${Date.now() - t0}ms, enfriamiento 60s): ${e?.message} -> Saltando al siguiente...`);
    }
  }

  return null;
}
