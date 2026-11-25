import { cacheGet, cacheSet, cacheDelete } from "@/lib/supabase/cache";
import { createGarantiasServiceClient } from "@/lib/supabase-garantias";
import { broadcastCaseEvent } from "@/lib/realtime-broadcast";

export interface TechMemoryEntry {
  id: string;
  text: string;
  category?: string;
  author: string;
  createdAt: string;
}

export interface TechPersonalityConfig {
  customInstructions: string;
  tone?: string;
  updatedAt?: string;
  updatedBy?: string;
}

export type TechResourceKind = "video" | "datasheet" | "manual" | "tutorial" | "foro" | "oficial";

export interface TechResource {
  title: string;
  url: string;
  snippet?: string;
  kind: TechResourceKind;
  image?: string | null;
  domain?: string;
  duration?: string | null;
  channel?: string | null;
  isPdf?: boolean;
}

export interface TechThreadMessage {
  role: "user" | "assistant";
  content: string;
  time?: string;
  mediaUrl?: string;
  mediaType?: string;
  fileName?: string;
  resources?: TechResource[];
}

export interface TechAppliedAction {
  type: "add_note" | "update_equipment" | "save_memory";
  summary: string;
  ok: boolean;
}

const TECH_MEMORY_KEY = "tech_assistant_memory";
const TECH_PERSONALITY_KEY = "tech_assistant_personality";
const MEMORY_CACHE_KEY = "tech_assistant_memory_cache_v1";
const PERSONALITY_CACHE_KEY = "tech_assistant_personality_cache_v1";
const MAX_MEMORIES = 80;
const CLIENT_HISTORY_TTL_MS = 5 * 60_000;
const MAX_THREAD_CASES = 12;
const MAX_THREAD_MESSAGES = 14;
const MAX_MESSAGE_CHARS = 2600;

function emailSlug(email: string): string {
  return String(email || "anon")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9._-]/g, "_")
    .slice(0, 64);
}

function threadSettingKey(email: string): string {
  return `tech_assistant_thread_${emailSlug(email)}`;
}

function threadCacheKey(email: string): string {
  return `tech_assistant_thread_cache_${emailSlug(email)}`;
}

// ── 1. MEMORIA PERSISTENTE (REGLAS Y APRENDIZAJES DEL EQUIPO) ──

export async function getTechMemories(supabase: any): Promise<TechMemoryEntry[]> {
  const cached = cacheGet(MEMORY_CACHE_KEY) as TechMemoryEntry[] | undefined;
  if (cached) return cached;

  try {
    const { data: row } = await supabase
      .from("sek_app_settings")
      .select("value")
      .eq("key", TECH_MEMORY_KEY)
      .maybeSingle();

    let list: TechMemoryEntry[] = [];
    if (row?.value) {
      const parsed = typeof row.value === "string" ? JSON.parse(row.value) : row.value;
      if (Array.isArray(parsed)) list = parsed;
    }
    cacheSet(MEMORY_CACHE_KEY, list);
    return list;
  } catch {
    return [];
  }
}

async function saveTechMemories(supabase: any, list: TechMemoryEntry[]): Promise<boolean> {
  const trimmed = list.slice(-MAX_MEMORIES);
  const { error } = await supabase
    .from("sek_app_settings")
    .upsert(
      {
        key: TECH_MEMORY_KEY,
        value: JSON.stringify(trimmed),
        iv: "none",
        tag: "none",
        updated_at: new Date().toISOString(),
      },
      { onConflict: "key" }
    );
  if (!error) {
    cacheSet(MEMORY_CACHE_KEY, trimmed);
    return true;
  }
  return false;
}

