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
                    return (
                      <div
                        key={item.id}
                        className="p-3 rounded-xl bg-muted/20 border border-border/40 flex items-start gap-3 text-xs"
                      >
                        <div className={`p-1.5 rounded-lg border shrink-0 ${colorClass}`}>
                          <Icon className="h-3.5 w-3.5" />
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="font-semibold text-foreground truncate">{item.action}</p>
                          <div className="flex items-center gap-2 mt-1 text-[11px] text-muted-foreground">
                            <span>{formatTime(item.created_at)}</span>
                            {item.duration_ms && (
                              <>
                                <span>•</span>
                                <span className="font-mono">{formatDuration(item.duration_ms)}</span>
                              </>
                            )}
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
                  const meta = item.metadata || {};
                  const appName = meta.app_name || meta.label || meta.page || "";

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
                          <p className="font-bold text-foreground text-sm">
                            {(() => {
                              let text = item.action || "";
                              text = text.replace(/^Abri[oó] \/ Cambi[oó] a\s*"?([^"–—]+)"?.*$/i, "Inicio de tarea en $1");
                              text = text.replace(/^Us[oó] "?([^"–—]+)"? durante (\d+)s(?:\s*\((.*)\))?/i, (_, app, s, title) => {
                                const sec = parseInt(s, 10);
                                const m = Math.round(sec / 60);
                                const timeStr = m > 0 ? `${m} min` : `${sec}s`;
                                const cleanTitle = title ? ` — "${title.replace(/\.exe/gi, '')}"` : '';
                                return `${app}${cleanTitle} (${timeStr})`;
                              });
                              text = text.replace(/^Sigue usando "?([^"–—]+)"? \(lleva (\d+)m\).*/i, "En curso • $1 ($2 min)");
                              text = text.replace(/(\d+)s de inactividad/g, (_, s) => {
                                const sec = parseInt(s, 10);
                                const m = Math.floor(sec / 60);
                                return m > 0 ? `${m} min de pausa` : `${sec}s de pausa`;
                              });
                              text = text.replace(/Reactivó actividad después de/g, "Reanudó labores tras");
                              text = text.replace(/Sin actividad por 5 minutos en/g, "Pausa de 5 min en");
                              return text;
                            })()}
                          </p>
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
                        {item.duration_ms && (
                          <span className="px-2.5 py-1 rounded-lg bg-muted/40 border border-border/50 font-bold text-foreground">
                            {formatDuration(item.duration_ms)}
                          </span>
                        )}
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