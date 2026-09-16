// Verifica la calidad de los datos que alimentan el score propuesto. Solo lectura.
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

const norm = (p) => String(p || "").split("@")[0].replace(/[^0-9]/g, "");
const isAgentRole = (r) => r === "agente" || r === "agent" || r === "tecnico";

(async () => {
  let all = [];
  let from = 0;
  for (;;) {
    const { data } = await db.from("sek_cases")
      .select("id, assigned_to, estado, closed_at, accepted_at, created_at, canal, cat, prioridad, customer_phone, cliente, histtecnico, histcliente, tags")
      .neq("canal", "simulator").neq("es_test", true).range(from, from + 999);
    all = all.concat(data);
    if (data.length < 1000) break;
    from += 1000;
  }
  const hum = all.filter((c) => c.assigned_to && !String(c.assigned_to).includes("system_prompt"));

  // 1. Distribucion de prioridad
  const prio = {};
  hum.forEach((c) => { prio[c.prioridad || "null"] = (prio[c.prioridad || "null"] || 0) + 1; });
  console.log("1) prioridad:", JSON.stringify(prio));
  const cats = {};
  hum.forEach((c) => { cats[c.cat || "null"] = (cats[c.cat || "null"] || 0) + 1; });
  console.log("   cat:", JSON.stringify(cats));

  // 2. Cuantos casos tienen AHT > 0
  function aht(c) {
    const tech = (Array.isArray(c.histtecnico) ? c.histtecnico : [])
      .filter((m) => m && m.time && isAgentRole(m.role) && m.role !== "nota")
      .map((m) => ({ t: new Date(m.time).getTime(), agent: true }));
    const cli = (Array.isArray(c.histcliente) ? c.histcliente : [])
      .filter((m) => m && m.time).map((m) => ({ t: new Date(m.time).getTime(), agent: false }));
    const msgs = [...tech, ...cli].filter((m) => !isNaN(m.t)).sort((a, b) => a.t - b.t);
    if (c.accepted_at) { const t = new Date(c.accepted_at).getTime(); if (!isNaN(t)) msgs.unshift({ t, agent: true }); }
    if (msgs.length < 2) return 0;
    let tot = 0;
    for (let i = 1; i < msgs.length; i++) {
      if (!msgs[i].agent) continue;
      const g = Math.round((msgs[i].t - msgs[i - 1].t) / 60000);
      if (g > 0 && g <= 15) tot += g;
    }
    return tot;
  }
  const ahts = hum.map(aht);
  console.log("\n2) casos con AHT>0:", ahts.filter((x) => x > 0).length, "de", hum.length,
              "| AHT=0:", ahts.filter((x) => x === 0).length);

  // 3. Roles reales en histtecnico
  const roles = {};
  hum.forEach((c) => (Array.isArray(c.histtecnico) ? c.histtecnico : []).forEach((m) => {
    if (m && m.role) roles[m.role] = (roles[m.role] || 0) + 1;
  }));
  console.log("\n3) roles en histtecnico:", JSON.stringify(roles));

  // 4. Primer mensaje tras accepted_at: contenido
  const primeros = {};
  let cero = 0, conFr = 0;
  hum.forEach((c) => {
    if (!c.accepted_at) return;
    const ta = new Date(c.accepted_at).getTime();
    const msgs = (Array.isArray(c.histtecnico) ? c.histtecnico : [])
      .filter((m) => m && m.time && isAgentRole(m.role) && m.role !== "nota")
      .map((m) => ({ t: new Date(m.time).getTime(), c: String(m.content || "") }))
      .filter((m) => !isNaN(m.t) && m.t >= ta).sort((a, b) => a.t - b.t);
    if (!msgs.length) return;
    conFr++;
    const min = Math.round((msgs[0].t - ta) / 60000);
    if (min === 0) cero++;
    const key = msgs[0].c.slice(0, 45).replace(/\s+/g, " ");
    primeros[key] = (primeros[key] || 0) + 1;
  });
  console.log("\n4) casos con 1a respuesta medible:", conFr, "| con 0 min:", cero);
  console.log("   primeros mensajes mas comunes:");
  Object.entries(primeros).sort((a, b) => b[1] - a[1]).slice(0, 5)
    .forEach(([k, v]) => console.log(`      ${v}x  "${k}"`));

  // 5. Reaperturas: distribucion del tiempo hasta reapertura
  const porTel = {};
  all.forEach((c) => {
    const cl = typeof c.cliente === "object" && c.cliente ? c.cliente : {};
    const tel = norm(c.customer_phone) || norm(cl.telefono) || norm(cl.telefono_real);
    if (tel) (porTel[tel] = porTel[tel] || []).push(c);
  });
  const gaps = [];
  hum.forEach((c) => {
    if (!c.closed_at) return;
    const tc = new Date(c.closed_at).getTime();
    const cl = typeof c.cliente === "object" && c.cliente ? c.cliente : {};
    const tel = norm(c.customer_phone) || norm(cl.telefono) || norm(cl.telefono_real);
    if (!tel || !porTel[tel]) return;
    porTel[tel].forEach((o) => {
      if (o.id === c.id) return;
      const to = new Date(o.created_at).getTime();
      if (to > tc && to <= tc + 7 * 86400000) gaps.push(Math.round((to - tc) / 60000));
    });
  });
  const b = { "<5min": 0, "5-60min": 0, "1-6h": 0, "6-24h": 0, "1-7d": 0 };
  gaps.forEach((g) => {
    if (g < 5) b["<5min"]++;
    else if (g < 60) b["5-60min"]++;
    else if (g < 360) b["1-6h"]++;
    else if (g < 1440) b["6-24h"]++;
    else b["1-7d"]++;
  });
  console.log("\n5) reaperturas por tiempo desde el cierre (total " + gaps.length + "):");
  Object.entries(b).forEach(([k, v]) => console.log(`      ${String(k).padEnd(9)} ${v}`));

  // 6. Telefonos con muchos casos (fragmentacion)
  const multi = Object.entries(porTel).filter(([, v]) => v.length > 3)
    .sort((a, b) => b[1].length - a[1].length).slice(0, 8);
  console.log("\n6) telefonos con mas de 3 casos:", Object.entries(porTel).filter(([, v]) => v.length > 3).length);
  multi.forEach(([t, v]) => console.log(`      ${t}: ${v.length} casos`));
})();
