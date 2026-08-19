// Corregir tiempos de mensajes históricos - v2
// La v1 tenía la lógica invertida: ponía al agente ANTES del cliente siguiente.
// La lógica correcta: el agente responde DESPUÉS del cliente que lo precede.
//
// Heurística:
// 1. Los mensajes del cliente (histcliente) con time terminando en .000 son de WhatsApp (confiables).
//    Restaurar los que tengan milisegundos != 0 a .000 (fueron corruptos por v1).
// 2. Para cada mensaje del agente (histtecnico), buscar el mensaje del cliente con
//    el mayor tiempo que sea <= tiempo del agente, y ajustar el agente a cliente.time + 1ms.
//    Si no hay cliente anterior, dejarlo al inicio.
//
// Uso: node scripts/fix-message-times-v2.mjs

import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "fs";
import { resolve } from "path";

const envPath = resolve(process.cwd(), ".env.local");
const envContent = readFileSync(envPath, "utf8");
const env = {};
for (const line of envContent.split(/\r?\n/)) {
  const m = line.match(/^([A-Za-z_]+)=(.*)$/);
  if (m) env[m[1]] = m[2].replace(/^["']|["']$/g, "").trim();
}

const SUPABASE_URL = env.NEXT_PUBLIC_SUPABASE_URL || env.SUPABASE_URL;
const SUPABASE_SERVICE_KEY = env.SUPABASE_SERVICE_ROLE_KEY || env.SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) {
  console.error("Faltan NEXT_PUBLIC_SUPABASE_URL y SUPABASE_SERVICE_ROLE_KEY en .env.local");
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

function toMs(timeStr) {
  if (!timeStr) return NaN;
  return new Date(timeStr).getTime();
}

function toIso(ms) {
  return new Date(ms).toISOString();
}

// Restaurar tiempo de WhatsApp: segundos enteros (.000)
function restoreWhatsAppTime(timeStr) {
  if (!timeStr) return timeStr;
  const ms = toMs(timeStr);
  if (isNaN(ms)) return timeStr;
  // Redondear al segundo más cercano (hacia abajo)
  const restored = Math.floor(ms / 1000) * 1000;
  return toIso(restored);
}

async function main() {
  console.log("Cargando casos...");
  const { data: cases, error } = await supabase
    .from("sek_cases")
    .select("id, histcliente, histtecnico")
    .order("created_at", { ascending: false })
    .limit(500);

  if (error) {
    console.error("Error cargando casos:", error);
    process.exit(1);
  }

  console.log(`Casos cargados: ${cases.length}`);
  let totalFixed = 0;
  let casesFixed = 0;

  for (const c of cases) {
    const histcliente = Array.isArray(c.histcliente) ? c.histcliente : [];
    const histtecnico = Array.isArray(c.histtecnico) ? c.histtecnico : [];

    if (histcliente.length === 0 && histtecnico.length === 0) continue;

    const fixes = [];

    // 1. Restaurar tiempos del cliente a segundos enteros (.000)
    histcliente.forEach((e, i) => {
      if (!e?.time) return;
      const ms = toMs(e.time);
      if (isNaN(ms)) return;
      const msInSecond = ms % 1000;
      if (msInSecond !== 0) {
        const restored = Math.floor(ms / 1000) * 1000;
        fixes.push({ type: "histcliente", idx: i, newTime: toIso(restored) });
      }
    });

    // 2. Para cada mensaje del agente, buscar el cliente anterior más cercano
    // Primero, construir lista de tiempos del cliente (restaurados)
    const clienteTimes = histcliente.map((e, i) => {
      const ms = toMs(e?.time);
      if (isNaN(ms)) return null;
      const msInSecond = ms % 1000;
      return msInSecond !== 0 ? Math.floor(ms / 1000) * 1000 : ms;
    }).filter(t => t !== null).sort((a, b) => a - b);

    histtecnico.forEach((e, i) => {
      if (!e?.time) return;
      const agentMs = toMs(e.time);
      if (isNaN(agentMs)) return;

      // Buscar el mensaje del cliente con mayor tiempo <= agentMs
      let bestClienteMs = null;
      for (const ct of clienteTimes) {
        if (ct <= agentMs) {
          bestClienteMs = ct;
        } else {
          break;
        }
      }

      // Si hay un cliente anterior, ajustar agente a cliente.time + 1ms
      if (bestClienteMs !== null) {
        const newMs = bestClienteMs + 1;
        if (newMs !== agentMs) {
          fixes.push({ type: "histtecnico", idx: i, newTime: toIso(newMs) });
        }
      }
    });

    if (fixes.length === 0) continue;

    // Aplicar fixes
    const newHistcliente = [...histcliente];
    const newHisttecnico = [...histtecnico];

    for (const f of fixes) {
      if (f.type === "histcliente") {
        newHistcliente[f.idx] = { ...newHistcliente[f.idx], time: f.newTime };
      } else {
        newHisttecnico[f.idx] = { ...newHisttecnico[f.idx], time: f.newTime };
      }
    }

    const { error: updateErr } = await supabase
      .from("sek_cases")
      .update({ histcliente: newHistcliente, histtecnico: newHisttecnico })
      .eq("id", c.id);

    if (updateErr) {
      console.error(`Error actualizando caso ${c.id}:`, updateErr.message);
    } else {
      console.log(`Caso ${c.id}: ${fixes.length} mensajes corregidos`);
      totalFixed += fixes.length;
      casesFixed++;
    }
  }

  console.log(`\nListo. ${totalFixed} mensajes corregidos en ${casesFixed} casos.`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
