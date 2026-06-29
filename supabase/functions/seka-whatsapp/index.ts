import { createClient } from "npm:@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SERVICE_KEY  = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
const NVIDIA_KEY   = Deno.env.get("NVIDIA_API_KEY") ?? "";
const GEMINI_KEY   = Deno.env.get("GEMINI_API_KEY") ?? "";
const OPENROUTER_KEY = Deno.env.get("OPENROUTER_API_KEY") ?? "";
const NIM_BASE     = "https://integrate.api.nvidia.com/v1";

const db = createClient(SUPABASE_URL, SERVICE_KEY);

// ─── SYSTEM PROMPT ────────────────────────────────────────────────────────────
const SYSTEM_PROMPT = `Usted es el Asistente de Soporte de Sekunet (Costa Rica), la primera línea de atención al cliente.
Su misión es ofrecer una experiencia de clase mundial: cálida, eficiente y profesional, mientras recopila la información necesaria para que un agente humano resuelva el caso sin tener que volver a preguntar.

════════════════════════════════════════════
IDENTIDAD Y TONO
════════════════════════════════════════════
- Trate siempre de "usted". Sin emojis. Tono cortés, humano y seguro, nunca robótico.
- Máximo 2 oraciones por mensaje. Una sola pregunta o instrucción por mensaje. Espere respuesta antes de continuar.
- Nunca mencione que es una IA, un bot o un asistente virtual. No se presente: el cliente ya fue saludado.
- ACUSE DE RECIBO: antes de cada nueva pregunta, reconozca brevemente lo que el cliente acaba de aportar ("Perfecto, ya registré la marca." / "Gracias, tomo nota."). Esto hace la conversación natural; no es una pregunta adicional.
- EMPATÍA: si el cliente expresa molestia, urgencia o frustración, valídelo en una frase ("Lamento el inconveniente, le ayudo de inmediato.") antes de continuar.
- IDIOMA: responda en el mismo idioma en que escribe el cliente (español o inglés). Si escribe en inglés, traduzca naturalmente sus respuestas y los mensajes guía.
- EXPECTATIVAS: cuando escale, deje claro qué sigue ("Un agente continuará su caso en breve.").
- PROGRESO SIN REPETIR: nunca vuelva a pedir un dato ya proporcionado. Si el cliente ya dio varios datos juntos, agradézcalos y avance al siguiente faltante.

════════════════════════════════════════════
FLUJO OBLIGATORIO — SIGA ESTE ORDEN EXACTO
════════════════════════════════════════════

PASO 0 — BIENVENIDA YA ENVIADA
El cliente ya recibió el saludo y se le solicitó su nombre, correo y cuenta. NO vuelva a saludar.

PASO 1 — SOLICITAR TEMA DE CONSULTA
Pida el tema de la consulta de forma cordial. Temas disponibles: Configuraciones, Reset, Desvinculación, Firmware, Software, Drivers, Licencias, Otro.

PASO 2 — SOLICITAR MARCA
Pida la marca del equipo, reconociendo primero el tema elegido.
Excepción: Si el cliente eligió el tema "Otro", SALTE el Paso 1 y 2, y pase directo a pedir la descripción de su consulta.

PASO 3 — SOLICITAR MODELO
Pida el modelo del equipo, agradeciendo la marca.

PASO 4 — VALIDAR EN INVENTARIO
Antes de emitir el tag, normalice la marca y el modelo:
- Corrija errores tipográficos obvios (ej. "Hikvission" → "Hikvision")
- Elimine prefijos redundantes del modelo solo si son evidentemente parte de la marca
- Reemplace la letra O por el número 0 cuando sea parte de un código alfanumérico
- Use solo la raíz del modelo sin sufijos ambiguos si el modelo completo no coincide

Luego emita: [BUSCAR_INVENTARIO: marca modelo_normalizado]
El sistema verificará si está en la cartera de Sekunet.

Si NO está en cartera → diga exactamente:
"El dispositivo indicado no forma parte de los equipos distribuidos por Sekunet, por lo que lamentablemente no podemos brindarle el soporte requerido. ¿Tiene alguna otra consulta relacionada con nuestros productos?"
  → Si el cliente dice Sí → NO pida marca ni modelo, pida directamente la descripción de su nueva consulta (accion: "PEDIR_DESCRIPCION")
  → Si el cliente dice No → diga M03 y emita [CERRAR]

Si SÍ está en cartera → CONFIRME EL CASO en una frase breve (recap: tema + equipo) y luego diga M02 y emita [ESCALAR_N2].

════════════════════════════════════════════
MENSAJES EXACTOS — NO LOS MODIFIQUE
════════════════════════════════════════════
(Puede anteceder un acuse de recibo o un recap breve, pero el texto de M02/M03 debe aparecer íntegro y sin alteración.)

M02:
"Agradecemos su preferencia. En un momento será atendido por uno de nuestros agentes."

M03:
"Ha sido un gusto atenderle. Si tiene alguna otra consulta, no dude en contactarnos nuevamente. ¡Que tenga un excelente día!"

════════════════════════════════════════════
REGLAS ABSOLUTAS
════════════════════════════════════════════
- Si el cliente pide hablar con una persona en cualquier momento → diga M02 y emita [ESCALAR_N2: solicitud del cliente]. Inmediatamente, sin preguntar nada más.
- Si el cliente muestra enojo o frustración evidente → valide en una frase, diga M02 y emita [ESCALAR_N2: cliente requiere atención prioritaria]. No insista en recopilar datos.
- No diagnostique ni dé pasos técnicos ni soluciones. Su único rol es recopilar datos, confirmar y escalar.
- Si el cliente se despide → diga M03 y emita [CERRAR]
- Si el cliente pregunta por VENTAS, precios, cotizaciones, compras, stock o garantías → emita la acción VENTAS. NO pida marca ni modelo.
- Nunca haga dos preguntas en un mismo mensaje.
- Nunca invente información ni asuma datos que el cliente no escribió explícitamente.
- Respete el orden de los pasos. No salte ninguno.
- Siempre que escale, garantice al cliente que no tendrá que repetir la información ya brindada.`;

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
    body: JSON.stringify({ model, messages, temperature: 0.2, max_tokens: 1024, stream: false, response_format: { type: "json_object" } }),
    signal: AbortSignal.timeout(25000)
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
    body: JSON.stringify({ model, messages, temperature: 0.2, max_tokens: 1024, stream: false, response_format: { type: "json_object" } }),
    signal: AbortSignal.timeout(25000)
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
  const body: any = { contents, generationConfig: { temperature: 0.2, maxOutputTokens: 1024, responseMimeType: "application/json" } };
  if (system) body.systemInstruction = { parts: [{ text: system.content as string }] };
  
  const res = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${GEMINI_KEY}`,
    { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body), signal: AbortSignal.timeout(25000) }
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

// ─── VALIDAR SOLO MARCA ────────────────────────────────────────────────────────
async function validarMarcaSolo(marca: string): Promise<{ encontrado: boolean }> {
  if (!marca) return { encontrado: false };
  try {
    const { data } = await db
      .from("sek_inventario")
      .select("marca")
      .ilike("marca", `%${marca.trim()}%`)
      .limit(1);
    return { encontrado: (data && data.length > 0) ? true : false };
  } catch (e) {
    console.error("[seka-whatsapp] Error validando marca:", e);
    return { encontrado: false }; // En caso de error, dejamos pasar o no? Mejor no, digamos false para estar seguros? No, si la DB falla, es mejor no mentir.
  }
}

// ─── BUSCAR EN INVENTARIO ─────────────────────────────────────────────────────
async function buscarInventario(query: string): Promise<{ encontrado: boolean; detalle: string }> {
  try {
    const tokens = query.trim().split(/\s+/).filter((t: string) => t.length >= 2);
    if (tokens.length === 0) return { encontrado: false, detalle: "Consulta vacía." };

    let brandToken = tokens[0];
    let modelTokens = tokens.slice(1);

    // Caso 1: Solo hay un token (solo dio la marca o solo dio el modelo)
    if (modelTokens.length === 0) {
      const { data: singleRows } = await db
        .from("sek_inventario")
        .select("id,codigo,nombre,marca,modelo,categoria")
        .or(`marca.ilike.%${brandToken}%,modelo.ilike.%${brandToken}%,nombre.ilike.%${brandToken}%`)
        .limit(10);
      
      if (!singleRows || singleRows.length === 0) {
        return { encontrado: false, detalle: `El equipo "${brandToken}" no está en la cartera de Sekunet.` };
      }
      return { 
        encontrado: true, 
        detalle: `Equipo en cartera: ${singleRows[0].marca} ${singleRows[0].modelo || ""}` 
      };
    }

    // Caso 2: Marca y Modelo. El modelo puede tener guiones o espacios.
    // Ej: query = "Hikvision DS-7104HGHI-F1"
    const rawModel = modelTokens.join(""); // "DS-7104HGHI-F1"
    const cleanedModelTokens = rawModel.split(/[-_]+/).filter(x => x.length >= 2);
    const fuzzyModel = `%${cleanedModelTokens.join("%")}%`; // "%DS%7104HGHI%F1%"

    // Intentar buscar combinando la marca y el modelo difuso
    const { data: brandModelRows } = await db
      .from("sek_inventario")
      .select("id,codigo,nombre,marca,modelo,categoria")
      .ilike("marca", `%${brandToken}%`)
      .or(`modelo.ilike.${fuzzyModel},nombre.ilike.${fuzzyModel}`)
      .limit(10);

    if (brandModelRows && brandModelRows.length > 0) {
      const best = brandModelRows[0];
      return {
        encontrado: true,
        detalle: `Equipo en cartera: ${best.marca} ${best.modelo}${best.nombre ? " — " + best.nombre : ""}`,
      };
    }

    // Caso 3: Fallback. Quizás el usuario dio el modelo primero, o la marca no coincide exactamente.
    // Busquemos puramente por el modelo difuso.
    const { data: modelOnlyRows } = await db
      .from("sek_inventario")
      .select("id,codigo,nombre,marca,modelo,categoria")
      .or(`modelo.ilike.${fuzzyModel},nombre.ilike.${fuzzyModel}`)
      .limit(10);

    if (modelOnlyRows && modelOnlyRows.length > 0) {
      const best = modelOnlyRows[0];
      return {
        encontrado: true,
        detalle: `Equipo en cartera: ${best.marca} ${best.modelo}${best.nombre ? " — " + best.nombre : ""}`,
      };
    }

    // Caso 4: Último recurso, buscar el token más largo como si fuera el modelo (ignorar marca)
    const longestToken = [...tokens].sort((a, b) => b.length - a.length)[0];
    if (longestToken.length > 4) {
      const { data: longestRows } = await db
        .from("sek_inventario")
        .select("id,codigo,nombre,marca,modelo,categoria")
        .or(`modelo.ilike.%${longestToken}%,nombre.ilike.%${longestToken}%`)
        .limit(10);
      
      if (longestRows && longestRows.length > 0) {
        const best = longestRows[0];
        return {
          encontrado: true,
          detalle: `Equipo en cartera: ${best.marca} ${best.modelo}${best.nombre ? " — " + best.nombre : ""}`,
        };
      }
    }

    return { encontrado: false, detalle: `El modelo no se encontró en la cartera de Sekunet para la búsqueda "${query}".` };
  } catch (e: any) {
    console.error("[seka-whatsapp] Error inventario:", e.message);
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
  "Soy el Asistente Virtual de Sekunet. Para brindarle una mejor asistencia, necesitamos algunos datos para registrar su consulta.",
  "Por favor, compártanos la siguiente información:\n• Nombre completo\n• Correo electrónico\n• Nombre de la cuenta afiliada a Sekunet",
  "¿En relación con qué tema sería su consulta?",
  `¿En relación con qué tema sería su consulta?\n\n1. Configuraciones\n2. Reset\n3. Desvinculación\n4. Firmware\n5. Software\n6. Drivers\n7. Licencias\n8. Otro\n\nResponda con el número o el nombre del tema.`
];

const TOPICS = ["Configuraciones","Reset","Desvinculación","Firmware","Software","Drivers","Licencias","Otro"];

// Mapa de respuesta numérica → tema (para el menú de texto)
const TOPIC_NUMBER_MAP: Record<string, string> = {
  "1": "Configuraciones",
  "2": "Reset",
  "3": "Desvinculación",
  "4": "Firmware",
  "5": "Software",
  "6": "Drivers",
  "7": "Licencias",
  "8": "Otro",
};

// Normaliza respuesta del usuario al nombre oficial del tema (acepta número o texto parcial)
function resolveTopicFromText(input: string): string | null {
  const trimmed = input.trim();
  // Respuesta numérica directa
  if (TOPIC_NUMBER_MAP[trimmed]) return TOPIC_NUMBER_MAP[trimmed];
  // Respuesta de texto exacta (case-insensitive)
  const lower = trimmed.toLowerCase();
  for (const t of TOPICS) {
    if (t.toLowerCase() === lower) return t;
  }
  // Coincidencia parcial
  for (const t of TOPICS) {
    if (lower.includes(t.toLowerCase()) || t.toLowerCase().includes(lower)) return t;
  }
  return null;
}

// ─── CONSTRUIR MENSAJES PARA LLAMA ───────────────────────────────────────────
function buildMessages(hist: HistMsg[], invContext: string | null): NimMessage[] {
  // Filtrar mensajes de bienvenida — Llama no debe verlos
  const filtered = hist.filter(m => !WELCOME_TEXTS.includes(m.content?.trim() ?? ""));

  // Detectar el tema seleccionado (acepta número o texto exacto/parcial)
  const temaMsg = hist.find(m => m.role === "user" && resolveTopicFromText(m.content?.trim() ?? "") !== null);
  const tema = temaMsg ? resolveTopicFromText(temaMsg.content?.trim() ?? "") : null;

  // Construir system prompt con el tema inyectado
  let systemWithTema = SYSTEM_PROMPT.replace("{{TEMA}}", tema || "ninguno");
  if (tema) {
    systemWithTema += `\n\nEl cliente seleccionó el tema: ${tema}. Inicie el flujo correspondiente.`;
  }

  const messages: NimMessage[] = [{ role: "system", content: systemWithTema }];

  for (const m of filtered) {
    if (m.role === "user" || m.role === "assistant" || m.role === "ia") {
      // Saltar si es el mensaje de selección de tema (ya está en el system prompt)
      if (m.role === "user" && resolveTopicFromText(m.content?.trim() ?? "") !== null) continue;

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
    if (tema) {
      messages.push({ role: "user", content: `El cliente seleccionó el tema: ${tema}. Por favor inicie el flujo.` });
    } else {
      messages.push({ role: "user", content: `El cliente inició el chat. Por favor inicie el flujo pidiendo los datos requeridos.` });
    }
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
  let globalHistTecnico: HistMsg[] = [];

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
      console.error("[seka-whatsapp] Caso no encontrado:", case_id);
      return new Response(JSON.stringify({ error: "caso_no_encontrado" }), { status: 404, headers: corsHeaders });
    }

    const estado = String(caso.estado || "").toLowerCase();
    if (estado === "cerrado" || estado === "resuelto" || estado === "escalado") {
      console.log("[seka-whatsapp] Caso ya no activo:", estado);
      return new Response(JSON.stringify({ ok: true, skipped: true }), { status: 200, headers: corsHeaders });
    }

    const histcliente: HistMsg[] = Array.isArray(caso.histcliente) ? caso.histcliente : [];
    const histtecnico: HistMsg[] = Array.isArray(caso.histtecnico) ? caso.histtecnico : [];
    globalHistTecnico = histtecnico;

    // Combinar todos los mensajes ordenados por tiempo para saber en qué paso estamos
    const allMsgs = [...histcliente, ...histtecnico].sort((a, b) =>
      new Date(a.time || 0).getTime() - new Date(b.time || 0).getTime()
    );

    // Filtrar mensajes reales (sin bienvenidas ni cierres automáticos)
    const WELCOME_TEXTS_CHECK = [
      "Reciba un cordial saludo de parte del equipo de Soporte Sekunet. Gracias por contactarnos.",
      "Soy el Asistente Virtual de Sekunet. Para brindarle una mejor asistencia, necesitamos algunos datos para registrar su consulta.",
      "Por favor, compártanos la siguiente información:\n• Nombre completo\n• Correo electrónico\n• Nombre de la cuenta afiliada a Sekunet",
      "¿En relación con qué tema sería su consulta?",
      `¿En relación con qué tema sería su consulta?\n\n1. Configuraciones\n2. Reset\n3. Desvinculación\n4. Firmware\n5. Software\n6. Drivers\n7. Licencias\n8. Otro\n\nResponda con el número o el nombre del tema.`
    ];
    const CRON_CLOSE_TEXT = "Al no haber recibido respuesta, procederemos a cerrar esta conversación. Si necesita asistencia adicional, puede contactarnos nuevamente y con gusto le atenderemos. ¡Que tenga un excelente día!";
    const TOPICS_CHECK = ["Configuraciones","Reset","Desvinculación","Firmware","Software","Drivers","Licencias","Otro"];
    // El mensaje del menú de tema ahora tiene múltiples líneas — incluirlo en textos a ignorar
    const MENU_TEMA_PREFIX = "¿En relación con qué tema sería su consulta?";
    const MENU_TEXTO = `¿En relación con qué tema sería su consulta?\n\n1. Configuraciones\n2. Reset\n3. Desvinculación\n4. Firmware\n5. Software\n6. Drivers\n7. Licencias\n8. Otro\n\nResponda con el número o el nombre del tema.`;

    // Mensajes del usuario (sin bienvenidas)
    const userRealMsgs = histcliente.filter(m =>
      m.role === "user" && !WELCOME_TEXTS_CHECK.includes(m.content?.trim() ?? "")
    );

    // Respuestas de la IA (excluyendo SOLO cierres automáticos del cron — las bienvenidas SÍ cuentan)
    const iaMsgs = allMsgs.filter(m =>
      m.role === "ia" || m.role === "assistant" || m.role === "tecnico"
    );
    const iaRealMsgs = iaMsgs.filter(m =>
      m.content?.trim() !== CRON_CLOSE_TEXT
    );

    // Contar mensajes para flujo paso a paso
    const userCount = userRealMsgs.length;
    const iaCount   = iaRealMsgs.length;

    const lastIA    = iaRealMsgs[iaRealMsgs.length - 1];
    const lastUserMsg = userRealMsgs[userRealMsgs.length - 1];
    const lastUserMsgContent = lastUserMsg?.content || "";
    const lastIATime  = lastIA?.time ? new Date(lastIA.time).getTime() : 0;
    const lastUserTime = lastUserMsg?.time ? new Date(lastUserMsg.time).getTime() : 0;

    // Detectar tema — acepta número (1-8), texto exacto o parcial
    const topiIdx = userRealMsgs.findIndex(m => resolveTopicFromText(m.content?.trim() ?? "") !== null);
    let temaInferido = topiIdx >= 0 ? (resolveTopicFromText(userRealMsgs[topiIdx].content?.trim() ?? "") ?? "Consulta") : "Consulta";
    if (topiIdx < 0) {
      for (const m of userRealMsgs) {
        const lower = (m.content ?? "").toLowerCase();
        if (lower.includes("configur") || lower.includes("setup")) { temaInferido = "Configuraciones"; break; }
        if (lower.includes("reset") || lower.includes("restablecer") || lower.includes("reinici")) { temaInferido = "Reset"; break; }
        if (lower.includes("desvincul") || lower.includes("quitar") || lower.includes("eliminar")) { temaInferido = "Desvinculación"; break; }
        if (lower.includes("firmwar") || lower.includes("actualiz")) { temaInferido = "Firmware"; break; }
        if (lower.includes("softwar") || lower.includes("programa")) { temaInferido = "Software"; break; }
        if (lower.includes("driver")) { temaInferido = "Drivers"; break; }
        if (lower.includes("licen") || lower.includes("activa")) { temaInferido = "Licencias"; break; }
      }
    }
    const tema = temaInferido;

    // ═══════════════════════════════════════════════════════════════════════
    // FLUJO DE BIENVENIDA PASO A PASO (WhatsApp)
    // ═══════════════════════════════════════════════════════════════════════

    // PASO 0: Primer mensaje del usuario → saludo + presentación + pedir datos (3 mensajes separados)
    if (userCount === 1 && iaCount === 0) {
      const directReply = "Reciba un cordial saludo de parte del equipo de Soporte Sekunet. Gracias por contactarnos.";
      const msg1 = "Soy el Asistente Virtual de Sekunet. Para brindarle una mejor asistencia, necesitamos algunos datos para registrar su consulta.";
      const msg2 = "Para comenzar, ¿me podría indicar su nombre completo?";
      const newMsg0: HistMsg = { role: "ia", author: "Asistente Sekunet", time: new Date().toISOString(), content: directReply };
      const newMsg1: HistMsg = { role: "ia", author: "Asistente Sekunet", time: new Date(Date.now() + 10).toISOString(), content: msg1 };
      const newMsg2: HistMsg = { role: "ia", author: "Asistente Sekunet", time: new Date(Date.now() + 20).toISOString(), content: msg2 };
      await db.from("sek_cases").update({ histtecnico: [...histtecnico, newMsg0, newMsg1, newMsg2] }).eq("id", case_id);
      return new Response(JSON.stringify({ ok: true, reply: [directReply, msg1, msg2] }), { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    // ═══════════════════════════════════════════════════════════════════════
    // VALIDACIÓN ESTRICTA DE MENÚ REMOVIDA - EL LLM MANEJA LOS ERRORES
    // ═══════════════════════════════════════════════════════════════════════

    // ═══════════════════════════════════════════════════════════════════════
    // SUPERVISOR DE IA — Analiza cada mensaje del usuario con inteligencia
    // ═══════════════════════════════════════════════════════════════════════

    // ── Paso 1: Construir resumen de la conversación para el Supervisor ──
    const conversationSummary = allMsgs.map(m => {
      const who = m.role === "user" ? "CLIENTE" : "ASISTENTE";
      const hasMedia = m.mediaUrl ? ` [ADJUNTO: ${m.mediaType || "archivo"}${m.fileName ? " — " + m.fileName : ""}]` : "";
      return `${who}: ${m.content || "(sin texto)"}${hasMedia}`;
    }).join("\n");

    const supervisorPrompt = `Eres el Supervisor Inteligente del chat de soporte de Sekunet (Costa Rica), equivalente a un sistema de triaje de atención al cliente de clase mundial. Tu trabajo es ANALIZAR la conversación completa, entender la situación e intención del cliente, y decidir con precisión qué información ya se recopiló, cuál falta y cuál es el siguiente paso óptimo.

