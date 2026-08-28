/**
 * diag-esperando.mjs
 * Busca mensajes recientes y verifica si hay entradas vacias o con contenido
 * "Esperando este mensaje" en la BD. Tambien revisa si hay mensajes del cliente
 * que no tuvieron respuesta (huecos en la conversacion).
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
  // 1. Buscar entradas vacias en histcliente (mensajes que llegaron sin texto)
  const { data: recent } = await db
    .from("sek_cases")
    .select("id, title, customer_phone, histcliente, histtecnico, estado, created_at")
    .order("created_at", { ascending: false })
    .limit(30);

  if (!recent) { console.log("No data"); return; }

  console.log("=== Casos recientes con mensajes vacios ===\n");
  let totalEmpty = 0;
  for (const c of recent) {
    const hc = Array.isArray(c.histcliente) ? c.histcliente : [];
    const emptyMsgs = hc.filter(m => !m?.content || String(m.content).trim() === "");
    if (emptyMsgs.length > 0) {
      totalEmpty += emptyMsgs.length;
      console.log(`Caso ${c.id} - ${c.title} (${c.estado})`);
      console.log(`  ${emptyMsgs.length} mensajes vacios de ${hc.length} totales`);
      // Mostrar los ultimos 3 vacios con su tiempo y messageId
      for (const m of emptyMsgs.slice(-3)) {
        console.log(`    time=${m.time} id=${m.messageId || "(sin id)"} mediaUrl=${m.mediaUrl || "(none)"}`);
      }
      console.log("");
    }
  }
  console.log(`Total mensajes vacios en 30 casos recientes: ${totalEmpty}\n`);

  // 2. Buscar si hay mensajes con texto "Esperando" literalmente
  console.log("=== Buscando texto 'Esperando' en BD ===");
  let desde = 0;
  let esperandoCount = 0;
  for (let i = 0; i < 10; i++) {
    const { data } = await db
      .from("sek_cases")
      .select("id, histcliente, histtecnico")
      .order("created_at", { ascending: false })
      .range(desde, desde + 99);
    if (!data || data.length === 0) break;
    for (const c of data) {
      for (const campo of ["histcliente", "histtecnico"]) {
        const arr = Array.isArray(c[campo]) ? c[campo] : [];
        for (const m of arr) {
          if (m?.content && String(m.content).toLowerCase().includes("esperando")) {
            esperandoCount++;
            if (esperandoCount <= 5) {
              console.log(`  Caso ${c.id} [${campo}]: "${String(m.content).slice(0, 80)}"`);
            }
          }
        }
      }
    }
    desde += 100;
  }
  console.log(`Total mensajes con "Esperando": ${esperandoCount}\n`);

  // 3. Verificar el caso mas reciente en detalle
  if (recent.length > 0) {
    const latest = recent[0];
    const hc = Array.isArray(latest.histcliente) ? latest.histcliente : [];
    const ht = Array.isArray(latest.histtecnico) ? latest.histtecnico : [];
    const all = [
      ...hc.map(m => ({...m, col: "cliente"})),
      ...ht.map(m => ({...m, col: "tecnico"})),
    ].sort((a, b) => new Date(a.time || 0).getTime() - new Date(b.time || 0).getTime());

    console.log(`=== Caso mas reciente: ${latest.id} (${latest.estado}) ===`);
    console.log(`Total mensajes: ${all.length}\n`);
    for (const m of all.slice(-15)) {
      const content = String(m.content || "(VACIO)").slice(0, 60);
      const hasMedia = m.mediaUrl ? " [MEDIA]" : "";
      console.log(`  [${m.col}] ${m.role}: "${content}"${hasMedia} | ${m.time} | id=${(m.messageId || "").slice(0, 16)}`);
    }
  }
}

main().catch(console.error);
