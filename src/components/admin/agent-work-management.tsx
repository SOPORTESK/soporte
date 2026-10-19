"use client";

import React, { useState, useEffect, useCallback } from "react";
import {
  Clock,
  Calendar,
  CheckCircle2,
  AlertTriangle,
  XCircle,
  RefreshCw,
  Download,
  Plus,
  Sliders,
  FileSpreadsheet,
  ArrowUpRight,
  LogIn,
  LogOut,
  Timer,
  ShieldCheck,
  Sparkles,
  Check,
  X,
  UserCheck,
  Building2,
} from "lucide-react";
import { toast } from "sonner";
import { AgentScheduleCard } from "@/components/admin/agent-schedule-card";
import { AgentOvertimeCard } from "@/components/admin/agent-overtime-card";
import type { AttendanceDayRecord } from "@/app/api/activity/attendance/route";

interface AgentWorkManagementProps {
  agentEmail: string;
  agentName?: string;
}

interface AttendanceSummary {
  totalWorkDays: number;
  attendedDays: number;
  punctualDays: number;
  punctualityRate: number;
  lateDaysCount: number;
  totalLateMinutes: number;
  earlyLeaveCount: number;
  totalEarlyLeaveMinutes: number;
  absentDaysCount: number;
  totalOvertimeApprovedMin: number;
  totalOvertimePendingMin: number;
}

type SubTabKey = "asistencia" | "horas_extras" | "horario";
type PeriodPreset = "7" | "15" | "30" | "custom";
type RowFilter = "all" | "worked" | "late" | "overtime" | "absent";

