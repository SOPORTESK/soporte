import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

// Análisis de simulación por el meta-agente
export async function POST(req: NextRequest) {
  try {
    const { simulationHistory, currentPrompt } = await req.json();
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

    // System instruction para el meta-análisis
    const systemInstruction = `# MODO ANALISTA DE SIMULACIONES
## Meta-Agente · Observador de Desempeño · Ingeniero de Calidad

Eres el analista de simulaciones del Asistente Virtual. Tu trabajo es:

1. IDENTIFICAR errores en las respuestas del agente según el prompt de configuración
2. RECONOCER aciertos y buenas prácticas aplicadas
3. SUGERIR mejoras específicas al prompt para corregir errores observados
4. EXPLICAR por qué una respuesta fue correcta o incorrecta según las reglas

## FORMATO DE ANÁLISIS

Para cada interacción problemática, usa:

🔴 **Error detectado**: [descripción del problema]
   - **Regla violada**: [cita textual del prompt que se incumplió]
   - **Corrección sugerida**: [cómo debería haber respondido]
   - **Cambio al prompt**: [sugerencia específica para prevenir esto]

🟢 **Acierto**: [descripción de lo que hizo bien]
   - **Regla aplicada**: [cita textual del prompt cumplida]

💡 **Mejora propuesta**: [recomendación general si aplica]

## REGLAS DEL ANÁLISIS

- Sé técnico y específico
- Cita literalmente las secciones del prompt relevantes
- No seas genérico: "debería ser más amable" → "debería usar 'gracias por contactarnos' al inicio"
- Proporciona ejemplos concretos de respuestas corregidas
- Si todo está bien, confírmalo explícitamente

Responde en español, formato markdown.`;

    // Formatear historial para análisis
    const conversationLog = simulationHistory
      .map((h: any) => `${h.role === "user" ? "CLIENTE" : "AGENTE"}: ${h.content}`)
      .join("\n\n");

    const analysisPrompt = `Analiza la siguiente conversación de simulación entre un cliente y el Asistente Virtual.

## CONFIGURACIÓN ACTUAL DEL AGENTE (Prompt)

${currentPrompt?.substring(0, 3000) || "No disponible"}

## CONVERSACIÓN A ANALIZAR

${conversationLog}

## TU ANÁLISIS

Proporciona un análisis detallado identificando:
1. Errores en las respuestas del agente según su configuración
2. Aciertos y buenas prácticas
3. Sugerencias específicas para mejorar el prompt`;

    const geminiRes = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-3.1-flash-lite:generateContent?key=${geminiKey}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          system_instruction: { parts: [{ text: systemInstruction }] },
          contents: [{ role: "user", parts: [{ text: analysisPrompt }] }],
          generationConfig: { temperature: 0.2, maxOutputTokens: 2000 },
        }),
      }
    );

    if (!geminiRes.ok) {
      const errText = await geminiRes.text();
      console.error("[analyze] Gemini error:", geminiRes.status, errText);
      return NextResponse.json({ error: "Error al analizar" }, { status: 500 });
    }

    const geminiData = await geminiRes.json();
    const analysis = geminiData.candidates?.[0]?.content?.parts?.[0]?.text || "";

    return NextResponse.json({ analysis });

  } catch (error: any) {
    console.error("[analyze] Error:", error);
    return NextResponse.json(
      { error: error.message || "Error interno" },
      { status: 500 }
    );
  }
}
