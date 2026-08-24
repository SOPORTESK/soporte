import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "fs";

const env = readFileSync(".env.local", "utf-8");
const get = (k) => env.split("\n").find(l => l.startsWith(k + "="))?.split("=").slice(1).join("=").trim();

const supabase = createClient(get("NEXT_PUBLIC_SUPABASE_URL"), get("SUPABASE_SERVICE_ROLE_KEY"));

const SQL = `
-- Proveedores de IA con sus API keys
create table if not exists sek_ai_providers (
  id text primary key,
  nombre text not null,
  api_key text,
  base_url text,
  activo boolean not null default true,
  orden int not null default 0,
  docs_url text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Modelos de IA configurables
create table if not exists sek_ai_models (
  id uuid primary key default gen_random_uuid(),
  provider_id text not null references sek_ai_providers(id) on delete cascade,
  modelo text not null,
  proposito text,
  usado_en text[],
  activo boolean not null default true,
  orden int not null default 0,
  last_status text,
  last_latency_ms int,
  last_error text,
  last_checked_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (provider_id, modelo)
);

create index if not exists idx_ai_models_provider on sek_ai_models(provider_id);
create index if not exists idx_ai_models_orden on sek_ai_models(orden);

alter table sek_ai_providers enable row level security;
alter table sek_ai_models enable row level security;

drop policy if exists "service_role_all_providers" on sek_ai_providers;
create policy "service_role_all_providers" on sek_ai_providers for all using (true);

drop policy if exists "service_role_all_models" on sek_ai_models;
create policy "service_role_all_models" on sek_ai_models for all using (true);
`;

// Ejecutar SQL via pg REST endpoint (query directa)
const PROJECT_REF = get("NEXT_PUBLIC_SUPABASE_URL").match(/https:\/\/([^.]+)/)[1];
console.log("Project ref:", PROJECT_REF);
console.log("\n=== SQL A EJECUTAR (copiar en Supabase SQL Editor si falla) ===");
console.log(SQL);
console.log("=== FIN SQL ===\n");

let tablesOk = false;
// Probar si las tablas ya existen
const { error: testErr } = await supabase.from("sek_ai_providers").select("id").limit(1);
if (!testErr) {
  console.log("Tablas ya existen, saltando creación");
  tablesOk = true;
} else {
  console.log("Tablas no existen:", testErr.message);
  console.log(">>> Ejecute el SQL de arriba en el SQL Editor de Supabase:");
  console.log(`>>> https://supabase.com/dashboard/project/${PROJECT_REF}/sql/new`);
  process.exit(1);
}

// Seed de proveedores
const providers = [
  { id: "google", nombre: "Google AI Studio", base_url: "https://generativelanguage.googleapis.com/v1beta", orden: 1, docs_url: "https://aistudio.google.com/apikey" },
  { id: "groq", nombre: "Groq", base_url: "https://api.groq.com/openai/v1", orden: 2, docs_url: "https://console.groq.com/keys" },
  { id: "openrouter", nombre: "OpenRouter", base_url: "https://openrouter.ai/api/v1", orden: 3, docs_url: "https://openrouter.ai/keys" },
  { id: "nvidia", nombre: "NVIDIA NIM", base_url: "https://integrate.api.nvidia.com/v1", orden: 4, docs_url: "https://build.nvidia.com/" },
  { id: "openai", nombre: "OpenAI", base_url: "https://api.openai.com/v1", orden: 5, docs_url: "https://platform.openai.com/api-keys" },
];

const { error: pErr } = await supabase.from("sek_ai_providers").upsert(providers, { onConflict: "id" });
console.log("Providers seed:", pErr?.message || "OK");

// Seed de modelos (los que verificamos que funcionan)
const models = [
  { provider_id: "google", modelo: "gemini-3.5-flash-lite", proposito: "Chat principal · RAG · Supervisor · Visión · Transcripción", usado_en: ["ia-agent", "seka-whatsapp", "seka-widget", "auto-close", "learn-case", "meta-chat", "transcribe"], orden: 1 },
  { provider_id: "google", modelo: "gemini-flash-lite-latest", proposito: "Fallback de chat", usado_en: ["ia-agent (fallback)", "seka-whatsapp (fallback)"], orden: 2 },
  { provider_id: "google", modelo: "gemini-3.5-flash", proposito: "Búsqueda web (googleSearch) · Análisis", usado_en: ["ia-agent (web search)", "seka-whatsapp (web search)", "meta-chat"], orden: 3 },
  { provider_id: "google", modelo: "gemini-3.1-flash-lite", proposito: "Respaldo · Visión", usado_en: ["ia-agent (respaldo)"], orden: 4 },
  { provider_id: "google", modelo: "gemini-3-flash-preview", proposito: "Análisis avanzado meta-chat", usado_en: ["meta-chat (análisis profundo)"], orden: 5 },
  { provider_id: "google", modelo: "gemini-3.6-flash", proposito: "Visión de archivos (cadena fallback)", usado_en: ["seka-whatsapp (visión)", "seka-widget (visión)"], orden: 6 },
  { provider_id: "groq", modelo: "llama-3.3-70b-versatile", proposito: "Procesamiento de actividad · Fallback chat", usado_en: ["activity/process", "ia-agent (fallback)"], orden: 1 },
  { provider_id: "groq", modelo: "llama-3.3-70b-instruct", proposito: "Análisis meta-chat", usado_en: ["meta-chat (análisis)"], orden: 2 },
  { provider_id: "nvidia", modelo: "meta/llama-3.1-8b-instruct", proposito: "Fallback rápido", usado_en: ["ia-agent (fallback rápido)"], orden: 1 },
  { provider_id: "nvidia", modelo: "meta/llama-3.2-11b-vision-instruct", proposito: "Visión (cadena fallback)", usado_en: ["seka-whatsapp", "seka-widget"], orden: 2 },
  { provider_id: "nvidia", modelo: "meta/llama-3.2-90b-vision-instruct", proposito: "Visión (cadena fallback)", usado_en: ["seka-whatsapp", "seka-widget"], orden: 3 },
  { provider_id: "openrouter", modelo: "nvidia/nemotron-nano-12b-v2-vl:free", proposito: "Visión de imágenes", usado_en: ["ia-agent (visión)"], orden: 1 },
  { provider_id: "openrouter", modelo: "meta-llama/llama-3.2-11b-vision-instruct:free", proposito: "Visión (cadena fallback)", usado_en: ["seka-whatsapp", "seka-widget"], orden: 2 },
  { provider_id: "openrouter", modelo: "qwen/qwen-2-vl-7b-instruct:free", proposito: "Visión (cadena fallback)", usado_en: ["seka-whatsapp", "seka-widget"], orden: 3 },
  { provider_id: "openrouter", modelo: "meta/llama-3.3-70b-instruct", proposito: "Procesamiento de actividad", usado_en: ["activity/process"], orden: 4 },
  { provider_id: "openai", modelo: "gpt-4o-mini", proposito: "Extracción automática de datos del caso", usado_en: ["auto-extract"], orden: 1 },
];

const { error: mErr } = await supabase.from("sek_ai_models").upsert(models, { onConflict: "provider_id,modelo" });
console.log("Models seed:", mErr?.message || "OK");

const { count: pc } = await supabase.from("sek_ai_providers").select("*", { count: "exact", head: true });
const { count: mc } = await supabase.from("sek_ai_models").select("*", { count: "exact", head: true });
console.log(`Total: ${pc} providers, ${mc} models`);
