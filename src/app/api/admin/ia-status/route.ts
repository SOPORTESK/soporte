import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const GEMINI_API_KEY = process.env.GEMINI_API_KEY || process.env.NEXT_PUBLIC_GEMINI_API_KEY || "";
const GROQ_API_KEY = process.env.GROQ_API_KEY || "";
const OPENROUTER_API_KEY = process.env.OPENROUTER_API_KEY || "";
const NIM_API_KEY = process.env.NIM_API_KEY || process.env.OPENROUTER_API_KEY || "";
const OPENAI_KEY = process.env.OPENAI_API_KEY || "";

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

async function checkGemini(model: string, purpose: string, usedIn: string[]): Promise<ModelCheck> {
  const start = Date.now();
  if (!GEMINI_API_KEY) return { id: `gemini-${model}`, model, provider: "Google AI Studio", purpose, usedIn, status: "no-key", latencyMs: 0, error: "GEMINI_API_KEY no configurada" };
  try {
    const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${GEMINI_API_KEY}`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ contents: [{ parts: [{ text: "OK" }] }], generationConfig: { maxOutputTokens: 5, temperature: 0 } }),
      signal: AbortSignal.timeout(10000),
    });
    const latencyMs = Date.now() - start;
    if (res.ok) return { id: `gemini-${model}`, model, provider: "Google AI Studio", purpose, usedIn, status: "up", latencyMs };
    const data = await res.json().catch(() => ({}));
    return { id: `gemini-${model}`, model, provider: "Google AI Studio", purpose, usedIn, status: "down", latencyMs, error: data?.error?.message || `HTTP ${res.status}` };
  } catch (e: any) {
    return { id: `gemini-${model}`, model, provider: "Google AI Studio", purpose, usedIn, status: "down", latencyMs: Date.now() - start, error: e?.message || "Timeout" };
  }
}

async function checkGroq(model: string, purpose: string, usedIn: string[]): Promise<ModelCheck> {
  const start = Date.now();
  if (!GROQ_API_KEY) return { id: `groq-${model}`, model, provider: "Groq", purpose, usedIn, status: "no-key", latencyMs: 0, error: "GROQ_API_KEY no configurada" };
  try {
    const res = await fetch("https://api.groq.com/openai/v1/chat/completions", {
      method: "POST", headers: { "Content-Type": "application/json", "Authorization": `Bearer ${GROQ_API_KEY}` },
      body: JSON.stringify({ model, messages: [{ role: "user", content: "OK" }], max_tokens: 5, temperature: 0 }),
      signal: AbortSignal.timeout(10000),
    });
    const latencyMs = Date.now() - start;
    if (res.ok) return { id: `groq-${model}`, model, provider: "Groq", purpose, usedIn, status: "up", latencyMs };
    const data = await res.json().catch(() => ({}));
    return { id: `groq-${model}`, model, provider: "Groq", purpose, usedIn, status: "down", latencyMs, error: data?.error?.message || `HTTP ${res.status}` };
  } catch (e: any) {
    return { id: `groq-${model}`, model, provider: "Groq", purpose, usedIn, status: "down", latencyMs: Date.now() - start, error: e?.message || "Timeout" };
  }
}

async function checkOpenRouter(model: string, purpose: string, usedIn: string[]): Promise<ModelCheck> {
  const start = Date.now();
  if (!OPENROUTER_API_KEY) return { id: `or-${model}`, model, provider: "OpenRouter", purpose, usedIn, status: "no-key", latencyMs: 0, error: "OPENROUTER_API_KEY no configurada" };
  try {
    const res = await fetch("https://openrouter.ai/api/v1/chat/completions", {
      method: "POST", headers: { "Content-Type": "application/json", "Authorization": `Bearer ${OPENROUTER_API_KEY}` },
      body: JSON.stringify({ model, messages: [{ role: "user", content: "OK" }], max_tokens: 5, temperature: 0 }),
      signal: AbortSignal.timeout(15000),
    });
    const latencyMs = Date.now() - start;
    if (res.ok) return { id: `or-${model}`, model, provider: "OpenRouter", purpose, usedIn, status: "up", latencyMs };
    const data = await res.json().catch(() => ({}));
    return { id: `or-${model}`, model, provider: "OpenRouter", purpose, usedIn, status: "down", latencyMs, error: data?.error?.message || `HTTP ${res.status}` };
  } catch (e: any) {
    return { id: `or-${model}`, model, provider: "OpenRouter", purpose, usedIn, status: "down", latencyMs: Date.now() - start, error: e?.message || "Timeout" };
  }
}

async function checkNim(model: string, purpose: string, usedIn: string[]): Promise<ModelCheck> {
  const start = Date.now();
  if (!NIM_API_KEY) return { id: `nim-${model}`, model, provider: "NVIDIA NIM", purpose, usedIn, status: "no-key", latencyMs: 0, error: "NIM_API_KEY no configurada" };
  try {
    const res = await fetch("https://integrate.api.nvidia.com/v1/chat/completions", {
      method: "POST", headers: { "Content-Type": "application/json", "Authorization": `Bearer ${NIM_API_KEY}` },
      body: JSON.stringify({ model, messages: [{ role: "user", content: "OK" }], max_tokens: 5, temperature: 0 }),
      signal: AbortSignal.timeout(10000),
    });
    const latencyMs = Date.now() - start;
    if (res.ok) return { id: `nim-${model}`, model, provider: "NVIDIA NIM", purpose, usedIn, status: "up", latencyMs };
    const data = await res.json().catch(() => ({}));
    return { id: `nim-${model}`, model, provider: "NVIDIA NIM", purpose, usedIn, status: "down", latencyMs, error: data?.error?.message || `HTTP ${res.status}` };
  } catch (e: any) {
    return { id: `nim-${model}`, model, provider: "NVIDIA NIM", purpose, usedIn, status: "down", latencyMs: Date.now() - start, error: e?.message || "Timeout" };
  }
}

async function checkOpenAI(model: string, purpose: string, usedIn: string[]): Promise<ModelCheck> {
  const start = Date.now();
  if (!OPENAI_KEY) return { id: `oai-${model}`, model, provider: "OpenAI", purpose, usedIn, status: "no-key", latencyMs: 0, error: "OPENAI_API_KEY no configurada" };
  try {
    const res = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST", headers: { "Content-Type": "application/json", "Authorization": `Bearer ${OPENAI_KEY}` },
      body: JSON.stringify({ model, messages: [{ role: "user", content: "OK" }], max_tokens: 5, temperature: 0 }),
      signal: AbortSignal.timeout(10000),
    });
    const latencyMs = Date.now() - start;
    if (res.ok) return { id: `oai-${model}`, model, provider: "OpenAI", purpose, usedIn, status: "up", latencyMs };
    const data = await res.json().catch(() => ({}));
    return { id: `oai-${model}`, model, provider: "OpenAI", purpose, usedIn, status: "down", latencyMs, error: data?.error?.message || `HTTP ${res.status}` };
  } catch (e: any) {
    return { id: `oai-${model}`, model, provider: "OpenAI", purpose, usedIn, status: "down", latencyMs: Date.now() - start, error: e?.message || "Timeout" };
  }
}

export async function GET() {
  const checks: Promise<ModelCheck>[] = [
    // ── Google AI Studio (Gemini) ──
    checkGemini("gemini-3.1-flash-lite", "Chat principal · RAG · Supervisor · Visión · Transcripción", [
      "ia-agent", "seka-whatsapp", "seka-widget", "auto-close", "learn-case",
      "meta-chat", "transcribe", "agente-ia/analyze", "manuales/upload-gemini",
    ]),
    checkGemini("gemini-2.0-flash", "Búsqueda web (googleSearch) · Análisis", [
      "ia-agent (web search)", "seka-whatsapp (web search)", "meta-chat (análisis)",
    ]),
    checkGemini("gemini-2.5-flash", "Análisis avanzado meta-chat", ["meta-chat (análisis profundo)"]),
    checkGemini("gemini-2.0-flash-lite", "Fallback de chat", ["ia-agent (fallback)", "seka-whatsapp (fallback)"]),
    checkGemini("gemini-1.5-flash", "Fallback de visión (cadena)", ["seka-whatsapp (visión)", "seka-widget (visión)"]),

    // ── Groq ──
    checkGroq("llama-3.3-70b-versatile", "Procesamiento de actividad · Fallback chat", [
      "activity/process", "ia-agent (fallback chat)",
    ]),
    checkGroq("llama-3.3-70b-instruct", "Análisis meta-chat", ["meta-chat (análisis)"]),

    // ── NVIDIA NIM ──
    checkNim("meta/llama-3.1-8b-instruct", "Fallback rápido", ["ia-agent (fallback rápido)"]),
    checkNim("meta/llama-3.2-11b-vision-instruct", "Visión (cadena fallback)", [
      "seka-whatsapp (visión)", "seka-widget (visión)",
    ]),
    checkNim("meta/llama-3.2-90b-vision-instruct", "Visión (cadena fallback)", [
      "seka-whatsapp (visión)", "seka-widget (visión)",
    ]),

    // ── OpenRouter ──
    checkOpenRouter("nvidia/nemotron-nano-12b-v2-vl:free", "Visión de imágenes", ["ia-agent (visión)"]),
    checkOpenRouter("meta-llama/llama-3.2-11b-vision-instruct:free", "Visión (cadena fallback)", [
      "seka-whatsapp", "seka-widget",
    ]),
    checkOpenRouter("qwen/qwen-2-vl-7b-instruct:free", "Visión (cadena fallback)", [
      "seka-whatsapp", "seka-widget",
    ]),
    checkOpenRouter("meta/llama-3.3-70b-instruct", "Procesamiento de actividad", ["activity/process"]),

    // ── OpenAI ──
    checkOpenAI("gpt-4o-mini", "Extracción automática de datos del caso", ["auto-extract"]),
  ];

  const results = await Promise.all(checks);
  return NextResponse.json({ models: results });
}
