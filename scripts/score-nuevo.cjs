// Calcula el modelo de score PROPUESTO con datos reales. Solo lectura.
// Uso: node scripts/score-nuevo.cjs [total|mes|semana]
const fs = require("fs");
const path = require("path");

const env = {};
fs.readFileSync(path.join(__dirname, "..", ".env.local"), "utf8")
  .replace(/^\uFEFF/, "")
  .split(/\r?\n/)
  .forEach((l) => {
    const m = l.match(/^([A-Za-z0-9_]+)=(.*)$/);
    if (m) env[m[1]] = m[2].replace(/^"|"$/g, "");
  });

const { createClient } = require(path.join(__dirname, "..", "node_modules", "@supabase/supabase-js"));
const db = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY);

const VENTANA = (process.argv[2] || "total").toLowerCase();
const CLOSE_FRAG = "procederemos a cerrar esta conversación";
const UMBRAL_GAP_MIN = 15;
const K_SHRINK = 12;          // fuerza del encogimiento
const REAPERTURA_DIAS = 7;

const norm = (p) => String(p || "").split("@")[0].replace(/[^0-9]/g, "");
const median = (a) => {
  if (!a.length) return 0;
  const s = [...a].sort((x, y) => x - y);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
};
const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
const isAgentRole = (r) => r === "agente" || r === "agent" || r === "tecnico";

function tiempoEfectivo(histtec, histcli, accepted_at) {
  const tech = (Array.isArray(histtec) ? histtec : [])
    .filter((m) => m && m.time && isAgentRole(m.role) && m.role !== "nota")
    .map((m) => ({ t: new Date(m.time).getTime(), agent: true }));
  const cli = (Array.isArray(histcli) ? histcli : [])
    .filter((m) => m && m.time)
    .map((m) => ({ t: new Date(m.time).getTime(), agent: false }));
  const msgs = [...tech, ...cli].filter((m) => !isNaN(m.t)).sort((a, b) => a.t - b.t);
  if (accepted_at) {
    const t = new Date(accepted_at).getTime();
    if (!isNaN(t)) msgs.unshift({ t, agent: true });
  }
  if (msgs.length < 2) return 0;
  let total = 0;
  for (let i = 1; i < msgs.length; i++) {
    if (!msgs[i].agent) continue;
    const gap = Math.round((msgs[i].t - msgs[i - 1].t) / 60000);
    if (gap > 0 && gap <= UMBRAL_GAP_MIN) total += gap;
  }
  return total;
}

function primeraRespuesta(c) {
  if (!c.accepted_at) return null;
  const ta = new Date(c.accepted_at).getTime();
  if (isNaN(ta)) return null;
  const msgs = (Array.isArray(c.histtecnico) ? c.histtecnico : [])
    .filter((m) => m && m.time && isAgentRole(m.role) && m.role !== "nota")
    .map((m) => new Date(m.time).getTime())
    .filter((t) => !isNaN(t) && t >= ta)
    .sort((a, b) => a - b);
  if (!msgs.length) return null;
  return Math.round((msgs[0] - ta) / 60000);
}

const esAutoClose = (c) => {
  const h = (Array.isArray(c.histtecnico) ? c.histtecnico : []).filter(
    (m) => m && m.content && m.role !== "nota"
  );
  if (!h.length) return false;
  const t = String(h[h.length - 1].content || "").toLowerCase();
  return t.includes(CLOSE_FRAG.toLowerCase()) || t.includes("califica");
};

