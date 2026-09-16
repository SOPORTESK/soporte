// Prueba si se pueden aislar metricas que dependan SOLO del agente humano.
// Excluye mensajes de plantilla (saludos/cierres automaticos) y mensajes de la IA.
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
const db = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY);

const median = (a) => {
  if (!a.length) return null;
  const s = [...a].sort((x, y) => x - y);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
};

(async () => {
  // Plantillas del flow config: cualquier mensaje del sistema
  const { data: flow } = await db.from("sek_flow_configs").select("flow_data").limit(1).maybeSingle();
  const plantillas = [];
  (flow?.flow_data?.nodes || []).forEach((n) => {
    const msg = n?.data?.message;
    if (msg && String(msg).length > 15) plantillas.push(String(msg).slice(0, 40).toLowerCase());
  });
  // Plantillas conocidas en codigo
  [
    "buen día. gracias por contactarnos. mi nombre",
    "al no haber recibido respuesta, procederemos",
    "ha sido un placer atenderle",
    "¿cómo calificaría la atención",
    "¿tiene alguna otra consulta o requiere asiste",
    "gracias por contactar a sekunet",
  ].forEach((p) => plantillas.push(p));
  const uniq = [...new Set(plantillas)];
  console.log("plantillas detectadas:", uniq.length);
  uniq.slice(0, 12).forEach((p) => console.log("   -", p.slice(0, 55)));

  const esPlantilla = (txt) => {
    const t = String(txt || "").toLowerCase().trim();
    if (!t) return true;
    return uniq.some((p) => t.startsWith(p.slice(0, 30)) || t.includes(p.slice(0, 30)));
  };

  let all = [];
  let from = 0;
  for (;;) {
    const { data } = await db.from("sek_cases")
      .select("id, assigned_to, estado, closed_at, accepted_at, created_at, histtecnico, histcliente")
      .neq("canal", "simulator").neq("es_test", true).range(from, from + 999);
    all = all.concat(data);
    if (data.length < 1000) break;
    from += 1000;
  }
  const hum = all.filter((c) => c.assigned_to && !String(c.assigned_to).includes("system_prompt"));

  const { data: cfg } = await db.from("sek_agent_config").select("email, nombre, apellido");
  const nombre = {};
  (cfg || []).forEach((a) => { nombre[a.email.toLowerCase()] = `${a.nombre || ""} ${a.apellido || ""}`.trim() || a.email; });

  // Mensajes escritos POR EL AGENTE HUMANO: role tecnico y NO plantilla
  const msgsHumanos = (c) =>
    (Array.isArray(c.histtecnico) ? c.histtecnico : [])
      .filter((m) => m && m.time && m.role === "tecnico" && !esPlantilla(m.content))
      .map((m) => ({ t: new Date(m.time).getTime(), c: m.content }))
      .filter((m) => !isNaN(m.t))
      .sort((a, b) => a.t - b.t);

  const per = {};
  let conFrReal = 0;
  let ceroReal = 0;
  const todosFr = [];

  hum.forEach((c) => {
    const e = String(c.assigned_to).toLowerCase();
    if (!per[e]) per[e] = { n: 0, fr: [], ahtH: [], msgs: [], ida: [] };
    const s = per[e];
    s.n++;

    const mh = msgsHumanos(c);
    s.msgs.push(mh.length);

    // 1a respuesta REAL: accepted_at -> primer mensaje humano no-plantilla
    if (c.accepted_at && mh.length) {
      const ta = new Date(c.accepted_at).getTime();
      const post = mh.filter((m) => m.t >= ta);
      if (post.length) {
        const min = Math.round((post[0].t - ta) / 60000);
        if (min >= 0 && min < 1440) { s.fr.push(min); todosFr.push(min); conFrReal++; if (min === 0) ceroReal++; }
      }
    }

    // AHT solo con mensajes humanos reales
    const cli = (Array.isArray(c.histcliente) ? c.histcliente : [])
      .filter((m) => m && m.time).map((m) => ({ t: new Date(m.time).getTime(), agent: false }))
      .filter((m) => !isNaN(m.t));
    const seq = [...mh.map((m) => ({ t: m.t, agent: true })), ...cli].sort((a, b) => a.t - b.t);
    let tot = 0;
    for (let i = 1; i < seq.length; i++) {
      if (!seq[i].agent) continue;
      const g = Math.round((seq[i].t - seq[i - 1].t) / 60000);
      if (g > 0 && g <= 15) tot += g;
    }
    if (tot > 0) s.ahtH.push(tot);

    // Idas y vueltas: cuantos turnos del agente por caso (esfuerzo real)
    if (mh.length) s.ida.push(mh.length);
  });

  console.log("\n--- 1a RESPUESTA DEPURADA (sin plantillas) ---");
  console.log("casos medibles:", conFrReal, "de", hum.length, "| con 0 min:", ceroReal,
              `(${conFrReal ? Math.round(ceroReal / conFrReal * 100) : 0}%)`);
  console.log("mediana global:", median(todosFr), "min");

  console.log("\n--- POR AGENTE ---");
  console.log("Agente               |   N | 1aResp med | n(fr) | AHT hum | n(aht) | Msgs/caso");
  console.log("-".repeat(88));
  const rows = Object.entries(per).map(([e, s]) => ({
    agente: nombre[e] || e, n: s.n,
    fr: median(s.fr), nfr: s.fr.length,
    aht: median(s.ahtH), naht: s.ahtH.length,
    msgs: median(s.msgs),
  })).sort((a, b) => b.n - a.n);
  rows.forEach((r) => {
    console.log(
      String(r.agente).padEnd(20) + " | " +
      String(r.n).padStart(3) + " | " +
      (r.fr === null ? "     -" : String(r.fr) + "m").padStart(10) + " | " +
      String(r.nfr).padStart(5) + " | " +
      (r.aht === null ? "    -" : String(r.aht) + "m").padStart(7) + " | " +
      String(r.naht).padStart(6) + " | " +
      String(r.msgs).padStart(9)
    );
  });

  // Varianza -> sirve o no
  const frs = rows.map((r) => r.fr).filter((x) => x !== null);
  const ahts = rows.map((r) => r.aht).filter((x) => x !== null);
  console.log("\nVARIANZA 1aResp:", frs.length ? `${Math.min(...frs)}-${Math.max(...frs)}m (spread ${Math.max(...frs) - Math.min(...frs)})` : "sin datos");
  console.log("VARIANZA AHT hum:", ahts.length ? `${Math.min(...ahts)}-${Math.max(...ahts)}m (spread ${Math.max(...ahts) - Math.min(...ahts)})` : "sin datos");
})();
