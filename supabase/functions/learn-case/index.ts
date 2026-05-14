// ════════════════════════════════════════════════════════════════════════════
// LEARN-CASE — Aprendizaje obligatorio al cerrar un caso
// REGLA INMUTABLE #2 del sistema.
// Se invoca al cierre de cualquier caso (por IA, por agente humano o por
// auto-close). Genera un resumen estructurado y lo guarda en sek_doc_chunks
// (RAG). Es IDEMPOTENTE: si el caso ya tiene aprendizaje guardado, no duplica.
// ════════════════════════════════════════════════════════════════════════════
import { createClient } from "npm:@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
const GEMINI_API_KEY = Deno.env.get("GEMINI_API_KEY") ?? "";
const GEMINI_MODEL = "gemini-3.1-flash-lite";
const GEMINI_FALLBACK = "gemini-2.0-flash";

const db = createClient(SUPABASE_URL, SERVICE_KEY);

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const LEARN_PROMPT = `Eres el sistema de aprendizaje de SEKA (asistente técnico de Sekunet). Vas a analizar una conversación de soporte técnico ya cerrada y producir un RESUMEN ESTRUCTURADO que se guardará en la base de conocimiento del agente para enriquecer su atención futura.

ESTRUCTURA OBLIGATORIA (todas las secciones deben aparecer; si no aplica una, escriba "No identificado"):

## PERFIL DEL CLIENTE
- Tipo (paciente / impaciente / técnico / novato / molesto / agradecido)
- Nivel técnico aparente
- Sector o tipo de cuenta si se infiere (residencial, comercial, integrador, etc.)
- Estilo de comunicación (formal, breve, detallado, frustrado, etc.)

## EQUIPO INVOLUCRADO
- Marca y modelo exactos (transcribir literal si aparecen)
- Tipo de equipo (DVR, NVR, cámara IP, control de acceso, alarma, etc.)
- Estado (instalación nueva, equipo en producción, post-falla, etc.)

## CONSULTA / PROBLEMA
- Descripción concisa del síntoma reportado por el cliente
- Categoría (sin_imagen, sin_grabacion, sin_acceso_remoto, sin_energia, error_configuracion, conectividad_red, reset_contrasena, desvinculacion_cuenta, dano_fisico, actualizacion_firmware, instalacion_nueva, deteccion_incendio, control_acceso, intrusion_alarma, otro)
- Información clave que dio el cliente (códigos de error, IP, modelo de router, etc.)

## DIAGNÓSTICO Y PASOS APLICADOS
- Pasos que se siguieron (en orden)
- Qué validó el técnico / SEKA antes de actuar
- Herramientas o procedimientos usados

## SOLUCIÓN APLICADA POR EL TÉCNICO
Esta es la sección MÁS valiosa para el aprendizaje. Documente con precisión:
- Acción concreta que resolvió el problema (o que el técnico recomendó)
- Comandos, configuraciones o ajustes específicos mencionados
- Si fue escalado o no resuelto, explique por qué y cómo continuó

## TONO Y ESTILO DEL TÉCNICO HUMANO
Cuando intervenga un agente humano, capture:
- Forma de saludar y despedirse
- Cómo explica conceptos técnicos al cliente
- Frases típicas o muletillas útiles que SEKA pueda imitar
- Nivel de detalle que da (resumido vs. paso a paso)

## LECCIÓN APRENDIDA PARA SEKA
- ¿Qué debería hacer SEKA la próxima vez con un caso similar?
- Atajos de diagnóstico que el técnico aplicó y que conviene incorporar
- Errores a evitar (qué NO funcionó, qué confundió al cliente)

## PALABRAS CLAVE PARA BÚSQUEDA RAG
Lista 5-10 términos cortos (separados por coma) que ayudarán a recuperar este aprendizaje cuando aparezcan casos parecidos.

REGLAS:
- Sea CONCRETO y específico. Evite generalidades como "se resolvió el problema". Diga QUÉ se hizo.
- Máximo 600 palabras totales.
- Use español neutro, sin emojis.
- No invente: si la conversación no da datos para una sección, escriba "No identificado".`;

interface ChatMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

