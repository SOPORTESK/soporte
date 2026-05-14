import { createClient } from "@/lib/supabase/server";
import { ProfileForm } from "@/components/admin/profile-form";
import { DangerZonePanel } from "@/components/admin/danger-zone-panel";
import { Settings, Server, Clock, Shield, Webhook, Database, Globe, Users, Zap, Activity, ShieldAlert, KeyRound, CheckCircle2 } from "lucide-react";
import { Badge } from "@/components/ui/avatar";
import type { SekAgent } from "@/lib/types";
import { IaModeToggle } from "@/components/admin/ia-mode-toggle";

export const dynamic = "force-dynamic";

export default async function AdminSettingsPage() {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  const { data: agent } = await supabase
    .from("sek_agent_config").select("*").ilike("email", user!.email!).maybeSingle();

  const isSuperadmin = agent?.rol === "superadmin";
  const isAdmin = agent?.rol === "admin" || isSuperadmin;

  const { data: allAgents } = isAdmin
    ? await supabase.from("sek_agent_config").select("email, nombre, apellido, rol, status, last_login, created_at").order("created_at")
    : { data: [] };

  const { data: channels } = await supabase.from("sek_channels").select("id, name, kind, is_active, created_at").order("created_at");

  const { data: iaConfig } = await supabase
    .from("sek_agent_config")
    .select("ia_activa")
    .eq("email", "system_prompt@sekunet.com")
    .maybeSingle();
  const iaActiva = iaConfig?.ia_activa ?? true;

  const { count: msgCount } = isSuperadmin
    ? await supabase.from("sek_messages").select("id", { count: "exact", head: true })
    : { count: null };

  const { count: caseCount } = await supabase.from("sek_cases").select("id", { count: "exact", head: true });

  const nowStr = new Date().toLocaleString("es-CR", { timeZone: "America/Costa_Rica", dateStyle: "long", timeStyle: "short" });

  return (
    <div className="max-w-[1400px] mx-auto p-4 md:p-6 xl:p-8 space-y-6">

      {/* ── Header premium ── */}
      <header className="relative overflow-hidden rounded-3xl border border-border/60 bg-gradient-to-br from-card via-card to-muted/20 p-6 lg:p-8">
        <div className="absolute -top-20 -right-20 w-72 h-72 bg-brand-500/6 rounded-full blur-[80px] pointer-events-none" />
        <div className="relative flex flex-col lg:flex-row lg:items-end lg:justify-between gap-4">
          <div>
            <div className="flex items-center gap-2.5 mb-3">
              <div className="h-7 w-7 rounded-lg bg-gradient-to-br from-brand-500 to-brand-600 text-white grid place-items-center shadow-lg shadow-brand-500/25">
                <Settings className="h-3.5 w-3.5" />
              </div>
              <p className="text-[10px] font-black uppercase tracking-[0.3em] text-brand-500">Plataforma · Administración</p>
            </div>
            <h1 className="text-3xl lg:text-4xl font-black tracking-tight">Configuración del Sistema</h1>
            <p className="text-sm text-muted-foreground mt-2 max-w-xl">
              Gestión de equipo, canales, infraestructura y parámetros del agente IA.
            </p>
          </div>
          <div className="flex items-center gap-3 shrink-0 flex-wrap">
            <div className="px-3 py-2 rounded-xl border border-border/60 bg-card/60 text-center">
              <p className="text-lg font-black tabular-nums text-brand-500">{caseCount?.toLocaleString("es-CR") ?? "—"}</p>
              <p className="text-[9px] text-muted-foreground font-bold uppercase tracking-wider">Casos totales</p>
            </div>
            {isSuperadmin && (
              <div className="px-3 py-2 rounded-xl border border-rose-500/20 bg-rose-500/5 text-center">
                <p className="text-lg font-black tabular-nums text-rose-500">{msgCount?.toLocaleString("es-CR") ?? "—"}</p>
                <p className="text-[9px] text-muted-foreground font-bold uppercase tracking-wider">Mensajes en BD</p>
              </div>
            )}
            <div className="px-3 py-2 rounded-xl border border-border/60 bg-card/60 text-center">
              <p className="text-lg font-black tabular-nums text-violet-500">{allAgents?.length ?? "—"}</p>
              <p className="text-[9px] text-muted-foreground font-bold uppercase tracking-wider">Agentes</p>
            </div>
          </div>
        </div>
        <p className="text-[10px] text-muted-foreground mt-4 relative">{nowStr}</p>
      </header>

      <div className="grid gap-6 lg:grid-cols-12">

        {/* ── Columna izquierda (8 col) ── */}
        <div className="lg:col-span-8 space-y-6">

          {/* Edge Functions */}
          <section className="rounded-2xl border border-border/60 bg-card p-5">
            <div className="flex items-center gap-2.5 mb-4">
              <div className="h-7 w-7 rounded-lg bg-violet-500/10 text-violet-500 grid place-items-center">
                <Server className="h-3.5 w-3.5" />
              </div>
              <div>
                <h2 className="text-sm font-black">Edge Functions</h2>
                <p className="text-[10px] text-muted-foreground">Funciones serverless activas en Supabase</p>
              </div>
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              {[
                { name: "ia-agent", desc: "Procesa mensajes con Gemini 3.1 Flash Lite, RAG, escalación", icon: Activity },
                { name: "auto-close", desc: "Cierra casos por inactividad (5 min)", icon: Clock },
                { name: "learn-case", desc: "Aprendizaje obligatorio al cerrar (Regla Inmutable)", icon: Activity },
                { name: "send-transcript", desc: "Envía transcripción por email al cerrar", icon: Globe },
                { name: "whatsapp-webhook", desc: "Recibe mensajes de WhatsApp Cloud API", icon: Webhook },
              ].map((fn) => (
                <div key={fn.name} className="group p-4 rounded-xl bg-muted/30 border border-border/60 hover:border-violet-500/30 hover:bg-muted/50 transition-all">
                  <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center gap-2">
                      <fn.icon className="h-3.5 w-3.5 text-violet-500" />
                      <p className="font-black text-xs font-mono">{fn.name}</p>
                    </div>
                    <span className="flex items-center gap-1 text-[9px] font-black text-emerald-500 bg-emerald-500/10 px-2 py-0.5 rounded-full">
                      <CheckCircle2 className="h-2.5 w-2.5" /> Activa
                    </span>
                  </div>
                  <p className="text-[10px] text-muted-foreground">{fn.desc}</p>
                </div>
              ))}
            </div>
          </section>

          {/* Toggle IA Global — solo superadmin */}
          {isSuperadmin && (
            <section>
              <IaModeToggle initialValue={iaActiva} />
            </section>
          )}

          {/* Configuración SEKA */}
          <section className="rounded-2xl border border-border/60 bg-card p-5">
            <div className="flex items-center gap-2.5 mb-4">
              <div className="h-7 w-7 rounded-lg bg-brand-500/10 text-brand-500 grid place-items-center">
                <Zap className="h-3.5 w-3.5" />
              </div>
              <div>
                <h2 className="text-sm font-black">Configuración SEKA</h2>
                <p className="text-[10px] text-muted-foreground">Parámetros del agente de inteligencia artificial</p>
              </div>
            </div>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {[
                { label: "Modelo Primario", value: "gemini-3.1-flash-lite", sub: "Google AI · 1,500 RPD" },
                { label: "Visión", value: "gemini-3.1-flash-lite", sub: "Google AI · Multimodal" },
                { label: "Búsqueda Web", value: "gemini-3.1-flash-lite", sub: "+ Google Search Grounding" },
                { label: "Temperature", value: "0.3", sub: "Respuestas deterministas" },
                { label: "Max Tokens", value: "600", sub: "Respuestas concisas" },
                { label: "Horario", value: "L-V 7:30–17:00", sub: "Hora Costa Rica (UTC-6)" },
              ].map(item => (
                <div key={item.label} className="p-3.5 rounded-xl bg-muted/30 border border-border/40">
                  <p className="text-[10px] font-black uppercase tracking-wider text-muted-foreground mb-1">{item.label}</p>
                  <p className="text-sm font-black">{item.value}</p>
                  <p className="text-[10px] text-brand-500 mt-0.5">{item.sub}</p>
                </div>
              ))}
            </div>
          </section>

          {/* Infraestructura */}
          <section className="rounded-2xl border border-border/60 bg-card p-5">
            <div className="flex items-center gap-2.5 mb-4">
              <div className="h-7 w-7 rounded-lg bg-sky-500/10 text-sky-500 grid place-items-center">
                <Database className="h-3.5 w-3.5" />
              </div>
              <div>
                <h2 className="text-sm font-black">Infraestructura</h2>
                <p className="text-[10px] text-muted-foreground">Servicios activos de la plataforma</p>
              </div>
            </div>
            <div className="space-y-2">
              {[
                { icon: Shield, label: "Autenticación", desc: "@supabase/ssr con middleware protegido", variant: "success" as const, badge: "Activa" },
                { icon: Activity, label: "Realtime", desc: "Supabase Realtime + Presence (typing indicators)", variant: "success" as const, badge: "Activa" },
                { icon: Webhook, label: "Webhooks", desc: "WhatsApp Cloud API (Meta)", variant: "muted" as const, badge: "Configurable" },
              ].map(row => (
                <div key={row.label} className="flex items-center justify-between p-3 rounded-xl bg-muted/30 border border-border/40 hover:bg-muted/50 transition-colors">
                  <div className="flex items-center gap-3">
                    <row.icon className="h-4 w-4 text-muted-foreground shrink-0" />
                    <div>
                      <p className="text-sm font-bold">{row.label}</p>
                      <p className="text-[10px] text-muted-foreground">{row.desc}</p>
                    </div>
                  </div>
                  <Badge variant={row.variant} className="text-[10px] shrink-0">{row.badge}</Badge>
                </div>
              ))}
            </div>
          </section>

          {/* Canales */}
          {channels && channels.length > 0 && (
            <section className="rounded-2xl border border-border/60 bg-card p-5">
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-2.5">
                  <div className="h-7 w-7 rounded-lg bg-emerald-500/10 text-emerald-500 grid place-items-center">
                    <Globe className="h-3.5 w-3.5" />
                  </div>
                  <div>
                    <h2 className="text-sm font-black">Canales Activos</h2>
                    <p className="text-[10px] text-muted-foreground">Puntos de contacto configurados</p>
                  </div>
                </div>
                <span className="text-sm font-black text-emerald-500">{channels.length}</span>
              </div>
              <div className="space-y-2">
                {channels.map((c: any) => (
                  <div key={c.id} className="flex items-center justify-between p-3 rounded-xl bg-muted/30 border border-border/40">
                    <div>
                      <p className="text-sm font-bold">{c.name}</p>
                      <p className="text-[10px] text-muted-foreground capitalize">{c.kind}</p>
                    </div>
                    <Badge variant={c.is_active ? "success" : "muted"} className="text-[10px]">
                      {c.is_active ? "Activo" : "Inactivo"}
                    </Badge>
                  </div>
                ))}
              </div>
            </section>
          )}

          {/* ── ZONA DE PELIGRO — solo superadmin ── */}
          {isSuperadmin && (
            <section className="rounded-2xl border border-rose-500/30 bg-rose-500/5 p-5">
              <div className="flex items-center gap-2.5 mb-1">
                <div className="h-7 w-7 rounded-lg bg-rose-500/15 text-rose-500 grid place-items-center">
                  <ShieldAlert className="h-3.5 w-3.5" />
                </div>
                <div>
                  <h2 className="text-sm font-black text-rose-500">Zona de Peligro</h2>
                  <p className="text-[10px] text-muted-foreground">Solo visible para superadmin · Acciones irreversibles</p>
                </div>
              </div>
              <p className="text-xs text-muted-foreground mb-4 mt-2 border-l-2 border-rose-500/30 pl-3">
                Reset operacional: borra todos los chats, mensajes y clientes para arrancar la aplicación
                con datos reales en producción. Se preservan prompt, agentes, inventario, manuales, RAG y adjuntos.
                <strong className="text-rose-500"> Esta acción no se puede deshacer.</strong>
              </p>
              <DangerZonePanel />
            </section>
          )}
        </div>

        {/* ── Columna derecha (4 col) ── */}
        <div className="lg:col-span-4 space-y-6">

          {/* Mi perfil */}
          <section className="rounded-2xl border border-border/60 bg-card p-5">
            <div className="flex items-center gap-2.5 mb-4">
              <div className="h-7 w-7 rounded-lg bg-amber-500/10 text-amber-500 grid place-items-center">
                <KeyRound className="h-3.5 w-3.5" />
              </div>
              <div>
                <h2 className="text-sm font-black">Mi Perfil</h2>
                <p className="text-[10px] text-muted-foreground">Datos personales y acceso</p>
              </div>
            </div>
            <ProfileForm agent={agent as SekAgent} />
          </section>

          {/* Equipo — solo admin/superadmin */}
          {isAdmin && allAgents && allAgents.length > 0 && (
            <section className="rounded-2xl border border-border/60 bg-card p-5">
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-2.5">
                  <div className="h-7 w-7 rounded-lg bg-violet-500/10 text-violet-500 grid place-items-center">
                    <Users className="h-3.5 w-3.5" />
                  </div>
                  <div>
                    <h2 className="text-sm font-black">Equipo</h2>
                    <p className="text-[10px] text-muted-foreground">{allAgents.length} agentes registrados</p>
                  </div>
                </div>
              </div>
              <div className="space-y-2">
                {(allAgents as SekAgent[]).map((a) => {
                  const fullName = [a.nombre, a.apellido].filter(Boolean).join(" ") || a.email;
                  const rolColor =
                    a.rol === "superadmin" ? "text-rose-500 bg-rose-500/10" :
                    a.rol === "admin" ? "text-amber-500 bg-amber-500/10" :
                    "text-muted-foreground bg-muted";
                  return (
                    <div key={a.email} className="flex items-center gap-3 p-2.5 rounded-xl bg-muted/30 border border-border/40 hover:bg-muted/50 transition-colors">
                      <div className="h-8 w-8 rounded-lg bg-gradient-to-br from-brand-500/20 to-brand-600/20 text-brand-500 text-xs font-black grid place-items-center shrink-0">
                        {(a.nombre?.[0] || a.email[0]).toUpperCase()}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-xs font-bold truncate">{fullName}</p>
                        <p className="text-[9px] text-muted-foreground truncate">{a.email}</p>
                      </div>
                      <span className={`text-[9px] font-black px-1.5 py-0.5 rounded-full capitalize shrink-0 ${rolColor}`}>
                        {a.rol}
                      </span>
                    </div>
                  );
                })}
              </div>
            </section>
          )}

        </div>
      </div>
    </div>
  );
}