CONVERSACIÓN COMPLETA:
${conversationSummary}

DATOS ACTUALES DEL CASO EN BASE DE DATOS:
- nombre: ${(caso.cliente as any)?.nombre || ""}
- correo: ${(caso.cliente as any)?.correo || ""}
- cuenta: ${(caso.cliente as any)?.cuenta || ""}

CONTEXTO: El asistente sigue este flujo de recopilación de datos:
1. Nombre, correo y cuenta del cliente
2. Tema de consulta (Configuraciones, Reset, Desvinculación, Firmware, Software, Drivers, Licencias, Otro)
3. Marca del equipo
4. Modelo del equipo
5. Para Reset/Desvinculación: imagen de etiqueta (y XML para Hikvision en Reset)
6. Para otros temas: descripción del problema

REGLA DE ORO / PRIORIDAD MÁXIMA:
- VENTAS Y COTIZACIONES: Si el mensaje del usuario tiene CUALQUIER intención comercial, de compra, venta, precios, stock, distribuciones o cotizaciones (incluso con errores ortográficos como "venbden", "komprar", "cuanto kuesta", o preguntas como "¿VENDEN CÁMARAS DAHUA?"), DEBES OBLIGATORIAMENTE marcar la accion como "VENTAS" inmediatamente, ignorando todas las demás reglas y pasos.

