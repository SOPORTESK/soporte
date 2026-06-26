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

PASO 4 — VALIDAR MARCA EN INVENTARIO
Se verifica úNICAMENTE si la MARCA que dio el cliente está registrada como marca distribuida por Sekunet.
NO se valida el modelo específico; el modelo se registra tal cual.

Si la MARCA NO está en la cartera de Sekunet → diga exactamente:
"La marca indicada no forma parte de los equipos distribuidos por Sekunet, por lo que lamentablemente no podemos brindarle el soporte requerido. ¿Tiene alguna otra consulta relacionada con nuestros productos?"
  → Si el cliente dice Sí → NO pida marca ni modelo, pida directamente la descripción de su nueva consulta (accion: "PEDIR_DESCRIPCION")
  → Si el cliente dice No → diga M03 y emita [CERRAR]

Si la MARCA SÍ está en cartera:
- Para Reset (Hikvision): pida imagen de etiqueta + archivo XML.
- Para Reset (otras marcas) o Desvinculación: pida imagen de etiqueta.
- Para otros temas: pida descripción del problema.

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
  // 1. Google AI Studio (Gemini) - CAPA GRATUITA con tu GEMINI_API_KEY
  { provider: "google", model: "gemini-2.0-flash" },
  { provider: "google", model: "gemini-1.5-flash" },

  // 2. OpenRouter FREE (modelos con sufijo :free, rate-limitados pero sin costo)
  { provider: "openrouter", model: "google/gemini-2.0-flash:free" },
  { provider: "openrouter", model: "meta-llama/llama-3.1-8b-instruct:free" },
  { provider: "openrouter", model: "mistralai/mistral-7b-instruct:free" },

  // 3. NVIDIA NIM - créditos gratuitos iniciales con tu NVIDIA_API_KEY
  { provider: "nvidia", model: "meta/llama-3.1-8b-instruct" },
  { provider: "nvidia", model: "mistralai/mistral-7b-instruct-v0.3" },

  // 4. OpenRouter (pagos) - múltiples familias de modelos como último respaldo
  { provider: "openrouter", model: "google/gemini-2.0-flash" },
  { provider: "openrouter", model: "google/gemini-2.5-flash" },
  { provider: "openrouter", model: "openai/gpt-4o-mini" },
  { provider: "openrouter", model: "anthropic/claude-3.5-haiku" },
  { provider: "openrouter", model: "meta-llama/llama-3.1-8b-instruct" },
  { provider: "openrouter", model: "mistralai/mistral-7b-instruct" }
];

async function callNvidia(model: string, messages: NimMessage[]): Promise<string> {
  // Intentar JSON primero; si falla, texto libre (el parser extrae el JSON si lo contiene)
  for (const jsonMode of [true, false]) {
    const body: any = { model, messages, temperature: 0.2, max_tokens: 1024, stream: false };
    if (jsonMode) body.response_format = { type: "json_object" };
    const res = await fetch(`${NIM_BASE}/chat/completions`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "Authorization": `Bearer ${NVIDIA_KEY}` },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(12000)
    });
    if (res.ok) {
      const data = await res.json();
      const text = data.choices?.[0]?.message?.content?.trim() ?? "";
      if (text) return text;
    }
  }
  throw new Error(`NVIDIA NIM no respondió para ${model}`);
}

async function callOpenRouter(model: string, messages: NimMessage[]): Promise<string> {
  // Intentar JSON primero; si falla, texto libre
  for (const jsonMode of [true, false]) {
    const body: any = { model, messages, temperature: 0.2, max_tokens: 1024, stream: false };
    if (jsonMode) body.response_format = { type: "json_object" };
    const res = await fetch("https://openrouter.ai/api/v1/chat/completions", {
      method: "POST",
      headers: { 
        "Content-Type": "application/json", 
        "Authorization": `Bearer ${OPENROUTER_KEY}`,
        "HTTP-Referer": "https://sekunet.com",
        "X-Title": "Chat Sekunet"
      },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(12000)
    });
    if (res.ok) {
      const data = await res.json();
      const text = data.choices?.[0]?.message?.content?.trim() ?? "";
      if (text) return text;
    }
  }
  throw new Error(`OpenRouter no respondió para ${model}`);
}

