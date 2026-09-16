// Audita si auto-close esta acreditando cierres a agentes humanos.
// Solo lectura, no modifica nada.
const fs = require("fs");
const path = require("path");

const envPath = path.join(__dirname, "..", ".env.local");
const env = {};
fs.readFileSync(envPath, "utf8").replace(/^\uFEFF/, "").split(/\r?\n/).forEach((l) => {
  const m = l.match(/^([A-Za-z0-9_]+)=(.*)$/);
  if (m) env[m[1]] = m[2].replace(/^"|"$/g, "");
});

const { createClient } = require(path.join(__dirname, "..", "node_modules", "@supabase/supabase-js"));
const db = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY);

const CLOSE_MSG_FRAG = "procederemos a cerrar esta conversación";
const SURVEY_FRAG = "calificar";
const SURVEY_FRAG2 = "califica";

(async () => {
  // Modo No Atendido
  const { data: cfg } = await db
    .from("sek_agent_config")
    .select("modo_no_atendido")
    .eq("email", "system_prompt@sekunet.com")
    .maybeSingle();
  console.log("modo_no_atendido =", cfg?.modo_no_atendido);

  // Todos los casos humanos, igual que la pagina de estadisticas
  let all = [];
  let from = 0;
  for (;;) {
    const { data, error } = await db
      .from("sek_cases")
      .select("id, assigned_to, estado, closed_at, accepted_at, created_at, canal, histtecnico")
      .neq("canal", "simulator")
      .neq("es_test", true)
      .range(from, from + 999);
    if (error) { console.error("ERR", error.message); process.exit(1); }
    all = all.concat(data);
    if (data.length < 1000) break;
    from += 1000;
  }
  console.log("total casos (sin simulador/test):", all.length);

  const humanos = all.filter(
    (c) => c.assigned_to && !String(c.assigned_to).includes("system_prompt")
  );
  console.log("casos con agente humano:", humanos.length);

  // Los que el score cuenta como "resueltos"
  const resueltos = humanos.filter(
    (c) => c.estado === "resuelto" || c.estado === "cerrado" || c.closed_at
  );
  console.log("contados como RESUELTOS por el score:", resueltos.length);

  // Firma del auto-close en el ultimo mensaje de histtecnico
  let porCloseMsg = 0;
  let porEncuesta = 0;
  let porAgente = 0;
  let sinHist = 0;
  const ejemplos = { close: [], survey: [] };

  for (const c of resueltos) {
    const h = Array.isArray(c.histtecnico) ? c.histtecnico : [];
    const msgs = h.filter((m) => m && m.content && m.role !== "nota");
    if (msgs.length === 0) { sinHist++; continue; }
    const last = msgs[msgs.length - 1];
    const txt = String(last.content || "").toLowerCase();
    if (txt.includes(CLOSE_MSG_FRAG.toLowerCase())) {
      porCloseMsg++;
      if (ejemplos.close.length < 3) ejemplos.close.push({ id: c.id, estado: c.estado, closed_at: c.closed_at });
    } else if (txt.includes(SURVEY_FRAG) || txt.includes(SURVEY_FRAG2)) {
      porEncuesta++;
      if (ejemplos.survey.length < 3) ejemplos.survey.push({ id: c.id, estado: c.estado, closed_at: c.closed_at, autor: last.author });
    } else {
      porAgente++;
    }
  }

  console.log("\n--- De los contados como resueltos ---");
  console.log("ultimo msg = CLOSE_MSG de auto-close:", porCloseMsg);
  console.log("ultimo msg = encuesta de calificacion:", porEncuesta);
  console.log("ultimo msg = mensaje real del agente:", porAgente);
  console.log("sin histtecnico:", sinHist);
  console.log("ejemplos close:", JSON.stringify(ejemplos.close));
  console.log("ejemplos encuesta:", JSON.stringify(ejemplos.survey));

  // Estados de los casos humanos
  const porEstado = {};
  humanos.forEach((c) => { porEstado[c.estado || "null"] = (porEstado[c.estado || "null"] || 0) + 1; });
  console.log("\nestados de casos humanos:", JSON.stringify(porEstado, null, 2));

  // Cuantos resueltos NO tienen closed_at (solo estado)
  const sinClosedAt = resueltos.filter((c) => !c.closed_at).length;
  console.log("resueltos SIN closed_at:", sinClosedAt);

  // Cuantos calificacion_pendiente hay (firma de que la encuesta corre)
  const calPend = all.filter((c) => c.estado === "calificacion_pendiente").length;
  console.log("casos en calificacion_pendiente ahora:", calPend);

  // Ultimo cierre registrado, para ver si auto-close esta activo hoy
  const conClose = all.filter((c) => c.closed_at).sort((a, b) => new Date(b.closed_at) - new Date(a.closed_at));
  console.log("ultimos 5 closed_at:", JSON.stringify(conClose.slice(0, 5).map((c) => ({ id: c.id, closed_at: c.closed_at, estado: c.estado }))));
})();
