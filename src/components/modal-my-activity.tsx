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
  UserPlus,
  Users,
  SlidersHorizontal,
  Coffee,
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

const WORKSHOP_JUSTIFY_PRESETS = [
  { label: "Limpieza de taller", short: "Limpieza", icon: Sparkles, cat: "Gestión del Taller" },
  { label: "Bodega e Inventario", short: "Bodega", icon: Package, cat: "Gestión del Taller" },
  { label: "Iniciar Diagnóstico Físico", short: "Diagnóstico", icon: Wrench, cat: "Servicio de Taller" },
  { label: "Reparación de equipo", short: "Reparación", icon: Wrench, cat: "Servicio de Taller" },
  { label: "Atención presencial en mostrador", short: "Ventanilla", icon: UserPlus, cat: "Gestión del Taller" },
  { label: "Soporte a Ventas", short: "Soporte Ventas", icon: Briefcase, cat: "Soporte" },
  { label: "Gestión de Residuos", short: "Residuos", icon: Trash2, cat: "Gestión de Residuos" },
  { label: "Capacitación / Inducción", short: "Capacitación", icon: GraduationCap, cat: "On-the-Job Training (OJT)" },
  { label: "Reunión de taller", short: "Reunión", icon: Users, cat: "Control Administrativo" },
];