export function AgentWorkManagement({ agentEmail, agentName }: AgentWorkManagementProps) {
  const [activeSubTab, setActiveSubTab] = useState<SubTabKey>("asistencia");
  const [periodPreset, setPeriodPreset] = useState<PeriodPreset>("15");
  const [customStart, setCustomStart] = useState<string>("");
  const [customEnd, setCustomEnd] = useState<string>("");
  const [rowFilter, setRowFilter] = useState<RowFilter>("all");

  const [loading, setLoading] = useState<boolean>(true);
  const [refreshing, setRefreshing] = useState<boolean>(false);
  const [records, setRecords] = useState<AttendanceDayRecord[]>([]);
  const [summary, setSummary] = useState<AttendanceSummary>({
    totalWorkDays: 0,
    attendedDays: 0,
    punctualDays: 0,
    punctualityRate: 100,
    lateDaysCount: 0,
    totalLateMinutes: 0,
    earlyLeaveCount: 0,
    totalEarlyLeaveMinutes: 0,
    absentDaysCount: 0,
    totalOvertimeApprovedMin: 0,
    totalOvertimePendingMin: 0,
  });
  const [scheduleMeta, setScheduleMeta] = useState<{
    isCustom?: boolean;
    scheduleStart?: string;
    scheduleEnd?: string;
    useMixedSchedule?: boolean;
  }>({});
  const [processingDate, setProcessingDate] = useState<string | null>(null);

  // Modal rápido para añadir horas extras manuales
  const [showAddOtModal, setShowAddOtModal] = useState(false);
  const [manualOtDate, setManualOtDate] = useState(() => new Date().toISOString().split("T")[0]);
  const [manualOtMinutes, setManualOtMinutes] = useState(60);
  const [manualOtNotes, setManualOtNotes] = useState("Autorizado por jefatura");
  const [savingManualOt, setSavingManualOt] = useState(false);

  const formatMin = (m: number) => {
    if (!m || m <= 0) return "0m";
    const h = Math.floor(m / 60);
    const rem = m % 60;
    if (h === 0) return `${rem}m`;
    return `${h}h ${rem > 0 ? `${rem}m` : ""}`.trim();
  };

  const fetchAttendance = useCallback(
    async (silent = false) => {
      if (!agentEmail) return;
      try {
        if (!silent) setLoading(true);
        setRefreshing(true);

        const params = new URLSearchParams({ agent: agentEmail });
        if (periodPreset === "custom" && customStart && customEnd) {
          params.set("startDate", customStart);
          params.set("endDate", customEnd);
        } else {
          params.set("days", periodPreset === "custom" ? "15" : periodPreset);
        }

        const res = await fetch(`/api/activity/attendance?${params.toString()}`);
        const data = await res.json();
        if (data?.success) {
          setRecords(Array.isArray(data.records) ? data.records : []);
          if (data.summary) setSummary(data.summary);
          if (data.schedule) setScheduleMeta(data.schedule);
          if (!customStart && data.startDate) setCustomStart(data.startDate);
          if (!customEnd && data.endDate) setCustomEnd(data.endDate);
        }
      } catch (err) {
        console.error("[AgentWorkManagement] Error fetching attendance:", err);
        toast.error("No se pudo cargar el historial de asistencia");
      } finally {
        setLoading(false);
        setRefreshing(false);
      }
    },
    [agentEmail, periodPreset, customStart, customEnd]
  );

  useEffect(() => {
    fetchAttendance(false);
  }, [fetchAttendance]);

  const handleOvertimeDecision = async (
    row: AttendanceDayRecord,
    status: "approved" | "rejected"
  ) => {
    try {
      setProcessingDate(row.date);
      let reqId = row.overtimeRequestId;

      if (!reqId) {
        const resCreate = await fetch("/api/activity/overtime", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            action: "request",
            agentEmail,
            agentName: agentName || agentEmail,
            date: row.date,
            overtimeMinutes: row.overtimeMinutes,
            totalActiveMinutes: row.activeMinutes,
          }),
        });
        const dataCreate = await resCreate.json();
        if (!resCreate.ok || !dataCreate?.request?.id) {
          throw new Error(dataCreate?.error || "No se pudo registrar la solicitud de tiempo extra");
        }
        reqId = dataCreate.request.id;
      }

      const resReview = await fetch("/api/activity/overtime", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "review",
          id: reqId,
          status,
          reviewedBy: "Administración",
          notes:
            status === "approved"
              ? "Autorizado desde Bitácora de Asistencia"
              : "Rechazado desde Bitácora de Asistencia",
        }),
      });
      const dataReview = await resReview.json();
      if (!resReview.ok || !dataReview?.success) {
        throw new Error(dataReview?.error || "Error al actualizar horas extras");
      }

      toast.success(
        status === "approved"
          ? `Horas extras del ${row.dateFormatted} autorizadas (+${formatMin(row.overtimeMinutes)})`
          : `Horas extras del ${row.dateFormatted} rechazadas`
      );
      await fetchAttendance(true);
    } catch (err: any) {
      toast.error(err.message || "Error al procesar horas extras");
    } finally {
      setProcessingDate(null);
    }
  };

  const handleCreateManualOvertime = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!manualOtDate || manualOtMinutes <= 0) {
      toast.error("Selecciona una fecha válida y minutos mayores a 0");
      return;
    }
    try {
      setSavingManualOt(true);
      const resReq = await fetch("/api/activity/overtime", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "request",
          agentEmail,
          agentName: agentName || agentEmail,
          date: manualOtDate,
          overtimeMinutes: manualOtMinutes,
          totalActiveMinutes: manualOtMinutes,
        }),
      });
      const dataReq = await resReq.json();
      if (!resReq.ok || !dataReq?.request?.id) {
        throw new Error(dataReq?.error || "Error al crear registro");
      }

      await fetch("/api/activity/overtime", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "review",
          id: dataReq.request.id,
          status: "approved",
          reviewedBy: "Administración",
          notes: manualOtNotes.trim() || "Autorizado manualmente",
        }),
      });

      toast.success("Tiempo extra registrado y aprobado en la bitácora.");
      setShowAddOtModal(false);
      await fetchAttendance(true);
    } catch (err: any) {
      toast.error(err.message || "No se pudo guardar el tiempo extra");
    } finally {
      setSavingManualOt(false);
    }
  };

  const handleExportCSV = () => {
    if (records.length === 0) {
      toast.warning("No hay registros en el período seleccionado para exportar");
      return;
    }
    const headers = [
      "Fecha",
      "Dia",
      "Dia Laboral",
      "Horario Programado",
      "Meta Horas",
      "Entrada Real",
      "Tardia (min)",
      "Salida Real",
      "Salida Anticipada (min)",
      "Jornada Cumplida (min)",
      "Tiempo Activo (min)",
      "Pausas/Descanso (min)",
      "Inactivo en Turno (min)",
      "Horas Extras (min)",
      "Estado Horas Extras",
      "Estado Asistencia",
    ];
    const rows = records.map((r) => [
      r.date,
      r.dayLabel,
      r.isWorkDay ? "SI" : "NO",
      r.isWorkDay ? `${r.scheduledStart} - ${r.scheduledEnd}` : "Libre",
      r.isWorkDay ? r.targetDailyHours : 0,
      r.firstLoginTime || "—",
      r.lateMinutes,
      r.lastLogoutTime || "—",
      r.earlyLeaveMinutes,
      r.workdayMinutes,
      r.activeMinutes,
      r.breakMinutes,
      r.idleMinutes,
      r.overtimeMinutes,
      r.overtimeStatus === "approved"
        ? "Aprobada"
        : r.overtimeStatus === "pending"
        ? "Pendiente"
        : r.overtimeStatus === "rejected"
        ? "Rechazada"
        : "Sin extras",
      r.status,
    ]);

    const csvContent =
      "\uFEFF" +
      [headers.join(","), ...rows.map((row) => row.map((v) => `"${String(v).replace(/"/g, '""')}"`).join(","))].join(
        "\n"
      );
    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `planilla-asistencia-${agentEmail.split("@")[0]}-${new Date().toISOString().split("T")[0]}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    toast.success("Reporte de asistencia y horas extras exportado a CSV");
  };

  const filteredRecords = React.useMemo(() => {
    return records.filter((r) => {
      if (rowFilter === "worked") return r.activeMinutes > 0 || r.justifiedMinutes > 0;
      if (rowFilter === "late") return r.lateMinutes > 0;
      if (rowFilter === "overtime") return r.overtimeMinutes > 0;
      if (rowFilter === "absent") return r.status === "ausente" || r.earlyLeaveMinutes > 0;
      return true;
    });
  }, [records, rowFilter]);

  return (
    <div className="space-y-6">
      {/* ── BARRA EJECUTIVA SUPERIOR DE NAVEGACIÓN INTERNA ── */}
      <div className="rounded-2xl border border-border bg-card/90 backdrop-blur-md p-2.5 shadow-sm flex flex-col lg:flex-row lg:items-center justify-between gap-3">
        <div className="flex items-center gap-1.5 flex-wrap">
          <button
            type="button"
            onClick={() => setActiveSubTab("asistencia")}
            className={`px-4 py-2.5 rounded-xl text-xs font-black tracking-tight transition-all flex items-center gap-2 cursor-pointer ${
              activeSubTab === "asistencia"
                ? "bg-gradient-to-r from-brand-500 to-indigo-600 text-white shadow-md shadow-brand-500/20"
                : "text-muted-foreground hover:text-foreground hover:bg-muted/60"
            }`}
          >
            <Calendar className="h-4 w-4" />
            <span>Bitácora de Entradas, Salidas y Jornada</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveSubTab("horas_extras")}
            className={`px-4 py-2.5 rounded-xl text-xs font-black tracking-tight transition-all flex items-center gap-2 cursor-pointer ${
              activeSubTab === "horas_extras"
                ? "bg-gradient-to-r from-amber-500 to-orange-600 text-white shadow-md shadow-amber-500/20"
                : "text-muted-foreground hover:text-foreground hover:bg-muted/60"
            }`}
          >
            <Timer className="h-4 w-4" />
            <span>Aprobación de Horas Extras</span>
            {summary.totalOvertimePendingMin > 0 && (
              <span
                className={`px-2 py-0.5 rounded-full text-[10px] font-black ${
                  activeSubTab === "horas_extras"
                    ? "bg-white/20 text-white"
                    : "bg-amber-500/15 text-amber-400 border border-amber-500/30"
                }`}
              >
                +{formatMin(summary.totalOvertimePendingMin)}
              </span>
            )}
          </button>

          <button
            type="button"
            onClick={() => setActiveSubTab("horario")}
            className={`px-4 py-2.5 rounded-xl text-xs font-black tracking-tight transition-all flex items-center gap-2 cursor-pointer ${
              activeSubTab === "horario"
                ? "bg-gradient-to-r from-violet-600 to-indigo-600 text-white shadow-md shadow-violet-500/20"
                : "text-muted-foreground hover:text-foreground hover:bg-muted/60"
            }`}
          >
            <Sliders className="h-4 w-4" />
            <span>Configuración de Horario</span>
            <span
              className={`px-2 py-0.5 rounded-full text-[9px] font-black uppercase ${
                activeSubTab === "horario"
                  ? "bg-white/20 text-white"
                  : scheduleMeta.isCustom
                  ? "bg-amber-500/15 text-amber-400 border border-amber-500/30"
                  : "bg-emerald-500/15 text-emerald-400 border border-emerald-500/30"
              }`}
            >
              {scheduleMeta.isCustom
                ? scheduleMeta.useMixedSchedule
                  ? "Personalizado · Mixto"
                  : "Personalizado"
                : "General"}
            </span>
          </button>
        </div>

        {/* Controles rápidos cuando está en Bitácora */}
        {activeSubTab === "asistencia" && (
          <div className="flex items-center gap-2 flex-wrap">
            <div className="flex items-center bg-muted/60 p-1 rounded-xl border border-border">
              {(
                [
                  { id: "7", label: "7 Días" },
                  { id: "15", label: "Quincena (15d)" },
                  { id: "30", label: "Mes (30d)" },
                  { id: "custom", label: "Rango" },
                ] as { id: PeriodPreset; label: string }[]
              ).map((p) => (
                <button
                  key={p.id}
                  type="button"
                  onClick={() => setPeriodPreset(p.id)}
                  className={`px-2.5 py-1 rounded-lg text-[11px] font-bold transition-all cursor-pointer ${
                    periodPreset === p.id
                      ? "bg-card text-foreground shadow-xs border border-border/80"
                      : "text-muted-foreground hover:text-foreground"
                  }`}
                >
                  {p.label}
                </button>
              ))}
            </div>

            <button
              type="button"
              onClick={() => fetchAttendance(true)}
              disabled={refreshing}
              className="p-2 rounded-xl border border-border bg-background hover:bg-muted text-muted-foreground hover:text-foreground transition-all cursor-pointer"
              title="Actualizar registros"
            >
              <RefreshCw className={`h-4 w-4 ${refreshing ? "animate-spin text-brand-500" : ""}`} />
            </button>

            <button
              type="button"
              onClick={handleExportCSV}
              className="flex items-center gap-1.5 px-3 py-2 rounded-xl border border-border bg-background hover:bg-muted text-foreground font-bold text-xs transition-all cursor-pointer"
              title="Exportar hoja de tiempo a Excel / CSV"
            >
              <Download className="h-3.5 w-3.5 text-emerald-500" />
              <span>Exportar Planilla</span>
            </button>

            <button
              type="button"
              onClick={() => setShowAddOtModal(true)}
              className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-brand-500 hover:bg-brand-600 text-white font-bold text-xs shadow-sm transition-all cursor-pointer"
            >
              <Plus className="h-3.5 w-3.5" />
              <span>Añadir Extra</span>
            </button>
          </div>
        )}
      </div>

      {/* Selector de fechas personalizadas si eligió Rango */}
      {activeSubTab === "asistencia" && periodPreset === "custom" && (
        <div className="rounded-xl border border-border bg-card p-3.5 flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2 text-xs font-bold text-foreground">
            <Calendar className="h-4 w-4 text-brand-500" />
            <span>Rango de consulta personalizado:</span>
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-border bg-background text-xs">
              <span className="text-muted-foreground font-semibold">Desde:</span>
              <input
                type="date"
                value={customStart}
                onChange={(e) => setCustomStart(e.target.value)}
                className="bg-transparent font-mono font-bold text-foreground focus:outline-none"
              />
            </div>
            <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-border bg-background text-xs">
              <span className="text-muted-foreground font-semibold">Hasta:</span>
              <input
                type="date"
                value={customEnd}
                onChange={(e) => setCustomEnd(e.target.value)}
                className="bg-transparent font-mono font-bold text-foreground focus:outline-none"
              />
            </div>
            <button
              type="button"
              onClick={() => fetchAttendance(false)}
              className="px-3.5 py-1.5 rounded-lg bg-brand-500 hover:bg-brand-600 text-white text-xs font-bold transition-colors cursor-pointer"
            >
              Consultar
            </button>
          </div>
        </div>
      )}

      {/* ── CONTENIDO DE PESTAÑA 1: BITÁCORA DE ASISTENCIA, ENTRADAS, SALIDAS Y HORAS EXTRAS ── */}
      {activeSubTab === "asistencia" && (
        <div className="space-y-6">
          {/* 4 TARJETAS KPI EJECUTIVAS */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {/* 1. Asistencia y Puntualidad */}
            <div className="relative rounded-2xl border border-border bg-card p-5 overflow-hidden shadow-xs">
              <div className="absolute -top-8 -right-8 h-24 w-24 rounded-full bg-emerald-500/10 blur-2xl pointer-events-none" />
              <div className="flex items-start justify-between gap-3">
                <div>
                  <span className="text-[10px] font-black uppercase tracking-widest text-muted-foreground block">
                    Asistencia y Puntualidad
                  </span>
                  <div className="flex items-baseline gap-2 mt-1.5">
                    <span className="text-3xl font-black tracking-tight tabular-nums text-emerald-400">
                      {summary.punctualityRate}%
                    </span>
                    <span className="text-xs font-bold text-muted-foreground">
                      ({summary.attendedDays}/{summary.totalWorkDays} días)
                    </span>
                  </div>
                  <p className="text-[11px] text-muted-foreground mt-1">
                    {summary.punctualDays} entradas a tiempo en el período
                  </p>
                </div>
                <div className="h-10 w-10 rounded-xl bg-emerald-500/15 border border-emerald-500/25 text-emerald-400 grid place-items-center shrink-0">
                  <ShieldCheck className="h-5 w-5" />
                </div>
              </div>
            </div>

            {/* 2. Historial de Tardías */}
            <div className="relative rounded-2xl border border-border bg-card p-5 overflow-hidden shadow-xs">
              <div className="absolute -top-8 -right-8 h-24 w-24 rounded-full bg-amber-500/10 blur-2xl pointer-events-none" />
              <div className="flex items-start justify-between gap-3">
                <div>
                  <span className="text-[10px] font-black uppercase tracking-widest text-muted-foreground block">
                    Entradas Tardías
                  </span>
                  <div className="flex items-baseline gap-2 mt-1.5">
                    <span
                      className={`text-3xl font-black tracking-tight tabular-nums ${
                        summary.lateDaysCount > 0 ? "text-amber-400" : "text-foreground"
                      }`}
                    >
                      {summary.lateDaysCount}
                    </span>
                    <span className="text-xs font-bold text-muted-foreground">
                      {summary.lateDaysCount === 1 ? "llegada tardía" : "llegadas tardías"}
                    </span>
                  </div>
                  <p className="text-[11px] text-muted-foreground mt-1">
                    {summary.totalLateMinutes > 0
                      ? `${formatMin(summary.totalLateMinutes)} acumulados de retraso`
                      : "Sin retrasos en hora de entrada"}
                  </p>
                </div>
                <div className="h-10 w-10 rounded-xl bg-amber-500/15 border border-amber-500/25 text-amber-400 grid place-items-center shrink-0">
                  <LogIn className="h-5 w-5" />
                </div>
              </div>
            </div>

            {/* 3. Salidas Anticipadas y Ausencias */}
            <div className="relative rounded-2xl border border-border bg-card p-5 overflow-hidden shadow-xs">
              <div className="absolute -top-8 -right-8 h-24 w-24 rounded-full bg-rose-500/10 blur-2xl pointer-events-none" />
              <div className="flex items-start justify-between gap-3">
                <div>
                  <span className="text-[10px] font-black uppercase tracking-widest text-muted-foreground block">
                    Salidas Anticipadas / Ausencias
                  </span>
                  <div className="flex items-baseline gap-2 mt-1.5">
                    <span
                      className={`text-3xl font-black tracking-tight tabular-nums ${
                        summary.earlyLeaveCount + summary.absentDaysCount > 0
                          ? "text-rose-400"
                          : "text-foreground"
                      }`}
                    >
                      {summary.earlyLeaveCount + summary.absentDaysCount}
                    </span>
                    <span className="text-xs font-bold text-muted-foreground">incidencias</span>
                  </div>
                  <p className="text-[11px] text-muted-foreground mt-1">
                    {summary.absentDaysCount} ausencias · {summary.earlyLeaveCount} salidas antes de hora
                  </p>
                </div>
                <div className="h-10 w-10 rounded-xl bg-rose-500/15 border border-rose-500/25 text-rose-400 grid place-items-center shrink-0">
                  <LogOut className="h-5 w-5" />
                </div>
              </div>
            </div>

            {/* 4. Horas Extras del Período */}
            <div className="relative rounded-2xl border border-border bg-card p-5 overflow-hidden shadow-xs">
              <div className="absolute -top-8 -right-8 h-24 w-24 rounded-full bg-violet-500/10 blur-2xl pointer-events-none" />
              <div className="flex items-start justify-between gap-3">
                <div>
                  <span className="text-[10px] font-black uppercase tracking-widest text-muted-foreground block">
                    Horas Extras del Período
                  </span>
                  <div className="flex items-baseline gap-2 mt-1.5">
                    <span className="text-3xl font-black tracking-tight tabular-nums text-violet-400">
                      +{formatMin(summary.totalOvertimeApprovedMin)}
                    </span>
                    <span className="text-xs font-bold text-emerald-400">aprobadas</span>
                  </div>
                  <p className="text-[11px] text-muted-foreground mt-1">
                    {summary.totalOvertimePendingMin > 0
                      ? `+${formatMin(summary.totalOvertimePendingMin)} pendientes de autorizar`
                      : "Todas las horas extras al día"}
                  </p>
                </div>
                <div className="h-10 w-10 rounded-xl bg-violet-500/15 border border-violet-500/25 text-violet-400 grid place-items-center shrink-0">
                  <Timer className="h-5 w-5" />
                </div>
              </div>
            </div>
          </div>

          {/* ── TABLA TIMESHEET DE CONTROL DE ASISTENCIA DIARIA ── */}
          <section className="rounded-2xl border border-border bg-card overflow-hidden shadow-xs">
            {/* Cabecera de la tabla con filtros de fila */}
            <div className="p-5 border-b border-border/80 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <div>
                <div className="flex items-center gap-2">
                  <FileSpreadsheet className="h-4.5 w-4.5 text-brand-500" />
                  <h3 className="text-base font-black tracking-tight text-foreground">
                    Historial Diario de Entradas, Salidas y Horas Extras
                  </h3>
                </div>
                <p className="text-xs text-muted-foreground mt-0.5">
                  Control independiente de cumplimiento de horario (tardías y salidas) y tiempo activo fuera de jornada (horas extras).
                </p>
              </div>

              <div className="flex items-center gap-1.5 flex-wrap">
                {(
                  [
                    { id: "all", label: "Todos" },
                    { id: "worked", label: "Días Laborados" },
                    { id: "late", label: `Con Tardía (${summary.lateDaysCount})` },
                    { id: "overtime", label: "Con Horas Extras" },
                    { id: "absent", label: "Incidencias" },
                  ] as { id: RowFilter; label: string }[]
                ).map((f) => (
                  <button
                    key={f.id}
                    type="button"
                    onClick={() => setRowFilter(f.id)}
                    className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer ${
                      rowFilter === f.id
                        ? "bg-brand-500 text-white shadow-xs"
                        : "bg-muted/50 text-muted-foreground hover:text-foreground hover:bg-muted"
                    }`}
                  >
                    {f.label}
                  </button>
                ))}
              </div>
            </div>

            {loading ? (
              <div className="p-12 text-center text-sm text-muted-foreground animate-pulse">
                Calculando bitácora de entradas, salidas y horas extras...
              </div>
            ) : filteredRecords.length === 0 ? (
              <div className="p-12 text-center space-y-2">
                <Calendar className="h-8 w-8 text-muted-foreground/50 mx-auto" />
                <p className="text-sm font-bold text-foreground">
                  No hay registros para el filtro seleccionado
                </p>
                <p className="text-xs text-muted-foreground">
                  Cambia el filtro superior o amplía el rango de fechas para revisar más jornadas.
                </p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead className="bg-muted/40 border-b border-border/80 text-[10px] uppercase font-black tracking-wider text-muted-foreground">
                    <tr>
                      <th className="py-3.5 px-4">Fecha / Día</th>
                      <th className="py-3.5 px-4">Turno Asignado</th>
                      <th className="py-3.5 px-4">Entrada Real</th>
                      <th className="py-3.5 px-4">Salida Real</th>
                      <th className="py-3.5 px-4">Cumplimiento Jornada</th>
                      <th className="py-3.5 px-4">Horas Extras (Activo)</th>
                      <th className="py-3.5 px-4 text-right">Estado / Acción</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border/60">
                    {filteredRecords.map((row) => {
                      const isProcessing = processingDate === row.date;
                      const targetMins = Math.round(row.targetDailyHours * 60);

                      return (
                        <tr
                          key={row.date}
                          className={`transition-colors ${
                            !row.isWorkDay && row.activeMinutes === 0
                              ? "bg-muted/15 opacity-65 hover:opacity-100"
                              : "hover:bg-muted/30"
                          }`}
                        >
                          {/* 1. Fecha y Día */}
                          <td className="py-3.5 px-4 whitespace-nowrap">
                            <div className="flex items-center gap-2.5">
                              <div
                                className={`h-8 w-8 rounded-xl grid place-items-center font-black text-[11px] shrink-0 border ${
                                  row.isToday
                                    ? "bg-brand-500/15 text-brand-400 border-brand-500/30"
                                    : row.isWorkDay
                                    ? "bg-muted/60 text-foreground border-border"
                                    : "bg-muted/30 text-muted-foreground border-border/50"
                                }`}
                              >
                                {row.dayLabel}
                              </div>
                              <div>
                                <div className="flex items-center gap-1.5">
                                  <span className="font-bold text-foreground">{row.dateFormatted}</span>
                                  {row.isToday && (
                                    <span className="px-1.5 py-0.2 rounded text-[9px] font-black uppercase bg-brand-500/20 text-brand-400 border border-brand-500/30">
                                      Hoy
                                    </span>
                                  )}
                                </div>
                                <span className="text-[10px] font-mono text-muted-foreground block">
                                  {row.date}
                                </span>
                              </div>
                            </div>
                          </td>

                          {/* 2. Turno Asignado */}
                          <td className="py-3.5 px-4 whitespace-nowrap">
                            {row.isWorkDay ? (
                              <div>
                                <span className="font-mono font-bold text-foreground block">
                                  {row.scheduledStart} — {row.scheduledEnd}
                                </span>
                                <span className="text-[10px] text-muted-foreground">
                                  Meta: {row.targetDailyHours}h
                                </span>
                              </div>
                            ) : (
                              <span className="px-2 py-0.5 rounded-md bg-muted text-muted-foreground text-[10px] font-bold uppercase">
                                Día Libre
                              </span>
                            )}
                          </td>

                          {/* 3. Entrada Real */}
                          <td className="py-3.5 px-4 whitespace-nowrap">
                            {row.firstLoginTime ? (
                              <div className="space-y-1">
                                <span className="font-mono font-bold text-foreground block">
                                  {row.firstLoginTime}
                                </span>
                                {row.isWorkDay && (
                                  row.lateMinutes > 0 ? (
                                    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-bold bg-amber-500/15 text-amber-400 border border-amber-500/30">
                                      <AlertTriangle className="h-2.5 w-2.5" />
                                      Tardía +{formatMin(row.lateMinutes)}
                                    </span>
                                  ) : (
                                    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-bold bg-emerald-500/15 text-emerald-400 border border-emerald-500/30">
                                      <CheckCircle2 className="h-2.5 w-2.5" />
                                      Puntual
                                    </span>
                                  )
                                )}
                              </div>
                            ) : (
                              <span className="text-muted-foreground font-mono">—</span>
                            )}
                          </td>

                          {/* 4. Salida Real */}
                          <td className="py-3.5 px-4 whitespace-nowrap">
                            {row.lastLogoutTime ? (
                              <div className="space-y-1">
                                <span className="font-mono font-bold text-foreground block">
                                  {row.isToday && row.isShiftActive ? "En turno activo" : row.lastLogoutTime}
                                </span>
                                {row.isWorkDay && (
                                  row.isToday && row.isShiftActive ? (
                                    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-bold bg-sky-500/15 text-sky-400 border border-sky-500/30">
                                      <Clock className="h-2.5 w-2.5 animate-pulse" />
                                      Últ. act: {row.lastLogoutTime}
                                    </span>
                                  ) : row.earlyLeaveMinutes > 0 ? (
                                    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-bold bg-rose-500/15 text-rose-400 border border-rose-500/30">
                                      Anticipada -{formatMin(row.earlyLeaveMinutes)}
                                    </span>
                                  ) : (
                                    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-bold bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                                      Completa
                                    </span>
                                  )
                                )}
                              </div>
                            ) : (
                              <span className="text-muted-foreground font-mono">—</span>
                            )}
                          </td>

                          {/* 5. Cumplimiento de Jornada */}
                          <td className="py-3.5 px-4 min-w-[180px]">
                            {row.workdayMinutes > 0 || row.activeMinutes > 0 ? (
                              <div className="space-y-1.5">
                                <div className="flex items-center justify-between text-[11px]">
                                  <span className="font-mono font-bold text-foreground">
                                    {formatMin(row.workdayMinutes)}
                                    {row.isWorkDay && (
                                      <span className="text-muted-foreground font-normal">
                                        {" "}/ {formatMin(targetMins)}
                                      </span>
                                    )}
                                  </span>
                                  <span
                                    className={`font-black tabular-nums ${
                                      row.compliancePercent >= 95
                                        ? "text-emerald-400"
                                        : row.compliancePercent >= 75
                                        ? "text-amber-400"
                                        : "text-rose-400"
                                    }`}
                                  >
                                    {row.compliancePercent}%
                                  </span>
                                </div>
                                <div className="h-1.5 w-full rounded-full bg-muted overflow-hidden">
                                  <div
                                    className={`h-full rounded-full transition-all ${
                                      row.compliancePercent >= 95
                                        ? "bg-emerald-500"
                                        : row.compliancePercent >= 75
                                        ? "bg-amber-500"
                                        : "bg-rose-500"
                                    }`}
                                    style={{ width: `${Math.min(100, row.compliancePercent)}%` }}
                                  />
                                </div>
                                <div className="flex items-center gap-2 text-[10px] text-muted-foreground">
                                  <span>Activo: {formatMin(row.activeMinutes)}</span>
                                  {row.breakMinutes > 0 && <span>· Pausa: {formatMin(row.breakMinutes)}</span>}
                                  {row.idleMinutes > 0 && (
                                    <span className="text-amber-400">· Inact: {formatMin(row.idleMinutes)}</span>
                                  )}
                                </div>
                              </div>
                            ) : (
                              <span className="text-[11px] text-muted-foreground">—</span>
                            )}
                          </td>

                          {/* 6. Horas Extras (solo tiempo activo fuera de horario) */}
                          <td className="py-3.5 px-4 whitespace-nowrap">
                            {row.overtimeMinutes > 0 ? (
                              <div className="flex items-center gap-2">
                                <span className="px-2.5 py-1 rounded-lg font-mono font-black text-xs bg-violet-500/15 text-violet-300 border border-violet-500/30">
                                  +{formatMin(row.overtimeMinutes)}
                                </span>
                                {row.overtimeStatus === "approved" && (
                                  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-500/15 text-emerald-400 border border-emerald-500/30">
                                    <CheckCircle2 className="h-3 w-3" /> Aprobada
                                  </span>
                                )}
                                {row.overtimeStatus === "pending" && (
                                  <div className="flex items-center gap-1">
                                    <button
                                      type="button"
                                      disabled={isProcessing}
                                      onClick={() => handleOvertimeDecision(row, "approved")}
                                      className="px-2 py-1 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-[10px] flex items-center gap-1 transition-all cursor-pointer disabled:opacity-50"
                                      title="Autorizar horas extras"
                                    >
                                      <Check className="h-3 w-3" /> Aprobar
                                    </button>
                                    <button
                                      type="button"
                                      disabled={isProcessing}
                                      onClick={() => handleOvertimeDecision(row, "rejected")}
                                      className="p-1 rounded-lg border border-border hover:bg-rose-500/15 text-muted-foreground hover:text-rose-400 transition-all cursor-pointer disabled:opacity-50"
                                      title="Rechazar horas extras"
                                    >
                                      <X className="h-3 w-3" />
                                    </button>
                                  </div>
                                )}
                                {row.overtimeStatus === "rejected" && (
                                  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-rose-500/15 text-rose-400 border border-rose-500/30">
                                    <XCircle className="h-3 w-3" /> Rechazada
                                  </span>
                                )}
                              </div>
                            ) : (
                              <span className="text-[11px] text-muted-foreground">—</span>
                            )}
                          </td>

                          {/* 7. Estado General */}
                          <td className="py-3.5 px-4 text-right whitespace-nowrap">
                            {row.status === "puntual" && (
                              <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[10px] font-bold bg-emerald-500/15 text-emerald-400 border border-emerald-500/30">
                                <CheckCircle2 className="h-3 w-3" /> Jornada Cumplida
                              </span>
                            )}
                            {row.status === "en_curso" && (
                              <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[10px] font-bold bg-sky-500/15 text-sky-400 border border-sky-500/30">
                                <Clock className="h-3 w-3 animate-pulse" /> En Curso
                              </span>
                            )}
                            {row.status === "tardia" && (
                              <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[10px] font-bold bg-amber-500/15 text-amber-400 border border-amber-500/30">
                                <AlertTriangle className="h-3 w-3" /> Con Tardía
                              </span>
                            )}
                            {row.status === "salida_anticipada" && (
                              <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[10px] font-bold bg-rose-500/15 text-rose-400 border border-rose-500/30">
                                <LogOut className="h-3 w-3" /> Salida Anticipada
                              </span>
                            )}
                            {row.status === "justificado" && (
                              <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[10px] font-bold bg-indigo-500/15 text-indigo-400 border border-indigo-500/30">
                                Justificado
                              </span>
                            )}
                            {row.status === "extra_dia_libre" && (
                              <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[10px] font-bold bg-violet-500/15 text-violet-300 border border-violet-500/30">
                                Extra en Día Libre
                              </span>
                            )}
                            {row.status === "ausente" && (
                              <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[10px] font-bold bg-rose-500/15 text-rose-400 border border-rose-500/30">
                                <XCircle className="h-3 w-3" /> Sin Registro
                              </span>
                            )}
                            {row.status === "dia_libre" && (
                              <span className="text-[11px] text-muted-foreground font-medium">
                                Descanso Semanal
                              </span>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        </div>
      )}

      {/* ── CONTENIDO DE PESTAÑA 2: APROBACIÓN E HISTORIAL DE HORAS EXTRAS ── */}
      {activeSubTab === "horas_extras" && (
        <AgentOvertimeCard agentEmail={agentEmail} agentName={agentName} />
      )}

      {/* ── CONTENIDO DE PESTAÑA 3: CONFIGURACIÓN DE HORARIO DE TRABAJO ── */}
      {activeSubTab === "horario" && (
        <AgentScheduleCard agentEmail={agentEmail} agentName={agentName} />
      )}

      {/* ── MODAL PARA AÑADIR TIEMPO EXTRA MANUAL ── */}
      {showAddOtModal && (
        <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="w-full max-w-md rounded-2xl border border-border bg-card p-6 shadow-2xl space-y-5">
            <div className="flex items-center justify-between border-b border-border pb-3">
              <div className="flex items-center gap-2.5">
                <div className="h-9 w-9 rounded-xl bg-brand-500/15 text-brand-400 grid place-items-center">
                  <Plus className="h-4.5 w-4.5" />
                </div>
                <div>
                  <h3 className="text-sm font-black text-foreground">
                    Registrar y Autorizar Horas Extras
                  </h3>
                  <p className="text-[11px] text-muted-foreground">{agentName || agentEmail}</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setShowAddOtModal(false)}
                className="p-1.5 rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <form onSubmit={handleCreateManualOvertime} className="space-y-4">
              <div className="space-y-1.5">
                <label className="text-xs font-bold text-foreground block">Fecha de la Jornada</label>
                <input
                  type="date"
                  value={manualOtDate}
                  onChange={(e) => setManualOtDate(e.target.value)}
                  className="w-full px-3.5 py-2 rounded-xl border border-border bg-background text-sm font-mono text-foreground focus:outline-none focus:ring-2 focus:ring-brand-500/40"
                  required
                />
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-bold text-foreground block">
                  Tiempo Extra (en minutos)
                </label>
                <div className="flex items-center gap-2">
                  <input
                    type="number"
                    min={15}
                    max={720}
                    step={15}
                    value={manualOtMinutes}
                    onChange={(e) => setManualOtMinutes(Number(e.target.value) || 0)}
                    className="flex-1 px-3.5 py-2 rounded-xl border border-border bg-background text-sm font-mono font-bold text-foreground focus:outline-none focus:ring-2 focus:ring-brand-500/40"
                    required
                  />
                  {[30, 60, 120, 180].map((m) => (
                    <button
                      key={m}
                      type="button"
                      onClick={() => setManualOtMinutes(m)}
                      className={`px-2.5 py-2 rounded-xl border text-xs font-mono font-bold transition-all cursor-pointer ${
                        manualOtMinutes === m
                          ? "bg-brand-500 text-white border-brand-500"
                          : "bg-muted/50 text-muted-foreground border-border hover:text-foreground"
                      }`}
                    >
                      {formatMin(m)}
                    </button>
                  ))}
                </div>
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-bold text-foreground block">Motivo / Observación</label>
                <input
                  type="text"
                  value={manualOtNotes}
                  onChange={(e) => setManualOtNotes(e.target.value)}
                  placeholder="Ej. Cierre de casos urgentes fuera de turno"
                  className="w-full px-3.5 py-2 rounded-xl border border-border bg-background text-xs text-foreground focus:outline-none focus:ring-2 focus:ring-brand-500/40"
                />
              </div>

              <div className="flex items-center justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setShowAddOtModal(false)}
                  className="px-4 py-2 rounded-xl border border-border text-xs font-bold text-muted-foreground hover:text-foreground"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={savingManualOt}
                  className="px-4 py-2 rounded-xl bg-brand-500 hover:bg-brand-600 text-white text-xs font-bold shadow-sm disabled:opacity-50 cursor-pointer"
                >
                  {savingManualOt ? "Guardando..." : "Guardar y Autorizar"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
