import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

// Secciones del prompt protegidas que nunca pueden eliminarse
const PROTECTED_MARKERS = [
  "[BUSCAR_INVENTARIO",
  "[BUSCAR_WEB",
  "[ESCALAR]",
  "[CERRAR]",
  "SEKUNET — AGENTE DE SOPORTE TÉCNICO",
  "IDENTIDAD Y ROL",
  "PRINCIPIOS DE ATENCIÓN",
  "PROTOCOLO DE DIAGNÓSTICO",
  "PROTOCOLO DE ESCALACIÓN",
];

function validateBlockEdit(originalPrompt: string, proposedPrompt: string): { valid: boolean; reason?: string } {
  // Solo verificar que ningún marcador protegido fue eliminado — las mejoras pueden acortar o alargar el prompt
  for (const marker of PROTECTED_MARKERS) {
    if (originalPrompt.includes(marker) && !proposedPrompt.includes(marker)) {
      return {
        valid: false,
        reason: `La edición eliminaría el bloque protegido "${marker}". Este marcador es esencial para el funcionamiento de SEKA y no puede eliminarse.`,
      };
    }
  }
  return { valid: true };
}

export async function POST(req: NextRequest) {
  try {
    console.log("[meta-chat] POST recibido");
    const { message, history, currentPrompt: clientPrompt, file, isSuperadminOverride } = await req.json();
    console.log("[meta-chat] body parseado ok | msg length:", message?.length, "| history:", history?.length);
    const geminiKey = process.env.GEMINI_API_KEY;

    if (!geminiKey) {
      return NextResponse.json({ error: "No hay API key de IA configurada (GEMINI_API_KEY)" }, { status: 500 });
    }

    // Verificar rol del usuario que llama
    console.log("[meta-chat] verificando auth...");
    const supabase = createClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError) console.error("[meta-chat] auth error:", authError.message);
    if (!user) {
      return NextResponse.json({ error: "No autorizado" }, { status: 401 });
    }
    console.log("[meta-chat] user ok:", user.email);
    const { data: agentRow } = await supabase
      .from("sek_agent_config")
      .select("rol")
      .ilike("email", user.email!)
      .maybeSingle();
    const isSuperadmin = agentRow?.rol === "superadmin";

    // Leer el prompt activo directamente desde la BD (fuente de verdad)
    const { data: promptRow } = await supabase
      .from("sek_agent_config")
      .select("system_prompt")
      .eq("email", "system_prompt@sekunet.com")
      .maybeSingle();
    const currentPrompt = promptRow?.system_prompt || clientPrompt || "";

    let fileDescription = "";

    // Si hay un archivo y tenemos Gemini, lo analizamos primero
    if (file && geminiKey) {
      try {
        const isImage = file.type?.startsWith("image/");
        let parts: object[];

        if (file.fileUri) {
          // Video/Audio: usar File API URI
          parts = [
            { text: `El administrador adjuntó un archivo multimedia: ${file.name}. Analiza su contenido.` },
            { file_data: { mime_type: file.mimeType || file.type, file_uri: file.fileUri } },
          ];
        } else if (isImage) {
          // Imágenes: usar Gemini Vision con inline_data
          parts = [
            { text: `El administrador envió una imagen: ${file.name}. Analízala y describe detalladamente lo que ves.` },
            { inline_data: { mime_type: file.type, data: file.base64.split(",")[1] } },
          ];
        } else {
          // PDF, TXT, CSV, DOC, etc: el base64 ya es texto extraído (data:text/plain;base64,...)
          const extractedText = Buffer.from(file.base64.split(",")[1], "base64").toString("utf-8");
          parts = [
            { text: `El administrador adjuntó el archivo "${file.name}" con el siguiente contenido:\n\n${extractedText}\n\nAnaliza este contenido en el contexto de la conversación.` },
          ];
        }

        const geminiRes = await fetch(
          `https://generativelanguage.googleapis.com/v1beta/models/gemini-3.1-flash-lite:generateContent?key=${geminiKey}`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ contents: [{ parts }] }),
          }
        );
        if (geminiRes.ok) {
          const geminiData = await geminiRes.json();
          fileDescription = geminiData.candidates?.[0]?.content?.parts?.[0]?.text || "";
        }
      } catch (e) {
        console.error("Error analizando archivo con Gemini", e);
      }
    }

    // Detectar si el mensaje actual es una aprobación explícita
    const APPROVAL_WORDS = ["aplica", "aplique", "aplíca", "apliquelo", "aplícalo", "aplicalo", "confirmo", "confirmado", "sí", "si", "adelante", "aprobado", "apruebo", "ejecuta", "ejecute", "dale", "ok", "listo", "hazlo", "aplique este cambio", "aplica el cambio", "confirma el cambio"];
    const userMessageLower = (message || "").toLowerCase().trim();
    const isApproval = APPROVAL_WORDS.some(w => userMessageLower === w || userMessageLower.includes(w));
    console.log("[meta-chat] userMessage:", userMessageLower, "| isApproval:", isApproval);

    const systemInstruction = `Eres SEKA en Modo Administrador. El administrador tiene autoridad total sobre tu configuración. Responde en español, directo y sin preámbulos.

PROMPT ACTUAL:
<prompt_actual>
${currentPrompt}
</prompt_actual>

REGLAS:
1. NUNCA ejecutes un cambio sin aprobación explícita. ${isApproval ? "⚠️ APROBACIÓN RECIBIDA: aplica el último cambio propuesto y entrega el JSON." : "El mensaje actual NO es aprobación: propón el cambio pero NO entregues el JSON."}
2. Ante un pedido de cambio, presenta ANTES/PROPUESTA/IMPACTO y pregunta si aprueba.
3. Verifica SIEMPRE en prompt_actual antes de afirmar que una regla existe o no.
4. Puedes simular respuestas a clientes, analizar el prompt, proponer mejoras.

FORMATO JSON (SOLO tras aprobación explícita):
\`\`\`json
{"version":"1.x","summary":"resumen","before_text":"FRAGMENTO LITERAL EXACTO A REEMPLAZAR","after_text":"FRAGMENTO NUEVO"}
\`\`\`
REGLA PATCH: before_text = copia literal exacta del fragmento a reemplazar (debe encontrarse con indexOf). after_text = reemplazo. NUNCA incluyas new_prompt completo. Para insertar algo nuevo: before_text = fragmento anterior al punto de inserción, after_text = ese fragmento + texto nuevo.`;

    // ── Llamar Gemini 3.1 Flash Lite como motor principal. Fallback: Gemini 1.5 Flash (misma key)
    const recentHistory = history.slice(-6);
    const baseMsg = message || (file ? `[Se adjuntó archivo: ${file.name}]` : "");
    // Si hay análisis del archivo, incluirlo en el mensaje para que SEKA lo vea y analice
    const userMsg = fileDescription
      ? `${baseMsg}\n\n--- CONTENIDO DEL ARCHIVO (${file?.name}) ---\n${fileDescription}\n--- FIN DEL ARCHIVO ---`
      : baseMsg;

    // Construir contenidos para Gemini (sin roles consecutivos duplicados)
    const geminiContents: { role: string; parts: { text: string }[] }[] = [];
    for (const h of recentHistory) {
      const role = h.role === "assistant" ? "model" : "user";
      const last = geminiContents[geminiContents.length - 1];
      if (last && last.role === role) {
        // Fusionar en el mismo turno en lugar de duplicar
        last.parts[0].text += "\n" + h.content;
      } else {
        geminiContents.push({ role, parts: [{ text: h.content }] });
      }
    }
    // El último turno debe ser siempre "user"
    const lastTurn = geminiContents[geminiContents.length - 1];
    if (lastTurn && lastTurn.role === "user") {
      lastTurn.parts[0].text += "\n" + userMsg;
    } else {
      geminiContents.push({ role: "user", parts: [{ text: userMsg }] });
    }
    // Si empieza con "model", descartar ese turno
    if (geminiContents[0]?.role === "model") geminiContents.shift();

    let replyContent = "";

    if (geminiKey) {
      console.log("[meta-chat] llamando Gemini 3.1 | turns:", geminiContents.length);
      const ctrl1 = new AbortController();
      const t1 = setTimeout(() => ctrl1.abort(), 15000);
      let geminiRes: Response;
      try {
        geminiRes = await fetch(
          `https://generativelanguage.googleapis.com/v1beta/models/gemini-3.1-flash-lite:generateContent?key=${geminiKey}`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              system_instruction: { parts: [{ text: systemInstruction }] },
              contents: geminiContents,
              generationConfig: { temperature: 0.1, maxOutputTokens: 8192 },
            }),
            signal: ctrl1.signal,
          }
        );
      } catch (fetchErr: any) {
        console.warn("[meta-chat] Gemini 3.1 fetch error:", fetchErr.message);
        geminiRes = new Response(null, { status: 503 });
      } finally {
        clearTimeout(t1);
      }

      if (!geminiRes.ok) {
        const errText = geminiRes.status !== 503 ? await geminiRes.text() : "(timeout/abort)";
        console.warn("[meta-chat] Gemini 3.1 error:", geminiRes.status, errText, "| intentando fallback");
      } else {
        const geminiData = await geminiRes.json();
        replyContent = geminiData.candidates?.[0]?.content?.parts?.[0]?.text || "";
        console.log("[meta-chat] Gemini 3.1 ok | reply length:", replyContent.length);
      }
    }

    // Fallback 1: gemini-2.0-flash
    if (!replyContent) {
      console.log("[meta-chat] fallback 1: gemini-2.0-flash...");
      const ctrl2 = new AbortController();
      const t2 = setTimeout(() => ctrl2.abort(), 15000);
      try {
        const r2 = await fetch(
          `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${geminiKey}`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              system_instruction: { parts: [{ text: systemInstruction }] },
              contents: geminiContents,
              generationConfig: { temperature: 0.1, maxOutputTokens: 8192 },
            }),
            signal: ctrl2.signal,
          }
        );
        if (r2.ok) {
          const d2 = await r2.json();
          replyContent = d2.candidates?.[0]?.content?.parts?.[0]?.text || "";
          console.log("[meta-chat] fallback 1 ok | length:", replyContent.length);
        } else {
          const e2 = await r2.text();
          console.warn("[meta-chat] fallback 1 error:", r2.status, e2.slice(0, 200));
        }
      } catch (e: any) {
        console.warn("[meta-chat] fallback 1 fetch error:", e.message);
      } finally {
        clearTimeout(t2);
      }
    }

    // Fallback 2: gemini-2.5-flash
    if (!replyContent) {
      console.log("[meta-chat] fallback 2: gemini-2.5-flash...");
      const ctrl3 = new AbortController();
      const t3 = setTimeout(() => ctrl3.abort(), 15000);
      try {
        const r3 = await fetch(
          `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${geminiKey}`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              system_instruction: { parts: [{ text: systemInstruction }] },
              contents: geminiContents,
              generationConfig: { temperature: 0.1, maxOutputTokens: 8192 },
            }),
            signal: ctrl3.signal,
          }
        );
        if (r3.ok) {
          const d3 = await r3.json();
          replyContent = d3.candidates?.[0]?.content?.parts?.[0]?.text || "";
          console.log("[meta-chat] fallback 2 ok | length:", replyContent.length);
        } else {
          const e3 = await r3.text();
          console.error("[meta-chat] fallback 2 error:", r3.status, e3.slice(0, 200));
        }
      } catch (e: any) {
        console.error("[meta-chat] fallback 2 fetch error:", e.message);
      } finally {
        clearTimeout(t3);
      }
    }

    // Fallback 3: NVIDIA NIM — meta/llama-3.3-70b-instruct (OpenAI-compatible)
    const nvidiaKey = process.env.NVIDIA_API_KEY;
    if (!replyContent && nvidiaKey) {
      console.log("[meta-chat] fallback 3: NVIDIA llama-3.3-70b-instruct...");
      const ctrl4 = new AbortController();
      const t4 = setTimeout(() => ctrl4.abort(), 60000);
      try {
        const nvidiaMessages = [
          { role: "system", content: systemInstruction },
          ...recentHistory.map((h: any) => ({ role: h.role === "assistant" ? "assistant" : "user", content: h.content })),
          { role: "user", content: userMsg },
        ];
        const r4 = await fetch(
          "https://integrate.api.nvidia.com/v1/chat/completions",
          {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              "Authorization": `Bearer ${nvidiaKey}`,
            },
            body: JSON.stringify({
              model: "meta/llama-3.3-70b-instruct",
              messages: nvidiaMessages,
              temperature: 0.1,
              max_tokens: 8192,
            }),
            signal: ctrl4.signal,
          }
        );
        if (r4.ok) {
          const d4 = await r4.json();
          const candidate = d4.choices?.[0]?.message?.content || "";
          if (candidate.trim()) {
            replyContent = candidate;
            console.log("[meta-chat] fallback 3 (NVIDIA) ok | length:", replyContent.length);
          } else {
            console.error("[meta-chat] fallback 3 (NVIDIA) devolvió contenido vacío", JSON.stringify(d4).slice(0, 300));
          }
        } else {
          const e4 = await r4.text();
          console.error("[meta-chat] fallback 3 (NVIDIA) error:", r4.status, e4.slice(0, 200));
        }
      } catch (e: any) {
        console.error("[meta-chat] fallback 3 (NVIDIA) fetch error:", e.message);
      } finally {
        clearTimeout(t4);
      }
    }

    if (!replyContent) throw new Error("Todos los modelos de IA están saturados. Espere 1 minuto e intente de nuevo.");
    let newPrompt: string | null = null;
    let summary = "";
    let blocked = false;
    let blockReason = "";
    let patchInfo: { before: string; after: string } | null = null;

    // Buscar si la IA generó el bloque JSON con el nuevo prompt
    // Usamos greedy (\S[\s\S]*) para capturar el JSON completo aunque sea muy largo
    const jsonMatch = replyContent.match(/```json\s*(\{[\s\S]*\})\s*```/);
    console.log("[meta-chat] isApproval:", isApproval, "| jsonMatch found:", !!jsonMatch, "| jsonLength:", jsonMatch?.[1]?.length);
    if (jsonMatch) {
      try {
        const parsed = JSON.parse(jsonMatch[1]);
        const hasPatch = parsed.before_text && parsed.after_text !== undefined;
        const hasFullPrompt = !!parsed.new_prompt;
        if (hasPatch || hasFullPrompt) {
          summary = parsed.summary || parsed.cambio_aplicado || "Se actualizaron las reglas del agente.";

          // Solo aplicar si el mensaje fue una aprobación explícita
          if (!isApproval && !isSuperadminOverride) {
            replyContent = replyContent.replace(jsonMatch[0], "").trim();
          } else {
            let proposed: string;

            if (hasPatch) {
              // PATCH: reemplazar solo el fragmento
              const beforeText: string = parsed.before_text;
              const afterText: string = parsed.after_text;
              if (currentPrompt.includes(beforeText)) {
                proposed = currentPrompt.replace(beforeText, afterText);
                patchInfo = { before: beforeText, after: afterText };
              } else {
                // before_text no encontrado exactamente — bloquear con mensaje claro
                blocked = true;
                blockReason = "No se pudo localizar el fragmento exacto a modificar en el prompt actual. Por favor vuelve a intentarlo.";
                replyContent = `⚠️ **No se pudo aplicar el cambio.**\n\n${blockReason}`;
                proposed = "";
              }
            } else {
              // Fallback legacy: new_prompt completo
              proposed = parsed.new_prompt;
            }

            if (!blocked && proposed) {
              const canBypass = isSuperadmin && isSuperadminOverride === true;
              const validation = canBypass ? { valid: true } : validateBlockEdit(currentPrompt, proposed);

              if (!validation.valid) {
                blocked = true;
                blockReason = validation.reason!;
                replyContent = `⚠️ **Cambio bloqueado por política de seguridad del prompt.**\n\n${blockReason}`;
              } else {
                newPrompt = proposed;
                replyContent = replyContent.replace(jsonMatch[0], "").trim();
              }
            }
          }
        }
      } catch (e) {
        console.error("[meta-chat] Error parseando JSON del Meta-Agente:", e);
        console.error("[meta-chat] JSON capturado (primeros 500):", jsonMatch[1]?.substring(0, 500));
      }
    }

    console.log("[meta-chat] newPrompt length:", newPrompt?.length ?? 0, "| blocked:", blocked);
    if (newPrompt) {
      const changeType = (isSuperadmin && isSuperadminOverride) ? "full_replace" : "block_edit";

      // 1. Guardar versión anterior en historial ANTES de sobrescribir
      await supabase
        .from("sek_prompt_history")
        .insert({
          prompt: currentPrompt,
          summary,
          changed_by: user.email!,
          change_type: changeType,
        });

      // 2. Actualizar prompt activo
      await supabase
        .from("sek_agent_config")
        .update({ system_prompt: newPrompt })
        .eq("email", "system_prompt@sekunet.com");
    }

    return NextResponse.json({
      reply: replyContent,
      newPrompt,
      summary,
      blocked,
      blockReason,
      patchInfo,
    });

  } catch (error: any) {
    console.error("Meta-Agent error:", error);
    const safeMessage = typeof error.message === "string" && !error.message.includes("{")
      ? error.message
      : "El servicio de IA no está disponible en este momento.";
    return NextResponse.json({ error: safeMessage }, { status: 500 });
  }
}