export async function addTechMemory(
  supabase: any,
  input: { text: string; category?: string; author: string }
): Promise<{ ok: boolean; entry?: TechMemoryEntry; memories: TechMemoryEntry[] }> {
  const cleanText = String(input.text || "").trim().slice(0, 500);
  const current = await getTechMemories(supabase);
  if (!cleanText) return { ok: false, memories: current };

  const duplicate = current.find(
    (m) => m.text.toLowerCase() === cleanText.toLowerCase()
  );
  if (duplicate) return { ok: true, entry: duplicate, memories: current };

  const entry: TechMemoryEntry = {
    id: `mem_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
    text: cleanText,
    category: input.category?.trim() || "general",
    author: input.author,
    createdAt: new Date().toISOString(),
  };
  const next = [...current, entry].slice(-MAX_MEMORIES);
  const ok = await saveTechMemories(supabase, next);
  return { ok, entry, memories: next };
}

export async function deleteTechMemory(
  supabase: any,
  id: string
): Promise<{ ok: boolean; memories: TechMemoryEntry[] }> {
  const current = await getTechMemories(supabase);
  const next = current.filter((m) => m.id !== id);
  const ok = await saveTechMemories(supabase, next);
  return { ok, memories: next };
}

export function detectMemorySaveIntent(message: string): string | null {
  const msg = String(message || "").trim();
  if (!msg || msg.length > 500) return null;
  const patterns = [
    /^(?:por favor\s+)?(?:recuerda|recordá|acordate|acuerdate|aprende|aprendé|anota|anotá|apunta|apuntá|guarda en (?:tu )?memoria)\s+(?:de\s+)?(?:que\s+)?(.+)/i,
    /^(?:para futuros casos|de ahora en adelante)[,:]?\s*(?:recuerda|recordá|acordate|ten en cuenta|toma en cuenta|no olvides)?\s*(?:que\s+)?(.+)/i,
    /^(?:toma nota(?:\s+de)?|no olvides|guarda esto|regla nueva)\s*[:,-]?\s*(?:que\s+)?(.+)/i,
    /^(siempre que pase\s+.+)/i,
  ];
  for (const rx of patterns) {
    const m = msg.match(rx);
    if (m && m[1] && m[1].trim().length >= 8) {
      return m[1].trim().replace(/[.]+$/, "");
    }
  }
  return null;
}

export async function getClientPriorCasesSummary(
  supabase: any,
  phone?: string | null,
  currentCaseId?: string | null
): Promise<string> {
  const cleanPhone = String(phone || "").replace(/[^0-9]/g, "");
  if (cleanPhone.length < 8) return "";

  const tail8 = cleanPhone.slice(-8);
  const cKey = `tech_client_prior_${tail8}_${currentCaseId || "none"}`;
  const cached = cacheGet(cKey) as { at: number; text: string } | undefined;
  if (cached && Date.now() - cached.at < CLIENT_HISTORY_TTL_MS) {
    return cached.text;
  }

  try {
    let q = supabase
      .from("sek_cases")
      .select("id, created_at, estado, marca, modelo, problema, resolucion, histtecnico")
      .ilike("customer_phone", `%${tail8}%`)
      .order("created_at", { ascending: false })
      .limit(4);
    if (currentCaseId) {
      q = q.neq("id", currentCaseId);
    }
    const { data: priorCases } = await q;
    if (!Array.isArray(priorCases) || priorCases.length === 0) {
      cacheSet(cKey, { at: Date.now(), text: "" });
      return "";
    }
    const BOILERPLATE_TECH_RE =
      /bienvenido al soporte|nombre de la cuenta|vendedor encargado|procederemos a cerrar|ha sido un placer|algo m[aá]s en lo que (?:te|le) pueda|cerrad[oa] por inactividad|brindarnos m[aá]s detalles/i;

    const lines = priorCases.slice(0, 3).map((c: any) => {
      const fecha = c.created_at ? new Date(c.created_at).toLocaleDateString("es-CR") : "s/f";
      const eq = [c.marca, c.modelo].filter(Boolean).join(" ") || "Equipo no especificado";
      const prob = String(c.problema || "Sin resumen").replace(/\s+/g, " ").slice(0, 140);
      const res = c.resolucion ? ` | Resolución: ${String(c.resolucion).replace(/\s+/g, " ").slice(0, 140)}` : "";

      const ht = Array.isArray(c.histtecnico) ? c.histtecnico : [];
      const substantiveTech = ht
        .filter((m: any) => {
          if (!m || typeof m.content !== "string") return false;
          if (m.role === "ia" || m.role === "nota") return false;
          const txt = m.content.trim();
          return txt.length >= 25 && !BOILERPLATE_TECH_RE.test(txt);
        })
        .map((m: any) => String(m.content).trim());
      const techPart =
        substantiveTech.length > 0
          ? ` | Indicaciones previas del técnico: ${substantiveTech.slice(-2).join(" | ").replace(/\s+/g, " ").slice(0, 260)}`
          : "";

      return `• Caso #${String(c.id).slice(0, 8)} (${fecha}, ${c.estado}): ${eq} — ${prob}${res}${techPart}`;
    });
    const text = lines.join("\n");
    cacheSet(cKey, { at: Date.now(), text });
    return text;
  } catch {
    return "";
  }
}