async function callGemini(prompt: string, model: string): Promise<string> {
  if (!GEMINI_API_KEY) throw new Error("no_gemini_key");
  const res = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${GEMINI_API_KEY}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [{ role: "user", parts: [{ text: prompt }] }],
        generationConfig: { temperature: 0.2, maxOutputTokens: 1500 },
      }),
    }
  );
  if (!res.ok) throw new Error(`gemini_error:${res.status}:${await res.text()}`);
  const data = await res.json();
  return data.candidates?.[0]?.content?.parts?.[0]?.text?.trim() ?? "";
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const { case_id, force } = await req.json();
    if (!case_id) {
      return new Response(JSON.stringify({ error: "case_id required" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // 1. Cargar caso completo
    const { data: caso, error: fetchErr } = await db
      .from("sek_cases")
      .select("id, canal, estado, cliente, histcliente, histtecnico, marca, modelo, problema, tags, assigned_to, learned_at")
      .eq("id", case_id)
      .maybeSingle();

    if (fetchErr || !caso) {
      return new Response(JSON.stringify({ error: "Case not found" }), {
        status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Casos de simulación NO contaminan el RAG
    if (caso.canal === "simulator") {
      return new Response(JSON.stringify({ skip: true, reason: "simulator_case" }), {
        status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // 2. Idempotencia: si ya se aprendió de este caso y no se forzó, salir
    if (caso.learned_at && !force) {
      return new Response(JSON.stringify({ skip: true, reason: "already_learned", learned_at: caso.learned_at }), {
        status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // 3. Construir transcripción combinada (cliente + técnico) ordenada por tiempo
    const allMsgs: { role: string; author?: string; content: string; time: string }[] = [];
    for (const m of (caso.histcliente ?? [])) {
      if (m?.content && m.content.length > 2) {
        allMsgs.push({ role: m.role || "user", author: m.author, content: m.content, time: m.time || "" });
      }
    }
    for (const m of (caso.histtecnico ?? [])) {
      if (m?.role === "nota") continue;
      if (m?.content && m.content.length > 2) {
        allMsgs.push({ role: m.role || "tecnico", author: m.author, content: m.content, time: m.time || "" });
      }
    }
    allMsgs.sort((a, b) => new Date(a.time).getTime() - new Date(b.time).getTime());

    // Necesitamos al menos un intercambio mínimo para aprender
    if (allMsgs.length < 3) {
      return new Response(JSON.stringify({ skip: true, reason: "not_enough_messages", count: allMsgs.length }), {
        status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const transcript = allMsgs
      .map((m) => {
        const who = m.role === "user"
          ? "CLIENTE"
          : m.role === "tecnico"
            ? `TÉCNICO HUMANO${m.author ? ` (${m.author})` : ""}`
            : "SEKA";
        return `${who}: ${m.content}`;
      })
      .slice(-40)
      .join("\n");

    const clienteData = typeof caso.cliente === "object" ? (caso.cliente ?? {}) : {};
    const equipo = caso.marca || caso.modelo
      ? `${caso.marca ?? ""} ${caso.modelo ?? ""}`.trim()
      : ((clienteData as any)?.equipo || "No identificado");
    const problema = caso.problema || "No clasificado";
    const tags = Array.isArray(caso.tags) ? caso.tags.join(", ") : "";

    const fullPrompt = `${LEARN_PROMPT}

CONTEXTO DEL CASO:
- Caso ID: ${caso.id}
- Equipo identificado por SEKA: ${equipo}
- Problema clasificado: ${problema}
- Tags: ${tags || "(ninguna)"}

CONVERSACIÓN:
${transcript}

Genera el resumen estructurado siguiendo EXACTAMENTE el formato indicado.`;

    // 4. Generar resumen con Gemini (con fallback)
    let summary = "";
    try {
      summary = await callGemini(fullPrompt, GEMINI_MODEL);
    } catch (e: any) {
      console.warn("[learn-case] modelo principal falló, usando fallback:", e.message);
      try {
        summary = await callGemini(fullPrompt, GEMINI_FALLBACK);
      } catch (e2: any) {
        console.error("[learn-case] ambos modelos fallaron:", e2.message);
        return new Response(JSON.stringify({ error: "gemini_unavailable", detail: e2.message }), {
          status: 503, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
    }

    if (!summary || summary.length < 80) {
      return new Response(JSON.stringify({ skip: true, reason: "summary_too_short", length: summary.length }), {
        status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // 5. Guardar en sek_doc_chunks como conocimiento aprendido
    const docName = `Aprendizaje: ${equipo} — ${problema}`.substring(0, 200);
    const { error: insertErr } = await db.from("sek_doc_chunks").insert({
      doc_id: null,
      doc_name: docName,
      content: summary.substring(0, 4000),
      source_label: "Aprendizaje de conversación",
    });

    if (insertErr) {
      console.error("[learn-case] error insertando chunk:", insertErr.message);
      return new Response(JSON.stringify({ error: "insert_failed", detail: insertErr.message }), {
        status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // 6. Marcar caso como aprendido (idempotencia)
    await db.from("sek_cases").update({ learned_at: new Date().toISOString() }).eq("id", case_id);

    console.log(`[learn-case] OK caso ${case_id} → "${docName}" (${summary.length} chars)`);
    return new Response(
      JSON.stringify({ ok: true, case_id, doc_name: docName, length: summary.length }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (e: any) {
    console.error("[learn-case] excepción:", e.message);
    return new Response(JSON.stringify({ error: e.message || "unknown" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