REGLAS DE ANÁLISIS:
- Si el cliente indica EXPRESAMENTE que NO TIENE cuenta o empresa (ej: "no tengo", "ninguna", "cliente final"), extrae la cuenta como "Sin cuenta". PERO si el cliente simplemente omite el dato en su respuesta (ej. da su nombre y correo pero no menciona la empresa), DEBES dejar el campo cuenta vacío ("") para que el sistema lo vuelva a pedir. NUNCA extraigas el nombre de la cuenta o empresa a partir del dominio o texto del correo electrónico. Si el usuario no escribe explícitamente el nombre de su cuenta, debes dejarlo vacío.
- REGLA DE CUENTA PERSONAL: Si el cliente indica que la cuenta está a su nombre personal o repite su nombre (ej: "está a mi nombre", "a nombre de Juan", "a título personal", "la cuenta es mía"), extrae SU NOMBRE EXACTO (ej: "Juan") como el valor de la "cuenta". Es VÁLIDO que el nombre de la cuenta sea igual al nombre del cliente (registro a título personal). NUNCA extraigas frases relativas como "a mi nombre" o "yo mismo".
- PROHIBIDO DEDUCIR LA CUENTA DEL CORREO: Si el cliente proporciona SOLO su correo y a�n no ha respondido a la pregunta de la cuenta, NO inventes la cuenta a partir del correo. Deja la cuenta vac�a. PERO si el cliente RESPONDE textualmente a la pregunta de la cuenta aportando un nombre (ej: Innoviocr), DEBES extraer ese texto EXACTO en el campo cuenta, �incluso si es id�ntico a la primera parte de su correo! Jam�s rechaces una cuenta expl�cita solo por parecerse al correo.
- PROHIBIDO ASUMIR EL TEMA: NUNCA inventes ni infieras el "tema". Si el cliente no eligió explícitamente uno de los 8 temas, deja "tema" en null y usa accion "PEDIR_TEMA". Jamás escribas frases como "su consulta sobre configuraciones" si el cliente no lo dijo.
- ORDEN OBLIGATORIO (PASO A PASO): Los datos iniciales deben pedirse UNO POR UNO.
  1. Si falta el nombre, la accion debe ser "PEDIR_NOMBRE".
  2. Si ya tienes el nombre pero falta el correo, la accion debe ser "PEDIR_CORREO".
  3. Si ya tienes nombre y correo, pero falta la cuenta, la accion debe ser "PEDIR_CUENTA".
  NUNCA pidas dos datos juntos. NO avances a pedir tema, marca ni modelo hasta tener los tres datos.
- VALIDACIÓN DE DATOS FALSOS: Debes verificar de forma intuitiva que los datos proporcionados sean reales y lógicos.
  - Nombres: Si el cliente proporciona solo un nombre sin apellido (ej: "Andrés", "Juan"), o un nombre obviamente falso, caracteres aleatorios (ej: "ryjuky", "asdf"), números, o palabras sin sentido, recházalo. ES OBLIGATORIO dejar el campo "nombre" vacío ("") y en "respuesta_sugerida" debes usar este texto exacto (sin comillas): El nombre ingresado no parece estar completo o válido. Por favor, indíquenos su nombre y al menos un apellido para registrar su caso.
  - Correos: Si el cliente indica expresamente que no tiene correo (ej: "no tengo", "ninguno"), extrae "Sin correo" y avanza al siguiente paso. Pero si proporciona un correo evidentemente falso o de prueba (ej: "1@1.com", "a@a.com", "wef@wrf.we"), recházalo. ES OBLIGATORIO dejar el campo "correo" vacío ("") y en "respuesta_sugerida" usar este texto exacto (sin comillas): El correo ingresado no tiene un formato válido. Por favor, escriba su correo electrónico real para poder contactarle.
