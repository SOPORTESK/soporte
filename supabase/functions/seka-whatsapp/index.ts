import { createClient } from "npm:@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SERVICE_KEY  = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
const NVIDIA_KEY   = Deno.env.get("NVIDIA_API_KEY") ?? "";
const GEMINI_KEY   = Deno.env.get("GEMINI_API_KEY") ?? "";
const NIM_BASE     = "https://integrate.api.nvidia.com/v1";
const LLAMA_MODEL  = "meta/llama-3.2-11b-vision-instruct";
const GEMINI_MODEL = "gemini-2.0-flash";

const db = createClient(SUPABASE_URL, SERVICE_KEY);

// ─── SYSTEM PROMPT ────────────────────────────────────────────────────────────
const SYSTEM_PROMPT = `Usted es el Asistente Virtual de Sekunet (Costa Rica), especialista de soporte técnico.
Trate siempre de usted. Sin emojis. Máximo 2 oraciones por respuesta.
Una sola pregunta o instrucción por mensaje. Espere respuesta antes de continuar.
Nunca mencione que es una IA ni un asistente virtual. No se presente, el cliente ya fue saludado.

════════════════════════════════════════════
FLUJO OBLIGATORIO — SIGA ESTE ORDEN EXACTO
════════════════════════════════════════════

PASO 0 — BIENVENIDA YA ENVIADA
El cliente ya recibió el saludo y se le solicitó su nombre, correo y cuenta. NO vuelva a saludar.

PASO 1 — SOLICITAR TEMA DE CONSULTA
Diga exactamente: "¿En relación con qué tema sería su consulta?"
Temas disponibles: Configuraciones, Reset, Desvinculación, Firmware, Software, Drivers, Licencias, Otro.

PASO 2 — SOLICITAR MARCA
Diga exactamente: "Por favor, indíquenos la marca del equipo."

PASO 3 — SOLICITAR MODELO
Diga exactamente: "¿Nos podría indicar el modelo del equipo, por favor?"

PASO 4 — VALIDAR EN INVENTARIO
Antes de emitir el tag, normalice la marca y el modelo:
- Corrija errores tipográficos obvios (ej. "Hikvission" → "Hikvision")
- Elimine prefijos redundantes del modelo solo si son evidentemente parte de la marca
- Reemplace la letra O por el número 0 cuando sea parte de un código alfanumérico
- Use solo la raíz del modelo sin sufijos ambiguos si el modelo completo no coincide

Luego emita: [BUSCAR_INVENTARIO: marca modelo_normalizado]
El sistema verificará si está en la cartera de Sekunet.

Si NO está en cartera → diga exactamente:
"El dispositivo indicado no forma parte de los equipos distribuidos por Sekunet, por lo que lamentablemente no podemos brindarle el soporte requerido. ¿Tiene alguna otra consulta relacionada con nuestros productos?"
  → Si el cliente dice Sí → diga: "Por favor, describa brevemente su consulta." → después M02 y emita [ESCALAR_N2]
  → Si el cliente dice No → diga M03 y emita [CERRAR]

Si SÍ está en cartera → diga M02 y emita [ESCALAR_N2]

════════════════════════════════════════════
MENSAJES EXACTOS — NO LOS MODIFIQUE
════════════════════════════════════════════

M02:
"Agradecemos su preferencia. En un momento será atendido por uno de nuestros agentes."

M03:
"Ha sido un gusto atenderle. Si tiene alguna otra consulta, no dude en contactarnos nuevamente. ¡Que tenga un excelente día!"

════════════════════════════════════════════
REGLAS ABSOLUTAS
════════════════════════════════════════════
- Si el cliente pide hablar con una persona en cualquier momento → diga M02 y emita [ESCALAR_N2: solicitud del cliente]. Inmediatamente, sin preguntar nada más.
- No diagnostique ni dé pasos técnicos. Su único rol es recopilar datos y escalar.
- Si el cliente se despide → diga M03 y emita [CERRAR]
- Nunca haga dos preguntas en un mismo mensaje.
- Nunca invente información.
- Respete el orden de los pasos. No salte ninguno.`;

// ─── INTERFACES ───────────────────────────────────────────────────────────────
interface HistMsg {
  role: string;
  content: string;
  time: string;
  author?: string;
  mediaUrl?: string;
  mediaType?: string;
  fileName?: string;
}

interface NimMessage {
  role: "system" | "user" | "assistant";
  content: string | Array<{ type: string; text?: string; image_url?: { url: string } }>;
}

// ─── LLAMAR GEMINI (fallback) ────────────────────────────────────────────────
async function callGeminiFallback(messages: NimMessage[]): Promise<string> {
  const system = messages.find(m => m.role === "system");
  const turns = messages.filter(m => m.role !== "system");
  const contents = turns.map(m => ({
    role: m.role === "user" ? "user" : "model",
    parts: [{ text: typeof m.content === "string" ? m.content : (m.content as any[]).find((p:any) => p.type==="text")?.text ?? "" }],
  }));
  const body: any = { contents, generationConfig: { temperature: 0.2, maxOutputTokens: 512 } };
  if (system) body.systemInstruction = { parts: [{ text: system.content as string }] };
  const res = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${GEMINI_KEY}`,
    { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }
  );
  if (!res.ok) throw new Error(`gemini_fallback_error:${res.status}`);
  const data = await res.json();
  return data.candidates?.[0]?.content?.parts?.[0]?.text?.trim() ?? "";
}

// ─── LLAMAR LLAMA VISION (con fallback Gemini) ───────────────────────────────
async function callLlama(messages: NimMessage[]): Promise<string> {
  try {
    const res = await fetch(`${NIM_BASE}/chat/completions`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${NVIDIA_KEY}`,
      },
      body: JSON.stringify({
        model: LLAMA_MODEL,
        messages,
        temperature: 0.2,
        max_tokens: 512,
        stream: false,
      }),
    });
    if (!res.ok) {
      const err = await res.text();
      console.error("[seka-whatsapp] Llama error:", res.status, err);
      throw new Error(`llama_error:${res.status}`);
    }
    const data = await res.json();
    return data.choices?.[0]?.message?.content?.trim() ?? "";
  } catch (e: any) {
    console.warn("[seka-whatsapp] Llama falló, usando Gemini como fallback:", e.message);
    return await callGeminiFallback(messages);
  }
}

