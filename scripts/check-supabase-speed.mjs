/**
 * check-supabase-speed.mjs
 * Mide latencia de Supabase REST API con queries reales.
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

async function time(label, fn) {
  const t0 = Date.now();
  try {
    const result = await fn();
    const ms = Date.now() - t0;
    console.log(`${label}: ${ms}ms OK`);
    return result;
  } catch (e) {
    const ms = Date.now() - t0;
    console.log(`${label}: ${ms}ms ERROR: ${e.message}`);
    return null;
  }
}

async function main() {
  console.log("=== Supabase Latency Test ===\n");

  // 1. Query trivial
  await time("1. select id limit 1", () =>
    db.from("sek_cases").select("id").limit(1)
  );

  // 2. Contar casos
  await time("2. count sek_cases", () =>
    db.from("sek_cases").select("id", { count: "exact", head: true })
  );

  // 3. Casos abiertos (lo que hace el polling)
  await time("3. open cases (id, phone, estado)", () =>
    db.from("sek_cases")
      .select("id, customer_phone, estado")
      .not("estado", "in", '("cerrado","resuelto")')
      .order("created_at", { ascending: false })
      .limit(50)
  );

  // 4. Lo que hace el polling PERO con historiales completos (pesado)
  await time("4. open cases WITH histcliente+histtecnico", () =>
    db.from("sek_cases")
      .select("id, customer_phone, histcliente, histtecnico")
      .not("estado", "in", '("cerrado","resuelto")')
      .order("created_at", { ascending: false })
      .limit(50)
  );

  // 5. Un caso con todos sus mensajes
  const { data: oneCase } = await db.from("sek_cases").select("id").limit(1).single();
  if (oneCase) {
    await time(`5. single case ${oneCase.id} full`, () =>
      db.from("sek_cases")
        .select("id, histcliente, histtecnico, cliente, estado")
        .eq("id", oneCase.id)
        .single()
    );
  }

  console.log("\n=== Done ===");
}

main().catch(console.error);
