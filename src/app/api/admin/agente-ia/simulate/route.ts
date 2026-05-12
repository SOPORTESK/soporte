import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

interface ChatMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

// Simulación de conversación cliente-agente usando el prompt REAL de atención
export async function POST(req: NextRequest) {
  try {
    const { message, history } = await req.json();
    const geminiKey = process.env.GEMINI_API_KEY;

    if (!geminiKey) {
      return NextResponse.json({ error: "GEMINI_API_KEY no configurada" }, { status: 500 });
    }

    // Verificar autenticación
    const supabase = createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: "No autorizado" }, { status: 401 });
    }

    // Cargar el prompt REAL de atención al cliente desde la BD
    const { data: agentConfig } = await supabase
      .from("sek_agent_config")
      .select("system_prompt")
      .eq("email", "system_prompt@sekunet.com")
      .maybeSingle();

    const systemPrompt = agentConfig?.system_prompt || `Usted es SEKA, el agente de soporte técnico especializado de Sekunet.
Atienda al cliente de forma profesional, breve y sin emojis.
Trate siempre de usted. No invente información técnica.

TAGS DEL SISTEMA:
- [BUSCAR_INVENTARIO: marca modelo]
- [BUSCAR_WEB: consulta]
- [ESCALAR: motivo]
- [CERRAR]

FLUJO:
1. Pida marca y modelo
2. Use [BUSCAR_INVENTARIO: marca modelo] exactamente
3. Si se encuentra: continúe con diagnóstico
4. Si NO se encuentra: "Lamentablemente [marca/modelo] no se encuentra entre los equipos a los que brindamos soporte técnico."
5. Cierre con: "Que tenga un excelente día."`;

    // Construir conversación para Gemini
    const recentHistory = (history || []).slice(-10);
    const geminiContents: { role: string; parts: { text: string }[] }[] = [];
    
    for (const h of recentHistory) {
      geminiContents.push({
        role: h.role === "assistant" ? "model" : "user",
        parts: [{ text: h.content }],
      });
    }
    
    geminiContents.push({ role: "user", parts: [{ text: message }] });

    // Llamar a Gemini 3.1 Flash-Lite (mismo modelo que usa la edge function en producción)
    const geminiRes = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-3.1-flash-lite:generateContent?key=${geminiKey}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          system_instruction: { parts: [{ text: systemPrompt }] },
          contents: geminiContents,
          generationConfig: { temperature: 0.3, maxOutputTokens: 800 },
        }),
      }
    );

    if (!geminiRes.ok) {
      const errText = await geminiRes.text();
      console.error("[simulate] Gemini error:", geminiRes.status, errText);
      
      let errorMsg = "El servicio de IA no está disponible";
      try {
        const errJson = JSON.parse(errText);
        if (geminiRes.status === 429 || errJson?.error?.message?.includes("rate limit")) {
          errorMsg = "Límite de uso alcanzado. Intenta en unos minutos.";
        }
      } catch {}
      
      return NextResponse.json({ error: errorMsg }, { status: 500 });
    }

    const geminiData = await geminiRes.json();
    const aiResponse = geminiData.candidates?.[0]?.content?.parts?.[0]?.text || "";

    return NextResponse.json({
      reply: aiResponse,
      promptLength: systemPrompt.length,
    });

  } catch (error: any) {
    console.error("[simulate] Error:", error);
    return NextResponse.json(
      { error: error.message || "Error interno" },
      { status: 500 }
    );
  }
}
