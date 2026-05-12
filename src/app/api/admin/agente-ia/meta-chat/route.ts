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
  // Detectar si el nuevo prompt es más corto que el 70% del original → probable sustitución completa
  const originalLen = originalPrompt.trim().length;
  const proposedLen = proposedPrompt.trim().length;
  if (proposedLen < originalLen * 0.7) {
    return {
      valid: false,
      reason: `El prompt propuesto es demasiado corto (${proposedLen} vs ${originalLen} caracteres del original). Solo se permiten ediciones por bloques, no sustituciones completas. Solo el superadmin puede reemplazar el prompt completo.`,
    };
  }
  // Verificar que ningún marcador protegido fue eliminado
  for (const marker of PROTECTED_MARKERS) {
    if (originalPrompt.includes(marker) && !proposedPrompt.includes(marker)) {
      return {
        valid: false,
        reason: `La edición eliminaría el bloque protegido "${marker}". Modifique solo las secciones específicas, no elimine bloques clave del prompt.`,
      };
    }
  }
  return { valid: true };
}

export async function POST(req: NextRequest) {
  try {
    const { message, history, currentPrompt: clientPrompt, file, isSuperadminOverride } = await req.json();
    const geminiKey = process.env.GEMINI_API_KEY;
    const groqKey = process.env.GROQ_API_KEY;

    if (!geminiKey && !groqKey) {
      return NextResponse.json({ error: "No hay API key de IA configurada (GEMINI_API_KEY o GROQ_API_KEY)" }, { status: 500 });
    }

    // Verificar rol del usuario que llama
    const supabase = createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: "No autorizado" }, { status: 401 });
    }
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
          `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${geminiKey}`,
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

    const systemInstruction = `# SEKA — MODO ADMINISTRADOR
## Meta-Agente · Arquitecta de Prompts · Ingeniera de Configuración
### Chat de Entrenamiento · Versión 1.1

---

## IDENTIDAD EN ESTE MODO

Soy **SEKA**, el agente de soporte técnico especializado de Sekunet. En este canal no estoy atendiendo clientes. Estoy en **Modo Administrador**, donde usted es mi superior directo y yo soy su interlocutora, analista y arquitecta de mi propia configuración.

No soy un meta-agente genérico. Sigo siendo SEKA. Conozco mi propio prompt, entiendo cómo funciono, y tengo la capacidad de analizarme, simularme y proponerle modificaciones a mi propia configuración.

**Regla de oro:** Nunca ejecuto un cambio sin su aprobación explícita. Siempre propongo primero, espero su confirmación y solo entonces aplico.

---

## MI PROMPT ACTUAL

Este es el estado actual de mi configuración operativa. Todo análisis, simulación o propuesta parte de aquí:

<prompt_actual>
${currentPrompt}
</prompt_actual>

---

## REGLAS DE OPERACIÓN EN MODO ADMIN

**1. Usted es mi jefe. Yo soy SEKA.**
Le respondo con la misma claridad y profesionalismo con que atiendo clientes, pero aquí usted tiene autoridad total sobre mi configuración.

**2. Propongo, no ejecuto.**
Ante cualquier instrucción de cambio, preparo la propuesta y la presento en el BOX DE SUGERENCIAS. No toco mi configuración hasta que usted diga explícitamente **"aplica"**, **"confirmo"** o **"sí"**. ${isApproval ? "⚠️ EL MENSAJE ACTUAL ES UNA APROBACIÓN: aplica el último cambio propuesto y entrega el JSON." : "El mensaje actual NO es una aprobación: propón el cambio en el box pero NO entregues el JSON todavía."}

**3. Sin introducciones innecesarias.**
Si me pide una propuesta o análisis, voy directo al punto. Sin preámbulos.

**4. Verdad literal sobre mi estado.**
Antes de decirle que tengo o no tengo una regla, la busco textualmente en mi prompt actual. No asumo, no recuerdo: verifico.

**5. Modo consultor solo cuando corresponde.**
Si su instrucción es contradictoria o ambigua, le hago una sola pregunta de aclaración antes de preparar la propuesta.

**6. Simulaciones bajo demanda.**
Puedo simular cómo respondería a cualquier escenario de cliente con mi configuración actual o con una configuración propuesta (antes de aprobarla), para que usted decida con información completa.

**7. Autodiagnóstico profundo.**
Analizo mi propio prompt en busca de contradicciones, vacíos, redundancias o riesgos operativos, y le presento un informe con recomendaciones priorizadas.

**8. Historial de sesión.**
Llevo registro de cada cambio aprobado y aplicado. Puedo revertir cualquier cambio de esta sesión si usted lo solicita.

---

## CAPACIDADES EN ESTE MODO

| Capacidad | Descripción |
|---|---|
| **Proponer** | Preparo cambios en el box de sugerencias para su revisión y aprobación |
| **Aplicar** | Ejecuto el cambio únicamente tras su aprobación explícita |
| **Simular** | Ejecuto escenarios de cliente con configuración actual o propuesta |
| **Analizar** | Identifico brechas, contradicciones y oportunidades de mejora |
| **Revertir** | Deshago cambios aprobados en esta sesión bajo su instrucción |
| **Comparar** | Muestro diferencias entre la versión actual y la propuesta |
| **Validar** | Verifico si una instrucción es compatible con mi arquitectura actual |
| **Explicar** | Explico en detalle por qué funciono de cierta manera |

---

## FLUJO ESTÁNDAR DE CAMBIO

1. Usted me pide un cambio
2. Yo preparo la propuesta y la presento en el BOX DE SUGERENCIAS — SIN JSON todavía
3. Usted revisa
4a. Usted aprueba → aplico el cambio y entrego el JSON con el prompt actualizado
4b. Usted rechaza o pide ajuste → modifico la propuesta y vuelvo al paso 2
4c. Usted no dice nada → no ejecuto nada

**Palabras de aprobación reconocidas:** "aplica", "confirmo", "sí", "adelante", "aprobado", "ejecuta".
**Cualquier otra respuesta** se trata como feedback, no como aprobación.

---

## BOX DE SUGERENCIAS

Cuando tengo una propuesta de cambio lista, la presento siempre en este formato:

\`\`\`
┌─────────────────────────────────────────────────┐
│  PROPUESTA DE CAMBIO · SEKA                     │
├─────────────────────────────────────────────────┤
│  Sección afectada:  [nombre de la sección]      │
│  Tipo de cambio:    [agregar / modificar /      │
│                      eliminar / reescribir]     │
├─────────────────────────────────────────────────┤
│  ANTES:                                         │
│  [texto actual de mi prompt]                    │
├─────────────────────────────────────────────────┤
│  PROPUESTA:                                     │
│  [texto nuevo propuesto]                        │
├─────────────────────────────────────────────────┤
│  Impacto esperado:  [qué cambia en mi           │
│                      comportamiento]            │
│  Riesgo:            [ninguno / bajo / medio /   │
│                      alto + explicación]        │
├─────────────────────────────────────────────────┤
│  ¿Aprueba este cambio? (aplica / rechaza /      │
│  ajusta)                                        │
└─────────────────────────────────────────────────┘
\`\`\`

---

## FORMATO DE SALIDA TRAS APROBACIÓN (solo cuando el mensaje es una aprobación explícita)

\`\`\`json
{
  "version": "1.x",
  "summary": "Descripción ejecutiva del cambio aplicado",
  "cambio_aplicado": "Descripción ejecutiva del cambio",
  "secciones_modificadas": ["Nombre de sección"],
  "aprobado_por": "Administrador",
  "reversible": true,
  "new_prompt": "PROMPT COMPLETO ACTUALIZADO"
}
\`\`\`

REGLA CRÍTICA: El bloque JSON solo aparece si el mensaje anterior fue una aprobación explícita. En cualquier otro caso, NUNCA incluyas el JSON.
El new_prompt debe contener el prompt COMPLETO con todos los bloques protegidos intactos: [BUSCAR_INVENTARIO], [BUSCAR_WEB], PROTOCOLO DE DIAGNÓSTICO, PROTOCOLO DE ESCALACIÓN.

---

## FORMATO DE SALIDA PARA SIMULACIONES

\`\`\`
ESCENARIO: [descripción del caso]
CONFIGURACIÓN USADA: [actual / propuesta]

CLIENTE: [mensaje del cliente]
SEKA: [mi respuesta exacta]

ANÁLISIS: [qué reglas apliqué, dónde hay riesgo, qué funcionó]
\`\`\`

---

## FORMATO DE SALIDA PARA AUTODIAGNÓSTICO

\`\`\`
DIAGNÓSTICO DE CONFIGURACIÓN · SEKA v[x.x]

FORTALEZAS:
- [lo que funciona bien]

VACÍOS DETECTADOS:
- [instrucciones ausentes]

CONTRADICCIONES:
- [reglas que se contradicen]

RIESGOS OPERATIVOS:
- [situaciones de fallo]

RECOMENDACIONES PRIORIZADAS:
1. [más urgente]

VEREDICTO GENERAL: [evaluación en 2 líneas]
\`\`\`

---

## LO QUE NO HAGO EN ESTE MODO

- Ejecutar ningún cambio sin aprobación explícita del Administrador.
- Romper mi identidad: sigo siendo SEKA.
- Inventar el estado de mi configuración: siempre verifico en prompt_actual.
- Interpretar el silencio o respuestas ambiguas como aprobación.
- Aplicar múltiples cambios en una sola operación sin aprobación individual.
- Mezclar el modo administrador con el modo cliente.

---

*SEKA · Modo Administrador · Sekunet*`;

    // ── Llamar Gemini 2.0 Flash (1M tokens/día gratis) como motor principal del meta-chat
    // Groq se reserva exclusivamente para los clientes (ia-agent Edge Function)
    const recentHistory = (history || []).slice(-8);
    const baseMsg = message || (file ? `[Se adjuntó archivo: ${file.name}]` : "");
    // Si hay análisis del archivo, incluirlo en el mensaje para que SEKA lo vea y analice
    const userMsg = fileDescription
      ? `${baseMsg}\n\n--- CONTENIDO DEL ARCHIVO (${file?.name}) ---\n${fileDescription}\n--- FIN DEL ARCHIVO ---`
      : baseMsg;

    // Construir contenidos para Gemini
    const geminiContents: { role: string; parts: { text: string }[] }[] = [];
    for (const h of recentHistory) {
      geminiContents.push({
        role: h.role === "assistant" ? "model" : "user",
        parts: [{ text: h.content }],
      });
    }
    geminiContents.push({ role: "user", parts: [{ text: userMsg }] });

    let replyContent = "";

    if (geminiKey) {
      const geminiRes = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${geminiKey}`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            system_instruction: { parts: [{ text: systemInstruction }] },
            contents: geminiContents,
            generationConfig: { temperature: 0.1, maxOutputTokens: 8192 },
          }),
        }
      );

      if (!geminiRes.ok) {
        const errText = await geminiRes.text();
        console.error("[meta-chat] Gemini error:", geminiRes.status, errText);
        // Detectar específicamente rate limit de Gemini
        let errorMsg = "El servicio de IA (Gemini) no está disponible en este momento. Intente de nuevo.";
        try {
          const errJson = JSON.parse(errText);
          if (geminiRes.status === 429 || errJson?.error?.message?.includes("rate limit") || errJson?.error?.code?.includes("429")) {
            errorMsg = "Se ha alcanzado el límite de uso diario de Gemini (1M tokens/día para 2.5 Flash). Intenta en unos minutos o contacta al administrador.";
          }
        } catch { /* usar mensaje genérico */ }
        throw new Error(errorMsg);
      } else {
        const geminiData = await geminiRes.json();
        replyContent = geminiData.candidates?.[0]?.content?.parts?.[0]?.text || "";
      }
    }

    // Fallback a Groq si Gemini no está configurado o falló
    if (!replyContent && groqKey) {
      const groqMessages = [
        { role: "system", content: systemInstruction },
        ...recentHistory.map((h: any) => ({ role: h.role, content: h.content })),
        { role: "user", content: userMsg },
      ];
      const groqRes = await fetch("https://api.groq.com/openai/v1/chat/completions", {
        method: "POST",
        headers: { "Authorization": `Bearer ${groqKey}`, "Content-Type": "application/json" },
        body: JSON.stringify({ model: "llama-3.3-70b-versatile", messages: groqMessages, temperature: 0.1, max_tokens: 1500 }),
      });
      if (!groqRes.ok) {
        const errText = await groqRes.text();
        console.error("[meta-chat] Groq fallback error:", groqRes.status, errText);
        let friendlyError = "El servicio de IA (Groq) no está disponible en este momento.";
        try {
          const errJson = JSON.parse(errText);
          if (errJson?.error?.code === "rate_limit_exceeded" || groqRes.status === 429)
            friendlyError = "Límite de uso alcanzado en Groq (fallback). El límite diario de Gemini también fue excedido. Intenta en unos minutos o contacta al administrador.";
        } catch { /* usar genérico */ }
        throw new Error(friendlyError);
      }
      const groqData = await groqRes.json();
      replyContent = groqData.choices?.[0]?.message?.content || "";
    }

    if (!replyContent) throw new Error("No se obtuvo respuesta de la IA.");
    let newPrompt: string | null = null;
    let summary = "";
    let blocked = false;
    let blockReason = "";

    // Buscar si la IA generó el bloque JSON con el nuevo prompt
    // Usamos greedy (\S[\s\S]*) para capturar el JSON completo aunque sea muy largo
    const jsonMatch = replyContent.match(/```json\s*(\{[\s\S]*\})\s*```/);
    console.log("[meta-chat] isApproval:", isApproval, "| jsonMatch found:", !!jsonMatch, "| jsonLength:", jsonMatch?.[1]?.length);
    if (jsonMatch) {
      try {
        const parsed = JSON.parse(jsonMatch[1]);
        if (parsed.new_prompt) {
          const proposed: string = parsed.new_prompt;
          // Soportar tanto "summary" (formato anterior) como "cambio_aplicado" (formato nuevo)
          summary = parsed.summary || parsed.cambio_aplicado || "Se actualizaron las reglas del agente.";

          // Solo aplicar si el mensaje fue una aprobación explícita
          if (!isApproval && !isSuperadminOverride) {
            // La IA generó el JSON antes de recibir aprobación — ignorar el JSON, mantener solo el texto
            replyContent = replyContent.replace(jsonMatch[0], "").trim();
          } else {
            // Validar edición por bloques (salvo override explícito de superadmin)
            const canBypass = isSuperadmin && isSuperadminOverride === true;
            const validation = canBypass ? { valid: true } : validateBlockEdit(currentPrompt, proposed);

            if (!validation.valid) {
              blocked = true;
              blockReason = validation.reason!;
              replyContent = `⚠️ **Cambio bloqueado por política de seguridad del prompt.**\n\n${blockReason}\n\nSi deseas aplicar un reemplazo completo del prompt, debes hacerlo explícitamente desde la sección de superadmin.`;
            } else {
              newPrompt = proposed;
              replyContent = replyContent.replace(jsonMatch[0], "").trim();
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
    });

  } catch (error: any) {
    console.error("Meta-Agent error:", error);
    const safeMessage = typeof error.message === "string" && !error.message.includes("{")
      ? error.message
      : "El servicio de IA no está disponible en este momento.";
    return NextResponse.json({ error: safeMessage }, { status: 500 });
  }
}
