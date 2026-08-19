// Corregir tiempos de mensajes históricos - v3
// v2 tenía un bug: no respetaba el orden de inserción dentro de histtecnico.
// El mensaje de bienvenida (histtecnico[0]) podía quedar después de histtecnico[1].
//
// v3:
// 1. Identifica el mensaje de bienvenida por contenido ("Bienvenido al soporte técnico de Sekunet")
// 2. Lo coloca en first_client_time + 1ms
// 3. Para los demás mensajes del agente, procesa en orden de índice de histtecnico:
//    new_time = max(closest_preceding_client + 1ms, prev_histtecnico + 1ms, current_time)
//    Así garantiza que cada mensaje del agente vaya después del anterior y después del cliente que lo precede.

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

const WELCOME_MARKER = "Bienvenido al soporte técnico de Sekunet";

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

    // Tiempos del cliente (ordenados)
    const clienteTimes = histcliente
      .map((e) => toMs(e?.time))
      .filter((ms) => !isNaN(ms))
      .sort((a, b) => a - b);

    // Primer mensaje del cliente
    const firstClientMs = clienteTimes.length > 0 ? clienteTimes[0] : null;

    // Buscar mensaje de bienvenida
    const welcomeIdx = histtecnico.findIndex(
      (e) => typeof e?.content === "string" && e.content.includes(WELCOME_MARKER)
    );

    // Procesar histtecnico en orden de índice
    let prevTecnicoMs = null;
    for (let i = 0; i < histtecnico.length; i++) {
      const e = histtecnico[i];
      const currMs = toMs(e?.time);

      let newMs;

      if (i === welcomeIdx && firstClientMs !== null) {
        // Mensaje de bienvenida: justo después del primer cliente
        newMs = firstClientMs + 1;
      } else if (isNaN(currMs)) {
        // Sin tiempo: usar prev_tecnico + 1 o now
        newMs = prevTecnicoMs !== null ? prevTecnicoMs + 1 : Date.now();
      } else {
        // Tiempo existente: verificar que va después del cliente precedente
        // y después del mensaje anterior del agente
        let closestClientMs = null;
        for (const ct of clienteTimes) {
          if (ct <= currMs) {
            closestClientMs = ct;
          } else {
            break;
          }
        }

        newMs = currMs;
        if (closestClientMs !== null && newMs < closestClientMs + 1) {
          newMs = closestClientMs + 1;
        }
        if (prevTecnicoMs !== null && newMs < prevTecnicoMs + 1) {
          newMs = prevTecnicoMs + 1;
        }
      }

      if (newMs !== currMs) {
        fixes.push({ type: "histtecnico", idx: i, newTime: toIso(newMs) });
      }

      prevTecnicoMs = newMs;
    }

    if (fixes.length === 0) continue;

    // Aplicar fixes
    const newHisttecnico = [...histtecnico];
    for (const f of fixes) {
      newHisttecnico[f.idx] = { ...newHisttecnico[f.idx], time: f.newTime };
    }

    const { error: updateErr } = await supabase
      .from("sek_cases")
      .update({ histtecnico: newHisttecnico })
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
