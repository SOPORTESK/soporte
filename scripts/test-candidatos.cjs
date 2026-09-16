// Evalua metricas CANDIDATAS para la tabla: cuales tienen varianza real y
// dependen del agente. Solo lectura, no modifica nada.
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

const isAgentRole = (r) => r === "agente" || r === "agent" || r === "tecnico";
const median = (a) => {
  if (!a.length) return null;
  const s = [...a].sort((x, y) => x - y);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
};

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

  let casos = [];
  let from = 0;
  for (;;) {
    const { data } = await db.from("sek_cases")
      .select("id, assigned_to, estado, closed_at, accepted_at, escalado_at, created_at, histtecnico, histcliente, problema, marca, modelo, cat, tags, prioridad, title")
      .neq("canal", "simulator").neq("es_test", true).range(from, from + 999);
    casos = casos.concat(data);
    if (data.length < 1000) break;
    from += 1000;
  }
  const { data: ags } = await db.from("sek_agent_config").select("email, nombre, apellido");
  const nom = {};
  (ags || []).forEach((a) => { nom[a.email.toLowerCase()] = `${a.nombre || ""} ${a.apellido || ""}`.trim() || a.email; });
  const hum = casos.filter((c) => c.assigned_to && !String(c.assigned_to).includes("system_prompt"));

  const per = {};
  let totalReasig = 0;

  hum.forEach((c) => {
    const e = c.assigned_to.toLowerCase();
    if (!per[e]) per[e] = { n: 0, reasig: 0, doc: 0, msgs: [], lat: [], notas: 0, tags: 0 };
    const s = per[e];
    s.n++;

    const hist = Array.isArray(c.histtecnico) ? c.histtecnico : [];

    // A) Reasignaciones: nota "Caso reasignado de X a Y"
    if (hist.some((m) => m && /reasignad/i.test(String(m.content || "")))) { s.reasig++; totalReasig++; }

    // B) Documentacion del caso: problema + marca + modelo llenos
    const doc = [c.problema, c.marca, c.modelo].filter((v) => v && String(v).trim()).length;
    if (doc >= 2) s.doc++;

    // C) Notas internas escritas (disciplina de registro)
    if (hist.some((m) => m && m.role === "nota")) s.notas++;

    // D) Tags asignados
    if (Array.isArray(c.tags) && c.tags.length > 0) s.tags++;

    // E) Mensajes propios por caso
    const mios = hist.filter((m) => m && m.time && isAgentRole(m.role) && m.role !== "nota" && !esPlantilla(m.content));
    if (mios.length) s.msgs.push(mios.length);

    // F) Latencia de respuesta dentro de la conversacion
    const cli = (Array.isArray(c.histcliente) ? c.histcliente : [])
      .filter((m) => m && m.time).map((m) => ({ t: new Date(m.time).getTime(), ag: false }));
    const ag = mios.map((m) => ({ t: new Date(m.time).getTime(), ag: true }));
    const seq = [...cli, ...ag].filter((m) => !isNaN(m.t)).sort((a, b) => a.t - b.t);
    const gaps = [];
    for (let i = 0; i < seq.length; i++) {
      if (seq[i].ag) continue;
      if (i + 1 < seq.length && !seq[i + 1].ag) continue;
      const sig = seq.slice(i + 1).find((m) => m.ag);
      if (!sig) continue;
      const g = Math.round((sig.t - seq[i].t) / 60000);
      if (g >= 0 && g <= 480) gaps.push(g);
    }
    if (gaps.length) s.lat.push(median(gaps));
  });

  console.log("=== COBERTURA GLOBAL ===");
  console.log("casos humanos:", hum.length);
  console.log("con reasignacion:", totalReasig);
  console.log("con problema lleno:", hum.filter((c) => c.problema && String(c.problema).trim()).length);
  console.log("con marca lleno:", hum.filter((c) => c.marca && String(c.marca).trim()).length);
  console.log("con modelo lleno:", hum.filter((c) => c.modelo && String(c.modelo).trim()).length);
  console.log("con tags:", hum.filter((c) => Array.isArray(c.tags) && c.tags.length).length);
  console.log("con notas internas:", hum.filter((c) => (Array.isArray(c.histtecnico) ? c.histtecnico : []).some((m) => m && m.role === "nota")).length);

  const rows = Object.entries(per).map(([e, s]) => ({
    nombre: nom[e] || e, n: s.n,
    reasigPct: Math.round((s.reasig / s.n) * 100),
    docPct: Math.round((s.doc / s.n) * 100),
    notasPct: Math.round((s.notas / s.n) * 100),
    tagsPct: Math.round((s.tags / s.n) * 100),
    msgs: median(s.msgs),
    lat: median(s.lat),
    latN: s.lat.length,
  })).sort((a, b) => b.n - a.n);

  console.log("\n=== POR AGENTE ===");
  console.log("Agente               |   N | Reasig | Doc% | Notas% | Tags% | Msgs/caso | Latencia | n(lat)");
  console.log("-".repeat(102));
  rows.forEach((r) => {
    console.log(
      String(r.nombre).padEnd(20) + " | " +
      String(r.n).padStart(3) + " | " +
      (r.reasigPct + "%").padStart(6) + " | " +
      (r.docPct + "%").padStart(4) + " | " +
      (r.notasPct + "%").padStart(6) + " | " +
      (r.tagsPct + "%").padStart(5) + " | " +
      String(r.msgs ?? "-").padStart(9) + " | " +
      (r.lat === null ? "    -" : r.lat.toFixed(1) + "m").padStart(8) + " | " +
      String(r.latN).padStart(6)
    );
  });

  const sp = (k) => {
    const v = rows.map((r) => r[k]).filter((x) => x !== null && x !== undefined);
    return v.length ? (Math.max(...v) - Math.min(...v)).toFixed(1) : "-";
  };
  console.log("\n=== SPREAD (capacidad de distinguir) ===");
  console.log("Reasignaciones :", sp("reasigPct"), "pts");
  console.log("Documentacion  :", sp("docPct"), "pts");
  console.log("Notas internas :", sp("notasPct"), "pts");
  console.log("Tags           :", sp("tagsPct"), "pts");
  console.log("Msgs por caso  :", sp("msgs"));
  console.log("Latencia resp  :", sp("lat"), "min");
})();
