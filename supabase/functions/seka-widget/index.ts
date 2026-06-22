import { createClient } from "npm:@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SERVICE_KEY  = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
const NVIDIA_KEY   = Deno.env.get("NVIDIA_API_KEY") ?? "";
const GEMINI_KEY   = Deno.env.get("GEMINI_API_KEY") ?? "";
const OPENROUTER_KEY = Deno.env.get("OPENROUTER_API_KEY") ?? "";
const NIM_BASE     = "https://integrate.api.nvidia.com/v1";

const db = createClient(SUPABASE_URL, SERVICE_KEY);

// ─── SYSTEM PROMPT ────────────────────────────────────────────────────────────
const SYSTEM_PROMPT = `Usted es el Asistente Virtual de Sekunet (Costa Rica), especialista de soporte técnico.
Trate siempre de usted. Sin emojis. Máximo 2 oraciones por respuesta.
Una sola pregunta o instrucción por mensaje. Espere respuesta antes de continuar.
Nunca mencione que es una IA ni un asistente virtual. No se presente, el cliente ya fue saludado.

════════════════════════════════════════════
FLUJO OBLIGATORIO — SIGA ESTE ORDEN EXACTO
════════════════════════════════════════════

PASO 1 — SOLICITAR MARCA
Diga exactamente: "Por favor, indíquenos la marca del equipo."

PASO 2 — SOLICITAR MODELO
Diga exactamente: "¿Nos podría indicar el modelo del equipo, por favor?"

PASO 3 — VALIDAR EN INVENTARIO
Antes de emitir el tag, normalice la marca y el modelo:
- Corrija errores tipográficos obvios (ej. "Hikvission" → "Hikvision")
- Elimine prefijos redundantes del modelo solo si son evidentemente parte de la marca (ej. "HIK-DS-3E0508" → use "DS-3E0508")
- Reemplace la letra O por el número 0 cuando sea parte de un código alfanumérico (ej. "3E0508-O" → "3E0508-0")
- Use solo la raíz del modelo sin sufijos ambiguos si el modelo completo no coincide

Luego emita: [BUSCAR_INVENTARIO: marca modelo_normalizado]
El sistema verificará si está en la cartera de Sekunet.
La búsqueda debe ser inteligente: tolere variaciones ortográficas, abreviaciones y errores tipográficos del cliente.

Si NO está en cartera → diga exactamente:
"El dispositivo indicado no forma parte de los equipos distribuidos por Sekunet, por lo que lamentablemente no podemos brindarle el soporte requerido. ¿Tiene alguna otra consulta relacionada con nuestros productos?"
  → Si el cliente dice Sí → regrese al PASO 1
  → Si el cliente dice No → diga M03 y emita [CERRAR]

Si SÍ está en cartera → continúe al PASO 4

PASO 4 — SOLICITAR DESCRIPCIÓN DEL INCONVENIENTE
Diga exactamente: "Por favor, describa brevemente el inconveniente que presenta."

PASO 5 — ESCALAR
Cuando el cliente responda con la descripción, diga exactamente M02 y emita [ESCALAR_N2: Configuraciones — {descripción breve del inconveniente}]

════════════════════════════════════════════
MENSAJES EXACTOS — NO LOS MODIFIQUE
════════════════════════════════════════════

M02:
"Agradecemos su preferencia. En un momento será atendido por uno de nuestros agentes."

M03:
"Ha sido un gusto atenderle. Si tiene alguna otra consulta, no dude en contactarnos nuevamente. ¡Que tenga un excelente día!"

════════════════════════════════════════════
REGLAS ABSOLUTAS
════════════════════════════════════════════
- Si el cliente pide hablar con una persona en cualquier momento → diga M02 y emita [ESCALAR_N2: solicitud del cliente]. Inmediatamente, sin preguntar nada más.
- No diagnostique ni dé pasos técnicos. Su único rol es recopilar datos y escalar.
- Si el cliente se despide → diga M03 y emita [CERRAR]
- Nunca haga dos preguntas en un mismo mensaje.
- Nunca invente información.
- Respete el orden de los pasos. No salte ninguno.`;

// ─── INTERFACES ───────────────────────────────────────────────────────────────
interface HistMsg {
  role: string;
  content: string;
  time: string;
  author?: string;
  mediaUrl?: string;
  mediaType?: string;
  fileName?: string;
}

interface NimMessage {
  role: "system" | "user" | "assistant";
  content: string | Array<{ type: string; text?: string; image_url?: { url: string } }>;
}

// ─── MOTOR DE IA RESILIENTE (AI ROUTER) ───────────────────────────────────────
type AIProvider = "nvidia" | "openrouter" | "google";
interface ModelConfig {
  provider: AIProvider;
  model: string;
}

const AI_FALLBACK_CHAIN: ModelConfig[] = [
  { provider: "nvidia", model: "meta/llama-3.2-11b-vision-instruct" },
  { provider: "nvidia", model: "meta/llama-3.2-90b-vision-instruct" },
  { provider: "openrouter", model: "meta-llama/llama-3.2-11b-vision-instruct:free" },
  { provider: "openrouter", model: "qwen/qwen-2-vl-7b-instruct:free" },
  { provider: "google", model: "gemini-2.0-flash" },
  { provider: "google", model: "gemini-1.5-flash" }
];

async function callNvidia(model: string, messages: NimMessage[]): Promise<string> {
  const res = await fetch(`${NIM_BASE}/chat/completions`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "Authorization": `Bearer ${NVIDIA_KEY}` },
    body: JSON.stringify({ model, messages, temperature: 0.2, max_tokens: 512, stream: false }),
  });
  if (!res.ok) throw new Error(`Status ${res.status}`);
  const data = await res.json();
  return data.choices?.[0]?.message?.content?.trim() ?? "";
}

async function callOpenRouter(model: string, messages: NimMessage[]): Promise<string> {
  const res = await fetch("https://openrouter.ai/api/v1/chat/completions", {
    method: "POST",
    headers: { 
      "Content-Type": "application/json", 
      "Authorization": `Bearer ${OPENROUTER_KEY}`,
      "HTTP-Referer": "https://sekunet.com",
      "X-Title": "Chat Sekunet"
    },
    body: JSON.stringify({ model, messages, temperature: 0.2, max_tokens: 512, stream: false }),
  });
  if (!res.ok) throw new Error(`Status ${res.status}`);
  const data = await res.json();
  return data.choices?.[0]?.message?.content?.trim() ?? "";
}

