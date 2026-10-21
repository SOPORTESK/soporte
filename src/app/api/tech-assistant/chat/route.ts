import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createClient as createServiceClient } from "@supabase/supabase-js";
import { analyzeMedia, transcribeAudio } from "@/lib/ai/vision";
import { generateText } from "@/lib/ai/config";

export const dynamic = "force-dynamic";

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
}

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

const CACHE_TTL_MS = 3 * 60 * 1000;

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
  const cleanText = text.replace(/nota-voz-[\w.-]+/gi, " ").replace(/\b\d{6,}\b/g, " ");
  const rawMatches =
    cleanText.match(/\b([a-z]{1,4}[-][a-z0-9\/-]+|[a-z]{1,4}\d{2,5}[a-z0-9\/-]*|ivms-?\d+|hikcentral|smartpss|biotime|zkbio|configtool|sadp)\b/gi) || [];

  const valid = new Set<string>();
  for (const m of rawMatches) {
    const lower = m.trim().toLowerCase();
    if (lower.length < 4) continue;
    if (/^m0000/i.test(lower)) continue;
    if (["http", "https", "jpeg", "webm", "html", "case", "auto", "json", "hora", "nota", "para", "como", "este"].some((w) => lower.startsWith(w))) {
      continue;
    }
    const isKnownSoftware = /^(ivms|hikcentral|smartpss|biotime|zkbio|configtool|sadp)/.test(lower);
    const hasLetterAndDigit = /[a-z]/i.test(lower) && /\d/.test(lower);
    if (isKnownSoftware || hasLetterAndDigit) {
      valid.add(lower);
    }
  }
  return [...valid];
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
    "id, title, marca, modelo, problema, resolucion, assigned_to, closed_at, cliente, histcliente, histtecnico";

  const [batch1, batch2, agentsRes, chunksRes] = await Promise.all([
    serviceClient
      .from("sek_cases")
      .select(selectCols)
      .in("estado", ["cerrado", "resuelto"])
      .order("closed_at", { ascending: false })
      .range(0, 999),
    serviceClient
      .from("sek_cases")
      .select(selectCols)
      .in("estado", ["cerrado", "resuelto"])
      .order("closed_at", { ascending: false })
      .range(1000, 2499),
    serviceClient.from("sek_agent_config").select("email, nombre, apellido"),
    serviceClient.from("sek_doc_chunks").select("id, doc_name, content").limit(500),
  ]);

  const agentNameByEmail = new Map<string, string>();
  if (Array.isArray(agentsRes.data)) {
    for (const ag of agentsRes.data) {
      const fullName = [ag.nombre, ag.apellido].filter(Boolean).join(" ").trim();
      if (ag.email && fullName) {
        agentNameByEmail.set(String(ag.email).toLowerCase().trim(), fullName);
      }
    }
  }

  const allClosedCases = [...(batch1.data || []), ...(batch2.data || [])];
  const seenCaseIds = new Set<string>();
  const precedents: IndexedPrecedent[] = [];

  for (const c of allClosedCases) {
    if (!c?.id || seenCaseIds.has(c.id)) continue;
    seenCaseIds.add(c.id);

    const ht = Array.isArray(c.histtecnico) ? c.histtecnico : [];
    const hc = Array.isArray(c.histcliente) ? c.histcliente : [];
    const cli = typeof c.cliente === "object" && c.cliente ? c.cliente : {};
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

export async function POST(req: NextRequest) {
  try {
    const { message, case_id, messages: clientMessages, mediaUrl, mediaType, fileName, action, displayMessage } = await req.json();

    if ((!message || typeof message !== "string" || !message.trim()) && (!mediaUrl || typeof mediaUrl !== "string") && action !== "draft_client_reply") {
      return NextResponse.json({ error: "Mensaje o adjunto requerido" }, { status: 400 });
    }

    const messages: TechMessage[] = Array.isArray(clientMessages) ? (clientMessages as TechMessage[]) : [];

    const supabase = createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user?.email) {
      return NextResponse.json({ error: "No autenticado" }, { status: 401 });
    }

    const { data: agent } = await supabase
      .from("sek_agent_config")
      .select("email")
      .ilike("email", user.email)
      .maybeSingle();
    if (!agent) {
      return NextResponse.json({ error: "Acceso denegado" }, { status: 403 });
    }

    const serviceClient = createServiceClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    );

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

          const histLen =
            (Array.isArray(caseData.histcliente) ? caseData.histcliente.length : 0) +
            (Array.isArray(caseData.histtecnico) ? caseData.histtecnico.length : 0);
          if (histLen <= 2 && caseData.customer_phone) {
            const { data: siblingCases } = await serviceClient
              .from("sek_cases")
              .select("id, estado, created_at, canal, customer_phone, cliente, histcliente, histtecnico, title, marca, modelo, problema, resolucion")
              .ilike("customer_phone", `%${caseData.customer_phone}%`)
              .order("created_at", { ascending: false })
              .limit(6);

            const caseWithMore = siblingCases?.find((c) => {
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

    // ── 2. Procesamiento y persistencia de adjuntos multimedia del caso ──
    let openCaseConversation = "";
    let substantiveOpenCaseText = "";
    let clienteData: any = {};

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
          .slice(-3);

        for (const att of pendingAttachments) {
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
                analyzeMedia(att.mediaUrl, att.mediaType, att.content || "", att.fileName || ""),
                new Promise<null>((r) => setTimeout(() => r(null), 15000)),
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
        }
        if (changed && validCaseId) {
          await serviceClient
            .from("sek_cases")
            .update({ histcliente: histCliente, histtecnico: histTecnico })
            .eq("id", validCaseId);
        }
      }

      // ── 3. Construir la transcripción cronológica completa de la conversación abierta ──
      const allEvents = [
        ...histCliente.map((m: any, idx: number) => ({
          ...m,
          speaker: "Cliente",
          time: m.time || "",
          sortKey: typeof m.seq === "number" ? m.seq : m.time ? new Date(m.time).getTime() : idx,
        })),
        ...histTecnico.map((m: any, idx: number) => ({
          ...m,
          speaker: m.role === "ia" ? "Asistente Virtual" : m.author ? `Técnico (${m.author})` : "Técnico",
          time: m.time || "",
          sortKey: typeof m.seq === "number" ? m.seq : m.time ? new Date(m.time).getTime() : 1000 + idx,
        })),
      ].sort((a, b) => a.sortKey - b.sortKey);

      const transcriptLines: string[] = [];
      const substantiveParts: string[] = [];

      for (const m of allEvents) {
        const timeStr = m.time ? new Date(m.time).toLocaleTimeString("es-CR", { hour: "2-digit", minute: "2-digit" }) : "";
        let line = `[${timeStr}] ${m.speaker}: ${m.content || ""}`.trim();
        if (m.content && !isBoilerplateOrFileMessage(m.content)) {
          substantiveParts.push(String(m.content));
        } else if (m.content && m.speaker === "Cliente") {
          const stripped = stripTemplateLines(String(m.content));
          if (stripped.length >= 6) substantiveParts.push(stripped);
        }
        if (m.mediaUrl) {
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
          } else if (m._visionAnalysis && !m._visionAnalysis.includes("[ANÁLISIS DE ADJUNTO NO DISPONIBLE")) {
            line += `\n   -> ANÁLISIS TÉCNICO Y TRANSCRIPCIÓN DEL ADJUNTO:\n${m._visionAnalysis}`;
            substantiveParts.push(String(m._visionAnalysis));
          }
        }
        transcriptLines.push(line);
      }

      openCaseConversation = transcriptLines.join("\n\n");
      substantiveOpenCaseText = substantiveParts.join("\n");
    }

    // ── 4. Si el técnico subió un archivo directamente en el widget del asistente ──
    let techMediaAnalysis = "";
    if (mediaUrl) {
      try {
        const result = await analyzeMedia(mediaUrl, mediaType, message, fileName);
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
    const userMsgContent = techMediaAnalysis
      ? `${displayMsg}\n\n[ANÁLISIS DEL ARCHIVO ADJUNTO DEL TÉCNICO (${fileName || mediaType || "archivo"})]:\n${techMediaAnalysis}`.trim()
      : displayMsg;

    const userMsg: TechMessage = {
      role: "user",
      content: userMsgContent,
      time: now,
      mediaUrl: mediaUrl || undefined,
      mediaType: mediaType || undefined,
      fileName: fileName || undefined,
    };
    const updatedMessages = [...messages, userMsg];

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
        ? `${userQueryOnly} ${techMediaAnalysis}`
        : `${cleanCaseTitle} ${cleanCaseDesc} ${cleanCaseProb} ${substantiveOpenCaseText} ${techMediaAnalysis}`;

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
      const scoredCases: { prec: IndexedPrecedent; score: number }[] = [];
      for (const p of precedents) {
        if (validCaseId && p.id === validCaseId) continue;

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

        if (faultScore < 14 && matchedTokens === 0 && cleanModels.length === 0) continue;

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

        for (const cm of cleanModels.slice(0, 2)) {
          if (p.model.includes(cm) || p.searchCorpus.includes(cm)) {
            brandAndModelScore += faultScore > 0 ? 45 : 25;
          }
        }

        const totalScore = faultScore + brandAndModelScore + (p.solutionText.length > 140 ? 10 : 0);
        if (totalScore >= 32) {
          scoredCases.push({ prec: p, score: totalScore });
        }
      }

      scoredCases.sort((a, b) => b.score - a.score);
      topPrecedents = scoredCases.slice(0, 3).map((s) => s.prec);

      if (topPrecedents.length > 0) {
        historicalPrecedents = topPrecedents
          .map(
            (mc, idx) =>
              `[C${idx + 1}] Caso #${mc.shortId} resuelto por ${mc.resolverName} (${mc.equipmentLabel} - ${mc.faultSummary})\nSolución técnica comprobada: ${mc.solutionText.substring(0, 550)}`
          )
          .join("\n\n");
      }
    } catch (dbErr: any) {
      console.warn("[tech-assistant] Error consultando índice completo de casos y manuales:", dbErr?.message);
    }

    // ── 5.3. Búsqueda Web Técnica en Vivo alineada al Caso ──
    let webContext = "";
    let retrievedWebResults: { title: string; url: string; snippet: string; kind: "oficial" | "foro" | "manual" }[] = [];
    try {
      const topFaultTerms = activeFaultTerms.slice(0, 3).join(" ");
      const tokenHint = queryTokens.slice(0, 3).join(" ");
      const cleanUserMsg = userQueryOnly
        .replace(/^(como|cómo|por que|porque|ayuda|cual|cuál|que|qué|donde|dónde|favor|puedes|necesito|hola|buen dia|buenas)\s+/i, "")
        .trim()
        .substring(0, 80);

      const subject = cleanUserMsg.length > 8 ? cleanUserMsg : topFaultTerms || tokenHint;
      const baseQuery = `${primaryBrand} ${productLine} ${primaryModel} ${subject}`.replace(/\s+/g, " ").trim();
      const queryForWeb = baseQuery.length >= 3 ? baseQuery : `${primaryBrand} ${primaryModel} manual configuracion`.trim();

      const officialQuery = `${queryForWeb} manual configuracion`;
      const forumQuery = `${queryForWeb} solucion`;
      console.log(`[tech-assistant] 🌐 Web oficial: "${officialQuery}" | Foros: "${forumQuery}"`);

      const [officialRes, forumRes] = await Promise.all([
        searchTechnicalWeb(officialQuery, 4, false, primaryBrand, primaryModel, activeFaultDomain),
        searchTechnicalWeb(forumQuery, 4, true, primaryBrand, primaryModel, activeFaultDomain),
      ]);

      const seen = new Set<string>();
      const merged: typeof retrievedWebResults = [];
      const pushRes = (r: { title: string; url: string; snippet: string }) => {
        const key = r.url.replace(/[#?].*$/, "").toLowerCase();
        if (seen.has(key)) return;
        seen.add(key);
        merged.push({ ...r, kind: classifyWebSource(r.url) });
      };
      // Prioridad: 2 oficiales/manuales + 2 foros, luego completar
      officialRes.slice(0, 2).forEach(pushRes);
      forumRes.filter((r) => classifyWebSource(r.url) === "foro").slice(0, 2).forEach(pushRes);
      [...officialRes, ...forumRes].forEach((r) => merged.length < 4 && pushRes(r));

      retrievedWebResults = merged.slice(0, 4);
      if (retrievedWebResults.length > 0) {
        webContext = retrievedWebResults
          .map((r, i) => `[W${i + 1}] (${r.kind === "foro" ? "Foro técnico" : r.kind === "manual" ? "Manual" : "Sitio oficial"}) ${r.title} (${r.url})\n${r.snippet}`)
          .join("\n\n");
      }
    } catch (webErr: any) {
      console.warn("[tech-assistant] Error en búsqueda web en vivo:", webErr?.message);
    }

    // ── 6. System Prompt Maestro del Asistente Técnico ──
    const equipoRegistrado = clienteData?.equipo || (targetCase?.marca ? `${targetCase.marca || ""} ${targetCase.modelo || ""}`.trim() : "");
    const equipoLinea = equipoRegistrado || "No registrado formalmente (consulte la conversación y las fotos)";

    let systemPrompt = `Eres el Asistente Técnico Senior de Sekunet, el copiloto experto para técnicos e ingenieros de soporte de CCTV, control de acceso, alarmas, redes y seguridad electrónica.

Tu función esencial es RESOLVER LA AVERÍA TÉCNICA junto con el técnico, no hacer meros resúmenes pasivos ni explicaciones redundantes de lo que el cliente ya dijo.

Tienes acceso COMPLETO y VISIBILIDAD TOTAL de la conversación del caso que el técnico tiene actualmente abierto en pantalla, incluyendo las fotos enviadas, las transcripciones completas de notas de voz de audio, videos y documentos técnicos analizados, así como los casos históricos resueltos en el taller Sekunet.

CONTEXTO DEL CASO ABIERTO EN PANTALLA (A QUIEN LE ESTAMOS DANDO SOPORTE):
- Cliente: ${clienteData?.nombre || "No registrado"}
- Teléfono: ${targetCase?.customer_phone || "No indicado"}
- Cuenta/Empresa: ${clienteData?.cuenta || "No registrada"}
- Canal: ${targetCase?.canal || "WhatsApp"}
- Estado actual: ${targetCase?.estado || "Sin caso específico"}
- Dispositivo registrado: ${equipoLinea}
${activeDomainDef ? `- Categoría técnica detectada: ${activeDomainDef.label}` : ""}

CONVERSACIÓN CRONOLÓGICA COMPLETA DEL CASO ABIERTO (con transcripciones y análisis de imágenes):
${openCaseConversation || "No hay mensajes registrados en este caso."}
${ragContext ? `\n\nMANUALES OFICIALES EN BASE DE CONOCIMIENTO SEKUNET (RAG):\n${ragContext}` : ""}
${historicalPrecedents ? `\n\nPRECEDENTES HISTÓRICOS REALES RESUELTOS POR TÉCNICOS DE SEKUNET (RELACIONADOS CON ESTA AVERÍA):\n${historicalPrecedents}` : ""}
${webContext ? `\n\nBÚSQUEDA WEB EN VIVO (MANUALES OFICIALES, FICHAS TÉCNICAS Y FOROS ESPECIALIZADOS):\n${webContext}` : ""}

REGLAS DE ATENCIÓN TÉCNICA OBLIGATORIAS:
0. REGLA SUPREMA DE AISLAMIENTO DE MARCA:
La marca del caso abierto es: "${primaryBrand || "No especificada"}".
Está TERMINANTEMENTE PROHIBIDO mezclar marcas o sugerir herramientas/procedimientos de otros fabricantes:
- Si el equipo es ZKTeco, JAMÁS menciones SADP, HiTools ni Hikvision.
- Si el equipo es Simplex, JAMÁS menciones DSC, Paradox, Dahua ni Hikvision.
- Si el equipo es Hikvision, JAMÁS menciones SmartPSS, DMSS ni ZKTeco.
Toda recomendación técnica debe pertenecer con total exactitud a la marca del equipo del cliente. Si no tienes un procedimiento certero para esta marca, indícalo con honestidad en vez de inventar datos.
1. MÁXIMA PRIORIDAD A RESOLVER LA AVERÍA: El técnico te consulta para encontrar la SOLUCIÓN EXACTA. Debes fundamentar tu diagnóstico y procedimiento en las soluciones reales comprobadas que los técnicos de Sekunet ya aplicaron en los precedentes de taller Y en la información técnica oficial de manuales y fichas técnicas web.
2. FOCO Y DESTINATARIO: Tu respuesta va dirigida ÚNICA Y EXCLUSIVAMENTE al caso y cliente abierto en pantalla. Nunca menciones nombres de clientes pasados.
3. ESTRUCTURA DE RESOLUCIÓN TÉCNICA (OBLIGATORIA al pedir diagnóstico, análisis o solución):
   Responde con un Plan Técnico Resolutivo estructurado en estas secciones directas (usa el título exacto seguido de dos puntos):
   Falla y Causa Raíz:
   Diagnóstico certero del equipo (marca, modelo exacto) y la causa técnica real del fallo según la evidencia, precedentes y manuales.

   Solución Comprobada en Taller / Documentada:
   Cómo otros técnicos de Sekunet o los manuales del fabricante resolvieron esta avería en casos precedentes.

   Procedimiento de Resolución (Paso a Paso):
   Pasos técnicos numerados (1., 2., 3.) exactos para resolver la falla (herramientas SADP/ConfigTool, comandos, reset por archivo XML/QR, gestión de disco, subredes IP, PoE, verificación de voltajes o cables).

   Instrucción Concreta para el Cliente:
   Qué indicación, prueba o dato específico se le debe pedir o indicar al cliente en este momento.
4. NUNCA respondas que el cliente no tiene preguntas basándote en un último mensaje de cortesía. Todo el historial del caso contiene la avería.
5. Si el técnico te pregunta sobre imágenes o audios, responde DIRECTAMENTE con la información técnica visible en las fotos y audios analizados.
6. Comunícate con tono profesional, técnico, directo, seguro y colaborativo ("Pura vida, colega").

REGLAS ESTRICTAS DE FORMATO Y ESTILO (OBLIGATORIAS):
- PROHIBIDO EL USO DE ASTERISCOS: Absolutamente CERO asteriscos. No uses negritas con doble asterisco, ni cursivas con asterisco, ni viñetas de asterisco.
- PROHIBIDO EL USO DE ENCABEZADOS MARKDOWN: No uses símbolos de almohadilla (#, ##, ###) ni líneas de separación (--- o ___).
- VIÑETAS DECENTES: Si vas a enlistar puntos, usa viñetas sencillas con punto ("• ") de un solo nivel. Usa pasos numerados (1., 2., 3.) para procedimientos secuenciales.
- NO escribas corchetes [C1], [M1] ni [W1] dentro de los párrafos del cuerpo de tu respuesta.
- CITACIÓN SELECTIVA Y VERIFICABLE AL FINAL: Al final de tu respuesta, escribe una última línea que inicie con "Fuentes consultadas:" e incluye las etiquetas ([C1], [C2], [M1], [W1], etc.) de las fuentes suministradas arriba que hayas utilizado para fundamentar tu diagnóstico.`;

    if (isDraftAction) {
      systemPrompt += `\n\nOBJETIVO INMEDIATO PARA ESTA INTERVENCIÓN:
El técnico solicitó redactar la propuesta de respuesta que él enviará directamente al cliente en el chat de WhatsApp.
PAUTAS DE REDACCIÓN DE LA RESPUESTA PARA EL CLIENTE:
- Responda con un tono profesional, humano, cercano, cordial y resolutivo ("Buenas tardes", "Con gusto le asisto...").
- Ve directo al grano: dale al cliente la respuesta clara a su pregunta o el procedimiento técnico exacto paso a paso de lo que debe hacer en su equipo.
- Si le indicas pasos o pruebas al cliente, usa viñetas sencillas con punto ("• ") directas y numeradas si es secuencial, con instrucciones fáciles de seguir para alguien no técnico.
- NUNCA uses jerga interna del taller ni menciones precedentes de otros clientes, manuales internos ni códigos de caso de Sekunet.
- CERO ASTERISCOS: Redacte en texto plano limpio sin asteriscos, sin encabezados con # y con viñetas decentes ("• ").
- NO INCLUYAS la línea de fuentes consultadas en este texto, ya que este mensaje va dirigido exclusivamente al cliente final por WhatsApp.
- DEVUELVA ÚNICAMENTE el texto que el técnico debe enviarle al cliente. No incluya introducciones como "Aquí tiene la respuesta:" ni notas dirigidas al técnico.`;
    }

    // ── 7. Generar respuesta con IA (Multi-provider Fallback Chain) ──
    let responseText = "Disculpe, no pude obtener una respuesta en este momento.";

    try {
      const aiGen = await generateText("chat", {
        system: systemPrompt,
        messages: updatedMessages.map((m) => ({
          role: m.role === "assistant" ? "assistant" : "user",
          content: m.content,
        })),
        temperature: 0.2,
        maxTokens: 2048,
        timeoutMs: 25_000,
      });

      if (aiGen?.text) {
        responseText = cleanAiFormatting(aiGen.text);
        console.log(`[tech-assistant] Respuesta generada exitosamente con ${aiGen.provider}/${aiGen.modelo}`);
      }
    } catch (aiErr: any) {
      console.error("[tech-assistant] Error generando respuesta:", aiErr?.message);
    }

    let clientDraftText = responseText;
    let assistantDisplayContent = responseText;

    const aiSourcesMatch = responseText.match(/\n*(?:Fuentes(?:\s+t[eé]cnicas)?\s+consultadas|Fuentes:)([\s\S]*)$/i);
    const aiSourcesRaw = aiSourcesMatch ? aiSourcesMatch[1] : "";

    const cleanBody = responseText
      .replace(/\n*(?:Fuentes(?:\s+t[eé]cnicas)?\s+consultadas|Fuentes:).*$/is, "")
      .replace(/\s*\[(?:C|M|W)\d+\]/g, "")
      .trim();

    // Detectar qué etiquetas específicas ([C1], [M1], [W1]) seleccionó la IA, o incluir las mejores encontradas si omitió las etiquetas
    const aiCitedM = new Set([...aiSourcesRaw.matchAll(/\[?M(\d+)\]?/gi)].map((m) => Number(m[1]) - 1));
    const aiCitedC = new Set([...aiSourcesRaw.matchAll(/\[?C(\d+)\]?/gi)].map((m) => Number(m[1]) - 1));
    const aiCitedW = new Set([...aiSourcesRaw.matchAll(/\[?W(\d+)\]?/gi)].map((m) => Number(m[1]) - 1));

    const finalSources: string[] = [];

    // 1. Manuales Oficiales en Base de Conocimiento (SOLO si fueron citados y corresponden a la marca)
    let mOutIdx = 1;
    retrievedKbDocs.forEach((kd, idx) => {
      const matchBrand = !primaryBrand || kd.doc_name.toLowerCase().includes(primaryBrand);
      if (aiCitedM.has(idx) && matchBrand) {
        const safeDoc = kd.doc_name.replace(/[()]/g, "").trim();
        finalSources.push(`[M${mOutIdx++}] Manual Oficial: ${safeDoc} (Base de conocimiento Sekunet)`);
      }
    });

    // 2. Casos Precedentes Reales de Sekunet (SOLO si fueron citados y corresponden a la marca)
    let cOutIdx = 1;
    topPrecedents.forEach((mc, idx) => {
      const matchBrand = !primaryBrand || mc.equipmentLabel.toLowerCase().includes(primaryBrand) || mc.brand.toLowerCase().includes(primaryBrand);
      if (aiCitedC.has(idx) && matchBrand) {
        const cleanDetails = `${mc.equipmentLabel} - ${mc.faultSummary}`.replace(/[()]/g, "").trim();
        finalSources.push(`[C${cOutIdx++}] Caso Sekunet #${mc.shortId} resuelto por ${mc.resolverName} (${cleanDetails})`);
      }
    });

    // 3. Fuentes Web Oficiales en Vivo (SOLO si fueron citadas y corresponden a la marca)
    let wOutIdx = 1;
    retrievedWebResults.forEach((wr, idx) => {
      const matchBrand = !primaryBrand || wr.title.toLowerCase().includes(primaryBrand) || wr.url.toLowerCase().includes(primaryBrand);
      if (aiCitedW.has(idx) && matchBrand) {
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

    return NextResponse.json({
      ok: true,
      response: responseText,
      clientDraft: clientDraftText,
      messages: finalMessages,
      case_id: validCaseId,
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

  // 1. Blacklist estricta de dominios de streaming, entretenimiento, redes y foros espurios
  const JUNK_DOMAINS = [
    "youtube.com", "youtu.be", "facebook.com", "instagram.com", "tiktok.com",
    "twitter.com", "x.com", "reddit.com", "lowyat.net", "answers.microsoft.com",
    "support.google.com", "wikipedia.org", "xvideos", "pornhub", "twitch.tv",
    "spotify.com", "netflix.com", "github.io", "thestempedia.com", "unimart.com"
  ];
  for (const jd of JUNK_DOMAINS) {
    if (url.toLowerCase().includes(jd)) return false;
  }

  // 2. Blacklist de tópicos espurios ajenos a seguridad electrónica (ej. OBS Studio, grabación de pantalla)
  const BAD_TOPICS = [
    "obs", "stream", "voiceover", "minecraft", "gameplay", "screen record",
    "grabar pantalla", "reproducir video", "netflix", "whatsapp web down", "gmail"
  ];
  for (const bt of BAD_TOPICS) {
    if (full.includes(bt)) return false;
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
      if (url.toLowerCase().includes(bd)) return false;
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
    "hikvision.com", "dahuasecurity.com", "dahuawiki.com", "zkteco.com",
    "manualslib.com", "dsc.com", "epcom.net", "syscom.mx", "anviz.com",
    "cctvforum.com", "ipcamtalk.com", "ipvm.com", "use-ip.co.uk", "axis.com",
    "ubnt.com", "ui.com", "mikrotik.com", "johnsoncontrols.com"
  ].some((td) => url.toLowerCase().includes(td));

  const isManualOrPdf = url.toLowerCase().endsWith(".pdf") || full.includes("manual") || full.includes("datasheet") || full.includes("user guide");

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

async function searchTechnicalWeb(
  query: string,
  limit = 3,
  isForum = false,
  brandHint = "",
  modelHint = "",
  domainId = ""
): Promise<{ title: string; url: string; snippet: string }[]> {
  const finalQuery = isForum ? `${query} foro comunidad` : query;
  const results: { title: string; url: string; snippet: string }[] = [];
  const seenUrls = new Set<string>();

  const pushResult = (title: string, url: string, snippet: string) => {
    if (!url || !url.startsWith("http")) return;
    if (url.includes("duckduckgo.com") || url.includes("bing.com")) return;
    const cleanTitle = title.replace(/<[^>]+>/g, "").replace(/&amp;/g, "&").replace(/[()]/g, "").trim();
    if (cleanTitle.length < 4) return;

    // Validación estricta: descartar OBS, YouTube y sitios no técnicos
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

  // 1. Motor Bing Search (filtrado estrictamente para evitar recomendaciones o videos espurios)
  try {
    const res = await fetch(`https://www.bing.com/search?q=${encodeURIComponent(finalQuery)}`, {
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36",
        "Accept-Language": "es-ES,es;q=0.9,en;q=0.8",
      },
      signal: AbortSignal.timeout(5000),
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
        if (results.length >= limit) return results;
      }
    }
  } catch (err: any) {
    console.warn("[tech-assistant] Error en Bing search:", err?.message);
  }

  // 2. DuckDuckGo Lite endpoint (fallback filtrado)
  if (results.length < limit) {
    try {
      const res = await fetch("https://lite.duckduckgo.com/lite/", {
        method: "POST",
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
          "User-Agent":
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36",
        },
        body: new URLSearchParams({ q: finalQuery }).toString(),
        signal: AbortSignal.timeout(5000),
      });
      if (res.ok) {
        const text = await res.text();
        const linkMatches = [...text.matchAll(/<a\s+[^>]*class=['"]result-link['"][^>]*>([\s\S]*?)<\/a>/gi)];
        for (const m of linkMatches) {
          const hrefMatch = m[0].match(/href=['"]([^'"]+)['"]/i);
          let rawUrl = hrefMatch ? hrefMatch[1] : "";
          if (rawUrl.includes("uddg=")) {
            const matchUddg = rawUrl.match(/[?&]uddg=([^&]+)/);
            if (matchUddg) rawUrl = decodeURIComponent(matchUddg[1]);
          }
          const title = m[1];
          pushResult(title, rawUrl, "");
          if (results.length >= limit) return results;
        }
      }
    } catch (err: any) {
      console.warn("[tech-assistant] Error en DuckDuckGo Lite search:", err?.message);
    }
  }

  // 3. Portales oficiales del fabricante garantizados según marca/modelo para completar resultados faltantes
  const fallbacks = getManufacturerFallback(brandHint, modelHint, query, domainId);
  for (const fb of fallbacks) {
    if (results.length >= limit) break;
    pushResult(fb.title, fb.url, fb.snippet);
  }

  return results.slice(0, limit);
}
