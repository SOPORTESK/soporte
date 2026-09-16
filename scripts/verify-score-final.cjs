// Replica la logica FINAL de page.tsx (3 componentes + compuerta CSAT). Solo lectura.
const fs = require("fs");
const path = require("path");
const env = {};
fs.readFileSync(path.join(__dirname, "..", ".env.local"), "utf8")
  .replace(/^\uFEFF/, "").split(/\r?\n/).forEach((l) => {
    const m = l.match(/^([A-Za-z0-9_]+)=(.*)$/);
    if (m) env[m[1]] = m[2].replace(/^"|"$/g, "");
  });
const { createClient } = require(path.join(__dirname, "..", "node_modules", "@supabase/supabase-js"));
const db = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY);

const CR_OFFSET_MS = 6 * 3600000;
const BH_INI = 450, BH_FIN = 1020, JORNADA = 570;
const META = 2.5, CSAT_MIN_CALS = 30, CSAT_MIN_COB = 15;
const MIN_CASOS_SCORE = 5, MIN_CALS_AGENTE = 4, UMBRAL_GAP = 15;
const isAgentRole = (r) => r === "agente" || r === "agent" || r === "tecnico";

const diaDe = (ms) => Math.floor((ms - CR_OFFSET_MS) / 86400000);
function minutosLaborales(s, e) {
  if (isNaN(s) || isNaN(e) || e <= s) return 0;
  let tot = 0;
  for (let d = diaDe(s); d <= diaDe(e) && d - diaDe(s) <= 400; d++) {
    const dow = new Date(d * 86400000).getUTCDay();
    if (dow === 0 || dow === 6) continue;
    const mn = d * 86400000 + CR_OFFSET_MS;
    const a = Math.max(s, mn + BH_INI * 60000), b = Math.min(e, mn + BH_FIN * 60000);
    if (b > a) tot += Math.round((b - a) / 60000);
  }
  return tot;
}
function diasHabiles(s, e) {
  if (isNaN(s) || isNaN(e) || e < s) return 0;
  let n = 0;
  for (let d = diaDe(s); d <= diaDe(e) && d - diaDe(s) <= 4000; d++) {
    const dow = new Date(d * 86400000).getUTCDay();
    if (dow !== 0 && dow !== 6) n++;
  }
  return n;
}

