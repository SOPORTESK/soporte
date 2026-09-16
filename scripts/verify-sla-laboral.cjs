// Verifica el SLA en horario laboral contra el SLA de reloj. Solo lectura.
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
const BH_INI = 450, BH_FIN = 1020;
const JORNADA = BH_FIN - BH_INI; // 570

function minutosLaborales(s, e) {
  if (isNaN(s) || isNaN(e) || e <= s) return 0;
  const diaDe = (ms) => Math.floor((ms - CR_OFFSET_MS) / 86400000);
  const d0 = diaDe(s), d1 = diaDe(e);
  let tot = 0;
  for (let d = d0; d <= d1 && d - d0 <= 400; d++) {
    const dow = new Date(d * 86400000).getUTCDay();
    if (dow === 0 || dow === 6) continue;
    const mn = d * 86400000 + CR_OFFSET_MS;
    const a = Math.max(s, mn + BH_INI * 60000);
    const b = Math.min(e, mn + BH_FIN * 60000);
    if (b > a) tot += Math.round((b - a) / 60000);
  }
  return tot;
}
const fmt = (m) => (m == null ? "-" : m < 60 ? `${Math.round(m)}m` : `${Math.floor(m / 60)}h${Math.round(m % 60) ? " " + Math.round(m % 60) + "m" : ""}`);

(async () => {
  let casos = [];
  let from = 0;
  for (;;) {
    const { data } = await db.from("sek_cases")
      .select("id, assigned_to, accepted_at, escalado_at, created_at, canal")
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
  let fueraTotal = 0, dentroTotal = 0;

  hum.forEach((c) => {
    if (!c.accepted_at) return;
    const e = c.assigned_to.toLowerCase();
    if (!per[e]) per[e] = { reloj: [], lab: [], topados: 0 };
    const ta = new Date(c.accepted_at).getTime();
    const ini = c.escalado_at ? new Date(c.escalado_at).getTime() : new Date(c.created_at).getTime();
    if (isNaN(ta) || isNaN(ini) || ta < ini) return;
    const reloj = Math.round((ta - ini) / 60000);
    const labRaw = minutosLaborales(ini, ta);
    const lab = Math.min(JORNADA, labRaw);
    if (labRaw > JORNADA) per[e].topados++;
    per[e].reloj.push(reloj);
    per[e].lab.push(lab);
    if (labRaw === 0 && reloj > 0) fueraTotal++; else dentroTotal++;
  });

  const avg = (a) => (a.length ? a.reduce((x, y) => x + y, 0) / a.length : null);

  console.log("casos cuya espera ocurrio 100% fuera de horario:", fueraTotal, "| con espera habil:", dentroTotal, "\n");
  console.log("Agente               | SLA reloj | SLA hábil | Mejora | Topados | Score SLA antes | ahora");
  console.log("-".repeat(96));
  const rows = Object.entries(per).map(([e, s]) => {
    const r = avg(s.reloj), l = avg(s.lab);
    return {
      nombre: nom[e] || e, r, l, topados: s.topados,
      scoreAntes: r > 0 ? Math.max(0, 100 - Math.round((r / 480) * 100)) : null,
      scoreAhora: l > 0 ? Math.max(0, 100 - Math.round((l / JORNADA) * 100)) : null,
    };
  }).sort((a, b) => (a.l ?? 0) - (b.l ?? 0));

  rows.forEach((x) => {
    const mejora = x.r && x.l ? Math.round((1 - x.l / x.r) * 100) : 0;
    console.log(
      String(x.nombre).padEnd(20) + " | " +
      fmt(x.r).padStart(9) + " | " +
      fmt(x.l).padStart(9) + " | " +
      (mejora + "%").padStart(6) + " | " +
      String(x.topados).padStart(7) + " | " +
      String(x.scoreAntes ?? "-").padStart(15) + " | " +
      String(x.scoreAhora ?? "-").padStart(5)
    );
  });
})();
