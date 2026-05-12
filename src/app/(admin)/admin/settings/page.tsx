import { createClient } from "@/lib/supabase/server";
import { ProfileForm } from "@/components/admin/profile-form";
import { Settings, Server, Clock, Shield, Webhook, Database, Globe } from "lucide-react";
import { Badge } from "@/components/ui/avatar";
import type { SekAgent } from "@/lib/types";

export const dynamic = "force-dynamic";

export default async function AdminSettingsPage() {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  const { data: agent } = await supabase
    .from("sek_agent_config").select("*").ilike("email", user!.email!).maybeSingle();

  return (
    <div className="max-w-6xl mx-auto p-6 lg:p-8 space-y-8">
      <header>
        <p className="text-xs font-bold uppercase tracking-[0.2em] text-brand-700 dark:text-brand-300">Plataforma</p>
        <h1 className="text-3xl font-bold mt-1 flex items-center gap-3">
          <Settings className="h-7 w-7" /> Configuración del Sistema
        </h1>
        <p className="text-muted-foreground mt-1">
          Ajustes de SEKA, Edge Functions, autenticación y configuración general.
        </p>
      </header>

      {/* Edge Functions */}
      <section className="rounded-2xl border border-border bg-card p-6">
        <h2 className="text-lg font-semibold mb-4 flex items-center gap-2">
          <Server className="h-5 w-5 text-brand-700" /> Edge Functions Activas
        </h2>
        <p className="text-sm text-muted-foreground mb-4">
          Funciones serverless que procesan lógica de negocio en Supabase.
        </p>
        <div className="grid gap-3 sm:grid-cols-2">
          {[
            { name: "ia-agent", desc: "Procesa mensajes con Gemini 3.1, RAG, búsqueda web, escalación", status: "Activa" },
            { name: "auto-close", desc: "Cierra casos por inactividad (5 min)", status: "Activa" },
            { name: "send-transcript", desc: "Envía transcripción por email al cerrar", status: "Activa" },
            { name: "whatsapp-webhook", desc: "Recibe mensajes de WhatsApp Cloud API", status: "Activa" },
          ].map((fn) => (
            <div key={fn.name} className="p-4 rounded-xl bg-muted/50 border border-border">
              <div className="flex items-center justify-between mb-2">
                <p className="font-semibold text-sm font-mono">{fn.name}</p>
                <Badge variant="success" className="text-[10px]">{fn.status}</Badge>
              </div>
              <p className="text-xs text-muted-foreground">{fn.desc}</p>
            </div>
          ))}
        </div>
      </section>

      {/* Configuración SEKA */}
      <section className="rounded-2xl border border-border bg-card p-6">
        <h2 className="text-lg font-semibold mb-4 flex items-center gap-2">
          <Globe className="h-5 w-5 text-brand-700" /> Configuración SEKA
        </h2>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <div className="p-4 rounded-xl bg-muted/50">
            <p className="font-semibold text-sm mb-1">Modelo Primario</p>
            <p className="text-xs text-muted-foreground">gemini-3.1-flash-lite</p>
            <p className="text-xs text-brand-700">Google AI · 1,500 RPD</p>
          </div>
          <div className="p-4 rounded-xl bg-muted/50">
            <p className="font-semibold text-sm mb-1">Visión</p>
            <p className="text-xs text-muted-foreground">gemini-3.1-flash</p>
            <p className="text-xs text-brand-700">Google AI · Multimodal</p>
          </div>
          <div className="p-4 rounded-xl bg-muted/50">
            <p className="font-semibold text-sm mb-1">Búsqueda Web</p>
            <p className="text-xs text-muted-foreground">gemini-3.1-flash</p>
            <p className="text-xs text-brand-700">+ Google Search Grounding</p>
          </div>
          <div className="p-4 rounded-xl bg-muted/50">
            <p className="font-semibold text-sm mb-1">Temperature</p>
            <p className="text-xs text-muted-foreground">0.3</p>
            <p className="text-xs text-brand-700">Respuestas deterministas</p>
          </div>
          <div className="p-4 rounded-xl bg-muted/50">
            <p className="font-semibold text-sm mb-1">Max Tokens</p>
            <p className="text-xs text-muted-foreground">600</p>
            <p className="text-xs text-brand-700">Respuestas concisas</p>
          </div>
          <div className="p-4 rounded-xl bg-muted/50">
            <p className="font-semibold text-sm mb-1">Horario</p>
            <p className="text-xs text-muted-foreground">L-V 7:30-17:00</p>
            <p className="text-xs text-brand-700">Hora Costa Rica (UTC-6)</p>
          </div>
        </div>
      </section>

      {/* Infraestructura */}
      <section className="rounded-2xl border border-border bg-card p-6">
        <h2 className="text-lg font-semibold mb-4 flex items-center gap-2">
          <Database className="h-5 w-5 text-brand-700" /> Infraestructura
        </h2>
        <div className="space-y-3">
          <div className="flex items-center justify-between p-3 rounded-xl bg-muted/50">
            <div className="flex items-center gap-3">
              <Shield className="h-4 w-4 text-muted-foreground" />
              <div>
                <p className="font-medium text-sm">Autenticación</p>
                <p className="text-xs text-muted-foreground">@supabase/ssr con middleware protegido</p>
              </div>
            </div>
            <Badge variant="success" className="text-[10px]">Activa</Badge>
          </div>
          <div className="flex items-center justify-between p-3 rounded-xl bg-muted/50">
            <div className="flex items-center gap-3">
              <Clock className="h-4 w-4 text-muted-foreground" />
              <div>
                <p className="font-medium text-sm">Realtime</p>
                <p className="text-xs text-muted-foreground">Supabase Realtime + Presence (typing indicators)</p>
              </div>
            </div>
            <Badge variant="success" className="text-[10px]">Activa</Badge>
          </div>
          <div className="flex items-center justify-between p-3 rounded-xl bg-muted/50">
            <div className="flex items-center gap-3">
              <Webhook className="h-4 w-4 text-muted-foreground" />
              <div>
                <p className="font-medium text-sm">Webhooks</p>
                <p className="text-xs text-muted-foreground">WhatsApp Cloud API (Meta)</p>
              </div>
            </div>
            <Badge variant="muted" className="text-[10px]">Configurable</Badge>
          </div>
        </div>
      </section>

      {/* Tu Perfil */}
      <section className="rounded-2xl border border-border bg-card p-6">
        <h2 className="text-lg font-semibold mb-4">Tu Perfil</h2>
        <ProfileForm agent={agent as SekAgent} />
      </section>
    </div>
  );
}
