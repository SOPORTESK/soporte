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
    const { message, case_id, messages: clientMessages, mediaUrl, mediaType, fileName } = await req.json();

    if ((!message || typeof message !== "string" || !message.trim()) && (!mediaUrl || typeof mediaUrl !== "string")) {
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
      if (case_id.startsWith("tel:")) {
        const phone = case_id.substring(4).trim();
        const { data: casesForPhone } = await serviceClient
          .from("sek_cases")
          .select("id, estado, created_at, canal, customer_phone, cliente, histcliente, histtecnico, title, marca, modelo")
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
        const rawId = case_id.startsWith("case:") ? case_id.substring(5) : case_id;
        const { data: caseData } = await serviceClient
          .from("sek_cases")
          .select("id, estado, created_at, canal, customer_phone, cliente, histcliente, histtecnico, title, marca, modelo")
          .eq("id", rawId)
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
              .select("id, estado, created_at, canal, customer_phone, cliente, histcliente, histtecnico, title, marca, modelo")
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

      // Analizar adjuntos pendientes (imágenes, audios, videos, documentos)
      const allMsgs = [...histCliente, ...histTecnico];
      const attachments = allMsgs.filter((m: any) => m.mediaUrl && typeof m.mediaUrl === "string");

      if (attachments.length > 0) {
        let changed = false;
        for (const att of attachments) {
          let analysis = att._visionAnalysis || "";
          if (!analysis || analysis.includes("[ANÁLISIS DE ADJUNTO NO DISPONIBLE")) {
            console.log(`[tech-assistant] Analizando adjunto pendiente en caso ${validCaseId}:`, att.mediaUrl);
            const result = await analyzeMedia(att.mediaUrl, att.mediaType, att.content || "", att.fileName || "");
            if (result) {
              analysis = result;
              const patch = (m: any) => (m.mediaUrl === att.mediaUrl ? { ...m, _visionAnalysis: analysis } : m);
              for (let i = 0; i < histCliente.length; i++) histCliente[i] = patch(histCliente[i]);
              for (let i = 0; i < histTecnico.length; i++) histTecnico[i] = patch(histTecnico[i]);
              changed = true;
            }
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

    const now = new Date().toISOString();
    const userMsgContent = techMediaAnalysis
      ? `${(message || "").trim()}\n\n[ANÁLISIS DEL ARCHIVO ADJUNTO DEL TÉCNICO (${fileName || mediaType || "archivo"})]:\n${techMediaAnalysis}`.trim()
      : (message || "").trim();

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
    const lastUserQuery = (message || "").trim();
    let ragContext = "";
    if (lastUserQuery.length >= 3) {
      try {
        const normalized = lastUserQuery.toLowerCase().replace(/[^a-z0-9\s\-áéíóúñ]/gi, "");
        const terms = normalized.split(/\s+/).filter((t: string) => t.length >= 3);
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

    // ── 6. System Prompt Maestro del Asistente Técnico ──
    const equipoRegistrado = clienteData?.equipo || (targetCase?.marca ? `${targetCase.marca || ""} ${targetCase.modelo || ""}`.trim() : "");
    const equipoLinea = equipoRegistrado || "No registrado formalmente (consulte la conversación y las fotos)";

    const systemPrompt = `Eres el Asistente Técnico Senior de Sekunet, el copiloto experto para técnicos e ingenieros de soporte de CCTV, control de acceso, alarmas, redes y seguridad electrónica.

Tienes acceso COMPLETO y VISIBILIDAD TOTAL de la conversación del caso que el técnico tiene actualmente abierto en pantalla, incluyendo las fotos enviadas, las transcripciones completas de notas de voz de audio, videos y documentos técnicos analizados.

CONTEXTO DEL CASO ABIERTO EN PANTALLA:
- Cliente: ${clienteData?.nombre || "No registrado"}
- Teléfono: ${targetCase?.customer_phone || "No indicado"}
- Cuenta/Empresa: ${clienteData?.cuenta || "No registrada"}
- Canal: ${targetCase?.canal || "WhatsApp"}
- Estado actual: ${targetCase?.estado || "Sin caso específico"}
- Dispositivo registrado: ${equipoLinea}

CONVERSACIÓN CRONOLÓGICA COMPLETA DEL CASO ABIERTO (con transcripciones y análisis de imágenes):
${openCaseConversation || "No hay mensajes registrados en este caso."}
${ragContext ? `\n\nINFORMACIÓN DE LA BASE DE CONOCIMIENTO (RAG):\n${ragContext}` : ""}

REGLAS DE ATENCIÓN TÉCNICA OBLIGATORIAS:
1. Conoces a fondo toda la conversación del caso abierto, lo que el cliente dijo en texto y en notas de voz, y las imágenes que envió.
2. Si el técnico te pide un análisis del caso, o si la pregunta es sobre el caso en general (por ejemplo: "y el analisis del caso?", "analice el caso", "qué tiene?", "diagnóstico", "resumen del caso", etc.), o al iniciar un análisis del caso:
   DEBES responder con un **Análisis Técnico Integral del Caso** estructurado así:
   - **Equipo y Síntoma:** Marca, modelo exacto y qué falla o problema presenta el equipo según el cliente.
   - **Evidencia en Adjuntos:** Qué se ve en las fotos (etiquetas, modelo, leds, cableado, estado físico) o qué se escuchó en los audios transcritos.
   - **Diagnóstico Técnico y Pruebas:** Pruebas que ya se realizaron (ej. cambio de fuente de poder, reinicios) y la causa raíz técnica más probable (ej. daño interno en tarjeta madre/display, firmware, etc.).
   - **Estado Actual y Próximos Pasos:** En qué quedó la conversación con el cliente (ej. coordinar recepción en taller de Sekunet para revisión de hardware, garantía, cotización, etc.).
3. NUNCA respondas que el cliente no tiene preguntas o no reportó problemas basándote únicamente en el último mensaje de cortesía ("gracias", "de acuerdo programaré el envío", etc.). Todo el caso abierto contiene el contexto de la avería.
4. Si el técnico te pregunta sobre las imágenes o los audios (por ejemplo: "vea las imagenes", "el audio?", "qué problema tiene?", "cómo lo solucionamos?", "qué le respondo?"), responde DIRECTAMENTE y con precisión técnica basándote en los análisis y transcripciones que tienes en este contexto.
5. NUNCA digas que no dispones de los archivos ni que el sistema no ha registrado adjuntos cuando están presentes en el contexto.
6. Entrega diagnósticos certeros, marcas, modelos (ej. terminales ZKTeco, cámaras Hikvision, etc.), números de parte, especificaciones eléctricas y pasos claros de resolución.
7. Comunícate con tono profesional, técnico, colaborativo y con calidez costarricense ("Pura vida, colega").`;

    // ── 7. Generar respuesta con IA (Google Gemini 3.5 Flash Lite / 3.6 Flash / Config Chaining) ──
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
        timeoutMs: 60_000,
      });

      if (aiGen?.text) {
        responseText = aiGen.text.trim();
        console.log(`[tech-assistant] Respuesta generada exitosamente con ${aiGen.provider}/${aiGen.modelo}`);
      }
    } catch (aiErr: any) {
      console.error("[tech-assistant] Error generando respuesta:", aiErr?.message);
    }

    const assistantMsg: TechMessage = {
      role: "assistant",
      content: responseText,
      time: new Date().toISOString(),
    };
    const finalMessages = [...updatedMessages, assistantMsg];

    return NextResponse.json({
      ok: true,
      response: responseText,
      messages: finalMessages,
    });
  } catch (e: any) {
    console.error("[tech-assistant] error general:", e.message);
    return NextResponse.json({ error: e?.message || "Error inesperado" }, { status: 500 });
  }
}
