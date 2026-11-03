import { createServiceClient } from "@/lib/supabase/service";
import { encrypt, decrypt } from "@/lib/crypto-config";

interface EvolutionConfig {
  url: string;
  apiKey: string;
  instance: string;
}

const DEFAULT_KEY = "evolution_api_config";

export async function getEvolutionConfig(): Promise<EvolutionConfig> {
  const envUrl = process.env.EVOLUTION_API_URL || "";
  const envKey = process.env.EVOLUTION_API_KEY || "";
  const envInstance = process.env.EVOLUTION_INSTANCE || "";

  // PRIORIDAD 0: Conexión directa ultra-rápida si el contenedor local de Evolution API (127.0.0.1:28080) está activo
  try {
    const localRes = await fetch("http://127.0.0.1:28080", { signal: AbortSignal.timeout(400) });
    if (localRes.ok) {
      return {
        url: "http://127.0.0.1:28080",
        apiKey: envKey || "SEKUNET_EVO_KEY_123",
        instance: envInstance || "sekunet",
      };
    }
  } catch {
    // Si no está escuchando en local, continúa normalmente
  }

  const supabase = createServiceClient();

  // PRIORIDAD 1: config guardada desde el panel admin (cifrada en Supabase).
  // El panel debe poder cambiar la URL sin depender de redeploys ni de variables
  // de entorno desactualizadas; las env vars quedan solo como respaldo.
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

  // PRIORIDAD 2: variables de entorno
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
