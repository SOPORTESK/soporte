import { createServiceClient } from "@/lib/supabase/service";
import { encrypt, decrypt } from "@/lib/crypto-config";

interface EvolutionConfig {
  url: string;
  apiKey: string;
  instance: string;
}

const DEFAULT_KEY = "evolution_api_config";

export async function getEvolutionConfig(): Promise<EvolutionConfig> {
  const supabase = createServiceClient();

  // 1. Intentar leer de Supabase (cifrado)
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
        url: parsed.url || process.env.EVOLUTION_API_URL || "",
        apiKey: parsed.apiKey || process.env.EVOLUTION_API_KEY || "",
        instance: parsed.instance || process.env.EVOLUTION_INSTANCE || "",
      };
    }
  } catch (e) {
    // tabla no existe o error de descifrado — fallback a env
  }

  // 2. Fallback a variables de entorno
  return {
    url: process.env.EVOLUTION_API_URL || "",
    apiKey: process.env.EVOLUTION_API_KEY || "",
    instance: process.env.EVOLUTION_INSTANCE || "",
  };
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
