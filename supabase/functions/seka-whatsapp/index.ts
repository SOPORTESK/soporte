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

PASO 0 — BIENVENIDA YA ENVIADA
El cliente ya recibió el saludo y se le solicitó su nombre, correo y cuenta. NO vuelva a saludar.

PASO 1 — SOLICITAR TEMA DE CONSULTA
Diga exactamente: "¿En relación con qué tema sería su consulta?"
Temas disponibles: Configuraciones, Reset, Desvinculación, Firmware, Software, Drivers, Licencias, Otro.

PASO 2 — SOLICITAR MARCA
Diga exactamente: "Por favor, indíquenos la marca del equipo."

PASO 3 — SOLICITAR MODELO
Diga exactamente: "¿Nos podría indicar el modelo del equipo, por favor?"

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
  → Si el cliente dice Sí → diga: "Por favor, describa brevemente su consulta." → después M02 y emita [ESCALAR_N2]
  → Si el cliente dice No → diga M03 y emita [CERRAR]

Si SÍ está en cartera → diga M02 y emita [ESCALAR_N2]

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
  const tema = temaMsg ? (resolveTopicFromText(temaMsg.content?.trim() ?? "") ?? "Configuraciones") : "Configuraciones";

  // Construir system prompt con el tema inyectado
  const systemWithTema = SYSTEM_PROMPT.replace("{{TEMA}}", tema)
    + `\n\nEl cliente seleccionó el tema: ${tema}. Inicie el flujo correspondiente.`;

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
      const msg2 = "Por favor, compártanos la siguiente información:\n• Nombre completo\n• Correo electrónico\n• Nombre de la cuenta afiliada a Sekunet";
      const newMsg0: HistMsg = { role: "ia", author: "Asistente Sekunet", time: new Date().toISOString(), content: directReply };
      const newMsg1: HistMsg = { role: "ia", author: "Asistente Sekunet", time: new Date(Date.now() + 10).toISOString(), content: msg1 };
      const newMsg2: HistMsg = { role: "ia", author: "Asistente Sekunet", time: new Date(Date.now() + 20).toISOString(), content: msg2 };
      await db.from("sek_cases").update({ histtecnico: [...histtecnico, newMsg0, newMsg1, newMsg2] }).eq("id", case_id);
      return new Response(JSON.stringify({ ok: true, reply: [directReply, msg1, msg2] }), { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    // ═══════════════════════════════════════════════════════════════════════
    // SUPERVISOR DE IA — Analiza cada mensaje del usuario con inteligencia
    // ═══════════════════════════════════════════════════════════════════════

    // ── Paso 1: Construir resumen de la conversación para el Supervisor ──
    const conversationSummary = allMsgs.map(m => {
      const who = m.role === "user" ? "CLIENTE" : "ASISTENTE";
      const hasMedia = m.mediaUrl ? ` [ADJUNTO: ${m.mediaType || "archivo"}${m.fileName ? " — " + m.fileName : ""}]` : "";
      return `${who}: ${m.content || "(sin texto)"}${hasMedia}`;
    }).join("\n");

    // ── Paso 2: Consultar al Supervisor de IA ──
    const supervisorPrompt = `Eres el Supervisor Inteligente del chat de soporte de Sekunet (Costa Rica). Tu trabajo es ANALIZAR la conversación completa y decidir qué información ya se recopiló y cuál falta.

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

REGLAS DE ANÁLISIS:
- Si el cliente envió un código como "DS-3E0505P-E-M", "NVR-108MH", "IPC-T221H" eso es un MODELO, no una marca. Los modelos suelen tener guiones, números y letras mezclados.
- Si el cliente envió una sola palabra como "Hikvision", "Dahua", "Epcom", "ZKTeco", eso es una MARCA.
- Si el cliente envió marca y modelo juntos (ej: "Hikvision DS-2CD2143G2-I"), extrae ambos.
- Si el cliente envía un modelo sin marca, intenta inferir la marca por el prefijo (DS- = Hikvision, IPC-/NVR- puede ser Dahua, etc.).
- Si el cliente ya proporcionó datos en mensajes anteriores, no los pidas de nuevo.
- Si el cliente pide hablar con una persona/agente/humano, marca accion como "ESCALAR_INMEDIATO".
- Si el cliente se despide (adiós, gracias, hasta luego), marca accion como "CERRAR".
- Analiza errores tipográficos: "Hikvission" = "Hikvision", "Daua" = "Dahua".

Responde SOLO con JSON válido:
{
  "nombre": "nombre extraído o vacío",
  "correo": "correo extraído o vacío",
  "cuenta": "cuenta/empresa extraída o vacía",
  "tema": "uno de: Configuraciones|Reset|Desvinculación|Firmware|Software|Drivers|Licencias|Otro|null",
  "marca": "marca detectada o inferida, o vacío",
  "modelo": "modelo detectado, o vacío",
  "tiene_imagen": true/false,
  "tiene_xml": true/false,
  "descripcion_problema": "si el cliente ya describió su problema, ponerlo aquí, sino vacío",
  "accion": "una de: PEDIR_DATOS|PEDIR_TEMA|PEDIR_MARCA|PEDIR_MODELO|PEDIR_MARCA_Y_MODELO|BUSCAR_INVENTARIO|PEDIR_ETIQUETA|PEDIR_ETIQUETA_Y_XML|PEDIR_DESCRIPCION|ESCALAR|ESCALAR_INMEDIATO|CERRAR|CONTINUAR",
  "razon": "explicación breve de por qué elegiste esa acción",
  "respuesta_sugerida": "la respuesta que debería enviar el asistente al cliente (máx 2 oraciones, formal, sin emojis, tratando de usted)"
}`;

    let supervisorResult: any = null;
    try {
      const supervisorMessages: NimMessage[] = [
        { role: "system", content: supervisorPrompt },
        { role: "user", content: "Analiza la conversación y decide la siguiente acción." },
      ];
      const supervisorRaw = await callLlama(supervisorMessages);
      console.log("[seka-whatsapp] Supervisor raw:", supervisorRaw);
      const jsonMatch = supervisorRaw.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        supervisorResult = JSON.parse(jsonMatch[0]);
        console.log("[seka-whatsapp] Supervisor result:", JSON.stringify(supervisorResult));
      }
    } catch (e: any) {
      console.error("[seka-whatsapp] Supervisor error:", e.message);
    }

    // ── Si el supervisor falló, usar fallback con el flujo anterior ──
    if (!supervisorResult) {
      console.warn("[seka-whatsapp] Supervisor falló, usando LLM directo como fallback");
      const messages = buildMessages(histcliente, null);
      let rawReply = await callLlama(messages);
      let cleanReply = await processTags(rawReply, case_id);
      cleanReply = cleanReply.replace(/__INV__.*?__INV__/gs, "").trim();
      if (!cleanReply) return new Response(JSON.stringify({ ok: true, skipped: true }), { status: 200, headers: corsHeaders });
      const newMsg: HistMsg = { role: "ia", author: "Asistente Sekunet", time: new Date().toISOString(), content: cleanReply };
      await db.from("sek_cases").update({ histtecnico: [...histtecnico, newMsg] }).eq("id", case_id);
      return new Response(JSON.stringify({ ok: true, reply: cleanReply }), { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    // ── Paso 3: Actualizar datos del cliente si el supervisor extrajo nuevos ──
    const currentCliente = (caso.cliente && typeof caso.cliente === "object") ? caso.cliente : {};
    const updatedCliente: Record<string, unknown> = { ...currentCliente };
    let clienteChanged = false;
    
    if (supervisorResult.nombre && !(currentCliente as any).nombre) {
      updatedCliente.nombre = supervisorResult.nombre;
      clienteChanged = true;
    }
    if (supervisorResult.correo && !(currentCliente as any).correo) {
      updatedCliente.correo = supervisorResult.correo;
      clienteChanged = true;
    }
    if (supervisorResult.cuenta && !(currentCliente as any).cuenta) {
      // Fuzzy match para la cuenta
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
    }

    // Actualizar título si tenemos nombre
    const nuevoTitle = (updatedCliente.nombre)
      ? `WhatsApp — ${updatedCliente.nombre}`
      : undefined;

    // ── Paso 4: Ejecutar la ACCIÓN que decidió el Supervisor ──
    const accion = (supervisorResult.accion || "CONTINUAR").toUpperCase();
    const marcaSupervisor = supervisorResult.marca || "";
    const modeloSupervisor = supervisorResult.modelo || "";
    const temaSupervisor = supervisorResult.tema || tema;

    console.log(`[seka-whatsapp] Supervisor acción: ${accion}, marca: ${marcaSupervisor}, modelo: ${modeloSupervisor}, tema: ${temaSupervisor}`);

    // ── ACCIÓN: CERRAR ──
    if (accion === "CERRAR") {
      const M03_TEXT = "Ha sido un gusto atenderle. Si tiene alguna otra consulta, no dude en contactarnos nuevamente. ¡Que tenga un excelente día!";
      const newMsg: HistMsg = { role: "ia", author: "Asistente Sekunet", time: new Date().toISOString(), content: M03_TEXT };
      const upd: Record<string, unknown> = { histtecnico: [...histtecnico, newMsg], estado: "cerrado" };
      if (clienteChanged) upd.cliente = updatedCliente;
      await db.from("sek_cases").update(upd).eq("id", case_id);
      return new Response(JSON.stringify({ ok: true, reply: M03_TEXT }), { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    // ── ACCIÓN: ESCALAR INMEDIATO (cliente pidió hablar con un humano) ──
    if (accion === "ESCALAR_INMEDIATO") {
      const M02_TEXT = "Agradecemos su preferencia. En un momento será atendido por uno de nuestros agentes.";
      const newMsg: HistMsg = { role: "ia", author: "Asistente Sekunet", time: new Date().toISOString(), content: M02_TEXT };
      const upd: Record<string, unknown> = {
        histtecnico: [...histtecnico, newMsg],
        estado: "escalado",
        escalado_at: new Date().toISOString(),
        n2_reason: "Solicitud directa del cliente",
      };
      if (clienteChanged) upd.cliente = updatedCliente;
      if (nuevoTitle) upd.title = nuevoTitle;
      await db.from("sek_cases").update(upd).eq("id", case_id);
      return new Response(JSON.stringify({ ok: true, reply: M02_TEXT }), { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    // ── ACCIÓN: PEDIR DATOS (nombre, correo, cuenta) ──
    if (accion === "PEDIR_DATOS") {
      const directReply = supervisorResult.respuesta_sugerida || "Por favor, compártanos la siguiente información:\n• Nombre completo\n• Correo electrónico\n• Nombre de la cuenta afiliada a Sekunet";
      const newMsg: HistMsg = { role: "ia", author: "Asistente Sekunet", time: new Date().toISOString(), content: directReply };
      const upd: Record<string, unknown> = { histtecnico: [...histtecnico, newMsg] };
      if (clienteChanged) upd.cliente = updatedCliente;
      await db.from("sek_cases").update(upd).eq("id", case_id);
      return new Response(JSON.stringify({ ok: true, reply: directReply }), { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    // ── ACCIÓN: PEDIR TEMA ──
    if (accion === "PEDIR_TEMA") {
      const directReply = `¿En relación con qué tema sería su consulta?\n\n1. Configuraciones\n2. Reset\n3. Desvinculación\n4. Firmware\n5. Software\n6. Drivers\n7. Licencias\n8. Otro\n\nResponda con el número o el nombre del tema.`;
      const newMsg: HistMsg = { role: "ia", author: "Asistente Sekunet", time: new Date().toISOString(), content: directReply };
      const upd: Record<string, unknown> = { histtecnico: [...histtecnico, newMsg] };
      if (clienteChanged) upd.cliente = updatedCliente;
      if (nuevoTitle) upd.title = nuevoTitle;
      await db.from("sek_cases").update(upd).eq("id", case_id);
      return new Response(JSON.stringify({ ok: true, reply: directReply }), { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    // ── ACCIÓN: PEDIR MARCA ──
    if (accion === "PEDIR_MARCA") {
      const directReply = supervisorResult.respuesta_sugerida || "Por favor, indíquenos la marca del equipo.";
      const newMsg: HistMsg = { role: "ia", author: "Asistente Sekunet", time: new Date().toISOString(), content: directReply };
      const upd: Record<string, unknown> = { histtecnico: [...histtecnico, newMsg] };
      if (clienteChanged) upd.cliente = updatedCliente;
      await db.from("sek_cases").update(upd).eq("id", case_id);
      return new Response(JSON.stringify({ ok: true, reply: directReply }), { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    // ── ACCIÓN: PEDIR MODELO ──
    if (accion === "PEDIR_MODELO") {
      const directReply = supervisorResult.respuesta_sugerida || "¿Nos podría indicar el modelo del equipo, por favor?";
      const newMsg: HistMsg = { role: "ia", author: "Asistente Sekunet", time: new Date().toISOString(), content: directReply };
      const upd: Record<string, unknown> = { histtecnico: [...histtecnico, newMsg] };
      if (clienteChanged) upd.cliente = updatedCliente;
      await db.from("sek_cases").update(upd).eq("id", case_id);
      return new Response(JSON.stringify({ ok: true, reply: directReply }), { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    // ── ACCIÓN: PEDIR MARCA Y MODELO (cuando no tiene ninguno) ──
    if (accion === "PEDIR_MARCA_Y_MODELO") {
      const directReply = supervisorResult.respuesta_sugerida || "Por favor, indíquenos la marca y el modelo del equipo.";
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
      const directReply = supervisorResult.respuesta_sugerida || "Por favor, adjunte una imagen clara y legible de la etiqueta del equipo.";
      const newMsg: HistMsg = { role: "ia", author: "Asistente Sekunet", time: new Date().toISOString(), content: directReply };
      const upd: Record<string, unknown> = { histtecnico: [...histtecnico, newMsg] };
      if (clienteChanged) upd.cliente = updatedCliente;
      await db.from("sek_cases").update(upd).eq("id", case_id);
      return new Response(JSON.stringify({ ok: true, reply: directReply }), { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    // ── ACCIÓN: PEDIR ETIQUETA Y XML (Reset Hikvision) ──
    if (accion === "PEDIR_ETIQUETA_Y_XML") {
      const directReply = supervisorResult.respuesta_sugerida || "Como parte de los requisitos del fabricante, requerimos una imagen clara y legible de la etiqueta del equipo y el archivo XML, el cual puede obtener mediante la herramienta SAPD Tools en la opción \"Olvidé mi contraseña\", ubicada en la parte inferior derecha del software. Por favor, adjunte ambos archivos.";
      const newMsg: HistMsg = { role: "ia", author: "Asistente Sekunet", time: new Date().toISOString(), content: directReply };
      const upd: Record<string, unknown> = { histtecnico: [...histtecnico, newMsg] };
      if (clienteChanged) upd.cliente = updatedCliente;
      await db.from("sek_cases").update(upd).eq("id", case_id);
      return new Response(JSON.stringify({ ok: true, reply: directReply }), { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    // ── ACCIÓN: PEDIR DESCRIPCIÓN (temas que no son Reset/Desvinculación) ──
    if (accion === "PEDIR_DESCRIPCION") {
      const directReply = supervisorResult.respuesta_sugerida || "Por favor, describa brevemente el inconveniente que presenta.";
      const newMsg: HistMsg = { role: "ia", author: "Asistente Sekunet", time: new Date().toISOString(), content: directReply };
      const upd: Record<string, unknown> = { histtecnico: [...histtecnico, newMsg] };
      if (clienteChanged) upd.cliente = updatedCliente;
      await db.from("sek_cases").update(upd).eq("id", case_id);
      return new Response(JSON.stringify({ ok: true, reply: directReply }), { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    // ── ACCIÓN: ESCALAR (todo listo, pasar a humano) ──
    if (accion === "ESCALAR") {
      const M02_TEXT = "Agradecemos su preferencia. En un momento será atendido por uno de nuestros agentes.";
      const newMsg: HistMsg = { role: "ia", author: "Asistente Sekunet", time: new Date().toISOString(), content: M02_TEXT };
      const upd: Record<string, unknown> = {
        histtecnico: [...histtecnico, newMsg],
        estado: "escalado",
        escalado_at: new Date().toISOString(),
      };
      if (clienteChanged) upd.cliente = updatedCliente;
      if (marcaSupervisor || modeloSupervisor) {
        upd.title = `${temaSupervisor} — ${marcaSupervisor} ${modeloSupervisor}`.trim().substring(0, 120);
      } else if (nuevoTitle) {
        upd.title = nuevoTitle;
      }
      await db.from("sek_cases").update(upd).eq("id", case_id);
      return new Response(JSON.stringify({ ok: true, reply: M02_TEXT }), { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });
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
        
        let aiReply = await callLlama(msgs);
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
          const visionRaw = await callLlama(visionMessages);
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
            const xmlRaw = await callLlama(xmlMessages);
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
          const visionRaw = await callLlama(visionMessages);
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

    // Construir mensajes y llamar a Llama
    const messages = buildMessages(histcliente, null);
    let rawReply = await callLlama(messages);
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
        rawReply = await callLlama(messages2);
        console.log("[seka-whatsapp] Reply tras inventario:", rawReply);
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
