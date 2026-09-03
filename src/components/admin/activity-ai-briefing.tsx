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

interface BriefingData {
  resumen_ejecutivo: string;
  score_productividad: number;
  horas_efectivas: string;
  horas_inactivas: string;
  principales_logros: string[];
  alertas_observaciones: string[];
  recomendacion_gerencial: string;
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
  timeline?: any[];
  allAgents?: LiveAgent[];
}

export function ActivityAiBriefing({
  agentEmail,
  agentName,
  date,
  timeline = [],
  allAgents = [],
}: Props) {
  const [scope, setScope] = useState<"user" | "team">("user");
  const [selectedAgentEmail, setSelectedAgentEmail] = useState<string>(agentEmail || "");
  const [briefing, setBriefing] = useState<BriefingData | null>(null);
  const [userBreakdown, setUserBreakdown] = useState<UserBreakdownItem[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (agentEmail && scope === "user") {
      setSelectedAgentEmail(agentEmail);
    }
  }, [agentEmail, scope]);

  const generateBriefing = async () => {
    setLoading(true);
    try {
      const isTeam = scope === "team";
      const targetEmail = isTeam ? "all" : selectedAgentEmail || agentEmail;
      const targetName = isTeam
        ? "Equipo General"
        : allAgents.find((a) => a.email === targetEmail)?.name || agentName || targetEmail;

      const res = await fetch("/api/activity/ai-briefing", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          agent_email: targetEmail,
          agent_name: targetName,
          date,
          scope,
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
        setUserBreakdown(data.stats?.userBreakdown || []);
        toast.success(
          isTeam
            ? "Informe Ejecutivo General del Equipo generado con éxito."
            : `Dictamen de auditoría para ${targetName} generado.`
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
      {/* ── BARRA DE CONFIGURACIÓN Y GENERACIÓN ── */}
      <div className="p-5 rounded-3xl bg-card border border-border/80 shadow-sm flex flex-col lg:flex-row lg:items-center justify-between gap-4 print:hidden">
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <span className="p-2 rounded-xl bg-violet-500/10 text-violet-400 border border-violet-500/20">
              <Sparkles className="h-4 w-4" />
            </span>
            <h3 className="font-extrabold text-sm text-foreground">
              Generador de Informes & Dictamen con IA
            </h3>
            <span className="text-[10px] font-black uppercase px-2 py-0.5 rounded-full bg-violet-500/15 text-violet-400 border border-violet-500/30">
              Panel Agente IA
            </span>
          </div>
          <p className="text-xs text-muted-foreground">
            Auditoría estructurada, clara, puntual y con redacción ejecutiva para supervisión y gerencia.
          </p>
        </div>

        {/* Controles de Selección */}
        <div className="flex flex-wrap items-center gap-2.5">
          {/* Selector de Alcance: General vs Individual */}
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
              Por Usuario
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
              Informe General (Equipo)
            </button>
          </div>

          {/* Selector de Usuario si está en modo individual */}
          {scope === "user" && allAgents.length > 0 && (
            <select
              value={selectedAgentEmail}
              onChange={(e) => setSelectedAgentEmail(e.target.value)}
              className="px-3 py-2 rounded-xl border border-border bg-background text-xs font-semibold text-foreground focus:outline-none focus:ring-1 focus:ring-violet-500"
            >
              {allAgents.map((ag) => (
                <option key={ag.email} value={ag.email}>
                  {ag.name} ({ag.role})
                </option>
              ))}
            </select>
          )}

          {/* Botón Generar */}
          <button
            onClick={generateBriefing}
            disabled={loading}
            className="flex items-center justify-center gap-2 px-4 py-2 rounded-xl bg-violet-600 hover:bg-violet-700 text-white text-xs font-bold shadow-md shadow-violet-600/25 transition-all disabled:opacity-50"
          >
            {loading ? (
              <RotateCw className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <Sparkles className="h-3.5 w-3.5" />
            )}
            {briefing ? "Re-generar Informe" : "Generar Dictamen del Día"}
          </button>

          {/* Exportaciones */}
          <button
            onClick={exportCSV}
            className="flex items-center gap-1.5 px-3 py-2 rounded-xl border border-border bg-background hover:bg-muted text-xs font-semibold transition-colors"
            title="Exportar a CSV / Excel"
          >
            <Download className="h-3.5 w-3.5" />
            <span className="hidden sm:inline">Excel</span>
          </button>

          <button
            onClick={handlePrint}
            className="flex items-center gap-1.5 px-3 py-2 rounded-xl border border-border bg-background hover:bg-muted text-xs font-semibold transition-colors"
            title="Imprimir o Exportar en PDF"
          >
            <Printer className="h-3.5 w-3.5" />
            <span className="hidden sm:inline">PDF</span>
          </button>
        </div>
      </div>

      {/* ── CUERPO DEL INFORME CON MEMBRETE EJECUTIVO ── */}
      {!briefing ? (
        <div className="p-16 text-center rounded-3xl bg-card border border-border/70 shadow-sm space-y-3">
          <div className="h-12 w-12 rounded-2xl bg-violet-500/10 text-violet-400 grid place-items-center mx-auto">
            <Sparkles className="h-6 w-6 animate-pulse" />
          </div>
          <p className="text-sm font-bold text-foreground">Informe Ejecutivo no generado aún</p>
          <p className="text-xs text-muted-foreground max-w-md mx-auto leading-relaxed">
            Haga clic en <strong>&ldquo;Generar Dictamen del Día&rdquo;</strong> para que la IA elabore un informe
            detallado, puntual y estructurado del {scope === "team" ? "equipo completo" : currentSelectedName}.
          </p>
        </div>
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
                  <Calendar className="h-3.5 w-3.5 text-violet-400" /> Fecha: {date}
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
            <p className="text-xs text-foreground/90 leading-relaxed whitespace-pre-line text-justify">
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