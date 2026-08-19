"use client";

import { useState, useEffect, useCallback } from "react";
import { toast } from "sonner";
import {
  Activity,
  Clock,
  TrendingUp,
  Circle,
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
} from "lucide-react";

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

interface Metrics {
  totalActiveTime: string;
  totalIdleTime: string;
  productivityScore: number;
  totalEvents: number;
  activeEvents: number;
  idleEvents: number;
  categories: Record<string, number>;
  trackingStatus: string;
}

interface Summary {
  id: number;
  agent_email: string;
  date: string;
  summary: string;
  category: string;
  time_block: string;
  created_at: string;
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
  "Atención telefónica": "text-orange-400 bg-orange-500/10",
  "Mensajería": "text-green-400 bg-green-500/10",
  "Atención de tickets": "text-blue-400 bg-blue-500/10",
  "Trámites de garantías": "text-purple-400 bg-purple-500/10",
  "Investigación y desarrollo": "text-cyan-400 bg-cyan-500/10",
  "Labores manuales": "text-amber-400 bg-amber-500/10",
  "Gestión de correos": "text-yellow-400 bg-yellow-500/10",
  "Gestión de casos": "text-emerald-400 bg-emerald-500/10",
  "Escalado": "text-red-400 bg-red-500/10",
  "Asistente IA": "text-cyan-400 bg-cyan-500/10",
  "Inactividad": "text-zinc-400 bg-zinc-500/10",
  "Navegación": "text-sky-400 bg-sky-500/10",
  "Actividad general": "text-indigo-400 bg-indigo-500/10",
  "Soporte técnico": "text-amber-400 bg-amber-500/10",
  "Otros": "text-slate-400 bg-slate-500/10",
};

function formatTime(ts: string): string {
  if (!ts) return "";
  const d = new Date(ts);
  if (isNaN(d.getTime())) return "";
  return d.toLocaleTimeString("es-CR", { hour: "2-digit", minute: "2-digit" });
}

function formatDate(ts: string): string {
  if (!ts) return "";
  const d = new Date(ts);
  if (isNaN(d.getTime())) return "";
  return d.toLocaleDateString("es-CR", { day: "2-digit", month: "2-digit", year: "numeric" });
}

