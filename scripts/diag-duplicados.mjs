/**
 * diag-duplicados.mjs
 *
 * Hipotesis: los mensajes del agente se guardan DOS veces:
 *   1) cuando la app los envia            -> hora del servidor, con milisegundos
 *   2) cuando WhatsApp los devuelve (eco) -> hora de WhatsApp, redondeada a segundos
 *
 * Las dos copias tienen horas distintas, entonces la UI las coloca en
 * posiciones distintas y la conversacion se ve desordenada.
 *
 * Este script mide cuantos duplicados hay y cuanta diferencia de hora tienen.
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

const norm = (s) => String(s || "").trim().toLowerCase().replace(/\s+/g, " ");

const main = async () => {
  let desde = 0;
  const PAGINA = 500;

  let casosRevisados = 0;
  let paresDuplicados = 0;
  let casosAfectados = 0;
  const difs = [];
  const ejemplos = [];
  let dupMismoId = 0;

  for (;;) {
    const { data, error } = await db
      .from("sek_cases")
      .select("id, customer_phone, histcliente, histtecnico")
      .order("created_at", { ascending: false })
      .range(desde, desde + PAGINA - 1);

    if (error) { console.error("Error:", error.message); break; }
    if (!data || data.length === 0) break;

    for (const c of data) {
      casosRevisados++;
      let afectado = false;

      for (const campo of ["histcliente", "histtecnico"]) {
        const arr = Array.isArray(c[campo]) ? c[campo] : [];
        const porTexto = new Map();

        for (const m of arr) {
          const texto = norm(m?.content);
          // Solo textos con sustancia: los cortos ("si", "ok") se repiten de forma legitima
          if (texto.length < 25) continue;
          const t = new Date(m?.time || 0).getTime();
          if (!t || isNaN(t)) continue;

          if (!porTexto.has(texto)) porTexto.set(texto, []);
          porTexto.get(texto).push({ t, time: m.time, rol: m.role, msgId: m.messageId || null });
        }

        for (const [texto, copias] of porTexto) {
          if (copias.length < 2) continue;
          copias.sort((a, b) => a.t - b.t);

          for (let i = 1; i < copias.length; i++) {
            const a = copias[i - 1];
            const b = copias[i];
            const difSeg = Math.round((b.t - a.t) / 1000);

            // Mas de 10 minutos: probablemente el cliente escribio lo mismo otra vez
            if (difSeg > 600) continue;

            paresDuplicados++;
            afectado = true;
            difs.push(difSeg);
            if (a.msgId && b.msgId && a.msgId === b.msgId) dupMismoId++;

            const precA = a.t % 1000 === 0 ? "SEG" : "ms";
            const precB = b.t % 1000 === 0 ? "SEG" : "ms";

            if (ejemplos.length < 15) {
              ejemplos.push({
                caso: c.id, campo, rol: b.rol, difSeg,
                a: `${a.time} (${precA})`, b: `${b.time} (${precB})`,
                texto: texto.substring(0, 40),
              });
            }
          }
        }
      }
      if (afectado) casosAfectados++;
    }

    if (data.length < PAGINA) break;
    desde += PAGINA;
  }

  difs.sort((a, b) => a - b);
  const media = difs.length ? Math.round(difs.reduce((s, d) => s + d, 0) / difs.length) : 0;

  console.log("==================================================");
  console.log("  MENSAJES DUPLICADOS CON HORAS DISTINTAS");
  console.log("==================================================");
  console.log("Casos revisados       :", casosRevisados);
  console.log("Casos afectados       :", casosAfectados, `(${((casosAfectados / casosRevisados) * 100).toFixed(1)}%)`);
  console.log("Pares duplicados      :", paresDuplicados);
  console.log("  ...con mismo msgId  :", dupMismoId);
  console.log("");
  if (difs.length) {
    console.log("Diferencia de hora entre las dos copias:");
    console.log("  minima  :", difs[0], "seg");
    console.log("  mediana :", difs[Math.floor(difs.length / 2)], "seg");
    console.log("  promedio:", media, "seg");
    console.log("  maxima  :", difs[difs.length - 1], "seg");
    const grandes = difs.filter((d) => d >= 5).length;
    console.log("");
    console.log(`  Con 5+ seg de diferencia: ${grandes} (${((grandes / difs.length) * 100).toFixed(1)}%)  <-- estos SI se ven desordenados`);
  }

  if (ejemplos.length) {
    console.log("\n--- EJEMPLOS ---");
    for (const e of ejemplos) {
      console.log(`\n  caso ${e.caso}`);
      console.log(`    ${e.campo} | ${e.rol} | diferencia ${e.difSeg}s | "${e.texto}"`);
      console.log(`      copia 1: ${e.a}`);
      console.log(`      copia 2: ${e.b}`);
    }
  }
};

main().catch((e) => console.error("Fatal:", e.message));
