import { createServiceClient } from "@/lib/supabase/service";
import { encrypt, decrypt } from "@/lib/crypto-config";

export interface EvolutionConfig {
  url: string;
  apiKey: string;
  instance: string;
  candidates?: string[];
}

const DEFAULT_KEY = "evolution_api_config";
const EVO_CONFIG_CACHE_TTL_MS = 60 * 1000; // 1 minuto en memoria
let cachedEvoConfig: EvolutionConfig | null = null;
let cachedEvoConfigAt = 0;

export async function getEvolutionConfig(): Promise<EvolutionConfig> {
  if (cachedEvoConfig && Date.now() - cachedEvoConfigAt < EVO_CONFIG_CACHE_TTL_MS) {
    return cachedEvoConfig;
  }

  const envUrl = process.env.EVOLUTION_API_URL || "";
  const envKey = process.env.EVOLUTION_API_KEY || "SEKUNET_EVO_KEY_123";
  const envInstance = process.env.EVOLUTION_INSTANCE || "sekunet";

  // PRIORIDAD 0: Conexión directa ultra-rápida si el contenedor local de Evolution API (127.0.0.1:28080) está activo (omitir en Vercel)
  if (!process.env.VERCEL) {
    try {
      const localRes = await fetch("http://127.0.0.1:28080", { signal: AbortSignal.timeout(3000) });
      if (localRes.ok) {
        cachedEvoConfig = {
          url: "http://127.0.0.1:28080",
          apiKey: envKey,
          instance: envInstance,
          candidates: ["http://127.0.0.1:28080", "http://localhost:28080"],
        };
        cachedEvoConfigAt = Date.now();
        return cachedEvoConfig;
      }
    } catch {
      // Si no responde en 127.0.0.1, continúa a consultar Supabase / env
    }
  }

  const supabase = createServiceClient();
  let dbUrl = "";
  let dbKey = "";
  let dbInstance = "";

  // PRIORIDAD 1: config guardada desde el panel admin o watchdog (cifrada en Supabase).
  try {
    const { data, error } = await supabase
      .from("sek_app_settings")
      .select("value, iv, tag")
      .eq("key", DEFAULT_KEY)
      .maybeSingle();

    if (data && !error) {
      const raw = decrypt(data.value, data.iv, data.tag);
      const parsed = JSON.parse(raw) as EvolutionConfig;
      dbUrl = parsed.url || "";
      dbKey = parsed.apiKey || "";
      dbInstance = parsed.instance || "";
    }
  } catch (e) {
    // tabla no existe o error de descifrado
  }

  const primaryUrl = dbUrl || envUrl || (!process.env.VERCEL ? "http://127.0.0.1:28080" : "");
  const primaryKey = dbKey || envKey;
  const primaryInstance = dbInstance || envInstance;

  const candidateList: string[] = [];
  if (primaryUrl) candidateList.push(primaryUrl);
  if (envUrl && !candidateList.includes(envUrl)) candidateList.push(envUrl);
  if (!process.env.VERCEL) {
    if (!candidateList.includes("http://127.0.0.1:28080")) candidateList.push("http://127.0.0.1:28080");
    if (!candidateList.includes("http://localhost:28080")) candidateList.push("http://localhost:28080");
  }

  cachedEvoConfig = {
    url: primaryUrl,
    apiKey: primaryKey,
    instance: primaryInstance,
    candidates: candidateList,
  };
  cachedEvoConfigAt = Date.now();
  return cachedEvoConfig;
}

export async function saveEvolutionConfig(cfg: EvolutionConfig): Promise<void> {
  cachedEvoConfig = null;
  cachedEvoConfigAt = 0;
  const supabase = createServiceClient();
  const payload = JSON.stringify({
    url: cfg.url,
    apiKey: cfg.apiKey,
    instance: cfg.instance,
  });
  const { encrypted, iv, tag } = encrypt(payload);

  const { error } = await supabase
    .from("sek_app_settings")
    .upsert({
      key: DEFAULT_KEY,
      value: encrypted,
      iv,
      tag,
      updated_at: new Date().toISOString(),
    });

  if (error) {
    throw new Error("No se pudo guardar en Supabase. Aplique la migración 0009_app_settings.sql: " + error.message);
  }
}

export function maskKey(key: string): string {
  if (!key) return "";
  if (key.length <= 8) return "••••";
  return key.slice(0, 2) + "••••••••••••" + key.slice(-2);
}