async function callGoogle(model: string, messages: NimMessage[]): Promise<string> {
  const system = messages.find(m => m.role === "system");
  const turns = messages.filter(m => m.role !== "system");
  const contents = turns.map(m => ({
    role: m.role === "user" ? "user" : "model",
    parts: [{ text: typeof m.content === "string" ? m.content : (m.content as any[]).find((p:any) => p.type==="text")?.text ?? "" }],
  }));
  
  // Intentar application/json primero; si falla, texto plano
  for (const mimeType of ["application/json", "text/plain"]) {
    const body: any = { contents, generationConfig: { temperature: 0.2, maxOutputTokens: 1024, responseMimeType: mimeType } };
    if (system) body.systemInstruction = { parts: [{ text: system.content as string }] };
    
    const res = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${GEMINI_KEY}`,
      { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body), signal: AbortSignal.timeout(12000) }
    );
    if (res.ok) {
      const data = await res.json();
      const text = data.candidates?.[0]?.content?.parts?.[0]?.text?.trim() ?? "";
      if (text) return text;
    }
  }
  throw new Error(`Google Gemini no respondió para ${model}`);
}

async function callAIWithFallbacks(messages: NimMessage[]): Promise<string> {
  const errors: string[] = [];
  
  for (const config of AI_FALLBACK_CHAIN) {
    // Dos intentos por modelo con breve pausa para transitorios de red
    for (let attempt = 1; attempt <= 2; attempt++) {
      try {
        if (config.provider === "nvidia") {
          return await callNvidia(config.model, messages);
        } else if (config.provider === "openrouter") {
          return await callOpenRouter(config.model, messages);
        } else if (config.provider === "google") {
          return await callGoogle(config.model, messages);
        }
      } catch (e: any) {
        console.warn(`[AI Router] Modelo no disponible ${config.provider} -> ${config.model} (intento ${attempt}): ${e.message}`);
        errors.push(`${config.model}:${attempt}(${e.message})`);
        if (attempt < 2) {
          await new Promise(r => setTimeout(r, 500));
        }
      }
    }
  }
  
  throw new Error(`AI Router agotó todos los modelos. Errores: ${errors.join(", ")}`);
}

// ─── VALIDAR SOLO MARCA (con tolerancia a errores ortográficos) ───────────────

// Normaliza un texto aplicando TODAS las sustituciones fonéticas de una vez.
// Esto convierte tanto el input del cliente como las marcas del inventario
// a una forma canónica para poder compararlas.
function normalizarFonetico(s: string): string {
  let n = s.toLowerCase().trim();
  n = n.normalize("NFD").replace(/[\u0300-\u036f]/g, ""); // quitar acentos
  // Sustituciones fonéticas combinadas (orden importa)
  n = n.replace(/tion/g, "sion");
  n = n.replace(/cion/g, "sion");
  n = n.replace(/ph/g, "f");
  n = n.replace(/th/g, "t");
  n = n.replace(/sh/g, "s");
  n = n.replace(/wh/g, "w");
  n = n.replace(/ck/g, "k");
  n = n.replace(/qu/g, "k");
  // Letras intercambiables en español
  n = n.replace(/z/g, "s");     // ezviz → esvis
  n = n.replace(/b/g, "v");     // esbis → esvis  
  n = n.replace(/c(?=[eiy])/g, "s"); // ce,ci → se,si
  n = n.replace(/c/g, "k");     // ca,co,cu → ka,ko,ku
  n = n.replace(/g(?=[eiy])/g, "j"); // ge,gi → je,ji
  n = n.replace(/ll/g, "y");
  n = n.replace(/h/g, "");      // h silente
  // Deduplicar letras consecutivas
  n = n.replace(/(.)\1+/g, "$1");
  return n;
}

function levenshtein(a: string, b: string): number {
  const m = a.length, n = b.length;
  if (m === 0) return n;
  if (n === 0) return m;
  const d: number[][] = Array.from({ length: m + 1 }, () => Array(n + 1).fill(0));
  for (let i = 0; i <= m; i++) d[i][0] = i;
  for (let j = 0; j <= n; j++) d[0][j] = j;
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + cost);
    }
  }
  return d[m][n];
}

async function validarMarcaSolo(marca: string): Promise<{ encontrado: boolean; marcaCorregida?: string }> {
  if (!marca) return { encontrado: false };
  const input = marca.trim();
  try {
    // 1. Búsqueda exacta ilike
    const { data: exact } = await db
      .from("sek_inventario")
      .select("marca")
      .ilike("marca", `%${input}%`)
      .limit(1);
    if (exact && exact.length > 0) {
      console.log(`[seka-whatsapp] Marca encontrada (exacta): "${exact[0].marca}"`);
      return { encontrado: true, marcaCorregida: exact[0].marca };
    }

    // 2. Normalización fonética: comparar input normalizado contra todas las marcas normalizadas
    //    Esto resuelve: "esbis" → norm("esvis") vs "ezviz" → norm("esvis") → MATCH!
    const { data: allBrands } = await db
      .from("sek_inventario")
      .select("marca")
      .limit(500);
    if (allBrands && allBrands.length > 0) {
      const uniqueBrands = [...new Set(allBrands.map((b: any) => b.marca).filter(Boolean))] as string[];
      const inputNorm = normalizarFonetico(input);
      
      // 2a. Coincidencia exacta por normalización fonética
      for (const brand of uniqueBrands) {
        const brandNorm = normalizarFonetico(brand);
        if (inputNorm === brandNorm || inputNorm.includes(brandNorm) || brandNorm.includes(inputNorm)) {
          console.log(`[seka-whatsapp] Marca encontrada por fonética: "${input}" (norm: "${inputNorm}") → "${brand}" (norm: "${brandNorm}")`);
          return { encontrado: true, marcaCorregida: brand };
        }
      }

      // 2b. Levenshtein sobre las formas normalizadas (más tolerante)
      let bestMatch = "";
      let bestDist = Infinity;
      for (const brand of uniqueBrands) {
        const brandNorm = normalizarFonetico(brand);
        const dist = levenshtein(inputNorm, brandNorm);
        if (dist < bestDist) {
          bestDist = dist;
          bestMatch = brand;
        }
      }
      // Umbral: ≤ 2 ediciones sobre la forma normalizada
      if (bestDist <= 2 && bestMatch) {
        console.log(`[seka-whatsapp] Marca encontrada por Levenshtein normalizado (dist=${bestDist}): "${input}" → "${bestMatch}"`);
        return { encontrado: true, marcaCorregida: bestMatch };
      }

      // 3. Levenshtein crudo (sin normalizar) como último recurso, umbral más permisivo
      let bestRaw = "";
      let bestRawDist = Infinity;
      const inputLower = input.toLowerCase();
      for (const brand of uniqueBrands) {
        const dist = levenshtein(inputLower, brand.toLowerCase());
        if (dist < bestRawDist) {
          bestRawDist = dist;
          bestRaw = brand;
        }
      }
      // Umbral estricto: solo si el input tiene ≥5 caracteres y dist ≤ 2 (evita "daua"→"DAHUA")
      const threshold = inputLower.length >= 5 ? Math.min(2, Math.floor(inputLower.length * 0.3)) : 0;
      if (bestRawDist <= threshold && bestRaw) {
        console.log(`[seka-whatsapp] Marca encontrada por Levenshtein crudo (dist=${bestRawDist}): "${input}" → "${bestRaw}"`);
        return { encontrado: true, marcaCorregida: bestRaw };
      }
    }

    console.log(`[seka-whatsapp] Marca NO encontrada: "${input}" (ninguna estrategia coincidió)`);
    return { encontrado: false };
  } catch (e) {
    console.error("[seka-whatsapp] Error validando marca:", e);
    return { encontrado: false };
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

// Mapa semántico: palabras clave y sinónimos que apuntan a cada tema
const TOPIC_KEYWORDS: Record<string, string[]> = {
  "Configuraciones": ["configuraciones", "configuracion", "configurar", "configuro", "configuración", "ajustes", "ajustar", "setup", "setear", "configuración", "no sé configurar", "no se configurar", "como configuro", "cómo configuro", "ayuda con configurar", "configuración del equipo"],
  "Reset": ["reset", "reiniciar", "reinicio", "restaurar", "restauración", "restauracion", "borrar", "formatear", "formateo", "fábrica", "fabrica", "default", "resetear", "reseteo", "volver a configurar"],
  "Desvinculación": ["desvinculación", "desvinculacion", "desvincular", "quitar", "eliminar", "sacar", "desvincular", "desvincule", "borrar de la cuenta", "cambiar de cuenta", "sacar de la cuenta"],
  "Firmware": ["firmware", "actualizar", "actualización", "actualizacion", "update", "versión", "version", "software del equipo", "rom", "flash"],
  "Software": ["software", "programa", "aplicación", "aplicacion", "app", "cliente", "sistema", "software del sistema", "instalar programa"],
  "Drivers": ["driver", "drivers", "controlador", "controladores", "instalar driver", "falta driver", "no reconoce", "no detecta"],
  "Licencias": ["licencia", "licencias", "activar", "activación", "activacion", "serial", "key", "código", "codigo", "licencia vencida", "renovar licencia"],
  "Otro": ["otro", "otra", "diferente", "no está en la lista", "no esta en la lista", "otro tema", "no aplica", "ninguno de los anteriores"],
};

// Normaliza respuesta del usuario al nombre oficial del tema (número, texto exacto/parcial o sinónimos)
function resolveTopicFromText(input: string): string | null {
  const trimmed = input.trim();
  // Respuesta numérica directa
  if (TOPIC_NUMBER_MAP[trimmed]) return TOPIC_NUMBER_MAP[trimmed];
  // Respuesta de texto exacta (case-insensitive)
  const lower = trimmed.toLowerCase();
  for (const t of TOPICS) {
    if (t.toLowerCase() === lower) return t;
  }
  // Coincidencia parcial con el nombre oficial
  for (const t of TOPICS) {
    if (lower.includes(t.toLowerCase()) || t.toLowerCase().includes(lower)) return t;
  }
  // Coincidencia semántica por sinónimos/keywords
  for (const [tema, keywords] of Object.entries(TOPIC_KEYWORDS)) {
    for (const kw of keywords) {
      if (lower.includes(kw.toLowerCase())) return tema;
    }
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

    const keyMask = GEMINI_KEY ? `${GEMINI_KEY.substring(0, 6)}...${GEMINI_KEY.slice(-4)}` : "empty";
    console.log(`[seka-whatsapp] Request received. case_id: ${case_id}. GEMINI_KEY: ${keyMask}`);
    await db.from("sek_cases").update({ notasInternas: [`GEMINI_KEY_MASK: ${keyMask}`] }).eq("id", case_id);

    // Cargar caso
    const { data: caso, error: caseErr } = await db
      .from("sek_cases")
      .select("histcliente, histtecnico, estado, cliente, title, tags")
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

    // Si el caso fue marcado como "Nueva consulta" tras rechazo de marca, no exigir marca/modelo
    const esNuevaConsulta = typeof caso.title === "string" && caso.title.includes("Nueva consulta");

    // Helper: distancia de Levenshtein
    const levenshtein = (a: string, b: string): number => {
      const m = a.length, n = b.length;
      if (m === 0) return n;
      if (n === 0) return m;
      const dp = Array.from({ length: m + 1 }, () => Array(n + 1).fill(0));
      for (let i = 0; i <= m; i++) dp[i][0] = i;
      for (let j = 0; j <= n; j++) dp[0][j] = j;
      for (let i = 1; i <= m; i++) {
        for (let j = 1; j <= n; j++) {
          dp[i][j] = Math.min(
            dp[i - 1][j] + 1,
            dp[i][j - 1] + 1,
            dp[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1)
          );
        }
      }
      return dp[m][n];
    };

    // Helper fuzzy: detecta negaciones de cuenta/correo tolerando errores ortográficos (ej: "no temgo" -> "no tengo")
    const isNegacion = (text: string) => {
      const t = text.toLowerCase().trim().replace(/\s+/g, " ");
      const patterns = [
        "no tengo", "no lo tengo", "no tengo cuenta", "no tengo empresa",
        "no recuerdo", "no lo recuerdo", "no la recuerdo", "no me acuerdo",
        "no se", "no lo se", "no la se", "no sé", "no lo sé", "no la sé",
        "ninguna", "cliente final", "no recuerda", "no me acuerda"
      ];
      return patterns.some(p => {
        if (t === p) return true;
        const maxDist = p.length <= 6 ? 1 : p.length <= 12 ? 2 : 3;
        return levenshtein(t, p) <= maxDist;
      });
    };

    // Helper fuzzy: detecta "no recuerdo / no lo sé" tolerando typos, para re-preguntar la cuenta
    const isNoRecuerdaCuenta = (text: string) => {
      const t = text.toLowerCase().trim().replace(/\s+/g, " ");
      const patterns = [
        "no recuerdo", "no lo recuerdo", "no la recuerdo", "no me acuerdo",
        "no se", "no lo se", "no la se", "no sé", "no lo sé", "no la sé",
        "no recuerda", "no me acuerda", "no lo tengo a mano", "no la tengo a mano"
      ];
      return patterns.some(p => {
        if (t === p) return true;
        const maxDist = p.length <= 6 ? 1 : p.length <= 12 ? 2 : 3;
        return levenshtein(t, p) <= maxDist;
      });
    };

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

    // Detectar tema — acepta número (1-8), texto exacto o parcial SOLO si el cliente lo eligió explícitamente.
    // NUNCA se infiere el tema a partir de palabras clave del mensaje.
    const topiIdx = userRealMsgs.findIndex(m => resolveTopicFromText(m.content?.trim() ?? "") !== null);
    const tema = topiIdx >= 0 ? (resolveTopicFromText(userRealMsgs[topiIdx].content?.trim() ?? "") ?? null) : null;

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
- ESCALAR: Si el cliente pide hablar con una persona/agente/humano, o muestra MUCHO ENOJO, queja o insultos, marca accion como "ESCALAR_INMEDIATO" y sentimiento como "muy_molesto". No insistas en pedir datos.

REGLAS DE ANÁLISIS:
- Si el cliente indica EXPRESAMENTE que NO TIENE cuenta o empresa (ej: "no tengo", "ninguna", "cliente final"), extrae la cuenta como "Sin cuenta". PERO si el cliente simplemente omite el dato en su respuesta (ej. da su nombre y correo pero no menciona la empresa), DEBES dejar el campo cuenta vacío ("") para que el sistema lo vuelva a pedir. Si el usuario escribe CUALQUIER texto como respuesta al pedirle la cuenta, DEBES extraerlo tal cual y guardarlo en el campo "cuenta".
- REGLA DE CUENTA PERSONAL: Si el cliente indica que la cuenta está a su nombre personal o repite su nombre (ej: "está a mi nombre", "a nombre de Juan", "a título personal", "la cuenta es mía"), extrae SU NOMBRE EXACTO (ej: "Juan") como el valor de la "cuenta". Es VÁLIDO que el nombre de la cuenta sea igual al nombre del cliente (registro a título personal). NUNCA extraigas frases relativas como "a mi nombre" o "yo mismo".
- PROHIBIDO DEDUCIR LA CUENTA DEL CORREO: NUNCA generes el valor de "cuenta" a partir del correo electrónico (ni de la parte antes de @, ni del dominio). Ejemplo: si el correo es "innoviocr@outlook.com", NO escribas "Innovio CR" ni "INNOVIOCR" como cuenta A MENOS QUE el cliente lo haya escrito textualmente en un mensaje separado como respuesta a la pregunta de la cuenta. Si el cliente ESCRIBIÓ explícitamente un texto como respuesta cuando se le pidió la cuenta, DEBES extraerlo tal cual, aunque se parezca al correo.
- INTELIGENCIA DE TEMA: El asistente debe interpretar la intención del cliente. Si el cliente no usa exactamente uno de los 8 nombres de tema, infiere el tema por contexto, sinónimos o palabras clave (ej: "quiero configurar", "no sé cómo configurar" → Configuraciones; "actualizar" → Firmware; "borrar", "restaurar" → Reset; "desvincular", "quitar" → Desvinculación; "no reconoce" → Drivers; "licencia vencida" → Licencias). Solo si el mensaje es totalmente ambiguo y no puedes inferir con claridad, deja "tema" en null y usa accion "PEDIR_TEMA".

ORDEN OBLIGATORIO (PASO A PASO):
1. Si falta el nombre, la accion debe ser "PEDIR_NOMBRE".
2. Si ya tienes el nombre pero falta el correo, la accion debe ser "PEDIR_CORREO". Si el cliente indica que no tiene correo o simplemente no lo proporciona, marca el campo correo como "Sin correo" y avanza al siguiente paso. El correo es OPCIONAL.
3. Si ya tienes nombre (el correo es opcional), pero falta la cuenta, la accion debe ser "PEDIR_CUENTA".
4. Si tienes nombre y cuenta (correo es opcional), y falta el tema, la accion debe ser "PEDIR_TEMA".
5. REGLA PARA TODOS LOS TEMAS EXCEPTO "Otro":
   - Si falta la marca, la accion debe ser "PEDIR_MARCA".
   - Si tienes la marca pero falta el modelo, la accion debe ser "PEDIR_MODELO".
   - Cuando tengas marca y modelo detectados, la accion DEBE SER "BUSCAR_INVENTARIO". NUNCA te saltes este paso ni pidas la etiqueta directamente.
6. Si el tema es "Otro", NO pidas marca ni modelo, la accion debe ser directamente "PEDIR_DESCRIPCION".
- Si el cliente ya dio un dato, NUNCA lo vuelvas a pedir.

VALIDACIÓN DE DATOS FALSOS: Debes verificar de forma intuitiva que los datos proporcionados sean reales y lógicos.
- Nombres: Si el cliente proporciona solo un nombre sin apellido (ej: "Andrés", "Juan"), o un nombre obviamente falso, caracteres aleatorios, números, o palabras sin sentido, recházalo. ES OBLIGATORIO dejar el campo "nombre" vacío ("") y en "respuesta_sugerida" usar este texto exacto (sin comillas): El nombre ingresado no parece estar completo o válido. Por favor, indíquenos su nombre y al menos un apellido para registrar su caso.
- Correos: Si el cliente indica expresamente que no tiene correo, extrae "Sin correo". Pero si proporciona un correo evidentemente falso o de prueba, recházalo. ES OBLIGATORIO dejar el campo "correo" vacío ("") y en "respuesta_sugerida" usar este texto exacto (sin comillas): El correo ingresado no tiene un formato válido. Por favor, escriba su correo electrónico real para poder contactarle.
- Cuentas: ACEPTA CUALQUIER nombre de empresa proporcionado por el cliente, incluyendo acrónimos, todo en mayúsculas, o nombres cortos (ej: "ACME", "ICE", "IBM", "SYS"). NO rechaces el nombre de la cuenta a menos que sea puro teclado aplastado (ej: "asdf").

OTRAS REGLAS:
- Si el cliente envió un código como "DS-3E0505P-E-M", "NVR-108MH", "IPC-T221H", o "DS-PKF1-WB-B--D", eso es un MODELO, no una marca. DEBES extraerlo en el campo "modelo".
- Si el cliente envió una sola palabra que NO SEA un número del menú (ej: "Hikvision", "Dahua", "Epcom", "ZKTeco", "hik", "dha", "zkt", "epc"), ASUME OBLIGATORIAMENTE que es una MARCA y extráelo en el campo "marca". NUNCA extraigas números sueltos (como "1", "2", "3") como marca.
- Modelos: Extrae CUALQUIER código alfanumérico o código con guiones provisto por el usuario en el campo "modelo". NUNCA dejes el modelo vacío si el usuario escribió un código de modelo en la conversación.
- Interpreta errores ortográficos libremente. Ej: "reced" o "rese" = "Reset", "borrar" = "Desvinculación", "fimwar" = "Firmware", "marac" = "marca", etc. Usa el sentido común.

REGLAS DE EXPERIENCIA PREMIUM (NUEVAS):
- ACUSE DE RECIBO: en el campo "acuse" genera una frase breve, cálida y natural que reconozca lo último que aportó el cliente o valide su situación (ej: "Perfecto, ya registré la marca." / "Gracias, tomo nota." / "Lamento el inconveniente."). NO debe contener preguntas. Déjalo vacío solo si no aplica (ej. primer dato o despedida).
- IDIOMA: detecta el idioma del cliente y ponlo en "idioma" ("es" o "en"). Si el texto del cliente es muy corto, un simple número (ej: "3"), o ambiguo, ASUME OBLIGATORIAMENTE "es". Solo usa "en" si el cliente escribe frases claras en inglés. Si es "en", redacta "acuse", "respuesta_sugerida" y "resumen_handoff" en inglés natural.
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
  "accion": "una de: PEDIR_NOMBRE|PEDIR_CORREO|PEDIR_CUENTA|PEDIR_TEMA|PEDIR_MARCA|PEDIR_MODELO|PEDIR_MARCA_Y_MODELO|BUSCAR_INVENTARIO|PEDIR_DESCRIPCION|ESCALAR|ESCALAR_INMEDIATO|CERRAR|VENTAS|CONTINUAR",
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
    let supervisorRaw = "";
    try {
      const supervisorMessages: NimMessage[] = [
        { role: "system", content: supervisorPrompt },
        { role: "user", content: "Analiza la conversación y decide la siguiente acción." },
      ];
      supervisorRaw = await callAIWithFallbacks(supervisorMessages);
      console.log("[seka-whatsapp] Supervisor raw:", supervisorRaw);
      const jsonMatch = supervisorRaw.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        supervisorResult = JSON.parse(jsonMatch[0]);
        console.log("[seka-whatsapp] Supervisor result:", JSON.stringify(supervisorResult));
        await db.from("sek_cases").update({ notasInternas: [`SUPERVISOR_RESULT: ${JSON.stringify(supervisorResult)}`] }).eq("id", case_id);
      }
    } catch (e: any) {
      console.error("[seka-whatsapp] Supervisor error:", e.message);
      if (typeof supervisorRaw !== 'undefined') {
          await db.from("sek_cases").update({ notasInternas: ["JSON_PARSE_ERROR: " + e.message + " | RAW: " + supervisorRaw.substring(0, 500)] }).eq("id", case_id);
      }
    }

    // ── Paso 3: Inicializar datos del cliente ──
    const currentCliente = (caso.cliente && typeof caso.cliente === "object") ? caso.cliente : {};
    const updatedCliente: Record<string, unknown> = { ...currentCliente };
    let clienteChanged = false;

    // ── Si el supervisor no respondió, usar respaldo con el flujo anterior ──
    if (!supervisorResult) {
      console.warn("[seka-whatsapp] Supervisor no respondió, usando LLM directo como respaldo");

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
          replyDatos = "Gracias por la información proporcionada.\n\nPara finalizar la validación de su solicitud, ¿podría indicarnos el nombre de la empresa o cuenta afiliada a Sekunet con la que se encuentra registrado?";
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
          replyDatos = isRetry ? "El nombre de la cuenta ingresada no es válido. Por favor, ¿podría indicarnos el nombre de la empresa o cuenta afiliada a Sekunet con la que se encuentra registrado?" : "Gracias por la información proporcionada.\n\nPara finalizar la validación de su solicitud, ¿podría indicarnos el nombre de la empresa o cuenta afiliada a Sekunet con la que se encuentra registrado?";
        }
      }

      // Si los datos están completos pero el supervisor no respondió,
      // usaremos un modelo no estructurado como respaldo final.
      if (replyDatos) {
        const newMsgDatos: HistMsg = { role: "ia", author: "Asistente Sekunet", time: new Date().toISOString(), content: replyDatos };
        if (clienteChanged) {
           await db.from("sek_cases").update({ histtecnico: [...histtecnico, newMsgDatos], cliente: updatedCliente }).eq("id", case_id);
        } else {
           await db.from("sek_cases").update({ histtecnico: [...histtecnico, newMsgDatos] }).eq("id", case_id);
        }
        return new Response(JSON.stringify({ ok: true, reply: replyDatos }), { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }

      console.log("[seka-whatsapp] Datos de cliente completos, intentando LLM no estructurado como respaldo...");
      try {
        const messages = buildMessages(histcliente, null);
        let rawReply = await callAIWithFallbacks(messages);
        let cleanReply = await processTags(rawReply, case_id);
        cleanReply = cleanReply.replace(/__INV__.*?__INV__/gs, "").trim();
        // Guardia: nunca enviar JSON crudo al cliente
        if (/^\s*\{[\s\S]*"action"\s*:/i.test(cleanReply) || /^\s*\{[\s\S]*"accion"\s*:/i.test(cleanReply)) {
          cleanReply = "";
        }
        if (!cleanReply) return new Response(JSON.stringify({ ok: true, skipped: true }), { status: 200, headers: corsHeaders });
        const newMsg: HistMsg = { role: "ia", author: "Asistente Sekunet", time: new Date().toISOString(), content: cleanReply };
        await db.from("sek_cases").update({ histtecnico: [...histtecnico, newMsg] }).eq("id", case_id);
        return new Response(JSON.stringify({ ok: true, reply: cleanReply }), { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      } catch (fallbackErr: any) {
        console.error("[seka-whatsapp] Respaldo no estructurado tampoco respondió:", fallbackErr.message);
        // Último recurso: todos los modelos están indisponibles → escalamos inmediatamente con M02.
        const M02_TEXT = "Agradecemos su preferencia. En un momento será atendido por uno de nuestros agentes.";
        const newMsg: HistMsg = { role: "ia", author: "Asistente Sekunet", time: new Date().toISOString(), content: M02_TEXT };
        const upd: Record<string, unknown> = {
          histtecnico: [...histtecnico, newMsg],
          estado: "escalado",
          escalado_at: new Date().toISOString(),
          n2_reason: "Escalado por indisponibilidad de IA",
        };
        if (clienteChanged) upd.cliente = updatedCliente;
        await db.from("sek_cases").update(upd).eq("id", case_id);
        return new Response(JSON.stringify({ ok: true, reply: M02_TEXT }), { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });
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

    const cleanNombre = supervisorResult.nombre ? String(supervisorResult.nombre).trim() : "";
    const isPlaceholderNombre = /extra[íi]do|vac[íi]o|proporcionado|placeholder|representa/i.test(cleanNombre);
    
    if (isValidExtractedString(cleanNombre) && !isPlaceholderNombre) {
      const oldNombre = String((currentCliente as any).nombre || "").trim();
      if (!oldNombre || oldNombre === "." || /^[\d\+\-\s]+$/.test(oldNombre) || oldNombre === "(vacío)") {
        updatedCliente.nombre = cleanNombre;
        clienteChanged = true;
      }
    }
    
    const cleanCorreo = supervisorResult.correo ? String(supervisorResult.correo).trim() : "";
    const isPlaceholderCorreo = /extra[íi]do|vac[íi]o|proporcionado|placeholder/i.test(cleanCorreo);
    const hasAtAndDot = cleanCorreo.includes("@") && cleanCorreo.includes(".");
    const isSinCorreo = cleanCorreo.toLowerCase() === "sin correo";
    
    // Usar el correo del LLM o el del Regex como respaldo
    const finalCorreo = (isValidExtractedString(cleanCorreo) && !isPlaceholderCorreo && (hasAtAndDot || isSinCorreo)) 
      ? cleanCorreo 
      : regexEmail;
    
    if (isValidExtractedString(finalCorreo)) {
      const oldCorreo = String((currentCliente as any).correo || "").trim();
      if (!oldCorreo || oldCorreo === "(vacío)") {
        updatedCliente.correo = finalCorreo;
        clienteChanged = true;
      }
    }
    
    const cleanCuenta = supervisorResult.cuenta ? String(supervisorResult.cuenta).trim() : "";
    const isPlaceholderCuenta = /extra[íi]da|vac[íi]a|proporcionado|placeholder/i.test(cleanCuenta);
    
    if (isValidExtractedString(cleanCuenta) && !isPlaceholderCuenta) {
      const oldCuenta = String((currentCliente as any).cuenta || "").trim();
      const oldCuentaLower = oldCuenta.toLowerCase();
      const isBadOldCuenta = oldCuentaLower === "a mi nombre" || oldCuentaLower === "mi nombre" || oldCuentaLower === "yo mismo" || oldCuentaLower === "personal" || oldCuentaLower === "sin cuenta" || oldCuentaLower === "no tengo" || oldCuentaLower === "cliente final";
      let cuentaAlucinada = false;
      if (regexEmail) {
        // Normalizar: minúsculas y solo alfanuméricos (ignora espacios y signos).
        const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, "");
        const emailLocalPart = norm(regexEmail.split('@')[0]);
        const emailDomainPart = norm(regexEmail.split('@')[1].split('.')[0]);
        const cuentaNorm = norm(cleanCuenta);
        
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
           let cuentaFinal = cleanCuenta;
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

    // CUENTA A NOMBRE/TÍTULO PERSONAL: si el cliente indica que la cuenta está a su propio
    // nombre, el nombre del cliente ES el nombre de la cuenta (registro a título personal).
    const personalAccountPatternEarly = /(a\s*mi\s*nombre|mi\s*propio\s*nombre|a\s*t[íi]tulo\s*personal|nombre\s*personal|a\s*nombre\s*personal|cuenta\s*personal|est[áa]\s+a\s+mi\s+nombre|a\s+nombre\s+m[íi]o|cuenta\s*(es\s*)?m[íi]a|es\s+a\s+mi\s+nombre)/i;
    if (!updatedCliente.cuenta && updatedCliente.nombre && personalAccountPatternEarly.test(lastUserMsgContent)) {
      updatedCliente.cuenta = String(updatedCliente.nombre);
      clienteChanged = true;
      console.log("[seka-whatsapp] Cuenta a nombre personal → se usa el nombre del cliente como cuenta.", updatedCliente.cuenta);
    }

    // ── Paso 4: Ejecutar la ACCIÓN que decidió el Supervisor ──
    let accion = (supervisorResult.accion || "CONTINUAR").toUpperCase();
    let marcaSupervisor = String(supervisorResult.marca || "").trim();
    if (/^\d+$/.test(marcaSupervisor)) {
      console.log(`[seka-whatsapp] Ignorando marca alucinada que solo contiene números: "${marcaSupervisor}"`);
      marcaSupervisor = "";
      supervisorResult.marca = "";
    }
    let modeloSupervisor = supervisorResult.modelo || "";
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
      // Protección contra IA exponiendo información interna al cliente
      if (/inventario|buscando|verificando|base de datos|sistema|interno|consultando/i.test(acuse)) return text;
      // Protección contra IA alucinando acciones que no ha realizado (ej: "ya registré la marca" antes de pedirla)
      if (/registr[eéó]|anot[eéó]|guard[eéó]|tom[eéó] nota/i.test(acuse)) return text;
      // Protección contra IA repitiendo el mismo texto
      if (text.includes(acuse) || acuse.includes(text)) return text;

      // Limpiar redundancias de saludo si ya tenemos acuse
      let cleanText = text;
      const lowerAcuse = acuse.toLowerCase();
      if (lowerAcuse.includes("gracias") || lowerAcuse.includes("perfecto") || lowerAcuse.includes("excelente")) {
        cleanText = cleanText.replace(/^(gracias|perfecto|excelente)(\.|\,)?\s*/i, "");
        if (cleanText.length > 0) {
          cleanText = cleanText.charAt(0).toUpperCase() + cleanText.slice(1);
        }
      }

      return `${acuse}\n\n${cleanText}`;
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

    // ── EXTRACCIÓN DETERMINÍSTICA TEMPRANA DE MARCA/MODELO ──
    // Si el bot pidió la marca/modelo y el usuario respondió, lo extraemos AQUÍ antes de verificar.
    // IMPORTANTE: Si extrajimos datos, forzamos la acción correcta (incluso si el supervisor dijo CERRAR).
    const lastIAMsg = iaRealMsgs[iaRealMsgs.length - 1]?.content || "";
    const botPidioMarcaTemprano = lastIAMsg.toLowerCase().includes("marca del equipo") || lastIAMsg.toLowerCase().includes("indíquenos la marca");
    const botPidioModeloTemprano = lastIAMsg.toLowerCase().includes("modelo del equipo") || lastIAMsg.toLowerCase().includes("cuál es el modelo") || lastIAMsg.toLowerCase().includes("modelo de su equipo");
    let marcaExtraidaDeterminista = false;
    let modeloExtraidoDeterminista = false;
    const botPreguntóConfirmaciónMarca = lastIAMsg.includes("¿Se refiere a") && lastIAMsg.includes("Responda Sí o No");
    if (botPidioMarcaTemprano && !botPreguntóConfirmaciónMarca && lastUserMsgContent.trim().length >= 2) {
      const resp = lastUserMsgContent.trim();
      if (!/^\d+$/.test(resp) && !isNegacion(resp)) {
        // Sobreescribir siempre: el usuario está respondiendo directamente a la pregunta de marca
        console.log(`[seka-whatsapp] Extracción determinística temprana de marca: "${resp}"`);
        marcaSupervisor = resp;
        supervisorResult.marca = resp;
        marcaExtraidaDeterminista = true;
      }
    }
    // Si el bot preguntó confirmación de marca y el usuario respondió, forzar PEDIR_MODELO
    if (botPreguntóConfirmaciónMarca && accion !== "VENTAS") {
      // Extraer la marca del mensaje de confirmación: '¿Se refiere a "EZVIZ"?'
      const matchConfMarca = lastIAMsg.match(/¿Se refiere a "([^"]+)"\?/);
      if (matchConfMarca) {
        marcaSupervisor = matchConfMarca[1];
        supervisorResult.marca = matchConfMarca[1];
      }
      accion = "PEDIR_MODELO";
      supervisorResult.respuesta_sugerida = "";

      // Validar Sí/No estrictamente: si no es ninguna de las dos, ignorar extracciones y reiterar
      const userConfirmó = /^(s[ií]|si|yes|correcto|exacto|esa|eso|afirmativo|así es|aja|ajá)[.!?]*$/i.test(lastUserMsgContent.trim());
      const userNegó = /^(no|nel|nop|negativo|otra|diferente|distint)/i.test(lastUserMsgContent.trim());
      if (!userConfirmó && !userNegó) {
        // Descartar cualquier modelo que el supervisor haya alucinado de la respuesta
        modeloSupervisor = "";
        supervisorResult.modelo = "";
        const marcaPreguntada = matchConfMarca ? matchConfMarca[1] : "esa marca";
        const directReply = `Lo sentimos, la respuesta proporcionada no es válida. Por favor, intente nuevamente utilizando una de las opciones indicadas.\n\n¿Se refiere a "${marcaPreguntada}"? Responda Sí o No.`;
        const newMsg: HistMsg = { role: "ia", author: "Asistente Sekunet", time: new Date().toISOString(), content: directReply };
        const upd: Record<string, unknown> = { histtecnico: [...histtecnico, newMsg] };
        if (clienteChanged) upd.cliente = updatedCliente;
        await db.from("sek_cases").update(upd).eq("id", case_id);
        return new Response(JSON.stringify({ ok: true, reply: directReply }), { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }
    }
    if (botPidioModeloTemprano && !modeloSupervisor && lastUserMsgContent.trim().length >= 2) {
      const resp = lastUserMsgContent.trim();
      if (!isNegacion(resp)) {
        console.log(`[seka-whatsapp] Extracción determinística temprana de modelo: "${resp}"`);
        modeloSupervisor = resp;
        supervisorResult.modelo = resp;
        modeloExtraidoDeterminista = true;
      }
    }

    // ── VERIFICACIÓN DE MARCA OBLIGATORIA (solo se valida la marca, no el modelo) ──
    // Si extrajimos marca/modelo determinísticamente, sobreescribimos CUALQUIER acción del supervisor
    // (incluido CERRAR) porque estamos en medio del flujo de recopilación de datos del equipo.
    // Excepto cuando el caso fue marcado como "Nueva consulta" tras rechazo de marca.
    if (!esNuevaConsulta && marcaSupervisor && modeloSupervisor && accion !== "VENTAS" && accion !== "BUSCAR_INVENTARIO") {
      console.log(`[seka-whatsapp] Marca y Modelo detectados (${marcaSupervisor} - ${modeloSupervisor}). Forzando BUSCAR_INVENTARIO (solo validará marca).`);
      accion = "BUSCAR_INVENTARIO";
      if (supervisorResult) supervisorResult.respuesta_sugerida = "";
    } else if (!esNuevaConsulta && marcaSupervisor && !modeloSupervisor && accion !== "VENTAS" && accion !== "BUSCAR_INVENTARIO" && accion !== "PEDIR_MODELO") {
      // Tenemos marca pero no modelo → forzar PEDIR_MODELO (sobreescribe CERRAR si estamos mid-flow)
      console.log(`[seka-whatsapp] Solo marca detectada (${marcaSupervisor}), forzando PEDIR_MODELO.`);
      accion = "PEDIR_MODELO";
      if (supervisorResult) supervisorResult.respuesta_sugerida = "";
    }

    const lastIAContent = iaRealMsgs[iaRealMsgs.length - 1]?.content || "";

    // Si el bot ya pidió descripción del problema y el usuario respondió → escalar siempre
    const botYaPidioDescripcion = lastIAContent.includes("describa brevemente") || lastIAContent.includes("describa el inconveniente") || lastIAContent.includes("describa brevemente el inconveniente");
    if (botYaPidioDescripcion && lastUserMsgContent.trim().length >= 2) {
      console.log("[seka-whatsapp] Usuario ya describió el problema. Escalando directamente.");
      const M02_DESC = "Agradecemos su preferencia. En un momento será atendido por uno de nuestros agentes.";
      const newMsgDesc: HistMsg = { role: "ia", author: "Asistente Sekunet", time: new Date().toISOString(), content: M02_DESC };
      const updDesc: Record<string, unknown> = {
        histtecnico: [...histtecnico, newMsgDesc],
        estado: "escalado",
        escalado_at: new Date().toISOString(),
      };
      if (clienteChanged) updDesc.cliente = updatedCliente;
      await db.from("sek_cases").update(updDesc).eq("id", case_id);
      return new Response(JSON.stringify({ ok: true, reply: M02_DESC }), { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });
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
    
    // Si la acción no es válida, o si es "CONTINUAR" pero todavía faltan datos del flujo básico
    // (nombre, cuenta, tema, marca o modelo), obligamos a aplicar la heurística para no descarrilar el flujo.
    // Cuando el caso fue marcado como "Nueva consulta" tras rechazo de marca, no exigimos marca/modelo.
    const datosBasicosIncompletos = !updatedCliente.nombre || !updatedCliente.cuenta || !temaSupervisor || 
                                    (!esNuevaConsulta && temaSupervisor !== "Otro" && (!marcaSupervisor || !modeloSupervisor));
                                    
    if (!validActions.includes(accion) || (accion === "CONTINUAR" && datosBasicosIncompletos)) {
      console.warn(`[seka-whatsapp] Acción "${accion}" no válida o CONTINUAR con datos incompletos. Aplicando heurística.`);
      if (!updatedCliente.nombre) {
        accion = "PEDIR_NOMBRE";
      } else if (!updatedCliente.cuenta) {
        accion = "PEDIR_CUENTA";
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
    
    const userSaysNoData = isNegacion(lastUserMsgContent);
    
    // Si ya pedimos el correo 2 veces (inicial + 1 recordatorio) o el cliente dice no tenerlo
    // PERO solo marcamos "Sin correo" si el bot estaba preguntando por el correo (no por la cuenta).
    const lastBotAskedCorreo = lastBotMsg.toLowerCase().includes("correo") || lastBotMsg.toLowerCase().includes("email");
    const lastBotAskedCuenta = lastBotMsg.includes("afiliada a Sekunet") || lastBotMsg.toLowerCase().includes("cuenta") || lastBotMsg.toLowerCase().includes("empresa");
    if (lastBotAskedCorreo && !lastBotAskedCuenta && (emailAskCount >= 2 || userSaysNoData)) {
      // El correo es opcional: si el cliente dice que no lo tiene o ya lo pedimos 2 veces, marcar como "Sin correo"
      updatedCliente.correo = "Sin correo";
    }

    const askingForAccountOnly = lastBotMsg.includes("afiliada a Sekunet") && !lastBotMsg.includes("correo electrónico");
    const userDiceNoRecuerdaCuenta = (askingForAccountOnly || lastBotMsg.toLowerCase().includes("cuenta") || lastBotMsg.toLowerCase().includes("empresa")) &&
      isNoRecuerdaCuenta(lastUserMsgContent);
    const isSinCuentaByText = (askingForAccountOnly && userSaysNoData && !userDiceNoRecuerdaCuenta) || lastUserMsgContent.toLowerCase().includes("no tengo cuenta") || lastUserMsgContent.toLowerCase().includes("no tengo empresa");
    
    const isSinCuenta = (cuentaCheck === "sin cuenta" || cuentaCheck === "no tengo" || cuentaCheck === "cliente final" || isSinCuentaByText) && !userDiceNoRecuerdaCuenta;
    
    if (isSinCuenta) {
      updatedCliente.cuenta = "sin cuenta"; // Forzar para que el siguiente bloque lo procese correctamente
    }

    if (userDiceNoRecuerdaCuenta) {
      // El cliente no recuerda la cuenta: explicar exclusividad y volver a pedirla
      const M_CUENTA_NO_RECUERDA = "Gracias por comunicarse con nosotros.\n\nNuestro servicio de soporte técnico está disponible exclusivamente para clientes y distribuidores afiliados a Sekunet. Para continuar con el registro y validación de su solicitud, ¿podría indicarnos el nombre de la cuenta con la que se encuentra afiliado?";
      const newMsg: HistMsg = { role: "ia", author: "Asistente Sekunet", time: new Date().toISOString(), content: M_CUENTA_NO_RECUERDA };
      const upd: Record<string, unknown> = { histtecnico: [...histtecnico, newMsg] };
      if (clienteChanged) upd.cliente = updatedCliente;
      if (nuevoTitle) upd.title = nuevoTitle;
      await db.from("sek_cases").update(upd).eq("id", case_id);
      return new Response(JSON.stringify({ ok: true, reply: M_CUENTA_NO_RECUERDA }), { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });
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

    // EXTRACCIÓN DETERMINÍSTICA DE CUENTA: si el bot pidió la cuenta y el usuario respondió con
    // texto sustancial (no "no tengo" etc.), extraerlo directamente sin depender del LLM.
    const botPidioCuenta = lastBotMsg.includes("afiliada a Sekunet") || lastBotMsg.toLowerCase().includes("nombre de la cuenta");
    const cuentaActual = String(updatedCliente.cuenta || "").toLowerCase().trim();
    const cuentaVaciaOInvalida = !cuentaActual || cuentaActual === "sin cuenta" || cuentaActual === "no tengo" || cuentaActual === "cliente final" || cuentaActual === "(vacío)";
    if (botPidioCuenta && cuentaVaciaOInvalida && lastUserMsgContent.trim().length >= 2) {
      const respLower = lastUserMsgContent.trim().toLowerCase();
      const esNegacion = isNegacion(respLower);
      if (!esNegacion) {
        console.log(`[seka-whatsapp] Extracción determinística de cuenta: "${lastUserMsgContent.trim()}"`);
        updatedCliente.cuenta = lastUserMsgContent.trim();
        clienteChanged = true;
      }
    }

    // EXTRACCIÓN DETERMINÍSTICA DE MARCA: si el bot pidió la marca y el usuario respondió texto,
    // extraerlo directamente como marca sin depender del supervisor LLM.
    const botPidioMarca = lastBotMsg.toLowerCase().includes("marca del equipo") || lastBotMsg.toLowerCase().includes("indíquenos la marca");
    if (botPidioMarca && !marcaSupervisor && lastUserMsgContent.trim().length >= 2) {
      const respMarca = lastUserMsgContent.trim();
      // No aceptar números solos ni respuestas genéricas
      if (!/^\d+$/.test(respMarca) && !isNegacion(respMarca)) {
        console.log(`[seka-whatsapp] Extracción determinística de marca: "${respMarca}"`);
        marcaSupervisor = respMarca;
        supervisorResult.marca = respMarca;
      }
    }

    // EXTRACCIÓN DETERMINÍSTICA DE MODELO: si el bot pidió el modelo y el usuario respondió texto,
    // extraerlo directamente como modelo.
    const botPidioModelo = lastBotMsg.toLowerCase().includes("modelo del equipo") || lastBotMsg.toLowerCase().includes("cuál es el modelo");
    if (botPidioModelo && !modeloSupervisor && lastUserMsgContent.trim().length >= 2) {
      const respModelo = lastUserMsgContent.trim();
      if (!isNegacion(respModelo)) {
        console.log(`[seka-whatsapp] Extracción determinística de modelo: "${respModelo}"`);
        modeloSupervisor = respModelo;
        supervisorResult.modelo = respModelo;
      }
    }

    // GATE 0 — FORZAR RECOPILACIÓN DE DATOS (Red de Seguridad contra Alucinaciones)
    // ORDEN: nombre → correo → cuenta.
    // El correo SÍ se pide, pero es OPCIONAL: tras 2 intentos (o si el cliente dice no tenerlo)
    // se auto-marca como "Sin correo" en el bloque anterior (emailAskCount), de modo que el flujo
    // NUNCA se queda bloqueado en el correo y siempre avanza a pedir la cuenta.
    if (accion !== "VENTAS" && accion !== "ESCALAR_INMEDIATO") {
      if (!updatedCliente.nombre) {
        console.log("[seka-whatsapp] Forzando PEDIR_NOMBRE por datos incompletos (sobreescribiendo incluso CERRAR).");
        accion = "PEDIR_NOMBRE";
        supervisorResult.respuesta_sugerida = "";
      } else if (!updatedCliente.correo && accion !== "CERRAR") {
        console.log("[seka-whatsapp] Forzando PEDIR_CORREO (correo aún no recopilado ni marcado como 'Sin correo').");
        accion = "PEDIR_CORREO";
        supervisorResult.respuesta_sugerida = "";
      } else if ((!updatedCliente.cuenta || String(updatedCliente.cuenta).toLowerCase() === "sin cuenta") && accion !== "CERRAR") {
        console.log("[seka-whatsapp] Forzando PEDIR_CUENTA por datos incompletos.");
        accion = "PEDIR_CUENTA";
        supervisorResult.respuesta_sugerida = "";
      }
    }

    // GATE 1 — Lógica de cierre por insistencia en pedir la cuenta.
    // La frase de reintento usada en PEDIR_CUENTA (isRetry) es la que se cuenta.
    const CUENTA_REASK_PHRASE = "el nombre de la cuenta afiliada a Sekunet";
    if (accion === "PEDIR_CUENTA" && !isSinCuenta && !updatedCliente.cuenta) {
      // Contar cuántas veces ya pedimos la cuenta (todas las veces que el bot preguntó por la cuenta).
      const accountReaskCount = iaRealMsgs.filter(m => (m.content || "").toLowerCase().includes(CUENTA_REASK_PHRASE)).length;

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
    // El tema NUNCA se asume: solo se acepta si el cliente lo eligió explícitamente.
    const temaElegidoPorCliente = topiIdx >= 0;
    if (accion !== "CERRAR" && accion !== "VENTAS" && accion !== "ESCALAR_INMEDIATO" && accion !== "PEDIR_DATOS" && accion !== "PEDIR_NOMBRE" && accion !== "PEDIR_CORREO" && accion !== "PEDIR_CUENTA") {
      if (updatedCliente.nombre && updatedCliente.cuenta && !temaElegidoPorCliente) {
        console.log("[seka-whatsapp] Datos completos sin tema elegido por cliente → mostrando lista de temas.");
        accion = "PEDIR_TEMA";
      }
    }

    // ── REGLA DE NEGOCIO: SIN CUENTA ──
    const cuentaDetectada = String(updatedCliente.cuenta || "").toLowerCase().trim();
    if (cuentaDetectada === "sin cuenta" || cuentaDetectada === "no tengo" || cuentaDetectada === "cliente final") {
      const M_NO_CUENTA = "Agradecemos que se haya comunicado con nosotros.\n\nActualmente, el soporte técnico directo se brinda exclusivamente a clientes y distribuidores autorizados de Sekunet. Por esta razón, le sugerimos contactar al proveedor o instalador que le vendió el equipo, ya que podrá asistirle de forma más efectiva con su requerimiento.\n\nLe agradecemos su comprensión y le deseamos mucho éxito con la gestión.";
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
      const replyText = M02_TEXT;
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
        defaultReply = isRetry ? "El nombre de la cuenta ingresado no es válido. Por favor, ¿podría indicarnos el nombre de la empresa o cuenta afiliada a Sekunet con la que se encuentra registrado?" : "Gracias por la información proporcionada.\n\nPara finalizar la validación de su solicitud, ¿podría indicarnos el nombre de la empresa o cuenta afiliada a Sekunet con la que se encuentra registrado?";
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
      let directReply = withAcuse("¿En relación a qué tema sería su consulta?\n\n1. Configuraciones\n2. Reset\n3. Desvinculación\n4. Firmware\n5. Software\n6. Drivers\n7. Licencias\n8. Otro\n\nResponda con el número o el nombre del tema.");
      const newMsg: HistMsg = { role: "ia", author: "Asistente Sekunet", time: new Date().toISOString(), content: directReply };
      const upd: Record<string, unknown> = { histtecnico: [...histtecnico, newMsg] };
      if (clienteChanged) upd.cliente = updatedCliente;
      if (nuevoTitle) upd.title = nuevoTitle;
      await db.from("sek_cases").update(upd).eq("id", case_id);
      return new Response(JSON.stringify({ ok: true, reply: directReply }), { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    // ── ACCIÓN: PEDIR MARCA ──
    if (accion === "PEDIR_MARCA") {
      let directReply = withAcuse("Por favor, indíquenos la marca del equipo.");
      const newMsg: HistMsg = { role: "ia", author: "Asistente Sekunet", time: new Date().toISOString(), content: directReply };
      const upd: Record<string, unknown> = { histtecnico: [...histtecnico, newMsg] };
      if (clienteChanged) upd.cliente = updatedCliente;
      await db.from("sek_cases").update(upd).eq("id", case_id);
      return new Response(JSON.stringify({ ok: true, reply: directReply }), { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    // ── ACCIÓN: PEDIR MODELO ──
    if (accion === "PEDIR_MODELO") {
      // Verificar si el bot ya preguntó confirmación de marca y el usuario respondió
      const botPreguntóConfirmación = lastIAMsg.includes("¿Se refiere a") && lastIAMsg.includes("Responda Sí o No");
      const userConfirmó = /^(s[ií]|si|yes|correcto|exacto|esa|eso|afirmativo|así es|aja|ajá)[.!?]*$/i.test(lastUserMsgContent.trim());
      const userNegó = /^(no|nel|nop|negativo|otra|diferente|distint)/i.test(lastUserMsgContent.trim());

      if (botPreguntóConfirmación && userNegó) {
        // El usuario dijo que NO es esa marca → pedir la marca de nuevo
        let directReply = "Entendido. Por favor, indíquenos la marca correcta del equipo.";
        const newMsg: HistMsg = { role: "ia", author: "Asistente Sekunet", time: new Date().toISOString(), content: directReply };
        const upd: Record<string, unknown> = { histtecnico: [...histtecnico, newMsg] };
        if (clienteChanged) upd.cliente = updatedCliente;
        await db.from("sek_cases").update(upd).eq("id", case_id);
        return new Response(JSON.stringify({ ok: true, reply: directReply }), { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }

      if (botPreguntóConfirmación && !userConfirmó && !userNegó) {
        // El usuario no respondió Sí o No → reiterar la pregunta con mensaje de opción inválida
        const matchConfMarca = lastIAMsg.match(/¿Se refiere a "([^"]+)"\?/);
        const marcaPreguntada = matchConfMarca ? matchConfMarca[1] : "esa marca";
        const directReply = `Lo sentimos, la respuesta proporcionada no es válida. Por favor, intente nuevamente utilizando una de las opciones indicadas.\n\n¿Se refiere a "${marcaPreguntada}"? Responda Sí o No.`;
        const newMsg: HistMsg = { role: "ia", author: "Asistente Sekunet", time: new Date().toISOString(), content: directReply };
        const upd: Record<string, unknown> = { histtecnico: [...histtecnico, newMsg] };
        if (clienteChanged) upd.cliente = updatedCliente;
        await db.from("sek_cases").update(upd).eq("id", case_id);
        return new Response(JSON.stringify({ ok: true, reply: directReply }), { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }

      // 🚨 INTERCEPCIÓN INTELIGENTE: Validemos la marca ANTES de pedir el modelo.
      const marcaValida = await validarMarcaSolo(marcaSupervisor);
      
      if (!marcaValida.encontrado && temaSupervisor !== "Otro") {
        // Verificar si el bot ya envió el rechazo de marca y el cliente está respondiendo
        const caseTitleRechazada = typeof caso.title === "string" && caso.title.includes("Marca Rechazada");
        const botYaRechazoMarca = caseTitleRechazada || iaRealMsgs.some(m =>
          m.content?.includes("no corresponde a una línea de productos distribuida por Sekunet") ||
          m.content?.includes("no forma parte de los equipos distribuidos por Sekunet")
        );
        
        if (botYaRechazoMarca) {
          // El bot ya rechazó la marca y el cliente respondió. Determinar intención.
          const userDiceNo = /^(no|nel|nop|negativo|nada|no gracias|no, gracias|ya no|n)/i.test(lastUserMsgContent.trim());
          const userDiceSi = /^(s[ií]|si|yes|claro|por supuesto|afirmativo|aja|ajá|s)/i.test(lastUserMsgContent.trim());
          
          if (userDiceNo || lastUserMsgContent.trim().length < 2) {
            // Cliente dice que no tiene otra consulta → despedirse y cerrar
            const farewell = "Ha sido un gusto atenderle. Si tiene alguna otra consulta, no dude en contactarnos nuevamente. ¡Que tenga un excelente día!";
            const newMsg: HistMsg = { role: "ia", author: "Asistente Sekunet", time: new Date().toISOString(), content: farewell };
            const upd: Record<string, unknown> = { histtecnico: [...histtecnico, newMsg], estado: "cerrado" };
            if (clienteChanged) upd.cliente = updatedCliente;
            upd.title = `${temaSupervisor} — Marca Rechazada`;
            await db.from("sek_cases").update(upd).eq("id", case_id);
            return new Response(JSON.stringify({ ok: true, reply: farewell }), { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });
          } else if (userDiceSi) {
            // Cliente dice que sí tiene otra consulta → pedir tema
            const askTopic = "Con gusto le ayudamos. Por favor, indíquenos brevemente en qué podemos asistirle.";
            const newMsg: HistMsg = { role: "ia", author: "Asistente Sekunet", time: new Date().toISOString(), content: askTopic };
            const upd: Record<string, unknown> = { histtecnico: [...histtecnico, newMsg] };
            if (clienteChanged) upd.cliente = updatedCliente;
            // Reset tema/marca/modelo para empezar nueva consulta
            supervisorResult.tema = "";
            supervisorResult.marca = "";
            supervisorResult.modelo = "";
            upd.title = "WhatsApp — Nueva consulta";
            await db.from("sek_cases").update(upd).eq("id", case_id);
            return new Response(JSON.stringify({ ok: true, reply: askTopic }), { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });
          } else {
            // Cliente escribió algo que podría ser una nueva consulta → procesar como tema nuevo
            const askTopic = "Con gusto le ayudamos. Por favor, indíquenos brevemente en qué podemos asistirle.";
            const newMsg: HistMsg = { role: "ia", author: "Asistente Sekunet", time: new Date().toISOString(), content: askTopic };
            const upd: Record<string, unknown> = { histtecnico: [...histtecnico, newMsg] };
            if (clienteChanged) upd.cliente = updatedCliente;
            supervisorResult.tema = "";
            supervisorResult.marca = "";
            supervisorResult.modelo = "";
            upd.title = "WhatsApp — Nueva consulta";
            await db.from("sek_cases").update(upd).eq("id", case_id);
            return new Response(JSON.stringify({ ok: true, reply: askTopic }), { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });
          }
        }
        
        // Primera vez: la marca no existe en el catálogo. Rechazar y preguntar si tiene otra consulta.
        const rejectionMessage = "Gracias por la información proporcionada.\n\nTras verificar la marca indicada, confirmamos que no corresponde a una línea de productos distribuida por Sekunet. Debido a ello, no contamos con acceso a recursos técnicos, documentación ni herramientas de soporte para dicho equipo.\n\n¿Requiere asistencia relacionada con alguna de nuestras marcas o productos? Con gusto estaremos disponibles para ayudarle.";
        let directReply = rejectionMessage;
        
        const newMsg: HistMsg = { role: "ia", author: "Asistente Sekunet", time: new Date().toISOString(), content: directReply };
        const upd: Record<string, unknown> = { histtecnico: [...histtecnico, newMsg] };
        if (clienteChanged) upd.cliente = updatedCliente;
        upd.title = `${temaSupervisor} — Marca Rechazada`;
        await db.from("sek_cases").update(upd).eq("id", case_id);
        return new Response(JSON.stringify({ ok: true, reply: directReply }), { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }

      // CONFIRMACIÓN DE MARCA: si la marca fue corregida (fuzzy match), preguntar al usuario
      const marcaCorregida = marcaValida.marcaCorregida || marcaSupervisor;
      const marcaFueCorregida = marcaCorregida.toLowerCase() !== marcaSupervisor.toLowerCase();
      
      if (marcaFueCorregida && !botPreguntóConfirmación) {
        // La marca fue corregida por búsqueda inteligente → confirmar con el usuario
        let directReply = `¿Se refiere a "${marcaCorregida}"? Responda Sí o No.`;
        const newMsg: HistMsg = { role: "ia", author: "Asistente Sekunet", time: new Date().toISOString(), content: directReply };
        const upd: Record<string, unknown> = { histtecnico: [...histtecnico, newMsg] };
        if (clienteChanged) upd.cliente = updatedCliente;
        await db.from("sek_cases").update(upd).eq("id", case_id);
        return new Response(JSON.stringify({ ok: true, reply: directReply }), { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }

      // Marca confirmada (exacta o usuario dijo sí) → actualizar marca corregida y pedir modelo
      if (marcaFueCorregida) {
        marcaSupervisor = marcaCorregida;
        supervisorResult.marca = marcaCorregida;
      }
      let directReply = `Perfecto, ya registré la marca "${marcaCorregida}". ¿Cuál es el modelo de su equipo?`;
      const newMsg: HistMsg = { role: "ia", author: "Asistente Sekunet", time: new Date().toISOString(), content: directReply };
      const upd: Record<string, unknown> = { histtecnico: [...histtecnico, newMsg] };
      if (clienteChanged) upd.cliente = updatedCliente;
      await db.from("sek_cases").update(upd).eq("id", case_id);
      return new Response(JSON.stringify({ ok: true, reply: directReply }), { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    // ── ACCIÓN: PEDIR MARCA Y MODELO (cuando no tiene ninguno) ──
    if (accion === "PEDIR_MARCA_Y_MODELO") {
      let directReply = withAcuse("Por favor, indíquenos la marca y el modelo del equipo.");
      const newMsg: HistMsg = { role: "ia", author: "Asistente Sekunet", time: new Date().toISOString(), content: directReply };
      const upd: Record<string, unknown> = { histtecnico: [...histtecnico, newMsg] };
      if (clienteChanged) upd.cliente = updatedCliente;
      await db.from("sek_cases").update(upd).eq("id", case_id);
      return new Response(JSON.stringify({ ok: true, reply: directReply }), { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    let forceVerificarArchivos = false;

    // ── ACCIÓN: BUSCAR_INVENTARIO (solo valida MARCA en BD) ──
    if (accion === "BUSCAR_INVENTARIO") {
      // Solo validamos la MARCA, no el modelo. El modelo se registra tal cual.
      const marcaCheck = await validarMarcaSolo(marcaSupervisor);
      // Usar la marca corregida (ej: "ezvis" → "EZVIZ") para mostrar al cliente
      const marcaDisplay = marcaCheck.marcaCorregida || marcaSupervisor;
      
      if (supervisorResult.tiene_imagen && (temaSupervisor === "Reset" || temaSupervisor === "Desvinculación")) {
        forceVerificarArchivos = true;
        const updFallthrough: Record<string, unknown> = {};
        if (clienteChanged) updFallthrough.cliente = updatedCliente;
        if (marcaCheck.encontrado) {
          updFallthrough.title = `${temaSupervisor} — ${marcaDisplay} ${modeloSupervisor}`.substring(0, 120);
        } else if (nuevoTitle) {
          updFallthrough.title = nuevoTitle;
        }
        if (Object.keys(updFallthrough).length > 0) {
          await db.from("sek_cases").update(updFallthrough).eq("id", case_id);
        }
      } else {
        let directReply: string;
        if (!marcaCheck.encontrado) {
          // MARCA NO ENCONTRADA → Sekunet no distribuye esa marca → cerrar
          directReply = "Gracias por la información proporcionada.\n\nTras verificar la marca indicada, confirmamos que no corresponde a una línea de productos distribuida por Sekunet. Debido a ello, no contamos con acceso a recursos técnicos, documentación ni herramientas de soporte para dicho equipo.\n\n¿Requiere asistencia relacionada con alguna de nuestras marcas o productos? Con gusto estaremos disponibles para ayudarle.";
        } else if (temaSupervisor === "Reset") {
          const esHikvision = /hik/i.test(marcaDisplay);
          directReply = esHikvision
            ? withAcuse(`Perfecto, se registró el equipo ${marcaDisplay} ${modeloSupervisor}.\n\nComo parte de los requisitos del fabricante, requerimos una imagen clara y legible de la etiqueta del equipo y el archivo XML, el cual puede obtener mediante la herramienta SAPD Tools en la opción "Olvidé mi contraseña", ubicada en la parte inferior derecha del software. Por favor, adjunte ambos archivos.`)
            : withAcuse(`Perfecto, se registró el equipo ${marcaDisplay} ${modeloSupervisor}.\n\nPor favor, adjunte una imagen clara y legible de la etiqueta del equipo.`);
        } else if (temaSupervisor === "Desvinculación") {
          directReply = withAcuse(`Perfecto, se registró el equipo ${marcaDisplay} ${modeloSupervisor}.\n\nComo parte de los requisitos del fabricante, requerimos una imagen clara y legible de la etiqueta del equipo. Por favor, adjunte esta imagen.`);
        } else {
          // Otros temas: marca válida, registrar equipo y pedir descripción
          directReply = withAcuse(`Perfecto, se registró el equipo ${marcaDisplay} ${modeloSupervisor}.\n\nPor favor, describa brevemente el inconveniente que presenta.`);
        }

        const newMsg: HistMsg = { role: "ia", author: "Asistente Sekunet", time: new Date().toISOString(), content: directReply };
        const upd: Record<string, unknown> = { histtecnico: [...histtecnico, newMsg] };
        if (clienteChanged) upd.cliente = updatedCliente;
        if (marcaCheck.encontrado) {
          upd.title = `${temaSupervisor} — ${marcaDisplay} ${modeloSupervisor}`.substring(0, 120);
        }
        await db.from("sek_cases").update(upd).eq("id", case_id);
        return new Response(JSON.stringify({ ok: true, reply: directReply }), { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }
    }

    // ── ACCIÓN: PEDIR ETIQUETA (Reset/Desvinculación — no Hikvision) ──
    if (accion === "PEDIR_ETIQUETA") {
      let directReply = withAcuse("Como parte de los requisitos del fabricante, requerimos una imagen clara y legible de la etiqueta del equipo. Por favor, adjunte esta imagen.");
      const newMsg: HistMsg = { role: "ia", author: "Asistente Sekunet", time: new Date().toISOString(), content: directReply };
      const upd: Record<string, unknown> = { histtecnico: [...histtecnico, newMsg] };
      if (clienteChanged) upd.cliente = updatedCliente;
      await db.from("sek_cases").update(upd).eq("id", case_id);
      return new Response(JSON.stringify({ ok: true, reply: directReply }), { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    // ── ACCIÓN: PEDIR ETIQUETA Y XML (Reset Hikvision) ──
    if (accion === "PEDIR_ETIQUETA_Y_XML") {
      let directReply = withAcuse("Como parte de los requisitos del fabricante, requerimos una imagen clara y legible de la etiqueta del equipo y el archivo XML, el cual puede obtener mediante la herramienta SAPD Tools en la opción \"Olvidé mi contraseña\", ubicada en la parte inferior derecha del software. Por favor, adjunte ambos archivos.");
      const newMsg: HistMsg = { role: "ia", author: "Asistente Sekunet", time: new Date().toISOString(), content: directReply };
      const upd: Record<string, unknown> = { histtecnico: [...histtecnico, newMsg] };
      if (clienteChanged) upd.cliente = updatedCliente;
      await db.from("sek_cases").update(upd).eq("id", case_id);
      return new Response(JSON.stringify({ ok: true, reply: directReply }), { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    // ── ACCIÓN: PEDIR DESCRIPCIÓN (temas que no son Reset/Desvinculación) ──
    if (accion === "PEDIR_DESCRIPCION") {
      let directReply = withAcuse("Por favor, describa brevemente el inconveniente que presenta.");
      const newMsg: HistMsg = { role: "ia", author: "Asistente Sekunet", time: new Date().toISOString(), content: directReply };
      const upd: Record<string, unknown> = { histtecnico: [...histtecnico, newMsg] };
      if (clienteChanged) upd.cliente = updatedCliente;
      await db.from("sek_cases").update(upd).eq("id", case_id);
      return new Response(JSON.stringify({ ok: true, reply: directReply }), { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    // ── ACCIÓN: ESCALAR (todo listo, pasar a humano) ──
    if (accion === "ESCALAR") {
      const M02_TEXT = "Agradecemos su preferencia. En un momento será atendido por uno de nuestros agentes.";
      const replyText = M02_TEXT;
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

    // Si el supervisor sugiere M02 como respuesta libre, forzar una escalación real
    // para evitar que el caso se quede pegado en ia_atendiendo / Smart Inbox.
    if (accion === "CONTINUAR" && supervisorResult.respuesta_sugerida?.includes("Agradecemos su preferencia")) {
      accion = "ESCALAR";
    }

    // ── ACCIÓN: CONTINUAR (el supervisor sugiere una respuesta libre/contextual) ──
    // Esto es para casos donde el supervisor entiende el contexto pero la acción no cae en ninguna categoría fija.
    // Ejemplo: el cliente pregunta algo fuera de lo esperado, pide aclaración, etc.
    if (accion === "CONTINUAR" && supervisorResult.respuesta_sugerida) {
      let directReply = supervisorResult.respuesta_sugerida;
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
    const pideArchivosNormal = (lastIA?.content?.includes(MSG_RESET_PIDE_ARCHIVOS) || lastIA?.content?.includes(MSG_RESET_PIDE_IMAGEN) || lastIA?.content?.includes(MSG_RESET_PIDE_XML)) && lastUserTime > lastIATime;
    
    if (pideArchivosNormal || forceVerificarArchivos) {
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
      // Buscar archivos en todos los mensajes recientes
      let imagenUrl: string | null = null;
      let xmlUrl: string | null = null;
      for (const m of recentUserMsgs) {
        if (m.mediaUrl) {
          const mType = (m.mediaType || "").toLowerCase();
          const mName = (m.fileName || "").toLowerCase();
          const mUrl = (m.mediaUrl || "").toLowerCase();
          console.log("[seka-whatsapp] Archivo encontrado - type:", mType, "name:", mName, "url:", mUrl.substring(mUrl.lastIndexOf("/") + 1));
          
          const isXml = mType.includes("xml") || mName.endsWith(".xml") || mUrl.endsWith(".xml");
          const isImg = mType.startsWith("image/") || mName.match(/\.(jpe?g|png|webp|heic)$/i) || mUrl.match(/\.(jpe?g|png|webp|heic)$/i);
          
          if (isImg) {
            imagenUrl = m.mediaUrl;
          } else if (isXml) {
            xmlUrl = m.mediaUrl;
          } else if (!isXml) {
            // Si no es XML, asumimos que es la imagen que mandaron desde WhatsApp
            imagenUrl = m.mediaUrl;
          }
        }
      }

      console.log("[seka-whatsapp] Archivos recibidos - imagen:", !!imagenUrl, "XML:", !!xmlUrl, "totalMsgs:", recentUserMsgs.length);

      // Para Reset: requiere ambos archivos
      if (temaSupervisor === "Reset") {
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

      if (temaSupervisor === "Reset") {
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
- coincide: si no se indicó marca/modelo, devuelve true. Si hay valores, verifica si coinciden con lo que aparece en la etiqueta.
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
          // Si el análisis de visión no responde, escalamos directamente (imagen recibida, no podemos verificarla)
          console.warn("[seka-whatsapp] Análisis de imagen no respondió → escalando directamente.");
          const M02_VISION_FAIL = "Agradecemos su preferencia. En un momento será atendido por uno de nuestros agentes.";
          const newMsgVF: HistMsg = { role: "ia", author: "Asistente Sekunet", time: new Date().toISOString(), content: M02_VISION_FAIL };
          await db.from("sek_cases").update({
            histtecnico: [...histtecnico, newMsgVF],
            estado: "escalado",
            escalado_at: new Date().toISOString(),
            title: `${temaSupervisor} — ${marca} ${modelo}`.substring(0, 120),
            tags: [temaSupervisor === "Desvinculación" ? "desvinculacion" : "reset", "vision_error"],
          }).eq("id", case_id);
          return new Response(JSON.stringify({ ok: true, reply: M02_VISION_FAIL }), { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });
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

      if (temaSupervisor === "Reset") {
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

    // Si la acción del supervisor no encajó en los ifs anteriores (ej. CONTINUAR con JSON fallido),
    // terminamos gracefully sin llamar al segundo LLM obsoleto.
    
    // Reemplazar etiquetas de mensaje por su texto exacto
    const M02 = "Agradecemos su preferencia. En un momento será atendido por uno de nuestros agentes.";
    const M03 = "Ha sido un gusto atenderle. Si tiene alguna otra consulta, no dude en contactarnos nuevamente. ¡Que tenga un excelente día!";
    const M04 = "Agradecemos mucho su interés.\n\nLe informamos que su consulta corresponde al Departamento de Ventas. Con gusto podrán asistirle a través de los siguientes medios:\n\n• Teléfono: +506 2290 5585\n• WhatsApp: +506 8757 5820\n• Correo electrónico: info@sekunet.com\n\nSerá un gusto atenderle por cualquiera de estos canales.\n\n¡Le deseamos un excelente día!";
    
    let fallbackReply = supervisorResult?.respuesta_sugerida || "Estamos validando su solicitud, deme un momento por favor.";
    let rawReply = fallbackReply
      .replace(/\bM02\b/g, M02)
      .replace(/\bM03\b/g, M03)
      .replace(/\bM04\b/g, M04);

    // Procesar otros tags (ESCALAR_N2, CERRAR) y limpiar texto
    let cleanReply = await processTags(rawReply, case_id);

    // Limpiar contexto interno si quedó en el texto
    cleanReply = cleanReply.replace(/__INV__.*?__INV__/gs, "").trim();

    // GUARDIA FINAL: nunca enviar JSON crudo al cliente (ej: {"action":"PEDIR_MODELO"})
    if (/^\s*\{[\s\S]*"action"\s*:/i.test(cleanReply) || /^\s*\{[\s\S]*"accion"\s*:/i.test(cleanReply)) {
      console.warn("[seka-whatsapp] GUARDIA FINAL: se detectó JSON crudo en cleanReply, descartando y forzando ESCALAR.");
      cleanReply = "Agradecemos su preferencia. En un momento será atendido por uno de nuestros agentes.";
      await db.from("sek_cases").update({ estado: "escalado", escalado_at: new Date().toISOString() }).eq("id", case_id);
    }

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
    
    // Respaldo final: escalamos el caso para atención humana
    if (globalCaseId) {
      try {
        const M02_PANIC = "Agradecemos su preferencia. En un momento será atendido por uno de nuestros agentes.";
        const newMsg: HistMsg = {
          role: "ia",
          author: "Asistente Sekunet",
          time: new Date().toISOString(),
          content: M02_PANIC,
        };
        const updatedHist = [...globalHistTecnico, newMsg];
        await db.from("sek_cases").update({
          histtecnico: updatedHist,
          estado: "escalado",
          escalado_at: new Date().toISOString(),
          n2_reason: "Escalado por error crítico",
        }).eq("id", globalCaseId);
        
        console.warn(`[seka-whatsapp] Escalado final activado para el caso ${globalCaseId}`);
        return new Response(JSON.stringify({ ok: true, reply: M02_PANIC }), {
          status: 200,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      } catch (panicError: any) {
        console.error("[seka-whatsapp] Error en el escalado final:", panicError.message);
      }
    }
    
    return new Response(JSON.stringify({ error: e.message }), { status: 500, headers: corsHeaders });
  }
});
