import { createServiceClient } from "@/lib/supabase/service";
import { encrypt, decrypt } from "@/lib/crypto-config";

interface EvolutionConfig {
  url: string;
  apiKey: string;
  instance: string;
}

const DEFAULT_KEY = "evolution_api_config";

export async function getEvolutionConfig(): Promise<EvolutionConfig> {
  // PRIORIDAD 1: variables de entorno (.env.local) — siempre mandan
  const envUrl = process.env.EVOLUTION_API_URL || "";
  const envKey = process.env.EVOLUTION_API_KEY || "";
  const envInstance = process.env.EVOLUTION_INSTANCE || "";
  if (envUrl && envKey && envInstance) {
    return { url: envUrl, apiKey: envKey, instance: envInstance };
  }

  const supabase = createServiceClient();

  // 2. Fallback a Supabase (cifrado)
  try {
    const { data, error } = await supabase
      .from("sek_app_settings")
      .select("value, iv, tag")
      .eq("key", DEFAULT_KEY)
      .maybeSingle();

    if (data && !error) {
      const raw = decrypt(data.value, data.iv, data.tag);
      const parsed = JSON.parse(raw) as EvolutionConfig;
      return {
        url: parsed.url || envUrl,
        apiKey: parsed.apiKey || envKey,
        instance: parsed.instance || envInstance,
      };
    }
  } catch (e) {
    // tabla no existe o error de descifrado
  }

  // 3. Último fallback
  return { url: envUrl, apiKey: envKey, instance: envInstance };
}

export async function saveEvolutionConfig(cfg: EvolutionConfig): Promise<void> {
  const supabase = createServiceClient();
  const payload = JSON.stringify({
    url: cfg.url,
    apiKey: cfg.apiKey,
    instance: cfg.instance,
  });
  const { encrypted, iv, tag } = encrypt(payload);

  try {
    await supabase
      .from("sek_app_settings")
      .upsert({
        key: DEFAULT_KEY,
        value: encrypted,
        iv,
        tag,
        updated_at: new Date().toISOString(),
      });
  } catch (e: any) {
    throw new Error("No se pudo guardar en Supabase. Aplique la migración 0009_app_settings.sql: " + e?.message);
  }
}

export function maskKey(key: string): string {
  if (!key) return "";
  if (key.length <= 8) return "••••";
  return key.slice(0, 2) + "••••••••••••" + key.slice(-2);
}
