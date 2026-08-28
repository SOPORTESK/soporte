/**
 * diag-case-b03e021b-dup.mjs
 * Verifica si el mensaje editado se duplicó en la BD (eco del webhook).
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
    .select("histtecnico")
    .eq("id", "b03e021b-f606-43d8-a182-0b3283f31271")
    .single();

  const ht = Array.isArray(c?.histtecnico) ? c.histtecnico : [];

  console.log("=== Buscando mensajes con 'Es nuevo' en histtecnico ===\n");
  let count = 0;
  ht.forEach((m, i) => {
    if (m?.content && String(m.content).toLowerCase().includes("es nuevo")) {
      count++;
      console.log(`ht[${i}]:`);
      console.log(`  content: "${m.content}"`);
      console.log(`  time: ${m.time}`);
      console.log(`  messageId: ${m.messageId}`);
      console.log(`  edited: ${m.edited || false}`);
      console.log(`  edited_at: ${m.edited_at || "(n/a)"}`);
      console.log(`  fromMe: ${m.fromMe}`);
      console.log("");
    }
  });
  console.log(`Total: ${count}`);

  if (count > 1) {
    console.log("\n*** DUPLICADO DETECTADO: el eco del webhook agregó el mensaje editado como nuevo ***");
  } else if (count === 1) {
    console.log("\n*** Solo 1 mensaje en BD. El duplicado se ve en WhatsApp pero no en el sistema ***");
  }
}

main().catch(console.error);
