import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createClient as createServiceClient } from "@supabase/supabase-js";
import { analyzeMedia } from "@/lib/ai/vision";
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
  closedAt: string;
}

interface IndexedDocChunk {
  id: string | number;
  doc_name: string;
  content: string;
  searchCorpus: string;
}

// Caché en memoria (TTL 3 minutos) para consultar instantáneamente el 100% de la base de datos de casos cerrados (1,494+ casos) y manuales (90+ bloques)
let fullDbIndexCache: {
  timestamp: number;
  precedents: IndexedPrecedent[];
  docChunks: IndexedDocChunk[];
} | null = null;

const CACHE_TTL_MS = 3 * 60 * 1000;

function isBoilerplateMessage(text: string): boolean {
  const t = (text || "").trim();
  if (t.length < 22) return true;
  const l = t.toLowerCase();
  if (
    l.includes("para servirle, procedo a cerrar") ||
    l.includes("procedo a cerrar el chat") ||
    l.includes("cerrado por inactividad") ||
    l.includes("el cliente inicia la conversación") ||
    l.includes("inicio de conversación") ||
    l.includes("saludando, sin llegar a mencionar") ||
    l.includes("quedo a la espera") ||
    l.includes("queda a la espera") ||
    l.includes("sin interacción") ||
    l.includes("no se detallan fallas") ||
    l.includes("sin equipo ni modelo") ||
    l.includes("mucho gusto le atiende") ||
    l.includes("mi nombre es ") ||
    l.includes("en que le puedo colaborar") ||
    l.includes("en qué le puedo colaborar") ||
    l.includes("en que podemos ayudarle") ||
    l.includes("en qué podemos ayudarle") ||
    l.includes("me indica su nombre") ||
    l.includes("me regala su nombre") ||
    l.includes("nombre de la empresa") ||
    l.includes("quedo atento") ||
    l.includes("con mucho gusto") ||
    l.startsWith("buenos dias") ||
    l.startsWith("buenos días") ||
    l.startsWith("buenas tardes") ||
    l.startsWith("buenas noches") ||
    l.startsWith("hola ")
  ) {
    if (t.length < 130) return true;
  }
  return false;
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
      .eq("estado", "cerrado")
      .order("closed_at", { ascending: false })
      .range(0, 999),
    serviceClient
      .from("sek_cases")
      .select(selectCols)
      .eq("estado", "cerrado")
      .order("closed_at", { ascending: false })
      .range(1000, 2499),
    serviceClient.from("sek_agent_config").select("email, full_name"),
    serviceClient.from("sek_doc_chunks").select("id, doc_name, content").limit(500),
  ]);

  const agentNameByEmail = new Map<string, string>();
  if (Array.isArray(agentsRes.data)) {
    for (const ag of agentsRes.data) {
      if (ag.email && ag.full_name) {
        agentNameByEmail.set(String(ag.email).toLowerCase().trim(), String(ag.full_name).trim());
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

    // 1. Extraer solución técnica real (de columna resolucion o de mensajes técnicos sustanciales)
    const techSubstantiveMsgs = ht
      .filter((m: any) => m?.content && typeof m.content === "string" && !isBoilerplateMessage(m.content))
      .map((m: any) => String(m.content).trim());

    let solutionText = String(c.resolucion || "").trim();
    if (!solutionText || isBoilerplateMessage(solutionText)) {
      solutionText = techSubstantiveMsgs.slice(-3).join(" | ");
    }
    if (!solutionText || solutionText.length < 25) continue;

    // 2. Extraer descripción real de la falla
    const clientSubstantiveMsgs = hc
      .filter((m: any) => m?.content && typeof m.content === "string" && String(m.content).trim().length > 15)
      .map((m: any) => String(m.content).trim());

    const rawTitle = String(c.title || "").trim();
    const isGenericTitle =
      !rawTitle ||
      rawTitle.toLowerCase().startsWith("whatsapp") ||
      rawTitle.toLowerCase() === "sin asunto" ||
      rawTitle.length < 6;

    const rawProblema = String(c.problema || "").trim();
    const isGenericProblema =
      !rawProblema ||
      ["configuracion", "configuración", "consulta", "soporte", "ayuda", "revision", "revisión", "garantia", "garantía", "avería", "averia"].includes(
        rawProblema.toLowerCase()
      );

    let faultSummary = "";
    if (!isGenericTitle) {
      faultSummary = rawTitle;
    } else if (!isGenericProblema && rawProblema.length > 8) {
      faultSummary = rawProblema;
    } else if (cli.descripcion && String(cli.descripcion).trim().length > 8 && !isGenericProblema) {
      faultSummary = String(cli.descripcion).trim();
    } else if (c.resolucion && String(c.resolucion).trim().length > 15) {
      const firstSentence = String(c.resolucion).trim().split(/[.\n]/)[0];
      faultSummary = firstSentence.substring(0, 95);
    } else if (clientSubstantiveMsgs.length > 0) {
      faultSummary = clientSubstantiveMsgs[0].split(/[.\n]/)[0].substring(0, 95);
    } else {
      faultSummary = solutionText.split(/[.\n]/)[0].substring(0, 95);
    }

    faultSummary = faultSummary.replace(/\s+/g, " ").trim();
    if (faultSummary.length > 95) {
      faultSummary = faultSummary.substring(0, 92).trim() + "...";
    }

    // 3. Extraer marca y modelo reales
    const rawBrand = String(c.marca || cli.marca || "").trim();
    const rawModel = String(c.modelo || cli.modelo || cli.equipo || "").trim();
    const cleanModel = /^m0000/i.test(rawModel) ? "" : rawModel;

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
      ].find((b) => combinedText.toLowerCase().includes(b.toLowerCase()));
      equipmentLabel = detectedBrand || "Seguridad Electrónica";
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

    const searchCorpus = `${rawBrand} ${cleanModel} ${rawTitle} ${rawProblema} ${cli.descripcion || ""} ${faultSummary} ${solutionText} ${clientSubstantiveMsgs.slice(0, 3).join(" ")}`.toLowerCase();

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
    `[tech-assistant] Índice completo cargado en memoria: ${precedents.length} casos resueltos válidos (de ${allClosedCases.length} cerrados) y ${docChunks.length} bloques de manuales.`
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

    // Verificar que sea staff
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
    let clienteData: any = {};

    if (targetCase) {
      clienteData = typeof targetCase.cliente === "object" && targetCase.cliente ? targetCase.cliente : {};
      const histCliente = Array.isArray(targetCase.histcliente) ? targetCase.histcliente : [];
      const histTecnico = Array.isArray(targetCase.histtecnico) ? targetCase.histtecnico : [];

      const allMsgs = [...histCliente, ...histTecnico];
      const attachments = allMsgs.filter((m: any) => m.mediaUrl && typeof m.mediaUrl === "string");

      if (attachments.length > 0) {
        let changed = false;
        const pendingAttachments = attachments
          .filter((m: any) => !m._visionAnalysis || m._visionAnalysis.includes("[ANÁLISIS DE ADJUNTO NO DISPONIBLE"))
          .slice(-2);

        for (const att of pendingAttachments) {
          try {
            console.log(`[tech-assistant] Analizando adjunto pendiente en caso ${validCaseId}:`, att.mediaUrl);
            const result = await Promise.race([
              analyzeMedia(att.mediaUrl, att.mediaType, att.content || "", att.fileName || ""),
              new Promise<null>((r) => setTimeout(() => r(null), 5000)),
            ]);
            if (result) {
              const analysis = result;
              const patch = (m: any) => (m.mediaUrl === att.mediaUrl ? { ...m, _visionAnalysis: analysis } : m);
              for (let i = 0; i < histCliente.length; i++) histCliente[i] = patch(histCliente[i]);
              for (let i = 0; i < histTecnico.length; i++) histTecnico[i] = patch(histTecnico[i]);
              changed = true;
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
      for (const m of allEvents) {
        const timeStr = m.time ? new Date(m.time).toLocaleTimeString("es-CR", { hour: "2-digit", minute: "2-digit" }) : "";
        let line = `[${timeStr}] ${m.speaker}: ${m.content || ""}`.trim();
        if (m.mediaUrl) {
          const kind = m.mediaType?.startsWith("audio/")
            ? "Nota de voz / Audio"
            : m.mediaType?.startsWith("image/")
              ? "Imagen"
              : m.mediaType?.startsWith("video/")
                ? "Video"
                : m.fileName || m.mediaType || "Documento adjunto";
          line += `\n   [ADJUNTO: ${kind}]`;
          if (m._visionAnalysis && !m._visionAnalysis.includes("[ANÁLISIS DE ADJUNTO NO DISPONIBLE")) {
            line += `\n   -> ANÁLISIS TÉCNICO Y TRANSCRIPCIÓN DEL ADJUNTO:\n${m._visionAnalysis}`;
          }
        }
        transcriptLines.push(line);
      }

      openCaseConversation = transcriptLines.join("\n\n");
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

    // ── 5. Extracción inteligente de marca, modelo y palabras clave técnicas ──
    const isGenericDiagnosticPrompt = /diagnostique y resuelva|identifique el equipo|procedimiento técnico/i.test(message || "");
    const userQueryOnly: string = isGenericDiagnosticPrompt ? "" : String(message || "");
    const fullContextCorpus = `${userQueryOnly} ${targetCase?.marca || ""} ${targetCase?.modelo || ""} ${targetCase?.title || ""} ${targetCase?.problema || ""} ${clienteData?.descripcion || ""} ${openCaseConversation} ${techMediaAnalysis}`.toLowerCase();

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
    ];

    // Priorizar la marca mencionada en el mensaje actual del técnico; si no, la del caso abierto
    const userBrands = KNOWN_BRANDS.filter((b) => userQueryOnly.toLowerCase().includes(b));
    const caseBrands = KNOWN_BRANDS.filter((b) => fullContextCorpus.includes(b));
    const activeBrands = userBrands.length > 0 ? userBrands : caseBrands;
    const primaryBrand = activeBrands[0] || (targetCase?.marca ? String(targetCase.marca).toLowerCase().trim() : "");

    const modelRegex = /\b([a-z]{1,4}[-][a-z0-9\/-]+|[a-z]{1,3}\d{2,5}[a-z0-9-]*|hikcentral|ivms-?\d+|smartpss|biotime|configtool|sadp|hik-connect)\b/gi;
    const rawModels = [...(userQueryOnly.match(modelRegex) || []), ...(fullContextCorpus.match(modelRegex) || [])];
    const cleanModels = [...new Set(rawModels.map((m) => m.trim().toLowerCase()))].filter(
      (m) =>
        m.length >= 3 &&
        !/^m0000/i.test(m) &&
        !["http", "https", "jpeg", "webm", "html", "case", "auto", "json", "hora", "min", "react", "mp4", "pdf", "png"].includes(m)
    );
    const primaryModel = cleanModels[0] || (targetCase?.modelo && !/^m0000/i.test(targetCase.modelo) ? String(targetCase.modelo).toLowerCase().trim() : "");

    const TECH_KEYWORDS = [
      "contraseña",
      "clave",
      "password",
      "reset",
      "restablecer",
      "desvincular",
      "desvinculacion",
      "desvinculación",
      "grabador",
      "camara",
      "cámara",
      "nvr",
      "dvr",
      "xvr",
      "biometrico",
      "biométrico",
      "offline",
      "desconectado",
      "fuera de linea",
      "pitido",
      "beep",
      "no da video",
      "video loss",
      "pantalla negra",
      "disco",
      "hdd",
      "firmware",
      "sadp",
      "hik-connect",
      "hikconnect",
      "configtool",
      "smartpss",
      "biotime",
      "ivms",
      "puerto",
      "poe",
      "subred",
      "estatica",
      "dhcp",
      "xml",
      "qr",
      "audio",
      "grabacion",
      "grabación",
      "reproduccion",
      "reproducción",
      "alarma",
      " PTZ ",
      "canal",
    ];

    const matchedKeywords = TECH_KEYWORDS.map((k) => k.trim().toLowerCase()).filter((kw) => fullContextCorpus.includes(kw));

    // Tokenizar palabras específicas de la consulta del usuario
    const STOPWORDS = new Set([
      "como", "cómo", "para", "este", "esta", "estos", "estas", "caso", "cliente", "equipo", "tiene", "hacer",
      "hago", "puede", "puedo", "cuando", "donde", "dónde", "cual", "cuál", "porque", "por", "que", "qué",
      "con", "sin", "del", "las", "los", "una", "uno", "unos", "unas", "sobre", "entre", "hasta", "desde",
      "diagnostique", "resuelva", "averia", "avería", "identifique", "reportada", "consulte", "precedentes",
      "similares", "resueltos", "sekunet", "brinde", "procedimiento", "tecnico", "técnico", "exacto", "comprobado",
      "solucionarlo", "inmediato", "hola", "buenas", "tardes", "dias", "días", "ayuda", "favor",
    ]);
    const queryTokens = userQueryOnly
      .toLowerCase()
      .replace(/[^a-záéíóúñ0-9-]/gi, " ")
      .split(/\s+/)
      .filter((w) => w.length >= 4 && !STOPWORDS.has(w));

    // ── 5.1 & 5.2. Consulta en el 100% de la Base de Datos de Casos Resueltos (1,494+ casos) y Manuales Oficiales ──
    let ragContext = "";
    let retrievedKbDocs: { id: string | number; doc_name: string; snippet: string }[] = [];
    let historicalPrecedents = "";
    let topPrecedents: IndexedPrecedent[] = [];

    try {
      const { precedents, docChunks } = await getFullKnowledgeAndCasesIndex(serviceClient);

      // A) Puntuar TODOS los bloques de manuales oficiales y deduplicar estrictamente por doc_name
      const scoredChunks: { chunk: IndexedDocChunk; score: number }[] = [];
      for (const ch of docChunks) {
        let score = 0;
        const docLower = ch.doc_name.toLowerCase();
        const textLower = ch.searchCorpus;

        if (primaryBrand) {
          if (docLower.includes(primaryBrand)) score += 70;
          else if (textLower.includes(primaryBrand)) score += 35;

          const otherBrandInDocTitle = KNOWN_BRANDS.find((b) => b !== primaryBrand && docLower.includes(b));
          if (otherBrandInDocTitle) score -= 120;
        }

        if (primaryModel && textLower.includes(primaryModel)) {
          score += 60;
        }

        for (const kw of matchedKeywords) {
          if (textLower.includes(kw)) score += 15;
        }
        for (const qt of queryTokens) {
          if (textLower.includes(qt)) score += 12;
        }

        if (score >= 25) {
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
          snippet: d.content.substring(0, 480),
        }));

        ragContext = uniqueBestChunks
          .map((d, i) => `[M${i + 1}] Manual Oficial: ${d.doc_name} (Base de conocimiento Sekunet)\n${d.content.substring(0, 650)}`)
          .join("\n\n");
      }

      // B) Puntuar el 100% de los casos cerrados resueltos (1,166+ casos válidos con solución técnica)
      const scoredCases: { prec: IndexedPrecedent; score: number }[] = [];
      for (const p of precedents) {
        if (validCaseId && p.id === validCaseId) continue;

        let score = 0;
        if (primaryBrand) {
          if (p.brand.includes(primaryBrand) || p.equipmentLabel.toLowerCase().includes(primaryBrand)) {
            score += 45;
          } else if (p.searchCorpus.includes(primaryBrand)) {
            score += 30;
          } else {
            const hasCompetingBrand = KNOWN_BRANDS.some(
              (b) => b !== primaryBrand && (p.brand.includes(b) || p.equipmentLabel.toLowerCase().includes(b))
            );
            if (hasCompetingBrand) score -= 50;
          }
        }

        for (const cm of cleanModels.slice(0, 3)) {
          if (p.model.includes(cm) || p.searchCorpus.includes(cm)) {
            score += 65;
          }
        }

        let kwHits = 0;
        for (const kw of matchedKeywords) {
          if (p.searchCorpus.includes(kw)) {
            score += 18;
            kwHits++;
          }
        }

        for (const qt of queryTokens) {
          if (p.searchCorpus.includes(qt)) {
            score += 14;
          }
        }

        // Bonificación por calidad y detalle de la solución técnica
        if (p.solutionText.length > 140) score += 8;
        if (kwHits >= 2 && primaryBrand && p.searchCorpus.includes(primaryBrand)) score += 25;

        if (score >= 25) {
          scoredCases.push({ prec: p, score });
        }
      }

      scoredCases.sort((a, b) => b.score - a.score);
      topPrecedents = scoredCases.slice(0, 4).map((s) => s.prec);

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

    // ── 5.3. Búsqueda Web Técnica en Vivo (Fichas Técnicas, Manuales Oficiales y Foros Especializados) ──
    let webContext = "";
    let retrievedWebResults: { title: string; url: string; snippet: string }[] = [];
    try {
      const detectedKw = matchedKeywords.slice(0, 3).join(" ");
      const cleanUserMsg = userQueryOnly
        .replace(/^(como|cómo|por que|porque|ayuda|cual|cuál|que|qué|donde|dónde|favor|puedes|necesito|hola|buen dia|buenas)\s+/i, "")
        .trim();

      let webQuery = "";
      if (primaryBrand && primaryModel) {
        webQuery = `${primaryBrand} ${primaryModel} ${detectedKw || "manual solucion soporte"}`.trim();
      } else if (primaryBrand && detectedKw) {
        webQuery = `${primaryBrand} ${detectedKw} manual solucion soporte`.trim();
      } else if (primaryModel) {
        webQuery = `${primaryModel} ${detectedKw || "manual solucion soporte"}`.trim();
      } else if (cleanUserMsg.length > 5) {
        webQuery = `${cleanUserMsg} cctv seguridad electronica soporte solucion`.trim();
      } else if (detectedKw) {
        webQuery = `${detectedKw} seguridad electronica cctv solucion soporte`.trim();
      }

      if (webQuery) {
        let webResults = await searchTechnicalWeb(webQuery, 3);
        if (webResults.length === 0 && (primaryBrand || primaryModel)) {
          const fallbackQuery = `${primaryBrand || primaryModel} ${detectedKw || "soporte tecnico solucion"}`.trim();
          webResults = await searchTechnicalWeb(fallbackQuery, 3);
        }

        if (webResults.length > 0) {
          retrievedWebResults = webResults;
          webContext = webResults.map((r, i) => `[W${i + 1}] ${r.title} (${r.url})\n${r.snippet}`).join("\n\n");
        }
      }
    } catch (webErr: any) {
      console.warn("[tech-assistant] Error en búsqueda web en vivo:", webErr?.message);
    }

    // ── 6. System Prompt Maestro del Asistente Técnico ──
    const equipoRegistrado = clienteData?.equipo || (targetCase?.marca ? `${targetCase.marca || ""} ${targetCase.modelo || ""}`.trim() : "");
    const equipoLinea = equipoRegistrado || "No registrado formalmente (consulte la conversación y las fotos)";

    let systemPrompt = `Eres el Asistente Técnico Senior de Sekunet, el copiloto experto para técnicos e ingenieros de soporte de CCTV, control de acceso, alarmas, redes y seguridad electrónica.

Tu función esencial es RESOLVER LA AVERÍA TÉCNICA junto con el técnico, no hacer meros resúmenes pasivos ni explicaciones redundantes de lo que el cliente ya dijo.

Tienes acceso COMPLETO y VISIBILIDAD TOTAL de la conversación del caso que el técnico tiene actualmente abierto en pantalla, incluyendo las fotos enviadas, las transcripciones completas de notas de voz de audio, videos y documentos técnicos analizados, así como los 1,494 casos históricos resueltos en el taller Sekunet.

CONTEXTO DEL CASO ABIERTO EN PANTALLA (A QUIEN LE ESTAMOS DANDO SOPORTE):
- Cliente: ${clienteData?.nombre || "No registrado"}
- Teléfono: ${targetCase?.customer_phone || "No indicado"}
- Cuenta/Empresa: ${clienteData?.cuenta || "No registrada"}
- Canal: ${targetCase?.canal || "WhatsApp"}
- Estado actual: ${targetCase?.estado || "Sin caso específico"}
- Dispositivo registrado: ${equipoLinea}

CONVERSACIÓN CRONOLÓGICA COMPLETA DEL CASO ABIERTO (con transcripciones y análisis de imágenes):
${openCaseConversation || "No hay mensajes registrados en este caso."}
${ragContext ? `\n\nMANUALES OFICIALES EN BASE DE CONOCIMIENTO SEKUNET (RAG):\n${ragContext}` : ""}
${historicalPrecedents ? `\n\nPRECEDENTES HISTÓRICOS REALES RESUELTOS POR TÉCNICOS DE SEKUNET (CONSULTA EN TODA LA BASE DE DATOS):\n${historicalPrecedents}` : ""}
${webContext ? `\n\nBÚSQUEDA WEB EN VIVO (MANUALES OFICIALES, FICHAS TÉCNICAS Y FOROS ESPECIALIZADOS):\n${webContext}` : ""}

REGLAS DE ATENCIÓN TÉCNICA OBLIGATORIAS:
1. MÁXIMA PRIORIDAD A RESOLVER LA AVERÍA: El técnico te consulta para encontrar la SOLUCIÓN EXACTA. Debes fundamentar tu diagnóstico y procedimiento en las soluciones reales comprobadas que los técnicos de Sekunet ya aplicaron en los precedentes de taller Y en la información técnica oficial de manuales y fichas técnicas web.
2. FOCO Y DESTINATARIO: Tu respuesta va dirigida ÚNICA Y EXCLUSIVAMENTE al caso y cliente abierto en pantalla. Nunca menciones nombres de clientes pasados.
3. ESTRUCTURA DE RESOLUCIÓN TÉCNICA (OBLIGATORIA al pedir diagnóstico, análisis o solución):
   Responde con un Plan Técnico Resolutivo estructurado en estas secciones directas (usa el título exacto seguido de dos puntos):
   Falla y Causa Raíz:
   Diagnóstico certero del equipo (marca, modelo exacto) y la causa técnica real del fallo según la evidencia, precedentes y manuales.

   Solución Comprobada en Taller / Documentada:
   Cómo otros técnicos de Sekunet o los manuales del fabricante resolvieron esta avería en casos precedentes.

   Procedimiento de Resolución (Paso a Paso):
   Pasos técnicos numerados (1., 2., 3.) exactos para resolver la falla (herramientas SADP/ConfigTool, comandos, reset por archivo XML/QR, subredes IP, PoE, verificación de voltajes o cables).

   Instrucción Concreta para el Cliente:
   Qué indicación, prueba o dato específico se le debe pedir o indicar al cliente en este momento.
4. NUNCA respondas que el cliente no tiene preguntas basándote en un último mensaje de cortesía. Todo el historial del caso contiene la avería.
5. Si el técnico te pregunta sobre imágenes o audios, responde DIRECTAMENTE con la información técnica visible en las fotos y audios analizados.
6. Comunícate con tono profesional, técnico, directo, seguro y colaborativo ("Pura vida, colega").

REGLAS ESTRICTAS DE FORMATO Y ESTILO (OBLIGATORIAS):
- PROHIBIDO EL USO DE ASTERISCOS: Absolutamente CERO asteriscos. No uses negritas con doble asterisco, ni cursivas con asterisco, ni viñetas de asterisco.
- PROHIBIDO EL USO DE ENCABEZADOS MARKDOWN: No uses símbolos de almohadilla (#, ##, ###) ni líneas de separación (--- o ___).
- VIÑETAS DECENTES: Si vas a enlistar puntos, usa viñetas sencillas con punto ("• ") de un solo nivel. Usa pasos numerados (1., 2., 3.) para procedimientos secuenciales.
- NO escribas corchetes [C1], [M1] ni [W1] dentro de los párrafos del cuerpo de tu respuesta; las fuentes se listan exclusivamente en la línea final "Fuentes consultadas:".`;

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
        timeoutMs: 15_000,
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

    if (isDraftAction) {
      const fuentesUtilizadas: string[] = [];
      if (topPrecedents.length > 0) {
        fuentesUtilizadas.push("Precedentes históricos de Sekunet");
      }
      if (retrievedWebResults.length > 0) {
        fuentesUtilizadas.push("Fichas técnicas y manuales web");
      }
      if (retrievedKbDocs.length > 0) {
        fuentesUtilizadas.push("Manuales técnicos");
      }
      fuentesUtilizadas.push(validCaseId ? "Conversación del caso actual" : "Consulta técnica directa");

      assistantDisplayContent = `${responseText}\n\nFuentes consultadas: ${fuentesUtilizadas.join(", ")}.`;
    } else {
      // Construir siempre la barra de fuentes determinística, limpia y verificada con todos los casos precedentes relevantes hallados en la BD
      const cleanBody = responseText
        .replace(/\n*(?:Fuentes(?:\s+t[eé]cnicas)?\s+consultadas|Fuentes:).*$/is, "")
        .replace(/\s*\[(?:C|M|W)\d+\]/g, "")
        .trim();

      const finalSources: string[] = [];

      // 1. Manuales Oficiales únicos de la Base de Conocimiento Sekunet
      retrievedKbDocs.slice(0, 2).forEach((kd, idx) => {
        finalSources.push(`[M${idx + 1}] Manual Oficial: ${kd.doc_name} (Base de conocimiento Sekunet)`);
      });

      // 2. Hasta 3 Casos Precedentes Reales de la Base de Datos de Sekunet
      topPrecedents.slice(0, 3).forEach((mc, idx) => {
        const cleanDetails = `${mc.equipmentLabel} - ${mc.faultSummary}`.replace(/[()]/g, "");
        finalSources.push(`[C${idx + 1}] Caso Sekunet #${mc.shortId} resuelto por ${mc.resolverName} (${cleanDetails})`);
      });

      // 3. Hasta 2 Fuentes Web Oficiales en Vivo
      retrievedWebResults.slice(0, 2).forEach((wr, idx) => {
        const safeTitle = wr.title.replace(/[()]/g, "").trim();
        finalSources.push(`[W${idx + 1}] ${safeTitle} (${wr.url})`);
      });

      if (validCaseId) {
        finalSources.push("Conversación del caso actual");
      }

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

async function searchTechnicalWeb(
  query: string,
  limit = 3
): Promise<{ title: string; url: string; snippet: string }[]> {
  try {
    const res = await fetch("https://lite.duckduckgo.com/lite/", {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
      },
      body: new URLSearchParams({ q: query }).toString(),
      signal: AbortSignal.timeout(7000),
    });
    if (res.ok) {
      const text = await res.text();
      const results: { title: string; url: string; snippet: string }[] = [];
      const seenDomains = new Set<string>();
      const linkMatches = [...text.matchAll(/<a[^>]+href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/gi)];
      for (const m of linkMatches) {
        let rawUrl = m[1];
        if (rawUrl.includes("uddg=")) {
          const matchUddg = rawUrl.match(/[?&]uddg=([^&]+)/);
          if (matchUddg) rawUrl = decodeURIComponent(matchUddg[1]);
        }
        const title = m[2].replace(/<[^>]+>/g, "").trim();
        if (
          rawUrl.startsWith("http") &&
          !rawUrl.includes("duckduckgo.com") &&
          title.length > 4 &&
          !title.toLowerCase().includes("siguiente") &&
          !title.toLowerCase().includes("buscar")
        ) {
          let domain = "";
          try {
            domain = new URL(rawUrl).hostname.replace(/^www\./, "");
          } catch {
            domain = rawUrl;
          }
          if (!seenDomains.has(rawUrl)) {
            seenDomains.add(rawUrl);
            results.push({
              title,
              url: rawUrl,
              snippet: `Documentación técnica (${domain}): ${title}`,
            });
            if (results.length >= limit) break;
          }
        }
      }
      if (results.length > 0) return results;
    }
  } catch (err: any) {
    console.warn("[tech-assistant] Error en DuckDuckGo Lite search:", err?.message);
  }

  try {
    const gUrl = `https://www.google.com/search?q=${encodeURIComponent(query)}&hl=es`;
    const gRes = await fetch(gUrl, {
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
      },
      signal: AbortSignal.timeout(5000),
    });
    if (gRes.ok) {
      const gHtml = await gRes.text();
      const results: { title: string; url: string; snippet: string }[] = [];
      const gMatches = gHtml.matchAll(/<a[^>]*href="([^"]*)"[^>]*><h3[^>]*>([\s\S]*?)<\/h3>/gi);
      for (const m of gMatches) {
        let url = m[1];
        if (url.includes("/url?q=")) {
          const qMatch = url.match(/[?&]q=([^&]+)/);
          if (qMatch) url = decodeURIComponent(qMatch[1]);
        }
        const title = m[2].replace(/<[^>]+>/g, "").trim();
        if (title && url.startsWith("http") && !url.includes("google.com")) {
          results.push({ title, url, snippet: `Documentación técnica oficial: ${title}` });
          if (results.length >= limit) break;
        }
      }
      if (results.length > 0) return results;
    }
  } catch (gErr: any) {
    console.warn("[tech-assistant] Error en Google fallback:", gErr?.message);
  }

  return [];
}
