"use client";

import React, { useState, useEffect, useMemo } from "react";
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
  ChevronDown,
  ChevronUp,
  UserPlus,
  Users,
  SlidersHorizontal,
  Coffee,
  Sandwich,
  Bath,
  Plus,
  Monitor,
} from "lucide-react";
import { toast } from "sonner";
import { logActivity } from "@/lib/activity-client";
import { computeUnifiedActivityMetrics, formatDurationMs } from "@/lib/activity-engine";
import { extractSmartAppName } from "@/components/admin/activity-apps-ranking";
import { Toilet, getTaskIconComponent, ManualTaskItem } from "@/components/admin/manual-tasks-manager-modal";

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

const FALLBACK_MANUAL_TASKS: ManualTaskItem[] = [
  { id: "diagnostico", label: "Diagnóstico", category: "Servicio de Taller", subcategory: "Diagnóstico", iconName: "Wrench", color: "amber" },
  { id: "reparacion", label: "Reparación", category: "Servicio de Taller", subcategory: "Reparación", iconName: "Hammer", color: "sky" },
  { id: "ir_a_bodega", label: "Ir a Bodega", category: "Gestión del Taller", subcategory: "Bodega e Inventario", iconName: "Package", color: "orange" },
  { id: "limpieza_taller", label: "Limpieza de taller", category: "Gestión del Taller", subcategory: "Acondicionamiento del Área", iconName: "Sparkles", color: "emerald" },
  { id: "inventario", label: "Inventario", category: "Control Administrativo", subcategory: "Inventarios", iconName: "ClipboardList", color: "indigo" },
  { id: "almuerzo", label: "Almuerzo", category: "Descansos", subcategory: "Tiempo de Descanso", iconName: "Utensils", color: "amber" },
  { id: "bano", label: "Baño", category: "Pausa Sanitaria", subcategory: "Pausa Sanitaria", iconName: "Bath", color: "amber" },
  { id: "exhibidores", label: "Exhibidores", category: "Gestión del Taller", subcategory: "Exhibidor", iconName: "Tag", color: "amber" },
  { id: "inspeccion", label: "Inspección", category: "Control Administrativo", subcategory: "Devoluciones", iconName: "Search", color: "amber" },
  { id: "soporte_ventas", label: "Soporte a Ventas", category: "Soporte", subcategory: "Presencial", iconName: "Briefcase", color: "amber" },
  { id: "induccion_clientes", label: "Inducción a Clientes", category: "Soporte", subcategory: "Presencial", iconName: "Contact", color: "amber" },
  { id: "ventanilla", label: "Ventanilla", category: "Soporte", subcategory: "Presencial", iconName: "UserPlus", color: "amber" },
  { id: "ojt", label: "OJT", category: "On-the-Job Training (OJT)", subcategory: "Capacitación Técnica", iconName: "Briefcase", color: "amber" },
  { id: "reunion", label: "Reunión", category: "Control Administrativo", subcategory: "Informes y Documentación", iconName: "Users", color: "amber" },
];

const CATEGORY_HEX_MAP: Record<string, string> = {
  "Control Administrativo": "#3b82f6",
  "Gestión del Taller": "#6366f1",
  "Soporte": "#10b981",
  "Servicio de Taller": "#f59e0b",
  "Gestión de Residuos": "#f43f5e",
  "On-the-Job Training (OJT)": "#8b5cf6",
  "Justificación Manual": "#a855f7",
  "Utilidades": "#64748b",
  "Descansos": "#f97316",
  "Pausa Sanitaria": "#14b8a6",
};