- Si el cliente envió un código como "DS-3E0505P-E-M", "NVR-108MH", "IPC-T221H" eso es un MODELO, no una marca.
- Si el cliente envió una sola palabra, nombre corto o abreviatura (ej: "Hikvision", "Dahua", "Epcom", "ZKTeco", "hik", "dha", "zkt", "epc"), ASUME OBLIGATORIAMENTE que es una MARCA y extráelo en el campo "marca". NO dejes la marca vacía si el usuario respondió con 3 o más letras.
- Si el cliente envió marca y modelo juntos, extrae ambos. Si el cliente solo dio el modelo, NO pidas la marca. Si ya tienes modelo, la acción debe avanzar a BUSCAR_INVENTARIO o PEDIR_DESCRIPCION, nunca regreses a PEDIR_MARCA.
- Si el tema es "Otro", NO pidas marca ni modelo, pide directamente la descripción del problema (accion: "PEDIR_DESCRIPCION").
- Si el cliente ya proporcionó datos (even if he said he doesn't have them), NUNCA los pidas de nuevo.
- Si el cliente pide hablar con una persona/agente/humano, marca accion como "ESCALAR_INMEDIATO".
- REGLA DE FRUSTRACIÓN: Si el cliente muestra enojo evidente, reclamo, insultos, o lleva varios mensajes sin avanzar y se nota molesto, marca "sentimiento" como "muy_molesto" y la accion como "ESCALAR_INMEDIATO". No insistas en pedir más datos.
- Si el cliente se despide (adiós, gracias, hasta luego), marca accion como "CERRAR".
- Interpreta errores ortográficos libremente. Ej: "reced" o "rese" = "Reset", "borrar" = "Desvinculación", "fimwar" = "Firmware", "marac" = "marca", etc. Usa el sentido común.

REGLAS DE EXPERIENCIA PREMIUM (NUEVAS):
- ACUSE DE RECIBO: en el campo "acuse" genera una frase breve, cálida y natural que reconozca lo último que aportó el cliente o valide su situación (ej: "Perfecto, ya registré la marca." / "Gracias, tomo nota." / "Lamento el inconveniente."). NO debe contener preguntas. Déjalo vacío solo si no aplica (ej. primer dato o despedida).
- IDIOMA: detecta el idioma del cliente y ponlo en "idioma" ("es" o "en"). Si es "en", redacta "acuse", "respuesta_sugerida" y "resumen_handoff" en inglés natural.
- SENTIMIENTO: clasifica el ánimo del cliente en "sentimiento" (positivo | neutral | molesto | muy_molesto).
- URGENCIA: estima la urgencia del caso en "urgencia" (baja | media | alta | critica). Sistemas caídos, accesos perdidos o impacto operativo = alta/critica.
- RESUMEN PARA EL AGENTE: en "resumen_handoff" escribe un resumen ejecutivo de 1-2 líneas para el agente humano (cliente, cuenta, tema, equipo, qué se solicitó y qué falta). Esto evita que el agente vuelva a preguntar.
- CONFIANZA: en "confianza" indica tu nivel de certeza en la extracción (alta | media | baja). Si es baja por ambigüedad, prefiere una respuesta_sugerida que pida una aclaración cortés en lugar de asumir.
- No inventes datos. Si dudas, confírmalo con el cliente antes de darlo por válido.

Responde SOLO con JSON válido:
{
  "nombre": "nombre extraído o vacío",
  "correo": "correo extraído, 'Sin correo', o vacío",
  "cuenta": "cuenta/empresa extraída, 'Sin cuenta', o vacía",
  "tema": "uno de: Configuraciones|Reset|Desvinculación|Firmware|Software|Drivers|Licencias|Otro|null",
  "marca": "marca detectada o inferida, o vacío",
  "modelo": "modelo detectado, o vacío",
  "tiene_imagen": true/false,
  "tiene_xml": true/false,
  "descripcion_problema": "si el cliente ya describió su problema, ponerlo aquí, sino vacío",
  "accion": "una de: PEDIR_NOMBRE|PEDIR_CORREO|PEDIR_CUENTA|PEDIR_TEMA|PEDIR_MARCA|PEDIR_MODELO|PEDIR_MARCA_Y_MODELO|BUSCAR_INVENTARIO|PEDIR_ETIQUETA|PEDIR_ETIQUETA_Y_XML|PEDIR_DESCRIPCION|ESCALAR|ESCALAR_INMEDIATO|CERRAR|VENTAS|CONTINUAR",
  "razon": "explicación breve de por qué elegiste esa acción",
  "acuse": "frase breve de acuse de recibo o empatía, sin preguntas, o vacío",
  "idioma": "es o en",
  "sentimiento": "positivo|neutral|molesto|muy_molesto",
  "urgencia": "baja|media|alta|critica",
  "confianza": "alta|media|baja",
  "resumen_handoff": "resumen ejecutivo de 1-2 líneas para el agente humano",
  "respuesta_sugerida": "la respuesta que debería enviar el asistente al cliente (máx 2 oraciones, formal, sin emojis, tratando de usted, en el idioma del cliente)"
}`;

    let supervisorResult: any = null;
    try {
      const supervisorMessages: NimMessage[] = [
        { role: "system", content: supervisorPrompt },
        { role: "user", content: "Analiza la conversación y decide la siguiente acción." },
      ];
      const supervisorRaw = await callAIWithFallbacks(supervisorMessages);
      console.log("[seka-whatsapp] Supervisor raw:", supervisorRaw);
      const jsonMatch = supervisorRaw.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        supervisorResult = JSON.parse(jsonMatch[0]);
        console.log("[seka-whatsapp] Supervisor result:", JSON.stringify(supervisorResult));
      }
    } catch (e: any) {
      console.error("[seka-whatsapp] Supervisor error:", e.message);
      if (typeof supervisorRaw !== 'undefined') {
          await db.from("sek_cases").update({ notasInternas: "JSON_PARSE_ERROR: " + e.message + " | RAW: " + supervisorRaw.substring(0, 500) }).eq("id", case_id);
      }
    }

    // ── Paso 3: Inicializar datos del cliente ──
    const currentCliente = (caso.cliente && typeof caso.cliente === "object") ? caso.cliente : {};
    const updatedCliente: Record<string, unknown> = { ...currentCliente };
    let clienteChanged = false;

    // ── Si el supervisor falló, usar fallback con el flujo anterior ──
    if (!supervisorResult) {
      console.warn("[seka-whatsapp] Supervisor falló, usando LLM directo como fallback");

      // RED DE SEGURIDAD: aunque el supervisor falle, el NOMBRE y la CUENTA son obligatorios.
      // No delegamos al Asistente libre si faltan, para no saltarnos la cuenta.
      
      const lastIaContentFallback = (iaRealMsgs[iaRealMsgs.length - 1]?.content || "").toLowerCase();
      
      let replyDatos = "";
      if (!updatedCliente.nombre) {
        const isRetry = lastIaContentFallback.includes("nombre") || lastIaContentFallback.includes("llamarle");
        if (isRetry && lastUserMsgContent.length >= 2) {
          console.log("[seka-whatsapp] Fallback: Extrayendo nombre ingenuamente:", lastUserMsgContent);
          updatedCliente.nombre = lastUserMsgContent;
          clienteChanged = true;
          replyDatos = "Gracias. ¿Me podría indicar su correo electrónico?";
        } else {
          replyDatos = isRetry ? "El nombre ingresado no parece estar completo o válido. Por favor, indíquenos su nombre y al menos un apellido para registrar su caso." : "Para comenzar, ¿me podría indicar su nombre completo?";
        }
      } 
      
      if (!updatedCliente.correo && !replyDatos) {
        const isRetry = lastIaContentFallback.includes("correo") || lastIaContentFallback.includes("email");
        if (isRetry && lastUserMsgContent.includes("@")) {
          console.log("[seka-whatsapp] Fallback: Extrayendo correo ingenuamente:", lastUserMsgContent);
          updatedCliente.correo = lastUserMsgContent;
          clienteChanged = true;
          replyDatos = "Perfecto. Por último, ¿cuál es el nombre de la empresa o cuenta afiliada a Sekunet?";
        } else {
          replyDatos = isRetry ? "El correo ingresado no tiene un formato válido. Por favor, escriba su correo electrónico real para poder contactarle." : "Gracias. ¿Me podría indicar su correo electrónico?";
        }
      } 
      
      if (!updatedCliente.cuenta && !replyDatos) {
        const isRetry = lastIaContentFallback.includes("cuenta") || lastIaContentFallback.includes("empresa") || lastIaContentFallback.includes("afiliada");
        if (isRetry && lastUserMsgContent.length >= 2) {
          console.log("[seka-whatsapp] Fallback: Extrayendo cuenta ingenuamente:", lastUserMsgContent);
          updatedCliente.cuenta = lastUserMsgContent;
          clienteChanged = true;
          replyDatos = "¿En relación a qué tema sería su consulta?\n\n1. Configuraciones\n2. Reset\n3. Desvinculación\n4. Firmware\n5. Software\n6. Drivers\n7. Licencias\n8. Otro\n\nResponda con el número o el nombre del tema.";
        } else {
          replyDatos = isRetry ? "El nombre de la cuenta ingresada no es válido. Por favor, ¿cuál es el nombre de la empresa o cuenta afiliada a Sekunet?" : "Perfecto. Por último, ¿cuál es el nombre de la empresa o cuenta afiliada a Sekunet?";
        }
      }

      // Si los datos están completos pero el AI falló y estamos en el fallback,
      // usaremos un modelo no estructurado como salvavidas final.
      if (replyDatos) {
        const newMsgDatos: HistMsg = { role: "ia", author: "Asistente Sekunet", time: new Date().toISOString(), content: replyDatos };
        if (clienteChanged) {
           await db.from("sek_cases").update({ histtecnico: [...histtecnico, newMsgDatos], cliente: updatedCliente }).eq("id", case_id);
        } else {
           await db.from("sek_cases").update({ histtecnico: [...histtecnico, newMsgDatos] }).eq("id", case_id);
        }
        return new Response(JSON.stringify({ ok: true, reply: replyDatos }), { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }

      console.log("[seka-whatsapp] Datos de cliente completos, intentando LLM no estructurado como salvavidas...");
      try {
        const messages = buildMessages(histcliente, null);
        let rawReply = await callAIWithFallbacks(messages);
        let cleanReply = await processTags(rawReply, case_id);
        cleanReply = cleanReply.replace(/__INV__.*?__INV__/gs, "").trim();
        if (!cleanReply) return new Response(JSON.stringify({ ok: true, skipped: true }), { status: 200, headers: corsHeaders });
        const newMsg: HistMsg = { role: "ia", author: "Asistente Sekunet", time: new Date().toISOString(), content: cleanReply };
        await db.from("sek_cases").update({ histtecnico: [...histtecnico, newMsg] }).eq("id", case_id);
        return new Response(JSON.stringify({ ok: true, reply: cleanReply }), { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      } catch (fallbackErr: any) {
        console.error("[seka-whatsapp] Salvavidas no estructurado también falló:", fallbackErr.message);
        // Sólo como último recurso si TODO falla:
        const panicReply = "Disculpe, estoy teniendo intermitencias con la red. Un agente humano revisará su caso a la brevedad.";
        const newMsg: HistMsg = { role: "ia", author: "Asistente Sekunet", time: new Date().toISOString(), content: panicReply };
        await db.from("sek_cases").update({ histtecnico: [...histtecnico, newMsg] }).eq("id", case_id);
        return new Response(JSON.stringify({ ok: true, reply: panicReply }), { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }
    }

    // ── Paso 3: Actualizar datos del cliente si el supervisor extrajo nuevos ──
    // (La inicialización de currentCliente, updatedCliente y clienteChanged se movió arriba del fallback)
    
    const isValidExtractedString = (val: any) => typeof val === "string" && val.trim() !== "" && val !== "vacío" && val !== "(vacío)" && val !== "null" && !val.startsWith("PEDIR_");

    // Extracción forzosa de correo mediante Regex para no depender 100% de la IA
    let regexEmail = "";
    const emailMatch = lastUserMsgContent.match(/[\w.-]+@[\w.-]+\.\w+/);
    if (emailMatch) {
      regexEmail = emailMatch[0];
    }

    if (isValidExtractedString(supervisorResult.nombre)) {
      const oldNombre = String((currentCliente as any).nombre || "").trim();
      if (!oldNombre || oldNombre === "." || /^[\d\+\-\s]+$/.test(oldNombre) || oldNombre === "(vacío)") {
        updatedCliente.nombre = supervisorResult.nombre;
        clienteChanged = true;
      }
    }
    
    // Usar el correo del LLM o el del Regex como respaldo
    const finalCorreo = supervisorResult.correo && isValidExtractedString(supervisorResult.correo) ? supervisorResult.correo : regexEmail;
    
    if (isValidExtractedString(finalCorreo)) {
      const oldCorreo = String((currentCliente as any).correo || "").trim();
      if (!oldCorreo || oldCorreo === "(vacío)") {
        updatedCliente.correo = finalCorreo;
        clienteChanged = true;
      }
    }
    if (isValidExtractedString(supervisorResult.cuenta)) {
      const oldCuenta = String((currentCliente as any).cuenta || "").trim();
      const oldCuentaLower = oldCuenta.toLowerCase();
      const isBadOldCuenta = oldCuentaLower === "a mi nombre" || oldCuentaLower === "mi nombre" || oldCuentaLower === "yo mismo" || oldCuentaLower === "personal";
      let cuentaAlucinada = false;
      if (regexEmail) {
        // Normalizar: minúsculas y solo alfanuméricos (ignora espacios y signos).
        const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, "");
        const emailLocalPart = norm(regexEmail.split('@')[0]);
        const emailDomainPart = norm(regexEmail.split('@')[1].split('.')[0]);
        const cuentaNorm = norm(supervisorResult.cuenta);
        
        // Revisar si el usuario digitó la cuenta de forma explícita fuera de su correo
        const textWithoutEmail = lastUserMsgContent.replace(regexEmail, "");
        const isExplicitlyTyped = norm(textWithoutEmail).includes(cuentaNorm);
        
        if (!isExplicitlyTyped && cuentaNorm.length >= 3) {
          // Si NO lo digitó explícitamente, pero coincide con partes del correo = alucinación
          if (emailLocalPart.includes(cuentaNorm) || cuentaNorm.includes(emailLocalPart) ||
              emailDomainPart.includes(cuentaNorm) || cuentaNorm.includes(emailDomainPart)) {
            cuentaAlucinada = true;
          }
        }
      }
      if (!oldCuenta || oldCuenta === "(vacío)" || isBadOldCuenta) {
        if (cuentaAlucinada) {
           updatedCliente.cuenta = "";
        } else {
           let cuentaFinal = supervisorResult.cuenta;
      try {
        const levenshtein = (a: string, b: string): number => {
          if (a.length === 0) return b.length;
          if (b.length === 0) return a.length;
          const matrix = Array(b.length + 1).fill(null).map(() => Array(a.length + 1).fill(null));
          for (let i = 0; i <= a.length; i += 1) matrix[0][i] = i;
          for (let j = 0; j <= b.length; j += 1) matrix[j][0] = j;
          for (let j = 1; j <= b.length; j += 1) {
            for (let i = 1; i <= a.length; i += 1) {
              const ind = a[i - 1] === b[j - 1] ? 0 : 1;
              matrix[j][i] = Math.min(matrix[j][i - 1] + 1, matrix[j - 1][i] + 1, matrix[j - 1][i - 1] + ind);
            }
          }
          return matrix[b.length][a.length];
        };
        const { data: recentCases } = await db.from("sek_cases").select("cliente").order("created_at", { ascending: false }).limit(500);
        if (recentCases) {
          const uniqueAccounts = new Set<string>();
          for (const c of recentCases) {
            if (c.cliente && typeof c.cliente === "object" && (c.cliente as any).cuenta) {
              const acc = String((c.cliente as any).cuenta).trim();
              if (acc.length > 2) uniqueAccounts.add(acc);
            }
          }
          const target = cuentaFinal.toLowerCase();
          let bestMatch = cuentaFinal;
          let bestScore = 0;
          for (const acc of uniqueAccounts) {
            const candidate = acc.toLowerCase();
            if (candidate === target) { bestMatch = acc; bestScore = 1; break; }
            const dist = levenshtein(target, candidate);
            const score = 1 - (dist / Math.max(target.length, candidate.length));
            if (score > bestScore && score > 0.7) { bestScore = score; bestMatch = acc; }
          }
          if (bestScore > 0 && bestMatch !== cuentaFinal) {
            console.log(`[seka-whatsapp] Fuzzy match cuenta: "${cuentaFinal}" -> "${bestMatch}" (${bestScore.toFixed(2)})`);
            cuentaFinal = bestMatch;
          }
        }
      } catch (e: any) {
        console.error("[seka-whatsapp] Fuzzy match error:", e.message);
      }
      updatedCliente.cuenta = cuentaFinal;
      clienteChanged = true;
      } // Closes else block
      } // Closes if (!oldCuenta || ...)
    } // Closes if (isValidExtractedString...)

    // Actualizar título si tenemos nombre
    const nuevoTitle = (updatedCliente.nombre)
      ? `WhatsApp — ${updatedCliente.nombre}`
      : undefined;

    // ── Paso 4: Ejecutar la ACCIÓN que decidió el Supervisor ──
    let accion = (supervisorResult.accion || "CONTINUAR").toUpperCase();
    const marcaSupervisor = supervisorResult.marca || "";
    const modeloSupervisor = supervisorResult.modelo || "";
    const temaSupervisor = supervisorResult.tema || tema;

    // ── CAMPOS PREMIUM (experiencia de clase mundial) ──
    const idioma = (supervisorResult.idioma === "en") ? "en" : "es";
    const sentimiento = String(supervisorResult.sentimiento || "neutral").toLowerCase();
    const urgencia = String(supervisorResult.urgencia || "media").toLowerCase();
    const acuse = (typeof supervisorResult.acuse === "string" && supervisorResult.acuse.trim() && !/^(vac[íi]o|null|none)$/i.test(supervisorResult.acuse.trim()))
      ? supervisorResult.acuse.trim()
      : "";
    const handoffSummary = (typeof supervisorResult.resumen_handoff === "string" && supervisorResult.resumen_handoff.trim() && !/^(vac[íi]o|null|none)$/i.test(supervisorResult.resumen_handoff.trim()))
      ? supervisorResult.resumen_handoff.trim()
      : "";

    // Antepone un acuse de recibo a las respuestas de pasos. En inglés, prefiere la respuesta del supervisor.
    // El texto base (en español) se conserva íntegro para no romper los matchers anti-loop.
    const withAcuse = (text: string): string => {
      if (idioma === "en" && typeof supervisorResult.respuesta_sugerida === "string" && supervisorResult.respuesta_sugerida.trim()) {
        return supervisorResult.respuesta_sugerida.trim();
      }
      if (!acuse) return text;
      // Protección contra IA desobediente: si el acuse contiene una pregunta, ignorarlo para no duplicar.
      if (acuse.includes("?")) return text;
      // Protección contra IA repitiendo el mismo texto
      if (text.includes(acuse) || acuse.includes(text)) return text;
      return `${acuse}\n\n${text}`;
    };

    // Construye el motivo de escalado (resumen ejecutivo para el agente humano).
    const buildN2Reason = (fallback: string): string => handoffSummary || fallback;
    const urgencyTags = (urgencia === "alta" || urgencia === "critica") ? [`urgencia_${urgencia}`] : [];

    // ── AUTO-ESCALADO POR FRUSTRACIÓN (triaje prioritario) ──
    if (sentimiento === "muy_molesto" && accion !== "CERRAR" && accion !== "VENTAS") {
      console.log("[seka-whatsapp] Cliente muy molesto → escalado prioritario.");
      accion = "ESCALAR_INMEDIATO";
    }

    // ── FORZAR REGLAS CRÍTICAS (evitar alucinaciones del LLM) ──
    if (tema === "Otro" && (accion === "PEDIR_MARCA" || accion === "PEDIR_MODELO" || accion === "PEDIR_MARCA_Y_MODELO")) {
      console.log("[seka-whatsapp] Forzando PEDIR_DESCRIPCION para tema Otro");
      accion = "PEDIR_DESCRIPCION";
      supervisorResult.respuesta_sugerida = "Por favor, describa brevemente su consulta o inconveniente.";
    }

    // ── VERIFICACIÓN DE INVENTARIO OBLIGATORIA (Si hay nueva marca o modelo) ──
    if ((marcaSupervisor || modeloSupervisor) && accion !== "CERRAR" && accion !== "VENTAS" && accion !== "BUSCAR_INVENTARIO") {
      const searchQuery = `${marcaSupervisor} ${modeloSupervisor}`.trim();
      const invCheck = await buscarInventario(searchQuery);
      if (!invCheck.encontrado) {
        console.log(`[seka-whatsapp] Marca/Modelo (${searchQuery}) NO está en inventario. Forzando BUSCAR_INVENTARIO.`);
        accion = "BUSCAR_INVENTARIO";
        supervisorResult.respuesta_sugerida = "";
      }
    }

    const lastIAContent = iaRealMsgs[iaRealMsgs.length - 1]?.content || "";

    if (accion === "PEDIR_DESCRIPCION" && lastIAContent.includes("describa brevemente")) {
      console.log("[seka-whatsapp] Ya se había pedido descripción. Forzando ESCALAR.");
      accion = "ESCALAR";
    }

    if (/precio|rpecio|prec|cotiza|comprar|compra|ventas|venta|venden|vender|vendemos|costo|cuanto cuesta|cuánto cuesta|cuanto vale|cuánto vale|tienen en stock/i.test(lastUserMsgContent)) {
      console.log("[seka-whatsapp] Detectada intención de VENTAS por heurística.");
      accion = "VENTAS";
    }

    // ── ANTI-LOOP GENERAL (Máx 2 intentos repetidos) ──
    const lastIAContent1 = iaRealMsgs[iaRealMsgs.length - 1]?.content || "";
    const lastIAContent2 = iaRealMsgs[iaRealMsgs.length - 2]?.content || "";
    
    let currentActionString = "";
    if (accion === "PEDIR_MARCA") currentActionString = "Por favor, indíquenos la marca del equipo.";
    if (accion === "PEDIR_MODELO") currentActionString = "¿Nos podría indicar el modelo del equipo, por favor?";
    if (accion === "PEDIR_MARCA_Y_MODELO") currentActionString = "Por favor, indíquenos la marca y el modelo del equipo.";
    if (accion === "PEDIR_ETIQUETA") currentActionString = "Por favor, adjunte una imagen clara y legible de la etiqueta del equipo.";
    if (accion === "PEDIR_ETIQUETA_Y_XML") currentActionString = "requerimos una imagen clara y legible de la etiqueta del equipo y el archivo XML";
    
    if (currentActionString && lastIAContent1.includes(currentActionString) && lastIAContent2.includes(currentActionString)) {
       console.log("[seka-whatsapp] Detectado bucle de 3 repeticiones. Escalando.");
       accion = "ESCALAR";
    }

    const validActions = ["CERRAR", "ESCALAR", "ESCALAR_INMEDIATO", "PEDIR_DATOS", "PEDIR_TEMA", "PEDIR_MARCA", "PEDIR_MODELO", "PEDIR_MARCA_Y_MODELO", "BUSCAR_INVENTARIO", "PEDIR_ETIQUETA", "PEDIR_ETIQUETA_Y_XML", "PEDIR_DESCRIPCION", "VENTAS"];
    if (!validActions.includes(accion) && !supervisorResult.respuesta_sugerida) {
      console.warn(`[seka-whatsapp] Accion ${accion} sin respuesta_sugerida. Aplicando heuristica.`);
      if (!updatedCliente.nombre || !updatedCliente.cuenta) {
        accion = "PEDIR_DATOS";
      } else if (!temaSupervisor) {
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

    console.log(`[seka-whatsapp] Supervisor acción: ${accion}, marca: ${marcaSupervisor}, modelo: ${modeloSupervisor}, tema: ${temaSupervisor}`);

    // ── REGLA DE NEGOCIO ESTRICTA: DATOS INCOMPLETOS ──
    const cuentaCheck = String(updatedCliente.cuenta || "").toLowerCase().trim();
    const lastBotMsg = iaRealMsgs[iaRealMsgs.length - 1]?.content || "";
    
    // Contar cuántas veces hemos pedido el correo
    let emailAskCount = 0;
    for (const msg of iaRealMsgs) {
      if (msg.content?.toLowerCase().includes("correo electrónico")) emailAskCount++;
    }
    
    const userSaysNoData = lastUserMsgContent.toLowerCase().includes("no lo tengo") || lastUserMsgContent.toLowerCase().includes("no tengo") || lastUserMsgContent.toLowerCase().includes("no recuerdo");
    
    // Si ya pedimos el correo 2 veces (inicial + 1 recordatorio) o el cliente dice no tenerlo, lo marcamos como "Sin correo"
    if (!updatedCliente.correo && (emailAskCount >= 2 || userSaysNoData)) {
      updatedCliente.correo = "Sin correo";
    }

    const askingForAccountOnly = lastBotMsg.includes("afiliada a Sekunet") && !lastBotMsg.includes("correo electrónico");
    const isSinCuentaByText = (askingForAccountOnly && userSaysNoData) || lastUserMsgContent.toLowerCase().includes("no tengo cuenta") || lastUserMsgContent.toLowerCase().includes("no tengo empresa");
    
    const isSinCuenta = cuentaCheck === "sin cuenta" || cuentaCheck === "no tengo" || cuentaCheck === "cliente final" || isSinCuentaByText;
    
    if (isSinCuenta) {
      updatedCliente.cuenta = "sin cuenta"; // Forzar para que el siguiente bloque lo procese correctamente
    }

    // ── VALIDACIÓN DETERMINÍSTICA: la CUENTA es lo más importante ──
    // Los casos se registran por nombre de cuenta. La cuenta es OBLIGATORIA; el correo es OPCIONAL.

    // La validación de cuenta alucinada desde el correo ahora se maneja 
    // exclusivamente en la extracción inicial (isValidExtractedString)
    // para respetar si el usuario la digitó explícitamente.

    // CUENTA A NOMBRE/TÍTULO PERSONAL: si el cliente indica que la cuenta está a su propio
    // nombre, el nombre del cliente ES el nombre de la cuenta (registro a título personal).
    const personalAccountPattern = /(a\s*mi\s*nombre|mi\s*propio\s*nombre|a\s*t[íi]tulo\s*personal|nombre\s*personal|a\s*nombre\s*personal|cuenta\s*personal|est[áa]\s*a\s*mi\s*nombre|a\s*nombre\s*m[íi]o|cuenta\s*(es\s*)?m[íi]a|es\s*a\s*mi\s*nombre)/i;
    if (!isSinCuenta && !updatedCliente.cuenta && updatedCliente.nombre && personalAccountPattern.test(lastUserMsgContent)) {
      updatedCliente.cuenta = String(updatedCliente.nombre);
      clienteChanged = true;
      console.log("[seka-whatsapp] Cuenta a nombre personal → se usa el nombre del cliente como cuenta.");
    }

    // GATE 0 — FORZAR RECOPILACIÓN DE DATOS (Red de Seguridad contra Alucinaciones)
    if (accion !== "CERRAR" && accion !== "VENTAS" && accion !== "ESCALAR_INMEDIATO") {
      if (!updatedCliente.nombre) {
        console.log("[seka-whatsapp] Forzando PEDIR_NOMBRE por datos incompletos.");
        accion = "PEDIR_NOMBRE";
        supervisorResult.respuesta_sugerida = "";
      } else if (!updatedCliente.correo) {
        console.log("[seka-whatsapp] Forzando PEDIR_CORREO por datos incompletos.");
        accion = "PEDIR_CORREO";
        supervisorResult.respuesta_sugerida = "";
      } else if (!updatedCliente.cuenta) {
        console.log("[seka-whatsapp] Forzando PEDIR_CUENTA por datos incompletos.");
        accion = "PEDIR_CUENTA";
        supervisorResult.respuesta_sugerida = "";
      }
    }

    // GATE 1 — Lógica de cierre por insistencia en pedir la cuenta.
    if (accion === "PEDIR_CUENTA" && !isSinCuenta) {
      // Contar cuántas veces ya re-pedimos la cuenta (frase de reintento).
      const accountReaskCount = iaRealMsgs.filter(m => (m.content || "").includes("nombre de la cuenta ingresada no es válido")).length;

      // Tras 2 recordatorios sin éxito: cerrar la conversación cortésmente.
      if (accountReaskCount >= 2) {
        console.log("[seka-whatsapp] Cuenta no proporcionada tras 2 recordatorios → cerrando conversación.");
        const M_SIN_CUENTA_CIERRE = "Lamentamos no poder continuar en esta ocasión. Para brindarle soporte necesitamos el nombre de la cuenta registrada con Sekunet, y no hemos podido confirmarlo.\n\nLe invitamos a contactar a su proveedor o instalador, o a escribirnos nuevamente cuando tenga a mano el nombre de su cuenta. Agradecemos su comprensión y le deseamos un excelente día.";
        const newMsg: HistMsg = { role: "ia", author: "Asistente Sekunet", time: new Date().toISOString(), content: M_SIN_CUENTA_CIERRE };
        const upd: Record<string, unknown> = { histtecnico: [...histtecnico, newMsg], estado: "cerrado" };
        if (clienteChanged) upd.cliente = updatedCliente;
        if (nuevoTitle) upd.title = nuevoTitle;
        await db.from("sek_cases").update(upd).eq("id", case_id);
        return new Response(JSON.stringify({ ok: true, reply: M_SIN_CUENTA_CIERRE }), { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }
    }

    // GATE 2 — Con datos completos pero sin tema elegido por el cliente, mostrar la lista de temas.
    const temaElegidoPorCliente = topiIdx >= 0;
    if (accion !== "CERRAR" && accion !== "VENTAS" && accion !== "ESCALAR_INMEDIATO" && accion !== "PEDIR_DATOS") {
      if (updatedCliente.nombre && updatedCliente.cuenta && !temaElegidoPorCliente) {
        console.log("[seka-whatsapp] Datos completos sin tema elegido → mostrando lista de temas.");
        accion = "PEDIR_TEMA";
      }
    }

    // ── REGLA DE NEGOCIO: SIN CUENTA ──
    const cuentaDetectada = String(updatedCliente.cuenta || "").toLowerCase().trim();
    if (cuentaDetectada === "sin cuenta" || cuentaDetectada === "no tengo" || cuentaDetectada === "cliente final") {
      const M_NO_CUENTA = "Gracias por comunicarse con Sekunet.\n\nLe informamos que nuestro servicio de soporte técnico es un beneficio exclusivo para clientes y distribuidores autorizados de nuestra red.\n\nPor este motivo, le recomendamos contactar directamente a su proveedor o instalador, quien podrá brindarle la asistencia correspondiente con su requerimiento.\n\nAgradecemos su comprensión y le deseamos un excelente día.";
      const newMsg: HistMsg = { role: "ia", author: "Asistente Sekunet", time: new Date().toISOString(), content: M_NO_CUENTA };
      const upd: Record<string, unknown> = { histtecnico: [...histtecnico, newMsg], estado: "cerrado" };
      if (clienteChanged) upd.cliente = updatedCliente;
      await db.from("sek_cases").update(upd).eq("id", case_id);
      return new Response(JSON.stringify({ ok: true, reply: M_NO_CUENTA }), { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    // ── ACCIÓN: CERRAR ──
    if (accion === "CERRAR") {
      const M03_TEXT = "Ha sido un gusto atenderle. Si tiene alguna otra consulta, no dude en contactarnos nuevamente. ¡Que tenga un excelente día!";
      const newMsg: HistMsg = { role: "ia", author: "Asistente Sekunet", time: new Date().toISOString(), content: M03_TEXT };
      const upd: Record<string, unknown> = { histtecnico: [...histtecnico, newMsg], estado: "cerrado" };
      if (clienteChanged) upd.cliente = updatedCliente;
      await db.from("sek_cases").update(upd).eq("id", case_id);
      return new Response(JSON.stringify({ ok: true, reply: M03_TEXT }), { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    // ── ACCIÓN: VENTAS ──
    if (accion === "VENTAS") {
      const M04_TEXT = "Agradecemos mucho su interés.\n\nLe informamos que su consulta corresponde al Departamento de Ventas. Con gusto podrán asistirle a través de los siguientes medios:\n\n• Teléfono: +506 2290 5585\n• WhatsApp: +506 8757 5820\n• Correo electrónico: info@sekunet.com\n\nSerá un gusto atenderle por cualquiera de estos canales.\n\n¡Le deseamos un excelente día!";
      const newMsg: HistMsg = { role: "ia", author: "Asistente Sekunet", time: new Date().toISOString(), content: M04_TEXT };
      const upd: Record<string, unknown> = { histtecnico: [...histtecnico, newMsg], estado: "cerrado" };
      if (clienteChanged) upd.cliente = updatedCliente;
      await db.from("sek_cases").update(upd).eq("id", case_id);
      return new Response(JSON.stringify({ ok: true, reply: M04_TEXT }), { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    // ── ACCIÓN: ESCALAR INMEDIATO (cliente pidió hablar con un humano o requiere prioridad) ──
    if (accion === "ESCALAR_INMEDIATO") {
      const M02_TEXT = "Agradecemos su preferencia. En un momento será atendido por uno de nuestros agentes.";
      const replyText = withAcuse(M02_TEXT);
      const newMsg: HistMsg = { role: "ia", author: "Asistente Sekunet", time: new Date().toISOString(), content: replyText };
      const upd: Record<string, unknown> = {
        histtecnico: [...histtecnico, newMsg],
        estado: "escalado",
        escalado_at: new Date().toISOString(),
        n2_reason: buildN2Reason(sentimiento === "muy_molesto" ? "Cliente requiere atención prioritaria" : "Solicitud directa del cliente"),
      };
      if (urgencyTags.length) upd.tags = urgencyTags;
      if (clienteChanged) upd.cliente = updatedCliente;
      if (nuevoTitle) upd.title = nuevoTitle;
      await db.from("sek_cases").update(upd).eq("id", case_id);
      return new Response(JSON.stringify({ ok: true, reply: replyText }), { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    // ── ACCIÓN: PEDIR NOMBRE, CORREO, CUENTA ──
    if (accion === "PEDIR_NOMBRE" || accion === "PEDIR_CORREO" || accion === "PEDIR_CUENTA") {
      let defaultReply = "";
      const lastIaContent = (lastIA?.content || "").toLowerCase();
      
      // Ampliamos la detección de reintento para atrapar variaciones del LLM
      const isRetry = (accion === "PEDIR_NOMBRE" && (lastIaContent.includes("nombre") || lastIaContent.includes("llamarle"))) ||
                      (accion === "PEDIR_CORREO" && (lastIaContent.includes("correo") || lastIaContent.includes("email"))) ||
                      (accion === "PEDIR_CUENTA" && (lastIaContent.includes("cuenta") || lastIaContent.includes("empresa") || lastIaContent.includes("afiliada")));

      if (accion === "PEDIR_NOMBRE") {
        defaultReply = isRetry ? "El nombre ingresado no parece estar completo o válido. Por favor, indíquenos su nombre y al menos un apellido para registrar su caso." : "Para comenzar, ¿me podría indicar su nombre completo?";
      }
      if (accion === "PEDIR_CORREO") {
        defaultReply = isRetry ? "El correo ingresado no tiene un formato válido. Por favor, escriba su correo electrónico real para poder contactarle." : "Gracias. ¿Me podría indicar su correo electrónico?";
      }
      if (accion === "PEDIR_CUENTA") {
        defaultReply = isRetry ? "El nombre de la cuenta ingresada no es válido. Por favor, ¿cuál es el nombre de la empresa o cuenta afiliada a Sekunet?" : "Perfecto. Por último, ¿cuál es el nombre de la empresa o cuenta afiliada a Sekunet?";
      }

      let directReply = supervisorResult.respuesta_sugerida;
      if (!directReply || isRetry) {
        // Si es un reintento, ignoramos la respuesta suave de la IA y usamos el defaultReply estricto
        directReply = isRetry ? defaultReply : withAcuse(defaultReply);
      } else {
        directReply = withAcuse(directReply);
      }

      const newMsg: HistMsg = { role: "ia", author: "Asistente Sekunet", time: new Date().toISOString(), content: directReply };
      const upd: Record<string, unknown> = { histtecnico: [...histtecnico, newMsg] };
      if (clienteChanged) upd.cliente = updatedCliente;
      await db.from("sek_cases").update(upd).eq("id", case_id);
      return new Response(JSON.stringify({ ok: true, reply: directReply }), { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    // ── ACCIÓN: PEDIR TEMA ──
    if (accion === "PEDIR_TEMA") {
      const directReply = withAcuse("¿En relación a qué tema sería su consulta?\n\n1. Configuraciones\n2. Reset\n3. Desvinculación\n4. Firmware\n5. Software\n6. Drivers\n7. Licencias\n8. Otro\n\nResponda con el número o el nombre del tema.");
      const newMsg: HistMsg = { role: "ia", author: "Asistente Sekunet", time: new Date().toISOString(), content: directReply };
      const upd: Record<string, unknown> = { histtecnico: [...histtecnico, newMsg] };
      if (clienteChanged) upd.cliente = updatedCliente;
      if (nuevoTitle) upd.title = nuevoTitle;
      await db.from("sek_cases").update(upd).eq("id", case_id);
      return new Response(JSON.stringify({ ok: true, reply: directReply }), { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    // ── ACCIÓN: PEDIR MARCA ──
    if (accion === "PEDIR_MARCA") {
      const directReply = withAcuse("Por favor, indíquenos la marca del equipo.");
      const newMsg: HistMsg = { role: "ia", author: "Asistente Sekunet", time: new Date().toISOString(), content: directReply };
      const upd: Record<string, unknown> = { histtecnico: [...histtecnico, newMsg] };
      if (clienteChanged) upd.cliente = updatedCliente;
      await db.from("sek_cases").update(upd).eq("id", case_id);
      return new Response(JSON.stringify({ ok: true, reply: directReply }), { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    // ── ACCIÓN: PEDIR MODELO ──
    if (accion === "PEDIR_MODELO") {
      // 🚨 INTERCEPCIÓN INTELIGENTE: Si vamos a pedir el modelo, significa que ya tenemos la marca.
      // Validemos la marca ANTES de pedir el modelo para no hacer perder el tiempo al cliente.
      const marcaValida = await validarMarcaSolo(marcaSupervisor);
      
      if (!marcaValida.encontrado && temaSupervisor !== "Otro") {
        // La marca no existe en el catálogo. Rechazamos inmediatamente.
        const rejectionMessage = "Gracias por contactarnos.\n\nLe informamos que el dispositivo indicado no corresponde a un equipo distribuido por Sekunet, por lo que no podemos brindarle soporte técnico sobre este producto.\n\n¿Tiene alguna otra consulta relacionada con nuestras marcas o servicios? Con gusto le ayudaremos.";
        const directReply = withAcuse(rejectionMessage);
        
        const newMsg: HistMsg = { role: "ia", author: "Asistente Sekunet", time: new Date().toISOString(), content: directReply };
        const upd: Record<string, unknown> = { histtecnico: [...histtecnico, newMsg] };
        if (clienteChanged) upd.cliente = updatedCliente;
        // Limpiamos la marca para que el usuario pueda empezar de cero si tiene otra consulta
        upd.title = `${temaSupervisor} — Marca Rechazada`;
        await db.from("sek_cases").update(upd).eq("id", case_id);
        
        return new Response(JSON.stringify({ ok: true, reply: directReply }), { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }

      // Si la marca sí existe (o es tema Otro donde no importa), pedimos el modelo normalmente.
      const directReply = withAcuse("¿Nos podría indicar el modelo del equipo, por favor?");
      const newMsg: HistMsg = { role: "ia", author: "Asistente Sekunet", time: new Date().toISOString(), content: directReply };
      const upd: Record<string, unknown> = { histtecnico: [...histtecnico, newMsg] };
      if (clienteChanged) upd.cliente = updatedCliente;
      await db.from("sek_cases").update(upd).eq("id", case_id);
      return new Response(JSON.stringify({ ok: true, reply: directReply }), { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    // ── ACCIÓN: PEDIR MARCA Y MODELO (cuando no tiene ninguno) ──
    if (accion === "PEDIR_MARCA_Y_MODELO") {
      const directReply = withAcuse("Por favor, indíquenos la marca y el modelo del equipo.");
      const newMsg: HistMsg = { role: "ia", author: "Asistente Sekunet", time: new Date().toISOString(), content: directReply };
      const upd: Record<string, unknown> = { histtecnico: [...histtecnico, newMsg] };
      if (clienteChanged) upd.cliente = updatedCliente;
      await db.from("sek_cases").update(upd).eq("id", case_id);
      return new Response(JSON.stringify({ ok: true, reply: directReply }), { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    // ── ACCIÓN: BUSCAR_INVENTARIO (tiene marca y/o modelo, verificar en BD) ──
    if (accion === "BUSCAR_INVENTARIO") {
      const searchQuery = `${marcaSupervisor} ${modeloSupervisor}`.trim();
      const inv = await buscarInventario(searchQuery);
      
      let directReply: string;
      if (!inv.encontrado) {
        directReply = withAcuse("Gracias por contactarnos.\n\nLe informamos que el dispositivo indicado no corresponde a un equipo distribuido por Sekunet, por lo que no podemos brindarle soporte técnico sobre este producto.\n\n¿Tiene alguna otra consulta relacionada con nuestras marcas o servicios? Con gusto le ayudaremos.");
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

      directReply = withAcuse(directReply);
      const newMsg: HistMsg = { role: "ia", author: "Asistente Sekunet", time: new Date().toISOString(), content: directReply };
      const upd: Record<string, unknown> = { histtecnico: [...histtecnico, newMsg] };
      if (clienteChanged) upd.cliente = updatedCliente;
      if (inv.encontrado && (marcaSupervisor || modeloSupervisor)) {
        upd.title = `${temaSupervisor} — ${inv.detalle}`.substring(0, 120);
      }
      await db.from("sek_cases").update(upd).eq("id", case_id);
      return new Response(JSON.stringify({ ok: true, reply: directReply }), { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    // ── ACCIÓN: PEDIR ETIQUETA (Reset/Desvinculación — no Hikvision) ──
    if (accion === "PEDIR_ETIQUETA") {
      const directReply = withAcuse("Por favor, adjunte una imagen clara y legible de la etiqueta del equipo.");
      const newMsg: HistMsg = { role: "ia", author: "Asistente Sekunet", time: new Date().toISOString(), content: directReply };
      const upd: Record<string, unknown> = { histtecnico: [...histtecnico, newMsg] };
      if (clienteChanged) upd.cliente = updatedCliente;
      await db.from("sek_cases").update(upd).eq("id", case_id);
      return new Response(JSON.stringify({ ok: true, reply: directReply }), { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    // ── ACCIÓN: PEDIR ETIQUETA Y XML (Reset Hikvision) ──
    if (accion === "PEDIR_ETIQUETA_Y_XML") {
      const directReply = withAcuse("Como parte de los requisitos del fabricante, requerimos una imagen clara y legible de la etiqueta del equipo y el archivo XML, el cual puede obtener mediante la herramienta SAPD Tools en la opción \"Olvidé mi contraseña\", ubicada en la parte inferior derecha del software. Por favor, adjunte ambos archivos.");
      const newMsg: HistMsg = { role: "ia", author: "Asistente Sekunet", time: new Date().toISOString(), content: directReply };
      const upd: Record<string, unknown> = { histtecnico: [...histtecnico, newMsg] };
      if (clienteChanged) upd.cliente = updatedCliente;
      await db.from("sek_cases").update(upd).eq("id", case_id);
      return new Response(JSON.stringify({ ok: true, reply: directReply }), { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    // ── ACCIÓN: PEDIR DESCRIPCIÓN (temas que no son Reset/Desvinculación) ──
    if (accion === "PEDIR_DESCRIPCION") {
      const directReply = withAcuse("Por favor, describa brevemente el inconveniente que presenta.");
      const newMsg: HistMsg = { role: "ia", author: "Asistente Sekunet", time: new Date().toISOString(), content: directReply };
      const upd: Record<string, unknown> = { histtecnico: [...histtecnico, newMsg] };
      if (clienteChanged) upd.cliente = updatedCliente;
      await db.from("sek_cases").update(upd).eq("id", case_id);
      return new Response(JSON.stringify({ ok: true, reply: directReply }), { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    // ── ACCIÓN: ESCALAR (todo listo, pasar a humano) ──
    if (accion === "ESCALAR") {
      const M02_TEXT = "Agradecemos su preferencia. En un momento será atendido por uno de nuestros agentes.";
      const replyText = withAcuse(M02_TEXT);
      const newMsg: HistMsg = { role: "ia", author: "Asistente Sekunet", time: new Date().toISOString(), content: replyText };
      const upd: Record<string, unknown> = {
        histtecnico: [...histtecnico, newMsg],
        estado: "escalado",
        escalado_at: new Date().toISOString(),
        n2_reason: buildN2Reason(`${temaSupervisor} — recopilación completada`),
      };
      if (urgencyTags.length) upd.tags = urgencyTags;
      if (clienteChanged) upd.cliente = updatedCliente;
      if (marcaSupervisor || modeloSupervisor) {
        upd.title = `${temaSupervisor} — ${marcaSupervisor} ${modeloSupervisor}`.trim().substring(0, 120);
      } else if (nuevoTitle) {
        upd.title = nuevoTitle;
      }
      await db.from("sek_cases").update(upd).eq("id", case_id);
      return new Response(JSON.stringify({ ok: true, reply: replyText }), { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    // ── ACCIÓN: CONTINUAR (el supervisor sugiere una respuesta libre/contextual) ──
    // Esto es para casos donde el supervisor entiende el contexto pero la acción no cae en ninguna categoría fija.
    // Ejemplo: el cliente pregunta algo fuera de lo esperado, pide aclaración, etc.
    if (supervisorResult.respuesta_sugerida) {
      const directReply = supervisorResult.respuesta_sugerida;
      const newMsg: HistMsg = { role: "ia", author: "Asistente Sekunet", time: new Date().toISOString(), content: directReply };
      const upd: Record<string, unknown> = { histtecnico: [...histtecnico, newMsg] };
      if (clienteChanged) upd.cliente = updatedCliente;
      if (nuevoTitle) upd.title = nuevoTitle;
      await db.from("sek_cases").update(upd).eq("id", case_id);
      return new Response(JSON.stringify({ ok: true, reply: directReply }), { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    // ── PASO RESET-4: verificar archivos según marca (se mantiene la lógica de seguridad) ──
    const MSG_RESET_PIDE_ARCHIVOS = "imagen clara y legible de la etiqueta";
    const MSG_RESET_PIDE_IMAGEN = "adjunte nuevamente una imagen clara";
    const MSG_RESET_PIDE_XML = "adjunte nuevamente el archivo XML";
    if ((lastIA?.content?.includes(MSG_RESET_PIDE_ARCHIVOS) || lastIA?.content?.includes(MSG_RESET_PIDE_IMAGEN) || lastIA?.content?.includes(MSG_RESET_PIDE_XML)) && lastUserTime > lastIATime) {
      // Buscar archivos en mensajes recientes
      const recentUserMsgs = userRealMsgs.filter(m => {
        const mTime = new Date(m.time ?? 0).getTime();
        return mTime > lastIATime - 60000; // Mensajes del último minuto antes y después del pedido de la IA
      });
      
      const marca = marcaSupervisor || "";
      const modelo = modeloSupervisor || "";

      const tieneArchivos = recentUserMsgs.some(m => m.mediaUrl);
      if (!tieneArchivos) {
        const ultimoMsj = userRealMsgs[userRealMsgs.length - 1]?.content?.trim().toLowerCase() || "";
        const esEspera = /esper|minut|dame|deme|un momento|ahorita|voy|ya casi/i.test(ultimoMsj);
        
        if (esEspera) {
           return new Response(JSON.stringify({ ok: true, skipped: true }), { status: 200, headers: corsHeaders });
        }
        
        // Usar IA para ayudar al cliente a encontrar la etiqueta
        const msgs = buildMessages(histcliente, null);
        msgs[0].content += `\n\nATENCIÓN: El sistema está esperando que el cliente adjunte una fotografía de la etiqueta del equipo (marca: ${marca}, modelo: ${modelo}) para continuar. El cliente ha respondido sin adjuntar foto.
Ayúdele indicando amablemente dónde suele ubicarse la etiqueta en este tipo de equipos.
IMPORTANTE: Al finalizar, recuérdele amablemente que es indispensable adjuntar la foto para continuar. NO resuelva la duda técnica principal, solo asístale para encontrar la etiqueta.`;
        
        let aiReply = await callAIWithFallbacks(msgs);
        aiReply = await processTags(aiReply, case_id);
        aiReply = aiReply.replace(/__INV__.*?__INV__/gs, "").trim();

        if (!aiReply.toLowerCase().includes("imagen clara y legible de la etiqueta")) {
           aiReply += "\n\nPor favor, asegúrese de enviarnos una imagen clara y legible de la etiqueta para poder continuar.";
        }

        const newMsg: HistMsg = { role: "ia", author: "Asistente Sekunet", time: new Date().toISOString(), content: aiReply };
        await db.from("sek_cases").update({ histtecnico: [...histtecnico, newMsg] }).eq("id", case_id);
        return new Response(JSON.stringify({ ok: true, reply: aiReply }), { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }
      const esHikvision = /hik/i.test(marca);

      // Buscar archivos en todos los mensajes recientes
      let imagenUrl: string | null = null;
      let xmlUrl: string | null = null;
      for (const m of recentUserMsgs) {
        if (m.mediaUrl) {
          const mType = (m.mediaType || "").toLowerCase();
          const mName = (m.fileName || "").toLowerCase();
          const mUrl = (m.mediaUrl || "").toLowerCase();
          console.log("[seka-whatsapp] Archivo encontrado - type:", mType, "name:", mName, "url:", mUrl.substring(mUrl.lastIndexOf("/") + 1));
          if (mType.startsWith("image/")) {
            imagenUrl = m.mediaUrl;
          } else if (mType === "text/xml" || mType === "application/xml" || mType === "application/octet-stream" && (mName.endsWith(".xml") || mUrl.endsWith(".xml")) || mName.endsWith(".xml") || mUrl.endsWith(".xml")) {
            xmlUrl = m.mediaUrl;
          }
        }
      }

      console.log("[seka-whatsapp] Archivos recibidos - imagen:", !!imagenUrl, "XML:", !!xmlUrl, "esHikvision:", esHikvision, "totalMsgs:", recentUserMsgs.length);

      // Para Hikvision (en Reset): requiere ambos archivos
      if (esHikvision && temaSupervisor === "Reset") {
        if (!imagenUrl && !xmlUrl) {
          const retry = "Por favor, adjunte la imagen de la etiqueta del equipo y el archivo XML.";
          const newMsg: HistMsg = { role: "ia", author: "Asistente Sekunet", time: new Date().toISOString(), content: retry };
          await db.from("sek_cases").update({ histtecnico: [...histtecnico, newMsg] }).eq("id", case_id);
          return new Response(JSON.stringify({ ok: true, reply: retry }), { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });
        }
        if (!imagenUrl) {
          const retry = "Por favor, adjunte una imagen clara y legible de la etiqueta del equipo.";
          const newMsg: HistMsg = { role: "ia", author: "Asistente Sekunet", time: new Date().toISOString(), content: retry };
          await db.from("sek_cases").update({ histtecnico: [...histtecnico, newMsg] }).eq("id", case_id);
          return new Response(JSON.stringify({ ok: true, reply: retry }), { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });
        }
        if (!xmlUrl) {
          const retry = "Por favor, adjunte el archivo XML obtenido con SAPD Tools.";
          const newMsg: HistMsg = { role: "ia", author: "Asistente Sekunet", time: new Date().toISOString(), content: retry };
          await db.from("sek_cases").update({ histtecnico: [...histtecnico, newMsg] }).eq("id", case_id);
          return new Response(JSON.stringify({ ok: true, reply: retry }), { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });
        }
      } else {
        if (!imagenUrl) {
          const retry = "Por favor, adjunte una imagen clara y legible de la etiqueta del equipo.";
          const newMsg: HistMsg = { role: "ia", author: "Asistente Sekunet", time: new Date().toISOString(), content: retry };
          await db.from("sek_cases").update({ histtecnico: [...histtecnico, newMsg] }).eq("id", case_id);
          return new Response(JSON.stringify({ ok: true, reply: retry }), { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });
        }
      }

      // Ambos archivos presentes → verificar cada uno
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
          console.error("[seka-whatsapp] Vision error:", e.message);
          motivoImagen = "no fue posible analizar la imagen";
        }

        let snXml = "";
        let xmlValido = false;
        try {
          const xmlResponse = await fetch(xmlUrl!);
          const xmlText = await xmlResponse.text();
          console.log("[seka-whatsapp] XML content (first 500):", xmlText.substring(0, 500));
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
              console.log("[seka-whatsapp] S/N extraído del XML con patrón:", pat.source, "->", snXml);
              break;
            }
          }
          if (!snXml) {
            console.log("[seka-whatsapp] No se encontró S/N con regex, usando LLM...");
            const xmlMessages: NimMessage[] = [
              { role: "system", content: `Extrae el número de serie del siguiente XML. Responde SOLO con el S/N, nada más. Si no hay S/N, responde "NONE".` },
              { role: "user", content: xmlText.substring(0, 4000) },
            ];
            const xmlRaw = await callAIWithFallbacks(xmlMessages);
            const cleaned = xmlRaw.trim().replace(/["`]/g, "");
            if (cleaned && cleaned !== "NONE" && cleaned.length > 3 && cleaned.length < 50) {
              snXml = cleaned;
              xmlValido = true;
              console.log("[seka-whatsapp] S/N extraído del XML con LLM:", snXml);
            } else {
              motivoXml = "no se encontró un número de serie válido en el archivo XML";
            }
          }
        } catch (e: any) {
          console.error("[seka-whatsapp] XML error:", e.message);
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

        console.log("[seka-whatsapp] S/N - imagen:", JSON.stringify(snImagen), "XML:", JSON.stringify(snXml), "coinciden:", snCoinciden);

        if (imagenOk && xmlOk && snCoinciden) {
          const M02_TEXT = "Agradecemos su preferencia. En un momento será atendido por uno de nuestros agentes.";
          const newMsg: HistMsg = { role: "ia", author: "Asistente Sekunet", time: new Date().toISOString(), content: M02_TEXT };
          await db.from("sek_cases").update({
            histtecnico: [...histtecnico, newMsg],
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
          console.error("[seka-whatsapp] Vision error:", e.message);
          motivoImagen = "no fue posible analizar la imagen";
        }

        console.log("[seka-whatsapp] Verificación imagen (no Hikvision):", imagenOk);

        if (imagenOk) {
          const M02_TEXT = "Agradecemos su preferencia. En un momento será atendido por uno de nuestros agentes.";
          const newMsg: HistMsg = { role: "ia", author: "Asistente Sekunet", time: new Date().toISOString(), content: M02_TEXT };
          await db.from("sek_cases").update({
            histtecnico: [...histtecnico, newMsg],
            estado: "escalado",
            escalado_at: new Date().toISOString(),
            title: `${temaSupervisor} — ${marca} ${modelo}`.substring(0, 120),
            tags: [temaSupervisor === "Desvinculación" ? "desvinculacion" : "reset"],
          }).eq("id", case_id);
          return new Response(JSON.stringify({ ok: true, reply: M02_TEXT }), { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });
        }
      }

      // Si alguno falló → manejar reintentos
      const yaReintentoImagen = iaRealMsgs.some(m => m.content?.includes(MSG_RESET_PIDE_IMAGEN));
      const yaReintentoXML = iaRealMsgs.some(m => m.content?.includes(MSG_RESET_PIDE_XML));

      if (esHikvision && temaSupervisor === "Reset") {
        if (!imagenOk && !xmlOk) {
          if (yaReintentoImagen && yaReintentoXML) {
            const M02_TEXT = "Agradecemos su preferencia. En un momento será atendido por uno de nuestros agentes.";
            const newMsg: HistMsg = { role: "ia", author: "Asistente Sekunet", time: new Date().toISOString(), content: M02_TEXT };
            await db.from("sek_cases").update({
              histtecnico: [...histtecnico, newMsg], estado: "escalado", escalado_at: new Date().toISOString(),
              title: `${temaSupervisor} — ${marca} ${modelo} — verificación pendiente`.substring(0, 120),
              tags: ["reset", "verificacion_pendiente"],
            }).eq("id", case_id);
            return new Response(JSON.stringify({ ok: true, reply: M02_TEXT }), { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });
          }
          const retry = `Le informamos que ${motivoImagen} y ${motivoXml}. Por favor, adjunte nuevamente ambos archivos.`;
          const newMsg: HistMsg = { role: "ia", author: "Asistente Sekunet", time: new Date().toISOString(), content: retry };
          await db.from("sek_cases").update({ histtecnico: [...histtecnico, newMsg] }).eq("id", case_id);
          return new Response(JSON.stringify({ ok: true, reply: retry }), { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });
        }
        if (!imagenOk) {
          if (yaReintentoImagen) {
            const M02_TEXT = "Agradecemos su preferencia. En un momento será atendido por uno de nuestros agentes.";
            const newMsg: HistMsg = { role: "ia", author: "Asistente Sekunet", time: new Date().toISOString(), content: M02_TEXT };
            await db.from("sek_cases").update({
              histtecnico: [...histtecnico, newMsg], estado: "escalado", escalado_at: new Date().toISOString(),
              title: `${temaSupervisor} — ${marca} ${modelo} — imagen pendiente`.substring(0, 120),
              tags: ["reset", "imagen_pendiente"],
            }).eq("id", case_id);
            return new Response(JSON.stringify({ ok: true, reply: M02_TEXT }), { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });
          }
          const retry = `Le informamos que ${motivoImagen}. Por favor, adjunte nuevamente una imagen clara de la etiqueta del equipo.`;
          const newMsg: HistMsg = { role: "ia", author: "Asistente Sekunet", time: new Date().toISOString(), content: retry };
          await db.from("sek_cases").update({ histtecnico: [...histtecnico, newMsg] }).eq("id", case_id);
          return new Response(JSON.stringify({ ok: true, reply: retry }), { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });
        }
        if (!xmlOk) {
          if (yaReintentoXML) {
            const M02_TEXT = "Agradecemos su preferencia. En un momento será atendido por uno de nuestros agentes.";
            const newMsg: HistMsg = { role: "ia", author: "Asistente Sekunet", time: new Date().toISOString(), content: M02_TEXT };
            await db.from("sek_cases").update({
              histtecnico: [...histtecnico, newMsg], estado: "escalado", escalado_at: new Date().toISOString(),
              title: `${temaSupervisor} — ${marca} ${modelo} — XML pendiente`.substring(0, 120),
              tags: ["reset", "xml_pendiente"],
            }).eq("id", case_id);
            return new Response(JSON.stringify({ ok: true, reply: M02_TEXT }), { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });
          }
          const retry = `Le informamos que ${motivoXml}. Por favor, adjunte nuevamente el archivo XML.`;
          const newMsg: HistMsg = { role: "ia", author: "Asistente Sekunet", time: new Date().toISOString(), content: retry };
          await db.from("sek_cases").update({ histtecnico: [...histtecnico, newMsg] }).eq("id", case_id);
          return new Response(JSON.stringify({ ok: true, reply: retry }), { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });
        }
      } else {
        if (!imagenOk) {
          if (yaReintentoImagen) {
            const M02_TEXT = "Agradecemos su preferencia. En un momento será atendido por uno de nuestros agentes.";
            const newMsg: HistMsg = { role: "ia", author: "Asistente Sekunet", time: new Date().toISOString(), content: M02_TEXT };
            await db.from("sek_cases").update({
              histtecnico: [...histtecnico, newMsg], estado: "escalado", escalado_at: new Date().toISOString(),
              title: `${temaSupervisor} — ${marca} ${modelo} — imagen pendiente`.substring(0, 120),
              tags: [temaSupervisor === "Desvinculación" ? "desvinculacion" : "reset", "imagen_pendiente"],
            }).eq("id", case_id);
            return new Response(JSON.stringify({ ok: true, reply: M02_TEXT }), { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });
          }
          const retry = `Le informamos que ${motivoImagen}. Por favor, adjunte nuevamente una imagen clara de la etiqueta del equipo.`;
          const newMsg: HistMsg = { role: "ia", author: "Asistente Sekunet", time: new Date().toISOString(), content: retry };
          await db.from("sek_cases").update({ histtecnico: [...histtecnico, newMsg] }).eq("id", case_id);
          return new Response(JSON.stringify({ ok: true, reply: retry }), { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });
        }
      }
    }

    // Construir mensajes y llamar a Llama (solo para fallback si el supervisor no dio respuesta)
    let rawReply = supervisorResult?.respuesta_sugerida || "Estamos validando su solicitud, deme un momento por favor.";
    console.log("[seka-whatsapp] Raw reply:", rawReply);

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
        console.log("[seka-whatsapp] Reply tras inventario:", rawReply);
      }
    }

    // Reemplazar etiquetas de mensaje por su texto exacto
    const M02 = "Agradecemos su preferencia. En un momento será atendido por uno de nuestros agentes.";
    const M03 = "Ha sido un gusto atenderle. Si tiene alguna otra consulta, no dude en contactarnos nuevamente. ¡Que tenga un excelente día!";
    const M04 = "Agradecemos mucho su interés.\n\nLe informamos que su consulta corresponde al Departamento de Ventas. Con gusto podrán asistirle a través de los siguientes medios:\n\n• Teléfono: +506 2290 5585\n• WhatsApp: +506 8757 5820\n• Correo electrónico: info@sekunet.com\n\nSerá un gusto atenderle por cualquiera de estos canales.\n\n¡Le deseamos un excelente día!";
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

    // Guardar respuesta en histtecnico
    const newMsg: HistMsg = {
      role: "ia",
      author: "Asistente Sekunet",
      time: new Date().toISOString(),
      content: cleanReply,
    };

    const updatedHist = [...histtecnico, newMsg];
    await db.from("sek_cases").update({ histtecnico: updatedHist }).eq("id", case_id);

    return new Response(JSON.stringify({ ok: true, reply: cleanReply }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });

  } catch (e: any) {
    console.error("[seka-whatsapp] ERROR CRITICO:", e.message);
    
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
        const updatedHist = [...globalHistTecnico, newMsg];
        await db.from("sek_cases").update({
          histtecnico: updatedHist,
          estado: "escalado",
          escalado_at: new Date().toISOString(),
          n2_reason: "Falla crítica de IA (Panic Fallback)",
        }).eq("id", globalCaseId);
        
        console.warn(`[seka-whatsapp] Paracaídas activado para el caso ${globalCaseId}`);
        // Retornamos 200 con el mensaje de pánico para que no se quede colgado
        return new Response(JSON.stringify({ ok: true, reply: M02_PANIC }), {
          status: 200,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      } catch (panicError: any) {
        console.error("[seka-whatsapp] Falla en el paracaídas de emergencia:", panicError.message);
      }
    }
    
    return new Response(JSON.stringify({ error: e.message }), { status: 500, headers: corsHeaders });
  }
});


