import { createClient } from "npm:@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
const GROQ_API_KEY = Deno.env.get("GROQ_API_KEY") ?? "";
const GEMINI_API_KEY = Deno.env.get("GEMINI_API_KEY") ?? "";

const db = createClient(SUPABASE_URL, SERVICE_KEY);

const FALLBACK_PROMPT = `Usted es SEKA, el agente de soporte tecnico especializado de Sekunet. Atienda al cliente de forma profesional, breve y sin emojis. Trate siempre de usted. No invente informacion tecnica. Este canal es exclusivo para soporte tecnico.

TAGS DEL SISTEMA (use solo el tag, sin texto adicional):
- [BUSCAR_INVENTARIO: marca modelo] — cuando el cliente indique marca y modelo
- [BUSCAR_WEB: consulta] — cuando necesite informacion tecnica externa

FLUJO:
1. Pida marca y modelo si no los ha proporcionado.
2. Use [BUSCAR_INVENTARIO: marca modelo] exactamente.
3. Si se encuentra: continue con el diagnostico tecnico.
4. Si NO se encuentra: "Lamentablemente [marca/modelo] no se encuentra entre los equipos a los que brindamos soporte tecnico."
5. Cierre con: "Que tenga un excelente dia." solo cuando el cliente no necesite mas ayuda.
6. Si el cliente pide un agente humano o el caso requiere presencia fisica: escale con "Su caso ha sido escalado a nuestro equipo de Soporte Avanzado (Nivel 2)."`;

async function loadSystemPrompt(): Promise<string> {
  try {
    const { data } = await db
      .from("sek_agent_config")
      .select("system_prompt")
      .eq("email", "system_prompt@sekunet.com")
      .maybeSingle();
    return data?.system_prompt?.trim() || FALLBACK_PROMPT;
  } catch (_e) {
    return FALLBACK_PROMPT;
  }
}

function isWithinBusinessHours(): boolean {
  // Costa Rica: UTC-6
  const now = new Date();
  const cr = new Date(now.toLocaleString("en-US", { timeZone: "America/Costa_Rica" }));
  const day = cr.getDay(); // 0=Dom, 6=Sab
  const hour = cr.getHours();
  const minute = cr.getMinutes();
  const timeVal = hour * 60 + minute;
  if (day === 0 || day === 6) return false;
  return timeVal >= 7 * 60 + 30 && timeVal < 17 * 60;
}

interface ChatMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

async function callGroq(messages: ChatMessage[]): Promise<string> {
  const res = await fetch("https://api.groq.com/openai/v1/chat/completions", {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${GROQ_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: "llama-3.3-70b-versatile",
      messages,
      temperature: 0.3,
      max_tokens: 600,
    }),
  });

  if (!res.ok) {
    const err = await res.text();
    console.error("[ia-agent] Groq error:", res.status, err);
    throw new Error(`Groq API error: ${res.status}`);
  }

  const data = await res.json();
  return data.choices?.[0]?.message?.content?.trim() ?? "";
}

function getGeminiMimeType(mediaType: string, url: string): string {
  if (mediaType && mediaType !== "application/octet-stream") return mediaType;
  const ext = url.split(".").pop()?.toLowerCase() ?? "";
  const map: Record<string, string> = {
    jpg: "image/jpeg", jpeg: "image/jpeg", png: "image/png", gif: "image/gif",
    webp: "image/webp", mp4: "video/mp4", webm: "video/webm", mov: "video/quicktime",
    mp3: "audio/mpeg", ogg: "audio/ogg", wav: "audio/wav", m4a: "audio/mp4",
    pdf: "application/pdf", txt: "text/plain",
  };
  return map[ext] ?? "application/octet-stream";
}

async function callGeminiVision(mediaUrl: string, mediaType: string, userText: string): Promise<string> {
  if (!GEMINI_API_KEY) return "";
  try {
    const mimeType = getGeminiMimeType(mediaType, mediaUrl);
    const prompt = userText?.trim()
      ? `El cliente envio este archivo junto con el mensaje: "${userText}". Describe que muestra el archivo en el contexto de soporte tecnico: marca, modelo, problema visible, error mostrado, o cualquier informacion relevante. Se breve y preciso.`
      : `El cliente envio este archivo. Describe que muestra en el contexto de soporte tecnico: marca, modelo, problema visible, error mostrado, o cualquier informacion relevante. Se breve y preciso.`;

    const res = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${GEMINI_API_KEY}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contents: [{
            parts: [
              { text: prompt },
              { file_data: { mime_type: mimeType, file_uri: mediaUrl } },
            ],
          }],
          generationConfig: { maxOutputTokens: 300, temperature: 0.2 },
        }),
      }
    );

    if (!res.ok) {
      const errText = await res.text();
      console.error("[ia-agent] Gemini Vision error:", res.status, errText);
      return "";
    }
    const data = await res.json();
    return data.candidates?.[0]?.content?.parts?.[0]?.text?.trim() ?? "";
  } catch (e: any) {
    console.error("[ia-agent] Gemini Vision exception:", e.message);
    return "";
  }
}

