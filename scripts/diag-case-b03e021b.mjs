/**
 * diag-case-b03e021b.mjs
 * Muestra todos los mensajes del caso de la imagen para entender la duplicación.
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
    .select("*")
    .eq("id", "b03e021b-f606-43d8-a182-0b3283f31271")
    .single();

  if (!c) { console.log("Caso no encontrado"); return; }

  console.log(`Caso: ${c.id}`);
  console.log(`Title: ${c.title}`);
  console.log(`Estado: ${c.estado}`);
  console.log(`Phone: ${c.customer_phone}`);
  console.log(`Created: ${c.created_at}`);
  console.log("");

  const hc = Array.isArray(c.histcliente) ? c.histcliente : [];
  const ht = Array.isArray(c.histtecnico) ? c.histtecnico : [];

  const all = [
    ...hc.map((m, i) => ({ ...m, col: "hc", idx: i })),
    ...ht.map((m, i) => ({ ...m, col: "ht", idx: i })),
  ].sort((a, b) => new Date(a.time || 0).getTime() - new Date(b.time || 0).getTime());

  console.log(`=== ${all.length} mensajes totales ===\n`);
  for (const m of all) {
    const time = m.time || "?";
    const content = String(m.content || "").slice(0, 80);
    const id = m.messageId || "(sin id)";
    const fromMe = m.fromMe ? "true" : "false";
    console.log(`[${m.col}[${m.idx}]] ${m.role.padEnd(8)} ${time}  fromMe=${fromMe}  id=${id.slice(0, 20)}`);
    console.log(`  "${content}"`);
    if (m.edited) console.log(`  *** EDITED FLAG ***`);
    console.log("");
  }
}

main().catch(console.error);
