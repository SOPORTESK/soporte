"use client";

import React, { useState, useEffect } from "react";
import {
  Sparkles,
  Printer,
  Download,
  CheckCircle2,
  AlertTriangle,
  Award,
  TrendingUp,
  Clock,
  Briefcase,
  FileText,
  RotateCw,
  Users,
  User,
  ShieldCheck,
  Calendar,
  Building2,
} from "lucide-react";
import { toast } from "sonner";
import { type LiveAgent } from "./activity-live-pulse";

export interface IeeeReportStructure {
  title: string;
  abstract: string;
  keywords: string[];
  sections: {
    number: string;
    title: string;
    content: string;
  }[];
  conclusions: string;
  complianceVerdict: "CONFORME" | "NO CONFORME" | "CONDICIONAL";
  verdictDetail: string;
}

interface BriefingData {
  resumen_ejecutivo: string;
  score_productividad: number;
  horas_efectivas: string;
  horas_inactivas: string;
  principales_logros: string[];
  alertas_observaciones: string[];
  recomendacion_gerencial: string;
  ieee_report?: IeeeReportStructure;
}

interface UserBreakdownItem {
  name: string;
  activeMinutes: number;
  idleMinutes: number;
  eventsCount: number;
  casesCount: number;
  score: number;
}

interface Props {
  agentEmail?: string;
  agentName?: string;
  date: string;
  endDate?: string;
  timeline?: any[];
  allAgents?: LiveAgent[];
}