// ── 2. PERSONALIDAD E INSTRUCCIONES PERSONALIZADAS ──

export async function getTechPersonality(supabase: any): Promise<TechPersonalityConfig> {
  const cached = cacheGet(PERSONALITY_CACHE_KEY) as TechPersonalityConfig | undefined;
  if (cached) return cached;

  const fallback: TechPersonalityConfig = { customInstructions: "", tone: "" };
  try {
    const { data: row } = await supabase
      .from("sek_app_settings")
      .select("value")
      .eq("key", TECH_PERSONALITY_KEY)
      .maybeSingle();

    if (row?.value) {
      const parsed = typeof row.value === "string" ? JSON.parse(row.value) : row.value;
      const cfg: TechPersonalityConfig = {
        customInstructions: String(parsed?.customInstructions || "").slice(0, 2000),
        tone: String(parsed?.tone || "").slice(0, 120),
        updatedAt: parsed?.updatedAt,
        updatedBy: parsed?.updatedBy,
      };
      cacheSet(PERSONALITY_CACHE_KEY, cfg);
      return cfg;
    }
  } catch {
    /* usar defecto */
  }
  cacheSet(PERSONALITY_CACHE_KEY, fallback);
  return fallback;
}

export async function saveTechPersonality(
  supabase: any,
  input: { customInstructions?: string; tone?: string; updatedBy?: string }
): Promise<{ ok: boolean; config: TechPersonalityConfig }> {
  const config: TechPersonalityConfig = {
    customInstructions: String(input.customInstructions || "").trim().slice(0, 2000),
    tone: String(input.tone || "").trim().slice(0, 120),
    updatedAt: new Date().toISOString(),
    updatedBy: input.updatedBy,
  };
  const { error } = await supabase
    .from("sek_app_settings")
    .upsert(
      {
        key: TECH_PERSONALITY_KEY,
        value: JSON.stringify(config),
        iv: "none",
        tag: "none",
        updated_at: new Date().toISOString(),
      },
      { onConflict: "key" }
    );
  if (!error) {
    cacheSet(PERSONALITY_CACHE_KEY, config);
    return { ok: true, config };
  }
  return { ok: false, config };
}

// ── 3. HILOS DE CONVERSACIÓN PERSISTENTES POR TÉCNICO Y CASO ──

type ThreadStore = {
  byCase: Record<string, { messages: TechThreadMessage[]; updatedAt: string }>;
};

async function loadThreadStore(supabase: any, email: string): Promise<ThreadStore> {
  const cKey = threadCacheKey(email);
  const cached = cacheGet(cKey) as ThreadStore | undefined;
  if (cached) return cached;

  const empty: ThreadStore = { byCase: {} };
  try {
    const { data: row } = await supabase
      .from("sek_app_settings")
      .select("value")
      .eq("key", threadSettingKey(email))
      .maybeSingle();

    if (row?.value) {
      const parsed = typeof row.value === "string" ? JSON.parse(row.value) : row.value;
      if (parsed && typeof parsed.byCase === "object") {
        cacheSet(cKey, parsed);
        return parsed as ThreadStore;
      }
    }
  } catch {
    /* ignorar */
  }
  cacheSet(cKey, empty);
  return empty;
}

async function persistThreadStore(supabase: any, email: string, store: ThreadStore): Promise<void> {
  // Compactar: mantener máximo MAX_THREAD_CASES casos más recientes
  const entries = Object.entries(store.byCase).sort((a, b) =>
    String(b[1]?.updatedAt || "").localeCompare(String(a[1]?.updatedAt || ""))
  );
  const compacted: ThreadStore = { byCase: {} };
  for (const [k, v] of entries.slice(0, MAX_THREAD_CASES)) {
    compacted.byCase[k] = v;
  }

  cacheSet(threadCacheKey(email), compacted);
  await supabase
    .from("sek_app_settings")
    .upsert(
      {
        key: threadSettingKey(email),
        value: JSON.stringify(compacted),
        iv: "none",
        tag: "none",
        updated_at: new Date().toISOString(),
      },
      { onConflict: "key" }
    );
}

