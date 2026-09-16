// Replica EXACTAMENTE la logica nueva de page.tsx para verificar el resultado.
// Solo lectura.
const fs = require("fs");
const path = require("path");
const env = {};
fs.readFileSync(path.join(__dirname, "..", ".env.local"), "utf8")
  .replace(/^\uFEFF/, "").split(/\r?\n/).forEach((l) => {
    const m = l.match(/^([A-Za-z0-9_]+)=(.*)$/);
    if (m) env[m[1]] = m[2].replace(/^"|"$/g, "");
  });
const { createClient } = require(path.join(__dirname, "..", "node_modules", "@supabase/supabase-js"));
const supabase = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY);

const UMBRAL_GAP_MIN = 15;
const MIN_CALS_AGENTE = 4;
const isAgentRole = (r) => r === "agente" || r === "agent" || r === "tecnico";

(async () => {
  let casos = [];
  let from = 0;
  for (;;) {
    const { data } = await supabase.from("sek_cases")
      .select("id, assigned_to, created_at, updated_at, closed_at, estado, cliente, canal, cat, prioridad, histtecnico, histcliente, accepted_at, escalado_at")
      .neq("canal", "simulator").neq("es_test", true).range(from, from + 999);
    casos = casos.concat(data);
    if (data.length < 1000) break;
    from += 1000;
  }

  const { data: agentes } = await supabase.from("sek_agent_config").select("email, nombre, apellido, rol");
  const agenteMap = {};
  (agentes || []).forEach((a) => { agenteMap[a.email.toLowerCase()] = `${a.nombre || ""} ${a.apellido || ""}`.trim() || a.email; });

  const { data: flowRow } = await supabase.from("sek_flow_configs").select("flow_data").limit(1).maybeSingle();
  const plantillas = [
    ...((flowRow?.flow_data?.nodes || []).map((n) => String(n?.data?.message || "")).filter((m) => m.length > 15)),
    "Buen día. Gracias por contactarnos. Mi nombre",
    "Al no haber recibido respuesta, procederemos",
    "Ha sido un placer atenderle",
    "Ha sido un gusto atenderle",
    "¿Cómo calificaría la atención",
    "¿Tiene alguna otra consulta o requiere asiste",
  ].map((m) => m.slice(0, 30).toLowerCase()).filter(Boolean);
  const esPlantilla = (txt) => {
    const t = String(txt || "").toLowerCase().trim();
    if (!t) return true;
    return plantillas.some((p) => t.startsWith(p) || t.includes(p));
  };

  function tiempoEfectivo(histtec, histcli, accepted_at, conFiltro) {
    const tech = (Array.isArray(histtec) ? histtec : [])
      .filter((m) => m && m.time && isAgentRole(m.role) && m.role !== "nota" && (!conFiltro || !esPlantilla(m.content)))
      .map((m) => ({ t: new Date(m.time).getTime(), agent: true }));
    const cli = (Array.isArray(histcli) ? histcli : [])
      .filter((m) => m && m.time).map((m) => ({ t: new Date(m.time).getTime(), agent: false }));
    const msgs = [...tech, ...cli].filter((m) => !isNaN(m.t)).sort((a, b) => a.t - b.t);
    if (accepted_at) { const t = new Date(accepted_at).getTime(); if (!isNaN(t)) msgs.unshift({ t, agent: true }); }
    if (msgs.length < 2) return 0;
    let tot = 0;
    for (let i = 1; i < msgs.length; i++) {
      if (!msgs[i].agent) continue;
      const g = Math.round((msgs[i].t - msgs[i - 1].t) / 60000);
      if (g > 0 && g <= UMBRAL_GAP_MIN) tot += g;
    }
    return tot;
  }

  const humanos = casos.filter((c) => c.assigned_to && !String(c.assigned_to).includes("system_prompt"));

  function construir(conFiltro) {
    const st = {};
    humanos.forEach((caso) => {
      const e = caso.assigned_to.toLowerCase();
      if (!st[e]) st[e] = { total: 0, resueltos: 0, cals: [], tef: [], tesp: [] };
      const s = st[e];
      s.total++;
      if (caso.estado === "resuelto" || caso.estado === "cerrado" || caso.closed_at) {
        s.resueltos++;
        const te = tiempoEfectivo(caso.histtecnico, caso.histcliente, caso.accepted_at, conFiltro);
        if (te > 0) s.tef.push(te);
      }
      if (caso.accepted_at) {
        const ta = new Date(caso.accepted_at).getTime();
        let last = new Date(caso.created_at).getTime();
        if (caso.escalado_at) last = new Date(caso.escalado_at).getTime();
        const esp = Math.round((ta - last) / 60000);
        if (esp >= 0) s.tesp.push(esp);
      }
      const cl = typeof caso.cliente === "object" && caso.cliente ? caso.cliente : {};
      const v = Number(cl.calificacion_cliente);
      if (cl.calificacion_cliente != null && !isNaN(v) && v >= 1 && v <= 5) s.cals.push(v);
    });

    const maxTotal = Math.max(1, ...Object.values(st).map((s) => s.total));
    const ahtsAg = Object.values(st)
      .map((s) => (s.tef.length ? Math.round(s.tef.reduce((a, b) => a + b, 0) / s.tef.length) : 0))
      .filter((v) => v > 0).sort((a, b) => a - b);
    const ahtMed = ahtsAg.length
      ? (ahtsAg.length % 2 ? ahtsAg[(ahtsAg.length - 1) / 2]
        : (ahtsAg[ahtsAg.length / 2 - 1] + ahtsAg[ahtsAg.length / 2]) / 2) : 0;

    return Object.entries(st).map(([e, s]) => {
      const avgCal = s.cals.length ? s.cals.reduce((a, b) => a + b, 0) / s.cals.length : 0;
      const avgSLA = s.tesp.length ? Math.round(s.tesp.reduce((a, b) => a + b, 0) / s.tesp.length) : 0;
      const tasa = s.total ? Math.floor((s.resueltos / s.total) * 100) : 0;
      const avgEf = s.tef.length ? Math.round(s.tef.reduce((a, b) => a + b, 0) / s.tef.length) : 0;
      const ratio = avgEf > 0 && ahtMed > 0 ? avgEf / ahtMed : null;
      const sAHT = ratio !== null ? Math.max(0, Math.min(100, Math.round(100 - 60 * (ratio - 0.5)))) : null;
      const sSLA = avgSLA > 0 ? Math.max(0, 100 - Math.round((avgSLA / 480) * 100)) : null;
      const sSat = avgCal > 0 && s.cals.length >= MIN_CALS_AGENTE ? Math.round((avgCal / 5) * 100) : null;
      const sVol = Math.round((s.total / maxTotal) * 100);
      const pesos = { res: 0.30, aht: 0.25, sat: 0.20, sla: 0.15, vol: 0.10 };
      const comp = { res: Math.round(tasa), aht: sAHT, sat: sSat, sla: sSLA, vol: sVol };
      const act = Object.entries(pesos).filter(([k]) => comp[k] !== null);
      const pt = act.reduce((a, [, p]) => a + p, 0);
      const score = Math.round(act.reduce((a, [k, p]) => a + comp[k] * (p / pt), 0));
      return { nombre: agenteMap[e] || e, total: s.total, tasa, avgEf, ratio, score, ahtMed };
    }).sort((a, b) => b.score - a.score);
  }

  const antes = construir(false);
  const desp = construir(true);
  const mapA = {};
  antes.forEach((r) => { mapA[r.nombre] = r; });

  console.log("mediana AHT equipo: antes", antes[0].ahtMed, "m | depurado", desp[0].ahtMed, "m\n");
  console.log("Agente               | AHT antes | AHT dep | ratio | Score antes | Score nuevo | Cambio");
  console.log("-".repeat(92));
  desp.forEach((r) => {
    const a = mapA[r.nombre];
    const d = r.score - a.score;
    console.log(
      String(r.nombre).padEnd(20) + " | " +
      (String(a.avgEf) + "m").padStart(9) + " | " +
      (String(r.avgEf) + "m").padStart(7) + " | " +
      (r.ratio === null ? "   -" : r.ratio.toFixed(2) + "x").padStart(6) + " | " +
      String(a.score).padStart(11) + " | " +
      String(r.score).padStart(11) + " | " +
      (d > 0 ? "+" + d : String(d)).padStart(6)
    );
  });
  const sc = desp.map((r) => r.score);
  console.log("\nspread de score: antes", Math.max(...antes.map(r=>r.score)) - Math.min(...antes.map(r=>r.score)),
              "| ahora", Math.max(...sc) - Math.min(...sc));
})();
