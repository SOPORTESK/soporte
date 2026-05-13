import { createClient } from "npm:@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
const GEMINI_FALLBACK_MODEL = "gemini-2.0-flash";
const GEMINI_API_KEY = Deno.env.get("GEMINI_API_KEY") ?? "";

const db = createClient(SUPABASE_URL, SERVICE_KEY);

// Modelos de Gemini según caso de uso
const GEMINI_CHAT_MODEL = "gemini-3.1-flash-lite";   // confirmado funcional con key actual
const GEMINI_VISION_MODEL = "gemini-3.1-flash-lite"; // visión y multimedia
const GEMINI_IMAGE_MODEL = "gemini-3.1-flash-lite";  // imágenes

const FALLBACK_PROMPT = `Usted es SEKA, especialista de soporte tecnico de Sekunet (Costa Rica). Se comporta como un profesional humano: elegante, cordial, preciso. Trate siempre de usted. Sin emojis. No invente informacion tecnica. Nunca use la palabra "humano" ni "asistente virtual" para referirse a usted mismo ni a sus colegas.

## REGLA DE BREVEDAD — OBLIGATORIA

Cada respuesta debe tener máximo 2 oraciones. Una pregunta, una instrucción, o una respuesta directa. Nunca párrafos largos. El cliente puede estar manejando, caminando o con prisa. Si necesita dar varias instrucciones, delas de una en una, espere respuesta, luego continúe.

## REGLAS DE PRIORIDAD ABSOLUTA — EVALÚE PRIMERO, ANTES DE CUALQUIER OTRA ACCIÓN

SI el cliente dice cualquier variación de "quiero hablar con alguien", "con una persona", "con un técnico", "con soporte especializado", "no me sirve", "están inútiles", o expresa frustración repetida:
→ ACCIÓN: [ESCALAR_N2: solicitud de atención personalizada]
→ NO pregunte marca/modelo. NO continúe diagnóstico. Escale de inmediato.

SI el cliente ya recibió dos rondas de diagnóstico sin resolver:
→ ACCIÓN: [ESCALAR_N2: diagnóstico sin resolución en dos ciclos]

SI el problema requiere presencia física o es una desvinculación:
→ ACCIÓN: [ESCALAR_N2: requiere intervención física o desvinculación]

## POLÍTICA DE SOPORTE — LEA CON ATENCIÓN

Sekunet ÚNICAMENTE brinda soporte técnico a equipos que distribuye y vende directamente. Esta política es ABSOLUTA y no tiene excepciones.

REGLA 1 — EQUIPO DEL CLIENTE NO EN CARTERA:
Si el cliente solicita soporte para un equipo cuya marca NO se encuentra en el inventario de Sekunet, responda:
"Lamentablemente no brindamos soporte técnico para equipos de la marca [marca indicada], ya que no forma parte de nuestro catálogo de distribución. No podemos garantizar su correcto funcionamiento ni su compatibilidad con otros dispositivos. Si tiene alguna consulta sobre equipos que adquirió con nosotros, con gusto le atendemos."
→ NO continúe el diagnóstico. NO busque soluciones alternativas. NO acepte el caso aunque el cliente mencione que también tiene un equipo Sekunet.

REGLA 2 — INTEGRACIÓN CON EQUIPOS DE TERCEROS:
Si el cliente tiene un equipo Sekunet y solicita ayuda para integrarlo o hacerlo funcionar con un equipo de otra marca, responda:
"Sekunet no puede garantizar el funcionamiento correcto de nuestros dispositivos en conjunto con equipos de marcas que no distribuimos. Le recomendamos consultar directamente al fabricante del equipo de tercero. Si tiene alguna consulta específica sobre la configuración propia del equipo Sekunet, con gusto le atendemos."
→ NO entre en diagnóstico de integración. NO pida modelo del equipo de tercero. La solicitud de soporte debe ser EXCLUSIVAMENTE sobre el equipo Sekunet.

## TAGS FUNCIONALES DEL SISTEMA (use solo el tag, sin texto adicional)

[BUSCAR_INVENTARIO: marca modelo] — cuando el cliente indique marca y modelo de un equipo para verificar si está en cartera
[BUSCAR_WEB: consulta]           — cuando necesite información técnica externa
[ESCALAR_N2: motivo]             — cuando deba escalar a Soporte Avanzado
[CERRAR]                         — SOLO cuando el cliente se despida explícitamente con frases como "gracias", "hasta luego", "no necesito más ayuda", "listo". NUNCA use [CERRAR] por inactividad ni porque no haya respuesta del cliente.
[CLASIFICAR: categoria]          — cuando identifique el tipo de problema del cliente. Use UNA de estas categorías exactas: sin_imagen, sin_grabacion, sin_acceso_remoto, sin_energia, error_configuracion, conectividad_red, reset_contrasena, desvinculacion_cuenta, dano_fisico, actualizacion_firmware, instalacion_nueva, deteccion_incendio, control_acceso, intrusion_alarma, otro

Al escalar, use SIEMPRE este texto exacto (sin la palabra "humano"):
"Su caso ha sido escalado a nuestro equipo de Soporte Avanzado (Nivel 2), quienes cuentan con los recursos especializados para atender esta situación. Hemos etiquetado su caso como N2 para su seguimiento prioritario. A la brevedad le estarán atendiendo por este mismo medio."

## FLUJO DE ATENCIÓN

1. Solicite marca y modelo del equipo.
2. Con marca y modelo → use [BUSCAR_INVENTARIO: marca modelo] para verificar si está en cartera.
3. Si se encuentra en cartera → continúe con diagnóstico (síntoma, clasificación, pasos).
4. Si NO se encuentra → aplique REGLA 1. No continúe el caso.
5. Si el cliente menciona integración con equipo de otra marca → aplique REGLA 2.
6. En cuanto identifique el tipo de problema → emita [CLASIFICAR: categoria] en silencio (no al cliente).
7. Cierre ÚNICAMENTE cuando el cliente se despida explícitamente → [CERRAR]`;


