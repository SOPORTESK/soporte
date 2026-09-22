"use client";

import * as React from "react";
import { 
  MessageCircle, 
  MessageSquare, 
  Send, 
  Globe, 
  Smartphone, 
  CheckCircle2, 
  Activity, 
  Clock, 
  Zap, 
  Copy, 
  ExternalLink, 
  ShieldCheck, 
  Sliders, 
  Key, 
  Sparkles, 
  ChevronDown, 
  ChevronUp, 
  Save, 
  RefreshCw,
  Info,
  ShieldAlert,
  Terminal,
  Code
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/avatar";
import { toast } from "sonner";
import { EvolutionConfigPanel } from "@/components/admin/evolution-config-panel";
import { WhatsAppQRConnect } from "@/components/admin/whatsapp-qr-connect";
import type { SekChannel } from "@/lib/types";
import type { AllChannelsStats, ChannelStatsSummary } from "@/app/(admin)/admin/canales/page";

type ChannelTab = "whatsapp" | "widget" | "messenger" | "telegram";

interface ChannelsClientProps {
  channels: SekChannel[];
  stats: AllChannelsStats;
}

export function ChannelsClient({ channels, stats }: ChannelsClientProps) {
  const [activeTab, setActiveTab] = React.useState<ChannelTab>("whatsapp");
  const [showLegacyChannels, setShowLegacyChannels] = React.useState(false);

  // Tabs metadata
  const tabs = [
    {
      id: "whatsapp" as ChannelTab,
      label: "WhatsApp",
      badge: "Activo",
      badgeVariant: "success" as const,
      icon: MessageCircle,
      activeColor: "from-emerald-500/20 to-teal-500/10 border-emerald-500/40 text-emerald-600 dark:text-emerald-400",
      accent: "text-emerald-600 dark:text-emerald-400",
      stats: stats.whatsapp,
    },
    {
      id: "widget" as ChannelTab,
      label: "Widget Web",
      badge: "Activo",
      badgeVariant: "default" as const,
      icon: Globe,
      activeColor: "from-amber-500/20 to-orange-500/10 border-amber-500/40 text-amber-600 dark:text-amber-400",
      accent: "text-amber-600 dark:text-amber-400",
      stats: stats.widget,
    },
    {
      id: "messenger" as ChannelTab,
      label: "Facebook Messenger",
      badge: "Prevista",
      badgeVariant: "muted" as const,
      icon: MessageSquare,
      activeColor: "from-blue-500/20 to-indigo-500/10 border-blue-500/40 text-blue-600 dark:text-blue-400",
      accent: "text-blue-600 dark:text-blue-400",
      stats: stats.messenger,
    },
    {
      id: "telegram" as ChannelTab,
      label: "Telegram",
      badge: "Prevista",
      badgeVariant: "muted" as const,
      icon: Send,
      activeColor: "from-sky-500/20 to-cyan-500/10 border-sky-500/40 text-sky-600 dark:text-sky-400",
      accent: "text-sky-600 dark:text-sky-400",
      stats: stats.telegram,
    },
  ];

  return (
    <div className="max-w-6xl mx-auto p-4 sm:p-6 lg:p-8 space-y-8">
      {/* ── HEADER ── */}
      <header className="flex flex-col md:flex-row md:items-end justify-between gap-4 border-b border-border/50 pb-6">
        <div>
          <div className="flex items-center gap-2">
            <span className="text-xs font-bold uppercase tracking-[0.2em] text-brand-700 dark:text-brand-300">
              Comunicaciones Multicanal
            </span>
            <span className="inline-flex items-center gap-1 text-[10px] bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 px-2 py-0.5 rounded-full font-semibold">
              <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 animate-pulse" /> Hub Central
            </span>
          </div>
          <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight mt-1.5 flex items-center gap-3">
            Canales de Atención
          </h1>
          <p className="text-sm text-muted-foreground mt-1 max-w-2xl">
            Gestión integral de conectividad, parámetros de integración y métricas de atención en tiempo real por cada canal.
          </p>
        </div>

        {/* Global Channel Badges */}
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-xs font-medium text-muted-foreground mr-1">Canales:</span>
          <span className="inline-flex items-center gap-1.5 text-xs px-2.5 py-1 rounded-lg border border-emerald-500/30 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 font-semibold">
            <MessageCircle className="h-3.5 w-3.5" /> WhatsApp
          </span>
          <span className="inline-flex items-center gap-1.5 text-xs px-2.5 py-1 rounded-lg border border-amber-500/30 bg-amber-500/10 text-amber-600 dark:text-amber-400 font-semibold">
            <Globe className="h-3.5 w-3.5" /> Widget
          </span>
          <span className="inline-flex items-center gap-1.5 text-xs px-2.5 py-1 rounded-lg border border-border/70 bg-muted/40 text-muted-foreground">
            <MessageSquare className="h-3.5 w-3.5" /> Messenger
          </span>
          <span className="inline-flex items-center gap-1.5 text-xs px-2.5 py-1 rounded-lg border border-border/70 bg-muted/40 text-muted-foreground">
            <Send className="h-3.5 w-3.5" /> Telegram
          </span>
        </div>
      </header>

      {/* ── CHANNEL NAVIGATION TABS ── */}
      <nav className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 p-1.5 bg-muted/40 rounded-2xl border border-border/50">
        {tabs.map(tab => {
          const Icon = tab.icon;
          const isSelected = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`flex flex-col sm:flex-row items-center justify-center sm:justify-start gap-2.5 px-4 py-3 rounded-xl font-semibold text-xs sm:text-sm transition-all text-left ${
                isSelected
                  ? `bg-card shadow-sm border ${tab.activeColor}`
                  : "text-muted-foreground hover:text-foreground hover:bg-card/50"
              }`}
            >
              <div className={`h-8 w-8 rounded-lg grid place-items-center shrink-0 ${isSelected ? "bg-primary/10 text-primary" : "bg-muted text-muted-foreground"}`}>
                <Icon className="h-4 w-4" />
              </div>
              <div className="min-w-0 flex-1 text-center sm:text-left">
                <div className="flex items-center justify-center sm:justify-between gap-1.5">
                  <span className="truncate">{tab.label}</span>
                  <Badge variant={tab.badgeVariant} className="text-[9px] px-1.5 py-0">
                    {tab.badge}
                  </Badge>
                </div>
                <p className="text-[10px] text-muted-foreground font-normal hidden sm:block truncate mt-0.5">
                  {tab.stats.total} {tab.stats.total === 1 ? "caso" : "casos"} registrados
                </p>
              </div>
            </button>
          );
        })}
      </nav>

      {/* ── TAB CONTENT: WHATSAPP ── */}
      {activeTab === "whatsapp" && (
        <section className="space-y-6">
          {/* Analytics Banner */}
          <ChannelAnalyticsHeader
            title="WhatsApp (Evolution API)"
            description="Línea oficial de soporte y mensajería en vivo de clientes Sekunet."
            badge="En Línea · Producción"
            badgeVariant="success"
            stats={stats.whatsapp}
            icon={MessageCircle}
            iconBg="bg-emerald-500/10 text-emerald-500"
          />

          {/* Connection and Config Panels */}
          <div className="grid gap-6">
            <WhatsAppQRConnect />
            <EvolutionConfigPanel />
          </div>

          {/* Collapsible Meta Cloud API / Legacy Webhooks */}
          <div className="rounded-2xl border border-border/50 bg-card overflow-hidden transition-all">
            <button
              onClick={() => setShowLegacyChannels(prev => !prev)}
              className="w-full p-4 flex items-center justify-between text-left hover:bg-muted/20 transition-colors"
            >
              <div className="flex items-center gap-2.5">
                <div className="h-7 w-7 rounded-lg bg-blue-500/10 text-blue-500 grid place-items-center">
                  <Code className="h-3.5 w-3.5" />
                </div>
                <div>
                  <h4 className="text-sm font-bold">Meta Cloud API (Webhooks Oficiales y Canales Alternativos)</h4>
                  <p className="text-[11px] text-muted-foreground">Opciones avanzadas para Meta Developers WhatsApp Cloud API directo.</p>
                </div>
              </div>
              {showLegacyChannels ? <ChevronUp className="h-4 w-4 text-muted-foreground" /> : <ChevronDown className="h-4 w-4 text-muted-foreground" />}
            </button>

            {showLegacyChannels && (
              <div className="p-5 border-t border-border/50 bg-muted/10 space-y-4">
                <div className="rounded-xl bg-[hsl(var(--warning)/.08)] border border-[hsl(var(--warning)/.4)] p-4 text-xs flex gap-3">
                  <ShieldAlert className="h-5 w-5 text-[hsl(var(--warning))] shrink-0 mt-0.5" />
                  <div className="space-y-1">
                    <p className="font-semibold text-foreground">Webhook de Meta Cloud API</p>
                    <p className="text-muted-foreground">Si utilizas WhatsApp Cloud API directo de Meta, configura este endpoint en Meta Developers:</p>
                    <CopyableUrl url={`${process.env.NEXT_PUBLIC_SUPABASE_URL}/functions/v1/whatsapp-webhook`} />
                  </div>
                </div>

                {channels.length > 0 && (
                  <div className="space-y-2">
                    <p className="text-xs font-bold text-muted-foreground uppercase tracking-wider">Canales registrados en base de datos:</p>
                    <div className="grid gap-2 sm:grid-cols-2">
                      {channels.map(c => (
                        <div key={c.id} className="p-3 rounded-xl border border-border bg-card flex items-center justify-between">
                          <div>
                            <p className="text-xs font-bold">{c.name}</p>
                            <p className="text-[10px] text-muted-foreground capitalize">{c.kind}</p>
                          </div>
                          <Badge variant={c.is_active ? "success" : "muted"} className="text-[10px]">
                            {c.is_active ? "Activo" : "Inactivo"}
                          </Badge>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        </section>
      )}

      {/* ── TAB CONTENT: WIDGET WEB ── */}
      {activeTab === "widget" && (
        <WidgetChannelView stats={stats.widget} />
      )}

      {/* ── TAB CONTENT: FACEBOOK MESSENGER ── */}
      {activeTab === "messenger" && (
        <MessengerChannelView stats={stats.messenger} />
      )}

      {/* ── TAB CONTENT: TELEGRAM ── */}
      {activeTab === "telegram" && (
        <TelegramChannelView stats={stats.telegram} />
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// COMPONENT: Channel Analytics Header + Cards
// ─────────────────────────────────────────────────────────────────────────────
interface ChannelAnalyticsHeaderProps {
  title: string;
  description: string;
  badge: string;
  badgeVariant: "success" | "muted" | "default" | "warning";
  stats: ChannelStatsSummary;
  icon: React.ComponentType<{ className?: string }>;
  iconBg: string;
}

function ChannelAnalyticsHeader({
  title,
  description,
  badge,
  badgeVariant,
  stats,
  icon: Icon,
  iconBg,
}: ChannelAnalyticsHeaderProps) {
  const formatTime = (minutes: number) => {
    if (!minutes || minutes <= 0) return "—";
    if (minutes < 60) return `${minutes} min`;
    const hrs = Math.floor(minutes / 60);
    const rest = minutes % 60;
    return `${hrs}h ${rest}m`;
  };

  return (
    <div className="space-y-4">
      {/* Overview Banner */}
      <div className="rounded-2xl border border-border/60 bg-card p-5 sm:p-6 flex flex-col sm:flex-row sm:items-center justify-between gap-4 shadow-sm">
        <div className="flex items-start sm:items-center gap-3.5">
          <div className={`h-12 w-12 rounded-2xl ${iconBg} grid place-items-center shrink-0 shadow-inner`}>
            <Icon className="h-6 w-6" />
          </div>
          <div>
            <div className="flex items-center gap-2.5">
              <h2 className="text-lg sm:text-xl font-bold">{title}</h2>
              <Badge variant={badgeVariant} className="text-[10px] px-2 py-0.5">
                {badge}
              </Badge>
            </div>
            <p className="text-xs sm:text-sm text-muted-foreground mt-0.5">{description}</p>
          </div>
        </div>
      </div>

      {/* 4 Analytics KPI Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
        {/* Total Casos */}
        <div className="rounded-2xl border border-border/60 bg-card p-4 sm:p-5 flex flex-col justify-between shadow-xs">
          <div className="flex items-center justify-between text-muted-foreground mb-2">
            <span className="text-xs font-semibold uppercase tracking-wider">Total Casos</span>
            <Activity className="h-4 w-4 text-brand-600 dark:text-brand-400" />
          </div>
          <div>
            <div className="text-2xl sm:text-3xl font-black">{stats.total}</div>
            <p className="text-[11px] text-muted-foreground mt-1">
              +{stats.today} hoy · {stats.last7Days} en 7 días
            </p>
          </div>
        </div>

        {/* Casos Activos */}
        <div className="rounded-2xl border border-border/60 bg-card p-4 sm:p-5 flex flex-col justify-between shadow-xs">
          <div className="flex items-center justify-between text-muted-foreground mb-2">
            <span className="text-xs font-semibold uppercase tracking-wider">En Atención</span>
            <Clock className="h-4 w-4 text-amber-500" />
          </div>
          <div>
            <div className="text-2xl sm:text-3xl font-black text-amber-600 dark:text-amber-400">
              {stats.active}
            </div>
            <p className="text-[11px] text-muted-foreground mt-1">
              Casos en cola o abiertos
            </p>
          </div>
        </div>

        {/* Resueltos & Tasa */}
        <div className="rounded-2xl border border-border/60 bg-card p-4 sm:p-5 flex flex-col justify-between shadow-xs">
          <div className="flex items-center justify-between text-muted-foreground mb-2">
            <span className="text-xs font-semibold uppercase tracking-wider">Resueltos</span>
            <CheckCircle2 className="h-4 w-4 text-emerald-500" />
          </div>
          <div>
            <div className="text-2xl sm:text-3xl font-black text-emerald-600 dark:text-emerald-400">
              {stats.resolved}
            </div>
            <p className="text-[11px] text-muted-foreground mt-1">
              {stats.resolutionRate}% de efectividad
            </p>
          </div>
        </div>

        {/* Promedio Resolución */}
        <div className="rounded-2xl border border-border/60 bg-card p-4 sm:p-5 flex flex-col justify-between shadow-xs">
          <div className="flex items-center justify-between text-muted-foreground mb-2">
            <span className="text-xs font-semibold uppercase tracking-wider">Tiempo Promedio</span>
            <Zap className="h-4 w-4 text-sky-500" />
          </div>
          <div>
            <div className="text-2xl sm:text-3xl font-black text-sky-600 dark:text-sky-400">
              {formatTime(stats.avgResolutionMinutes)}
            </div>
            <p className="text-[11px] text-muted-foreground mt-1">
              Duración media de cierre
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// COMPONENT: Widget Web View & Config
// ─────────────────────────────────────────────────────────────────────────────
function WidgetChannelView({ stats }: { stats: ChannelStatsSummary }) {
  const [config, setConfig] = React.useState({
    title: "Soporte Técnico Sekunet",
    subtitle: "Atención en línea inmediata",
    primaryColor: "#f97316",
    welcomeMessage: "¡Hola! ¿En qué podemos ayudarte hoy?",
  });
  const [loading, setLoading] = React.useState(true);
  const [saving, setSaving] = React.useState(false);

  React.useEffect(() => {
    fetch("/api/admin/channels/config?channel=widget")
      .then(r => r.json())
      .then(d => {
        if (d.success && d.config && Object.keys(d.config).length > 0) {
          setConfig(prev => ({ ...prev, ...d.config }));
        }
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const handleSave = async () => {
    setSaving(true);
    try {
      const res = await fetch("/api/admin/channels/config", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ channel: "widget", config }),
      });
      const data = await res.json();
      if (!res.ok || !data.success) throw new Error(data?.error || "Error al guardar");
      toast.success("Configuración del widget web guardada correctamente.");
    } catch (e: any) {
      toast.error(e?.message || "Error al guardar configuración");
    } finally {
      setSaving(false);
    }
  };

  const origin = typeof window !== "undefined" ? window.location.origin : "";
  const embedSnippet = `<script src="${origin}/widget-launcher.html" async></script>`;

  return (
    <section className="space-y-6">
      <ChannelAnalyticsHeader
        title="Widget Web Sekunet"
        description="Burbuja flotante de chat para sitios web, portales corporativos o intranet."
        badge="Activo · Embebible"
        badgeVariant="default"
        stats={stats}
        icon={Globe}
        iconBg="bg-amber-500/10 text-amber-500"
      />

      {/* Integration & Preview Box */}
      <div className="grid gap-6 lg:grid-cols-12">
        {/* Left column: Embed Code & Actions */}
        <div className="lg:col-span-7 space-y-6">
          <div className="rounded-2xl border border-border/60 bg-card p-6 space-y-5">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <div className="h-8 w-8 rounded-lg bg-amber-500/10 text-amber-500 grid place-items-center">
                  <Code className="h-4 w-4" />
                </div>
                <div>
                  <h3 className="text-sm font-bold">Código de Instalación</h3>
                  <p className="text-[11px] text-muted-foreground">Pega este script antes del cierre de la etiqueta &lt;/body&gt; en tu web.</p>
                </div>
              </div>
              <Badge variant="success" className="text-[10px]">Listo para usar</Badge>
            </div>

            <div className="space-y-2">
              <CopyableUrl url={embedSnippet} />
              <p className="text-[11px] text-muted-foreground">
                El widget se sincroniza automáticamente con el sistema de atención, bot IA y cola de técnicos.
              </p>
            </div>

            <div className="pt-2 flex flex-wrap gap-2.5">
              <a
                href="/widget-launcher.html"
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-semibold bg-amber-500 text-white hover:bg-amber-600 transition-colors shadow-sm"
              >
                <ExternalLink className="h-3.5 w-3.5" /> Probar Launcher Flotante
              </a>
              <a
                href="/widget-standalone.html"
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-semibold bg-muted hover:bg-muted/80 text-foreground transition-colors border border-border/60"
              >
                <ExternalLink className="h-3.5 w-3.5" /> Modo Standalone
              </a>
            </div>
          </div>

          {/* Endpoints & API Reference */}
          <div className="rounded-2xl border border-border/60 bg-card p-6 space-y-4">
            <h4 className="text-xs font-bold uppercase tracking-wider text-muted-foreground flex items-center gap-2">
              <Terminal className="h-3.5 w-3.5" /> Endpoints del Widget
            </h4>
            <div className="space-y-2 text-xs font-mono">
              <div className="p-2.5 rounded-lg bg-muted/40 border border-border/40 flex items-center justify-between">
                <span className="text-amber-500 font-bold">POST</span>
                <span className="text-muted-foreground">/api/widget/session</span>
                <span className="text-[10px] text-muted-foreground">Inicia sesión de cliente</span>
              </div>
              <div className="p-2.5 rounded-lg bg-muted/40 border border-border/40 flex items-center justify-between">
                <span className="text-emerald-500 font-bold">POST</span>
                <span className="text-muted-foreground">/api/widget/message</span>
                <span className="text-[10px] text-muted-foreground">Envía mensaje al caso</span>
              </div>
              <div className="p-2.5 rounded-lg bg-muted/40 border border-border/40 flex items-center justify-between">
                <span className="text-sky-500 font-bold">GET</span>
                <span className="text-muted-foreground">/api/widget/messages</span>
                <span className="text-[10px] text-muted-foreground">Recibe historial en vivo</span>
              </div>
            </div>
          </div>
        </div>

        {/* Right column: Appearance & Personalization */}
        <div className="lg:col-span-5 space-y-6">
          <div className="rounded-2xl border border-border/60 bg-card p-6 space-y-4">
            <div className="flex items-center gap-2.5 mb-2">
              <div className="h-8 w-8 rounded-lg bg-primary/10 text-primary grid place-items-center">
                <Sliders className="h-4 w-4" />
              </div>
              <div>
                <h3 className="text-sm font-bold">Personalización Visual</h3>
                <p className="text-[11px] text-muted-foreground">Configuración de texto y apariencia del chat.</p>
              </div>
            </div>

            <div className="space-y-3">
              <div>
                <label className="text-xs font-medium text-muted-foreground block mb-1">Título de la cabecera</label>
                <Input
                  value={config.title}
                  onChange={e => setConfig(prev => ({ ...prev, title: e.target.value }))}
                  placeholder="Ej: Soporte Sekunet"
                  className="h-9 text-xs"
                />
              </div>

              <div>
                <label className="text-xs font-medium text-muted-foreground block mb-1">Subtítulo / Estado</label>
                <Input
                  value={config.subtitle}
                  onChange={e => setConfig(prev => ({ ...prev, subtitle: e.target.value }))}
                  placeholder="Ej: Atención inmediata"
                  className="h-9 text-xs"
                />
              </div>

              <div>
                <label className="text-xs font-medium text-muted-foreground block mb-1">Color Principal (Hex)</label>
                <div className="flex items-center gap-2">
                  <input
                    type="color"
                    value={config.primaryColor}
                    onChange={e => setConfig(prev => ({ ...prev, primaryColor: e.target.value }))}
                    className="h-9 w-9 rounded-lg border border-border cursor-pointer bg-transparent"
                  />
                  <Input
                    value={config.primaryColor}
                    onChange={e => setConfig(prev => ({ ...prev, primaryColor: e.target.value }))}
                    placeholder="#f97316"
                    className="h-9 text-xs font-mono"
                  />
                </div>
              </div>

              <div>
                <label className="text-xs font-medium text-muted-foreground block mb-1">Mensaje de Bienvenida</label>
                <textarea
                  value={config.welcomeMessage}
                  onChange={e => setConfig(prev => ({ ...prev, welcomeMessage: e.target.value }))}
                  rows={3}
                  className="w-full text-xs rounded-xl border border-input bg-background p-2.5 resize-none focus:outline-none focus:ring-1 focus:ring-primary"
                  placeholder="Mensaje que verá el cliente al abrir el chat..."
                />
              </div>
            </div>

            <Button
              onClick={handleSave}
              disabled={saving || loading}
              className="w-full text-xs font-semibold gap-2 mt-2"
            >
              {saving ? <RefreshCw className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />}
              {saving ? "Guardando..." : "Guardar Personalización"}
            </Button>
          </div>
        </div>
      </div>
    </section>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// COMPONENT: Facebook Messenger View & Config (Prevista)
// ─────────────────────────────────────────────────────────────────────────────
function MessengerChannelView({ stats }: { stats: ChannelStatsSummary }) {
  const [config, setConfig] = React.useState({
    pageId: "",
    appId: "",
    appSecret: "",
    pageAccessToken: "",
    verifyToken: "sekunet_fb_token_2026",
  });
  const [loading, setLoading] = React.useState(true);
  const [saving, setSaving] = React.useState(false);

  React.useEffect(() => {
    fetch("/api/admin/channels/config?channel=messenger")
      .then(r => r.json())
      .then(d => {
        if (d.success && d.config && Object.keys(d.config).length > 0) {
          setConfig(prev => ({ ...prev, ...d.config }));
        }
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const handleSave = async () => {
    setSaving(true);
    try {
      const res = await fetch("/api/admin/channels/config", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ channel: "messenger", config }),
      });
      const data = await res.json();
      if (!res.ok || !data.success) throw new Error(data?.error || "Error al guardar");
      toast.success("Parámetros de Messenger guardados en la prevista.");
    } catch (e: any) {
      toast.error(e?.message || "Error al guardar");
    } finally {
      setSaving(false);
    }
  };

  const origin = typeof window !== "undefined" ? window.location.origin : "";
  const webhookUrl = `${origin}/api/webhooks/messenger`;

  return (
    <section className="space-y-6">
      <ChannelAnalyticsHeader
        title="Facebook Messenger"
        description="Canal previsto para integración con páginas oficiales de Facebook vía Meta Graph API."
        badge="Prevista · Próxima Activación"
        badgeVariant="muted"
        stats={stats}
        icon={MessageSquare}
        iconBg="bg-blue-500/10 text-blue-500"
      />

      <div className="grid gap-6 lg:grid-cols-12">
        {/* Left: Configuration Form */}
        <div className="lg:col-span-7 space-y-6">
          <div className="rounded-2xl border border-border/60 bg-card p-6 space-y-5">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <div className="h-8 w-8 rounded-lg bg-blue-500/10 text-blue-500 grid place-items-center">
                  <Key className="h-4 w-4" />
                </div>
                <div>
                  <h3 className="text-sm font-bold">Credenciales de Meta Graph API</h3>
                  <p className="text-[11px] text-muted-foreground">Configuración para conectar tu página y recibir mensajes.</p>
                </div>
              </div>
              <Badge variant="muted" className="text-[10px]">Prevista</Badge>
            </div>

            <div className="space-y-3.5">
              <div>
                <label className="text-xs font-medium text-muted-foreground block mb-1">Page ID de Facebook</label>
                <Input
                  value={config.pageId}
                  onChange={e => setConfig(prev => ({ ...prev, pageId: e.target.value }))}
                  placeholder="Ej: 108273645892100"
                  className="h-9 text-xs font-mono"
                />
              </div>

              <div className="grid sm:grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-medium text-muted-foreground block mb-1">App ID</label>
                  <Input
                    value={config.appId}
                    onChange={e => setConfig(prev => ({ ...prev, appId: e.target.value }))}
                    placeholder="Ej: 987654321012345"
                    className="h-9 text-xs font-mono"
                  />
                </div>
                <div>
                  <label className="text-xs font-medium text-muted-foreground block mb-1">App Secret</label>
                  <Input
                    type="password"
                    value={config.appSecret}
                    onChange={e => setConfig(prev => ({ ...prev, appSecret: e.target.value }))}
                    placeholder="••••••••••••••••"
                    className="h-9 text-xs font-mono"
                  />
                </div>
              </div>

              <div>
                <label className="text-xs font-medium text-muted-foreground block mb-1">Page Access Token (Permanente)</label>
                <Input
                  type="password"
                  value={config.pageAccessToken}
                  onChange={e => setConfig(prev => ({ ...prev, pageAccessToken: e.target.value }))}
                  placeholder="EAA..."
                  className="h-9 text-xs font-mono"
                />
              </div>

              <div>
                <label className="text-xs font-medium text-muted-foreground block mb-1">Verify Token del Webhook</label>
                <Input
                  value={config.verifyToken}
                  onChange={e => setConfig(prev => ({ ...prev, verifyToken: e.target.value }))}
                  placeholder="sekunet_verify_token"
                  className="h-9 text-xs font-mono"
                />
              </div>
            </div>

            <Button
              onClick={handleSave}
              disabled={saving || loading}
              className="w-full text-xs font-semibold gap-2 mt-2 bg-blue-600 hover:bg-blue-700 text-white"
            >
              {saving ? <RefreshCw className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />}
              {saving ? "Guardando..." : "Guardar Parámetros de Prevista"}
            </Button>
          </div>
        </div>

        {/* Right: Webhook Callback & Guide */}
        <div className="lg:col-span-5 space-y-6">
          <div className="rounded-2xl border border-border/60 bg-card p-6 space-y-4">
            <h4 className="text-xs font-bold uppercase tracking-wider text-muted-foreground flex items-center gap-2">
              <ShieldCheck className="h-3.5 w-3.5 text-blue-500" /> Webhook de Callback Previsto
            </h4>
            <p className="text-xs text-muted-foreground">
              Este es el URL que registrarás en Facebook Developer Console cuando se realice el pase a producción:
            </p>
            <CopyableUrl url={webhookUrl} />

            <div className="pt-3 border-t border-border/50 space-y-2.5 text-xs text-muted-foreground">
              <p className="font-semibold text-foreground">Pasos para la puesta en marcha:</p>
              <ol className="list-decimal list-inside space-y-1.5 pl-1">
                <li>Crear una App tipo "Negocios" en developers.facebook.com.</li>
                <li>Agregar el producto Messenger y suscribir la página.</li>
                <li>Pegar la URL del webhook y el Verify Token configurado.</li>
                <li>Suscribirse a los eventos <code>messages</code> y <code>messaging_postbacks</code>.</li>
              </ol>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// COMPONENT: Telegram View & Config (Prevista)
// ─────────────────────────────────────────────────────────────────────────────
function TelegramChannelView({ stats }: { stats: ChannelStatsSummary }) {
  const [config, setConfig] = React.useState({
    botToken: "",
    botUsername: "",
  });
  const [loading, setLoading] = React.useState(true);
  const [saving, setSaving] = React.useState(false);

  React.useEffect(() => {
    fetch("/api/admin/channels/config?channel=telegram")
      .then(r => r.json())
      .then(d => {
        if (d.success && d.config && Object.keys(d.config).length > 0) {
          setConfig(prev => ({ ...prev, ...d.config }));
        }
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const handleSave = async () => {
    setSaving(true);
    try {
      const res = await fetch("/api/admin/channels/config", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ channel: "telegram", config }),
      });
      const data = await res.json();
      if (!res.ok || !data.success) throw new Error(data?.error || "Error al guardar");
      toast.success("Parámetros de Telegram guardados en la prevista.");
    } catch (e: any) {
      toast.error(e?.message || "Error al guardar");
    } finally {
      setSaving(false);
    }
  };

  const origin = typeof window !== "undefined" ? window.location.origin : "";
  const webhookUrl = `${origin}/api/webhooks/telegram`;

  return (
    <section className="space-y-6">
      <ChannelAnalyticsHeader
        title="Telegram Bot"
        description="Canal previsto para atención al cliente y notificaciones automáticas por bot de Telegram."
        badge="Prevista · Próxima Activación"
        badgeVariant="muted"
        stats={stats}
        icon={Send}
        iconBg="bg-sky-500/10 text-sky-500"
      />

      <div className="grid gap-6 lg:grid-cols-12">
        {/* Left: Configuration Form */}
        <div className="lg:col-span-7 space-y-6">
          <div className="rounded-2xl border border-border/60 bg-card p-6 space-y-5">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <div className="h-8 w-8 rounded-lg bg-sky-500/10 text-sky-500 grid place-items-center">
                  <Send className="h-4 w-4" />
                </div>
                <div>
                  <h3 className="text-sm font-bold">Credenciales de Telegram Bot API</h3>
                  <p className="text-[11px] text-muted-foreground">Configuración para vincular el bot de Telegram con Sekunet.</p>
                </div>
              </div>
              <Badge variant="muted" className="text-[10px]">Prevista</Badge>
            </div>

            <div className="space-y-3.5">
              <div>
                <label className="text-xs font-medium text-muted-foreground block mb-1">Bot Token (proporcionado por @BotFather)</label>
                <Input
                  type="password"
                  value={config.botToken}
                  onChange={e => setConfig(prev => ({ ...prev, botToken: e.target.value }))}
                  placeholder="123456789:ABCdefGHIjklmNOPqrstUVWxyz"
                  className="h-9 text-xs font-mono"
                />
              </div>

              <div>
                <label className="text-xs font-medium text-muted-foreground block mb-1">Nombre de Usuario del Bot (@username)</label>
                <Input
                  value={config.botUsername}
                  onChange={e => setConfig(prev => ({ ...prev, botUsername: e.target.value }))}
                  placeholder="@SekunetSupportBot"
                  className="h-9 text-xs"
                />
              </div>
            </div>

            <Button
              onClick={handleSave}
              disabled={saving || loading}
              className="w-full text-xs font-semibold gap-2 mt-2 bg-sky-600 hover:bg-sky-700 text-white"
            >
              {saving ? <RefreshCw className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />}
              {saving ? "Guardando..." : "Guardar Parámetros de Telegram"}
            </Button>
          </div>
        </div>

        {/* Right: Webhook Callback & Guide */}
        <div className="lg:col-span-5 space-y-6">
          <div className="rounded-2xl border border-border/60 bg-card p-6 space-y-4">
            <h4 className="text-xs font-bold uppercase tracking-wider text-muted-foreground flex items-center gap-2">
              <ShieldCheck className="h-3.5 w-3.5 text-sky-500" /> Webhook de Callback Previsto
            </h4>
            <p className="text-xs text-muted-foreground">
              Endpoint para registrar con <code>setWebhook</code> en Telegram Bot API:
            </p>
            <CopyableUrl url={webhookUrl} />

            <div className="pt-3 border-t border-border/50 space-y-2 text-xs text-muted-foreground">
              <p className="font-semibold text-foreground">Cómo obtener tu bot en 1 minuto:</p>
              <ol className="list-decimal list-inside space-y-1.5 pl-1">
                <li>Abre Telegram y busca el contacto oficial <strong>@BotFather</strong>.</li>
                <li>Envía el comando <code>/newbot</code> y sigue los pasos en pantalla.</li>
                <li>Copia el <strong>HTTP API Token</strong> generado y pégalo aquí.</li>
                <li>¡Listo! El canal quedará enlazado con la bandeja de entrada.</li>
              </ol>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// COMPONENT: Copyable URL Box
// ─────────────────────────────────────────────────────────────────────────────
function CopyableUrl({ url }: { url: string }) {
  return (
    <div className="flex items-center gap-2 rounded-xl bg-muted/60 border border-border/50 p-2 text-xs">
      <code className="flex-1 truncate font-mono text-foreground px-1">{url}</code>
      <button
        onClick={() => {
          navigator.clipboard.writeText(url);
          toast.success("Copiado al portapapeles");
        }}
        className="p-1.5 rounded-lg hover:bg-background transition-colors text-muted-foreground hover:text-foreground shrink-0"
        title="Copiar"
        aria-label="Copiar"
      >
        <Copy className="h-3.5 w-3.5" />
      </button>
    </div>
  );
}
