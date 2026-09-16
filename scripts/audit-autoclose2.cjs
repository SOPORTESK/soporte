// Impacto por agente de los cierres hechos por auto-close. Solo lectura.
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

const CLOSE_FRAG = "procederemos a cerrar esta conversación";

(async () => {
  const { data: agentes } = await db.from("sek_agent_config").select("email, nombre, apellido");
  const nombre = {};
  (agentes || []).forEach((a) => {
    nombre[a.email.toLowerCase()] = `${a.nombre || ""} ${a.apellido || ""}`.trim() || a.email;
  });

  let all = [];
  let from = 0;
  for (;;) {
    const { data } = await db
      .from("sek_cases")
      .select("id, assigned_to, estado, closed_at, created_at, histtecnico")
      .neq("canal", "simulator")
      .neq("es_test", true)
      .range(from, from + 999);
    all = all.concat(data);
    if (data.length < 1000) break;
    from += 1000;
  }

  const humanos = all.filter(
    (c) => c.assigned_to && !String(c.assigned_to).includes("system_prompt")
  );

  const per = {};
  const esAutoClose = (c) => {
    const h = Array.isArray(c.histtecnico) ? c.histtecnico : [];
    const msgs = h.filter((m) => m && m.content && m.role !== "nota");
    if (!msgs.length) return false;
    const t = String(msgs[msgs.length - 1].content || "").toLowerCase();
    return t.includes(CLOSE_FRAG.toLowerCase()) || t.includes("califica");
  };

  humanos.forEach((c) => {
    const e = String(c.assigned_to).toLowerCase();
    if (!per[e]) per[e] = { total: 0, cerrados: 0, auto: 0, propios: 0, fechas: [] };
    const s = per[e];
    s.total++;
    const cerrado = c.estado === "resuelto" || c.estado === "cerrado" || c.closed_at;
    if (cerrado) {
      s.cerrados++;
      if (esAutoClose(c)) { s.auto++; if (c.closed_at) s.fechas.push(c.closed_at); }
      else s.propios++;
    }
  });

  const rows = Object.entries(per)
    .map(([e, s]) => ({
      agente: nombre[e] || e,
      total: s.total,
      tasaActual: Math.floor((s.cerrados / s.total) * 100),
      auto: s.auto,
      tasaReal: Math.floor((s.propios / s.total) * 100),
      ultimoAuto: s.fechas.sort().slice(-1)[0] || "-",
    }))
    .sort((a, b) => b.total - a.total);

  console.log("Agente                    | Total | Tasa hoy | AutoClose | Tasa real | Ultimo autoclose");
  console.log("-".repeat(100));
  rows.forEach((r) => {
    console.log(
      String(r.agente).padEnd(25) + " | " +
      String(r.total).padStart(5) + " | " +
      (String(r.tasaActual) + "%").padStart(8) + " | " +
      String(r.auto).padStart(9) + " | " +
      (String(r.tasaReal) + "%").padStart(9) + " | " +
      String(r.ultimoAuto).slice(0, 10)
    );
  });

  const totAuto = rows.reduce((a, r) => a + r.auto, 0);
  console.log("\ntotal cierres por auto-close acreditados a humanos:", totAuto);
  console.log("varianza tasa HOY:  min", Math.min(...rows.map(r=>r.tasaActual)), "max", Math.max(...rows.map(r=>r.tasaActual)));
  console.log("varianza tasa REAL: min", Math.min(...rows.map(r=>r.tasaReal)), "max", Math.max(...rows.map(r=>r.tasaReal)));
})();
