/**
 * deploy-functions.mjs
 * Deploya Edge Functions de Supabase SIEMPRE al proyecto correcto.
 * Proyecto: kzcyxeracvfxynddyjld (Plantillas / Producción)
 *
 * Uso:
 *   npm run deploy:functions              → deploya todas las funciones
 *   npm run deploy:functions auto-close   → deploya solo auto-close
 */

import { execSync } from "node:child_process";
import { readFileSync, renameSync, existsSync } from "node:fs";
import { resolve } from "node:path";

const PROJECT_REF = "kzcyxeracvfxynddyjld";
const ENV_FILE = resolve(process.cwd(), ".env.local");
const ENV_BAK  = resolve(process.cwd(), ".env.local.bak");

// Verificar que el .env.local apunta al proyecto correcto
if (existsSync(ENV_FILE)) {
  const envContent = readFileSync(ENV_FILE, "utf8");
  if (!envContent.includes(PROJECT_REF)) {
    console.error(`\n❌ ERROR: .env.local NO apunta al proyecto correcto (${PROJECT_REF})`);
    console.error("   Verifique NEXT_PUBLIC_SUPABASE_URL en .env.local\n");
    process.exit(1);
  }
}

const fn = process.argv[2];
const fnArg = fn ? fn : "";

console.log(`\n🚀 Deployando${fnArg ? ` función: ${fnArg}` : " todas las funciones"}`);
console.log(`   Proyecto: ${PROJECT_REF} (Plantillas / Producción)\n`);

// Renombrar .env.local temporalmente para que el CLI no lo lea y falle
let renamed = false;
if (existsSync(ENV_FILE)) {
  renameSync(ENV_FILE, ENV_BAK);
  renamed = true;
}

try {
  const cmd = `npx supabase functions deploy ${fnArg} --project-ref ${PROJECT_REF}`;
  execSync(cmd, { stdio: "inherit" });
  console.log("\n✅ Deploy exitoso.\n");
} catch (e) {
  console.error("\n❌ Deploy falló.\n");
  process.exitCode = 1;
} finally {
  if (renamed && existsSync(ENV_BAK)) {
    renameSync(ENV_BAK, ENV_FILE);
  }
}
