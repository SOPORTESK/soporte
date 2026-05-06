import { createClient } from "npm:@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
const GROQ_API_KEY = Deno.env.get("GROQ_API_KEY") ?? "";

const db = createClient(SUPABASE_URL, SERVICE_KEY);

const SYSTEM_PROMPT = `Eres un agente de soporte tecnico de Sekunet. Tu rol es atender clientes de forma clara, breve, profesional y lo mas humano posible.

REGLAS ESTRICTAS:
- NO uses emojis, nunca.
- Trata al cliente de "usted" (formal).
- Respuestas cortas y directas, maximo 2-3 oraciones.
- NO inventes informacion tecnica.
- NO des soluciones tecnicas, eso lo hace el agente humano.
- Si el cliente pide soporte tecnico, solicita la marca y modelo del equipo.
- Si el cliente pregunta algo que no es soporte tecnico (ventas, bodega, otro), indicale amablemente que este canal es exclusivo para soporte tecnico.

FLUJO:
1. Si el cliente indica que necesita soporte o describe un problema tecnico, pide: "Para poder asistirle, necesito que me indique la marca y modelo del equipo."
2. Una vez que el cliente proporciona marca/modelo, responde EXACTAMENTE con el formato:
   [BUSCAR_INVENTARIO: texto_a_buscar]
   No agregues nada mas en ese mensaje.
3. Si la busqueda encuentra el equipo, responde: "Gracias por la informacion brindada, en un momento sera atendido por uno de nuestros agentes."
4. Si NO se encuentra, responde: "Lamentablemente [marca/modelo] no se encuentra entre los equipos a los que brindamos soporte tecnico. Hay algo mas en lo que le pueda ayudar?"
5. Si el cliente dice que no necesita mas ayuda, responde: "Que tenga un excelente dia." y nada mas.
6. Si en cualquier momento el cliente pide hablar con una persona o un agente humano, responde: "Con gusto, en un momento sera atendido por uno de nuestros agentes."

IMPORTANTE: Cuando respondas con [BUSCAR_INVENTARIO: ...] NO incluyas nada mas en el mensaje. Solo ese tag.`;

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
      max_tokens: 300,
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

Deno.serve(async (req) => {
  try {
    const { case_id } = await req.json();
    if (!case_id) {
      return new Response(JSON.stringify({ error: "case_id required" }), {
        status: 400,
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
        status: 404,
      });
    }

    // Only process if ia_atendiendo
    if (caso.estado !== "ia_atendiendo") {
      return new Response(JSON.stringify({ skip: true, reason: "not ia_atendiendo" }), {
        status: 200,
      });
    }

    const histcliente: any[] = Array.isArray(caso.histcliente)
      ? caso.histcliente
      : [];

    if (histcliente.length === 0) {
      return new Response(JSON.stringify({ skip: true, reason: "no messages" }), {
        status: 200,
      });
    }

    // Build conversation for Groq
    const chatMessages: ChatMessage[] = [
      { role: "system", content: SYSTEM_PROMPT },
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
        status: 200,
      });
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

    // Check if AI is saying goodbye
    if (
      aiResponse.toLowerCase().includes("que tenga un excelente dia") ||
      aiResponse.toLowerCase().includes("que tenga un buen dia")
    ) {
      shouldClose = true;
    }

    // Check if AI is escalating (agent request)
    if (
      aiResponse.includes("en un momento sera atendido por uno de nuestros agentes")
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
      { status: 200, headers: { "Content-Type": "application/json" } }
    );
  } catch (e: any) {
    console.error("[ia-agent] Error:", e.message);
    return new Response(JSON.stringify({ error: e.message }), { status: 500 });
  }
});
