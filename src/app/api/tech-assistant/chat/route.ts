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

export async function POST(req: NextRequest) {
  try {
    const { message, case_id, messages: clientMessages, mediaUrl, mediaType, fileName, action, displayMessage } = await req.json();

    if ((!message || typeof message !== "string" || !message.trim()) && (!mediaUrl || typeof mediaUrl !== "string") && action !== "draft_client_reply") {
      return NextResponse.json({ error: "Mensaje o adjunto requerido" }, { status: 400 });
    }

    const messages: TechMessage[] = Array.isArray(clientMessages) ? clientMessages as TechMessage[] : [];

    const supabase = createClient();
    const { data: { user } } = await supabase.auth.getUser();
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
          // Prioridad A: caso actualmente activo / abierto
          const openCase = casesForPhone.find(c =>
            ["abierto", "escalado", "ia_atendiendo", "calificacion_pendiente"].includes(String(c.estado || "").toLowerCase())
          );
          if (openCase) {
            targetCase = openCase;
            validCaseId = openCase.id;
          } else {
            // Prioridad B: si todos están cerrados, el caso con adjuntos o conversación sustancial
            const caseWithContent = casesForPhone.find(c => {
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

          // Si el caso tiene poco o ningún historial (ej: stub de cierre), pero el cliente tiene teléfono,
          // buscar el caso hermano que contiene la conversación real y los adjuntos
          const histLen = (Array.isArray(caseData.histcliente) ? caseData.histcliente.length : 0) +
                          (Array.isArray(caseData.histtecnico) ? caseData.histtecnico.length : 0);
          if (histLen <= 2 && caseData.customer_phone) {
            const { data: siblingCases } = await serviceClient
              .from("sek_cases")
              .select("id, estado, created_at, canal, customer_phone, cliente, histcliente, histtecnico, title, marca, modelo, problema, resolucion")
              .ilike("customer_phone", `%${caseData.customer_phone}%`)
              .order("created_at", { ascending: false })
              .limit(6);

            const caseWithMore = siblingCases?.find(c => {
              const count = (Array.isArray(c.histcliente) ? c.histcliente.length : 0) +
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

      // Analizar adjuntos pendientes (máximo los 2 más recientes para evitar latencias altas)
      const allMsgs = [...histCliente, ...histTecnico];
      const attachments = allMsgs.filter((m: any) => m.mediaUrl && typeof m.mediaUrl === "string");

      if (attachments.length > 0) {
        let changed = false;
        const pendingAttachments = attachments.filter(
          (m: any) => !m._visionAnalysis || m._visionAnalysis.includes("[ANÁLISIS DE ADJUNTO NO DISPONIBLE")
        ).slice(-2);

        for (const att of pendingAttachments) {
          try {
            console.log(`[tech-assistant] Analizando adjunto pendiente en caso ${validCaseId}:`, att.mediaUrl);
            const result = await Promise.race([
              analyzeMedia(att.mediaUrl, att.mediaType, att.content || "", att.fileName || ""),
              new Promise<null>((r) => setTimeout(() => r(null), 5000))
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
          console.log(`[tech-assistant] Análisis de adjuntos actualizado en sek_cases para caso ${validCaseId}`);
        }
      }

      // ── 3. Construir la transcripción cronológica completa de la conversación abierta ──
      const allEvents = [
        ...histCliente.map((m: any, idx: number) => ({
          ...m,
          speaker: "Cliente",
          time: m.time || "",
          sortKey: typeof m.seq === "number" ? m.seq : (m.time ? new Date(m.time).getTime() : idx),
        })),
        ...histTecnico.map((m: any, idx: number) => ({
          ...m,
          speaker: m.role === "ia" ? "Asistente Virtual" : (m.author ? `Técnico (${m.author})` : "Técnico"),
          time: m.time || "",
          sortKey: typeof m.seq === "number" ? m.seq : (m.time ? new Date(m.time).getTime() : 1000 + idx),
        })),
      ].sort((a, b) => a.sortKey - b.sortKey);

      const transcriptLines: string[] = [];
      for (const m of allEvents) {
        const timeStr = m.time ? new Date(m.time).toLocaleTimeString("es-CR", { hour: "2-digit", minute: "2-digit" }) : "";
        let line = `[${timeStr}] ${m.speaker}: ${m.content || ""}`.trim();
        if (m.mediaUrl) {
          const kind = m.mediaType?.startsWith("audio/") ? "Nota de voz / Audio"
            : m.mediaType?.startsWith("image/") ? "Imagen"
            : m.mediaType?.startsWith("video/") ? "Video"
            : (m.fileName || m.mediaType || "Documento adjunto");
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
        console.log("[tech-assistant] Analizando adjunto directo del técnico:", mediaUrl);
        const result = await analyzeMedia(mediaUrl, mediaType, message, fileName);
        if (result) {
          techMediaAnalysis = result;
        }
      } catch (err: any) {
        console.warn("[tech-assistant] Error analizando adjunto del técnico:", err?.message);
      }
    }

    const isDraftAction = action === "draft_client_reply" ||
      (typeof message === "string" && message.includes("Instrucciones de atención al cliente") && message.includes("Redacte la respuesta para el cliente"));

    const displayMsg = displayMessage || (isDraftAction
      ? "Redactar propuesta de respuesta para el cliente basada en el caso abierto"
      : (message || "").trim());

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

    // ── 5. Búsqueda RAG en base de conocimiento ──
    const effectiveQuery = isDraftAction
      ? `${targetCase?.problema || targetCase?.title || targetCase?.marca || ""} ${targetCase?.modelo || ""}`.trim()
      : (message || "").trim();

    let ragContext = "";
    if (effectiveQuery.length >= 3) {
      try {
        const normalized = effectiveQuery.toLowerCase().replace(/[^a-z0-9\s\-áéíóúñ]/gi, "");
        const terms = normalized.split(/\s+/).filter((t: string) => t.length >= 3 && !["como", "donde", "para", "este", "esta", "tiene", "favor", "puede", "hola", "redactar", "respuesta", "cliente", "propuesta", "basada", "abierto"].includes(t));
        if (terms.length > 0) {
          const orFilter = terms.slice(0, 5).map((t: string) => `content.ilike.%${t}%`).join(",");
          const { data: ragData } = await serviceClient
            .from("sek_doc_chunks")
            .select("content,doc_name")
            .or(orFilter)
            .limit(3);
          if (ragData && ragData.length > 0) {
            ragContext = ragData.map((d: any, i: number) => `[Doc ${i + 1}: ${d.doc_name || "Sekunet"}]\n${d.content}`).join("\n\n");
          }
        }
      } catch (ragErr: any) {
        console.warn("[tech-assistant] Error buscando RAG:", ragErr?.message);
      }
    }

    // ── 5.1. Búsqueda inteligente en históricos de casos resueltos (Precedentes técnicos) ──
    let historicalPrecedents = "";
    try {
      const searchTerms: string[] = [];

      // A. Extraer marca y modelo del caso registrado
      if (targetCase?.marca) searchTerms.push(String(targetCase.marca).trim());
      if (targetCase?.modelo) searchTerms.push(String(targetCase.modelo).trim());

      // B. Extraer marcas y modelos reconocidos del texto de la conversación y adjuntos
      const corpus = `${targetCase?.title || ""} ${targetCase?.problema || ""} ${openCaseConversation} ${(message || "")}`.toLowerCase();
      
      const KNOWN_BRANDS = [
        "hikvision", "dahua", "zkteco", "zk", "honeywell", "ubiquiti", "mikrotik",
        "hilook", "ezviz", "imou", "dsc", "paradox", "axis", "uniview", "epcom"
      ];
      for (const brand of KNOWN_BRANDS) {
        if (corpus.includes(brand) && !searchTerms.map(s => s.toLowerCase()).includes(brand)) {
          searchTerms.push(brand);
        }
      }

      // C. Extraer palabras clave técnicas de síntomas y fallas frecuentes del taller
      const TECH_KEYWORDS = [
        "contraseñ", "clave", "password", "reset", "desvincul", "grabador",
        "camara", "cámara", "nvr", "dvr", "biometrico", "biométrico", "offline",
        "desconectado", "fuera de linea", "pitido", "beep", "no da video", "video loss",
        "pantalla negra", "disco", "hdd", "firmware", "sadp", "hik-connect", "hikconnect",
        "puerto", "poe", "subred", "estatica", "dhcp", "ip"
      ];
      for (const kw of TECH_KEYWORDS) {
        if (corpus.includes(kw) && !searchTerms.some(s => s.toLowerCase().includes(kw))) {
          searchTerms.push(kw);
          if (searchTerms.length >= 6) break;
        }
      }

      // D. Extraer modelos técnicos detectados (patrones alfanuméricos como DS-2CD..., K40, etc.)
      const modelMatches = corpus.match(/\b([a-z]{1,4}[-][a-z0-9\/-]+|[a-z]{1,3}\d{2,5}[a-z0-9-]*)\b/gi) || [];
      const cleanModels = [...new Set(modelMatches.map(m => m.trim().toLowerCase()))]
        .filter(m => m.length >= 3 && !["http", "https", "jpeg", "webm", "html", "case", "auto", "json", "hora", "min"].includes(m));
      for (const cm of cleanModels.slice(0, 3)) {
        if (!searchTerms.map(s => s.toLowerCase()).includes(cm)) {
          searchTerms.push(cm);
        }
      }

      let matchedCases: any[] = [];

      if (searchTerms.length > 0) {
        let query = serviceClient
          .from("sek_cases")
          .select("id, title, marca, modelo, problema, resolucion, histtecnico, closed_at")
          .eq("estado", "cerrado");

        if (validCaseId) {
          query = query.neq("id", validCaseId);
        }

        const orConditions = searchTerms.map(t => 
          `resolucion.ilike.%${t}%,problema.ilike.%${t}%,title.ilike.%${t}%,modelo.ilike.%${t}%`
        ).join(",");

        const { data: directCases } = await query
          .or(orConditions)
          .order("closed_at", { ascending: false })
          .limit(30);

        if (directCases && directCases.length > 0) {
          matchedCases = directCases;
        }
      }

      // Si la búsqueda específica no arrojó resultados, respaldo con los casos cerrados con soluciones técnicas más recientes del taller
      if (matchedCases.length === 0) {
        let fallbackQuery = serviceClient
          .from("sek_cases")
          .select("id, title, marca, modelo, problema, resolucion, histtecnico, closed_at")
          .eq("estado", "cerrado")
          .not("resolucion", "is", null);

        if (validCaseId) {
          fallbackQuery = fallbackQuery.neq("id", validCaseId);
        }

        const { data: recentClosed } = await fallbackQuery
          .order("closed_at", { ascending: false })
          .limit(15);

        if (recentClosed && recentClosed.length > 0) {
          matchedCases = recentClosed;
        }
      }

      if (matchedCases.length > 0) {
        const precedentSnippets: string[] = [];
        for (let idx = 0; idx < Math.min(matchedCases.length, 10); idx++) {
          const mc = matchedCases[idx];
          let solText = (mc.resolucion || mc.problema || "").trim();

          if (solText.length < 30 && Array.isArray(mc.histtecnico) && mc.histtecnico.length > 0) {
            const lastTecMsg = mc.histtecnico
              .filter((m: any) => m.content && typeof m.content === "string" && m.content.length > 25)
              .slice(-1)[0];
            if (lastTecMsg?.content) {
              solText = lastTecMsg.content.trim();
            }
          }

          if (solText) {
            const eq = `${mc.marca || "Equipo"} ${mc.modelo || ""}`.trim();
            precedentSnippets.push(
              `[C${idx + 1}] Caso #${mc.id.substring(0, 8)} (${eq || "General"} | Falla: ${mc.title || mc.problema || "Avería resuelta"})
Solución técnica comprobada: ${solText.substring(0, 500)}`
            );
          }
        }

        if (precedentSnippets.length > 0) {
          historicalPrecedents = precedentSnippets.join("\n\n");
        }
      }
    } catch (histErr: any) {
      console.warn("[tech-assistant] Error consultando históricos precedentes:", histErr?.message);
    }

    // ── 5.2. Búsqueda Web Técnica en Vivo (Fichas Técnicas, Manuales Oficiales y Foros Especializados) ──
    let webContext = "";
    try {
      const corpusForWeb = `${targetCase?.title || ""} ${targetCase?.problema || ""} ${openCaseConversation} ${(message || "")}`.toLowerCase();
      const detectedBrand = [
        "hikvision", "dahua", "zkteco", "ubiquiti", "mikrotik", "hilook", "ezviz", "imou", "dsc", "paradox", "axis", "uniview"
      ].find(b => corpusForWeb.includes(b)) || (targetCase?.marca ? String(targetCase.marca).trim() : "");

      const modelMatches = corpusForWeb.match(/\b([a-z]{1,4}[-][a-z0-9\/-]+|[a-z]{1,3}\d{2,5}[a-z0-9-]*)\b/gi) || [];
      const cleanModels = [...new Set(modelMatches.map(m => m.trim().toLowerCase()))]
        .filter(m => m.length >= 3 && !["http", "https", "jpeg", "webm", "html", "case", "auto", "json", "hora", "min", "react"].includes(m));
      const detectedModel = cleanModels[0] || (targetCase?.modelo ? String(targetCase.modelo).trim() : "");

      const detectedKw = [
        "contraseña", "clave", "password", "reset", "desvincular", "pitido", "beep",
        "no da video", "video loss", "pantalla negra", "disco no detectado", "hdd",
        "firmware", "sadp", "configtool", "hik-connect", "smartpss", "biotime", "offline", "poe"
      ].find(k => corpusForWeb.includes(k)) || "";

      const queryParts = [detectedBrand, detectedModel, detectedKw].filter(Boolean);
      if (detectedModel || (detectedBrand && detectedKw)) {
        const webQuery = `${queryParts.join(" ")} solucion manual datasheet`.trim();
        console.log(`[tech-assistant] 🌐 Ejecutando búsqueda web técnica en vivo: "${webQuery}"`);
        const webResults = await searchTechnicalWeb(webQuery, 4);
        if (webResults.length > 0) {
          const webSnippets: string[] = [];
          webResults.forEach((r, i) => {
            webSnippets.push(`[W${i + 1}] ${r.title} (${r.url})\n${r.snippet}`);
          });
          webContext = webSnippets.join("\n\n");
          console.log(`[tech-assistant] 🌐 Búsqueda web exitosa: ${webResults.length} fuentes encontradas`);
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

Tienes acceso COMPLETO y VISIBILIDAD TOTAL de la conversación del caso que el técnico tiene actualmente abierto en pantalla, incluyendo las fotos enviadas, las transcripciones completas de notas de voz de audio, videos y documentos técnicos analizados.

CONTEXTO DEL CASO ABIERTO EN PANTALLA (A QUIEN LE ESTAMOS DANDO SOPORTE):
- Cliente: ${clienteData?.nombre || "No registrado"}
- Teléfono: ${targetCase?.customer_phone || "No indicado"}
- Cuenta/Empresa: ${clienteData?.cuenta || "No registrada"}
- Canal: ${targetCase?.canal || "WhatsApp"}
- Estado actual: ${targetCase?.estado || "Sin caso específico"}
- Dispositivo registrado: ${equipoLinea}

CONVERSACIÓN CRONOLÓGICA COMPLETA DEL CASO ABIERTO (con transcripciones y análisis de imágenes):
${openCaseConversation || "No hay mensajes registrados en este caso."}
${ragContext ? `\n\nMANUALES Y BASE DE CONOCIMIENTO (RAG):\n${ragContext}` : ""}
${historicalPrecedents ? `\n\nPRECEDENTES HISTÓRICOS Y SOLUCIONES DE OTROS TÉCNICOS EN SEKUNET (BASE DE CONOCIMIENTO DEL TALLER):\n${historicalPrecedents}` : ""}
${webContext ? `\n\nBÚSQUEDA WEB EN VIVO (MANUALES OFICIALES, FICHAS TÉCNICAS Y FOROS ESPECIALIZADOS):\n${webContext}` : ""}

REGLAS DE ATENCIÓN TÉCNICA OBLIGATORIAS:
1. MÁXIMA PRIORIDAD A RESOLVER LA AVERÍA: El técnico te consulta para encontrar la SOLUCIÓN EXACTA. Debes fundamentar tu diagnóstico y procedimiento en las soluciones reales comprobadas que los técnicos de Sekunet ya aplicaron en los precedentes de taller Y en la información técnica oficial de manuales y fichas técnicas web.
2. FOCO Y DESTINATARIO: Tu respuesta va dirigida ÚNICA Y EXCLUSIVAMENTE al caso y cliente abierto en pantalla. Nunca menciones nombres ni fechas de casos pasados.
3. ESTRUCTURA DE RESOLUCIÓN TÉCNICA (OBLIGATORIA al pedir diagnóstico, análisis o solución):
   No des explicaciones teóricas vacías. Responde con un Plan Técnico Resolutivo estructurado en estas secciones directas:
   • Falla y Causa Raíz: Diagnóstico certero del equipo (marca, modelo exacto) y la causa técnica real del fallo según la evidencia, precedentes y manuales.
   • Solución Comprobada en Taller / Documentada: Cómo otros técnicos de Sekunet o los manuales del fabricante resolvieron esta avería.
   • Procedimiento de Resolución (Paso a Paso): Pasos técnicos exactos para resolver la falla (herramientas SADP/ConfigTool, comandos, reset por archivo XML, subredes IP, PoE, verificación de voltajes o cables).
   • Instrucción Concreta para el Cliente: Qué indicación, prueba o dato específico se le debe pedir al cliente en este momento.
4. NUNCA respondas que el cliente no tiene preguntas basándote en un último mensaje de cortesía. Todo el historial del caso contiene la avería.
5. Si el técnico te pregunta sobre imágenes o audios, responde DIRECTAMENTE con la información técnica visible en las fotos y audios analizados.
6. Comunícate con tono profesional, técnico, directo, seguro y colaborativo ("Pura vida, colega").

REGLAS ESTRICTAS DE FORMATO Y ESTILO (OBLIGATORIAS):
- PROHIBIDO EL USO DE ASTERISCOS: Absolutamente CERO asteriscos. No uses negritas con doble asterisco (**texto**), ni cursivas con asterisco (*texto*), ni viñetas de asterisco (* punto).
- PROHIBIDO EL USO DE ENCABEZADOS MARKDOWN: No uses símbolos de almohadilla (#, ##, ###) ni líneas de separación (--- o ___).
- VIÑETAS DECENTES: Si vas a enlistar puntos, usa viñetas sencillas con punto ("• ") de un solo nivel, sin sangrías complejas ni anidamientos. Usa pasos numerados (1., 2., 3.) únicamente si estás detallando un procedimiento secuencial.

CITACIÓN OBLIGATORIA DE FUENTES REALES (UNA SOLA LÍNEA AL FINAL):
- Al final de tu respuesta hacia el técnico, incluye EXACTAMENTE UNA SOLA LÍNEA con las fuentes reales consultadas con sus identificadores específicos. NUNCA uses frases genéricas de relleno como "Precedente similar (modelo y falla)".
  Ejemplo con precedentes y web: Fuentes consultadas: [C1] Caso Sekunet #a18f23 (Hikvision DS-7208 - Falla pitido disco), [W1] Manual oficial Hikvision (hikvision.com), Conversación del caso actual.
  Ejemplo con solo precedentes: Fuentes consultadas: [C1] Caso Sekunet #b491ec (ZKTeco K40 - Reset clave administrador), Conversación del caso actual.
  Ejemplo con solo web: Fuentes consultadas: [W1] Ficha técnica oficial (hikvision.com), Conversación del caso actual.
  Si solo se usó el hilo actual: Fuentes consultadas: Conversación y adjuntos del caso actual.
- Cero corchetes ni llamadas de fuentes a mitad de frase en la redacción; las fuentes van únicamente en esa línea final limpia.`;

    if (isDraftAction) {
      systemPrompt += `\n\nOBJETIVO INMEDIATO PARA ESTA INTERVENCIÓN:
El técnico solicitó redactar la propuesta de respuesta que él enviará directamente al cliente en el chat.
PAUTAS ESTRICTAS DE REDACCIÓN DE LA RESPUESTA PARA EL CLIENTE:
- Responda con un tono profesional, humano, cercano, cordial y resolutivo.
- Lenguaje sencillo y claro. Evite explicaciones innecesarias o respuestas excesivamente largas.
- Adáptese al contexto del caso abierto, a la avería reportada y al último mensaje del cliente.
- NO use lenguaje robótico ni emojis excesivos.
- Sustente los pasos en las soluciones técnicas comprobadas de los precedentes.
- CERO ASTERISCOS: Redacte en texto plano limpio sin negritas de asterisco (** ni *), sin encabezados con # y con viñetas decentes ("• ").
- NO INCLUYAS la línea de fuentes consultadas en este texto, ya que el mensaje va dirigido al cliente final.
- DEVUELVA ÚNICAMENTE el texto que el técnico debe enviarle al cliente. No incluya introducciones como "Aquí tiene la respuesta:" ni notas dirigidas al técnico.`;
    }

    // ── 7. Generar respuesta con IA (Multi-provider Fallback Chain) ──
    let responseText = "Disculpe, no pude obtener una respuesta en este momento.";

    try {
      const aiGen = await generateText("chat", {
        system: systemPrompt,
        messages: updatedMessages.map(m => ({
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
      if (historicalPrecedents) {
        fuentesUtilizadas.push("Precedentes históricos de Sekunet");
      }
      if (webContext) {
        fuentesUtilizadas.push("Fichas técnicas y manuales web");
      }
      if (ragContext) {
        fuentesUtilizadas.push("Manuales técnicos");
      }
      fuentesUtilizadas.push("Conversación del caso actual");
      
      assistantDisplayContent = `${responseText}\n\nFuentes consultadas: ${fuentesUtilizadas.join(", ")}.`;
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
    // Eliminar líneas divisorias tipo ---, ___, ***
    .replace(/^[ \t]*[-*_]{3,}[ \t]*$/gm, "")
    // Eliminar encabezados markdown (# Título, ## Título, ### Título)
    .replace(/^[ \t]*#{1,6}[ \t]+/gm, "")
    // Normalizar viñetas decentes: convertir "- " o "* " o "+ " al inicio de línea en viñeta limpia "• "
    .replace(/^[ \t]*[-*+][ \t]+/gm, "• ")
    // Eliminar negritas/cursivas con asteriscos (**texto** o *texto* manteniendo el contenido)
    .replace(/\*{1,3}([^*\n]+?)\*{1,3}/g, (_, content) => content)
    // Eliminar cualquier asterisco residual
    .replace(/\*/g, "")
    // Limpiar saltos de línea excesivos (máximo 2 seguidos)
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

async function searchTechnicalWeb(
  query: string,
  limit = 4
): Promise<{ title: string; url: string; snippet: string }[]> {
  try {
    const url = `https://html.duckduckgo.com/html/?q=${encodeURIComponent(query)}`;
    const res = await fetch(url, {
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
        Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
      },
      signal: AbortSignal.timeout(5000),
    });
    if (!res.ok) return [];
    const html = await res.text();
    const results: { title: string; url: string; snippet: string }[] = [];

    const blocks = html.split(/<div class="result\s+/i);
    for (const block of blocks.slice(1)) {
      const titleMatch = block.match(/<a[^>]*class="result__a"[^>]*>([\s\S]*?)<\/a>/i);
      const snippetMatch = block.match(/<a[^>]*class="result__snippet"[^>]*href="([^"]*)"[^>]*>([\s\S]*?)<\/a>/i);

      if (titleMatch) {
        const title = titleMatch[1].replace(/<[^>]+>/g, "").trim();
        let targetUrl = "";
        let snippet = "";
        if (snippetMatch) {
          const rawHref = snippetMatch[1];
          const uddgMatch = rawHref.match(/[?&]uddg=([^&]+)/);
          targetUrl = uddgMatch ? decodeURIComponent(uddgMatch[1]) : rawHref;
          snippet = snippetMatch[2].replace(/<[^>]+>/g, "").trim();
        }
        if (title && snippet) {
          results.push({ title, url: targetUrl, snippet });
          if (results.length >= limit) break;
        }
      }
    }
    return results;
  } catch (err: any) {
    console.warn("[tech-assistant] Error en searchTechnicalWeb:", err?.message);
    return [];
  }
}

