"use client";

import * as React from "react";
import Link from "next/link";
import {
  MessageSquare, BarChart3, Bot, ArrowDownLeft, ArrowUpRight, Download, FileText,
  ExternalLink, Clock, Activity, TrendingUp, TrendingDown, Minus, Users, Wrench,
  Sun, Moon, Info, Sparkles, Filter
} from "lucide-react";
import { cn } from "@/lib/utils";
import { exportToExcel, exportToCSV } from "@/lib/export-utils";
import { toast } from "sonner";

export interface MessageStatsData {
  totalClientes: number;
  totalTecnicos: number;
  totalIA: number;
  totalGlobal: number;
  agentStats: {
    email: string;
    nombre: string;
    enviados: number;
    recibidos: number;
    casos: number;
  }[];
  topClientes: {
    nombre: string;
    telefono: string;
    total: number;
    lastCaseId?: string;
  }[];
  distribucionHoras?: number[];
  distribucionHorasClientes?: number[];
  distribucionHorasTecnicos?: number[];
  distribucionHorasIA?: number[];
  filtroActual?: string;
  mensajes7d?: number;
  mensajesAntes7d?: number;
  tendencia7dMsgs?: number | null;
  mensajesMesActual?: number;
  mensajesMesAnterior?: number;
  tendenciaMesMsgs?: number | null;
  mensajes30d?: number;
  promedioDiarioMsgs?: number;
}

function formatClientDisplayName(nombre: string, telefono: string) {
  const cleanName = (nombre || "").trim();
  // Comprobar si es un nombre vacío, genérico o únicamente símbolos/emojis
  const isOnlyEmojiOrSymbols = !cleanName || cleanName === "Anónimo" || /^[\p{Emoji}\p{Symbol}\p{Punctuation}\s]+$/u.test(cleanName);
  
  if (isOnlyEmojiOrSymbols) {
    if (telefono) {
      const digits = telefono.replace(/\D/g, "");
      if (digits.startsWith("506") && digits.length === 11) {
        return `Cliente (+506 ${digits.slice(3, 7)}-${digits.slice(7)})`;
      }
      return `Cliente (${telefono})`;
    }
    return cleanName || "Cliente sin nombre";
  }
  return cleanName;
}

function formatPhone(telefono: string) {
  if (!telefono) return "";
  const digits = telefono.replace(/\D/g, "");
  if (digits.startsWith("506") && digits.length === 11) {
    return `+506 ${digits.slice(3, 7)}-${digits.slice(7)}`;
  }
  return telefono;
}