(async () => {
  const { data: flowRow } = await db.from("sek_flow_configs").select("flow_data").limit(1).maybeSingle();
  const plantillas = [
    ...((flowRow?.flow_data?.nodes || []).map((n) => String(n?.data?.message || "")).filter((m) => m.length > 15)),
    "Buen día. Gracias por contactarnos. Mi nombre", "Al no haber recibido respuesta, procederemos",
    "Ha sido un placer atenderle", "Ha sido un gusto atenderle",
    "¿Cómo calificaría la atención", "¿Tiene alguna otra consulta o requiere asiste",
  ].map((m) => m.slice(0, 30).toLowerCase()).filter(Boolean);
  const esPlantilla = (t) => {
    const s = String(t || "").toLowerCase().trim();
    if (!s) return true;
    return plantillas.some((p) => s.startsWith(p) || s.includes(p));
  };
  function tiempoEfectivo(ht, hc, acc) {
    const tech = (Array.isArray(ht) ? ht : [])
      .filter((m) => m && m.time && isAgentRole(m.role) && m.role !== "nota" && !esPlantilla(m.content))
      .map((m) => ({ t: new Date(m.time).getTime(), agent: true }));
    const cli = (Array.isArray(hc) ? hc : []).filter((m) => m && m.time)
      .map((m) => ({ t: new Date(m.time).getTime(), agent: false }));
    const msgs = [...tech, ...cli].filter((m) => !isNaN(m.t)).sort((a, b) => a.t - b.t);
    if (acc) { const t = new Date(acc).getTime(); if (!isNaN(t)) msgs.unshift({ t, agent: true }); }
    if (msgs.length < 2) return 0;
    let tot = 0;
    for (let i = 1; i < msgs.length; i++) {
      if (!msgs[i].agent) continue;
      const g = Math.round((msgs[i].t - msgs[i - 1].t) / 60000);
      if (g > 0 && g <= UMBRAL_GAP) tot += g;
    }
    return tot;
  }

  let casos = [];
  let from = 0;
  for (;;) {
    const { data } = await db.from("sek_cases")
      .select("id, assigned_to, estado, closed_at, accepted_at, escalado_at, created_at, cliente, histtecnico, histcliente")
      .neq("canal", "simulator").neq("es_test", true).range(from, from + 999);
    casos = casos.concat(data);
    if (data.length < 1000) break;
    from += 1000;
  }
  const { data: ags } = await db.from("sek_agent_config").select("email, nombre, apellido");
  const nom = {};
  (ags || []).forEach((a) => { nom[a.email.toLowerCase()] = `${a.nombre || ""} ${a.apellido || ""}`.trim() || a.email; });
  const hum = casos.filter((c) => c.assigned_to && !String(c.assigned_to).includes("system_prompt"));

  const getCal = (c) => {
    const cl = typeof c.cliente === "object" && c.cliente ? c.cliente : null;
    const n = Number(cl?.calificacion_cliente);
    return cl?.calificacion_cliente != null && !isNaN(n) && n >= 1 && n <= 5 ? n : null;
  };
  const todasCals = hum.map(getCal).filter((v) => v !== null);
  const cerrados = hum.filter((c) => c.estado === "resuelto" || c.estado === "cerrado" || c.closed_at).length;
  const cob = cerrados > 0 ? (todasCals.length / cerrados) * 100 : 0;
  const csatActivo = todasCals.length >= CSAT_MIN_CALS && cob >= CSAT_MIN_COB;

  const now = Date.now();
  const ventanaInicio = Math.min(...hum.map((c) => new Date(c.created_at).getTime()).filter((t) => !isNaN(t)), now);
  const ventanaFin = now;

  const st = {};
  hum.forEach((c) => {
    const e = c.assigned_to.toLowerCase();
    if (!st[e]) st[e] = { n: 0, res: 0, cals: [], tef: [], tesp: [], primero: Infinity };
    const s = st[e];
    s.n++;
    const tc = new Date(c.created_at).getTime();
    if (!isNaN(tc) && tc < s.primero) s.primero = tc;
    if (c.estado === "resuelto" || c.estado === "cerrado" || c.closed_at) {
      s.res++;
      const te = tiempoEfectivo(c.histtecnico, c.histcliente, c.accepted_at);
      if (te > 0) s.tef.push(te);
    }
    if (c.accepted_at) {
      const ta = new Date(c.accepted_at).getTime();
      const ini = c.escalado_at ? new Date(c.escalado_at).getTime() : new Date(c.created_at).getTime();
      s.tesp.push(Math.min(JORNADA, minutosLaborales(ini, ta)));
    }
    const cal = getCal(c);
    if (cal !== null) s.cals.push(cal);
  });

  const ahtsAg = Object.values(st)
    .map((s) => (s.tef.length ? Math.round(s.tef.reduce((a, b) => a + b, 0) / s.tef.length) : 0))
    .filter((v) => v > 0).sort((a, b) => a - b);
  const ahtMed = ahtsAg.length
    ? (ahtsAg.length % 2 ? ahtsAg[(ahtsAg.length - 1) / 2]
      : (ahtsAg[ahtsAg.length / 2 - 1] + ahtsAg[ahtsAg.length / 2]) / 2) : 0;

  const rows = Object.entries(st).map(([e, s]) => {
    const avgEf = s.tef.length ? Math.round(s.tef.reduce((a, b) => a + b, 0) / s.tef.length) : 0;
    const avgSLA = s.tesp.length ? Math.round(s.tesp.reduce((a, b) => a + b, 0) / s.tesp.length) : 0;
    const inicio = Math.max(ventanaInicio, isFinite(s.primero) ? s.primero : ventanaInicio);
    const hab = Math.max(1, diasHabiles(inicio, ventanaFin));
    const ritmo = s.n / hab;
    const sVol = Math.max(0, Math.min(100, Math.round((ritmo / META) * 100)));
    const ratio = avgEf > 0 && ahtMed > 0 ? avgEf / ahtMed : null;
    const sAHT = ratio !== null ? Math.max(0, Math.min(100, Math.round(100 - 60 * (ratio - 0.5)))) : null;
    const sSLA = avgSLA > 0 ? Math.max(0, 100 - Math.round((avgSLA / JORNADA) * 100)) : null;
    const avgCal = s.cals.length ? s.cals.reduce((a, b) => a + b, 0) / s.cals.length : 0;
    const sSat = csatActivo && avgCal > 0 && s.cals.length >= MIN_CALS_AGENTE ? Math.round((avgCal / 5) * 100) : null;
    const pesos = csatActivo ? { vol: .225, aht: .30, sla: .225, sat: .25 } : { vol: .30, aht: .40, sla: .30 };
    const comp = { vol: sVol, aht: sAHT, sla: sSLA, sat: sSat };
    const act = Object.entries(pesos).filter(([k]) => comp[k] !== null);
    const pt = act.reduce((a, [, p]) => a + p, 0);
    const score = Math.round(act.reduce((a, [k, p]) => a + comp[k] * (p / pt), 0));
    return { nom: nom[e] || e, n: s.n, hab, ritmo, sVol, avgEf, ratio, sAHT, avgSLA, sSLA, score, valido: s.n >= MIN_CASOS_SCORE };
  }).sort((a, b) => (Number(b.valido) - Number(a.valido)) || (b.score - a.score));

  console.log(`CSAT: ${todasCals.length}/${CSAT_MIN_CALS} respuestas, ${cob.toFixed(1)}%/${CSAT_MIN_COB}% cobertura -> ${csatActivo ? "ACTIVO" : "DORMIDO"}`);
  console.log(`Meta volumen: ${META} casos/dia habil | mediana AHT equipo: ${ahtMed}m`);
  console.log(`Pesos: ${csatActivo ? "CSAT 25% + vol 22.5% + AHT 30% + SLA 22.5%" : "vol 30% + AHT 40% + SLA 30%"}\n`);
  console.log("# | Agente               | SCORE |   N | Ritmo/día | Vol pts | AHT | ratio | AHT pts | SLA | SLA pts");
  console.log("-".repeat(108));
  rows.forEach((r, i) => {
    console.log(
      String(i + 1) + " | " + String(r.nom).padEnd(20) + " | " +
      String(r.score).padStart(5) + " | " + String(r.n).padStart(3) + " | " +
      r.ritmo.toFixed(2).padStart(9) + " | " + String(r.sVol).padStart(7) + " | " +
      (String(r.avgEf) + "m").padStart(4) + " | " +
      (r.ratio === null ? "  -" : r.ratio.toFixed(2) + "x").padStart(6) + " | " +
      String(r.sAHT ?? "-").padStart(7) + " | " +
      (String(r.avgSLA) + "m").padStart(5) + " | " + String(r.sSLA ?? "-").padStart(7)
    );
  });
  const sc = rows.map((r) => r.score);
  console.log("\nspread de score:", Math.max(...sc) - Math.min(...sc), "pts");
})();
