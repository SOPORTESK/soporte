/**
 * evolution-config-tool.mjs
 *
 * Lee y actualiza la configuracion cifrada de Evolution API guardada en
 * sek_app_settings (key = evolution_api_config). Esa fila tiene prioridad
 * sobre las variables de entorno, por eso hay que actualizarla ahi.
 *
 * Uso:
 *   node scripts/evolution-config-tool.mjs                 -> muestra la config actual
 *   node scripts/evolution-config-tool.mjs --set            -> escribe la config nueva
 *
 * Para --set, tome los valores de estas variables de entorno:
 *   EVO_NEW_URL, EVO_NEW_KEY, EVO_NEW_INSTANCE
 */

import { createClient } from "@supabase/supabase-js";
import { createCipheriv, createDecipheriv, randomBytes, scryptSync } from "node:crypto";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const ALGO = "aes-256-gcm";
const SETTINGS_KEY = "evolution_api_config";

const env = {};
for (const line of readFileSync(resolve(process.cwd(), ".env.local"), "utf8").split(/\r?\n/)) {
  const m = line.match(/^([A-Za-z_][A-Za-z0-9_]*)=(.*)$/);
  if (m) env[m[1]] = m[2].replace(/^["']|["']$/g, "").trim();
}

function getKey() {
  const secret = env.APP_ENCRYPTION_KEY || env.SUPABASE_SERVICE_ROLE_KEY || "default-secret-do-not-use-in-prod";
  return scryptSync(secret, "sekunet-salt-v1", 32);
}

function encrypt(text) {
  const iv = randomBytes(16);
  const cipher = createCipheriv(ALGO, getKey(), iv);
  let encrypted = cipher.update(text, "utf8", "base64");
  encrypted += cipher.final("base64");
  return { encrypted, iv: iv.toString("base64"), tag: cipher.getAuthTag().toString("base64") };
}

function decrypt(encrypted, ivB64, tagB64) {
  const decipher = createDecipheriv(ALGO, getKey(), Buffer.from(ivB64, "base64"));
  decipher.setAuthTag(Buffer.from(tagB64, "base64"));
  let out = decipher.update(encrypted, "base64", "utf8");
  out += decipher.final("utf8");
  return out;
}

const mask = (s) => (!s ? "(vacio)" : s.length <= 8 ? "****" : `${s.slice(0, 3)}****${s.slice(-3)}`);

const db = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
});

async function readCurrent() {
  const { data, error } = await db
    .from("sek_app_settings")
    .select("value, iv, tag, updated_at")
    .eq("key", SETTINGS_KEY)
    .maybeSingle();

  if (error) {
    console.log("No se pudo leer sek_app_settings:", error.message);
    return null;
  }
  if (!data) {
    console.log("No existe la fila", SETTINGS_KEY, "-> la app usa las variables de entorno.");
    return null;
  }
  try {
    const cfg = JSON.parse(decrypt(data.value, data.iv, data.tag));
    console.log("Config actual en base de datos (actualizada", data.updated_at + "):");
    console.log("  url      =", cfg.url);
    console.log("  instance =", cfg.instance);
    console.log("  apiKey   =", mask(cfg.apiKey));
    return cfg;
  } catch (e) {
    console.log("La fila existe pero no se pudo descifrar:", e.message);
    return null;
  }
}

async function main() {
  console.log("=== Variables de entorno locales (respaldo) ===");
  console.log("  EVOLUTION_API_URL      =", env.EVOLUTION_API_URL || "(vacio)");
  console.log("  EVOLUTION_INSTANCE     =", env.EVOLUTION_INSTANCE || "(vacio)");
  console.log("  EVOLUTION_API_KEY      =", mask(env.EVOLUTION_API_KEY));
  console.log("");

  console.log("=== Configuracion guardada en base de datos (tiene prioridad) ===");
  await readCurrent();
  console.log("");

  if (!process.argv.includes("--set")) {
    console.log("Solo lectura. Para escribir, reejecute con --set");
    return;
  }

  const url = process.env.EVO_NEW_URL;
  const apiKey = process.env.EVO_NEW_KEY;
  const instance = process.env.EVO_NEW_INSTANCE;
  if (!url || !apiKey || !instance) {
    console.error("Faltan EVO_NEW_URL / EVO_NEW_KEY / EVO_NEW_INSTANCE");
    process.exit(1);
  }

  const { encrypted, iv, tag } = encrypt(JSON.stringify({ url, apiKey, instance }));
  const { error } = await db.from("sek_app_settings").upsert({
    key: SETTINGS_KEY,
    value: encrypted,
    iv,
    tag,
    updated_at: new Date().toISOString(),
  });
  if (error) {
    console.error("Error al guardar:", error.message);
    process.exit(1);
  }
  console.log("Guardado. Verificando lectura...");
  console.log("");
  await readCurrent();
}

main().catch((e) => {
  console.error("Fatal:", e.message);
  process.exit(1);
});
