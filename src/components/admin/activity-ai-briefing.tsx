"use client";

import React, { useState } from "react";
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
} from "lucide-react";
import { toast } from "sonner";

interface BriefingData {
  resumen_ejecutivo: string;
  score_productividad: number;
  horas_efectivas: string;
  horas_inactivas: string;
  principales_logros: string[];
  alertas_observaciones: string[];
  recomendacion_gerencial: string;
}

interface Props {
  agentEmail?: string;
  agentName?: string;
  date: string;
  timeline?: any[];
}

export function ActivityAiBriefing({ agentEmail, agentName, date, timeline = [] }: Props) {
  const [briefing, setBriefing] = useState<BriefingData | null>(null);
  const [loading, setLoading] = useState(false);

  const generateBriefing = async () => {
    if (!agentEmail) {
      toast.error("Seleccione un colaborador para generar el dictamen.");
      return;
    }
    setLoading(true);
    try {
      const res = await fetch("/api/activity/ai-briefing", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          agent_email: agentEmail,
          agent_name: agentName || agentEmail,
          date,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Error al generar informe");
      if (data.empty) {
        toast.info(data.message);
        setBriefing(null);
      } else {
        setBriefing(data.briefing);
        toast.success("Dictamen ejecutivo de IA generado con éxito.");
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
    if (!timeline || timeline.length === 0) {
      toast.error("No hay datos de línea de tiempo para exportar.");
      return;
    }
    const headers = ["Fecha", "Hora", "Colaborador", "Categoría", "Acción", "Duración (segundos)", "App / Detalle"];
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
    link.setAttribute("download", `auditoria_${agentEmail}_${date}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    toast.success("Archivo Excel/CSV exportado exitosamente.");
  };

  return (
    <div className="space-y-5">
      {/* Barra de control superior */}
      <div className="p-4 rounded-2xl bg-card border border-border/70 shadow-sm flex flex-col sm:flex-row items-center justify-between gap-3">
        <div>
          <h3 className="font-bold text-sm text-foreground flex items-center gap-2">
            <Sparkles className="h-4 w-4 text-violet-500" />
            Dictamen Ejecutivo de Auditoría con IA
          </h3>
          <p className="text-xs text-muted-foreground mt-0.5">
            Evaluación integral de desempeño, concentración y foco laboral generado con Gemini.
          </p>
        </div>

        <div className="flex items-center gap-2 w-full sm:w-auto">
          <button
            onClick={generateBriefing}
            disabled={loading || !agentEmail}
            className="flex-1 sm:flex-none flex items-center justify-center gap-2 px-4 py-2 rounded-xl bg-violet-600 hover:bg-violet-700 text-white text-xs font-bold shadow-md shadow-violet-600/20 transition-all disabled:opacity-50"
          >
            {loading ? (
              <RotateCw className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <Sparkles className="h-3.5 w-3.5" />
            )}
            {briefing ? "Re-generar Dictamen" : "Generar Dictamen del Día"}
          </button>

          <button
            onClick={exportCSV}
            className="flex items-center justify-center gap-1.5 px-3 py-2 rounded-xl border border-border bg-card hover:bg-muted text-xs font-semibold transition-colors"
            title="Exportar registros a CSV / Excel"
          >
            <Download className="h-3.5 w-3.5" />
            <span className="hidden md:inline">Exportar CSV</span>
          </button>

          <button
            onClick={handlePrint}
            className="flex items-center justify-center gap-1.5 px-3 py-2 rounded-xl border border-border bg-card hover:bg-muted text-xs font-semibold transition-colors"
            title="Imprimir o guardar como PDF"
          >
            <Printer className="h-3.5 w-3.5" />
            <span className="hidden md:inline">PDF</span>
          </button>
        </div>
      </div>

      {/* Contenido del informe */}
      {!briefing ? (
        <div className="p-12 text-center rounded-2xl bg-card border border-border/70 space-y-3">
          <Sparkles className="h-8 w-8 text-violet-500/50 mx-auto animate-pulse" />
          <p className="text-sm font-bold text-foreground">Dictamen Ejecutivo no generado aún</p>
          <p className="text-xs text-muted-foreground max-w-md mx-auto">
            Haga clic en <strong>"Generar Dictamen del Día"</strong> para que la IA consolide las horas efectivas, llamadas, chats y patrones de concentración de la jornada.
          </p>
        </div>
      ) : (
        <div className="space-y-4 print:p-0">
          {/* Tarjetas KPI del Dictamen */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div className="p-4 rounded-2xl bg-card border border-border/70 shadow-sm flex items-center gap-3">
              <div className="h-10 w-10 rounded-xl bg-violet-500/10 text-violet-400 grid place-items-center">
                <TrendingUp className="h-5 w-5" />
              </div>
              <div>
                <p className="text-[11px] font-bold uppercase text-muted-foreground">Productividad Global</p>
                <p className="text-xl font-black text-violet-400">{briefing.score_productividad}%</p>
              </div>
            </div>

            <div className="p-4 rounded-2xl bg-card border border-border/70 shadow-sm flex items-center gap-3">
              <div className="h-10 w-10 rounded-xl bg-emerald-500/10 text-emerald-400 grid place-items-center">
                <Clock className="h-5 w-5" />
              </div>
              <div>
                <p className="text-[11px] font-bold uppercase text-muted-foreground">Tiempo Efectivo</p>
                <p className="text-xl font-black text-emerald-400">{briefing.horas_efectivas}</p>
              </div>
            </div>

            <div className="p-4 rounded-2xl bg-card border border-border/70 shadow-sm flex items-center gap-3">
              <div className="h-10 w-10 rounded-xl bg-amber-500/10 text-amber-400 grid place-items-center">
                <Clock className="h-5 w-5" />
              </div>
              <div>
                <p className="text-[11px] font-bold uppercase text-muted-foreground">Pausas / Inactividad</p>
                <p className="text-xl font-black text-amber-400">{briefing.horas_inactivas}</p>
              </div>
            </div>
          </div>

          {/* Resumen Ejecutivo Narrativo */}
          <div className="p-5 rounded-2xl bg-card border border-border/70 shadow-sm space-y-3">
            <div className="flex items-center gap-2">
              <FileText className="h-4 w-4 text-violet-500" />
              <h4 className="font-bold text-sm text-foreground">Evaluación y Dictamen Narrativo</h4>
            </div>
            <p className="text-xs text-foreground/90 leading-relaxed whitespace-pre-line">
              {briefing.resumen_ejecutivo}
            </p>
          </div>

          {/* Logros y Alertas en 2 columnas */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* Logros */}
            <div className="p-5 rounded-2xl bg-card border border-border/70 shadow-sm space-y-3">
              <div className="flex items-center gap-2">
                <Award className="h-4 w-4 text-emerald-500" />
                <h4 className="font-bold text-sm text-foreground">Actividades y Focos de Mayor Impacto</h4>
              </div>
              <ul className="space-y-2">
                {briefing.principales_logros.map((item, idx) => (
                  <li key={idx} className="flex items-start gap-2 text-xs text-foreground/90">
                    <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500 shrink-0 mt-0.5" />
                    <span>{item}</span>
                  </li>
                ))}
              </ul>
            </div>

            {/* Observaciones */}
            <div className="p-5 rounded-2xl bg-card border border-border/70 shadow-sm space-y-3">
              <div className="flex items-center gap-2">
                <AlertTriangle className="h-4 w-4 text-amber-500" />
                <h4 className="font-bold text-sm text-foreground">Observaciones y Pausas Detectadas</h4>
              </div>
              <ul className="space-y-2">
                {briefing.alertas_observaciones.map((item, idx) => (
                  <li key={idx} className="flex items-start gap-2 text-xs text-foreground/90">
                    <span className="h-1.5 w-1.5 rounded-full bg-amber-500 shrink-0 mt-1.5" />
                    <span>{item}</span>
                  </li>
                ))}
              </ul>
            </div>
          </div>

          {/* Recomendación Gerencial */}
          <div className="p-5 rounded-2xl bg-gradient-to-br from-violet-500/10 via-background to-background border border-violet-500/30 shadow-sm space-y-2">
            <div className="flex items-center gap-2">
              <Briefcase className="h-4 w-4 text-violet-400" />
              <h4 className="font-bold text-sm text-violet-300">Recomendación para Supervisión y Gerencia</h4>
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