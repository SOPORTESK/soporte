/**
 * diag-case-b03e021b-full.mjs
 * Muestra TODOS los campos de los mensajes cerca de "Es nuevo" para ver
 * si hay un segundo mensaje que el script anterior no mostró.
 */
import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "fs";
import { resolve } from "path";

const env = {};
for (const line of readFileSync(resolve(process.cwd(), ".env.local"), "utf8").split(/\r?\n/)) {
  const m = line.match(/^([A-Za-z_][A-Za-z0-9_]*)=(.*)$/);
  if (m) env[m[1]] = m[2].replace(/^["']|["']$/g, "").trim();
}

const db = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
});

async function main() {
  const { data: c } = await db
    .from("sek_cases")
    .select("histcliente, histtecnico")
    .eq("id", "b03e021b-f606-43d8-a182-0b3283f31271")
    .single();

  if (!c) { console.log("Caso no encontrado"); return; }

  const ht = Array.isArray(c.histtecnico) ? c.histtecnico : [];
  const hc = Array.isArray(c.histcliente) ? c.histcliente : [];

  console.log("=== histtecnico completo (JSON crudo) ===\n");
  ht.forEach((m, i) => {
    console.log(`--- ht[${i}] ---`);
    console.log(JSON.stringify(m, null, 2));
    console.log("");
  });

  console.log("\n=== histcliente completo (JSON crudo) ===\n");
  hc.forEach((m, i) => {
    console.log(`--- hc[${i}] ---`);
    console.log(JSON.stringify(m, null, 2));
    console.log("");
  });
}

main().catch(console.error);
