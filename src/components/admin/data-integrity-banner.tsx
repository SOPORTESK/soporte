"use client";

import React, { useEffect, useState, useTransition } from "react";
import {
  ShieldCheck,
  AlertTriangle,
  AlertOctagon,
  RefreshCw,
  ChevronDown,
  ChevronUp,
  CheckCircle2,
  Sparkles,
} from "lucide-react";
import type { IntegrityReport, IntegrityCheck } from "@/lib/data-integrity";

export function DataIntegrityBanner() {
  const [report, setReport] = useState<IntegrityReport | null>(null);
  const [loading, setLoading] = useState(false);
  const [isPending, startTransition] = useTransition();
  const [expanded, setExpanded] = useState(false);
  const [dismissedOk, setDismissedOk] = useState(false);
  const [dismissedWarning, setDismissedWarning] = useState(false);

  const fetchReport = async (refresh = false) => {
    try {
      setLoading(true);
      const url = `/api/admin/integrity-watchdog${refresh ? "?refresh=true" : ""}`;
      const res = await fetch(url, { cache: "no-store" });
      if (res.ok) {
        const json = await res.json();
        if (json.success && json.report) {
          setReport(json.report);
        }
      }
    } catch (err) {
      console.error("[DataIntegrityBanner] Error fetching report:", err);
    } finally {
      setLoading(false);
    }
  };

  const handleSanitize = async () => {
    try {
      setLoading(true);
      const res = await fetch("/api/admin/integrity-watchdog", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "sanitize" }),
      });
      if (res.ok) {
        const json = await res.json();
        if (json.success && json.report) {
          setReport(json.report);
        }
      }
    } catch (err) {
      console.error("[DataIntegrityBanner] Error sanitizing:", err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchReport();
    // Revalidación silenciosa cada 10 minutos
    const interval = setInterval(() => {
      fetchReport();
    }, 10 * 60 * 1000);
    return () => clearInterval(interval);
  }, []);

  if (!report) return null;

  const isError = report.status === "error";
  const isWarning = report.status === "warning";
  const isOk = report.status === "ok";

  // Si todo está 100% OK y el usuario lo colapsó/descartó, mantener discreto
  const timeAgoMin = report.ranAt
    ? Math.max(0, Math.round((Date.now() - new Date(report.ranAt).getTime()) / 60000))
    : 0;
  const timeText = timeAgoMin === 0 ? "hace instantes" : `hace ${timeAgoMin} min`;

  const handleRefresh = () => {
    startTransition(() => {
      fetchReport(true);
    });
  };

  // Si todo está OK
  if (isOk) {
    if (dismissedOk) return null;
    return (
      <div className="w-full bg-emerald-500/10 border-b border-emerald-500/20 text-xs px-4 py-1.5 flex items-center justify-between transition-colors">
        <div className="flex items-center gap-2 text-emerald-600 dark:text-emerald-400 font-medium">
          <ShieldCheck className="h-4 w-4 shrink-0" />
          <span>
            Integridad verificada al 100% contra base de datos real ({timeText} · {report.summary.ok} pruebas aprobadas)
          </span>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setExpanded(!expanded)}
            className="text-[11px] text-emerald-700 dark:text-emerald-300 hover:underline flex items-center gap-0.5"
          >
            {expanded ? "Ocultar detalle" : "Ver pruebas"}
            {expanded ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
          </button>
          <button
            onClick={handleRefresh}
            disabled={loading || isPending}
            title="Refrescar auditoría de integridad"
            className="p-1 rounded text-emerald-700 dark:text-emerald-300 hover:bg-emerald-500/20 disabled:opacity-50"
          >
            <RefreshCw className={`h-3 w-3 ${loading || isPending ? "animate-spin" : ""}`} />
          </button>
          <button
            onClick={() => setDismissedOk(true)}
            className="text-[10px] text-muted-foreground hover:text-foreground px-1"
            title="Ocultar barra de estado OK"
          >
            ✕
          </button>
        </div>
        {expanded && (
          <div className="absolute top-10 left-4 right-4 z-50 bg-background border border-emerald-500/30 rounded-lg p-3 shadow-xl max-h-72 overflow-y-auto space-y-2">
            <div className="flex items-center justify-between pb-1 border-b">
              <span className="font-semibold text-xs text-foreground">Comprobaciones de Integridad en Segundo Plano</span>
              <span className="text-[11px] text-muted-foreground">{report.durationMs}ms de ejecución</span>
            </div>
            {report.checks.map((c) => (
              <div key={c.id} className="text-xs flex items-start gap-2 py-0.5">
                <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500 shrink-0 mt-0.5" />
                <div>
                  <div className="font-medium text-foreground">{c.label}</div>
                  <div className="text-muted-foreground text-[11px]">{c.detail}</div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    );
  }

  // Si hay discrepancias (ERROR o WARNING)
  if (dismissedWarning) return null;
  const nonOkChecks = report.checks.filter((c) => c.status !== "ok");

  return (
    <div
      className={`w-full border-b px-4 py-2 text-xs transition-colors ${
        isError
          ? "bg-rose-500/15 border-rose-500/30 text-rose-700 dark:text-rose-300"
          : "bg-amber-500/15 border-amber-500/30 text-amber-700 dark:text-amber-300"
      }`}
    >
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2 font-medium">
          {isError ? (
            <AlertOctagon className="h-4 w-4 shrink-0 text-rose-600 dark:text-rose-400" />
          ) : (
            <AlertTriangle className="h-4 w-4 shrink-0 text-amber-600 dark:text-amber-400" />
          )}
          <span>
            {isError ? "Discrepancia detectada en auditoría automática" : "Advertencia de consistencia de datos"}
            {" · "}
            {report.summary.errors > 0 && `${report.summary.errors} error(es) `}
            {report.summary.warnings > 0 && `${report.summary.warnings} aviso(s)`}
            {" "}({timeText})
          </span>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setExpanded(!expanded)}
            className="text-[11px] font-semibold underline flex items-center gap-0.5"
          >
            {expanded ? "Ocultar detalle" : "Ver inconsistencias"}
            {expanded ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
          </button>
          <button
            onClick={handleSanitize}
            disabled={loading || isPending}
            className="flex items-center gap-1 px-2.5 py-0.5 rounded bg-emerald-600 hover:bg-emerald-500 text-white font-semibold text-[11px] disabled:opacity-50 shadow-sm transition-colors"
            title="Auto-depurar registros duplicados y corregir inconsistencias automáticamente"
          >
            <Sparkles className="h-3 w-3" />
            <span>Auto-sanear</span>
          </button>
          <button
            onClick={handleRefresh}
            disabled={loading || isPending}
            className="flex items-center gap-1 px-2 py-0.5 rounded bg-background/50 hover:bg-background border text-[11px] disabled:opacity-50"
          >
            <RefreshCw className={`h-3 w-3 ${loading || isPending ? "animate-spin" : ""}`} />
            <span>Re-verificar</span>
          </button>
          <button
            onClick={() => setDismissedWarning(true)}
            className="text-[11px] text-muted-foreground hover:text-foreground px-1.5 py-0.5 rounded border border-current/20 hover:bg-background/40"
            title="Cerrar aviso"
          >
            ✕
          </button>
        </div>
      </div>

      {expanded && (
        <div className="mt-2.5 pt-2 border-t border-current/20 space-y-2">
          {nonOkChecks.map((c) => (
            <div
              key={c.id}
              className="bg-background/80 rounded p-2 text-xs text-foreground space-y-0.5 border"
            >
              <div className="font-semibold flex items-center justify-between">
                <span>{c.label}</span>
                <span
                  className={`text-[10px] px-1.5 py-0.5 rounded uppercase font-bold ${
                    c.status === "error"
                      ? "bg-rose-500/20 text-rose-600 dark:text-rose-400"
                      : "bg-amber-500/20 text-amber-600 dark:text-amber-400"
                  }`}
                >
                  {c.status}
                </span>
              </div>
              <p className="text-muted-foreground text-[11px]">{c.detail}</p>
              {(c.expected !== undefined || c.actual !== undefined) && (
                <div className="text-[11px] font-mono text-muted-foreground">
                  Esperado: {String(c.expected ?? "-")} | Actual detectado: {String(c.actual ?? "-")}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
