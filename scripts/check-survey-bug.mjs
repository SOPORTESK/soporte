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

// Buscar casos recientes en calificacion_pendiente o cerrados recientemente
const { data } = await db
  .from("sek_cases")
  .select("id, title, estado, closed_at, created_at")
  .in("estado", ["calificacion_pendiente", "cerrado"])
  .order("closed_at", { ascending: false })
  .limit(20);

console.log("=== Casos cerrados/calificacion_pendiente recientes ===\n");
for (const c of data || []) {
  console.log(`${c.estado.padEnd(22)} | ${c.closed_at} | ${c.title}`);
}

// Buscar si hay mensajes de encuesta en histtecnico de casos recientes
console.log("\n=== Buscando mensajes de encuesta en casos recientes ===\n");
const { data: recent } = await db
  .from("sek_cases")
  .select("id, title, estado, closed_at, histtecnico")
  .order("closed_at", { ascending: false })
  .limit(10);

for (const c of recent || []) {
  const ht = Array.isArray(c.histtecnico) ? c.histtecnico : [];
  const surveyMsgs = ht.filter(m => 
    m?.content && (
      String(m.content).includes("calificar") || 
      String(m.content).includes("calificaci") ||
      String(m.content).includes("1 al 5") ||
      String(m.content).includes("muy mala") ||
      String(m.content).includes("excelente")
    )
  );
  if (surveyMsgs.length > 0) {
    console.log(`Caso ${c.id} (${c.estado}) - ${c.title}`);
    for (const m of surveyMsgs) {
      console.log(`  time=${m.time} content="${String(m.content).slice(0, 80)}"`);
    }
    console.log("");
  }
}
