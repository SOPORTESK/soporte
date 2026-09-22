"use client";

import * as React from "react";
import { 
  MessageCircle, 
  MessageSquare, 
  Send, 
  Globe, 
  Instagram,
  CheckCircle2, 
  Activity, 
  Clock, 
  Zap, 
  Copy, 
  ExternalLink, 
  ShieldCheck, 
  Sliders, 
  Key, 
  ChevronDown, 
  ChevronUp, 
  Save, 
  RefreshCw,
  ShieldAlert,
  Terminal,
  Code,
  Radio,
  Server,
  Link2
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/avatar";
import { toast } from "sonner";
import { EvolutionConfigPanel } from "@/components/admin/evolution-config-panel";
import { WhatsAppQRConnect } from "@/components/admin/whatsapp-qr-connect";
import type { SekChannel } from "@/lib/types";
import type { AllChannelsStats, ChannelStatsSummary } from "@/app/(admin)/admin/canales/page";

type ChannelTab = "whatsapp" | "widget" | "telegram" | "messenger" | "instagram";

interface ChannelsClientProps {
  channels: SekChannel[];
  stats: AllChannelsStats;
}

export function ChannelsClient({ channels, stats }: ChannelsClientProps) {
  const [activeTab, setActiveTab] = React.useState<ChannelTab>("whatsapp");
  const [showLegacyChannels, setShowLegacyChannels] = React.useState(false);

  // Tabs metadata con los 5 canales
  const tabs = [
    {
      id: "whatsapp" as ChannelTab,
      label: "WhatsApp",
      subtitle: "Evolution API & QR",
      badge: "Activo",
      badgeVariant: "success" as const,
      icon: MessageCircle,
      activeColor: "from-emerald-500/15 via-emerald-500/10 to-teal-500/5 border-emerald-500/40 text-emerald-600 dark:text-emerald-400 shadow-sm",
      iconBg: "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400",
      stats: stats.whatsapp,
    },
    {
      id: "widget" as ChannelTab,
      label: "Widget Web",
      subtitle: "Chat embebible en sitio",
      badge: "Activo",
      badgeVariant: "default" as const,
      icon: Globe,
      activeColor: "from-amber-500/15 via-amber-500/10 to-orange-500/5 border-amber-500/40 text-amber-600 dark:text-amber-400 shadow-sm",
      iconBg: "bg-amber-500/15 text-amber-600 dark:text-amber-400",
      stats: stats.widget,
    },
    {
      id: "telegram" as ChannelTab,
      label: "Telegram",
      subtitle: "Vía Chatwoot / Bot",
      badge: "Listo para sync",
      badgeVariant: "default" as const,
      icon: Send,
      activeColor: "from-sky-500/15 via-sky-500/10 to-cyan-500/5 border-sky-500/40 text-sky-600 dark:text-sky-400 shadow-sm",
      iconBg: "bg-sky-500/15 text-sky-600 dark:text-sky-400",
      stats: stats.telegram,
    },
    {
      id: "messenger" as ChannelTab,
      label: "Messenger",
      subtitle: "Vía Chatwoot / Meta",
      badge: "Listo para sync",
      badgeVariant: "default" as const,
      icon: MessageSquare,
      activeColor: "from-blue-500/15 via-blue-500/10 to-indigo-500/5 border-blue-500/40 text-blue-600 dark:text-blue-400 shadow-sm",
      iconBg: "bg-blue-500/15 text-blue-600 dark:text-blue-400",
      stats: stats.messenger,
    },
    {
      id: "instagram" as ChannelTab,
      label: "Instagram",
      subtitle: "Vía Chatwoot / DMs",
      badge: "Listo para sync",
      badgeVariant: "default" as const,
      icon: Instagram,
      activeColor: "from-fuchsia-500/15 via-pink-500/10 to-rose-500/5 border-pink-500/40 text-pink-600 dark:text-pink-400 shadow-sm",
      iconBg: "bg-pink-500/15 text-pink-600 dark:text-pink-400",
      stats: stats.instagram || { total: 0, active: 0, resolved: 0, resolutionRate: 0, today: 0, last7Days: 0, avgResolutionMinutes: 0 },
    },
  ];

  return (
    <div className="max-w-[1400px] mx-auto p-4 md:p-6 xl:p-8 space-y-6">
      {/* ── HEADER PREMIUM ── */}
      <header className="relative overflow-hidden rounded-3xl border border-border/60 bg-gradient-to-br from-card via-card to-muted/20 p-6 lg:p-8">
        <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
          <div className="space-y-1.5 max-w-3xl">
            <div className="flex items-center gap-2">
              <span className="text-xs font-bold uppercase tracking-[0.2em] text-brand-700 dark:text-brand-300">
                Comunicaciones Multicanal
              </span>
              <span className="inline-flex items-center gap-1.5 text-[10px] bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 px-2.5 py-0.5 rounded-full font-semibold border border-emerald-500/20">
                <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 animate-pulse" /> Hub Central Operativo
              </span>
            </div>
            <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight">
              Canales de Atención
            </h1>
            <p className="text-sm text-muted-foreground leading-relaxed">
              Configuración técnica, sincronización omnicanal con Chatwoot y analíticas de desempeño en tiempo real.
            </p>
          </div>

          {/* Estado general del motor */}
          <div className="flex items-center gap-3 shrink-0 self-start lg:self-center">
            <div className="rounded-2xl border border-border/60 bg-card/80 backdrop-blur-xs px-4 py-2.5 flex items-center gap-3">
              <div className="h-9 w-9 rounded-xl bg-emerald-500/10 text-emerald-500 grid place-items-center">
                <Radio className="h-4 w-4 animate-pulse" />
              </div>
              <div>
                <p className="text-[11px] font-bold text-foreground">Motor de Mensajería</p>
                <p className="text-[10px] text-emerald-500 font-semibold">Enrutamiento Activo</p>
              </div>
            </div>
          </div>
        </div>
      </header>

      {/* ── PESTAÑAS PRINCIPALES (5 CANALES BALANCEADOS) ── */}
      <nav className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
        {tabs.map(tab => {
          const Icon = tab.icon;
          const isSelected = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`p-4 rounded-2xl border transition-all text-left flex items-start gap-3 relative overflow-hidden ${
                isSelected
                  ? `bg-gradient-to-br ${tab.activeColor} border-2`
                  : "bg-card border-border/60 hover:border-border hover:bg-muted/30"
              }`}
            >
              <div className={`h-9 w-9 rounded-xl grid place-items-center shrink-0 ${tab.iconBg}`}>
                <Icon className="h-4 w-4" />
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex items-center justify-between gap-1.5">
                  <span className="font-bold text-xs sm:text-sm text-foreground truncate">{tab.label}</span>
                  <Badge variant={tab.badgeVariant} className="text-[9px] px-1.5 py-0 shrink-0">
                    {tab.badge}
                  </Badge>
                </div>
                <p className="text-[11px] text-muted-foreground mt-0.5 truncate">{tab.subtitle}</p>
                <div className="mt-2 pt-1.5 border-t border-border/40 flex items-center justify-between text-[10px] text-muted-foreground">
                  <span>Registrados:</span>
                  <span className="font-semibold text-foreground">{tab.stats.total}</span>
                </div>
              </div>
            </button>
          );
        })}
      </nav>

      {/* ── TAB CONTENT: WHATSAPP (INTOCABLE) ── */}
      {activeTab === "whatsapp" && (
        <section className="space-y-6">
          {/* Analytics Banner */}
          <ChannelAnalyticsHeader
            title="WhatsApp (Evolution API)"
            description="Línea oficial de soporte y mensajería en vivo para clientes Sekunet."
            badge="En Línea · Producción"
            badgeVariant="success"
            stats={stats.whatsapp}
            icon={MessageCircle}
            iconBg="bg-emerald-500/10 text-emerald-500"
          />

          {/* 2 Columnas balanceadas lado a lado */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6 items-stretch">
            <WhatsAppQRConnect />
            <EvolutionConfigPanel />
          </div>

          {/* Opciones avanzadas colapsables de Meta Cloud API */}
          <div className="rounded-2xl border border-border/60 bg-card overflow-hidden">
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

      {/* ── TAB CONTENT: TELEGRAM (VÍA CHATWOOT) ── */}
      {activeTab === "telegram" && (
        <ChatwootChannelView
          channelKey="telegram"
          channelName="Telegram Bot"
          channelDescription="Atención al cliente y notificaciones automáticas por Telegram sincronizado con Chatwoot."
          icon={Send}
          iconBg="bg-sky-500/10 text-sky-500"
          accentColor="text-sky-600 dark:text-sky-400"
          btnBg="bg-sky-600 hover:bg-sky-700 text-white"
          stats={stats.telegram}
          guideSteps={[
            "En Telegram, hable con @BotFather y cree su bot con el comando /newbot.",
            "En su panel de Chatwoot: vaya a Ajustes → Bandejas → Nueva Bandeja → Seleccione 'Telegram'.",
            "Pegue el Token del bot en Chatwoot. Chatwoot le asignará un Inbox ID (ej: 2).",
            "En Chatwoot: Ajustes → Integraciones → Webhooks → Pegue el URL de Webhook de Sekunet.",
          ]}
        />
      )}

      {/* ── TAB CONTENT: FACEBOOK MESSENGER (VÍA CHATWOOT) ── */}
      {activeTab === "messenger" && (
        <ChatwootChannelView
          channelKey="messenger"
          channelName="Facebook Messenger"
          channelDescription="Mensajería directa con tus páginas oficiales de Facebook sincronizado con Chatwoot."
          icon={MessageSquare}
          iconBg="bg-blue-500/10 text-blue-500"
          accentColor="text-blue-600 dark:text-blue-400"
          btnBg="bg-blue-600 hover:bg-blue-700 text-white"
          stats={stats.messenger}
          guideSteps={[
            "En su panel de Chatwoot: vaya a Ajustes → Bandejas → Nueva Bandeja → Seleccione 'Facebook'.",
            "Inicie sesión con su cuenta de Facebook y seleccione la Fan Page oficial.",
            "Chatwoot creará la bandeja y le otorgará un Inbox ID (ej: 3).",
            "En Chatwoot: Ajustes → Integraciones → Webhooks → Pegue el URL de Webhook de Sekunet para sincronizar.",
          ]}
        />
      )}

      {/* ── TAB CONTENT: INSTAGRAM (VÍA CHATWOOT) ── */}
      {activeTab === "instagram" && (
        <ChatwootChannelView
          channelKey="instagram"
          channelName="Instagram Direct"
          channelDescription="Recepción y respuesta a mensajes directos (DMs) de Instagram sincronizado con Chatwoot."
          icon={Instagram}
          iconBg="bg-pink-500/10 text-pink-500"
          accentColor="text-pink-600 dark:text-pink-400"
          btnBg="bg-gradient-to-r from-pink-600 to-rose-600 hover:from-pink-700 hover:to-rose-700 text-white"
          stats={stats.instagram || { total: 0, active: 0, resolved: 0, resolutionRate: 0, today: 0, last7Days: 0, avgResolutionMinutes: 0 }}
          guideSteps={[
            "Asegúrese de que su cuenta de Instagram sea Profesional o Comercial y esté vinculada a su Fan Page de Facebook.",
            "En Chatwoot: vaya a Ajustes → Bandejas → Nueva Bandeja → Seleccione 'Instagram' (o canal Facebook con DMs).",
            "Autorice los permisos de mensajería y copie el Inbox ID generado.",
            "En Chatwoot: Ajustes → Integraciones → Webhooks → Registre el Webhook de Sekunet.",
          ]}
        />
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// COMPONENT: Channel Analytics Header + 4 KPI Cards
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
      <div className="rounded-2xl border border-border/60 bg-card p-5 sm:p-6 flex flex-col sm:flex-row sm:items-center justify-between gap-4 shadow-xs">
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
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Total Casos */}
        <div className="rounded-2xl border border-border/60 bg-card p-5 flex flex-col justify-between shadow-xs">
          <div className="flex items-center justify-between text-muted-foreground mb-3">
            <span className="text-xs font-semibold uppercase tracking-wider">Total Casos</span>
            <Activity className="h-4 w-4 text-brand-600 dark:text-brand-400" />
          </div>
          <div>
            <div className="text-2xl sm:text-3xl font-black">{stats.total}</div>
            <p className="text-xs text-muted-foreground mt-1">
              +{stats.today} hoy · {stats.last7Days} en 7 días
            </p>
          </div>
        </div>

        {/* Casos Activos */}
        <div className="rounded-2xl border border-border/60 bg-card p-5 flex flex-col justify-between shadow-xs">
          <div className="flex items-center justify-between text-muted-foreground mb-3">
            <span className="text-xs font-semibold uppercase tracking-wider">En Atención</span>
            <Clock className="h-4 w-4 text-amber-500" />
          </div>
          <div>
            <div className="text-2xl sm:text-3xl font-black text-amber-600 dark:text-amber-400">
              {stats.active}
            </div>
            <p className="text-xs text-muted-foreground mt-1">
              Casos en cola o abiertos
            </p>
          </div>
        </div>

        {/* Resueltos & Tasa */}
        <div className="rounded-2xl border border-border/60 bg-card p-5 flex flex-col justify-between shadow-xs">
          <div className="flex items-center justify-between text-muted-foreground mb-3">
            <span className="text-xs font-semibold uppercase tracking-wider">Resueltos</span>
            <CheckCircle2 className="h-4 w-4 text-emerald-500" />
          </div>
          <div>
            <div className="text-2xl sm:text-3xl font-black text-emerald-600 dark:text-emerald-400">
              {stats.resolved}
            </div>
            <p className="text-xs text-muted-foreground mt-1">
              {stats.resolutionRate}% de efectividad
            </p>
          </div>
        </div>

        {/* Promedio Resolución */}
        <div className="rounded-2xl border border-border/60 bg-card p-5 flex flex-col justify-between shadow-xs">
          <div className="flex items-center justify-between text-muted-foreground mb-3">
            <span className="text-xs font-semibold uppercase tracking-wider">Tiempo Promedio</span>
            <Zap className="h-4 w-4 text-sky-500" />
          </div>
          <div>
            <div className="text-2xl sm:text-3xl font-black text-sky-600 dark:text-sky-400">
              {formatTime(stats.avgResolutionMinutes)}
            </div>
            <p className="text-xs text-muted-foreground mt-1">
              Duración media de cierre
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// COMPONENT: Universal Chatwoot Channel View (Telegram, Messenger, Instagram)
// ─────────────────────────────────────────────────────────────────────────────
interface ChatwootChannelViewProps {
  channelKey: "telegram" | "messenger" | "instagram";
  channelName: string;
  channelDescription: string;
  icon: React.ComponentType<{ className?: string }>;
  iconBg: string;
  accentColor: string;
  btnBg: string;
  stats: ChannelStatsSummary;
  guideSteps: string[];
}

function ChatwootChannelView({
  channelKey,
  channelName,
  channelDescription,
  icon: Icon,
  iconBg,
  btnBg,
  stats,
  guideSteps,
}: ChatwootChannelViewProps) {
  const [config, setConfig] = React.useState({
    chatwootUrl: "http://129.146.7.74:3000",
    apiToken: "",
    accountId: "1",
    inboxId: "",
  });
  const [loading, setLoading] = React.useState(true);
  const [saving, setSaving] = React.useState(false);
  const [testing, setTesting] = React.useState(false);

  React.useEffect(() => {
    fetch(`/api/admin/channels/config?channel=${channelKey}`)
      .then(r => r.json())
      .then(d => {
        if (d.success && d.config && Object.keys(d.config).length > 0) {
          setConfig(prev => ({ ...prev, ...d.config }));
        }
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [channelKey]);

  const handleSave = async () => {
    setSaving(true);
    try {
      const res = await fetch("/api/admin/channels/config", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ channel: channelKey, config }),
      });
      const data = await res.json();
      if (!res.ok || !data.success) throw new Error(data?.error || "Error al guardar");
      toast.success(`Parámetros de ${channelName} guardados correctamente.`);
    } catch (e: any) {
      toast.error(e?.message || "Error al guardar configuración");
    } finally {
      setSaving(false);
    }
  };

  const handleTestConnection = async () => {
    setTesting(true);
    try {
      const res = await fetch("/api/admin/chatwoot/test-connection", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          url: config.chatwootUrl,
          apiToken: config.apiToken,
          accountId: config.accountId,
        }),
      });
      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data?.error || "No se pudo conectar con el servidor Chatwoot.");
      }
      toast.success("¡Conexión verificada con éxito con Chatwoot!");
    } catch (e: any) {
      toast.error(e?.message || "Error al conectar con Chatwoot");
    } finally {
      setTesting(false);
    }
  };

  const origin = typeof window !== "undefined" ? window.location.origin : "";
  const webhookUrl = `${origin}/api/webhooks/chatwoot`;

  return (
    <section className="space-y-6">
      <ChannelAnalyticsHeader
        title={`${channelName} (vía Chatwoot)`}
        description={channelDescription}
        badge="Listo para Sincronizar"
        badgeVariant="default"
        stats={stats}
        icon={Icon}
        iconBg={iconBg}
      />

      {/* 2 Columnas balanceadas lado a lado */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6 items-stretch">
        {/* Columna 1: Configuración de Chatwoot para este canal */}
        <div className="rounded-2xl border border-border/60 bg-card p-6 space-y-5 h-full flex flex-col justify-between">
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <div className="h-8 w-8 rounded-lg bg-primary/10 text-primary grid place-items-center">
                  <Server className="h-4 w-4" />
                </div>
                <div>
                  <h3 className="text-sm font-bold">Conexión con Chatwoot</h3>
                  <p className="text-[11px] text-muted-foreground">Servidor en Oracle Cloud y bandeja de {channelName}.</p>
                </div>
              </div>
              <Badge variant="success" className="text-[10px]">Oracle Cloud</Badge>
            </div>

            <div className="space-y-3.5">
              <div>
                <label className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground mb-1 block">
                  URL del Servidor en Oracle Cloud
                </label>
                <Input
                  value={config.chatwootUrl}
                  onChange={e => setConfig(prev => ({ ...prev, chatwootUrl: e.target.value }))}
                  placeholder="http://129.146.7.74:3000 o https://chatwoot.sekunet.com"
                  className="h-9 text-xs font-mono"
                />
              </div>

              <div>
                <label className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground mb-1 block">
                  Chatwoot User API Access Token
                </label>
                <Input
                  type="password"
                  value={config.apiToken}
                  onChange={e => setConfig(prev => ({ ...prev, apiToken: e.target.value }))}
                  placeholder="Token de Chatwoot (Ajustes de Perfil → Access Token)"
                  className="h-9 text-xs font-mono"
                />
              </div>

              <div className="grid sm:grid-cols-2 gap-3">
                <div>
                  <label className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground mb-1 block">
                    Account ID
                  </label>
                  <Input
                    value={config.accountId}
                    onChange={e => setConfig(prev => ({ ...prev, accountId: e.target.value }))}
                    placeholder="1"
                    className="h-9 text-xs font-mono"
                  />
                </div>
                <div>
                  <label className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground mb-1 block">
                    Inbox ID ({channelName})
                  </label>
                  <Input
                    value={config.inboxId}
                    onChange={e => setConfig(prev => ({ ...prev, inboxId: e.target.value }))}
                    placeholder="Ej: 2"
                    className="h-9 text-xs font-mono"
                  />
                </div>
              </div>
            </div>
          </div>

          <div className="pt-2 flex flex-col sm:flex-row gap-2.5">
            <Button
              onClick={handleSave}
              disabled={saving || loading}
              className={`flex-1 text-xs font-semibold gap-2 ${btnBg}`}
            >
              {saving ? <RefreshCw className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />}
              {saving ? "Guardando..." : "Guardar Parámetros"}
            </Button>
            <Button
              onClick={handleTestConnection}
              disabled={testing || !config.chatwootUrl}
              variant="outline"
              className="text-xs font-semibold gap-2"
            >
              {testing ? <RefreshCw className="h-3.5 w-3.5 animate-spin" /> : <Link2 className="h-3.5 w-3.5" />}
              {testing ? "Probando..." : "Probar Conexión"}
            </Button>
          </div>
        </div>

        {/* Columna 2: Webhook de Sekunet & Guía de Activación */}
        <div className="rounded-2xl border border-border/60 bg-card p-6 space-y-4 h-full flex flex-col justify-between">
          <div className="space-y-4">
            <div className="flex items-center gap-2.5">
              <div className="h-8 w-8 rounded-lg bg-emerald-500/10 text-emerald-500 grid place-items-center">
                <ShieldCheck className="h-4 w-4" />
              </div>
              <div>
                <h3 className="text-sm font-bold">Webhook de Sekunet para Chatwoot</h3>
                <p className="text-[11px] text-muted-foreground">Endpoint que recibirá los mensajes entrantes de {channelName}.</p>
              </div>
            </div>

            <p className="text-xs text-muted-foreground">
              En tu panel de Chatwoot ve a <strong>Ajustes → Integraciones → Webhooks</strong> y registra esta URL:
            </p>
            <CopyableUrl url={webhookUrl} />

            <div className="pt-2 space-y-2 text-xs text-muted-foreground">
              <p className="font-semibold text-foreground">Pasos para dejarlo sincronizado en 2 minutos:</p>
              <ol className="list-decimal list-inside space-y-1.5 pl-1 leading-relaxed">
                {guideSteps.map((step, idx) => (
                  <li key={idx}>{step}</li>
                ))}
              </ol>
            </div>
          </div>

          <div className="p-3 rounded-xl bg-muted/40 border border-border/40 text-[11px] text-muted-foreground flex items-center justify-between">
            <span>Flujo: Cliente → Chatwoot → Webhook Sekunet → Panel Agentes</span>
            <span className="h-2 w-2 rounded-full bg-emerald-500 animate-pulse" />
          </div>
        </div>
      </div>
    </section>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// COMPONENT: Widget Web View & Config (2 Columnas)
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
        description="Burbuja flotante de chat para sitios web corporativos o intranet."
        badge="Activo · Embebible"
        badgeVariant="default"
        stats={stats}
        icon={Globe}
        iconBg="bg-amber-500/10 text-amber-500"
      />

      {/* 2 Columnas balanceadas */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6 items-stretch">
        {/* Columna 1: Código de instalación y API */}
        <div className="space-y-6">
          <div className="rounded-2xl border border-border/60 bg-card p-6 space-y-5">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <div className="h-8 w-8 rounded-lg bg-amber-500/10 text-amber-500 grid place-items-center">
                  <Code className="h-4 w-4" />
                </div>
                <div>
                  <h3 className="text-sm font-bold">Código de Instalación</h3>
                  <p className="text-[11px] text-muted-foreground">Pega este script antes del cierre de &lt;/body&gt; en tu sitio web.</p>
                </div>
              </div>
              <Badge variant="success" className="text-[10px]">Listo para usar</Badge>
            </div>

            <div className="space-y-2">
              <CopyableUrl url={embedSnippet} />
              <p className="text-[11px] text-muted-foreground">
                El widget se conecta en tiempo real con la bandeja de entrada y el sistema de agentes.
              </p>
            </div>

            <div className="pt-2 flex flex-wrap gap-3">
              <a
                href="/widget-launcher.html"
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-semibold bg-amber-500 text-white hover:bg-amber-600 transition-colors shadow-xs"
              >
                <ExternalLink className="h-3.5 w-3.5" /> Probar Launcher Flotante
              </a>
              <a
                href="/widget-standalone.html"
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-semibold bg-muted hover:bg-muted/80 text-foreground transition-colors border border-border/60"
              >
                <ExternalLink className="h-3.5 w-3.5" /> Modo Pantalla Completa
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
                <span className="text-[10px] text-muted-foreground">Inicia sesión</span>
              </div>
              <div className="p-2.5 rounded-lg bg-muted/40 border border-border/40 flex items-center justify-between">
                <span className="text-emerald-500 font-bold">POST</span>
                <span className="text-muted-foreground">/api/widget/message</span>
                <span className="text-[10px] text-muted-foreground">Envía mensaje</span>
              </div>
              <div className="p-2.5 rounded-lg bg-muted/40 border border-border/40 flex items-center justify-between">
                <span className="text-sky-500 font-bold">GET</span>
                <span className="text-muted-foreground">/api/widget/messages</span>
                <span className="text-[10px] text-muted-foreground">Historial en vivo</span>
              </div>
            </div>
          </div>
        </div>

        {/* Columna 2: Personalización visual */}
        <div className="space-y-6">
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

            <div className="space-y-3.5">
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
                <div className="flex items-center gap-2.5">
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
