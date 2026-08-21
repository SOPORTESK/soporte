import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const GEMINI_API_KEY = process.env.GEMINI_API_KEY || process.env.NEXT_PUBLIC_GEMINI_API_KEY || "";
const GROQ_API_KEY = process.env.GROQ_API_KEY || "";
const OPENROUTER_API_KEY = process.env.OPENROUTER_API_KEY || "";
const NIM_API_KEY = process.env.NIM_API_KEY || process.env.OPENROUTER_API_KEY || "";

interface ModelCheck {
  id: string;
  model: string;
  provider: string;
  purpose: string;
  usedIn: string[];
  status: "up" | "down" | "no-key";
  latencyMs: number;
  error?: string;
}

async function checkGeminiModel(model: string, purpose: string, usedIn: string[]): Promise<ModelCheck> {
  const start = Date.now();
  if (!GEMINI_API_KEY) {
    return { id: `gemini-${model}`, model, provider: "Google AI Studio", purpose, usedIn, status: "no-key", latencyMs: 0, error: "GEMINI_API_KEY no configurada" };
  }
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
      return { id: `gemini-${model}`, model, provider: "Google AI Studio", purpose, usedIn, status: "up", latencyMs };
    }
    const data = await res.json().catch(() => ({}));
    return {
      id: `gemini-${model}`, model, provider: "Google AI Studio", purpose, usedIn,
      status: "down", latencyMs,
      error: data?.error?.message || `HTTP ${res.status}`,
    };
  } catch (e: any) {
    return {
      id: `gemini-${model}`, model, provider: "Google AI Studio", purpose, usedIn,
      status: "down", latencyMs: Date.now() - start,
      error: e?.message || "Timeout",
    };
  }
}

async function checkGroqModel(model: string, purpose: string, usedIn: string[]): Promise<ModelCheck> {
  const start = Date.now();
  if (!GROQ_API_KEY) {
    return { id: `groq-${model}`, model, provider: "Groq", purpose, usedIn, status: "no-key", latencyMs: 0, error: "GROQ_API_KEY no configurada" };
  }
  try {
    const res = await fetch("https://api.groq.com/openai/v1/chat/completions", {
      method: "POST",
      headers: { "Content-Type": "application/json", "Authorization": `Bearer ${GROQ_API_KEY}` },
      body: JSON.stringify({
        model,
        messages: [{ role: "user", content: "Responda solo: OK" }],
        max_tokens: 5,
        temperature: 0,
      }),
      signal: AbortSignal.timeout(10000),
    });
    const latencyMs = Date.now() - start;
    if (res.ok) {
      return { id: `groq-${model}`, model, provider: "Groq", purpose, usedIn, status: "up", latencyMs };
    }
    const data = await res.json().catch(() => ({}));
    return {
      id: `groq-${model}`, model, provider: "Groq", purpose, usedIn,
      status: "down", latencyMs,
      error: data?.error?.message || `HTTP ${res.status}`,
    };
  } catch (e: any) {
    return {
      id: `groq-${model}`, model, provider: "Groq", purpose, usedIn,
      status: "down", latencyMs: Date.now() - start,
      error: e?.message || "Timeout",
    };
  }
}

async function checkOpenRouterModel(model: string, purpose: string, usedIn: string[]): Promise<ModelCheck> {
  const start = Date.now();
  if (!OPENROUTER_API_KEY) {
    return { id: `or-${model}`, model, provider: "OpenRouter", purpose, usedIn, status: "no-key", latencyMs: 0, error: "OPENROUTER_API_KEY no configurada" };
  }
  try {
    const res = await fetch("https://openrouter.ai/api/v1/chat/completions", {
      method: "POST",
      headers: { "Content-Type": "application/json", "Authorization": `Bearer ${OPENROUTER_API_KEY}` },
      body: JSON.stringify({
        model,
        messages: [{ role: "user", content: "Responda solo: OK" }],
        max_tokens: 5,
        temperature: 0,
      }),
      signal: AbortSignal.timeout(15000),
    });
    const latencyMs = Date.now() - start;
    if (res.ok) {
      return { id: `or-${model}`, model, provider: "OpenRouter", purpose, usedIn, status: "up", latencyMs };
    }
    const data = await res.json().catch(() => ({}));
    return {
      id: `or-${model}`, model, provider: "OpenRouter", purpose, usedIn,
      status: "down", latencyMs,
      error: data?.error?.message || `HTTP ${res.status}`,
    };
  } catch (e: any) {
    return {
      id: `or-${model}`, model, provider: "OpenRouter", purpose, usedIn,
      status: "down", latencyMs: Date.now() - start,
      error: e?.message || "Timeout",
    };
  }
}