export function MessageVolumeTabs({
  stats,
  children,
}: {
  stats: MessageStatsData;
  children: React.ReactNode;
}) {
  const [activeTab, setActiveTab] = React.useState<"rendimiento" | "mensajeria">("rendimiento");
  const [searchClient, setSearchClient] = React.useState("");
  const [periodoModoMsgs, setPeriodoModoMsgs] = React.useState<"semana" | "mes">("semana");

  const filteredClients = React.useMemo(() => {
    if (!searchClient.trim()) return stats.topClientes.slice(0, 15);
    const q = searchClient.toLowerCase();
    return stats.topClientes.filter(c => 
      c.nombre.toLowerCase().includes(q) || 
      c.telefono.includes(q) ||
      formatClientDisplayName(c.nombre, c.telefono).toLowerCase().includes(q)
    ).slice(0, 15);
  }, [stats.topClientes, searchClient]);

  const maxAgentMsgs = Math.max(...stats.agentStats.map(a => Math.max(a.enviados, a.recibidos)), 1);

  // ── Segmentación y Rango de la Distribución Horaria ──
  const [hourlySegment, setHourlySegment] = React.useState<"total" | "clientes" | "tecnicos" | "ia">("total");
  const [hourRangeMode, setHourRangeMode] = React.useState<"jornada" | "24h">("jornada");
  const [hoveredHour, setHoveredHour] = React.useState<number | null>(null);

  const rawTotalHoras = React.useMemo(() => stats.distribucionHoras || new Array(24).fill(0), [stats.distribucionHoras]);
  const rawClientesHoras = React.useMemo(() => stats.distribucionHorasClientes || new Array(24).fill(0), [stats.distribucionHorasClientes]);
  const rawTecnicosHoras = React.useMemo(() => stats.distribucionHorasTecnicos || new Array(24).fill(0), [stats.distribucionHorasTecnicos]);
  const rawIAHoras = React.useMemo(() => stats.distribucionHorasIA || new Array(24).fill(0), [stats.distribucionHorasIA]);

  const activeHoras = React.useMemo(() => {
    switch (hourlySegment) {
      case "clientes": return rawClientesHoras;
      case "tecnicos": return rawTecnicosHoras;
      case "ia": return rawIAHoras;
      default: return rawTotalHoras;
    }
  }, [hourlySegment, rawClientesHoras, rawTecnicosHoras, rawIAHoras, rawTotalHoras]);

  const displayHoursIndices = React.useMemo(() => {
    if (hourRangeMode === "jornada") {
      // 6 AM a 8 PM (horas 6 a 20 = 15 horas)
      return Array.from({ length: 15 }, (_, i) => i + 6);
    }
    // 24 horas completas (0 a 23)
    return Array.from({ length: 24 }, (_, i) => i);
  }, [hourRangeMode]);

  const maxHoraMsgs = React.useMemo(() => {
    return Math.max(...displayHoursIndices.map(h => activeHoras[h] || 0), 0);
  }, [displayHoursIndices, activeHoras]);

  const horaPicoIndex = React.useMemo(() => {
    let bestH = displayHoursIndices[0];
    let bestVal = -1;
    for (const h of displayHoursIndices) {
      const val = activeHoras[h] || 0;
      if (val > bestVal) {
        bestVal = val;
        bestH = h;
      }
    }
    return bestVal > 0 ? bestH : -1;
  }, [displayHoursIndices, activeHoras]);

  const totalSegmentMsgs = React.useMemo(() => {
    return activeHoras.reduce((a, b) => a + b, 0);
  }, [activeHoras]);

  const formatHoraLabel = (h: number) => {
    if (h === 0) return "12 AM";
    if (h === 12) return "12 PM";
    return h > 12 ? `${h - 12} PM` : `${h} AM`;
  };

  const formatHoraRangoCompleto = (h: number) => {
    const start = formatHoraLabel(h);
    const nextH = (h + 1) % 24;
    const end = formatHoraLabel(nextH);
    return `${start} – ${end}`;
  };

  // Franjas de resumen para la cabecera
  const hourlySummary = React.useMemo(() => {
    const manana = [8, 9, 10, 11].reduce((a, h) => a + (activeHoras[h] || 0), 0);
    const tarde = [12, 13, 14, 15, 16].reduce((a, h) => a + (activeHoras[h] || 0), 0);
    let fueraHorario = 0;
    for (let h = 0; h < 24; h++) {
      if (h < 8 || h >= 17) fueraHorario += (activeHoras[h] || 0);
    }
    const tot = totalSegmentMsgs || 1;
    return {
      manana,
      mananaPct: Math.round((manana / tot) * 100),
      tarde,
      tardePct: Math.round((tarde / tot) * 100),
      fueraHorario,
      fueraHorarioPct: Math.round((fueraHorario / tot) * 100),
    };
  }, [activeHoras, totalSegmentMsgs]);

  const handleExportHorasCSV = () => {
    try {
      const totAll = rawTotalHoras.reduce((a, b) => a + b, 0) || 1;
      const csvData = displayHoursIndices.map(h => {
        const total = rawTotalHoras[h] || 0;
        const cli = rawClientesHoras[h] || 0;
        const tec = rawTecnicosHoras[h] || 0;
        const ia = rawIAHoras[h] || 0;
        const isLaboral = h >= 8 && h < 17;
        return {
          "Hora": formatHoraLabel(h),
          "Rango_Horario": formatHoraRangoCompleto(h),
          "Total_Mensajes": total,
          "Clientes": cli,
          "Tecnicos": tec,
          "IA": ia,
          "Porcentaje_del_Total": ((total / totAll) * 100).toFixed(1) + "%",
          "Tipo_Jornada": isLaboral ? "Horario Hábil Taller (8 AM - 5 PM)" : "Fuera de Horario"
        };
      });
      exportToCSV(csvData, `Distribucion_Horas_${(stats.filtroActual || "global").replace(/[^a-zA-Z0-9]/g, "_")}`);
      toast.success("Distribución horaria exportada en CSV");
    } catch {
      toast.error("Error al exportar CSV");
    }
  };

  const handleExportHorasExcel = () => {
    try {
      const totAll = rawTotalHoras.reduce((a, b) => a + b, 0) || 1;
      const excelData = displayHoursIndices.map(h => {
        const total = rawTotalHoras[h] || 0;
        const cli = rawClientesHoras[h] || 0;
        const tec = rawTecnicosHoras[h] || 0;
        const ia = rawIAHoras[h] || 0;
        const isLaboral = h >= 8 && h < 17;
        return {
          "Hora": formatHoraLabel(h),
          "Rango": formatHoraRangoCompleto(h),
          "Total Msgs": total,
          "Clientes": cli,
          "Técnicos": tec,
          "IA": ia,
          "% del Día": ((total / totAll) * 100).toFixed(1) + "%",
          "Estado Jornada": isLaboral ? "Horario Hábil (8 AM - 5 PM)" : "Fuera de Horario"
        };
      });
      exportToExcel(excelData, `Distribucion_Horas_${(stats.filtroActual || "global").replace(/[^a-zA-Z0-9]/g, "_")}`);
      toast.success("Distribución horaria exportada en Excel (.xlsx)");
    } catch {
      toast.error("Error al exportar Excel");
    }
  };

  const handleExportExcel = () => {
    try {
      const tecnicosData = stats.agentStats.map(a => ({
        "Sección": "TÉCNICOS",
        "Nombre": a.nombre,
        "Identificador / Email": a.email,
        "Casos Atendidos": a.casos,
        "Msgs Enviados": a.enviados,
        "Msgs Recibidos de Clientes": a.recibidos,
        "Promedio Msgs por Caso": a.casos > 0 ? (a.enviados / a.casos).toFixed(1) : "0"
      }));

      const clientesData = stats.topClientes.map((c, i) => ({
        "Sección": "TOP CLIENTES",
        "Ranking": i + 1,
        "Nombre": formatClientDisplayName(c.nombre, c.telefono),
        "Identificador / Teléfono": formatPhone(c.telefono),
        "Total Mensajes": c.total
      }));

      const resumenData = [
        { "Métrica": "Mensajes Entrantes de Clientes", "Valor": stats.totalClientes },
        { "Métrica": "Respuestas Humanas de Técnicos", "Valor": stats.totalTecnicos },
        { "Métrica": "Interacciones Automáticas IA / Bot", "Valor": stats.totalIA },
        { "Métrica": "Volumen Total Procesado", "Valor": stats.totalGlobal },
        { "Métrica": "Filtro Aplicado", "Valor": stats.filtroActual || "Todo el historial" }
      ];

      exportToExcel(
        [
          ...resumenData.map(r => ({ "Sección": "RESUMEN", "Nombre": r["Métrica"], "Identificador / Teléfono": "", "Total": r["Valor"] })),
          ...tecnicosData.map(t => ({ "Sección": "TÉCNICOS", "Nombre": t["Nombre"], "Identificador / Teléfono": t["Identificador / Email"], "Total": t["Msgs Enviados"], "Casos": t["Casos Atendidos"], "Promedio": t["Promedio Msgs por Caso"] })),
          ...clientesData.map(c => ({ "Sección": "TOP CLIENTES", "Nombre": c["Nombre"], "Identificador / Teléfono": c["Identificador / Teléfono"], "Total": c["Total Mensajes"], "Ranking": c["Ranking"] }))
        ],
        `Volumen_Mensajes_Sekunet_${(stats.filtroActual || "global").replace(/[^a-zA-Z0-9]/g, "_")}`
      );
      toast.success("Reporte Excel descargado exitosamente");
    } catch (err: any) {
      console.error(err);
      toast.error("Error al exportar Excel: " + (err?.message || "error"));
    }
  };

  const handleExportCSV = () => {
    try {
      const csvData = stats.agentStats.map(a => ({
        "Técnico": a.nombre,
        "Email": a.email,
        "Casos": a.casos,
        "Enviados": a.enviados,
        "Recibidos": a.recibidos,
        "Ratio_Msgs_Caso": a.casos > 0 ? (a.enviados / a.casos).toFixed(1) : "0"
      }));
      exportToCSV(csvData, `Volumen_Tecnicos_${(stats.filtroActual || "global").replace(/[^a-zA-Z0-9]/g, "_")}`);
      toast.success("Archivo CSV descargado con éxito");
    } catch (err) {
      toast.error("Error al exportar CSV");
    }
  };

  return (
    <div className="space-y-6">
      {/* Selector de Pestañas Superior */}
      <div className="flex items-center justify-between border-b border-border/60 pb-3 flex-wrap gap-3">
        <div className="inline-flex p-1 rounded-2xl bg-muted/50 border border-border/60 gap-1">
          <button
            onClick={() => setActiveTab("rendimiento")}
            className={cn(
              "flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold transition-all",
              activeTab === "rendimiento"
                ? "bg-brand-600 text-white shadow-md shadow-brand-600/20"
                : "text-muted-foreground hover:text-foreground hover:bg-muted/40"
            )}
          >
            <BarChart3 className="h-4 w-4" />
            <span>Rendimiento y SLA</span>
          </button>

          <button
            onClick={() => setActiveTab("mensajeria")}
            className={cn(
              "flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold transition-all relative",
              activeTab === "mensajeria"
                ? "bg-brand-600 text-white shadow-md shadow-brand-600/20"
                : "text-muted-foreground hover:text-foreground hover:bg-muted/40"
            )}
          >
            <MessageSquare className="h-4 w-4" />
            <span>Volumen de Mensajes</span>
            <span className="ml-1 px-1.5 py-0.5 rounded-full text-[10px] bg-sky-500/20 text-sky-400 font-black">
              Nuevo
            </span>
          </button>
        </div>

        {/* Acciones y detalle según pestaña */}
        <div className="flex items-center gap-2.5">
          {activeTab === "mensajeria" ? (
            <div className="flex items-center gap-2">
              <button
                onClick={handleExportExcel}
                title="Descargar reporte en archivo Excel (.xlsx)"
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-emerald-500/30 bg-emerald-500/10 text-emerald-400 hover:bg-emerald-500/20 transition-colors text-xs font-bold shadow-sm"
              >
                <Download className="h-3.5 w-3.5" />
                <span>Exportar Excel</span>
              </button>
              <button
                onClick={handleExportCSV}
                title="Descargar datos en formato CSV"
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-border bg-card text-foreground hover:bg-muted transition-colors text-xs font-bold"
              >
                <FileText className="h-3.5 w-3.5 text-muted-foreground" />
                <span className="hidden sm:inline">CSV</span>
              </button>
            </div>
          ) : (
            <div className="text-right hidden sm:block">
              <p className="text-[11px] font-medium text-muted-foreground">
                Métricas de resolución y tiempos de atención
              </p>
            </div>
          )}
        </div>
      </div>

      {/* Pestaña 1: Rendimiento y SLA (Contenido Actual Intacto) */}
      {activeTab === "rendimiento" && (
        <div className="space-y-6">
          {children}
        </div>
      )}

      {/* Pestaña 2: Volumen de Mensajes (Separada) */}
      {activeTab === "mensajeria" && (
        <div className="space-y-6 animate-in fade-in-50 duration-200">
          {/* Indicador de Filtro Activo */}
          {stats.filtroActual && (
            <div className="flex items-center justify-between px-4 py-2.5 rounded-2xl bg-muted/30 border border-border/60 text-xs">
              <div className="flex items-center gap-2">
                <span className="h-2 w-2 rounded-full bg-brand-500 animate-pulse" />
                <span className="text-muted-foreground font-medium">Mostrando datos para:</span>
                <span className="font-black text-foreground">{stats.filtroActual}</span>
              </div>
              <span className="text-[11px] text-muted-foreground">Conteo exacto mensaje por mensaje</span>
            </div>
          )}

          {/* Tarjetas KPI de Mensajería */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {/* Mensajes Clientes */}
            <div className="rounded-2xl border border-sky-500/20 bg-gradient-to-br from-sky-500/10 via-background to-background p-4 relative overflow-hidden">
              <div className="flex items-center justify-between">
                <span className="text-[11px] font-black uppercase tracking-wider text-sky-400">Mensajes de Clientes</span>
                <div className="h-8 w-8 rounded-xl bg-sky-500/10 grid place-items-center text-sky-400">
                  <ArrowDownLeft className="h-4 w-4" />
                </div>
              </div>
              <p className="text-2xl font-black mt-2 text-foreground">{stats.totalClientes.toLocaleString()}</p>
              <p className="text-[10px] text-muted-foreground mt-1">Mensajes entrantes recibidos</p>
            </div>

            {/* Mensajes Técnicos */}
            <div className="rounded-2xl border border-emerald-500/20 bg-gradient-to-br from-emerald-500/10 via-background to-background p-4 relative overflow-hidden">
              <div className="flex items-center justify-between">
                <span className="text-[11px] font-black uppercase tracking-wider text-emerald-400">Mensajes de Técnicos</span>
                <div className="h-8 w-8 rounded-xl bg-emerald-500/10 grid place-items-center text-emerald-400">
                  <ArrowUpRight className="h-4 w-4" />
                </div>
              </div>
              <p className="text-2xl font-black mt-2 text-foreground">{stats.totalTecnicos.toLocaleString()}</p>
              <p className="text-[10px] text-muted-foreground mt-1">Respuestas humanas enviadas</p>
            </div>

            {/* Mensajes Asistente IA */}
            <div className="rounded-2xl border border-purple-500/20 bg-gradient-to-br from-purple-500/10 via-background to-background p-4 relative overflow-hidden">
              <div className="flex items-center justify-between">
                <span className="text-[11px] font-black uppercase tracking-wider text-purple-400">Mensajes de IA / Bot</span>
                <div className="h-8 w-8 rounded-xl bg-purple-500/10 grid place-items-center text-purple-400">
                  <Bot className="h-4 w-4" />
                </div>
              </div>
              <p className="text-2xl font-black mt-2 text-foreground">{stats.totalIA.toLocaleString()}</p>
              <p className="text-[10px] text-muted-foreground mt-1">Interacciones automáticas</p>
            </div>

            {/* Total Acumulado */}
            <div className="rounded-2xl border border-brand-500/20 bg-gradient-to-br from-brand-500/10 via-background to-background p-4 relative overflow-hidden">
              <div className="flex items-center justify-between">
                <span className="text-[11px] font-black uppercase tracking-wider text-brand-400">Total Mensajes</span>
                <div className="h-8 w-8 rounded-xl bg-brand-500/10 grid place-items-center text-brand-400">
                  <MessageSquare className="h-4 w-4" />
                </div>
              </div>
              <p className="text-2xl font-black mt-2 text-foreground">{stats.totalGlobal.toLocaleString()}</p>
              <p className="text-[10px] text-muted-foreground mt-1">Volumen total procesado</p>
            </div>
          </div>

          {/* Tarjetas Estratégicas de Mensajería: Volumen Temporal y Promedio Diario */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* Card 1: Volumen con toggle 7 días / Mes */}
            <div className="relative rounded-2xl border border-border bg-card p-5 overflow-hidden ring-1 ring-border/50 hover:shadow-lg transition-all">
              <div className="absolute -top-8 -right-8 h-28 w-28 rounded-full bg-violet-500/10 blur-2xl pointer-events-none" />
              <div className="relative">
                <div className="flex items-center justify-between mb-3">
                  <div className="inline-flex items-center justify-center h-10 w-10 rounded-xl bg-violet-500/10 text-violet-400">
                    <Activity className="h-5 w-5" />
                  </div>
                  <div className="inline-flex rounded-lg border border-border bg-muted/30 p-0.5">
                    <button
                      onClick={() => setPeriodoModoMsgs("semana")}
                      className={cn(
                        "px-2.5 py-1 text-[10px] font-black uppercase rounded-md transition-colors",
                        periodoModoMsgs === "semana" ? "bg-brand-600 text-white shadow-sm" : "text-muted-foreground hover:text-foreground"
                      )}
                    >
                      7 Días
                    </button>
                    <button
                      onClick={() => setPeriodoModoMsgs("mes")}
                      className={cn(
                        "px-2.5 py-1 text-[10px] font-black uppercase rounded-md transition-colors",
                        periodoModoMsgs === "mes" ? "bg-brand-600 text-white shadow-sm" : "text-muted-foreground hover:text-foreground"
                      )}
                    >
                      Mes
                    </button>
                  </div>
                </div>

                <p className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">
                  {periodoModoMsgs === "mes" ? "Volumen del Mes" : "Volumen 7 Días"}
                </p>

                <div className="flex items-baseline gap-2 mt-1">
                  <p className="text-4xl font-black tracking-tight tabular-nums text-violet-400">
                    {periodoModoMsgs === "mes"
                      ? (stats.mensajesMesActual || 0).toLocaleString()
                      : (stats.mensajes7d || 0).toLocaleString()}
                  </p>
                  {(() => {
                    const tend = periodoModoMsgs === "mes" ? stats.tendenciaMesMsgs : stats.tendencia7dMsgs;
                    return (
                      <span className={cn(
                        "text-xs font-black flex items-center gap-0.5",
                        tend === null || tend === undefined ? "text-muted-foreground" :
                        tend > 0 ? "text-rose-400" :
                        tend < 0 ? "text-emerald-400" :
                        "text-muted-foreground"
                      )}>
                        {tend === null || tend === undefined ? (
                          <Minus className="h-3 w-3" />
                        ) : tend > 0 ? (
                          <TrendingUp className="h-3 w-3" />
                        ) : tend < 0 ? (
                          <TrendingDown className="h-3 w-3" />
                        ) : (
                          <Minus className="h-3 w-3" />
                        )}
                        {tend === null || tend === undefined ? "N/A" : `${tend > 0 ? "+" : ""}${tend}%`}
                      </span>
                    );
                  })()}
                </div>

                <p className="text-[10px] text-muted-foreground mt-1">
                  {periodoModoMsgs === "mes" ? "este mes vs mes anterior" : "últimos 7 días vs semana anterior"}
                </p>

                {/* Barra comparativa: actual vs anterior */}
                <div className="flex items-end gap-3 mt-3 h-10">
                  {(() => {
                    const actual = periodoModoMsgs === "mes" ? (stats.mensajesMesActual || 0) : (stats.mensajes7d || 0);
                    const anterior = periodoModoMsgs === "mes" ? (stats.mensajesMesAnterior || 0) : (stats.mensajesAntes7d || 0);
                    const max = Math.max(actual, anterior, 1);
                    const labelActual = periodoModoMsgs === "mes" ? "Este mes" : "7 días";
                    const labelAnterior = periodoModoMsgs === "mes" ? "Mes ant." : "Sem. ant.";

                    return (
                      <>
                        <div className="flex-1 flex flex-col items-center gap-1">
                          <span className="text-[10px] font-black tabular-nums text-violet-400">
                            {actual.toLocaleString()}
                          </span>
                          <div
                            className="w-full bg-violet-500 rounded-sm transition-all"
                            style={{ height: `${Math.max(8, Math.round((actual / max) * 100))}%` }}
                          />
                          <span className="text-[9px] text-muted-foreground font-bold">{labelActual}</span>
                        </div>
                        <div className="flex-1 flex flex-col items-center gap-1">
                          <span className="text-[10px] font-black tabular-nums text-muted-foreground">
                            {anterior.toLocaleString()}
                          </span>
                          <div
                            className="w-full bg-muted-foreground/30 rounded-sm transition-all"
                            style={{ height: `${Math.max(8, Math.round((anterior / max) * 100))}%` }}
                          />
                          <span className="text-[9px] text-muted-foreground font-bold">{labelAnterior}</span>
                        </div>
                      </>
                    );
                  })()}
                </div>
              </div>
            </div>

            {/* Card 2: Volumen promedio de mensajes */}
            <div className="relative rounded-2xl border border-border bg-card p-5 overflow-hidden ring-1 ring-border/50 hover:shadow-lg transition-all">
              <div className="absolute -top-8 -right-8 h-28 w-28 rounded-full bg-cyan-500/10 blur-2xl pointer-events-none" />
              <div className="relative">
                <div className="inline-flex items-center justify-center h-10 w-10 rounded-xl bg-cyan-500/10 text-cyan-400 mb-3">
                  <BarChart3 className="h-5 w-5" />
                </div>
                <p className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">Volumen Promedio</p>
                <p className="text-4xl font-black mt-1 tracking-tight tabular-nums text-cyan-400">
                  {stats.promedioDiarioMsgs && stats.promedioDiarioMsgs > 0
                    ? `${stats.promedioDiarioMsgs.toFixed(1)}/día`
                    : "—"}
                </p>
                <p className="text-[11px] text-muted-foreground mt-1.5">
                  {(stats.mensajes7d || 0).toLocaleString()} esta semana · {(stats.mensajesMesActual || 0).toLocaleString()} este mes
                </p>

                <div className="mt-3 pt-2.5 border-t border-border/40 flex items-center justify-between text-[10px] text-muted-foreground font-medium">
                  <span>Ritmo diario de mensajería (30 días)</span>
                  <span className="font-bold text-foreground">{(stats.mensajes30d || 0).toLocaleString()} msgs en 30d</span>
                </div>
              </div>
            </div>
          </div>

          {/* Grillas de Técnicos y Top Clientes */}
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
            {/* Tabla / Comparativa por Técnico (7 columnas en desktop) */}
            <div className="lg:col-span-7 rounded-2xl border border-border/60 bg-card p-5 space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-sm font-black text-foreground">Interacción por Técnico</h3>
                  <p className="text-[11px] text-muted-foreground">Comparativa de mensajes atendidos vs. respondidos</p>
                </div>
                <div className="flex items-center gap-3 text-[10px] font-bold">
                  <span className="flex items-center gap-1.5 text-sky-400">
                    <span className="h-2 w-2 rounded-full bg-sky-400 inline-block" /> Recibidos
                  </span>
                  <span className="flex items-center gap-1.5 text-emerald-400">
                    <span className="h-2 w-2 rounded-full bg-emerald-400 inline-block" /> Enviados
                  </span>
                </div>
              </div>

              <div className="space-y-3 pt-2">
                {stats.agentStats.length === 0 ? (
                  <p className="text-xs text-muted-foreground py-6 text-center">No hay registros en este período.</p>
                ) : (
                  stats.agentStats.map((agent) => {
                    const pctEnviados = Math.round((agent.enviados / maxAgentMsgs) * 100);
                    const pctRecibidos = Math.round((agent.recibidos / maxAgentMsgs) * 100);
                    const ratio = agent.casos > 0 ? (agent.enviados / agent.casos).toFixed(1) : "0";

                    return (
                      <div key={agent.email} className="rounded-xl border border-border/50 bg-background/50 p-3.5 space-y-2 hover:border-border transition-colors">
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-2.5">
                            <div className="h-8 w-8 rounded-full bg-brand-600/20 text-brand-400 font-black text-xs grid place-items-center">
                              {agent.nombre.slice(0, 2).toUpperCase()}
                            </div>
                            <div>
                              <p className="text-xs font-bold text-foreground">{agent.nombre}</p>
                              <p className="text-[10px] text-muted-foreground">{agent.casos} casos atendidos · Promedio {ratio} msgs/caso</p>
                            </div>
                          </div>
                          <div className="text-right">
                            <span className="text-xs font-black text-emerald-400">{agent.enviados.toLocaleString()} enviados</span>
                            <p className="text-[10px] text-sky-400 font-semibold">{agent.recibidos.toLocaleString()} de clientes</p>
                          </div>
                        </div>

                        {/* Barras de progreso */}
                        <div className="space-y-1 pt-1">
                          <div className="flex items-center gap-2">
                            <span className="text-[9px] font-bold text-muted-foreground w-12 shrink-0">Enviados</span>
                            <div className="h-2 flex-1 rounded-full bg-muted/60 overflow-hidden">
                              <div className="h-full bg-emerald-500 rounded-full transition-all duration-500" style={{ width: `${Math.max(pctEnviados, 4)}%` }} />
                            </div>
                          </div>
                          <div className="flex items-center gap-2">
                            <span className="text-[9px] font-bold text-muted-foreground w-12 shrink-0">Recibidos</span>
                            <div className="h-2 flex-1 rounded-full bg-muted/60 overflow-hidden">
                              <div className="h-full bg-sky-500 rounded-full transition-all duration-500" style={{ width: `${Math.max(pctRecibidos, 4)}%` }} />
                            </div>
                          </div>
                        </div>
                      </div>
                    );
                  })
                )}
              </div>
            </div>

            {/* Top Clientes con Más Mensajes (5 columnas en desktop) */}
            <div className="lg:col-span-5 rounded-2xl border border-border/60 bg-card p-5 space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-sm font-black text-foreground">Top Clientes por Mensajes</h3>
                  <p className="text-[11px] text-muted-foreground">Toque un cliente para auditar su chat directo</p>
                </div>
              </div>

              <input
                type="text"
                placeholder="Buscar por nombre o teléfono..."
                value={searchClient}
                onChange={(e) => setSearchClient(e.target.value)}
                className="w-full px-3 py-1.5 text-xs rounded-xl border border-border bg-background text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-brand-500"
              />

              <div className="max-h-[380px] overflow-y-auto space-y-2 pr-1">
                {filteredClients.length === 0 ? (
                  <p className="text-xs text-muted-foreground py-6 text-center">No se encontraron clientes.</p>
                ) : (
                  filteredClients.map((client, idx) => {
                    const chatTargetUrl = `/inbox?c=${client.lastCaseId || (client.telefono ? 'tel:' + client.telefono : '')}`;
                    const displayName = formatClientDisplayName(client.nombre, client.telefono);
                    const formattedPhone = formatPhone(client.telefono);

                    return (
                      <Link
                        key={idx}
                        href={chatTargetUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        title="Abrir conversación en el Inbox"
                        className="group flex items-center justify-between p-2.5 rounded-xl bg-background/50 border border-border/40 hover:border-brand-500/50 hover:bg-brand-500/5 transition-all cursor-pointer"
                      >
                        <div className="min-w-0 flex-1 pr-2">
                          <div className="flex items-center gap-1.5">
                            <p className="text-xs font-bold text-foreground group-hover:text-brand-400 transition-colors truncate">
                              {displayName}
                            </p>
                            <ExternalLink className="h-3 w-3 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity shrink-0" />
                          </div>
                          {formattedPhone && (
                            <p className="text-[10px] text-muted-foreground truncate">{formattedPhone}</p>
                          )}
                        </div>
                        <div className="text-right shrink-0">
                          <span className="px-2.5 py-1 rounded-lg text-xs font-black bg-sky-500/10 text-sky-400 border border-sky-500/20 group-hover:border-sky-500/40 group-hover:bg-sky-500/20 transition-colors">
                            {client.total.toLocaleString()} msgs
                          </span>
                        </div>
                      </Link>
                    );
                  })
                )}
              </div>
            </div>
          </div>

          {/* Distribución Horaria y Horas Pico (Interactiva y Segmentada) */}
          {maxHoraMsgs > 0 && (
            <div className="rounded-2xl border border-border/60 bg-card p-5 lg:p-6 space-y-5 shadow-sm">
              {/* Encabezado Principal + Acciones */}
              <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 border-b border-border/40 pb-4">
                <div className="flex items-center gap-3">
                  <div className="h-9 w-9 rounded-xl bg-amber-500/10 text-amber-400 grid place-items-center shrink-0 border border-amber-500/20">
                    <Clock className="h-5 w-5" />
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <h3 className="text-base font-black text-foreground">Horas Pico y Distribución de Tráfico</h3>
                      <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-500/10 text-amber-400 border border-amber-500/20">
                        Hora Costa Rica
                      </span>
                    </div>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      Densidad y volumen de mensajes hora a hora con desglose por tipo de actor
                    </p>
                  </div>
                </div>

                {/* Acciones: Toggle Jornada/24h + Descargas Excel/CSV */}
                <div className="flex items-center gap-2 flex-wrap">
                  {/* Selector Rango Horario */}
                  <div className="inline-flex p-1 rounded-xl bg-muted/60 border border-border/60 text-xs font-bold gap-1">
                    <button
                      onClick={() => setHourRangeMode("jornada")}
                      className={cn(
                        "px-2.5 py-1 rounded-lg transition-all text-xs",
                        hourRangeMode === "jornada"
                          ? "bg-card text-foreground shadow-sm font-black"
                          : "text-muted-foreground hover:text-foreground"
                      )}
                    >
                      Jornada (6h–20h)
                    </button>
                    <button
                      onClick={() => setHourRangeMode("24h")}
                      className={cn(
                        "px-2.5 py-1 rounded-lg transition-all text-xs",
                        hourRangeMode === "24h"
                          ? "bg-card text-foreground shadow-sm font-black"
                          : "text-muted-foreground hover:text-foreground"
                      )}
                    >
                      24 Horas
                    </button>
                  </div>

                  {/* Botones de Descarga directa para la tabla horaria */}
                  <div className="flex items-center gap-1.5">
                    <button
                      onClick={handleExportHorasExcel}
                      title="Descargar tabla de distribución horaria en Excel (.xlsx)"
                      className="flex items-center gap-1 px-2.5 py-1.5 rounded-xl border border-emerald-500/30 bg-emerald-500/10 text-emerald-400 hover:bg-emerald-500/20 transition-colors text-xs font-bold"
                    >
                      <Download className="h-3.5 w-3.5" />
                      <span>Excel</span>
                    </button>
                    <button
                      onClick={handleExportHorasCSV}
                      title="Descargar tabla horaria en formato CSV"
                      className="flex items-center gap-1 px-2.5 py-1.5 rounded-xl border border-border bg-card text-foreground hover:bg-muted transition-colors text-xs font-bold"
                    >
                      <FileText className="h-3.5 w-3.5 text-muted-foreground" />
                      <span>CSV</span>
                    </button>
                  </div>
                </div>
              </div>

              {/* Fila 2: Filtros de Segmentación (Tabs de Rol) + Resumen de Franjas */}
              <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
                {/* Segmentos de Mensajes */}
                <div className="flex items-center gap-1.5 flex-wrap">
                  <span className="text-xs font-bold text-muted-foreground mr-1 flex items-center gap-1">
                    <Filter className="h-3.5 w-3.5" /> Ver:
                  </span>
                  {[
                    { key: "total", label: "Todos", count: stats.totalGlobal, icon: Activity, color: "text-sky-400", activeBg: "bg-sky-500/15 border-sky-500/30 text-sky-400" },
                    { key: "clientes", label: "Clientes", count: stats.totalClientes, icon: Users, color: "text-emerald-400", activeBg: "bg-emerald-500/15 border-emerald-500/30 text-emerald-400" },
                    { key: "tecnicos", label: "Técnicos", count: stats.totalTecnicos, icon: Wrench, color: "text-violet-400", activeBg: "bg-violet-500/15 border-violet-500/30 text-violet-400" },
                    { key: "ia", label: "IA Sekunet", count: stats.totalIA, icon: Bot, color: "text-cyan-400", activeBg: "bg-cyan-500/15 border-cyan-500/30 text-cyan-400" },
                  ].map((tab) => {
                    const Icon = tab.icon;
                    const isActive = hourlySegment === tab.key;
                    return (
                      <button
                        key={tab.key}
                        onClick={() => setHourlySegment(tab.key as any)}
                        className={cn(
                          "flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold transition-all border",
                          isActive
                            ? `${tab.activeBg} font-black shadow-sm`
                            : "bg-muted/40 border-border/60 text-muted-foreground hover:text-foreground hover:bg-muted"
                        )}
                      >
                        <Icon className={cn("h-3.5 w-3.5", isActive ? tab.color : "text-muted-foreground")} />
                        <span>{tab.label}</span>
                        <span className="text-[10px] px-1.5 py-0.2 rounded-full bg-background/60 font-semibold opacity-90">
                          {tab.count.toLocaleString()}
                        </span>
                      </button>
                    );
                  })}
                </div>

                {/* Leyenda de Jornada del Taller */}
                <div className="flex items-center gap-3 text-[11px] text-muted-foreground">
                  <div className="flex items-center gap-1.5">
                    <span className="h-2 w-2 rounded-full bg-emerald-500" />
                    <span>Horario Taller (8 AM – 5 PM)</span>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <span className="h-2 w-2 rounded-full bg-muted-foreground/40" />
                    <span>Fuera de Horario</span>
                  </div>
                </div>
              </div>

              {/* Fila 3: Chips de Resumen Operativo */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
                {/* Hora Pico */}
                <div className="p-3 rounded-xl bg-amber-500/10 border border-amber-500/25 flex flex-col justify-between">
                  <div className="flex items-center justify-between text-xs text-amber-400 font-bold">
                    <span className="flex items-center gap-1">🔥 Hora Pico</span>
                    <span className="text-[10px] font-black uppercase">
                      {totalSegmentMsgs > 0 ? `${((maxHoraMsgs / totalSegmentMsgs) * 100).toFixed(1)}%` : ""}
                    </span>
                  </div>
                  <div className="mt-1">
                    <p className="text-base font-black text-foreground">
                      {horaPicoIndex >= 0 ? formatHoraLabel(horaPicoIndex) : "—"}
                    </p>
                    <p className="text-[11px] text-amber-400 font-semibold">
                      {maxHoraMsgs.toLocaleString()} msgs en pico
                    </p>
                  </div>
                </div>

                {/* Franja Mañana */}
                <div className="p-3 rounded-xl bg-sky-500/10 border border-sky-500/25 flex flex-col justify-between">
                  <div className="flex items-center justify-between text-xs text-sky-400 font-bold">
                    <span className="flex items-center gap-1"><Sun className="h-3 w-3" /> Mañana (8h–12h)</span>
                    <span className="text-[10px] font-black">{hourlySummary.mananaPct}%</span>
                  </div>
                  <div className="mt-1">
                    <p className="text-base font-black text-foreground">
                      {hourlySummary.manana.toLocaleString()} msgs
                    </p>
                    <p className="text-[11px] text-muted-foreground">Pico de apertura y cotizaciones</p>
                  </div>
                </div>

                {/* Franja Tarde */}
                <div className="p-3 rounded-xl bg-violet-500/10 border border-violet-500/25 flex flex-col justify-between">
                  <div className="flex items-center justify-between text-xs text-violet-400 font-bold">
                    <span className="flex items-center gap-1"><Activity className="h-3 w-3" /> Tarde (12h–17h)</span>
                    <span className="text-[10px] font-black">{hourlySummary.tardePct}%</span>
                  </div>
                  <div className="mt-1">
                    <p className="text-base font-black text-foreground">
                      {hourlySummary.tarde.toLocaleString()} msgs
                    </p>
                    <p className="text-[11px] text-muted-foreground">Seguimiento y entregas</p>
                  </div>
                </div>

                {/* Fuera de Horario */}
                <div className="p-3 rounded-xl bg-muted/40 border border-border/60 flex flex-col justify-between">
                  <div className="flex items-center justify-between text-xs text-muted-foreground font-bold">
                    <span className="flex items-center gap-1"><Moon className="h-3 w-3" /> Fuera de Horario</span>
                    <span className="text-[10px] font-black">{hourlySummary.fueraHorarioPct}%</span>
                  </div>
                  <div className="mt-1">
                    <p className="text-base font-black text-foreground">
                      {hourlySummary.fueraHorario.toLocaleString()} msgs
                    </p>
                    <p className="text-[11px] text-muted-foreground">Noche y madrugada</p>
                  </div>
                </div>
              </div>

              {/* Fila 4: Gráfica de Barras Horarias (Contenedor Continuo y Responsivo) */}
              <div className="space-y-2 pt-2">
                <div className="overflow-x-auto pb-3 -mx-2 px-2 scrollbar-thin">
                  <div
                    className={cn(
                      "grid gap-2 pt-1",
                      hourRangeMode === "jornada"
                        ? "grid-cols-15 min-w-[760px]"
                        : "grid-cols-24 min-w-[1050px]"
                    )}
                  >
                    {displayHoursIndices.map((h) => {
                      const count = activeHoras[h] || 0;
                      const cli = rawClientesHoras[h] || 0;
                      const tec = rawTecnicosHoras[h] || 0;
                      const ia = rawIAHoras[h] || 0;
                      const isLaboral = h >= 8 && h < 17;
                      const isPeak = h === horaPicoIndex && count > 0;
                      const isHovered = hoveredHour === h;
                      const pctOfMax = maxHoraMsgs > 0 ? (count / maxHoraMsgs) * 100 : 0;
                      const pctOfTotal = totalSegmentMsgs > 0 ? ((count / totalSegmentMsgs) * 100).toFixed(1) : "0";

                      // Altura proporcional realista (mínimo de 3% sólo si count > 0)
                      const barHeight = count > 0 ? Math.max(Math.round(pctOfMax), 3) : 0;

                      // Color de barra dinámico según segmento
                      let barColorClass = "bg-sky-500/80 group-hover:bg-sky-500";
                      if (isPeak) {
                        barColorClass = "bg-gradient-to-t from-amber-500 to-amber-400 shadow-md shadow-amber-500/40";
                      } else if (hourlySegment === "clientes") {
                        barColorClass = "bg-gradient-to-t from-emerald-600 to-emerald-400 group-hover:from-emerald-500 group-hover:to-emerald-300";
                      } else if (hourlySegment === "tecnicos") {
                        barColorClass = "bg-gradient-to-t from-violet-600 to-violet-400 group-hover:from-violet-500 group-hover:to-violet-300";
                      } else if (hourlySegment === "ia") {
                        barColorClass = "bg-gradient-to-t from-cyan-600 to-cyan-400 group-hover:from-cyan-500 group-hover:to-cyan-300";
                      } else {
                        // Total
                        if (pctOfMax >= 65) {
                          barColorClass = "bg-gradient-to-t from-sky-600 to-sky-400 group-hover:from-sky-500 group-hover:to-sky-300";
                        } else if (pctOfMax >= 25) {
                          barColorClass = "bg-gradient-to-t from-sky-700/80 to-sky-500/80 group-hover:from-sky-600 group-hover:to-sky-400";
                        } else {
                          barColorClass = "bg-sky-500/40 group-hover:bg-sky-500/60";
                        }
                      }

                      return (
                        <div
                          key={h}
                          onMouseEnter={() => setHoveredHour(h)}
                          onMouseLeave={() => setHoveredHour(null)}
                          className={cn(
                            "flex flex-col items-center gap-1.5 group cursor-pointer transition-all duration-200 p-1 rounded-xl",
                            isHovered ? "bg-muted/60 ring-1 ring-border" : "hover:bg-muted/30"
                          )}
                        >
                          {/* Número superior */}
                          <span
                            className={cn(
                              "text-[10px] font-bold transition-colors leading-none h-3.5 flex items-center",
                              isPeak ? "text-amber-400 font-black" : isHovered ? "text-foreground" : "text-muted-foreground"
                            )}
                          >
                            {count > 0 ? (count >= 1000 ? `${(count / 1000).toFixed(1)}k` : count) : ""}
                          </span>

                          {/* Contenedor de la barra */}
                          <div
                            className={cn(
                              "w-full h-28 rounded-xl flex items-end p-1 overflow-hidden relative border transition-all",
                              isPeak
                                ? "bg-amber-500/10 border-amber-500/40 shadow-inner"
                                : isLaboral
                                ? "bg-sky-500/[0.03] border-sky-500/15"
                                : "bg-muted/20 border-border/30 opacity-70"
                            )}
                          >
                            {/* Líneas guía sutiles (25%, 50%, 75%) */}
                            <div className="absolute inset-x-0 top-1/4 border-b border-border/10 pointer-events-none" />
                            <div className="absolute inset-x-0 top-2/4 border-b border-border/10 pointer-events-none" />
                            <div className="absolute inset-x-0 top-3/4 border-b border-border/10 pointer-events-none" />

                            {/* La Barra */}
                            <div
                              className={cn(
                                "w-full rounded-md transition-all duration-500 relative",
                                barColorClass,
                                count === 0 && "opacity-0"
                              )}
                              style={{ height: `${barHeight}%` }}
                            />
                          </div>

                          {/* Etiqueta de la hora */}
                          <div className="flex flex-col items-center gap-0.5 mt-0.5">
                            <span
                              className={cn(
                                "text-[11px] whitespace-nowrap",
                                isPeak
                                  ? "font-black text-amber-400"
                                  : isLaboral
                                  ? "font-bold text-foreground"
                                  : "font-medium text-muted-foreground text-[10px]"
                              )}
                            >
                              {formatHoraLabel(h)}
                            </span>
                            {/* Indicador de jornada laboral */}
                            <span
                              className={cn(
                                "h-1 w-1 rounded-full",
                                isPeak
                                  ? "bg-amber-400 shadow-sm shadow-amber-400"
                                  : isLaboral
                                  ? "bg-emerald-500/80"
                                  : "bg-muted-foreground/30"
                              )}
                              title={isLaboral ? "Horario laboral del taller" : "Fuera de horario"}
                            />
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>

                {/* Fila 5: Panel Informativo Interactivo / Detalle al pasar el cursor */}
                <div className="p-3.5 rounded-xl bg-muted/40 border border-border/60 transition-all">
                  {hoveredHour !== null ? (
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs animate-in fade-in-50 duration-150">
                      <div className="flex items-center gap-2.5">
                        <div className="h-7 w-7 rounded-lg bg-brand-500/10 text-brand-400 grid place-items-center font-black text-xs">
                          {formatHoraLabel(hoveredHour)}
                        </div>
                        <div>
                          <p className="font-bold text-foreground">
                            Franja: <span className="text-brand-400">{formatHoraRangoCompleto(hoveredHour)}</span>
                            {hoveredHour >= 8 && hoveredHour < 17 ? (
                              <span className="ml-2 px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                                Horario Laboral del Taller
                              </span>
                            ) : (
                              <span className="ml-2 px-2 py-0.5 rounded-full text-[10px] font-bold bg-muted text-muted-foreground border border-border">
                                Fuera de Horario
                              </span>
                            )}
                          </p>
                          <p className="text-[11px] text-muted-foreground">
                            Volumen en esta hora: <span className="font-bold text-foreground">{(activeHoras[hoveredHour] || 0).toLocaleString()} mensajes</span> ({totalSegmentMsgs > 0 ? (((activeHoras[hoveredHour] || 0) / totalSegmentMsgs) * 100).toFixed(1) : 0}% del tráfico activo)
                          </p>
                        </div>
                      </div>

                      {/* Desglose de Actores para la hora seleccionada */}
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="px-2.5 py-1 rounded-lg bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 font-bold text-xs flex items-center gap-1">
                          <Users className="h-3 w-3" />
                          <span>Clientes: {(rawClientesHoras[hoveredHour] || 0).toLocaleString()}</span>
                        </span>
                        <span className="px-2.5 py-1 rounded-lg bg-violet-500/10 border border-violet-500/20 text-violet-400 font-bold text-xs flex items-center gap-1">
                          <Wrench className="h-3 w-3" />
                          <span>Técnicos: {(rawTecnicosHoras[hoveredHour] || 0).toLocaleString()}</span>
                        </span>
                        <span className="px-2.5 py-1 rounded-lg bg-cyan-500/10 border border-cyan-500/20 text-cyan-400 font-bold text-xs flex items-center gap-1">
                          <Bot className="h-3 w-3" />
                          <span>IA: {(rawIAHoras[hoveredHour] || 0).toLocaleString()}</span>
                        </span>
                      </div>
                    </div>
                  ) : (
                    <div className="flex items-center justify-between text-xs text-muted-foreground flex-wrap gap-2">
                      <div className="flex items-center gap-1.5">
                        <Info className="h-3.5 w-3.5 text-brand-400" />
                        <span>Pase el cursor sobre cualquier barra para auditar el desglose exacto de Clientes, Técnicos e IA.</span>
                      </div>
                      <span className="text-[11px]">
                        Horario oficial de atención: <strong className="text-foreground">Lunes a Viernes de 8:00 AM a 5:00 PM</strong>
                      </span>
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}