async function loadSystemConfig(): Promise<{ prompt: string; iaActiva: boolean }> {
  try {
    const { data } = await db
      .from("sek_agent_config")
      .select("system_prompt, ia_activa")
      .eq("email", "system_prompt@sekunet.com")
      .maybeSingle();

    const prompt = data?.system_prompt?.trim() || FALLBACK_PROMPT;
    const iaActiva = data?.ia_activa ?? true;

    if (!data?.system_prompt?.trim()) {
      console.log("[ia-agent] WARNING: No se encontró prompt en BD, usando FALLBACK");
    } else {
      console.log(`[ia-agent] Prompt cargado: ${prompt.length} chars | ia_activa: ${iaActiva}`);
    }

    return { prompt, iaActiva };
  } catch (e: any) {
    console.error("[ia-agent] ERROR cargando config:", e.message);
    return { prompt: FALLBACK_PROMPT, iaActiva: true };
  }
}

function isWithinBusinessHours(): boolean {
  // Costa Rica: UTC-6
  const now = new Date();
  const cr = new Date(now.toLocaleString("en-US", { timeZone: "America/Costa_Rica" }));
  const day = cr.getDay(); // 0=Dom, 6=Sab
  const hour = cr.getHours();
  const minute = cr.getMinutes();
  const timeVal = hour * 60 + minute;
  if (day === 0 || day === 6) return false;
  return timeVal >= 7 * 60 + 30 && timeVal < 17 * 60;
}

interface ChatMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

// ── Gemini 1.5 Flash: motor principal para respuestas de texto a clientes (1.5M tokens/día gratis)
class GeminiRateLimitError extends Error {
  constructor() { super("gemini_rate_limit_exceeded"); this.name = "GeminiRateLimitError"; }
}

async function callGeminiChat(messages: ChatMessage[]): Promise<string> {
  if (!GEMINI_API_KEY) throw new Error("no_gemini_key");

  // Separar system del historial
  const systemMsg = messages.find(m => m.role === "system");
  const chatMsgs = messages.filter(m => m.role !== "system");

  const contents = chatMsgs.map(m => ({
    role: m.role === "assistant" ? "model" : "user",
    parts: [{ text: m.content }],
  }));

  const body: Record<string, unknown> = { contents, generationConfig: { temperature: 0.3, maxOutputTokens: 600 } };
  if (systemMsg) body.system_instruction = { parts: [{ text: systemMsg.content }] };

  const res = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_CHAT_MODEL}:generateContent?key=${GEMINI_API_KEY}`,
    { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }
  );

  if (!res.ok) {
    const errText = await res.text();
    console.error("[ia-agent] Gemini error:", res.status, errText);
    // Detectar rate limit específicamente
    if (res.status === 429 || errText.includes("rate limit") || errText.includes("RESOURCE_EXHAUSTED")) {
      throw new GeminiRateLimitError();
    }
    throw new Error(`gemini_error:${res.status}`);
  }

  const data = await res.json();
  return data.candidates?.[0]?.content?.parts?.[0]?.text?.trim() ?? "";
}

// ── Gemini 1.5 Flash: fallback si 3.1 Flash Lite no está disponible
async function callGeminiFallback(messages: ChatMessage[]): Promise<string> {
  if (!GEMINI_API_KEY) throw new Error("no_gemini_key");
  const systemMsg = messages.find(m => m.role === "system");
  const chatMsgs = messages.filter(m => m.role !== "system");
  const contents = chatMsgs.map(m => ({ role: m.role === "assistant" ? "model" : "user", parts: [{ text: m.content }] }));
  const body: Record<string, unknown> = { contents, generationConfig: { temperature: 0.3, maxOutputTokens: 600 } };
  if (systemMsg) body.system_instruction = { parts: [{ text: systemMsg.content }] };
  const res = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_FALLBACK_MODEL}:generateContent?key=${GEMINI_API_KEY}`,
    { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }
  );
  if (!res.ok) {
    const errText = await res.text();
    console.error("[ia-agent] Gemini fallback error:", res.status, errText);
    throw new Error(`gemini_fallback_error:${res.status}`);
  }
  const data = await res.json();
  return data.candidates?.[0]?.content?.parts?.[0]?.text?.trim() ?? "";
}

async function callAI(messages: ChatMessage[]): Promise<string> {
  try {
    return await callGeminiChat(messages);
  } catch (e: any) {
    console.warn("[ia-agent] Gemini 3.1 falló, usando fallback 1.5 Flash:", e.message);
    return await callGeminiFallback(messages);
  }
}

