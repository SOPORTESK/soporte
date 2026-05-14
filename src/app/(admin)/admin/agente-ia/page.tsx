import { createClient } from "@/lib/supabase/server";
import { Bot, Brain, FileText, Clock, AlertCircle, Zap, Globe, Eye, Package, ArrowUpRight, CheckCircle2, Activity, Sparkles } from "lucide-react";
import nextDynamic from "next/dynamic";

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
    .select("system_prompt, nombre, apellido")
    .eq("email", "system_prompt@sekunet.com")
    .maybeSingle();

  const { data: cases } = await supabase
    .from("sek_cases")
    .select("estado, canal")
    .in("estado", ["ia_atendiendo", "escalado"]);

  const iaAtendiendo = cases?.filter(c => c.estado === "ia_atendiendo").length || 0;
  const escalados = cases?.filter(c => c.estado === "escalado").length || 0;

  const capabilities = [
    { icon: FileText, title: "RAG sobre Manuales", desc: "Búsqueda semántica con embeddings", color: "violet" },
    { icon: Globe, title: "Búsqueda Web", desc: "Gemini 3.1 Flash Lite · Info en tiempo real", color: "blue" },
    { icon: Eye, title: "Visión de Archivos", desc: "Analiza imágenes, video y documentos", color: "cyan" },
    { icon: Package, title: "Inventario Inteligente", desc: "Búsqueda fuzzy en cartera Sekunet", color: "emerald" },
    { icon: ArrowUpRight, title: "Escalación N2", desc: "Detección automática y etiquetado", color: "amber" },
    { icon: Clock, title: "Horario de Atención", desc: "Costa Rica · L-V 7:30–17:00", color: "rose" },
    { icon: Sparkles, title: "Aprendizaje Continuo", desc: "Resume y guarda en RAG cada caso al cerrar", color: "indigo" },
  ];

  const edgeFunctions = [
    { name: "ia-agent", desc: "Procesa mensajes · RAG · escalación" },
    { name: "auto-close", desc: "Cierra casos por inactividad (5 min)" },
    { name: "learn-case", desc: "Aprendizaje obligatorio al cerrar (Regla Inmutable)" },
    { name: "send-transcript", desc: "Transcripción por email al cerrar" },
    { name: "whatsapp-webhook", desc: "Recibe y responde WhatsApp" },
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

      {/* Header */}
      <header className="flex flex-col sm:flex-row sm:items-end justify-between gap-4">
        <div>
          <p className="text-xs font-bold uppercase tracking-[0.2em] text-violet-500 mb-1">Plataforma · IA</p>
          <h1 className="text-3xl font-bold flex items-center gap-3">
            <span className="inline-flex h-10 w-10 items-center justify-center rounded-2xl bg-gradient-to-br from-violet-500 to-indigo-600 shadow-lg shadow-violet-500/30">
              <Bot className="h-5 w-5 text-white" />
            </span>
            Agente IA — SEKA
          </h1>
          <p className="text-muted-foreground mt-1 text-sm">
            Sistema Experto de Conocimiento y Atención · Gemini 3.1 Flash Lite con RAG sobre manuales
          </p>
        </div>
        <div className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-emerald-500/10 border border-emerald-500/20 text-emerald-500 text-xs font-semibold w-fit">
          <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 animate-pulse" />
          Sistema Operativo
        </div>
      </header>

      {/* KPI Strip */}
      <section className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {/* IA Atendiendo + Estado online */}
        <div className="group relative overflow-hidden rounded-2xl border border-border bg-card p-5 hover:border-violet-500/40 transition-all duration-300">
          <div className="absolute inset-0 bg-gradient-to-br from-violet-500/5 to-transparent opacity-0 group-hover:opacity-100 transition-opacity" />
          <div className="flex items-start justify-between relative">
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-widest text-muted-foreground">Activos IA</p>
              <p className="text-4xl font-black mt-2 tabular-nums">{iaAtendiendo}</p>
              <p className="text-xs text-muted-foreground mt-1.5 flex items-center gap-1">
                <Activity className="h-3 w-3 text-violet-500" /> Atendiendo ahora
              </p>
            </div>
            <div className="flex flex-col items-end gap-2">
              <div className="h-11 w-11 rounded-2xl bg-violet-500/10 border border-violet-500/20 text-violet-500 grid place-items-center">
                <Brain className="h-5 w-5" />
              </div>
              <div className="flex items-center gap-1.5 text-[10px] font-bold px-2 py-1 rounded-full border bg-emerald-500/10 border-emerald-500/20 text-emerald-500">
                <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 animate-pulse" />
                En línea
              </div>
            </div>
          </div>
        </div>

        {/* Escalados */}
        <div className="group relative overflow-hidden rounded-2xl border border-border bg-card p-5 hover:border-amber-500/40 transition-all duration-300">
          <div className="absolute inset-0 bg-gradient-to-br from-amber-500/5 to-transparent opacity-0 group-hover:opacity-100 transition-opacity" />
          <div className="flex items-start justify-between relative">
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-widest text-muted-foreground">Escalados</p>
              <p className="text-4xl font-black mt-2 tabular-nums">{escalados}</p>
              <p className="text-xs text-muted-foreground mt-1.5 flex items-center gap-1">
                <AlertCircle className="h-3 w-3 text-amber-500" /> Esperando agente
              </p>
            </div>
            <div className="h-11 w-11 rounded-2xl bg-amber-500/10 border border-amber-500/20 text-amber-500 grid place-items-center">
              <AlertCircle className="h-5 w-5" />
            </div>
          </div>
        </div>

        {/* Modelo */}
        <div className="group relative overflow-hidden rounded-2xl border border-border bg-card p-5 hover:border-indigo-500/40 transition-all duration-300">
          <div className="absolute inset-0 bg-gradient-to-br from-indigo-500/5 to-transparent opacity-0 group-hover:opacity-100 transition-opacity" />
          <div className="flex items-start justify-between relative">
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-widest text-muted-foreground">Motor IA</p>
              <p className="text-lg font-black mt-2 leading-tight">Gemini<br/>3.1 Flash Lite</p>
              <p className="text-xs text-muted-foreground mt-1.5 flex items-center gap-1">
                <Zap className="h-3 w-3 text-indigo-500" /> Google AI Studio
              </p>
            </div>
            <div className="h-11 w-11 rounded-2xl bg-indigo-500/10 border border-indigo-500/20 text-indigo-500 grid place-items-center">
              <Zap className="h-5 w-5" />
            </div>
          </div>
        </div>

        {/* Visión */}
        <div className="group relative overflow-hidden rounded-2xl border border-border bg-card p-5 hover:border-cyan-500/40 transition-all duration-300">
          <div className="absolute inset-0 bg-gradient-to-br from-cyan-500/5 to-transparent opacity-0 group-hover:opacity-100 transition-opacity" />
          <div className="flex items-start justify-between relative">
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-widest text-muted-foreground">Visión</p>
              <p className="text-lg font-black mt-2 leading-tight">Gemini<br/>3.1 Flash Lite</p>
              <p className="text-xs text-muted-foreground mt-1.5 flex items-center gap-1">
                <Eye className="h-3 w-3 text-cyan-500" /> Imágenes · Archivos
              </p>
            </div>
            <div className="h-11 w-11 rounded-2xl bg-cyan-500/10 border border-cyan-500/20 text-cyan-500 grid place-items-center">
              <Eye className="h-5 w-5" />
            </div>
          </div>
        </div>
      </section>

      {/* Chat de entrenamiento — zona principal */}
      <MetaAgentChat
        isSuperadmin={isSuperadmin}
        initialPrompt={agentConfig?.system_prompt || `Usted es SEKA, el agente de soporte técnico especializado de Sekunet.
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

      {/* Capacidades + Edge Functions */}
      <div className="grid gap-6 lg:grid-cols-2">

        {/* Capacidades */}
        <section className="rounded-2xl border border-border bg-card p-6">
          <h2 className="text-sm font-bold uppercase tracking-widest text-muted-foreground mb-5 flex items-center gap-2">
            <Brain className="h-4 w-4" /> Capacidades de SEKA
          </h2>
          <div className="grid grid-cols-2 gap-3">
            {capabilities.map((cap, i) => (
              <div key={i} className={`flex items-start gap-3 p-3.5 rounded-xl border ${colorMap[cap.color]} bg-opacity-5`}>
                <cap.icon className="h-4 w-4 mt-0.5 shrink-0" />
                <div>
                  <p className="text-xs font-semibold leading-tight">{cap.title}</p>
                  <p className="text-[11px] opacity-70 mt-0.5 leading-tight">{cap.desc}</p>
                </div>
              </div>
            ))}
          </div>
        </section>

        {/* Edge Functions */}
        <section className="rounded-2xl border border-border bg-card p-6">
          <h2 className="text-sm font-bold uppercase tracking-widest text-muted-foreground mb-5 flex items-center gap-2">
            <Zap className="h-4 w-4" /> Edge Functions
          </h2>
          <div className="space-y-2.5">
            {edgeFunctions.map((fn, i) => (
              <div key={i} className="flex items-center justify-between p-3.5 rounded-xl bg-muted/40 border border-border hover:bg-muted/70 transition-colors">
                <div className="flex items-center gap-3">
                  <div className="h-8 w-8 rounded-lg bg-emerald-500/10 border border-emerald-500/20 grid place-items-center">
                    <CheckCircle2 className="h-4 w-4 text-emerald-500" />
                  </div>
                  <div>
                    <p className="text-sm font-semibold font-mono">{fn.name}</p>
                    <p className="text-[11px] text-muted-foreground">{fn.desc}</p>
                  </div>
                </div>
                <span className="text-[10px] font-bold px-2.5 py-1 rounded-full bg-emerald-500/10 text-emerald-500 border border-emerald-500/20">
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
