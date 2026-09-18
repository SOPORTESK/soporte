"use client";

import React, { useState, useEffect } from "react";
import {
  X,
  Clock,
  TrendingUp,
  Activity,
  Calendar,
  MessageSquare,
  Phone,
  Wrench,
  ShieldCheck,
  Mail,
  Globe,
  FileEdit,
  Send,
  CheckCircle2,
  AlertCircle,
  BarChart3,
  Sparkles,
  Headphones,
  Trash2,
  Package,
  GraduationCap,
  LogIn,
  LogOut,
  Briefcase,
  ChevronLeft,
  ChevronRight,
} from "lucide-react";
import { toast } from "sonner";
import { logActivity } from "@/lib/activity-client";
import { extractSmartAppName } from "@/components/admin/activity-apps-ranking";

interface Props {
  isOpen: boolean;
  onClose: () => void;
  agentEmail: string;
  agentName: string;
}

interface CategoryUsage {
  category: string;
  durationMs: number;
  count: number;
  percentage: number;
}

export function ModalMyActivity({ isOpen, onClose, agentEmail, agentName }: Props) {
  const [loading, setLoading] = useState(true);
  const [timeline, setTimeline] = useState<any[]>([]);
  const [activeTab, setActiveTab] = useState<"resumen" | "justificar">("resumen");

  // Formulario de Justificación
  const [justTimeRange, setJustTimeRange] = useState("");
  const [justMinutes, setJustMinutes] = useState("15");
  const [justReason, setJustReason] = useState("Atención presencial en mostrador");
  const [justDetail, setJustDetail] = useState("");
  const [savingJust, setSavingJust] = useState(false);
  const [targetDailyHours, setTargetDailyHours] = useState(10);
  const [overtimeInfo, setOvertimeInfo] = useState<any>(null);
  const [catPage, setCatPage] = useState(1);
  const ITEMS_PER_PAGE = 5;

  const fetchMyData = async () => {
    setLoading(true);
    try {
      const today = new Date().toISOString().split("T")[0];
      const [resTimeline, resSchedule, resOvertime] = await Promise.all([
        fetch(`/api/activity/timeline?agent=${encodeURIComponent(agentEmail)}&date=${today}`),
        fetch("/api/activity/schedule"),
        fetch(`/api/activity/overtime?date=${today}&agent=${encodeURIComponent(agentEmail)}`),
      ]);

      const data = await resTimeline.json();
      if (resTimeline.ok) {
        setTimeline(data.timeline || []);
      }

      const schedData = await resSchedule.json();
      if (schedData?.targetDailyHours) {
        setTargetDailyHours(Number(schedData.targetDailyHours));
      }

      const otData = await resOvertime.json();
      if (otData?.requests && Array.isArray(otData.requests)) {
        setOvertimeInfo(otData.requests[0] || null);
      }
    } catch (e) {
      console.error("[ModalMyActivity] Error fetching data:", e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (isOpen) {
      setCatPage(1);
      fetchMyData();
    }
  }, [isOpen, agentEmail]);

  if (!isOpen) return null;

  // ─── CALCULAR MÉTRICAS CALIBRADAS ───
  const sorted = [...timeline]
    .filter((t) => Boolean(t.created_at))
    .sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime());

  const categoryMap: Record<string, { durationMs: number; count: number }> = {};
  let totalActiveMs = 0;
  let totalIdleMs = 0;
  const LUNCH_GAP_MS = 30 * 60 * 1000; // Solo ausencias mayores a 30 minutos continuos se consideran pausa/almuerzo

  for (let i = 0; i < sorted.length; i++) {
    const item = sorted[i];
    const meta = (item.metadata || {}) as Record<string, any>;
    const currTime = new Date(item.created_at).getTime();
    const nextTime = i < sorted.length - 1 ? new Date(sorted[i + 1].created_at).getTime() : currTime + 60000;
    const act = (item.action || "").toLowerCase();
    const isJust = Boolean(meta.justification || item.category === "Justificación" || act.startsWith("justificación:") || act.startsWith("justificacion:"));
    if (isJust) {
      const justMs = Number(
        item.duration_ms ||
        (meta.minutes ? meta.minutes * 60000 : 0) ||
        (meta.duration_seconds ? meta.duration_seconds * 1000 : 0)
      ) || 0;
      const cat = extractSmartAppName(item);
      if (!categoryMap[cat]) categoryMap[cat] = { durationMs: 0, count: 0 };
      categoryMap[cat].durationMs += justMs;
      categoryMap[cat].count++;
      totalActiveMs += justMs;
      totalIdleMs = Math.max(0, totalIdleMs - justMs);
      continue;
    }

    const gap = Math.max(0, nextTime - currTime);
    const isManualStart = (act.startsWith("inició:") || act.startsWith("inicio:")) && (meta.manual || meta.task);
    const isManualEnd = (act.startsWith("terminó:") || act.startsWith("termino:")) && (meta.manual || meta.task);

    if (isManualStart) {
      const dur = Math.min(gap, 4 * 60 * 60 * 1000);
      const cat = meta.task || item.category || "Labores de Taller";
      if (!categoryMap[cat]) categoryMap[cat] = { durationMs: 0, count: 0 };
      categoryMap[cat].durationMs += dur;
      categoryMap[cat].count++;
      totalActiveMs += dur;
      continue;
    }

    if (isManualEnd) {
      const prev = i > 0 ? sorted[i - 1] : null;
      const prevAct = (prev?.action || "").toLowerCase();
      const prevWasStart = prev && (prevAct.startsWith("inició:") || prevAct.startsWith("inicio:"));
      if (!prevWasStart) {
        const discreteMs = Number(
          item.duration_ms ||
          (meta.duration_seconds ? meta.duration_seconds * 1000 : 0) ||
          (meta.minutes ? meta.minutes * 60000 : 0)
        ) || 0;
        const dur = Math.min(discreteMs, 4 * 60 * 60 * 1000);
        const cat = meta.task || item.category || "Labores de Taller";
        if (!categoryMap[cat]) categoryMap[cat] = { durationMs: 0, count: 0 };
        categoryMap[cat].durationMs += dur;
        categoryMap[cat].count++;
        totalActiveMs += dur;
      }
      continue;
    }

    // Es pausa real SOLO SI: fue bloqueo de pantalla explícito, suspensión o pausa personal
    const isExplicitPause = meta.reason === "lock_screen" || meta.reason === "suspend" || item.category === "Pausa personal" || item.category === "Pausa Sanitaria";

    if (isExplicitPause) {
      totalIdleMs += Math.min(gap, 60 * 60 * 1000);
      continue;
    }

    let cat = extractSmartAppName(item);

    if (gap <= LUNCH_GAP_MS) {
      if (!categoryMap[cat]) categoryMap[cat] = { durationMs: 0, count: 0 };
      categoryMap[cat].durationMs += gap;
      categoryMap[cat].count++;
      totalActiveMs += gap;
    } else {
      if (!categoryMap[cat]) categoryMap[cat] = { durationMs: 0, count: 0 };
      categoryMap[cat].durationMs += LUNCH_GAP_MS;
      categoryMap[cat].count++;
      totalActiveMs += LUNCH_GAP_MS;
      totalIdleMs += (gap - LUNCH_GAP_MS);
    }
  }

  // Cálculo de jornada base de 10 horas y tiempo perdido / tiempo extra
  const targetMs = targetDailyHours * 60 * 60 * 1000;
  const isOvertimeApproved = overtimeInfo?.status === "approved";
  const rawOvertimeMs = Math.max(0, totalActiveMs - targetMs);
  const deficitMs = Math.max(0, targetMs - totalActiveMs);

  // Si no está aprobado el tiempo extra, topar la visualización en 10 horas
  const activeDisplayMs = (rawOvertimeMs > 0 && !isOvertimeApproved) ? targetMs : totalActiveMs;
  const compliancePercent = targetMs > 0 ? Math.round((activeDisplayMs / targetMs) * 100) : 0;

  // Detectar primer evento del día (hora real de entrada) y último evento
  let firstLoginTime: string | null = null;
  let lastLogoutTime: string | null = null;
  if (sorted.length > 0) {
    const firstEvt = sorted[0];
    if (firstEvt?.created_at) {
      const d = new Date(firstEvt.created_at);
      firstLoginTime = isNaN(d.getTime()) ? null : d.toLocaleTimeString("es-CR", { hour: "2-digit", minute: "2-digit", timeZone: "America/Costa_Rica" });
    }

    const lastEvt = sorted[sorted.length - 1];
    if (lastEvt?.created_at) {
      const d = new Date(lastEvt.created_at);
      lastLogoutTime = isNaN(d.getTime()) ? null : d.toLocaleTimeString("es-CR", { hour: "2-digit", minute: "2-digit", timeZone: "America/Costa_Rica" });
    }
  }

  const categoriesList: CategoryUsage[] = Object.entries(categoryMap)
    .map(([cat, val]) => ({
      category: cat,
      durationMs: val.durationMs,
      count: val.count,
      percentage: totalActiveMs > 0 ? Math.round((val.durationMs / totalActiveMs) * 100) : 0,
    }))
    .sort((a, b) => b.durationMs - a.durationMs);

  const totalCatPages = Math.max(1, Math.ceil(categoriesList.length / ITEMS_PER_PAGE));
  const currentCatPage = Math.min(Math.max(1, catPage), totalCatPages);
  const paginatedCategories = categoriesList.slice((currentCatPage - 1) * ITEMS_PER_PAGE, currentCatPage * ITEMS_PER_PAGE);

  const formatMinHours = (ms: number) => {
    const min = Math.round(ms / 60000);
    const h = Math.floor(min / 60);
    const m = min % 60;
    if (h > 0) return `${h}h ${m}m`;
    return `${m}m`;
  };

  const getCategoryIcon = (cat: string) => {
    const c = cat.toLowerCase();
    if (c.includes("residuo") || c.includes("desecho") || c.includes("reciclaj") || c.includes("chatarra")) return <Trash2 className="h-4 w-4 text-rose-400" />;
    if (c.includes("ojt") || c.includes("training") || c.includes("capacita") || c.includes("inducci") || c.includes("reunión") || c.includes("reunion")) return <GraduationCap className="h-4 w-4 text-violet-400" />;
    if (c.includes("soporte") || c.includes("mensajer") || c.includes("whatsapp") || c.includes("telef") || c.includes("llamada") || c.includes("linkus") || c.includes("ticket")) return <Headphones className="h-4 w-4 text-emerald-400" />;
    if (c.includes("servicio") || c.includes("diagnóst") || c.includes("diagnost") || c.includes("garant") || c.includes("rma") || c.includes("tienda 3d")) return <Wrench className="h-4 w-4 text-amber-400" />;
    if (c.includes("control") || c.includes("admin") || c.includes("correo") || c.includes("mail") || c.includes("excel") || c.includes("word") || c.includes("informe")) return <TrendingUp className="h-4 w-4 text-blue-400" />;
    if (c.includes("gestión del taller") || c.includes("gestion del taller") || c.includes("bodega") || c.includes("inventario") || c.includes("ventanilla") || c.includes("mostrador") || c.includes("limpieza") || c.includes("exhibidor")) return <Package className="h-4 w-4 text-indigo-400" />;
    if (c.includes("justificación")) return <CheckCircle2 className="h-4 w-4 text-cyan-400" />;
    return <Globe className="h-4 w-4 text-muted-foreground" />;
  };

  const handleSendJustification = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!justReason.trim()) {
      toast.error("Por favor seleccione o escriba un motivo.");
      return;
    }

    setSavingJust(true);
    try {
      const minVal = parseInt(justMinutes, 10) || 15;
      const durationMs = minVal * 60 * 1000;
      const detailText = justDetail.trim() ? ` — ${justDetail.trim()}` : "";
      const timeRangeText = justTimeRange.trim() ? ` [Horario: ${justTimeRange.trim()}]` : "";

      logActivity({
        agent_email: agentEmail,
        agent_name: agentName,
        action: `Justificación: ${justReason}${detailText}${timeRangeText} (${minVal} min)`,
        category: "Justificación",
        duration_ms: durationMs,
        metadata: {
          justification: true,
          reason: justReason,
          detail: justDetail.trim(),
          time_range: justTimeRange.trim(),
          minutes: minVal,
        },
      });

      toast.success("Justificación de tiempo registrada correctamente.");
      setJustDetail("");
      setJustTimeRange("");
      setActiveTab("resumen");
      setTimeout(() => fetchMyData(), 500);
    } catch (e: any) {
      toast.error("Error al registrar justificación");
    } finally {
      setSavingJust(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-md p-3 sm:p-4"
      onClick={onClose}
    >
      <div
        className="bg-card border border-border/80 rounded-3xl shadow-2xl w-full max-w-3xl max-h-[90vh] flex flex-col overflow-hidden animate-in fade-in zoom-in-95 duration-150"
        onClick={(e) => e.stopPropagation()}
      >
        {/* ── HEADER DEL MODAL ── */}
        <div className="px-6 py-4 border-b border-border/70 flex items-center justify-between bg-card/60">
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 rounded-2xl bg-gradient-to-tr from-violet-600 to-indigo-600 text-white grid place-items-center shadow-md">
              <Activity className="h-5 w-5" />
            </div>
            <div>
              <h2 className="text-base font-black text-foreground">Mi Actividad Diaria</h2>
              <p className="text-xs text-muted-foreground">
                Consolidado de tiempo de hoy: <span className="font-semibold text-foreground">{agentName}</span>
              </p>
            </div>
          </div>

          <button
            onClick={onClose}
            className="h-8 w-8 rounded-xl bg-muted/60 hover:bg-muted text-muted-foreground hover:text-foreground grid place-items-center transition-colors"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* ── PESTAÑAS ── */}
        <div className="px-6 pt-3 flex gap-2 border-b border-border/50 bg-muted/20">
          <button
            onClick={() => setActiveTab("resumen")}
            className={`flex items-center gap-2 px-4 py-2.5 rounded-t-2xl font-bold text-xs transition-all ${
              activeTab === "resumen"
                ? "bg-card text-violet-400 border-t border-x border-border shadow-sm -mb-px"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            <BarChart3 className="h-4 w-4" />
            Resumen & Categorías
          </button>
          <button
            onClick={() => setActiveTab("justificar")}
            className={`flex items-center gap-2 px-4 py-2.5 rounded-t-2xl font-bold text-xs transition-all ${
              activeTab === "justificar"
                ? "bg-card text-violet-400 border-t border-x border-border shadow-sm -mb-px"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            <FileEdit className="h-4 w-4" />
            Justificar Tiempo Perdido / Laguna
          </button>
        </div>

        {/* ── CONTENIDO SCROLLABLE ── */}
        <div className="flex-1 overflow-y-auto p-6 space-y-6">
          {activeTab === "resumen" ? (
            loading ? (
              <div className="py-16 text-center space-y-3">
                <div className="h-8 w-8 border-2 border-violet-500 border-t-transparent rounded-full animate-spin mx-auto" />
                <p className="text-xs text-muted-foreground">Cargando métricas de actividad...</p>
              </div>
            ) : (
              <div className="space-y-6">
                {/* 1. Tarjetas KPI de la Jornada Base (10 horas) */}
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                  <div className="p-3.5 rounded-2xl bg-card border border-border/70 flex flex-col justify-between gap-2 shadow-sm">
                    <div className="flex items-center justify-between">
                      <span className="text-[10px] font-black uppercase tracking-wider text-muted-foreground">
                        Meta Jornada
                      </span>
                      <div className="h-7 w-7 rounded-lg bg-violet-500/15 text-violet-400 grid place-items-center shrink-0">
                        <Briefcase className="h-3.5 w-3.5" />
                      </div>
                    </div>
                    <div>
                      <p className="text-xl font-black text-violet-400 tabular-nums whitespace-nowrap tracking-tight">
                        {targetDailyHours}h 00m
                      </p>
                      <span className="text-[10px] text-muted-foreground font-medium">Jornada estándar</span>
                    </div>
                  </div>

                  <div className="p-3.5 rounded-2xl bg-card border border-border/70 flex flex-col justify-between gap-2 shadow-sm">
                    <div className="flex items-center justify-between">
                      <span className="text-[10px] font-black uppercase tracking-wider text-muted-foreground">
                        Tiempo Activo
                      </span>
                      <div className="h-7 w-7 rounded-lg bg-emerald-500/15 text-emerald-400 grid place-items-center shrink-0">
                        <Clock className="h-3.5 w-3.5" />
                      </div>
                    </div>
                    <div>
                      <p className="text-xl font-black text-emerald-400 tabular-nums whitespace-nowrap tracking-tight">
                        {formatMinHours(activeDisplayMs)}
                      </p>
                      <span className="text-[10px] text-emerald-500/80 font-medium">Actividad registrada</span>
                    </div>
                  </div>

                  <div className="p-3.5 rounded-2xl bg-card border border-border/70 flex flex-col justify-between gap-2 shadow-sm">
                    <div className="flex items-center justify-between">
                      <span className="text-[10px] font-black uppercase tracking-wider text-muted-foreground">
                        Tiempo Restante
                      </span>
                      <div className="h-7 w-7 rounded-lg bg-sky-500/15 text-sky-400 grid place-items-center shrink-0">
                        <TrendingUp className="h-3.5 w-3.5" />
                      </div>
                    </div>
                    <div>
                      <p className="text-xl font-black text-sky-400 tabular-nums whitespace-nowrap tracking-tight">
                        {deficitMs > 0 ? formatMinHours(deficitMs) : "0m"}
                      </p>
                      <span className="text-[10px] text-sky-500/80 font-medium">
                        {deficitMs > 0 ? "Para cumplir meta" : "¡Meta cumplida!"}
                      </span>
                    </div>
                  </div>

                  <div className="p-3.5 rounded-2xl bg-card border border-border/70 flex flex-col justify-between gap-2 shadow-sm">
                    <div className="flex items-center justify-between">
                      <span className="text-[10px] font-black uppercase tracking-wider text-muted-foreground">
                        Pausas / Almuerzo
                      </span>
                      <div className="h-7 w-7 rounded-lg bg-amber-500/15 text-amber-400 grid place-items-center shrink-0">
                        <Clock className="h-3.5 w-3.5" />
                      </div>
                    </div>
                    <div>
                      <p className="text-xl font-black text-amber-400 tabular-nums whitespace-nowrap tracking-tight">
                        {formatMinHours(totalIdleMs)}
                      </p>
                      <span className="text-[10px] text-amber-500/80 font-medium">Inactividad acumulada</span>
                    </div>
                  </div>
                </div>

                {/* Panel Consolidado de Sesión y Progreso */}
                <div className="p-4 rounded-2xl bg-muted/20 border border-border/60 space-y-3.5">
                  <div className="flex flex-wrap items-center justify-between gap-3 text-xs">
                    <div className="flex items-center gap-2.5 font-mono">
                      <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-400">
                        <LogIn className="h-3.5 w-3.5" />
                        <span className="text-[10px] uppercase font-sans font-bold text-emerald-500/80">Inicio Sesión:</span>
                        <span className="font-bold">{firstLoginTime || "--:--"}</span>
                      </div>
                      <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-slate-500/10 border border-slate-500/20 text-slate-300">
                        <LogOut className="h-3.5 w-3.5" />
                        <span className="text-[10px] uppercase font-sans font-bold text-slate-400">Última marca:</span>
                        <span className="font-bold">{lastLogoutTime || "--:--"}</span>
                      </div>
                    </div>

                    {rawOvertimeMs > 0 && (
                      <div>
                        {isOvertimeApproved ? (
                          <span className="px-3 py-1.5 rounded-xl bg-emerald-500/15 border border-emerald-500/30 text-emerald-400 font-bold flex items-center gap-1.5">
                            <CheckCircle2 className="h-3.5 w-3.5" />
                            Tiempo Extra Aprobado: +{formatMinHours(rawOvertimeMs)}
                          </span>
                        ) : (
                          <span className="px-3 py-1.5 rounded-xl bg-amber-500/15 border border-amber-500/30 text-amber-400 font-bold flex items-center gap-1.5" title="El tiempo extra requiere autorización del supervisor">
                            <Clock className="h-3.5 w-3.5 animate-pulse" />
                            +{formatMinHours(rawOvertimeMs)} extra pendiente de autorización
                          </span>
                        )}
                      </div>
                    )}
                  </div>

                  {/* Barra de Progreso */}
                  <div className="space-y-1.5 pt-1">
                    <div className="flex justify-between items-center text-xs font-bold">
                      <span className="text-emerald-400">
                        Cumplimiento de Jornada: {compliancePercent}% ({formatMinHours(activeDisplayMs)} / {targetDailyHours}h)
                      </span>
                      <span className="text-sky-400 text-[11px]">
                        {deficitMs > 0 ? `Faltan ${formatMinHours(deficitMs)} para completar` : "¡Jornada de 10h completada!"}
                      </span>
                    </div>
                    <div className="h-2.5 w-full rounded-full bg-slate-800/80 overflow-hidden flex shadow-inner">
                      <div
                        className="bg-gradient-to-r from-emerald-500 to-teal-400 transition-all duration-500 rounded-full"
                        style={{ width: `${Math.min(100, compliancePercent)}%` }}
                      />
                      <div
                        className="bg-transparent transition-all duration-500"
                        style={{ width: `${Math.max(0, 100 - compliancePercent)}%` }}
                      />
                    </div>
                  </div>
                </div>

                {/* 2. Desglose por Categorías de Tiempo */}
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <h3 className="text-xs font-black uppercase tracking-wider text-muted-foreground flex items-center gap-2">
                      <BarChart3 className="h-4 w-4 text-violet-400" />
                      Distribución de Tiempo por Categorías
                    </h3>
                    <span className="text-[11px] font-medium text-muted-foreground">
                      {categoriesList.length} {categoriesList.length === 1 ? "categoría" : "categorías"}
                    </span>
                  </div>

                  {categoriesList.length === 0 ? (
                    <div className="p-8 text-center rounded-2xl bg-muted/20 border border-border/50 text-xs text-muted-foreground">
                      No hay suficientes actividades registradas hoy todavía.
                    </div>
                  ) : (
                    <div className="space-y-2.5">
                      <div className="space-y-2">
                        {paginatedCategories.map((cat) => (
                          <div
                            key={cat.category}
                            className="p-3.5 rounded-2xl bg-card border border-border/70 flex flex-col gap-2 hover:border-violet-500/40 transition-colors"
                          >
                            <div className="flex items-center justify-between">
                              <div className="flex items-center gap-2.5">
                                <div className="p-1.5 rounded-lg bg-muted border border-border">
                                  {getCategoryIcon(cat.category)}
                                </div>
                                <span className="font-bold text-xs text-foreground">{cat.category}</span>
                              </div>
                              <div className="text-right">
                                <span className="font-mono font-bold text-xs text-foreground">
                                  {formatMinHours(cat.durationMs)}
                                </span>
                                <span className="text-[10px] text-muted-foreground ml-1.5">
                                  ({cat.percentage}%)
                                </span>
                              </div>
                            </div>

                            <div className="h-1.5 w-full rounded-full bg-muted/60 overflow-hidden">
                              <div
                                className="h-full bg-gradient-to-r from-violet-500 to-indigo-500 rounded-full transition-all duration-500"
                                style={{ width: `${cat.percentage}%` }}
                              />
                            </div>
                          </div>
                        ))}
                      </div>

                      {/* Paginador Interactivo */}
                      {categoriesList.length > ITEMS_PER_PAGE && (
                        <div className="pt-2 flex items-center justify-between border-t border-border/50 text-xs">
                          <span className="text-muted-foreground text-[11px]">
                            Mostrando {(currentCatPage - 1) * ITEMS_PER_PAGE + 1} -{" "}
                            {Math.min(currentCatPage * ITEMS_PER_PAGE, categoriesList.length)} de {categoriesList.length} categorías
                          </span>
                          <div className="flex items-center gap-1.5">
                            <button
                              type="button"
                              disabled={currentCatPage <= 1}
                              onClick={() => setCatPage((p) => Math.max(1, p - 1))}
                              className="px-2.5 py-1 rounded-lg border border-border bg-background hover:bg-muted text-foreground text-xs font-semibold disabled:opacity-40 disabled:pointer-events-none transition-colors flex items-center gap-1"
                            >
                              <ChevronLeft className="h-3.5 w-3.5" />
                              Anterior
                            </button>
                            <span className="px-2 py-0.5 text-[11px] font-bold text-muted-foreground font-mono">
                              {currentCatPage} / {totalCatPages}
                            </span>
                            <button
                              type="button"
                              disabled={currentCatPage >= totalCatPages}
                              onClick={() => setCatPage((p) => Math.min(totalCatPages, p + 1))}
                              className="px-2.5 py-1 rounded-lg border border-border bg-background hover:bg-muted text-foreground text-xs font-semibold disabled:opacity-40 disabled:pointer-events-none transition-colors flex items-center gap-1"
                            >
                              Siguiente
                              <ChevronRight className="h-3.5 w-3.5" />
                            </button>
                          </div>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              </div>
            )
          ) : (
            /* ── PESTAÑA: JUSTIFICAR TIEMPO PERDIDO / LAGUNA ── */
            <form onSubmit={handleSendJustification} className="space-y-5">
              <div className="p-4 rounded-2xl bg-violet-500/10 border border-violet-500/20 text-xs text-violet-300 flex items-start gap-3">
                <AlertCircle className="h-5 w-5 text-violet-400 shrink-0 mt-0.5" />
                <div className="space-y-1">
                  <p className="font-bold text-foreground">¿Tuviste un período fuera de estación no registrado?</p>
                  <p className="text-muted-foreground leading-relaxed">
                    Si atendiste a un cliente presencial, fuiste a bodega, tuviste un problema técnico o una reunión, justifica los minutos aquí para que el sistema los compute como tiempo productivo justificado en la auditoría.
                  </p>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                {/* Motivo Principal */}
                <div className="space-y-1.5">
                  <label className="text-xs font-bold text-foreground">Motivo de la actividad:</label>
                  <select
                    value={justReason}
                    onChange={(e) => setJustReason(e.target.value)}
                    className="w-full px-3 py-2.5 rounded-xl border border-border bg-background text-xs font-semibold focus:outline-none focus:ring-2 focus:ring-violet-500"
                  >
                    <option value="Atención presencial en mostrador">Atención presencial en mostrador</option>
                    <option value="Soporte técnico físico a cliente">Soporte técnico físico a cliente</option>
                    <option value="Traslado a Bodega / Búsqueda de repuestos">Traslado a Bodega / Búsqueda de repuestos</option>
                    <option value="Reunión o llamada de trabajo">Reunión o llamada de trabajo</option>
                    <option value="Limpieza y orden de taller">Limpieza y orden de taller</option>
                    <option value="Fallo eléctrico / Problema de conexión">Fallo eléctrico / Problema de conexión</option>
                    <option value="Capacitación / Inducción">Capacitación / Inducción</option>
                    <option value="Otro motivo justificado">Otro motivo justificado</option>
                  </select>
                </div>

                {/* Minutos estimados con chips */}
                <div className="space-y-2">
                  <label className="text-xs font-bold text-foreground">Tiempo aproximado (minutos):</label>
                  <div className="flex flex-wrap gap-1.5">
                    {[
                      { label: "15m", val: "15" },
                      { label: "30m", val: "30" },
                      { label: "45m", val: "45" },
                      { label: "1h", val: "60" },
                      { label: "1h 30m", val: "90" },
                      { label: "2h", val: "120" },
                    ].map((item) => (
                      <button
                        key={item.val}
                        type="button"
                        onClick={() => setJustMinutes(item.val)}
                        className={`px-2.5 py-1 rounded-xl text-xs font-semibold border transition-all ${
                          justMinutes === item.val
                            ? "bg-violet-600 text-white border-violet-600 shadow-sm shadow-violet-600/25"
                            : "bg-muted/40 border-border text-muted-foreground hover:text-foreground hover:bg-muted"
                        }`}
                      >
                        {item.label}
                      </button>
                    ))}
                  </div>
                  <select
                    value={justMinutes}
                    onChange={(e) => setJustMinutes(e.target.value)}
                    className="w-full px-3 py-2.5 rounded-xl border border-border bg-background text-xs font-semibold focus:outline-none focus:ring-2 focus:ring-violet-500"
                  >
                    <option value="10">10 minutos</option>
                    <option value="15">15 minutos</option>
                    <option value="20">20 minutos</option>
                    <option value="30">30 minutos</option>
                    <option value="45">45 minutos</option>
                    <option value="60">1 hora (60 minutos)</option>
                    <option value="90">1 hora y media (90 minutos)</option>
                    <option value="120">2 horas (120 minutos)</option>
                  </select>
                </div>
              </div>

              {/* Rango de Horas (Opcional) */}
              <div className="space-y-1.5">
                <label className="text-xs font-bold text-foreground">
                  Horario aproximado (Opcional, ej: &ldquo;7:30 AM - 8:00 AM&rdquo;):
                </label>
                <input
                  type="text"
                  placeholder="Ej: 7:30 a.m. a 8:00 a.m."
                  value={justTimeRange}
                  onChange={(e) => setJustTimeRange(e.target.value)}
                  className="w-full px-3 py-2.5 rounded-xl border border-border bg-background text-xs text-foreground placeholder:text-muted-foreground/60 focus:outline-none focus:ring-2 focus:ring-violet-500"
                />
              </div>

              {/* Detalle o Explicación */}
              <div className="space-y-1.5">
                <label className="text-xs font-bold text-foreground">
                  Detalle o descripción (Opcional):
                </label>
                <textarea
                  rows={3}
                  placeholder="Escriba cualquier detalle relevante para la supervisión (ej: Cliente Don Carlos vino por revisión de equipo...)"
                  value={justDetail}
                  onChange={(e) => setJustDetail(e.target.value)}
                  className="w-full p-3 rounded-xl border border-border bg-background text-xs text-foreground placeholder:text-muted-foreground/60 focus:outline-none focus:ring-2 focus:ring-violet-500 resize-none"
                />
              </div>

              <div className="pt-2 flex justify-end gap-2.5">
                <button
                  type="button"
                  onClick={() => setActiveTab("resumen")}
                  className="px-4 py-2.5 rounded-xl border border-border hover:bg-muted text-xs font-semibold text-muted-foreground transition-colors"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={savingJust}
                  className="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-violet-600 hover:bg-violet-700 text-white text-xs font-bold shadow-md shadow-violet-600/25 transition-all disabled:opacity-50"
                >
                  <Send className="h-3.5 w-3.5" />
                  {savingJust ? "Guardando..." : "Guardar Justificación"}
                </button>
              </div>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}