export async function getTechThread(
  supabase: any,
  email: string,
  caseKey: string
): Promise<TechThreadMessage[]> {
  const store = await loadThreadStore(supabase, email);
  const bucket = store.byCase[caseKey || "general"];
  return Array.isArray(bucket?.messages) ? bucket.messages : [];
}

export async function saveTechThread(
  supabase: any,
  email: string,
  caseKey: string,
  messages: TechThreadMessage[]
): Promise<void> {
  const store = await loadThreadStore(supabase, email);
  const compactMsgs: TechThreadMessage[] = (messages || [])
    .slice(-MAX_THREAD_MESSAGES)
    .map((m) => ({
      role: m.role === "assistant" ? "assistant" : "user",
      content: String(m.content || "").slice(0, MAX_MESSAGE_CHARS),
      ...(m.time ? { time: m.time } : {}),
      ...(m.mediaUrl ? { mediaUrl: m.mediaUrl } : {}),
      ...(m.mediaType ? { mediaType: m.mediaType } : {}),
      ...(m.fileName ? { fileName: m.fileName } : {}),
      ...(Array.isArray(m.resources) && m.resources.length > 0
        ? {
            resources: m.resources.slice(0, 6).map((r) => ({
              title: String(r.title || "").slice(0, 140),
              url: String(r.url || "").slice(0, 500),
              ...(r.snippet ? { snippet: String(r.snippet).slice(0, 180) } : {}),
              kind: r.kind,
              ...(r.image ? { image: String(r.image).slice(0, 500) } : {}),
              ...(r.domain ? { domain: String(r.domain).slice(0, 100) } : {}),
              ...(r.duration ? { duration: String(r.duration).slice(0, 30) } : {}),
              ...(r.channel ? { channel: String(r.channel).slice(0, 80) } : {}),
              ...(r.isPdf ? { isPdf: true } : {}),
            })),
          }
        : {}),
    }));

  store.byCase[caseKey || "general"] = {
    messages: compactMsgs,
    updatedAt: new Date().toISOString(),
  };
  await persistThreadStore(supabase, email, store);
}

export async function clearTechThread(
  supabase: any,
  email: string,
  caseKey?: string
): Promise<void> {
  const store = await loadThreadStore(supabase, email);
  if (caseKey) {
    delete store.byCase[caseKey];
  } else {
    store.byCase = {};
  }
  await persistThreadStore(supabase, email, store);
}

// ── 4. HERRAMIENTAS EN VIVO (INVENTARIO, GARANTÍAS E HISTORIAL) ──

function extractSearchTerms(text: string): string[] {
  const stop = new Set([
    "como", "para", "este", "esta", "pero", "tiene", "tienen", "hay", "stock",
    "precio", "costo", "vale", "inventario", "disponible", "garantia", "boleta",
    "cliente", "equipo", "modelo", "marca", "cual", "cuanto", "cuantos", "donde",
    "sobre", "caso", "revisar", "buscar", "consulta", "puedes", "puede", "quiero",
    "necesito", "favor", "hola", "buenas", "dias", "tardes", "noches", "sekunet",
  ]);
  const tokens = String(text || "")
    .replace(/[^\p{L}\p{N}\-_.\s]/gu, " ")
    .split(/\s+/)
    .map((t) => t.trim())
    .filter((t) => t.length >= 3 && !stop.has(t.toLowerCase()));
  return Array.from(new Set(tokens)).slice(0, 5);
}

export function shouldQueryInventory(message: string): boolean {
  return /\b(inventario|stock|existencia|disponible|disponibles|precio|cuesta|vale|cotiza|cotizacion|cotización|reemplazo|sustituto|bodega|catalogo|catálogo|venden|vendemos|tienen)\b/i.test(
    message
  );
}

export function shouldQueryWarranties(message: string): boolean {
  return /\b(garant[ií]a|boleta|rma|factura|reclamo|reparaci[oó]n|taller|serie|historial|casos anteriores|ha escrito antes|otras veces)\b/i.test(
    message
  );
}