async function callGoogle(model: string, messages: NimMessage[]): Promise<string> {
  const system = messages.find(m => m.role === "system");
  const turns = messages.filter(m => m.role !== "system");
  const contents = turns.map(m => ({
    role: m.role === "user" ? "user" : "model",
    parts: [{ text: typeof m.content === "string" ? m.content : (m.content as any[]).find((p:any) => p.type==="text")?.text ?? "" }],
  }));
  const body: any = { contents, generationConfig: { temperature: 0.2, maxOutputTokens: 512 } };
  if (system) body.systemInstruction = { parts: [{ text: system.content as string }] };
  
  const res = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${GEMINI_KEY}`,
    { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }
  );
  if (!res.ok) throw new Error(`Status ${res.status}`);
  const data = await res.json();
  return data.candidates?.[0]?.content?.parts?.[0]?.text?.trim() ?? "";
}

async function callAIWithFallbacks(messages: NimMessage[]): Promise<string> {
  const errors: string[] = [];
  
  for (const config of AI_FALLBACK_CHAIN) {
    try {
      if (config.provider === "nvidia") {
        return await callNvidia(config.model, messages);
      } else if (config.provider === "openrouter") {
        return await callOpenRouter(config.model, messages);
      } else if (config.provider === "google") {
        return await callGoogle(config.model, messages);
      }
    } catch (e: any) {
      console.warn(`[AI Router] Falló ${config.provider} -> ${config.model}: ${e.message}`);
      errors.push(`${config.model}(${e.message})`);
    }
  }
  
  throw new Error(`AI Router agotó todos los fallbacks. Errores: ${errors.join(", ")}`);
}

// ─── BUSCAR EN INVENTARIO ─────────────────────────────────────────────────────
async function buscarInventario(query: string): Promise<{ encontrado: boolean; detalle: string }> {
  try {
    const tokens = query.trim().split(/\s+/).filter((t: string) => t.length >= 2);
    if (tokens.length === 0) return { encontrado: false, detalle: "Consulta vacía." };

    const brandToken = tokens[0];

    // PASO 1: buscar en la base de datos (puede ser marca o modelo)
    const { data: brandRows } = await db
      .from("sek_inventario")
      .select("id,codigo,nombre,marca,modelo,categoria")
      .or(`marca.ilike.%${brandToken}%,modelo.ilike.%${brandToken}%`)
      .limit(50);

    if (!brandRows || brandRows.length === 0) {
      return { encontrado: false, detalle: `El equipo "${brandToken}" no está en la cartera de Sekunet.` };
    }

    // Si encontramos una coincidencia directa del modelo con el primer token
    const directModelMatch = brandRows.find(r => r.modelo && r.modelo.toLowerCase().includes(brandToken.toLowerCase()));
    if (directModelMatch) {
      return { 
        encontrado: true, 
        detalle: `Equipo en cartera: ${directModelMatch.marca} ${directModelMatch.modelo}${directModelMatch.nombre ? " — " + directModelMatch.nombre : ""}` 
      };
    }

    // Si solo hay un token y coincidió con marca
    if (tokens.length === 1) {
      return { encontrado: true, detalle: `Marca en cartera: ${brandRows[0].marca}` };
    }

    const modelTokens: string[] = [];
    for (const t of tokens.slice(1)) {
      modelTokens.push(t);
      t.split("-").filter((s: string) => s.length >= 2).forEach((s: string) => modelTokens.push(s));
    }

    // Puntuar solo registros que ya coinciden con la marca
    const matchCount = new Map<string, { record: any; count: number }>();
    for (const r of brandRows) {
      matchCount.set(String(r.id), { record: r, count: 0 });
    }
    for (const mt of modelTokens) {
      for (const [key, val] of matchCount.entries()) {
        const hay = `${val.record.modelo || ""} ${val.record.nombre || ""} ${val.record.codigo || ""}`.toLowerCase();
        if (hay.includes(mt.toLowerCase())) matchCount.get(key)!.count++;
      }
    }

    const sorted = Array.from(matchCount.values()).sort((a, b) => b.count - a.count);
    const best = sorted[0];

    if (best.count === 0) {
      return { encontrado: false, detalle: `El modelo no se encontró en la cartera de Sekunet para la marca "${brandToken}".` };
    }

    return {
      encontrado: true,
      detalle: `Equipo en cartera: ${best.record.marca} ${best.record.modelo}${best.record.nombre ? " — " + best.record.nombre : ""}`,
    };
  } catch (e: any) {
    console.error("[seka-widget] Error inventario:", e.message);
    return { encontrado: false, detalle: "Error consultando inventario." };
  }
}

// ─── PROCESAR TAGS FUNCIONALES ────────────────────────────────────────────────
async function processTags(text: string, caseId: string): Promise<string> {
  let result = text;

  // [BUSCAR_INVENTARIO: ...]
  const invMatch = text.match(/\[BUSCAR_INVENTARIO:\s*([^\]]+)\]/i);
  if (invMatch) {
    const inv = await buscarInventario(invMatch[1].trim());
    result = result.replace(invMatch[0], "");
    // Inyectar resultado como contexto interno (no se muestra al cliente)
    result = `__INV__${JSON.stringify(inv)}__INV__${result}`;
  }

  // [ESCALAR_N2: ...]
  const escMatch = text.match(/\[ESCALAR_N2:\s*([^\]]+)\]/i);
  if (escMatch) {
    await db.from("sek_cases").update({
      estado: "escalado",
      n2_reason: escMatch[1].trim(),
    }).eq("id", caseId);
    result = result.replace(escMatch[0], "").trim();
  }

  // [CERRAR]
  if (/\[CERRAR\]/i.test(text)) {
    await db.from("sek_cases").update({ estado: "cerrado" }).eq("id", caseId);
    result = result.replace(/\[CERRAR\]/gi, "").trim();
  }

  return result;
}

// Textos de bienvenida que NO deben enviarse a Llama
const WELCOME_TEXTS = [
  "Reciba un cordial saludo de parte del equipo de Soporte Sekunet. Gracias por contactarnos.",
  "¡Hola! Soy el Asistente Virtual de Sekunet. Para brindarle una mejor asistencia, requerimos algunos datos importantes sobre su consulta.",
  "Mi nombre es Seka, asistente virtual de Sekunet. Para brindarle una mejor asistencia, requerimos algunos datos importantes sobre su consulta.",
  "¿En relación a qué tema sería su consulta?",
];

const TOPICS = ["Configuraciones","Reset","Desvinculación","Firmware","Software","Drivers","Licencias","Otro"];

// ─── CONSTRUIR MENSAJES PARA LLAMA ───────────────────────────────────────────
function buildMessages(hist: HistMsg[], invContext: string | null): NimMessage[] {
  // Filtrar mensajes de bienvenida — Llama no debe verlos
  const filtered = hist.filter(m => !WELCOME_TEXTS.includes(m.content?.trim() ?? ""));

  // Detectar el tema seleccionado (primer mensaje de usuario que sea un botón de tema)
  const temaMsg = hist.find(m => m.role === "user" && TOPICS.includes(m.content?.trim() ?? ""));
  const tema = temaMsg?.content?.trim() ?? "Configuraciones";

  // Construir system prompt con el tema inyectado
  const systemWithTema = SYSTEM_PROMPT.replace("{{TEMA}}", tema)
    + `\n\nEl cliente seleccionó el tema: ${tema}. Inicie el flujo correspondiente.`;

  const messages: NimMessage[] = [{ role: "system", content: systemWithTema }];

  for (const m of filtered) {
    if (m.role === "user" || m.role === "assistant" || m.role === "ia") {
      // Saltar si es el mensaje del botón de tema (ya está en el system prompt)
      if (m.role === "user" && TOPICS.includes(m.content?.trim() ?? "")) continue;

      const nimRole: "user" | "assistant" = (m.role === "user") ? "user" : "assistant";

      if (m.mediaUrl && m.mediaType?.startsWith("image/")) {
        messages.push({
          role: nimRole,
          content: [
            { type: "text", text: m.content || "Imagen adjunta" },
            { type: "image_url", image_url: { url: m.mediaUrl } },
          ],
        });
      } else {
        let text = m.content || "";
        // Inyectar contexto de inventario justo antes del último mensaje del usuario
        if (invContext && nimRole === "user" && m === filtered[filtered.length - 1]) {
          text = `[Contexto interno — no mostrar al cliente]: ${invContext}\n\n${text}`;
        }
        messages.push({ role: nimRole, content: text });
      }
    }
  }

  // Si no hay mensajes de usuario reales aún, agregar uno ficticio para arrancar el flujo
  const hasUserMsg = messages.some(m => m.role === "user");
  if (!hasUserMsg) {
    messages.push({ role: "user", content: `El cliente seleccionó el tema: ${tema}. Por favor inicie el flujo.` });
  }

  return messages;
}

// ─── HANDLER PRINCIPAL ───────────────────────────────────────────────────────
Deno.serve(async (req: Request) => {
  const corsHeaders = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization, x-client-info, apikey",
  };

  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  let globalCaseId: string | null = null;
  let globalHistCliente: HistMsg[] = [];

  try {
    const { case_id } = await req.json();
    globalCaseId = case_id;
    if (!case_id) return new Response(JSON.stringify({ error: "case_id requerido" }), { status: 400, headers: corsHeaders });

    // Cargar caso
    const { data: caso, error: caseErr } = await db
      .from("sek_cases")
      .select("histcliente, histtecnico, estado, cliente")
      .eq("id", case_id)
      .maybeSingle();

    if (caseErr || !caso) {
      console.error("[seka-widget] Caso no encontrado:", case_id);
      return new Response(JSON.stringify({ error: "caso_no_encontrado" }), { status: 404, headers: corsHeaders });
    }

    const estado = String(caso.estado || "").toLowerCase();
    if (estado === "cerrado" || estado === "resuelto" || estado === "escalado") {
      console.log("[seka-widget] Caso ya no activo:", estado);
      return new Response(JSON.stringify({ ok: true, skipped: true }), { status: 200, headers: corsHeaders });
    }

    const histcliente: HistMsg[] = Array.isArray(caso.histcliente) ? caso.histcliente : [];
    globalHistCliente = histcliente;

    // Filtrar mensajes reales (sin bienvenidas)
    const WELCOME_TEXTS_CHECK = [
      "Reciba un cordial saludo de parte del equipo de Soporte Sekunet. Gracias por contactarnos.",
      "¡Hola! Soy el Asistente Virtual de Sekunet. Para brindarle una mejor asistencia, requerimos algunos datos importantes sobre su consulta.",
      "Mi nombre es Seka, asistente virtual de Sekunet. Para brindarle una mejor asistencia, requerimos algunos datos importantes sobre su consulta.",
      "¿En relación a qué tema sería su consulta?",
    ];
    const TOPICS_CHECK = ["Configuraciones","Reset","Desvinculación","Firmware","Software","Drivers","Licencias","Otro"];
    const realMsgs = histcliente.filter(m => !WELCOME_TEXTS_CHECK.includes(m.content?.trim() ?? ""));
    const userRealMsgs = realMsgs.filter(m => m.role === "user");

    // Detectar posición del botón de tema en los mensajes reales del usuario
    const topiIdx = userRealMsgs.findIndex(m => TOPICS_CHECK.includes(m.content?.trim() ?? ""));
    const iaRealMsgs = realMsgs.filter(m => m.role === "ia" || m.role === "assistant");
    const tema = topiIdx >= 0 ? (userRealMsgs[topiIdx].content?.trim() ?? "Consulta") : "Consulta";

    // PASO 1: botón de tema es el último mensaje del usuario → preguntar marca
    const lastIA = iaRealMsgs[iaRealMsgs.length - 1];
    const lastUserMsg = userRealMsgs[userRealMsgs.length - 1];
    const lastIATime = lastIA?.time ? new Date(lastIA.time).getTime() : 0;
    const lastUserTime = lastUserMsg?.time ? new Date(lastUserMsg.time).getTime() : 0;
    // ═══════════════════════════════════════════════════════════════════════
    // SUPERVISOR DE IA — Analiza cada mensaje del usuario con inteligencia
    // ═══════════════════════════════════════════════════════════════════════

    // ── Paso 1: Construir resumen de la conversación para el Supervisor ──
    const allMsgs = histcliente.filter(m => !WELCOME_TEXTS_CHECK.includes(m.content?.trim() ?? ""));
    const conversationSummary = allMsgs.map(m => {
      const who = m.role === "user" ? "CLIENTE" : "ASISTENTE";
      const hasMedia = m.mediaUrl ? ` [ADJUNTO: ${m.mediaType || "archivo"}${m.fileName ? " — " + m.fileName : ""}]` : "";
      return `${who}: ${m.content || "(sin texto)"}${hasMedia}`;
    }).join("\n");

    // ── Paso 2: Consultar al Supervisor de IA ──
    const supervisorPrompt = `Eres el Supervisor Inteligente del chat de soporte de Sekunet (Costa Rica). Tu trabajo es ANALIZAR la conversación completa y decidir qué información ya se recopiló y cuál falta.

CONVERSACIÓN COMPLETA:
${conversationSummary}

TEMA SELECCIONADO POR EL CLIENTE (vía botón): ${tema}

CONTEXTO: El asistente ya saludó al cliente y el cliente ya seleccionó un tema vía botón. El flujo de recopilación restante es:
1. Marca del equipo
2. Modelo del equipo
3. Verificación en inventario (la marca+modelo debe existir en la cartera de Sekunet)
4. Para Reset/Desvinculación: imagen de etiqueta (y XML para Hikvision en Reset)
5. Para otros temas: descripción del problema
6. Escalado a agente humano

REGLAS DE ANÁLISIS:
- Si el cliente envió un código como "DS-3E0505P-E-M", "NVR-108MH", "IPC-T221H" eso es un MODELO, no una marca.
- Si el cliente envió una sola palabra como "Hikvision", "Dahua", "Epcom", "ZKTeco", eso es una MARCA.
- Si el cliente envió marca y modelo juntos, extrae ambos. Si el cliente solo dio el modelo, NO pidas la marca de nuevo si ya la infieres o si ya dio el modelo. Si ya tienes modelo, la acción debe avanzar, nunca regreses a PEDIR_MARCA.
- Si el tema es "Otro", NO pidas marca ni modelo, pide directamente la descripción del problema (accion: "PEDIR_DESCRIPCION").
- Si el cliente ya proporcionó datos (incluso si dijo que no tiene), NUNCA los pidas de nuevo.
- Si el cliente pregunta por precios, cotizaciones, compras o ventas, marca accion como "VENTAS".
- Si el cliente pide hablar con una persona/agente/humano, marca accion como "ESCALAR_INMEDIATO".
- Si el cliente se despide (adiós, gracias, hasta luego), marca accion como "CERRAR".
- Analiza errores tipográficos: "Hikvission" = "Hikvision", "Daua" = "Dahua".

Responde SOLO con JSON válido:
{
  "tema": "${tema}",
  "marca": "marca detectada o inferida, o vacío",
  "modelo": "modelo detectado, o vacío",
  "tiene_imagen": true/false,
  "tiene_xml": true/false,
  "descripcion_problema": "si el cliente ya describió su problema, ponerlo aquí, sino vacío",
  "accion": "una de: PEDIR_MARCA|PEDIR_MODELO|PEDIR_MARCA_Y_MODELO|BUSCAR_INVENTARIO|PEDIR_ETIQUETA|PEDIR_ETIQUETA_Y_XML|PEDIR_DESCRIPCION|ESCALAR|ESCALAR_INMEDIATO|CERRAR|VENTAS|CONTINUAR",
  "razon": "explicación breve de por qué elegiste esa acción",
  "respuesta_sugerida": "la respuesta que debería enviar el asistente al cliente (máx 2 oraciones, formal, sin emojis, tratando de usted)"
}`;

    let supervisorResult: any = null;
    try {
      const supervisorMessages: NimMessage[] = [
        { role: "system", content: supervisorPrompt },
        { role: "user", content: "Analiza la conversación y decide la siguiente acción." },
      ];
      const supervisorRaw = await callAIWithFallbacks(supervisorMessages);
      console.log("[seka-widget] Supervisor raw:", supervisorRaw);
      const jsonMatch = supervisorRaw.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        supervisorResult = JSON.parse(jsonMatch[0]);
        console.log("[seka-widget] Supervisor result:", JSON.stringify(supervisorResult));
      }
    } catch (e: any) {
      console.error("[seka-widget] Supervisor error:", e.message);
    }

    // ── Si el supervisor falló, usar fallback con LLM directo ──
    if (!supervisorResult) {
      console.warn("[seka-widget] Supervisor falló, usando LLM directo como fallback");
      const messages = buildMessages(histcliente, null);
      let rawReply = await callAIWithFallbacks(messages);
      let cleanReply = await processTags(rawReply, case_id);
      cleanReply = cleanReply.replace(/__INV__.*?__INV__/gs, "").trim();
      if (!cleanReply) return new Response(JSON.stringify({ ok: true, skipped: true }), { status: 200, headers: corsHeaders });
      const newMsg: HistMsg = { role: "ia", author: "Asistente Sekunet", time: new Date().toISOString(), content: cleanReply };
      await db.from("sek_cases").update({ histcliente: [...histcliente, newMsg] }).eq("id", case_id);
      return new Response(JSON.stringify({ ok: true, reply: cleanReply }), { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    // ── Paso 3: Ejecutar la ACCIÓN que decidió el Supervisor ──
    let accion = (supervisorResult.accion || "CONTINUAR").toUpperCase();
    const marcaSupervisor = supervisorResult.marca || "";
    const modeloSupervisor = supervisorResult.modelo || "";
    const temaSupervisor = supervisorResult.tema || tema;

    const validActions = ["CERRAR", "ESCALAR", "ESCALAR_INMEDIATO", "PEDIR_DATOS", "PEDIR_TEMA", "PEDIR_MARCA", "PEDIR_MODELO", "PEDIR_MARCA_Y_MODELO", "BUSCAR_INVENTARIO", "PEDIR_ETIQUETA", "PEDIR_ETIQUETA_Y_XML", "PEDIR_DESCRIPCION"];
    if (!validActions.includes(accion) && !supervisorResult.respuesta_sugerida) {
      console.warn(`[seka-widget] Accion ${accion} sin respuesta_sugerida. Aplicando heuristica.`);
      if (!temaSupervisor) {
        accion = "PEDIR_TEMA";
      } else if (!marcaSupervisor && !modeloSupervisor) {
        accion = "PEDIR_MARCA_Y_MODELO";
      } else if (!marcaSupervisor) {
        accion = "PEDIR_MARCA";
      } else if (!modeloSupervisor) {
        accion = "PEDIR_MODELO";
      } else {
        accion = "BUSCAR_INVENTARIO";
      }
    }

    console.log(`[seka-widget] Supervisor acción: ${accion}, marca: ${marcaSupervisor}, modelo: ${modeloSupervisor}, tema: ${temaSupervisor}`);

    // ── REGLA DE NEGOCIO: SIN CUENTA ──
    const cuentaDetectada = String(supervisorResult.cuenta || (caso.cliente as any)?.cuenta || "").toLowerCase().trim();
    if (cuentaDetectada === "sin cuenta" || cuentaDetectada === "no tengo" || cuentaDetectada === "cliente final") {
      const M_NO_CUENTA = "Gracias por comunicarse con Sekunet. Nuestro servicio de soporte técnico es un beneficio exclusivo para nuestra red de clientes y distribuidores autorizados. Le recomendamos contactar a su proveedor directo o instalador para que pueda asistirle con su requerimiento. ¡Que tenga un excelente día!";
      const newMsg: HistMsg = { role: "ia", author: "Asistente Sekunet", time: new Date().toISOString(), content: M_NO_CUENTA };
      await db.from("sek_cases").update({ histcliente: [...histcliente, newMsg], estado: "cerrado" }).eq("id", case_id);
      return new Response(JSON.stringify({ ok: true, reply: M_NO_CUENTA }), { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    // ── ACCIÓN: CERRAR ──
    if (accion === "CERRAR") {
      const M03_TEXT = "Ha sido un gusto atenderle. Si tiene alguna otra consulta, no dude en contactarnos nuevamente. ¡Que tenga un excelente día!";
      const newMsg: HistMsg = { role: "ia", author: "Asistente Sekunet", time: new Date().toISOString(), content: M03_TEXT };
      await db.from("sek_cases").update({ histcliente: [...histcliente, newMsg], estado: "cerrado" }).eq("id", case_id);
      return new Response(JSON.stringify({ ok: true, reply: M03_TEXT }), { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    // ── ACCIÓN: VENTAS ──
    if (accion === "VENTAS") {
      const M04_TEXT = "Esta consulta corresponde al departamento de ventas. Le invitamos a contactarlos al +506 2290 5585, vía WhatsApp al +506 8757 5820 o al correo info@sekunet.com. Ha sido un gusto atenderle. ¡Que tenga un excelente día!";
      const newMsg: HistMsg = { role: "ia", author: "Asistente Sekunet", time: new Date().toISOString(), content: M04_TEXT };
      await db.from("sek_cases").update({ histcliente: [...histcliente, newMsg], estado: "cerrado" }).eq("id", case_id);
      return new Response(JSON.stringify({ ok: true, reply: M04_TEXT }), { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    // ── ACCIÓN: ESCALAR INMEDIATO (cliente pidió hablar con un humano) ──
    if (accion === "ESCALAR_INMEDIATO") {
      const M02_TEXT = "Agradecemos su preferencia. En un momento será atendido por uno de nuestros agentes.";
      const newMsg: HistMsg = { role: "ia", author: "Asistente Sekunet", time: new Date().toISOString(), content: M02_TEXT };
      await db.from("sek_cases").update({
        histcliente: [...histcliente, newMsg],
        estado: "escalado",
        escalado_at: new Date().toISOString(),
        n2_reason: "Solicitud directa del cliente",
      }).eq("id", case_id);
      return new Response(JSON.stringify({ ok: true, reply: M02_TEXT }), { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    // ── ACCIÓN: PEDIR TEMA ──
    if (accion === "PEDIR_TEMA") {
      const directReply = supervisorResult.respuesta_sugerida || "¿En relación a qué tema sería su consulta?";
      const newMsg: HistMsg = { role: "ia", author: "Asistente Sekunet", time: new Date().toISOString(), content: directReply };
      await db.from("sek_cases").update({ histcliente: [...histcliente, newMsg] }).eq("id", case_id);
      return new Response(JSON.stringify({ ok: true, reply: directReply }), { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    // ── ACCIÓN: PEDIR MARCA ──
    if (accion === "PEDIR_MARCA") {
      const directReply = supervisorResult.respuesta_sugerida || "Por favor, indíquenos la marca del equipo.";
      const newMsg: HistMsg = { role: "ia", author: "Asistente Sekunet", time: new Date().toISOString(), content: directReply };
      await db.from("sek_cases").update({ histcliente: [...histcliente, newMsg] }).eq("id", case_id);
      return new Response(JSON.stringify({ ok: true, reply: directReply }), { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    // ── ACCIÓN: PEDIR MODELO ──
    if (accion === "PEDIR_MODELO") {
      const directReply = supervisorResult.respuesta_sugerida || "¿Nos podría indicar el modelo del equipo, por favor?";
      const newMsg: HistMsg = { role: "ia", author: "Asistente Sekunet", time: new Date().toISOString(), content: directReply };
      await db.from("sek_cases").update({ histcliente: [...histcliente, newMsg] }).eq("id", case_id);
      return new Response(JSON.stringify({ ok: true, reply: directReply }), { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    // ── ACCIÓN: PEDIR MARCA Y MODELO ──
    if (accion === "PEDIR_MARCA_Y_MODELO") {
      const directReply = supervisorResult.respuesta_sugerida || "Por favor, indíquenos la marca y el modelo del equipo.";
      const newMsg: HistMsg = { role: "ia", author: "Asistente Sekunet", time: new Date().toISOString(), content: directReply };
      await db.from("sek_cases").update({ histcliente: [...histcliente, newMsg] }).eq("id", case_id);
      return new Response(JSON.stringify({ ok: true, reply: directReply }), { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    // ── ACCIÓN: BUSCAR_INVENTARIO ──
    if (accion === "BUSCAR_INVENTARIO") {
      const searchQuery = `${marcaSupervisor} ${modeloSupervisor}`.trim();
      const inv = await buscarInventario(searchQuery);
      
      let directReply: string;
      if (!inv.encontrado) {
        directReply = "El dispositivo indicado no forma parte de los equipos distribuidos por Sekunet, por lo que lamentablemente no podemos brindarle el soporte requerido. ¿Tiene alguna otra consulta relacionada con nuestros productos?";
      } else if (temaSupervisor === "Reset") {
        const esHikvision = /hik/i.test(inv.detalle || marcaSupervisor);
        directReply = esHikvision
          ? "Como parte de los requisitos del fabricante, requerimos una imagen clara y legible de la etiqueta del equipo y el archivo XML, el cual puede obtener mediante la herramienta SAPD Tools en la opción \"Olvidé mi contraseña\", ubicada en la parte inferior derecha del software. Por favor, adjunte ambos archivos."
          : "Por favor, adjunte una imagen clara y legible de la etiqueta del equipo.";
      } else if (temaSupervisor === "Desvinculación") {
        directReply = "Como parte de los requisitos del fabricante, requerimos una imagen clara y legible de la etiqueta del equipo. Por favor, adjunte esta imagen.";
      } else {
        directReply = "Por favor, describa brevemente el inconveniente que presenta.";
      }
      
      const newMsg: HistMsg = { role: "ia", author: "Asistente Sekunet", time: new Date().toISOString(), content: directReply };
      const upd: Record<string, unknown> = { histcliente: [...histcliente, newMsg] };
      if (inv.encontrado && (marcaSupervisor || modeloSupervisor)) {
        upd.title = `${temaSupervisor} — ${inv.detalle}`.substring(0, 120);
      }
      await db.from("sek_cases").update(upd).eq("id", case_id);
      return new Response(JSON.stringify({ ok: true, reply: directReply }), { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    // ── ACCIÓN: PEDIR ETIQUETA ──
    if (accion === "PEDIR_ETIQUETA") {
      const directReply = supervisorResult.respuesta_sugerida || "Por favor, adjunte una imagen clara y legible de la etiqueta del equipo.";
      const newMsg: HistMsg = { role: "ia", author: "Asistente Sekunet", time: new Date().toISOString(), content: directReply };
      await db.from("sek_cases").update({ histcliente: [...histcliente, newMsg] }).eq("id", case_id);
      return new Response(JSON.stringify({ ok: true, reply: directReply }), { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    // ── ACCIÓN: PEDIR ETIQUETA Y XML ──
    if (accion === "PEDIR_ETIQUETA_Y_XML") {
      const directReply = supervisorResult.respuesta_sugerida || "Como parte de los requisitos del fabricante, requerimos una imagen clara y legible de la etiqueta del equipo y el archivo XML, el cual puede obtener mediante la herramienta SAPD Tools en la opción \"Olvidé mi contraseña\", ubicada en la parte inferior derecha del software. Por favor, adjunte ambos archivos.";
      const newMsg: HistMsg = { role: "ia", author: "Asistente Sekunet", time: new Date().toISOString(), content: directReply };
      await db.from("sek_cases").update({ histcliente: [...histcliente, newMsg] }).eq("id", case_id);
      return new Response(JSON.stringify({ ok: true, reply: directReply }), { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    // ── ACCIÓN: PEDIR DESCRIPCIÓN ──
    if (accion === "PEDIR_DESCRIPCION") {
      const directReply = supervisorResult.respuesta_sugerida || "Por favor, describa brevemente el inconveniente que presenta.";
      const newMsg: HistMsg = { role: "ia", author: "Asistente Sekunet", time: new Date().toISOString(), content: directReply };
      await db.from("sek_cases").update({ histcliente: [...histcliente, newMsg] }).eq("id", case_id);
      return new Response(JSON.stringify({ ok: true, reply: directReply }), { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    // ── ACCIÓN: ESCALAR ──
    if (accion === "ESCALAR") {
      const M02_TEXT = "Agradecemos su preferencia. En un momento será atendido por uno de nuestros agentes.";
      const newMsg: HistMsg = { role: "ia", author: "Asistente Sekunet", time: new Date().toISOString(), content: M02_TEXT };
      const upd: Record<string, unknown> = {
        histcliente: [...histcliente, newMsg],
        estado: "escalado",
        escalado_at: new Date().toISOString(),
      };
      if (marcaSupervisor || modeloSupervisor) {
        upd.title = `${temaSupervisor} — ${marcaSupervisor} ${modeloSupervisor}`.trim().substring(0, 120);
      }
      await db.from("sek_cases").update(upd).eq("id", case_id);
      return new Response(JSON.stringify({ ok: true, reply: M02_TEXT }), { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    // ── ACCIÓN: CONTINUAR (respuesta libre/contextual del supervisor) ──
    if (supervisorResult.respuesta_sugerida) {
      const directReply = supervisorResult.respuesta_sugerida;
      const newMsg: HistMsg = { role: "ia", author: "Asistente Sekunet", time: new Date().toISOString(), content: directReply };
      await db.from("sek_cases").update({ histcliente: [...histcliente, newMsg] }).eq("id", case_id);
      return new Response(JSON.stringify({ ok: true, reply: directReply }), { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    // ── PASO RESET: verificar archivos según marca (lógica de seguridad se mantiene) ──
    const MSG_RESET_PIDE_ARCHIVOS = "imagen clara y legible de la etiqueta";
    const MSG_RESET_PIDE_IMAGEN = "adjunte nuevamente una imagen clara";
    const MSG_RESET_PIDE_XML = "adjunte nuevamente el archivo XML";
    if ((lastIA?.content?.includes(MSG_RESET_PIDE_ARCHIVOS) || lastIA?.content?.includes(MSG_RESET_PIDE_IMAGEN) || lastIA?.content?.includes(MSG_RESET_PIDE_XML)) && lastUserTime > lastIATime) {
      // Buscar archivos en mensajes recientes
      const recentUserMsgs = userRealMsgs.filter(m => {
        const mTime = new Date(m.time ?? 0).getTime();
        return mTime > lastIATime - 60000;
      });
      
      const marca = marcaSupervisor || "";
      const modelo = modeloSupervisor || "";

      const tieneArchivos = recentUserMsgs.some(m => m.mediaUrl);
      if (!tieneArchivos) {
        return new Response(JSON.stringify({ ok: true, skipped: true }), { status: 200, headers: corsHeaders });
      }
      const esHikvision = /hik/i.test(marca);

      let imagenUrl: string | null = null;
      let xmlUrl: string | null = null;
      for (const m of recentUserMsgs) {
        if (m.mediaUrl) {
          const mType = (m.mediaType || "").toLowerCase();
          const mName = (m.fileName || "").toLowerCase();
          const mUrl = (m.mediaUrl || "").toLowerCase();
          console.log("[seka-widget] Archivo encontrado - type:", mType, "name:", mName, "url:", mUrl.substring(mUrl.lastIndexOf("/") + 1));
          if (mType.startsWith("image/")) {
            imagenUrl = m.mediaUrl;
          } else if (mType === "text/xml" || mType === "application/xml" || mType === "application/octet-stream" && (mName.endsWith(".xml") || mUrl.endsWith(".xml")) || mName.endsWith(".xml") || mUrl.endsWith(".xml")) {
            xmlUrl = m.mediaUrl;
          }
        }
      }

      console.log("[seka-widget] Archivos recibidos - imagen:", !!imagenUrl, "XML:", !!xmlUrl, "esHikvision:", esHikvision);

      // Para Hikvision: requiere ambos archivos
      if (esHikvision && temaSupervisor === "Reset") {
        if (!imagenUrl && !xmlUrl) {
          const retry = "Por favor, adjunte la imagen de la etiqueta del equipo y el archivo XML.";
          const newMsg: HistMsg = { role: "ia", author: "Asistente Sekunet", time: new Date().toISOString(), content: retry };
          await db.from("sek_cases").update({ histcliente: [...histcliente, newMsg] }).eq("id", case_id);
          return new Response(JSON.stringify({ ok: true, reply: retry }), { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });
        }
        if (!imagenUrl) {
          const retry = "Por favor, adjunte una imagen clara y legible de la etiqueta del equipo.";
          const newMsg: HistMsg = { role: "ia", author: "Asistente Sekunet", time: new Date().toISOString(), content: retry };
          await db.from("sek_cases").update({ histcliente: [...histcliente, newMsg] }).eq("id", case_id);
          return new Response(JSON.stringify({ ok: true, reply: retry }), { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });
        }
        if (!xmlUrl) {
          const retry = "Por favor, adjunte el archivo XML obtenido con SAPD Tools.";
          const newMsg: HistMsg = { role: "ia", author: "Asistente Sekunet", time: new Date().toISOString(), content: retry };
          await db.from("sek_cases").update({ histcliente: [...histcliente, newMsg] }).eq("id", case_id);
          return new Response(JSON.stringify({ ok: true, reply: retry }), { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });
        }
      } else {
        if (!imagenUrl) {
          const retry = "Por favor, adjunte una imagen clara y legible de la etiqueta del equipo.";
          const newMsg: HistMsg = { role: "ia", author: "Asistente Sekunet", time: new Date().toISOString(), content: retry };
          await db.from("sek_cases").update({ histcliente: [...histcliente, newMsg] }).eq("id", case_id);
          return new Response(JSON.stringify({ ok: true, reply: retry }), { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });
        }
      }

      // Verificar archivos
      let imagenOk = false;
      let xmlOk = false;
      let motivoImagen = "";
      let motivoXml = "";

      if (esHikvision && temaSupervisor === "Reset") {
        let snImagen = "";
        let imagenLegible = false;
        try {
          const visionMessages: NimMessage[] = [
            {
              role: "system",
              content: `Eres un extractor de datos de etiquetas de equipos Hikvision. Responde SOLO con una línea JSON: {"sn": "serial_number", "legible": true/false, "razon": "motivo breve"}.
- sn: el número de serie (Serial No. o S/N) exacto como aparece en la etiqueta. En equipos Hikvision suele estar después de "Serial No.:" y es un código alfanumérico (ejemplo: F26114205). NO es el modelo (DS-xxxx).
- legible: la etiqueta es visible y el S/N es legible.
No agregues nada más.`,
            },
            {
              role: "user",
              content: [
                { type: "text", text: "Extrae el número de serie (S/N) de esta etiqueta de equipo." },
                { type: "image_url", image_url: { url: imagenUrl } },
              ],
            },
          ];
          const visionRaw = await callAIWithFallbacks(visionMessages);
          const jsonMatch = visionRaw.match(/\{[\s\S]*\}/);
          if (jsonMatch) {
            const result = JSON.parse(jsonMatch[0]);
            snImagen = result.sn || "";
            imagenLegible = result.legible || false;
            if (!imagenLegible) motivoImagen = result.razon || "no es posible visualizar claramente el número de serie";
          }
        } catch (e: any) {
          console.error("[seka-widget] Vision error:", e.message);
          motivoImagen = "no fue posible analizar la imagen";
        }

        let snXml = "";
        let xmlValido = false;
        try {
          const xmlResponse = await fetch(xmlUrl!);
          const xmlText = await xmlResponse.text();
          console.log("[seka-widget] XML content (first 500):", xmlText.substring(0, 500));
          const snPatterns = [
            /<serialNumber>([^<]+)<\/serialNumber>/i,
            /<deviceSerialNo>([^<]+)<\/deviceSerialNo>/i,
            /<SerialNumber>([^<]+)<\/SerialNumber>/i,
            /<serial[^>]*>([^<]+)<\/serial[^>]*>/i,
            /<machineSN>([^<]+)<\/machineSN>/i,
            /<sn>([^<]+)<\/sn>/i,
            /serialNumber["\s:=]+["']?([A-Z0-9]+)/i,
            /serial[_\-]?no["\s:=]+["']?([A-Z0-9]+)/i,
          ];
          for (const pat of snPatterns) {
            const match = xmlText.match(pat);
            if (match && match[1]) {
              snXml = match[1].trim();
              xmlValido = true;
              break;
            }
          }
          if (!snXml) {
            const xmlMessages: NimMessage[] = [
              { role: "system", content: `Extrae el número de serie del siguiente XML. Responde SOLO con el S/N, nada más. Si no hay S/N, responde "NONE".` },
              { role: "user", content: xmlText.substring(0, 4000) },
            ];
            const xmlRaw = await callAIWithFallbacks(xmlMessages);
            const cleaned = xmlRaw.trim().replace(/["`]/g, "");
            if (cleaned && cleaned !== "NONE" && cleaned.length > 3 && cleaned.length < 50) {
              snXml = cleaned;
              xmlValido = true;
            } else {
              motivoXml = "no se encontró un número de serie válido en el archivo XML";
            }
          }
        } catch (e: any) {
          console.error("[seka-widget] XML error:", e.message);
          motivoXml = "no fue posible leer el archivo XML";
        }

        imagenOk = imagenLegible && snImagen.length > 0;
        xmlOk = xmlValido && snXml.length > 0;
        
        let snCoinciden = false;
        if (imagenOk && xmlOk) {
          const normalizeSn = (sn: string) => sn.replace(/[\s\-_\.]/g, "").toUpperCase();
          const nImg = normalizeSn(snImagen);
          const nXml = normalizeSn(snXml);
          snCoinciden = nImg === nXml || nImg.includes(nXml) || nXml.includes(nImg);
          if (!snCoinciden && nImg.length >= 6 && nXml.length >= 6) {
            for (let len = Math.min(nImg.length, nXml.length); len >= 6; len--) {
              for (let i = 0; i <= nImg.length - len; i++) {
                if (nXml.includes(nImg.substring(i, i + len))) { snCoinciden = true; break; }
              }
              if (snCoinciden) break;
            }
          }
          if (!snCoinciden) {
            motivoImagen = `el número de serie de la imagen (${snImagen}) no coincide con el del XML (${snXml})`;
            motivoXml = `el número de serie del XML (${snXml}) no coincide con el de la imagen (${snImagen})`;
          }
        }

        if (imagenOk && xmlOk && snCoinciden) {
          const M02_TEXT = "Agradecemos su preferencia. En un momento será atendido por uno de nuestros agentes.";
          const newMsg: HistMsg = { role: "ia", author: "Asistente Sekunet", time: new Date().toISOString(), content: M02_TEXT };
          await db.from("sek_cases").update({
            histcliente: [...histcliente, newMsg],
            estado: "escalado",
            escalado_at: new Date().toISOString(),
            title: `${temaSupervisor} — ${marca} ${modelo}`.substring(0, 120),
            tags: [temaSupervisor === "Desvinculación" ? "desvinculacion" : "reset"],
          }).eq("id", case_id);
          return new Response(JSON.stringify({ ok: true, reply: M02_TEXT }), { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });
        }

        if (imagenOk && xmlOk && !snCoinciden) {
          imagenOk = false;
          xmlOk = false;
          motivoImagen = "el número de serie de la imagen no coincide con el del archivo XML";
          motivoXml = "el número de serie del XML no coincide con el de la imagen";
        }
      } else {
        try {
          const visionMessages: NimMessage[] = [
            {
              role: "system",
              content: `Eres un verificador de imágenes de soporte técnico. Responde SOLO con una línea JSON: {"legible": true/false, "coincide": true/false, "razon": "motivo breve"}.
- legible: la etiqueta del equipo es visible y sus datos son legibles.
- coincide: la marca "${marca}" y el modelo "${modelo}" coinciden con lo que aparece en la etiqueta de la imagen.
No agregues nada más.`,
            },
            {
              role: "user",
              content: [
                { type: "text", text: "Analiza esta imagen de la etiqueta del equipo." },
                { type: "image_url", image_url: { url: imagenUrl } },
              ],
            },
          ];
          const visionRaw = await callAIWithFallbacks(visionMessages);
          const jsonMatch = visionRaw.match(/\{[\s\S]*\}/);
          if (jsonMatch) {
            const result = JSON.parse(jsonMatch[0]);
            imagenOk = result.legible && result.coincide;
            if (!imagenOk) motivoImagen = !result.legible ? "no es posible visualizar claramente la etiqueta" : `la imagen no corresponde al equipo ${marca} ${modelo} indicado`;
          }
        } catch (e: any) {
          console.error("[seka-widget] Vision error:", e.message);
          motivoImagen = "no fue posible analizar la imagen";
        }

        if (imagenOk) {
          const M02_TEXT = "Agradecemos su preferencia. En un momento será atendido por uno de nuestros agentes.";
          const newMsg: HistMsg = { role: "ia", author: "Asistente Sekunet", time: new Date().toISOString(), content: M02_TEXT };
          await db.from("sek_cases").update({
            histcliente: [...histcliente, newMsg],
            estado: "escalado",
            escalado_at: new Date().toISOString(),
            title: `${temaSupervisor} — ${marca} ${modelo}`.substring(0, 120),
            tags: [temaSupervisor === "Desvinculación" ? "desvinculacion" : "reset"],
          }).eq("id", case_id);
          return new Response(JSON.stringify({ ok: true, reply: M02_TEXT }), { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });
        }
      }

      // Reintentos
      const yaReintentoImagen = iaRealMsgs.some(m => m.content?.includes(MSG_RESET_PIDE_IMAGEN));
      const yaReintentoXML = iaRealMsgs.some(m => m.content?.includes(MSG_RESET_PIDE_XML));

      if (esHikvision && temaSupervisor === "Reset") {
        if (!imagenOk && !xmlOk) {
          if (yaReintentoImagen && yaReintentoXML) {
            const M02_TEXT = "Agradecemos su preferencia. En un momento será atendido por uno de nuestros agentes.";
            const newMsg: HistMsg = { role: "ia", author: "Asistente Sekunet", time: new Date().toISOString(), content: M02_TEXT };
            await db.from("sek_cases").update({
              histcliente: [...histcliente, newMsg], estado: "escalado", escalado_at: new Date().toISOString(),
              title: `${temaSupervisor} — ${marca} ${modelo} — verificación pendiente`.substring(0, 120),
              tags: ["reset", "verificacion_pendiente"],
            }).eq("id", case_id);
            return new Response(JSON.stringify({ ok: true, reply: M02_TEXT }), { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });
          }
          const retry = `Le informamos que ${motivoImagen} y ${motivoXml}. Por favor, adjunte nuevamente ambos archivos.`;
          const newMsg: HistMsg = { role: "ia", author: "Asistente Sekunet", time: new Date().toISOString(), content: retry };
          await db.from("sek_cases").update({ histcliente: [...histcliente, newMsg] }).eq("id", case_id);
          return new Response(JSON.stringify({ ok: true, reply: retry }), { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });
        }
        if (!imagenOk) {
          if (yaReintentoImagen) {
            const M02_TEXT = "Agradecemos su preferencia. En un momento será atendido por uno de nuestros agentes.";
            const newMsg: HistMsg = { role: "ia", author: "Asistente Sekunet", time: new Date().toISOString(), content: M02_TEXT };
            await db.from("sek_cases").update({
              histcliente: [...histcliente, newMsg], estado: "escalado", escalado_at: new Date().toISOString(),
              title: `${temaSupervisor} — ${marca} ${modelo} — imagen pendiente`.substring(0, 120),
              tags: ["reset", "imagen_pendiente"],
            }).eq("id", case_id);
            return new Response(JSON.stringify({ ok: true, reply: M02_TEXT }), { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });
          }
          const retry = `Le informamos que ${motivoImagen}. Por favor, adjunte nuevamente una imagen clara de la etiqueta del equipo.`;
          const newMsg: HistMsg = { role: "ia", author: "Asistente Sekunet", time: new Date().toISOString(), content: retry };
          await db.from("sek_cases").update({ histcliente: [...histcliente, newMsg] }).eq("id", case_id);
          return new Response(JSON.stringify({ ok: true, reply: retry }), { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });
        }
        if (!xmlOk) {
          if (yaReintentoXML) {
            const M02_TEXT = "Agradecemos su preferencia. En un momento será atendido por uno de nuestros agentes.";
            const newMsg: HistMsg = { role: "ia", author: "Asistente Sekunet", time: new Date().toISOString(), content: M02_TEXT };
            await db.from("sek_cases").update({
              histcliente: [...histcliente, newMsg], estado: "escalado", escalado_at: new Date().toISOString(),
              title: `${temaSupervisor} — ${marca} ${modelo} — XML pendiente`.substring(0, 120),
              tags: ["reset", "xml_pendiente"],
            }).eq("id", case_id);
            return new Response(JSON.stringify({ ok: true, reply: M02_TEXT }), { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });
          }
          const retry = `Le informamos que ${motivoXml}. Por favor, adjunte nuevamente el archivo XML.`;
          const newMsg: HistMsg = { role: "ia", author: "Asistente Sekunet", time: new Date().toISOString(), content: retry };
          await db.from("sek_cases").update({ histcliente: [...histcliente, newMsg] }).eq("id", case_id);
          return new Response(JSON.stringify({ ok: true, reply: retry }), { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });
        }
      } else {
        if (!imagenOk) {
          if (yaReintentoImagen) {
            const M02_TEXT = "Agradecemos su preferencia. En un momento será atendido por uno de nuestros agentes.";
            const newMsg: HistMsg = { role: "ia", author: "Asistente Sekunet", time: new Date().toISOString(), content: M02_TEXT };
            await db.from("sek_cases").update({
              histcliente: [...histcliente, newMsg], estado: "escalado", escalado_at: new Date().toISOString(),
              title: `${temaSupervisor} — ${marca} ${modelo} — imagen pendiente`.substring(0, 120),
              tags: [temaSupervisor === "Desvinculación" ? "desvinculacion" : "reset", "imagen_pendiente"],
            }).eq("id", case_id);
            return new Response(JSON.stringify({ ok: true, reply: M02_TEXT }), { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });
          }
          const retry = `Le informamos que ${motivoImagen}. Por favor, adjunte nuevamente una imagen clara de la etiqueta del equipo.`;
          const newMsg: HistMsg = { role: "ia", author: "Asistente Sekunet", time: new Date().toISOString(), content: retry };
          await db.from("sek_cases").update({ histcliente: [...histcliente, newMsg] }).eq("id", case_id);
          return new Response(JSON.stringify({ ok: true, reply: retry }), { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });
        }
      }
    }

    // Construir mensajes y llamar a Llama
    const messages = buildMessages(histcliente, null);
    let rawReply = await callAIWithFallbacks(messages);
    console.log("[seka-widget] Raw reply:", rawReply);

    // Si Llama emitió [BUSCAR_INVENTARIO], resolver y rellamar con resultado como system message
    if (/\[BUSCAR_INVENTARIO:/i.test(rawReply)) {
      const invMatch = rawReply.match(/\[BUSCAR_INVENTARIO:\s*([^\]]+)\]/i);
      if (invMatch) {
        const inv = await buscarInventario(invMatch[1].trim());
        const invResult = inv.encontrado
          ? `[RESULTADO_INVENTARIO] El equipo "${invMatch[1].trim()}" SÍ está en la cartera de Sekunet. ${inv.detalle}. ACCIÓN: escriba al cliente exactamente esto: "Por favor, describa brevemente el inconveniente que presenta."`
          : `[RESULTADO_INVENTARIO] El equipo "${invMatch[1].trim()}" NO está en la cartera de Sekunet. ACCIÓN: escriba al cliente exactamente esto: "El dispositivo indicado no forma parte de los equipos distribuidos por Sekunet, por lo que lamentablemente no podemos brindarle el soporte requerido. ¿Tiene alguna otra consulta relacionada con nuestros productos?"`;

        // Agregar resultado como mensaje system y rellamar
        const messages2 = [...messages, { role: "system" as const, content: invResult }];
        rawReply = await callAIWithFallbacks(messages2);
        console.log("[seka-widget] Reply tras inventario:", rawReply);
      }
    }

    // Reemplazar etiquetas de mensaje por su texto exacto
    const M02 = "Agradecemos su preferencia. En un momento será atendido por uno de nuestros agentes.";
    const M03 = "Ha sido un gusto atenderle. Si tiene alguna otra consulta, no dude en contactarnos nuevamente. ¡Que tenga un excelente día!";
    const M04 = "Esta consulta corresponde al departamento de ventas. Le invitamos a contactarlos al +506 2290 5585, vía WhatsApp al +506 8757 5820 o al correo info@sekunet.com. Ha sido un gusto atenderle. ¡Que tenga un excelente día!";
    rawReply = rawReply
      .replace(/\bM02\b/g, M02)
      .replace(/\bM03\b/g, M03)
      .replace(/\bM04\b/g, M04);

    // Procesar otros tags (ESCALAR_N2, CERRAR) y limpiar texto
    let cleanReply = await processTags(rawReply, case_id);

    // Limpiar contexto interno si quedó en el texto
    cleanReply = cleanReply.replace(/__INV__.*?__INV__/gs, "").trim();

    if (!cleanReply) {
      return new Response(JSON.stringify({ ok: true, skipped: true }), { status: 200, headers: corsHeaders });
    }

    // Guardar respuesta en histcliente
    const newMsg: HistMsg = {
      role: "ia",
      author: "Asistente Sekunet",
      time: new Date().toISOString(),
      content: cleanReply,
    };

    const updatedHist = [...histcliente, newMsg];
    await db.from("sek_cases").update({ histcliente: updatedHist }).eq("id", case_id);

    return new Response(JSON.stringify({ ok: true, reply: cleanReply }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });

  } catch (e: any) {
    console.error("[seka-widget] ERROR CRITICO:", e.message);
    
    // Paracaídas de Emergencia (Panic Fallback)
    if (globalCaseId) {
      try {
        const M02_PANIC = "En este momento nuestros sistemas automatizados están experimentando intermitencias. Su chat ha sido transferido y en un momento será atendido por uno de nuestros agentes.";
        const newMsg: HistMsg = {
          role: "ia",
          author: "Asistente Sekunet (Emergencia)",
          time: new Date().toISOString(),
          content: M02_PANIC,
        };
        const updatedHist = [...globalHistCliente, newMsg];
        await db.from("sek_cases").update({
          histcliente: updatedHist,
          estado: "escalado",
          escalado_at: new Date().toISOString(),
          n2_reason: "Falla crítica de IA (Panic Fallback)",
        }).eq("id", globalCaseId);
        
        console.warn(`[seka-widget] Paracaídas activado para el caso ${globalCaseId}`);
        // Retornamos 200 con el mensaje de pánico para que no se quede colgado
        return new Response(JSON.stringify({ ok: true, reply: M02_PANIC }), {
          status: 200,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      } catch (panicError: any) {
        console.error("[seka-widget] Falla en el paracaídas de emergencia:", panicError.message);
      }
    }
    
    return new Response(JSON.stringify({ error: e.message }), { status: 500, headers: corsHeaders });
  }
});
