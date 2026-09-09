"use client";

import * as React from "react";
import Link from "next/link";
import { MessageSquare, BarChart3, Bot, ArrowDownLeft, ArrowUpRight, Download, FileText, ExternalLink, Clock, Activity, TrendingUp, TrendingDown, Minus } from "lucide-react";
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

  // Cálculo de hora pico (si hay datos)
  const horas = stats.distribucionHoras || [];
  const maxHoraMsgs = Math.max(...horas, 0);
  const horaPicoIndex = horas.indexOf(maxHoraMsgs);
  const formatHoraLabel = (h: number) => {
    if (h === 0) return "12 AM";
    if (h === 12) return "12 PM";
    return h > 12 ? `${h - 12} PM` : `${h} AM`;
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

          {/* Distribución Horaria y Horas Pico (si hay mensajes) */}
          {maxHoraMsgs > 0 && (
            <div className="rounded-2xl border border-border/60 bg-card p-5 space-y-4">
              <div className="flex items-center justify-between flex-wrap gap-2">
                <div className="flex items-center gap-2">
                  <div className="h-7 w-7 rounded-lg bg-amber-500/10 text-amber-400 grid place-items-center">
                    <Clock className="h-4 w-4" />
                  </div>
                  <div>
                    <h3 className="text-sm font-black text-foreground">Horas Pico y Distribución de Tráfico</h3>
                    <p className="text-[11px] text-muted-foreground">Horarios de mayor volumen de mensajes (hora de Costa Rica)</p>
                  </div>
                </div>

                <div className="px-3 py-1 rounded-xl bg-amber-500/10 border border-amber-500/20 text-amber-400 text-xs font-bold flex items-center gap-1.5">
                  <span>🔥 Hora pico:</span>
                  <span className="font-black text-foreground">{formatHoraLabel(horaPicoIndex)}</span>
                  <span>({maxHoraMsgs.toLocaleString()} msgs)</span>
                </div>
              </div>

              {/* Barras de horas activas (7h a 20h) */}
              <div className="grid grid-cols-7 sm:grid-cols-14 gap-2 pt-2">
                {Array.from({ length: 14 }).map((_, i) => {
                  const h = i + 7; // 7 a 20 horas
                  const count = horas[h] || 0;
                  const pct = maxHoraMsgs > 0 ? Math.round((count / maxHoraMsgs) * 100) : 0;
                  const isPeak = h === horaPicoIndex && count > 0;

                  return (
                    <div key={h} className="flex flex-col items-center gap-1.5 group">
                      <span className="text-[10px] font-semibold text-muted-foreground">{count > 0 ? count : ""}</span>
                      <div className="w-full h-20 bg-muted/40 rounded-lg flex items-end p-1 overflow-hidden relative border border-border/40">
                        <div
                          className={cn(
                            "w-full rounded transition-all duration-500",
                            isPeak
                              ? "bg-amber-500 shadow-md shadow-amber-500/30"
                              : count > 0 ? "bg-brand-500/80 group-hover:bg-brand-500" : "bg-transparent"
                          )}
                          style={{ height: `${Math.max(pct, count > 0 ? 8 : 0)}%` }}
                        />
                      </div>
                      <span className={cn("text-[10px] font-bold", isPeak ? "text-amber-400" : "text-muted-foreground")}>
                        {formatHoraLabel(h)}
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}