import { createClient } from "npm:@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SERVICE_KEY  = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
const GEMINI_API_KEY = Deno.env.get("GEMINI_API_KEY") ?? "";
const INACTIVITY_MINUTES_DEFAULT = 5;   // canales humanos (whatsapp, etc.)
const INACTIVITY_MINUTES_IA = 5;        // widget atendido por IA — mismo umbral que manual
const CLOSE_MSG = "Debido a que no hemos recibido respuesta, vamos a cerrar esta conversación. Si necesita ayuda, no dude en ponerse en contacto, con gusto le atendemos. ¡Que tenga un buen día!";

const db = createClient(SUPABASE_URL, SERVICE_KEY);

// Aprendizaje: genera resumen de la conversación y lo guarda en RAG
async function learnFromCase(caso: any): Promise<void> {
  if (!GEMINI_API_KEY) return;
  try {
    const hist: { role: string; content: string }[] = [];
    for (const m of (caso.histcliente ?? [])) {
      if (m?.content) hist.push({ role: m.role || "user", content: m.content });
    }
    for (const m of (caso.histtecnico ?? [])) {
      if (m?.content && m.role !== "nota") hist.push({ role: m.role || "tecnico", content: m.content });
    }
    if (hist.length < 4) return;

    const conversationText = hist
      .slice(-20)
      .map(m => `${m.role === "user" ? "CLIENTE" : "AGENTE"}: ${m.content}`)
      .join("\n");

    const prompt = `Analiza esta conversación de soporte técnico y genera un resumen CONCISO (max 200 palabras) que incluya: EQUIPO, PROBLEMA, RESOLUCIÓN o motivo de escalado, y LECCIÓN APRENDIDA para futuros casos similares.\n\nConversación:\n${conversationText}`;

    const res = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-3.1-flash-lite:generateContent?key=${GEMINI_API_KEY}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contents: [{ parts: [{ text: prompt }] }],
          generationConfig: { temperature: 0.2, maxOutputTokens: 400 },
        }),
      }
    );
    if (!res.ok) return;
    const data = await res.json();
    const summary = data.candidates?.[0]?.content?.parts?.[0]?.text?.trim();
    if (!summary || summary.length < 50) return;

    await db.from("sek_doc_chunks").insert({
      doc_id: null,
      doc_name: `Aprendizaje auto-close: caso ${caso.id}`.substring(0, 200),
      content: summary.substring(0, 3000),
      source_label: "Aprendizaje de conversación",
    });
    console.log(`[auto-close] Aprendizaje guardado para caso ${caso.id}`);
  } catch (_e) { /* no bloquea */ }
}

Deno.serve(async () => {
  const { data: casos, error } = await db
    .from("sek_cases")
    .select("id, canal, estado, histcliente, histtecnico, created_at, assigned_to")
    .not("estado", "in", '("cerrado","resuelto")')
    .neq("canal", "simulator")
    .limit(200);

  if (error) {
    console.error("[auto-close] Error al leer casos:", error.message);
    return new Response(JSON.stringify({ error: error.message }), { status: 500 });
  }

  if (!casos || casos.length === 0) {
    return new Response(JSON.stringify({ closed: 0 }), { status: 200 });
  }

  const now = Date.now();
  let closed = 0;

  for (const caso of casos) {
    /*
     * Solo cerrar si el ÚLTIMO mensaje de toda la conversación es del AGENTE/TÉCNICO.
     * Esto significa que el agente ya respondió y el cliente no ha contestado.
     * Si el último mensaje es del cliente → el cliente espera respuesta → NO cerrar.
     */
    const allMsgs: { role: string; time: string }[] = [];
    for (const m of (caso.histcliente ?? [])) {
      if (m?.time) allMsgs.push({ role: m.role || "user", time: m.time });
    }
    for (const m of (caso.histtecnico ?? [])) {
      if (m?.role === "nota") continue; // ignorar notas internas
      if (m?.time) allMsgs.push({ role: m.role || "tecnico", time: m.time });
    }
    allMsgs.sort((a, b) => new Date(a.time).getTime() - new Date(b.time).getTime());

    // Umbral unificado a 5 min para todos los casos.
    const isIA = caso.estado === "ia_atendiendo";
    const threshold = (isIA ? INACTIVITY_MINUTES_IA : INACTIVITY_MINUTES_DEFAULT) * 60 * 1000;

    // REGLA INMUTABLE: el cierre por inactividad es ÚNICAMENTE por inactividad del CLIENTE.
    // Si no hay mensajes aún, no cerrar (esperando primer mensaje del cliente).
    // Si el último mensaje es del cliente, NUNCA cerrar (estaríamos cerrando por
    // inactividad del agente/IA, lo cual es inaceptable).
    if (allMsgs.length === 0) continue;
    const last = allMsgs[allMsgs.length - 1];
    if (last.role === "user") continue;
    const elapsed = now - new Date(last.time).getTime();
    if (elapsed < threshold) continue;

    /* Agregar mensaje de cierre al historial del cliente */
    const closeEntry = {
      role: "tecnico",
      content: CLOSE_MSG,
      time: new Date().toISOString(),
      author: "Soporte Sekunet",
    };
    const newHist = [...(caso.histtecnico ?? []), closeEntry];

    // Verificar que el caso siga abierto justo antes de cerrar (evita doble cierre en race condition)
    const { data: check } = await db.from("sek_cases").select("estado").eq("id", caso.id).maybeSingle();
    if (!check || check.estado === "cerrado" || check.estado === "resuelto") continue;

    const { error: updateErr } = await db
      .from("sek_cases")
      .update({ estado: "cerrado", histtecnico: newHist })
      .eq("id", caso.id)
      .not("estado", "in", '("cerrado","resuelto")');

    if (updateErr) {
      console.error("[auto-close] Error cerrando caso", caso.id, updateErr.message);
      continue;
    }

    // Aprendizaje: generar resumen antes de pasar al siguiente caso
    learnFromCase(caso).catch(() => {});

    // REGLA INMUTABLE #2 — invocar también la edge function learn-case (centralizada)
    fetch(`${SUPABASE_URL}/functions/v1/learn-case`, {
      method: "POST",
      headers: { "Authorization": `Bearer ${SERVICE_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({ case_id: caso.id }),
    }).catch(() => {});

    // Send transcript email
    try {
      await fetch(`${SUPABASE_URL}/functions/v1/send-transcript`, {
        method: "POST",
        headers: { "Authorization": `Bearer ${SERVICE_KEY}`, "Content-Type": "application/json" },
        body: JSON.stringify({ case_id: caso.id }),
      });
    } catch (e) { console.error("[auto-close] transcript email error:", e); }

    const lastTime = allMsgs.length > 0 ? allMsgs[allMsgs.length - 1].time : caso.created_at;
    console.log(`[auto-close] Caso ${caso.id} cerrado por inactividad del cliente (${Math.round((now - new Date(lastTime).getTime()) / 60000)} min)`);
    closed++;
  }

  return new Response(JSON.stringify({ closed }), { status: 200 });
});
