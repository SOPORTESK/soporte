import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createClient as createServiceClient } from "@supabase/supabase-js";
import { analyzeMedia, transcribeAudio } from "@/lib/ai/vision";
import {
  generateText,
  getProviderConfigs,
  isModelCooledDown,
  markModelFailure,
  markModelSuccess,
} from "@/lib/ai/config";
import {
  getTechMemories,
  addTechMemory,
  deleteTechMemory,
  detectMemorySaveIntent,
  getTechPersonality,
  saveTechPersonality,
  getTechThread,
  saveTechThread,
  clearTechThread,
  shouldQueryInventory,
  shouldQueryWarranties,
  queryInventoryForAssistant,
  queryWarrantiesAndClientHistory,
  getClientPriorCasesSummary,
  executeTechCaseAction,
  type TechAppliedAction,
} from "@/lib/tech-assistant-agent";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

interface TechMessage {
  role: "user" | "assistant";
  content: string;
  time: string;
  mediaUrl?: string;
  mediaType?: string;
  fileName?: string;
}

interface FaultDomainDef {
  id: string;
  label: string;
  webSearchHint: string;
  strongPhrases: string[];
  keywords: string[];
}

const FAULT_DOMAINS: FaultDomainDef[] = [
  {
    id: "almacenamiento_grabacion",
    label: "Almacenamiento, Disco Duro y Grabación",
    webSearchHint: "disco duro hdd no graba reproduccion formatear almacenamiento solucion",
    strongPhrases: [
      "disco duro",
      "no graba",
      "ver las grabaciones",
      "ver grabaciones",
      "horario de grabacion",
      "horario de grabación",
      "record schedule",
      "gestion de disco",
      "gestión de disco",
      "linea de tiempo",
      "línea de tiempo",
      "sistema de archivos",
      "estructura de archivos",
      "formatear",
      "sonido anormal",
      "clac clac",
      "sin disco duro",
    ],
    keywords: [
      "disco",
      "hdd",
      "sata",
      "almacenamiento",
      "storage",
      "grabacion",
      "grabación",
      "grabaciones",
      "reproduccion",
      "reproducción",
      "reproducir",
      "formateo",
      "formato",
      "cuota",
      "cuotas",
      "quota",
      "corrupcion",
      "corrupción",
      "capacidad",
      "sobrescribir",
    ],
  },
  {
    id: "reset_credenciales",
    label: "Restablecimiento de Contraseña y Desvinculación",
    webSearchHint: "restablecer contraseña reset archivo xml codigo qr desvincular sadp",
    strongPhrases: [
      "restablecer la contraseña",
      "restablecer contraseña",
      "reset de contraseña",
      "reset_contrasena",
      "olvido la contraseña",
      "olvidó la contraseña",
      "no tenemos las contraseñas",
      "no tiene la contraseña",
      "perdio la contraseña",
      "archivo xml",
      "exportar xml",
      "codigo qr",
      "código qr",
      "desvincular cuenta",
      "desvincular dispositivo",
      "equipo vinculado",
      "boton de reset",
      "botón de reset",
      "borrar la ip",
    ],
    keywords: [
      "reset",
      "resetear",
      "restablecer",
      "restablecimiento",
      "desvincular",
      "desvinculacion",
      "desvinculación",
      "xml",
      "sadp",
      "bloqueado",
      "inactivo",
    ],
  },
  {
    id: "video_imagen",
    label: "Falla de Video, Señal e Imagen",
    webSearchHint: "no da video sin señal pantalla negra canales camara dvr solucion",
    strongPhrases: [
      "no da video",
      "sin video",
      "pantalla negra",
      "no muestra imagen",
      "sin señal",
      "no da imagen",
      "video loss",
      "imagen congelada",
      "lineas en la imagen",
      "líneas en la imagen",
      "bajar la resolucion",
      "bajar la resolución",
    ],
    keywords: [
      "video",
      "imagen",
      "señal",
      "balun",
      "bnc",
      "utp",
      "coaxial",
      "parpadea",
      "borrosa",
      "interferencia",
      "resolucion",
      "resolución",
      "tvvi",
      "hdcvi",
      "ahd",
      "cvbs",
    ],
  },
  {
    id: "red_conectividad",
    label: "Red, Conectividad IP, PoE y Hik-Connect",
    webSearchHint: "offline desconectado red ip poe puertos hik-connect configuracion",
    strongPhrases: [
      "fuera de linea",
      "fuera de línea",
      "hik-connect",
      "hikconnect",
      "codigo de verificacion",
      "código de verificación",
      "conflicto de ip",
      "direccion ip",
      "dirección ip",
      "no conecta a la red",
      "sin acceso a internet",
      "puertos poe",
    ],
    keywords: [
      "offline",
      "desconectado",
      "p2p",
      "dhcp",
      "subred",
      "estatica",
      "estática",
      "gateway",
      "puerta de enlace",
      "dns",
      "ping",
      "poe",
      "switch",
      "router",
      "vlan",
      "nat",
      "winbox",
    ],
  },
  {
    id: "intercom_acceso_biometria",
    label: "Control de Acceso, Videoporteros y Biometría",
    webSearchHint: "control de acceso videoportero biometrico cerradura rele conexion",
    strongPhrases: [
      "video portero",
      "videoportero",
      "frente de calle",
      "pantalla interior",
      "control de acceso",
      "controladora",
      "reloj marcador",
      "terminal de asistencia",
      "4 hilos",
      "cerradura electrica",
      "cerradura magnética",
      "electroiman",
    ],
    keywords: [
      "biometrico",
      "biométrico",
      "huella",
      "facial",
      "zkbio",
      "biotime",
      "cerradura",
      "llavin",
      "llavín",
      "rele",
      "relé",
      "bornera",
      "borneras",
      "wiegand",
      "rs485",
      "apertura",
      "timbre",
    ],
  },
  {
    id: "alarma_incendio_sensores",
    label: "Sistemas de Alarma, Sensores y Detección de Incendio",
    webSearchHint: "panel alarma sensores zonas configuracion fallo solucion",
    strongPhrases: [
      "panel de alarma",
      "alarma de incendio",
      "sensor de movimiento",
      "contacto magnetico",
      "contacto magnético",
      "falsa alarma",
      "llave usb",
    ],
    keywords: [
      "alarma",
      "alarmas",
      "sensor",
      "sensores",
      "zona",
      "zonas",
      "particion",
      "partición",
      "sirena",
      "teclado",
      "pir",
      "humo",
      "simplex",
      "sinplex",
      "4007",
      "ax pro",
      "axpro",
      "ax-pro",
      "teclado",
      "relay",
      "relé",
      "salida de rele",
      "codigo de usuario",
      "código de usuario",
    ],
  },
  {
    id: "firmware_software_licencias",
    label: "Firmware, Software VMS y Licencias",
    webSearchHint: "actualizacion firmware ivms-4200 hikcentral smartpss licencia",
    strongPhrases: [
      "actualizar firmware",
      "actualización de firmware",
      "version de firmware",
      "versión de firmware",
      "ivms-4200",
      "ivms 4200",
      "software de monitoreo",
      "activacion de licencia",
      "activación de licencia",
    ],
    keywords: [
      "firmware",
      "digicap",
      "actualizar",
      "actualizacion",
      "actualización",
      "desactualizado",
      "ivms",
      "hikcentral",
      "smartpss",
      "configtool",
      "licencia",
      "licencias",
    ],
  },
  {
    id: "energia_hardware_pitido",
    label: "Energía, UPS, Hardware y Alertas Sonoras",
    webSearchHint: "no enciende pitido beep fuente alimentacion ups bateria falla",
    strongPhrases: [
      "no enciende",
      "equipo no enciende",
      "deje de pitar",
      "pitido constante",
      "fuente de poder",
      "fuente de alimentacion",
    ],
    keywords: [
      "pitido",
      "pitar",
      "beep",
      "campanita",
      "excepcion",
      "excepción",
      "ups",
      "bateria",
      "batería",
      "voltaje",
      "amperaje",
      "corto",
      "quemado",
    ],
  },
];

interface IndexedPrecedent {
  id: string;
  shortId: string;
  brand: string;
  model: string;
  equipmentLabel: string;
  faultSummary: string;
  solutionText: string;
  resolverName: string;
  searchCorpus: string;
  domainScores: Record<string, number>;
  primaryDomain: string;
  closedAt: string;
  confirmationReason: string;
}

const SUCCESS_CONFIRMATION_PATTERNS = [
  /ya\s+(funcion[oó]|sirvi[oó]|conect[oó]|levant[oó]|qued[oó]|pude|dio\s+video|lo\s+reconoci[oó]|entré|ingresé|resolv[ií])/i,
  /qued[oó]\s+(listo|perfecto|bien|resuelto|excelente|operativo)/i,
  /con\s+eso\s+(qued[oó]|se\s+arregl[oó]|se\s+solucion[oó]|funcion[oó]|sirvi[oó])/i,
  /(era\s+eso|eso\s+era|ya\s+quedo|ya\s+quedó|listo\s+muchas\s+gracias|listo\s+gracias|perfecto\s+gracias|excelente\s+gracias)/i,
  /(much[ií]simas\s+gracias|mil\s+gracias|muy\s+amable\s+gracias|agradezco\s+mucho|le\s+agradezco\s+la\s+ayuda|agradecido)/i,
  /ya\s+pude\s+(ingresar|entrar|configurar|conectar|verlo|activarlo|resetear)/i,
  /me\s+sirvi[oó]\s+mucho|me\s+ayud[oó]\s+bastante/i,
];

const FAILURE_OR_COMPLAINT_PATTERNS = [
  /no\s+(sirvi[oó]|funcion[oó]|pude|conecta|da\s+video|reconoce)/i,
  /sigue\s+(igual|sin\s+funcionar|sin\s+dar|con\s+el\s+error|fallando)/i,
  /p[eé]simo|terrible|muy\s+mal|no\s+me\s+ayudaron|no\s+me\s+sirvi[oó]/i,
];

const ABANDONMENT_CLOSURE_PATTERNS =
  /debido\s+a\s+que\s+no\s+hemos\s+recibido\s+respuesta|cerrad[oa]\s+por\s+inactividad|cerrad[oa]\s+por\s+falta\s+de\s+respuesta/i;

interface IndexedDocChunk {
  id: string | number;
  doc_name: string;
  content: string;
  searchCorpus: string;
}

let fullDbIndexCache: {
  timestamp: number;
  precedents: IndexedPrecedent[];
  docChunks: IndexedDocChunk[];
} | null = null;

const CACHE_TTL_MS = 4 * 60 * 60 * 1000; // 4 horas en memoria para minimizar PostgREST Egress

function isBoilerplateOrFileMessage(text?: string | null): boolean {
  if (!text || typeof text !== "string") return true;
  const t = text.trim();
  if (t.length < 22) return true;
  if (/^(nota-voz-[\w.-]+|image\.\w+|[\w-]+\.(webm|ogg|mp3|wav|jpg|jpeg|png|gif|pdf|zip|rar))$/i.test(t)) {
    return true;
  }
  const l = t.toLowerCase();
  if (
    l.includes("para servirle, procedo a cerrar") ||
    l.includes("procedo a cerrar el chat") ||
    l.includes("procederemos a cerrar esta conversación") ||
    l.includes("al no haber recibido respuesta") ||
    l.includes("cerrado por inactividad") ||
    l.includes("el cliente inicia la conversación") ||
    l.includes("inicio de conversación") ||
    l.includes("saludando, sin llegar a mencionar") ||
    l.includes("quedo a la espera") ||
    l.includes("queda a la espera") ||
    l.includes("sin interacción") ||
    l.includes("no se detallan fallas") ||
    l.includes("sin equipo ni modelo") ||
    l.includes("bienvenido al soporte") ||
    l.includes("gracias por contactarnos") ||
    l.includes("para el registro, por favor") ||
    l.includes("marca y modelo del equipo a consultar") ||
    l.includes("nombre del vendedor encargado") ||
    l.includes("ha sido un placer atenderle") ||
    l.includes("cerramos la conversación") ||
    l.includes("algo mas en lo que te pueda ayudar") ||
    l.includes("algo más en lo que le pueda ayudar") ||
    l.includes("podría brindarnos más detalles sobre su consulta") ||
    l.includes("mucho gusto le atiende") ||
    l.includes("en que le puedo colaborar") ||
    l.includes("en qué le puedo colaborar") ||
    l.includes("me indica su nombre") ||
    l.includes("me regala su nombre")
  ) {
    return true;
  }
  return false;
}

// Elimina las líneas de plantilla (ej. "Para el registro, por favor indiquenos:") pero conserva las respuestas reales del cliente
function stripTemplateLines(text?: string | null): string {
  if (!text || typeof text !== "string") return "";
  return text
    .split(/\n+/)
    .map((line) =>
      line
        .replace(/para el registro,?\s*por favor ind[ií]quenos:?/gi, "")
        .replace(/-?\s*marca y modelo del equipo a consultar:?/gi, "")
        .replace(/-?\s*motivo de la consulta o solicitud:?/gi, "")
        .replace(/-?\s*nombre del vendedor encargado de su cuenta:?/gi, "")
        .replace(/con esta informaci[oó]n podremos brindarle una atenci[oó]n m[aá]s precisa\.?/gi, "")
        .trim()
    )
    .filter((l) => l.length >= 3)
    .join(" ")
    .trim();
}

function isClientQuestionSummary(text?: string | null): boolean {
  if (!text || typeof text !== "string") return true;
  const t = text.trim();
  if (/soluci[oó]n:|se recomienda|se indic[oó]|se brind[oó]|se realiz[oó]|debe reemplazar|bajar la resoluci[oó]n/i.test(t)) {
    return false;
  }
  return /^(el cliente consulta|cliente consulta|el cliente solicita|cliente solicita|consulta sobre|solicitud de|inicio de conversaci[oó]n)/i.test(
    t
  );
}

function isGenericCaseTitle(title?: string | null): boolean {
  if (!title || typeof title !== "string") return true;
  const t = title.trim();
  if (t.length < 8) return true;
  return /^(whatsapp|configuraciones|configuraci[oó]n|consulta|soporte|firmware|reparaci[oó]n\s*\/?\s*diagn[oó]stico|garant[ií]a|reset|aver[ií]a|sin asunto)(\s*[—–-].*)?$/i.test(
    t
  );
}

function computeDomainScores(rawText: string): { scores: Record<string, number>; primaryDomain: string } {
  // Neutralizar frases incidentales de login ("ingrese con su usuario y contraseña") para que no disparen falsos positivos de reset de contraseña
  const sanitized = (rawText || "")
    .toLowerCase()
    .replace(/usuario\s+y\s+contrase[ñn]a(\s+de\s+administrador)?/g, "credenciales de acceso")
    .replace(/ingrese\s+(la\s+)?contrase[ñn]a/g, "ingrese credencial");

  const scores: Record<string, number> = {};
  let bestDomain = "";
  let bestScore = 0;

  for (const dom of FAULT_DOMAINS) {
    let sc = 0;
    for (const phrase of dom.strongPhrases) {
      if (sanitized.includes(phrase)) {
        sc += 35;
      }
    }
    for (const kw of dom.keywords) {
      const regex = new RegExp(`\\b${kw.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}`, "gi");
      const matches = sanitized.match(regex);
      if (matches && matches.length > 0) {
        sc += Math.min(matches.length, 3) * 14;
      }
    }
    scores[dom.id] = sc;
    if (sc > bestScore) {
      bestScore = sc;
      bestDomain = dom.id;
    }
  }

  return { scores, primaryDomain: bestScore >= 14 ? bestDomain : "" };
}