export function ActivityTracker({
  agentEmail,
  agentName,
  isAdmin = false,
}: {
  agentEmail?: string;
  agentName?: string;
  isAdmin?: boolean;
}) {
  const [timeline, setTimeline] = useState<TimelineEntry[]>([]);
  const [metrics, setMetrics] = useState<Metrics | null>(null);
  const [summaries, setSummaries] = useState<Summary[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedAgent, setSelectedAgent] = useState<string | undefined>(agentEmail);
  const [selectedDate, setSelectedDate] = useState(
    new Date().toISOString().split("T")[0]
  );
  const [showSettings, setShowSettings] = useState(false);
  const [activeTab, setActiveTab] = useState<"timeline" | "summary">("timeline");
  const [processing, setProcessing] = useState(false);
  const [viewMode, setViewMode] = useState<"recent" | "full">("recent");

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const lastMinutesParam = viewMode === "recent" ? "&lastMinutes=10" : "";
      const timelineRes = await fetch(
        `/api/activity/timeline?agent=${selectedAgent || ""}&date=${selectedDate}${lastMinutesParam}`
      );
      const timelineData = await timelineRes.json();
      setTimeline(timelineData.timeline || []);

      if (selectedAgent) {
        const metricsRes = await fetch(
          `/api/activity/timeline?agent=${selectedAgent}&date=${selectedDate}&metrics=true`
        );
        setMetrics(await metricsRes.json());
      }

      const summaryRes = await fetch(
        `/api/activity/summary?agent=${selectedAgent || ""}&date=${selectedDate}`
      );
      const summaryData = await summaryRes.json();
      setSummaries(summaryData.summaries || []);
    } catch (e) {
      console.error("[activity-tracker] Error fetching:", e);
    } finally {
      setLoading(false);
    }
  }, [selectedAgent, selectedDate, viewMode]);

  useEffect(() => {
    fetchData();
    const interval = setInterval(fetchData, 600000);
    return () => clearInterval(interval);
  }, [fetchData]);

  const handleForceSync = async () => {
    if (!selectedAgent) {
      toast.error("Seleccione un agente para procesar");
      return;
    }
    setProcessing(true);
    try {
      const res = await fetch("/api/activity/process", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          agent_email: selectedAgent,
          agent_name: agentName || selectedAgent,
          date: selectedDate,
        }),
      });
      const data = await res.json();
      if (res.ok) {
        toast.success(`Reporte generado con ${data.provider || "IA"} (${data.blocks || 0} bloques)`);
        fetchData();
      } else {
        toast.error(data.error || "Error al procesar");
      }
    } catch (e) {
      toast.error("Error de red al procesar");
    } finally {
      setProcessing(false);
    }
  };

  return (
    <div className="h-full flex flex-col bg-background">
      {/* Header */}
      <div className="border-b border-border px-6 py-4 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Activity className="h-5 w-5 text-violet-500" />
          <div>
            <h2 className="text-lg font-bold">Activity Tracker</h2>
            <p className="text-xs text-muted-foreground">
              {agentName || "Todos los agentes"} — {selectedDate}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={handleForceSync}
            disabled={processing}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium border border-border hover:bg-muted/50 transition-colors disabled:opacity-50"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${processing ? "animate-spin" : ""}`} />
            {processing ? "Procesando..." : "Forzar sincronización"}
          </button>
          <button
            onClick={() => setShowSettings((v) => !v)}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium border border-border hover:bg-muted/50 transition-colors"
          >
            <Settings className="h-3.5 w-3.5" />
            Settings
          </button>
        </div>
      </div>

      {/* Settings panel */}
      {showSettings && (
        <div className="border-b border-border px-6 py-3 bg-muted/30 flex items-center gap-4">
          <div className="flex items-center gap-2">
            <label className="text-xs font-medium text-muted-foreground">Agente:</label>
            <input
              type="text"
              value={selectedAgent || ""}
              onChange={(e) => setSelectedAgent(e.target.value || undefined)}
              placeholder="Todos"
              className="text-xs px-2 py-1 rounded border border-border bg-background w-48 focus:outline-none focus:ring-1 focus:ring-violet-500"
            />
          </div>
          <div className="flex items-center gap-2">
            <label className="text-xs font-medium text-muted-foreground">Fecha:</label>
            <input
              type="date"
              value={selectedDate}
              onChange={(e) => setSelectedDate(e.target.value)}
              className="text-xs px-2 py-1 rounded border border-border bg-background focus:outline-none focus:ring-1 focus:ring-violet-500"
            />
          </div>
          <div className="flex items-center gap-2">
            <label className="text-xs font-medium text-muted-foreground">Vista:</label>
            <button
              onClick={() => setViewMode("recent")}
              className={`text-xs px-2 py-1 rounded ${viewMode === "recent" ? "bg-violet-500 text-white" : "border border-border hover:bg-muted/50"}`}
            >
              Últimos 10 min
            </button>
            <button
              onClick={() => setViewMode("full")}
              className={`text-xs px-2 py-1 rounded ${viewMode === "full" ? "bg-violet-500 text-white" : "border border-border hover:bg-muted/50"}`}
            >
              Día completo
            </button>
          </div>
        </div>
      )}

      {/* Metrics bar */}
      {metrics && (
        <div className="border-b border-border px-6 py-3 grid grid-cols-2 md:grid-cols-4 gap-4">
          <div className="flex items-center gap-2">
            <Circle
              className={`h-2.5 w-2.5 ${
                metrics.trackingStatus === "ACTIVE" ? "text-emerald-500 fill-emerald-500" : "text-zinc-400 fill-zinc-400"
              }`}
            />
            <div>
              <p className="text-[10px] text-muted-foreground uppercase tracking-wide">Tracking Status</p>
              <p className="text-sm font-bold">{metrics.trackingStatus}</p>
            </div>
          </div>
          <div>
            <p className="text-[10px] text-muted-foreground uppercase tracking-wide">Total Active Time</p>
            <p className="text-sm font-bold text-emerald-400">{metrics.totalActiveTime}</p>
          </div>
          <div>
            <p className="text-[10px] text-muted-foreground uppercase tracking-wide">Total Idle Time</p>
            <p className="text-sm font-bold text-zinc-400">{metrics.totalIdleTime}</p>
          </div>
          <div>
            <p className="text-[10px] text-muted-foreground uppercase tracking-wide">Productivity Score</p>
            <div className="flex items-center gap-2">
              <p className="text-sm font-bold">{metrics.productivityScore}%</p>
              <div className="flex-1 h-1.5 rounded-full bg-muted overflow-hidden">
                <div
                  className="h-full bg-violet-500 rounded-full transition-all"
                  style={{ width: `${metrics.productivityScore}%` }}
                />
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Tabs */}
      <div className="border-b border-border flex">
        <button
          onClick={() => setActiveTab("timeline")}
          className={`px-6 py-2.5 text-xs font-semibold border-b-2 transition-colors ${
            activeTab === "timeline"
              ? "text-foreground border-violet-500"
              : "text-muted-foreground border-transparent hover:text-foreground"
          }`}
        >
          Timeline
        </button>
        <button
          onClick={() => setActiveTab("summary")}
          className={`px-6 py-2.5 text-xs font-semibold border-b-2 transition-colors ${
            activeTab === "summary"
              ? "text-foreground border-violet-500"
              : "text-muted-foreground border-transparent hover:text-foreground"
          }`}
        >
          Day Summary
        </button>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto p-6">
        {loading && timeline.length === 0 ? (
          <div className="flex items-center justify-center h-32">
            <div className="h-5 w-5 border-2 border-violet-500 border-t-transparent rounded-full animate-spin" />
          </div>
        ) : activeTab === "timeline" ? (
          <TimelineView timeline={timeline} />
        ) : (
          <SummaryView summaries={summaries} categories={metrics?.categories || {}} metrics={metrics} />
        )}
      </div>
    </div>
  );
}

