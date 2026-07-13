import { createClient } from "npm:@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SERVICE_KEY  = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
const GEMINI_API_KEY = Deno.env.get("GEMINI_API_KEY") ?? "";
const INACTIVITY_MINUTES_DEFAULT = 5;   // canales humanos (whatsapp, etc.)
const INACTIVITY_MINUTES_IA = 5;        // widget atendido por IA — mismo umbral que manual
const CLOSE_MSG = "Al no haber recibido respuesta, procederemos a cerrar esta conversación. Si necesita asistencia adicional, puede contactarnos nuevamente y con gusto le atenderemos. ¡Que tenga un excelente día!";

const db = createClient(SUPABASE_URL, SERVICE_KEY);

// ── WARM-UP: despertar Render antes de enviar mensajes ──
async function warmUpEvolution(): Promise<boolean> {
  const EVO_URL = Deno.env.get("EVOLUTION_API_URL") || "";
  if (!EVO_URL) return false;
  try {
    console.log("[auto-close] Warm-up: despertando Evolution API en Render...");
    const start = Date.now();
    const res = await fetch(EVO_URL.replace(/\/$/, "") + "/", {
      signal: AbortSignal.timeout(55000),
    });
    const elapsed = Date.now() - start;
    console.log(`[auto-close] Warm-up completado en ${elapsed}ms, status: ${res.status}`);
    return res.ok;
  } catch (e: any) {
    console.error("[auto-close] Warm-up falló:", e.message);
    return false;
  }
}

async function sendViaEvolution(phone: string, text: string): Promise<string | null> {
  const EVO_URL = Deno.env.get("EVOLUTION_API_URL") || "";
  const EVO_KEY = Deno.env.get("EVOLUTION_API_KEY") || "";
  const EVO_INSTANCE = Deno.env.get("EVOLUTION_INSTANCE") || "";
  
  console.log(`[auto-close] sendViaEvolution llamado`, { 
    phone: phone || "SIN_PHONE", 
    hasUrl: !!EVO_URL, 
    hasKey: !!EVO_KEY, 
    hasInstance: !!EVO_INSTANCE,
    url: EVO_URL || "VACIO",
    instance: EVO_INSTANCE || "VACIO"
  });
  
  if (!EVO_URL || !EVO_KEY || !EVO_INSTANCE || !phone) {
    console.error("[auto-close] Error: Falta configuración de Evolution API", { 
      hasUrl: !!EVO_URL, 
      hasKey: !!EVO_KEY, 
      hasInstance: !!EVO_INSTANCE, 
      phone: phone || "SIN_PHONE" 
    });
    return null;
  }
  
  let to = phone.toString().trim();
  if (!to.includes("@")) to = `${to.replace(/[^0-9]/g, "")}@s.whatsapp.net`;
  
  const endpoint = `${EVO_URL.replace(/\/$/, "")}/message/sendText/${encodeURIComponent(EVO_INSTANCE)}`;
  console.log(`[auto-close] Enviando a endpoint: ${endpoint}`, { to, textLength: text.length });
  
  try {
    const res = await fetch(endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json", apikey: EVO_KEY },
      body: JSON.stringify({ number: to, text }),
      signal: AbortSignal.timeout(30000),
    });
    
    const resText = await res.text();
    console.log(`[auto-close] Respuesta Evolution:`, { status: res.status, ok: res.ok, body: resText.substring(0, 200) });
    
    if (!res.ok) {
      console.error("[auto-close] Error Evolution API:", res.status, resText);
      return null;
    } else {
      console.log(`[auto-close] Mensaje de cierre enviado con éxito a ${to}`);
      try {
        const resData = JSON.parse(resText);
        return resData?.key?.id || null;
      } catch {
        return null;
      }
    }
  } catch (e: any) {
    console.error("[auto-close] Exception sending to Evolution:", e.message, e.stack);
    return null;
  }
}

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

