/**
 * diag-esperando-live.mjs
 * Revisa los tres numeros que reportan "Esperando este mensaje".
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

const phones = ["50689950611", "50661014444", "50687283434"];

async function main() {
  for (const phone of phones) {
    console.log(`\n${"=".repeat(60)}`);
    console.log(`NUMERO: +${phone}`);
    console.log(`${"=".repeat(60)}\n`);

    // Buscar caso mas reciente de este numero
    const { data: cases } = await db
      .from("sek_cases")
      .select("id, title, estado, created_at, customer_phone, histcliente, histtecnico")
      .or(`customer_phone.ilike.%${phone}%`)
      .order("created_at", { ascending: false })
      .limit(3);

    if (!cases || cases.length === 0) {
      console.log("  No se encontro caso para este numero.\n");
      continue;
    }

    for (const c of cases) {
      console.log(`Caso: ${c.id}`);
      console.log(`  Title: ${c.title}`);
      console.log(`  Estado: ${c.estado}`);
      console.log(`  Phone: ${c.customer_phone}`);
      console.log(`  Created: ${c.created_at}`);

      const hc = Array.isArray(c.histcliente) ? c.histcliente : [];
      const ht = Array.isArray(c.histtecnico) ? c.histtecnico : [];
      const all = [
        ...hc.map(m => ({...m, col: "cliente"})),
        ...ht.map(m => ({...m, col: "tecnico"})),
      ].sort((a, b) => new Date(a.time || 0).getTime() - new Date(b.time || 0).getTime());

      console.log(`  Mensajes: ${all.length} (cliente=${hc.length}, tecnico=${ht.length})`);

      // Mostrar ultimos 10 mensajes
      console.log(`\n  --- Ultimos 10 mensajes ---`);
      for (const m of all.slice(-10)) {
        const content = String(m.content || "(VACIO)").slice(0, 70);
        const hasMedia = m.mediaUrl ? ` [${m.mediaType || "media"}]` : "";
        const edited = m.edited ? " [EDITED]" : "";
        const id = (m.messageId || "(sin id)").slice(0, 20);
        console.log(`  [${m.col}] ${m.role}: "${content}"${hasMedia}${edited} | ${m.time} | ${id}`);
      }

      // Buscar mensajes vacios
      const empty = all.filter(m => !m.content || String(m.content).trim() === "");
      if (empty.length > 0) {
        console.log(`\n  *** ${empty.length} mensajes VACIOS ***`);
        for (const m of empty.slice(-3)) {
          console.log(`    time=${m.time} mediaUrl=${m.mediaUrl || "(none)"} id=${(m.messageId || "").slice(0, 20)}`);
        }
      }

      // Buscar duplicados
      const byContent = new Map();
      for (const m of all) {
        const key = String(m.content || "").trim().toLowerCase();
        if (key.length > 5) {
          if (!byContent.has(key)) byContent.set(key, []);
          byContent.get(key).push(m);
        }
      }
      const dups = [...byContent.values()].filter(arr => arr.length > 1);
      if (dups.length > 0) {
        console.log(`\n  *** ${dups.length} mensajes DUPLICADOS ***`);
        for (const d of dups.slice(0, 3)) {
          console.log(`    "${String(d[0].content || "").slice(0, 40)}" x${d.length}`);
          for (const m of d) {
            console.log(`      [${m.col}] time=${m.time} id=${(m.messageId || "").slice(0, 20)}`);
          }
        }
      }

      // Verificar el ultimo mensaje: cuanto tiempo hace
      const last = all[all.length - 1];
      if (last) {
        const lastTime = new Date(last.time || 0).getTime();
        const now = Date.now();
        const diffMin = Math.round((now - lastTime) / 60000);
        console.log(`\n  Ultimo mensaje: hace ${diffMin} minutos (${last.role} via ${last.col})`);
      }

      console.log("");
    }
  }
}

main().catch(console.error);