function extractValidHardwareModels(text: string): string[] {
  if (!text) return [];
  const cleanText = text
    .replace(/nota-voz-[\w.-]+/gi, " ")
    .replace(/\bfe\/\d{4}\/\d+\b/gi, " ")
    .replace(/\b\d{1,2}\/\d{1,2}\/\d{2,4}\b/g, " ")
    .replace(/\bv\d+\.\d+[\w.-]*\b/gi, " ")
    .replace(/\b300\d{5,}(?:\/\d+)?\b/g, " ")
    .replace(/\b\d{6,}\b/g, " ");
  const rawMatches =
    cleanText.match(
      /\b((?:hik-)?[a-z]{1,4}[-][a-z0-9\/-]+|[a-z]{1,4}\d{2,5}[a-z0-9\/-]*|ivms-?\d+|hikcentral|smartpss|biotime|zkbio|configtool|sadp)\b/gi
    ) || [];

  const FALSE_POSITIVES = new Set([
    "ip67",
    "h265",
    "h264",
    "5mp",
    "2mp",
    "3mp",
    "4mp",
    "8mp",
    "30mts",
    "20mts",
    "10mts",
    "5in1",
    "a-ha",
    "5-in-1",
    "24-horas",
    "dd-mm-aaaa",
    "40365-h",
    "11-97",
    "13-97",
    "14-97",
    "1-2000",
    "2-2000",
  ]);

  const valid = new Set<string>();
  for (const m of rawMatches) {
    let lower = m.trim().toLowerCase().replace(/[),.;:]+$/, "");
    if (lower.length < 4 || FALSE_POSITIVES.has(lower)) continue;
    if (/^m0000/i.test(lower)) continue;
    if (/^\d+[-/]\d+/.test(lower)) continue;
    if (/^\d+(?:mp|mts?|mm|gb|tb|ch|hdd|hz|v|a|w)$/i.test(lower)) continue;
    if (["http", "https", "jpeg", "webm", "html", "case", "auto", "json", "hora", "nota", "para", "como", "este"].some((w) => lower.startsWith(w))) {
      continue;
    }

    // Normalizar confusiones OCR frecuentes ("O" -> "0" en modelos Hikvision como DS-2CE16DOT-LXTS)
    if (/^(?:hik-)?(?:ids-|ds-)/.test(lower)) {
      lower = lower.replace(/(\d[a-z]{0,2})o(t(?:\b|-)|\d)/gi, "$10$2");
    }

    const isKnownSoftware = /^(ivms|hikcentral|smartpss|biotime|zkbio|configtool|sadp)/.test(lower);
    const hasLetterAndDigit = /[a-z]/i.test(lower) && /\d/.test(lower);
    if (isKnownSoftware || hasLetterAndDigit) {
      valid.add(lower);
    }
  }

  const list = [...valid];
  const hasRealHqhiDvr = list.some((m) => /^(?:hik-)?ids-7\d{2,3}(?:hqhi|hghi|huhi)/i.test(m));
  const filtered = list.filter((m) => {
    if (hasRealHqhiDvr && /^ios-7\d{2}(?:hqhi|hghi|huhi)/i.test(m)) return false;
    return true;
  });

  const modelPriority = (m: string): number => {
    if (/^(?:hik-)?(?:ids-|ds-2ce|ds-2cd|ds-7\d|xvr|nvr|dvr|dh-|dhi-|ipc-|ds-k|ax-|uap-|rb\d)/i.test(m)) return 100;
    if (/^(?:ivms|hikcentral|smartpss|biotime|zkbio|configtool|sadp)/.test(m)) return 10;
    return 50;
  };

  return filtered.sort((a, b) => modelPriority(b) - modelPriority(a));
}

async function getFullKnowledgeAndCasesIndex(serviceClient: any): Promise<{
  precedents: IndexedPrecedent[];
  docChunks: IndexedDocChunk[];
}> {
  if (fullDbIndexCache && Date.now() - fullDbIndexCache.timestamp < CACHE_TTL_MS) {
    return {
      precedents: fullDbIndexCache.precedents,
      docChunks: fullDbIndexCache.docChunks,
    };
  }

  const selectCols =
    "id, title, marca, modelo, problema, resolucion, assigned_to, closed_at, cliente, histcliente, histtecnico, es_test, calificacion";

  const [batch1, agentsRes, chunksRes1] = await Promise.all([
    serviceClient
      .from("sek_cases")
      .select(selectCols)
      .in("estado", ["cerrado", "resuelto"])
      .order("closed_at", { ascending: false })
      .limit(600),
    serviceClient.from("sek_agent_config").select("email, nombre, apellido"),
    serviceClient.from("sek_doc_chunks").select("id, doc_name, content").range(0, 499),
  ]);

  // Paginar sek_doc_chunks en lotes de 500 (hasta 2500 chunks) dentro de la caché de 5 min para no omitir manuales recientes
  let allDocChunks: any[] = Array.isArray(chunksRes1.data) ? [...chunksRes1.data] : [];
  if (allDocChunks.length === 500) {
    for (let offset = 500; offset < 2500; offset += 500) {
      const { data: extraChunks } = await serviceClient
        .from("sek_doc_chunks")
        .select("id, doc_name, content")
        .range(offset, offset + 499);
      if (!Array.isArray(extraChunks) || extraChunks.length === 0) break;
      allDocChunks.push(...extraChunks);
      if (extraChunks.length < 500) break;
    }
  }
  const chunksRes = { data: allDocChunks };

  const agentNameByEmail = new Map<string, string>();
  if (Array.isArray(agentsRes.data)) {
    for (const ag of agentsRes.data) {
      const fullName = [ag.nombre, ag.apellido].filter(Boolean).join(" ").trim();
      if (ag.email && fullName) {
        agentNameByEmail.set(String(ag.email).toLowerCase().trim(), fullName);
      }
    }
  }

  const allClosedCases = [...(batch1.data || [])];
  const seenCaseIds = new Set<string>();
  const precedents: IndexedPrecedent[] = [];

  for (const c of allClosedCases) {
    if (!c?.id || seenCaseIds.has(c.id)) continue;
    seenCaseIds.add(c.id);

    // 0. Filtro estricto: Solo casos con confirmación comprobada del cliente de que el soporte fue útil
    if (c.es_test) continue;

    const ht = Array.isArray(c.histtecnico) ? c.histtecnico : [];
    const hc = Array.isArray(c.histcliente) ? c.histcliente : [];
    const cli = typeof c.cliente === "object" && c.cliente ? c.cliente : {};

    // Descartar si el caso cerró por falta de respuesta / inactividad del cliente
    const lastTechMsgs = ht.filter((m: any) => m && m.content).map((m: any) => String(m.content));
    if (lastTechMsgs.slice(-2).some((txt: string) => ABANDONMENT_CLOSURE_PATTERNS.test(txt))) {
      continue;
    }

    const clientRating = Number(c.calificacion || cli.calificacion_agente) || 0;
    if (clientRating > 0 && clientRating <= 2) {
      continue; // Descartar si hubo mala calificación o queja
    }

    const clientTexts = hc
      .filter((m: any) => m && m.content && typeof m.content === "string")
      .map((m: any) => String(m.content).trim());
    const clientTail = clientTexts.slice(-5).join(" ");

    // Descartar si el cliente reportó fallo o queja al final
    if (FAILURE_OR_COMPLAINT_PATTERNS.some((re) => re.test(clientTail))) {
      continue;
    }

    let confirmationReason = "";
    if (clientRating >= 4 && clientTexts.length > 0) {
      confirmationReason = `Calificación de satisfacción: ${clientRating} estrellas`;
    } else {
      for (const re of SUCCESS_CONFIRMATION_PATTERNS) {
        const match = clientTail.match(re);
        if (match) {
          confirmationReason = `Confirmación del cliente: "${match[0]}"`;
          break;
        }
      }
    }

    // Regla de oro: si el cliente no confirmó que le sirvió la solución, NO se toma como precedente
    if (!confirmationReason) continue;

    const clienteDesc = cli.descripcion ? String(cli.descripcion).trim() : "";

    // 1. Extraer respuestas técnicas reales (excluyendo preguntas cortas, saludos y nombres de archivos)
    const techSubstantiveMsgs = ht
      .filter((m: any) => {
        if (!m?.content || typeof m.content !== "string") return false;
        if (m.role === "ia" || m.role === "nota") return false;
        const txt = m.content.trim();
        if (isBoilerplateOrFileMessage(txt)) return false;
        if (txt.endsWith("?") && txt.length < 95) return false;
        return txt.length >= 28;
      })
      .map((m: any) => String(m.content).trim());

    const rawRes = String(c.resolucion || "").trim();
    const hasRealResolucionCol =
      rawRes.length >= 30 && !isBoilerplateOrFileMessage(rawRes) && !isClientQuestionSummary(rawRes);

    let solutionText = "";
    if (hasRealResolucionCol) {
      solutionText = rawRes;
      if (techSubstantiveMsgs.length > 0 && rawRes.length < 150) {
        const extra = techSubstantiveMsgs.slice(-2).join(" | ");
        if (!extra.includes(rawRes)) {
          solutionText = `${rawRes} | ${extra}`;
        }
      }
    } else if (techSubstantiveMsgs.length > 0) {
      solutionText = techSubstantiveMsgs.slice(-3).join(" | ");
    }

    // Descartar casos donde no quedó ninguna solución técnica escrita (ej. solo notas de voz sin transcribir o casos abandonados)
    if (!solutionText || solutionText.length < 30) continue;

    // 2. Construir un resumen limpio y real de la falla (nunca "Configuraciones — HIKVISION" ni "WhatsApp — ...")
    const clientSubstantiveMsgs = hc
      .filter(
        (m: any) =>
          m?.content &&
          typeof m.content === "string" &&
          String(m.content).trim().length > 18 &&
          !isBoilerplateOrFileMessage(m.content)
      )
      .map((m: any) => String(m.content).trim());

    const rawTitle = String(c.title || "").trim();
    const rawProblema = String(c.problema || "").trim();
    const isGenericProblema =
      !rawProblema ||
      [
        "configuracion",
        "configuración",
        "consulta",
        "soporte",
        "ayuda",
        "revision",
        "revisión",
        "garantia",
        "garantía",
        "avería",
        "averia",
        "reset_contrasena",
        "licencias",
      ].includes(rawProblema.toLowerCase());

    let faultSummary = "";
    if (!isGenericCaseTitle(rawTitle)) {
      faultSummary = rawTitle;
    } else if (clienteDesc && !isBoilerplateOrFileMessage(clienteDesc)) {
      faultSummary = clienteDesc.split(/[.\n]/)[0];
    } else if (isClientQuestionSummary(rawRes) && !isBoilerplateOrFileMessage(rawRes)) {
      faultSummary = rawRes.split(/[.\n]/)[0];
    } else if (!isGenericProblema && rawProblema.length > 10) {
      faultSummary = rawProblema;
    } else if (hasRealResolucionCol) {
      faultSummary = rawRes.split(/[.\n]/)[0];
    } else if (clientSubstantiveMsgs.length > 0) {
      faultSummary = clientSubstantiveMsgs[0].split(/[.\n]/)[0];
    } else {
      faultSummary = solutionText.split(/[.\n|]/)[0];
    }

    faultSummary = faultSummary
      .replace(/^(el cliente consulta|cliente consulta|el cliente solicita|cliente solicita|consulta sobre|solicitud de)\s*/i, "")
      .replace(/\s+/g, " ")
      .trim();

    if (faultSummary.length > 0) {
      faultSummary = faultSummary.charAt(0).toUpperCase() + faultSummary.slice(1);
    }
    if (faultSummary.length > 92) {
      faultSummary = faultSummary.substring(0, 89).trim() + "...";
    }

    // 3. Extraer marca y modelo reales
    const rawBrand = String(c.marca || cli.marca || "").trim();
    const rawModel = String(c.modelo || cli.modelo || cli.equipo || "").trim();
    const cleanModel = /^m0000|no especificado/i.test(rawModel) ? "" : rawModel;

    let equipmentLabel = `${rawBrand} ${cleanModel}`.trim();
    if (!equipmentLabel) {
      const combinedText = `${faultSummary} ${solutionText}`;
      const detectedBrand = [
        "Hikvision",
        "Dahua",
        "ZKTeco",
        "Ezviz",
        "HiLook",
        "MikroTik",
        "Ubiquiti",
        "Imou",
        "DSC",
        "Paradox",
        "Uniview",
        "Epcom",
        "Simplex",
      ].find((b) => combinedText.toLowerCase().includes(b.toLowerCase()));
      equipmentLabel = detectedBrand || "Soporte Sekunet";
    }

    // 4. Extraer nombre real del técnico que resolvió
    const lastTecAuthor = ht
      .filter(
        (m: any) =>
          m?.author &&
          typeof m.author === "string" &&
          m.author !== "Soporte Sekunet" &&
          !m.author.toLowerCase().includes("sistema") &&
          !m.author.toLowerCase().includes("asistente")
      )
      .slice(-1)[0]?.author;

    let resolverName = lastTecAuthor ? String(lastTecAuthor).trim() : "";
    if (!resolverName && c.assigned_to) {
      const emailKey = String(c.assigned_to).toLowerCase().trim();
      resolverName = agentNameByEmail.get(emailKey) || emailKey.split("@")[0];
    }
    if (!resolverName) {
      resolverName = "Taller Sekunet";
    }

    const searchCorpus = `${rawBrand} ${cleanModel} ${faultSummary} ${solutionText} ${clienteDesc} ${clientSubstantiveMsgs.slice(0, 2).join(" ")}`.toLowerCase();
    const { scores: domainScores, primaryDomain } = computeDomainScores(`${faultSummary} ${solutionText} ${clienteDesc}`);

    precedents.push({
      id: c.id,
      shortId: String(c.id).substring(0, 8),
      brand: rawBrand.toLowerCase(),
      model: cleanModel.toLowerCase(),
      equipmentLabel,
      faultSummary,
      solutionText,
      resolverName,
      searchCorpus,
      domainScores,
      primaryDomain,
      closedAt: c.closed_at || "",
      confirmationReason,
    });
  }

  const docChunks: IndexedDocChunk[] = (chunksRes.data || []).map((d: any) => ({
    id: d.id,
    doc_name: String(d.doc_name || "Manual Técnico Sekunet").trim(),
    content: String(d.content || "").trim(),
    searchCorpus: `${d.doc_name || ""} ${d.content || ""}`.toLowerCase(),
  }));

  fullDbIndexCache = {
    timestamp: Date.now(),
    precedents,
    docChunks,
  };

  console.log(
    `[tech-assistant] Índice verificado cargado: ${precedents.length} casos con solución técnica real (de ${allClosedCases.length} cerrados) y ${docChunks.length} bloques de manuales.`
  );

  return { precedents, docChunks };
}

async function authenticateTechUser() {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user?.email) {
    return { error: NextResponse.json({ error: "No autenticado" }, { status: 401 }) };
  }
  const { data: agent } = await supabase
    .from("sek_agent_config")
    .select("email")
    .ilike("email", user.email)
    .maybeSingle();
  if (!agent) {
    return { error: NextResponse.json({ error: "Acceso denegado" }, { status: 403 }) };
  }
  const serviceClient = createServiceClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );
  return { user, serviceClient };
}

export async function GET(req: NextRequest) {
  try {
    const auth = await authenticateTechUser();
    if ("error" in auth) return auth.error;
    const { user, serviceClient } = auth;

    const caseIdParam = new URL(req.url).searchParams.get("case_id") || "general";
    const [thread, memories, personality] = await Promise.all([
      getTechThread(serviceClient, user.email!, caseIdParam),
      getTechMemories(serviceClient),
      getTechPersonality(serviceClient),
    ]);

    return NextResponse.json({
      ok: true,
      thread,
      memories,
      personality,
    });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || "Error inesperado" }, { status: 500 });
  }
}