function getGeminiMimeType(mediaType: string, url: string): string {
  const cleanUrl = url.split("?")[0];
  const ext = cleanUrl.split(".").pop()?.toLowerCase() ?? "";
  const map: Record<string, string> = {
    jpg: "image/jpeg", jpeg: "image/jpeg", png: "image/png", gif: "image/gif",
    webp: "image/webp", bmp: "image/bmp", tiff: "image/tiff",
    mp4: "video/mp4", webm: "video/webm", mov: "video/quicktime", avi: "video/x-msvideo",
    mp3: "audio/mpeg", ogg: "audio/ogg", wav: "audio/wav", m4a: "audio/mp4", aac: "audio/aac",
    pdf: "application/pdf",
    txt: "text/plain", csv: "text/csv", html: "text/html",
    xml: "text/xml", json: "application/json",
    doc: "application/msword",
    docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    xls: "application/vnd.ms-excel",
    xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    ppt: "application/vnd.ms-powerpoint",
    pptx: "application/vnd.openxmlformats-officedocument.presentationml.presentation",
    zip: "application/zip",
  };
  const fromExt = map[ext];
  if (fromExt) return fromExt;
  if (mediaType && mediaType !== "application/octet-stream") return mediaType;
  return "application/octet-stream";
}

async function callGeminiVision(mediaUrl: string, mediaType: string, userText: string): Promise<string> {
  if (!GEMINI_API_KEY) return "";
  try {
    const mimeType = getGeminiMimeType(mediaType, mediaUrl);
    const isAudio = mimeType.startsWith("audio/");
    const isVideo = mimeType.startsWith("video/");
    const isImage = mimeType.startsWith("image/");
    const isPdf = mimeType === "application/pdf";
    const isText = mimeType.startsWith("text/") || ["application/json"].includes(mimeType);
    const isOffice = ["application/msword","application/vnd.openxmlformats-officedocument.wordprocessingml.document","application/vnd.ms-excel","application/vnd.openxmlformats-officedocument.spreadsheetml.sheet","application/vnd.ms-powerpoint","application/vnd.openxmlformats-officedocument.presentationml.presentation"].includes(mimeType);
    const isZip = mimeType === "application/zip";

    let modelName = GEMINI_IMAGE_MODEL;
    if (isVideo) {
      modelName = GEMINI_VISION_MODEL;
      console.log(`[ia-agent] Usando Gemini 3.1 Flash para video: ${mediaUrl}`);
    } else {
      console.log(`[ia-agent] Usando Gemini 1.5 Flash para ${mimeType}: ${mediaUrl}`);
    }

    let prompt = "";
    if (isImage) {
      prompt = `Eres un ingeniero senior especializado en sistemas de seguridad electrónica (CCTV, control de acceso, alarmas, DVR/NVR, cámaras IP). El cliente envió esta imagen${userText ? ` con el mensaje: "${userText}"` : ""}.

Realiza un análisis EXHAUSTIVO y PROFUNDO:

## IDENTIFICACIÓN DEL EQUIPO
- Marca exacta (lee etiquetas, logos, serigrafía)
- Modelo completo (transcribe el número de modelo tal como aparece)
- Número de serie si es visible
- Versión de firmware si aparece en pantalla
- Código de producto o SKU visible

## ANÁLISIS DEL PROBLEMA
- Describe EXACTAMENTE lo que ves: LEDs encendidos/apagados/parpadeando y su color
- Mensajes de error en pantalla (transcribe palabra por palabra)
- Indicadores de estado anormales
- Daños físicos visibles (quemaduras, humedad, golpes, corrosión)
- Comportamiento anormal observable

## ESTADO DE CONEXIONES
- Cables conectados/desconectados
- Puertos utilizados y libres
- Estado de terminales y conectores
- Alimentación eléctrica visible

## ENTORNO E INSTALACIÓN
- Tipo de instalación (interior/exterior, rack, pared)
- Condiciones ambientales visibles
- Otros equipos relacionados visibles

## DIAGNÓSTICO TÉCNICO PRELIMINAR
- Causa más probable del problema
- Causas secundarias posibles
- Urgencia: CRÍTICO / ALTO / MEDIO / BAJO

## ACCIONES RECOMENDADAS
Lista ordenada por prioridad de lo que el agente de soporte debe hacer o verificar.

Sé extremadamente preciso. Transcribe literalmente cualquier texto, número o código visible en la imagen.`;

    } else if (isPdf) {
      prompt = `Eres un experto técnico de Sekunet. El cliente adjuntó este documento PDF${userText ? ` con el mensaje: "${userText}"` : ""}.

Analiza COMPLETAMENTE el documento:
- Extrae TODOS los modelos de equipos mencionados
- Identifica errores, códigos de falla o alarmas
- Extrae configuraciones técnicas relevantes
- Identifica números de serie, IPs, credenciales mencionadas
- Resume el problema principal que reporta el cliente
- Identifica qué información es crítica para el soporte técnico`;

    } else if (isAudio) {
      prompt = `Eres un experto técnico de Sekunet. El cliente envió este audio${userText ? ` con el mensaje: "${userText}"` : ""}.

Transcribe COMPLETAMENTE el audio y luego analiza:
## TRANSCRIPCIÓN COMPLETA
[transcribe todo lo que dice el cliente]

## ANÁLISIS TÉCNICO
- Equipo o sistema mencionado (marca/modelo si lo dice)
- Síntomas descritos con exactitud
- Cuándo ocurrió el problema
- Qué ya intentó el cliente
- Nivel de urgencia percibido
- Información clave para el diagnóstico`;

    } else if (isVideo) {
      prompt = `Eres un experto técnico de Sekunet. El cliente envió este video${userText ? ` con el mensaje: "${userText}"` : ""}.

Analiza el video COMPLETAMENTE:
## IDENTIFICACIÓN VISUAL
- Equipo mostrado: marca, modelo, etiquetas visibles
- Estado físico del equipo

## PROBLEMA OBSERVABLE
- Describe EXACTAMENTE lo que ocurre en el video (segundo a segundo si es relevante)
- Mensajes de error visibles en pantalla
- Comportamiento anormal: parpadeos, reinicios, fallas

## AUDIO DEL VIDEO
- Transcribe lo que dice el cliente
- Sonidos anormales del equipo (pitidos, clicks, zumbidos)

## DIAGNÓSTICO
- Causa más probable
- Nivel de urgencia: CRÍTICO / ALTO / MEDIO / BAJO
- Acciones inmediatas recomendadas`;

    } else if (isText) {
      prompt = `Eres un experto técnico de Sekunet. El cliente adjuntó un archivo de texto/XML/JSON${userText ? ` con el mensaje: "${userText}"` : ""}.
Analiza el contenido COMPLETO:
- Extrae modelos de equipos, números de serie, IPs, credenciales mencionadas
- Identifica errores, códigos de falla, configuraciones técnicas
- Identifica el problema principal que reporta el cliente
- Extrae cualquier información clave para soporte técnico`;

    } else if (isOffice) {
      prompt = `Eres un experto técnico de Sekunet. El cliente adjuntó un documento Office (Word/Excel/PowerPoint)${userText ? ` con el mensaje: "${userText}"` : ""}.
Analiza el documento COMPLETAMENTE:
- Extrae TODOS los modelos de equipos y números de serie mencionados
- Identifica errores, códigos de falla o configuraciones técnicas
- Resume el problema principal
- Identifica información crítica para el soporte técnico`;

    } else if (isZip) {
      prompt = `El cliente adjuntó un archivo ZIP${userText ? ` con el mensaje: "${userText}"` : ""}. No es posible descomprimir el archivo directamente, pero indícale al agente que le informe al cliente que los archivos deben enviarse descomprimidos o como archivos individuales para poder analizarlos.`;

    } else {
      prompt = `Eres un experto técnico de Sekunet. El cliente adjuntó un archivo (tipo: ${mimeType})${userText ? ` con el mensaje: "${userText}"` : ""}. Analiza su contenido exhaustivamente e identifica toda información técnica relevante para soporte: equipos, errores, configuraciones, síntomas, urgencia.`;
    }

    // Descargar el archivo desde Supabase Storage y enviarlo como base64 inline_data
    // Gemini file_uri solo acepta URLs de Google Files API — para URLs externas hay que usar inline_data
    const fileRes = await fetch(mediaUrl);
    if (!fileRes.ok) {
      console.error("[ia-agent] Error descargando archivo:", fileRes.status, mediaUrl);
      return "";
    }
    const fileBuffer = await fileRes.arrayBuffer();
    const fileSizeKB = fileBuffer.byteLength / 1024;
    console.log(`[ia-agent] Archivo descargado: ${fileSizeKB.toFixed(1)} KB, tipo: ${mimeType}`);

    // Límite: 20MB para inline_data en Gemini
    if (fileBuffer.byteLength > 20 * 1024 * 1024) {
      console.warn("[ia-agent] Archivo demasiado grande para inline_data:", fileSizeKB.toFixed(1), "KB");
      return `El archivo adjunto supera el límite de procesamiento (20MB). Solicite al cliente que envíe una versión más pequeña o dividida.`;
    }

    const base64Data = btoa(String.fromCharCode(...new Uint8Array(fileBuffer)));

    const res = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${modelName}:generateContent?key=${GEMINI_API_KEY}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contents: [{
            parts: [
              { text: prompt },
              { inline_data: { mime_type: mimeType, data: base64Data } },
            ],
          }],
          generationConfig: { maxOutputTokens: 2048, temperature: 0.1 },
        }),
      }
    );

    if (!res.ok) {
      const errText = await res.text();
      console.error("[ia-agent] Gemini Vision error:", res.status, errText);
      return "";
    }
    const data = await res.json();
    return data.candidates?.[0]?.content?.parts?.[0]?.text?.trim() ?? "";
  } catch (e: any) {
    console.error("[ia-agent] Gemini Vision exception:", e.message);
    return "";
  }
}

