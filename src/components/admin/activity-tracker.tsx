"use client";

import React, { useState, useEffect, useCallback } from "react";
import { toast } from "sonner";
import {
  Activity,
  Clock,
  TrendingUp,
  RefreshCw,
  Settings,
  Mail,
  MessageSquare,
  Wrench,
  FolderOpen,
  AlertCircle,
  Bot,
  Eye,
  Phone,
  ShieldCheck,
  Code,
  Camera,
  Flame,
  Monitor,
  Sparkles,
  Calendar,
  Users,
  Filter,
  Search,
  CheckCircle2,
  ChevronRight,
  Laptop,
} from "lucide-react";
import { Avatar } from "@/components/ui/avatar";
import { ActivityLivePulse, type LiveAgent } from "./activity-live-pulse";
import { ActivityHeatmap } from "./activity-heatmap";
import { ActivityAppsRanking } from "./activity-apps-ranking";
import { ActivityScreenGallery } from "./activity-screen-gallery";
import { ActivityAiBriefing } from "./activity-ai-briefing";

interface TimelineEntry {
  id: number;
  agent_email: string;
  agent_name: string;
  action: string;
  category: string;
  case_id: string | null;
  metadata: Record<string, any> | null;
  duration_ms: number | null;
  created_at: string;
}

interface Props {
  agentEmail?: string;
  agentName?: string;
  isAdmin?: boolean;
}

const CATEGORY_ICONS: Record<string, any> = {
  "Atención telefónica": Phone,
  "Mensajería": MessageSquare,
  "Atención de tickets": FolderOpen,
  "Trámites de garantías": ShieldCheck,
  "Investigación y desarrollo": Code,
  "Labores manuales": Wrench,
  "Gestión de correos": Mail,
  "Gestión de casos": FolderOpen,
  "Escalado": AlertCircle,
  "Asistente IA": Bot,
  "Inactividad": Clock,
  "Navegación": Eye,
  "Actividad general": Activity,
  "Soporte técnico": Wrench,
  "Otros": Activity,
};

const CATEGORY_COLORS: Record<string, string> = {
  "Atención telefónica": "text-orange-400 bg-orange-500/10 border-orange-500/20",
  "Mensajería": "text-emerald-400 bg-emerald-500/10 border-emerald-500/20",
  "Atención de tickets": "text-blue-400 bg-blue-500/10 border-blue-500/20",
  "Trámites de garantías": "text-purple-400 bg-purple-500/10 border-purple-500/20",
  "Investigación y desarrollo": "text-cyan-400 bg-cyan-500/10 border-cyan-500/20",
  "Labores manuales": "text-amber-400 bg-amber-500/10 border-amber-500/20",
  "Gestión de correos": "text-yellow-400 bg-yellow-500/10 border-yellow-500/20",
  "Gestión de casos": "text-emerald-400 bg-emerald-500/10 border-emerald-500/20",
  "Escalado": "text-red-400 bg-red-500/10 border-red-500/20",
  "Asistente IA": "text-cyan-400 bg-cyan-500/10 border-cyan-500/20",
  "Inactividad": "text-zinc-400 bg-zinc-500/10 border-zinc-500/20",
  "Navegación": "text-sky-400 bg-sky-500/10 border-sky-500/20",
  "Actividad general": "text-indigo-400 bg-indigo-500/10 border-indigo-500/20",
  "Soporte técnico": "text-amber-400 bg-amber-500/10 border-amber-500/20",
  "Otros": "text-slate-400 bg-slate-500/10 border-slate-500/20",
};

function formatTime(ts: string): string {
  if (!ts) return "";
  const d = new Date(ts);
  if (isNaN(d.getTime())) return "";
  return d.toLocaleTimeString("es-CR", { hour: "2-digit", minute: "2-digit", second: "2-digit" });
}

function formatDuration(ms: number | null): string {
  if (!ms) return "";
  const totalSec = Math.round(ms / 1000);
  if (totalSec < 60) return `${totalSec}s`;
  const m = Math.floor(totalSec / 60);
  const s = totalSec % 60;
  if (m < 60) return `${m}m ${s}s`;
  const h = Math.floor(m / 60);
  const remM = m % 60;
  return `${h}h ${remM}m`;
}