(async () => {
  const { data: agentesCfg } = await db.from("sek_agent_config").select("email, nombre, apellido");
  const nombre = {};
  (agentesCfg || []).forEach((a) => {
    nombre[a.email.toLowerCase()] = `${a.nombre || ""} ${a.apellido || ""}`.trim() || a.email;
  });

  let all = [];
  let from = 0;
  for (;;) {
    const { data } = await db
      .from("sek_cases")
      .select("id, assigned_to, estado, closed_at, accepted_at, created_at, canal, cat, prioridad, customer_phone, cliente, histtecnico, histcliente")
      .neq("canal", "simulator")
      .neq("es_test", true)
      .range(from, from + 999);
    all = all.concat(data);
    if (data.length < 1000) break;
    from += 1000;
  }

  // ── Ventana
  const now = Date.now();
  const dias = VENTANA === "semana" ? 7 : VENTANA === "mes" ? 30 : null;
  const desde = dias ? now - dias * 86400000 : null;
  const enVentana = (c) => !desde || new Date(c.created_at).getTime() >= desde;

  // Indice de casos por telefono para reapertura (usa TODOS los casos, no solo la ventana)
  const porTel = {};
  all.forEach((c) => {
    const cl = typeof c.cliente === "object" && c.cliente ? c.cliente : {};
    const tel = norm(c.customer_phone) || norm(cl.telefono) || norm(cl.telefono_real);
    if (!tel) return;
    (porTel[tel] = porTel[tel] || []).push(c);
  });

  const humanos = all.filter(
    (c) => c.assigned_to && !String(c.assigned_to).includes("system_prompt") && enVentana(c)
  );

  // ── Cobertura de cat/prioridad (verificacion 3)
  const conCat = humanos.filter((c) => c.cat).length;
  const conPrio = humanos.filter((c) => c.prioridad).length;

  // ── Medianas de AHT por (cat, prioridad) para normalizar dificultad
  const buckets = {};
  humanos.forEach((c) => {
    const aht = tiempoEfectivo(c.histtecnico, c.histcliente, c.accepted_at);
    if (aht <= 0) return;
    const k = `${c.cat || "sin"}|${c.prioridad || "sin"}`;
    (buckets[k] = buckets[k] || []).push(aht);
  });
  const bucketMed = {};
  Object.entries(buckets).forEach(([k, v]) => { if (v.length >= 5) bucketMed[k] = median(v); });
  const ahtGlobalMed = median(
    humanos.map((c) => tiempoEfectivo(c.histtecnico, c.histcliente, c.accepted_at)).filter((t) => t > 0)
  );

  // ── Acumular por agente
  const per = {};
  let reapTotal = 0;
  let cerradosTotal = 0;

  humanos.forEach((c) => {
    const e = String(c.assigned_to).toLowerCase();
    if (!per[e]) per[e] = { total: 0, cerrados: 0, propios: 0, auto: 0, reaperturas: 0, ratios: [], fr: [], cals: [] };
    const s = per[e];
    s.total++;

    const cerrado = c.estado === "resuelto" || c.estado === "cerrado" || c.closed_at;
    if (cerrado) {
      s.cerrados++;
      cerradosTotal++;
      if (esAutoClose(c)) s.auto++;
      else s.propios++;

      // Reapertura: otro caso del mismo telefono creado dentro de 7 dias del cierre
      if (c.closed_at) {
        const tc = new Date(c.closed_at).getTime();
        const cl = typeof c.cliente === "object" && c.cliente ? c.cliente : {};
        const tel = norm(c.customer_phone) || norm(cl.telefono) || norm(cl.telefono_real);
        if (tel && porTel[tel]) {
          const hubo = porTel[tel].some((o) => {
            if (o.id === c.id) return false;
            const to = new Date(o.created_at).getTime();
            return to > tc && to <= tc + REAPERTURA_DIAS * 86400000;
          });
          if (hubo) { s.reaperturas++; reapTotal++; }
        }
      }
    }

    // AHT normalizado
    const aht = tiempoEfectivo(c.histtecnico, c.histcliente, c.accepted_at);
    if (aht > 0) {
      const k = `${c.cat || "sin"}|${c.prioridad || "sin"}`;
      const ref = bucketMed[k] || ahtGlobalMed;
      if (ref > 0) s.ratios.push(aht / ref);
    }

    // Primera respuesta
    const fr = primeraRespuesta(c);
    if (fr !== null && fr >= 0) s.fr.push(fr);

    // CSAT
    const cl = typeof c.cliente === "object" && c.cliente ? c.cliente : {};
    const v = Number(cl.calificacion_cliente);
    if (cl.calificacion_cliente != null && !isNaN(v) && v >= 1 && v <= 5) s.cals.push(v);
  });

  // ── Compuerta CSAT
  const totalCals = Object.values(per).reduce((a, s) => a + s.cals.length, 0);
  const cobertura = cerradosTotal > 0 ? (totalCals / cerradosTotal) * 100 : 0;
  const minCals = VENTANA === "semana" ? 8 : VENTANA === "mes" ? 15 : 30;
  const csatActivo = cobertura >= 15 && totalCals >= minCals;

  // ── Compuerta resolucion propia: necesita varianza
  const tasasPropias = Object.values(per).map((s) => (s.cerrados > 0 ? (s.propios / s.total) * 100 : 0));
  const spread = Math.max(...tasasPropias) - Math.min(...tasasPropias);
  const resActiva = spread >= 5;

  // ── Sub-scores crudos
  const raw = {};
  Object.entries(per).forEach(([e, s]) => {
    const noReap = s.cerrados > 0 ? (1 - s.reaperturas / s.cerrados) * 100 : null;
    const ratioMed = s.ratios.length ? median(s.ratios) : null;
    const sAht = ratioMed !== null ? clamp(100 - 60 * (ratioMed - 0.5), 0, 100) : null;
    const frMed = s.fr.length ? median(s.fr) : null;
    const sFr = frMed !== null ? clamp(100 - (frMed - 2) * (100 / 28), 0, 100) : null;
    const sRes = resActiva && s.total > 0 ? (s.propios / s.total) * 100 : null;
    const sCsat = csatActivo && s.cals.length >= 5
      ? (s.cals.reduce((a, b) => a + b, 0) / s.cals.length / 5) * 100 : null;
    raw[e] = { noReap, sAht, sFr, sRes, sCsat, ratioMed, frMed, n: s.total, ...s };
  });

  // ── Media de equipo por componente (para encogimiento)
  const teamMean = (k) => {
    const v = Object.values(raw).map((r) => r[k]).filter((x) => x !== null);
    return v.length ? v.reduce((a, b) => a + b, 0) / v.length : null;
  };
  const means = { noReap: teamMean("noReap"), sAht: teamMean("sAht"), sFr: teamMean("sFr"), sRes: teamMean("sRes"), sCsat: teamMean("sCsat") };

  // ── Pesos
  const pesosBase = csatActivo
    ? { sCsat: 0.25, sRes: 0.25, noReap: 0.20, sAht: 0.20, sFr: 0.10 }
    : { sRes: 0.25, noReap: 0.30, sAht: 0.25, sFr: 0.20 };

  const rows = Object.entries(raw).map(([e, r]) => {
    // Encogimiento bayesiano hacia la media del equipo
    const shrink = (val, mean) => {
      if (val === null) return null;
      if (mean === null) return val;
      return (r.n * val + K_SHRINK * mean) / (r.n + K_SHRINK);
    };
    const comp = {
      sRes: shrink(r.sRes, means.sRes),
      noReap: shrink(r.noReap, means.noReap),
      sAht: shrink(r.sAht, means.sAht),
      sFr: shrink(r.sFr, means.sFr),
      sCsat: shrink(r.sCsat, means.sCsat),
    };
    const activos = Object.entries(pesosBase).filter(([k]) => comp[k] !== null);
    const pesoTot = activos.reduce((a, [, p]) => a + p, 0);
    const score = pesoTot > 0
      ? Math.round(activos.reduce((a, [k, p]) => a + comp[k] * (p / pesoTot), 0)) : 0;
    const conf = r.n >= (VENTANA === "semana" ? 8 : VENTANA === "mes" ? 25 : 40)
      ? "Alta" : r.n >= (VENTANA === "semana" ? 4 : VENTANA === "mes" ? 10 : 15) ? "Media" : "Baja";
    return {
      agente: nombre[e] || e, n: r.n, score, conf,
      noReap: r.noReap, reap: r.reaperturas, cerrados: r.cerrados,
      ratio: r.ratioMed, fr: r.frMed, res: r.sRes, auto: r.auto,
      cals: r.cals.length,
      comp,
    };
  }).sort((a, b) => b.score - a.score);

  // ── Salida
  console.log(`\n=== VENTANA: ${VENTANA.toUpperCase()} ===`);
  console.log(`casos humanos: ${humanos.length} | cerrados: ${cerradosTotal} | reaperturas: ${reapTotal}`);
  console.log(`cobertura cat: ${conCat}/${humanos.length} (${Math.round(conCat/humanos.length*100)}%) | prioridad: ${conPrio}/${humanos.length} (${Math.round(conPrio/humanos.length*100)}%)`);
  console.log(`buckets (cat|prio) con n>=5: ${Object.keys(bucketMed).length} | mediana AHT global: ${ahtGlobalMed}m`);
  console.log(`\nCSAT: cobertura ${cobertura.toFixed(1)}% (min 15%), ${totalCals} calif (min ${minCals}) -> ${csatActivo ? "ACTIVO" : "APAGADO"}`);
  console.log(`RESOLUCION PROPIA: spread ${spread.toFixed(1)} pts (min 5) -> ${resActiva ? "ACTIVA" : "APAGADA"}`);
  const pesosMostrar = Object.entries(pesosBase)
    .filter(([k]) => Object.values(raw).some((r) => r[k] !== null))
    .map(([k, p]) => `${k} ${Math.round(p * 100)}%`).join(" · ");
  console.log(`PESOS APLICADOS: ${pesosMostrar}\n`);

  console.log("# | Agente               | Score | Conf  |  N  | NoReap | Reap | AHT ratio | 1a Resp | Res.propia");
  console.log("-".repeat(108));
  rows.forEach((r, i) => {
    console.log(
      String(i + 1).padStart(1) + " | " +
      String(r.agente).padEnd(20) + " | " +
      String(r.score).padStart(5) + " | " +
      String(r.conf).padEnd(5) + " | " +
      String(r.n).padStart(3) + " | " +
      (r.noReap === null ? "  -   " : (r.noReap.toFixed(0) + "%").padStart(6)) + " | " +
      String(r.reap).padStart(4) + " | " +
      (r.ratio === null ? "   -    " : (r.ratio.toFixed(2) + "x").padStart(9)) + " | " +
      (r.fr === null ? "   -   " : (r.fr.toFixed(0) + "m").padStart(7)) + " | " +
      (r.res === null ? "  (off)" : (r.res.toFixed(0) + "%").padStart(7))
    );
  });
  console.log("\nNoReap = % casos sin reapertura en 7d | AHT ratio = vs mediana de pares (menor=mejor)");
  console.log("1a Resp = mediana minutos aceptar->primer mensaje | Res.propia = cierres del agente / total");
})();
