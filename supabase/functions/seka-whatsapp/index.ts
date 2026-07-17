import { createClient } from "npm:@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SERVICE_KEY  = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
const NVIDIA_KEY   = Deno.env.get("NVIDIA_API_KEY") ?? "";
const GEMINI_KEY   = Deno.env.get("GEMINI_API_KEY") ?? "";
const OPENROUTER_KEY = Deno.env.get("OPENROUTER_API_KEY") ?? "";
const NIM_BASE     = "https://integrate.api.nvidia.com/v1";

const db = createClient(SUPABASE_URL, SERVICE_KEY);


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
  { provider: "google", model: "gemini-2.0-flash" },
  { provider: "google", model: "gemini-1.5-flash" },
  { provider: "nvidia", model: "meta/llama-3.2-11b-vision-instruct" },
  { provider: "nvidia", model: "meta/llama-3.2-90b-vision-instruct" },
  { provider: "openrouter", model: "meta-llama/llama-3.2-11b-vision-instruct:free" },
  { provider: "openrouter", model: "qwen/qwen-2-vl-7b-instruct:free" }
];

async function callNvidia(model: string, messages: NimMessage[]): Promise<string> {
  const res = await fetch(`${NIM_BASE}/chat/completions`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "Authorization": `Bearer ${NVIDIA_KEY}` },
    body: JSON.stringify({ model, messages, temperature: 0.2, max_tokens: 400, stream: false, response_format: { type: "json_object" } }),
    signal: AbortSignal.timeout(10000)
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
    body: JSON.stringify({ model, messages, temperature: 0.2, max_tokens: 400, stream: false, response_format: { type: "json_object" } }),
    signal: AbortSignal.timeout(10000)
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
  const body: any = { contents, generationConfig: { temperature: 0.2, maxOutputTokens: 400, responseMimeType: "application/json" } };
  if (system) body.systemInstruction = { parts: [{ text: system.content as string }] };
  
  const res = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${GEMINI_KEY}`,
    { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body), signal: AbortSignal.timeout(10000) }
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

// Caché en memoria de las marcas del inventario (se llena en la primera validación).
let globalCachedBrands: string[] | null = null;

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

    // 2. Normalización fonética
    let uniqueBrands: string[] = [];
    if (globalCachedBrands) {
      uniqueBrands = globalCachedBrands;
    } else {
      const { data: allBrands } = await db.from("sek_inventario").select("marca").limit(500);
      if (allBrands && allBrands.length > 0) {
        uniqueBrands = [...new Set(allBrands.map((b: any) => b.marca).filter(Boolean))] as string[];
        globalCachedBrands = uniqueBrands;
      }
    }
    if (uniqueBrands.length > 0) {
      const inputNorm = normalizarFonetico(input);
      
      // 2a. Coincidencia exacta por normalización fonética
      for (const brand of uniqueBrands) {
        const brandNorm = normalizarFonetico(brand);
        if (inputNorm === brandNorm || inputNorm.includes(brandNorm) || brandNorm.includes(inputNorm)) {
          console.log(`[seka-whatsapp] Marca encontrada por fonética: "${input}" (norm: "${inputNorm}") → "${brand}" (norm: "${brandNorm}")`);
          return { encontrado: true, marcaCorregida: brand };
        }
      }

      // 2b. Levenshtein sobre las formas normalizadas
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
      if (bestDist <= 2 && bestMatch) {
        console.log(`[seka-whatsapp] Marca encontrada por Levenshtein normalizado (dist=${bestDist}): "${input}" → "${bestMatch}"`);
        return { encontrado: true, marcaCorregida: bestMatch };
      }

      // 3. Levenshtein crudo
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
      if (input.length >= 5 && bestRawDist <= 2 && bestRaw) {
         console.log(`[seka-whatsapp] Marca encontrada por Levenshtein crudo (dist=${bestRawDist}): "${input}" → "${bestRaw}"`);
         return { encontrado: true, marcaCorregida: bestRaw };
      }

      // 4. Para entradas cortas, comparar con el prefijo fonético de cada marca (ej: "hok" → "Hikvision")
      if (input.length <= 5) {
        let bestPrefix = "";
        let bestPrefixDist = Infinity;
        for (const brand of uniqueBrands) {
          const brandNorm = normalizarFonetico(brand);
          const prefix = brandNorm.substring(0, Math.max(3, input.length));
          const dist = levenshtein(inputNorm, prefix);
          if (dist < bestPrefixDist) {
            bestPrefixDist = dist;
            bestPrefix = brand;
          }
        }
        if (bestPrefixDist <= 1 && bestPrefix) {
          console.log(`[seka-whatsapp] Marca encontrada por prefijo fonético (dist=${bestPrefixDist}): "${input}" → "${bestPrefix}"`);
          return { encontrado: true, marcaCorregida: bestPrefix };
        }
      }
    }
    
    return { encontrado: false };
  } catch (e) {
    console.error("[seka-whatsapp] Error validando marca:", e);
    return { encontrado: false };
  }
}


// ─── DETECTAR NÚMERO DE SERIE (no modelo) ───────────────────────────────────────
function pareceNumeroSerie(valor: string): boolean {
  if (!valor) return false;
  const v = valor.trim().toUpperCase().replace(/[^A-Z0-9]/g, "");
  // Patrones típicos de serial number: 1 letra + 7+ dígitos, o 8+ dígitos puros.
  if (/^[A-Z]\d{7,}$/.test(v)) return true;
  if (/^\d{8,}$/.test(v)) return true;
  return false;
}

// ─── VALIDAR MODELO: INVENTARIO + FUENTE EXTERNA ──────────────────────────────
async function validarModelo(marca: string, modelo: string): Promise<{ valido: boolean; fuente: "inventario" | "externo" | "no_encontrado"; detalle: string }> {
  if (!modelo || modelo.trim().length < 2) {
    return { valido: false, fuente: "no_encontrado", detalle: "El modelo no puede estar vacío" };
  }
  if (pareceNumeroSerie(modelo)) {
    return { valido: false, fuente: "no_encontrado", detalle: "Ese valor parece un número de serie, no un modelo. Por favor indique el modelo del equipo." };
  }

  const query = `${marca} ${modelo}`.trim();
  const inv = await buscarInventario(query);
  if (inv.encontrado) {
    return { valido: true, fuente: "inventario", detalle: inv.detalle };
  }

  // Fallback externo: búsqueda real en internet usando Gemini con Google Search.
  if (!GEMINI_KEY) {
    console.warn("[seka-whatsapp] GEMINI_KEY no configurado, no se puede realizar búsqueda web para validar modelo.");
    return { valido: false, fuente: "no_encontrado", detalle: "Modelo no encontrado en inventario; búsqueda web no disponible" };
  }

  try {
    const searchRes = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash-lite:generateContent?key=${GEMINI_KEY}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contents: [{ parts: [{ text: `Verifica si "${modelo}" es un número de modelo válido (NO un número de serie) para la marca "${marca}". Un modelo incluye letras, guiones y números como "DS-2CD2143G2-IU" o "DHI-IPC-HDW1230T-S5". Un número de serie suele ser una letra seguida de puros dígitos. Responde SOLO con una línea JSON: {"existe": true/false, "razon": "motivo breve"}. No agregues nada más.` }] }],
          generationConfig: { maxOutputTokens: 200, temperature: 0.2 },
          tools: [{ googleSearch: {} }],
        }),
      }
    );
    if (searchRes.ok) {
      const searchData = await searchRes.json();
      const webResult = searchData.candidates?.[0]?.content?.parts?.[0]?.text?.trim() || "";
      const jsonMatch = webResult.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        const result = JSON.parse(jsonMatch[0]);
        if (result.existe) {
          return { valido: true, fuente: "externo", detalle: result.razon || "Modelo confirmado mediante búsqueda web" };
        }
        return { valido: false, fuente: "externo", detalle: result.razon || "Modelo no encontrado en búsqueda web" };
      }
      // Si no devolvió JSON estricto, NO aceptar por defecto; exigir validación explícita.
    }
  } catch (e: any) {
    console.error("[seka-whatsapp] Error en búsqueda web de modelo:", e.message);
  }

  // Fallback de patrón: si el modelo coincide con patrones conocidos de marcas de seguridad,
  // aceptarlo aunque Gemini falle. Evita rechazar modelos válidos por fallos de API.
  // Patrones estrictos con suficiente estructura para evitar falsos positivos.
  const patronesConocidos = [
    /^DS-2[A-Z]{1,3}[0-9A-Z]+/i,  // Hikvision: DS-2CD..., DS-2DE..., DS-2CE..., DS-2DP...
    /^DS-1[A-Z]{1,3}[0-9A-Z]+/i,  // Hikvision: DS-1HD..., DS-1NP...
    /^DHI-[A-Z]{2,}[0-9A-Z-]+/i,  // Dahua: DHI-IPC-HDW..., DHI-NVR...
    /^IPC-[A-Z]{2,}[0-9A-Z-]+/i,  // Dahua: IPC-HDW..., IPC-HFW...
    /^DH-[A-Z]{2,}[0-9A-Z-]+/i,   // Dahua: DH-IPC...
  ];
  if (patronesConocidos.some(p => p.test(modelo.trim()))) {
    console.log(`[seka-whatsapp] Fallback patrón: modelo "${modelo}" aceptado por coincidir con patrón conocido de marca "${marca}".`);
    return { valido: true, fuente: "externo", detalle: `Modelo con patrón válido para ${marca}` };
  }

  return { valido: false, fuente: "no_encontrado", detalle: "Modelo no encontrado en inventario ni en búsqueda web" };
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
    await safeUpdateCase({
      estado: "escalado",
      n2_reason: escMatch[1].trim(),
    }, caseId);
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
  "Estimado cliente:\n\nLe informamos que esta conversación podrá ser finalizada o cerrada tras 5 minutos de inactividad.\n\nAgradecemos su atención.",
  "Para comenzar, ¿me podría indicar su nombre completo?",
  "¿En relación con qué tema sería su consulta?",
  `¿En relación con qué tema sería su consulta?\n\n1. Configuraciones\n2. Reset\n3. Desvinculación\n4. Firmware\n5. Software\n6. Licencias\n7. Otro\n\nResponda con el número o el nombre del tema.`
];

const MSG_HORARIO = "Horario de atención\nLunes a Viernes · 7:30 a. m. – 5:00 p. m.\nSerá un gusto atenderle";

// Horario de atención: lunes a viernes 7:30 a.m. - 5:00 p.m. (Costa Rica, UTC-6)
function isOpenNowCR(): boolean {
  const now = new Date();
  const utcH = now.getUTCHours();
  const utcM = now.getUTCMinutes();
  let crH = utcH - 6;
  if (crH < 0) crH += 24;
  const crMin = crH * 60 + utcM;
  // getUTCDay: 0=domingo, 1=lunes, ..., 6=sábado
  let dow = now.getUTCDay();
  if (crH > utcH) dow = (dow + 6) % 7;
  if (dow === 0 || dow === 6) return false;
  return crMin >= 450 && crMin < 1020; // 7:30 = 450, 17:00 = 1020
}

const TOPICS = ["Configuraciones","Reset","Desvinculación","Firmware","Software","Licencias","Otro"];

// Mapa de respuesta numérica → tema (para el menú de texto)
const TOPIC_NUMBER_MAP: Record<string, string> = {
  "1": "Configuraciones",
  "2": "Reset",
  "3": "Desvinculación",
  "4": "Firmware",
  "5": "Software",
  "6": "Licencias",
  "7": "Otro",
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

// Versión ESTRICTA: solo acepta número exacto (1-7) o nombre exacto del tema.
// NO hace coincidencia parcial. Usada para detectar si el cliente eligió del menú.
function resolveTopicStrict(input: string): string | null {
  const trimmed = input.trim();
  if (TOPIC_NUMBER_MAP[trimmed]) return TOPIC_NUMBER_MAP[trimmed];
  const lower = trimmed.toLowerCase();
  for (const t of TOPICS) {
    if (t.toLowerCase() === lower) return t;
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

  // Construir system prompt de contexto para análisis de imágenes/etiquetas
  const systemWithTema = `Eres el Asistente de Soporte de Sekunet (Costa Rica). Trato de "usted", sin emojis, máximo 2 oraciones por mensaje.${tema ? ` El cliente seleccionó el tema: ${tema}.` : ""}`;

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

// ─── HELPERS DE NEGOCIO ─────────────────────────────────────────────────────
const buildN2Reason = (fallback: string): string => fallback;

/**
 * Actualiza un caso de forma resiliente. Si la tabla aún no tiene la columna
 * n2_reason (ej. migración pendiente), reintenta sin ese campo en vez de fallar.
 */
async function safeUpdateCase(update: Record<string, unknown>, caseId: string): Promise<void> {
  const { error } = await db.from("sek_cases").update(update).eq("id", caseId);
  if (error && error.message && error.message.toLowerCase().includes("n2_reason")) {
    console.warn("[seka-whatsapp] Columna n2_reason no existe, reintentando sin ella:", error.message);
    const { n2_reason: _, ...fallbackUpdate } = update;
    const { error: retryErr } = await db.from("sek_cases").update(fallbackUpdate).eq("id", caseId);
    if (retryErr) throw new Error(`safeUpdateCase fallback error: ${retryErr.message}`);
    return;
  }
  if (error) throw new Error(`safeUpdateCase error: ${error.message}`);
}

/**
 * Cuenta cuántas veces el bot ya envió el mensaje de "dato inválido"
 * para el paso actual. Se detecta por la combinación del mensaje genérico
 * de invalidez + la frase característica del paso (ej: "nombre completo").
 */
function contarReintentos(iaMsgs: { content?: string }[], fraseCaracteristica: string): number {
  const frase = fraseCaracteristica.toLowerCase();
  return iaMsgs.filter(m => {
    const c = (m.content || "");
    const cl = c.toLowerCase();
    // Contar mensajes que contienen la frase característica Y un mensaje de invalidéz
    // (ya sea el genérico "La información ingresada no es válida" o los específicos como
    // "No reconocí", "no tiene un formato válido", etc.)
    return cl.includes(frase) && (
      c.includes("La información ingresada no es válida") ||
      c.includes("No reconocí") ||
      c.includes("no tiene un formato válido") ||
      c.includes("no es válida") ||
      c.includes("Por favor, verifique")
    );
  }).length;
}

const MSG_CIERRE_REINTENTOS = "Lamentamos no poder continuar. Hemos intentado registrar sus datos en varias ocasiones sin éxito. Le invitamos a contactarnos nuevamente cuando tenga la información a mano. ¡Que tenga un excelente día!";
const MSG_INVALIDO = "La información ingresada no es válida. Por favor, verifique el dato e inténtelo nuevamente.";
const MSG_NOMBRE_INVALIDO = "No reconocí un nombre completo. Por favor indíqueme su nombre y apellido (por ejemplo: María Chaves).";
const MSG_CORREO_INVALIDO = "El correo ingresado no tiene un formato válido. Por favor, escriba su correo electrónico real para poder contactarle.";
const MSG_CUENTA_INVALIDO = "No reconocí el nombre de la empresa o cuenta afiliada. Por favor indíqueme el nombre exacto de la cuenta o empresa vinculada a Sekunet.";
const MSG_DESCRIPCION_INVALIDO = "La descripción no es clara. Por favor, describa brevemente su inconveniente con más detalle.";
const MSG_MEDIA_NO_PERMITIDA = "No puedo procesar imágenes ni audios en este paso. Por favor responda con texto.";

// Filtros mínimos e infalibles — los casos grises los resuelve el Supervisor (LLM).
function isNombrePropioValido(name: string): boolean {
  const trimmed = name.trim();
  if (!trimmed || trimmed.length < 3) return false;
  // Claramente no es un nombre
  if (trimmed.includes("@")) return false;
  if (/https?:\/\//i.test(trimmed)) return false;
  if (/\d/.test(trimmed)) return false;
  // Mínimo 2 palabras (nombre + apellido)
  const words = trimmed.split(/\s+/).filter(w => w.length > 0);
  if (words.length < 2) return false;
  // Máximo 6 palabras (nombres compuestos largos)
  if (words.length > 6) return false;
  // Solo letras, acentos, ñ, ü, guiones y apóstrofos
  if (/[^a-zA-ZáéíóúÁÉÍÓÚñÑüÜ\s\-']/.test(trimmed)) return false;
  // Frases obvias que no son nombres (comparación de substring multi-palabra)
  const obviasNoNombre = [
    "buenos dias", "buenas tardes", "buenas noches",
    "tengo un problema", "necesito ayuda", "no lo se", "no lo sé",
  ];
  const lower = trimmed.toLowerCase();
  if (obviasNoNombre.some(f => lower.includes(f))) return false;
  // Palabras de una sola sílaba que nunca son nombre: solo si el texto COMPLETO es esa palabra
  const soloUna = ["si", "sí", "no", "ok", "hola", "hey", "gracias"];
  if (soloUna.includes(lower)) return false;
  // Palabras funcionales (artículos, preposiciones, conjunciones, verbos comunes) que
  // NUNCA aparecen en un nombre propio real. Si alguna palabra de la frase coincide,
  // es una oración/frase común, no un nombre — rechazar sin esperar al Supervisor.
  const palabrasFuncionales = new Set([
    "el", "la", "los", "las", "un", "una", "unos", "unas", "de", "del", "al",
    "es", "esta", "esto", "eso", "ese", "esa", "que", "para", "por", "con",
    "sin", "sobre", "entre", "hacia", "según", "segun", "desde", "hasta",
    "versión", "version", "problema", "equipo", "switch", "cámara", "camara",
    "grabación", "grabacion", "acceso", "servicio", "necesito", "quiero",
    "tengo", "estoy", "puede", "podría", "podria", "ayuda", "ayudar",
    "funciona", "funcionando", "instalado", "conectado", "activo", "y", "o",
  ]);
  if (words.some(w => palabrasFuncionales.has(w.toLowerCase()))) return false;
  // Todo lo demás → dejar pasar; se valida con IA en validarNombreConIA()
  return true;
}

// Validación semántica con IA: se invoca SIEMPRE (no solo en casos grises) para
// confirmar que el texto es realmente un nombre propio de persona antes de aceptarlo.
// Actúa como segunda capa tras el filtro regex isNombrePropioValido().
async function validarNombreConIA(texto: string): Promise<boolean> {
  try {
    const messages: NimMessage[] = [
      {
        role: "system",
        content: `Eres un validador estricto de nombres propios de personas. Responde SOLO con "SI" o "NO", sin explicaciones.
Responde "SI" únicamente si el texto es un nombre y apellido real de una persona (ej: "María Chaves", "Juan Carlos Ramírez").
Responde "NO" si es una frase, oración, descripción de un problema, nombre de equipo/producto, saludo, o cualquier cosa que no sea un nombre propio de persona.`,
      },
      { role: "user", content: `Texto: "${texto}"` },
    ];
    const raw = await callAIWithFallbacks(messages);
    return /^\s*s[ií]/i.test(raw.trim());
  } catch (e: any) {
    console.error("[seka-whatsapp] validarNombreConIA error:", e.message);
    // Si la IA falla, confiar en el resultado del filtro regex (ya pasado antes de llamar aquí)
    return true;
  }
}

function esCorreoValido(texto: string): boolean {
  const t = texto.trim().toLowerCase();
  if (!t) return false;
  // No aceptar "Sin correo" como correo válido (eso es un marcador de campo atendido)
  if (t.includes("sin correo")) return false;
  const emailRegex = /^[\w.+-]+@[\w.-]+\.[a-zA-Z]{2,}$/;
  if (!emailRegex.test(t)) return false;
  const dominio = t.split("@")[1];
  const dominiosDescartables = new Set([
    "example.com", "test.com", "fake.com", "temp.com", "mail.com", "email.com",
    "a.com", "b.com", "c.com", "d.com", "e.com", "f.com", "g.com", "h.com", "i.com", "j.com", "k.com", "l.com", "m.com", "n.com", "o.com", "p.com", "q.com", "r.com", "s.com", "t.com", "u.com", "v.com", "w.com", "x.com", "y.com", "z.com",
    "1.com", "2.com", "3.com", "4.com", "5.com", "6.com", "7.com", "8.com", "9.com", "0.com",
  ]);
  if (dominiosDescartables.has(dominio)) return false;
  return true;
}

function esCuentaValida(texto: string): boolean {
  const t = texto.trim();
  if (!t || t.length < 2) return false;
  const lower = t.toLowerCase();
  // Rechazar frases relativas y vacías
  const frasesRelativas = ["a mi nombre", "mi nombre", "yo mismo", "personal", "la mía", "la mia", "esta cuenta", "mi cuenta", "sin cuenta", "no tengo", "ninguna", "cliente final"];
  if (frasesRelativas.some(f => lower.includes(f))) return false;
  return true;
}

function esDescripcionValida(texto: string): boolean {
  const t = texto.trim();
  if (!t || t.length < 5) return false;
  return true;
}

function esMensajeDeMedia(m: HistMsg): boolean {
  return !!(m.mediaUrl || m.mediaType || (m.fileName && /\.(jpg|jpeg|png|gif|webp|pdf|mp3|ogg|wav|m4a|mp4|mov|avi)$/i.test(m.fileName)));
}

// Determina si el último mensaje del bot estaba pidiendo un dato de texto (no media)
function pasoPideTexto(lastIaContent: string): boolean {
  const lower = (lastIaContent || "").toLowerCase();
  const pideTexto = [
    "nombre completo", "correo electrónico", "empresa o cuenta afiliada", "nombre de la empresa",
    "tema sería", "tema de la consulta", "número o el nombre del tema",
    "marca del equipo", "marca específica", "modelo del equipo", "modelo específico",
    "descripción del problema", "describa brevemente", "describa su consulta",
  ];
  return pideTexto.some(p => lower.includes(p));
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

    // Publica un mensaje de la IA de forma resiliente a ráfagas de WhatsApp: re-lee el historial
    // JUSTO antes de escribir y (a) evita duplicar un mensaje idéntico al último ya enviado por
    // invocaciones paralelas, y (b) hace append sobre el historial fresco para no pisar mensajes.
    const postTecnico = async (reply: string, extra: Record<string, unknown> = {}): Promise<Response> => {
      const { data: fresh } = await db.from("sek_cases").select("histtecnico").eq("id", case_id).maybeSingle();
      const freshHist: HistMsg[] = Array.isArray(fresh?.histtecnico) ? (fresh as any).histtecnico : histtecnico;
      const lastFreshIa = [...freshHist].reverse().find(m => m.role === "ia" || m.role === "assistant" || m.role === "tecnico");
      if ((lastFreshIa?.content || "").trim() === reply.trim()) {
        console.log("[seka-whatsapp] Dedup: mensaje idéntico al último de la IA, se omite reenvío.");
        return new Response(JSON.stringify({ ok: true, skipped: true, dedup: true }), { status: 200, headers: corsHeaders });
      }
      const newMsg: HistMsg = { role: "ia", author: "Asistente Sekunet", time: new Date().toISOString(), content: reply };
      await db.from("sek_cases").update({ histtecnico: [...freshHist, newMsg], ...extra }).eq("id", case_id);
      return new Response(JSON.stringify({ ok: true, reply }), { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    };

    // Combinar todos los mensajes ordenados por tiempo para saber en qué paso estamos
    const allMsgs = [...histcliente, ...histtecnico].sort((a, b) =>
      new Date(a.time || 0).getTime() - new Date(b.time || 0).getTime()
    );

    // Filtrar mensajes reales (sin bienvenidas ni cierres automáticos)
    const WELCOME_TEXTS_CHECK = [
      "Reciba un cordial saludo de parte del equipo de Soporte Sekunet. Gracias por contactarnos.",
      "Soy el Asistente Virtual de Sekunet. Para brindarle una mejor asistencia, necesitamos algunos datos para registrar su consulta.",
      "Estimado cliente:\n\nLe informamos que esta conversación podrá ser finalizada o cerrada tras 5 minutos de inactividad.\n\nAgradecemos su atención.",
      "Para comenzar, ¿me podría indicar su nombre completo?",
      "¿En relación con qué tema sería su consulta?",
      `¿En relación con qué tema sería su consulta?\n\n1. Configuraciones\n2. Reset\n3. Desvinculación\n4. Firmware\n5. Software\n6. Licencias\n7. Otro\n\nResponda con el número o el nombre del tema.`
    ];
    const CRON_CLOSE_TEXT = "Al no haber recibido respuesta, procederemos a cerrar esta conversación. Si necesita asistencia adicional, puede contactarnos nuevamente y con gusto le atenderemos. ¡Que tenga un excelente día!";
    const TOPICS_CHECK = ["Configuraciones","Reset","Desvinculación","Firmware","Software","Licencias","Otro"];
    // El mensaje del menú de tema ahora tiene múltiples líneas — incluirlo en textos a ignorar
    const MENU_TEMA_PREFIX = "¿En relación con qué tema sería su consulta?";
    const MENU_TEXTO = `¿En relación con qué tema sería su consulta?\n\n1. Configuraciones\n2. Reset\n3. Desvinculación\n4. Firmware\n5. Software\n6. Licencias\n7. Otro\n\nResponda con el número o el nombre del tema.`;

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
    console.log(`[seka-whatsapp] USER-RAW: content=${JSON.stringify(lastUserMsgContent)}, mediaUrl=${lastUserMsg?.mediaUrl}, mediaType=${lastUserMsg?.mediaType}`);
    const lastIATime  = lastIA?.time ? new Date(lastIA.time).getTime() : 0;
    const lastUserTime = lastUserMsg?.time ? new Date(lastUserMsg.time).getTime() : 0;

    // Blindaje de media: si el bot pidió texto y el usuario envía imagen/audio, redirigir.
    if (lastUserMsg && esMensajeDeMedia(lastUserMsg) && pasoPideTexto(lastIA?.content || "")) {
      const newMsg: HistMsg = { role: "ia", author: "Asistente Sekunet", time: new Date().toISOString(), content: MSG_MEDIA_NO_PERMITIDA };
      await db.from("sek_cases").update({ histtecnico: [...histtecnico, newMsg] }).eq("id", case_id);
      return new Response(JSON.stringify({ ok: true, reply: MSG_MEDIA_NO_PERMITIDA }), { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    // Detectar tema — usar coincidencia ESTRICTA para topiIdx (selección explícita del menú)
    const topiIdx = userRealMsgs.findIndex(m => resolveTopicStrict(m.content?.trim() ?? "") !== null);
    // temaInferido solo se usa como hint para el LLM, NO determina el flujo.
    // El flujo se controla con temaPersistido (BD) y temaMenu (selección posterior al menú).
    let temaInferido = topiIdx >= 0 ? (resolveTopicStrict(userRealMsgs[topiIdx].content?.trim() ?? "") ?? "Consulta") : "Consulta";
    const tema = temaInferido;

    // ═══════════════════════════════════════════════════════════════════════
    // FLUJO DE BIENVENIDA PASO A PASO (WhatsApp)
    // ═══════════════════════════════════════════════════════════════════════

    // Fuera de horario: el agente de bienvenida está "apagado" → solo informar horario
    if (!isOpenNowCR()) {
      return new Response(JSON.stringify({ ok: true, reply: [MSG_HORARIO] }), { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    // PASO 0: Primer mensaje del usuario dentro de horario → flujo completo de bienvenida
    if (userCount === 1 && iaCount === 0) {
      // Re-leer histtecnico fresco para evitar doble bienvenida por doble disparo del webhook
      const { data: freshCheck } = await db.from("sek_cases").select("histtecnico").eq("id", case_id).maybeSingle();
      const freshHist0: HistMsg[] = Array.isArray(freshCheck?.histtecnico) ? (freshCheck as any).histtecnico : histtecnico;
      const freshIaCount = freshHist0.filter((m: HistMsg) => m.role === "ia" || m.role === "assistant" || m.role === "tecnico").length;
      if (freshIaCount > 0) {
        console.log("[seka-whatsapp] PASO 0: bienvenida ya enviada (freshIaCount=" + freshIaCount + "), omitiendo duplicado.");
        return new Response(JSON.stringify({ ok: true, skipped: true, dedup: true }), { status: 200, headers: corsHeaders });
      }
      const directReply = "Reciba un cordial saludo de parte del equipo de Soporte Sekunet. Gracias por contactarnos.";
      const msg1 = "Soy el Asistente Virtual de Sekunet. Para brindarle una mejor asistencia, necesitamos algunos datos para registrar su consulta.";
      const msgAutoclose = "Estimado cliente:\n\nLe informamos que esta conversación podrá ser finalizada o cerrada tras 5 minutos de inactividad.\n\nAgradecemos su atención.";
      const msg2 = "Para comenzar, ¿me podría indicar su nombre completo?";
      const newMsgs: HistMsg[] = [
        { role: "ia", author: "Asistente Sekunet", time: new Date().toISOString(), content: directReply },
        { role: "ia", author: "Asistente Sekunet", time: new Date(Date.now() + 10).toISOString(), content: msg1 },
        { role: "ia", author: "Asistente Sekunet", time: new Date(Date.now() + 20).toISOString(), content: msgAutoclose },
        { role: "ia", author: "Asistente Sekunet", time: new Date(Date.now() + 30).toISOString(), content: msg2 },
      ];
      await db.from("sek_cases").update({ histtecnico: [...freshHist0, ...newMsgs] }).eq("id", case_id);
      return new Response(JSON.stringify({ ok: true, reply: [directReply, msg1, msgAutoclose, msg2] }), { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    // ═══════════════════════════════════════════════════════════════════════
    // FAST-PATH DETERMINÍSTICO — Recolección de nombre/correo/cuenta SIN LLM
    // Da respuestas instantáneas. Solo se llama al LLM en pasos avanzados.
    // ═══════════════════════════════════════════════════════════════════════
    {
      const cliFP = (caso.cliente && typeof caso.cliente === "object") ? (caso.cliente as any) : {};
      const lastBotFP = (lastIA?.content || "").toLowerCase();
      const userRespFP = lastUserMsgContent.trim();
      const userLowerFP = userRespFP.toLowerCase();

      // FAST PATH DESACTIVADO: toda respuesta del cliente debe ser supervisada por la IA
      // (Supervisor) sin excepción, para evitar que datos inválidos (ej. frases que no son
      // nombres propios) se acepten por un simple regex sin criterio semántico.
      const usarFastPath = false;

      if (usarFastPath) {
        // ── PASO NOMBRE ──
        if (!cliFP.nombre && lastBotFP.includes("nombre completo")) {
          // Doble validación EN TODAS LAS OCASIONES: primero el filtro regex (rápido, descarta
          // casos obvios), luego SIEMPRE la IA (validarNombreConIA) confirma semánticamente
          // que es un nombre propio real antes de aceptarlo — nunca se omite esta segunda capa.
          if (isNombrePropioValido(userRespFP) && await validarNombreConIA(userRespFP)) {
            const cli = { ...cliFP, nombre: userRespFP };
            const preg = "Gracias. ¿Me podría indicar su correo electrónico?";
            const newMsg: HistMsg = { role: "ia", author: "Asistente Sekunet", time: new Date().toISOString(), content: preg };
            await db.from("sek_cases").update({ histtecnico: [...histtecnico, newMsg], cliente: cli }).eq("id", case_id);
            return new Response(JSON.stringify({ ok: true, reply: preg }), { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });
          }
          const reint = contarReintentos(iaRealMsgs, "nombre completo");
          if (reint >= 2) {
            const newMsg: HistMsg = { role: "ia", author: "Asistente Sekunet", time: new Date().toISOString(), content: MSG_CIERRE_REINTENTOS };
            await db.from("sek_cases").update({ histtecnico: [...histtecnico, newMsg], estado: "cerrado" }).eq("id", case_id);
            return new Response(JSON.stringify({ ok: true, reply: MSG_CIERRE_REINTENTOS }), { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });
          }
          const preg = `${MSG_NOMBRE_INVALIDO}\n\nPara comenzar, ¿me podría indicar su nombre completo?`;
          const newMsg: HistMsg = { role: "ia", author: "Asistente Sekunet", time: new Date().toISOString(), content: preg };
          await db.from("sek_cases").update({ histtecnico: [...histtecnico, newMsg] }).eq("id", case_id);
          return new Response(JSON.stringify({ ok: true, reply: preg }), { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });
        }

        // ── PASO TEMA (fast-path: si el último bot fue el menú de temas y el cliente responde un número/nombre válido) ──
        if (cliFP.nombre && cliFP.correo && cliFP.cuenta && !cliFP.tema &&
            (lastBotFP.includes("número o el nombre del tema") || lastBotFP.includes("tema sería su consulta"))) {
          const temaResuelto = resolveTopicFromText(userRespFP);
          if (temaResuelto) {
            const cli = { ...cliFP, tema: temaResuelto };
            const pregMarca = "Por favor, indíquenos la marca del equipo.";
            const newMsg: HistMsg = { role: "ia", author: "Asistente Sekunet", time: new Date().toISOString(), content: pregMarca };
            await db.from("sek_cases").update({ histtecnico: [...histtecnico, newMsg], cliente: cli }).eq("id", case_id);
            return new Response(JSON.stringify({ ok: true, reply: pregMarca }), { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });
          }
          // No reconoció el tema → reintentar con el menú
          const MENU_TEMAS_FP = "¿En relación a qué tema sería su consulta?\n\n1. Configuraciones\n2. Reset\n3. Desvinculación\n4. Firmware\n5. Software\n6. Licencias\n7. Otro\n\nResponda con el número o el nombre del tema.";
          const newMsg: HistMsg = { role: "ia", author: "Asistente Sekunet", time: new Date().toISOString(), content: MENU_TEMAS_FP };
          await db.from("sek_cases").update({ histtecnico: [...histtecnico, newMsg] }).eq("id", case_id);
          return new Response(JSON.stringify({ ok: true, reply: MENU_TEMAS_FP }), { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });
        }

        // ── PASO CUENTA ──
        if (cliFP.nombre && cliFP.correo && !cliFP.cuenta && lastBotFP.includes("empresa o cuenta afiliada")) {
          const negacionCuenta = /(no tengo|no lo tengo|ninguna|cliente final|no cuento|no tengo empresa|no tengo cuenta)/i.test(userLowerFP);
          if (negacionCuenta) {
            const cli = { ...cliFP, cuenta: "sin cuenta" };
            const M_NO_CUENTA = "Gracias por comunicarse con Sekunet.\n\nLe informamos que nuestro servicio de soporte técnico es un beneficio exclusivo para clientes y distribuidores autorizados de nuestra red.\n\nPor este motivo, le recomendamos contactar directamente a su proveedor o instalador, quien podrá brindarle la asistencia correspondiente con su requerimiento.\n\nAgradecemos su comprensión y le deseamos un excelente día.";
            const newMsg: HistMsg = { role: "ia", author: "Asistente Sekunet", time: new Date().toISOString(), content: M_NO_CUENTA };
            await db.from("sek_cases").update({ histtecnico: [...histtecnico, newMsg], cliente: cli, estado: "cerrado" }).eq("id", case_id);
            return new Response(JSON.stringify({ ok: true, reply: M_NO_CUENTA }), { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });
          }
          if (userRespFP.length >= 2 && !userRespFP.includes("@")) {
            const cli = { ...cliFP, cuenta: userRespFP };
            const menuTemas = "¿En relación a qué tema sería su consulta?\n\n1. Configuraciones\n2. Reset\n3. Desvinculación\n4. Firmware\n5. Software\n6. Licencias\n7. Otro\n\nResponda con el número o el nombre del tema.";
            const newMsg: HistMsg = { role: "ia", author: "Asistente Sekunet", time: new Date().toISOString(), content: menuTemas };
            await db.from("sek_cases").update({ histtecnico: [...histtecnico, newMsg], cliente: cli }).eq("id", case_id);
            return new Response(JSON.stringify({ ok: true, reply: menuTemas }), { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });
          }
        }
      }
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

    const supervisorPrompt = `Eres el Supervisor Inteligente del chat de soporte de Sekunet (Costa Rica), equivalente a un sistema de triaje de atención al cliente de clase mundial. Tu trabajo es ANALIZAR la conversación completa, entender la situación e intención del cliente, y decidir con precisión qué información ya se recopiló, cuál falta y cuál es el siguiente paso óptimo.

CONVERSACIÓN COMPLETA:
${conversationSummary}

DATOS ACTUALES DEL CASO EN BASE DE DATOS:
- nombre: ${(caso.cliente as any)?.nombre || ""}
- correo: ${(caso.cliente as any)?.correo || ""}
- cuenta: ${(caso.cliente as any)?.cuenta || ""}

CONTEXTO: El asistente sigue este flujo de recopilación de datos:
1. Nombre, correo y cuenta del cliente
2. Tema de consulta (Configuraciones, Reset, Desvinculación, Firmware, Software, Licencias, Otro)
3. Marca del equipo
4. Modelo del equipo
5. Para Reset/Desvinculación: imagen de etiqueta (y XML para Hikvision en Reset)
6. Para otros temas: descripción del problema

REGLA DE ORO / PRIORIDAD MÁXIMA:
- VENTAS Y COTIZACIONES: Si el mensaje del usuario tiene CUALQUIER intención comercial, de compra, venta, precios, stock, distribuciones o cotizaciones (incluso con errores ortográficos como "venbden", "komprar", "cuanto kuesta", o preguntas como "¿VENDEN CÁMARAS DAHUA?"), DEBES OBLIGATORIAMENTE marcar la accion como "VENTAS" inmediatamente, ignorando todas las demás reglas y pasos.

REGLAS DE ANÁLISIS:
- Si el cliente indica EXPRESAMENTE que NO TIENE cuenta o empresa (ej: "no tengo", "ninguna", "cliente final"), extrae la cuenta como "Sin cuenta". PERO si el cliente simplemente omite el dato en su respuesta (ej. da su nombre y correo pero no menciona la empresa), DEBES dejar el campo cuenta vacío ("") para que el sistema lo vuelva a pedir. NUNCA extraigas el nombre de la cuenta o empresa a partir del dominio o texto del correo electrónico. Si el usuario no escribe explícitamente el nombre de su cuenta, debes dejarlo vacío.
- REGLA DE CUENTA PERSONAL: Si el cliente indica que la cuenta está a su nombre personal o repite su nombre (ej: "está a mi nombre", "a nombre de Juan", "a título personal", "la cuenta es mía"), extrae SU NOMBRE EXACTO (ej: "Juan") como el valor de la "cuenta". Es VÁLIDO que el nombre de la cuenta sea igual al nombre del cliente (registro a título personal). NUNCA extraigas frases relativas como "a mi nombre" o "yo mismo".
- CORREO Y CUENTA SON CAMPOS COMPLETAMENTE INDEPENDIENTES. NO tienen ninguna relación entre sí. Extrae cada uno SOLO de lo que el cliente escribió explícitamente en respuesta a la pregunta correspondiente:
  * Campo "correo": SOLO acepta direcciones con arroba (@). Si el cliente no escribió una dirección con @, deja este campo vacío.
  * Campo "cuenta": SOLO acepta el nombre explícito de la empresa o cliente afiliado. Si el cliente escribió el nombre de su empresa (ej: "INNOVIOCR", "Soporte CR", "Tech SA"), extráelo aquí. NUNCA lo dejes vacío solo porque se parece a algo.
  * Campo "nombre": SOLO acepta un nombre y apellido real de una persona (ej: "María Chaves", "Juan Ramírez"). Si contiene @, es un correo — no un nombre. RECHAZA (deja vacío) cualquier frase, oración, descripción de un problema, nombre de equipo/producto/marca, saludo, o mensaje que no sea claramente un nombre propio de persona (ej: "esta es la versión del switch", "necesito ayuda con mi cámara" NO son nombres — mantén "nombre" vacío y usa accion "PEDIR_NOMBRE" si el paso actual lo requiere).
  JAMÁS uses el contenido de un campo para inferir otro. Son independientes.
- PROHIBIDO ASUMIR EL TEMA: NUNCA inventes ni infieras el "tema". Si el cliente no eligió explícitamente uno de los 8 temas, deja "tema" en null y usa accion "PEDIR_TEMA". Jamás escribas frases como "su consulta sobre configuraciones" si el cliente no lo dijo.
- ORDEN OBLIGATORIO (PASO A PASO): Los datos iniciales deben pedirse UNO POR UNO.
  1. Si falta el nombre, la accion debe ser "PEDIR_NOMBRE".
  2. Si ya tienes el nombre pero el campo correo está VACÍO en base de datos (no se ha preguntado ni respondido aún), la accion DEBE ser "PEDIR_CORREO". El correo es OPCIONAL para el cliente: si responde que no lo tiene en cualquier forma, extrae "Sin correo" y en el siguiente mensaje avanza a cuenta. PERO DEBES PREGUNTARLO SIEMPRE — no lo omitas ni lo saltes aunque no sea obligatorio.
  3. Si ya tienes nombre Y el correo ya fue respondido (tiene valor real o "Sin correo" en base de datos), pero falta la cuenta, la accion debe ser "PEDIR_CUENTA".
  4. Si tienes nombre, correo respondido y cuenta, pero falta el tema, la accion debe ser "PEDIR_TEMA".
  5. REGLA PARA TODOS LOS TEMAS EXCEPTO "Otro":
     - Si tienes tema pero falta la marca, la accion debe ser "PEDIR_MARCA".
     - Si tienes tema y marca, pero falta el modelo, la accion debe ser "PEDIR_MODELO".
     - Cuando tengas marca y modelo, la accion DEBE SER "BUSCAR_INVENTARIO".
  6. Si el tema es "Otro", NO pidas marca ni modelo, la accion debe ser "PEDIR_DESCRIPCION".
  NUNCA pidas dos datos juntos. NO avances al siguiente paso si falta el anterior.
- VALIDACIÓN DE DATOS FALSOS: Debes verificar de forma intuitiva que los datos proporcionados sean reales y lógicos.
  - Nombres: ¡Si contiene arroba (@) ES UN CORREO, NO UN NOMBRE! Recházalo SOLO si: (a) contiene @, (b) son caracteres completamente aleatorios sin sentido (ej: "ryjuky", "asdf", "qwerty", "123"), o (c) son solo números. ACEPTA cualquier nombre real de persona EXIGIENDO nombre Y apellido (ej: "César Batista", "Ana González", "María Chaves"). Si el cliente solo dio el nombre sin apellido (ej: "César", "Juan"), NO lo aceptes: deja "nombre" vacío y usa accion "PEDIR_NOMBRE" pidiendo explícitamente nombre y apellido.
  - Correos: El correo es OPCIONAL. Si el cliente indica de cualquier forma que no tiene correo (NO escribió nada con @), extrae "Sin correo" y avanza al siguiente paso. Si el cliente escribió CUALQUIER cosa con @ (ej: "1@1.com", "a@a.com", "s@s.com", "wef@wrf.we", "prueba@prueba.com"), NO extraigas "Sin correo". Recházalo: ES OBLIGATORIO dejar el campo "correo" vacío ("") y la accion "PEDIR_CORREO". Si el texto contiene @, nunca es "Sin correo".
  - Cuentas: El campo "cuenta" es SOLO el nombre explícito de la empresa o cuenta afiliada. Si el cliente responde frases relativas como "a mi nombre", "yo mismo", "personal", "la mía", "no tengo", "ninguna" o "cliente final", extrae "Sin cuenta" SI indica explícitamente que no tiene. Si solo evade la pregunta, deja el campo vacío y usa accion "PEDIR_CUENTA".
  - Anti-salto estricto: Si el tema NO es "Otro" y aún falta la marca o el modelo, NUNCA uses accion "PEDIR_DESCRIPCION". La accion debe ser "PEDIR_MARCA", "PEDIR_MODELO" o "PEDIR_MARCA_Y_MODELO".

EJEMPLOS DE DECISIONES CORRECTAS:
- Cliente escribe "1@1.com" cuando se le pidió correo: correo="", accion="PEDIR_CORREO", respuesta_sugerida="El correo ingresado no tiene un formato válido. Por favor, escriba su correo electrónico real para poder contactarle."
- Cliente escribe "Nano station loco m5 airmax 13dbi" cuando se le pidió modelo: modelo="NanoStation loco M5 airmax 13dBi", accion="BUSCAR_INVENTARIO" (ya se tiene marca y modelo).
- Cliente elige tema "Configuraciones" pero aún no ha dado marca: tema="Configuraciones", marca="", accion="PEDIR_MARCA".
- Cliente escribe "no tengo correo" cuando se le pidió correo: correo="Sin correo", accion="PEDIR_CUENTA".
- Cliente escribe "INNOVIOCR" cuando se le pidió cuenta: cuenta="INNOVIOCR", accion="PEDIR_TEMA".
- Si el cliente envió un código como "DS-3E0505P-E-M", "NVR-108MH", "IPC-T221H" eso es un MODELO, no una marca.
- Si el cliente envió una sola palabra, nombre corto o abreviatura (ej: "Hikvision", "Dahua", "Epcom", "ZKTeco", "hik", "dha", "zkt", "epc"), ASUME OBLIGATORIAMENTE que es una MARCA y extráelo en el campo "marca". NO dejes la marca vacía si el usuario respondió con 3 o más letras.
- Si el cliente envió marca y modelo juntos, extrae ambos. Si el cliente solo dio el modelo, NO pidas la marca. Si ya tienes modelo, la acción debe avanzar a BUSCAR_INVENTARIO o PEDIR_DESCRIPCION, nunca regreses a PEDIR_MARCA.
- Si el tema es "Otro", NO pidas marca ni modelo, pide directamente la descripción del problema (accion: "PEDIR_DESCRIPCION").
- Si el cliente ya proporcionó datos (even if he said he doesn't have them), NUNCA los pidas de nuevo.
- Si el cliente pide hablar con una persona/agente/humano, marca accion como "ESCALAR_INMEDIATO".
- REGLA DE FRUSTRACIÓN: Si el cliente muestra enojo evidente, reclamo, insultos, o lleva varios mensajes sin avanzar y se nota molesto, marca accion como "ESCALAR_INMEDIATO". No insistas en pedir más datos.
- Si el cliente se despide (adiós, gracias, hasta luego), marca accion como "CERRAR".
- Interpreta errores ortográficos libremente. Ej: "reced" o "rese" = "Reset", "borrar" = "Desvinculación", "fimwar" = "Firmware", "marac" = "marca", etc. Usa el sentido común.

- No inventes datos. Si dudas, confírmalo con el cliente antes de darlo por válido.

Responde SOLO con JSON válido:
{
  "nombre": "nombre extraído o vacío",
  "correo": "correo extraído, 'Sin correo', o vacío",
  "cuenta": "cuenta/empresa extraída, 'Sin cuenta', o vacía",
  "tema": "uno de: Configuraciones|Reset|Desvinculación|Firmware|Software|Licencias|Otro|null",
  "marca": "marca detectada o inferida, o vacío",
  "modelo": "modelo detectado, o vacío",
  "tiene_imagen": true/false,
  "tiene_xml": true/false,
  "descripcion_problema": "si el cliente ya describió su problema, ponerlo aquí, sino vacío",
  "accion": "una de: PEDIR_NOMBRE|PEDIR_CORREO|PEDIR_CUENTA|PEDIR_TEMA|PEDIR_MARCA|PEDIR_MODELO|PEDIR_MARCA_Y_MODELO|BUSCAR_INVENTARIO|PEDIR_ETIQUETA|PEDIR_ETIQUETA_Y_XML|PEDIR_DESCRIPCION|ESCALAR|ESCALAR_INMEDIATO|CERRAR|VENTAS|",
  "razon": "explicación breve de por qué elegiste esa acción"
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
      }
    } catch (e: any) {
      console.error("[seka-whatsapp] Supervisor error:", e.message);
      if (supervisorRaw) {
          await db.from("sek_cases").update({ notasInternas: "JSON_PARSE_ERROR: " + e.message + " | RAW: " + supervisorRaw.substring(0, 500) }).eq("id", case_id);
      }
    }

    // ── Paso 3: Inicializar datos del cliente ──
    const currentCliente = (caso.cliente && typeof caso.cliente === "object") ? caso.cliente : {};
    const updatedCliente: Record<string, unknown> = { ...currentCliente };
    let clienteChanged = false;

    // ── Si el supervisor falló, aplicar FALLBACK DETERMINÍSTICO ──
    // En lugar de escalar, se extrae el dato que el bot acaba de pedir y se pone
    // accion="CONTINUAR" para delegar el ruteo a la heurística de flujo (más abajo),
    // que ya maneja correctamente nombre→correo→cuenta→tema→marca→modelo sin retroceder.
    if (!supervisorResult) {
      const cli = currentCliente as any;
      const lastBotLower = (lastIA?.content || "").toLowerCase();
      const userRespFallback = lastUserMsgContent.trim();

      let nombreFB = "", marcaFB = "", modeloFB = "";
      if (!cli.nombre && lastBotLower.includes("nombre completo") && isNombrePropioValido(userRespFallback)) {
        nombreFB = userRespFallback;
      }
      if (lastBotLower.includes("marca del equipo") && userRespFallback.length >= 2) {
        marcaFB = userRespFallback;
      }
      if (lastBotLower.includes("modelo del equipo") && userRespFallback.length >= 1) {
        modeloFB = userRespFallback;
        marcaFB = marcaFB || (cli.marca || "");
      }

      console.warn("[seka-whatsapp] Supervisor falló — fallback determinístico (CONTINUAR + heurística de flujo).");
      supervisorResult = {
        accion: "CONTINUAR",
        nombre: nombreFB,
        correo: "",
        cuenta: "",
        tema: null,
        marca: marcaFB,
        modelo: modeloFB,
      };
    }

    // ── Paso 3: Actualizar datos del cliente si el supervisor extrajo nuevos ──
    // (La inicialización de currentCliente, updatedCliente y clienteChanged se movió arriba del fallback)
    
    const isValidExtractedString = (val: any) => typeof val === "string" && val.trim() !== "" && val !== "vacío" && val !== "(vacío)" && val !== "null" && !val.startsWith("PEDIR_");
    const correoYaAtendido = (val: any) => {
      const v = String(val || "").trim().toLowerCase();
      return v !== "" && (v !== "(vacío)" && v !== "null");
    };

    // Extracción forzosa de correo mediante Regex para no depender 100% de la IA
    let regexEmail = "";
    const emailMatch = lastUserMsgContent.match(/[\w.-]+@[\w.-]+\.\w+/);
    if (emailMatch) {
      regexEmail = emailMatch[0];
    }

    if (isValidExtractedString(supervisorResult.nombre)) {
      const oldNombre = String((currentCliente as any).nombre || "").trim();
      if (!oldNombre || oldNombre === "." || /^[\d\+\-\s]+$/.test(oldNombre) || oldNombre === "(vacío)") {
        const nombreCandidato = supervisorResult.nombre.trim();
        const nombreValido = isNombrePropioValido(nombreCandidato);
        if (nombreValido) {
          updatedCliente.nombre = supervisorResult.nombre;
          clienteChanged = true;
        } else {
          console.log("[seka-whatsapp] Supervisor extrajo nombre inválido:", nombreCandidato, "→ se rechaza y se pide de nuevo.");
          supervisorResult.nombre = "";
          if (!["ESCALAR_INMEDIATO", "CERRAR", "VENTAS"].includes(supervisorResult.accion)) {
            supervisorResult.accion = "PEDIR_NOMBRE";
          }
        }
      }
    }
    
    // Guardar correo: acepta valor real (via LLM o regex) validado, y también "Sin correo" como marcador de campo atendido
    const llmCorreo = supervisorResult.correo || "";
    const esSinCorreo = llmCorreo.toLowerCase().includes("sin correo");
    const userPareceCorreo = /@/.test(lastUserMsgContent);
    console.log(`[seka-whatsapp] POST-CORREO: user=${JSON.stringify(lastUserMsgContent)}, llmCorreo=${JSON.stringify(llmCorreo)}, regexEmail=${JSON.stringify(regexEmail)}, esSinCorreo=${esSinCorreo}, userPareceCorreo=${userPareceCorreo}`);

    let finalCorreo = "";
    if (userPareceCorreo) {
      // El usuario escribió algo con @. El supervisor no decide aquí: usamos SOLO regex validado.
      // Si el LLM devolvió un correo válido, lo preferimos; si no, usamos el regex; si nada es válido, rechazamos.
      const correoPreferido = (llmCorreo && esCorreoValido(llmCorreo)) ? llmCorreo : (regexEmail && esCorreoValido(regexEmail) ? regexEmail : "");
      if (correoPreferido) {
        finalCorreo = correoPreferido;
      } else {
        // El usuario escribió @ pero no hay correo válido → forzar re-pregunta de correo
        if (!["ESCALAR_INMEDIATO", "CERRAR", "VENTAS"].includes(supervisorResult.accion)) {
          console.log("[seka-whatsapp] Correo con @ inválido rechazado:", llmCorreo || regexEmail, "→ se pide de nuevo.");
          supervisorResult.correo = "";
          supervisorResult.accion = "PEDIR_CORREO";
        }
      }
    } else if (esSinCorreo) {
      // El usuario NO escribió @ y el supervisor dice que no tiene correo
      finalCorreo = "Sin correo";
    } else if (llmCorreo && isValidExtractedString(llmCorreo) && esCorreoValido(llmCorreo)) {
      finalCorreo = llmCorreo;
    } else if (regexEmail && esCorreoValido(regexEmail)) {
      finalCorreo = regexEmail;
    }
    console.log(`[seka-whatsapp] POST-CORREO: finalCorreo=${JSON.stringify(finalCorreo)}, accion=${supervisorResult.accion}`);

    if (finalCorreo && finalCorreo !== "Sin correo") {
      const oldCorreo = String((currentCliente as any).correo || "").trim();
      if (!oldCorreo || oldCorreo === "(vacío)") {
        updatedCliente.correo = finalCorreo;
        clienteChanged = true;
      }
    } else if (finalCorreo === "Sin correo") {
      const oldCorreo = String((currentCliente as any).correo || "").trim();
      if (!oldCorreo || oldCorreo === "(vacío)") {
        updatedCliente.correo = "Sin correo";
        clienteChanged = true;
      }
    }

    if (isValidExtractedString(supervisorResult.cuenta)) {
      const oldCuenta = String((currentCliente as any).cuenta || "").trim();
      const oldCuentaLower = oldCuenta.toLowerCase();
      const isBadOldCuenta = oldCuentaLower === "a mi nombre" || oldCuentaLower === "mi nombre" || oldCuentaLower === "yo mismo" || oldCuentaLower === "personal";
      if (!oldCuenta || oldCuenta === "(vacío)" || isBadOldCuenta) {
        const cuentaCandidata = supervisorResult.cuenta.trim();
        const esSinCuenta = cuentaCandidata.toLowerCase().includes("sin cuenta");
        if (esSinCuenta) {
          updatedCliente.cuenta = "Sin cuenta";
          clienteChanged = true;
        } else if (esCuentaValida(cuentaCandidata)) {
          let cuentaFinal = cuentaCandidata;
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
            const { data: recentCases } = await db.from("sek_cases").select("cliente").order("created_at", { ascending: false }).limit(100);
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
        } else {
          console.log("[seka-whatsapp] Cuenta inválida rechazada:", cuentaCandidata, "→ se pide de nuevo.");
          supervisorResult.cuenta = "";
          if (!["ESCALAR_INMEDIATO", "CERRAR", "VENTAS"].includes(supervisorResult.accion)) {
            supervisorResult.accion = "PEDIR_CUENTA";
          }
        }
      } // Closes if (!oldCuenta || ...)
    } // Closes if (isValidExtractedString...)

    // FALLBACK DETERMINÍSTICO PARA CUENTA: si el supervisor no extrajo cuenta,
    // pero el bot pedía cuenta y el cliente respondió algo válido, aceptarlo.
    if (!isValidExtractedString(supervisorResult.cuenta)) {
      const oldCuentaFB = String((currentCliente as any).cuenta || "").trim();
      const botPidioCuenta = (lastIA?.content || "").includes("empresa o cuenta afiliada") || (lastIA?.content || "").includes("cuenta o empresa");
      const needsCuenta = !oldCuentaFB || oldCuentaFB === "(vacío)";
      if (botPidioCuenta && needsCuenta) {
        const cuentaFallback = lastUserMsgContent.trim();
        if (esCuentaValida(cuentaFallback)) {
          console.log(`[seka-whatsapp] FALLBACK cuenta: supervisor no extrajo, aceptando del mensaje del cliente: "${cuentaFallback}"`);
          updatedCliente.cuenta = cuentaFallback;
          clienteChanged = true;
          supervisorResult.cuenta = cuentaFallback;
          if (!["ESCALAR_INMEDIATO", "CERRAR", "VENTAS"].includes(supervisorResult.accion)) {
            supervisorResult.accion = "CONTINUAR";
          }
        }
      }
    }

    // Persistir marca y modelo extraídos por el Supervisor para no perderlos entre turnos
    if (isValidExtractedString(supervisorResult.marca)) {
      const oldMarca = String((currentCliente as any).marca || "").trim();
      if (!oldMarca || oldMarca === "(vacío)") {
        updatedCliente.marca = supervisorResult.marca;
        clienteChanged = true;
      }
    }
    if (isValidExtractedString(supervisorResult.modelo)) {
      const oldModelo = String((currentCliente as any).modelo || "").trim();
      if (!oldModelo || oldModelo === "(vacío)") {
        updatedCliente.modelo = supervisorResult.modelo;
        clienteChanged = true;
      }
    }

    // Actualizar título si tenemos nombre
    const nuevoTitle = (updatedCliente.nombre)
      ? `WhatsApp — ${updatedCliente.nombre}`
      : undefined;

    const temaToTag = (tema: string): string | null => {
      if (!tema) return null;
      const key = tema.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "");
      const map: Record<string, string> = {
        configuraciones: "configuraciones", reset: "reset", desvinculacion: "desvinculacion",
        firmware: "firmware", software: "software", licencias: "licencias", otro: "otro",
      };
      return map[key] || null;
    };

    // ── Paso 4: Ejecutar la ACCIÓN que decidió el Supervisor ──
    let accion = (supervisorResult.accion || "CONTINUAR").toUpperCase();
    // Rescatar marca/modelo de BD si el LLM no los extrajo (evita loop cuando cliente solo envía modelo)
    let marcaSupervisor = supervisorResult.marca || String(updatedCliente.marca || "").trim();
    let modeloSupervisor = supervisorResult.modelo || String(updatedCliente.modelo || "").trim();
    // El tema seleccionado del menú (número/nombre) o el ya confirmado en BD es la fuente de
    // verdad, y tiene prioridad sobre la reclasificación del LLM (que puede perder el contexto
    // a mitad del flujo). Se persiste para no depender del historial en turnos posteriores.
    const temaPersistido = String((currentCliente as any).tema || "").trim();
    // Detección robusta: tomar la respuesta del cliente AL MENÚ de temas específicamente,
    // en vez de cualquier mensaje (evita falsos positivos de coincidencia parcial con
    // nombre/correo/cuenta, p. ej. una cuenta corta que "coincide" con Software/Licencias).
    let temaMenu = "";
    const menuIdx = allMsgs.map((m, i) => ({ m, i }))
      .filter(({ m }) => (m.role === "ia" || m.role === "assistant") && (m.content || "").includes("número o el nombre del tema"))
      .map(({ i }) => i)
      .pop() ?? -1;
    if (menuIdx >= 0) {
      for (let i = menuIdx + 1; i < allMsgs.length; i++) {
        if (allMsgs[i].role === "user") {
          const t = resolveTopicStrict(allMsgs[i].content?.trim() ?? "");
          if (t) { temaMenu = t; break; }
        }
      }
    }
    // temaSupervisor SOLO usa temaPersistido (BD) o temaMenu (selección explícita post-menú).
    // NUNCA usa temaInferido ni supervisorResult.tema para evitar saltarse el menú.
    let temaSupervisor = temaPersistido || temaMenu || "";
    // El supervisor puede inferir un tema, pero lo ignoramos hasta que el usuario lo elija del menú.
    if (supervisorResult.tema && supervisorResult.tema !== "Consulta" && !temaPersistido && !temaMenu) {
      console.log(`[seka-whatsapp] Tema inferido por supervisor (${supervisorResult.tema}) ignorado — esperando selección explícita del menú.`);
    }
    // Si el supervisor devuelve un tema y ya hay temaMenu o temaPersistido, usar ese.
    if (!temaSupervisor && supervisorResult.tema && supervisorResult.tema !== "Consulta") {
      // Solo usar tema del supervisor si ya pasamos el menú (temaPersistido o temaMenu ya verificados arriba)
      // No hacer nada — temaSupervisor queda vacío para forzar PEDIR_TEMA
    }

    // ── GESTIÓN DE NUEVA CONSULTA (Si el bot rechazó equipo y el usuario dice Sí) ──
    const lastIAContentTop = iaRealMsgs[iaRealMsgs.length - 1]?.content || "";
    const botPreguntoNuevaConsulta = lastIAContentTop.includes("¿Tiene alguna otra consulta");
    if (botPreguntoNuevaConsulta) {
      const userConfirmoNueva = /^(s[ií]|si|yes|claro|por supuesto|dale|de una|ok)[.!?]*$/i.test(lastUserMsgContent.trim());
      if (userConfirmoNueva) {
        console.log("[seka-whatsapp] Usuario confirmó nueva consulta. Limpiando marca/modelo y forzando PEDIR_DESCRIPCION.");
        accion = "PEDIR_DESCRIPCION";
        marcaSupervisor = "";
        modeloSupervisor = "";
        temaSupervisor = "Otro";
        updatedCliente.marca = "";
        updatedCliente.modelo = "";
        updatedCliente.tema = "Otro";
        clienteChanged = true;
      }
    }

    // withAcuse eliminado — el bot usa solo textos fijos
    const withAcuse = (text: string): string => text;

    // Construye el motivo de escalado — definida a nivel de módulo (ver arriba).
    const urgencyTags: string[] = [];
    const sentimiento = "neutral";

    // (Frustración: el LLM marca directamente ESCALAR_INMEDIATO)

    // ── FORZAR REGLAS CRÍTICAS (evitar alucinaciones del LLM) ──
    const lastIAContent = iaRealMsgs[iaRealMsgs.length - 1]?.content || "";

    const botYaPidioMarca = lastIAContent.includes("indíquenos la marca") || lastIAContent.includes("marca del equipo") || lastIAContent.includes("verifique el dato");
    
    // Si pedimos marca y el usuario responde sin números ni guiones, es solo la marca.
    if (botYaPidioMarca && !/[0-9\-]/.test(lastUserMsgContent)) {
      marcaSupervisor = lastUserMsgContent.trim();
      modeloSupervisor = ""; // Evitar que el LLM lo ponga como modelo
      console.log(`[seka-whatsapp] Heurística fuerte: Asumiendo '${marcaSupervisor}' solo como MARCA.`);
    }

    // Temas que requieren etiqueta (Reset/Desvinculación/Firmware)
    const temasConEtiqueta = ["Reset", "Desvinculación", "Firmware"];

    // Heurística fuerte: si el bot acaba de pedir el modelo y el tema requiere etiqueta,
    // asumir la respuesta del usuario como modelo y avanzar directamente a pedir etiqueta/XML.
    const botYaPidioModelo = lastIAContent.includes("modelo del equipo") || lastIAContent.includes("modelo específico") || lastIAContent.includes("verifique el dato");
    const userResponseModelo = lastUserMsgContent.trim();
    if (botYaPidioModelo && userResponseModelo.length >= 2 && temasConEtiqueta.includes(temaSupervisor) &&
        !/^(s[ií]|si|yes|no|nel|nop|no\s*s[eé]|no\s*se|no\s*lo\s*tengo|no\s*tengo|as[ií]\s*es|correcto)$/i.test(userResponseModelo)) {
      if (!modeloSupervisor) {
        modeloSupervisor = userResponseModelo;
        updatedCliente.modelo = userResponseModelo;
        clienteChanged = true;
        console.log(`[seka-whatsapp] Heurística fuerte: asumiendo '${modeloSupervisor}' como MODELO.`);
      }
      // Enviar a validar el modelo en inventario/fuentes externas antes de pedir etiqueta.
      if (marcaSupervisor && !["CERRAR", "VENTAS", "ESCALAR_INMEDIATO", "BUSCAR_INVENTARIO", "PEDIR_ETIQUETA", "PEDIR_ETIQUETA_Y_XML"].includes(accion)) {
        accion = "BUSCAR_INVENTARIO";
        console.log(`[seka-whatsapp] Heurística fuerte: tema ${temaSupervisor} con marca+modelo → forzando BUSCAR_INVENTARIO para validar modelo.`);
      }
    }

    // Prevenir que el LLM se salte el modelo
    if (accion === "BUSCAR_INVENTARIO" && !modeloSupervisor && temaSupervisor !== "Otro") {
      console.log("[seka-whatsapp] LLM intentó BUSCAR_INVENTARIO sin modelo. Forzando PEDIR_MODELO.");
      accion = "PEDIR_MODELO";
    }


    // Si el bot ya pidió descripción del problema y el usuario respondió → escalar siempre
    // EXCEPCIÓN: temas que requieren etiqueta (Reset/Desvinculación/Firmware) no usan descripción como último paso
    // IMPORTANTE: este bloque va ANTES del forzado de tema Otro para que el escalado tenga prioridad
    const botYaPidioDescripcion = lastIAContent.includes("describa brevemente") || lastIAContent.includes("describa el inconveniente") || lastIAContent.includes("describa brevemente el inconveniente");
    if (botYaPidioDescripcion && !temasConEtiqueta.includes(temaSupervisor)) {
      const desc = lastUserMsgContent.trim();
      if (esDescripcionValida(desc)) {
        console.log("[seka-whatsapp] Usuario ya describió el problema. Escalando directamente.");
        updatedCliente.descripcion = desc;
        clienteChanged = true;
        accion = "ESCALAR";
      } else {
        console.log("[seka-whatsapp] Descripción inválida. Forzando PEDIR_DESCRIPCION.");
        accion = "PEDIR_DESCRIPCION";
        supervisorResult.respuesta_sugerida = "";
      }
    }


    if ((tema === "Otro" || temaSupervisor === "Otro") && accion !== "PEDIR_DESCRIPCION" && accion !== "ESCALAR" && accion !== "ESCALAR_INMEDIATO" && accion !== "CERRAR" && accion !== "VENTAS") {
      console.log("[seka-whatsapp] Forzando PEDIR_DESCRIPCION para tema Otro");
      accion = "PEDIR_DESCRIPCION";
      supervisorResult.respuesta_sugerida = "";
    }

    // ── VERIFICACION ELIMINADA ──
    // Se eliminó la verificación de inventario forzada aquí porque causaba rechazos prematuros si el LLM extraía mal el modelo.

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

    // Calcular correoRespondido una sola vez, antes de toda la lógica de GATEs y heurísticas
    const correoEnBD = String((updatedCliente.correo || (currentCliente as any)?.correo) ?? "").trim();
    let correoRespondido = correoEnBD !== "" && correoEnBD !== "(vacío)" && correoEnBD !== "null";

    // DEFENSA ANTI-RETROCESO: el correo es OPCIONAL. Si el bot ya preguntó correo en el
    // historial y el usuario ya respondió (estamos procesando un mensaje suyo), NUNCA se debe
    // volver a pedir. Si no hay correo válido guardado, marcar como 'Sin correo' para avanzar.
    if (!correoRespondido) {
      const botYaPreguntoCorreo = iaRealMsgs.some(m => (m.content || "").toLowerCase().includes("correo electrónico"));
      if (botYaPreguntoCorreo) {
        updatedCliente.correo = "Sin correo";
        clienteChanged = true;
        correoRespondido = true;
        console.log("[seka-whatsapp] ANTI-RETROCESO: bot ya preguntó correo y no hay correo válido → se marca 'Sin correo' para no retroceder.");
      }
    }

    // DEFENSA ANTI-RETROCESO CUENTA: si el bot ya pidió cuenta y el cliente ya avanzó a elegir
    // tema (o más allá), no volver a pedirla. Si no quedó guardada, usar el nombre del cliente
    // (cuenta a título personal) o "Sin cuenta" como último recurso.
    const cuentaEnBD = String((updatedCliente.cuenta || (currentCliente as any)?.cuenta) ?? "").trim();
    let cuentaRespondida = cuentaEnBD !== "" && cuentaEnBD !== "(vacío)" && cuentaEnBD !== "null";
    if (!cuentaRespondida && temaSupervisor) {
      const botYaPreguntoCuenta = iaRealMsgs.some(m => (m.content || "").toLowerCase().includes("empresa o cuenta afiliada"));
      if (botYaPreguntoCuenta) {
        if (updatedCliente.nombre) {
          updatedCliente.cuenta = String(updatedCliente.nombre);
        } else {
          updatedCliente.cuenta = "Sin cuenta";
        }
        clienteChanged = true;
        cuentaRespondida = true;
        console.log("[seka-whatsapp] Cuenta ya fue preguntada antes y tema elegido; se evita retroceder a PEDIR_CUENTA.");
      }
    }

    const validActions = ["CERRAR", "ESCALAR", "ESCALAR_INMEDIATO", "PEDIR_DATOS", "PEDIR_NOMBRE", "PEDIR_CORREO", "PEDIR_CUENTA", "PEDIR_TEMA", "PEDIR_MARCA", "PEDIR_MODELO", "PEDIR_MARCA_Y_MODELO", "BUSCAR_INVENTARIO", "PEDIR_ETIQUETA", "PEDIR_ETIQUETA_Y_XML", "PEDIR_DESCRIPCION", "VENTAS"];
    if (!validActions.includes(accion) || (accion === "CONTINUAR" && (!updatedCliente.nombre || !updatedCliente.cuenta || !temaSupervisor || (temaSupervisor !== "Otro" && (!marcaSupervisor || !modeloSupervisor))))) {
      console.warn(`[seka-whatsapp] Accion ${accion} requiere heuristica de flujo.`);
      const correoOkHeur = correoRespondido || (String(updatedCliente.correo || "").trim() !== "");
      if (!updatedCliente.nombre) {
        accion = "PEDIR_NOMBRE";
      } else if (!correoOkHeur) {
        accion = "PEDIR_CORREO";
      } else if (!updatedCliente.cuenta && !temaSupervisor) {
        // Solo pedir cuenta si aún no se ha elegido tema; una vez elegido el tema, seguir el flujo de marca/modelo
        accion = "PEDIR_CUENTA";
      } else if (!temaSupervisor) {
        accion = "PEDIR_TEMA";
      } else if (temaSupervisor !== "Otro") {
        if (!marcaSupervisor) {
          accion = "PEDIR_MARCA";
        } else if (!modeloSupervisor) {
          accion = "PEDIR_MODELO";
        } else {
          accion = "BUSCAR_INVENTARIO";
        }
      } else {
        accion = "PEDIR_DESCRIPCION";
      }
      supervisorResult.respuesta_sugerida = "";
    }

    console.log(`[seka-whatsapp] Supervisor acción: ${accion}, marca: ${marcaSupervisor}, modelo: ${modeloSupervisor}, tema: ${temaSupervisor}, cuenta: ${updatedCliente.cuenta}, correo: ${updatedCliente.correo}, clienteChanged: ${clienteChanged}`);

    // ── REGLA DE NEGOCIO ESTRICTA: CORREO Y CUENTA COMPLETAMENTE SEPARADOS ──
    const cuentaCheck = String(updatedCliente.cuenta || "").toLowerCase().trim();
    const lastBotMsg = iaRealMsgs[iaRealMsgs.length - 1]?.content || "";
    const lastUserLower = lastUserMsgContent.toLowerCase();

    // CORREO: marcar como "Sin correo" SOLO si el bot estaba preguntando el correo
    const botPreguntabaCorreo = lastBotMsg.toLowerCase().includes("correo electrónico");
    const usuarioDiceNoTieneCorreo = botPreguntabaCorreo && (
      lastUserLower.includes("no lo tengo") ||
      lastUserLower.includes("no tengo") ||
      lastUserLower.includes("no recuerdo") ||
      lastUserLower.includes("sin correo") ||
      lastUserLower.includes("no cuento") ||
      lastUserLower.includes("no tengo correo")
    );
    if (!updatedCliente.correo && usuarioDiceNoTieneCorreo) {
      updatedCliente.correo = "Sin correo";
      clienteChanged = true;
      console.log("[seka-whatsapp] Correo marcado como \"Sin correo\" por respuesta negativa del cliente.");
    }

    // CUENTA: detectar "sin cuenta" SOLO si el bot estaba preguntando la cuenta
    const botPreguntabaCuenta = lastBotMsg.toLowerCase().includes("afiliada a sekunet") && !lastBotMsg.toLowerCase().includes("correo electrónico");
    const usuarioDiceNoTieneCuenta = botPreguntabaCuenta && (
      lastUserLower.includes("no tengo") ||
      lastUserLower.includes("no lo tengo") ||
      lastUserLower.includes("no tengo cuenta") ||
      lastUserLower.includes("no tengo empresa") ||
      lastUserLower.includes("cliente final") ||
      lastUserLower.includes("ninguna")
    );
    const isSinCuenta = cuentaCheck === "sin cuenta" || cuentaCheck === "no tengo" || cuentaCheck === "cliente final" || usuarioDiceNoTieneCuenta;

    if (isSinCuenta) {
      updatedCliente.cuenta = "sin cuenta";
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

    // FALLBACK DE NOMBRE: si el Supervisor no extrajo nombre pero el bot pedía nombre
    // y el mensaje del cliente pasa el filtro regex, aceptarlo. Evita que el LLM
    // rechace nombres validos por apellidos extranjeros o poco comunes.
    if (!updatedCliente.nombre && accion !== "CERRAR" && accion !== "VENTAS" && accion !== "ESCALAR_INMEDIATO") {
      const botPidioNombre = (lastIA?.content || "").includes("nombre completo");
      const nombreCandidatoFB = lastUserMsgContent.trim();
      if (botPidioNombre && isNombrePropioValido(nombreCandidatoFB)) {
        console.log(`[seka-whatsapp] FALLBACK nombre: Supervisor no extrajo, aceptando del mensaje: "${nombreCandidatoFB}"`);
        updatedCliente.nombre = nombreCandidatoFB;
        clienteChanged = true;
        supervisorResult.nombre = nombreCandidatoFB;
        if (supervisorResult.accion === "PEDIR_NOMBRE" || accion === "PEDIR_NOMBRE" || accion === "CONTINUAR") {
          accion = "PEDIR_CORREO";
        }
      }
    }

    // GATE 0 — FORZAR RECOPILACIÓN DE DATOS (Red de Seguridad contra Alucinaciones)
    if (accion !== "CERRAR" && accion !== "VENTAS" && accion !== "ESCALAR_INMEDIATO") {
      if (!updatedCliente.nombre) {
        console.log("[seka-whatsapp] Forzando PEDIR_NOMBRE por datos incompletos.");
        accion = "PEDIR_NOMBRE";
        supervisorResult.respuesta_sugerida = "";
      } else if (!correoRespondido) {
        console.log("[seka-whatsapp] Forzando PEDIR_CORREO — correo vacío en BD.");
        accion = "PEDIR_CORREO";
        supervisorResult.respuesta_sugerida = "";
      } else if (!cuentaRespondida) {
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

    // GATE 2 — Con datos completos, mostrar la lista de temas SIEMPRE, excepto que el usuario
    // ya haya elegido un tema del menú en esta conversación.
    const temaElegidoPorCliente = topiIdx >= 0;
    if (accion !== "CERRAR" && accion !== "VENTAS" && accion !== "ESCALAR_INMEDIATO" && accion !== "PEDIR_DATOS" && accion !== "PEDIR_NOMBRE" && accion !== "PEDIR_CORREO" && accion !== "PEDIR_CUENTA") {
      const correoOkGate2 = correoRespondido || (String(updatedCliente.correo || "").trim() !== "");
      if (updatedCliente.nombre && correoOkGate2 && updatedCliente.cuenta && !temaElegidoPorCliente) {
        console.log("[seka-whatsapp] Datos completos → mostrando lista de temas (tema persistido o inferido ignorado).");
        accion = "PEDIR_TEMA";
      }
    }

    // ── PASO RESET-4: verificar archivos según marca (se mantiene la lógica de seguridad) ──
    const MSG_RESET_PIDE_ARCHIVOS = "imagen clara y legible de la etiqueta";
    const MSG_RESET_PIDE_IMAGEN = "adjunte nuevamente una imagen clara";
    const MSG_RESET_PIDE_XML = "adjunte nuevamente el archivo XML";
    const MSG_RESET_PIDE_XML_SAPD = "adjunte el archivo XML";
    if ((lastIA?.content?.includes(MSG_RESET_PIDE_ARCHIVOS) || lastIA?.content?.includes(MSG_RESET_PIDE_IMAGEN) || lastIA?.content?.includes(MSG_RESET_PIDE_XML) || lastIA?.content?.includes(MSG_RESET_PIDE_XML_SAPD)) && lastUserTime > lastIATime) {
      // Buscar archivos desde el PRIMER pedido de archivos del bot (no solo del último).
      // Así si el cliente envía imagen y XML en mensajes separados, ambos se capturan.
      const firstFilePedido = iaRealMsgs.find(m =>
        m.content?.includes(MSG_RESET_PIDE_ARCHIVOS) || m.content?.includes(MSG_RESET_PIDE_IMAGEN) || m.content?.includes(MSG_RESET_PIDE_XML) || m.content?.includes(MSG_RESET_PIDE_XML_SAPD)
      );
      const firstFilePedidoTime = firstFilePedido?.time ? new Date(firstFilePedido.time).getTime() : lastIATime;
      const recentUserMsgs = userRealMsgs.filter(m => {
        const mTime = new Date(m.time ?? 0).getTime();
        return mTime > firstFilePedidoTime - 5000; // Mensajes desde el primer pedido de archivos
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

        return await postTecnico(aiReply);
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
          return await postTecnico(retry);
        }
        if (!imagenUrl) {
          const retry = "Por favor, adjunte una imagen clara y legible de la etiqueta del equipo.";
          return await postTecnico(retry);
        }
        if (!xmlUrl) {
          const retry = "Por favor, adjunte el archivo XML obtenido con SAPD Tools.";
          return await postTecnico(retry);
        }
      } else {
        if (!imagenUrl) {
          const retry = "Por favor, adjunte una imagen clara y legible de la etiqueta del equipo.";
          return await postTecnico(retry);
        }
      }

      // Ambos archivos presentes → verificar cada uno
      let imagenOk = false;
      let xmlOk = false;
      let motivoImagen = "";
      let motivoXml = "";

      if (esHikvision && temaSupervisor === "Reset") {
        // Verificación simplificada: solo comprobar que la imagen sea una etiqueta y el archivo sea XML válido.
        let imagenEsEtiqueta = false;
        try {
          const visionMessages: NimMessage[] = [
            {
              role: "system",
              content: `Eres un verificador de imágenes. Responde SOLO con una línea JSON: {"es_etiqueta": true/false, "razon": "motivo breve"}.
- es_etiqueta: true si la imagen muestra una etiqueta de un equipo/dispositivo electrónico (puede ser una etiqueta con código de barras, número de serie, modelo, etc.). false si es otra cosa (selfie, paisaje, documento, etc.).
No agregues nada más.`,
            },
            {
              role: "user",
              content: [
                { type: "text", text: "¿Esta imagen muestra la etiqueta de un equipo electrónico?" },
                { type: "image_url", image_url: { url: imagenUrl } },
              ],
            },
          ];
          const visionRaw = await callAIWithFallbacks(visionMessages);
          const jsonMatch = visionRaw.match(/\{[\s\S]*\}/);
          if (jsonMatch) {
            const result = JSON.parse(jsonMatch[0]);
            imagenEsEtiqueta = result.es_etiqueta || false;
            console.log("[seka-whatsapp] Vision etiqueta resultado:", JSON.stringify(result));
            if (!imagenEsEtiqueta) motivoImagen = result.razon || "la imagen no parece ser una etiqueta de equipo";
          }
        } catch (e: any) {
          console.error("[seka-whatsapp] Vision error:", e.message);
          motivoImagen = "no fue posible analizar la imagen";
        }

        let xmlValido = false;
        try {
          const xmlResponse = await fetch(xmlUrl!);
          const xmlText = await xmlResponse.text();
          console.log("[seka-whatsapp] XML content (first 300):", xmlText.substring(0, 300));
          // Verificar que el contenido sea XML: debe tener etiquetas XML o declaración <?xml
          xmlValido = /^\s*<(\?xml|[a-zA-Z])/.test(xmlText.trim());
          if (!xmlValido) motivoXml = "el archivo no parece ser un XML válido";
        } catch (e: any) {
          console.error("[seka-whatsapp] XML error:", e.message);
          motivoXml = "no fue posible leer el archivo XML";
        }

        imagenOk = imagenEsEtiqueta;
        xmlOk = xmlValido;

        console.log("[seka-whatsapp] Verificación - imagenEsEtiqueta:", imagenEsEtiqueta, "xmlValido:", xmlValido);

        if (imagenOk && xmlOk) {
          const M02_TEXT = "Agradecemos su preferencia. En un momento será atendido por uno de nuestros agentes.";
          return await postTecnico(M02_TEXT, {
            estado: "escalado",
            escalado_at: new Date().toISOString(),
            title: `${temaSupervisor} — ${marca} ${modelo}`.substring(0, 120),
            tags: [temaSupervisor === "Desvinculación" ? "desvinculacion" : "reset"],
          });
        }
      } else {
        // Verificación simplificada para todas las marcas: solo comprobar que la imagen sea una etiqueta de equipo.
        try {
          const visionMessages: NimMessage[] = [
            {
              role: "system",
              content: `Eres un verificador de imágenes. Responde SOLO con una línea JSON: {"es_etiqueta": true/false, "razon": "motivo breve"}.
- es_etiqueta: true si la imagen muestra una etiqueta de un equipo/dispositivo electrónico (puede ser una etiqueta con código de barras, número de serie, modelo, etc.). false si es otra cosa (selfie, paisaje, documento, etc.).
No agregues nada más.`,
            },
            {
              role: "user",
              content: [
                { type: "text", text: "¿Esta imagen muestra la etiqueta de un equipo electrónico?" },
                { type: "image_url", image_url: { url: imagenUrl } },
              ],
            },
          ];
          const visionRaw = await callAIWithFallbacks(visionMessages);
          const jsonMatch = visionRaw.match(/\{[\s\S]*\}/);
          if (jsonMatch) {
            const result = JSON.parse(jsonMatch[0]);
            imagenOk = result.es_etiqueta || false;
            if (!imagenOk) motivoImagen = result.razon || "la imagen no parece ser una etiqueta de equipo";
          }
        } catch (e: any) {
          console.error("[seka-whatsapp] Vision error:", e.message);
          motivoImagen = "no fue posible analizar la imagen";
        }

        console.log("[seka-whatsapp] Verificación imagen (no Hikvision):", imagenOk);

        if (imagenOk) {
          const M02_TEXT = "Agradecemos su preferencia. En un momento será atendido por uno de nuestros agentes.";
          return await postTecnico(M02_TEXT, {
            estado: "escalado",
            escalado_at: new Date().toISOString(),
            title: `${temaSupervisor} — ${marca} ${modelo}`.substring(0, 120),
            tags: [temaSupervisor === "Desvinculación" ? "desvinculacion" : "reset"],
          });
        }
      }

      // Si alguno falló → manejar reintentos
      const yaReintentoImagen = iaRealMsgs.some(m => m.content?.includes(MSG_RESET_PIDE_IMAGEN));
      const yaReintentoXML = iaRealMsgs.some(m => m.content?.includes(MSG_RESET_PIDE_XML));

      if (esHikvision && temaSupervisor === "Reset") {
        if (!imagenOk && !xmlOk) {
          if (yaReintentoImagen && yaReintentoXML) {
            const M02_TEXT = "Agradecemos su preferencia. En un momento será atendido por uno de nuestros agentes.";
            return await postTecnico(M02_TEXT, {
              estado: "escalado", escalado_at: new Date().toISOString(),
              title: `${temaSupervisor} — ${marca} ${modelo} — verificación pendiente`.substring(0, 120),
              tags: ["reset", "verificacion_pendiente"],
            });
          }
          const retry = `Le informamos que ${motivoImagen} y ${motivoXml}. Por favor, adjunte nuevamente ambos archivos.`;
          return await postTecnico(retry);
        }
        if (!imagenOk) {
          if (yaReintentoImagen) {
            const M02_TEXT = "Agradecemos su preferencia. En un momento será atendido por uno de nuestros agentes.";
            return await postTecnico(M02_TEXT, {
              estado: "escalado", escalado_at: new Date().toISOString(),
              title: `${temaSupervisor} — ${marca} ${modelo} — imagen pendiente`.substring(0, 120),
              tags: ["reset", "imagen_pendiente"],
            });
          }
          const retry = `Le informamos que ${motivoImagen}. Por favor, adjunte nuevamente una imagen clara de la etiqueta del equipo.`;
          return await postTecnico(retry);
        }
        if (!xmlOk) {
          if (yaReintentoXML) {
            const M02_TEXT = "Agradecemos su preferencia. En un momento será atendido por uno de nuestros agentes.";
            return await postTecnico(M02_TEXT, {
              estado: "escalado", escalado_at: new Date().toISOString(),
              title: `${temaSupervisor} — ${marca} ${modelo} — XML pendiente`.substring(0, 120),
              tags: ["reset", "xml_pendiente"],
            });
          }
          const retry = `Le informamos que ${motivoXml}. Por favor, adjunte nuevamente el archivo XML.`;
          return await postTecnico(retry);
        }
      } else {
        if (!imagenOk) {
          if (yaReintentoImagen) {
            const M02_TEXT = "Agradecemos su preferencia. En un momento será atendido por uno de nuestros agentes.";
            return await postTecnico(M02_TEXT, {
              estado: "escalado", escalado_at: new Date().toISOString(),
              title: `${temaSupervisor} — ${marca} ${modelo} — imagen pendiente`.substring(0, 120),
              tags: [temaSupervisor === "Desvinculación" ? "desvinculacion" : "reset", "imagen_pendiente"],
            });
          }
          const retry = `Le informamos que ${motivoImagen}. Por favor, adjunte nuevamente una imagen clara de la etiqueta del equipo.`;
          return await postTecnico(retry);
        }
      }
    }

    // ── INTERCEPTAR CONFIRMACIÓN DE MARCA ANTES DE GATE 3 ──
    const botPreguntóConfirmación = lastIAContent.includes("¿Se refiere a") && lastIAContent.includes("Responda Sí o No");
    if (botPreguntóConfirmación) {
      const userConfirmó = /^(s[ií]|si|yes|correcto|exacto|esa|eso|afirmativo|as[ií] es|aja|aj[áa]|dale|de una)[.!?]*$/i.test(lastUserMsgContent.trim());
      const userNegó = /^(no|nel|nop|negativo|otra|diferente|distint)/i.test(lastUserMsgContent.trim());

      if (userConfirmó) {
        const matchConfMarca = lastIAContent.match(/¿se refiere a "([^"]+)"/i);
        if (matchConfMarca) {
          marcaSupervisor = matchConfMarca[1];
          updatedCliente.marca = marcaSupervisor;
          clienteChanged = true;
          console.log(`[seka-whatsapp] Usuario confirmó marca: ${marcaSupervisor}`);
        }
      } else if (userNegó) {
        const directReply = "Comprendo. Le informamos que el dispositivo indicado no parece corresponder a un equipo distribuido por Sekunet, por lo que no podemos brindarle soporte técnico sobre este producto.\n\n¿Tiene alguna otra consulta relacionada con nuestras marcas o servicios? Con gusto le ayudaremos.";
        const newMsg: HistMsg = { role: "ia", author: "Asistente Sekunet", time: new Date().toISOString(), content: directReply };
        const upd: Record<string, unknown> = { histtecnico: [...histtecnico, newMsg] };
        if (clienteChanged) upd.cliente = updatedCliente;
        upd.title = `${temaSupervisor || 'Soporte'} — Marca Rechazada`;
        await db.from("sek_cases").update(upd).eq("id", case_id);
        return new Response(JSON.stringify({ ok: true, reply: directReply }), { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      } else {
        const matchConfMarca2 = lastIAContent.match(/¿se refiere a "([^"]+)"/i);
        const marcaPreguntada = matchConfMarca2 ? matchConfMarca2[1] : "esa marca";
        const directReply = `La información ingresada no es válida. Por favor, verifique el dato e inténtelo nuevamente.\n\n¿Se refiere a "${marcaPreguntada}"? Responda Sí o No.`;
        const newMsg: HistMsg = { role: "ia", author: "Asistente Sekunet", time: new Date().toISOString(), content: directReply };
        const upd: Record<string, unknown> = { histtecnico: [...histtecnico, newMsg] };
        if (clienteChanged) upd.cliente = updatedCliente;
        await db.from("sek_cases").update(upd).eq("id", case_id);
        return new Response(JSON.stringify({ ok: true, reply: directReply }), { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }
    }

    // GATE 3 — Si hay tema (que no es Otro) pero falta marca o modelo, obligar a pedirlos.
    if (accion !== "CERRAR" && accion !== "VENTAS" && accion !== "ESCALAR_INMEDIATO" && accion !== "ESCALAR" && accion !== "PEDIR_DESCRIPCION" && accion !== "PEDIR_DATOS" && accion !== "PEDIR_NOMBRE" && accion !== "PEDIR_CORREO" && accion !== "PEDIR_CUENTA" && accion !== "PEDIR_TEMA") {
      if (temaSupervisor && temaSupervisor !== "Otro") {
        if (!marcaSupervisor && !modeloSupervisor && accion !== "PEDIR_MARCA_Y_MODELO") {
          console.log("[seka-whatsapp] Faltan marca y modelo → Forzando PEDIR_MARCA_Y_MODELO.");
          accion = "PEDIR_MARCA_Y_MODELO";
          supervisorResult.respuesta_sugerida = "";
        } else if (!marcaSupervisor && modeloSupervisor && accion !== "PEDIR_MARCA") {
          console.log("[seka-whatsapp] Falta marca → Forzando PEDIR_MARCA.");
          accion = "PEDIR_MARCA";
          supervisorResult.respuesta_sugerida = "";
        } else if (marcaSupervisor && !modeloSupervisor && accion !== "PEDIR_MODELO") {
          console.log("[seka-whatsapp] Falta modelo → Forzando PEDIR_MODELO.");
          accion = "PEDIR_MODELO";
          supervisorResult.respuesta_sugerida = "";
        }
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
      const temaTag = temaToTag(temaSupervisor);
      const upd: Record<string, unknown> = {
        histtecnico: [...histtecnico, newMsg],
        estado: "escalado",
        escalado_at: new Date().toISOString(),
        n2_reason: buildN2Reason(sentimiento === "muy_molesto" ? "Cliente requiere atención prioritaria" : "Solicitud directa del cliente"),
      };
      const tags = [...new Set([...(urgencyTags || []), ...(temaTag ? [temaTag] : [])])];
      if (tags.length) upd.tags = tags;
      if (clienteChanged) upd.cliente = updatedCliente;
      if (nuevoTitle) upd.title = nuevoTitle;
      else if (temaSupervisor) upd.title = `${temaSupervisor}`.substring(0, 120);
      await safeUpdateCase(upd, case_id);
      return new Response(JSON.stringify({ ok: true, reply: replyText }), { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    // ── ACCIÓN: PEDIR NOMBRE, CORREO, CUENTA ──
    if (accion === "PEDIR_NOMBRE" || accion === "PEDIR_CORREO" || accion === "PEDIR_CUENTA") {
      let pregunta = "";
      let fraseCaract = "";

      if (accion === "PEDIR_NOMBRE") {
        pregunta = "Para comenzar, ¿me podría indicar su nombre completo?";
        fraseCaract = "nombre completo";
      } else if (accion === "PEDIR_CORREO") {
        pregunta = "Gracias. ¿Me podría indicar su correo electrónico?";
        fraseCaract = "correo electrónico";
      } else {
        pregunta = "Entiendo. ¿Cuál es el nombre de la empresa o cuenta afiliada a Sekunet?";
        fraseCaract = "empresa o cuenta afiliada";
      }

      const reintentos = contarReintentos(iaRealMsgs, fraseCaract);

      if (reintentos >= 2) {
        const newMsg: HistMsg = { role: "ia", author: "Asistente Sekunet", time: new Date().toISOString(), content: MSG_CIERRE_REINTENTOS };
        const upd: Record<string, unknown> = { histtecnico: [...histtecnico, newMsg], estado: "cerrado" };
        if (clienteChanged) upd.cliente = updatedCliente;
        await db.from("sek_cases").update(upd).eq("id", case_id);
        return new Response(JSON.stringify({ ok: true, reply: MSG_CIERRE_REINTENTOS }), { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }

      // Para PEDIR_CORREO: si el cliente declaró no tener correo, guardar "Sin correo" y avanzar
      if (accion === "PEDIR_CORREO") {
        const frasesSinCorreo = ["no lo tengo", "no tengo", "no recuerdo", "sin correo", "no cuento", "no tengo correo", "ninguno", "no lo tengo a mano", "prefiero no", "no quiero"];
        const clienteDeclaroSinCorreo = frasesSinCorreo.some(f => lastUserMsgContent.toLowerCase().includes(f));
        console.log(`[seka-whatsapp] POST-SIN-CORREO: user=${JSON.stringify(lastUserMsgContent)}, declaroSinCorreo=${clienteDeclaroSinCorreo}`);
        if (clienteDeclaroSinCorreo && !updatedCliente.correo) {
          updatedCliente.correo = "Sin correo";
          clienteChanged = true;
          const preguntaCuenta = "Entiendo. ¿Cuál es el nombre de la empresa o cuenta afiliada a Sekunet?";
          const newMsg: HistMsg = { role: "ia", author: "Asistente Sekunet", time: new Date().toISOString(), content: preguntaCuenta };
          const upd: Record<string, unknown> = { histtecnico: [...histtecnico, newMsg], cliente: updatedCliente };
          await db.from("sek_cases").update(upd).eq("id", case_id);
          return new Response(JSON.stringify({ ok: true, reply: preguntaCuenta }), { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });
        }
      }

      const lastIaContent = (lastIA?.content || "").toLowerCase();
      const botYaPidio = lastIaContent.includes(fraseCaract.toLowerCase());
      let msgInvalido = MSG_INVALIDO;
      if (accion === "PEDIR_NOMBRE") msgInvalido = MSG_NOMBRE_INVALIDO;
      else if (accion === "PEDIR_CORREO") msgInvalido = MSG_CORREO_INVALIDO;
      else if (accion === "PEDIR_CUENTA") msgInvalido = MSG_CUENTA_INVALIDO;
      const directReply = (botYaPidio && reintentos < 2)
        ? `${msgInvalido}\n\n${pregunta}`
        : pregunta;

      const newMsg: HistMsg = { role: "ia", author: "Asistente Sekunet", time: new Date().toISOString(), content: directReply };
      const upd: Record<string, unknown> = { histtecnico: [...histtecnico, newMsg] };
      if (clienteChanged) upd.cliente = updatedCliente;
      await db.from("sek_cases").update(upd).eq("id", case_id);
      return new Response(JSON.stringify({ ok: true, reply: directReply }), { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    // ── ACCIÓN: PEDIR TEMA ──
    if (accion === "PEDIR_TEMA") {
      const MENU_TEMAS = "¿En relación a qué tema sería su consulta?\n\n1. Configuraciones\n2. Reset\n3. Desvinculación\n4. Firmware\n5. Software\n6. Licencias\n7. Otro\n\nResponda con el número o el nombre del tema.";
      const reintentsoTema = contarReintentos(iaRealMsgs, "tema sería su consulta");

      if (reintentsoTema >= 2) {
        const newMsg: HistMsg = { role: "ia", author: "Asistente Sekunet", time: new Date().toISOString(), content: MSG_CIERRE_REINTENTOS };
        const upd: Record<string, unknown> = { histtecnico: [...histtecnico, newMsg], estado: "cerrado" };
        if (clienteChanged) upd.cliente = updatedCliente;
        await db.from("sek_cases").update(upd).eq("id", case_id);
        return new Response(JSON.stringify({ ok: true, reply: MSG_CIERRE_REINTENTOS }), { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }

      const lastIaContentTema = (lastIA?.content || "").toLowerCase();
      const botYaPidioTema = lastIaContentTema.includes("tema sería su consulta");
      const directReply = (botYaPidioTema && reintentsoTema < 2)
        ? `${MSG_INVALIDO}\n\n${MENU_TEMAS}`
        : MENU_TEMAS;

      const newMsg: HistMsg = { role: "ia", author: "Asistente Sekunet", time: new Date().toISOString(), content: directReply };
      const upd: Record<string, unknown> = { histtecnico: [...histtecnico, newMsg] };
      if (clienteChanged) upd.cliente = updatedCliente;
      if (nuevoTitle) upd.title = nuevoTitle;
      await db.from("sek_cases").update(upd).eq("id", case_id);
      return new Response(JSON.stringify({ ok: true, reply: directReply }), { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    // ── ACCIÓN: PEDIR MARCA ──
    if (accion === "PEDIR_MARCA") {
      // Si el bot ya pidió la marca y el usuario respondió, verificar la marca contra la BD
      const botYaPidioMarca = lastIAContent.includes("indíquenos la marca") || lastIAContent.includes("marca del equipo") || lastIAContent.includes("verifique el dato");


      if (botYaPidioMarca && marcaSupervisor) {
        // El usuario dio una marca, validarla contra BD
        const marcaValida = await validarMarcaSolo(marcaSupervisor);
        
        if (marcaValida.encontrado) {
          const marcaFueCorregida = marcaValida.marcaCorregida && marcaValida.marcaCorregida.toLowerCase() !== marcaSupervisor.toLowerCase();
          
          if (marcaFueCorregida) {
            // Aproximación de escritura → confirmar
            const directReply = `¿Se refiere a "${marcaValida.marcaCorregida}"? Responda Sí o No.`;
            const newMsg: HistMsg = { role: "ia", author: "Asistente Sekunet", time: new Date().toISOString(), content: directReply };
            const upd: Record<string, unknown> = { histtecnico: [...histtecnico, newMsg] };
            if (clienteChanged) upd.cliente = updatedCliente;
            await db.from("sek_cases").update(upd).eq("id", case_id);
            return new Response(JSON.stringify({ ok: true, reply: directReply }), { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });
          }

          // Marca exacta encontrada → guardar y pedir modelo
          const directReply = "¿Nos podría indicar el modelo del equipo, por favor?";
          const newMsg: HistMsg = { role: "ia", author: "Asistente Sekunet", time: new Date().toISOString(), content: directReply };
          const upd: Record<string, unknown> = { histtecnico: [...histtecnico, newMsg] };
          const cliObj = { ...updatedCliente, marca: marcaValida.marcaCorregida || marcaSupervisor };
          upd.cliente = cliObj;
          if (nuevoTitle) upd.title = nuevoTitle;
          await db.from("sek_cases").update(upd).eq("id", case_id);
          return new Response(JSON.stringify({ ok: true, reply: directReply }), { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });
        }

        // Marca no existe
        if (temaSupervisor !== "Otro") {
          const directReply = "Gracias por contactarnos.\n\nLe informamos que el dispositivo indicado no corresponde a un equipo distribuido por Sekunet, por lo que no podemos brindarle soporte técnico sobre este producto.\n\n¿Tiene alguna otra consulta relacionada con nuestras marcas o servicios? Con gusto le ayudaremos.";
          const newMsg: HistMsg = { role: "ia", author: "Asistente Sekunet", time: new Date().toISOString(), content: directReply };
          const upd: Record<string, unknown> = { histtecnico: [...histtecnico, newMsg] };
          if (clienteChanged) upd.cliente = updatedCliente;
          upd.title = `${temaSupervisor} — Marca Rechazada`;
          await db.from("sek_cases").update(upd).eq("id", case_id);
          return new Response(JSON.stringify({ ok: true, reply: directReply }), { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });
        }
      }

      if (botYaPidioMarca && !marcaSupervisor) {
        // El bot pidió la marca pero el LLM no extrajo nada → reintento o cierre
        const reintMarc = contarReintentos(iaRealMsgs, "marca del equipo");
        if (reintMarc >= 2) {
          const newMsg: HistMsg = { role: "ia", author: "Asistente Sekunet", time: new Date().toISOString(), content: MSG_CIERRE_REINTENTOS };
          const upd: Record<string, unknown> = { histtecnico: [...histtecnico, newMsg], estado: "cerrado" };
          if (clienteChanged) upd.cliente = updatedCliente;
          await db.from("sek_cases").update(upd).eq("id", case_id);
          return new Response(JSON.stringify({ ok: true, reply: MSG_CIERRE_REINTENTOS }), { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });
        }
        const directReply = `${MSG_INVALIDO}\n\nPor favor, indíquenos la marca del equipo.`;
        const newMsg: HistMsg = { role: "ia", author: "Asistente Sekunet", time: new Date().toISOString(), content: directReply };
        const upd: Record<string, unknown> = { histtecnico: [...histtecnico, newMsg] };
        if (clienteChanged) upd.cliente = updatedCliente;
        await db.from("sek_cases").update(upd).eq("id", case_id);
        return new Response(JSON.stringify({ ok: true, reply: directReply }), { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }

      // Primera vez que se pide la marca
      const directReply = "Por favor, indíquenos la marca del equipo.";
      const newMsg: HistMsg = { role: "ia", author: "Asistente Sekunet", time: new Date().toISOString(), content: directReply };
      const upd: Record<string, unknown> = { histtecnico: [...histtecnico, newMsg] };
      if (clienteChanged) upd.cliente = updatedCliente;
      await db.from("sek_cases").update(upd).eq("id", case_id);
      return new Response(JSON.stringify({ ok: true, reply: directReply }), { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    // ── ACCIÓN: PEDIR MODELO ──
    if (accion === "PEDIR_MODELO") {
      const marcaValida = await validarMarcaSolo(marcaSupervisor);
      
      if (!marcaValida.encontrado && temaSupervisor !== "Otro") {
        const rejectionMessage = "Gracias por contactarnos.\n\nLe informamos que el dispositivo indicado no corresponde a un equipo distribuido por Sekunet, por lo que no podemos brindarle soporte técnico sobre este producto.\n\n¿Tiene alguna otra consulta relacionada con nuestras marcas o servicios? Con gusto le ayudaremos.";
        const directReply = withAcuse(rejectionMessage);
        
        const newMsg: HistMsg = { role: "ia", author: "Asistente Sekunet", time: new Date().toISOString(), content: directReply };
        const upd: Record<string, unknown> = { histtecnico: [...histtecnico, newMsg] };
        if (clienteChanged) upd.cliente = updatedCliente;
        upd.title = `${temaSupervisor} — Marca Rechazada`;
        await db.from("sek_cases").update(upd).eq("id", case_id);
        
        return new Response(JSON.stringify({ ok: true, reply: directReply }), { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }

      if (marcaValida.encontrado) {
        const marcaFueCorregida = marcaValida.marcaCorregida && marcaValida.marcaCorregida.toLowerCase() !== marcaSupervisor.toLowerCase();
        const yaEstaGuardada = updatedCliente.marca && updatedCliente.marca.toLowerCase() === marcaValida.marcaCorregida.toLowerCase();
        
        if (marcaFueCorregida && !yaEstaGuardada) {
          const directReply = `¿Se refiere a "${marcaValida.marcaCorregida}"? Responda Sí o No.`;
          const newMsg: HistMsg = { role: "ia", author: "Asistente Sekunet", time: new Date().toISOString(), content: directReply };
          const upd: Record<string, unknown> = { histtecnico: [...histtecnico, newMsg] };
          if (clienteChanged) upd.cliente = updatedCliente;
          await db.from("sek_cases").update(upd).eq("id", case_id);
          return new Response(JSON.stringify({ ok: true, reply: directReply }), { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });
        }
      }

      const botYaPidioModelo = lastIAContent.includes("modelo del equipo") || lastIAContent.includes("modelo específico") || lastIAContent.includes("verifique el dato");
      if (botYaPidioModelo && !modeloSupervisor) {
        const reintModel = contarReintentos(iaRealMsgs, "modelo del equipo");
        if (reintModel >= 2) {
          // Tras 2 reintentos sin modelo, escalar a humano para que el técnico lo complete.
          const M02_TEXT = "Agradecemos su preferencia. En un momento será atendido por uno de nuestros agentes.";
          const newMsg: HistMsg = { role: "ia", author: "Asistente Sekunet", time: new Date().toISOString(), content: M02_TEXT };
          const upd: Record<string, unknown> = { histtecnico: [...histtecnico, newMsg], estado: "escalado", escalado_at: new Date().toISOString() };
          if (clienteChanged) upd.cliente = updatedCliente;
          upd.title = `${temaSupervisor} — ${marcaSupervisor} — modelo pendiente`.substring(0, 120);
          upd.tags = ["modelo_pendiente"];
          await db.from("sek_cases").update(upd).eq("id", case_id);
          return new Response(JSON.stringify({ ok: true, reply: M02_TEXT }), { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });
        }
        const directReply = `${MSG_INVALIDO}\n\n¿Nos podría indicar el modelo del equipo, por favor?`;
        const newMsg: HistMsg = { role: "ia", author: "Asistente Sekunet", time: new Date().toISOString(), content: directReply };
        const upd: Record<string, unknown> = { histtecnico: [...histtecnico, newMsg] };
        if (clienteChanged) upd.cliente = updatedCliente;
        await db.from("sek_cases").update(upd).eq("id", case_id);
        return new Response(JSON.stringify({ ok: true, reply: directReply }), { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }

      const directReply = withAcuse("¿Nos podría indicar el modelo del equipo, por favor?");
      const newMsg: HistMsg = { role: "ia", author: "Asistente Sekunet", time: new Date().toISOString(), content: directReply };
      const upd: Record<string, unknown> = { histtecnico: [...histtecnico, newMsg] };
      const cliObj = { ...updatedCliente, marca: marcaValida.marcaCorregida || marcaSupervisor };
      upd.cliente = cliObj;
      await db.from("sek_cases").update(upd).eq("id", case_id);
      return new Response(JSON.stringify({ ok: true, reply: directReply }), { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    // ── ACCIÓN: PEDIR MARCA Y MODELO → redirigir a PEDIR_MARCA (siempre pedir uno por uno) ──
    if (accion === "PEDIR_MARCA_Y_MODELO") {
      const directReply = "Por favor, indíquenos la marca del equipo.";
      const newMsg: HistMsg = { role: "ia", author: "Asistente Sekunet", time: new Date().toISOString(), content: directReply };
      const upd: Record<string, unknown> = { histtecnico: [...histtecnico, newMsg] };
      if (clienteChanged) upd.cliente = updatedCliente;
      await db.from("sek_cases").update(upd).eq("id", case_id);
      return new Response(JSON.stringify({ ok: true, reply: directReply }), { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    // ── ACCIÓN: BUSCAR_INVENTARIO (tiene marca y/o modelo, verificar en BD) ──
    if (accion === "BUSCAR_INVENTARIO") {
      let searchMarca = marcaSupervisor;
      let marcaEsValida = false;
      let marcaOriginal = searchMarca;
      if (searchMarca) {
        const checkM = await validarMarcaSolo(searchMarca);
        if (checkM.encontrado) {
          marcaEsValida = true;
          if (checkM.marcaCorregida) searchMarca = checkM.marcaCorregida;
        }
      }

      // HEURÍSTICA: Si en BUSCAR_INVENTARIO la marca tuvo que ser corregida fonéticamente,
      // y aún no está guardada como la marca confirmada en la BD, preguntamos primero.
      const marcaFueCorregida = searchMarca && marcaOriginal && searchMarca.toLowerCase() !== marcaOriginal.toLowerCase();
      const yaEstaGuardada = updatedCliente.marca && updatedCliente.marca.toLowerCase() === searchMarca.toLowerCase();
      
      if (marcaFueCorregida && !yaEstaGuardada) {
        const directReply = `¿Se refiere a "${searchMarca}"? Responda Sí o No.`;
        const newMsg: HistMsg = { role: "ia", author: "Asistente Sekunet", time: new Date().toISOString(), content: directReply };
        const upd: Record<string, unknown> = { histtecnico: [...histtecnico, newMsg] };
        if (clienteChanged) upd.cliente = updatedCliente;
        await db.from("sek_cases").update(upd).eq("id", case_id);
        return new Response(JSON.stringify({ ok: true, reply: directReply }), { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }

      // Validar marca primero
      if (!marcaEsValida) {
        console.log(`[seka-whatsapp] Marca "${searchMarca}" no válida en inventario.`);
        const directReply = `No logramos identificar la marca "${searchMarca}" en nuestro sistema. Por favor, verifique la marca exacta en la etiqueta de su equipo.`;
        const newMsgInv: HistMsg = { role: "ia", author: "Asistente Sekunet", time: new Date().toISOString(), content: directReply };
        await db.from("sek_cases").update({ histtecnico: [...histtecnico, newMsgInv] }).eq("id", case_id);
        return new Response(JSON.stringify({ ok: true, reply: directReply }), { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }

      // Marca válida → validar modelo (inventario + fuentes externas)
      const modeloValidacion = await validarModelo(searchMarca, modeloSupervisor || "");
      console.log(`[seka-whatsapp] Validación modelo "${modeloSupervisor}" de marca "${searchMarca}":`, modeloValidacion);

      if (!modeloValidacion.valido) {
        const reintModelo = contarReintentos(iaRealMsgs, "modelo del equipo");
        if (reintModelo >= 2) {
          // Tras 2 reintentos, escalar a un agente humano para que el técnico valide manualmente.
          const M02_TEXT = "Agradecemos su preferencia. En un momento será atendido por uno de nuestros agentes.";
          const newMsg: HistMsg = { role: "ia", author: "Asistente Sekunet", time: new Date().toISOString(), content: M02_TEXT };
          await db.from("sek_cases").update({
            histtecnico: [...histtecnico, newMsg],
            estado: "escalado",
            escalado_at: new Date().toISOString(),
            title: `${temaSupervisor} — ${searchMarca} ${modeloSupervisor} — modelo por validar`.substring(0, 120),
            tags: ["modelo_no_validado"],
          }).eq("id", case_id);
          return new Response(JSON.stringify({ ok: true, reply: M02_TEXT }), { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });
        }
        const directReply = `${MSG_INVALIDO}\n\n¿Nos podría indicar el modelo del equipo, por favor?`;
        const newMsg: HistMsg = { role: "ia", author: "Asistente Sekunet", time: new Date().toISOString(), content: directReply };
        const upd: Record<string, unknown> = { histtecnico: [...histtecnico, newMsg] };
        if (clienteChanged) upd.cliente = updatedCliente;
        await db.from("sek_cases").update(upd).eq("id", case_id);
        return new Response(JSON.stringify({ ok: true, reply: directReply }), { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }

      // Modelo válido → continuar según tema y marca
      updatedCliente.marca = searchMarca;
      updatedCliente.modelo = modeloSupervisor || "";
      clienteChanged = true;

      const esHik = /hik/i.test(searchMarca);
      if (temaSupervisor === "Reset") {
        accion = esHik ? "PEDIR_ETIQUETA_Y_XML" : "PEDIR_ETIQUETA";
      } else if (temaSupervisor === "Desvinculación" || temaSupervisor === "Firmware") {
        accion = "PEDIR_ETIQUETA";
      } else {
        accion = "PEDIR_DESCRIPCION";
      }

      // Guardar título con detalle de validación
      const nuevoTitleInv = `${temaSupervisor} — ${searchMarca} ${modeloSupervisor}`.substring(0, 120);
      if (clienteChanged) {
        await db.from("sek_cases").update({ cliente: updatedCliente, title: nuevoTitleInv }).eq("id", case_id);
      } else {
        await db.from("sek_cases").update({ title: nuevoTitleInv }).eq("id", case_id);
      }
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
    // Blindaje: nunca pedir descripción si el tema no es Otro y aún faltan marca/modelo
    if (accion === "PEDIR_DESCRIPCION" && temaSupervisor && temaSupervisor !== "Otro" && (!marcaSupervisor || !modeloSupervisor)) {
      console.log(`[seka-whatsapp] Blindaje anti-salto: tema ${temaSupervisor} sin marca/modelo, forzando PEDIR_MARCA_Y_MODELO en lugar de PEDIR_DESCRIPCION.`);
      accion = "PEDIR_MARCA_Y_MODELO";
    }

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
      const temaTag = temaToTag(temaSupervisor);
      const upd: Record<string, unknown> = {
        histtecnico: [...histtecnico, newMsg],
        estado: "escalado",
        escalado_at: new Date().toISOString(),
        n2_reason: buildN2Reason(`${temaSupervisor} — recopilación completada`),
      };
      const tags = [...new Set([...(urgencyTags || []), ...(temaTag ? [temaTag] : [])])];
      if (tags.length) upd.tags = tags;
      if (clienteChanged) upd.cliente = updatedCliente;
      if (marcaSupervisor || modeloSupervisor) {
        upd.title = `${temaSupervisor} — ${marcaSupervisor} ${modeloSupervisor}`.trim().substring(0, 120);
      } else if (nuevoTitle) {
        upd.title = nuevoTitle;
      } else if (temaSupervisor) {
        upd.title = `${temaSupervisor}`.substring(0, 120);
      }
      await safeUpdateCase(upd, case_id);
      return new Response(JSON.stringify({ ok: true, reply: replyText }), { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    // (Bloque CONTINUAR eliminado — el bot solo usa textos fijos)


    console.warn(`[seka-whatsapp] Acción no resuelta por ningún handler: "${accion}". Escalando como medida de seguridad.`);
    const M02_UNHANDLED = "Agradecemos su preferencia. En un momento será atendido por uno de nuestros agentes.";
    const replyUnhandled = withAcuse(M02_UNHANDLED);
    const newMsgUnhandled: HistMsg = { role: "ia", author: "Asistente Sekunet", time: new Date().toISOString(), content: replyUnhandled };
    await safeUpdateCase({
      histtecnico: [...histtecnico, newMsgUnhandled],
      estado: "escalado",
      escalado_at: new Date().toISOString(),
      n2_reason: buildN2Reason(`Acción no resuelta: ${accion}`),
    }, case_id);
    return new Response(JSON.stringify({ ok: true, reply: replyUnhandled }), { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });

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
        await safeUpdateCase({
          histtecnico: updatedHist,
          estado: "escalado",
          escalado_at: new Date().toISOString(),
          n2_reason: "Falla crítica de IA (Panic Fallback)",
        }, globalCaseId);
        
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

