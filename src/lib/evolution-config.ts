import { createServiceClient } from "@/lib/supabase/service";
import { encrypt, decrypt } from "@/lib/crypto-config";

export interface EvolutionConfig {
  url: string;
  apiKey: string;
  instance: string;
  candidates?: string[];
}

const DEFAULT_KEY = "evolution_api_config";
const EVO_CONFIG_CACHE_TTL_MS = 15 * 1000; // 15 segundos en memoria
let cachedEvoConfig: EvolutionConfig | null = null;
let cachedEvoConfigAt = 0;

export async function getEvolutionConfig(forceRefresh = false): Promise<EvolutionConfig> {
  if (!forceRefresh && cachedEvoConfig && Date.now() - cachedEvoConfigAt < EVO_CONFIG_CACHE_TTL_MS) {
    return cachedEvoConfig;
  }

  const envUrl = process.env.EVOLUTION_API_URL || "";
  const envKey = process.env.EVOLUTION_API_KEY || "SEKUNET_EVO_KEY_123";
  const envInstance = process.env.EVOLUTION_INSTANCE || "sekunet";

  // PRIORIDAD 0: Conexión directa ultra-rápida si el contenedor local de Evolution API (127.0.0.1:28080) está activo (omitir en Vercel)
  if (!process.env.VERCEL) {
    try {
      const localRes = await fetch("http://127.0.0.1:28080", {
        cache: "no-store",
        signal: AbortSignal.timeout(3000),
      });
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

  let dbUrl = "";
  let dbKey = "";
  let dbInstance = "";

  // PRIORIDAD 1: config guardada desde el panel admin o watchdog (consulta REST directa con no-store para evitar Data Cache de Next.js en Vercel).
  try {
    const sbUrl = (process.env.NEXT_PUBLIC_SUPABASE_URL || "https://kzcyxeracvfxynddyjld.supabase.co").replace(/\/$/, "");
    const sbKey = (
      process.env.SUPABASE_SERVICE_ROLE_KEY ||
      "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imt6Y3l4ZXJhY3ZmeHluZGR5amxkIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3NTUxMTk1NCwiZXhwIjoyMDkxMDg3OTU0fQ.GlF4Zieqqc1V1IAPshPFKb1QzKBBbO8n1RGK_wG_JuM"
    ).trim();
    if (sbUrl && sbKey) {
      const restRes = await fetch(
        `${sbUrl}/rest/v1/sek_app_settings?key=eq.${encodeURIComponent(DEFAULT_KEY)}&select=value,iv,tag`,
        {
          headers: {
            apikey: sbKey,
            Authorization: `Bearer ${sbKey}`,
            "Cache-Control": "no-cache, no-store, must-revalidate",
            Pragma: "no-cache",
          },
          cache: "no-store",
          signal: AbortSignal.timeout(5000),
        }
      );
      if (restRes.ok) {
        const rows = await restRes.json();
        const data = Array.isArray(rows) ? rows[0] : null;
        if (data && data.value) {
          const raw = data.value.trim().startsWith("{")
            ? data.value
            : decrypt(data.value, data.iv, data.tag);
          const parsed = JSON.parse(raw) as EvolutionConfig;
          dbUrl = parsed.url || "";
          dbKey = parsed.apiKey || "";
          dbInstance = parsed.instance || "";
        }
      }
    }
  } catch {}

  if (!dbUrl) {
    try {
      const supabase = createServiceClient();
      const { data, error } = await supabase
        .from("sek_app_settings")
        .select("value, iv, tag")
        .eq("key", DEFAULT_KEY)
        .maybeSingle();

      if (data && !error && data.value) {
        const raw = data.value.trim().startsWith("{")
          ? data.value
          : decrypt(data.value, data.iv, data.tag);
        const parsed = JSON.parse(raw) as EvolutionConfig;
        dbUrl = parsed.url || "";
        dbKey = parsed.apiKey || "";
        dbInstance = parsed.instance || "";
      }
    } catch {}
  }

  const primaryUrl = dbUrl || envUrl || (!process.env.VERCEL ? "http://127.0.0.1:28080" : "");
  const primaryKey = dbKey || envKey;
  const primaryInstance = dbInstance || envInstance;

  const candidateList: string[] = [];
  if (primaryUrl) candidateList.push(primaryUrl);
  if (!dbUrl && envUrl && !candidateList.includes(envUrl)) candidateList.push(envUrl);
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
