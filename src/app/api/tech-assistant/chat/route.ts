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

    // Validar case_id: resolver claves de agrupación tel: y case:
    let validCaseId: string | null = null;
    if (case_id) {
      if (case_id.startsWith("tel:")) {
        const phone = case_id.substring(4).trim();
        // Priorizar casos abiertos/escalados del mismo teléfono
        const { data: openCase } = await serviceClient
          .from("sek_cases")
          .select("id")
          .ilike("customer_phone", `%${phone}%`)
          .in("estado", ["abierto", "escalado", "ia_atendiendo"])
          .order("created_at", { ascending: false })
          .limit(1)
          .maybeSingle();
        if (openCase) {
          validCaseId = openCase.id;
        } else {
          // Fallback: caso más reciente de ese teléfono
          const { data: recentCase } = await serviceClient
            .from("sek_cases")
            .select("id")
            .ilike("customer_phone", `%${phone}%`)
            .order("created_at", { ascending: false })
            .limit(1)
            .maybeSingle();
          if (recentCase) validCaseId = recentCase.id;
        }
      } else if (case_id.startsWith("case:")) {
        const { data: caseData } = await serviceClient
          .from("sek_cases")
          .select("id")
          .eq("id", case_id.substring(5))
          .maybeSingle();
        if (caseData) validCaseId = caseData.id;
      } else {
        const { data: caseData } = await serviceClient
          .from("sek_cases")
          .select("id")
          .eq("id", case_id)
          .maybeSingle();
        if (caseData) validCaseId = caseData.id;
      }
    }

    // ── Pre-análisis y caché de archivos adjuntos del caso ──
    let caseAttachmentNotes = "";
    if (validCaseId) {
      try {
        const { data: caso } = await serviceClient
          .from("sek_cases")
          .select("id, histcliente, histtecnico")
          .eq("id", validCaseId)
          .maybeSingle();

        if (caso) {
          const histCliente = Array.isArray(caso.histcliente) ? caso.histcliente : [];
          const histTecnico = Array.isArray(caso.histtecnico) ? caso.histtecnico : [];
          const allMsgs = [...histCliente, ...histTecnico];
          const attachments = allMsgs.filter((m: any) => m.mediaUrl && typeof m.mediaUrl === "string");

          if (attachments.length > 0) {
            let changed = false;
            const analyses: string[] = [];
            let attIdx = 1;
            for (const att of attachments) {
              let analysis = att._visionAnalysis || "";
              if (!analysis || analysis.includes("[ANÁLISIS DE ADJUNTO")) {
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
              if (analysis && !analysis.includes("[ANÁLISIS DE ADJUNTO")) {
                analyses.push(`[ADJUNTO ${attIdx} — ${att.fileName || att.mediaType || "archivo"}]:\n${analysis}`);
                attIdx++;
              }
            }
            if (changed) {
              await serviceClient
                .from("sek_cases")
                .update({ histcliente: histCliente, histtecnico: histTecnico })
                .eq("id", validCaseId);
              console.log(`[tech-assistant] Análisis de adjuntos guardado en sek_cases para caso ${validCaseId}`);
            }
            if (analyses.length > 0) {
              caseAttachmentNotes = `\n\nANÁLISIS TÉCNICO DE ADJUNTOS DEL CASO:\n${analyses.join("\n\n---\n\n")}`;
            }
          }
        }
      } catch (err: any) {
        console.warn("[tech-assistant] Error analizando adjuntos del caso:", err?.message);
      }
    }

    // ── Si el técnico subió un archivo directamente en el widget, analizarlo ──
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

    // Llamar ia-agent en modo técnico
    const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || "";
    const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || "";
    let responseText = "Disculpe, no pude obtener una respuesta en este momento.";

    if (SUPABASE_URL && SERVICE_KEY) {
      try {
        const payload = {
          mode: "tecnico",
          case_id: validCaseId || undefined,
          messages: updatedMessages.map(m => ({
            role: m.role,
            content: m.content,
            mediaUrl: m.mediaUrl,
            mediaType: m.mediaType,
            fileName: m.fileName,
          })),
        };
        console.log("[tech-assistant] Enviando a ia-agent:", JSON.stringify({
          case_id: payload.case_id,
          msgCount: payload.messages.length,
          lastMsg: payload.messages[payload.messages.length - 1]?.content?.substring(0, 100),
        }));
        const iaRes = await fetch(`${SUPABASE_URL}/functions/v1/ia-agent`, {
          method: "POST",
          headers: {
            "Authorization": `Bearer ${SERVICE_KEY}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify(payload),
        });
        if (iaRes.ok) {
          const iaData = await iaRes.json();
          responseText = iaData.response || responseText;
          console.log("[tech-assistant] Respuesta ia-agent:", responseText.substring(0, 200));
        } else {
          const errText = await iaRes.text();
          console.error("[tech-assistant] ia-agent error:", iaRes.status, errText.substring(0, 300));
        }
      } catch (e: any) {
        console.error("[tech-assistant] fetch ia-agent error:", e.message);
      }
    }

    // Fallback directo a Gemini si ia-agent no pudo responder
    if (!responseText || responseText === "Disculpe, no pude obtener una respuesta en este momento.") {
      try {
        console.log("[tech-assistant] Ejecutando fallback directo con IA...");
        const { data: promptRow } = await serviceClient
          .from("sek_agent_config")
          .select("system_prompt")
          .eq("email", "system_prompt@sekunet.com")
          .maybeSingle();

        const basePrompt = promptRow?.system_prompt || "Eres el Asistente Técnico interno de Sekunet, experto en soporte técnico de CCTV, control de acceso, alarmas y redes. Proporciona respuestas técnicas claras, directas y precisas a los técnicos.";
        const fullSystem = `${basePrompt}${caseAttachmentNotes}`;

        const aiGen = await generateText("chat", {
          system: fullSystem,
          messages: updatedMessages.map(m => ({
            role: m.role === "assistant" ? "assistant" : "user",
            content: m.content,
          })),
          temperature: 0.2,
          maxTokens: 1500,
        });

        if (aiGen?.text) {
          responseText = aiGen.text.trim();
        }
      } catch (fbErr: any) {
        console.error("[tech-assistant] Error en fallback directo:", fbErr?.message);
      }
    }

    const assistantMsg: TechMessage = { role: "assistant", content: responseText, time: new Date().toISOString() };
    const finalMessages = [...updatedMessages, assistantMsg];

    return NextResponse.json({
      ok: true,
      response: responseText,
      messages: finalMessages,
    });
  } catch (e: any) {
    console.error("[tech-assistant] error:", e.message);
    return NextResponse.json({ error: e?.message || "Error inesperado" }, { status: 500 });
  }
}
