"use client";

import React, { useState, useEffect, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import {
  LayoutDashboard,
  Cpu,
  Users,
  ShieldAlert,
  ShieldCheck,
  ShieldBan,
  CheckCircle,
  BarChart3,
  Globe,
  Activity,
  Repeat2,
  Clock,
  UserPlus,
  ArrowUpRight,
  TrendingUp,
  RefreshCw,
} from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { StatsExportButton } from "@/components/admin/stats-export-button";
import { ClientProfilePanel, type PerfilClienteDTO } from "@/components/admin/client-profile-panel";
import { EquiposTable } from "@/components/admin/equipos-table";
import { ProblemasFrecuentesInteractive, type ProblemaData } from "@/components/admin/problemas-frecuentes-interactive";
import { DataAuditBadge } from "@/components/admin/data-audit-badge";

export interface AnalyticsClientViewProps {
  totalClientes: number;
  totalCasos: number;
  clientesActivos: number;
  clientesRecurrentes: number;
  pctRecurrencia: number;
  frecuenciaProm: number;
  antiguedadProm: number;
  saludables: number;
  enAtencion: number;
  enRiesgoSalud: number;
  meses6: { label: string; nuevos: number; recurrentes: number }[];
  meses6Max: number;
  meses6Total: number;
  histogramaMap: Record<string, number>;
  histMax: number;
  canalesOrdenados: [string, number][];
  canalTotal: number;
  canalBadge: Record<string, string>;
  canalColors: Record<string, string>;
  canalLabels: Record<string, string>;
  clientesRiesgo: any[];
  heatmap: number[][];
  heatmapMax: number;
  franjas: string[];
  dias: string[];
  topEquipos: any[];
  topProblemas: ProblemaData[];
  maxProblema: number;
  perfiles: PerfilClienteDTO[];
  clientesBloqueados: any[];
}

type TabKey = "resumen" | "equipos" | "directorio" | "riesgos";

export function AnalyticsClientView(props: AnalyticsClientViewProps) {
  const {
    totalClientes,
    totalCasos,
    clientesActivos,
    clientesRecurrentes,
    pctRecurrencia,
    frecuenciaProm,
    antiguedadProm,
    saludables,
    enAtencion,
    enRiesgoSalud,
    meses6,
    meses6Max,
    meses6Total,
    histogramaMap,
    histMax,
    canalesOrdenados,
    canalTotal,
    canalColors,
    canalLabels,
    clientesRiesgo,
    heatmap,
    heatmapMax,
    franjas,
    dias,
    topEquipos,
    topProblemas,
    maxProblema,
    perfiles,
    clientesBloqueados,
  } = props;

  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [lastRefreshedAt, setLastRefreshedAt] = useState<Date>(new Date());
  const [realtimeStatus, setRealtimeStatus] = useState<"connected" | "connecting" | "disconnected">("connecting");

  const [activeTab, setActiveTab] = useState<TabKey>("resumen");

  const refreshData = () => {
    setIsRefreshing(true);
    startTransition(() => {
      router.refresh();
      setTimeout(() => {
        setIsRefreshing(false);
        setLastRefreshedAt(new Date());
      }, 500);
    });
  };

  // 1. Supabase Realtime subscription en sek_cases
  useEffect(() => {
    const supabase = createClient();
    const channel = supabase
      .channel("sek_cases_analytics_realtime")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "sek_cases" },
        () => {
          refreshData();
        }
      )
      .subscribe((status) => {
        if (status === "SUBSCRIBED") {
          setRealtimeStatus("connected");
        } else if (status === "CHANNEL_ERROR" || status === "TIMED_OUT") {
          setRealtimeStatus("disconnected");
        }
      });

    // 2. Auto-polling preventivo cada 30 segundos
    const interval = setInterval(() => {
      refreshData();
    }, 30000);

    return () => {
      supabase.removeChannel(channel);
      clearInterval(interval);
    };
  }, []);

  // Read initial tab from URL params or hash
  useEffect(() => {
    if (typeof window !== "undefined") {
      const url = new URL(window.location.href);
      const tabParam = url.searchParams.get("tab") as TabKey;
      if (tabParam && ["resumen", "equipos", "directorio", "riesgos"].includes(tabParam)) {
        setActiveTab(tabParam);
      }

      const handleHashOrState = () => {
        const hash = window.location.hash;
        if (
          hash === "#clientes-saludable" ||
          hash === "#clientes-atencion" ||
          hash === "#clientes-riesgo" ||
          hash === "#clientes-panel"
        ) {
          setActiveTab("directorio");
        }
      };

      handleHashOrState();
      window.addEventListener("hashchange", handleHashOrState);
      return () => window.removeEventListener("hashchange", handleHashOrState);
    }
  }, []);

  const handleTabChange = (tab: TabKey) => {
    setActiveTab(tab);
    if (typeof window !== "undefined") {
      const url = new URL(window.location.href);
      url.searchParams.set("tab", tab);
      window.history.replaceState({}, "", url.toString());
    }
  };

  const totalAlertasRiesgo = clientesRiesgo.length + (clientesBloqueados?.length || 0);

  return (
    <div className="space-y-6">
      {/* ══════════════════════════════════════════════════════════════════
          TABS NAVIGATION BAR — Compact, Modern & Intuitive
      ══════════════════════════════════════════════════════════════════ */}
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border/70 pb-3">
        <div className="flex items-center gap-1.5 p-1 bg-muted/40 rounded-2xl border border-border/60">
          <button
            type="button"
            onClick={() => handleTabChange("resumen")}
            className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-black transition-all ${
              activeTab === "resumen"
                ? "bg-card text-foreground shadow-sm border border-border/80"
                : "text-muted-foreground hover:text-foreground hover:bg-muted/60"
            }`}
          >
            <LayoutDashboard className="h-3.5 w-3.5 text-brand-500" />
            <span>Visión General</span>
          </button>

          <button
            type="button"
            onClick={() => handleTabChange("equipos")}
            className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-black transition-all ${
              activeTab === "equipos"
                ? "bg-card text-foreground shadow-sm border border-border/80"
                : "text-muted-foreground hover:text-foreground hover:bg-muted/60"
            }`}
          >
            <Cpu className="h-3.5 w-3.5 text-sky-500" />
            <span>Equipos & Fallas</span>
            <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-sky-500/10 text-sky-500 font-mono">
              {topEquipos.length}
            </span>
          </button>

          <button
            type="button"
            onClick={() => handleTabChange("directorio")}
            className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-black transition-all ${
              activeTab === "directorio"
                ? "bg-card text-foreground shadow-sm border border-border/80"
                : "text-muted-foreground hover:text-foreground hover:bg-muted/60"
            }`}
          >
            <Users className="h-3.5 w-3.5 text-violet-500" />
            <span>Directorio & CRM</span>
            <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-violet-500/10 text-violet-500 font-mono">
              {totalClientes}
            </span>
          </button>

          <button
            type="button"
            onClick={() => handleTabChange("riesgos")}
            className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-black transition-all ${
              activeTab === "riesgos"
                ? "bg-card text-foreground shadow-sm border border-border/80"
                : "text-muted-foreground hover:text-foreground hover:bg-muted/60"
            }`}
          >
            <ShieldAlert className={`h-3.5 w-3.5 ${totalAlertasRiesgo > 0 ? "text-rose-500" : "text-emerald-500"}`} />
            <span>Control de Riesgos</span>
            {totalAlertasRiesgo > 0 && (
              <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-rose-500/10 text-rose-500 font-bold">
                {totalAlertasRiesgo}
              </span>
            )}
          </button>
        </div>

        {/* Right action controls: Audit badge, Live status, Manual refresh & Export */}
        <div className="flex items-center gap-2 shrink-0">
          <div className="hidden sm:flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-emerald-500/25 bg-emerald-500/10 text-emerald-500 text-xs shadow-sm font-bold">
            <ShieldCheck className="h-3.5 w-3.5" />
            <span className="text-[11px]">100% Auditado</span>
          </div>

          <div className="flex items-center gap-2 px-3 py-1.5 rounded-xl border border-border/60 bg-card/60 backdrop-blur-sm text-xs shadow-sm">
            <span className="flex items-center gap-1.5 font-bold">
              <span
                className={`h-2 w-2 rounded-full ${
                  realtimeStatus === "connected"
                    ? "bg-emerald-500 animate-pulse shadow-sm shadow-emerald-500/50"
                    : realtimeStatus === "connecting"
                    ? "bg-amber-400 animate-pulse"
                    : "bg-muted-foreground/40"
                }`}
              />
              <span className="text-[11px] font-semibold text-muted-foreground">
                {realtimeStatus === "connected" ? "En vivo" : "Conectando"}
              </span>
            </span>

            <span className="h-3 w-px bg-border/80" />

            <button
              type="button"
              onClick={refreshData}
              disabled={isRefreshing || isPending}
              className="flex items-center gap-1.5 text-[11px] font-bold text-foreground hover:text-brand-500 transition-colors disabled:opacity-50"
              title={`Última sincronización: ${lastRefreshedAt.toLocaleTimeString("es-CR")}. Clic para forzar actualización.`}
            >
              <RefreshCw className={`h-3 w-3 ${isRefreshing || isPending ? "animate-spin text-brand-500" : "text-muted-foreground"}`} />
              <span>{isRefreshing || isPending ? "Sincronizando..." : "Actualizar"}</span>
            </button>
          </div>

          {activeTab === "directorio" && (
            <div className="shrink-0">
              <StatsExportButton
                data={perfiles.map(p => ({
                  Cliente: p.nombre,
                  Telefono: p.telefono,
                  Cedula: p.cedula,
                  Tipo: p.tipo,
                  Salud: p.salud,
                  Score: p.healthScore,
                  Tendencia: p.tendencia,
                  Total_Casos: p.total,
                  Resueltos: p.resueltos,
                  Abiertos: p.abiertos,
                  Antiguedad_Dias: p.antiguedadDias,
                  Dias_Sin_Contacto: p.diasSinContacto,
                  Frecuencia_Mes: p.frecuenciaMes,
                  Calificacion_Avg: p.avgCal !== null ? p.avgCal.toFixed(1) : "N/A",
                  Canal_Preferido: p.canalPreferido,
                  Primer_Caso: new Date(p.primerCaso).toLocaleDateString("es-CR"),
                  Ultimo_Caso: new Date(p.ultimoCaso).toLocaleDateString("es-CR"),
                }))}
                fileName="Cartera_Clientes_Sekunet"
              />
            </div>
          )}
        </div>
      </div>

      {/* ══════════════════════════════════════════════════════════════════
          TAB 1: VISIÓN GENERAL (Resumen Ejecutivo)
      ══════════════════════════════════════════════════════════════════ */}
      {activeTab === "resumen" && (
        <div className="space-y-6">
          {/* KPI ROW — 6 cards in bento style */}
          <section className="grid gap-3 grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
            {[
              {
                label: "Clientes",
                value: totalClientes.toString(),
                icon: Users,
                color: "text-brand-500",
                gradient: "from-brand-500/15 to-brand-500/5",
                sub: `${clientesActivos} activos`,
              },
              {
                label: "Recurrencia",
                value: `${pctRecurrencia}%`,
                icon: Repeat2,
                color: "text-violet-500",
                gradient: "from-violet-500/15 to-violet-500/5",
                sub: `${clientesRecurrentes} repiten`,
              },
              {
                label: "Frecuencia",
                value: frecuenciaProm.toString(),
                icon: Activity,
                color: "text-amber-400",
                gradient: "from-amber-400/15 to-amber-400/5",
                sub: "casos / mes",
              },
              {
                label: "Antigüedad",
                value:
                  antiguedadProm > 365
                    ? `${(antiguedadProm / 365).toFixed(1)}a`
                    : antiguedadProm > 30
                    ? `${Math.round(antiguedadProm / 30)}m`
                    : `${antiguedadProm}d`,
                icon: Clock,
                color: "text-sky-500",
                gradient: "from-sky-500/15 to-sky-500/5",
                sub: "promedio cartera",
              },
              {
                label: "Saludables",
                value: totalClientes > 0 ? `${Math.round((saludables / totalClientes) * 100)}%` : "—",
                icon: ShieldCheck,
                color: "text-sky-500",
                gradient: "from-sky-500/15 to-sky-500/5",
                sub: `${saludables} de ${totalClientes}`,
              },
              {
                label: "En Riesgo",
                value: enRiesgoSalud.toString(),
                icon: ShieldAlert,
                color: enRiesgoSalud > 0 ? "text-rose-500" : "text-muted-foreground",
                gradient:
                  enRiesgoSalud > 0 ? "from-rose-500/15 to-rose-500/5" : "from-muted/15 to-muted/5",
                sub: `${enAtencion} en atención`,
              },
            ].map((k, i) => (
              <div
                key={i}
                className="group relative rounded-2xl border border-border/60 bg-gradient-to-br from-card to-card/80 p-4 overflow-hidden hover:border-border hover:shadow-lg hover:-translate-y-0.5 transition-all duration-300"
              >
                <div
                  className={`absolute inset-0 bg-gradient-to-br ${k.gradient} opacity-0 group-hover:opacity-100 transition-opacity duration-500`}
                />
                <div className="relative">
                  <div
                    className={`inline-flex items-center justify-center h-8 w-8 rounded-lg bg-gradient-to-br ${k.gradient} ${k.color} mb-2`}
                  >
                    <k.icon className="h-4 w-4" />
                  </div>
                  <p className="text-[9px] font-black uppercase tracking-widest text-muted-foreground/70">{k.label}</p>
                  <p className={`text-2xl xl:text-3xl font-black mt-0.5 tracking-tight tabular-nums ${k.color}`}>
                    {k.value}
                  </p>
                  <p className="text-[10px] text-muted-foreground mt-1">{k.sub}</p>
                </div>
              </div>
            ))}
          </section>

          {/* BENTO GRID ROW 1 — Nuevos vs Recurrentes + Salud de Clientes */}
          <section className="grid gap-4 lg:grid-cols-12">
            {/* Nuevos vs Recurrentes */}
            <div className="lg:col-span-7 xl:col-span-8 rounded-2xl border border-border/60 bg-card p-5 overflow-hidden">
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-2.5">
                  <div className="h-7 w-7 rounded-lg bg-brand-500/10 text-brand-500 grid place-items-center">
                    <UserPlus className="h-3.5 w-3.5" />
                  </div>
                  <div>
                    <h3 className="text-sm font-black">Nuevos vs Recurrentes</h3>
                    <p className="text-[10px] text-muted-foreground">Clientes por mes · últimos 6 meses</p>
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  <DataAuditBadge
                    label="Semestre"
                    totalEsperado={meses6Total}
                    totalCalculado={meses6.reduce((acc, m) => acc + m.nuevos + m.recurrentes, 0)}
                    detalle="Comprobación de la suma mensual de clientes nuevos y recurrentes."
                    size="xs"
                  />
                  <span className="flex items-center gap-1 text-[10px] font-bold text-brand-500">
                    <span className="h-2 w-2 rounded-sm bg-brand-500" />
                    Nuevos
                  </span>
                  <span className="flex items-center gap-1 text-[10px] font-bold text-violet-500">
                    <span className="h-2 w-2 rounded-sm bg-violet-500" />
                    Recurrentes
                  </span>
                </div>
              </div>

              {meses6Total === 0 ? (
                <div className="flex flex-col items-center justify-center h-32 text-muted-foreground/60 gap-2">
                  <BarChart3 className="h-8 w-8 opacity-30" />
                  <span className="text-xs font-medium">Sin datos en los últimos 6 meses</span>
                </div>
              ) : (
                <div className="flex items-end gap-3 h-32">
                  {meses6.map((m, i) => (
                    <div
                      key={i}
                      className="flex-1 h-full flex flex-col justify-end items-center gap-0.5 group/m relative"
                    >
                      <div className="w-full flex flex-col-reverse gap-px justify-end">
                        <div
                          className="w-full bg-gradient-to-t from-violet-600/80 to-violet-400/60 rounded-t-none hover:opacity-90 transition-opacity cursor-default"
                          style={{ height: `${Math.round((m.recurrentes / meses6Max) * 128)}px` }}
                        />
                        <div
                          className="w-full bg-gradient-to-t from-brand-600/80 to-brand-400/60 rounded-t-sm hover:opacity-90 transition-opacity cursor-default"
                          style={{ height: `${Math.round((m.nuevos / meses6Max) * 128)}px` }}
                        />
                      </div>
                      <div className="absolute -top-8 left-1/2 -translate-x-1/2 hidden group-hover/m:flex flex-col items-center bg-foreground text-background text-[9px] font-bold px-1.5 py-0.5 rounded whitespace-nowrap z-10">
                        <span className="text-brand-300">{m.nuevos} nuevos</span>
                        <span className="text-violet-300">{m.recurrentes} recurrentes</span>
                      </div>
                    </div>
                  ))}
                </div>
              )}
              <div className="flex justify-between mt-2">
                {meses6.map((m, i) => (
                  <span key={i} className="flex-1 text-center text-[9px] text-muted-foreground/50">
                    {m.label}
                  </span>
                ))}
              </div>
            </div>

            {/* Salud de Clientes */}
            <div className="lg:col-span-5 xl:col-span-4 rounded-2xl border border-border/60 bg-card p-5 flex flex-col justify-between">
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-2.5">
                  <div className="h-7 w-7 rounded-lg bg-sky-500/10 text-sky-500 grid place-items-center">
                    <ShieldCheck className="h-3.5 w-3.5" />
                  </div>
                  <div>
                    <h3 className="text-sm font-black">Salud de Clientes</h3>
                    <p className="text-[10px] text-muted-foreground">Score dinámico de fidelidad y estado</p>
                  </div>
                </div>
                <DataAuditBadge
                  label="Cartera Clasificada"
                  totalEsperado={totalClientes}
                  totalCalculado={saludables + enAtencion + enRiesgoSalud}
                  detalle="Comprobación matemática cruzada: Saludables + En Atención + En Riesgo = Total de Clientes."
                  size="xs"
                />
              </div>

              <div className="flex items-center justify-center my-2">
                <div className="relative h-28 w-28">
                  <svg viewBox="0 0 36 36" className="h-full w-full -rotate-90">
                    <circle
                      cx="18"
                      cy="18"
                      r="14"
                      fill="none"
                      stroke="currentColor"
                      className="text-muted/30"
                      strokeWidth="3.5"
                    />
                    <circle
                      cx="18"
                      cy="18"
                      r="14"
                      fill="none"
                      stroke="currentColor"
                      className="text-sky-500"
                      strokeWidth="3.5"
                      strokeDasharray={`${totalClientes > 0 ? (saludables / totalClientes) * 88 : 0} 88`}
                      strokeDashoffset="0"
                      strokeLinecap="butt"
                    />
                    <circle
                      cx="18"
                      cy="18"
                      r="14"
                      fill="none"
                      stroke="currentColor"
                      className="text-amber-400"
                      strokeWidth="3.5"
                      strokeDasharray={`${totalClientes > 0 ? (enAtencion / totalClientes) * 88 : 0} 88`}
                      strokeDashoffset={`${totalClientes > 0 ? -((saludables / totalClientes) * 88) : 0}`}
                      strokeLinecap="butt"
                    />
                    <circle
                      cx="18"
                      cy="18"
                      r="14"
                      fill="none"
                      stroke="currentColor"
                      className="text-rose-500"
                      strokeWidth="3.5"
                      strokeDasharray={`${totalClientes > 0 ? (enRiesgoSalud / totalClientes) * 88 : 0} 88`}
                      strokeDashoffset={`${
                        totalClientes > 0 ? -(((saludables + enAtencion) / totalClientes) * 88) : 0
                      }`}
                      strokeLinecap="butt"
                    />
                  </svg>
                  <div className="absolute inset-0 flex flex-col items-center justify-center">
                    <span className="text-2xl font-black text-sky-500 tabular-nums">
                      {totalClientes > 0 ? Math.round((saludables / totalClientes) * 100) : 0}%
                    </span>
                    <span className="text-[9px] text-muted-foreground font-bold">saludables</span>
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-3 gap-2">
                {[
                  {
                    label: "Saludable",
                    count: saludables,
                    color: "bg-sky-500",
                    text: "text-sky-500",
                    hash: "clientes-saludable",
                  },
                  {
                    label: "Atención",
                    count: enAtencion,
                    color: "bg-amber-400",
                    text: "text-amber-400",
                    hash: "clientes-atencion",
                  },
                  {
                    label: "Riesgo",
                    count: enRiesgoSalud,
                    color: "bg-rose-500",
                    text: "text-rose-500",
                    hash: "clientes-riesgo",
                  },
                ].map(row => (
                  <button
                    key={row.label}
                    type="button"
                    onClick={() => {
                      if (typeof window !== "undefined") {
                        window.location.hash = row.hash;
                      }
                      setActiveTab("directorio");
                    }}
                    className="flex flex-col items-center p-2 rounded-xl bg-muted/20 border border-border/40 hover:bg-muted/40 transition-colors text-center group"
                  >
                    <div className="flex items-center gap-1.5 mb-1">
                      <span className={`h-2 w-2 rounded-full ${row.color}`} />
                      <span className="text-[10px] text-muted-foreground group-hover:text-foreground font-medium">
                        {row.label}
                      </span>
                    </div>
                    <span className={`text-sm font-black tabular-nums ${row.text}`}>{row.count}</span>
                  </button>
                ))}
              </div>
            </div>
          </section>

          {/* BENTO GRID ROW 2 — Histograma + Canales */}
          <section className="grid gap-4 lg:grid-cols-12">
            {/* Histograma: distribución de casos */}
            <div className="lg:col-span-7 rounded-2xl border border-border/60 bg-card p-5">
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-2.5">
                  <div className="h-7 w-7 rounded-lg bg-sky-500/10 text-sky-500 grid place-items-center">
                    <BarChart3 className="h-3.5 w-3.5" />
                  </div>
                  <div>
                    <h3 className="text-sm font-black">Casos por Cliente</h3>
                    <p className="text-[10px] text-muted-foreground">Distribución de frecuencia de atención</p>
                  </div>
                </div>
                <DataAuditBadge
                  label="Clientes Auditados"
                  totalEsperado={totalClientes}
                  totalCalculado={Object.values(histogramaMap).reduce((a, b) => a + b, 0)}
                  detalle="Comprobación matemática: La suma de clientes de todos los rangos del histograma coincide exactamente con la cartera total."
                  size="xs"
                />
              </div>
              <div className="space-y-2.5">
                {Object.entries(histogramaMap).map(([rango, count]) => {
                  const pct = Math.round((count / histMax) * 100);
                  return (
                    <div key={rango}>
                      <div className="flex items-center justify-between mb-1">
                        <span className="text-xs font-bold">
                          {rango} caso{rango === "1" ? "" : "s"}
                        </span>
                        <div className="flex items-center gap-1.5">
                          <span className="text-[10px] font-black tabular-nums text-sky-500">{count}</span>
                          <span className="text-[9px] text-muted-foreground">clientes</span>
                        </div>
                      </div>
                      <div className="h-1.5 w-full bg-muted/40 rounded-full overflow-hidden">
                        <div
                          className="h-full bg-gradient-to-r from-sky-600 to-sky-400 rounded-full transition-all"
                          style={{ width: `${pct}%` }}
                        />
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Canales de Atención */}
            <div className="lg:col-span-5 rounded-2xl border border-border/60 bg-card p-5">
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-2.5">
                  <div className="h-7 w-7 rounded-lg bg-brand-500/10 text-brand-500 grid place-items-center">
                    <Globe className="h-3.5 w-3.5" />
                  </div>
                  <div>
                    <h3 className="text-sm font-black">Canales de Atención</h3>
                    <p className="text-[10px] text-muted-foreground">Origen de las consultas y casos</p>
                  </div>
                </div>
                <DataAuditBadge
                  label="Casos por Canal"
                  totalEsperado={canalTotal}
                  totalCalculado={canalesOrdenados.reduce((acc, [, c]) => acc + c, 0)}
                  detalle="Comprobación matemática cruzada: La suma de casos por cada canal (WhatsApp, Web, etc.) coincide con el volumen total de casos."
                  size="xs"
                />
              </div>
              <div className="space-y-3">
                {canalesOrdenados.map(([canal, count]) => {
                  const pct = canalTotal > 0 ? Math.round((count / canalTotal) * 100) : 0;
                  return (
                    <div key={canal}>
                      <div className="flex items-center justify-between mb-1">
                        <span className="text-xs font-bold">{canalLabels[canal] || canal}</span>
                        <div className="flex items-center gap-1.5">
                          <span className="text-[10px] font-black tabular-nums">{count} casos</span>
                          <span className="text-[9px] text-muted-foreground">({pct}%)</span>
                        </div>
                      </div>
                      <div className="h-2 w-full bg-muted/50 rounded-full overflow-hidden">
                        <div
                          className={`h-full bg-gradient-to-r ${
                            canalColors[canal] || "from-gray-500 to-gray-400"
                          } rounded-full transition-all`}
                          style={{ width: `${pct}%` }}
                        />
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </section>

          {/* HEATMAP — Patrones de contacto */}
          <section className="rounded-2xl border border-border/60 bg-card p-5">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2.5">
                <div className="h-7 w-7 rounded-lg bg-violet-500/10 text-violet-500 grid place-items-center">
                  <Activity className="h-3.5 w-3.5" />
                </div>
                <div>
                  <h3 className="text-sm font-black">Patrones de Contacto</h3>
                  <p className="text-[10px] text-muted-foreground">
                    Cuándo escriben sus clientes — día × franja horaria (Costa Rica)
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-3 text-[9px] text-muted-foreground flex-wrap">
                <DataAuditBadge
                  label="Horarios Mapeados"
                  totalEsperado={totalCasos}
                  totalCalculado={heatmap.reduce((acc, row) => acc + row.reduce((a, b) => a + b, 0), 0)}
                  detalle="Comprobación de distribución horaria de todos los casos en franjas."
                  size="xs"
                />
                <div className="flex items-center gap-2">
                  <span>Menor</span>
                  <div className="flex gap-0.5">
                    {[0.1, 0.25, 0.5, 0.75, 1].map((o, i) => (
                      <span key={i} className="h-3 w-3 rounded-sm bg-violet-500" style={{ opacity: o }} />
                    ))}
                  </div>
                  <span>Mayor</span>
                </div>
              </div>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr>
                    <th className="px-2 py-1.5 text-left text-[9px] font-black uppercase tracking-widest text-muted-foreground/60 w-16"></th>
                    {franjas.map(f => (
                      <th
                        key={f}
                        className="px-2 py-1.5 text-center text-[9px] font-black uppercase tracking-widest text-muted-foreground/60"
                      >
                        {f}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {dias.map((dia, i) => (
                    <tr key={dia}>
                      <td className="px-2 py-1.5 text-[10px] font-black text-muted-foreground/70 uppercase">
                        {dia}
                      </td>
                      {heatmap[i].map((count, j) => {
                        const intensity = count / heatmapMax;
                        const opacity = count === 0 ? 0.04 : Math.max(0.15, intensity);
                        return (
                          <td key={j} className="px-1 py-1">
                            <div
                              className="h-8 rounded-md flex items-center justify-center text-[10px] font-bold transition-all hover:ring-2 hover:ring-violet-500/40"
                              style={{ backgroundColor: `rgba(139, 92, 246, ${opacity})` }}
                              title={`${dia} ${franjas[j]}: ${count} casos`}
                            >
                              <span className={count > 0 ? "text-white" : "text-muted-foreground/30"}>
                                {count > 0 ? count : "·"}
                              </span>
                            </div>
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p className="text-[9px] text-muted-foreground/60 mt-3">
              Madrugada: 0–6h · Mañana: 6–12h · Tarde: 12–18h · Noche: 18–24h
            </p>
          </section>
        </div>
      )}

      {/* ══════════════════════════════════════════════════════════════════
          TAB 2: EQUIPOS & FALLAS (Side by Side Premium Analysis)
      ══════════════════════════════════════════════════════════════════ */}
      {activeTab === "equipos" && (
        <section className="grid gap-4 lg:grid-cols-2">
          <div>
            <EquiposTable equipos={topEquipos} />
          </div>
          <div>
            <ProblemasFrecuentesInteractive problemas={topProblemas} maxProblema={maxProblema} />
          </div>
        </section>
      )}

      {/* ══════════════════════════════════════════════════════════════════
          TAB 3: DIRECTORIO & CARTERA CRM (Filtros, Búsqueda, Perfiles 360°)
      ══════════════════════════════════════════════════════════════════ */}
      {activeTab === "directorio" && (
        <section className="space-y-4">
          <ClientProfilePanel perfiles={perfiles} />
        </section>
      )}

      {/* ══════════════════════════════════════════════════════════════════
          TAB 4: CONTROL DE RIESGO & BLOQUEOS (Alertas y Prevención)
      ══════════════════════════════════════════════════════════════════ */}
      {activeTab === "riesgos" && (
        <div className="space-y-6">
          {/* Sub-header status banner */}
          <div className="grid gap-4 md:grid-cols-2">
            {/* Clientes en Riesgo (casos abiertos > 3 días) */}
            <div className="rounded-2xl border border-border/60 bg-card p-5">
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-2.5">
                  <div className="h-7 w-7 rounded-lg bg-rose-500/10 text-rose-500 grid place-items-center">
                    <ShieldAlert className="h-3.5 w-3.5" />
                  </div>
                  <div>
                    <h3 className="text-sm font-black">Casos Estancados (&gt;3 días)</h3>
                    <p className="text-[10px] text-muted-foreground">Clientes con casos abiertos sin actividad reciente</p>
                  </div>
                </div>
                <span className="text-xl font-black text-rose-500 tabular-nums">{clientesRiesgo.length}</span>
              </div>
              <div className="space-y-2">
                {clientesRiesgo.map((c, i) => {
                  const diasSinMover = Math.floor(
                    (new Date().getTime() - new Date(c.ultimoCaso).getTime()) / 86400000
                  );
                  return (
                    <div
                      key={i}
                      className="flex items-center justify-between p-3 rounded-xl bg-rose-500/5 border border-rose-500/15 hover:border-rose-500/30 transition-colors"
                    >
                      <div className="flex items-center gap-2.5 min-w-0">
                        <div className="h-8 w-8 rounded-lg bg-gradient-to-br from-rose-500/20 to-rose-600/20 text-rose-500 text-xs font-black grid place-items-center shrink-0">
                          {c.nombre[0]?.toUpperCase()}
                        </div>
                        <div className="min-w-0">
                          <span className="text-xs font-bold truncate block">{c.nombre}</span>
                          <span className="text-[10px] text-muted-foreground">
                            {c.abiertos} abierto{c.abiertos > 1 ? "s" : ""} · Tel: {c.telefono}
                          </span>
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="text-[10px] font-black text-rose-500 bg-rose-500/10 px-2 py-0.5 rounded-full shrink-0">
                          {diasSinMover}d sin mover
                        </span>
                        {c.ultimoCasoId && (
                          <Link
                            href={`/admin/casos/${c.ultimoCasoId}`}
                            className="p-1.5 rounded-lg hover:bg-rose-500/10 text-rose-500 transition-colors"
                            title="Ver caso"
                          >
                            <ArrowUpRight className="h-3.5 w-3.5" />
                          </Link>
                        )}
                      </div>
                    </div>
                  );
                })}
                {clientesRiesgo.length === 0 && (
                  <div className="flex flex-col items-center justify-center p-8 text-emerald-500 text-center gap-1.5">
                    <CheckCircle className="h-6 w-6 opacity-80" />
                    <span className="text-xs font-bold">¡Excelente! Ningún caso abierto estancado</span>
                    <span className="text-[10px] text-muted-foreground">
                      Todos los casos activos han sido atendidos en las últimas 72 horas.
                    </span>
                  </div>
                )}
              </div>
            </div>

            {/* Resumen del Algoritmo de Salud */}
            <div className="rounded-2xl border border-border/60 bg-card p-5">
              <div className="flex items-center gap-2.5 mb-4">
                <div className="h-7 w-7 rounded-lg bg-amber-500/10 text-amber-500 grid place-items-center">
                  <ShieldCheck className="h-3.5 w-3.5" />
                </div>
                <div>
                  <h3 className="text-sm font-black">Criterios de Riesgo Auditados</h3>
                  <p className="text-[10px] text-muted-foreground">Reglas matemáticas aplicadas sobre la base de datos</p>
                </div>
              </div>
              <div className="space-y-2.5 text-xs text-muted-foreground">
                <div className="p-3 rounded-xl bg-muted/30 border border-border/40">
                  <p className="font-bold text-foreground mb-1">1. Tasa de Resolución de Casos</p>
                  <p className="text-[11px]">
                    Clientes con más casos abiertos que resueltos sufren una penalización de hasta -25 puntos en su Score de Salud.
                  </p>
                </div>
                <div className="p-3 rounded-xl bg-muted/30 border border-border/40">
                  <p className="font-bold text-foreground mb-1">2. Calificaciones Históricas (&lt; 3 estrellas)</p>
                  <p className="text-[11px]">
                    Cada evaluación de 1 o 2 estrellas penaliza -15 puntos el score. Con 5 calificaciones negativas se activa el bloqueo preventivo.
                  </p>
                </div>
                <div className="p-3 rounded-xl bg-muted/30 border border-border/40">
                  <p className="font-bold text-foreground mb-1">3. Inactividad Prolongada (&gt; 90 días)</p>
                  <p className="text-[11px]">
                    Clientes recurrentes sin contacto en los últimos 90 días entran en estado &quot;Atención&quot; para evitar abandono de cartera.
                  </p>
                </div>
              </div>
            </div>
          </div>

          {/* Clientes Bloqueados */}
          <section className="space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-base font-bold flex items-center gap-2">
                  <ShieldBan className="h-4 w-4 text-red-500" /> Clientes Bloqueados en Base de Datos
                </h2>
                <p className="text-xs text-muted-foreground mt-0.5">
                  Bloqueo automático registrado en sek_clientes por 5 calificaciones menores a 2 estrellas o acción administrativa
                </p>
              </div>
            </div>
            {!clientesBloqueados || clientesBloqueados.length === 0 ? (
              <div className="p-10 text-center border border-dashed border-border/60 rounded-2xl text-muted-foreground">
                <ShieldCheck className="h-7 w-7 mx-auto mb-2 text-emerald-500/50" />
                <p className="text-xs font-bold text-foreground">No hay clientes bloqueados actualmente</p>
                <p className="text-[10px] text-muted-foreground mt-0.5">
                  Todos los clientes registrados tienen acceso normal al sistema de soporte.
                </p>
              </div>
            ) : (
              <div className="rounded-2xl border border-border/60 bg-card overflow-hidden">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-border/60 bg-muted/30">
                      <th className="text-left px-4 py-3 text-xs font-bold text-muted-foreground uppercase tracking-wider">
                        Cliente
                      </th>
                      <th className="text-left px-4 py-3 text-xs font-bold text-muted-foreground uppercase tracking-wider">
                        Cédula
                      </th>
                      <th className="text-right px-4 py-3 text-xs font-bold text-muted-foreground uppercase tracking-wider">
                        Calif. negativas
                      </th>
                      <th className="text-right px-4 py-3 text-xs font-bold text-muted-foreground uppercase tracking-wider">
                        Fecha bloqueo
                      </th>
                      <th className="text-right px-4 py-3 text-xs font-bold text-muted-foreground uppercase tracking-wider">
                        Acción
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {clientesBloqueados.map((c: any) => (
                      <tr
                        key={c.id}
                        className="border-b border-border/40 last:border-0 hover:bg-muted/30 transition-colors"
                      >
                        <td className="px-4 py-3">
                          <p className="font-semibold text-xs">{c.nombre}</p>
                          {c.correo && <p className="text-[10px] text-muted-foreground">{c.correo}</p>}
                        </td>
                        <td className="px-4 py-3 text-xs text-muted-foreground font-mono">{c.cedula || "—"}</td>
                        <td className="px-4 py-3 text-right">
                          <span className="inline-flex items-center gap-1 rounded-full bg-red-500/10 text-red-600 dark:text-red-400 px-2.5 py-0.5 text-xs font-bold">
                            <ShieldBan className="h-3 w-3" /> {c.bloqueo_contador || 0}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-right text-xs text-muted-foreground">
                          {c.fecha_bloqueo
                            ? new Date(c.fecha_bloqueo).toLocaleDateString("es-CR", {
                                day: "2-digit",
                                month: "short",
                                year: "numeric",
                              })
                            : "—"}
                        </td>
                        <td className="px-4 py-3 text-right">
                          <Link
                            href="/admin/clientes"
                            className="inline-flex items-center gap-1 rounded-lg bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-700 dark:text-emerald-400 border border-emerald-500/20 px-2.5 py-1 text-xs font-semibold transition-colors"
                          >
                            <ShieldCheck className="h-3 w-3" /> Gestionar
                          </Link>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        </div>
      )}
    </div>
  );
}