export async function queryInventoryForAssistant(
  supabase: any,
  queryText: string,
  primaryBrand?: string,
  primaryModel?: string
): Promise<string> {
  try {
    const terms = extractSearchTerms(`${primaryModel || ""} ${queryText}`);
    const searchToken = primaryModel || terms[0] || primaryBrand || "";
    if (!searchToken) return "";

    const safe = searchToken.replace(/[,%()]/g, "").trim();
    if (!safe) return "";

    const { data, error } = await supabase
      .from("sek_inventario")
      .select("*")
      .or(`nombre.ilike.%${safe}%,modelo.ilike.%${safe}%,marca.ilike.%${safe}%`)
      .limit(10);

    if (error || !Array.isArray(data) || data.length === 0) {
      if (primaryBrand && safe !== primaryBrand) {
        const { data: brandData } = await supabase
          .from("sek_inventario")
          .select("*")
          .ilike("marca", `%${primaryBrand}%`)
          .limit(8);
        if (!Array.isArray(brandData) || brandData.length === 0) return "";
        return formatInventoryRows(brandData);
      }
      return "";
    }
    return formatInventoryRows(data);
  } catch {
    return "";
  }
}

function formatInventoryRows(rows: any[]): string {
  return rows
    .slice(0, 8)
    .map((r) => {
      const name = r.nombre || r.descripcion || "Producto";
      const model = r.modelo ? ` | Modelo: ${r.modelo}` : "";
      const brand = r.marca ? ` | Marca: ${r.marca}` : "";
      const stockVal = r.stock ?? r.cantidad ?? r.existencia;
      const stock = stockVal !== undefined && stockVal !== null ? ` | Stock: ${stockVal}` : "";
      const priceVal = r.precio ?? r.precio_venta;
      const price = priceVal !== undefined && priceVal !== null ? ` | Precio: ${priceVal}` : "";
      const cat = r.categoria ? ` | Cat: ${r.categoria}` : "";
      return `• ${name}${model}${brand}${cat}${stock}${price}`;
    })
    .join("\n");
}