async function searchInventory(query: string): Promise<any[]> {
  const terms = query
    .toLowerCase()
    .replace(/[^a-z0-9\s\-]/g, "")
    .split(/\s+/)
    .filter((t) => t.length >= 2);

  if (terms.length === 0) return [];

  let results: any[] = [];

  for (const term of terms) {
    const pattern = `%${term}%`;
    const { data } = await db
      .from("sek_inventario")
      .select("id, codigo, nombre, marca, modelo, categoria")
      .or(
        `marca.ilike.${pattern},modelo.ilike.${pattern},nombre.ilike.${pattern},codigo.ilike.${pattern}`
      )
      .limit(10);

    if (data && data.length > 0) {
      results = [...results, ...data];
    }
  }

  // Deduplicate by id
  const seen = new Set();
  return results.filter((r) => {
    if (seen.has(r.id)) return false;
    seen.add(r.id);
    return true;
  });
}

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const { case_id } = await req.json();
    if (!case_id) {
      return new Response(JSON.stringify({ error: "case_id required" }), {
        status: 400, headers: corsHeaders,
      });
    }

    // Fetch case
    const { data: caso, error: fetchErr } = await db
      .from("sek_cases")
      .select("id, estado, cliente, histcliente, histtecnico")
      .eq("id", case_id)
      .maybeSingle();

    if (fetchErr || !caso) {
      return new Response(JSON.stringify({ error: "Case not found" }), {
        status: 404, headers: corsHeaders,
      });
    }

    // Only process if ia_atendiendo
    if (caso.estado !== "ia_atendiendo") {
      return new Response(JSON.stringify({ skip: true, reason: "not ia_atendiendo" }), {
        status: 200, headers: corsHeaders,
      });
    }

    const histcliente: any[] = Array.isArray(caso.histcliente)
      ? caso.histcliente
      : [];

    if (histcliente.length === 0) {
      return new Response(JSON.stringify({ skip: true, reason: "no messages" }), {
        status: 200, headers: corsHeaders,
      });
    }

    // Verificar horario de atención
    if (!isWithinBusinessHours()) {
      const offMsg = "Gracias por contactar a Sekunet. Nuestro horario de atencion es de lunes a viernes de 7:30 a.m. a 5:00 p.m. En este momento no estamos disponibles. Con gusto le atendemos el proximo dia habil.";
      const offEntry = { role: "assistant", author: "SEKA", time: new Date().toISOString(), content: offMsg };
      await db.from("sek_cases").update({ histcliente: [...histcliente, offEntry] }).eq("id", case_id);
      return new Response(JSON.stringify({ ok: true, response: offMsg, escalated: false, closed: false }), { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    // Cargar prompt desde BD (guardado desde panel admin) o usar fallback
    const systemPrompt = await loadSystemPrompt();

    // Build conversation for Groq
    const chatMessages: ChatMessage[] = [
      { role: "system", content: systemPrompt },
    ];

    for (const msg of histcliente) {
      if (msg.role === "user") {
        chatMessages.push({ role: "user", content: msg.content || "" });
      } else if (
        msg.role === "assistant" ||
        msg.role === "tecnico" ||
        msg.role === "ia"
      ) {
        chatMessages.push({ role: "assistant", content: msg.content || "" });
      }
    }

    // Check if last message is from user (otherwise no need to respond)
    const lastMsg = histcliente[histcliente.length - 1];
    if (lastMsg.role !== "user") {
      return new Response(JSON.stringify({ skip: true, reason: "last msg not from user" }), {
        status: 200, headers: corsHeaders,
      });
    }

    // If last user message has a media attachment, interpret it with Gemini first
    if (lastMsg.mediaUrl) {
      const geminiDescription = await callGeminiVision(
        lastMsg.mediaUrl,
        lastMsg.mediaType ?? "",
        lastMsg.content ?? ""
      );
      if (geminiDescription) {
        // Inject Gemini's interpretation as system context before Groq responds
        chatMessages.push({
          role: "system",
          content: `El cliente acaba de enviar un archivo adjunto. Gemini lo analizo y esto es lo que contiene: "${geminiDescription}". Usa esta informacion para entender el problema del cliente y continua el flujo normalmente.`,
        });
      }
    }

    // Call Groq
    let aiResponse = await callGroq(chatMessages);

    // Check if AI wants to search inventory
    const searchMatch = aiResponse.match(/\[BUSCAR_INVENTARIO:\s*(.+?)\]/);
    let shouldEscalate = false;
    let shouldClose = false;

    if (searchMatch) {
      const searchQuery = searchMatch[1].trim();
      const results = await searchInventory(searchQuery);

      if (results.length > 0) {
        // Found in inventory - escalate to human
        aiResponse =
          "Gracias por la informacion brindada, en un momento sera atendido por uno de nuestros agentes.";
        shouldEscalate = true;

        // Save equipment info in cliente
        const clienteData = typeof caso.cliente === "object" ? caso.cliente : {};
        const updatedCliente = {
          ...clienteData,
          equipo: searchQuery,
          equipo_encontrado: true,
          equipo_match: results
            .slice(0, 3)
            .map((r: any) => `${r.marca || ""} ${r.modelo || ""} (${r.codigo || ""})`.trim())
            .join(", "),
        };
        await db
          .from("sek_cases")
          .update({ cliente: updatedCliente })
          .eq("id", case_id);
      } else {
        // Not found
        aiResponse = `Lamentablemente "${searchQuery}" no se encuentra entre los equipos a los que brindamos soporte tecnico. Hay algo mas en lo que le pueda ayudar?`;
      }
    }

    // ==== BÚSQUEDA WEB [BUSCAR_WEB:] ====
    const webTagMatch = aiResponse.match(/\[BUSCAR_WEB:\s*(.+?)\]/);
    if (webTagMatch && !shouldEscalate) {
      const webQuery = webTagMatch[1].trim();
      try {
        const searchRes = await fetch(
          `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${GEMINI_API_KEY}`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              contents: [{ parts: [{ text: `Busca informacion tecnica actualizada sobre: ${webQuery}. Responde en español, de forma concisa y precisa, enfocado en soporte tecnico de equipos de seguridad electronica.` }] }],
              generationConfig: { maxOutputTokens: 400, temperature: 0.2 },
              tools: [{ googleSearch: {} }],
            }),
          }
        );
        if (searchRes.ok) {
          const searchData = await searchRes.json();
          const webResult = searchData.candidates?.[0]?.content?.parts?.[0]?.text?.trim();
          if (webResult) {
            chatMessages.push({ role: "system", content: `Resultado de busqueda web para "${webQuery}":\n${webResult}\n\nUsa esta informacion para responder al cliente.` });
            aiResponse = await callGroq(chatMessages);
          }
        }
      } catch (_e) { /* búsqueda web opcional */ }
    }

    // ==== BÚSQUEDA EN MANUALES (RAG) ====
    // Ruta 1: el agente usó el tag [BUSCAR_MANUALES: query] explícitamente
    const manualTagMatch = aiResponse.match(/\[BUSCAR_MANUALES:\s*(.+?)\]/);
    // Ruta 2: búsqueda automática con el último mensaje del usuario
    const lastUserMsg = histcliente.filter((m: any) => m.role === "user").slice(-1)[0]?.content || "";
    const manualQuery = manualTagMatch ? manualTagMatch[1].trim() : lastUserMsg.trim();

    if (!shouldEscalate && !shouldClose && manualQuery.length > 5) {
      try {
        const words = manualQuery.split(" ").filter((w: string) => w.length > 3).slice(0, 6).join(" | ");
        const { data: chunks } = await db
          .from("sek_doc_chunks")
          .select("content, doc_name")
          .textSearch("content", words, { type: "websearch" })
          .limit(4);

        if (chunks && chunks.length > 0) {
          const context = chunks.map((c: any) => `[${c.doc_name}]: ${c.content}`).join("\n\n");
          chatMessages.push({
            role: "system",
            content: `Informacion relevante encontrada en los manuales tecnicos de Sekunet para "${manualQuery}":\n\n${context}\n\nUsa esta informacion si es pertinente para responder al cliente.`,
          });
          aiResponse = await callGroq(chatMessages);
        } else if (manualTagMatch) {
          // El agente buscó explícitamente pero no encontró nada
          chatMessages.push({ role: "assistant", content: aiResponse });
          chatMessages.push({ role: "system", content: `No se encontro informacion en los manuales para "${manualQuery}". Responde al cliente indicando que no tienes esa informacion disponible.` });
          aiResponse = await callGroq(chatMessages);
        }
      } catch (_e) { /* RAG opcional, no bloquea */ }
    }

    // Check if AI is saying goodbye
    if (
      aiResponse.toLowerCase().includes("que tenga un excelente dia") ||
      aiResponse.toLowerCase().includes("que tenga un buen dia")
    ) {
      shouldClose = true;
    }

    // Check if AI is escalating
    if (
      aiResponse.includes("en un momento sera atendido por uno de nuestros agentes") ||
      aiResponse.includes("Soporte Avanzado (Nivel 2)") ||
      aiResponse.includes("escalado a nuestro equipo")
    ) {
      shouldEscalate = true;
    }

    // Add IA response to histcliente
    const iaEntry = {
      role: "assistant",
      author: "Asistente Sekunet",
      time: new Date().toISOString(),
      content: aiResponse,
    };

    const updatedHist = [...histcliente, iaEntry];
    const updates: Record<string, unknown> = { histcliente: updatedHist };

    if (shouldEscalate) {
      updates.estado = "escalado";
      updates.title =
        `Chat web — ${(caso.cliente as any)?.nombre || "Cliente"} — ${(caso.cliente as any)?.equipo || ""}`.trim();
    } else if (shouldClose) {
      updates.estado = "cerrado";
    }

    await db.from("sek_cases").update(updates).eq("id", case_id);

    return new Response(
      JSON.stringify({
        ok: true,
        response: aiResponse,
        escalated: shouldEscalate,
        closed: shouldClose,
      }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (e: any) {
    console.error("[ia-agent] Error:", e.message);
    return new Response(JSON.stringify({ error: e.message }), { status: 500, headers: corsHeaders });
  }
});
