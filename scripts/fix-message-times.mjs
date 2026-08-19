// Corregir tiempos de mensajes históricos en sek_cases
// Los mensajes del agente (histtecnico) se guardaban con hora del servidor (desfasada),
// mientras que los del cliente (histcliente) usaban la hora real de WhatsApp.
// El reloj del servidor está adelantado, así que los mensajes del agente aparecen
// ANTES que el mensaje del cliente que los originó.
//
// Heurística: los mensajes del agente con milisegundos != 0 en su time usan
// hora del servidor (poco confiable). Los del cliente con .000 usan hora de WhatsApp.
// Si un mensaje del agente se ordena ANTES que un mensaje del cliente, pero
// lógicamente debería ir después (es una respuesta), se ajusta su time a 1ms
// después del mensaje del cliente más cercano que debería precederlo.
//
// Uso: node scripts/fix-message-times.mjs

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

// Detectar si un time usa hora del servidor (tiene milisegundos != 0)
function isServerTime(timeStr) {
  if (!timeStr) return false;
  const m = timeStr.match(/\.(\d{3})/);
  return m && parseInt(m[1], 10) !== 0;
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

    // Merge con metadata
    const merged = [];

    histcliente.forEach((e, i) => {
      merged.push({
        type: "histcliente",
        idx: i,
        time: e?.time,
        ms: toMs(e?.time),
        isServer: isServerTime(e?.time),
      });
    });

    histtecnico.forEach((e, i) => {
      merged.push({
        type: "histtecnico",
        idx: i,
        time: e?.time,
        ms: toMs(e?.time),
        isServer: isServerTime(e?.time),
      });
    });

    // Ordenar por tiempo, luego cliente antes que tecnico, luego idx
    merged.sort((a, b) => {
      const aMs = isNaN(a.ms) ? Number.MAX_SAFE_INTEGER : a.ms;
      const bMs = isNaN(b.ms) ? Number.MAX_SAFE_INTEGER : b.ms;
      if (aMs !== bMs) return aMs - bMs;
      if (a.type !== b.type) return a.type === "histcliente" ? -1 : 1;
      return a.idx - b.idx;
    });

    // Recorrer y corregir tiempos
    // Un mensaje del agente con hora del servidor que aparece ANTES de un
    // mensaje del cliente debe ajustarse a después de ese mensaje del cliente.
    let prevMs = null;
    const fixes = [];

    for (let k = 0; k < merged.length; k++) {
      const m = merged[k];
      let currMs = m.ms;

      if (isNaN(currMs)) {
        currMs = prevMs !== null ? prevMs + 1 : Date.now();
        fixes.push({ type: m.type, idx: m.idx, newTime: toIso(currMs) });
        prevMs = currMs;
        continue;
      }

      // Si es mensaje del agente con hora del servidor, y hay un mensaje
      // del cliente DESPUÉS en el orden temporal, ajustar
      if (m.type === "histtecnico" && m.isServer) {
        // Buscar el siguiente mensaje del cliente
        let nextUserMs = null;
        for (let j = k + 1; j < merged.length; j++) {
          if (merged[j].type === "histcliente" && !isNaN(merged[j].ms)) {
            nextUserMs = merged[j].ms;
            break;
          }
        }
        // Si hay un mensaje del cliente después, y este mensaje del agente
        // tiene un tiempo anterior, ajustar a 1ms después del cliente
        if (nextUserMs !== null && currMs < nextUserMs) {
          currMs = nextUserMs + 1;
          fixes.push({ type: m.type, idx: m.idx, newTime: toIso(currMs) });
        }
      }

      // También corregir si el tiempo es anterior al previo
      if (prevMs !== null && currMs < prevMs) {
        currMs = prevMs + 1;
        fixes.push({ type: m.type, idx: m.idx, newTime: toIso(currMs) });
      }

      prevMs = currMs;
    }

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
