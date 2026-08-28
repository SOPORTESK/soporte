/**
 * diag-edits.mjs
 * Busca el caso específico de la imagen: mensaje "Es nuevo, o es el mismo??"
 * editado a "Es nuevo, o es el mismo?" — debe haber dos entradas con texto similar.
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
  // Buscar casos que contengan "Es nuevo" en histcliente
  let desde = 0;
  const PAGINA = 100;
  const found = [];

  for (let i = 0; i < 20; i++) {
    const { data } = await db
      .from("sek_cases")
      .select("id, histcliente, histtecnico, created_at")
      .order("created_at", { ascending: false })
      .range(desde, desde + PAGINA - 1);
    if (!data || data.length === 0) break;

    for (const c of data) {
      const hc = Array.isArray(c.histcliente) ? c.histcliente : [];
      for (const m of hc) {
        if (m?.content && String(m.content).includes("Es nuevo")) {
          found.push({ caseId: c.id, msg: m });
        }
      }
    }
    desde += PAGINA;
  }

  console.log(`=== Mensajes con "Es nuevo" encontrados: ${found.length} ===\n`);
  for (const f of found) {
    console.log(`Caso: ${f.caseId}`);
    console.log(`  role: ${f.msg.role}`);
    console.log(`  content: "${f.msg.content}"`);
    console.log(`  time: ${f.msg.time}`);
    console.log(`  messageId: ${f.msg.messageId || "(sin id)"}`);
    console.log(`  fromMe: ${f.msg.fromMe}`);
    console.log("");
  }

  // También buscar el XML mencionado
  console.log("\n=== Buscando mensajes con XML (DS-PWA48) ===");
  desde = 0;
  const xmlFound = [];
  for (let i = 0; i < 20; i++) {
    const { data } = await db
      .from("sek_cases")
      .select("id, histcliente, histtecnico, created_at")
      .order("created_at", { ascending: false })
      .range(desde, desde + PAGINA - 1);
    if (!data || data.length === 0) break;

    for (const c of data) {
      for (const campo of ["histcliente", "histtecnico"]) {
        const arr = Array.isArray(c[campo]) ? c[campo] : [];
        for (const m of arr) {
          if (m?.content && String(m.content).includes("DS-PWA48")) {
            xmlFound.push({ caseId: c.id, campo, msg: m });
          }
        }
      }
    }
    desde += PAGINA;
  }

  console.log(`Encontrados: ${xmlFound.length}`);
  for (const f of xmlFound.slice(0, 5)) {
    console.log(`\nCaso: ${f.caseId} (${f.campo})`);
    console.log(`  role: ${f.msg.role}`);
    console.log(`  content: "${String(f.msg.content).slice(0, 100)}..."`);
    console.log(`  time: ${f.msg.time}`);
    console.log(`  messageId: ${f.msg.messageId || "(sin id)"}`);
  }
}

main().catch(console.error);