function TimelineView({ timeline }: { timeline: TimelineEntry[] }) {
  if (timeline.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-32 text-muted-foreground">
        <Activity className="h-8 w-8 mb-2 opacity-40" />
        <p className="text-sm">No hay actividad registrada</p>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      {timeline.map((entry, idx) => {
        const Icon = CATEGORY_ICONS[entry.category] || Activity;
        const colorClass = CATEGORY_COLORS[entry.category] || CATEGORY_COLORS["Otros"];
        return (
          <div
            key={entry.id}
            className="flex items-start gap-3 p-3 rounded-lg border border-border hover:bg-muted/30 transition-colors"
          >
            <div className={`p-2 rounded-lg ${colorClass}`}>
              <Icon className="h-4 w-4" />
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center justify-between gap-2">
                <p className="text-sm font-medium truncate">{entry.action}</p>
                <span className="text-xs text-muted-foreground shrink-0">
                  {formatTime(entry.created_at || "")}
                </span>
              </div>
              <div className="flex items-center gap-2 mt-0.5">
                <span className="text-xs text-muted-foreground">{entry.agent_name}</span>
                {entry.case_id && (
                  <span className="text-[10px] px-1.5 py-0.5 rounded bg-muted text-muted-foreground">
                    Caso: {entry.case_id.substring(0, 12)}
                  </span>
                )}
                {entry.duration_ms && (
                  <span className="text-[10px] text-muted-foreground">
                    ({Math.round(entry.duration_ms / 1000)}s)
                  </span>
                )}
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}

function SummaryView({
  summaries,
  categories,
  metrics,
}: {
  summaries: Summary[];
  categories: Record<string, number>;
  metrics?: Metrics | null;
}) {
  // Usar tiempo por categoría si está disponible, sino contar eventos
  const catTimeMs = (metrics as any)?.categoryTimeMs as Record<string, number> | undefined;
  const hasTimeData = catTimeMs && Object.keys(catTimeMs).length > 0;

  // Para donut y barras: usar tiempo si hay, sino eventos
  const dataMap = hasTimeData ? catTimeMs! : categories;
  const totalData = Object.values(dataMap).reduce((s, v) => s + v, 0) || 1;
  const sortedCats = Object.entries(dataMap)
    .filter(([c]) => c !== "Inactividad")
    .sort((a, b) => b[1] - a[1]);
  const topCat = sortedCats[0]?.[0] || "Sin datos";
  const activeData = sortedCats.reduce((s, [, v]) => s + v, 0);
  const idleData = hasTimeData ? ((metrics as any)?.totalIdleMs || 0) : (categories["Inactividad"] || 0);

  // Formatear tiempo
  const fmtTime = (ms: number) => {
    if (!hasTimeData) return `${ms}`;
    const min = Math.floor(ms / 60000);
    const h = Math.floor(min / 60);
    const m = min % 60;
    if (h > 0) return `${h}h ${m}m`;
    return `${m}m`;
  };

  // Colores para gráficas (hex)
  const CAT_HEX: Record<string, string> = {
    "Atención telefónica": "#f97316",
    "Mensajería": "#22c55e",
    "Atención de tickets": "#3b82f6",
    "Trámites de garantías": "#a855f7",
    "Investigación y desarrollo": "#06b6d4",
    "Labores manuales": "#f59e0b",
    "Gestión de correos": "#eab308",
    "Gestión de casos": "#10b981",
    "Escalado": "#ef4444",
    "Asistente IA": "#06b6d4",
    "Inactividad": "#71717a",
    "Navegación": "#0ea5e9",
    "Soporte técnico remoto": "#6366f1",
    "Actividad general": "#6366f1",
    "Soporte técnico": "#f59e0b",
    "Otros": "#8b5cf6",
  };

  // Donut chart segments
  let cumulativePercent = 0;
  const donutSegments = sortedCats.map(([cat, val]) => {
    const percent = (val / totalData) * 100;
    const startAngle = (cumulativePercent / 100) * 360;
    cumulativePercent += percent;
    const endAngle = (cumulativePercent / 100) * 360;
    return { cat, val, percent, startAngle, endAngle, color: CAT_HEX[cat] || "#8b5cf6" };
  });

  if (summaries.length === 0 && Object.keys(categories).length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-32 text-muted-foreground">
        <TrendingUp className="h-8 w-8 mb-2 opacity-40" />
        <p className="text-sm">No hay resúmenes disponibles</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Stats cards premium */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <div className="rounded-xl border border-border bg-gradient-to-br from-violet-500/10 to-transparent p-3">
          <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide">Tiempo activo</p>
          <p className="text-2xl font-bold mt-1">{metrics?.totalActiveTime || fmtTime(activeData)}</p>
        </div>
        <div className="rounded-xl border border-border bg-gradient-to-br from-emerald-500/10 to-transparent p-3">
          <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide">Sesiones activas</p>
          <p className="text-2xl font-bold text-emerald-400 mt-1">{metrics?.activeEvents || sortedCats.length}</p>
        </div>
        <div className="rounded-xl border border-border bg-gradient-to-br from-zinc-500/10 to-transparent p-3">
          <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide">Tiempo inactivo</p>
          <p className="text-2xl font-bold text-zinc-400 mt-1">{metrics?.totalIdleTime || fmtTime(idleData)}</p>
        </div>
        <div className="rounded-xl border border-border bg-gradient-to-br from-amber-500/10 to-transparent p-3">
          <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide">Productividad</p>
          <div className="flex items-center gap-2 mt-1">
            <p className="text-2xl font-bold">{metrics?.productivityScore || 0}%</p>
          </div>
        </div>
      </div>

      {/* Gráficas: donut + barras */}
      {sortedCats.length > 0 && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {/* Donut chart SVG */}
          <div className="rounded-xl border border-border p-4">
            <h3 className="text-xs font-bold text-muted-foreground uppercase tracking-wide mb-3">Distribución de tiempo</h3>
            <div className="flex items-center justify-center">
              <svg viewBox="0 0 200 200" className="w-48 h-48">
                {donutSegments.map((seg, i) => {
                  const radius = 70;
                  const cx = 100, cy = 100;
                  const startRad = (seg.startAngle - 90) * Math.PI / 180;
                  const endRad = (seg.endAngle - 90) * Math.PI / 180;
                  const x1 = cx + radius * Math.cos(startRad);
                  const y1 = cy + radius * Math.sin(startRad);
                  const x2 = cx + radius * Math.cos(endRad);
                  const y2 = cy + radius * Math.sin(endRad);
                  const largeArc = seg.endAngle - seg.startAngle > 180 ? 1 : 0;
                  return (
                    <path
                      key={i}
                      d={`M ${cx} ${cy} L ${x1} ${y1} A ${radius} ${radius} 0 ${largeArc} 1 ${x2} ${y2} Z`}
                      fill={seg.color}
                      opacity={0.85}
                      className="hover:opacity-100 transition-opacity"
                    />
                  );
                })}
                <circle cx="100" cy="100" r="45" fill="var(--background, #0a0a0a)" />
                <text x="100" y="95" textAnchor="middle" className="fill-foreground text-[14px] font-bold">
                  {metrics?.totalActiveTime || fmtTime(activeData)}
                </text>
                <text x="100" y="112" textAnchor="middle" className="fill-muted-foreground text-[8px]">
                  tiempo activo
                </text>
              </svg>
            </div>
            <div className="mt-3 flex flex-wrap gap-2 justify-center">
              {donutSegments.slice(0, 6).map((seg) => (
                <div key={seg.cat} className="flex items-center gap-1.5">
                  <span className="h-2.5 w-2.5 rounded-sm" style={{ backgroundColor: seg.color }} />
                  <span className="text-[10px] text-muted-foreground">{seg.cat}</span>
                </div>
              ))}
            </div>
          </div>

          {/* Barras horizontales con tiempo y porcentajes */}
          <div className="rounded-xl border border-border p-4">
            <h3 className="text-xs font-bold text-muted-foreground uppercase tracking-wide mb-3">Tiempo por categoría</h3>
            <div className="space-y-2.5">
              {sortedCats.map(([cat, val]) => {
                const percent = Math.round((val / totalData) * 100);
                const color = CAT_HEX[cat] || "#8b5cf6";
                return (
                  <div key={cat}>
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-[11px] font-medium truncate">{cat}</span>
                      <span className="text-[10px] text-muted-foreground tabular-nums shrink-0 ml-2">{fmtTime(val)} · {percent}%</span>
                    </div>
                    <div className="h-2 rounded-full bg-muted overflow-hidden">
                      <div
                        className="h-full rounded-full transition-all duration-500"
                        style={{ width: `${percent}%`, backgroundColor: color }}
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {/* AI Summary principal */}
      {summaries.filter(s => s.time_block === "Día completo").length > 0 && (
        <div className="rounded-xl border border-violet-500/20 bg-gradient-to-br from-violet-500/5 to-transparent p-4">
          <div className="flex items-center gap-2 mb-3">
            <div className="p-1.5 rounded-lg bg-violet-500/10">
              <Bot className="h-4 w-4 text-violet-400" />
            </div>
            <h3 className="text-sm font-bold">Reporte IA del día</h3>
            <span className="text-[10px] text-muted-foreground ml-auto">{topCat}</span>
          </div>
          <div className="text-sm text-muted-foreground leading-relaxed whitespace-pre-wrap">
            {summaries.find(s => s.time_block === "Día completo")?.summary}
          </div>
        </div>
      )}

      {/* Resúmenes por bloque */}
      {summaries.filter(s => s.time_block !== "Día completo").length > 0 && (
        <div>
          <h3 className="text-xs font-bold text-muted-foreground uppercase tracking-wide mb-2">Resúmenes por bloque</h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
            {summaries.filter(s => s.time_block !== "Día completo").map((s) => {
              const Icon = CATEGORY_ICONS[s.category] || Activity;
              const colorClass = CATEGORY_COLORS[s.category] || CATEGORY_COLORS["Otros"];
              return (
                <div key={s.id} className="p-3 rounded-lg border border-border hover:border-border/60 transition-colors">
                  <div className="flex items-center gap-2 mb-1.5">
                    <div className={`p-1 rounded ${colorClass}`}>
                      <Icon className="h-3 w-3" />
                    </div>
                    <span className="text-[11px] font-medium">{s.time_block}</span>
                    <span className="text-[10px] text-muted-foreground ml-auto">{s.category}</span>
                  </div>
                  <p className="text-[11px] text-muted-foreground leading-relaxed line-clamp-3">{s.summary}</p>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