export function ModalMyActivity({ isOpen, onClose, agentEmail, agentName }: Props) {
  const [loading, setLoading] = useState(true);
  const [timeline, setTimeline] = useState<any[]>([]);
  const [activeTab, setActiveTab] = useState<"resumen" | "justificar">("resumen");

  // Filtro de Rango Temporal (Días, Semana, Mes, Personalizado)
  type RangeMode = "hoy" | "ayer" | "semana" | "mes" | "custom";
  const [rangeMode, setRangeMode] = useState<RangeMode>("hoy");
  const [customDate, setCustomDate] = useState<string>(() => {
    const d = new Date();
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, "0");
    const day = String(d.getDate()).padStart(2, "0");
    return `${y}-${m}-${day}`;
  });

  // Formulario de Justificación con fecha y rango de horas
  const [justDate, setJustDate] = useState<string>(() => {
    const d = new Date();
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, "0");
    const day = String(d.getDate()).padStart(2, "0");
    return `${y}-${m}-${day}`;
  });
  const [justStartTime, setJustStartTime] = useState("");
  const [justEndTime, setJustEndTime] = useState("");
  const [justTimeRange, setJustTimeRange] = useState("");
  const [justMinutes, setJustMinutes] = useState("15");
  const [justReason, setJustReason] = useState("Limpieza de taller");
  const [justDetail, setJustDetail] = useState("");
  const [savingJust, setSavingJust] = useState(false);
  const [targetDailyHours, setTargetDailyHours] = useState(10);
  const [overtimeInfo, setOvertimeInfo] = useState<any>(null);
  const [serverMetrics, setServerMetrics] = useState<any>(null);
  const [catPage, setCatPage] = useState(1);
  const ITEMS_PER_PAGE = 5;

  // Tolerancia oficial de inactividad configurada por los administradores (en minutos)
  const [toleranceMin, setToleranceMin] = useState<number>(3);

  useEffect(() => {
    fetch("/api/activity/schedule")
      .then((r) => r.json())
      .then((data) => {
        if (data?.toleranceMinutes) {
          setToleranceMin(Number(data.toleranceMinutes));
        }
      })
      .catch(() => {});
  }, []);

  const getDateRange = (mode: RangeMode, cDate: string) => {
    const now = new Date();
    const toYMD = (d: Date) => {
      const y = d.getFullYear();
      const m = String(d.getMonth() + 1).padStart(2, "0");
      const day = String(d.getDate()).padStart(2, "0");
      return `${y}-${m}-${day}`;
    };
    const todayStr = toYMD(now);

    if (mode === "ayer") {
      const yest = new Date(now);
      yest.setDate(yest.getDate() - 1);
      const yestStr = toYMD(yest);
      return { start: yestStr, end: yestStr, label: "Ayer" };
    }
    if (mode === "semana") {
      const startOfWeek = new Date(now);
      const day = startOfWeek.getDay();
      const diff = startOfWeek.getDate() - day + (day === 0 ? -6 : 1);
      startOfWeek.setDate(diff);
      return { start: toYMD(startOfWeek), end: todayStr, label: "Esta Semana" };
    }
    if (mode === "mes") {
      const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
      return { start: toYMD(startOfMonth), end: todayStr, label: "Este Mes" };
    }
    if (mode === "custom") {
      return { start: cDate, end: cDate, label: cDate };
    }
    return { start: todayStr, end: todayStr, label: "Hoy" };
  };

  const fetchMyData = async (mode: RangeMode = rangeMode, cDate: string = customDate) => {
    setLoading(true);
    try {
      const { start, end } = getDateRange(mode, cDate);
      const [resTimeline, resSchedule, resOvertime] = await Promise.all([
        fetch(`/api/activity/timeline?agent=${encodeURIComponent(agentEmail)}&date=${start}&endDate=${end}`),
        fetch(`/api/activity/schedule?agentEmail=${encodeURIComponent(agentEmail)}`),
        fetch(`/api/activity/overtime?date=${start}&agent=${encodeURIComponent(agentEmail)}`),
      ]);

      const data = await resTimeline.json();
      if (resTimeline.ok) {
        setTimeline(data.timeline || []);
        if (data.metrics) {
          setServerMetrics(data.metrics);
        }
      }

      const schedData = await resSchedule.json();
      if (schedData?.targetDailyHours) {
        setTargetDailyHours(Number(schedData.targetDailyHours));
      }
      if (schedData?.toleranceMinutes) {
        setToleranceMin(Number(schedData.toleranceMinutes));
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
      fetchMyData(rangeMode, customDate);
    }
  }, [isOpen, agentEmail, rangeMode, customDate]);

  // ─── CALCULAR MÉTRICAS CALIBRADAS ───
  const sorted = [...timeline]
    .filter((t) => Boolean(t.created_at))
    .sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime());

  const categoryMap: Record<string, { durationMs: number; count: number }> = {};
  let totalActiveMs = 0;
  let totalJustifiedMs = 0;
  const ACTIVE_GAP_LIMIT = toleranceMin * 60 * 1000; // Tolerancia dinámica gestionable por el usuario (en minutos)

  interface DetectedGap {
    id: string;
    dateStr: string;
    dateFormatted: string;
    startTime: string;
    endTime: string;
    startTimeVal: string;
    endTimeVal: string;
    durationMs: number;
    minutes: number;
    reason: string;
  }
  const detectedGaps: DetectedGap[] = [];

  const toTimeVal = (d: Date) => {
    const parts = d.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit", timeZone: "America/Costa_Rica" }).split(":");
    return `${parts[0]}:${parts[1]}`;
  };
  const toYMD = (d: Date) => {
    const parts = d.toLocaleDateString("en-CA", { timeZone: "America/Costa_Rica" });
    return parts;
  };

  // 1. Detectar rangos de pausas explícitas (Almuerzo, Descanso, Pausa personal/sanitaria)
  interface PauseRange {
    start: number;
    end: number;
    reason: string;
  }
  const pauseRanges: PauseRange[] = [];
  let currentPauseStart: number | null = null;
  let currentPauseReason = "";

  for (const item of sorted) {
    const act = (item.action || "").toLowerCase();
    const cat = item.category || "";
    const meta = (item.metadata || {}) as Record<string, any>;
    const t = new Date(item.created_at).getTime();

    const isPauseTask =
      cat === "Pausas y Descansos" ||
      cat === "Descanso" ||
      cat === "Pausa personal" ||
      cat === "Pausa Sanitaria" ||
      cat.toLowerCase().includes("pausa") ||
      cat.toLowerCase().includes("descanso") ||
      act.includes("almuerzo") ||
      act.includes("descanso") ||
      meta.task === "Almuerzo" ||
      meta.subcategory === "Almuerzo";

    const isPauseStart = (act.startsWith("inició:") || act.startsWith("inicio:")) && isPauseTask;
    const isPauseEnd = (act.startsWith("terminó:") || act.startsWith("termino:")) && isPauseTask;

    if (isPauseStart) {
      currentPauseStart = t;
      currentPauseReason = act;
    } else if (isPauseEnd) {
      if (currentPauseStart) {
        pauseRanges.push({ start: currentPauseStart, end: t, reason: currentPauseReason || act });
        currentPauseStart = null;
      } else {
        const discreteMs = Number(
          item.duration_ms ||
          (meta.duration_seconds ? meta.duration_seconds * 1000 : 0) ||
          (meta.minutes ? meta.minutes * 60000 : 0)
        ) || 0;
        if (discreteMs > 0) {
          pauseRanges.push({ start: t - discreteMs, end: t, reason: act });
        }
      }
    }
  }

  for (let i = 0; i < sorted.length; i++) {
    const item = sorted[i];
    const meta = (item.metadata || {}) as Record<string, any>;
    const currTime = new Date(item.created_at).getTime();
    const nextTime = i < sorted.length - 1 ? new Date(sorted[i + 1].created_at).getTime() : currTime + 60000;
    const gap = Math.max(0, nextTime - currTime);
    const act = (item.action || "").toLowerCase();
    const catRaw = item.category || "";
    const appStr = (meta.app || meta.app_name || "").toLowerCase();

    const inDeclaredPause = pauseRanges.some((p) => currTime >= p.start && currTime < p.end);
    const isScreensaver =
      act.includes(".scr") ||
      act.includes("mystify") ||
      act.includes("lockapp") ||
      appStr.includes(".scr") ||
      appStr.includes("mystify") ||
      appStr.includes("lockapp");

    const isSanitary =
      catRaw === "Pausa Sanitaria" ||
      catRaw === "Pausa personal" ||
      act.includes("sanitaria") ||
      act.includes("baño") ||
      act.includes("bano");

    const isBreak =
      catRaw === "Pausas y Descansos" ||
      catRaw === "Descanso" ||
      act.includes("almuerzo") ||
      act.includes("descanso") ||
      act.includes("comida") ||
      act.includes("café") ||
      act.includes("cafe") ||
      meta.task === "Almuerzo" ||
      meta.subcategory === "Almuerzo";

    // Si es pausa oficial autorizada (almuerzo, descanso, baño), es una pausa declarada y NO una laguna de inactividad
    if (inDeclaredPause || isBreak || isSanitary) {
      continue;
    }

    // Si es salvapantallas o bloqueo de pantalla explícito sin pausa declarada
    const isLockOrScreensaver =
      isScreensaver ||
      meta.reason === "lock_screen" ||
      meta.reason === "suspend";

    if (isLockOrScreensaver) {
      const pauseDur = Math.min(gap > 0 ? gap : 60000, 60 * 60 * 1000);
      if (pauseDur >= 60000) {
        const dStart = new Date(currTime);
        const dEnd = new Date(currTime + pauseDur);
        detectedGaps.push({
          id: `gap-${i}`,
          dateStr: toYMD(dStart),
          dateFormatted: dStart.toLocaleDateString("es-CR", { day: "numeric", month: "short", timeZone: "America/Costa_Rica" }),
          startTime: dStart.toLocaleTimeString("es-CR", { hour: "2-digit", minute: "2-digit", timeZone: "America/Costa_Rica" }),
          endTime: dEnd.toLocaleTimeString("es-CR", { hour: "2-digit", minute: "2-digit", timeZone: "America/Costa_Rica" }),
          startTimeVal: toTimeVal(dStart),
          endTimeVal: toTimeVal(dEnd),
          durationMs: pauseDur,
          minutes: Math.round(pauseDur / 60000),
          reason: "Salvapantallas / Bloqueo de Pantalla",
        });
      }
      continue;
    }

    const isJust = Boolean(meta.justification || catRaw === "Justificación" || act.startsWith("justificación:") || act.startsWith("justificacion:"));
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
      totalJustifiedMs += justMs;
      continue;
    }

    const isManualStart = (act.startsWith("inició:") || act.startsWith("inicio:")) && (meta.manual || meta.task);
    const isManualEnd = (act.startsWith("terminó:") || act.startsWith("termino:")) && (meta.manual || meta.task);

    if (isManualStart) {
      const dur = Math.min(gap, 4 * 60 * 60 * 1000);
      const cat = meta.task || catRaw || "Labores de Taller";
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
        const cat = meta.task || catRaw || "Labores de Taller";
        if (!categoryMap[cat]) categoryMap[cat] = { durationMs: 0, count: 0 };
        categoryMap[cat].durationMs += dur;
        categoryMap[cat].count++;
        totalActiveMs += dur;
      }
      continue;
    }

    let cat = extractSmartAppName(item);

    if (gap <= ACTIVE_GAP_LIMIT) {
      if (!categoryMap[cat]) categoryMap[cat] = { durationMs: 0, count: 0 };
      categoryMap[cat].durationMs += gap;
      categoryMap[cat].count++;
      totalActiveMs += gap;
    } else {
      if (!categoryMap[cat]) categoryMap[cat] = { durationMs: 0, count: 0 };
      categoryMap[cat].durationMs += ACTIVE_GAP_LIMIT;
      categoryMap[cat].count++;
      totalActiveMs += ACTIVE_GAP_LIMIT;

      const idlePartMs = gap - ACTIVE_GAP_LIMIT;

      // Solo si la inactividad real después de la tolerancia (5 min) es de al menos 1 minuto completo
      // Evita falsos positivos de microsegundos por latencia de red entre pings del tracker
      if (idlePartMs >= 60000) {
        const dStart = new Date(currTime + ACTIVE_GAP_LIMIT);
        const dEnd = new Date(nextTime);
        detectedGaps.push({
          id: `gap-${i}`,
          dateStr: toYMD(dStart),
          dateFormatted: dStart.toLocaleDateString("es-CR", { day: "numeric", month: "short", timeZone: "America/Costa_Rica" }),
          startTime: dStart.toLocaleTimeString("es-CR", { hour: "2-digit", minute: "2-digit", timeZone: "America/Costa_Rica" }),
          endTime: dEnd.toLocaleTimeString("es-CR", { hour: "2-digit", minute: "2-digit", timeZone: "America/Costa_Rica" }),
          startTimeVal: toTimeVal(dStart),
          endTimeVal: toTimeVal(dEnd),
          durationMs: idlePartMs,
          minutes: Math.round(idlePartMs / 60000),
          reason: `Inactividad prolongada (> ${toleranceMin} min tolerancia)`,
        });
      }
    }
  }

  // Ordenar lagunas de más reciente a más antigua
  detectedGaps.reverse();

  // Descontar lagunas que coincidan con justificaciones existentes (por horario o compensadas)
  const remainingGaps: DetectedGap[] = [];
  let availableJustifiedMs = totalJustifiedMs;

  for (const gap of detectedGaps) {
    // 1. Coincidencia de horario con una justificación registrada
    const isDirectlyCovered = sorted.some((item) => {
      const meta = (item.metadata || {}) as Record<string, any>;
      const isJust = Boolean(
        meta.justification ||
        item.category === "Justificación" ||
        (item.action || "").toLowerCase().startsWith("justificación:") ||
        (item.action || "").toLowerCase().startsWith("justificacion:")
      );
      if (!isJust) return false;
      if (meta.date && meta.date === gap.dateStr) {
        if (meta.start_time && meta.end_time) {
          if (meta.start_time === gap.startTimeVal && meta.end_time === gap.endTimeVal) return true;
        }
      }
      return false;
    });

    if (isDirectlyCovered) {
      continue;
    }

    // 2. Compensación por minutos justificados acumulados en el período
    if (availableJustifiedMs >= gap.durationMs) {
      availableJustifiedMs -= gap.durationMs;
      continue;
    }

    remainingGaps.push(gap);
  }

  // Las lagunas vigentes son únicamente las que no han sido justificadas
  const activeDetectedGaps = remainingGaps;
  const rawGapsMs = activeDetectedGaps.reduce((acc, g) => acc + g.durationMs, 0);
  const totalIdleMs = rawGapsMs;

  // Cálculo de jornada base de 10 horas y tiempo perdido / tiempo extra
  const targetMs = targetDailyHours * 60 * 60 * 1000;
  const isOvertimeApproved = overtimeInfo?.status === "approved";
  const rawOvertimeMs = Math.max(0, totalActiveMs - targetMs);
  const deficitMs = Math.max(0, targetMs - totalActiveMs);

  // Inactividad real detectada (NUNCA usar deficitMs como tiempo perdido)
  const detectedLostMin = Math.max(0, Math.round(totalIdleMs / 60000));

  useEffect(() => {
    if (activeTab === "justificar") {
      if (detectedLostMin > 0) {
        setJustMinutes(String(detectedLostMin));
      }
      if (activeDetectedGaps.length === 1 && !justStartTime) {
        setJustDate(activeDetectedGaps[0].dateStr);
        setJustStartTime(activeDetectedGaps[0].startTimeVal);
        setJustEndTime(activeDetectedGaps[0].endTimeVal);
        setJustTimeRange(`${activeDetectedGaps[0].startTime} a ${activeDetectedGaps[0].endTime}`);
      } else if (!justDate) {
        const todayParts = new Date().toLocaleDateString("en-CA", { timeZone: "America/Costa_Rica" });
        setJustDate(todayParts);
      }
    }
  }, [activeTab, detectedLostMin, activeDetectedGaps.length]);

  const handleSelectGap = (gap: DetectedGap) => {
    setJustDate(gap.dateStr);
    setJustStartTime(gap.startTimeVal);
    setJustEndTime(gap.endTimeVal);
    setJustTimeRange(`${gap.startTime} a ${gap.endTime}`);
    setJustMinutes(String(gap.minutes));
    if (!justReason) {
      setJustReason("Atención presencial en mostrador");
    }
    toast.info(`Laguna seleccionada: ${gap.startTime} — ${gap.endTime} (${gap.minutes} min)`);
  };

  const handleTimeChange = (startVal: string, endVal: string) => {
    setJustStartTime(startVal);
    setJustEndTime(endVal);
    if (startVal && endVal) {
      const [sh, sm] = startVal.split(":").map(Number);
      const [eh, em] = endVal.split(":").map(Number);
      let diffMin = (eh * 60 + em) - (sh * 60 + sm);
      if (diffMin < 0) diffMin += 24 * 60;
      if (diffMin > 0) {
        setJustMinutes(String(diffMin));
        setJustTimeRange(`${startVal} a ${endVal}`);
      }
    }
  };

  // Si no está aprobado el tiempo extra, topar la visualización en 10 horas
  const activeDisplayMs = (rawOvertimeMs > 0 && !isOvertimeApproved) ? targetMs : totalActiveMs;
  const compliancePercent = targetMs > 0 ? Math.round((activeDisplayMs / targetMs) * 100) : 0;

  // ── Consolidación con la Única Fuente de Verdad (Métricas Oficiales) ──
  // Si el servidor provee métricas consolidadas sin solapamiento, las usamos para alineación perfecta con los otros paneles
  const officialActiveMs = (serverMetrics?.totalActiveMs !== undefined && (rangeMode === "hoy" || rangeMode === "custom"))
    ? serverMetrics.totalActiveMs
    : activeDisplayMs;

  const officialDeficitMs = (serverMetrics?.deficitMs !== undefined && (rangeMode === "hoy" || rangeMode === "custom"))
    ? serverMetrics.deficitMs
    : deficitMs;

  // Unificar con la inactividad real de lagunas para que la tarjeta superior y la pestaña muestren exactamente los mismos minutos
  const officialIdleMs = totalIdleMs;

  const officialBreakMs = (serverMetrics?.totalBreakMs !== undefined && (rangeMode === "hoy" || rangeMode === "custom"))
    ? serverMetrics.totalBreakMs
    : 0;

  const officialSanitaryMs = (serverMetrics?.totalSanitaryMs !== undefined && (rangeMode === "hoy" || rangeMode === "custom"))
    ? serverMetrics.totalSanitaryMs
    : 0;

  const officialCompliancePercent = targetMs > 0 ? Math.round((officialActiveMs / targetMs) * 100) : compliancePercent;

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

  // Ordenar categorías por mayor tiempo acumulado y paginar
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

  const handleSendJustification = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    const reasonToUse = justReason.trim() || "Atención presencial en mostrador";
    if (!justReason.trim()) {
      setJustReason(reasonToUse);
    }

    setSavingJust(true);
    try {
      const minVal = parseInt(justMinutes, 10) || 15;
      const durationMs = minVal * 60 * 1000;
      const detailText = justDetail.trim() ? ` — ${justDetail.trim()}` : "";
      const timeRangeText = justTimeRange.trim()
        ? ` [${justTimeRange.trim()}]`
        : (justStartTime && justEndTime ? ` [${justStartTime} - ${justEndTime}]` : "");
      const dateText = justDate ? ` (${justDate})` : "";

      const matchedPreset = WORKSHOP_JUSTIFY_PRESETS.find((p) => p.label === reasonToUse);
      const categoryToUse = matchedPreset?.cat || "Gestión del Taller";

      let customCreatedAt: string | undefined = undefined;
      if (justDate) {
        const timePart = justStartTime || "12:00";
        customCreatedAt = new Date(`${justDate}T${timePart}:00`).toISOString();
      }

      const payload = {
        agent_email: agentEmail,
        agent_name: agentName,
        action: `Justificación: ${reasonToUse}${detailText}${timeRangeText}${dateText} (${minVal} min)`,
        category: categoryToUse,
        duration_ms: durationMs,
        created_at: customCreatedAt,
        metadata: {
          justification: true,
          reason: reasonToUse,
          detail: justDetail.trim(),
          time_range: justTimeRange.trim() || (justStartTime && justEndTime ? `${justStartTime} a ${justEndTime}` : undefined),
          date: justDate,
          start_time: justStartTime || undefined,
          end_time: justEndTime || undefined,
          minutes: minVal,
          task: reasonToUse,
        },
      };

      const res = await fetch("/api/activity/log", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      if (!res.ok) {
        const errJson = await res.json().catch(() => ({}));
        throw new Error(errJson.error || "Error al registrar justificación");
      }

      // Actualización optimista inmediata en memoria para que no haya que recargar la página
      const optimisticLog = {
        ...payload,
        id: Date.now(),
        created_at: customCreatedAt || new Date().toISOString(),
      };
      setTimeline((prev) => [...prev, optimisticLog as any]);

      toast.success(`Justificación de ${minVal} min guardada para "${justReason}".`);
      setJustDetail("");
      setJustTimeRange("");
      setJustStartTime("");
      setJustEndTime("");
      setActiveTab("resumen");

      // Refrescar métricas del servidor
      await fetchMyData(rangeMode, customDate);
    } catch (e: any) {
      toast.error(e.message || "Error al registrar justificación");
    } finally {
      setSavingJust(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-md p-3 sm:p-4"
      onClick={onClose}
    >
      <div
        className="bg-card border border-border/80 rounded-3xl shadow-2xl w-full max-w-4xl max-h-[92vh] flex flex-col overflow-hidden animate-in fade-in zoom-in-95 duration-150"
        onClick={(e) => e.stopPropagation()}
      >
        {/* ── HEADER DEL MODAL ── */}
        <div className="px-6 py-4 border-b border-border/70 flex items-center justify-between bg-card/60">
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 rounded-2xl bg-gradient-to-tr from-violet-600 to-indigo-600 text-white grid place-items-center shadow-md">
              <Activity className="h-5 w-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-base font-black text-foreground">Mi Actividad Diaria</h2>
                <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-violet-500/20 text-violet-300 font-mono">
                  {getDateRange(rangeMode, customDate).label}
                </span>
              </div>
              <p className="text-xs text-muted-foreground">
                Consolidado de: <span className="font-semibold text-foreground">{agentName}</span>
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

        {/* ── SELECTOR DE RANGO TEMPORAL (Días, Semana, Mes) ── */}
        <div className="px-6 py-2.5 bg-muted/30 border-b border-border/60 flex flex-wrap items-center justify-between gap-2 text-xs">
          <div className="flex items-center gap-1.5 text-muted-foreground font-semibold">
            <Calendar className="h-3.5 w-3.5 text-violet-400" />
            <span>Rango / Período:</span>
          </div>
          <div className="flex items-center gap-1.5 flex-wrap">
            {[
              { id: "hoy" as const, label: "Hoy" },
              { id: "ayer" as const, label: "Ayer" },
              { id: "semana" as const, label: "Esta Semana" },
              { id: "mes" as const, label: "Este Mes" },
            ].map((item) => (
              <button
                key={item.id}
                type="button"
                onClick={() => setRangeMode(item.id)}
                className={`px-3 py-1 rounded-xl text-xs font-bold transition-all ${
                  rangeMode === item.id
                    ? "bg-violet-600 text-white shadow-sm shadow-violet-600/25"
                    : "bg-background border border-border text-muted-foreground hover:text-foreground hover:bg-muted"
                }`}
              >
                {item.label}
              </button>
            ))}
            <div className="flex items-center gap-1 pl-1">
              <input
                type="date"
                value={customDate}
                onChange={(e) => {
                  setCustomDate(e.target.value);
                  setRangeMode("custom");
                }}
                className={`px-2 py-0.5 rounded-xl text-xs font-semibold border bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-violet-500 ${
                  rangeMode === "custom" ? "border-violet-500 ring-1 ring-violet-500" : "border-border"
                }`}
              />
            </div>
          </div>
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
            Justificar Tiempo Perdido
            {detectedLostMin > 0 && (
              <span className="ml-1 px-2 py-0.5 rounded-full bg-amber-500/20 text-amber-300 text-[10px] font-bold font-mono">
                {detectedLostMin}m
              </span>
            )}
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
                <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
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
                        {formatMinHours(officialActiveMs)}
                      </p>
                      <span className="text-[10px] text-emerald-500/80 font-medium">Actividad productiva</span>
                    </div>
                  </div>

                  <div className="p-3.5 rounded-2xl bg-card border border-border/70 flex flex-col justify-between gap-2 shadow-sm">
                    <div className="flex items-center justify-between">
                      <span className="text-[10px] font-black uppercase tracking-wider text-muted-foreground">
                        Descanso / Almuerzo
                      </span>
                      <div className="h-7 w-7 rounded-lg bg-amber-500/15 text-amber-400 grid place-items-center shrink-0">
                        <Coffee className="h-3.5 w-3.5" />
                      </div>
                    </div>
                    <div>
                      <p className="text-xl font-black text-amber-400 tabular-nums whitespace-nowrap tracking-tight">
                        {formatMinHours(officialBreakMs + officialSanitaryMs)}
                      </p>
                      <span className="text-[10px] text-amber-500/80 font-medium">Pausa oficial registrada</span>
                    </div>
                  </div>

                  <div className="p-3.5 rounded-2xl bg-card border border-border/70 flex flex-col justify-between gap-2 shadow-sm">
                    <div className="flex items-center justify-between">
                      <span className="text-[10px] font-black uppercase tracking-wider text-muted-foreground">
                        Inactividad Real
                      </span>
                      <div className="h-7 w-7 rounded-lg bg-slate-500/15 text-slate-400 grid place-items-center shrink-0">
                        <Clock className="h-3.5 w-3.5" />
                      </div>
                    </div>
                    <div>
                      <p className="text-xl font-black text-slate-300 tabular-nums whitespace-nowrap tracking-tight">
                        {formatMinHours(officialIdleMs)}
                      </p>
                      <div className="flex items-center justify-between mt-0.5">
                        <span className="text-[10px] text-muted-foreground font-medium">Tolerancia: {toleranceMin} min</span>
                        {officialIdleMs > 0 && (
                          <button
                            type="button"
                            onClick={() => setActiveTab("justificar")}
                            className="text-[10px] font-bold text-violet-400 hover:text-violet-300 underline underline-offset-2 transition-colors"
                          >
                            Justificar
                          </button>
                        )}
                      </div>
                    </div>
                  </div>

                  <div className="p-3.5 rounded-2xl bg-card border border-border/70 flex flex-col justify-between gap-2 shadow-sm col-span-2 sm:col-span-1">
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
                        {officialDeficitMs > 0 ? formatMinHours(officialDeficitMs) : "0m"}
                      </p>
                      <span className="text-[10px] text-sky-500/80 font-medium">
                        {officialDeficitMs > 0 ? "Para cumplir meta" : "¡Meta cumplida!"}
                      </span>
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
                        Cumplimiento de Jornada: {officialCompliancePercent}% ({formatMinHours(officialActiveMs)} / {targetDailyHours}h)
                      </span>
                      <span className="text-sky-400 text-[11px]">
                        {officialDeficitMs > 0 ? `Faltan ${formatMinHours(officialDeficitMs)} para completar` : "¡Jornada de 10h completada!"}
                      </span>
                    </div>
                    <div className="h-2.5 w-full rounded-full bg-slate-800/80 overflow-hidden flex shadow-inner">
                      <div
                        className="bg-gradient-to-r from-emerald-500 to-teal-400 transition-all duration-500 rounded-full"
                        style={{ width: `${Math.min(100, officialCompliancePercent)}%` }}
                      />
                      <div
                        className="bg-transparent transition-all duration-500"
                        style={{ width: `${Math.max(0, 100 - officialCompliancePercent)}%` }}
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
              {/* Banner de Inactividad Real Detectada */}
              {detectedLostMin === 0 ? (
                <div className="p-5 sm:p-6 rounded-3xl bg-emerald-500/10 border border-emerald-500/30 flex items-center gap-4 shadow-sm">
                  <div className="p-3 rounded-2xl bg-emerald-500/20 text-emerald-400 shrink-0">
                    <CheckCircle2 className="h-6 w-6" />
                  </div>
                  <div className="space-y-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <h3 className="text-sm sm:text-base font-bold text-foreground">Sin inactividad detectada (0 minutos)</h3>
                      <span className="px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">
                        {getDateRange(rangeMode, customDate).label}
                      </span>
                      <span className="px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-muted text-muted-foreground">
                        Tolerancia: {toleranceMin} min
                      </span>
                    </div>
                    <p className="text-xs sm:text-sm text-muted-foreground leading-relaxed">
                      No se encontraron pausas mayores a {toleranceMin} minutos en este período. Toda la jornada transcurrió con actividad continua.
                    </p>
                  </div>
                </div>
              ) : (
                <div className="p-5 sm:p-6 rounded-3xl bg-gradient-to-r from-amber-500/15 via-amber-500/10 to-amber-500/5 border-2 border-amber-500/40 shadow-lg space-y-4">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                    <div className="flex items-start sm:items-center gap-3.5">
                      <div className="p-3 rounded-2xl bg-amber-500/25 text-amber-400 shrink-0 mt-0.5 sm:mt-0">
                        <Clock className="h-6 w-6" />
                      </div>
                      <div className="space-y-1">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="text-xs sm:text-sm font-bold text-foreground uppercase tracking-wider">Inactividad Real Detectada</span>
                          <span className="px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-amber-500/25 text-amber-300 border border-amber-500/30">
                            {getDateRange(rangeMode, customDate).label}
                          </span>
                          <span className="px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-muted text-muted-foreground">
                            Tolerancia: {toleranceMin} min
                          </span>
                        </div>
                        <p className="text-2xl sm:text-3xl font-black text-amber-400 font-mono">
                          {detectedLostMin} minutos <span className="text-base font-normal text-amber-300/80">({formatMinHours(detectedLostMin * 60000)})</span>
                        </p>
                      </div>
                    </div>

                    <button
                      type="button"
                      onClick={() => {
                        setJustMinutes(String(detectedLostMin));
                        if (!justReason) {
                          setJustReason("Atención presencial en mostrador");
                        }
                        if (activeDetectedGaps.length > 0) {
                          handleSelectGap(activeDetectedGaps[0]);
                          setJustMinutes(String(detectedLostMin));
                        }
                        toast.success(`${detectedLostMin} min seleccionados para justificar.`);
                      }}
                      className="px-5 py-3 rounded-2xl bg-amber-500 hover:bg-amber-400 text-black font-black text-xs sm:text-sm transition-all flex items-center justify-center gap-2 shadow-md shadow-amber-500/25 active:scale-95 shrink-0 self-stretch sm:self-auto cursor-pointer"
                    >
                      <Sparkles className="h-4 w-4" />
                      Usar {detectedLostMin} min detectados
                    </button>
                  </div>

                  {/* Resumen directo de la hora exacta */}
                  <div className="p-3.5 sm:p-4 rounded-2xl bg-black/40 border border-amber-500/30 flex items-start sm:items-center gap-3">
                    <AlertCircle className="h-5 w-5 text-amber-400 shrink-0 mt-0.5 sm:mt-0" />
                    <p className="text-xs sm:text-sm text-amber-200 font-medium leading-relaxed">
                      {activeDetectedGaps.length === 1 ? (
                        <>
                          <strong className="text-white">Hora exacta de la inactividad:</strong> de{" "}
                          <span className="font-mono font-bold text-amber-300 text-sm underline underline-offset-4">
                            {activeDetectedGaps[0].startTime}
                          </span>{" "}
                          a{" "}
                          <span className="font-mono font-bold text-amber-300 text-sm underline underline-offset-4">
                            {activeDetectedGaps[0].endTime}
                          </span>{" "}
                          ({activeDetectedGaps[0].minutes} min) el día {activeDetectedGaps[0].dateFormatted}.
                        </>
                      ) : (
                        <>
                          <strong className="text-white">Horarios detectados:</strong> Ocurrió en{" "}
                          <span className="font-bold text-amber-300">{activeDetectedGaps.length} momentos</span> durante la jornada. Selecciona una laguna de la lista abajo para justificarla con 1 clic.
                        </>
                      )}
                    </p>
                  </div>
                </div>
              )}

              {/* Lagunas e Inactividad Detectadas por Hora (Diseño Espacioso, Sin Apelmazar) */}
              {activeDetectedGaps.length > 0 && (
                <div className="space-y-3 p-5 sm:p-6 rounded-3xl bg-muted/30 border border-border/80 shadow-sm">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-1 pb-2 border-b border-border/50">
                    <div className="flex items-center gap-2">
                      <Clock className="h-4 w-4 text-amber-400" />
                      <h4 className="text-sm font-bold text-foreground">
                        Lagunas detectadas con fecha y hora exacta ({activeDetectedGaps.length}):
                      </h4>
                    </div>
                    <span className="text-xs text-muted-foreground">
                      Haz clic en cualquier laguna para seleccionarla
                    </span>
                  </div>

                  <div className="space-y-3 pt-1">
                    {activeDetectedGaps.map((gap) => {
                      const isSelected = justStartTime === gap.startTimeVal && justEndTime === gap.endTimeVal && justDate === gap.dateStr;
                      return (
                        <div
                          key={gap.id}
                          onClick={() => handleSelectGap(gap)}
                          className={`p-4 sm:p-5 rounded-2xl border transition-all cursor-pointer flex flex-col sm:flex-row sm:items-center justify-between gap-4 ${
                            isSelected
                              ? "bg-amber-500/20 border-amber-500 text-amber-200 ring-2 ring-amber-500/50 shadow-md"
                              : "bg-card border-border/90 hover:bg-muted/70 hover:border-amber-500/40 text-foreground"
                          }`}
                        >
                          <div className="space-y-2 min-w-0">
                            <div className="flex items-center gap-3 flex-wrap">
                              <div className="flex items-center gap-2">
                                <span className="px-3 py-1 rounded-xl bg-amber-500/15 border border-amber-500/30 text-amber-300 font-mono font-black text-sm sm:text-base">
                                  {gap.startTime}
                                </span>
                                <span className="text-xs font-bold text-muted-foreground uppercase">hasta</span>
                                <span className="px-3 py-1 rounded-xl bg-amber-500/15 border border-amber-500/30 text-amber-300 font-mono font-black text-sm sm:text-base">
                                  {gap.endTime}
                                </span>
                              </div>
                              <span className="px-3 py-1 rounded-full bg-amber-500 text-black font-black font-mono text-xs shadow-xs">
                                {gap.minutes} min de inactividad
                              </span>
                            </div>

                            <div className="flex items-center gap-2 text-xs sm:text-sm text-muted-foreground flex-wrap">
                              <span className="font-semibold text-foreground">📅 {gap.dateFormatted}</span>
                              <span>•</span>
                              <span>{gap.reason}</span>
                            </div>
                          </div>

                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              handleSelectGap(gap);
                            }}
                            className={`px-4 py-2.5 rounded-xl font-bold text-xs sm:text-sm transition-all shrink-0 ${
                              isSelected
                                ? "bg-amber-500 text-black shadow-md font-black"
                                : "bg-muted hover:bg-amber-500 hover:text-black border border-border text-foreground"
                            }`}
                          >
                            {isSelected ? "✓ Horario Seleccionado" : "Usar este horario"}
                          </button>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* Rango de Fecha y Horas Específicas */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 p-5 rounded-2xl bg-muted/20 border border-border/70">
                <div className="space-y-1.5">
                  <label className="text-xs font-bold text-foreground flex items-center gap-1.5 uppercase tracking-wider">
                    <Calendar className="h-3.5 w-3.5 text-violet-400" />
                    Fecha a justificar:
                  </label>
                  <input
                    type="date"
                    value={justDate}
                    onChange={(e) => setJustDate(e.target.value)}
                    className="w-full h-11 px-3.5 py-2 rounded-xl border border-border bg-background text-sm font-semibold focus:outline-none focus:ring-2 focus:ring-violet-500"
                  />
                </div>

                <div className="space-y-1.5">
                  <label className="text-xs font-bold text-foreground flex items-center gap-1.5 uppercase tracking-wider">
                    <Clock className="h-3.5 w-3.5 text-violet-400" />
                    Hora Inicio:
                  </label>
                  <input
                    type="time"
                    value={justStartTime}
                    onChange={(e) => handleTimeChange(e.target.value, justEndTime)}
                    className="w-full h-11 px-3.5 py-2 rounded-xl border border-border bg-background text-sm font-semibold focus:outline-none focus:ring-2 focus:ring-violet-500"
                  />
                </div>

                <div className="space-y-1.5">
                  <label className="text-xs font-bold text-foreground flex items-center gap-1.5 uppercase tracking-wider">
                    <Clock className="h-3.5 w-3.5 text-violet-400" />
                    Hora Fin:
                  </label>
                  <input
                    type="time"
                    value={justEndTime}
                    onChange={(e) => handleTimeChange(justStartTime, e.target.value)}
                    className="w-full h-11 px-3.5 py-2 rounded-xl border border-border bg-background text-sm font-semibold focus:outline-none focus:ring-2 focus:ring-violet-500"
                  />
                </div>
              </div>

              {/* Labores Manuales Elegibles (Tarjetas Amplias y Sin Texto Cortado) */}
              <div className="space-y-3">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-1">
                  <label className="text-xs font-bold text-foreground flex items-center gap-1.5 uppercase tracking-wider">
                    <Wrench className="h-4 w-4 text-violet-400" />
                    Labor realizada en taller (1 solo clic):
                  </label>
                  <span className="text-xs text-muted-foreground">Selecciona la actividad sin escribir</span>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3">
                  {WORKSHOP_JUSTIFY_PRESETS.map((preset) => {
                    const Icon = preset.icon;
                    const isSelected = justReason === preset.label;
                    return (
                      <button
                        key={preset.label}
                        type="button"
                        onClick={() => setJustReason(preset.label)}
                        className={`p-4 rounded-2xl border text-left flex items-start gap-3.5 transition-all relative overflow-hidden ${
                          isSelected
                            ? "bg-violet-600/15 border-violet-500 text-violet-200 ring-2 ring-violet-500/40 shadow-sm"
                            : "bg-card border-border/80 hover:bg-muted/70 text-muted-foreground hover:text-foreground"
                        }`}
                      >
                        <div
                          className={`p-2.5 rounded-xl shrink-0 transition-colors ${
                            isSelected ? "bg-violet-600 text-white shadow-sm" : "bg-muted text-muted-foreground"
                          }`}
                        >
                          <Icon className="h-5 w-5" />
                        </div>
                        <div className="min-w-0 flex-1">
                          <p className="text-xs sm:text-sm font-bold text-foreground leading-snug whitespace-normal break-words">
                            {preset.label}
                          </p>
                          <p className="text-[11px] text-muted-foreground mt-1 whitespace-normal break-words">
                            {preset.cat}
                          </p>
                        </div>
                        {isSelected && <CheckCircle2 className="h-4 w-4 text-violet-400 shrink-0 mt-0.5" />}
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Minutos a Justificar: Chips Rápidos + Input Numérico */}
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <label className="text-xs font-bold text-foreground">Tiempo a justificar:</label>
                  <span className="text-xs font-mono font-black text-violet-400">
                    {justMinutes} minutos ({formatMinHours((parseInt(justMinutes, 10) || 0) * 60000)})
                  </span>
                </div>

                <div className="flex flex-wrap items-center gap-1.5">
                  {detectedLostMin > 0 && (
                    <button
                      type="button"
                      onClick={() => setJustMinutes(String(detectedLostMin))}
                      className={`px-3 py-1.5 rounded-xl text-xs font-bold border transition-all ${
                        justMinutes === String(detectedLostMin)
                          ? "bg-amber-500 text-black border-amber-500 shadow-sm"
                          : "bg-amber-500/10 border-amber-500/30 text-amber-300 hover:bg-amber-500/20"
                      }`}
                    >
                      Exacto detectado ({detectedLostMin}m)
                    </button>
                  )}
                  {[15, 30, 45, 60, 90, 120].map((val) => {
                    const sVal = String(val);
                    const isSel = justMinutes === sVal;
                    return (
                      <button
                        key={val}
                        type="button"
                        onClick={() => setJustMinutes(sVal)}
                        className={`px-2.5 py-1.5 rounded-xl text-xs font-semibold border transition-all ${
                          isSel
                            ? "bg-violet-600 text-white border-violet-600 shadow-sm"
                            : "bg-muted/40 border-border text-muted-foreground hover:text-foreground hover:bg-muted"
                        }`}
                      >
                        {val < 60 ? `${val}m` : `${val / 60}h${val % 60 ? ` ${val % 60}m` : ""}`}
                      </button>
                    );
                  })}
                  <div className="flex items-center gap-1.5 ml-auto">
                    <span className="text-[11px] text-muted-foreground">Otro:</span>
                    <input
                      type="number"
                      min="1"
                      max="600"
                      value={justMinutes}
                      onChange={(e) => setJustMinutes(e.target.value)}
                      className="w-20 px-2 py-1 rounded-xl border border-border bg-background text-xs font-mono font-bold text-foreground text-center focus:ring-2 focus:ring-violet-500 focus:outline-none"
                    />
                    <span className="text-[11px] text-muted-foreground font-semibold">min</span>
                  </div>
                </div>
              </div>

              {/* Detalle o Explicación (Opcional) */}
              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-muted-foreground">
                  Detalle o nota <span className="text-[11px] text-muted-foreground/60">(Opcional - solo si deseas dar contexto)</span>:
                </label>
                <input
                  type="text"
                  placeholder="Ej: Cliente Don Carlos vino por revisión de equipo..."
                  value={justDetail}
                  onChange={(e) => setJustDetail(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl border border-border bg-background text-xs text-foreground placeholder:text-muted-foreground/60 focus:outline-none focus:ring-2 focus:ring-violet-500"
                />
              </div>

              {/* Botones de Acción */}
              <div className="pt-3 flex items-center justify-between border-t border-border/50">
                <p className="text-[11px] text-muted-foreground">
                  Se computará como labor oficial en tus métricas del período.
                </p>
                <div className="flex items-center gap-2">
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
                    className="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-violet-600 hover:bg-violet-700 text-white text-xs font-bold shadow-md shadow-violet-600/25 transition-all disabled:opacity-50 active:scale-95 cursor-pointer"
                  >
                    <Send className="h-3.5 w-3.5" />
                    {savingJust ? "Guardando..." : `Guardar Justificación (${justMinutes} min)`}
                  </button>
                </div>
              </div>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}