function cleanExecutiveTitle(title: string): string {
  if (!title) return "";
  return title
    .replace(/\s*[-–—]\s*(Brave|Google Chrome|Microsoft Edge|Firefox|Opera|Outlook|Visual Studio Code).*$/i, "")
    .replace(/^\(\d+\)\s*/, "")
    .replace(/\.exe/gi, "")
    .replace(/atenci[óo]n/gi, "atención")
    .replace(/garant[íi]a/gi, "garantía")
    .replace(/gesti[óo]n/gi, "gestión")
    .replace(/operaci[óo]n/gi, "operación")
    .replace(/\uFFFD/g, "ó")
    .trim();
}

function formatExecutiveDisplay(rawAction: string, category: string, meta: Record<string, any> = {}): { title: string; subtitle?: string } {
  let action = rawAction || "";
  const rawTitle = meta.title || meta.context || "";
  const cleanTitle = cleanExecutiveTitle(rawTitle);

  // 1. Extraer duración si existe
  let durStr = "";
  const durMatch = action.match(/\((\d+(?:\s*(?:s|min|m|h|segundos|minutos))?)\)/i);
  if (durMatch) durStr = ` (${durMatch[1]})`;
  else if (meta.duration_ms) durStr = ` (${formatDuration(meta.duration_ms)})`;

  const lower = action.toLowerCase();
  const titleLower = cleanTitle.toLowerCase();
  const appLower = (meta.app || meta.app_name || "").toLowerCase();

  // 2. Videovigilancia y CCTV (iVMS-4200, SADP, Hik-Partner)
  if (lower.includes("ivms") || titleLower.includes("ivms") || appLower.includes("ivms") || lower.includes("sadp") || lower.includes("hik-partner")) {
    return {
      title: `Monitoreo de sistemas de videovigilancia y gestión de cámaras mediante iVMS-4200 / SADP${durStr}`,
      subtitle: cleanTitle || "Configuración y verificación de dispositivos CCTV",
    };
  }

  // 3. Captura de evidencia (Herramienta de Recortes / SnippingTool)
  if (lower.includes("snipping") || lower.includes("recorte") || titleLower.includes("recorte") || appLower.includes("snipping")) {
    return {
      title: `Uso de la herramienta de recortes para captura y documentación de evidencia técnica${durStr}`,
      subtitle: cleanTitle || "Documentación visual para caso de soporte",
    };
  }

  // 4. Control de asistencia y marcas (Nextime, BioTime, ZKTime)
  if (lower.includes("nextime") || lower.includes("biotime") || lower.includes("zktime") || titleLower.includes("nextime") || titleLower.includes("biotime") || lower.includes("bitacora-automatica")) {
    return {
      title: `Consulta y gestión de registros de asistencia de personal en plataforma de control horario${durStr}`,
      subtitle: cleanTitle || "Sistema de marcas y control horario",
    };
  }

  // 5. Atención y tickets en Odoo ERP
  if (lower.includes("odoo") || titleLower.includes("odoo") || appLower.includes("odoo")) {
    const caseMatch = action.match(/#(\d+)/) || cleanTitle.match(/#(\d+)/);
    const num = caseMatch ? ` #${caseMatch[1]}` : "";
    return {
      title: `Atención, seguimiento y resolución de tickets en portal Odoo ERP${num}${durStr}`,
      subtitle: cleanTitle ? `Detalle: ${cleanTitle}` : "Gestión de soporte técnico y órdenes",
    };
  }

  // 6. Mensajería y Chat (WhatsApp, Sekunet Chat)
  if (lower.includes("whatsapp") || titleLower.includes("whatsapp") || appLower.includes("whatsapp")) {
    return {
      title: `Atención y comunicación con usuarios o equipo de trabajo a través de WhatsApp${durStr}`,
      subtitle: cleanTitle ? `Contacto / Chat: ${cleanTitle}` : "Canal de mensajería externa",
    };
  }
  if (lower.includes("seka chat") || lower.includes("chat sekunet") || appLower.includes("seka") || lower.includes("evolution")) {
    return {
      title: `Atención al cliente y soporte técnico mediante plataforma Sekunet Chat${durStr}`,
      subtitle: cleanTitle || "Gestión de mensajería omnicanal de soporte",
    };
  }

  // 7. Redes y Equipos (MikroTik, Winbox, UniFi, GNS3)
  if (lower.includes("winbox") || lower.includes("mikrotik") || lower.includes("unifi") || lower.includes("gns3")) {
    return {
      title: `Administración, diagnóstico y configuración de infraestructura de red y telecomunicaciones${durStr}`,
      subtitle: cleanTitle || "Gestión de equipos de red y enlaces",
    };
  }

  // 8. Trámites de Garantías y RMA (Tienda 3D)
  if (lower.includes("tienda 3d") || lower.includes("tienda3d") || lower.includes("garant") || lower.includes("rma")) {
    return {
      title: `Gestión y tramitación de garantías técnicas y recepción de equipos RMA en Tienda 3D${durStr}`,
      subtitle: cleanTitle || "Servicio técnico y trámite de garantías",
    };
  }

  // 9. Correo electrónico (Outlook)
  if (lower.includes("outlook") || lower.includes("correo") || appLower.includes("outlook")) {
    return {
      title: `Gestión de mensajería electrónica y correspondencia corporativa en Outlook${durStr}`,
      subtitle: cleanTitle ? `Asunto: ${cleanTitle}` : "Bandeja de entrada corporativa",
    };
  }

  // 10. Documentos de oficina (Word, Excel, PDF)
  if (lower.includes("excel") || appLower.includes("excel") || lower.includes("antenas.xlsx")) {
    return {
      title: `Control administrativo, análisis y elaboración de hojas de cálculo en Microsoft Excel${durStr}`,
      subtitle: cleanTitle ? `Archivo: ${cleanTitle}` : "Registro de datos y control administrativo",
    };
  }
  if (lower.includes("word") || appLower.includes("word") || lower.includes(".docx")) {
    return {
      title: `Redacción, revisión y edición de informes técnicos y documentación en Microsoft Word${durStr}`,
      subtitle: cleanTitle ? `Documento: ${cleanTitle}` : "Elaboración de informe técnico",
    };
  }

  // 11. Entornos de desarrollo, programación y herramientas técnicas (Antigravity, Cursor, VS Code, Terminal, Devin)
  if (
    lower.includes("antigravity") ||
    lower.includes("code") ||
    lower.includes("cursor") ||
    lower.includes("windsurf") ||
    lower.includes("devin") ||
    lower.includes("visual studio") ||
    appLower.includes("antigravity") ||
    appLower.includes("code") ||
    category === "Investigación y desarrollo"
  ) {
    return {
      title: `Optimización, programación y desarrollo de software y sistemas técnicos${durStr}`,
      subtitle: cleanTitle || "Herramientas de ingeniería y desarrollo",
    };
  }

  // 12. Páginas internas de la plataforma
  if (action.includes("Permaneció en") || action.includes("Reanudó labores tras")) {
    const isResume = action.includes("Reanudó labores");
    const prefix = isResume ? "Reanudó labores en" : "Sesión activa en";
    if (lower.includes("mi-gestion") || lower.includes("mi bandeja de gestión")) {
      return { title: `${prefix} portal de atención técnica y bandeja de gestión de casos${durStr}` };
    }
    if (lower.includes("admin") || lower.includes("panel admin") || lower.includes("activity tracker")) {
      return { title: `${prefix} suite de supervisión, auditoría y control de actividades${durStr}` };
    }
    if (lower.includes("soporte-avanzado") || lower.includes("soporte avanzado")) {
      return { title: `${prefix} panel de soporte avanzado (Nivel 2) y resolución especializada${durStr}` };
    }
  }

  // 13. Pausas e Inactividad
  if (category === "Inactividad" || lower.includes("sin actividad") || lower.includes("pausa prolongada") || lower.includes("bloqueada")) {
    return {
      title: `Pausa del sistema / Período sin interacción activa en la estación${durStr}`,
      subtitle: cleanTitle ? `Última aplicación en pantalla: ${cleanTitle}` : "Pausa operativa",
    };
  }

  // 14. Formato estructurado preexistente o títulos sueltos (limpieza narrativa final)
  if (action.includes(":")) {
    const parts = action.split(":");
    const prefix = parts[0].trim();
    const detail = parts.slice(1).join(":").trim();
    return {
      title: `${prefix}: ${cleanExecutiveTitle(detail)}${durStr}`,
      subtitle: cleanTitle && cleanTitle !== action ? cleanTitle : undefined,
    };
  }

  return { title: action, subtitle: cleanTitle && cleanTitle !== action ? cleanTitle : undefined };
}

export function ActivityTracker({ agentEmail, agentName, isAdmin = false }: Props) {
  const defaultEmail = agentEmail || "cbatista@sekunet.com";
  const [liveAgents, setLiveAgents] = useState<LiveAgent[]>([]);
  const [selectedAgent, setSelectedAgent] = useState<string | undefined>(defaultEmail);
  const [selectedDate, setSelectedDate] = useState(new Date().toISOString().split("T")[0]);
  const [activeTab, setActiveTab] = useState<"live" | "timeline" | "screenshots" | "apps" | "briefing">("live");

  const [timeline, setTimeline] = useState<TimelineEntry[]>([]);
  const [categoryFilter, setCategoryFilter] = useState<string>("all");
  const [searchFilter, setSearchFilter] = useState<string>("");
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [autoRefreshSec, setAutoRefreshSec] = useState<number>(30);

  // Cargar estado en vivo de agentes
  const fetchLive = useCallback(async () => {
    try {
      const res = await fetch("/api/activity/live");
      const data = await res.json();
      if (data.ok && data.agents) {
        setLiveAgents(data.agents);
        setSelectedAgent((prev) => {
          if (prev) return prev;
          const found = data.agents.find((a: LiveAgent) => a.email.toLowerCase() === defaultEmail.toLowerCase());
          return found ? found.email : data.agents[0]?.email;
        });
      }
    } catch (e) {
      console.error("[tracker] error fetching live:", e);
    }
  }, [defaultEmail]);

  // Cargar timeline del agente y fecha seleccionados
  const fetchTimeline = useCallback(async () => {
    if (!selectedAgent) return;
    setRefreshing(true);
    try {
      const res = await fetch(`/api/activity/timeline?agent=${encodeURIComponent(selectedAgent)}&date=${selectedDate}`);
      const data = await res.json();
      setTimeline(data.timeline || []);
    } catch (e) {
      console.error("[tracker] error fetching timeline:", e);
    } finally {
      setRefreshing(false);
      setLoading(false);
    }
  }, [selectedAgent, selectedDate]);

  useEffect(() => {
    fetchLive();
  }, [fetchLive]);

  useEffect(() => {
    fetchTimeline();
  }, [fetchTimeline]);

  // Auto-refresco periódico
  useEffect(() => {
    if (autoRefreshSec <= 0) return;
    const interval = setInterval(() => {
      fetchLive();
      fetchTimeline();
    }, autoRefreshSec * 1000);
    return () => clearInterval(interval);
  }, [autoRefreshSec, fetchLive, fetchTimeline]);

  const currentAgentObj = liveAgents.find((a) => a.email.toLowerCase() === selectedAgent?.toLowerCase());

  // Filtrado de timeline
  const filteredTimeline = timeline.filter((item) => {
    if (categoryFilter !== "all" && item.category !== categoryFilter) return false;
    if (searchFilter) {
      const term = searchFilter.toLowerCase();
      const actionMatch = (item.action || "").toLowerCase().includes(term);
      const catMatch = (item.category || "").toLowerCase().includes(term);
      const appMatch = JSON.stringify(item.metadata || {}).toLowerCase().includes(term);
      return actionMatch || catMatch || appMatch;
    }
    return true;
  });

  const categoriesAvailable = Array.from(new Set(timeline.map((t) => t.category).filter(Boolean)));

  return (
    <div className="h-full flex flex-col bg-background overflow-hidden">
      {/* ── HEADER PRINCIPAL PREMIUM ── */}
      <div className="border-b border-border bg-card/60 backdrop-blur-md px-6 py-4 flex-shrink-0 flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="h-10 w-10 rounded-2xl bg-gradient-to-tr from-violet-600 to-indigo-600 text-white grid place-items-center shadow-md shadow-violet-600/20">
            <Activity className="h-5 w-5" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-base font-black text-foreground">Suite de Auditoría y Actividad</h1>
              <span className="text-[10px] font-extrabold uppercase px-2 py-0.5 rounded-full bg-violet-500/15 text-violet-400 border border-violet-500/30">
                Enterprise
              </span>
            </div>
            <p className="text-xs text-muted-foreground mt-0.5">
              Monitoreo integral de espacios de trabajo, llamadas, mensajería y aplicaciones de escritorio.
            </p>
          </div>
        </div>

        {/* Controles de fecha y refresco */}
        <div className="flex flex-wrap items-center gap-2.5">
          {/* Selector de fecha */}
          <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-border bg-background shadow-sm text-xs font-semibold">
            <Calendar className="h-3.5 w-3.5 text-muted-foreground" />
            <input
              type="date"
              value={selectedDate}
              onChange={(e) => setSelectedDate(e.target.value)}
              className="bg-transparent text-foreground focus:outline-none cursor-pointer"
            />
          </div>

          {/* Selector de Auto-refresco */}
          <div className="flex items-center gap-1 px-2 py-1 rounded-xl border border-border bg-background text-xs font-semibold text-muted-foreground">
            <span className="text-[10px] uppercase font-bold text-muted-foreground/80 pl-1">Auto:</span>
            {[
              { label: "15s", val: 15 },
              { label: "30s", val: 30 },
              { label: "60s", val: 60 },
              { label: "Off", val: 0 },
            ].map((opt) => (
              <button
                key={opt.val}
                onClick={() => setAutoRefreshSec(opt.val)}
                className={`px-2 py-0.5 rounded-lg text-[11px] font-bold transition-colors ${
                  autoRefreshSec === opt.val
                    ? "bg-violet-600 text-white"
                    : "hover:bg-muted text-muted-foreground"
                }`}
              >
                {opt.label}
              </button>
            ))}
          </div>

          {/* Botón refrescar */}
          <button
            onClick={() => {
              fetchLive();
              fetchTimeline();
            }}
            disabled={refreshing}
            className="p-2 rounded-xl border border-border bg-background hover:bg-muted text-muted-foreground hover:text-foreground transition-colors disabled:opacity-50"
            title="Refrescar datos ahora"
          >
            <RefreshCw className={`h-4 w-4 ${refreshing ? "animate-spin text-violet-500" : ""}`} />
          </button>
        </div>
      </div>

      {/* ── BARRA HORIZONTAL DE COLABORADORES ── */}
      <div className="border-b border-border bg-card/30 px-6 py-2.5 flex-shrink-0 flex items-center gap-2 overflow-x-auto scrollbar-none">
        <span className="text-[11px] font-black uppercase tracking-wider text-muted-foreground shrink-0 mr-1 flex items-center gap-1.5">
          <Users className="h-3.5 w-3.5" /> Equipo:
        </span>

        {liveAgents.map((ag) => {
          const isSelected = selectedAgent?.toLowerCase() === ag.email.toLowerCase();
          const isOnline = ag.status === "active";
          const isAway = ag.status === "away";

          return (
            <button
              key={ag.email}
              onClick={() => setSelectedAgent(ag.email)}
              className={`flex items-center gap-2 px-3 py-1.5 rounded-xl border text-xs font-semibold transition-all shrink-0 ${
                isSelected
                  ? "border-violet-500 bg-violet-500/15 text-violet-300 shadow-sm"
                  : "border-border/60 bg-card hover:bg-muted/40 text-muted-foreground hover:text-foreground"
              }`}
            >
              <span className="relative">
                <Avatar src={ag.avatar_url} name={ag.name} className="h-5 w-5 text-[9px] font-black" />
                <span
                  className={`absolute -bottom-0.5 -right-0.5 h-2 w-2 rounded-full border border-card ${
                    isOnline ? "bg-emerald-500" : isAway ? "bg-amber-500" : "bg-zinc-400"
                  }`}
                />
              </span>
              <span className="truncate max-w-[130px]">{ag.name.split(" ")[0]}</span>
              {ag.hasDesktopApp && (
                <span title="Desktop App Conectada">
                  <Laptop className="h-3 w-3 text-blue-400/80 shrink-0" />
                </span>
              )}
            </button>
          );
        })}
      </div>

      {/* ── NAVEGACIÓN POR PESTAÑAS ── */}
      <div className="border-b border-border px-6 flex-shrink-0 bg-card/20 flex items-center gap-1 overflow-x-auto scrollbar-none">
        {[
          { id: "live", label: "En Vivo & Resumen", icon: Activity },
          { id: "timeline", label: "Línea de Tiempo", icon: Clock },
          { id: "screenshots", label: "Capturas de Pantalla", icon: Camera },
          { id: "apps", label: "Apps y Sitios Web", icon: Monitor },
          { id: "briefing", label: "Dictamen IA & Reportes", icon: Sparkles },
        ].map((tab) => {
          const Icon = tab.icon;
          const isActive = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id as any)}
              className={`flex items-center gap-2 px-4 py-3 border-b-2 text-xs font-bold transition-all shrink-0 ${
                isActive
                  ? "border-violet-500 text-violet-400 bg-violet-500/5"
                  : "border-transparent text-muted-foreground hover:text-foreground hover:bg-muted/20"
              }`}
            >
              <Icon className={`h-4 w-4 ${isActive ? "text-violet-400" : "text-muted-foreground"}`} />
              {tab.label}
            </button>
          );
        })}
      </div>

      {/* ── CUERPO PRINCIPAL CON SCROLL ── */}
      <div className="flex-1 overflow-y-auto p-6 space-y-6">
        {/* PESTAÑA 1: EN VIVO & RESUMEN */}
        {activeTab === "live" && (
          <div className="space-y-6">
            <ActivityLivePulse
              agents={liveAgents}
              selectedAgent={selectedAgent}
              onSelectAgent={(email) => setSelectedAgent(email)}
              loading={loading}
            />

            {/* Heatmap de Intensidad */}
            <ActivityHeatmap timeline={timeline} date={selectedDate} />

            {/* Top Apps y Resumen en 2 Columnas */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              <ActivityAppsRanking timeline={timeline} />

              {/* Vista rápida de últimos eventos */}
              <div className="p-5 rounded-2xl bg-card border border-border/70 shadow-sm space-y-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Clock className="h-4 w-4 text-violet-500" />
                    <h3 className="font-bold text-sm text-foreground">Últimos Eventos en Tiempo Real</h3>
                  </div>
                  <button
                    onClick={() => setActiveTab("timeline")}
                    className="text-xs font-bold text-violet-400 hover:text-violet-300 flex items-center gap-1"
                  >
                    Ver todos <ChevronRight className="h-3.5 w-3.5" />
                  </button>
                </div>

                <div className="space-y-2 max-h-[350px] overflow-y-auto pr-1">
                  {timeline.slice(0, 7).map((item) => {
                    const Icon = CATEGORY_ICONS[item.category] || Activity;
                    const colorClass = CATEGORY_COLORS[item.category] || "text-zinc-400 bg-zinc-500/10 border-zinc-500/20";
                    const display = formatExecutiveDisplay(item.action, item.category, (item.metadata || {}) as Record<string, any>);
                    return (
                      <div
                        key={item.id}
                        className="p-3 rounded-xl bg-muted/20 border border-border/40 flex items-start gap-3 text-xs"
                      >
                        <div className={`p-1.5 rounded-lg border shrink-0 ${colorClass}`}>
                          <Icon className="h-3.5 w-3.5" />
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="font-bold text-foreground truncate">{display.title}</p>
                          {display.subtitle && (
                            <p className="text-[11px] text-muted-foreground truncate mt-0.5">{display.subtitle}</p>
                          )}
                          <div className="flex items-center gap-2 mt-1 text-[11px] text-muted-foreground">
                            <span>{formatTime(item.created_at)}</span>
                            {item.duration_ms ? (
                              <>
                                <span>•</span>
                                <span className="font-mono">{formatDuration(item.duration_ms)}</span>
                              </>
                            ) : null}
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          </div>
        )}

        {/* PESTAÑA 2: LÍNEA DE TIEMPO PROFUNDA */}
        {activeTab === "timeline" && (
          <div className="space-y-4">
            {/* Barra de Filtros y Búsqueda */}
            <div className="p-4 rounded-2xl bg-card border border-border/70 shadow-sm flex flex-col sm:flex-row items-center justify-between gap-3">
              <div className="flex items-center gap-2 w-full sm:w-auto">
                <div className="relative flex-1 sm:w-64">
                  <Search className="h-3.5 w-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
                  <input
                    type="text"
                    placeholder="Buscar evento, app o caso..."
                    value={searchFilter}
                    onChange={(e) => setSearchFilter(e.target.value)}
                    className="w-full pl-9 pr-3 py-1.5 rounded-xl border border-border bg-background text-xs text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-violet-500"
                  />
                </div>

                <select
                  value={categoryFilter}
                  onChange={(e) => setCategoryFilter(e.target.value)}
                  className="px-3 py-1.5 rounded-xl border border-border bg-background text-xs text-foreground focus:outline-none focus:ring-1 focus:ring-violet-500"
                >
                  <option value="all">Todas las categorías ({timeline.length})</option>
                  {categoriesAvailable.map((c) => (
                    <option key={c} value={c}>
                      {c}
                    </option>
                  ))}
                </select>
              </div>

              <span className="text-xs text-muted-foreground font-semibold">
                Mostrando {filteredTimeline.length} de {timeline.length} eventos
              </span>
            </div>

            {/* Lista Cronológica Enriquecida */}
            <div className="space-y-2.5">
              {filteredTimeline.length === 0 ? (
                <div className="p-12 text-center rounded-2xl bg-card border border-border/70 text-muted-foreground text-xs">
                  No hay eventos que coincidan con los filtros seleccionados.
                </div>
              ) : (
                filteredTimeline.map((item) => {
                  const Icon = CATEGORY_ICONS[item.category] || Activity;
                  const colorClass = CATEGORY_COLORS[item.category] || "text-zinc-400 bg-zinc-500/10 border-zinc-500/20";
                  const meta = (item.metadata || {}) as Record<string, any>;
                  const appName = meta.app_name || meta.label || meta.page || "";
                  const display = formatExecutiveDisplay(item.action, item.category, meta);

                  return (
                    <div
                      key={item.id}
                      className="p-4 rounded-2xl bg-card border border-border/70 hover:border-violet-500/40 transition-all flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs"
                    >
                      <div className="flex items-start gap-3 min-w-0">
                        <div className={`p-2 rounded-xl border shrink-0 ${colorClass}`}>
                          <Icon className="h-4 w-4" />
                        </div>
                        <div className="min-w-0">
                          <p className="font-bold text-foreground text-sm">{display.title}</p>
                          {display.subtitle && (
                            <p className="text-xs text-muted-foreground/90 mt-0.5">{display.subtitle}</p>
                          )}
                          <div className="flex flex-wrap items-center gap-2 mt-1.5 text-[11px] text-muted-foreground">
                            <span className="font-semibold text-foreground/80">{item.category}</span>
                            {appName && (
                              <>
                                <span>•</span>
                                <span className="font-medium px-2 py-0.5 rounded-lg bg-muted/60 border border-border/50 text-foreground">
                                  {appName}
                                </span>
                              </>
                            )}
                            {item.case_id && (
                              <>
                                <span>•</span>
                                <span className="text-blue-400 font-bold">Caso #{item.case_id}</span>
                              </>
                            )}
                          </div>
                        </div>
                      </div>

                      <div className="flex items-center gap-3 shrink-0 self-end sm:self-center font-mono text-[11px]">
                        {item.duration_ms ? (
                          <span className="px-2.5 py-1 rounded-lg bg-muted/40 border border-border/50 font-bold text-foreground">
                            {formatDuration(item.duration_ms)}
                          </span>
                        ) : null}
                        <span className="text-muted-foreground font-semibold">{formatTime(item.created_at)}</span>
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </div>
        )}

        {/* PESTAÑA 3: CAPTURAS DE PANTALLA */}
        {activeTab === "screenshots" && (
          <ActivityScreenGallery
            agentEmail={selectedAgent}
            agentName={currentAgentObj?.name || selectedAgent}
            date={selectedDate}
          />
        )}

        {/* PESTAÑA 4: APPS Y SITIOS WEB */}
        {activeTab === "apps" && (
          <div className="space-y-6">
            <ActivityAppsRanking timeline={timeline} />
            <ActivityHeatmap timeline={timeline} date={selectedDate} />
          </div>
        )}

        {/* PESTAÑA 5: DICTAMEN IA & REPORTES */}
        {activeTab === "briefing" && (
          <ActivityAiBriefing
            agentEmail={selectedAgent}
            agentName={currentAgentObj?.name || selectedAgent}
            date={selectedDate}
            timeline={timeline}
            allAgents={liveAgents}
          />
        )}
      </div>
    </div>
  );
}