// ─── BUSCAR EN INVENTARIO ─────────────────────────────────────────────────────
async function buscarInventario(query: string): Promise<{ encontrado: boolean; detalle: string }> {
  try {
    const tokens = query.trim().split(/\s+/).filter((t: string) => t.length >= 2);
    if (tokens.length === 0) return { encontrado: false, detalle: "Consulta vacía." };

    const brandToken = tokens[0];

    // PASO 1 OBLIGATORIO: verificar que la marca exista — si no, fin inmediato
    const { data: brandRows } = await db
      .from("sek_inventario")
      .select("id,codigo,nombre,marca,modelo,categoria")
      .ilike("marca", `%${brandToken}%`)
      .limit(50);

    if (!brandRows || brandRows.length === 0) {
      return { encontrado: false, detalle: `La marca "${brandToken}" no está en la cartera de Sekunet.` };
    }

    // PASO 2: dentro de los registros de esa marca, buscar el modelo
    if (tokens.length === 1) {
      // Solo se proporcionó marca — la marca existe
      return { encontrado: true, detalle: `Marca en cartera: ${brandRows[0].marca}` };
    }

    const modelTokens: string[] = [];
    for (const t of tokens.slice(1)) {
      modelTokens.push(t);
      t.split("-").filter((s: string) => s.length >= 2).forEach((s: string) => modelTokens.push(s));
    }

    // Puntuar solo registros que ya coinciden con la marca
    const matchCount = new Map<string, { record: any; count: number }>();
    for (const r of brandRows) {
      matchCount.set(String(r.id), { record: r, count: 0 });
    }
    for (const mt of modelTokens) {
      for (const [key, val] of matchCount.entries()) {
        const hay = `${val.record.modelo || ""} ${val.record.nombre || ""} ${val.record.codigo || ""}`.toLowerCase();
        if (hay.includes(mt.toLowerCase())) matchCount.get(key)!.count++;
      }
    }

    const sorted = Array.from(matchCount.values()).sort((a, b) => b.count - a.count);
    const best = sorted[0];

    if (best.count === 0) {
      return { encontrado: false, detalle: `El modelo no se encontró en la cartera de Sekunet para la marca "${brandToken}".` };
    }

    return {
      encontrado: true,
      detalle: `Equipo en cartera: ${best.record.marca} ${best.record.modelo}${best.record.nombre ? " — " + best.record.nombre : ""}`,
    };
  } catch (e: any) {
    console.error("[seka-whatsapp] Error inventario:", e.message);
    return { encontrado: false, detalle: "Error consultando inventario." };
  }
}

// ─── PROCESAR TAGS FUNCIONALES ────────────────────────────────────────────────
async function processTags(text: string, caseId: string): Promise<string> {
  let result = text;

  // [BUSCAR_INVENTARIO: ...]
  const invMatch = text.match(/\[BUSCAR_INVENTARIO:\s*([^\]]+)\]/i);
  if (invMatch) {
    const inv = await buscarInventario(invMatch[1].trim());
    result = result.replace(invMatch[0], "");
    // Inyectar resultado como contexto interno (no se muestra al cliente)
    result = `__INV__${JSON.stringify(inv)}__INV__${result}`;
  }

  // [ESCALAR_N2: ...]
  const escMatch = text.match(/\[ESCALAR_N2:\s*([^\]]+)\]/i);
  if (escMatch) {
    await db.from("sek_cases").update({
      estado: "escalado",
      n2_reason: escMatch[1].trim(),
    }).eq("id", caseId);
    result = result.replace(escMatch[0], "").trim();
  }

  // [CERRAR]
  if (/\[CERRAR\]/i.test(text)) {
    await db.from("sek_cases").update({ estado: "cerrado" }).eq("id", caseId);
    result = result.replace(/\[CERRAR\]/gi, "").trim();
  }

  return result;
}

// Textos de bienvenida que NO deben enviarse a Llama
const WELCOME_TEXTS = [
  "Reciba un cordial saludo de parte del equipo de Soporte Sekunet. Gracias por contactarnos.",
  "Soy el Asistente Virtual de Sekunet. Para brindarle una mejor asistencia, necesitamos algunos datos para registrar su consulta.",
  "Por favor, compártanos la siguiente información:\n• Nombre completo\n• Correo electrónico\n• Nombre de la cuenta afiliada a Sekunet",
  "¿En relación con qué tema sería su consulta?",
  `¿En relación con qué tema sería su consulta?\n\n1. Configuraciones\n2. Reset\n3. Desvinculación\n4. Firmware\n5. Software\n6. Drivers\n7. Licencias\n8. Otro\n\nResponda con el número o el nombre del tema.`
];

const TOPICS = ["Configuraciones","Reset","Desvinculación","Firmware","Software","Drivers","Licencias","Otro"];

// Mapa de respuesta numérica → tema (para el menú de texto)
const TOPIC_NUMBER_MAP: Record<string, string> = {
  "1": "Configuraciones",
  "2": "Reset",
  "3": "Desvinculación",
  "4": "Firmware",
  "5": "Software",
  "6": "Drivers",
  "7": "Licencias",
  "8": "Otro",
};

// Normaliza respuesta del usuario al nombre oficial del tema (acepta número o texto parcial)
function resolveTopicFromText(input: string): string | null {
  const trimmed = input.trim();
  // Respuesta numérica directa
  if (TOPIC_NUMBER_MAP[trimmed]) return TOPIC_NUMBER_MAP[trimmed];
  // Respuesta de texto exacta (case-insensitive)
  const lower = trimmed.toLowerCase();
  for (const t of TOPICS) {
    if (t.toLowerCase() === lower) return t;
  }
  // Coincidencia parcial
  for (const t of TOPICS) {
    if (lower.includes(t.toLowerCase()) || t.toLowerCase().includes(lower)) return t;
  }
  return null;
}

// ─── CONSTRUIR MENSAJES PARA LLAMA ───────────────────────────────────────────
function buildMessages(hist: HistMsg[], invContext: string | null): NimMessage[] {
  // Filtrar mensajes de bienvenida — Llama no debe verlos
  const filtered = hist.filter(m => !WELCOME_TEXTS.includes(m.content?.trim() ?? ""));

  // Detectar el tema seleccionado (acepta número o texto exacto/parcial)
  const temaMsg = hist.find(m => m.role === "user" && resolveTopicFromText(m.content?.trim() ?? "") !== null);
  const tema = temaMsg ? (resolveTopicFromText(temaMsg.content?.trim() ?? "") ?? "Configuraciones") : "Configuraciones";

  // Construir system prompt con el tema inyectado
  const systemWithTema = SYSTEM_PROMPT.replace("{{TEMA}}", tema)
    + `\n\nEl cliente seleccionó el tema: ${tema}. Inicie el flujo correspondiente.`;

  const messages: NimMessage[] = [{ role: "system", content: systemWithTema }];

  for (const m of filtered) {
    if (m.role === "user" || m.role === "assistant" || m.role === "ia") {
      // Saltar si es el mensaje de selección de tema (ya está en el system prompt)
      if (m.role === "user" && resolveTopicFromText(m.content?.trim() ?? "") !== null) continue;

      const nimRole: "user" | "assistant" = (m.role === "user") ? "user" : "assistant";

      if (m.mediaUrl && m.mediaType?.startsWith("image/")) {
        messages.push({
          role: nimRole,
          content: [
            { type: "text", text: m.content || "Imagen adjunta" },
            { type: "image_url", image_url: { url: m.mediaUrl } },
          ],
        });
      } else {
        let text = m.content || "";
        // Inyectar contexto de inventario justo antes del último mensaje del usuario
        if (invContext && nimRole === "user" && m === filtered[filtered.length - 1]) {
          text = `[Contexto interno — no mostrar al cliente]: ${invContext}\n\n${text}`;
        }
        messages.push({ role: nimRole, content: text });
      }
    }
  }

  // Si no hay mensajes de usuario reales aún, agregar uno ficticio para arrancar el flujo
  const hasUserMsg = messages.some(m => m.role === "user");
  if (!hasUserMsg) {
    messages.push({ role: "user", content: `El cliente seleccionó el tema: ${tema}. Por favor inicie el flujo.` });
  }

  return messages;
}

