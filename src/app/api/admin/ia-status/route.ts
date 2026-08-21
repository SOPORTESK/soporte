import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const GEMINI_API_KEY = process.env.GEMINI_API_KEY || process.env.NEXT_PUBLIC_GEMINI_API_KEY || "";

interface ModelCheck {
  name: string;
  model: string;
  provider: string;
  purpose: string;
  status: "up" | "down";
  latencyMs: number;
  error?: string;
}

async function checkGeminiModel(model: string, purpose: string): Promise<ModelCheck> {
  const start = Date.now();
  try {
    const res = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${GEMINI_API_KEY}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contents: [{ parts: [{ text: "Responda solo: OK" }] }],
          generationConfig: { maxOutputTokens: 5, temperature: 0 },
        }),
        signal: AbortSignal.timeout(10000),
      }
    );
    const latencyMs = Date.now() - start;
    if (res.ok) {
      return { name: model, model, provider: "Google AI Studio", purpose, status: "up", latencyMs };
    }
    const data = await res.json().catch(() => ({}));
    return {
      name: model, model, provider: "Google AI Studio", purpose,
      status: "down", latencyMs,
      error: data?.error?.message || `HTTP ${res.status}`,
    };
  } catch (e: any) {
    return {
      name: model, model, provider: "Google AI Studio", purpose,
      status: "down", latencyMs: Date.now() - start,
      error: e?.message || "Timeout",
    };
  }
}

export async function GET() {
  if (!GEMINI_API_KEY) {
    return NextResponse.json({
      error: "GEMINI_API_KEY no configurada",
      models: [],
    }, { status: 500 });
  }

  const modelsToCheck: Array<{ model: string; purpose: string }> = [
    { model: "gemini-3.1-flash-lite", purpose: "Chat principal · RAG · Supervisor" },
    { model: "gemini-2.0-flash", purpose: "Búsqueda web (googleSearch)" },
    { model: "gemini-2.0-flash-lite", purpose: "Fallback" },
  ];

  const results = await Promise.all(
    modelsToCheck.map(m => checkGeminiModel(m.model, m.purpose))
  );

  return NextResponse.json({ models: results });
}