const SOFTWARE_PALETTE = [
  "#8b5cf6", "#3b82f6", "#10b981", "#f59e0b", "#ec4899", "#06b6d4", "#6366f1", "#84cc16", "#e11d48", "#14b8a6"
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
  const [manualTasks, setManualTasks] = useState<ManualTaskItem[]>(FALLBACK_MANUAL_TASKS);
  const [justReason, setJustReason] = useState<string>("Diagnóstico");
  const [justDetail, setJustDetail] = useState("");
  const [savingJust, setSavingJust] = useState(false);
  const [targetDailyHours, setTargetDailyHours] = useState(10);
  const [overtimeInfo, setOvertimeInfo] = useState<any>(null);
  const [serverMetrics, setServerMetrics] = useState<any>(null);
  const [catPage, setCatPage] = useState(1);
  const ITEMS_PER_PAGE = 8;

  // Tolerancia oficial de inactividad configurada por los administradores (en minutos)
  const [toleranceMin, setToleranceMin] = useState<number>(15);
  const [scheduleStart, setScheduleStart] = useState<string>("07:00");
  const [scheduleEnd, setScheduleEnd] = useState<string>("17:00");
  const [showManualJustify, setShowManualJustify] = useState(false);

  // Sincronizar las opciones de labores manuales idénticas a la barra lateral
  useEffect(() => {
    const loadTasks = () => {
      try {
        const saved = localStorage.getItem("sek_manual_tasks_list");
        if (saved) {
          const parsed = JSON.parse(saved);
          if (Array.isArray(parsed) && parsed.length > 0) {
            setManualTasks(parsed);
          }
        }
      } catch {}

      fetch("/api/activity/manual-tasks", { cache: "no-store" })
        .then((r) => r.json())
        .then((data) => {
          if (data?.success && Array.isArray(data.tasks) && data.tasks.length > 0) {
            setManualTasks(data.tasks);
            try {
              localStorage.setItem("sek_manual_tasks_list", JSON.stringify(data.tasks));
            } catch {}
          }
        })
        .catch(() => {});
    };

    loadTasks();

    const handleUpdate = (e?: Event) => {
      try {
        const detail = (e as CustomEvent)?.detail;
        if (detail && Array.isArray(detail) && detail.length > 0) {
          setManualTasks([...detail]);
          return;
        }
      } catch {}
      loadTasks();
    };

    window.addEventListener("sekunet_manual_tasks_updated", handleUpdate);
    window.addEventListener("storage", handleUpdate);
    return () => {
      window.removeEventListener("sekunet_manual_tasks_updated", handleUpdate);
      window.removeEventListener("storage", handleUpdate);
    };
  }, []);

  useEffect(() => {
    if (manualTasks.length > 0 && (!justReason || !manualTasks.some((t) => t.label === justReason))) {
      setJustReason(manualTasks[0].label);
    }
  }, [manualTasks, justReason]);

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
      let dayTarget = schedData?.targetDailyHours ? Number(schedData.targetDailyHours) : 10;
      let dayStart = schedData?.scheduleStart || "08:00";
      let dayEnd = schedData?.scheduleEnd || "17:00";

      if (schedData?.useMixedSchedule && schedData?.daySchedules) {
        const parts = (start || "").split("-").map(Number);
        if (parts.length === 3) {
          const dObj = new Date(parts[0], parts[1] - 1, parts[2]);
          const dayId = dObj.getDay();
          const dayConfig = schedData.daySchedules[dayId];
          if (dayConfig) {
            if (dayConfig.start) dayStart = dayConfig.start;
            if (dayConfig.end) dayEnd = dayConfig.end;
            if (dayConfig.targetHours) dayTarget = Number(dayConfig.targetHours);
          }
        }
      }

      setTargetDailyHours(dayTarget);
      setScheduleStart(dayStart);
      setScheduleEnd(dayEnd);
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

  const [appMappings, setAppMappings] = useState<Record<string, any>>(() => {
    if (typeof window === "undefined") return {};
    try {
      const stored = localStorage.getItem("sek_app_categories");
      return stored ? JSON.parse(stored) : {};
    } catch {
      return {};
    }
  });

  useEffect(() => {
    fetch("/api/activity/app-categories")
      .then((r) => r.json())
      .then((data) => {
        if (data?.appMappings) {
          setAppMappings(data.appMappings);
        }
      })
      .catch(() => {});
  }, []);

  // ─── MOTOR UNIFICADO DE JORNADA (Single Source of Truth) ───
  const effectiveToleranceMin = Math.max(1, toleranceMin || 5);
  const metrics = useMemo(() => {
    return computeUnifiedActivityMetrics(timeline, {
      targetDailyHours,
      toleranceMinutes: effectiveToleranceMin,
      scheduleStart,
      scheduleEnd,
      appMappings,
    });
  }, [timeline, targetDailyHours, effectiveToleranceMin, scheduleStart, scheduleEnd, appMappings]);

  // Lagunas vigentes para justificar
  const activeDetectedGaps = metrics.detectedGaps;
  const officialIdleMs = metrics.masterBuckets.Inactivo.durationMs;
  // Paridad matemática estricta: El total debe corresponder exactamente a la suma de las lagunas individuales mostradas
  const detectedLostMin =
    activeDetectedGaps.length > 0
      ? activeDetectedGaps.reduce((acc, g) => acc + g.minutes, 0)
      : Math.round(officialIdleMs / 60000);

  const targetMs = targetDailyHours * 60 * 60 * 1000;
  const officialActiveMs = metrics.masterBuckets.Productivo.durationMs;
  const officialBreakMs = metrics.masterBuckets.Descanso.durationMs;
  const officialSanitaryMs = metrics.masterBuckets["Pausa Sanitaria"].durationMs;
  const officialDeficitMs = Math.max(0, targetMs - officialActiveMs);
  const officialCompliancePercent = metrics.compliancePercent;
  const firstLoginTime = metrics.firstLoginTime;
  const lastLogoutTime = metrics.lastLogoutTime;
  const isOvertimeApproved = overtimeInfo?.status === "approved";
  const rawOvertimeMs = Math.max(0, officialActiveMs - targetMs);

  // Modo de visualización en la pestaña Resumen (Por Categorías oficiales vs Por Software/Labor)
  const [categoryViewMode, setCategoryViewMode] = useState<"categories" | "software">("categories");
  const [selectedGapId, setSelectedGapId] = useState<string>("all");

  const handleSelectAllGaps = () => {
    setSelectedGapId("all");
    setJustMinutes(String(detectedLostMin));
    setJustTimeRange(`Total acumulado del día (${detectedLostMin} min)`);
    setJustStartTime("");
    setJustEndTime("");
    if (activeDetectedGaps.length > 0) {
      setJustDate(activeDetectedGaps[0].dateStr);
    }
    if (!justReason) {
      setJustReason(manualTasks[0]?.label || "Diagnóstico");
    }
    toast.info(`Seleccionados ${detectedLostMin} min para justificar todo de una vez.`);
  };

  useEffect(() => {
    if (activeTab === "justificar") {
      if (detectedLostMin > 0) {
        setJustMinutes(String(detectedLostMin));
        setSelectedGapId("all");
        setJustTimeRange(`Total acumulado del día (${detectedLostMin} min)`);
        setJustStartTime("");
        setJustEndTime("");
      }
      if (activeDetectedGaps.length > 0) {
        setJustDate(activeDetectedGaps[0].dateStr);
      } else if (!justDate) {
        const todayParts = new Date().toLocaleDateString("en-CA", { timeZone: "America/Costa_Rica" });
        setJustDate(todayParts);
      }
    }
  }, [activeTab, detectedLostMin, activeDetectedGaps.length]);

  const handleSelectGap = (gap: any) => {
    setSelectedGapId(gap.id);
    setJustDate(gap.dateStr);
    setJustStartTime(gap.startTimeVal);
    setJustEndTime(gap.endTimeVal);
    setJustTimeRange(`${gap.startTime} a ${gap.endTime}`);
    setJustMinutes(String(gap.minutes));
    if (!justReason) {
      setJustReason(manualTasks[0]?.label || "Diagnóstico");
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

  // Estados para gráfico de dona y desglose interactivo
  const [hoveredDonutItem, setHoveredDonutItem] = useState<{
    label: string;
    time: string;
    pct: number;
    color: string;
  } | null>(null);
  const [showZeroCategories, setShowZeroCategories] = useState(false);

  // Preparación gráfica y filtrado inteligente (sin paginación forzada)
  const chartData = useMemo(() => {
    if (categoryViewMode === "categories") {
      const active = metrics.operationalBuckets.filter((b) => b.durationMs > 0);
      const inactive = metrics.operationalBuckets.filter((b) => b.durationMs === 0);
      const totalActiveDuration = active.reduce((acc, b) => acc + b.durationMs, 0) || 1;

      const items = active.map((b) => {
        const pct = Math.round((b.durationMs / totalActiveDuration) * 100);
        return {
          id: b.id,
          label: b.label,
          durationMs: b.durationMs,
          formattedTime: b.formattedTime,
          percentage: pct,
          color: CATEGORY_HEX_MAP[b.id] || "#8b5cf6",
          iconName: b.iconName,
          isProductive: b.isProductive,
        };
      });

      return {
        items,
        inactive,
        totalDurationMs: totalActiveDuration,
      };
    } else {
      const active = metrics.topSoftware.filter((s) => s.durationMs > 0);
      const totalActiveDuration = active.reduce((acc, s) => acc + s.durationMs, 0) || 1;

      const items = active.slice(0, 10).map((s, idx) => {
        const pct = Math.round((s.durationMs / totalActiveDuration) * 100);
        return {
          id: s.name,
          label: s.name,
          durationMs: s.durationMs,
          formattedTime: s.formattedTime,
          percentage: pct,
          color: SOFTWARE_PALETTE[idx % SOFTWARE_PALETTE.length],
          iconName: "Monitor",
          isProductive: true,
        };
      });

      return {
        items,
        inactive: [],
        totalDurationMs: totalActiveDuration,
      };
    }
  }, [categoryViewMode, metrics]);

  // Segmentos geométricos SVG de la Dona
  const donutSegments = useMemo(() => {
    const radius = 58;
    const circumference = 2 * Math.PI * radius;
    let accumulatedRatio = 0;

    return chartData.items.map((item) => {
      const ratio = item.durationMs / chartData.totalDurationMs;
      const strokeDasharray = `${(ratio * circumference).toFixed(2)} ${circumference.toFixed(2)}`;
      const strokeDashoffset = -((accumulatedRatio * circumference).toFixed(2));
      accumulatedRatio += ratio;

      return {
        ...item,
        radius,
        strokeDasharray,
        strokeDashoffset,
      };
    });
  }, [chartData]);

  const formatMinHours = (ms: number) => {
    return formatDurationMs(ms);
  };

  const getCategoryIcon = (cat: string) => {
    const c = cat.toLowerCase();
    if (c.includes("residuo") || c.includes("desecho") || c.includes("reciclaj") || c.includes("chatarra")) return <Trash2 className="h-4 w-4 text-rose-400" />;
    if (c.includes("ojt") || c.includes("training") || c.includes("capacita") || c.includes("inducci") || c.includes("reunión") || c.includes("reunion")) return <GraduationCap className="h-4 w-4 text-violet-400" />;
    if (c.includes("soporte") || c.includes("mensajer") || c.includes("whatsapp") || c.includes("telef") || c.includes("llamada") || c.includes("linkus") || c.includes("ticket")) return <Headphones className="h-4 w-4 text-emerald-400" />;
    if (c.includes("servicio") || c.includes("diagnóst") || c.includes("diagnost") || c.includes("garant") || c.includes("rma") || c.includes("tienda 3d")) return <Wrench className="h-4 w-4 text-amber-400" />;
    if (c.includes("control") || c.includes("admin") || c.includes("correo") || c.includes("mail") || c.includes("excel") || c.includes("word") || c.includes("informe")) return <TrendingUp className="h-4 w-4 text-blue-400" />;
    if (c.includes("gestión del taller") || c.includes("gestion del taller") || c.includes("bodega") || c.includes("inventario") || c.includes("ventanilla") || c.includes("mostrador") || c.includes("limpieza") || c.includes("exhibidor")) return <Package className="h-4 w-4 text-indigo-400" />;
    if (c.includes("descanso") || c.includes("almuerzo") || c.includes("café") || c.includes("cafe")) return <Sandwich className="h-4 w-4 text-amber-400" />;
    if (c.includes("sanitaria") || c.includes("baño") || c.includes("bano") || c.includes("inodoro") || c.includes("wc")) return <Toilet className="h-4 w-4 text-cyan-400" />;
    if (c.includes("justificación")) return <CheckCircle2 className="h-4 w-4 text-cyan-400" />;
    return <Globe className="h-4 w-4 text-muted-foreground" />;
  };

  const handleSendJustification = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    const reasonToUse = justReason.trim() || manualTasks[0]?.label || "Labor de Taller";
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

      const matchedPreset = manualTasks.find((p) => p.label === reasonToUse);
      const categoryToUse = "Justificación Manual";

      let customCreatedAt: string | undefined = undefined;
      const todayCR = new Date().toLocaleDateString("en-CA", { timeZone: "America/Costa_Rica" });
      if (justDate && justDate !== todayCR) {
        const timePart = justStartTime || "08:00";
        customCreatedAt = new Date(`${justDate}T${timePart}:00`).toISOString();
      } else if (justStartTime && justDate === todayCR) {
        const candidate = new Date(`${justDate}T${justStartTime}:00`);
        customCreatedAt = candidate.getTime() <= Date.now() ? candidate.toISOString() : new Date().toISOString();
      } else {
        customCreatedAt = new Date().toISOString();
      }

      const payload = {
        agent_email: agentEmail,
        agent_name: agentName,
        action: `Justificación Manual: ${reasonToUse}${detailText}${timeRangeText}${dateText} (${minVal} min)`,
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
          original_category: matchedPreset?.category || "Gestión del Taller",
          subcategory: matchedPreset?.subcategory || undefined,
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
              <span className="ml-1 px-2 py-0.5 rounded-full bg-muted border border-border text-muted-foreground text-[10px] font-semibold font-mono">
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
              <div className="space-y-4">
                {/* 1. Tarjetas KPI de la Jornada - 6 métricas claras en una sola fila */}
                <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2.5">
                  {/* Meta */}
                  <div className="p-3 rounded-2xl bg-card border border-border/70 flex flex-col justify-between gap-1.5 shadow-2xs hover:border-border transition-all">
                    <div className="flex items-center justify-between">
                      <span className="text-[10px] font-black uppercase tracking-wider text-muted-foreground whitespace-nowrap">
                        Meta
                      </span>
                      <div className="h-6 w-6 rounded-lg bg-violet-500/15 text-violet-400 grid place-items-center shrink-0">
                        <Briefcase className="h-3 w-3" />
                      </div>
                    </div>
                    <div>
                      <p className="text-lg font-black text-violet-400 tabular-nums whitespace-nowrap tracking-tight font-mono">
                        {targetDailyHours}h 00m
                      </p>
                      <span className="text-[10px] text-muted-foreground font-medium block truncate">Jornada oficial</span>
                    </div>
                  </div>

                  {/* Trabajo PC */}
                  <div className="p-3 rounded-2xl bg-card border border-border/70 flex flex-col justify-between gap-1.5 shadow-2xs hover:border-border transition-all">
                    <div className="flex items-center justify-between">
                      <span className="text-[10px] font-black uppercase tracking-wider text-muted-foreground whitespace-nowrap">
                        Trabajo PC
                      </span>
                      <div className="h-6 w-6 rounded-lg bg-emerald-500/15 text-emerald-400 grid place-items-center shrink-0">
                        <Monitor className="h-3 w-3" />
                      </div>
                    </div>
                    <div>
                      <p className="text-lg font-black text-emerald-400 tabular-nums whitespace-nowrap tracking-tight font-mono">
                        {metrics.pcWorkTime}
                      </p>
                      <span className="text-[10px] text-emerald-500/80 font-medium block truncate">En pantalla</span>
                    </div>
                  </div>

                  {/* Labores Manuales */}
                  <div className="p-3 rounded-2xl bg-card border border-border/70 flex flex-col justify-between gap-1.5 shadow-2xs hover:border-border transition-all">
                    <div className="flex items-center justify-between">
                      <span className="text-[10px] font-black uppercase tracking-wider text-muted-foreground whitespace-nowrap">
                        Manuales
                      </span>
                      <div className="h-6 w-6 rounded-lg bg-cyan-500/15 text-cyan-400 grid place-items-center shrink-0">
                        <CheckCircle2 className="h-3 w-3" />
                      </div>
                    </div>
                    <div>
                      <p className="text-lg font-black text-cyan-400 tabular-nums whitespace-nowrap tracking-tight font-mono">
                        {metrics.manualJustificationTime}
                      </p>
                      <span className="text-[10px] text-cyan-500/80 font-medium block truncate">Fuera de PC</span>
                    </div>
                  </div>

                  {/* Descanso / Almuerzo */}
                  <div className="p-3 rounded-2xl bg-card border border-border/70 flex flex-col justify-between gap-1.5 shadow-2xs hover:border-border transition-all">
                    <div className="flex items-center justify-between">
                      <span className="text-[10px] font-black uppercase tracking-wider text-muted-foreground whitespace-nowrap">
                        Descanso
                      </span>
                      <div className="h-6 w-6 rounded-lg bg-amber-500/15 text-amber-400 grid place-items-center shrink-0">
                        <Coffee className="h-3 w-3" />
                      </div>
                    </div>
                    <div>
                      <p className="text-lg font-black text-amber-400 tabular-nums whitespace-nowrap tracking-tight font-mono">
                        {officialBreakMs >= 60000 ? formatMinHours(officialBreakMs) : "0m"}
                      </p>
                      <span className="text-[10px] text-amber-500/80 font-medium block truncate">Almuerzo / Café</span>
                    </div>
                  </div>

                  {/* Pausa Sanitaria */}
                  <div className="p-3 rounded-2xl bg-card border border-border/70 flex flex-col justify-between gap-1.5 shadow-2xs hover:border-border transition-all">
                    <div className="flex items-center justify-between">
                      <span className="text-[10px] font-black uppercase tracking-wider text-muted-foreground whitespace-nowrap">
                        Sanitaria
                      </span>
                      <div className="h-6 w-6 rounded-lg bg-teal-500/15 text-teal-400 grid place-items-center shrink-0">
                        <Toilet className="h-3 w-3" />
                      </div>
                    </div>
                    <div>
                      <p className="text-lg font-black text-teal-400 tabular-nums whitespace-nowrap tracking-tight font-mono">
                        {officialSanitaryMs >= 60000 ? formatMinHours(officialSanitaryMs) : "0m"}
                      </p>
                      <span className="text-[10px] text-teal-500/80 font-medium block truncate">Pausas SS.HH.</span>
                    </div>
                  </div>

                  {/* Inactividad */}
                  <div className="p-3 rounded-2xl bg-card border border-border/70 flex flex-col justify-between gap-1.5 shadow-2xs hover:border-border transition-all">
                    <div className="flex items-center justify-between">
                      <span className="text-[10px] font-black uppercase tracking-wider text-muted-foreground whitespace-nowrap">
                        Inactivo
                      </span>
                      <div className="h-6 w-6 rounded-lg bg-slate-500/15 text-slate-400 grid place-items-center shrink-0">
                        <Clock className="h-3 w-3" />
                      </div>
                    </div>
                    <div>
                      <p className="text-lg font-black text-slate-300 tabular-nums whitespace-nowrap tracking-tight font-mono">
                        {officialIdleMs >= 60000 ? formatMinHours(officialIdleMs) : "0m"}
                      </p>
                      <div className="flex items-center justify-between mt-0.5 text-[9.5px]">
                        <span className="text-muted-foreground">Tol: {toleranceMin}m</span>
                        {officialIdleMs >= 60000 && activeDetectedGaps.length > 0 && (
                          <button
                            type="button"
                            onClick={() => setActiveTab("justificar")}
                            className="font-bold text-violet-400 hover:text-violet-300 underline transition-colors cursor-pointer shrink-0"
                          >
                            Justificar
                          </button>
                        )}
                      </div>
                    </div>
                  </div>
                </div>

                {/* Panel Consolidado de Sesión y Progreso */}
                <div className="p-3 rounded-2xl bg-muted/20 border border-border/60 space-y-2.5">
                  <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
                    <div className="flex items-center gap-2 font-mono">
                      <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 text-[11px]">
                        <LogIn className="h-3 w-3" />
                        <span className="text-[9.5px] uppercase font-sans font-bold text-emerald-500/80">Entrada:</span>
                        <span className="font-bold">{firstLoginTime || "--:--"}</span>
                      </div>
                      <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-slate-500/10 border border-slate-500/20 text-slate-300 text-[11px]">
                        <LogOut className="h-3 w-3" />
                        <span className="text-[9.5px] uppercase font-sans font-bold text-slate-400">Última marca:</span>
                        <span className="font-bold">{lastLogoutTime || "--:--"}</span>
                      </div>
                    </div>

                    {rawOvertimeMs > 0 && (
                      <div>
                        {isOvertimeApproved ? (
                          <span className="px-2.5 py-1 rounded-lg bg-emerald-500/15 border border-emerald-500/30 text-emerald-400 font-bold text-[11px] flex items-center gap-1.5">
                            <CheckCircle2 className="h-3 w-3" />
                            Extra Aprobado: +{formatMinHours(rawOvertimeMs)}
                          </span>
                        ) : (
                          <span className="px-2.5 py-1 rounded-lg bg-amber-500/15 border border-amber-500/30 text-amber-400 font-bold text-[11px] flex items-center gap-1.5" title="Requiere autorización">
                            <Clock className="h-3 w-3 animate-pulse" />
                            +{formatMinHours(rawOvertimeMs)} extra en revisión
                          </span>
                        )}
                      </div>
                    )}
                  </div>

                  {/* Barra de Progreso */}
                  <div className="space-y-1">
                    <div className="flex justify-between items-center text-xs font-bold">
                      <span className="text-emerald-400 text-[11px]">
                        Cumplimiento: {officialCompliancePercent}% ({formatMinHours(officialActiveMs)} / {targetDailyHours}h)
                      </span>
                      <span className="text-sky-400 text-[11px]">
                        {officialDeficitMs > 0 ? `Faltan ${formatMinHours(officialDeficitMs)} para completar` : "¡Jornada de 10h completada!"}
                      </span>
                    </div>
                    <div className="h-2 w-full rounded-full bg-slate-800/80 overflow-hidden flex shadow-inner">
                      <div
                        className="bg-gradient-to-r from-emerald-500 to-teal-400 transition-all duration-500 rounded-full"
                        style={{ width: `${Math.min(100, officialCompliancePercent)}%` }}
                      />
                    </div>
                  </div>
                </div>

                {/* 2. Distribución Gráfica de Tiempo con Gráfico Donut y Leyenda Inteligente */}
                <div className="p-4 rounded-2xl bg-card border border-border/70 space-y-3.5 shadow-2xs">
                  {/* Selector y contador */}
                  <div className="flex flex-wrap items-center justify-between gap-2 pb-2 border-b border-border/40">
                    <div className="flex items-center gap-2">
                      <BarChart3 className="h-4 w-4 text-violet-400" />
                      <h3 className="text-xs font-black uppercase tracking-wider text-muted-foreground">
                        Distribución de Tiempo
                      </h3>
                    </div>
                    <div className="flex items-center gap-2">
                      <div className="flex bg-muted/60 p-0.5 rounded-lg border border-border/50 text-[10px] font-bold">
                        <button
                          type="button"
                          onClick={() => {
                            setCategoryViewMode("categories");
                            setHoveredDonutItem(null);
                          }}
                          className={`px-3 py-1 rounded-md transition-all cursor-pointer ${
                            categoryViewMode === "categories"
                              ? "bg-background text-foreground shadow-sm"
                              : "text-muted-foreground hover:text-foreground"
                          }`}
                        >
                          Por Categorías Oficiales
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            setCategoryViewMode("software");
                            setHoveredDonutItem(null);
                          }}
                          className={`px-3 py-1 rounded-md transition-all cursor-pointer ${
                            categoryViewMode === "software"
                              ? "bg-background text-foreground shadow-sm"
                              : "text-muted-foreground hover:text-foreground"
                          }`}
                        >
                          Por Software / Tarea
                        </button>
                      </div>
                      <span className="text-[11px] font-mono text-muted-foreground">
                        {chartData.items.length} {chartData.items.length === 1 ? "activa" : "activas"}
                      </span>
                    </div>
                  </div>

                  {chartData.items.length === 0 ? (
                    <div className="py-8 text-center rounded-xl bg-muted/20 border border-border/50 text-xs text-muted-foreground">
                      No hay actividades registradas en este período todavía.
                    </div>
                  ) : (
                    <div className="flex flex-col sm:flex-row items-center gap-6 pt-1">
                      {/* DONUT SVG CHART */}
                      <div className="relative flex items-center justify-center shrink-0 p-1">
                        <svg
                          viewBox="0 0 160 160"
                          className="w-40 h-40 transform -rotate-90 overflow-visible"
                        >
                          {donutSegments.map((seg) => {
                            const isHovered = hoveredDonutItem?.label === seg.label;
                            return (
                              <circle
                                key={seg.id}
                                cx="80"
                                cy="80"
                                r={seg.radius}
                                fill="transparent"
                                stroke={seg.color}
                                strokeWidth={isHovered ? "20" : "15"}
                                strokeDasharray={seg.strokeDasharray}
                                strokeDashoffset={seg.strokeDashoffset}
                                className="transition-all duration-300 ease-out cursor-pointer hover:opacity-90"
                                onMouseEnter={() =>
                                  setHoveredDonutItem({
                                    label: seg.label,
                                    time: seg.formattedTime,
                                    pct: seg.percentage,
                                    color: seg.color,
                                  })
                                }
                                onMouseLeave={() => setHoveredDonutItem(null)}
                              />
                            );
                          })}
                        </svg>

                        {/* TEXTO EN EL CENTRO DE LA DONA */}
                        <div className="absolute inset-0 flex flex-col items-center justify-center text-center pointer-events-none px-3">
                          <span className="text-[9.5px] font-bold uppercase tracking-wider text-muted-foreground line-clamp-1 max-w-[95px]">
                            {hoveredDonutItem ? hoveredDonutItem.label : "ACTIVO"}
                          </span>
                          <span
                            className="text-lg font-black font-mono tracking-tight"
                            style={{ color: hoveredDonutItem?.color || "#38bdf8" }}
                          >
                            {hoveredDonutItem ? hoveredDonutItem.time : formatMinHours(officialActiveMs)}
                          </span>
                          <span className="text-[9.5px] font-semibold text-muted-foreground">
                            {hoveredDonutItem ? `${hoveredDonutItem.pct}% del total` : `${officialCompliancePercent}% meta`}
                          </span>
                        </div>
                      </div>

                      {/* LEYENDA Y BARRAS COMPACTAS (2 Columnas) */}
                      <div className="flex-1 w-full space-y-2">
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 max-h-[260px] overflow-y-auto pr-1">
                          {chartData.items.map((item) => {
                            const isHovered = hoveredDonutItem?.label === item.label;
                            return (
                              <div
                                key={item.id}
                                onMouseEnter={() =>
                                  setHoveredDonutItem({
                                    label: item.label,
                                    time: item.formattedTime,
                                    pct: item.percentage,
                                    color: item.color,
                                  })
                                }
                                onMouseLeave={() => setHoveredDonutItem(null)}
                                className={`p-2 rounded-xl border transition-all cursor-pointer flex flex-col gap-1 ${
                                  isHovered
                                    ? "bg-muted/80 border-violet-500/50 shadow-xs scale-[1.01]"
                                    : "bg-muted/30 hover:bg-muted/50 border-border/60"
                                }`}
                              >
                                <div className="flex items-center justify-between gap-1.5">
                                  <div className="flex items-center gap-2 min-w-0">
                                    {(() => {
                                      const CatIcon = getTaskIconComponent(item.iconName || item.label);
                                      return (
                                        <div
                                          className="h-6 w-6 rounded-lg flex items-center justify-center shrink-0 border shadow-2xs"
                                          style={{
                                            backgroundColor: `${item.color}25`,
                                            borderColor: `${item.color}50`,
                                            color: item.color,
                                          }}
                                        >
                                          <CatIcon className="h-3.5 w-3.5" />
                                        </div>
                                      );
                                    })()}
                                    <span className="font-bold text-xs text-foreground truncate" title={item.label}>
                                      {item.label}
                                    </span>
                                  </div>
                                  <div className="text-right shrink-0">
                                    <span className="font-mono font-bold text-xs text-foreground">
                                      {item.formattedTime}
                                    </span>
                                    <span className="text-[10px] text-muted-foreground ml-1">
                                      ({item.percentage}%)
                                    </span>
                                  </div>
                                </div>
                                <div className="h-1.5 w-full rounded-full bg-muted/80 overflow-hidden">
                                  <div
                                    className="h-full rounded-full transition-all duration-300"
                                    style={{
                                      width: `${Math.min(100, item.percentage)}%`,
                                      backgroundColor: item.color,
                                    }}
                                  />
                                </div>
                              </div>
                            );
                          })}
                        </div>

                        {/* CATEGORÍAS SIN ACTIVIDAD (Colapsables para no desperdiciar espacio) */}
                        {categoryViewMode === "categories" && chartData.inactive.length > 0 && (
                          <div className="pt-1.5">
                            <button
                              type="button"
                              onClick={() => setShowZeroCategories(!showZeroCategories)}
                              className="text-[11px] font-semibold text-muted-foreground hover:text-foreground flex items-center gap-1.5 transition-colors cursor-pointer"
                            >
                              {showZeroCategories ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
                              <span>
                                {showZeroCategories
                                  ? "Ocultar categorías sin actividad"
                                  : `Ver ${chartData.inactive.length} categorías sin actividad hoy (0m)`}
                              </span>
                            </button>

                            {showZeroCategories && (
                              <div className="grid grid-cols-2 sm:grid-cols-4 gap-1.5 mt-2 animate-in fade-in duration-200">
                                {chartData.inactive.map((cat) => {
                                  const CatIcon = getTaskIconComponent(cat.iconName || cat.label);
                                  return (
                                    <div
                                      key={cat.id}
                                      className="p-1.5 px-2 rounded-lg bg-muted/20 border border-border/40 text-[10.5px] text-muted-foreground flex items-center justify-between"
                                    >
                                      <div className="flex items-center gap-1.5 min-w-0">
                                        <CatIcon className="h-3.5 w-3.5 shrink-0 opacity-70 text-violet-400" />
                                        <span className="truncate mr-1" title={cat.label}>
                                          {cat.label}
                                        </span>
                                      </div>
                                      <span className="font-mono text-[10px] opacity-70">0m</span>
                                    </div>
                                  );
                                })}
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              </div>
            )
          ) : (
            /* ── PESTAÑA: JUSTIFICAR TIEMPO PERDIDO / LAGUNA ── */
            <div className="space-y-4">
              {/* Banner de Inactividad Real Detectada */}
              {detectedLostMin === 0 ? (
                <div className="p-5 sm:p-6 rounded-2xl bg-emerald-500/10 border border-emerald-500/30 flex flex-col sm:flex-row sm:items-center justify-between gap-4 shadow-sm">
                  <div className="flex items-center gap-3.5">
                    <div className="p-2.5 rounded-xl bg-emerald-500/20 text-emerald-400 shrink-0">
                      <CheckCircle2 className="h-6 w-6" />
                    </div>
                    <div className="space-y-0.5">
                      <div className="flex items-center gap-2 flex-wrap">
                        <h3 className="text-sm font-bold text-foreground">Sin inactividad detectada (0 minutos)</h3>
                        <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">
                          {getDateRange(rangeMode, customDate).label}
                        </span>
                        <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-muted text-muted-foreground">
                          Tolerancia: {toleranceMin}m
                        </span>
                      </div>
                      <p className="text-xs text-muted-foreground leading-relaxed">
                        Toda tu jornada transcurrió con actividad continua. No tienes tiempos pendientes por justificar.
                      </p>
                    </div>
                  </div>

                  {!showManualJustify && (
                    <button
                      type="button"
                      onClick={() => setShowManualJustify(true)}
                      className="px-3.5 py-2 rounded-xl border border-border/80 bg-background/80 hover:bg-muted text-xs font-semibold text-foreground transition-all shrink-0 cursor-pointer flex items-center gap-1.5 self-start sm:self-auto"
                    >
                      <Plus className="h-3.5 w-3.5" />
                      Registrar labor fuera de PC
                    </button>
                  )}
                </div>
              ) : (
                <div className="p-4 rounded-2xl bg-card border border-border/80 shadow-xs space-y-3">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                    <div className="flex items-center gap-3">
                      <div className="p-2.5 rounded-xl bg-muted text-muted-foreground border border-border shrink-0">
                        <Clock className="h-5 w-5 text-violet-400" />
                      </div>
                      <div>
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="text-xs font-bold text-foreground">Inactividad por Justificar</span>
                          <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold bg-muted text-foreground border border-border">
                            {getDateRange(rangeMode, customDate).label}
                          </span>
                          <span className="px-2 py-0.5 rounded-full text-[10px] font-medium bg-muted/60 text-muted-foreground">
                            Tolerancia: {toleranceMin}m
                          </span>
                        </div>
                        <p className="text-xl font-bold text-foreground font-mono mt-0.5">
                          {detectedLostMin} minutos <span className="text-xs font-normal text-muted-foreground">({formatMinHours(detectedLostMin * 60000)})</span>
                        </p>
                      </div>
                    </div>

                    <button
                      type="button"
                      onClick={handleSelectAllGaps}
                      className="px-4 py-2 rounded-xl bg-violet-600 hover:bg-violet-700 text-white font-bold text-xs transition-all flex items-center justify-center gap-1.5 shadow-xs active:scale-95 shrink-0 cursor-pointer"
                    >
                      <Sparkles className="h-3.5 w-3.5" />
                      Usar {detectedLostMin} min detectados (Todo en 1 clic)
                    </button>
                  </div>

                  {activeDetectedGaps.length === 1 && (
                    <div className="px-3 py-2 rounded-xl bg-muted/30 border border-border flex items-center gap-2 text-xs text-muted-foreground">
                      <AlertCircle className="h-4 w-4 text-violet-400 shrink-0" />
                      <span>
                        Lapso registrado: <strong className="font-mono text-foreground">{activeDetectedGaps[0].startTime} a {activeDetectedGaps[0].endTime}</strong> ({activeDetectedGaps[0].minutes} min).
                      </span>
                    </div>
                  )}
                </div>
              )}

              {/* Lista de Lagunas si hay más de 1 */}
              {activeDetectedGaps.length > 1 && (
                <div className="space-y-2.5 p-3.5 rounded-xl bg-muted/20 border border-border/80">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold text-foreground">¿Cómo deseas justificar?</span>
                    <span className="text-[11px] text-muted-foreground font-medium">Puedes justificar todo junto o por partes</span>
                  </div>

                  {/* Opción 1: Todo junto en 1 solo paso */}
                  <div
                    onClick={handleSelectAllGaps}
                    className={`p-3 rounded-xl border transition-all cursor-pointer flex items-center justify-between text-xs ${
                      selectedGapId === "all"
                        ? "bg-violet-600/20 border-violet-500 text-violet-200 ring-2 ring-violet-500/50 font-bold"
                        : "bg-card border-border hover:bg-muted/70 text-foreground"
                    }`}
                  >
                    <div className="flex items-center gap-2.5">
                      <div className="h-7 w-7 rounded-lg bg-violet-600/30 text-violet-300 grid place-items-center shrink-0">
                        <Sparkles className="h-4 w-4" />
                      </div>
                      <div>
                        <p className="font-bold">Justificar TODO el tiempo detectado en 1 solo paso</p>
                        <p className="text-[10px] text-muted-foreground font-normal">Cubre las {activeDetectedGaps.length} lagunas detectadas del día sin hacerlo de a poquitos</p>
                      </div>
                    </div>
                    <span className="px-2.5 py-1 rounded-lg bg-violet-600 text-white font-bold font-mono text-xs shrink-0">
                      {detectedLostMin} min
                    </span>
                  </div>

                  <span className="text-[11px] font-semibold text-muted-foreground block pt-1">O selecciona una laguna individual si fue una labor distinta:</span>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                    {activeDetectedGaps.map((gap) => {
                      const isSelected = selectedGapId === gap.id;
                      return (
                        <div
                          key={gap.id}
                          onClick={() => handleSelectGap(gap)}
                          className={`p-2.5 rounded-xl border transition-all cursor-pointer flex items-center justify-between text-xs ${
                            isSelected
                              ? "bg-violet-600/15 border-violet-500 text-violet-200 ring-1 ring-violet-500/50"
                              : "bg-card border-border hover:bg-muted/70 text-foreground"
                          }`}
                        >
                          <span className="font-mono font-semibold text-foreground">{gap.startTime} - {gap.endTime}</span>
                          <span className="px-2 py-0.5 rounded-md bg-muted border border-border font-bold font-mono text-[10px] text-foreground">
                            {gap.minutes} min
                          </span>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* Formulario de Justificación (Visible si hay inactividad o el usuario pulsa "+ Registrar labor") */}
              {(detectedLostMin > 0 || showManualJustify) && (
                <form onSubmit={handleSendJustification} className="space-y-3.5 pt-1">
                  {/* Rango de Fecha y Horas Específicas en 1 sola fila compacta */}
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 p-3 rounded-xl bg-muted/20 border border-border/70">
                    <div className="space-y-1">
                      <label className="text-[10px] font-bold text-muted-foreground flex items-center gap-1 uppercase tracking-wider">
                        <Calendar className="h-3 w-3 text-violet-400" />
                        Fecha:
                      </label>
                      <input
                        type="date"
                        value={justDate}
                        onChange={(e) => setJustDate(e.target.value)}
                        className="w-full h-8 px-2.5 py-1 rounded-lg border border-border bg-background text-xs font-semibold focus:outline-none focus:ring-1 focus:ring-violet-500"
                      />
                    </div>
                    {selectedGapId === "all" ? (
                      <div className="sm:col-span-2 space-y-1">
                        <label className="text-[10px] font-bold text-muted-foreground flex items-center gap-1 uppercase tracking-wider">
                          <Clock className="h-3 w-3 text-violet-400" />
                          Lapso a Cubrir:
                        </label>
                        <div className="w-full h-8 px-2.5 py-1 rounded-lg border border-border/60 bg-muted/40 text-xs font-semibold text-foreground flex items-center justify-between">
                          <span>Todas las lagunas pendientes de la jornada</span>
                          <span className="font-mono font-bold text-violet-400">{justMinutes} min</span>
                        </div>
                      </div>
                    ) : (
                      <>
                        <div className="space-y-1">
                          <label className="text-[10px] font-bold text-muted-foreground flex items-center gap-1 uppercase tracking-wider">
                            <Clock className="h-3 w-3 text-violet-400" />
                            Hora Inicio:
                          </label>
                          <input
                            type="time"
                            value={justStartTime}
                            onChange={(e) => handleTimeChange(e.target.value, justEndTime)}
                            className="w-full h-8 px-2.5 py-1 rounded-lg border border-border bg-background text-xs font-semibold focus:outline-none focus:ring-1 focus:ring-violet-500"
                          />
                        </div>
                        <div className="space-y-1">
                          <label className="text-[10px] font-bold text-muted-foreground flex items-center gap-1 uppercase tracking-wider">
                            <Clock className="h-3 w-3 text-violet-400" />
                            Hora Fin:
                          </label>
                          <input
                            type="time"
                            value={justEndTime}
                            onChange={(e) => handleTimeChange(justStartTime, e.target.value)}
                            className="w-full h-8 px-2.5 py-1 rounded-lg border border-border bg-background text-xs font-semibold focus:outline-none focus:ring-1 focus:ring-violet-500"
                          />
                        </div>
                      </>
                    )}
                  </div>

                  {/* Labores Manuales Elegibles: Botones Compactos de 1 Línea */}
                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <label className="text-xs font-bold text-foreground flex items-center gap-1.5 uppercase tracking-wider">
                        <Wrench className="h-3.5 w-3.5 text-violet-400" />
                        Labor realizada en taller:
                      </label>
                      <span className="text-[11px] text-muted-foreground">Selecciona con 1 clic</span>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-2">
                      {manualTasks.map((preset) => {
                        const Icon = getTaskIconComponent(preset.iconName || preset.label);
                        const isSelected = justReason === preset.label;
                        return (
                          <button
                            key={preset.id || preset.label}
                            type="button"
                            onClick={() => setJustReason(preset.label)}
                            className={`px-3 py-2 rounded-xl border text-left flex items-center gap-2.5 transition-all cursor-pointer ${
                              isSelected
                                ? "bg-violet-600/15 border-violet-500 text-violet-200 ring-2 ring-violet-500/40 shadow-xs font-bold"
                                : "bg-card border-border/80 hover:bg-muted/60 text-muted-foreground hover:text-foreground"
                            }`}
                          >
                            <div
                              className={`p-1.5 rounded-lg shrink-0 ${
                                isSelected
                                  ? "bg-violet-600 text-white shadow-xs"
                                  : "bg-violet-500/10 text-violet-400 border border-violet-500/20"
                              }`}
                            >
                              <Icon className="h-3.5 w-3.5" />
                            </div>
                            <div className="min-w-0 flex-1">
                              <span className="text-xs font-semibold truncate block">{preset.label}</span>
                              {preset.category && (
                                <span className="text-[10px] text-muted-foreground/70 truncate block">
                                  {preset.category}
                                </span>
                              )}
                            </div>
                            {isSelected && <CheckCircle2 className="h-3.5 w-3.5 text-violet-400 shrink-0" />}
                          </button>
                        );
                      })}
                    </div>
                  </div>

                  {/* Minutos a Justificar: Chips Rápidos */}
                  <div className="space-y-1.5">
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
                          className={`px-3 py-1 rounded-lg text-xs font-bold border transition-all cursor-pointer ${
                            justMinutes === String(detectedLostMin)
                              ? "bg-violet-600 text-white border-violet-600 shadow-xs"
                              : "bg-muted/60 border-border text-foreground hover:bg-muted"
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
                            className={`px-2.5 py-1 rounded-lg text-xs font-semibold border transition-all cursor-pointer ${
                              isSel
                                ? "bg-violet-600 text-white border-violet-600 shadow-xs"
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
                          className="w-16 px-2 py-1 rounded-lg border border-border bg-background text-xs font-mono font-bold text-foreground text-center focus:ring-1 focus:ring-violet-500 focus:outline-none"
                        />
                        <span className="text-[11px] text-muted-foreground font-semibold">min</span>
                      </div>
                    </div>
                  </div>

                  {/* Detalle o Explicación (Opcional) */}
                  <div className="space-y-1">
                    <label className="text-[11px] font-semibold text-muted-foreground">
                      Detalle o nota <span className="text-muted-foreground/60">(Opcional)</span>:
                    </label>
                    <input
                      type="text"
                      placeholder="Ej: Cliente Don Carlos vino por revisión de equipo..."
                      value={justDetail}
                      onChange={(e) => setJustDetail(e.target.value)}
                      className="w-full px-3 py-1.5 rounded-xl border border-border bg-background text-xs text-foreground placeholder:text-muted-foreground/60 focus:outline-none focus:ring-1 focus:ring-violet-500"
                    />
                  </div>

                  {/* Botones de Acción */}
                  <div className="pt-2 flex items-center justify-between border-t border-border/50">
                    <p className="text-[11px] text-muted-foreground">
                      Se computará como labor oficial en tus métricas.
                    </p>
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => {
                          setShowManualJustify(false);
                          if (detectedLostMin === 0) setActiveTab("resumen");
                        }}
                        className="px-3.5 py-2 rounded-xl border border-border hover:bg-muted text-xs font-semibold text-muted-foreground transition-colors cursor-pointer"
                      >
                        Cancelar
                      </button>
                      <button
                        type="submit"
                        disabled={savingJust}
                        className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-violet-600 hover:bg-violet-700 text-white text-xs font-bold shadow-sm shadow-violet-600/25 transition-all disabled:opacity-50 active:scale-95 cursor-pointer"
                      >
                        <Send className="h-3.5 w-3.5" />
                        {savingJust ? "Guardando..." : `Guardar Justificación (${justMinutes} min)`}
                      </button>
                    </div>
                  </div>
                </form>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}