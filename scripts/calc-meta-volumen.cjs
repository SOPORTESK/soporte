// Calcula el ritmo real de casos por dia habil, para fijar la meta. Solo lectura.
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
function diasHabiles(desdeMs, hastaMs) {
  if (hastaMs <= desdeMs) return 0;
  const diaDe = (ms) => Math.floor((ms - CR_OFFSET_MS) / 86400000);
  let n = 0;
  for (let d = diaDe(desdeMs); d <= diaDe(hastaMs); d++) {
    const dow = new Date(d * 86400000).getUTCDay();
    if (dow !== 0 && dow !== 6) n++;
  }
  return n;
}

(async () => {
  let casos = [];
  let from = 0;
  for (;;) {
    const { data } = await db.from("sek_cases")
      .select("id, assigned_to, created_at").neq("canal", "simulator").neq("es_test", true)
      .range(from, from + 999);
    casos = casos.concat(data);
    if (data.length < 1000) break;
    from += 1000;
  }
  const { data: ags } = await db.from("sek_agent_config").select("email, nombre, apellido");
  const nom = {};
  (ags || []).forEach((a) => { nom[a.email.toLowerCase()] = `${a.nombre || ""} ${a.apellido || ""}`.trim() || a.email; });
  const hum = casos.filter((c) => c.assigned_to && !String(c.assigned_to).includes("system_prompt"));

  const fechas = hum.map((c) => new Date(c.created_at).getTime()).filter((t) => !isNaN(t)).sort((a, b) => a - b);
  const ini = fechas[0], fin = fechas[fechas.length - 1];
  const dh = diasHabiles(ini, fin);
  console.log("rango:", new Date(ini).toISOString().slice(0, 10), "→", new Date(fin).toISOString().slice(0, 10));
  console.log("dias habiles en el rango:", dh, "| casos:", hum.length);
  console.log("ritmo del equipo completo:", (hum.length / dh).toFixed(2), "casos/dia habil\n");

  // Por agente, ritmo global
  const per = {};
  hum.forEach((c) => {
    const e = c.assigned_to.toLowerCase();
    if (!per[e]) per[e] = 0;
    per[e]++;
  });
  const rows = Object.entries(per).map(([e, n]) => ({
    nombre: nom[e] || e, n, ritmo: n / dh,
  })).sort((a, b) => b.ritmo - a.ritmo);

  console.log("Agente               | Casos | Casos/dia hábil");
  console.log("-".repeat(50));
  rows.forEach((r) => console.log(
    String(r.nombre).padEnd(20) + " | " + String(r.n).padStart(5) + " | " + r.ritmo.toFixed(2).padStart(15)
  ));

  const ritmos = rows.map((r) => r.ritmo).sort((a, b) => a - b);
  const med = ritmos.length % 2
    ? ritmos[(ritmos.length - 1) / 2]
    : (ritmos[ritmos.length / 2 - 1] + ritmos[ritmos.length / 2]) / 2;
  console.log("\nmediana por agente:", med.toFixed(2), "casos/dia habil");
  console.log("promedio por agente:", (ritmos.reduce((a, b) => a + b, 0) / ritmos.length).toFixed(2));

  // Por mes, para ver estacionalidad
  const porMes = {};
  hum.forEach((c) => {
    const d = new Date(c.created_at);
    const k = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
    porMes[k] = (porMes[k] || 0) + 1;
  });
  console.log("\ncasos por mes:");
  Object.entries(porMes).sort().forEach(([k, v]) => {
    const [y, m] = k.split("-").map(Number);
    const d0 = Date.UTC(y, m - 1, 1) + CR_OFFSET_MS;
    const d1 = Date.UTC(y, m, 0) + CR_OFFSET_MS;
    const dhm = diasHabiles(d0, d1);
    console.log(`   ${k}: ${String(v).padStart(3)} casos / ${dhm} dias hábiles = ${(v / dhm).toFixed(2)}/dia (equipo)`);
  });
})();
