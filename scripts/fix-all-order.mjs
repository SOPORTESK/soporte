// Arregla el orden de mensajes en TODOS los casos.
// Problema: el webhook pisaba el timestamp de mensajes salientes con
// messageTimestamp de WhatsApp, que tiene un reloj distinto al servidor.
// Esto hacía que mensajes del agente aparecieran ANTES que los del cliente.
//
// Fix: para cada caso, si un mensaje de histtecnico tiene time < que un
// mensaje de histcliente, se ajusta el time del tecnico a 1 segundo después
// del último mensaje del cliente anterior a él.
//
// Uso: node scripts/fix-all-order.mjs

import { createClient } from "@supabase/supabase-js";

const SUPABASE_URL = "https://kzcyxeracvfxynddyjld.supabase.co";
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SERVICE_KEY) {
  console.error("Falta SUPABASE_SERVICE_ROLE_KEY en el entorno");
  process.exit(1);
}

const s = createClient(SUPABASE_URL, SERVICE_KEY);

function parseTime(t) {
  if (!t) return null;
  const d = new Date(t);
  return isNaN(d.getTime()) ? null : d.getTime();
}

async function fixAll() {
  // Traer todos los casos que tengan mensajes
  const { data: cases, error } = await s
    .from("sek_cases")
    .select("id, title, histcliente, histtecnico, created_at")
    .not("histcliente", "is", null)
    .order("created_at", { ascending: false })
    .limit(500);

  if (error) {
    console.error("Error trayendo casos:", error.message);
    process.exit(1);
  }

  console.log(`Revisando ${cases.length} casos...`);
  let fixedCount = 0;
  let totalFixedMsgs = 0;

  for (const c of cases) {
    const clientHist = Array.isArray(c.histcliente) ? c.histcliente : [];
    const techHist = Array.isArray(c.histtecnico) ? c.histtecnico : [];

    if (techHist.length === 0 || clientHist.length === 0) continue;

    // Ordenar mensajes del cliente por tiempo
    const clientTimes = clientHist
      .map((m) => parseTime(m.time))
      .filter((t) => t !== null)
      .sort((a, b) => a - b);

    if (clientTimes.length === 0) continue;

    const firstClientTime = clientTimes[0];

    let modified = false;
    const newTech = [...techHist];

    for (let i = 0; i < newTech.length; i++) {
      const m = newTech[i];
      const t = parseTime(m.time);
      if (t === null) continue;

      // Si el mensaje del agente es ANTERIOR al primer mensaje del cliente,
      // ajustarlo a 1 segundo después del primer mensaje del cliente.
      if (t < firstClientTime) {
        const newTime = new Date(firstClientTime + 1000).toISOString();
        console.log(`  Caso ${c.id.slice(0, 8)}: agente ${m.time} -> ${newTime} | ${String(m.content || "").slice(0, 30).replace(/\n/g, " ")}`);
        newTech[i] = { ...m, time: newTime };
        modified = true;
        totalFixedMsgs++;
      }
    }

    if (modified) {
      const { error: updErr } = await s
        .from("sek_cases")
        .update({ histtecnico: newTech })
        .eq("id", c.id);
      if (updErr) {
        console.error(`  Error actualizando caso ${c.id}:`, updErr.message);
      } else {
        fixedCount++;
      }
    }
  }

  console.log(`\nListo: ${fixedCount} casos arreglados, ${totalFixedMsgs} mensajes corregidos.`);
}

fixAll().catch((e) => {
  console.error("Error fatal:", e);
  process.exit(1);
});
