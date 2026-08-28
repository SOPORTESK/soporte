/**
 * diag-edits3.mjs
 * Busca "Es nuevo, o es el mismo" en TODOS los casos, no solo recientes.
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
  let desde = 0;
  const PAGINA = 200;
  let total = 0;
  const found = [];

  for (let i = 0; i < 50; i++) {
    const { data, error } = await db
      .from("sek_cases")
      .select("id, histcliente, histtecnico, created_at, title, customer_phone")
      .order("created_at", { ascending: false })
      .range(desde, desde + PAGINA - 1);
    if (!data || data.length === 0) break;
    total += data.length;

    for (const c of data) {
      for (const campo of ["histcliente", "histtecnico"]) {
        const arr = Array.isArray(c[campo]) ? c[campo] : [];
        for (let idx = 0; idx < arr.length; idx++) {
          const m = arr[idx];
          if (!m?.content) continue;
          const txt = String(m.content).toLowerCase();
          if (txt.includes("es nuevo") || txt.includes("es el mismo") || txt.includes("ds-pwa48")) {
            found.push({
              caseId: c.id,
              caseTitle: c.title,
              phone: c.customer_phone,
              campo,
              idx,
              role: m.role,
              content: String(m.content).slice(0, 120),
              time: m.time,
              messageId: m.messageId || "(sin id)",
            });
          }
        }
      }
    }
    desde += PAGINA;
  }

  console.log(`=== Revisados ${total} casos ===`);
  console.log(`=== Mensajes encontrados: ${found.length} ===\n`);

  for (const f of found) {
    console.log(`Caso: ${f.caseId} - ${f.caseTitle} (${f.phone})`);
    console.log(`  [${f.campo}[${f.idx}]] role=${f.role}`);
    console.log(`  content: "${f.content}"`);
    console.log(`  time: ${f.time}`);
    console.log(`  messageId: ${f.messageId}`);
    console.log("");
  }
}

main().catch(console.error);
