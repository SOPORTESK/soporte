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
  "before_text": "FRAGMENTO EXACTO DEL PROMPT ACTUAL QUE SE REEMPLAZA (copia literal)",
  "after_text": "FRAGMENTO NUEVO QUE LO REEMPLAZA"
}
\`\`\`

REGLA CRÍTICA: El bloque JSON solo aparece si el mensaje anterior fue una aprobación explícita. En cualquier otro caso, NUNCA incluyas el JSON.
REGLA DE PATCH: Usa SIEMPRE before_text/after_text. NUNCA incluyas new_prompt completo. before_text debe ser una copia LITERAL y EXACTA del fragmento actual del prompt que se va a modificar (para que pueda encontrarse con indexOf). after_text es el fragmento nuevo que lo reemplaza.
Si el cambio es agregar algo nuevo sin reemplazar nada existente, pon en before_text el fragmento justo ANTES de donde insertar, y en after_text ese mismo fragmento más el texto nuevo agregado.

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

    // Fallback 1: gemini-2.0-flash-exp (quota diferente a 3.1)
    if (!replyContent) {
      console.log("[meta-chat] fallback 1: gemini-2.0-flash-exp...");
      const ctrl2 = new AbortController();
      const t2 = setTimeout(() => ctrl2.abort(), 15000);
      try {
        const r2 = await fetch(
          `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash-exp:generateContent?key=${geminiKey}`,
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

    // Fallback 2: gemini-1.5-flash en v1beta (soporta system_instruction)
    if (!replyContent) {
      console.log("[meta-chat] fallback 2: gemini-1.5-flash v1beta...");
      const ctrl3 = new AbortController();
      const t3 = setTimeout(() => ctrl3.abort(), 15000);
      try {
        const r3 = await fetch(
          `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${geminiKey}`,
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
          throw new Error("Todos los modelos de IA están saturados. Espere 1 minuto e intente de nuevo.");
        }
      } catch (e: any) {
        if (e.message.includes("saturados")) throw e;
        console.error("[meta-chat] fallback 2 fetch error:", e.message);
        throw new Error("Todos los modelos de IA están saturados. Espere 1 minuto e intente de nuevo.");
      } finally {
        clearTimeout(t3);
      }
    }

    if (!replyContent) throw new Error("No se obtuvo respuesta de la IA.");
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
