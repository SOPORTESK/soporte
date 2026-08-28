/**
 * diag-edits2.mjs
 * Busca mensajes duplicados con texto casi idéntico (ediciones) en los casos
 * más recientes. Compara prefijos de 20 chars.
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
  // Cargar los 50 casos más recientes
  const { data: cases } = await db
    .from("sek_cases")
    .select("id, histcliente, histtecnico, created_at, title")
    .order("created_at", { ascending: false })
    .limit(50);

  if (!cases) { console.log("No data"); return; }

  console.log(`=== Revisando ${cases.length} casos recientes ===\n`);

  let editsFound = 0;
  for (const c of cases) {
    const hc = Array.isArray(c.histcliente) ? c.histcliente : [];
    // Buscar pares con mismo prefijo (20 chars) pero texto distinto
    for (let i = 0; i < hc.length; i++) {
      for (let j = i + 1; j < hc.length; j++) {
        const a = hc[i], b = hc[j];
        if (!a?.content || !b?.content) continue;
        const pa = a.content.trim().slice(0, 20).toLowerCase();
        const pb = b.content.trim().slice(0, 20).toLowerCase();
        if (pa === pb && a.content !== b.content) {
          // Verificar que están cercanos en tiempo (5 min)
          const ta = new Date(a.time || 0).getTime();
          const tb = new Date(b.time || 0).getTime();
          if (Math.abs(tb - ta) < 300000) {
            editsFound++;
            console.log(`CASO: ${c.id} - ${c.title}`);
            console.log(`  MSG A: "${a.content.slice(0, 80)}" | time=${a.time} | id=${a.messageId || "(sin id)"}`);
            console.log(`  MSG B: "${b.content.slice(0, 80)}" | time=${b.time} | id=${b.messageId || "(sin id)"}`);
            console.log(`  Delta: ${Math.abs(tb - ta) / 1000}s`);
            console.log("");
          }
        }
      }
    }
  }

  console.log(`\nTotal ediciones detectadas: ${editsFound}`);

  // También mostrar los últimos 5 mensajes del caso más reciente para contexto
  if (cases.length > 0) {
    const latest = cases[0];
    const hc = Array.isArray(latest.histcliente) ? latest.histcliente : [];
    const ht = Array.isArray(latest.histtecnico) ? latest.histtecnico : [];
    const all = [...hc.map(m => ({...m, col: "hc"})), ...ht.map(m => ({...m, col: "ht"}))]
      .sort((a, b) => new Date(a.time || 0).getTime() - new Date(b.time || 0).getTime());
    console.log(`\n=== Últimos 10 mensajes del caso más reciente (${latest.id}) ===`);
    for (const m of all.slice(-10)) {
      console.log(`  [${m.col}] ${m.role}: "${String(m.content || "").slice(0, 60)}" | ${m.time} | id=${m.messageId || "(sin id)"}`);
    }
  }
}

main().catch(console.error);