export async function queryWarrantiesAndClientHistory(
  supabase: any,
  opts: {
    queryText: string;
    phone?: string | null;
    clientName?: string | null;
    currentCaseId?: string | null;
    primaryModel?: string;
  }
): Promise<string> {
  const sections: string[] = [];

  // A. Casos anteriores del mismo teléfono en sek_cases
  try {
    const cleanPhone = String(opts.phone || "").replace(/[^0-9]/g, "");
    if (cleanPhone.length >= 8) {
      let q = supabase
        .from("sek_cases")
        .select("id, created_at, estado, marca, modelo, problema, resolucion, title")
        .ilike("customer_phone", `%${cleanPhone.slice(-8)}%`)
        .order("created_at", { ascending: false })
        .limit(6);
      if (opts.currentCaseId) {
        q = q.neq("id", opts.currentCaseId);
      }
      const { data: priorCases } = await q;
      if (Array.isArray(priorCases) && priorCases.length > 0) {
        const lines = priorCases.map((c: any) => {
          const fecha = c.created_at ? new Date(c.created_at).toLocaleDateString("es-CR") : "s/f";
          const eq = [c.marca, c.modelo].filter(Boolean).join(" ") || c.title || "Equipo no especificado";
          const res = c.resolucion ? ` | Resolución: ${String(c.resolucion).slice(0, 140)}` : "";
          return `• Caso #${String(c.id).slice(0, 8)} (${fecha}, ${c.estado}): ${eq} — ${String(c.problema || "Sin resumen").slice(0, 140)}${res}`;
        });
        sections.push(`Casos previos del cliente (${priorCases.length}):\n${lines.join("\n")}`);
      }
    }
  } catch {
    /* ignorar */
  }

  // B. Registros de garantías en proyecto Garantías
  try {
    const gClient = createGarantiasServiceClient();
    const terms = extractSearchTerms(opts.queryText);
    const boletaMatch = opts.queryText.match(/\b(?:boleta|rma|ticket)[\s#:.-]*([a-z0-9-]{3,20})/i);
    const searchVal =
      (boletaMatch && boletaMatch[1]) ||
      opts.primaryModel ||
      (opts.clientName && opts.clientName !== "No registrado" ? opts.clientName.split(" ")[0] : "") ||
      terms[0] ||
      "";

    if (searchVal) {
      const safe = searchVal.replace(/[,%()]/g, "").trim();
      if (safe.length >= 3) {
        const { data: garantias } = await gClient
          .from("garantias")
          .select("boleta, numero_consecutivo, tipo, estatus, nombre, marca, serie, numero_serie, falla, fecha_creacion, sede")
          .or(`nombre.ilike.%${safe}%,serie.ilike.%${safe}%,numero_serie.ilike.%${safe}%,boleta.ilike.%${safe}%,marca.ilike.%${safe}%`)
          .order("fecha_creacion", { ascending: false })
          .limit(6);

        if (Array.isArray(garantias) && garantias.length > 0) {
          const lines = garantias.map((g: any) => {
            const idLabel = g.boleta || (g.numero_consecutivo ? `#${g.numero_consecutivo}` : "s/n");
            const fecha = g.fecha_creacion ? new Date(g.fecha_creacion).toLocaleDateString("es-CR") : "s/f";
            return `• Boleta ${idLabel} (${fecha} | ${g.estatus || "sin estatus"} | ${g.sede || "sede n/a"}): ${g.nombre || "Cliente"} — ${g.marca || ""} ${g.serie || ""} (S/N: ${g.numero_serie || "n/a"}) — Falla: ${String(g.falla || "n/a").slice(0, 120)}`;
          });
          sections.push(`Registros de Garantías encontrados:\n${lines.join("\n")}`);
        }
      }
    }
  } catch {
    /* ignorar */
  }

  return sections.join("\n\n");
}

// ── 5. EJECUTOR DE ACCIONES SEGURAS SOBRE EL CASO ──

export async function executeTechCaseAction(
  supabase: any,
  input: {
    caseId: string;
    agentEmail: string;
    action: "add_note" | "update_equipment";
    noteText?: string;
    marca?: string;
    modelo?: string;
  }
): Promise<TechAppliedAction> {
  if (!input.caseId) {
    return { type: input.action, summary: "No hay caso abierto en pantalla.", ok: false };
  }

  if (input.action === "add_note") {
    const cleanNote = String(input.noteText || "").trim().slice(0, 2000);
    if (!cleanNote) {
      return { type: "add_note", summary: "La nota está vacía.", ok: false };
    }
    const { data: c } = await supabase
      .from("sek_cases")
      .select("id, histtecnico")
      .eq("id", input.caseId)
      .maybeSingle();

    if (!c) {
      return { type: "add_note", summary: "Caso no encontrado.", ok: false };
    }

    const entry = {
      role: "nota",
      author: input.agentEmail,
      text: cleanNote,
      time: new Date().toISOString(),
    };
    const prev = Array.isArray(c.histtecnico) ? c.histtecnico : [];
    const next = [...prev, entry];

    const { error } = await supabase
      .from("sek_cases")
      .update({ histtecnico: next })
      .eq("id", input.caseId);

    if (error) {
      return { type: "add_note", summary: `Error guardando nota: ${error.message}`, ok: false };
    }

    await broadcastCaseEvent({
      eventType: "UPDATE",
      action: "deltaEntry",
      caseId: input.caseId,
      delta: { col: "histtecnico", entry },
    });

    return {
      type: "add_note",
      summary: "Nota interna agregada al historial del caso.",
      ok: true,
    };
  }

  if (input.action === "update_equipment") {
    const patch: Record<string, string> = {};
    if (input.marca && input.marca.trim()) patch.marca = input.marca.trim().slice(0, 80);
    if (input.modelo && input.modelo.trim()) patch.modelo = input.modelo.trim().slice(0, 120);
    if (Object.keys(patch).length === 0) {
      return { type: "update_equipment", summary: "Sin marca ni modelo para actualizar.", ok: false };
    }

    const { error } = await supabase
      .from("sek_cases")
      .update(patch)
      .eq("id", input.caseId);

    if (error) {
      return { type: "update_equipment", summary: `Error actualizando equipo: ${error.message}`, ok: false };
    }

    await broadcastCaseEvent({
      eventType: "UPDATE",
      action: "meta",
      caseId: input.caseId,
      new: patch,
    });

    return {
      type: "update_equipment",
      summary: `Equipo actualizado (${[patch.marca, patch.modelo].filter(Boolean).join(" ")}).`,
      ok: true,
    };
  }

  return { type: input.action, summary: "Acción no soportada.", ok: false };
}

export function invalidateTechAssistantCaches() {
  cacheDelete(MEMORY_CACHE_KEY);
  cacheDelete(PERSONALITY_CACHE_KEY);
}