Deno.serve(async (req) => {
  const urlObj = new URL(req.url);
  if (urlObj.searchParams.get("debug") === "true") {
    return new Response(JSON.stringify({
      SUPABASE_URL,
      EVO_URL: Deno.env.get("EVOLUTION_API_URL") || "",
      EVO_KEY: (Deno.env.get("EVOLUTION_API_KEY") || "").substring(0, 5) + "...",
      EVO_INSTANCE: Deno.env.get("EVOLUTION_INSTANCE") || "",
    }), { status: 200, headers: { "Content-Type": "application/json" } });
  }

  // ── WARM-UP: despertar Render ANTES de procesar casos ──
  await warmUpEvolution();

  const { data: casos, error } = await db
    .from("sek_cases")
    .select("id, canal, estado, histcliente, histtecnico, created_at, assigned_to, customer_phone, cliente, auto_close_paused")
    // Solo cerrar casos atendidos por IA (smart) o por un técnico humano (abierto).
    // NUNCA cerrar casos escalados: el cliente está esperando que un humano lo atienda.
    .in("estado", ["ia_atendiendo", "abierto"])
    .neq("canal", "simulator")
    .order("created_at", { ascending: true })
    .limit(50);

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
    // PROTECCIÓN: no cerrar si está pausado manualmente
    if (caso.auto_close_paused) {
      console.log(`[auto-close] Caso ${caso.id} tiene auto_close_paused=true, saltando`);
      continue;
    }

    // PROTECCIÓN: casos humanos (abierto) sin assigned_to son zombis si llevan más de 24h.
    // Cerrarlos automáticamente. Si llevan menos de 24h, esperarlos (puede que el agente
    // aún no haya respondido pero acaba de tomar el caso).
    if (caso.estado !== "ia_atendiendo" && !caso.assigned_to) {
      const ageMs = now - new Date(caso.created_at).getTime();
      const ZOMBIE_THRESHOLD_MS = 24 * 60 * 60 * 1000; // 24 horas
      if (ageMs < ZOMBIE_THRESHOLD_MS) {
        console.log(`[auto-close] Caso ${caso.id} sin assigned_to pero menor a 24h, saltando`);
        continue;
      }
      console.log(`[auto-close] Caso ${caso.id} zombi (${Math.round(ageMs/3600000)}h sin assigned_to) → cerrando`);
      const closeEntry = { role: "tecnico", content: CLOSE_MSG, time: new Date().toISOString(), author: "Soporte Sekunet" };
      await db.from("sek_cases").update({ estado: "cerrado", histtecnico: [...(caso.histtecnico ?? []), closeEntry] })
        .eq("id", caso.id).not("estado", "in", '("cerrado","resuelto")');
      closed++;
      console.log(`[auto-close] Caso zombi ${caso.id} cerrado.`);
      continue;
    }

    /*
     * Lógica de cierre: comparar el timestamp del ÚLTIMO mensaje del agente/IA
     * contra el último mensaje del cliente.
     * - Si el agente respondió DESPUÉS del cliente → elegible para cierre por inactividad.
     * - Si el cliente escribió DESPUÉS del agente → el cliente espera respuesta → NO cerrar.
     */

    // Último mensaje del CLIENTE (histcliente, role: "user")
    const clientMsgs = (caso.histcliente ?? []).filter((m: any) => m?.time && m?.role === "user");
    const lastClientTime = clientMsgs.length > 0
      ? Math.max(...clientMsgs.map((m: any) => new Date(m.time).getTime()))
      : 0;

    // Último mensaje del AGENTE/IA (histtecnico, excluyendo notas)
    const agentMsgs = (caso.histtecnico ?? []).filter((m: any) => m?.time && m?.role !== "nota");
    const lastAgentTime = agentMsgs.length > 0
      ? Math.max(...agentMsgs.map((m: any) => new Date(m.time).getTime()))
      : 0;

    // Si nunca hubo respuesta del agente, no cerrar
    if (lastAgentTime === 0) continue;

    // Si el cliente escribió DESPUÉS del agente (o al mismo tiempo), el cliente espera → NO cerrar
    if (lastClientTime > lastAgentTime) continue;

    // Umbral unificado a 5 min para todos los casos.
    const isIA = caso.estado === "ia_atendiendo";
    const threshold = (isIA ? INACTIVITY_MINUTES_IA : INACTIVITY_MINUTES_DEFAULT) * 60 * 1000;

    // Cerrar si pasaron más de 5 min desde la última respuesta del agente sin que el cliente conteste
    const elapsed = now - lastAgentTime;
    if (elapsed < threshold) continue;

    // Verificar que el caso siga abierto justo antes de cerrar (evita doble cierre en race condition)
    const { data: check } = await db.from("sek_cases").select("estado").eq("id", caso.id).maybeSingle();
    if (!check || check.estado === "cerrado" || check.estado === "resuelto" || check.estado === "escalado") continue;

    // SI EL CANAL ES WHATSAPP, resolver teléfono primero
    const canalLower = String(caso.canal || "").toLowerCase().trim();
    const clienteObj = typeof caso.cliente === "object" ? caso.cliente : {};
    const realPhone = clienteObj?.telefono_real || clienteObj?.telefono || caso.customer_phone || "";

    console.log(`[auto-close] Caso ${caso.id} - Canal: '${canalLower}', customer_phone: ${caso.customer_phone || "SIN"}, telefono_real: ${clienteObj?.telefono_real || "SIN"}, resolved: ${realPhone || "SIN"}`);

    // ACTUALIZAR LA BD PRIMERO (atómico con condición de estado) para evitar race condition.
    // Si otro proceso ya lo cerró, el update afectará 0 filas y no enviamos nada.
    const closeEntry = {
      role: "tecnico",
      content: CLOSE_MSG,
      time: new Date().toISOString(),
      author: "Soporte Sekunet",
    };
    const newHist = [...(caso.histtecnico ?? []), closeEntry];

    const { data: updatedCases, error: updateErr } = await db
      .from("sek_cases")
      .update({ estado: "cerrado", histtecnico: newHist })
      .eq("id", caso.id)
      .not("estado", "in", '("cerrado","resuelto")')
      .select("id");

    if (updateErr) {
      console.error("[auto-close] Error cerrando caso", caso.id, updateErr.message);
      continue;
    }

    // Si updatedCases es vacío, otro proceso ya lo cerró — no enviar WhatsApp
    if (!updatedCases || updatedCases.length === 0) {
      console.log(`[auto-close] Caso ${caso.id} ya fue cerrado por otro proceso, saltando`);
      continue;
    }

    // Solo llegar aquí si somos el proceso que realmente cerró el caso
    let msgId: string | null = null;
    if (canalLower === "whatsapp" && realPhone) {
      console.log(`[auto-close] Enviando mensaje de cierre por WhatsApp a ${realPhone}`);
      msgId = await sendViaEvolution(realPhone, CLOSE_MSG);
    } else if (canalLower !== "whatsapp") {
      console.log(`[auto-close] Caso ${caso.id} no es WhatsApp (canal='${canalLower}'), no se envía mensaje real`);
    } else if (!realPhone) {
      console.error(`[auto-close] Caso ${caso.id} es WhatsApp pero NO tiene teléfono real!`);
    }

    // Si Evolution devolvió un messageId, actualizar histtecnico con él
    if (msgId) {
      const { data: latest } = await db.from("sek_cases").select("histtecnico").eq("id", caso.id).maybeSingle();
      if (latest && latest.histtecnico) {
        const h = latest.histtecnico;
        if (h.length > 0) {
          h[h.length - 1].messageId = msgId;
          h[h.length - 1].fromMe = true;
          await db.from("sek_cases").update({ histtecnico: h }).eq("id", caso.id);
        }
      }
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

    const lastTime = lastAgentTime > 0 ? new Date(lastAgentTime).toISOString() : caso.created_at;
    console.log(`[auto-close] Caso ${caso.id} cerrado por inactividad del cliente (${Math.round((now - new Date(lastTime).getTime()) / 60000)} min)`);
    closed++;
  }

  return new Response(JSON.stringify({ closed }), { status: 200 });
});
