import { createClient } from "npm:@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SERVICE_KEY  = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
const NVIDIA_KEY   = Deno.env.get("NVIDIA_API_KEY") ?? "";
const NIM_BASE     = "https://integrate.api.nvidia.com/v1";
const LLAMA_MODEL  = "meta/llama-3.2-11b-vision-instruct";

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
Con marca y modelo en mano, emita el tag: [BUSCAR_INVENTARIO: marca modelo]
El sistema verificará si está en la cartera de Sekunet.
La búsqueda debe ser inteligente: tolere variaciones ortográficas, abreviaciones y errores tipográficos del cliente.

Si NO está en cartera → diga exactamente:
"El dispositivo indicado no forma parte de los equipos distribuidos por Sekunet, por lo que lamentablemente no podemos brindarle el soporte requerido. ¿Tiene alguna otra consulta relacionada con nuestros productos?"
  → Si el cliente dice Sí → regrese al PASO 1
  → Si el cliente dice No → diga M03 y emita [CERRAR]

Si SÍ está en cartera → continúe al PASO 4

PASO 4 — SOLICITAR DESCRIPCIÓN DEL INCONVENIENTE
Solicite al cliente una descripción breve del inconveniente.

PASO 5 — ESCALAR
Diga exactamente M02 y emita [ESCALAR_N2: Configuraciones — {descripción breve del inconveniente}]

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

// ─── LLAMAR LLAMA VISION ──────────────────────────────────────────────────────
async function callLlama(messages: NimMessage[]): Promise<string> {
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
}

// ─── BUSCAR EN INVENTARIO ─────────────────────────────────────────────────────
async function buscarInventario(query: string): Promise<{ encontrado: boolean; detalle: string }> {
  try {
    const { data, error } = await db
      .from("sek_inventory")
      .select("marca,modelo,descripcion")
      .limit(200);

    if (error || !data) return { encontrado: false, detalle: "Sin datos de inventario." };

    const q = query.toLowerCase().replace(/[^a-z0-9\s]/gi, "");
    const tokens = q.split(/\s+/).filter(Boolean);

    const match = data.find((item: any) => {
      const hay = `${item.marca} ${item.modelo} ${item.descripcion || ""}`.toLowerCase();
      return tokens.every((t: string) => hay.includes(t)) ||
             tokens.some((t: string) => hay.includes(t) && t.length > 3);
    });

    if (match) {
      return {
        encontrado: true,
        detalle: `Equipo en cartera: ${match.marca} ${match.modelo}${match.descripcion ? " — " + match.descripcion : ""}`,
      };
    }
    return { encontrado: false, detalle: `No se encontró "${query}" en el inventario de Sekunet.` };
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

// ─── CONSTRUIR MENSAJES PARA LLAMA ───────────────────────────────────────────
function buildMessages(hist: HistMsg[], invContext: string | null): NimMessage[] {
  const messages: NimMessage[] = [{ role: "system", content: SYSTEM_PROMPT }];

  for (const m of hist) {
    if (m.role === "user" || m.role === "assistant" || m.role === "ia") {
      const nimRole: "user" | "assistant" = (m.role === "user") ? "user" : "assistant";

      // Si tiene imagen, usar content multimodal
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
        if (invContext && nimRole === "user" && m === hist[hist.length - 1]) {
          text = `[Contexto interno — no mostrar al cliente]: ${invContext}\n\n${text}`;
        }
        messages.push({ role: nimRole, content: text });
      }
    }
  }

  return messages;
}

// ─── HANDLER PRINCIPAL ───────────────────────────────────────────────────────
Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, {
      headers: {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Methods": "POST, OPTIONS",
        "Access-Control-Allow-Headers": "Content-Type, Authorization",
      },
    });
  }

  try {
    const { case_id } = await req.json();
    if (!case_id) return new Response(JSON.stringify({ error: "case_id requerido" }), { status: 400 });

    // Cargar caso
    const { data: caso, error: caseErr } = await db
      .from("sek_cases")
      .select("histcliente, histtecnico, estado, cliente")
      .eq("id", case_id)
      .maybeSingle();

    if (caseErr || !caso) {
      console.error("[seka-widget] Caso no encontrado:", case_id);
      return new Response(JSON.stringify({ error: "caso_no_encontrado" }), { status: 404 });
    }

    const estado = String(caso.estado || "").toLowerCase();
    if (estado === "cerrado" || estado === "resuelto" || estado === "escalado") {
      console.log("[seka-widget] Caso ya no activo:", estado);
      return new Response(JSON.stringify({ ok: true, skipped: true }), { status: 200 });
    }

    const histcliente: HistMsg[] = Array.isArray(caso.histcliente) ? caso.histcliente : [];

    // Primera pasada: detectar si hay un tag [BUSCAR_INVENTARIO] pendiente en el último mensaje IA
    // (para manejar el ciclo: Llama pide inventario → sistema responde → Llama continúa)
    let invContext: string | null = null;

    // Construir mensajes y llamar a Llama
    const messages = buildMessages(histcliente, invContext);
    let rawReply = await callLlama(messages);
    console.log("[seka-widget] Raw reply:", rawReply);

    // Si Llama pidió inventario, procesarlo y volver a llamar con el contexto
    if (/\[BUSCAR_INVENTARIO:/i.test(rawReply)) {
      const invMatch = rawReply.match(/\[BUSCAR_INVENTARIO:\s*([^\]]+)\]/i);
      if (invMatch) {
        const inv = await buscarInventario(invMatch[1].trim());
        invContext = inv.encontrado
          ? `El equipo "${invMatch[1].trim()}" SÍ está en la cartera de Sekunet. ${inv.detalle}`
          : `El equipo "${invMatch[1].trim()}" NO está en la cartera de Sekunet.`;

        const messages2 = buildMessages(histcliente, invContext);
        rawReply = await callLlama(messages2);
        console.log("[seka-widget] Reply tras inventario:", rawReply);
      }
    }

    // Procesar otros tags (ESCALAR_N2, CERRAR) y limpiar texto
    let cleanReply = await processTags(rawReply, case_id);

    // Limpiar contexto interno si quedó en el texto
    cleanReply = cleanReply.replace(/__INV__.*?__INV__/gs, "").trim();

    if (!cleanReply) {
      return new Response(JSON.stringify({ ok: true, skipped: true }), { status: 200 });
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
      headers: { "Content-Type": "application/json" },
    });

  } catch (e: any) {
    console.error("[seka-widget] ERROR:", e.message);
    return new Response(JSON.stringify({ error: e.message }), { status: 500 });
  }
});
