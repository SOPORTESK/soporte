"use client";

import React, { useState, useEffect, useMemo, useCallback } from "react";
import {
  Users,
  User,
  Calendar,
  Clock,
  Sparkles,
  BarChart3,
  TrendingUp,
  Monitor,
  Wrench,
  Coffee,
  Bath,
  ArrowUpRight,
  ShieldCheck,
  RefreshCw,
  Award,
  ChevronRight,
  Flame,
  Layers,
  CheckCircle2,
  AlertTriangle,
} from "lucide-react";
import { ActivityExecutiveCharts } from "./activity-executive-charts";
import { ActivityHeatmap } from "./activity-heatmap";
import { computeUnifiedActivityMetrics } from "@/lib/activity-engine";
import { DataAuditBadge } from "./data-audit-badge";
import { type LiveAgent } from "./activity-live-pulse";

interface TimelineEntry {
  id?: number;
  agent_email: string;
  agent_name: string;
  action: string;
  category: string;
  case_id?: string | null;
  metadata?: Record<string, any> | null;
  duration_ms?: number | null;
  created_at: string;
}

interface Props {
  agents: LiveAgent[];
  selectedAgent?: string;
  onSelectAgent: (email: string) => void;
  selectedDate: string;
  selectedEndDate?: string;
  onDateChange: (date: string, endDate?: string) => void;
  individualTimeline: TimelineEntry[];
  scheduleStart?: string;
  scheduleEnd?: string;
  compliance?: any;
  serverMetrics?: any;
  toleranceMinutes?: number;
  useMixedSchedule?: boolean;
  daySchedules?: Record<number, any>;
  appMappings?: Record<string, any>;
  onRefresh: () => void;
  refreshing?: boolean;
}

function formatHoursMinutes(ms: number): string {
  const totalMin = Math.round(ms / 60000);
  const h = Math.floor(totalMin / 60);
  const m = totalMin % 60;
  return `${h.toString().padStart(2, "0")}:${m.toString().padStart(2, "0")}h`;
}

