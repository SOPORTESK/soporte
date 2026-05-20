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
const SYSTEM_PROMPT = `Usted es SEKA, especialista de soporte técnico de Sekunet (Costa Rica).
Trate siempre de usted. Sin emojis. Máximo 2 oraciones por respuesta.
Una sola pregunta o instrucción por mensaje. Espere respuesta antes de continuar.
Nunca mencione que es una IA ni un asistente virtual. No se presente, el cliente ya fue saludado.

════════════════════════════════════════════
FLUJO OBLIGATORIO — SIGA ESTE ORDEN EXACTO
════════════════════════════════════════════

PASO 1 — SOLICITAR MARCA
Diga exactamente: "Por favor, indíquenos la marca del equipo."

PASO 2 — SOLICITAR MODELO
Diga exactamente: "¿Nos podría indicar el modelo del equipo, por favor?"

PASO 3 — VALIDAR EN INVENTARIO
Antes de emitir el tag, normalice la marca y el modelo:
- Corrija errores tipográficos obvios (ej. "Hikvission" → "Hikvision")
- Elimine prefijos redundantes del modelo solo si son evidentemente parte de la marca (ej. "HIK-DS-3E0508" → use "DS-3E0508")
- Reemplace la letra O por el número 0 cuando sea parte de un código alfanumérico (ej. "3E0508-O" → "3E0508-0")
- Use solo la raíz del modelo sin sufijos ambiguos si el modelo completo no coincide

Luego emita: [BUSCAR_INVENTARIO: marca modelo_normalizado]
El sistema verificará si está en la cartera de Sekunet.
La búsqueda debe ser inteligente: tolere variaciones ortográficas, abreviaciones y errores tipográficos del cliente.

Si NO está en cartera → diga exactamente:
"El dispositivo indicado no forma parte de los equipos distribuidos por Sekunet, por lo que lamentablemente no podemos brindarle el soporte requerido. ¿Tiene alguna otra consulta relacionada con nuestros productos?"
  → Si el cliente dice Sí → regrese al PASO 1
  → Si el cliente dice No → diga M03 y emita [CERRAR]

Si SÍ está en cartera → continúe al PASO 4

PASO 4 — SOLICITAR DESCRIPCIÓN DEL INCONVENIENTE
Diga exactamente: "Por favor, describa brevemente el inconveniente que presenta."

PASO 5 — ESCALAR
Cuando el cliente responda con la descripción, diga exactamente M02 y emita [ESCALAR_N2: Configuraciones — {descripción breve del inconveniente}]

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
      console.error("[seka-widget] Llama error:", res.status, err);
      throw new Error(`llama_error:${res.status}`);
    }
    const data = await res.json();
    return data.choices?.[0]?.message?.content?.trim() ?? "";
  } catch (e: any) {
    console.warn("[seka-widget] Llama falló, usando Gemini como fallback:", e.message);
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
    console.error("[seka-widget] Error inventario:", e.message);
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
  "Mi nombre es Seka, asistente virtual de Sekunet. Para brindarle una mejor asistencia, requerimos algunos datos importantes sobre su consulta.",
  "¿En relación a qué tema sería su consulta?",
];

const TOPICS = ["Configuraciones","Reset","Desvinculación","Firmware","Software","Drivers","Licencias","Otro"];

// ─── CONSTRUIR MENSAJES PARA LLAMA ───────────────────────────────────────────
function buildMessages(hist: HistMsg[], invContext: string | null): NimMessage[] {
  // Filtrar mensajes de bienvenida — Llama no debe verlos
  const filtered = hist.filter(m => !WELCOME_TEXTS.includes(m.content?.trim() ?? ""));

  // Detectar el tema seleccionado (primer mensaje de usuario que sea un botón de tema)
  const temaMsg = hist.find(m => m.role === "user" && TOPICS.includes(m.content?.trim() ?? ""));
  const tema = temaMsg?.content?.trim() ?? "Configuraciones";

  // Construir system prompt con el tema inyectado
  const systemWithTema = SYSTEM_PROMPT.replace("{{TEMA}}", tema)
    + `\n\nEl cliente seleccionó el tema: ${tema}. Inicie el flujo correspondiente.`;

  const messages: NimMessage[] = [{ role: "system", content: systemWithTema }];

  for (const m of filtered) {
    if (m.role === "user" || m.role === "assistant" || m.role === "ia") {
      // Saltar si es el mensaje del botón de tema (ya está en el system prompt)
      if (m.role === "user" && TOPICS.includes(m.content?.trim() ?? "")) continue;

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
      console.error("[seka-widget] Caso no encontrado:", case_id);
      return new Response(JSON.stringify({ error: "caso_no_encontrado" }), { status: 404, headers: corsHeaders });
    }

    const estado = String(caso.estado || "").toLowerCase();
    if (estado === "cerrado" || estado === "resuelto" || estado === "escalado") {
      console.log("[seka-widget] Caso ya no activo:", estado);
      return new Response(JSON.stringify({ ok: true, skipped: true }), { status: 200, headers: corsHeaders });
    }

    const histcliente: HistMsg[] = Array.isArray(caso.histcliente) ? caso.histcliente : [];

    // Filtrar mensajes reales (sin bienvenidas)
    const WELCOME_TEXTS_CHECK = [
      "Reciba un cordial saludo de parte del equipo de Soporte Sekunet. Gracias por contactarnos.",
      "Mi nombre es Seka, asistente virtual de Sekunet. Para brindarle una mejor asistencia, requerimos algunos datos importantes sobre su consulta.",
      "¿En relación a qué tema sería su consulta?",
    ];
    const TOPICS_CHECK = ["Configuraciones","Reset","Desvinculación","Firmware","Software","Drivers","Licencias","Otro"];
    const realMsgs = histcliente.filter(m => !WELCOME_TEXTS_CHECK.includes(m.content?.trim() ?? ""));
    const userRealMsgs = realMsgs.filter(m => m.role === "user");

    // Detectar posición del botón de tema en los mensajes reales del usuario
    const topiIdx = userRealMsgs.findIndex(m => TOPICS_CHECK.includes(m.content?.trim() ?? ""));
    const iaRealMsgs = realMsgs.filter(m => m.role === "ia" || m.role === "assistant");
    const tema = topiIdx >= 0 ? (userRealMsgs[topiIdx].content?.trim() ?? "Consulta") : "Consulta";

    // PASO 1: botón de tema es el último mensaje del usuario → preguntar marca
    const lastIA = iaRealMsgs[iaRealMsgs.length - 1];
    const lastUserMsg = userRealMsgs[userRealMsgs.length - 1];
    const lastIATime = lastIA?.time ? new Date(lastIA.time).getTime() : 0;
    const lastUserTime = lastUserMsg?.time ? new Date(lastUserMsg.time).getTime() : 0;
    if (topiIdx >= 0 && topiIdx === userRealMsgs.length - 1) {
      const directReply = "Por favor, indíquenos la marca del equipo.";
      const newMsg: HistMsg = { role: "ia", author: "Asistente Sekunet", time: new Date().toISOString(), content: directReply };
      await db.from("sek_cases").update({ histcliente: [...histcliente, newMsg] }).eq("id", case_id);
      return new Response(JSON.stringify({ ok: true, reply: directReply }), { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    // PASO 2: hay 1 mensaje después del tema y la última IA preguntó marca → preguntar modelo
    if (topiIdx >= 0 && userRealMsgs.length === topiIdx + 2 && lastIA?.content?.includes("marca")) {
      const directReply = "¿Nos podría indicar el modelo del equipo, por favor?";
      const newMsg: HistMsg = { role: "ia", author: "Asistente Sekunet", time: new Date().toISOString(), content: directReply };
      await db.from("sek_cases").update({ histcliente: [...histcliente, newMsg] }).eq("id", case_id);
      return new Response(JSON.stringify({ ok: true, reply: directReply }), { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    // PASO 3: hay 2 mensajes después del tema y la última IA preguntó modelo → buscar inventario
    if (topiIdx >= 0 && userRealMsgs.length === topiIdx + 3 && lastIA?.content?.includes("modelo")) {
      const marca = userRealMsgs[topiIdx + 1].content?.trim() ?? "";
      const modelo = userRealMsgs[topiIdx + 2].content?.trim() ?? "";
      const inv = await buscarInventario(`${marca} ${modelo}`);
      let directReply: string;
      if (!inv.encontrado) {
        directReply = "El dispositivo indicado no forma parte de los equipos distribuidos por Sekunet, por lo que lamentablemente no podemos brindarle el soporte requerido. ¿Tiene alguna otra consulta relacionada con nuestros productos?";
      } else if (tema === "Reset") {
        const esHikvision = /hik/i.test(marca);
        directReply = esHikvision
          ? "Como parte de los requisitos del fabricante, requerimos una imagen clara y legible de la etiqueta del equipo y el archivo XML, el cual puede obtener mediante la herramienta SAPD Tools en la opción \"Olvidé mi contraseña\", ubicada en la parte inferior derecha del software. Por favor, adjunte ambos archivos."
          : "Por favor, adjunte una imagen clara y legible de la etiqueta del equipo.";
      } else {
        directReply = "Por favor, describa brevemente el inconveniente que presenta.";
      }
      const newMsg: HistMsg = { role: "ia", author: "Asistente Sekunet", time: new Date().toISOString(), content: directReply };
      await db.from("sek_cases").update({ histcliente: [...histcliente, newMsg] }).eq("id", case_id);
      return new Response(JSON.stringify({ ok: true, reply: directReply }), { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    // PASO RESET-4: verificar archivos según marca
    const MSG_RESET_PIDE_ARCHIVOS = "imagen clara y legible de la etiqueta";
    const MSG_RESET_PIDE_IMAGEN = "adjunte nuevamente una imagen clara";
    const MSG_RESET_PIDE_XML = "adjunte nuevamente el archivo XML";
    if ((lastIA?.content?.includes(MSG_RESET_PIDE_ARCHIVOS) || lastIA?.content?.includes(MSG_RESET_PIDE_IMAGEN) || lastIA?.content?.includes(MSG_RESET_PIDE_XML)) && lastUserTime > lastIATime) {
      // Verificar que el usuario haya enviado al menos un archivo
      const mensajesDesdePedido = userRealMsgs.filter(m => {
        const mTime = new Date(m.time ?? 0).getTime();
        return mTime > lastIATime;
      });
      
      const tieneArchivos = mensajesDesdePedido.some(m => m.mediaUrl);
      if (!tieneArchivos) {
        // El usuario escribió pero no adjuntó archivos, no procesar todavía
        return new Response(JSON.stringify({ ok: true, skipped: true }), { status: 200, headers: corsHeaders });
      }
      const marca = topiIdx >= 0 ? (userRealMsgs[topiIdx + 1]?.content?.trim() ?? "") : "";
      const modelo = topiIdx >= 0 ? (userRealMsgs[topiIdx + 2]?.content?.trim() ?? "") : "";
      const esHikvision = /hik/i.test(marca);

      // Buscar archivos en todos los mensajes desde el pedido
      let imagenUrl: string | null = null;
      let xmlUrl: string | null = null;
      for (const m of mensajesDesdePedido) {
        if (m.mediaUrl) {
          if (m.mediaType?.startsWith("image/")) {
            imagenUrl = m.mediaUrl;
          } else if (m.mediaType === "text/xml" || m.mediaType === "application/xml" || m.mediaUrl.toLowerCase().endsWith(".xml")) {
            xmlUrl = m.mediaUrl;
          }
        }
      }

      console.log("[seka-widget] Archivos recibidos - imagen:", !!imagenUrl, "XML:", !!xmlUrl, "esHikvision:", esHikvision);

      // Para Hikvision: requiere ambos archivos
      if (esHikvision) {
        if (!imagenUrl && !xmlUrl) {
          const retry = "Por favor, adjunte la imagen de la etiqueta del equipo y el archivo XML.";
          const newMsg: HistMsg = { role: "ia", author: "Asistente Sekunet", time: new Date().toISOString(), content: retry };
          await db.from("sek_cases").update({ histcliente: [...histcliente, newMsg] }).eq("id", case_id);
          return new Response(JSON.stringify({ ok: true, reply: retry }), { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });
        }
        if (!imagenUrl) {
          const retry = "Por favor, adjunte una imagen clara y legible de la etiqueta del equipo.";
          const newMsg: HistMsg = { role: "ia", author: "Asistente Sekunet", time: new Date().toISOString(), content: retry };
          await db.from("sek_cases").update({ histcliente: [...histcliente, newMsg] }).eq("id", case_id);
          return new Response(JSON.stringify({ ok: true, reply: retry }), { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });
        }
        if (!xmlUrl) {
          const retry = "Por favor, adjunte el archivo XML obtenido con SAPD Tools.";
          const newMsg: HistMsg = { role: "ia", author: "Asistente Sekunet", time: new Date().toISOString(), content: retry };
          await db.from("sek_cases").update({ histcliente: [...histcliente, newMsg] }).eq("id", case_id);
          return new Response(JSON.stringify({ ok: true, reply: retry }), { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });
        }
      } else {
        // Para otras marcas: solo requiere imagen
        if (!imagenUrl) {
          const retry = "Por favor, adjunte una imagen clara y legible de la etiqueta del equipo.";
          const newMsg: HistMsg = { role: "ia", author: "Asistente Sekunet", time: new Date().toISOString(), content: retry };
          await db.from("sek_cases").update({ histcliente: [...histcliente, newMsg] }).eq("id", case_id);
          return new Response(JSON.stringify({ ok: true, reply: retry }), { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });
        }
      }

      // Ambos archivos presentes → verificar cada uno
      let imagenOk = false;
      let xmlOk = false;
      let motivoImagen = "";
      let motivoXml = "";

      // Verificar según la marca
      if (esHikvision) {
        // Hikvision: extraer y comparar S/N
        let snImagen = "";
        let imagenLegible = false;
        try {
          const visionMessages: NimMessage[] = [
            {
              role: "system",
              content: `Eres un extractor de datos de etiquetas de equipos. Responde SOLO con una línea JSON: {"sn": "serial_number", "legible": true/false, "razon": "motivo breve"}.
