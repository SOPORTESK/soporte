"use client";

import React, { useState, useEffect } from "react";
import {
  Clock,
  Calendar,
  CheckCircle2,
  RotateCcw,
  Building2,
  UserCheck,
  Layers,
  Sliders,
  Sun,
  Sunset,
  Moon,
  CheckSquare,
  Square,
  CheckCheck,
} from "lucide-react";
import { toast } from "sonner";

const DAYS_LIST = [
  { id: 1, label: "Lun", full: "Lunes" },
  { id: 2, label: "Mar", full: "Martes" },
  { id: 3, label: "Mié", full: "Miércoles" },
  { id: 4, label: "Jue", full: "Jueves" },
  { id: 5, label: "Vie", full: "Viernes" },
  { id: 6, label: "Sáb", full: "Sábado" },
  { id: 0, label: "Dom", full: "Domingo" },
];

export type ShiftPresetKey = "diurno8" | "diurno10" | "mixto" | "nocturno";

export interface DayScheduleRule {
  start: string;
  end: string;
  targetHours: number;
}

interface AgentScheduleCardProps {
  agentEmail: string;
  agentName?: string;
}

export function AgentScheduleCard({ agentEmail, agentName }: AgentScheduleCardProps) {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [isCustom, setIsCustom] = useState(false);

  // Custom schedule state
  const [scheduleStart, setScheduleStart] = useState("08:00");
  const [scheduleEnd, setScheduleEnd] = useState("17:00");
  const [scheduleEnabled, setScheduleEnabled] = useState(true);
  const [workDays, setWorkDays] = useState<number[]>([1, 2, 3, 4, 5]);
  const [targetDailyHours, setTargetDailyHours] = useState<number>(8);

  // Mixed schedule state
  const [useMixedSchedule, setUseMixedSchedule] = useState<boolean>(false);
  const [daySchedules, setDaySchedules] = useState<Record<number, DayScheduleRule>>({
    1: { start: "06:30", end: "16:30", targetHours: 10 },
    2: { start: "06:30", end: "16:30", targetHours: 10 },
    3: { start: "06:30", end: "16:30", targetHours: 10 },
    4: { start: "06:30", end: "16:30", targetHours: 10 },
    5: { start: "06:30", end: "14:30", targetHours: 8 },
  });

  // Selección múltiple para edición en lote
  const [selectedBatchDays, setSelectedBatchDays] = useState<number[]>([]);
  const [batchStart, setBatchStart] = useState<string>("08:00");
  const [batchEnd, setBatchEnd] = useState<string>("17:00");
  const [batchTargetHours, setBatchTargetHours] = useState<number>(8);

  // Global schedule reference
  const [globalSchedule, setGlobalSchedule] = useState<{
    scheduleStart: string;
    scheduleEnd: string;
    scheduleEnabled: boolean;
    workDays: number[];
    targetDailyHours: number;
  }>({
    scheduleStart: "06:00",
    scheduleEnd: "18:00",
    scheduleEnabled: true,
    workDays: [1, 2, 3, 4, 5],
    targetDailyHours: 10,
  });

  const loadSchedule = async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/activity/schedule?agentEmail=${encodeURIComponent(agentEmail)}`);
      const data = await res.json();
      if (data?.success) {
        setIsCustom(Boolean(data.isCustom));
        if (data.scheduleStart) setScheduleStart(data.scheduleStart);
        if (data.scheduleEnd) setScheduleEnd(data.scheduleEnd);
        if (data.scheduleEnabled !== undefined) setScheduleEnabled(Boolean(data.scheduleEnabled));
        if (Array.isArray(data.workDays) && data.workDays.length > 0) setWorkDays(data.workDays);
        if (data.targetDailyHours) setTargetDailyHours(Number(data.targetDailyHours));
        if (data.useMixedSchedule !== undefined) setUseMixedSchedule(Boolean(data.useMixedSchedule));
        if (data.daySchedules && typeof data.daySchedules === "object") {
          setDaySchedules((prev) => ({ ...prev, ...data.daySchedules }));
          const firstDayId = (Array.isArray(data.workDays) && data.workDays.length > 0) ? data.workDays[0] : 1;
          const firstDayRule = data.daySchedules[firstDayId] || Object.values(data.daySchedules)[0];
          if (firstDayRule) {
            if (firstDayRule.start) setBatchStart(firstDayRule.start);
            if (firstDayRule.end) setBatchEnd(firstDayRule.end);
            if (firstDayRule.targetHours) setBatchTargetHours(Number(firstDayRule.targetHours));
          } else {
            if (data.scheduleStart) setBatchStart(data.scheduleStart);
            if (data.scheduleEnd) setBatchEnd(data.scheduleEnd);
            if (data.targetDailyHours) setBatchTargetHours(Number(data.targetDailyHours));
          }
        } else {
          if (data.scheduleStart) setBatchStart(data.scheduleStart);
          if (data.scheduleEnd) setBatchEnd(data.scheduleEnd);
          if (data.targetDailyHours) setBatchTargetHours(Number(data.targetDailyHours));
        }

        if (data.globalSchedule) {
          setGlobalSchedule({
            scheduleStart: data.globalSchedule.scheduleStart || "06:00",
            scheduleEnd: data.globalSchedule.scheduleEnd || "18:00",
            scheduleEnabled: data.globalSchedule.scheduleEnabled !== undefined ? Boolean(data.globalSchedule.scheduleEnabled) : true,
            workDays: Array.isArray(data.globalSchedule.workDays) ? data.globalSchedule.workDays : [1, 2, 3, 4, 5],
            targetDailyHours: Number(data.globalSchedule.targetDailyHours) || 10,
          });
        }
      }
    } catch (err) {
      console.error("[AgentScheduleCard] Error loading schedule:", err);
      toast.error("No se pudo cargar el horario del usuario");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (agentEmail) {
      loadSchedule();
    }
  }, [agentEmail]);

  const handleToggleDay = (id: number) => {
    setWorkDays((prev) => {
      if (prev.includes(id)) {
        if (prev.length <= 1) return prev;
        // Deseleccionar de la selección en lote si se remueve
        setSelectedBatchDays((b) => b.filter((x) => x !== id));
        return prev.filter((d) => d !== id);
      } else {
        const next = [...prev, id].sort((a, b) => a - b);
        if (!daySchedules[id]) {
          setDaySchedules((dPrev) => ({
            ...dPrev,
            [id]: { start: scheduleStart, end: scheduleEnd, targetHours: targetDailyHours },
          }));
        }
        return next;
      }
    });
  };

  const handlePresetDays = (type: "lv" | "ls" | "all") => {
    if (type === "lv") setWorkDays([1, 2, 3, 4, 5]);
    if (type === "ls") setWorkDays([1, 2, 3, 4, 5, 6]);
    if (type === "all") setWorkDays([1, 2, 3, 4, 5, 6, 0]);
  };

  const calculateDayHours = (start: string, end: string): number => {
    const parseMin = (t: string) => {
      const parts = (t || "").split(":");
      return (parseInt(parts[0], 10) || 0) * 60 + (parseInt(parts[1], 10) || 0);
    };
    let diffMin = parseMin(end) - parseMin(start);
    if (diffMin < 0) {
      // Turno que cruza la medianoche
      diffMin += 24 * 60;
    }
    const effectiveMin = diffMin > 300 ? diffMin - 60 : diffMin;
    return Math.round((effectiveMin / 60) * 2) / 2;
  };

  const handleCalculateDaily = () => {
    const hours = calculateDayHours(scheduleStart, scheduleEnd);
    setTargetDailyHours(Math.max(1, Math.min(16, hours)));
    toast.info(`Meta calculada: ${hours} horas (descontando 1h de descanso si supera 5h)`);
  };

  const handleCalculateBatch = () => {
    const hours = calculateDayHours(batchStart, batchEnd);
    setBatchTargetHours(Math.max(1, Math.min(16, hours)));
    toast.info(`Meta en lote calculada: ${hours} horas`);
  };

  const handleUpdateDaySchedule = (dayId: number, field: keyof DayScheduleRule, value: any) => {
    setDaySchedules((prev) => {
      const current = prev[dayId] || { start: scheduleStart, end: scheduleEnd, targetHours: targetDailyHours };
      return {
        ...prev,
        [dayId]: {
          ...current,
          [field]: value,
        },
      };
    });
  };

  // Función para aplicar tipos de turno (Diurno, Mixto, Nocturno)
  const applyShiftPreset = (
    type: ShiftPresetKey,
    setter: (s: string, e: string, h: number) => void
  ) => {
    if (type === "diurno8") {
      setter("08:00", "17:00", 8);
    } else if (type === "diurno10") {
      setter("06:30", "16:30", 10);
    } else if (type === "mixto") {
      setter("13:00", "21:00", 7);
    } else if (type === "nocturno") {
      setter("22:00", "05:00", 6);
    }
  };

  // Selección en lote
  const handleToggleBatchDay = (dayId: number) => {
    setSelectedBatchDays((prev) => {
      const isSelecting = !prev.includes(dayId);
      const next = isSelecting ? [...prev, dayId].sort((a, b) => a - b) : prev.filter((id) => id !== dayId);
      if (isSelecting && daySchedules[dayId]) {
        if (daySchedules[dayId].start) setBatchStart(daySchedules[dayId].start);
        if (daySchedules[dayId].end) setBatchEnd(daySchedules[dayId].end);
        if (daySchedules[dayId].targetHours) setBatchTargetHours(Number(daySchedules[dayId].targetHours));
      }
      return next;
    });
  };

  const handleSelectAllWorkDays = () => {
    if (selectedBatchDays.length === workDays.length) {
      setSelectedBatchDays([]);
    } else {
      setSelectedBatchDays([...workDays]);
      const firstId = workDays[0];
      if (firstId && daySchedules[firstId]) {
        if (daySchedules[firstId].start) setBatchStart(daySchedules[firstId].start);
        if (daySchedules[firstId].end) setBatchEnd(daySchedules[firstId].end);
        if (daySchedules[firstId].targetHours) setBatchTargetHours(Number(daySchedules[firstId].targetHours));
      }
    }
  };

  const handleApplyBatchToSelected = () => {
    if (selectedBatchDays.length === 0) {
      toast.warning("Selecciona al menos un día con el recuadro para modificar en lote.");
      return;
    }

    setDaySchedules((prev) => {
      const next = { ...prev };
      selectedBatchDays.forEach((id) => {
        next[id] = {
          start: batchStart,
          end: batchEnd,
          targetHours: batchTargetHours,
        };
      });
      return next;
    });

    const dayLabels = selectedBatchDays
      .map((id) => DAYS_LIST.find((d) => d.id === id)?.label)
      .filter(Boolean)
      .join(", ");

    toast.success(`Horario aplicado a ${dayLabels} (${batchStart} - ${batchEnd}, ${batchTargetHours}h)`);
    setSelectedBatchDays([]);
  };

  const handleApplyShiftDirectToDay = (dayId: number, type: ShiftPresetKey) => {
    applyShiftPreset(type, (s, e, h) => {
      handleUpdateDaySchedule(dayId, "start", s);
      handleUpdateDaySchedule(dayId, "end", e);
      handleUpdateDaySchedule(dayId, "targetHours", h);
    });
    const dayName = DAYS_LIST.find((d) => d.id === dayId)?.full || "Día";
    toast.info(`Turno aplicado a ${dayName}`);
  };

  const totalWeeklyHours = useMixedSchedule
    ? workDays.reduce((acc, d) => acc + (Number(daySchedules[d]?.targetHours) || targetDailyHours), 0)
    : workDays.length * targetDailyHours;

  const handleSave = async (customValue: boolean = isCustom) => {
    setSaving(true);
    try {
      const res = await fetch("/api/activity/schedule", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          agentEmail,
          custom: customValue,
          scheduleStart,
          scheduleEnd,
          scheduleEnabled,
          workDays,
          targetDailyHours,
          useMixedSchedule,
          daySchedules,
        }),
      });

      if (res.ok) {
        setIsCustom(customValue);
        toast.success(
          customValue
            ? `Horario personalizado guardado para ${agentName || agentEmail}`
            : `Se restauró el horario general de la empresa para ${agentName || agentEmail}`
        );
      } else {
        toast.error("Error al guardar el horario");
      }
    } catch (err: any) {
      toast.error(err.message || "Error al conectar con el servidor");
    } finally {
      setSaving(false);
    }
  };

  const formatDaysText = (days: number[]) => {
    if (!days || days.length === 0) return "Ninguno";
    if (days.length === 7) return "Todos los días (Lun-Dom)";
    if (days.length === 5 && [1, 2, 3, 4, 5].every((d) => days.includes(d))) return "Lunes a Viernes";
    if (days.length === 6 && [1, 2, 3, 4, 5, 6].every((d) => days.includes(d))) return "Lunes a Sábado";
    return days.map((d) => DAYS_LIST.find((item) => item.id === d)?.label).filter(Boolean).join(", ");
  };

  return (
    <section className="rounded-2xl border border-border bg-card p-6 lg:p-7 space-y-6 shadow-sm">
      {/* ── HEADER ── */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-border/70 pb-5">
        <div className="flex items-start sm:items-center gap-3.5">
          <div className="h-11 w-11 rounded-2xl bg-brand-500/10 border border-brand-500/20 text-brand-500 grid place-items-center shrink-0">
            <Clock className="h-5 w-5" />
          </div>
          <div>
            <div className="flex items-center gap-2.5 flex-wrap">
              <h2 className="text-lg font-black tracking-tight text-foreground">
                Gestión de Horario de Trabajo
              </h2>
              {isCustom ? (
                <span className="text-[10px] font-black uppercase px-2.5 py-0.5 rounded-full bg-amber-500/15 text-amber-500 border border-amber-500/30 flex items-center gap-1">
                  <UserCheck className="h-3 w-3" /> Personalizado {useMixedSchedule && "· Mixto"}
                </span>
              ) : (
                <span className="text-[10px] font-black uppercase px-2.5 py-0.5 rounded-full bg-emerald-500/15 text-emerald-500 border border-emerald-500/30 flex items-center gap-1">
                  <Building2 className="h-3 w-3" /> Horario Empresa
                </span>
              )}
            </div>
            <p className="text-xs text-muted-foreground mt-1">
              Asigna un horario específico para <span className="font-semibold text-foreground">{agentName || agentEmail}</span> o utiliza el horario general de la empresa.
            </p>
          </div>
        </div>

        {/* MODO TOGGLE */}
        <div className="flex items-center bg-muted/60 p-1 rounded-xl border border-border self-start sm:self-auto shrink-0">
          <button
            type="button"
            onClick={() => {
              if (isCustom) {
                handleSave(false);
              }
            }}
            disabled={saving || loading}
            className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all flex items-center gap-1.5 ${
              !isCustom
                ? "bg-card text-foreground shadow-sm border border-border/80"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            <Building2 className="h-3.5 w-3.5" />
            General
          </button>
          <button
            type="button"
            onClick={() => setIsCustom(true)}
            disabled={saving || loading}
            className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all flex items-center gap-1.5 ${
              isCustom
                ? "bg-brand-500 text-white shadow-sm"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            <UserCheck className="h-3.5 w-3.5" />
            Personalizado
          </button>
        </div>
      </div>

      {loading ? (
        <div className="py-12 text-center text-sm text-muted-foreground animate-pulse">
          Cargando configuración de horario del empleado...
        </div>
      ) : !isCustom ? (
        /* ── MODO GENERAL: HEREDA DE LA EMPRESA ── */
        <div className="space-y-4">
          <div className="rounded-xl border border-emerald-500/20 bg-emerald-500/5 p-5 flex flex-col md:flex-row md:items-center justify-between gap-4">
            <div className="flex items-start gap-3">
              <div className="h-9 w-9 rounded-xl bg-emerald-500/15 border border-emerald-500/30 text-emerald-500 grid place-items-center shrink-0">
                <Building2 className="h-4.5 w-4.5" />
              </div>
              <div className="space-y-1">
                <p className="text-sm font-bold text-foreground">
                  Este empleado utiliza el Horario General de la Empresa
                </p>
                <p className="text-xs text-muted-foreground">
                  Cualquier ajuste en el horario general de Sekunet se aplicará automáticamente a este usuario.
                </p>
              </div>
            </div>

            <button
              type="button"
              onClick={() => setIsCustom(true)}
              className="px-4 py-2 rounded-xl bg-card hover:bg-muted border border-border text-xs font-bold text-foreground transition-colors self-start md:self-auto shrink-0 shadow-sm"
            >
              Definir Horario Especial
            </button>
          </div>

          {/* Resumen del horario general actual */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 pt-1">
            <div className="p-4 rounded-xl border border-border/80 bg-muted/20 space-y-1">
              <span className="text-[10px] font-black uppercase text-muted-foreground tracking-wider">Días Hábiles</span>
              <p className="text-sm font-black text-foreground">{formatDaysText(globalSchedule.workDays)}</p>
              <p className="text-[11px] text-muted-foreground">{globalSchedule.workDays.length} días por semana</p>
            </div>

            <div className="p-4 rounded-xl border border-border/80 bg-muted/20 space-y-1">
              <span className="text-[10px] font-black uppercase text-muted-foreground tracking-wider">Rango de Jornada</span>
              <p className="text-sm font-black text-foreground">{globalSchedule.scheduleStart} — {globalSchedule.scheduleEnd}</p>
              <p className="text-[11px] text-muted-foreground">Ventana activa de monitoreo</p>
            </div>

            <div className="p-4 rounded-xl border border-border/80 bg-muted/20 space-y-1">
              <span className="text-[10px] font-black uppercase text-muted-foreground tracking-wider">Meta Diaria Esperada</span>
              <p className="text-sm font-black text-foreground">{globalSchedule.targetDailyHours} horas / día</p>
              <p className="text-[11px] text-muted-foreground">Base para cálculo de cumplimiento</p>
            </div>
          </div>
        </div>
      ) : (
        /* ── MODO PERSONALIZADO: EDITOR DE HORARIO INDIVIDUAL ── */
        <div className="space-y-6">
          <div className="rounded-xl border border-amber-500/20 bg-amber-500/5 p-4 flex items-center justify-between gap-3 flex-wrap">
            <div className="flex items-center gap-2.5 text-xs text-amber-500 font-semibold">
              <UserCheck className="h-4 w-4 shrink-0" />
              <span>Horario independiente activado para este usuario. No le afectarán cambios al horario general.</span>
            </div>
            <button
              type="button"
              onClick={() => handleSave(false)}
              disabled={saving}
              className="text-xs text-muted-foreground hover:text-foreground underline underline-offset-4 transition-colors font-medium"
            >
              Volver a horario general de empresa
            </button>
          </div>

          {/* SELECTOR DE TIPO DE HORARIO: UNIFORME VS MIXTO */}
          <div className="p-4 rounded-2xl bg-muted/30 border border-border space-y-3">
            <div>
              <label className="text-xs font-bold text-foreground flex items-center gap-1.5">
                <Sliders className="h-3.5 w-3.5 text-brand-500" />
                Estructura de Jornada Laboral:
              </label>
              <p className="text-[11px] text-muted-foreground mt-0.5">
                Elige si el empleado cumple el mismo horario todos los días o si requiere horarios diferenciados por día.
              </p>
            </div>

            <div className="grid grid-cols-2 gap-3 pt-1">
              <button
                type="button"
                onClick={() => setUseMixedSchedule(false)}
                className={`p-3 rounded-xl border text-left transition-all ${
                  !useMixedSchedule
                    ? "bg-brand-500/10 border-brand-500/40 shadow-sm text-foreground"
                    : "bg-muted/20 border-border text-muted-foreground hover:bg-muted/40"
                }`}
              >
                <div className="flex items-center gap-2 font-bold text-xs">
                  <span className={`h-2.5 w-2.5 rounded-full ${!useMixedSchedule ? "bg-brand-500" : "bg-muted-foreground/40"}`} />
                  Horario Uniforme
                </div>
                <p className="text-[11px] text-muted-foreground mt-1">
                  Misma hora de entrada, salida y meta diaria todos los días laborables.
                </p>
              </button>

              <button
                type="button"
                onClick={() => setUseMixedSchedule(true)}
                className={`p-3 rounded-xl border text-left transition-all ${
                  useMixedSchedule
                    ? "bg-brand-500/10 border-brand-500/40 shadow-sm text-foreground"
                    : "bg-muted/20 border-border text-muted-foreground hover:bg-muted/40"
                }`}
              >
                <div className="flex items-center gap-2 font-bold text-xs">
                  <span className={`h-2.5 w-2.5 rounded-full ${useMixedSchedule ? "bg-brand-500" : "bg-muted-foreground/40"}`} />
                  Horarios Diferenciados por Día
                  <span className="text-[9px] px-1.5 py-0.2 rounded bg-amber-500/20 text-amber-500 font-black uppercase">
                    Flexible
                  </span>
                </div>
                <p className="text-[11px] text-muted-foreground mt-1">
                  Configura horas de entrada, salida y metas independientes por día (con edición en lote).
                </p>
              </button>
            </div>
          </div>

          {/* DÍAS LABORALES */}
          <div className="space-y-2.5">
            <div className="flex items-center justify-between">
              <label className="text-xs font-bold text-foreground flex items-center gap-1.5">
                <Calendar className="h-3.5 w-3.5 text-brand-500" />
                Días de la Semana Laborables:
              </label>
              <div className="flex items-center gap-1.5 text-[11px]">
                <span className="text-muted-foreground text-[10px] mr-0.5">Rápido:</span>
                <button
                  type="button"
                  onClick={() => handlePresetDays("lv")}
                  className="px-2 py-0.5 rounded-md bg-muted hover:bg-brand-500 hover:text-white font-mono text-[10px] text-muted-foreground transition-colors"
                >
                  L-V
                </button>
                <button
                  type="button"
                  onClick={() => handlePresetDays("ls")}
                  className="px-2 py-0.5 rounded-md bg-muted hover:bg-brand-500 hover:text-white font-mono text-[10px] text-muted-foreground transition-colors"
                >
                  L-S
                </button>
                <button
                  type="button"
                  onClick={() => handlePresetDays("all")}
                  className="px-2 py-0.5 rounded-md bg-muted hover:bg-brand-500 hover:text-white font-mono text-[10px] text-muted-foreground transition-colors"
                >
                  Todos
                </button>
              </div>
            </div>

            <div className="grid grid-cols-7 gap-2">
              {DAYS_LIST.map((day) => {
                const active = workDays.includes(day.id);
                return (
                  <button
                    key={day.id}
                    type="button"
                    onClick={() => handleToggleDay(day.id)}
                    className={`py-2.5 px-1 rounded-xl border text-center transition-all flex flex-col items-center justify-center gap-0.5 ${
                      active
                        ? "bg-brand-500 text-white border-brand-600 shadow-sm"
                        : "bg-muted/40 text-muted-foreground border-border hover:bg-muted"
                    }`}
                  >
                    <span className="text-xs font-black">{day.label}</span>
                    <span className="text-[9px] opacity-80 hidden sm:inline">{day.full}</span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* EDITOR: HORARIO UNIFORME */}
          {!useMixedSchedule ? (
            <div className="space-y-4 p-5 rounded-2xl border border-border/80 bg-muted/10">
              {/* Selector de turnos estándar */}
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-border/50 pb-3">
                <span className="text-xs font-bold text-foreground">Turno Estándar:</span>
                <div className="flex items-center gap-1.5 flex-wrap">
                  <button
                    type="button"
                    onClick={() => applyShiftPreset("diurno8", (s, e, h) => { setScheduleStart(s); setScheduleEnd(e); setTargetDailyHours(h); })}
                    className="px-2.5 py-1 rounded-lg bg-card hover:bg-brand-500/10 hover:text-brand-500 border border-border text-xs font-medium text-foreground transition-all flex items-center gap-1.5 shadow-2xs"
                  >
                    <Sun className="h-3.5 w-3.5 text-amber-500" />
                    Diurno (8h)
                  </button>
                  <button
                    type="button"
                    onClick={() => applyShiftPreset("diurno10", (s, e, h) => { setScheduleStart(s); setScheduleEnd(e); setTargetDailyHours(h); })}
                    className="px-2.5 py-1 rounded-lg bg-card hover:bg-brand-500/10 hover:text-brand-500 border border-border text-xs font-medium text-foreground transition-all flex items-center gap-1.5 shadow-2xs"
                  >
                    <Sun className="h-3.5 w-3.5 text-amber-500" />
                    Diurno 10h
                  </button>
                  <button
                    type="button"
                    onClick={() => applyShiftPreset("mixto", (s, e, h) => { setScheduleStart(s); setScheduleEnd(e); setTargetDailyHours(h); })}
                    className="px-2.5 py-1 rounded-lg bg-card hover:bg-brand-500/10 hover:text-brand-500 border border-border text-xs font-medium text-foreground transition-all flex items-center gap-1.5 shadow-2xs"
                  >
                    <Sunset className="h-3.5 w-3.5 text-orange-400" />
                    Mixto (7h)
                  </button>
                  <button
                    type="button"
                    onClick={() => applyShiftPreset("nocturno", (s, e, h) => { setScheduleStart(s); setScheduleEnd(e); setTargetDailyHours(h); })}
                    className="px-2.5 py-1 rounded-lg bg-card hover:bg-brand-500/10 hover:text-brand-500 border border-border text-xs font-medium text-foreground transition-all flex items-center gap-1.5 shadow-2xs"
                  >
                    <Moon className="h-3.5 w-3.5 text-indigo-400" />
                    Nocturno (6h)
                  </button>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                {/* Rango Horario */}
                <div className="space-y-2.5">
                  <label className="text-xs font-bold text-foreground flex items-center gap-1.5">
                    <Clock className="h-3.5 w-3.5 text-brand-500" />
                    Rango Horario Uniforme:
                  </label>

                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-1">
                      <span className="text-[10px] font-semibold text-muted-foreground">Hora de Entrada</span>
                      <input
                        type="time"
                        value={scheduleStart}
                        onChange={(e) => setScheduleStart(e.target.value)}
                        className="w-full px-3 py-2 rounded-xl bg-muted/40 border border-border text-sm font-mono font-bold text-foreground focus:outline-none focus:ring-2 focus:ring-brand-500/40"
                      />
                    </div>
                    <div className="space-y-1">
                      <span className="text-[10px] font-semibold text-muted-foreground">Hora de Salida</span>
                      <input
                        type="time"
                        value={scheduleEnd}
                        onChange={(e) => setScheduleEnd(e.target.value)}
                        className="w-full px-3 py-2 rounded-xl bg-muted/40 border border-border text-sm font-mono font-bold text-foreground focus:outline-none focus:ring-2 focus:ring-brand-500/40"
                      />
                    </div>
                  </div>
                </div>

                {/* Meta de Horas Diarias */}
                <div className="space-y-2.5">
                  <div className="flex items-center justify-between">
                    <label className="text-xs font-bold text-foreground flex items-center gap-1.5">
                      <Clock className="h-3.5 w-3.5 text-brand-500" />
                      Meta de Horas Diarias:
                    </label>
                    <button
                      type="button"
                      onClick={handleCalculateDaily}
                      className="text-[11px] text-brand-500 hover:underline font-semibold flex items-center gap-1"
                    >
                      <RotateCcw className="h-3 w-3" /> Auto-calcular
                    </button>
                  </div>

                  <div className="flex items-center gap-3">
                    <div className="relative flex-1">
                      <input
                        type="number"
                        min="1"
                        max="16"
                        step="0.5"
                        value={targetDailyHours}
                        onChange={(e) => setTargetDailyHours(parseFloat(e.target.value) || 1)}
                        className="w-full px-3 py-2 rounded-xl bg-muted/40 border border-border text-sm font-mono font-bold text-foreground focus:outline-none focus:ring-2 focus:ring-brand-500/40"
                      />
                      <span className="absolute right-3 top-2.5 text-xs text-muted-foreground pointer-events-none">
                        horas / día
                      </span>
                    </div>

                    <div className="flex items-center gap-1 shrink-0">
                      {[6, 7, 8, 10].map((h) => (
                        <button
                          key={h}
                          type="button"
                          onClick={() => setTargetDailyHours(h)}
                          className={`px-2 py-1.5 rounded-lg border text-xs font-bold font-mono transition-all ${
                            targetDailyHours === h
                              ? "bg-brand-500 text-white border-brand-500"
                              : "bg-muted/40 text-muted-foreground border-border hover:bg-muted"
                          }`}
                        >
                          {h}h
                        </button>
                      ))}
                    </div>
                  </div>
                </div>
              </div>
            </div>
          ) : (
            /* EDITOR: HORARIOS DIFERENCIADOS POR DÍA + EDICIÓN EN LOTE */
            <div className="space-y-4 p-5 rounded-2xl border border-brand-500/30 bg-brand-500/5">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-border/60 pb-3">
                <div>
                  <h4 className="text-xs font-black uppercase text-foreground tracking-wide flex items-center gap-2">
                    <Layers className="h-4 w-4 text-brand-500" />
                    Horario Diferenciado por Día
                  </h4>
                  <p className="text-[11px] text-muted-foreground mt-0.5">
                    Modifica cada día individualmente o selecciona varios para aplicar cambios masivos con turnos diurno, mixto o nocturno.
                  </p>
                </div>
              </div>

              {/* ── BARRA DE SELECCIÓN Y EDICIÓN EN LOTE ── */}
              <div className="p-4 rounded-xl bg-card border border-border/90 shadow-xs space-y-3">
                <div className="flex items-center justify-between gap-2 pb-1 border-b border-border/40">
                  <div className="flex items-center gap-2">
                    <span className="text-[11px] font-black uppercase tracking-wider text-brand-500 flex items-center gap-1.5">
                      <Layers className="h-3.5 w-3.5" />
                      Herramienta de Edición en Lote
                    </span>
                    <span className="text-[10px] text-muted-foreground hidden sm:inline">
                      (Configura los valores y presiona &quot;Aplicar a seleccionados&quot;)
                    </span>
                  </div>
                  {selectedBatchDays.length === 0 ? (
                    <span className="text-[10px] text-muted-foreground/70 italic">
                      Marca los días abajo para aplicarles este horario
                    </span>
                  ) : (
                    <span className="text-[10px] font-bold text-brand-500">
                      Listo para actualizar {selectedBatchDays.length} {selectedBatchDays.length === 1 ? "día" : "días"}
                    </span>
                  )}
                </div>
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-border/60 pb-2.5">
                  <div className="flex items-center gap-3">
                    <button
                      type="button"
                      onClick={handleSelectAllWorkDays}
                      className="text-xs font-bold text-foreground hover:text-brand-500 flex items-center gap-1.5 transition-colors"
                    >
                      {selectedBatchDays.length === workDays.length ? (
                        <CheckSquare className="h-4 w-4 text-brand-500" />
                      ) : (
                        <Square className="h-4 w-4 text-muted-foreground" />
                      )}
                      <span>
                        {selectedBatchDays.length === workDays.length
                          ? "Deseleccionar todos"
                          : `Seleccionar todos (${workDays.length} días)`}
                      </span>
                    </button>

                    {selectedBatchDays.length > 0 && (
                      <span className="text-[11px] font-bold px-2.5 py-0.5 rounded-full bg-brand-500/15 text-brand-500 border border-brand-500/30">
                        {selectedBatchDays.length} {selectedBatchDays.length === 1 ? "día seleccionado" : "días seleccionados"}
                      </span>
                    )}
                  </div>

                  {/* Opciones rápidas de tipo de turno para el lote */}
                  <div className="flex items-center gap-1 flex-wrap">
                    <span className="text-[10px] text-muted-foreground font-semibold mr-1">Turno:</span>
                    <button
                      type="button"
                      onClick={() => applyShiftPreset("diurno8", (s, e, h) => { setBatchStart(s); setBatchEnd(e); setBatchTargetHours(h); })}
                      className="px-2 py-0.5 rounded-md bg-muted/80 hover:bg-brand-500/15 hover:text-brand-500 border border-border text-[11px] font-medium text-foreground transition-all flex items-center gap-1"
                    >
                      <Sun className="h-3 w-3 text-amber-500" /> Diurno (8h)
                    </button>
                    <button
                      type="button"
                      onClick={() => applyShiftPreset("diurno10", (s, e, h) => { setBatchStart(s); setBatchEnd(e); setBatchTargetHours(h); })}
                      className="px-2 py-0.5 rounded-md bg-muted/80 hover:bg-brand-500/15 hover:text-brand-500 border border-border text-[11px] font-medium text-foreground transition-all flex items-center gap-1"
                    >
                      <Sun className="h-3 w-3 text-amber-500" /> Diurno 10h
                    </button>
                    <button
                      type="button"
                      onClick={() => applyShiftPreset("mixto", (s, e, h) => { setBatchStart(s); setBatchEnd(e); setBatchTargetHours(h); })}
                      className="px-2 py-0.5 rounded-md bg-muted/80 hover:bg-brand-500/15 hover:text-brand-500 border border-border text-[11px] font-medium text-foreground transition-all flex items-center gap-1"
                    >
                      <Sunset className="h-3 w-3 text-orange-400" /> Mixto (7h)
                    </button>
                    <button
                      type="button"
                      onClick={() => applyShiftPreset("nocturno", (s, e, h) => { setBatchStart(s); setBatchEnd(e); setBatchTargetHours(h); })}
                      className="px-2 py-0.5 rounded-md bg-muted/80 hover:bg-brand-500/15 hover:text-brand-500 border border-border text-[11px] font-medium text-foreground transition-all flex items-center gap-1"
                    >
                      <Moon className="h-3 w-3 text-indigo-400" /> Nocturno (6h)
                    </button>
                  </div>
                </div>

                {/* Parámetros del lote y botón aplicar */}
                <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 pt-0.5">
                  <div className="flex items-center gap-3 flex-wrap">
                    <div className="flex items-center gap-1.5">
                      <span className="text-[10px] font-bold text-muted-foreground uppercase">Entrada:</span>
                      <input
                        type="time"
                        value={batchStart}
                        onChange={(e) => setBatchStart(e.target.value)}
                        className="px-2.5 py-1.5 rounded-lg bg-muted/40 border border-border text-xs font-mono font-bold text-foreground focus:outline-none focus:ring-1 focus:ring-brand-500"
                      />
                    </div>

                    <div className="flex items-center gap-1.5">
                      <span className="text-[10px] font-bold text-muted-foreground uppercase">Salida:</span>
                      <input
                        type="time"
                        value={batchEnd}
                        onChange={(e) => setBatchEnd(e.target.value)}
                        className="px-2.5 py-1.5 rounded-lg bg-muted/40 border border-border text-xs font-mono font-bold text-foreground focus:outline-none focus:ring-1 focus:ring-brand-500"
                      />
                    </div>

                    <div className="flex items-center gap-1.5">
                      <span className="text-[10px] font-bold text-muted-foreground uppercase">Meta:</span>
                      <div className="relative">
                        <input
                          type="number"
                          min="1"
                          max="16"
                          step="0.5"
                          value={batchTargetHours}
                          onChange={(e) => setBatchTargetHours(parseFloat(e.target.value) || 1)}
                          className="w-16 px-2 py-1.5 pr-5 rounded-lg bg-muted/40 border border-border text-xs font-mono font-bold text-foreground text-center focus:outline-none focus:ring-1 focus:ring-brand-500"
                        />
                        <span className="absolute right-1.5 top-1.5 text-[10px] text-muted-foreground pointer-events-none font-bold">
                          h
                        </span>
                      </div>
                      <button
                        type="button"
                        onClick={handleCalculateBatch}
                        title="Auto-calcular meta en base a las horas seleccionadas"
                        className="p-1.5 rounded-lg bg-muted hover:bg-muted/80 text-muted-foreground hover:text-foreground text-[10px] transition-colors"
                      >
                        <RotateCcw className="h-3 w-3" />
                      </button>
                    </div>
                  </div>

                  <button
                    type="button"
                    onClick={handleApplyBatchToSelected}
                    disabled={selectedBatchDays.length === 0}
                    className={`px-3.5 py-1.5 rounded-xl text-xs font-bold transition-all flex items-center justify-center gap-1.5 shadow-sm ${
                      selectedBatchDays.length > 0
                        ? "bg-brand-500 hover:bg-brand-600 text-white shadow-brand-500/20"
                        : "bg-muted text-muted-foreground/60 cursor-not-allowed border border-border"
                    }`}
                  >
                    <CheckCheck className="h-3.5 w-3.5" />
                    Aplicar a seleccionados ({selectedBatchDays.length})
                  </button>
                </div>
              </div>

              {/* ── FILAS POR DÍA ── */}
              <div className="space-y-2">
                {workDays.map((dayId) => {
                  const dayObj = DAYS_LIST.find((d) => d.id === dayId);
                  const isChecked = selectedBatchDays.includes(dayId);
                  const rule = daySchedules[dayId] || {
                    start: scheduleStart,
                    end: scheduleEnd,
                    targetHours: targetDailyHours,
                  };

                  return (
                    <div
                      key={dayId}
                      className={`p-3 rounded-xl border transition-all flex flex-col lg:flex-row lg:items-center justify-between gap-3 shadow-2xs ${
                        isChecked
                          ? "bg-brand-500/10 border-brand-500/40"
                          : "bg-card border-border hover:border-border/80"
                      }`}
                    >
                      {/* Checkbox y Nombre del Día */}
                      <div className="flex items-center gap-3 shrink-0">
                        <input
                          type="checkbox"
                          checked={isChecked}
                          onChange={() => handleToggleBatchDay(dayId)}
                          className="h-4 w-4 rounded border-border text-brand-500 focus:ring-brand-500/40 cursor-pointer"
                        />
                        <span className="h-7 w-7 rounded-lg bg-brand-500/15 border border-brand-500/30 text-brand-500 text-xs font-black grid place-items-center">
                          {dayObj?.label}
                        </span>
                        <span className="text-xs font-bold text-foreground w-20">{dayObj?.full}</span>
                      </div>

                      {/* Selectores rápidos individuales de turno: Diurno, Mixto, Nocturno */}
                      <div className="flex items-center gap-1 flex-wrap">
                        <button
                          type="button"
                          onClick={() => handleApplyShiftDirectToDay(dayId, "diurno8")}
                          title="Diurno 8h (08:00 - 17:00)"
                          className="px-2 py-0.5 rounded-md bg-muted/60 hover:bg-amber-500/15 hover:text-amber-500 text-[10px] font-medium text-muted-foreground transition-all flex items-center gap-1"
                        >
                          <Sun className="h-3 w-3 text-amber-500" /> Diurno 8h
                        </button>
                        <button
                          type="button"
                          onClick={() => handleApplyShiftDirectToDay(dayId, "diurno10")}
                          title="Diurno 10h (06:30 - 16:30)"
                          className="px-2 py-0.5 rounded-md bg-muted/60 hover:bg-amber-500/15 hover:text-amber-500 text-[10px] font-medium text-muted-foreground transition-all flex items-center gap-1"
                        >
                          <Sun className="h-3 w-3 text-amber-500" /> Diurno 10h
                        </button>
                        <button
                          type="button"
                          onClick={() => handleApplyShiftDirectToDay(dayId, "mixto")}
                          title="Mixto 7h (13:00 - 21:00)"
                          className="px-2 py-0.5 rounded-md bg-muted/60 hover:bg-orange-400/15 hover:text-orange-400 text-[10px] font-medium text-muted-foreground transition-all flex items-center gap-1"
                        >
                          <Sunset className="h-3 w-3 text-orange-400" /> Mixto 7h
                        </button>
                        <button
                          type="button"
                          onClick={() => handleApplyShiftDirectToDay(dayId, "nocturno")}
                          title="Nocturno 6h (22:00 - 05:00)"
                          className="px-2 py-0.5 rounded-md bg-muted/60 hover:bg-indigo-400/15 hover:text-indigo-400 text-[10px] font-medium text-muted-foreground transition-all flex items-center gap-1"
                        >
                          <Moon className="h-3 w-3 text-indigo-400" /> Nocturno 6h
                        </button>
                      </div>

                      {/* Inputs de Entrada, Salida y Meta */}
                      <div className="flex items-center gap-3 flex-wrap justify-end">
                        {/* Entrada */}
                        <div className="flex items-center gap-1">
                          <span className="text-[10px] font-bold text-muted-foreground">Entrada:</span>
                          <input
                            type="time"
                            value={rule.start}
                            onChange={(e) => handleUpdateDaySchedule(dayId, "start", e.target.value)}
                            className="px-2 py-1 rounded-lg bg-muted/40 border border-border text-xs font-mono font-bold text-foreground focus:outline-none focus:ring-1 focus:ring-brand-500"
                          />
                        </div>

                        {/* Salida */}
                        <div className="flex items-center gap-1">
                          <span className="text-[10px] font-bold text-muted-foreground">Salida:</span>
                          <input
                            type="time"
                            value={rule.end}
                            onChange={(e) => handleUpdateDaySchedule(dayId, "end", e.target.value)}
                            className="px-2 py-1 rounded-lg bg-muted/40 border border-border text-xs font-mono font-bold text-foreground focus:outline-none focus:ring-1 focus:ring-brand-500"
                          />
                        </div>

                        {/* Meta Horas */}
                        <div className="flex items-center gap-1">
                          <span className="text-[10px] font-bold text-muted-foreground">Meta:</span>
                          <div className="relative">
                            <input
                              type="number"
                              min="1"
                              max="16"
                              step="0.5"
                              value={rule.targetHours}
                              onChange={(e) =>
                                handleUpdateDaySchedule(dayId, "targetHours", parseFloat(e.target.value) || 1)
                              }
                              className="w-16 px-2 py-1 pr-5 rounded-lg bg-muted/40 border border-border text-xs font-mono font-bold text-foreground text-center focus:outline-none focus:ring-1 focus:ring-brand-500"
                            />
                            <span className="absolute right-1.5 top-1 text-[10px] text-muted-foreground pointer-events-none font-bold">
                              h
                            </span>
                          </div>
                        </div>

                        {/* Auto-calc individual */}
                        <button
                          type="button"
                          onClick={() => {
                            const h = calculateDayHours(rule.start, rule.end);
                            handleUpdateDaySchedule(dayId, "targetHours", h);
                            toast.info(`${dayObj?.full}: meta calculada en ${h}h`);
                          }}
                          title="Auto-calcular meta según entrada y salida"
                          className="p-1.5 rounded-lg bg-muted hover:bg-muted/80 text-muted-foreground hover:text-foreground text-[10px] transition-colors"
                        >
                          <RotateCcw className="h-3 w-3" />
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* RESUMEN SEMANAL ACUMULADO */}
          <div className="p-4 rounded-xl bg-muted/20 border border-border flex items-center justify-between gap-4 flex-wrap">
            <div className="space-y-0.5">
              <span className="text-[10px] font-black uppercase text-muted-foreground tracking-wider">
                Total Horas Semanales Programadas
              </span>
              <p className="text-sm font-bold text-foreground flex items-center gap-2">
                <span className="text-brand-500 font-mono text-base font-black">{totalWeeklyHours} horas</span>
                <span className="text-muted-foreground text-xs font-normal">
                  ({workDays.length} días laborables seleccionados)
                </span>
              </p>
            </div>
            {totalWeeklyHours === 48 && (
              <span className="px-2.5 py-1 rounded-full bg-emerald-500/15 text-emerald-500 border border-emerald-500/30 text-xs font-bold flex items-center gap-1.5">
                <CheckCircle2 className="h-3.5 w-3.5" /> Jornada Legal 48h Semanales (Costa Rica)
              </span>
            )}
          </div>

          {/* ESTADO DE CONTROL HORARIO */}
          <div className="p-4 rounded-xl bg-muted/30 border border-border flex items-center justify-between gap-3">
            <div className="space-y-0.5">
              <p className="text-xs font-bold text-foreground">Control Horario Activo para este Usuario</p>
              <p className="text-[11px] text-muted-foreground">
                Si está desactivado, su actividad se medirá las 24 horas del día sin límites de turno.
              </p>
            </div>
            <button
              type="button"
              onClick={() => setScheduleEnabled(!scheduleEnabled)}
              className={`px-3 py-1.5 rounded-xl border text-xs font-bold transition-all flex items-center gap-2 ${
                scheduleEnabled
                  ? "bg-emerald-500/15 text-emerald-500 border-emerald-500/30"
                  : "bg-muted text-muted-foreground border-border"
              }`}
            >
              <span className={`h-2 w-2 rounded-full ${scheduleEnabled ? "bg-emerald-500 animate-pulse" : "bg-muted-foreground"}`} />
              {scheduleEnabled ? "Activo" : "Desactivado"}
            </button>
          </div>

          {/* BOTÓN GUARDAR */}
          <div className="flex items-center justify-end gap-3 pt-2">
            <button
              type="button"
              onClick={() => loadSchedule()}
              disabled={saving}
              className="px-4 py-2 rounded-xl border border-border text-xs font-bold text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
            >
              Descartar Cambios
            </button>
            <button
              type="button"
              onClick={() => handleSave(true)}
              disabled={saving}
              className="px-5 py-2 rounded-xl bg-brand-500 hover:bg-brand-600 text-white text-xs font-bold shadow-md shadow-brand-500/20 transition-all flex items-center gap-2"
            >
              <CheckCircle2 className="h-4 w-4" />
              {saving ? "Guardando..." : "Guardar Horario del Empleado"}
            </button>
          </div>
        </div>
      )}
    </section>
  );
}
