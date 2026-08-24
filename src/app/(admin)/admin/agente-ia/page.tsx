import { createClient } from "@/lib/supabase/server";
import {
  Bot, Brain, FileText, Clock, AlertCircle, Zap, Globe, Eye, Package,
  ArrowUpRight, CheckCircle2, Activity, Sparkles, TrendingUp,
} from "lucide-react";
import nextDynamic from "next/dynamic";
import { AiConfigPanel } from "@/components/admin/ai-config-panel";
import { UnattendedModeToggle } from "@/components/admin/unattended-mode-toggle";

const MetaAgentChat = nextDynamic(
  () => import("@/components/admin/meta-agent-chat").then(m => m.MetaAgentChat),
  { ssr: false }
);

export const dynamic = "force-dynamic";

export default async function AdminAgenteIAPage() {
  const supabase = createClient();

  const { data: { user } } = await supabase.auth.getUser();
  const { data: currentAgent } = await supabase
    .from("sek_agent_config")
    .select("rol")
    .ilike("email", user?.email || "")
    .maybeSingle();
  const isSuperadmin = currentAgent?.rol === "superadmin";

  const { data: agentConfig } = await supabase
    .from("sek_agent_config")
    .select("system_prompt, nombre, apellido, ia_activa, modo_no_atendido")
    .eq("email", "system_prompt@sekunet.com")
    .maybeSingle();

  const iaActiva = agentConfig?.ia_activa ?? true;
  const modoNoAtendido = agentConfig?.modo_no_atendido ?? false;
  const promptLen = agentConfig?.system_prompt?.length ?? 0;

  const { data: cases } = await supabase
    .from("sek_cases")
    .select("estado")
    .in("estado", ["ia_atendiendo", "escalado"]);

  const iaAtendiendo = cases?.filter(c => c.estado === "ia_atendiendo").length || 0;
  const escalados = cases?.filter(c => c.estado === "escalado").length || 0;

  // Métricas reales de hoy
  const hoy = new Date();
  const inicioHoy = new Date(hoy.getFullYear(), hoy.getMonth(), hoy.getDate()).toISOString();
  const { data: casosHoy } = await supabase
    .from("sek_cases")
    .select("id, estado, escalado_at, closed_at, assigned_to")
    .gte("created_at", inicioHoy)
    .neq("canal", "simulator")
    .neq("es_test", true);

  const casosHoyTotal = casosHoy?.length || 0;
  const casosHoyIa = casosHoy?.filter(c => c.assigned_to === "system_prompt@sekunet.com" || c.assigned_to === "whatsapp_agent@sekunet.com").length || 0;
  const casosHoyEscalados = casosHoy?.filter(c => c.estado === "escalado" || c.escalado_at).length || 0;
  const casosHoyResueltos = casosHoy?.filter(c => c.estado === "cerrado" || c.estado === "resuelto" || c.closed_at).length || 0;
  const tasaEscalacion = casosHoyTotal > 0 ? Math.floor((casosHoyEscalados / casosHoyTotal) * 100) : 0;

  const estado = modoNoAtendido
    ? { label: "Modo No Atendido", cls: "bg-amber-500/10 border-amber-500/20 text-amber-600", dot: "bg-amber-500", pulse: false }
    : iaActiva
      ? { label: "Sistema Operativo", cls: "bg-emerald-500/10 border-emerald-500/20 text-emerald-500", dot: "bg-emerald-500", pulse: true }
      : { label: "IA Pausada", cls: "bg-rose-500/10 border-rose-500/20 text-rose-500", dot: "bg-rose-500", pulse: false };

  const kpis = [
    { label: "Activos IA", value: iaAtendiendo, sub: "Atendiendo ahora", icon: Brain, color: "violet", subIcon: Activity },
    { label: "Escalados", value: escalados, sub: "Esperando agente", icon: AlertCircle, color: "amber", subIcon: AlertCircle },
    { label: "Casos hoy", value: casosHoyTotal, sub: `${casosHoyIa} por IA`, icon: TrendingUp, color: "brand", subIcon: TrendingUp },
    { label: "Resueltos hoy", value: casosHoyResueltos, sub: `${tasaEscalacion}% escalación`, icon: CheckCircle2, color: "emerald", subIcon: CheckCircle2 },
  ];

  const kpiColor: Record<string, { border: string; bg: string; text: string; grad: string }> = {
    violet:  { border: "hover:border-violet-500/40",  bg: "bg-violet-500/10 border-violet-500/20 text-violet-500",   text: "text-violet-500",  grad: "from-violet-500/5" },
    amber:   { border: "hover:border-amber-500/40",   bg: "bg-amber-500/10 border-amber-500/20 text-amber-500",      text: "text-amber-500",   grad: "from-amber-500/5" },
    brand:   { border: "hover:border-brand-500/40",   bg: "bg-brand-500/10 border-brand-500/20 text-brand-500",      text: "text-brand-500",   grad: "from-brand-500/5" },
    emerald: { border: "hover:border-emerald-500/40", bg: "bg-emerald-500/10 border-emerald-500/20 text-emerald-500", text: "text-emerald-500", grad: "from-emerald-500/5" },
  };

  const capabilities = [
    { icon: FileText, title: "RAG sobre Manuales", desc: "Búsqueda semántica con embeddings", color: "violet" },
    { icon: Globe, title: "Búsqueda Web", desc: "Google Search Grounding en tiempo real", color: "blue" },
    { icon: Eye, title: "Visión de Archivos", desc: "Analiza imágenes, video y documentos", color: "cyan" },
    { icon: Package, title: "Inventario Inteligente", desc: "Búsqueda fuzzy en cartera Sekunet", color: "emerald" },
    { icon: ArrowUpRight, title: "Escalación N2", desc: "Detección automática y etiquetado", color: "amber" },
    { icon: Clock, title: "Horario de Atención", desc: "Costa Rica · L-V 7:30–17:00", color: "rose" },
    { icon: Sparkles, title: "Aprendizaje Continuo", desc: "Resume y guarda en RAG cada caso al cerrar", color: "indigo" },
    { icon: Brain, title: "Prompt del Sistema", desc: `${promptLen.toLocaleString()} caracteres activos`, color: "violet" },
  ];

  const edgeFunctions = [
    { name: "ia-agent", desc: "Procesa mensajes · RAG · escalación" },
    { name: "seka-whatsapp", desc: "Recibe y responde WhatsApp" },
    { name: "seka-widget", desc: "Atiende el widget web" },
    { name: "auto-close", desc: "Cierra casos por inactividad" },
    { name: "learn-case", desc: "Aprendizaje obligatorio al cerrar" },
    { name: "send-transcript", desc: "Transcripción por email al cerrar" },
  ];

  const colorMap: Record<string, string> = {
    violet: "bg-violet-500/10 text-violet-500 border-violet-500/20",
    blue:   "bg-blue-500/10 text-blue-500 border-blue-500/20",
    cyan:   "bg-cyan-500/10 text-cyan-500 border-cyan-500/20",
    emerald:"bg-emerald-500/10 text-emerald-500 border-emerald-500/20",
    amber:  "bg-amber-500/10 text-amber-500 border-amber-500/20",
    rose:   "bg-rose-500/10 text-rose-500 border-rose-500/20",
    indigo: "bg-indigo-500/10 text-indigo-500 border-indigo-500/20",
  };

  return (
    <div className="max-w-7xl mx-auto p-6 lg:p-8 space-y-8">

      {/* ── HEADER ──────────────────────────────────────────────────────────── */}
      <header className="relative overflow-hidden rounded-3xl border border-border bg-card p-6 lg:p-8">
        <div className="absolute -top-24 -right-24 h-64 w-64 rounded-full bg-violet-500/10 blur-3xl" />
        <div className="absolute -bottom-32 -left-32 h-64 w-64 rounded-full bg-indigo-500/5 blur-3xl" />
        <div className="relative flex flex-col lg:flex-row lg:items-end justify-between gap-5">
          <div>
            <p className="text-xs font-bold uppercase tracking-[0.2em] text-violet-500 mb-2">Plataforma · Inteligencia Artificial</p>
            <h1 className="text-3xl lg:text-4xl font-black tracking-tight flex items-center gap-3">
              <span className="inline-flex h-12 w-12 items-center justify-center rounded-2xl bg-gradient-to-br from-violet-500 to-indigo-600 shadow-lg shadow-violet-500/30">
                <Bot className="h-6 w-6 text-white" />
              </span>
              Asistente Virtual
            </h1>
            <p className="text-muted-foreground mt-2 text-sm max-w-2xl">
              Sistema experto de conocimiento y atención con RAG sobre manuales, visión multimodal y escalación automática a N2.
            </p>
          </div>
          <div className="flex flex-col items-start lg:items-end gap-3 shrink-0">
            <div className={`flex items-center gap-2 px-3.5 py-2 rounded-full border text-xs font-bold ${estado.cls}`}>
              <span className={`h-1.5 w-1.5 rounded-full ${estado.dot} ${estado.pulse ? "animate-pulse" : ""}`} />
              {estado.label}
            </div>
          </div>
        </div>
      </header>

      {/* ── KPIs ────────────────────────────────────────────────────────────── */}
      <section className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {kpis.map(k => {
          const c = kpiColor[k.color];
          return (
            <div key={k.label}
              className={`group relative overflow-hidden rounded-2xl border border-border bg-card p-5 ${c.border} transition-all duration-300`}>
              <div className={`absolute inset-0 bg-gradient-to-br ${c.grad} to-transparent opacity-0 group-hover:opacity-100 transition-opacity`} />
              <div className="relative flex items-start justify-between">
                <div>
                  <p className="text-[11px] font-semibold uppercase tracking-widest text-muted-foreground">{k.label}</p>
                  <p className="text-4xl font-black mt-2 tabular-nums">{k.value}</p>
                  <p className="text-xs text-muted-foreground mt-1.5 flex items-center gap-1">
                    <k.subIcon className={`h-3 w-3 ${c.text}`} /> {k.sub}
                  </p>
                </div>
                <div className={`h-11 w-11 rounded-2xl border grid place-items-center shrink-0 ${c.bg}`}>
                  <k.icon className="h-5 w-5" />
                </div>
              </div>
            </div>
          );
        })}
      </section>

      {/* ── MODO NO ATENDIDO ────────────────────────────────────────────────── */}
      <UnattendedModeToggle initialValue={modoNoAtendido} />

      {/* ── PROVEEDORES Y MODELOS ───────────────────────────────────────────── */}
      <AiConfigPanel />

      {/* ── CHAT DE ENTRENAMIENTO ───────────────────────────────────────────── */}
      <MetaAgentChat
        isSuperadmin={isSuperadmin}
        initialPrompt={agentConfig?.system_prompt || `Usted es el Asistente Virtual, agente de soporte técnico especializado de Sekunet.
Atienda al cliente de forma profesional, breve y sin emojis.
Trate siempre de usted. No invente información técnica.

TAGS DEL SISTEMA:
- [BUSCAR_INVENTARIO: marca modelo]
- [BUSCAR_WEB: consulta]

FLUJO:
1. Pida marca y modelo
2. Use [BUSCAR_INVENTARIO: marca modelo] exactamente
3. Si se encuentra: continúe con diagnóstico
4. Si NO se encuentra: "Lamentablemente [marca/modelo] no se encuentra entre los equipos a los que brindamos soporte técnico."
5. Cierre con: "Que tenga un excelente día."`}
      />

      {/* ── CAPACIDADES + EDGE FUNCTIONS ────────────────────────────────────── */}
      <div className="grid gap-6 lg:grid-cols-2">
        <section className="rounded-2xl border border-border bg-card p-6">
          <h2 className="text-sm font-bold uppercase tracking-widest text-muted-foreground mb-5 flex items-center gap-2">
            <Brain className="h-4 w-4" /> Capacidades del Asistente
          </h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {capabilities.map((cap, i) => (
              <div key={i} className={`flex items-start gap-3 p-3.5 rounded-xl border ${colorMap[cap.color]}`}>
                <cap.icon className="h-4 w-4 mt-0.5 shrink-0" />
                <div className="min-w-0">
                  <p className="text-xs font-semibold leading-tight">{cap.title}</p>
                  <p className="text-[11px] opacity-70 mt-0.5 leading-tight">{cap.desc}</p>
                </div>
              </div>
            ))}
          </div>
        </section>

        <section className="rounded-2xl border border-border bg-card p-6">
          <h2 className="text-sm font-bold uppercase tracking-widest text-muted-foreground mb-5 flex items-center gap-2">
            <Zap className="h-4 w-4" /> Edge Functions
          </h2>
          <div className="space-y-2.5">
            {edgeFunctions.map((fn, i) => (
              <div key={i} className="flex items-center justify-between p-3.5 rounded-xl bg-muted/40 border border-border hover:bg-muted/70 transition-colors">
                <div className="flex items-center gap-3 min-w-0">
                  <div className="h-8 w-8 rounded-lg bg-emerald-500/10 border border-emerald-500/20 grid place-items-center shrink-0">
                    <CheckCircle2 className="h-4 w-4 text-emerald-500" />
                  </div>
                  <div className="min-w-0">
                    <p className="text-sm font-semibold font-mono truncate">{fn.name}</p>
                    <p className="text-[11px] text-muted-foreground truncate">{fn.desc}</p>
                  </div>
                </div>
                <span className="text-[10px] font-bold px-2.5 py-1 rounded-full bg-emerald-500/10 text-emerald-500 border border-emerald-500/20 shrink-0">
                  Activa
                </span>
              </div>
            ))}
          </div>
        </section>
      </div>
    </div>
  );
}