- sn: el número de serie (S/N) exacto como aparece en la etiqueta.
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
          console.error("[seka-widget] Vision error:", e.message);
          motivoImagen = "no fue posible analizar la imagen";
        }

        // Extraer S/N del XML con Llama
        let snXml = "";
        let xmlValido = false;
        try {
          const xmlResponse = await fetch(xmlUrl);
          const xmlText = await xmlResponse.text();
          const xmlMessages: NimMessage[] = [
            {
              role: "system",
              content: `Eres un extractor de datos de archivos XML de reset. Responde SOLO con una línea JSON: {"sn": "serial_number", "valido": true/false, "razon": "motivo breve"}.
- sn: el número de serie (S/N) encontrado en el XML.
- valido: el XML contiene un número de serie válido.
No agregues nada más.`,
            },
            {
              role: "user",
              content: `Extrae el número de serie (S/N) de este XML:\n\n${xmlText.substring(0, 4000)}`,
            },
          ];
          const xmlRaw = await callLlama(xmlMessages);
          const xmlMatch = xmlRaw.match(/\{[\s\S]*\}/);
          if (xmlMatch) {
            const result = JSON.parse(xmlMatch[0]);
            snXml = result.sn || "";
            xmlValido = result.valido || false;
            if (!xmlValido) motivoXml = result.razon || "el XML no contiene un número de serie válido";
          }
        } catch (e: any) {
          console.error("[seka-widget] XML error:", e.message);
          motivoXml = "no fue posible leer el archivo XML";
        }

        // Comparar S/N y determinar si ambos son válidos
        imagenOk = imagenLegible && snImagen.length > 0;
        xmlOk = xmlValido && snXml.length > 0;
        
        // Si ambos tienen S/N, verificar que coincidan
        let snCoinciden = false;
        if (imagenOk && xmlOk) {
          // Normalizar S/N para comparación (quitar espacios, guiones, mayúsculas)
          const normalizeSn = (sn: string) => sn.replace(/[\s\-_]/g, "").toUpperCase();
          snCoinciden = normalizeSn(snImagen) === normalizeSn(snXml);
          if (!snCoinciden) {
            motivoImagen = `el número de serie de la imagen (${snImagen}) no coincide con el del XML (${snXml})`;
            motivoXml = `el número de serie del XML (${snXml}) no coincide con el de la imagen (${snImagen})`;
          }
        }

        console.log("[seka-widget] S/N - imagen:", snImagen, "XML:", snXml, "coinciden:", snCoinciden);

        // Si ambos pasaron Y los S/N coinciden → escalar
        if (imagenOk && xmlOk && snCoinciden) {
          const M02_TEXT = "Agradecemos su preferencia. En un momento será atendido por uno de nuestros agentes.";
          const newMsg: HistMsg = { role: "ia", author: "Asistente Sekunet", time: new Date().toISOString(), content: M02_TEXT };
          await db.from("sek_cases").update({
            histcliente: [...histcliente, newMsg],
            estado: "escalado",
            escalado_at: new Date().toISOString(),
            title: `Reset — ${marca} ${modelo}`.substring(0, 120),
            tags: ["reset", "n2"],
          }).eq("id", case_id);
          return new Response(JSON.stringify({ ok: true, reply: M02_TEXT }), { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });
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
          console.error("[seka-widget] Vision error:", e.message);
          motivoImagen = "no fue posible analizar la imagen";
        }

        console.log("[seka-widget] Verificación imagen (no Hikvision):", imagenOk);

        // Si la imagen es válida → escalar
        if (imagenOk) {
          const M02_TEXT = "Agradecemos su preferencia. En un momento será atendido por uno de nuestros agentes.";
          const newMsg: HistMsg = { role: "ia", author: "Asistente Sekunet", time: new Date().toISOString(), content: M02_TEXT };
          await db.from("sek_cases").update({
            histcliente: [...histcliente, newMsg],
            estado: "escalado",
            escalado_at: new Date().toISOString(),
            title: `Reset — ${marca} ${modelo}`.substring(0, 120),
            tags: ["reset", "n2"],
          }).eq("id", case_id);
          return new Response(JSON.stringify({ ok: true, reply: M02_TEXT }), { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });
        }
      }

      // Si alguno falló → manejar según marca y archivo específico
      const yaReintentoImagen = iaRealMsgs.some(m => m.content?.includes(MSG_RESET_PIDE_IMAGEN));
      const yaReintentoXML = iaRealMsgs.some(m => m.content?.includes(MSG_RESET_PIDE_XML));

      if (esHikvision) {
        // Hikvision: manejo de ambos archivos
        if (!imagenOk && !xmlOk) {
          // Ambos fallaron y ya se reintentó → escalar con nota
          if (yaReintentoImagen && yaReintentoXML) {
            const M02_TEXT = "Agradecemos su preferencia. En un momento será atendido por uno de nuestros agentes.";
            const newMsg: HistMsg = { role: "ia", author: "Asistente Sekunet", time: new Date().toISOString(), content: M02_TEXT };
            await db.from("sek_cases").update({
              histcliente: [...histcliente, newMsg],
              estado: "escalado",
              escalado_at: new Date().toISOString(),
              title: `Reset — ${marca} ${modelo} — verificación pendiente`.substring(0, 120),
              tags: ["reset", "n2", "verificacion_pendiente"],
            }).eq("id", case_id);
            return new Response(JSON.stringify({ ok: true, reply: M02_TEXT }), { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });
          }
          // Primer fallo de ambos → pedir ambos de nuevo
          const retry = `Le informamos que ${motivoImagen} y ${motivoXml}. Por favor, adjunte nuevamente ambos archivos.`;
          const newMsg: HistMsg = { role: "ia", author: "Asistente Sekunet", time: new Date().toISOString(), content: retry };
          await db.from("sek_cases").update({ histcliente: [...histcliente, newMsg] }).eq("id", case_id);
          return new Response(JSON.stringify({ ok: true, reply: retry }), { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });
        }

        if (!imagenOk) {
          // Imagen falló
          if (yaReintentoImagen) {
            // Ya se reintentó → escalar con nota
            const M02_TEXT = "Agradecemos su preferencia. En un momento será atendido por uno de nuestros agentes.";
            const newMsg: HistMsg = { role: "ia", author: "Asistente Sekunet", time: new Date().toISOString(), content: M02_TEXT };
            await db.from("sek_cases").update({
              histcliente: [...histcliente, newMsg],
              estado: "escalado",
              escalado_at: new Date().toISOString(),
              title: `Reset — ${marca} ${modelo} — imagen pendiente`.substring(0, 120),
              tags: ["reset", "n2", "imagen_pendiente"],
            }).eq("id", case_id);
            return new Response(JSON.stringify({ ok: true, reply: M02_TEXT }), { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });
          }
          // Primer fallo → pedir solo imagen
          const retry = `Le informamos que ${motivoImagen}. Por favor, adjunte nuevamente una imagen clara de la etiqueta del equipo.`;
          const newMsg: HistMsg = { role: "ia", author: "Asistente Sekunet", time: new Date().toISOString(), content: retry };
          await db.from("sek_cases").update({ histcliente: [...histcliente, newMsg] }).eq("id", case_id);
          return new Response(JSON.stringify({ ok: true, reply: retry }), { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });
        }

        if (!xmlOk) {
          // XML falló
          if (yaReintentoXML) {
            // Ya se reintentó → escalar con nota
            const M02_TEXT = "Agradecemos su preferencia. En un momento será atendido por uno de nuestros agentes.";
            const newMsg: HistMsg = { role: "ia", author: "Asistente Sekunet", time: new Date().toISOString(), content: M02_TEXT };
            await db.from("sek_cases").update({
              histcliente: [...histcliente, newMsg],
              estado: "escalado",
              escalado_at: new Date().toISOString(),
              title: `Reset — ${marca} ${modelo} — XML pendiente`.substring(0, 120),
              tags: ["reset", "n2", "xml_pendiente"],
            }).eq("id", case_id);
            return new Response(JSON.stringify({ ok: true, reply: M02_TEXT }), { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });
          }
          // Primer fallo → pedir solo XML
          const retry = `Le informamos que ${motivoXml}. Por favor, adjunte nuevamente el archivo XML.`;
          const newMsg: HistMsg = { role: "ia", author: "Asistente Sekunet", time: new Date().toISOString(), content: retry };
          await db.from("sek_cases").update({ histcliente: [...histcliente, newMsg] }).eq("id", case_id);
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
              histcliente: [...histcliente, newMsg],
              estado: "escalado",
              escalado_at: new Date().toISOString(),
              title: `Reset — ${marca} ${modelo} — imagen pendiente`.substring(0, 120),
              tags: ["reset", "n2", "imagen_pendiente"],
            }).eq("id", case_id);
            return new Response(JSON.stringify({ ok: true, reply: M02_TEXT }), { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });
          }
          // Primer fallo → pedir imagen de nuevo
          const retry = `Le informamos que ${motivoImagen}. Por favor, adjunte nuevamente una imagen clara de la etiqueta del equipo.`;
          const newMsg: HistMsg = { role: "ia", author: "Asistente Sekunet", time: new Date().toISOString(), content: retry };
          await db.from("sek_cases").update({ histcliente: [...histcliente, newMsg] }).eq("id", case_id);
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
        await db.from("sek_cases").update({ histcliente: [...histcliente, newMsg], estado: "cerrado" }).eq("id", case_id);
        return new Response(JSON.stringify({ ok: true, reply: M03_TEXT }), { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      } else {
        // Sí → pedir descripción del inconveniente directamente (marca y modelo ya se tienen)
        const directReply = "Por favor, describa brevemente el inconveniente que presenta.";
        const newMsg: HistMsg = { role: "ia", author: "Asistente Sekunet", time: new Date().toISOString(), content: directReply };
        await db.from("sek_cases").update({ histcliente: [...histcliente, newMsg] }).eq("id", case_id);
        return new Response(JSON.stringify({ ok: true, reply: directReply }), { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }
    }


    // PASO 4: la última IA pidió descripción Y el último usuario respondió después → escalar
    if (lastIA?.content?.includes("describa brevemente") && lastUserTime > lastIATime) {
      const descripcion = lastUserMsg?.content?.trim() ?? "";
      const M02_TEXT = "Agradecemos su preferencia. En un momento será atendido por uno de nuestros agentes.";
      const newMsg: HistMsg = { role: "ia", author: "Asistente Sekunet", time: new Date().toISOString(), content: M02_TEXT };
      await db.from("sek_cases").update({
        histcliente: [...histcliente, newMsg],
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
    console.log("[seka-widget] Raw reply:", rawReply);

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
        console.log("[seka-widget] Reply tras inventario:", rawReply);
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

    // Guardar respuesta en histcliente
    const newMsg: HistMsg = {
      role: "ia",
      author: "Asistente Sekunet",
      time: new Date().toISOString(),
      content: cleanReply,
    };

    const updatedHist = [...histcliente, newMsg];
    await db.from("sek_cases").update({ histcliente: updatedHist }).eq("id", case_id);

    return new Response(JSON.stringify({ ok: true, reply: cleanReply }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });

  } catch (e: any) {
    console.error("[seka-widget] ERROR:", e.message);
    return new Response(JSON.stringify({ error: e.message }), { status: 500, headers: corsHeaders });
  }
});