export function ActivityAiBriefing({
  agentEmail,
  agentName,
  date,
  endDate,
  timeline = [],
  allAgents = [],
}: Props) {
  const [scope, setScope] = useState<"user" | "team">("user");
  const [formatMode, setFormatMode] = useState<"standard" | "ieee">("ieee");
  const [selectedAgentEmail, setSelectedAgentEmail] = useState<string>(agentEmail || "");
  const [briefing, setBriefing] = useState<BriefingData | null>(null);
  const [userBreakdown, setUserBreakdown] = useState<UserBreakdownItem[]>([]);
  const [loading, setLoading] = useState(false);

  // Estados de control temporal (1 Día vs Rango de Fechas)
  const [dateMode, setDateMode] = useState<"single" | "range">(
    endDate && endDate !== date ? "range" : "single"
  );
  const [startDate, setStartDate] = useState<string>(date);
  const [customEndDate, setCustomEndDate] = useState<string>(endDate || date);
  const [reportDateLabel, setReportDateLabel] = useState<string>(
    endDate && endDate !== date ? `${date} al ${endDate}` : date
  );

  useEffect(() => {
    if (agentEmail && scope === "user") {
      setSelectedAgentEmail(agentEmail);
    }
  }, [agentEmail, scope]);

  useEffect(() => {
    setStartDate(date);
    if (endDate && endDate !== date) {
      setDateMode("range");
      setCustomEndDate(endDate);
      setReportDateLabel(`${date} al ${endDate}`);
    } else {
      setCustomEndDate(date);
      setReportDateLabel(date);
    }
  }, [date, endDate]);

  const applyDatePreset = (preset: "hoy" | "ayer" | "7d" | "15d" | "mes") => {
    const now = new Date();
    const toYMD = (d: Date) => d.toISOString().split("T")[0];
    if (preset === "hoy") {
      const today = toYMD(now);
      setDateMode("single");
      setStartDate(today);
      setCustomEndDate(today);
    } else if (preset === "ayer") {
      const yest = new Date(now.getTime() - 86400000);
      const yStr = toYMD(yest);
      setDateMode("single");
      setStartDate(yStr);
      setCustomEndDate(yStr);
    } else if (preset === "7d") {
      const past7 = new Date(now.getTime() - 6 * 86400000);
      setDateMode("range");
      setStartDate(toYMD(past7));
      setCustomEndDate(toYMD(now));
    } else if (preset === "15d") {
      const past15 = new Date(now.getTime() - 14 * 86400000);
      setDateMode("range");
      setStartDate(toYMD(past15));
      setCustomEndDate(toYMD(now));
    } else if (preset === "mes") {
      const firstDay = new Date(now.getFullYear(), now.getMonth(), 1);
      setDateMode("range");
      setStartDate(toYMD(firstDay));
      setCustomEndDate(toYMD(now));
    }
  };

  const generateBriefing = async () => {
    setLoading(true);
    try {
      const isTeam = scope === "team";
      const targetEmail = isTeam ? "all" : selectedAgentEmail || agentEmail;
      const targetName = isTeam
        ? "Equipo General"
        : allAgents.find((a) => a.email === targetEmail)?.name || agentName || targetEmail;

      const isRange = dateMode === "range" && startDate !== customEndDate;
      const effStart = startDate <= customEndDate ? startDate : customEndDate;
      const effEnd = startDate <= customEndDate ? customEndDate : startDate;
      const activeLabel = isRange ? `${effStart} al ${effEnd}` : effStart;

      const res = await fetch("/api/activity/ai-briefing", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          agent_email: targetEmail,
          agent_name: targetName,
          date: effStart,
          startDate: effStart,
          endDate: isRange ? effEnd : effStart,
          scope,
          format: formatMode,
        }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Error al generar informe");

      if (data.empty) {
        toast.info(data.message);
        setBriefing(null);
        setUserBreakdown([]);
      } else {
        setBriefing(data.briefing);
        setReportDateLabel(data.dateLabel || activeLabel);
        setUserBreakdown(data.stats?.userBreakdown || []);
        toast.success(
          isTeam
            ? `Informe Ejecutivo General del Equipo (${data.dateLabel || activeLabel}) generado.`
            : `Dictamen de auditoría para ${targetName} (${data.dateLabel || activeLabel}) generado.`
        );
      }
    } catch (e: any) {
      toast.error("Error al procesar dictamen", { description: e.message });
    } finally {
      setLoading(false);
    }
  };

  const handlePrint = () => {
    window.print();
  };

  const exportCSV = () => {
    if (scope === "team" && userBreakdown.length > 0) {
      const headers = ["Colaborador", "Minutos Activos", "Minutos Inactivos", "Score %", "Casos Atendidos", "Eventos Registrados"];
      const rows = userBreakdown.map((u) => [
        `"${u.name}"`,
        u.activeMinutes,
        u.idleMinutes,
        `${u.score}%`,
        u.casesCount,
        u.eventsCount,
      ]);
      const csv = "data:text/csv;charset=utf-8,\uFEFF" + [headers.join(","), ...rows.map((r) => r.join(","))].join("\n");
      const encoded = encodeURI(csv);
      const link = document.createElement("a");
      link.setAttribute("href", encoded);
      link.setAttribute("download", `informe_general_equipo_${date}.csv`);
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      toast.success("Consolidado de equipo exportado en CSV/Excel.");
      return;
    }

    if (!timeline || timeline.length === 0) {
      toast.error("No hay registros de eventos para exportar.");
      return;
    }

    const headers = ["Fecha", "Hora", "Colaborador", "Categoría", "Acción", "Duración (s)", "App / Detalle"];
    const rows = timeline.map((t) => {
      const d = new Date(t.created_at);
      const timeStr = d.toLocaleTimeString("es-CR", { hour: "2-digit", minute: "2-digit", second: "2-digit" });
      const durSec = Math.round((t.duration_ms || 0) / 1000);
      const meta = t.metadata || {};
      const appName = meta.app_name || meta.label || meta.page || "";
      return [
        `"${date}"`,
        `"${timeStr}"`,
        `"${agentName || agentEmail}"`,
        `"${t.category || ""}"`,
        `"${(t.action || "").replace(/"/g, '""')}"`,
        durSec,
        `"${appName.replace(/"/g, '""')}"`,
      ].join(",");
    });

    const csvContent = "data:text/csv;charset=utf-8,\uFEFF" + [headers.join(","), ...rows].join("\n");
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement("a");
    link.setAttribute("href", encodedUri);
    link.setAttribute("download", `auditoria_${selectedAgentEmail || "usuario"}_${date}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    toast.success("Archivo CSV/Excel exportado exitosamente.");
  };

  const currentSelectedName =
    scope === "team"
      ? "Consolidado General de la Empresa"
      : allAgents.find((a) => a.email === selectedAgentEmail)?.name || agentName || selectedAgentEmail;

  return (
    <div className="space-y-6">
      {/* ── BARRA DE CONFIGURACIÓN Y GENERACIÓN PREMIUM (2 NIVELES) ── */}
      <div className="p-6 rounded-3xl bg-card border border-border/80 shadow-md space-y-4 print:hidden">
        {/* Nivel 1: Título Oficial, Descripción y Acciones de Alto Nivel */}
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="flex items-start sm:items-center gap-3">
            <div className="p-2.5 rounded-2xl bg-violet-500/10 text-violet-400 border border-violet-500/20 shadow-inner shrink-0">
              <Sparkles className="h-5 w-5" />
            </div>
            <div>
              <div className="flex items-center gap-2.5 flex-wrap">
                <h2 className="text-base sm:text-lg font-black text-foreground tracking-tight whitespace-nowrap">
                  Generador de Informes & Dictamen con IA
                </h2>
                <span className="text-[10px] font-black uppercase tracking-wider px-2.5 py-0.5 rounded-full bg-violet-500/15 text-violet-400 border border-violet-500/30 shrink-0">
                  Panel Agente IA
                </span>
              </div>
              <p className="text-xs text-muted-foreground mt-0.5 leading-relaxed">
                Auditoría estructurada, clara, puntual y con redacción ejecutiva para supervisión y gerencia.
              </p>
            </div>
          </div>

          {/* Acciones principales del Nivel 1: Generar + Exportaciones */}
          <div className="flex items-center gap-2.5 self-start md:self-center shrink-0">
            {/* Exportaciones en grupo estilizado */}
            <div className="flex items-center rounded-xl border border-border bg-background p-0.5 shadow-sm">
              <button
                onClick={exportCSV}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg hover:bg-muted text-xs font-semibold text-muted-foreground hover:text-foreground transition-colors"
                title="Exportar a CSV / Excel"
              >
                <Download className="h-3.5 w-3.5 text-emerald-400" />
                <span>Excel</span>
              </button>
              <div className="h-4 w-px bg-border" />
              <button
                onClick={handlePrint}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg hover:bg-muted text-xs font-semibold text-muted-foreground hover:text-foreground transition-colors"
                title="Imprimir o Exportar en PDF"
              >
                <Printer className="h-3.5 w-3.5 text-sky-400" />
                <span>PDF</span>
              </button>
            </div>

            {/* Botón Principal Generar */}
            <button
              onClick={generateBriefing}
              disabled={loading}
              className="flex items-center justify-center gap-2 px-4 py-2 rounded-xl bg-gradient-to-r from-violet-600 to-indigo-600 hover:from-violet-500 hover:to-indigo-500 text-white text-xs font-bold shadow-md shadow-violet-600/25 transition-all disabled:opacity-50 active:scale-95 shrink-0"
            >
              {loading ? (
                <RotateCw className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <Sparkles className="h-3.5 w-3.5" />
              )}
              <span>
                {briefing
                  ? "Re-generar Informe"
                  : dateMode === "range"
                  ? "Generar Dictamen del Periodo"
                  : "Generar Dictamen del Día"}
              </span>
            </button>
          </div>
        </div>

        {/* Nivel 2: Barra de Filtros, Alcance, Formato y Selección de Período Temporal */}
        <div className="pt-3.5 border-t border-border/50 space-y-3">
          {/* Fila A: Alcance, Formato y Selección de Colaborador */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div className="flex flex-wrap items-center gap-3">
              {/* Selector de Alcance */}
              <div className="flex items-center p-1 rounded-xl bg-muted/40 border border-border">
                <button
                  onClick={() => setScope("user")}
                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${
                    scope === "user"
                      ? "bg-violet-600 text-white shadow-sm"
                      : "text-muted-foreground hover:text-foreground"
                  }`}
                >
                  <User className="h-3.5 w-3.5" />
                  <span>Por Usuario</span>
                </button>
                <button
                  onClick={() => setScope("team")}
                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${
                    scope === "team"
                      ? "bg-violet-600 text-white shadow-sm"
                      : "text-muted-foreground hover:text-foreground"
                  }`}
                >
                  <Users className="h-3.5 w-3.5" />
                  <span>Informe General (Equipo)</span>
                </button>
              </div>

              {/* Selector de Formato: Ejecutivo vs Norma IEEE */}
              <div className="flex items-center p-1 rounded-xl bg-muted/40 border border-border">
                <button
                  onClick={() => setFormatMode("standard")}
                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${
                    formatMode === "standard"
                      ? "bg-violet-600 text-white shadow-sm"
                      : "text-muted-foreground hover:text-foreground"
                  }`}
                >
                  <FileText className="h-3.5 w-3.5" />
                  <span>Ejecutivo</span>
                </button>
                <button
                  onClick={() => setFormatMode("ieee")}
                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${
                    formatMode === "ieee"
                      ? "bg-violet-600 text-white shadow-sm"
                      : "text-muted-foreground hover:text-foreground"
                  }`}
                >
                  <Award className="h-3.5 w-3.5" />
                  <span>Norma IEEE</span>
                </button>
              </div>
            </div>

            {/* Selector de Usuario si está en modo individual */}
            {scope === "user" && allAgents.length > 0 && (
              <div className="flex items-center gap-2">
                <span className="text-[11px] font-bold text-muted-foreground uppercase tracking-wider hidden lg:inline">
                  Colaborador:
                </span>
                <select
                  value={selectedAgentEmail}
                  onChange={(e) => setSelectedAgentEmail(e.target.value)}
                  className="w-full sm:w-auto min-w-[260px] px-3 py-2 rounded-xl border border-border bg-background text-xs font-semibold text-foreground focus:outline-none focus:ring-1 focus:ring-violet-500 shadow-sm cursor-pointer"
                >
                  {allAgents.map((ag) => (
                    <option key={ag.email} value={ag.email}>
                      {ag.name} ({ag.role})
                    </option>
                  ))}
                </select>
              </div>
            )}
          </div>

          {/* Fila B: Filtros Temporales (Día Único vs Rango de Fechas) */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pt-2.5 border-t border-border/30">
            <div className="flex flex-wrap items-center gap-2.5">
              {/* Modalidad: Día vs Rango */}
              <div className="flex items-center p-0.5 rounded-xl bg-muted/40 border border-border">
                <button
                  onClick={() => setDateMode("single")}
                  className={`px-2.5 py-1 rounded-lg text-xs font-bold transition-all ${
                    dateMode === "single"
                      ? "bg-violet-600 text-white shadow-sm"
                      : "text-muted-foreground hover:text-foreground"
                  }`}
                >
                  1 Día
                </button>
                <button
                  onClick={() => {
                    setDateMode("range");
                    if (!customEndDate || customEndDate === startDate) {
                      setCustomEndDate(startDate);
                    }
                  }}
                  className={`px-2.5 py-1 rounded-lg text-xs font-bold transition-all ${
                    dateMode === "range"
                      ? "bg-violet-600 text-white shadow-sm"
                      : "text-muted-foreground hover:text-foreground"
                  }`}
                >
                  Rango de Tiempo
                </button>
              </div>

              {/* Controles de Entrada de Fechas */}
              {dateMode === "single" ? (
                <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-border bg-background shadow-sm text-xs font-semibold">
                  <Calendar className="h-3.5 w-3.5 text-muted-foreground" />
                  <input
                    type="date"
                    value={startDate}
                    onChange={(e) => {
                      setStartDate(e.target.value);
                      setCustomEndDate(e.target.value);
                    }}
                    className="bg-transparent text-foreground focus:outline-none cursor-pointer"
                  />
                </div>
              ) : (
                <div className="flex items-center gap-2 px-3 py-1.5 rounded-xl border border-border bg-background shadow-sm text-xs font-semibold">
                  <Calendar className="h-3.5 w-3.5 text-violet-400 shrink-0" />
                  <span className="text-[10px] text-muted-foreground uppercase font-bold">Desde:</span>
                  <input
                    type="date"
                    value={startDate}
                    onChange={(e) => setStartDate(e.target.value)}
                    className="bg-transparent text-foreground focus:outline-none cursor-pointer"
                  />
                  <span className="text-muted-foreground font-bold">→</span>
                  <span className="text-[10px] text-muted-foreground uppercase font-bold">Hasta:</span>
                  <input
                    type="date"
                    value={customEndDate}
                    onChange={(e) => setCustomEndDate(e.target.value)}
                    className="bg-transparent text-foreground focus:outline-none cursor-pointer"
                  />
                </div>
              )}
            </div>

            {/* Presets Rápidos de 1 Clic */}
            <div className="flex items-center gap-1.5 flex-wrap">
              <span className="text-[10px] uppercase font-bold text-muted-foreground/80 hidden sm:inline">
                Atajos:
              </span>
              <button
                onClick={() => applyDatePreset("hoy")}
                className="px-2.5 py-1 rounded-lg border border-border bg-background hover:bg-muted text-[11px] font-semibold text-muted-foreground hover:text-foreground transition-colors"
              >
                Hoy
              </button>
              <button
                onClick={() => applyDatePreset("ayer")}
                className="px-2.5 py-1 rounded-lg border border-border bg-background hover:bg-muted text-[11px] font-semibold text-muted-foreground hover:text-foreground transition-colors"
              >
                Ayer
              </button>
              <button
                onClick={() => applyDatePreset("7d")}
                className="px-2.5 py-1 rounded-lg border border-border bg-background hover:bg-muted text-[11px] font-semibold text-muted-foreground hover:text-foreground transition-colors"
              >
                7 días
              </button>
              <button
                onClick={() => applyDatePreset("15d")}
                className="px-2.5 py-1 rounded-lg border border-border bg-background hover:bg-muted text-[11px] font-semibold text-muted-foreground hover:text-foreground transition-colors"
              >
                15 días
              </button>
              <button
                onClick={() => applyDatePreset("mes")}
                className="px-2.5 py-1 rounded-lg border border-border bg-background hover:bg-muted text-[11px] font-semibold text-muted-foreground hover:text-foreground transition-colors"
              >
                Este mes
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* ── CUERPO DEL INFORME CON MEMBRETE EJECUTIVO O NORMA IEEE ── */}
      {!briefing ? (
        <div className="p-16 text-center rounded-3xl bg-card border border-border/70 shadow-sm space-y-3">
          <div className="h-12 w-12 rounded-2xl bg-violet-500/10 text-violet-400 grid place-items-center mx-auto">
            <Sparkles className="h-6 w-6 animate-pulse" />
          </div>
          <p className="text-sm font-bold text-foreground">
            {formatMode === "ieee" ? "Informe Norma IEEE no generado aún" : "Informe Ejecutivo no generado aún"}
          </p>
          <p className="text-xs text-muted-foreground max-w-md mx-auto leading-relaxed">
            Haga clic en <strong>&ldquo;Generar Dictamen&rdquo;</strong> para que la IA elabore un informe
            detallado bajo {formatMode === "ieee" ? "estándar IEEE de telemetría" : "formato ejecutivo"} del{" "}
            {scope === "team" ? "equipo completo" : currentSelectedName}.
          </p>
        </div>
      ) : formatMode === "ieee" && briefing.ieee_report ? (
        <IeeeDocumentView
          briefing={briefing}
          currentSelectedName={currentSelectedName}
          date={reportDateLabel}
          scope={scope}
          userBreakdown={userBreakdown}
        />
      ) : (
        <div className="space-y-6 print:p-0 print:space-y-4">
          {/* Membrete Oficial del Informe */}
          <div className="p-6 rounded-3xl bg-card border border-border/80 shadow-sm space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between pb-4 border-b border-border gap-3">
              <div className="flex items-center gap-3">
                <div className="h-10 w-10 rounded-2xl bg-gradient-to-tr from-violet-600 to-indigo-600 text-white grid place-items-center shadow-md">
                  <Building2 className="h-5 w-5" />
                </div>
                <div>
                  <h2 className="text-base font-black text-foreground uppercase tracking-tight">
                    Sekunet — Informe de Auditoría y Desempeño
                  </h2>
                  <p className="text-xs text-muted-foreground font-medium">
                    Departamento de Operaciones & Recursos Humanos
                  </p>
                </div>
              </div>

              <div className="text-left sm:text-right space-y-0.5 text-xs">
                <p className="font-bold text-foreground flex items-center sm:justify-end gap-1.5">
                  <Calendar className="h-3.5 w-3.5 text-violet-400" /> Periodo: {reportDateLabel}
                </p>
                <p className="text-muted-foreground text-[11px]">
                  Alcance: <strong className="text-foreground">{currentSelectedName}</strong>
                </p>
              </div>
            </div>

            {/* Tarjetas KPI Superiores */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div className="p-4 rounded-2xl bg-muted/25 border border-border/60 flex items-center gap-3.5">
                <div className="h-10 w-10 rounded-xl bg-violet-500/15 text-violet-400 grid place-items-center shrink-0">
                  <TrendingUp className="h-5 w-5" />
                </div>
                <div>
                  <p className="text-[10px] font-extrabold uppercase tracking-wider text-muted-foreground">
                    Índice de Productividad
                  </p>
                  <p className="text-2xl font-black text-violet-400">{briefing.score_productividad}%</p>
                </div>
              </div>

              <div className="p-4 rounded-2xl bg-muted/25 border border-border/60 flex items-center gap-3.5">
                <div className="h-10 w-10 rounded-xl bg-emerald-500/15 text-emerald-400 grid place-items-center shrink-0">
                  <Clock className="h-5 w-5" />
                </div>
                <div>
                  <p className="text-[10px] font-extrabold uppercase tracking-wider text-muted-foreground">
                    Tiempo Activo Efectivo
                  </p>
                  <p className="text-2xl font-black text-emerald-400">{briefing.horas_efectivas}</p>
                </div>
              </div>

              <div className="p-4 rounded-2xl bg-muted/25 border border-border/60 flex items-center gap-3.5">
                <div className="h-10 w-10 rounded-xl bg-amber-500/15 text-amber-400 grid place-items-center shrink-0">
                  <Clock className="h-5 w-5" />
                </div>
                <div>
                  <p className="text-[10px] font-extrabold uppercase tracking-wider text-muted-foreground">
                    Pausas / Inactividad
                  </p>
                  <p className="text-2xl font-black text-amber-400">{briefing.horas_inactivas}</p>
                </div>
              </div>
            </div>

            {/* Tabla Comparativa si es informe de equipo */}
            {scope === "team" && userBreakdown.length > 0 && (
              <div className="pt-2 space-y-2.5">
                <h4 className="text-xs font-black uppercase text-muted-foreground tracking-wider flex items-center gap-1.5">
                  <Users className="h-3.5 w-3.5 text-violet-500" /> Desglose Comparativo por Colaborador
                </h4>
                <div className="rounded-2xl border border-border overflow-hidden">
                  <table className="w-full text-xs text-left">
                    <thead className="bg-muted/50 border-b border-border font-bold text-muted-foreground text-[11px]">
                      <tr>
                        <th className="p-3">Colaborador</th>
                        <th className="p-3">Tiempo Activo</th>
                        <th className="p-3">Inactividad</th>
                        <th className="p-3">Casos</th>
                        <th className="p-3 text-right">Score</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border/60 bg-card">
                      {userBreakdown.map((u) => (
                        <tr key={u.name} className="hover:bg-muted/20 transition-colors">
                          <td className="p-3 font-bold text-foreground">{u.name}</td>
                          <td className="p-3 font-mono text-emerald-400">
                            {Math.floor(u.activeMinutes / 60)}h {u.activeMinutes % 60}m
                          </td>
                          <td className="p-3 font-mono text-amber-400">
                            {Math.floor(u.idleMinutes / 60)}h {u.idleMinutes % 60}m
                          </td>
                          <td className="p-3 font-semibold text-foreground/80">{u.casesCount}</td>
                          <td className="p-3 text-right">
                            <span className="font-bold px-2 py-0.5 rounded-full bg-violet-500/15 text-violet-400 border border-violet-500/20">
                              {u.score}%
                            </span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </div>

          {/* Resumen Ejecutivo Narrativo */}
          <div className="p-6 rounded-3xl bg-card border border-border/80 shadow-sm space-y-3">
            <div className="flex items-center gap-2">
              <FileText className="h-4 w-4 text-violet-500" />
              <h3 className="font-extrabold text-sm text-foreground">
                1. Resumen y Evaluación Ejecutiva
              </h3>
            </div>
            <p className="text-xs text-foreground/90 leading-relaxed whitespace-pre-line text-left">
              {briefing.resumen_ejecutivo}
            </p>
          </div>

          {/* Logros y Alertas en 2 Columnas */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
            {/* Logros y Puntos Fuertes */}
            <div className="p-6 rounded-3xl bg-card border border-border/80 shadow-sm space-y-3.5">
              <div className="flex items-center gap-2">
                <Award className="h-4 w-4 text-emerald-500" />
                <h3 className="font-extrabold text-sm text-foreground">
                  2. Actividades y Logros de Alto Impacto
                </h3>
              </div>
              <ul className="space-y-2.5">
                {briefing.principales_logros.map((item, idx) => (
                  <li key={idx} className="flex items-start gap-2.5 text-xs text-foreground/90">
                    <CheckCircle2 className="h-4 w-4 text-emerald-500 shrink-0 mt-0.5" />
                    <span>{item}</span>
                  </li>
                ))}
              </ul>
            </div>

            {/* Observaciones y Alertas */}
            <div className="p-6 rounded-3xl bg-card border border-border/80 shadow-sm space-y-3.5">
              <div className="flex items-center gap-2">
                <AlertTriangle className="h-4 w-4 text-amber-500" />
                <h3 className="font-extrabold text-sm text-foreground">
                  3. Observaciones y Pausas Detectadas
                </h3>
              </div>
              <ul className="space-y-2.5">
                {briefing.alertas_observaciones.map((item, idx) => (
                  <li key={idx} className="flex items-start gap-2.5 text-xs text-foreground/90">
                    <span className="h-2 w-2 rounded-full bg-amber-500 shrink-0 mt-1.5" />
                    <span>{item}</span>
                  </li>
                ))}
              </ul>
            </div>
          </div>

          {/* Recomendación Gerencial y Plan de Acción */}
          <div className="p-6 rounded-3xl bg-gradient-to-br from-violet-500/10 via-background to-background border border-violet-500/30 shadow-sm space-y-2.5">
            <div className="flex items-center gap-2">
              <Briefcase className="h-4 w-4 text-violet-400" />
              <h3 className="font-extrabold text-sm text-violet-300">
                4. Directriz y Plan de Acción Gerencial
              </h3>
            </div>
            <p className="text-xs text-foreground/90 leading-relaxed font-medium">
              {briefing.recomendacion_gerencial}
            </p>
          </div>
        </div>
      )}
    </div>
  );
}

function IeeeDocumentView({
  briefing,
  currentSelectedName,
  date,
  scope,
  userBreakdown,
}: {
  briefing: BriefingData;
  currentSelectedName: string;
  date: string;
  scope: "user" | "team";
  userBreakdown: UserBreakdownItem[];
}) {
  const ieee = briefing.ieee_report;
  if (!ieee) return null;

  return (
    <div className="p-8 sm:p-12 rounded-3xl bg-card border border-border/80 shadow-md space-y-8 text-foreground font-sans print:shadow-none print:border-none print:p-0">
      {/* IEEE Header / Banner */}
      <div className="border-b-2 border-foreground/80 pb-4 text-center space-y-1">
        <p className="text-[10px] sm:text-xs font-mono font-bold tracking-widest text-muted-foreground uppercase">
          IEEE Transactions on Operational Telemetry & Systems Engineering — Sekunet Technical Standard
        </p>
        <p className="text-[9px] text-muted-foreground">
          Document Identifier: IEEE-ST-SEK-{date.replace(/-/g, "")}-{scope === "team" ? "TEAM" : "AGENT"} &bull; Ref. ISO/IEC 9001:2015 &bull; Standard 730
        </p>
      </div>

      {/* Title & Author Affiliation */}
      <div className="text-center space-y-3 max-w-3xl mx-auto">
        <h1 className="text-xl sm:text-2xl font-black uppercase tracking-tight leading-snug">
          {ieee.title}
        </h1>
        <div className="text-xs text-muted-foreground space-y-0.5">
          <p className="font-semibold text-foreground">
            Laboratorio de Supervisión Telemétrica & Verificación de Integridad Sekunet
          </p>
          <p>
            Sujeto de Análisis: <strong className="text-foreground">{currentSelectedName}</strong> &bull; Periodo: <strong className="text-foreground">{date}</strong>
          </p>
          <p className="text-[11px] italic">
            Sekunet Technologies, Departamento de Operaciones y Control de Calidad
          </p>
        </div>
      </div>

      {/* Abstract & Index Terms (Standard IEEE Box) */}
      <div className="p-5 rounded-2xl bg-muted/30 border border-border/70 space-y-3 text-xs leading-relaxed">
        <p className="text-left">
          <strong className="font-extrabold uppercase italic">Abstract</strong>—
          <span className="font-serif sm:font-sans">{ieee.abstract}</span>
        </p>
        <p className="text-xs">
          <strong className="font-extrabold italic">Index Terms</strong>—{" "}
          <span className="italic text-muted-foreground">{ieee.keywords.join(", ")}.</span>
        </p>
      </div>

      {/* Telemetry Conservation Invariant (Table I) */}
      <div className="space-y-3">
        <div className="text-center">
          <p className="text-[11px] font-black uppercase tracking-widest text-muted-foreground">
            TABLE I
          </p>
          <p className="text-xs font-bold uppercase tracking-tight text-foreground">
            Cuantificación Telemétrica y Principio de Conservación Temporal
          </p>
        </div>
        <div className="rounded-xl border border-border overflow-hidden">
          <table className="w-full text-xs">
            <thead className="bg-muted/60 border-b border-border text-[11px] font-bold text-muted-foreground">
              <tr>
                <th className="p-2.5 text-left">Parámetro Operativo (Invariant)</th>
                <th className="p-2.5 text-center">Magnitud Registrada</th>
                <th className="p-2.5 text-center">Umbral de Referencia</th>
                <th className="p-2.5 text-right">Estado de Conformidad</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border/60 bg-card">
              <tr>
                <td className="p-2.5 font-medium">Labor Efectiva Neta (T_activo: PC + Taller)</td>
                <td className="p-2.5 text-center font-mono font-bold text-emerald-400">{briefing.horas_efectivas}</td>
                <td className="p-2.5 text-center text-muted-foreground">&ge; 6h 30m / Jornada</td>
                <td className="p-2.5 text-right">
                  <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                    CONFORME
                  </span>
                </td>
              </tr>
              <tr>
                <td className="p-2.5 font-medium">Lapsos de Inactividad y Latencia (T_inactivo)</td>
                <td className="p-2.5 text-center font-mono font-bold text-amber-400">{briefing.horas_inactivas}</td>
                <td className="p-2.5 text-center text-muted-foreground">&le; 1h 30m / Jornada</td>
                <td className="p-2.5 text-right">
                  <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-muted text-foreground border border-border">
                    REGISTRADO
                  </span>
                </td>
              </tr>
              <tr>
                <td className="p-2.5 font-medium">Índice Global de Utilización Efectiva (Score)</td>
                <td className="p-2.5 text-center font-mono font-bold text-violet-400">{briefing.score_productividad}%</td>
                <td className="p-2.5 text-center text-muted-foreground">&ge; 80% Norma</td>
                <td className="p-2.5 text-right">
                  <span className={`px-2 py-0.5 rounded text-[10px] font-bold border ${
                    ieee.complianceVerdict === "CONFORME"
                      ? "bg-emerald-500/15 text-emerald-400 border-emerald-500/30"
                      : ieee.complianceVerdict === "CONDICIONAL"
                      ? "bg-amber-500/15 text-amber-400 border-amber-500/30"
                      : "bg-rose-500/15 text-rose-400 border-rose-500/30"
                  }`}>
                    {ieee.complianceVerdict}
                  </span>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      {/* Si es alcance grupal, tabla de agentes con formato IEEE TABLE II */}
      {scope === "team" && userBreakdown.length > 0 && (
        <div className="space-y-3 pt-2">
          <div className="text-center">
            <p className="text-[11px] font-black uppercase tracking-widest text-muted-foreground">
              TABLE II
            </p>
            <p className="text-xs font-bold uppercase tracking-tight text-foreground">
              Distribución Telemétrica por Agente Operativo
            </p>
          </div>
          <div className="rounded-xl border border-border overflow-hidden">
            <table className="w-full text-xs">
              <thead className="bg-muted/60 border-b border-border text-[11px] font-bold text-muted-foreground">
                <tr>
                  <th className="p-2.5 text-left">Agente / Ingeniero</th>
                  <th className="p-2.5 text-center">T_activo</th>
                  <th className="p-2.5 text-center">T_inactivo</th>
                  <th className="p-2.5 text-center">Eventos</th>
                  <th className="p-2.5 text-right">Score</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border/60 bg-card">
                {userBreakdown.map((u) => (
                  <tr key={u.name}>
                    <td className="p-2.5 font-bold text-foreground">{u.name}</td>
                    <td className="p-2.5 text-center font-mono text-emerald-400">
                      {Math.floor(u.activeMinutes / 60)}h {u.activeMinutes % 60}m
                    </td>
                    <td className="p-2.5 text-center font-mono text-amber-400">
                      {Math.floor(u.idleMinutes / 60)}h {u.idleMinutes % 60}m
                    </td>
                    <td className="p-2.5 text-center font-mono">{u.eventsCount}</td>
                    <td className="p-2.5 text-right font-bold text-violet-400">{u.score}%</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Sections I to V */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-x-8 gap-y-6 pt-2">
        {ieee.sections.map((sec) => (
          <div key={sec.number} className="space-y-2">
            <h3 className="text-xs font-black uppercase tracking-wider text-foreground flex items-center gap-2 border-b border-border pb-1">
              <span className="text-violet-500 font-mono">{sec.number}.</span> {sec.title}
            </h3>
            <p className="text-xs text-foreground/80 leading-relaxed text-left whitespace-pre-line font-serif sm:font-sans">
              {sec.content}
            </p>
          </div>
        ))}
      </div>

      {/* Formal Verdict Seal & Signatures */}
      <div className="mt-8 pt-6 border-t-2 border-foreground/80 grid grid-cols-1 md:grid-cols-2 gap-6 items-center">
        <div className="p-4 rounded-2xl bg-muted/20 border border-border space-y-2">
          <div className="flex items-center gap-2">
            <ShieldCheck className="h-4 w-4 text-violet-400" />
            <h4 className="text-xs font-black uppercase tracking-wider text-foreground">
              Certificación de Cumplimiento Normativo
            </h4>
          </div>
          <p className="text-[11px] text-muted-foreground leading-relaxed">
            {ieee.verdictDetail}
          </p>
          <div className="pt-1">
            <span className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-black tracking-wider uppercase border ${
              ieee.complianceVerdict === "CONFORME"
                ? "bg-emerald-500/15 text-emerald-400 border-emerald-500/30"
                : ieee.complianceVerdict === "CONDICIONAL"
                ? "bg-amber-500/15 text-amber-400 border-amber-500/30"
                : "bg-rose-500/15 text-rose-400 border-rose-500/30"
            }`}>
              Dictamen: {ieee.complianceVerdict}
            </span>
          </div>
        </div>

        <div className="space-y-6 text-center sm:text-right">
          <div className="space-y-1">
            <div className="w-56 h-px bg-border ml-auto mr-auto sm:mr-0 mt-6" />
            <p className="text-xs font-bold text-foreground">Dirección de Auditoría Técnica</p>
            <p className="text-[10px] text-muted-foreground">Sistema de Verificación Automática Sekunet</p>
          </div>
        </div>
      </div>
    </div>
  );
}