export async function PATCH(req: NextRequest) {
  try {
    const auth = await authenticateTechUser();
    if ("error" in auth) return auth.error;
    const { user, serviceClient } = auth;

    const body = await req.json();
    if (body.kind === "memory_add") {
      const res = await addTechMemory(serviceClient, {
        text: body.text,
        category: body.category,
        author: user.email!,
      });
      return NextResponse.json(res);
    }
    if (body.kind === "memory_delete") {
      const res = await deleteTechMemory(serviceClient, String(body.id || ""));
      return NextResponse.json(res);
    }
    if (body.kind === "personality") {
      const res = await saveTechPersonality(serviceClient, {
        customInstructions: body.customInstructions,
        tone: body.tone,
        updatedBy: user.email!,
      });
      return NextResponse.json(res);
    }
    return NextResponse.json({ error: "Operación no soportada" }, { status: 400 });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || "Error inesperado" }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const auth = await authenticateTechUser();
    if ("error" in auth) return auth.error;
    const { user, serviceClient } = auth;

    const caseIdParam = new URL(req.url).searchParams.get("case_id") || undefined;
    await clearTechThread(serviceClient, user.email!, caseIdParam);
    return NextResponse.json({ ok: true });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || "Error inesperado" }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const { message, case_id, messages: clientMessages, mediaUrl, mediaType, fileName, action, displayMessage, executeAction } = await req.json();

    if (
      !executeAction &&
      (!message || typeof message !== "string" || !message.trim()) &&
      (!mediaUrl || typeof mediaUrl !== "string") &&
      action !== "draft_client_reply"
    ) {
      return NextResponse.json({ error: "Mensaje o adjunto requerido" }, { status: 400 });
    }

    const messages: TechMessage[] = Array.isArray(clientMessages) ? (clientMessages as TechMessage[]) : [];

    const auth = await authenticateTechUser();
    if ("error" in auth) return auth.error;
    const { user, serviceClient } = auth;

    if (executeAction && typeof executeAction === "object") {
      const targetId = typeof case_id === "string" ? case_id.replace(/^case:/i, "").trim() : "";
      const applied = await executeTechCaseAction(serviceClient, {
        caseId: targetId,
        agentEmail: user.email!,
        action: executeAction.type,
        noteText: executeAction.noteText,
        marca: executeAction.marca,
        modelo: executeAction.modelo,
      });
      return NextResponse.json({ ok: applied.ok, appliedAction: applied });
    }

    // ── 1. Resolución inteligente del caso abierto en pantalla ──
    let targetCase: any = null;
    let validCaseId: string | null = null;

    if (case_id) {
      let cleanId = String(case_id).trim();
      while (cleanId.startsWith("case:")) {
        cleanId = cleanId.substring(5).trim();
      }

      const isPhoneTarget = cleanId.startsWith("tel:") || /^\+?\d{8,15}$/.test(cleanId);
      if (isPhoneTarget) {
        const phone = cleanId.startsWith("tel:") ? cleanId.substring(4).trim() : cleanId;
        const { data: casesForPhone } = await serviceClient
          .from("sek_cases")
          .select("id, estado, created_at, canal, customer_phone, cliente, histcliente, histtecnico, title, marca, modelo, problema, resolucion")
          .ilike("customer_phone", `%${phone}%`)
          .order("created_at", { ascending: false })
          .limit(10);

        if (casesForPhone && casesForPhone.length > 0) {
          const openCase = casesForPhone.find((c) =>
            ["abierto", "escalado", "ia_atendiendo", "calificacion_pendiente"].includes(String(c.estado || "").toLowerCase())
          );
          if (openCase) {
            targetCase = openCase;
            validCaseId = openCase.id;
          } else {
            const caseWithContent = casesForPhone.find((c) => {
              const hc = Array.isArray(c.histcliente) ? c.histcliente : [];
              const ht = Array.isArray(c.histtecnico) ? c.histtecnico : [];
              return hc.some((m: any) => m.mediaUrl) || ht.some((m: any) => m.mediaUrl) || hc.length > 1;
            });
            targetCase = caseWithContent || casesForPhone[0];
            validCaseId = targetCase.id;
          }
        }
      } else {
        const { data: caseData } = await serviceClient
          .from("sek_cases")
          .select("id, estado, created_at, canal, customer_phone, cliente, histcliente, histtecnico, title, marca, modelo, problema, resolucion")
          .eq("id", cleanId)
          .maybeSingle();
        if (caseData) {
          targetCase = caseData;
          validCaseId = caseData.id;

          const currentEstado = String(caseData.estado || "").toLowerCase();
          const isCurrentClosed = currentEstado === "cerrado" || currentEstado === "resuelto";
          const histLen =
            (Array.isArray(caseData.histcliente) ? caseData.histcliente.length : 0) +
            (Array.isArray(caseData.histtecnico) ? caseData.histtecnico.length : 0);

          if ((isCurrentClosed || histLen <= 2) && caseData.customer_phone) {
            const cleanPhone = String(caseData.customer_phone).replace(/[^0-9]/g, "");
            if (cleanPhone.length >= 8) {
              const { data: siblingCases } = await serviceClient
                .from("sek_cases")
                .select("id, estado, created_at, canal, customer_phone, cliente, histcliente, histtecnico, title, marca, modelo, problema, resolucion")
                .ilike("customer_phone", `%${cleanPhone}%`)
                .order("created_at", { ascending: false })
                .limit(10);

              if (siblingCases && siblingCases.length > 0) {
                const openSibling = siblingCases.find((c) =>
                  ["abierto", "escalado", "ia_atendiendo", "calificacion_pendiente"].includes(String(c.estado || "").toLowerCase())
                );
                if (openSibling) {
                  targetCase = openSibling;
                  validCaseId = openSibling.id;
                } else if (histLen <= 2) {
                  const caseWithMore = siblingCases.find((c) => {
                    const count =
                      (Array.isArray(c.histcliente) ? c.histcliente.length : 0) +
                      (Array.isArray(c.histtecnico) ? c.histtecnico.length : 0);
                    return count > histLen;
                  });
                  if (caseWithMore) {
                    targetCase = caseWithMore;
                    validCaseId = caseWithMore.id;
                  }
                }
              }
            }
          }
        }
      }
    }

    // ── 2. Procesamiento y persistencia de adjuntos multimedia del caso ──
    let openCaseConversation = "";
    let substantiveOpenCaseText = "";
    let clienteData: any = {};
    let detectedArchitecture = "";
    let isAnalogCoaxCase = false;
    let detectedCaseModels: string[] = [];

    if (targetCase) {
      clienteData = typeof targetCase.cliente === "object" && targetCase.cliente ? targetCase.cliente : {};
      const histCliente = Array.isArray(targetCase.histcliente) ? targetCase.histcliente : [];
      const histTecnico = Array.isArray(targetCase.histtecnico) ? targetCase.histtecnico : [];

      const allMsgs = [...histCliente, ...histTecnico];
      const attachments = allMsgs.filter((m: any) => m.mediaUrl && typeof m.mediaUrl === "string");

      if (attachments.length > 0) {
        let changed = false;
        // Priorizar adjuntos pendientes de transcripción o análisis
        const pendingAttachments = attachments
          .filter((m: any) => !m.transcription && (!m._visionAnalysis || m._visionAnalysis.includes("[ANÁLISIS DE ADJUNTO NO DISPONIBLE")))
          .slice(-8);

        await Promise.allSettled(
          pendingAttachments.map(async (att) => {
            try {
              const isAudio = String(att.mediaType || "").includes("audio") || String(att.fileName || "").match(/\.(ogg|opus|mp3|m4a|wav)$/i);
              if (isAudio) {
                const transText = await transcribeAudio(att.mediaUrl, att.mediaType);
                if (transText) {
                  const analysis = `Transcripción de nota de voz: "${transText}"`;
                  const patch = (m: any) => (m.mediaUrl === att.mediaUrl ? { ...m, transcription: transText, _visionAnalysis: analysis } : m);
                  for (let i = 0; i < histCliente.length; i++) histCliente[i] = patch(histCliente[i]);
                  for (let i = 0; i < histTecnico.length; i++) histTecnico[i] = patch(histTecnico[i]);
                  changed = true;
                }
              } else {
                const result = await Promise.race([
                  analyzeMedia(att.mediaUrl, att.mediaType, att.content || "", att.fileName || "", 24000),
                  new Promise<null>((r) => setTimeout(() => r(null), 32000)),
                ]);
                if (result) {
                  const patch = (m: any) => (m.mediaUrl === att.mediaUrl ? { ...m, _visionAnalysis: result } : m);
                  for (let i = 0; i < histCliente.length; i++) histCliente[i] = patch(histCliente[i]);
                  for (let i = 0; i < histTecnico.length; i++) histTecnico[i] = patch(histTecnico[i]);
                  changed = true;
                }
              }
            } catch (err: any) {
              console.warn("[tech-assistant] Error analizando adjunto:", err?.message);
            }
          })
        );
        if (changed && validCaseId) {
          await serviceClient
            .from("sek_cases")
            .update({ histcliente: histCliente, histtecnico: histTecnico })
            .eq("id", validCaseId);
        }
      }

      // ── 3. Construir la transcripción cronológica completa de la conversación abierta ──
      const allEvents = [
        ...histCliente.map((m: any, idx: number) => {
          const ts = m.time ? new Date(m.time).getTime() : 0;
          return {
            ...m,
            speaker: "Cliente",
            time: m.time || "",
            _ts: isNaN(ts) ? 0 : ts,
            _seq: typeof m.seq === "number" ? m.seq : idx,
          };
        }),
        ...histTecnico.map((m: any, idx: number) => {
          const ts = m.time ? new Date(m.time).getTime() : 0;
          return {
            ...m,
            speaker: m.role === "ia" ? "Asistente Virtual" : m.author ? `Técnico (${m.author})` : "Técnico",
            time: m.time || "",
            _ts: isNaN(ts) ? 0 : ts,
            _seq: typeof m.seq === "number" ? m.seq : 10000 + idx,
          };
        }),
      ].sort((a, b) => {
        if (a._ts > 0 && b._ts > 0 && Math.abs(a._ts - b._ts) >= 120_000) {
          return a._ts - b._ts;
        }
        if (typeof a.seq === "number" && typeof b.seq === "number") {
          return a.seq - b.seq;
        }
        if (a._ts !== b._ts) return a._ts - b._ts;
        return a._seq - b._seq;
      });

      const REASONING_NOISE_RE =
        /^(?:the user wants a technical analysis|we need to analyze|we need to extract|we need to provide|let'?s re-read the prompt|let'?s look closer|wait,?\s*is there a problem|provide three sections|prob(?:able)? cause:\s*the camera is online)\b/i;
      const INVOICE_NOISE_RE =
        /^(?:esta factura se rige|autorizada mediante resoluciones|publicadas en la gaceta|no se aceptan devoluciones|el producto debe venir|todas los accesorios|vencido el plazo|mensual sin que esto|n[uú]mero de identificaci[oó]n fiscal|correo electr[oó]nico:|tel[eé]fono:|t[eé]rminos de pago|referencia de pago|condici[oó]n:|^\d{18,}$)/i;
      const HIGH_SIGNAL_VISION_RE =
        /\b(?:i?ds-[a-z0-9\/-]+|hik-ds-[a-z0-9\/-]+|dh-[a-z0-9\/-]+|ipc-[a-z0-9\/-]+|xvr\d+|nvr\d+|modelo|model:|marca|brand\b|sn:|serie|c[aá]mara|grabador|dvr|nvr|hvr|h[ií]brida|an[aá]log[ao]|hdtvi|hdcvi|ahd|cvbs|5\s*in\s*1|descripci[oó]n|no\s+soportado|not\s+supported|d[ií]a\s*\/?\s*noche|day\s*\/?\s*night|osd|ptz|wdr|luz\s+blanca|luz\s+suplementaria|sadp|hitools|ivms|offline|error|puerto|port\b|192\.168\.|10\.\d+\.|172\.\d+\.)/i;

      const sanitizeAndCompactVision = (raw: unknown, maxLen: number): string => {
        const cleaned = String(raw || "")
          .replace(/^[-*_]{3,}$/gm, "")
          .replace(/^#{1,6}\s*/gm, "")
          .replace(/\*{1,3}/g, "")
          .replace(/\r/g, "");

        const rawLines = cleaned
          .split(/\n+/)
          .map((l) => l.trim())
          .filter((l) => {
            if (!l || l.length < 2) return false;
            if (REASONING_NOISE_RE.test(l)) return false;
            if (INVOICE_NOISE_RE.test(l)) return false;
            if (/^\d{16,}$/.test(l)) return false;
            return true;
          });

        const keyLines: string[] = [];
        const restLines: string[] = [];
        const seen = new Set<string>();
        for (const l of rawLines) {
          const norm = l.toLowerCase();
          if (seen.has(norm)) continue;
          seen.add(norm);
          if (HIGH_SIGNAL_VISION_RE.test(l)) {
            keyLines.push(l);
          } else {
            restLines.push(l);
          }
        }

        const prioritized =
          keyLines.length > 0
            ? [`[DATOS CLAVE]: ${keyLines.join(" | ")}`, ...restLines.slice(0, 12)]
            : rawLines;
        const joined = prioritized.join("\n").trim();
        if (joined.length <= maxLen) return joined;
        return `${joined.slice(0, maxLen).trimEnd()}...`;
      };

      const isVisualAttachment = (m: any): boolean =>
        Boolean(m?.mediaUrl) && !m.transcription && !String(m.mediaType || "").startsWith("audio/");

      const totalVisualMediaCount = allEvents.filter(isVisualAttachment).length;
      let seenVisualIdx = 0;

      const transcriptLines: string[] = [];
      const mediaTranscriptLines: string[] = [];
      const substantiveParts: string[] = [];
      const fullEvidenceParts: string[] = [];

      const SYSTEM_CLOSURE_NOISE_RE =
        /cerrad[oa]\s+por\s+falta\s+de\s+respuesta|procedemos\s+a\s+cerrar\s+este\s+caso|calificar[ií]a\s+la\s+atenci[oó]n|encuesta\s+de\s+satisfacci[oó]n|conversaci[oó]n\s+ha\s+sido\s+cerrada/i;

      for (const m of allEvents) {
        const rawText = String(m.content || "").trim();
        if (!m.mediaUrl && SYSTEM_CLOSURE_NOISE_RE.test(rawText)) {
          continue;
        }
        let timeStr = "";
        if (m.time) {
          const parsedDate = new Date(m.time);
          timeStr = !isNaN(parsedDate.getTime())
            ? parsedDate.toLocaleTimeString("es-CR", { timeZone: "America/Costa_Rica", hour: "2-digit", minute: "2-digit", hour12: true })
            : String(m.time);
        }
        let line = `[${timeStr}] ${m.speaker}: ${rawText}`.trim();
        if (rawText) {
          fullEvidenceParts.push(rawText);
        }
        if (rawText && !isBoilerplateOrFileMessage(rawText)) {
          substantiveParts.push(rawText);
        } else if (rawText && m.speaker === "Cliente") {
          const stripped = stripTemplateLines(rawText);
          if (stripped.length >= 6) substantiveParts.push(stripped);
        }
        if (m.mediaUrl) {
          const isVisual = isVisualAttachment(m);
          if (isVisual) seenVisualIdx++;
          const isRecentVisual = isVisual && seenVisualIdx > Math.max(0, totalVisualMediaCount - 3);
          const kind = m.mediaType?.startsWith("audio/")
            ? "Nota de voz / Audio"
            : m.mediaType?.startsWith("image/")
              ? "Imagen"
              : m.mediaType?.startsWith("video/")
                ? "Video"
                : m.fileName || m.mediaType || "Documento adjunto";
          line += `\n   [ADJUNTO: ${kind}]`;
          if (m.transcription) {
            line += `\n   -> TRANSCRIPCIÓN LITERAL DEL AUDIO:\n"${m.transcription}"`;
            substantiveParts.push(`Audio del cliente: "${m.transcription}"`);
            fullEvidenceParts.push(String(m.transcription));
          } else if (m._visionAnalysis && !m._visionAnalysis.includes("[ANÁLISIS DE ADJUNTO NO DISPONIBLE")) {
            const condensed = sanitizeAndCompactVision(m._visionAnalysis, isRecentVisual ? 1200 : 750);
            line += `\n   -> ANÁLISIS TÉCNICO DEL ADJUNTO:\n${condensed}`;
            substantiveParts.push(sanitizeAndCompactVision(m._visionAnalysis, 700));
            fullEvidenceParts.push(String(m._visionAnalysis));
          } else {
            line += `\n   -> [ATENCIÓN: No se pudo extraer el análisis visual de este adjunto (${m.fileName || kind}). NO asumas ni inventes su contenido; indícale al técnico si necesitas que te describa lo que muestra la captura.]`;
            substantiveParts.push(`Evidencia adjunta sin análisis visual disponible: ${m.fileName || kind}`);
          }
          mediaTranscriptLines.push(line);
        }
        transcriptLines.push(line);
      }

      // Priorizar siempre los mensajes más recientes desde el final hacia atrás (máx 14,000 chars)
      // para conservar los mensajes recientes y los datos críticos de adjuntos anteriores.
      const MAX_CONV_CHARS = 14000;
      const recentReversed: string[] = [];
      let convChars = 0;
      for (let i = transcriptLines.length - 1; i >= 0 && recentReversed.length < 40; i--) {
        const candidate = transcriptLines[i];
        if (recentReversed.length >= 8 && convChars + candidate.length + 2 > MAX_CONV_CHARS) {
          break;
        }
        recentReversed.push(candidate);
        convChars += candidate.length + 2;
      }
      const recentLines = recentReversed.reverse();
      const missingMediaLines = mediaTranscriptLines
        .filter((ml) => !recentLines.includes(ml))
        .slice(-3)
        .map((ml) => (ml.length > 750 ? `${ml.slice(0, 750)}...` : ml));
      openCaseConversation = [...missingMediaLines, ...recentLines].join("\n\n");
      substantiveOpenCaseText = substantiveParts.slice(-20).join("\n");

      const fullCaseTextCorpus = `${targetCase?.marca || ""} ${targetCase?.modelo || ""} ${clienteData?.modelo || ""} ${fullEvidenceParts.join("\n")}`;
      detectedCaseModels = extractValidHardwareModels(fullCaseTextCorpus);
      const has2CE = /\b(?:hik-)?ds-2ce\w*/i.test(fullCaseTextCorpus);
      const hasAnalogSignals = /\b(?:ds-2ce|hik-ds-2ce|hqhi|hghi|huhi|xvr|an[aá]log[ao]|anal[oó]gica|coaxial|hdtvi|hdcvi|ahd|cvbs|5\s*in\s*1)\b/i.test(
        fullCaseTextCorpus
      );
      const hasPureIpCam = /\b(?:ds-2cd|ipc-)\w*/i.test(fullCaseTextCorpus);
      if (hasAnalogSignals && (has2CE || !hasPureIpCam)) {
        isAnalogCoaxCase = true;
        detectedArchitecture =
          "Sistema Analógico / Turbo HD (DVR + cámara análoga coaxial HDTVI; NO tiene dirección IP ni aparece en SADP Tools ni tiene web propia — sus parámetros internos y reset de fábrica se operan vía menú OSD coaxial con Control PTZ desde el grabador)";
      } else if (hasPureIpCam || /\b(?:ds-7[67]\d*ni|ds-71\d*ni|\bnvr\b)\b/i.test(fullCaseTextCorpus)) {
        detectedArchitecture = "Sistema IP / NVR (red Ethernet, visible en SADP Tools / interfaz web IP)";
      }
    }

    // ── 4. Si el técnico subió un archivo directamente en el widget del asistente ──
    let techMediaAnalysis = "";
    if (mediaUrl) {
      try {
        const result = await Promise.race([
          analyzeMedia(mediaUrl, mediaType, message, fileName, 22000),
          new Promise<null>((r) => setTimeout(() => r(null), 28000)),
        ]);
        if (result) {
          techMediaAnalysis = result;
        }
      } catch (err: any) {
        console.warn("[tech-assistant] Error analizando adjunto del técnico:", err?.message);
      }
    }

    const isDraftAction =
      action === "draft_client_reply" ||
      (typeof message === "string" &&
        message.includes("Instrucciones de atención al cliente") &&
        message.includes("Redacte la respuesta para el cliente"));

    const displayMsg =
      displayMessage ||
      (isDraftAction ? "Redactar propuesta de respuesta para el cliente basada en el caso abierto" : (message || "").trim());

    const now = new Date().toISOString();
    const aiUserMsgContent = techMediaAnalysis
      ? `${displayMsg}\n\n[ANÁLISIS DEL ARCHIVO ADJUNTO DEL TÉCNICO (${fileName || mediaType || "archivo"})]:\n${techMediaAnalysis}`.trim()
      : mediaUrl
        ? `${displayMsg}\n\n[AVISO DEL SISTEMA: El técnico SÍ adjuntó "${fileName || mediaType || "imagen"}", pero el motor de visión falló temporalmente al leerla. NO afirmes que no hay captura ni inventes datos; informa honestamente el fallo de lectura visual y pide reintentar o describir brevemente la captura.]`.trim()
        : displayMsg;

    const userMsg: TechMessage = {
      role: "user",
      content: displayMsg || (mediaUrl ? `Adjunto: ${fileName || mediaType || "imagen"}` : ""),
      time: now,
      mediaUrl: mediaUrl || undefined,
      mediaType: mediaType || undefined,
      fileName: fileName || undefined,
    };
    const updatedMessages = [...messages, userMsg];
    const aiMessages = [
      ...messages,
      { ...userMsg, content: aiUserMsgContent },
    ];

    // ── 5. Motor de Relevancia por Dominio Técnico de Avería (sin falsos positivos) ──
    const isGenericDiagnosticPrompt = /diagnostique y resuelva|identifique el equipo|procedimiento técnico/i.test(message || "");
    const userQueryOnly: string = isGenericDiagnosticPrompt ? "" : String(message || "");

    const cleanCaseTitle = !isGenericCaseTitle(targetCase?.title) ? String(targetCase?.title || "") : "";
    const cleanCaseDesc = !isBoilerplateOrFileMessage(clienteData?.descripcion) ? String(clienteData?.descripcion || "") : "";
    const cleanCaseProb =
      targetCase?.problema && !["consulta", "configuracion", "configuración"].includes(String(targetCase.problema).toLowerCase())
        ? String(targetCase.problema)
        : "";

    // Si el técnico hizo una pregunta específica en el chat, esa pregunta manda; si presionó "Analizar Caso", manda el contenido sustancial del caso abierto
    const primaryTopicText =
      userQueryOnly.trim().length > 8
        ? `${userQueryOnly} ${cleanCaseTitle} ${cleanCaseDesc} ${cleanCaseProb} ${substantiveOpenCaseText} ${techMediaAnalysis}`.trim()
        : `${cleanCaseTitle} ${cleanCaseDesc} ${cleanCaseProb} ${substantiveOpenCaseText} ${techMediaAnalysis}`.trim();

    const fullContextCorpus = `${primaryTopicText} ${targetCase?.marca || ""} ${targetCase?.modelo || ""}`.toLowerCase();

    const KNOWN_BRANDS = [
      "hikvision",
      "dahua",
      "zkteco",
      "ubiquiti",
      "mikrotik",
      "hilook",
      "ezviz",
      "imou",
      "dsc",
      "paradox",
      "axis",
      "uniview",
      "epcom",
      "honeywell",
      "simplex",
      "sinplex",
    ];

    const userBrands = KNOWN_BRANDS.filter((b) => userQueryOnly.toLowerCase().includes(b));
    const caseBrands = KNOWN_BRANDS.filter((b) => fullContextCorpus.includes(b));
    const activeBrands = userBrands.length > 0 ? userBrands : caseBrands;

    // Inferir fabricante por línea de producto o app (AX-Pro / Hik-Connect = Hikvision, DMSS = Dahua, BioTime = ZKTeco)
    const PRODUCT_LINE_HINTS: { re: RegExp; brand: string; line: string }[] = [
      { re: /\bax[\s-]?pro\b/i, brand: "hikvision", line: "AX PRO" },
      { re: /\bax[\s-]?hub\b/i, brand: "hikvision", line: "AX Hub" },
      { re: /hik[\s-]?connect/i, brand: "hikvision", line: "Hik-Connect" },
      { re: /\bivms[\s-]?4200\b/i, brand: "hikvision", line: "iVMS-4200" },
      { re: /hikcentral/i, brand: "hikvision", line: "HikCentral" },
      { re: /\bsadp\b/i, brand: "hikvision", line: "SADP" },
      { re: /\bds-[a-z0-9]/i, brand: "hikvision", line: "" },
      { re: /\bdmss\b|smartpss/i, brand: "dahua", line: "DMSS / SmartPSS" },
      { re: /biotime|zkbio/i, brand: "zkteco", line: "BioTime" },
    ];
    const productHint = PRODUCT_LINE_HINTS.find((h) => h.re.test(fullContextCorpus));
    const primaryBrand =
      activeBrands[0] ||
      (targetCase?.marca ? String(targetCase.marca).toLowerCase().trim() : "") ||
      productHint?.brand ||
      "";
    const productLine = productHint?.line || "";

    const cleanModels = [
      ...new Set([
        ...extractValidHardwareModels(userQueryOnly),
        ...detectedCaseModels,
        ...extractValidHardwareModels(`${targetCase?.modelo || ""} ${clienteData?.modelo || ""} ${primaryTopicText}`),
      ]),
    ];
    const primaryModel = cleanModels[0] || "";

    // Clasificar el dominio técnico exacto de la consulta / caso actual
    const { scores: queryDomainScores, primaryDomain: activeFaultDomain } = computeDomainScores(primaryTopicText);
    const activeDomainDef = FAULT_DOMAINS.find((d) => d.id === activeFaultDomain) || null;

    // Extraer únicamente las frases y palabras clave que SÍ están presentes en la avería actual (ordenadas por especificidad)
    const activeFaultTerms: string[] = [];
    if (activeDomainDef) {
      for (const ph of activeDomainDef.strongPhrases) {
        if (primaryTopicText.toLowerCase().includes(ph)) {
          activeFaultTerms.push(ph);
        }
      }
      for (const kw of activeDomainDef.keywords) {
        if (primaryTopicText.toLowerCase().includes(kw) && !activeFaultTerms.includes(kw)) {
          activeFaultTerms.push(kw);
        }
      }
    }

    // Tokenizar palabras técnicas tanto de la consulta del técnico como del caso abierto en pantalla
    const STOPWORDS = new Set([
      "como", "cómo", "para", "este", "esta", "estos", "estas", "caso", "cliente", "equipo", "tiene", "hacer",
      "hago", "puede", "puedo", "cuando", "donde", "dónde", "cual", "cuál", "porque", "por", "que", "qué",
      "con", "sin", "del", "las", "los", "una", "uno", "unos", "unas", "sobre", "entre", "hasta", "desde",
      "diagnostique", "resuelva", "averia", "avería", "identifique", "reportada", "consulte", "precedentes",
      "similares", "resueltos", "sekunet", "brinde", "procedimiento", "tecnico", "técnico", "exacto", "comprobado",
      "solucionarlo", "inmediato", "hola", "buenas", "tardes", "dias", "días", "ayuda", "favor", "estimado",
      "opcion", "opción", "seccion", "sección", "menu", "menú", "ingrese", "vaya", "muchas", "gracias",
      "buenos", "saludos", "consulta", "consultar", "solicita", "indica", "mensaje", "conversacion", "conversación",
      "matthew", "joshua", "isaac", "cesar", "cbatista", "vendedor", "cuenta", "chat", "whatsapp", "pasada",
      "semana", "conversando", "reparacion", "reparación", "diagnostico", "diagnóstico", "señor", "senor",
      "gracias", "saludos", "cordial", "cordiales", "atentamente", "compañero", "amigo", "porfa"
    ]);
    const rawTokenSource = `${userQueryOnly} ${primaryTopicText}`;
    const queryTokens = [
      ...new Set(
        rawTokenSource
          .toLowerCase()
          .replace(/[^a-záéíóúñ0-9-]/gi, " ")
          .split(/\s+/)
          .filter((w: string) => w.length >= 4 && !STOPWORDS.has(w) && !/^\d+$/.test(w))
      ),
    ].slice(0, 18);

    // ── 5.1 & 5.2. Consulta en el 100% de la Base de Datos de Casos Resueltos y Manuales Oficiales ──
    let ragContext = "";
    let retrievedKbDocs: { id: string | number; doc_name: string; snippet: string }[] = [];
    let historicalPrecedents = "";
    let topPrecedents: IndexedPrecedent[] = [];

    try {
      const { precedents, docChunks } = await getFullKnowledgeAndCasesIndex(serviceClient);

      // A) Selección de Manuales Oficiales relevantes
      const scoredChunks: { chunk: IndexedDocChunk; score: number }[] = [];
      for (const ch of docChunks) {
        const docLower = ch.doc_name.toLowerCase();
        const textLower = ch.searchCorpus;

        if (docLower.includes("bodycamera") && !/bodycam|body\s*camera|corporal/i.test(fullContextCorpus)) {
          continue;
        }
        if (docLower.includes("3wr30x") && !/3wr|router|repetidor|wifi|wi-fi/i.test(fullContextCorpus)) {
          continue;
        }
        if (docLower.includes("mikrotik") && !/mikrotik|winbox|routeros/i.test(fullContextCorpus)) {
          continue;
        }
        if (docLower.includes("biotime") && !/biotime|zkteco|biometrico|biométrico|asistencia|huella/i.test(fullContextCorpus)) {
          continue;
        }
        if (docLower.includes("sinplex") && !/simplex|sinplex|4007|incendio/i.test(fullContextCorpus)) {
          continue;
        }
        if (docLower.includes("ezviz") && !/ezviz|x5s/i.test(fullContextCorpus)) {
          continue;
        }

        let score = 0;
        if (primaryBrand) {
          const docMentionsBrand = docLower.includes(primaryBrand) || textLower.includes(primaryBrand);
          const competingBrandInTitle = KNOWN_BRANDS.find((b) => b !== primaryBrand && docLower.includes(b));
          if (competingBrandInTitle || !docMentionsBrand) continue;

          if (docLower.includes(primaryBrand)) score += 55;
          else if (textLower.includes(primaryBrand)) score += 25;
        }

        if (primaryModel && textLower.includes(primaryModel)) {
          score += 55;
        }

        for (const term of activeFaultTerms) {
          if (textLower.includes(term)) {
            score += term.includes(" ") ? 28 : 16;
          }
        }
        for (const qt of queryTokens) {
          if (textLower.includes(qt)) score += 12;
        }

        if (score >= 22) {
          scoredChunks.push({ chunk: ch, score });
        }
      }

      scoredChunks.sort((a, b) => b.score - a.score);

      const seenDocNames = new Set<string>();
      const uniqueBestChunks: IndexedDocChunk[] = [];
      for (const item of scoredChunks) {
        const normName = item.chunk.doc_name.toLowerCase().trim();
        if (!seenDocNames.has(normName)) {
          seenDocNames.add(normName);
          uniqueBestChunks.push(item.chunk);
          if (uniqueBestChunks.length >= 2) break;
        }
      }

      if (uniqueBestChunks.length > 0) {
        retrievedKbDocs = uniqueBestChunks.map((d) => ({
          id: d.id,
          doc_name: d.doc_name,
          snippet: d.content.substring(0, 500),
        }));

        ragContext = uniqueBestChunks
          .map((d, i) => `[M${i + 1}] Manual Oficial: ${d.doc_name} (Base de conocimiento Sekunet)\n${d.content.substring(0, 650)}`)
          .join("\n\n");
      }

      // B) Selección de Casos Precedentes Resueltos en Sekunet
      const isCurrentCaseCctv =
        (activeFaultDomain === "video_imagen" ||
          isAnalogCoaxCase ||
          /\b(?:dvr|nvr|c[aá]mara|hqhi|ds-2c|blanco\s+y\s+negro|osd|wdr)\b/i.test(fullContextCorpus)) &&
        activeFaultDomain !== "intercom_acceso_biometria";
      const isImageOsdFault =
        isAnalogCoaxCase ||
        /blanco\s+y\s+negro|d[ií]a\s*\/?\s*noche|day\s*\/?\s*night|men[uú]\s+osd|wdr|luz\s+(?:blanca|h[ií]brida)|canal\s+anal[oó]gico/i.test(
          primaryTopicText
        );
      const asksAboutDiskOrPassword =
        /\b(?:disco\s+duro|hdd|sata|sin\s+grabaciones|archivo\s+xml|desvincular|olvid[oó]\s+la\s+contrase[ñn]a)\b/i.test(
          `${userQueryOnly} ${substantiveOpenCaseText}`
        );

      const scoredCases: { prec: IndexedPrecedent; score: number }[] = [];
      for (const p of precedents) {
        if (validCaseId && p.id === validCaseId) continue;

        // Descartar precedentes de control de acceso / biometría en casos de CCTV/cámaras
        if (
          isCurrentCaseCctv &&
          (p.primaryDomain === "intercom_acceso_biometria" ||
            /\b(?:ds-k1t|biom[eé]tric|reloj\s+marcador|control\s+de\s+acceso|frente\s+de\s+calle|videoportero|llav[ií]n)\b/i.test(
              `${p.equipmentLabel} ${p.faultSummary}`
            ))
        ) {
          continue;
        }

        // En fallas de imagen / OSD / color de cámara, evitar arrastrar precedentes de disco duro o reset de contraseña salvo relación OSD/imagen
        if (
          isImageOsdFault &&
          !asksAboutDiskOrPassword &&
          (p.primaryDomain === "almacenamiento_grabacion" || p.primaryDomain === "reset_credenciales") &&
          !/\b(?:osd|d[ií]a\/noche|day\/night|color|blanco\s+y\s+negro|wdr|ptz|c[aá]mara\s+an[aá]loga)\b/i.test(p.searchCorpus)
        ) {
          continue;
        }

        let faultScore = 0;

        // 1. Coincidencia en el dominio técnico de la falla actual
        if (activeFaultDomain) {
          const precDomScore = p.domainScores[activeFaultDomain] || 0;
          if (p.primaryDomain === activeFaultDomain) {
            faultScore += 65 + Math.min(precDomScore, 55);
          } else if (precDomScore >= 14) {
            faultScore += 35 + Math.min(precDomScore, 40);
          }
        }

        // 2. Coincidencia en frases y términos técnicos específicos de la falla
        for (const term of activeFaultTerms) {
          if (p.searchCorpus.includes(term)) {
            faultScore += term.includes(" ") ? 28 : 14;
          }
        }

        // 3. Coincidencia en palabras clave del caso o consulta del técnico
        let matchedTokens = 0;
        for (const qt of queryTokens) {
          if (p.searchCorpus.includes(qt)) {
            matchedTokens++;
            faultScore += 14;
          }
        }

        let matchedExplicitModel = false;
        const hardwareOnlyModels = cleanModels.filter((cm) => !/^(?:sadp|ivms|hitools|configtool)/.test(cm));
        for (const cm of hardwareOnlyModels.slice(0, 3)) {
          if (p.model.includes(cm) || p.searchCorpus.includes(cm)) {
            matchedExplicitModel = true;
            break;
          }
        }

        // Nunca aceptar solo por coincidencia de marca si no hay coincidencia real de falla o modelo hardware
        if (faultScore < 24 && !matchedExplicitModel) continue;

        let brandAndModelScore = 0;
        if (primaryBrand) {
          const matchBrand = p.brand.includes(primaryBrand) || p.equipmentLabel.toLowerCase().includes(primaryBrand) || p.searchCorpus.includes(primaryBrand);
          const hasCompetingBrand = KNOWN_BRANDS.some(
            (b) => b !== primaryBrand && (p.brand.includes(b) || p.equipmentLabel.toLowerCase().includes(b))
          );
          if (hasCompetingBrand && !matchBrand) {
            continue; // Descartar absolutamente precedentes de fabricantes que no son de este caso
          }
          if (matchBrand) {
            brandAndModelScore += 45;
          }
        }

        for (const cm of hardwareOnlyModels.slice(0, 3)) {
          if (p.model.includes(cm) || p.searchCorpus.includes(cm)) {
            brandAndModelScore += faultScore > 0 ? 50 : 30;
          }
        }

        // Afinidad analógica vs IP/NVR
        let architectureDelta = 0;
        if (isAnalogCoaxCase) {
          const precHasAnalog = /\b(?:an[aá]log|coaxial|men[uú]\s+osd|\bosd\b|\bptz\b|hqhi|hghi|huhi|ds-2ce|hdtvi|blanco\s+y\s+negro|d[ií]a\s*\/?\s*noche|hybrid\s+light)\b/i.test(
            p.searchCorpus
          );
          const precIsPureIpNvr = /\b(?:ds-2cd|ds-7[67]\d*ni|ds-71\d*ni|\bnvr\b)\b/i.test(`${p.equipmentLabel} ${p.searchCorpus}`);
          if (precHasAnalog) architectureDelta += 45;
          else if (precIsPureIpNvr) architectureDelta -= 55;
        }

        const totalScore = faultScore + brandAndModelScore + architectureDelta + (p.solutionText.length > 140 ? 10 : 0);
        const minThreshold = primaryBrand ? 62 : 35;
        if (totalScore >= minThreshold) {
          scoredCases.push({ prec: p, score: totalScore });
        }
      }

      scoredCases.sort((a, b) => b.score - a.score);
      topPrecedents = scoredCases.slice(0, 3).map((s) => s.prec);

      if (topPrecedents.length > 0) {
        historicalPrecedents = topPrecedents
          .map(
            (mc, idx) =>
              `[C${idx + 1}] Caso #${mc.shortId} resuelto con ÉXITO COMPROBADO Y CONFIRMADO POR EL CLIENTE (${mc.confirmationReason}) por ${mc.resolverName} (${mc.equipmentLabel} - ${mc.faultSummary})\nSolución técnica comprobada: ${mc.solutionText.substring(0, 550)}`
          )
          .join("\n\n");
      }
    } catch (dbErr: any) {
      console.warn("[tech-assistant] Error consultando índice completo de casos y manuales:", dbErr?.message);
    }

    // ── 5.3. Búsqueda Web Técnica en Vivo alineada al Caso (SIEMPRE activa salvo saludo/corrección meta) ──
    let webContext = "";
    let retrievedWebResults: { title: string; url: string; snippet: string; kind: "oficial" | "foro" | "manual" }[] = [];
    const memoryToSave = !isDraftAction && typeof message === "string" ? detectMemorySaveIntent(message) : null;
    const isMetaMediaQuery =
      isDraftAction ||
      isGenericDiagnosticPrompt ||
      /\b(redactar propuesta|propuesta de respuesta|basada en el caso|analizar caso|revisa la imagen|ultima foto|última foto|imagen final|que dice la foto|qué dice la foto|la captura)\b/i.test(
        userQueryOnly
      );
    const hasSpecificTechAsk =
      /(?:wdr|osd|ptz|formate|reset|restablec|blanco\s+y\s+negro|d[ií]a\s*\/?\s*noche|luz|ir\b|sadp|ip\b|puerto|firmware|disco|graba|c[aá]mara|grabador|men[uú])/i.test(
        userQueryOnly
      );
    const isMetaCorrectionOnly =
      !isDraftAction &&
      !isGenericDiagnosticPrompt &&
      userQueryOnly.trim().length > 0 &&
      /\b(?:est[aá]\s+mal|mal\s+diagn[oó]stico|diagm?ostico.*mal|extraviado|perdido|no\s+entendiste|lee\s+el\s+chat|revisa\s+arriba|vuelve\s+a\s+leer|volv(?:amos|er)\s+al|no\s+es\s+(?:ip|eso)|est[aá]s\s+confundid[oa])\b/i.test(
        userQueryOnly
      ) &&
      !hasSpecificTechAsk;
    const isPureMemoryCommand = Boolean(memoryToSave) && !activeFaultDomain && !primaryModel;
    const cleanForTrivialCheck = userQueryOnly.replace(/[?!.,\s]+/g, "").trim();
    const isTrivialGreeting =
      !isDraftAction &&
      !mediaUrl &&
      cleanForTrivialCheck.length > 0 &&
      cleanForTrivialCheck.length <= 12 &&
      !primaryBrand &&
      !primaryModel &&
      activeFaultTerms.length === 0;

    if (!isPureMemoryCommand && !isTrivialGreeting && !isMetaCorrectionOnly) {
      try {
        const topFaultTerms = activeFaultTerms.slice(0, 3).join(" ");
        const tokenHint = queryTokens.slice(0, 3).join(" ");
        const cleanUserMsg = userQueryOnly
          .replace(/^(como|cómo|por que|porque|ayuda|cual|cuál|que|qué|donde|dónde|favor|puedes|necesito|hola|buen dia|buenas)\s+/i, "")
          .trim()
          .substring(0, 80);

        const visionHintMatch = `${techMediaAnalysis} ${substantiveOpenCaseText}`.match(
          /(?:error[:\s-]*\w+|puerto\s+(?:http|sdk|rtsp)?[:\s]*\d+|unsupported\s+stream|connection\s+failed|offline|hitools|sadp|ivms)/i
        );
        let visionHint = visionHintMatch ? visionHintMatch[0] : "";
        if (isAnalogCoaxCase && /^(?:sadp|hitools|ivms)$/i.test(visionHint) && !/\b(?:sadp|hitools|ivms)\b/i.test(userQueryOnly)) {
          visionHint = "";
        }

        const hardwareModelForWeb =
          (isAnalogCoaxCase
            ? cleanModels.find((cm) => /ds-2ce/i.test(cm)) || cleanModels.find((cm) => !/^(?:sadp|ivms|hitools)/.test(cm))
            : cleanModels.find((cm) => !/^(?:sadp|ivms|hitools)/.test(cm))) || primaryModel;

        let subject = "";
        if (isAnalogCoaxCase && /formate|reset|restablec|valores\s+de\s+f[aá]brica/i.test(userQueryOnly)) {
          subject = "menu OSD PTZ reset restablecer camara analoga DVR";
        } else if (!isMetaMediaQuery && cleanUserMsg.length > 8) {
          subject = isAnalogCoaxCase ? `${cleanUserMsg} menu OSD DVR camara analoga` : cleanUserMsg;
        } else if (isAnalogCoaxCase) {
          subject = "menu OSD PTZ camara analoga day night dvr";
        } else {
          subject = [topFaultTerms || tokenHint, visionHint].filter(Boolean).join(" ").trim();
        }

        const baseQuery = `${primaryBrand} ${isAnalogCoaxCase && productLine === "SADP" ? "" : productLine} ${hardwareModelForWeb} ${subject}`
          .replace(/\s+/g, " ")
          .trim();
        const queryForWeb = baseQuery.length >= 3 ? baseQuery : `${primaryBrand} ${hardwareModelForWeb} manual configuracion`.trim();

        if (queryForWeb.length >= 3) {
          const officialQuery = `${queryForWeb} manual configuracion`;
          const forumQuery = `${queryForWeb} solucion`;
          console.log(`[tech-assistant] 🌐 Web oficial: "${officialQuery}" | Foros: "${forumQuery}"`);

          const [officialRes, forumRes] = await Promise.race([
            Promise.all([
              searchTechnicalWeb(officialQuery, 4, false, primaryBrand, hardwareModelForWeb, activeFaultDomain),
              searchTechnicalWeb(forumQuery, 4, true, primaryBrand, hardwareModelForWeb, activeFaultDomain),
            ]),
            new Promise<[any[], any[]]>((resolve) => setTimeout(() => resolve([[], []]), 5500)),
          ]);

          const isOffTopicNvrForAnalog = (r: { title: string; url: string; snippet: string }): boolean => {
            if (!isAnalogCoaxCase || /\bnvr\b/i.test(userQueryOnly)) return false;
            const t = `${r.title} ${r.url} ${r.snippet}`;
            return (
              /(?:network\s+video\s+recorder|user\s+manual\s+of\s+network\s+video\s+recorder|ud04701b)/i.test(t) &&
              !/\b(?:dvr|turbo\s*hd|hdtvi|an[aá]log|osd|ptz)\b/i.test(t)
            );
          };

          const seen = new Set<string>();
          const merged: typeof retrievedWebResults = [];
          const pushRes = (r: { title: string; url: string; snippet: string }) => {
            if (isOffTopicNvrForAnalog(r)) return;
            const key = r.url.replace(/[#?].*$/, "").toLowerCase();
            if (seen.has(key)) return;
            seen.add(key);
            merged.push({ ...r, kind: classifyWebSource(r.url) });
          };
          officialRes.slice(0, 3).forEach(pushRes);
          forumRes.filter((r) => classifyWebSource(r.url) === "foro").slice(0, 2).forEach(pushRes);
          [...officialRes, ...forumRes].forEach((r) => merged.length < 4 && pushRes(r));

          retrievedWebResults = merged.slice(0, 4);
          if (retrievedWebResults.length > 0) {
            webContext = retrievedWebResults
              .map((r, i) => `[W${i + 1}] (${r.kind === "foro" ? "Foro técnico" : r.kind === "manual" ? "Manual" : "Sitio oficial"}) ${r.title} (${r.url})\n${r.snippet}`)
              .join("\n\n");
          }
        }
      } catch (webErr: any) {
        console.warn("[tech-assistant] Error en búsqueda web en vivo:", webErr?.message);
      }
    }

    // ── 5.5 Memoria persistente, personalidad, historial del cliente y herramientas en vivo ──
    const appliedActions: TechAppliedAction[] = [];
    if (memoryToSave) {
      const savedMem = await addTechMemory(serviceClient, {
        text: memoryToSave,
        category: primaryBrand || activeFaultDomain || "general",
        author: user.email!,
      });
      if (savedMem.ok) {
        appliedActions.push({
          type: "save_memory",
          summary: `Regla guardada en memoria del equipo: "${memoryToSave}"`,
          ok: true,
        });
      }
    }

    const queryTextForTools = String(message || "");
    const [memoriesList, personalityCfg, clientPriorCasesText, inventoryContext, warrantiesContext] = await Promise.all([
      getTechMemories(serviceClient),
      getTechPersonality(serviceClient),
      targetCase?.customer_phone
        ? getClientPriorCasesSummary(serviceClient, targetCase.customer_phone, validCaseId)
        : Promise.resolve(""),
      !isDraftAction && shouldQueryInventory(queryTextForTools)
        ? queryInventoryForAssistant(serviceClient, queryTextForTools, primaryBrand, primaryModel)
        : Promise.resolve(""),
      !isDraftAction && shouldQueryWarranties(queryTextForTools)
        ? queryWarrantiesAndClientHistory(serviceClient, {
            queryText: queryTextForTools,
            phone: targetCase?.customer_phone,
            clientName: clienteData?.nombre,
            currentCaseId: validCaseId,
            primaryModel,
          })
        : Promise.resolve(""),
    ]);

    const prioritizedMemories = [...memoriesList].sort((a, b) => {
      const matchA =
        (primaryBrand && a.category?.toLowerCase() === primaryBrand) ||
        (activeFaultDomain && a.category?.toLowerCase() === activeFaultDomain)
          ? 1
          : 0;
      const matchB =
        (primaryBrand && b.category?.toLowerCase() === primaryBrand) ||
        (activeFaultDomain && b.category?.toLowerCase() === activeFaultDomain)
          ? 1
          : 0;
      return matchB - matchA;
    });

    const clipBlock = (s: string, maxChars: number): string =>
      s.length <= maxChars ? s : `${s.slice(0, maxChars).trimEnd()}...`;

    const ragPromptBlock = ragContext ? `\n\nMANUALES OFICIALES EN BASE DE CONOCIMIENTO SEKUNET (RAG):\n${clipBlock(ragContext, 1400)}` : "";
    const precedentsPromptBlock = historicalPrecedents
      ? `\n\nPRECEDENTES HISTÓRICOS REALES RESUELTOS CON ÉXITO Y CONFIRMACIÓN DEL CLIENTE (SEKUNET):\n${clipBlock(historicalPrecedents, 1800)}`
      : "";
    const webPromptBlock = webContext
      ? `\n\nBÚSQUEDA WEB EN VIVO (MANUALES OFICIALES, FICHAS TÉCNICAS Y FOROS ESPECIALIZADOS):\n${clipBlock(webContext, 1400)}`
      : "";
    const memoriesBlock =
      prioritizedMemories.length > 0
        ? `\n\nMEMORIA PERSISTENTE DEL EQUIPO SEKUNET (REGLAS Y APRENDIZAJES GUARDADOS):\n${clipBlock(
            prioritizedMemories
              .slice(0, 30)
              .map((m, idx) => `${idx + 1}. ${m.text}`)
              .join("\n"),
            1500
          )}`
        : "";
    const clientHistoryBlock = clientPriorCasesText
      ? `\n\nHISTORIAL PREVIO DE ESTE CLIENTE (MEMORIA AUTOMÁTICA):\n${clipBlock(clientPriorCasesText, 1000)}`
      : "";
    const personalityBlock = personalityCfg.customInstructions
      ? `\n\nINSTRUCCIONES PERSONALIZADAS DEL EQUIPO SEKUNET:\n${personalityCfg.customInstructions}${
          personalityCfg.tone ? `\nTono adicional solicitado: ${personalityCfg.tone}` : ""
        }`
      : "";
    const liveToolsBlock = [
      inventoryContext ? `\n\nINVENTARIO EN VIVO SEKUNET (sek_inventario):\n${inventoryContext}` : "",
      warrantiesContext ? `\n\nGARANTÍAS Y CASOS PREVIOS DEL CLIENTE:\n${warrantiesContext}` : "",
    ]
      .filter(Boolean)
      .join("");

    // ── 6. System Prompt Maestro del Asistente Técnico ──
    const equipoRegistrado = clienteData?.equipo || (targetCase?.marca ? `${targetCase.marca || ""} ${targetCase.modelo || ""}`.trim() : "");
    const hardwareModelsDetected = detectedCaseModels.filter((m) => !/^(?:sadp|ivms|hitools|configtool)/.test(m));
    const equipoLinea =
      hardwareModelsDetected.length > 0
        ? `${primaryBrand ? primaryBrand.toUpperCase() + " — " : ""}${hardwareModelsDetected.join(", ")}${equipoRegistrado ? ` (registro: ${equipoRegistrado})` : ""}`
        : equipoRegistrado || "No registrado formalmente (consulte la conversación y las fotos)";

    const nowDateObj = new Date();
    const crHourNum = Number(
      new Intl.DateTimeFormat("en-US", { timeZone: "America/Costa_Rica", hour: "numeric", hour12: false }).format(nowDateObj)
    ) || 0;
    const saludoCR = crHourNum < 12 ? "Buenos días" : crHourNum < 18 ? "Buenas tardes" : "Buenas noches";
    const horaActualCR = nowDateObj.toLocaleString("es-CR", {
      timeZone: "America/Costa_Rica",
      dateStyle: "medium",
      timeStyle: "short",
    });

    const detectedEvidenceBlock = [
      hardwareModelsDetected.length > 0 ? `- Modelos de hardware detectados en el chat/adjuntos: ${hardwareModelsDetected.join(", ")}` : "",
      detectedArchitecture ? `- Arquitectura confirmada del sistema: ${detectedArchitecture}` : "",
      isAnalogCoaxCase
        ? "- ADVERTENCIA CRÍTICA: La cámara análoga HDTVI NO tiene dirección IP ni aparece en SADP Tools; sus parámetros internos (Día/Noche, Luz Blanca/Híbrida, WDR, Restablecer/Reset de fábrica) se configuran entrando al menú OSD coaxial de la cámara mediante Control PTZ desde el grabador DVR."
        : "",
    ]
      .filter(Boolean)
      .join("\n");

    const rule3Section = isGenericDiagnosticPrompt
      ? `3. ESTRUCTURA DE RESOLUCIÓN TÉCNICA (OBLIGATORIA al analizar el caso):
   Responde con un Plan Técnico Resolutivo CONCISO, DIRECTO Y SIN RELLENO TEÓRICO en estas secciones (usa el título exacto seguido de dos puntos):
   Falla y Causa Raíz:
   Máximo 2 a 3 líneas directas indicando marca/modelo exacto, qué muestran las capturas o audios del cliente y la causa técnica puntual. Prohibido redactar párrafos largos de teoría.

   Solución Comprobada en Taller / Documentada:
   Máximo 2 líneas concretas indicando qué ajuste exacto resolvió esta falla en los precedentes de Sekunet, historial del cliente o manuales oficiales. Prohibido usar frases genéricas de relleno.

   Procedimiento de Resolución (Paso a Paso):
   Pasos técnicos cortos, directos y numerados (1., 2., 3.) con la ruta o menú exacto en el equipo o software de la marca para solucionar el problema de inmediato.

   Instrucción Concreta para el Cliente:
   Máximo 2 líneas directas con la prueba o confirmación puntual que se le debe indicar al cliente.`
      : `3. RESPUESTA DIRECTA A LA PREGUNTA O CORRECCIÓN DEL TÉCNICO:
   El técnico NO pidió un diagnóstico genérico repetitivo; hizo una pregunta puntual o señaló una corrección en el chat.
   - Responde DIRECTA, EXACTA Y CONCISAMENTE a lo que preguntó o corrigió el técnico basándote en los últimos mensajes de <<<CONVERSACION_CASO_ACTUAL>>>.
   - NO fuerces el molde rígido de 4 secciones si una explicación directa con pasos numerados claros (1., 2., 3.) responde mejor a su pregunta.`;

    let systemPrompt = `Eres el Asistente Técnico Senior de Sekunet, el copiloto experto para técnicos e ingenieros de soporte de CCTV, control de acceso, alarmas, redes y seguridad electrónica.

Tu función esencial es RESOLVER LA AVERÍA TÉCNICA junto con el técnico, no hacer meros resúmenes pasivos ni explicaciones redundantes de lo que el cliente ya dijo.

Tienes acceso COMPLETO y VISIBILIDAD TOTAL de la conversación del caso que el técnico tiene actualmente abierto en pantalla, incluyendo las fotos enviadas, las transcripciones completas de notas de voz de audio, videos y documentos técnicos analizados, así como los casos históricos resueltos en el taller Sekunet.

CONTEXTO DEL CASO ABIERTO EN PANTALLA (A QUIEN LE ESTAMOS DANDO SOPORTE):
- Fecha y hora actual en Costa Rica (UTC-6): ${horaActualCR} (Franja horaria actual: ${saludoCR})
- Cliente: ${clienteData?.nombre || "No registrado"}
- Teléfono: ${targetCase?.customer_phone || "No indicado"}
- Cuenta/Empresa: ${clienteData?.cuenta || "No registrada"}
- Canal: ${targetCase?.canal || "WhatsApp"}
- Estado actual: ${targetCase?.estado || "Sin caso específico"}
- Dispositivo registrado / detectado: ${equipoLinea}
${activeDomainDef ? `- Categoría técnica detectada: ${activeDomainDef.label}` : ""}
${detectedEvidenceBlock ? `\nEQUIPOS Y EVIDENCIAS DETECTADAS EN EL CHAT:\n${detectedEvidenceBlock}` : ""}${ragPromptBlock}${precedentsPromptBlock}${webPromptBlock}${clientHistoryBlock}${memoriesBlock}${liveToolsBlock}${personalityBlock}

<<<CONVERSACION_CASO_ACTUAL>>>
CONVERSACIÓN CRONOLÓGICA COMPLETA DEL CASO ABIERTO (con transcripciones y análisis de imágenes — LEE HASTA EL ÚLTIMO MENSAJE):
${openCaseConversation || "No hay mensajes registrados en este caso."}
<<<FIN_CONVERSACION_CASO_ACTUAL>>>

REGLAS DE ATENCIÓN TÉCNICA OBLIGATORIAS:
0. REGLA SUPREMA DE AISLAMIENTO DE MARCA:
La marca del caso abierto es: "${primaryBrand || "No especificada"}".
Está TERMINANTEMENTE PROHIBIDO mezclar marcas o sugerir herramientas/procedimientos de otros fabricantes:
- Si el equipo es ZKTeco, JAMÁS menciones SADP, HiTools ni Hikvision.
- Si el equipo es Simplex, JAMÁS menciones DSC, Paradox, Dahua ni Hikvision.
- Si el equipo es Hikvision, JAMÁS menciones SmartPSS, DMSS ni ZKTeco.
Toda recomendación técnica debe pertenecer con total exactitud a la marca del equipo del cliente. Si no tienes un procedimiento certero para esta marca, indícalo con honestidad en vez de inventar datos.

0.1 PROHIBICIÓN ESTRICTA DE ASUMIR RADIOENLACES POR LA FRASE "PUNTO A PUNTO":
Si en un caso de videoportero, intercomunicador, CCTV o control de acceso se menciona "punto a punto", se refiere a conexión cableada directa por red (LAN) entre dispositivos (ej. frente de calle directo a monitor interior sin pasar por switch). JAMÁS asumas ni menciones marcas de radioenlaces (como Ubiquiti, NanoStation o airMAX) a menos que la etiqueta o el cliente digan explícitamente antena o enlace inalámbrico. Lee siempre las marcas y modelos visibles en fotos y etiquetas adjuntas.

0.2 DISTINCIÓN ESTRICTA ENTRE CÁMARAS ANÁLOGAS/HDTVI (DVR) Y CÁMARAS IP (NVR):
- Los grabadores Hikvision serie iDS-72xxHQHI / HGHI / HUHI / DS-72xx son DVR Turbo HD (soportan cámaras análogas coaxiales HDTVI/HDCVI/AHD/CVBS + canales IP adicionales), y las cámaras DS-2CE... son ANÁLOGAS coaxiales.
- Una cámara análoga coaxial NO tiene dirección IP, NO aparece en SADP Tools, NO tiene interfaz web propia y NO se "formatea" en Gestión de Cámaras IP.
- Si el menú Imagen del DVR muestra "Modo día/noche: No soportado" o el técnico/cliente quiere configurar Luz Híbrida (Smart Hybrid Light), Modo Día/Noche, WDR o Restablecer (Reset de fábrica) de la cámara análoga: debe abrir en el DVR la Vista en Directo sobre el canal analógico correspondiente → abrir Control PTZ → presionar el botón Menú (Iris+ o llamar Preset 95) para entrar al menú OSD coaxial interno de la propia cámara → navegar con las flechas del PTZ para ajustar LIGHT / DAY-NIGHT / EXPOSURE o aplicar RESET / FACTORY DEFAULT y confirmar SAVE & EXIT.
- Aclara explícitamente cuando pregunten dónde "formatear" en el menú del grabador: los grabadores solo formatean discos duros (en Almacenamiento / HDD), NO "formatean" cámaras; lo que se puede hacer en una cámara análoga es restablecer sus parámetros desde su menú OSD coaxial vía Control PTZ.

0.3 FIDELIDAD ABSOLUTA AL CHAT ACTUAL Y DESCARTAR FUENTES IRRELEVANTES:
Lee la conversación completa en <<<CONVERSACION_CASO_ACTUAL>>> desde el inicio hasta EL ÚLTIMO MENSAJE, incluyendo cualquier corrección del técnico (por ejemplo si el técnico dijo que se equivocó, que vuelvan al menú del grabador, o especificó que la cámara es análoga). Si un precedente [C#], manual [M#] o enlace web [W#] corresponde a otro tipo de equipo (por ejemplo un NVR o cámara IP cuando el caso trata una cámara análoga en DVR, o un biométrico en un caso de CCTV), IGNÓRALO POR COMPLETO y no lo menciones ni lo cites.

1. MÁXIMA PRIORIDAD A RESOLVER LA AVERÍA: El técnico te consulta para encontrar la SOLUCIÓN EXACTA. Fundamenta tu respuesta en la conversación abierta real, las evidencias adjuntas, las soluciones comprobadas en casos previos del mismo cliente o taller cuando realmente apliquen, y procedimientos técnicos exactos de la marca.
2. FOCO Y DESTINATARIO: Tu respuesta va dirigida ÚNICA Y EXCLUSIVAMENTE al caso y cliente abierto en pantalla. Nunca menciones nombres de clientes pasados.
${rule3Section}
4. NUNCA respondas que el cliente no tiene preguntas basándote en un último mensaje de cortesía. Todo el historial del caso contiene la avería.
5. PROHIBICIÓN TOTAL DE OFRECER IMÁGENES O PREGUNTAR QUÉ CAPTURA ENVIAR:
Eres una IA de texto. Eres COMPLETAMENTE INCAPAZ de generar, enviar o preparar imágenes o capturas de pantalla.
JAMÁS digas "preparo la imagen exacta que requiera", JAMÁS ofrezcas enviar o preparar capturas y JAMÁS preguntes "¿qué captura o pantalla necesita que le envíe?".
Si el técnico escribe "imagen final y pregunta en el chat", "imagen final", "última foto", "la captura", "el archivo", "la pregunta en el chat", "revisa la imagen", "el cliente mandó foto", etc.:
Significa EXCLUSIVA E INEQUÍVOCAMENTE: "Revisa la última imagen que el cliente adjuntó en la conversación del caso abierto y la pregunta o duda que se planteó en el chat, e indícame la solución técnica".
Debes explicar de inmediato qué muestra la imagen del cliente, responder la pregunta técnica del chat y dar el procedimiento de solución paso a paso.
6. Comunícate con tono profesional, técnico, directo, seguro y colaborativo ("Pura vida, colega").

REGLAS ESTRICTAS DE FORMATO Y ESTILO (OBLIGATORIAS):
- PROHIBIDO EL USO DE ASTERISCOS: Absolutamente CERO asteriscos. No uses negritas con doble asterisco, ni cursivas con asterisco, ni viñetas de asterisco.
- PROHIBIDO EL USO DE ENCABEZADOS MARKDOWN: No uses símbolos de almohadilla (#, ##, ###) ni líneas de separación (--- o ___).
- VIÑETAS DECENTES: Si vas a enlistar puntos, usa viñetas sencillas con punto ("• ") de un solo nivel. Usa pasos numerados (1., 2., 3.) para procedimientos secuenciales.
- NO escribas corchetes [C1], [M1] ni [W1] dentro de los párrafos del cuerpo de tu respuesta.
- CITACIÓN SELECTIVA Y VERIFICABLE AL FINAL: Si realmente usaste alguna de las fuentes [M#], [C#] o [W#] pertinentes arriba para resolver este caso, escribe una última línea que inicie con "Fuentes consultadas:" citando únicamente las etiquetas pertinentes que sí aplican (nunca cites fuentes de NVR/IP/otros equipos que descartaste).`;

    if (!isDraftAction && validCaseId) {
      systemPrompt += `\n\nACCIONES DIRECTAS SOBRE EL CASO (ÚSALAS SOLO SI EL TÉCNICO LO PIDE EXPLÍCITAMENTE):
- Si el técnico te pide explícitamente agregar/guardar una nota interna en el caso, incluye al final una línea exacta: [ACCION_CASO: {"type":"add_note","noteText":"texto de la nota"}]
- Si el técnico te pide explícitamente actualizar/corregir la marca o modelo del caso, incluye al final: [ACCION_CASO: {"type":"update_equipment","marca":"Marca","modelo":"Modelo"}]
- Nunca emitas [ACCION_CASO: ...] si el técnico no pidió modificar el caso.`;
    }

    if (isDraftAction) {
      systemPrompt += `\n\nOBJETIVO INMEDIATO PARA ESTA INTERVENCIÓN:
El técnico solicitó redactar la propuesta de respuesta que él enviará directamente al cliente en el chat de WhatsApp.
PAUTAS DE REDACCIÓN DE LA RESPUESTA PARA EL CLIENTE:
- La hora actual en Costa Rica es ${horaActualCR}. El saludo correspondiente a esta hora es "${saludoCR}".
- Si en la conversación ya se saludó previamente al cliente, NO repitas "Buenos días" ni "Buenas tardes"; entra directo con naturalidad ("Con gusto le explico...", "Claro, para configurar..."). Si vas a incluir saludo, usa estrictamente "${saludoCR}" (JAMÁS uses "Buenas tardes" si es de mañana ni inventes otra hora).
- Ve directo al grano: dale al cliente la respuesta clara a su pregunta o el procedimiento técnico exacto paso a paso de lo que debe hacer en su equipo.
- Si le indicas pasos o pruebas al cliente, usa viñetas sencillas con punto ("• ") directas y numeradas si es secuencial, con instrucciones fáciles de seguir para alguien no técnico.
- NUNCA uses jerga interna del taller ni menciones precedentes de otros clientes, manuales internos ni códigos de caso de Sekunet.
- CERO ASTERISCOS: Redacte en texto plano limpio sin asteriscos, sin encabezados con # y con viñetas decentes ("• ").
- NO INCLUYAS la línea de fuentes consultadas en este texto, ya que este mensaje va dirigido exclusivamente al cliente final por WhatsApp.
- DEVUELVA ÚNICAMENTE el texto que el técnico debe enviarle al cliente. No incluya introducciones como "Aquí tiene la respuesta:" ni notas dirigidas al técnico.`;
    }

    // ── 7. Generar respuesta con IA (Multi-provider Fallback Chain + Rescate Compacto) ──
    let responseText = "";

    try {
      const aiGen = await generateText("chat", {
        system: systemPrompt,
        messages: aiMessages.map((m) => ({
          role: m.role === "assistant" ? "assistant" : "user",
          content: m.content,
        })),
        temperature: 0.2,
        maxTokens: 3072,
        timeoutMs: 25_000,
      });

      if (aiGen?.text) {
        responseText = cleanAiFormatting(aiGen.text);
        console.log(`[tech-assistant] Respuesta generada exitosamente con ${aiGen.provider}/${aiGen.modelo}`);
      } else {
        // Reintento ultraligero con contexto reducido si la cadena completa agotó tiempo
        const compactSystem = `Eres el Asistente Técnico Senior de Sekunet. Responde de forma directa, técnica y sin asteriscos al técnico sobre este caso (${equipoLinea}).${detectedArchitecture ? `\nArquitectura: ${detectedArchitecture}` : ""}\n\n${openCaseConversation.slice(-6000)}`;
        const retryGen = await generateText("chat", {
          system: compactSystem,
          messages: [{ role: "user", content: userQueryOnly || message }],
          temperature: 0.2,
          maxTokens: 1200,
          timeoutMs: 12_000,
        });
        if (retryGen?.text) {
          responseText = cleanAiFormatting(retryGen.text);
          console.log(`[tech-assistant] Respuesta generada en reintento compacto con ${retryGen.provider}/${retryGen.modelo}`);
        }
      }
    } catch (aiErr: any) {
      console.error("[tech-assistant] Error generando respuesta:", aiErr?.message);
    }

    if (!responseText) {
      const fallbackParts: string[] = [];
      if (substantiveOpenCaseText) {
        fallbackParts.push(`Resumen técnico del caso y evidencia analizada:\n${substantiveOpenCaseText.slice(-1500)}`);
      }
      if (historicalPrecedents) {
        fallbackParts.push(`Precedentes comprobados en taller Sekunet:\n${historicalPrecedents.slice(0, 1200)}`);
      }
      if (ragContext) {
        fallbackParts.push(`Documentación técnica oficial:\n${ragContext.slice(0, 1000)}`);
      }
      responseText =
        fallbackParts.length > 0
          ? cleanAiFormatting(fallbackParts.join("\n\n"))
          : "Por favor intente nuevamente en unos segundos.";
    }

    if (crHourNum < 12) {
      responseText = responseText.replace(/^(¡?Buenas\s+tardes|¡?Buenas\s+noches)\b/i, "Buenos días");
    } else if (crHourNum >= 12 && crHourNum < 18) {
      responseText = responseText.replace(/^(¡?Buenos\s+d[ií]as|¡?Buenas\s+noches)\b/i, "Buenas tardes");
    } else {
      responseText = responseText.replace(/^(¡?Buenos\s+d[ií]as|¡?Buenas\s+tardes)\b/i, "Buenas noches");
    }

    // Ejecutar acción estructurada si el técnico la solicitó y el agente la emitió
    const actionMatch = responseText.match(/\[ACCION_CASO:\s*(\{[\s\S]*?\})\s*\]/i);
    if (actionMatch) {
      responseText = responseText.replace(/\[ACCION_CASO:\s*\{[\s\S]*?\}\s*\]/gi, "").trim();
      if (validCaseId && !isDraftAction) {
        try {
          const parsedAct = JSON.parse(actionMatch[1]);
          if (parsedAct?.type === "add_note" || parsedAct?.type === "update_equipment") {
            const applied = await executeTechCaseAction(serviceClient, {
              caseId: validCaseId,
              agentEmail: user.email!,
              action: parsedAct.type,
              noteText: parsedAct.noteText,
              marca: parsedAct.marca,
              modelo: parsedAct.modelo,
            });
            appliedActions.push(applied);
          }
        } catch {
          /* ignorar JSON malformado */
        }
      }
    }

    let clientDraftText = responseText;
    let assistantDisplayContent = responseText;

    const aiSourcesMatch = responseText.match(/\n*(?:Fuentes(?:\s+t[eé]cnicas)?\s+consultadas|Fuentes:)([\s\S]*)$/i);
    const aiSourcesRaw = aiSourcesMatch ? aiSourcesMatch[1] : "";

    const cleanBody = responseText
      .replace(/\n*(?:Fuentes(?:\s+t[eé]cnicas)?\s+consultadas|Fuentes:).*$/is, "")
      .replace(/\s*\[(?:C|M|W)\d+\]/g, "")
      .trim();

    // Detectar qué etiquetas específicas ([C1], [M1], [W1]) seleccionó la IA para mostrar solo fuentes pertinentes
    const aiCitedM = new Set([...aiSourcesRaw.matchAll(/\[?M(\d+)\]?/gi)].map((m) => Number(m[1]) - 1));
    const aiCitedC = new Set([...aiSourcesRaw.matchAll(/\[?C(\d+)\]?/gi)].map((m) => Number(m[1]) - 1));
    const aiCitedW = new Set([...aiSourcesRaw.matchAll(/\[?W(\d+)\]?/gi)].map((m) => Number(m[1]) - 1));
    const hasExplicitCitations = aiCitedM.size > 0 || aiCitedC.size > 0 || aiCitedW.size > 0;
    const allowAutoFallbackSources = isGenericDiagnosticPrompt && !isMetaCorrectionOnly && !hasExplicitCitations;

    const finalSources: string[] = [];

    // 1. Manuales Oficiales en Base de Conocimiento (correspondientes a la marca)
    let mOutIdx = 1;
    retrievedKbDocs.forEach((kd, idx) => {
      const matchBrand = !primaryBrand || kd.doc_name.toLowerCase().includes(primaryBrand);
      if ((aiCitedM.has(idx) || (allowAutoFallbackSources && idx === 0)) && matchBrand) {
        const safeDoc = kd.doc_name.replace(/[()]/g, "").trim();
        finalSources.push(`[M${mOutIdx++}] Manual Oficial: ${safeDoc} (Base de conocimiento Sekunet)`);
      }
    });

    // 2. Casos Precedentes Reales de Sekunet (solo si fueron explícitamente citados por la IA)
    let cOutIdx = 1;
    topPrecedents.forEach((mc, idx) => {
      const matchBrand = !primaryBrand || mc.equipmentLabel.toLowerCase().includes(primaryBrand) || mc.brand.toLowerCase().includes(primaryBrand);
      if (aiCitedC.has(idx) && matchBrand) {
        const cleanDetails = `${mc.equipmentLabel} - ${mc.faultSummary}`.replace(/[()]/g, "").trim();
        finalSources.push(`[C${cOutIdx++}] Caso Sekunet #${mc.shortId} resuelto por ${mc.resolverName} (${cleanDetails})`);
      }
    });

    // 3. Fuentes Web Oficiales en Vivo (correspondientes a la marca)
    let wOutIdx = 1;
    retrievedWebResults.forEach((wr, idx) => {
      const matchBrand = !primaryBrand || wr.title.toLowerCase().includes(primaryBrand) || wr.url.toLowerCase().includes(primaryBrand);
      if ((aiCitedW.has(idx) || (allowAutoFallbackSources && idx < 2)) && matchBrand) {
        const safeTitle = wr.title.replace(/[()]/g, "").replace(/\s+/g, " ").trim();
        finalSources.push(`[W${wOutIdx++}] ${safeTitle} (${wr.url})`);
      }
    });

    if (validCaseId) {
      finalSources.push("Conversación del caso actual");
    }

    if (isDraftAction) {
      assistantDisplayContent =
        finalSources.length > 0 ? `${responseText}\n\nFuentes consultadas: ${finalSources.join(", ")}.` : responseText;
    } else {
      assistantDisplayContent =
        finalSources.length > 0 ? `${cleanBody}\n\nFuentes consultadas: ${finalSources.join(", ")}.` : cleanBody;
    }

    const assistantMsg: TechMessage = {
      role: "assistant",
      content: assistantDisplayContent,
      time: new Date().toISOString(),
    };
    const finalMessages = [...updatedMessages, assistantMsg];

    await saveTechThread(serviceClient, user.email!, validCaseId || "general", finalMessages).catch(() => {});

    return NextResponse.json({
      ok: true,
      response: responseText,
      clientDraft: clientDraftText,
      messages: finalMessages,
      case_id: validCaseId,
      appliedActions,
    });
  } catch (e: any) {
    console.error("[tech-assistant] error general:", e.message);
    return NextResponse.json({ error: e?.message || "Error inesperado" }, { status: 500 });
  }
}

function cleanAiFormatting(raw: string): string {
  if (!raw) return "";
  return raw
    .replace(/^[ \t]*[-*_]{3,}[ \t]*$/gm, "")
    .replace(/^[ \t]*#{1,6}[ \t]+/gm, "")
    .replace(/^[ \t]*[-*+][ \t]+/gm, "• ")
    .replace(/\*{1,3}([^*\n]+?)\*{1,3}/g, (_, content) => content)
    .replace(/\*/g, "")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function classifyWebSource(url: string): "oficial" | "foro" | "manual" {
  const u = (url || "").toLowerCase();
  if (
    u.includes("manualslib") ||
    u.includes("user-manual") ||
    u.includes(".pdf") ||
    u.includes("/support/how-to/") ||
    u.includes("/guide") ||
    u.includes("quick-start") ||
    u.includes("datasheet") ||
    u.includes("manual")
  ) {
    return "manual";
  }
  if (
    u.includes("forum") ||
    u.includes("foro") ||
    u.includes("reddit") ||
    u.includes("ipcamtalk") ||
    u.includes("cctvforum") ||
    u.includes("youtube") ||
    u.includes("community") ||
    u.includes("comunidad")
  ) {
    return "foro";
  }
  return "oficial";
}

function decodeBingUrl(rawUrl: string): string {
  if (rawUrl.includes("bing.com/ck/a")) {
    const matchU = rawUrl.match(/[?&]u=a1([a-zA-Z0-9_-]+)/);
    if (matchU) {
      try {
        let b64 = matchU[1].replace(/-/g, "+").replace(/_/g, "/");
        while (b64.length % 4) b64 += "=";
        return Buffer.from(b64, "base64").toString("utf-8");
      } catch {}
    }
  }
  return rawUrl;
}

function isStrictlyRelevant(
  title: string,
  url: string,
  snippet: string,
  brandHint = "",
  modelHint = ""
): boolean {
  const full = `${title} ${url} ${snippet}`.toLowerCase();
  const urlLow = url.toLowerCase();

  // Permitir subreddits especializados en CCTV, redes y control de acceso antes de bloquear el resto de Reddit
  const isTechSubreddit =
    /reddit\.com\/r\/(?:hikvision|homedefense|securitycameras|cctv|ubiquiti|mikrotik|accesscontrol)\b/i.test(urlLow);

  const JUNK_DOMAINS = [
    "youtube.com", "youtu.be", "facebook.com", "instagram.com", "tiktok.com",
    "twitter.com", "x.com", "lowyat.net", "answers.microsoft.com",
    "support.google.com", "wikipedia.org", "xvideos", "pornhub", "twitch.tv",
    "spotify.com", "netflix.com", "github.io", "thestempedia.com", "unimart.com"
  ];
  for (const jd of JUNK_DOMAINS) {
    if (urlLow.includes(jd)) return false;
  }
  if (urlLow.includes("reddit.com") && !isTechSubreddit) return false;

  // Blacklist exacta con límites de palabra para no bloquear términos de CCTV como "main stream", "sub stream" u "observar"
  const BAD_TOPIC_REGEXES = [
    /\bobs\s+studio\b/i,
    /\b(?:livestream|streamlabs|twitch|voiceover|minecraft|gameplay|screen\s+record|grabar\s+pantalla|reproducir\s+video|whatsapp\s+web\s+down|netflix)\b/i,
  ];
  for (const rx of BAD_TOPIC_REGEXES) {
    if (rx.test(full)) return false;
  }

  // 3. AISLAMIENTO ESTRICTO DE MARCA:
  // Si tenemos una marca definida para el caso, descartar CUALQUIER resultado de marcas competidoras
  const b = (brandHint || "").toLowerCase().trim();
  if (b) {
    const COMPETING_DOMAINS: Record<string, string[]> = {
      simplex: ["dsc.com", "hikvision.com", "dahuasecurity.com", "dahuawiki.com", "zkteco.com"],
      zkteco: ["hikvision.com", "dahuasecurity.com", "dahuawiki.com", "dsc.com"],
      hikvision: ["dahuasecurity.com", "dahuawiki.com", "zkteco.com", "dsc.com"],
      dahua: ["hikvision.com", "zkteco.com", "dsc.com"],
      dsc: ["hikvision.com", "dahuasecurity.com", "zkteco.com", "johnsoncontrols.com"],
    };
    const bannedDomains = COMPETING_DOMAINS[b] || [];
    for (const bd of bannedDomains) {
      if (urlLow.includes(bd)) return false;
    }

    const mentionsOurBrand = full.includes(b);
    const hasCompetingBrandInTitle = ["hikvision", "dahua", "zkteco", "dsc", "paradox", "axis", "uniview"]
      .filter((k) => k !== b)
      .some((k) => title.toLowerCase().includes(k));
    if (hasCompetingBrandInTitle && !mentionsOurBrand) {
      return false;
    }
  }

  const m = (modelHint || "").toLowerCase().trim();
  const hasBrand = b && full.includes(b);
  const hasModel = m && full.includes(m);
  const isKnownTechnicalDomain = [
    "hikvision.com", "assets.hikvision.com", "hikgrid.com", "hilook.com", "ezviz.com", "support.ezviz.com",
    "dahuasecurity.com", "dahuawiki.com", "zkteco.com", "tp-link.com", "uniview.com", "paradox.com",
    "manualslib.com", "manualsdir.com", "manualzz.com", "dsc.com", "epcom.net", "syscom.mx", "anviz.com",
    "cctvforum.com", "ipcamtalk.com", "ipvm.com", "use-ip.co.uk", "axis.com",
    "ubnt.com", "ui.com", "mikrotik.com", "johnsoncontrols.com"
  ].some((td) => urlLow.includes(td));

  const isManualOrPdf = urlLow.endsWith(".pdf") || full.includes("manual") || full.includes("datasheet") || full.includes("user guide");

  return Boolean((hasBrand && isManualOrPdf) || hasModel || isKnownTechnicalDomain || hasBrand);
}

function getManufacturerFallback(
  brandHint: string,
  modelHint: string,
  query: string,
  domainId: string
): { title: string; url: string; snippet: string }[] {
  const b = (brandHint || query).toLowerCase();
  const m = (modelHint || "").toUpperCase().trim();
  const refs: { title: string; url: string; snippet: string }[] = [];

  if (b.includes("zkteco") || b.includes("biotime") || b.includes("zkbio")) {
    if (m) {
      refs.push({
        title: `ZKTeco ${m} — Especificaciones Técnicas y Manual de Usuario Oficial`,
        url: `https://www.zkteco.com/en/product_detail/${m}.html`,
        snippet: `Documentación técnica oficial de hardware, conexión y configuración para ZKTeco ${m}.`,
      });
    }
    refs.push({
      title: `Centro Oficial de Soporte y Descarga de Manuales ZKTeco`,
      url: `https://www.zkteco.com/en/support`,
      snippet: `Centro oficial de soporte técnico de control de acceso, barreras vehiculares y terminales ZKTeco.`,
    });
  } else if (b.includes("hikvision") || b.includes("hik-connect") || b.includes("hilook") || b.includes("ivms") || b.includes("sadp")) {
    if (m) {
      refs.push({
        title: `Hikvision ${m} — Guías Técnicas de Configuración y Diagnóstico Oficiales`,
        url: `https://www.hikvision.com/es-la/support/how-to/`,
        snippet: `Guías paso a paso oficiales de configuración y resolución de averías para equipos Hikvision.`,
      });
    }
    refs.push({
      title: `Portal de Descargas, Herramientas SADP y Firmware Oficial Hikvision`,
      url: `https://www.hikvision.com/es-la/support/download/`,
      snippet: `Herramientas oficiales SADP, iVMS-4200 y documentación técnica oficial.`,
    });
  } else if (b.includes("dahua") || b.includes("smartpss") || b.includes("dmss")) {
    refs.push({
      title: `DahuaWiki — Base de Conocimiento Técnico Oficial Dahua`,
      url: `https://dahuawiki.com/`,
      snippet: `Guías oficiales paso a paso, configuración de red, DMSS, SmartPSS y solución de averías.`,
    });
    refs.push({
      title: `Centro de Soporte Técnico Oficial Dahua Technology`,
      url: `https://www.dahuasecurity.com/support/`,
      snippet: `Documentación técnica, firmware y guías de configuración oficial de equipos Dahua.`,
    });
  } else if (b.includes("simplex") || b.includes("sinplex") || b.includes("johnson controls")) {
    refs.push({
      title: `Simplex Fire Detection — Johnson Controls Soporte Oficial`,
      url: `https://www.johnsoncontrols.com/es_la/fire-detection/simplex`,
      snippet: `Documentación técnica oficial de paneles de incendio, estaciones manuales, módulos y detectores Simplex.`,
    });
  } else if (b.includes("dsc")) {
    refs.push({
      title: `Guía Técnica de Paneles de Alarma y Programación DSC`,
      url: `https://www.dsc.com/index.php?o=ag`,
      snippet: `Documentación técnica de paneles de intrusión, teclados y gestión de códigos de usuario.`,
    });
  }

  return refs;
}

const WEB_SEARCH_CACHE_TTL_MS = 10 * 60_000;
const WEB_SEARCH_CACHE_MAX = 100;
const webSearchCache = new Map<string, { at: number; results: { title: string; url: string; snippet: string }[] }>();

function decodeYahooUrl(rawUrl: string): string {
  const ruMatch = rawUrl.match(/\/RU=([^/]+)\/RK=/i);
  if (ruMatch && ruMatch[1]) {
    try {
      return decodeURIComponent(ruMatch[1]);
    } catch {}
  }
  return rawUrl;
}

async function searchTechnicalWeb(
  query: string,
  limit = 3,
  isForum = false,
  brandHint = "",
  modelHint = "",
  domainId = ""
): Promise<{ title: string; url: string; snippet: string }[]> {
  const finalQuery = isForum ? `${query} foro comunidad` : query;
  const cacheKey = `${finalQuery.toLowerCase()}|${brandHint}|${modelHint}|${limit}`;
  const cached = webSearchCache.get(cacheKey);
  if (cached && Date.now() - cached.at < WEB_SEARCH_CACHE_TTL_MS) {
    return cached.results;
  }

  const results: { title: string; url: string; snippet: string }[] = [];
  const seenUrls = new Set<string>();

  const pushResult = (title: string, url: string, snippet: string) => {
    if (!url || !url.startsWith("http")) return;
    if (url.includes("duckduckgo.com") || url.includes("bing.com") || url.includes("search.yahoo.com")) return;
    const cleanTitle = title.replace(/<[^>]+>/g, "").replace(/&amp;/g, "&").replace(/[()]/g, "").trim();
    if (cleanTitle.length < 4) return;

    if (!isStrictlyRelevant(cleanTitle, url, snippet, brandHint, modelHint)) {
      return;
    }

    const key = url.replace(/[#?].*$/, "").toLowerCase();
    if (seenUrls.has(key)) return;
    seenUrls.add(key);
    let domain = url;
    try {
      domain = new URL(url).hostname.replace(/^www\./, "");
    } catch {}
    const cleanSnippet = snippet
      ? snippet.replace(/<[^>]+>/g, "").replace(/&amp;/g, "&").trim()
      : `Documentación técnica (${domain}): ${cleanTitle}`;
    results.push({
      title: cleanTitle,
      url,
      snippet: cleanSnippet,
    });
  };

  // 0. Motor Principal: Serper (Google Search API oficial, sin captchas, soporta multi-llave)
  try {
    const provs = await getProviderConfigs();
    const serperCfg = provs.get("serper");
    if (serperCfg && serperCfg.keys.length > 0) {
      const sBase = (serperCfg.baseUrl || "https://google.serper.dev").replace(/\/+$/, "");
      for (let ki = 0; ki < serperCfg.keys.length; ki++) {
        const ck = `serper#${ki}/search`;
        if (isModelCooledDown(ck)) continue;
        try {
          const res = await fetch(`${sBase}/search`, {
            method: "POST",
            headers: {
              "X-API-KEY": serperCfg.keys[ki],
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              q: finalQuery,
              gl: "cr",
              hl: "es",
              num: Math.max(limit + 3, 6),
            }),
            signal: AbortSignal.timeout(4500),
          });
          if (res.ok) {
            markModelSuccess(ck);
            const data = await res.json().catch(() => ({} as any));
            if (data?.answerBox?.link && data?.answerBox?.title) {
              pushResult(
                String(data.answerBox.title),
                String(data.answerBox.link),
                String(data.answerBox.snippet || data.answerBox.answer || "")
              );
            }
            const organic = Array.isArray(data?.organic) ? data.organic : [];
            for (const item of organic) {
              if (results.length >= limit) break;
              pushResult(
                String(item?.title || ""),
                String(item?.link || ""),
                String(item?.snippet || "")
              );
            }
            if (results.length > 0) break;
          } else {
            markModelFailure(ck, res.status);
            console.warn(`[tech-assistant] Serper #${ki} error HTTP ${res.status}`);
          }
        } catch (serr: any) {
          markModelFailure(ck);
          console.warn(`[tech-assistant] Excepción Serper #${ki}:`, serr?.message);
        }
      }
    }
  } catch (err: any) {
    console.warn("[tech-assistant] Error general en Serper:", err?.message);
  }

  // 1. Motor Secundario: DuckDuckGo HTML Search (solo si Serper no completó los resultados)
  if (results.length < limit) {
    try {
      const res = await fetch(`https://html.duckduckgo.com/html/?q=${encodeURIComponent(finalQuery)}`, {
        headers: {
          "User-Agent":
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36",
          "Accept-Language": "es-ES,es;q=0.9,en;q=0.8",
        },
        signal: AbortSignal.timeout(4500),
      });
      if (res.ok) {
        const html = await res.text();
        const titleMatches = [...html.matchAll(/<a[^>]+class="[^"]*result__a[^"]*"[^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/gi)];
        const snippetMatches = [...html.matchAll(/<a[^>]+class="[^"]*result__snippet[^"]*"[^>]*>([\s\S]*?)<\/a>/gi)];
        for (let i = 0; i < titleMatches.length; i++) {
          let rawUrl = titleMatches[i][1];
          if (rawUrl.includes("uddg=")) {
            const m = rawUrl.match(/[?&]uddg=([^&]+)/);
            if (m) rawUrl = decodeURIComponent(m[1]);
          }
          if (rawUrl.startsWith("//")) rawUrl = `https:${rawUrl}`;
          const title = titleMatches[i][2];
          const snippet = snippetMatches[i] ? snippetMatches[i][1] : "";
          pushResult(title, rawUrl, snippet);
          if (results.length >= limit) break;
        }
      }
    } catch (err: any) {
      console.warn("[tech-assistant] Error en DuckDuckGo HTML search:", err?.message);
    }
  }

  // 1b. DuckDuckGo Lite (respaldo ultra ligero cuando HTML devuelve challenge)
  if (results.length < limit) {
    try {
      const res = await fetch(`https://lite.duckduckgo.com/lite/?q=${encodeURIComponent(finalQuery)}`, {
        headers: {
          "User-Agent":
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36",
          "Accept-Language": "es-ES,es;q=0.9,en;q=0.8",
        },
        signal: AbortSignal.timeout(4500),
      });
      if (res.ok) {
        const html = await res.text();
        const linkMatches = [...html.matchAll(/<a[^>]+href=['"]([^'"]+)['"][^>]*class=['"][^'"]*result-link[^'"]*['"][^>]*>([\s\S]*?)<\/a>/gi)];
        const snippetMatches = [...html.matchAll(/class=['"][^'"]*result-snippet[^'"]*['"][^>]*>([\s\S]*?)<\/td>/gi)];
        for (let i = 0; i < linkMatches.length; i++) {
          let rawUrl = linkMatches[i][1];
          if (rawUrl.includes("uddg=")) {
            const m = rawUrl.match(/[?&]uddg=([^&]+)/);
            if (m) rawUrl = decodeURIComponent(m[1]);
          }
          if (rawUrl.startsWith("//")) rawUrl = `https:${rawUrl}`;
          const title = linkMatches[i][2];
          const snippet = snippetMatches[i] ? snippetMatches[i][1] : "";
          pushResult(title, rawUrl, snippet);
          if (results.length >= limit) break;
        }
      }
    } catch (err: any) {
      console.warn("[tech-assistant] Error en DuckDuckGo Lite search:", err?.message);
    }
  }

  // 2. Motor Secundario: Yahoo Search (complementa si faltan resultados reales)
  if (results.length < limit) {
    try {
      const res = await fetch(`https://search.yahoo.com/search?p=${encodeURIComponent(finalQuery)}`, {
        headers: {
          "User-Agent":
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36",
          "Accept-Language": "es-ES,es;q=0.9,en;q=0.8",
        },
        signal: AbortSignal.timeout(4500),
      });
      if (res.ok) {
        const html = await res.text();
        const blockMatches = [
          ...html.matchAll(
            /<h3[^>]+class="[^"]*title[^"]*"[^>]*>[\s\S]*?<a[^>]+href="([^"]+)"[^>]*>([\s\S]*?)<\/a>[\s\S]{0,600}?(?:<p[^>]*class="[^"]*fz-ms[^"]*"[^>]*>([\s\S]*?)<\/p>|<div[^>]*class="[^"]*compText[^"]*"[^>]*>([\s\S]*?)<\/div>)?/gi
          ),
        ];
        for (const bm of blockMatches) {
          const cleanUrl = decodeYahooUrl(bm[1].replace(/&amp;/g, "&"));
          const title = bm[2] || "";
          const snippet = bm[3] || bm[4] || "";
          pushResult(title, cleanUrl, snippet);
          if (results.length >= limit) break;
        }
      }
    } catch (err: any) {
      console.warn("[tech-assistant] Error en Yahoo search:", err?.message);
    }
  }

  // 3. Motor Terciario: Bing Search (solo si DDG + Yahoo devolvieron menos de 2 resultados)
  if (results.length < 2) {
    try {
      const res = await fetch(`https://www.bing.com/search?q=${encodeURIComponent(finalQuery)}`, {
        headers: {
          "User-Agent":
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36",
          "Accept-Language": "es-ES,es;q=0.9,en;q=0.8",
        },
        signal: AbortSignal.timeout(4000),
      });
      if (res.ok) {
        const html = await res.text();
        const matches = [
          ...html.matchAll(
            /<li[^>]+class="b_algo"[^>]*>[\s\S]*?<h2><a[^>]+href="([^"]+)"[^>]*>([\s\S]*?)<\/a><\/h2>([\s\S]*?<p[^>]*>([\s\S]*?)<\/p>)?/gi
          ),
        ];
        for (const m of matches) {
          const rawUrl = m[1].replace(/&amp;/g, "&");
          const cleanUrl = decodeBingUrl(rawUrl);
          const title = m[2];
          const snippet = m[4] || "";
          pushResult(title, cleanUrl, snippet);
          if (results.length >= limit) break;
        }
      }
    } catch (err: any) {
      console.warn("[tech-assistant] Error en Bing search:", err?.message);
    }
  }

  // 4. Respaldo con Gemini Google Search Grounding si los motores HTML devolvieron 0 resultados reales
  if (results.length === 0) {
    try {
      const provs = await getProviderConfigs();
      const googleCfg = provs.get("google");
      if (googleCfg && googleCfg.keys.length > 0) {
        const gBase = googleCfg.baseUrl.replace(/\/+$/, "");
        const groundingModels = ["gemini-3.5-flash-lite", "gemini-3.8-flash", "gemini-3.5-flash"];
        let groundedOk = false;
        for (let ki = 0; ki < googleCfg.keys.length && !groundedOk; ki++) {
          for (const gm of groundingModels) {
            const ck = `google#${ki}/grounding-${gm}`;
            if (isModelCooledDown(ck)) continue;
            const res = await fetch(`${gBase}/models/${gm}:generateContent?key=${googleCfg.keys[ki]}`, {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                contents: [{ parts: [{ text: `Resumen técnico breve sobre: ${finalQuery}` }] }],
                tools: [{ google_search: {} }],
                generationConfig: { maxOutputTokens: 350, temperature: 0.1 },
              }),
              signal: AbortSignal.timeout(5000),
            });
            if (res.ok) {
              markModelSuccess(ck);
              const data = await res.json();
              const parts = data?.candidates?.[0]?.content?.parts || [];
              const gSummary = parts.filter((p: any) => !p?.thought).map((p: any) => p.text).filter(Boolean).join("").trim();
              const chunks = data?.candidates?.[0]?.groundingMetadata?.groundingChunks || [];
              for (const ch of chunks) {
                const wUrl = ch?.web?.uri;
                const wTitle = ch?.web?.title;
                if (wUrl && wTitle) {
                  pushResult(wTitle, wUrl, gSummary.slice(0, 260));
                  if (results.length >= limit) break;
                }
              }
              if (results.length === 0 && gSummary) {
                results.push({
                  title: `Búsqueda web técnica: ${finalQuery.slice(0, 70)}`,
                  url: "https://www.google.com",
                  snippet: gSummary.slice(0, 320),
                });
              }
              groundedOk = true;
              break;
            } else {
              markModelFailure(ck, res.status);
            }
          }
        }
      }
    } catch {
      // Continuar a fallback oficial de fabricante
    }
  }

  // 5. Portales oficiales del fabricante garantizados según marca/modelo para completar resultados faltantes
  const fallbacks = getManufacturerFallback(brandHint, modelHint, query, domainId);
  for (const fb of fallbacks) {
    if (results.length >= limit) break;
    pushResult(fb.title, fb.url, fb.snippet);
  }

  const finalSlice = results.slice(0, limit);
  if (webSearchCache.size >= WEB_SEARCH_CACHE_MAX) {
    const oldest = webSearchCache.keys().next().value;
    if (oldest) webSearchCache.delete(oldest);
  }
  webSearchCache.set(cacheKey, { at: Date.now(), results: finalSlice });
  return finalSlice;
}
