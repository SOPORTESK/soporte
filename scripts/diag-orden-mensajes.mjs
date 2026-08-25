/**
 * diag-orden-mensajes.mjs
 *
 * Diagnostica por que los mensajes aparecen desordenados en el chat.
 * NO modifica nada, solo mide.
 *
 * La UI (chat-view.tsx -> unifyMessages) ordena por el campo `time` de cada
 * mensaje. Si ese campo falta, es invalido, o tiene poca precision, el orden
 * mostrado no coincide con el orden real de la conversacion.
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

const stats = {
  casosRevisados: 0,
  totalMensajes: 0,
  sinTime: 0,
  timeInvalido: 0,
  precisionSegundos: 0,
  precisionMilis: 0,
  arrayDesordenado: 0,
  casosDesordenados: [],
  colisionesMismoSegundo: 0,
  casosConSinTime: [],
  futuros: 0,
};

const main = async () => {
  let desde = 0;
  const PAGINA = 500;

  for (;;) {
    const { data, error } = await db
      .from("sek_cases")
      .select("id, created_at, customer_phone, histcliente, histtecnico")
      .order("created_at", { ascending: false })
      .range(desde, desde + PAGINA - 1);

    if (error) { console.error("Error:", error.message); break; }
    if (!data || data.length === 0) break;

    for (const c of data) {
      stats.casosRevisados++;

      for (const campo of ["histcliente", "histtecnico"]) {
        const arr = Array.isArray(c[campo]) ? c[campo] : [];
        if (arr.length === 0) continue;

        const tiempos = [];
        for (const m of arr) {
          stats.totalMensajes++;

          if (!m || !m.time) {
            stats.sinTime++;
            if (stats.casosConSinTime.length < 12) {
              stats.casosConSinTime.push({
                caso: c.id, campo,
                rol: m?.role || "?",
                texto: String(m?.content || "(vacio)").substring(0, 45),
              });
            }
            tiempos.push(null);
            continue;
          }

          const t = new Date(m.time).getTime();
          if (isNaN(t)) { stats.timeInvalido++; tiempos.push(null); continue; }
          if (t > Date.now() + 60000) stats.futuros++;

          // Precision: los que vienen de WhatsApp traen segundos exactos (.000)
          if (t % 1000 === 0) stats.precisionSegundos++;
          else stats.precisionMilis++;

          tiempos.push(t);
        }

        // El array guardado esta desordenado respecto al tiempo?
        const validos = tiempos.filter((t) => t !== null);
        let desordenado = false;
        for (let i = 1; i < validos.length; i++) {
          if (validos[i] < validos[i - 1]) { desordenado = true; break; }
        }
        if (desordenado) {
          stats.arrayDesordenado++;
          if (stats.casosDesordenados.length < 12) {
            stats.casosDesordenados.push({ caso: c.id, campo, tel: c.customer_phone, n: arr.length });
          }
        }

        // Colisiones en el mismo segundo (empates que se resuelven al azar)
        const porSegundo = {};
        for (const t of validos) {
          const s = Math.floor(t / 1000);
          porSegundo[s] = (porSegundo[s] || 0) + 1;
        }
        for (const k in porSegundo) if (porSegundo[k] > 1) stats.colisionesMismoSegundo += porSegundo[k] - 1;
      }
    }

    if (data.length < PAGINA) break;
    desde += PAGINA;
  }

  const pct = (n) => stats.totalMensajes ? ((n / stats.totalMensajes) * 100).toFixed(2) + "%" : "0%";

  console.log("==================================================");
  console.log("  DIAGNOSTICO DE ORDEN DE MENSAJES");
  console.log("==================================================");
  console.log("Casos revisados      :", stats.casosRevisados);
  console.log("Mensajes totales     :", stats.totalMensajes);
  console.log("");
  console.log("--- PROBLEMAS QUE ROMPEN EL ORDEN ---");
  console.log("Sin campo 'time'     :", stats.sinTime, `(${pct(stats.sinTime)})  <-- caen al INICIO del chat`);
  console.log("Con 'time' invalido  :", stats.timeInvalido, `(${pct(stats.timeInvalido)})  <-- caen al FINAL`);
  console.log("Con fecha futura     :", stats.futuros);
  console.log("");
  console.log("--- PRECISION DEL RELOJ ---");
  console.log("Precision segundos   :", stats.precisionSegundos, `(${pct(stats.precisionSegundos)})  <-- vienen de WhatsApp`);
  console.log("Precision milisegundos:", stats.precisionMilis, `(${pct(stats.precisionMilis)})  <-- generados por la app`);
  console.log("Empates mismo segundo:", stats.colisionesMismoSegundo, " <-- orden decidido por desempate, no por hora real");
  console.log("");
  console.log("--- ORDEN FISICO DEL ARRAY ---");
  console.log("Historiales desordenados:", stats.arrayDesordenado);

  if (stats.casosConSinTime.length) {
    console.log("\n--- EJEMPLOS SIN 'time' (aparecen al inicio del chat) ---");
    for (const e of stats.casosConSinTime) {
      console.log(`  ${e.caso} | ${e.campo} | ${e.rol} | "${e.texto}"`);
    }
  }

  if (stats.casosDesordenados.length) {
    console.log("\n--- EJEMPLOS DE HISTORIAL DESORDENADO ---");
    for (const e of stats.casosDesordenados) {
      console.log(`  ${e.caso} | ${e.campo} | tel=${e.tel} | ${e.n} msgs`);
    }
  }
};

main().catch((e) => console.error("Fatal:", e.message));
