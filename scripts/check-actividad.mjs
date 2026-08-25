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

const main = async () => {
  const { data } = await db
    .from("sek_cases")
    .select("id, customer_phone, estado, histcliente, histtecnico, updated_at")
    .order("updated_at", { ascending: false })
    .limit(15);

  if (!data) return console.log("sin datos");

  const ahora = Date.now();
  const eventos = [];

  for (const c of data) {
    const todos = [
      ...(Array.isArray(c.histcliente) ? c.histcliente : []).map((m) => ({ ...m, quien: "CLIENTE" })),
      ...(Array.isArray(c.histtecnico) ? c.histtecnico : []).map((m) => ({ ...m, quien: "SEKUNET" })),
    ];
    for (const m of todos) {
      const t = new Date(m.time || 0).getTime();
      if (!t) continue;
      const minutos = (ahora - t) / 60000;
      if (minutos <= 90) {
        eventos.push({ minutos, quien: m.quien, tel: c.customer_phone, texto: (m.content || "(archivo)").substring(0, 55) });
      }
    }
  }

  eventos.sort((a, b) => a.minutos - b.minutos);

  if (eventos.length === 0) {
    console.log("No hubo mensajes en los ultimos 90 minutos.");
    return;
  }

  console.log(`Mensajes en los ultimos 90 minutos: ${eventos.length}\n`);
  for (const e of eventos.slice(0, 20)) {
    console.log(`  hace ${String(Math.round(e.minutos)).padStart(3)} min  ${e.quien.padEnd(8)} ${String(e.tel).padEnd(26)} ${e.texto}`);
  }
};

main().catch((e) => console.error("Fatal:", e.message));
