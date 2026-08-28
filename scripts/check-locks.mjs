/**
 * check-locks.mjs
 * Revisa sesiones activas, locks y queries lentos en Supabase via pg_stat.
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
  console.log("=== Estado de Supabase ===\n");

  // 1. Conexiones activas
  console.log("(no se puede ejecutar SQL directo en Supabase REST, usando metricas alternativas)");

  // 2. Tamaño de las tablas mas pesadas
  const { data: sizes } = await db
    .from("sek_cases")
    .select("id", { count: "exact", head: true });
  console.log(`sek_cases: ${sizes ?? "?"} filas`);

  // 3. Medir query pesada del polling (50 casos con JSONB completo)
  const t0 = Date.now();
  const { data: heavy, error: e2 } = await db
    .from("sek_cases")
    .select("id, customer_phone, histcliente, histtecnico")
    .not("estado", "in", '("cerrado","resuelto")')
    .order("created_at", { ascending: false })
    .limit(50);
  const ms = Date.now() - t0;
  const totalBytes = JSON.stringify(heavy || []).length;
  console.log(`\nQuery del polling (50 casos con JSONB): ${ms}ms, ${totalBytes} bytes (${(totalBytes/1024).toFixed(0)}KB)`);

  if (heavy) {
    const totalMsgs = heavy.reduce((s, c) => s + (c.histcliente?.length || 0) + (c.histtecnico?.length || 0), 0);
    console.log(`Mensajes cargados en esa query: ${totalMsgs}`);
    const biggest = heavy.map(c => ({
      id: c.id,
      bytes: JSON.stringify(c).length,
      msgs: (c.histcliente?.length || 0) + (c.histtecnico?.length || 0),
    })).sort((a, b) => b.bytes - a.bytes).slice(0, 5);
    console.log(`\nCasos mas pesados:`);
    biggest.forEach(c => console.log(`  ${c.id}: ${c.msgs} msgs, ${(c.bytes/1024).toFixed(0)}KB`));
  }

  // 4. Medir query que hace el frontend al abrir un caso
  const t1 = Date.now();
  await db.from("sek_cases").select("*").limit(1).single();
  console.log(`\nQuery abriendo 1 caso (select *): ${Date.now() - t1}ms`);

  // 5. Verificar si hay casos con historiales gigantescos
  const t2 = Date.now();
  const { data: allCases } = await db
    .from("sek_cases")
    .select("id, histcliente, histtecnico")
    .order("created_at", { ascending: false })
    .limit(200);
  console.log(`Cargar 200 casos con historiales: ${Date.now() - t2}ms`);

  if (allCases) {
    const sizes = allCases.map(c => ({
      id: c.id,
      msgs: (c.histcliente?.length || 0) + (c.histtecnico?.length || 0),
      bytes: JSON.stringify(c).length,
    })).sort((a, b) => b.msgs - a.msgs);

    const huge = sizes.filter(s => s.msgs > 100);
    console.log(`\nCasos con mas de 100 mensajes: ${huge.length}`);
    huge.slice(0, 10).forEach(s => console.log(`  ${s.id}: ${s.msgs} msgs, ${(s.bytes/1024).toFixed(0)}KB`));

    const totalSize = sizes.reduce((s, c) => s + c.bytes, 0);
    console.log(`\nTamaño total de 200 casos: ${(totalSize/1024/1024).toFixed(1)}MB`);
  }
}

main().catch(console.error);
