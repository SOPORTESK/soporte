/**
 * diag-messageid.mjs
 *
 * La funcion sek_append_hist deduplica por messageId. Si un mensaje llega sin
 * messageId, esa proteccion no aplica y el duplicado entra. Este script mide
 * cuantos mensajes no tienen messageId y cuantos duplicados tienen ids
 * distintos (lo que significa que se envio dos veces de verdad).
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
  let total = 0, sinId = 0, conId = 0;
  const porRol = {};
  let dupIdsDistintos = 0, dupSinId = 0, dupMismoId = 0;

  for (;;) {
    const { data } = await db
      .from("sek_cases")
      .select("id, histcliente, histtecnico")
      .order("created_at", { ascending: false })
      .range(desde, desde + PAGINA - 1);

    if (!data || data.length === 0) break;

    for (const c of data) {
      for (const campo of ["histcliente", "histtecnico"]) {
        const arr = Array.isArray(c[campo]) ? c[campo] : [];
        const porTexto = new Map();

        for (const m of arr) {
          if (!m) continue;
          total++;
          const rol = m.role || "?";
          porRol[rol] = porRol[rol] || { total: 0, sinId: 0 };
          porRol[rol].total++;

          if (!m.messageId) { sinId++; porRol[rol].sinId++; }
          else conId++;

          const texto = norm(m.content);
          if (texto.length >= 25) {
            if (!porTexto.has(texto)) porTexto.set(texto, []);
            porTexto.get(texto).push(m);
          }
        }

        for (const [, copias] of porTexto) {
          if (copias.length < 2) continue;
          for (let i = 1; i < copias.length; i++) {
            const a = copias[i - 1], b = copias[i];
            const ta = new Date(a.time || 0).getTime();
            const tb = new Date(b.time || 0).getTime();
            if (Math.abs(tb - ta) > 600000) continue;
            if (!a.messageId || !b.messageId) dupSinId++;
            else if (a.messageId === b.messageId) dupMismoId++;
            else dupIdsDistintos++;
          }
        }
      }
    }

    if (data.length < PAGINA) break;
    desde += PAGINA;
  }

  console.log("==================================================");
  console.log("  IDENTIFICADOR UNICO DE MENSAJE (messageId)");
  console.log("==================================================");
  console.log("Mensajes totales :", total);
  console.log("CON messageId    :", conId, `(${((conId / total) * 100).toFixed(1)}%)`);
  console.log("SIN messageId    :", sinId, `(${((sinId / total) * 100).toFixed(1)}%)  <-- la proteccion de la BD no los cubre`);
  console.log("");
  console.log("Por tipo de mensaje:");
  for (const [rol, v] of Object.entries(porRol).sort((a, b) => b[1].total - a[1].total)) {
    const p = ((v.sinId / v.total) * 100).toFixed(1);
    console.log(`  ${rol.padEnd(10)} total=${String(v.total).padStart(6)}  sin id=${String(v.sinId).padStart(5)} (${p}%)`);
  }
  console.log("");
  console.log("De los duplicados encontrados:");
  console.log("  mismo messageId  :", dupMismoId, " <-- la BD deberia haberlos bloqueado");
  console.log("  sin messageId    :", dupSinId, " <-- imposible deduplicar hoy");
  console.log("  messageId distinto:", dupIdsDistintos, " <-- SE ENVIO DOS VECES DE VERDAD (reintento)");
};

main().catch((e) => console.error("Fatal:", e.message));