async function searchInventory(query: string): Promise<any[]> {
  const terms = query
    .toLowerCase()
    .replace(/[^a-z0-9\s\-]/g, "")
    .split(/\s+/)
    .filter((t) => t.length >= 2);

  if (terms.length === 0) return [];

  let results: any[] = [];

  for (const term of terms) {
    const pattern = `%${term}%`;
    const { data } = await db
      .from("sek_inventario")
      .select("id, codigo, nombre, marca, modelo, categoria")
      .or(
        `marca.ilike.${pattern},modelo.ilike.${pattern},nombre.ilike.${pattern},codigo.ilike.${pattern}`
      )
      .limit(10);

    if (data && data.length > 0) {
      results = [...results, ...data];
    }
  }

  // Deduplicate by id
  const seen = new Set();
  return results.filter((r) => {
    if (seen.has(r.id)) return false;
    seen.add(r.id);
    return true;
  });
}

// ── Aprendizaje: al cerrar un caso, SEKA genera un resumen y lo guarda en RAG ──
async function learnFromConversation(caso: any, histcliente: any[]): Promise<void> {
  try {
    // Solo aprender si la conversación tiene al menos 4 mensajes (ida y vuelta mínima)
    if (histcliente.length < 4) return;

    // Construir resumen de la conversación
    const conversationText = histcliente
      .filter((m: any) => m.content && m.content.length > 5)
      .map((m: any) => `${m.role === "user" ? "CLIENTE" : "AGENTE"}: ${m.content}`)
      .slice(-20) // últimos 20 mensajes
      .join("\n");

    const clienteData = typeof caso.cliente === "object" ? caso.cliente : {};
    const equipo = clienteData?.equipo || caso.marca ? `${caso.marca || ""} ${caso.modelo || ""}`.trim() : "No identificado";
    const problema = caso.problema || "No clasificado";

    const prompt = `Analiza la siguiente conversación de soporte técnico y genera un resumen estructurado para aprendizaje futuro del sistema. El resumen debe ser CONCISO (máximo 300 palabras) e incluir:

1. TIPO DE CLIENTE: perfil del cliente (paciente, impaciente, técnico, novato, etc.)
2. EQUIPO: marca y modelo si se identificó
3. PROBLEMA: qué problema reportó
4. DIAGNÓSTICO: pasos que se siguieron
5. RESOLUCIÓN: cómo se resolvió (o si se escaló y por qué)
6. LECCIÓN APRENDIDA: qué debería hacer mejor SEKA la próxima vez con un caso similar

Conversación:
${conversationText}

Equipo identificado: ${equipo}
Problema clasificado: ${problema}`;

    const summary = await callAI([
      { role: "system", content: "Eres un analista de calidad de soporte técnico. Genera resúmenes concisos y accionables." },
      { role: "user", content: prompt },
    ]);

    if (!summary || summary.length < 50) return;

    // Guardar en sek_doc_chunks como conocimiento aprendido
    await db.from("sek_doc_chunks").insert({
      doc_id: null,
      doc_name: `Aprendizaje: ${equipo} — ${problema}`.substring(0, 200),
      content: summary.substring(0, 3000),
      source_label: "Aprendizaje de conversación",
    });

    console.log(`[ia-agent] Aprendizaje guardado para caso ${caso.id}: ${equipo} / ${problema}`);
  } catch (e: any) {
    // Aprendizaje es no-bloqueante — si falla, no afecta el flujo
    console.error("[ia-agent] Error en aprendizaje:", e.message);
  }
}

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const { case_id } = await req.json();
    if (!case_id) {
      return new Response(JSON.stringify({ error: "case_id required" }), {
        status: 400, headers: corsHeaders,
      });
    }

    // Fetch case
    const { data: caso, error: fetchErr } = await db
      .from("sek_cases")
      .select("id, estado, cliente, histcliente, histtecnico, tags, assigned_to")
      .eq("id", case_id)
      .maybeSingle();

    if (fetchErr || !caso) {
      return new Response(JSON.stringify({ error: "Case not found" }), {
        status: 404, headers: corsHeaders,
      });
    }

    // Procesar si: está siendo atendido por IA, O está escalado pero sin agente humano asignado aún
    const isEscaladoSinAgente = caso.estado === "escalado" && !caso.assigned_to;
    if (caso.estado !== "ia_atendiendo" && !isEscaladoSinAgente) {
      return new Response(JSON.stringify({ skip: true, reason: "not ia_atendiendo" }), {
        status: 200, headers: corsHeaders,
      });
    }

    const histcliente: any[] = Array.isArray(caso.histcliente)
      ? caso.histcliente
      : [];

    if (histcliente.length === 0) {
      return new Response(JSON.stringify({ skip: true, reason: "no messages" }), {
        status: 200, headers: corsHeaders,
      });
    }

    // Cuenta de pruebas permanente — siempre responde sin importar horario
    const TEST_ACCOUNTS = ["cesar andres batista vargas", "cesar batista"];
    const clienteName = (typeof caso.cliente === "object" ? caso.cliente?.nombre : caso.cliente || "").toLowerCase().trim();
    const isTestAccount = TEST_ACCOUNTS.some(t => clienteName.includes(t));

    // Verificar horario de atención (se omite para cuentas de prueba)
    if (!isWithinBusinessHours() && !isTestAccount) {
      const offMsg = "Gracias por contactar a Sekunet. Nuestro horario de atencion es de lunes a viernes de 7:30 a.m. a 5:00 p.m. En este momento no estamos disponibles. Con gusto le atendemos el proximo dia habil.";
      const offEntry = { role: "assistant", author: "SEKA", time: new Date().toISOString(), content: offMsg };
      await db.from("sek_cases").update({ histcliente: [...histcliente, offEntry] }).eq("id", case_id);
      return new Response(JSON.stringify({ ok: true, response: offMsg, escalated: false, closed: false }), { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    // Cargar prompt y flag ia_activa desde BD
    const { prompt: systemPrompt, iaActiva } = await loadSystemConfig();

    // Si el modo manual está activo, no intervenir — dejar para agentes humanos
    if (!iaActiva) {
      console.log("[ia-agent] ia_activa=false — modo manual activo, sin respuesta automática");
      await db.from("sek_cases").update({ estado: "escalado" }).eq("id", case_id);
      return new Response(JSON.stringify({ ok: true, skipped: true }), { headers: { "Content-Type": "application/json" } });
    }

    // ── Leer estados de agentes humanos ──
    const { data: agentStatuses } = await db
      .from("sek_agent_config")
      .select("nombre, apellido, rol, status")
      .neq("email", "system_prompt@sekunet.com");

    const statusLabels: Record<string, string> = {
      online: "En línea", away: "Ausente", busy: "Ocupado",
      lunch: "Almorzando", offline: "Desconectado",
    };

    let agentStatusContext = "";
    if (agentStatuses && agentStatuses.length > 0) {
      const lines = agentStatuses.map((a: any) => {
        const name = [a.nombre, a.apellido].filter(Boolean).join(" ") || "(sin nombre)";
        const st = statusLabels[a.status || "offline"] || a.status || "Desconectado";
        return `- ${name} (${a.rol}): ${st}`;
      });
      const onlineCount = agentStatuses.filter((a: any) => a.status === "online").length;
      const availableCount = agentStatuses.filter((a: any) => ["online", "busy"].includes(a.status || "")).length;
      agentStatusContext = `\n\nESTADOS DE AGENTES HUMANOS (${availableCount} disponibles, ${onlineCount} en línea):\n${lines.join("\n")}`;
    }

    const capabilitiesContext = `\n\nCAPACIDADES DEL SISTEMA:\n- Puedes analizar archivos multimedia que el cliente envíe: imágenes, audio, video, PDF y documentos de texto.\n- Tienes acceso a la Documentación Oficial Sekunet (manuales técnicos indexados). Cuando uses información de estos manuales, indícalo como [Fuente: Documentación Oficial Sekunet].\n- Puedes buscar información en la web. Cuando uses información obtenida de internet, indícalo como [Fuente: Búsqueda Web].\n- Puedes ver el estado de conexión de los agentes humanos en tiempo real.\n- Siempre distingue claramente entre información oficial de Sekunet y la obtenida de fuentes externas.`;

    // Si el caso ya está escalado, agregar contexto para que el agente no re-escale
    const escaladoContext = isEscaladoSinAgente
      ? `\n\nCONTEXTO ACTUAL: Este caso ya fue escalado a Soporte Avanzado. Un especialista humano está en camino pero aún no ha tomado el caso. Mientras tanto, SIGA ATENDIENDO al cliente con normalidad — responda sus dudas, mantenga la conversación activa y tranquilícelo si es necesario. NO vuelva a escalar. NO mencione que ya fue escalado a menos que el cliente lo pregunte.`
      : "";

    // Build conversation
    const systemContent = systemPrompt + agentStatusContext + capabilitiesContext + escaladoContext;
    console.log(`[ia-agent] System message length: ${systemContent.length} chars`);
    console.log(`[ia-agent] System message start: ${systemContent.substring(0, 150)}...`);
    
    const chatMessages: ChatMessage[] = [
      { role: "system", content: systemContent },
    ];

    for (const msg of histcliente) {
      if (msg.role === "user") {
        // Si el mensaje tiene archivo pero content vacío, usar fileName como descripción
        const userContent = msg.content?.trim()
          || (msg.mediaUrl ? `[Archivo adjunto: ${msg.fileName || msg.mediaType || "archivo"}]` : "");
        chatMessages.push({ role: "user", content: userContent });
      } else if (
        msg.role === "assistant" ||
        msg.role === "tecnico" ||
        msg.role === "ia"
      ) {
        chatMessages.push({ role: "assistant", content: msg.content || "" });
      }
    }

    // Check if last message is from user (otherwise no need to respond)
    const lastMsg = histcliente[histcliente.length - 1];
    if (lastMsg.role !== "user") {
      return new Response(JSON.stringify({ skip: true, reason: "last msg not from user" }), {
        status: 200, headers: corsHeaders,
      });
    }

    // If last user message has a media attachment, interpret it with Gemini first
    if (lastMsg.mediaUrl) {
      const geminiDescription = await callGeminiVision(
        lastMsg.mediaUrl,
        lastMsg.mediaType ?? "",
        lastMsg.content ?? ""
      );
      if (geminiDescription) {
        chatMessages.push({
          role: "system",
          content: `El cliente acaba de enviar un archivo adjunto (${lastMsg.fileName || lastMsg.mediaType || "archivo"}). Analisis completo del archivo:\n\n${geminiDescription}\n\nUsa este analisis para entender el problema tecnico del cliente. Si identificaste marca y modelo del equipo, usalo para buscar en inventario con [BUSCAR_INVENTARIO: marca modelo]. Continua el flujo de atencion normalmente basandote en esta informacion.`,
        });
      } else {
        // Gemini Vision falló — igual notificar al agente que hay un archivo
        chatMessages.push({
          role: "system",
          content: `El cliente acaba de enviar un archivo adjunto (${lastMsg.fileName || lastMsg.mediaType || "archivo"}) pero no fue posible analizarlo automáticamente. Infórmale al cliente que recibiste el archivo y pide que describa el problema con texto si el archivo no cargó correctamente.`,
        });
      }
    }

    // Llamar IA principal (Gemini 3.1 Flash Lite) con Gemini 1.5 Flash como fallback
    let aiResponse: string;
    try {
      aiResponse = await callAI(chatMessages);
    } catch (aiErr: any) {
      const isRateLimit = aiErr instanceof GeminiRateLimitError ||
                          aiErr.message === "gemini_rate_limit_exceeded" ||
                          aiErr.message === "gemini_rate_limit_exceeded";
      const fallbackMsg = isRateLimit
        ? "En este momento el asistente virtual tiene alta demanda y no puede atenderle. Un agente humano le atenderá en breve."
        : "En este momento tenemos un inconveniente técnico. Un agente humano le atenderá en breve.";

      const fallbackEntry = { role: "assistant", author: "Asistente Sekunet", time: new Date().toISOString(), content: fallbackMsg };
      await db.from("sek_cases").update({
        histcliente: [...histcliente, fallbackEntry],
        estado: "escalado",
      }).eq("id", case_id);

      return new Response(
        JSON.stringify({ ok: true, response: fallbackMsg, escalated: true, closed: false }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Check if AI wants to search inventory
    const searchMatch = aiResponse.match(/\[BUSCAR_INVENTARIO:\s*(.+?)\]/);
    let shouldEscalate = false;
    let shouldClose = false;

    if (searchMatch) {
      const searchQuery = searchMatch[1].trim();
      const results = await searchInventory(searchQuery);

      if (results.length === 1) {
        // Encontró exactamente uno — registrar equipo y continuar diagnóstico
        const r = results[0];
        const clienteData = typeof caso.cliente === "object" ? caso.cliente : {};
        const updatedCliente = {
          ...clienteData,
          equipo: `${r.marca} ${r.modelo}`,
          equipo_encontrado: true,
          equipo_match: `${r.marca || ""} ${r.modelo || ""} (${r.codigo || ""})`.trim(),
        };
        // Guardar marca, modelo y cat (tipo de equipo) directamente en el caso para estadísticas
        const equipoUpdates: Record<string, unknown> = {
          cliente: updatedCliente,
          marca: r.marca || null,
          modelo: r.modelo || null,
        };
        if (r.tipo || r.categoria) equipoUpdates.cat = r.tipo || r.categoria;
        await db.from("sek_cases").update(equipoUpdates).eq("id", case_id);
        // Inyectar resultado al modelo para que continúe el diagnóstico
        chatMessages.push({ role: "system", content: `[RESULTADO_INVENTARIO] Equipo encontrado en cartera: ${r.marca} ${r.modelo} (${r.codigo || ""}).\n\nContinúe con el Protocolo de Diagnóstico. NO escale aún. Pregunte al cliente por el síntoma si no lo ha dado.` });
        aiResponse = await callAI(chatMessages);
      } else if (results.length > 1) {
        // Encontró varios - ofrecer sugerencias
        const options = results.slice(0, 5).map(r => `${r.marca} ${r.modelo}`).join(", ");
        aiResponse = `He encontrado varias coincidencias para "${searchQuery}". Por favor, seleccione la correcta o bríndeme más detalles:\n\n[SUGERENCIAS: ${options}]`;
      } else {
        // No encontró nada
        aiResponse = `Lamentablemente "${searchQuery}" no se encuentra entre los equipos a los que brindamos soporte técnico. ¿Podría verificar la marca y modelo o desea que busque información en la web?`;
      }
    }

    // ==== ESCALAMIENTO EXPLÍCITO [ESCALAR_N2: motivo] o [ESCALAR: motivo] ====
    const escalateMatch = aiResponse.match(/\[ESCALAR(?:_N2)?:\s*(.+?)\]/);
    if (escalateMatch) {
      shouldEscalate = true;
      aiResponse = aiResponse.replace(/\[ESCALAR(?:_N2)?:.*?\]/g, "").trim();
    }

    // ==== CIERRE EXPLÍCITO [CERRAR] ====
    if (aiResponse.includes("[CERRAR]")) {
      shouldClose = true;
      aiResponse = aiResponse.replace("[CERRAR]", "").trim();
    }

    // ==== CLASIFICACIÓN DE PROBLEMA [CLASIFICAR: categoria] ====
    const clasificarMatch = aiResponse.match(/\[CLASIFICAR:\s*([a-z_]+)\]/);
    if (clasificarMatch) {
      const problema = clasificarMatch[1].trim();
      aiResponse = aiResponse.replace(/\[CLASIFICAR:\s*[a-z_]+\]/, "").trim();
      // Guardar inmediatamente sin esperar al update final
      await db.from("sek_cases").update({ problema }).eq("id", case_id);
    }

    // ==== BÚSQUEDA WEB [BUSCAR_WEB:] ====
    const webTagMatch = aiResponse.match(/\[BUSCAR_WEB:\s*(.+?)\]/);
    if (webTagMatch && !shouldEscalate) {
      const webQuery = webTagMatch[1].trim();
      try {
        const searchRes = await fetch(
          `https://generativelanguage.googleapis.com/v1beta/models/gemini-3.1-flash-lite:generateContent?key=${GEMINI_API_KEY}`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              contents: [{ parts: [{ text: `Busca informacion tecnica actualizada sobre: ${webQuery}. Responde en español, de forma concisa y precisa, enfocado en soporte tecnico de equipos de seguridad electronica.` }] }],
              generationConfig: { maxOutputTokens: 400, temperature: 0.2 },
              tools: [{ googleSearch: {} }],
            }),
          }
        );
        if (searchRes.ok) {
          const searchData = await searchRes.json();
          const webResult = searchData.candidates?.[0]?.content?.parts?.[0]?.text?.trim();
          if (webResult) {
            chatMessages.push({ role: "system", content: `[Fuente: Búsqueda Web] Resultado de busqueda web para "${webQuery}":\n${webResult}\n\nEsta información fue obtenida de internet. Si la usas, indica al cliente que proviene de una búsqueda web.` });
            aiResponse = await callAI(chatMessages);

            // Guardar resultado web en RAG para consultas futuras
            try {
              await db.from("sek_doc_chunks").insert({
                doc_id: null,
                doc_name: `Búsqueda Web: ${webQuery.substring(0, 100)}`,
                content: webResult.substring(0, 2000),
                source_label: "Búsqueda Web",
              });
            } catch (_saveErr) { /* no bloquea si falla el guardado */ }
          }
        }
      } catch (_e) { /* búsqueda web opcional */ }
    }

    // ==== BÚSQUEDA EN MANUALES (RAG) ====
    // Ruta 1: el agente usó el tag [BUSCAR_MANUALES: query] explícitamente
    const manualTagMatch = aiResponse.match(/\[BUSCAR_MANUALES:\s*(.+?)\]/);
    // Ruta 2: búsqueda automática con el último mensaje del usuario
    const lastUserMsg = histcliente.filter((m: any) => m.role === "user").slice(-1)[0]?.content || "";
    const manualQuery = manualTagMatch ? manualTagMatch[1].trim() : lastUserMsg.trim();

    if (!shouldEscalate && !shouldClose && manualQuery.length > 5) {
      try {
        const words = manualQuery.split(" ").filter((w: string) => w.length > 3).slice(0, 6).join(" | ");
        const { data: chunks } = await db
          .from("sek_doc_chunks")
          .select("content, doc_name, source_label")
          .textSearch("content", words, { type: "websearch" })
          .limit(4);

        if (chunks && chunks.length > 0) {
          const context = chunks.map((c: any) => {
            const source = (c as any).source_label || "Documentación Oficial Sekunet";
            return `[${source} — ${c.doc_name}]: ${c.content}`;
          }).join("\n\n");
          chatMessages.push({
            role: "system",
            content: `[Fuente: Documentación Oficial Sekunet] Información encontrada en los manuales técnicos de Sekunet para "${manualQuery}":\n\n${context}\n\nEsta es documentación oficial verificada de Sekunet. Puedes usarla con confianza e indica que proviene de la documentación oficial.`,
          });
          aiResponse = await callAI(chatMessages);
        } else if (manualTagMatch) {
          // El agente buscó explícitamente pero no encontró nada
          chatMessages.push({ role: "assistant", content: aiResponse });
          chatMessages.push({ role: "system", content: `No se encontro informacion en los manuales para "${manualQuery}". Responde al cliente indicando que no tienes esa informacion disponible.` });
          aiResponse = await callAI(chatMessages);
        }
      } catch (_e) { /* RAG opcional, no bloquea */ }
    }

    // Check if AI is saying goodbye
    if (
      aiResponse.toLowerCase().includes("que tenga un excelente dia") ||
      aiResponse.toLowerCase().includes("que tenga un buen dia")
    ) {
      shouldClose = true;
    }

    // Check if AI is escalating (por texto como fallback)
    if (
      aiResponse.includes("Soporte Avanzado (Nivel 2)") ||
      aiResponse.includes("escalado a nuestro equipo") ||
      aiResponse.includes("etiquetado su caso como N2")
    ) {
      shouldEscalate = true;
    }

    // Add IA response to histcliente
    const iaEntry = {
      role: "assistant",
      author: "Asistente Sekunet",
      time: new Date().toISOString(),
      content: aiResponse,
    };

    const updatedHist = [...histcliente, iaEntry];
    const updates: Record<string, unknown> = { histcliente: updatedHist };

    if (shouldEscalate) {
      updates.estado = "escalado";
      updates.title =
        `Chat web — ${(caso.cliente as any)?.nombre || "Cliente"} — ${(caso.cliente as any)?.equipo || ""}`.trim();
      // Agregar tag n2 al caso para que aparezca en Soporte Avanzado
      const currentTags: string[] = Array.isArray((caso as any).tags) ? (caso as any).tags : [];
      if (!currentTags.some((t: string) => t.toLowerCase() === "n2")) {
        updates.tags = [...currentTags, "n2"];
      }
    } else if (shouldClose) {
      updates.estado = "cerrado";
      updates.resolucion = aiResponse.replace(/\s+/g, " ").trim().substring(0, 500);
    }

    await db.from("sek_cases").update(updates).eq("id", case_id);

    // Aprendizaje automático: al cerrar o escalar, SEKA genera un resumen y lo guarda en RAG
    if (shouldClose || shouldEscalate) {
      // No bloqueante — se ejecuta en background sin afectar la respuesta al cliente
      learnFromConversation(caso, updatedHist).catch(() => {});
    }

    return new Response(
      JSON.stringify({
        ok: true,
        response: aiResponse,
        escalated: shouldEscalate,
        closed: shouldClose,
      }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (e: any) {
    console.error("[ia-agent] Error:", e.message);
    return new Response(JSON.stringify({ error: "Error interno del agente" }), { status: 500, headers: corsHeaders });
  }
});