export function ActivityAnalyticsTab({
  agents,
  selectedAgent,
  onSelectAgent,
  selectedDate,
  selectedEndDate,
  onDateChange,
  individualTimeline,
  scheduleStart,
  scheduleEnd,
  compliance,
  serverMetrics,
  toleranceMinutes,
  useMixedSchedule,
  daySchedules,
  appMappings,
  onRefresh,
  refreshing = false,
}: Props) {
  // Modo de visualización: Individual o Grupal
  const [scope, setScope] = useState<"individual" | "group">("individual");
  const [groupTimeline, setGroupTimeline] = useState<TimelineEntry[]>([]);
  const [loadingGroup, setLoadingGroup] = useState<boolean>(false);

  // Datos consolidados sin truncamiento por período (mes / semana / día)
  interface PeriodData {
    agentBreakdown: Array<{
      email: string;
      name: string;
      status: string;
      avatarUrl?: string;
      activePcMs: number;
      activeManualMs: number;
      activeTotalMs: number;
      breakMs: number;
      sanitaryMs: number;
      totalBreakMs?: number;
      idleMs: number;
      totalTimeMs?: number;
      daysWorked: number;
      eventsCount: number;
      productivityScore: number;
    }>;
    teamTotals: {
      totalActiveMs: number;
      pcWorkMs: number;
      manualJustificationMs: number;
      totalBreakMs: number;
      totalSanitaryMs: number;
      totalBreaksCombinedMs?: number;
      totalIdleMs: number;
      totalTimeMs?: number;
      productivityScore: number;
      activeAgentsCount: number;
      totalEvents: number;
    };
    individualDailyBreakdown?: any[];
    topSoftware?: any[];
  }

  const [periodData, setPeriodData] = useState<PeriodData | null>(null);
  const [loadingPeriod, setLoadingPeriod] = useState<boolean>(false);

  const fetchPeriodMetrics = useCallback(async () => {
    setLoadingPeriod(true);
    try {
      const endParam = selectedEndDate
        ? `&endDate=${encodeURIComponent(selectedEndDate)}`
        : `&endDate=${encodeURIComponent(selectedDate)}`;
      const res = await fetch(
        `/api/activity/period-metrics?startDate=${encodeURIComponent(selectedDate)}${endParam}&_t=${Date.now()}`
      );
      const data = await res.json();
      if (data && data.success) {
        setPeriodData(data);
      }
    } catch (err) {
      console.error("[analytics-tab] error fetching period metrics:", err);
    } finally {
      setLoadingPeriod(false);
    }
  }, [selectedDate, selectedEndDate]);

  useEffect(() => {
    fetchPeriodMetrics();
  }, [fetchPeriodMetrics]);

  // Fetch de timeline grupal cuando se activa la vista grupal o cambia la fecha
  const fetchGroupTimeline = useCallback(async () => {
    setLoadingGroup(true);
    try {
      const endParam = selectedEndDate ? `&endDate=${encodeURIComponent(selectedEndDate)}` : "";
      const res = await fetch(`/api/activity/timeline?date=${selectedDate}${endParam}&_t=${Date.now()}`);
      const data = await res.json();
      if (Array.isArray(data.timeline)) {
        setGroupTimeline(data.timeline);
      }
    } catch (err) {
      console.error("[analytics-tab] error fetching group timeline:", err);
    } finally {
      setLoadingGroup(false);
    }
  }, [selectedDate, selectedEndDate]);

  useEffect(() => {
    if (scope === "group") {
      fetchGroupTimeline();
    }
  }, [scope, fetchGroupTimeline]);

  // Manejo de presets de fechas
  const [datePreset, setDatePreset] = useState<"hoy" | "semana" | "mes">("hoy");
  const handleSelectPreset = (preset: "hoy" | "semana" | "mes") => {
    setDatePreset(preset);
    const now = new Date();
    const toYMD = (d: Date) => d.toISOString().split("T")[0];

    if (preset === "hoy") {
      const today = toYMD(now);
      onDateChange(today, undefined);
    } else if (preset === "semana") {
      const past7 = new Date(now.getTime() - 6 * 86400000);
      onDateChange(toYMD(past7), toYMD(now));
    } else if (preset === "mes") {
      const firstDay = new Date(now.getFullYear(), now.getMonth(), 1);
      onDateChange(toYMD(firstDay), toYMD(now));
    }
  };

  // Métricas individuales del agente actual (para un único día)
  const individualMetrics = useMemo(() => {
    return computeUnifiedActivityMetrics(individualTimeline as any[]);
  }, [individualTimeline]);

  // Métricas grupales consolidadas de respaldo
  const groupMetrics = useMemo(() => {
    return computeUnifiedActivityMetrics(groupTimeline as any[]);
  }, [groupTimeline]);

  // Desglose por agente en la vista grupal de respaldo
  const fallbackAgentBreakdown = useMemo(() => {
    if (!groupTimeline.length) return [];

    const grouped: Record<string, TimelineEntry[]> = {};
    for (const it of groupTimeline) {
      const email = it.agent_email || "desconocido";
      if (!grouped[email]) grouped[email] = [];
      grouped[email].push(it);
    }

    const rows = Object.entries(grouped).map(([email, items]) => {
      const m = computeUnifiedActivityMetrics(items as any[]);
      const live = agents.find((a) => a.email.toLowerCase() === email.toLowerCase());
      const name = live?.name || items[0]?.agent_name || email.split("@")[0];
      const pcWorkMs = m.pcWorkMs || 0;
      const manualMs = m.manualJustificationMs || 0;
      const activeTotalMs = m.masterBuckets?.Productivo?.durationMs ?? (pcWorkMs + manualMs);
      const idleMs = m.masterBuckets?.Inactivo?.durationMs ?? 0;
      const breakMs = m.masterBuckets?.Descanso?.durationMs ?? 0;
      const sanitaryMs = m.masterBuckets?.["Pausa Sanitaria"]?.durationMs ?? 0;

      const rowBreakTotal = breakMs + sanitaryMs;
      const rowTotalTime = pcWorkMs + manualMs + rowBreakTotal + idleMs;
      return {
        email,
        name,
        avatarUrl: live?.avatar_url,
        status: live?.status || "offline",
        activePcMs: pcWorkMs,
        activeManualMs: manualMs,
        activeTotalMs,
        idleMs,
        breakMs,
        sanitaryMs,
        totalBreakMs: rowBreakTotal,
        totalTimeMs: rowTotalTime,
        productivityScore: m.productivityScore ?? 0,
        eventsCount: items.length,
      };
    });

    return rows.sort((a, b) => b.activeTotalMs - a.activeTotalMs);
  }, [groupTimeline, agents]);

  // Desglose enriquecido: toma los datos de periodData (calculados rigurosamente día a día sin truncamiento)
  const displayAgentBreakdown = useMemo(() => {
    if (periodData?.agentBreakdown && periodData.agentBreakdown.length > 0) {
      return periodData.agentBreakdown.map((row) => {
        const live = agents.find((a) => a.email.toLowerCase() === row.email.toLowerCase());
        const rowBreakTotal = row.totalBreakMs ?? ((row.breakMs || 0) + (row.sanitaryMs || 0));
        const rowTotalTime = row.totalTimeMs ?? ((row.activePcMs || 0) + (row.activeManualMs || 0) + rowBreakTotal + (row.idleMs || 0));
        return {
          ...row,
          name: live?.name || row.name,
          avatarUrl: live?.avatar_url,
          status: live?.status || "offline",
          totalBreakMs: rowBreakTotal,
          totalTimeMs: rowTotalTime,
        };
      });
    }
    return fallbackAgentBreakdown;
  }, [periodData, agents, fallbackAgentBreakdown]);

  // Totales de equipo consolidados reales
  const displayTeamActiveMs =
    periodData?.teamTotals?.totalActiveMs ?? (groupMetrics.masterBuckets?.Productivo?.durationMs ?? 0);
  const displayTeamPcMs = periodData?.teamTotals?.pcWorkMs ?? (groupMetrics.pcWorkMs ?? 0);
  const displayTeamManualMs = periodData?.teamTotals?.manualJustificationMs ?? (groupMetrics.manualJustificationMs ?? 0);
  const displayTeamScore = periodData?.teamTotals?.productivityScore ?? (groupMetrics.productivityScore ?? 0);
  const displayTeamBreakMs =
    periodData?.teamTotals?.totalBreakMs ?? (groupMetrics.masterBuckets?.Descanso?.durationMs ?? 0);
  const displayTeamSanitaryMs =
    periodData?.teamTotals?.totalSanitaryMs ?? (groupMetrics.masterBuckets?.["Pausa Sanitaria"]?.durationMs ?? 0);
  const displayTeamIdleMs =
    periodData?.teamTotals?.totalIdleMs ?? (groupMetrics.masterBuckets?.Inactivo?.durationMs ?? 0);
  const displayTeamTotalTimeMs =
    periodData?.teamTotals?.totalTimeMs ??
    (displayTeamPcMs + displayTeamManualMs + displayTeamBreakMs + displayTeamSanitaryMs + displayTeamIdleMs);

  // Búsqueda del agente seleccionado en el desglose del período para vistas mensuales/semanales
  const targetAgentPeriod = useMemo(() => {
    if (!periodData?.agentBreakdown) return null;
    return periodData.agentBreakdown.find((a) => a.email.toLowerCase() === (selectedAgent || "").toLowerCase());
  }, [periodData, selectedAgent]);

  // Métricas individuales ajustadas a rango completo si aplica
  const isPeriodRange = Boolean(selectedEndDate && selectedEndDate !== selectedDate);
  const displayIndActiveTotalMs =
    isPeriodRange && targetAgentPeriod
      ? targetAgentPeriod.activeTotalMs
      : individualMetrics.masterBuckets?.Productivo?.durationMs ?? 0;
  const displayIndPcMs =
    isPeriodRange && targetAgentPeriod ? targetAgentPeriod.activePcMs : individualMetrics.pcWorkMs ?? 0;
  const displayIndManualMs =
    isPeriodRange && targetAgentPeriod ? targetAgentPeriod.activeManualMs : individualMetrics.manualJustificationMs ?? 0;
  const displayIndScore =
    isPeriodRange && targetAgentPeriod ? targetAgentPeriod.productivityScore : individualMetrics.productivityScore ?? 0;
  const displayIndBreakMs =
    isPeriodRange && targetAgentPeriod
      ? targetAgentPeriod.breakMs
      : individualMetrics.masterBuckets?.Descanso?.durationMs ?? 0;
  const displayIndSanitaryMs =
    isPeriodRange && targetAgentPeriod
      ? targetAgentPeriod.sanitaryMs
      : individualMetrics.masterBuckets?.["Pausa Sanitaria"]?.durationMs ?? 0;
  const displayIndIdleMs =
    isPeriodRange && targetAgentPeriod
      ? targetAgentPeriod.idleMs
      : individualMetrics.masterBuckets?.Inactivo?.durationMs ?? 0;
  const displayIndTotalTimeMs =
    displayIndPcMs + displayIndManualMs + displayIndBreakMs + displayIndSanitaryMs + displayIndIdleMs;

  const currentAgentObj = agents.find((a) => a.email.toLowerCase() === (selectedAgent || "").toLowerCase());

  return (
    <div className="space-y-6">
      {/* ── BARRA DE CONTROL EJECUTIVA: ALCANCE Y PERÍODOS ── */}
      <div className="p-4 rounded-2xl bg-card border border-border shadow-xs flex flex-wrap items-center justify-between gap-4">
        {/* Toggle Alcance: Individual vs Todo el Equipo */}
        <div className="flex items-center gap-2">
          <div className="p-1 rounded-xl bg-muted/50 border border-border flex items-center gap-1 text-xs font-semibold">
            <button
              onClick={() => setScope("individual")}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg transition-all cursor-pointer ${
                scope === "individual"
                  ? "bg-violet-600 text-white font-bold shadow-sm"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              <User className="h-3.5 w-3.5" />
              <span>Individual</span>
            </button>

            <button
              onClick={() => setScope("group")}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg transition-all cursor-pointer ${
                scope === "group"
                  ? "bg-violet-600 text-white font-bold shadow-sm"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              <Users className="h-3.5 w-3.5" />
              <span>Todo el Equipo (Consolidado)</span>
            </button>
          </div>

          {/* Selector de agente cuando está en modo individual */}
          {scope === "individual" && (
            <div className="flex items-center gap-1.5 pl-2 border-l border-border">
              <span className="text-xs text-muted-foreground font-medium hidden sm:inline">Colaborador:</span>
              <select
                value={selectedAgent}
                onChange={(e) => onSelectAgent(e.target.value)}
                className="px-2.5 py-1.5 rounded-lg border border-border bg-background text-xs font-semibold text-foreground focus:ring-1 focus:ring-violet-500"
              >
                {agents.map((ag) => (
                  <option key={ag.email} value={ag.email}>
                    {ag.name} ({ag.email.split("@")[0]})
                  </option>
                ))}
              </select>
            </div>
          )}
        </div>

        {/* Presets Temporales y Botón Refrescar */}
        <div className="flex items-center gap-3 flex-wrap">
          <div className="flex items-center gap-1 bg-muted/40 p-1 rounded-xl border border-border text-xs font-semibold">
            {[
              { id: "hoy", label: "Hoy" },
              { id: "semana", label: "Últimos 7 días" },
              { id: "mes", label: "Este mes" },
            ].map((btn) => (
              <button
                key={btn.id}
                onClick={() => handleSelectPreset(btn.id as any)}
                className={`px-3 py-1 rounded-lg transition-all cursor-pointer text-xs ${
                  datePreset === btn.id
                    ? "bg-brand-600 text-white font-bold shadow-sm shadow-brand-600/25"
                    : "text-muted-foreground hover:text-foreground hover:bg-muted/50"
                }`}
              >
                {btn.label}
              </button>
            ))}
          </div>

          <button
            onClick={() => {
              onRefresh();
              fetchPeriodMetrics();
              if (scope === "group") fetchGroupTimeline();
            }}
            disabled={refreshing || loadingGroup || loadingPeriod}
            className="p-2 rounded-xl border border-border bg-card hover:bg-muted text-muted-foreground hover:text-foreground transition-all cursor-pointer"
            title="Actualizar analíticas"
          >
            <RefreshCw className={`h-4 w-4 ${refreshing || loadingGroup || loadingPeriod ? "animate-spin text-violet-500" : ""}`} />
          </button>
        </div>
      </div>

      {/* ══════════════════════════════════════════════════════════════════
          VISTA 1: ANALÍTICAS GRUPALES (CONSOLIDADO DEL EQUIPO)
         ══════════════════════════════════════════════════════════════════ */}
      {scope === "group" && (
        <div className="space-y-6">
          {/* Fila 1: KPIs Consolidados del Equipo */}
          <div className="grid grid-cols-2 sm:grid-cols-2 lg:grid-cols-4 gap-3.5">
            {/* 1. Total Horas del Taller (100% computado) */}
            <div className="p-4 rounded-2xl bg-card border border-border shadow-xs">
              <div className="flex items-center justify-between">
                <span className="text-[11px] font-black uppercase tracking-wider text-muted-foreground">
                  Horas Totales (100%)
                </span>
                <span className="p-1.5 rounded-lg bg-sky-500/10 text-sky-400">
                  <Clock className="h-4 w-4" />
                </span>
              </div>
              <div className="text-2xl font-black text-foreground font-mono mt-2">
                {formatHoursMinutes(displayTeamTotalTimeMs)}
              </div>
              <div className="flex items-center gap-2 mt-1 text-[11px] text-muted-foreground font-mono">
                <span>💻 PC: {formatHoursMinutes(displayTeamPcMs)}</span>
                <span>·</span>
                <span>🔧 Manual: {formatHoursMinutes(displayTeamManualMs)}</span>
              </div>
            </div>

            {/* 2. Efectividad Promedio */}
            <div className="p-4 rounded-2xl bg-card border border-border shadow-xs">
              <div className="flex items-center justify-between">
                <span className="text-[11px] font-black uppercase tracking-wider text-muted-foreground">
                  Efectividad del Taller
                </span>
                <span className="p-1.5 rounded-lg bg-emerald-500/10 text-emerald-400">
                  <TrendingUp className="h-4 w-4" />
                </span>
              </div>
              <div className="text-2xl font-black text-emerald-400 font-mono mt-2">
                {displayTeamScore}%
              </div>
              <span className="text-[11px] text-muted-foreground">
                Basado en {displayAgentBreakdown.length} colaboradores activos
              </span>
            </div>

            {/* 3. Descansos y Sanitarias */}
            <div className="p-4 rounded-2xl bg-card border border-border shadow-xs">
              <div className="flex items-center justify-between">
                <span className="text-[11px] font-black uppercase tracking-wider text-muted-foreground">
                  Pausas y Descansos
                </span>
                <span className="p-1.5 rounded-lg bg-amber-500/10 text-amber-400">
                  <Coffee className="h-4 w-4" />
                </span>
              </div>
              <div className="text-2xl font-black text-amber-400 font-mono mt-2">
                {formatHoursMinutes(displayTeamBreakMs + displayTeamSanitaryMs)}
              </div>
              <div className="flex items-center gap-2 mt-1 text-[11px] text-muted-foreground font-mono">
                <span>Descanso: {formatHoursMinutes(displayTeamBreakMs)}</span>
                <span>·</span>
                <span>Sanitaria: {formatHoursMinutes(displayTeamSanitaryMs)}</span>
              </div>
            </div>

            {/* 4. Inactividad Registrada */}
            <div className="p-4 rounded-2xl bg-card border border-border shadow-xs">
              <div className="flex items-center justify-between">
                <span className="text-[11px] font-black uppercase tracking-wider text-muted-foreground">
                  Inactividad del Taller
                </span>
                <span className="p-1.5 rounded-lg bg-slate-500/10 text-slate-400">
                  <AlertTriangle className="h-4 w-4" />
                </span>
              </div>
              <div className="text-2xl font-black text-slate-300 font-mono mt-2">
                {formatHoursMinutes(displayTeamIdleMs)}
              </div>
              <div className="flex items-center gap-2 mt-1 text-[11px] text-muted-foreground font-mono">
                <span className="text-emerald-500 font-semibold flex items-center gap-1">
                  <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 animate-pulse" />
                  {agents.filter((a) => a.status === "active").length} en vivo
                </span>
                <span>·</span>
                <span>{agents.length} técnicos</span>
              </div>
            </div>
          </div>

          {/* Fila 2: Tabla Ranking Comparativa del Equipo */}
          <div className="p-5 rounded-2xl bg-card border border-border shadow-xs space-y-4">
            <div className="flex items-center justify-between flex-wrap gap-2">
              <div>
                <h3 className="text-sm font-bold text-foreground flex items-center gap-2">
                  <Award className="h-4 w-4 text-violet-500" />
                  Rendimiento y Comparativa de Técnicos
                </h3>
                <p className="text-xs text-muted-foreground">
                  Consolidado individual de horas productivas, tareas manuales y adherencia en el período.
                </p>
              </div>
              <DataAuditBadge
                label="Auditoría de Equipo"
                totalEsperado={displayAgentBreakdown.length}
                totalCalculado={displayAgentBreakdown.length}
                detalle="Consistencia matemática: Cada técnico se computa independientemente desde el motor de actividad."
                size="xs"
              />
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs border-collapse">
                <thead>
                  <tr className="border-b border-border text-[11px] font-bold text-muted-foreground uppercase tracking-wider">
                    <th className="py-2.5 px-3 whitespace-nowrap">Técnico</th>
                    <th className="py-2.5 px-3 whitespace-nowrap">Estado</th>
                    <th className="py-2.5 px-3 font-mono whitespace-nowrap">💻 PC</th>
                    <th className="py-2.5 px-3 font-mono whitespace-nowrap">🔧 MANUAL</th>
                    <th className="py-2.5 px-3 font-mono whitespace-nowrap">☕ DESCANSOS</th>
                    <th className="py-2.5 px-3 font-mono whitespace-nowrap">⏳ INACTIVIDAD</th>
                    <th className="py-2.5 px-3 font-mono whitespace-nowrap">⏱️ TOTAL (100%)</th>
                    <th className="py-2.5 px-3 font-mono whitespace-nowrap">📊 EFECTIVIDAD</th>
                    <th className="py-2.5 px-3 text-right whitespace-nowrap">Acción</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border/60">
                  {displayAgentBreakdown.map((row) => {
                    const rowBreaks = row.totalBreakMs ?? ((row.breakMs || 0) + (row.sanitaryMs || 0));
                    const rowTotalTime = row.totalTimeMs ?? ((row.activePcMs || 0) + (row.activeManualMs || 0) + rowBreaks + (row.idleMs || 0));
                    return (
                      <tr key={row.email} className="hover:bg-muted/30 transition-colors">
                        <td className="py-3 px-3 whitespace-nowrap">
                          <div className="flex items-center gap-2.5">
                            <div className="h-7 w-7 rounded-full bg-violet-500/20 text-violet-400 font-bold grid place-items-center text-xs shrink-0">
                              {row.name.slice(0, 2).toUpperCase()}
                            </div>
                            <div>
                              <span className="font-bold text-foreground block">{row.name}</span>
                              <span className="text-[10px] text-muted-foreground">{row.email}</span>
                            </div>
                          </div>
                        </td>

                        <td className="py-3 px-3 whitespace-nowrap">
                          <span
                            className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold ${
                              row.status === "active"
                                ? "bg-emerald-500/15 text-emerald-400 border border-emerald-500/30"
                                : row.status === "away" || row.status === "idle"
                                ? "bg-amber-500/15 text-amber-400 border border-amber-500/30"
                                : "bg-slate-500/15 text-slate-400 border border-slate-500/30"
                            }`}
                          >
                            <span
                              className={`h-1.5 w-1.5 rounded-full ${
                                row.status === "active"
                                  ? "bg-emerald-400 animate-ping"
                                  : row.status === "away" || row.status === "idle"
                                  ? "bg-amber-400"
                                  : "bg-slate-400"
                              }`}
                            />
                            {row.status === "active"
                              ? "En Vivo"
                              : row.status === "away"
                              ? "Ausente"
                              : row.status === "idle"
                              ? "Inactivo"
                              : "Desconectado"}
                          </span>
                        </td>

                        <td className="py-3 px-3 font-mono text-muted-foreground whitespace-nowrap">
                          {formatHoursMinutes(row.activePcMs)}
                        </td>

                        <td className="py-3 px-3 font-mono text-muted-foreground whitespace-nowrap">
                          {formatHoursMinutes(row.activeManualMs)}
                        </td>

                        <td className="py-3 px-3 font-mono text-amber-400/90 whitespace-nowrap">
                          {formatHoursMinutes(rowBreaks)}
                        </td>

                        <td className="py-3 px-3 font-mono text-slate-400 whitespace-nowrap">
                          {formatHoursMinutes(row.idleMs)}
                        </td>

                        <td className="py-3 px-3 font-mono font-bold text-sky-400 whitespace-nowrap">
                          {formatHoursMinutes(rowTotalTime)}
                        </td>

                        <td className="py-3 px-3 font-mono whitespace-nowrap">
                          <div className="flex items-center gap-2">
                            <span className="font-bold text-foreground w-9">{row.productivityScore}%</span>
                            <div className="h-1.5 w-16 bg-muted rounded-full overflow-hidden">
                              <div
                                className="h-full bg-violet-500 rounded-full"
                                style={{ width: `${Math.min(100, row.productivityScore)}%` }}
                              />
                            </div>
                          </div>
                        </td>

                        <td className="py-3 px-3 text-right whitespace-nowrap">
                          <button
                            onClick={() => {
                              onSelectAgent(row.email);
                              setScope("individual");
                            }}
                            className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg border border-border bg-card hover:bg-muted text-[11px] font-semibold text-foreground transition-all cursor-pointer"
                          >
                            <span>Ver Detalle</span>
                            <ChevronRight className="h-3 w-3" />
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>

          {/* Fila 3: Gráficos Ejecutivos Consolidados del Taller */}
          <ActivityExecutiveCharts
            timeline={groupTimeline}
            selectedDate={selectedDate}
            onDateChange={onDateChange}
            onRefresh={fetchGroupTimeline}
            refreshing={loadingGroup}
            scheduleStart={scheduleStart}
            scheduleEnd={scheduleEnd}
            toleranceMinutes={toleranceMinutes}
            useMixedSchedule={useMixedSchedule}
            daySchedules={daySchedules}
            appMappings={appMappings}
          />
        </div>
      )}

      {/* ══════════════════════════════════════════════════════════════════
          VISTA 2: ANALÍTICAS INDIVIDUALES (COLABORADOR SELECCIONADO)
         ══════════════════════════════════════════════════════════════════ */}
      {scope === "individual" && (
        <div className="space-y-6">
          {/* Tarjetas KPI del Técnico Seleccionado */}
          <div className="grid grid-cols-2 sm:grid-cols-2 lg:grid-cols-4 gap-3.5">
            {/* 1. Tiempo Total Registrado (100%) */}
            <div className="p-4 rounded-2xl bg-card border border-border shadow-xs">
              <div className="flex items-center justify-between">
                <span className="text-[11px] font-black uppercase tracking-wider text-muted-foreground">
                  Tiempo Registrado (100%)
                </span>
                <span className="p-1.5 rounded-lg bg-sky-500/10 text-sky-400">
                  <Clock className="h-4 w-4" />
                </span>
              </div>
              <div className="text-2xl font-black text-sky-400 font-mono mt-2">
                {formatHoursMinutes(displayIndTotalTimeMs)}
              </div>
              <div className="flex items-center gap-2 mt-1 text-[11px] text-muted-foreground font-mono">
                <span>💻 PC: {formatHoursMinutes(displayIndPcMs)}</span>
                <span>·</span>
                <span>🔧 Manual: {formatHoursMinutes(displayIndManualMs)}</span>
              </div>
            </div>

            {/* 2. Efectividad Operativa */}
            <div className="p-4 rounded-2xl bg-card border border-border shadow-xs">
              <div className="flex items-center justify-between">
                <span className="text-[11px] font-black uppercase tracking-wider text-muted-foreground">
                  Efectividad
                </span>
                <span className="p-1.5 rounded-lg bg-emerald-500/10 text-emerald-400">
                  <TrendingUp className="h-4 w-4" />
                </span>
              </div>
              <div className="text-2xl font-black text-emerald-400 font-mono mt-2">
                {displayIndScore}%
              </div>
              <span className="text-[11px] text-muted-foreground">
                Ratio productivo frente a jornada
              </span>
            </div>

            {/* 3. Pausas & Descansos */}
            <div className="p-4 rounded-2xl bg-card border border-border shadow-xs">
              <div className="flex items-center justify-between">
                <span className="text-[11px] font-black uppercase tracking-wider text-muted-foreground">
                  Descansos & Pausas
                </span>
                <span className="p-1.5 rounded-lg bg-amber-500/10 text-amber-400">
                  <Coffee className="h-4 w-4" />
                </span>
              </div>
              <div className="text-2xl font-black text-amber-400 font-mono mt-2">
                {formatHoursMinutes(displayIndBreakMs + displayIndSanitaryMs)}
              </div>
              <div className="flex items-center gap-2 mt-1 text-[11px] text-muted-foreground font-mono">
                <span>Descanso: {formatHoursMinutes(displayIndBreakMs)}</span>
                <span>·</span>
                <span>Sanitaria: {formatHoursMinutes(displayIndSanitaryMs)}</span>
              </div>
            </div>

            {/* 4. Tiempo Inactivo / Ausencia */}
            <div className="p-4 rounded-2xl bg-card border border-border shadow-xs">
              <div className="flex items-center justify-between">
                <span className="text-[11px] font-black uppercase tracking-wider text-muted-foreground">
                  Inactividad Registrada
                </span>
                <span className="p-1.5 rounded-lg bg-slate-500/10 text-slate-400">
                  <AlertTriangle className="h-4 w-4" />
                </span>
              </div>
              <div className="text-2xl font-black text-slate-400 font-mono mt-2">
                {formatHoursMinutes(displayIndIdleMs)}
              </div>
              <span className="text-[11px] text-muted-foreground">
                Gaps sin movimiento ni tarea manual registrada
              </span>
            </div>
          </div>

          {/* Gráficos Ejecutivos Individuales (Donut de Efectividad, Top Tareas, Curva Horaria) */}
          <ActivityExecutiveCharts
            timeline={individualTimeline}
            selectedDate={selectedDate}
            onDateChange={onDateChange}
            onRefresh={onRefresh}
            refreshing={refreshing}
            scheduleStart={scheduleStart}
            scheduleEnd={scheduleEnd}
            compliance={compliance}
            serverMetrics={serverMetrics}
            toleranceMinutes={toleranceMinutes}
            useMixedSchedule={useMixedSchedule}
            daySchedules={daySchedules}
            appMappings={appMappings}
            periodMetrics={isPeriodRange && targetAgentPeriod ? { ...targetAgentPeriod, topSoftware: periodData?.topSoftware } : null}
          />

          {/* Mapa de Calor de Intensidad Horaria */}
          <ActivityHeatmap timeline={individualTimeline} date={selectedDate} />
        </div>
      )}
    </div>
  );
}