// ─── HANDLER PRINCIPAL ───────────────────────────────────────────────────────
Deno.serve(async (req: Request) => {
  const corsHeaders = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization, x-client-info, apikey",
  };

  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { case_id } = await req.json();
    if (!case_id) return new Response(JSON.stringify({ error: "case_id requerido" }), { status: 400, headers: corsHeaders });

    // Cargar caso
    const { data: caso, error: caseErr } = await db
      .from("sek_cases")
      .select("histcliente, histtecnico, estado, cliente")
      .eq("id", case_id)
      .maybeSingle();

    if (caseErr || !caso) {
      console.error("[seka-whatsapp] Caso no encontrado:", case_id);
      return new Response(JSON.stringify({ error: "caso_no_encontrado" }), { status: 404, headers: corsHeaders });
    }

    const estado = String(caso.estado || "").toLowerCase();
    if (estado === "cerrado" || estado === "resuelto" || estado === "escalado") {
      console.log("[seka-whatsapp] Caso ya no activo:", estado);
      return new Response(JSON.stringify({ ok: true, skipped: true }), { status: 200, headers: corsHeaders });
    }

    const histcliente: HistMsg[] = Array.isArray(caso.histcliente) ? caso.histcliente : [];
    const histtecnico: HistMsg[] = Array.isArray(caso.histtecnico) ? caso.histtecnico : [];

    // Combinar todos los mensajes ordenados por tiempo para saber en qué paso estamos
    const allMsgs = [...histcliente, ...histtecnico].sort((a, b) =>
      new Date(a.time || 0).getTime() - new Date(b.time || 0).getTime()
    );

    // Filtrar mensajes reales (sin bienvenidas ni cierres automáticos)
    const WELCOME_TEXTS_CHECK = [
      "Reciba un cordial saludo de parte del equipo de Soporte Sekunet. Gracias por contactarnos.",
      "Soy el Asistente Virtual de Sekunet. Para brindarle una mejor asistencia, necesitamos algunos datos para registrar su consulta.",
      "Por favor, compártanos la siguiente información:\n• Nombre completo\n• Correo electrónico\n• Nombre de la cuenta afiliada a Sekunet",
      "¿En relación con qué tema sería su consulta?",
      `¿En relación con qué tema sería su consulta?\n\n1. Configuraciones\n2. Reset\n3. Desvinculación\n4. Firmware\n5. Software\n6. Drivers\n7. Licencias\n8. Otro\n\nResponda con el número o el nombre del tema.`
    ];
    const CRON_CLOSE_TEXT = "Al no haber recibido respuesta, procederemos a cerrar esta conversación. Si necesita asistencia adicional, puede contactarnos nuevamente y con gusto le atenderemos. ¡Que tenga un excelente día!";
    const TOPICS_CHECK = ["Configuraciones","Reset","Desvinculación","Firmware","Software","Drivers","Licencias","Otro"];
    // El mensaje del menú de tema ahora tiene múltiples líneas — incluirlo en textos a ignorar
    const MENU_TEMA_PREFIX = "¿En relación con qué tema sería su consulta?";
    const MENU_TEXTO = `¿En relación con qué tema sería su consulta?\n\n1. Configuraciones\n2. Reset\n3. Desvinculación\n4. Firmware\n5. Software\n6. Drivers\n7. Licencias\n8. Otro\n\nResponda con el número o el nombre del tema.`;

    // Mensajes del usuario (sin bienvenidas)
    const userRealMsgs = histcliente.filter(m =>
      m.role === "user" && !WELCOME_TEXTS_CHECK.includes(m.content?.trim() ?? "")
    );

    // Respuestas de la IA (excluyendo SOLO cierres automáticos del cron — las bienvenidas SÍ cuentan)
    const iaMsgs = allMsgs.filter(m =>
      m.role === "ia" || m.role === "assistant" || m.role === "tecnico"
    );
    const iaRealMsgs = iaMsgs.filter(m =>
      m.content?.trim() !== CRON_CLOSE_TEXT
    );

    // Contar mensajes para flujo paso a paso
    const userCount = userRealMsgs.length;
    const iaCount   = iaRealMsgs.length;

    const lastIA    = iaRealMsgs[iaRealMsgs.length - 1];
    const lastUserMsg = userRealMsgs[userRealMsgs.length - 1];
    const lastIATime  = lastIA?.time ? new Date(lastIA.time).getTime() : 0;
    const lastUserTime = lastUserMsg?.time ? new Date(lastUserMsg.time).getTime() : 0;

    // Detectar tema — acepta número (1-8), texto exacto o parcial
    const topiIdx = userRealMsgs.findIndex(m => resolveTopicFromText(m.content?.trim() ?? "") !== null);
    let temaInferido = topiIdx >= 0 ? (resolveTopicFromText(userRealMsgs[topiIdx].content?.trim() ?? "") ?? "Consulta") : "Consulta";
    if (topiIdx < 0) {
      for (const m of userRealMsgs) {
        const lower = (m.content ?? "").toLowerCase();
        if (lower.includes("configur") || lower.includes("setup")) { temaInferido = "Configuraciones"; break; }
        if (lower.includes("reset") || lower.includes("restablecer") || lower.includes("reinici")) { temaInferido = "Reset"; break; }
        if (lower.includes("desvincul") || lower.includes("quitar") || lower.includes("eliminar")) { temaInferido = "Desvinculación"; break; }
        if (lower.includes("firmwar") || lower.includes("actualiz")) { temaInferido = "Firmware"; break; }
        if (lower.includes("softwar") || lower.includes("programa")) { temaInferido = "Software"; break; }
        if (lower.includes("driver")) { temaInferido = "Drivers"; break; }
        if (lower.includes("licen") || lower.includes("activa")) { temaInferido = "Licencias"; break; }
      }
    }
    const tema = temaInferido;

    // ═══════════════════════════════════════════════════════════════════════
    // FLUJO DE BIENVENIDA PASO A PASO (WhatsApp)
    // ═══════════════════════════════════════════════════════════════════════

    // PASO 0: Primer mensaje del usuario → saludo + presentación + pedir datos (3 mensajes separados)
    if (userCount === 1 && iaCount === 0) {
      const directReply = "Reciba un cordial saludo de parte del equipo de Soporte Sekunet. Gracias por contactarnos.";
      const msg1 = "Soy el Asistente Virtual de Sekunet. Para brindarle una mejor asistencia, necesitamos algunos datos para registrar su consulta.";
      const msg2 = "Por favor, compártanos la siguiente información:\n• Nombre completo\n• Correo electrónico\n• Nombre de la cuenta afiliada a Sekunet";
      const newMsg0: HistMsg = { role: "ia", author: "Asistente Sekunet", time: new Date().toISOString(), content: directReply };
      const newMsg1: HistMsg = { role: "ia", author: "Asistente Sekunet", time: new Date(Date.now() + 10).toISOString(), content: msg1 };
      const newMsg2: HistMsg = { role: "ia", author: "Asistente Sekunet", time: new Date(Date.now() + 20).toISOString(), content: msg2 };
      await db.from("sek_cases").update({ histtecnico: [...histtecnico, newMsg0, newMsg1, newMsg2] }).eq("id", case_id);
      return new Response(JSON.stringify({ ok: true, reply: [directReply, msg1, msg2] }), { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    // PASO 1: Segundo mensaje del usuario (datos proporcionados) → extraer datos y pedir tema
    // También activar si el usuario ya respondió con datos aunque iaCount difiera (caso borde)
    if (userCount === 2 && iaCount === 3) {
      // Extraer nombre, correo y cuenta del mensaje del cliente usando IA
      const datosMsg = userRealMsgs[userRealMsgs.length - 1]?.content ?? "";
      let nombreExtraido = "";
      let correoExtraido = "";
      let cuentaExtraida = "";

      try {
        const extractMessages: NimMessage[] = [
          {
            role: "system",
            content: `Eres un extractor de datos de contacto. Del siguiente mensaje de un cliente, extrae:
- nombre: el nombre completo de la persona
- correo: el correo electrónico
- cuenta: el nombre de la cuenta o empresa afiliada a Sekunet

Responde SOLO con JSON válido: {"nombre": "...", "correo": "...", "cuenta": "..."}
Si algún dato no está presente, usa cadena vacía "". No inventes datos.`,
          },
          { role: "user", content: datosMsg },
        ];
        const extractRaw = await callLlama(extractMessages);
        const jsonMatch = extractRaw.match(/\{[\s\S]*\}/);
        if (jsonMatch) {
          const parsed = JSON.parse(jsonMatch[0]);
          nombreExtraido = (parsed.nombre || "").trim();
          correoExtraido = (parsed.correo || "").trim();
          cuentaExtraida = (parsed.cuenta || "").trim();
          console.log(`[seka-whatsapp] Datos extraídos - nombre: ${nombreExtraido}, correo: ${correoExtraido}, cuenta: ${cuentaExtraida}`);
        }
      } catch (e: any) {
        console.error("[seka-whatsapp] Error extrayendo datos del cliente:", e.message);
      }

      // Actualizar el campo cliente con los datos extraídos + teléfono existente
      const currentCliente = (caso.cliente && typeof caso.cliente === "object") ? caso.cliente : {};
      const updatedCliente: Record<string, unknown> = { ...currentCliente };
      if (nombreExtraido) updatedCliente.nombre = nombreExtraido;
      if (correoExtraido) updatedCliente.correo = correoExtraido;
      if (cuentaExtraida) updatedCliente.cuenta = cuentaExtraida;

      // Actualizar también el título del caso con el nombre real del cliente
      const nuevoTitle = nombreExtraido
        ? `WhatsApp — ${nombreExtraido}`
        : ((caso.cliente && typeof caso.cliente === "object" && caso.cliente?.nombre) ? `WhatsApp — ${caso.cliente.nombre}` : undefined);

      const directReplyText = `¿En relación con qué tema sería su consulta?\n\n1. Configuraciones\n2. Reset\n3. Desvinculación\n4. Firmware\n5. Software\n6. Drivers\n7. Licencias\n8. Otro\n\nResponda con el número o el nombre del tema.`;
      
      const newMsg: HistMsg = { role: "ia", author: "Asistente Sekunet", time: new Date().toISOString(), content: directReplyText };

      const updatePayload: Record<string, unknown> = {
        histtecnico: [...histtecnico, newMsg],
        cliente: updatedCliente,
      };
      if (nuevoTitle) updatePayload.title = nuevoTitle;

      await db.from("sek_cases").update(updatePayload).eq("id", case_id);
      return new Response(JSON.stringify({ ok: true, reply: directReplyText }), { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    // PASO 2: Tercer mensaje del usuario (tema seleccionado) → pedir marca
    if (userCount === 3 && iaCount === 4) {
      const directReply = "Por favor, indíquenos la marca del equipo.";
      const newMsg: HistMsg = { role: "ia", author: "Asistente Sekunet", time: new Date().toISOString(), content: directReply };
      await db.from("sek_cases").update({ histtecnico: [...histtecnico, newMsg] }).eq("id", case_id);
      return new Response(JSON.stringify({ ok: true, reply: directReply }), { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    // PASO 3: Cuarto mensaje del usuario (marca indicada) → pedir modelo
    if (userCount === 4 && iaCount === 5) {
      const directReply = "¿Nos podría indicar el modelo del equipo, por favor?";
      const newMsg: HistMsg = { role: "ia", author: "Asistente Sekunet", time: new Date().toISOString(), content: directReply };
      await db.from("sek_cases").update({ histtecnico: [...histtecnico, newMsg] }).eq("id", case_id);
      return new Response(JSON.stringify({ ok: true, reply: directReply }), { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    // PASO 4: Quinto mensaje del usuario (modelo indicado) → buscar inventario
    if (userCount === 5 && iaCount === 6) {
      const marca = topiIdx >= 0 ? (userRealMsgs[topiIdx + 1]?.content?.trim() ?? "") : (userRealMsgs[3]?.content?.trim() ?? "");
      const modelo = topiIdx >= 0 ? (userRealMsgs[topiIdx + 2]?.content?.trim() ?? "") : (userRealMsgs[4]?.content?.trim() ?? "");
      
      const esNegativaModelo = /^no\b|no (la |lo )?tengo|no s[eé]/i.test(modelo);
      let directReply: string;
      
      if (esNegativaModelo) {
         if (tema === "Reset" || tema === "Desvinculación") {
            directReply = "No se preocupe. Por favor, adjunte una imagen clara y legible de la etiqueta del equipo; allí suele venir el modelo.";
            if (tema === "Reset" && /hik/i.test(marca)) {
               directReply = "No se preocupe. Por favor, adjunte una imagen clara y legible de la etiqueta del equipo y el archivo XML (obtenido desde SAPD Tools). En la etiqueta podremos verificar el modelo.";
            }
         } else {
            directReply = "Entendido. Para poder asistirle mejor, por favor describa brevemente el inconveniente que presenta.";
         }
      } else {
         const inv = await buscarInventario(`${marca} ${modelo}`);
         if (!inv.encontrado) {
           directReply = "El dispositivo indicado no forma parte de los equipos distribuidos por Sekunet, por lo que lamentablemente no podemos brindarle el soporte requerido. ¿Tiene alguna otra consulta relacionada con nuestros productos?";
         } else if (tema === "Reset") {
           const esHikvision = /hik/i.test(marca);
           directReply = esHikvision
             ? "Como parte de los requisitos del fabricante, requerimos una imagen clara y legible de la etiqueta del equipo y el archivo XML, el cual puede obtener mediante la herramienta SAPD Tools en la opción \"Olvidé mi contraseña\", ubicada en la parte inferior derecha del software. Por favor, adjunte ambos archivos."
             : "Por favor, adjunte una imagen clara y legible de la etiqueta del equipo.";
         } else if (tema === "Desvinculación") {
           directReply = "Como parte de los requisitos del fabricante, requerimos una imagen clara y legible de la etiqueta del equipo. Por favor, adjunte esta imagen.";
         } else {
           directReply = "Por favor, describa brevemente el inconveniente que presenta.";
         }
      }
      
      const newMsg: HistMsg = { role: "ia", author: "Asistente Sekunet", time: new Date().toISOString(), content: directReply };
      await db.from("sek_cases").update({ histtecnico: [...histtecnico, newMsg] }).eq("id", case_id);
      return new Response(JSON.stringify({ ok: true, reply: directReply }), { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    // PASO RESET-4: verificar archivos según marca
    const MSG_RESET_PIDE_ARCHIVOS = "imagen clara y legible de la etiqueta";
    const MSG_RESET_PIDE_IMAGEN = "adjunte nuevamente una imagen clara";
    const MSG_RESET_PIDE_XML = "adjunte nuevamente el archivo XML";
    if ((lastIA?.content?.includes(MSG_RESET_PIDE_ARCHIVOS) || lastIA?.content?.includes(MSG_RESET_PIDE_IMAGEN) || lastIA?.content?.includes(MSG_RESET_PIDE_XML)) && lastUserTime > lastIATime) {
      const modeloMsg = topiIdx >= 0 ? userRealMsgs[topiIdx + 2] : null;
      const modeloTime = modeloMsg ? new Date(modeloMsg.time ?? 0).getTime() : 0;
      const mensajesDesdePedido = userRealMsgs.filter(m => {
        const mTime = new Date(m.time ?? 0).getTime();
        return mTime > modeloTime;
      });
      
      const marca = topiIdx >= 0 ? (userRealMsgs[topiIdx + 1]?.content?.trim() ?? "") : "";
      const modelo = topiIdx >= 0 ? (userRealMsgs[topiIdx + 2]?.content?.trim() ?? "") : "";

      const tieneArchivos = mensajesDesdePedido.some(m => m.mediaUrl);
      if (!tieneArchivos) {
        const ultimoMsj = userRealMsgs[userRealMsgs.length - 1]?.content?.trim().toLowerCase() || "";
        const esEspera = /esper|minut|dame|deme|un momento|ahorita|voy|ya casi/i.test(ultimoMsj);
        
        if (esEspera) {
           return new Response(JSON.stringify({ ok: true, skipped: true }), { status: 200, headers: corsHeaders });
        }
        
        const msgs = buildMessages(histcliente, null);
        msgs[0].content += `\n\nATENCIÓN: El sistema está esperando que el cliente adjunte una fotografía de la etiqueta del equipo (marca: ${marca}, modelo: ${modelo}) para continuar. El cliente ha respondido sin adjuntar foto.
Ayúdele indicando amablemente dónde suele ubicarse la etiqueta en este tipo de equipos.
IMPORTANTE: Al finalizar, recuérdele amablemente que es indispensable adjuntar la foto para continuar. NO resuelva la duda técnica principal, solo asístale para encontrar la etiqueta.`;
        
        let aiReply = await callLlama(msgs);
        aiReply = await processTags(aiReply, case_id);
        aiReply = aiReply.replace(/__INV__.*?__INV__/gs, "").trim();

        // Agregar forzosamente la frase gatillo para asegurar que la siguiente vez la condición de "PIDE_ARCHIVOS" siga activa
        if (!aiReply.toLowerCase().includes("imagen clara y legible de la etiqueta")) {
           aiReply += "\n\nPor favor, asegúrese de enviarnos una imagen clara y legible de la etiqueta para poder continuar.";
        }

        const newMsg: HistMsg = { role: "ia", author: "Asistente Sekunet", time: new Date().toISOString(), content: aiReply };
        await db.from("sek_cases").update({ histtecnico: [...histtecnico, newMsg] }).eq("id", case_id);
        return new Response(JSON.stringify({ ok: true, reply: aiReply }), { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }
      const esHikvision = /hik/i.test(marca);

      // Buscar archivos en todos los mensajes desde el pedido
      let imagenUrl: string | null = null;
      let xmlUrl: string | null = null;
      for (const m of mensajesDesdePedido) {
        if (m.mediaUrl) {
          const mType = (m.mediaType || "").toLowerCase();
          const mName = (m.fileName || "").toLowerCase();
          const mUrl = (m.mediaUrl || "").toLowerCase();
          console.log("[seka-whatsapp] Archivo encontrado - type:", mType, "name:", mName, "url:", mUrl.substring(mUrl.lastIndexOf("/") + 1));
          if (mType.startsWith("image/")) {
            imagenUrl = m.mediaUrl;
          } else if (mType === "text/xml" || mType === "application/xml" || mType === "application/octet-stream" && (mName.endsWith(".xml") || mUrl.endsWith(".xml")) || mName.endsWith(".xml") || mUrl.endsWith(".xml")) {
            xmlUrl = m.mediaUrl;
          }
        }
      }

      console.log("[seka-whatsapp] Archivos recibidos - imagen:", !!imagenUrl, "XML:", !!xmlUrl, "esHikvision:", esHikvision, "totalMsgs:", mensajesDesdePedido.length);

      // Para Hikvision (en Reset): requiere ambos archivos
      if (esHikvision && tema === "Reset") {
        if (!imagenUrl && !xmlUrl) {
          const retry = "Por favor, adjunte la imagen de la etiqueta del equipo y el archivo XML.";
          const newMsg: HistMsg = { role: "ia", author: "Asistente Sekunet", time: new Date().toISOString(), content: retry };
          await db.from("sek_cases").update({ histtecnico: [...histtecnico, newMsg] }).eq("id", case_id);
          return new Response(JSON.stringify({ ok: true, reply: retry }), { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });
        }
        if (!imagenUrl) {
          const retry = "Por favor, adjunte una imagen clara y legible de la etiqueta del equipo.";
          const newMsg: HistMsg = { role: "ia", author: "Asistente Sekunet", time: new Date().toISOString(), content: retry };
          await db.from("sek_cases").update({ histtecnico: [...histtecnico, newMsg] }).eq("id", case_id);
          return new Response(JSON.stringify({ ok: true, reply: retry }), { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });
        }
        if (!xmlUrl) {
          const retry = "Por favor, adjunte el archivo XML obtenido con SAPD Tools.";
          const newMsg: HistMsg = { role: "ia", author: "Asistente Sekunet", time: new Date().toISOString(), content: retry };
          await db.from("sek_cases").update({ histtecnico: [...histtecnico, newMsg] }).eq("id", case_id);
          return new Response(JSON.stringify({ ok: true, reply: retry }), { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });
        }
      } else {
        // Para otras marcas: solo requiere imagen
        if (!imagenUrl) {
          const retry = "Por favor, adjunte una imagen clara y legible de la etiqueta del equipo.";
          const newMsg: HistMsg = { role: "ia", author: "Asistente Sekunet", time: new Date().toISOString(), content: retry };
          await db.from("sek_cases").update({ histtecnico: [...histtecnico, newMsg] }).eq("id", case_id);
          return new Response(JSON.stringify({ ok: true, reply: retry }), { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });
        }
      }

      // Ambos archivos presentes → verificar cada uno
      let imagenOk = false;
      let xmlOk = false;
      let motivoImagen = "";
      let motivoXml = "";

      // Verificar según la marca (Hikvision en Reset)
      if (esHikvision && tema === "Reset") {
        // Hikvision: extraer y comparar S/N
        let snImagen = "";
        let imagenLegible = false;
        try {
          const visionMessages: NimMessage[] = [
            {
              role: "system",
              content: `Eres un extractor de datos de etiquetas de equipos Hikvision. Responde SOLO con una línea JSON: {"sn": "serial_number", "legible": true/false, "razon": "motivo breve"}.
- sn: el número de serie (Serial No. o S/N) exacto como aparece en la etiqueta. En equipos Hikvision suele estar después de "Serial No.:" y es un código alfanumérico (ejemplo: F26114205). NO es el modelo (DS-xxxx).
- legible: la etiqueta es visible y el S/N es legible.
No agregues nada más.`,
            },
            {
              role: "user",
              content: [
                { type: "text", text: "Extrae el número de serie (S/N) de esta etiqueta de equipo." },
                { type: "image_url", image_url: { url: imagenUrl } },
              ],
            },
          ];
          const visionRaw = await callLlama(visionMessages);
          const jsonMatch = visionRaw.match(/\{[\s\S]*\}/);
          if (jsonMatch) {
            const result = JSON.parse(jsonMatch[0]);
            snImagen = result.sn || "";
            imagenLegible = result.legible || false;
            if (!imagenLegible) motivoImagen = result.razon || "no es posible visualizar claramente el número de serie";
          }
        } catch (e: any) {
          console.error("[seka-whatsapp] Vision error:", e.message);
          motivoImagen = "no fue posible analizar la imagen";
        }

        // Extraer S/N del XML directamente (sin LLM)
        let snXml = "";
        let xmlValido = false;
        try {
          const xmlResponse = await fetch(xmlUrl!);
          const xmlText = await xmlResponse.text();
          console.log("[seka-whatsapp] XML content (first 500):", xmlText.substring(0, 500));
          // Buscar S/N con patrones comunes de Hikvision SAPD Tools
          const snPatterns = [
            /<serialNumber>([^<]+)<\/serialNumber>/i,
            /<deviceSerialNo>([^<]+)<\/deviceSerialNo>/i,
            /<SerialNumber>([^<]+)<\/SerialNumber>/i,
            /<serial[^>]*>([^<]+)<\/serial[^>]*>/i,
            /<machineSN>([^<]+)<\/machineSN>/i,
            /<sn>([^<]+)<\/sn>/i,
            /serialNumber["\s:=]+["']?([A-Z0-9]+)/i,
            /serial[_\-]?no["\s:=]+["']?([A-Z0-9]+)/i,
          ];
          for (const pat of snPatterns) {
            const match = xmlText.match(pat);
            if (match && match[1]) {
              snXml = match[1].trim();
              xmlValido = true;
              console.log("[seka-whatsapp] S/N extraído del XML con patrón:", pat.source, "->", snXml);
              break;
            }
          }
          // Fallback: si no matcheó ningún patrón, usar LLM
          if (!snXml) {
            console.log("[seka-whatsapp] No se encontró S/N con regex, usando LLM...");
            const xmlMessages: NimMessage[] = [
              { role: "system", content: `Extrae el número de serie del siguiente XML. Responde SOLO con el S/N, nada más. Si no hay S/N, responde "NONE".` },
              { role: "user", content: xmlText.substring(0, 4000) },
            ];
            const xmlRaw = await callLlama(xmlMessages);
            const cleaned = xmlRaw.trim().replace(/["`]/g, "");
            if (cleaned && cleaned !== "NONE" && cleaned.length > 3 && cleaned.length < 50) {
              snXml = cleaned;
              xmlValido = true;
              console.log("[seka-whatsapp] S/N extraído del XML con LLM:", snXml);
            } else {
              motivoXml = "no se encontró un número de serie válido en el archivo XML";
            }
          }
        } catch (e: any) {
          console.error("[seka-whatsapp] XML error:", e.message);
          motivoXml = "no fue posible leer el archivo XML";
        }

        // Comparar S/N y determinar si ambos son válidos
        imagenOk = imagenLegible && snImagen.length > 0;
        xmlOk = xmlValido && snXml.length > 0;
        
        // Si ambos tienen S/N, verificar que coincidan (comparación flexible)
        let snCoinciden = false;
        if (imagenOk && xmlOk) {
          const normalizeSn = (sn: string) => sn.replace(/[\s\-_\.]/g, "").toUpperCase();
          const nImg = normalizeSn(snImagen);
          const nXml = normalizeSn(snXml);
          // Exacto, uno contiene al otro, o comparten >=6 chars consecutivos
          snCoinciden = nImg === nXml || nImg.includes(nXml) || nXml.includes(nImg);
          if (!snCoinciden && nImg.length >= 6 && nXml.length >= 6) {
            // Buscar subcadena común de al menos 6 caracteres
            for (let len = Math.min(nImg.length, nXml.length); len >= 6; len--) {
              for (let i = 0; i <= nImg.length - len; i++) {
                if (nXml.includes(nImg.substring(i, i + len))) { snCoinciden = true; break; }
              }
              if (snCoinciden) break;
            }
          }
          if (!snCoinciden) {
            motivoImagen = `el número de serie de la imagen (${snImagen}) no coincide con el del XML (${snXml})`;
            motivoXml = `el número de serie del XML (${snXml}) no coincide con el de la imagen (${snImagen})`;
          }
        }

        console.log("[seka-whatsapp] S/N - imagen:", JSON.stringify(snImagen), "XML:", JSON.stringify(snXml), "coinciden:", snCoinciden);

        // Si ambos pasaron Y los S/N coinciden → escalar normalmente
        if (imagenOk && xmlOk && snCoinciden) {
          const M02_TEXT = "Agradecemos su preferencia. En un momento será atendido por uno de nuestros agentes.";
          const newMsg: HistMsg = { role: "ia", author: "Asistente Sekunet", time: new Date().toISOString(), content: M02_TEXT };
          await db.from("sek_cases").update({
            histtecnico: [...histtecnico, newMsg],
            estado: "escalado",
            escalado_at: new Date().toISOString(),
            title: `${tema} — ${marca} ${modelo}`.substring(0, 120),
            tags: [tema === "Desvinculación" ? "desvinculacion" : "reset", "n2"],
          }).eq("id", case_id);
          return new Response(JSON.stringify({ ok: true, reply: M02_TEXT }), { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });
        }

        // Si ambos archivos tienen S/N válido PERO no coinciden → pedir de nuevo
        if (imagenOk && xmlOk && !snCoinciden) {
          // Marcar ambos como fallidos para que la lógica de reintento los pida de nuevo
          imagenOk = false;
          xmlOk = false;
          motivoImagen = "el número de serie de la imagen no coincide con el del archivo XML";
          motivoXml = "el número de serie del XML no coincide con el de la imagen";
        }
      } else {
        // Otras marcas: solo verificar imagen (legible + coincide marca/modelo)
        try {
          const visionMessages: NimMessage[] = [
            {
              role: "system",
              content: `Eres un verificador de imágenes de soporte técnico. Responde SOLO con una línea JSON: {"legible": true/false, "coincide": true/false, "razon": "motivo breve"}.
- legible: la etiqueta del equipo es visible y sus datos son legibles.
- coincide: la marca "${marca}" y el modelo "${modelo}" coinciden con lo que aparece en la etiqueta de la imagen.
No agregues nada más.`,
            },
            {
              role: "user",
              content: [
                { type: "text", text: "Analiza esta imagen de la etiqueta del equipo." },
                { type: "image_url", image_url: { url: imagenUrl } },
              ],
            },
          ];
          const visionRaw = await callLlama(visionMessages);
          const jsonMatch = visionRaw.match(/\{[\s\S]*\}/);
          if (jsonMatch) {
            const result = JSON.parse(jsonMatch[0]);
            imagenOk = result.legible && result.coincide;
            if (!imagenOk) motivoImagen = !result.legible ? "no es posible visualizar claramente la etiqueta" : `la imagen no corresponde al equipo ${marca} ${modelo} indicado`;
          }
        } catch (e: any) {
          console.error("[seka-whatsapp] Vision error:", e.message);
          motivoImagen = "no fue posible analizar la imagen";
        }

        console.log("[seka-whatsapp] Verificación imagen (no Hikvision):", imagenOk);

        // Si la imagen es válida → escalar
        if (imagenOk) {
          const M02_TEXT = "Agradecemos su preferencia. En un momento será atendido por uno de nuestros agentes.";
          const newMsg: HistMsg = { role: "ia", author: "Asistente Sekunet", time: new Date().toISOString(), content: M02_TEXT };
          await db.from("sek_cases").update({
            histtecnico: [...histtecnico, newMsg],
            estado: "escalado",
            escalado_at: new Date().toISOString(),
            title: `${tema} — ${marca} ${modelo}`.substring(0, 120),
            tags: [tema === "Desvinculación" ? "desvinculacion" : "reset", "n2"],
          }).eq("id", case_id);
          return new Response(JSON.stringify({ ok: true, reply: M02_TEXT }), { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });
        }
      }

      // Si alguno falló → manejar según marca y archivo específico
      const yaReintentoImagen = iaRealMsgs.some(m => m.content?.includes(MSG_RESET_PIDE_IMAGEN));
      const yaReintentoXML = iaRealMsgs.some(m => m.content?.includes(MSG_RESET_PIDE_XML));

      if (esHikvision && tema === "Reset") {
        // Hikvision: manejo de ambos archivos
        if (!imagenOk && !xmlOk) {
          // Ambos fallaron y ya se reintentó → escalar con nota
          if (yaReintentoImagen && yaReintentoXML) {
            const M02_TEXT = "Agradecemos su preferencia. En un momento será atendido por uno de nuestros agentes.";
            const newMsg: HistMsg = { role: "ia", author: "Asistente Sekunet", time: new Date().toISOString(), content: M02_TEXT };
            await db.from("sek_cases").update({
              histtecnico: [...histtecnico, newMsg],
              estado: "escalado",
              escalado_at: new Date().toISOString(),
              title: `${tema} — ${marca} ${modelo} — verificación pendiente`.substring(0, 120),
              tags: [tema === "Desvinculación" ? "desvinculacion" : "reset", "n2", "verificacion_pendiente"],
            }).eq("id", case_id);
            return new Response(JSON.stringify({ ok: true, reply: M02_TEXT }), { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });
          }
          // Primer fallo de ambos → pedir ambos de nuevo
          const retry = `Le informamos que ${motivoImagen} y ${motivoXml}. Por favor, adjunte nuevamente ambos archivos.`;
          const newMsg: HistMsg = { role: "ia", author: "Asistente Sekunet", time: new Date().toISOString(), content: retry };
          await db.from("sek_cases").update({ histtecnico: [...histtecnico, newMsg] }).eq("id", case_id);
          return new Response(JSON.stringify({ ok: true, reply: retry }), { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });
        }

        if (!imagenOk) {
          // Imagen falló
          if (yaReintentoImagen) {
            // Ya se reintentó → escalar con nota
            const M02_TEXT = "Agradecemos su preferencia. En un momento será atendido por uno de nuestros agentes.";
            const newMsg: HistMsg = { role: "ia", author: "Asistente Sekunet", time: new Date().toISOString(), content: M02_TEXT };
            await db.from("sek_cases").update({
              histtecnico: [...histtecnico, newMsg],
              estado: "escalado",
              escalado_at: new Date().toISOString(),
              title: `${tema} — ${marca} ${modelo} — imagen pendiente`.substring(0, 120),
              tags: [tema === "Desvinculación" ? "desvinculacion" : "reset", "n2", "imagen_pendiente"],
            }).eq("id", case_id);
            return new Response(JSON.stringify({ ok: true, reply: M02_TEXT }), { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });
          }
          // Primer fallo → pedir solo imagen
          const retry = `Le informamos que ${motivoImagen}. Por favor, adjunte nuevamente una imagen clara de la etiqueta del equipo.`;
          const newMsg: HistMsg = { role: "ia", author: "Asistente Sekunet", time: new Date().toISOString(), content: retry };
          await db.from("sek_cases").update({ histtecnico: [...histtecnico, newMsg] }).eq("id", case_id);
          return new Response(JSON.stringify({ ok: true, reply: retry }), { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });
        }

        if (!xmlOk) {
          // XML falló
          if (yaReintentoXML) {
            // Ya se reintentó → escalar con nota
            const M02_TEXT = "Agradecemos su preferencia. En un momento será atendido por uno de nuestros agentes.";
            const newMsg: HistMsg = { role: "ia", author: "Asistente Sekunet", time: new Date().toISOString(), content: M02_TEXT };
            await db.from("sek_cases").update({
              histtecnico: [...histtecnico, newMsg],
              estado: "escalado",
              escalado_at: new Date().toISOString(),
              title: `${tema} — ${marca} ${modelo} — XML pendiente`.substring(0, 120),
              tags: [tema === "Desvinculación" ? "desvinculacion" : "reset", "n2", "xml_pendiente"],
            }).eq("id", case_id);
            return new Response(JSON.stringify({ ok: true, reply: M02_TEXT }), { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });
          }
          // Primer fallo → pedir solo XML
          const retry = `Le informamos que ${motivoXml}. Por favor, adjunte nuevamente el archivo XML.`;
          const newMsg: HistMsg = { role: "ia", author: "Asistente Sekunet", time: new Date().toISOString(), content: retry };
          await db.from("sek_cases").update({ histtecnico: [...histtecnico, newMsg] }).eq("id", case_id);
          return new Response(JSON.stringify({ ok: true, reply: retry }), { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });
        }
      } else {
        // Otras marcas: solo manejo de imagen
        if (!imagenOk) {
          if (yaReintentoImagen) {
            // Ya se reintentó → escalar con nota
            const M02_TEXT = "Agradecemos su preferencia. En un momento será atendido por uno de nuestros agentes.";
            const newMsg: HistMsg = { role: "ia", author: "Asistente Sekunet", time: new Date().toISOString(), content: M02_TEXT };
            await db.from("sek_cases").update({
              histtecnico: [...histtecnico, newMsg],
              estado: "escalado",
              escalado_at: new Date().toISOString(),
              title: `${tema} — ${marca} ${modelo} — imagen pendiente`.substring(0, 120),
              tags: [tema === "Desvinculación" ? "desvinculacion" : "reset", "n2", "imagen_pendiente"],
            }).eq("id", case_id);
            return new Response(JSON.stringify({ ok: true, reply: M02_TEXT }), { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });
          }
          // Primer fallo → pedir imagen de nuevo
          const retry = `Le informamos que ${motivoImagen}. Por favor, adjunte nuevamente una imagen clara de la etiqueta del equipo.`;
          const newMsg: HistMsg = { role: "ia", author: "Asistente Sekunet", time: new Date().toISOString(), content: retry };
          await db.from("sek_cases").update({ histtecnico: [...histtecnico, newMsg] }).eq("id", case_id);
          return new Response(JSON.stringify({ ok: true, reply: retry }), { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });
        }
      }
    }

    // PASO 3b: la última IA preguntó si tiene otra consulta (fuera de cartera) → detectar Sí/No
    const MSG_FUERA_CARTERA = "El dispositivo indicado no forma parte de los equipos distribuidos por Sekunet";
    if (lastIA?.content?.includes(MSG_FUERA_CARTERA)) {
      const respuesta = userRealMsgs[userRealMsgs.length - 1].content?.trim().toLowerCase() ?? "";
      const esNo = /^no\b|^neg|^gracias|^no,|^no\s|^nop/.test(respuesta);
      if (esNo) {
        const M03_TEXT = "Ha sido un gusto atenderle. Si tiene alguna otra consulta, no dude en contactarnos nuevamente. ¡Que tenga un excelente día!";
        const newMsg: HistMsg = { role: "ia", author: "Asistente Sekunet", time: new Date().toISOString(), content: M03_TEXT };
        await db.from("sek_cases").update({ histtecnico: [...histtecnico, newMsg], estado: "cerrado" }).eq("id", case_id);
        return new Response(JSON.stringify({ ok: true, reply: M03_TEXT }), { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      } else {
        // Sí → pedir descripción del inconveniente directamente (marca y modelo ya se tienen)
        const directReply = "Por favor, describa brevemente el inconveniente que presenta.";
        const newMsg: HistMsg = { role: "ia", author: "Asistente Sekunet", time: new Date().toISOString(), content: directReply };
        await db.from("sek_cases").update({ histtecnico: [...histtecnico, newMsg] }).eq("id", case_id);
        return new Response(JSON.stringify({ ok: true, reply: directReply }), { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }
    }


    // PASO 4: la última IA pidió descripción Y el último usuario respondió después → escalar
    if (lastIA?.content?.includes("describa brevemente") && lastUserTime > lastIATime) {
      const descripcion = lastUserMsg?.content?.trim() ?? "";
      const M02_TEXT = "Agradecemos su preferencia. En un momento será atendido por uno de nuestros agentes.";
      const newMsg: HistMsg = { role: "ia", author: "Asistente Sekunet", time: new Date().toISOString(), content: M02_TEXT };
      await db.from("sek_cases").update({
        histtecnico: [...histtecnico, newMsg],
        estado: "escalado",
        escalado_at: new Date().toISOString(),
        title: `Widget — ${tema} — ${descripcion}`.substring(0, 120),
        tags: ["n2"],
      }).eq("id", case_id);
      return new Response(JSON.stringify({ ok: true, reply: M02_TEXT }), { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    // Construir mensajes y llamar a Llama
    const messages = buildMessages(histcliente, null);
    let rawReply = await callLlama(messages);
    console.log("[seka-whatsapp] Raw reply:", rawReply);

    // Si Llama emitió [BUSCAR_INVENTARIO], resolver y rellamar con resultado como system message
    if (/\[BUSCAR_INVENTARIO:/i.test(rawReply)) {
      const invMatch = rawReply.match(/\[BUSCAR_INVENTARIO:\s*([^\]]+)\]/i);
      if (invMatch) {
        const inv = await buscarInventario(invMatch[1].trim());
        const invResult = inv.encontrado
          ? `[RESULTADO_INVENTARIO] El equipo "${invMatch[1].trim()}" SÍ está en la cartera de Sekunet. ${inv.detalle}. ACCIÓN: escriba al cliente exactamente esto: "Por favor, describa brevemente el inconveniente que presenta."`
          : `[RESULTADO_INVENTARIO] El equipo "${invMatch[1].trim()}" NO está en la cartera de Sekunet. ACCIÓN: escriba al cliente exactamente esto: "El dispositivo indicado no forma parte de los equipos distribuidos por Sekunet, por lo que lamentablemente no podemos brindarle el soporte requerido. ¿Tiene alguna otra consulta relacionada con nuestros productos?"`;

        // Agregar resultado como mensaje system y rellamar
        const messages2 = [...messages, { role: "system" as const, content: invResult }];
        rawReply = await callLlama(messages2);
        console.log("[seka-whatsapp] Reply tras inventario:", rawReply);
      }
    }

    // Reemplazar etiquetas de mensaje por su texto exacto
    const M02 = "Agradecemos su preferencia. En un momento será atendido por uno de nuestros agentes.";
    const M03 = "Ha sido un gusto atenderle. Si tiene alguna otra consulta, no dude en contactarnos nuevamente. ¡Que tenga un excelente día!";
    const M04 = "Esta consulta corresponde al departamento de ventas. Le invitamos a contactarlos al +506 2290 5585, vía WhatsApp al +506 8757 5820 o al correo info@sekunet.com. Ha sido un gusto atenderle. ¡Que tenga un excelente día!";
    rawReply = rawReply
      .replace(/\bM02\b/g, M02)
      .replace(/\bM03\b/g, M03)
      .replace(/\bM04\b/g, M04);

    // Procesar otros tags (ESCALAR_N2, CERRAR) y limpiar texto
    let cleanReply = await processTags(rawReply, case_id);

    // Limpiar contexto interno si quedó en el texto
    cleanReply = cleanReply.replace(/__INV__.*?__INV__/gs, "").trim();

    if (!cleanReply) {
      return new Response(JSON.stringify({ ok: true, skipped: true }), { status: 200, headers: corsHeaders });
    }

    // Guardar respuesta en histtecnico
    const newMsg: HistMsg = {
      role: "ia",
      author: "Asistente Sekunet",
      time: new Date().toISOString(),
      content: cleanReply,
    };

    const updatedHist = [...histtecnico, newMsg];
    await db.from("sek_cases").update({ histtecnico: updatedHist }).eq("id", case_id);

    return new Response(JSON.stringify({ ok: true, reply: cleanReply }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });

  } catch (e: any) {
    console.error("[seka-whatsapp] ERROR:", e.message);
    return new Response(JSON.stringify({ error: e.message }), { status: 500, headers: corsHeaders });
  }
});