async function checkNimModel(model: string, purpose: string, usedIn: string[]): Promise<ModelCheck> {
  const start = Date.now();
  if (!NIM_API_KEY) {
    return { id: `nim-${model}`, model, provider: "NVIDIA NIM", purpose, usedIn, status: "no-key", latencyMs: 0, error: "NIM_API_KEY no configurada" };
  }
  try {
    const res = await fetch("https://integrate.api.nvidia.com/v1/chat/completions", {
      method: "POST",
      headers: { "Content-Type": "application/json", "Authorization": `Bearer ${NIM_API_KEY}` },
      body: JSON.stringify({
        model,
        messages: [{ role: "user", content: "Responda solo: OK" }],
        max_tokens: 5,
        temperature: 0,
      }),
      signal: AbortSignal.timeout(10000),
    });
    const latencyMs = Date.now() - start;
    if (res.ok) {
      return { id: `nim-${model}`, model, provider: "NVIDIA NIM", purpose, usedIn, status: "up", latencyMs };
    }
    const data = await res.json().catch(() => ({}));
    return {
      id: `nim-${model}`, model, provider: "NVIDIA NIM", purpose, usedIn,
      status: "down", latencyMs,
      error: data?.error?.message || `HTTP ${res.status}`,
    };
  } catch (e: any) {
    return {
      id: `nim-${model}`, model, provider: "NVIDIA NIM", purpose, usedIn,
      status: "down", latencyMs: Date.now() - start,
      error: e?.message || "Timeout",
    };
  }
}

export async function GET() {
  const checks: Promise<ModelCheck>[] = [
    // Gemini
    checkGeminiModel("gemini-3.1-flash-lite", "Chat principal · RAG · Supervisor · Visión · Transcripción", [
      "ia-agent (chat)", "seka-whatsapp (chat)", "seka-widget (chat)",
      "auto-close (cierre)", "learn-case (aprendizaje)", "meta-chat (entrenamiento)",
      "transcribe (audio)", "agente-ia/analyze", "manuales/upload-gemini",
    ]),
    checkGeminiModel("gemini-2.0-flash", "Búsqueda web (googleSearch) · Análisis avanzado", [
      "ia-agent (web search)", "seka-whatsapp (web search)", "meta-chat (análisis)",
    ]),
    checkGeminiModel("gemini-2.5-flash", "Análisis avanzado meta-chat", [
      "meta-chat (análisis profundo)",
    ]),
    checkGeminiModel("gemini-2.0-flash-lite", "Fallback", [
      "ia-agent (fallback)", "seka-whatsapp (fallback)",
    ]),
    // Groq
    checkGroqModel("llama-3.3-70b-versatile", "Procesamiento de actividad · Fallback chat", [
      "activity/process", "ia-agent (fallback chat)",
    ]),
    checkGroqModel("llama-3.3-70b-instruct", "Análisis · Transcripción de audio (manuales)", [
      "meta-chat (análisis)", "manuales/upload (Whisper)",
    ]),
    // NVIDIA NIM
    checkNimModel("meta/llama-3.1-8b-instruct", "Fallback rápido", [
      "ia-agent (fallback rápido)",
    ]),
    // OpenRouter
    checkOpenRouterModel("nvidia/nemotron-nano-12b-v2-vl:free", "Visión de archivos (imágenes)", [
      "ia-agent (visión de imágenes)",
    ]),
    checkOpenRouterModel("meta/llama-3.3-70b-instruct", "Procesamiento de actividad", [
      "activity/process",
    ]),
  ];

  const results = await Promise.all(checks);
  return NextResponse.json({ models: results });
}
