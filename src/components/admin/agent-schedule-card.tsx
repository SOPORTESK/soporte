"use client";

import React, { useState, useEffect } from "react";
import { Clock, Calendar, CheckCircle2, RotateCcw, Building2, UserCheck, Shield, Sparkles } from "lucide-react";
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
        return prev.filter((d) => d !== id);
      } else {
        return [...prev, id].sort((a, b) => a - b);
      }
    });
  };

  const handlePresetDays = (type: "lv" | "ls" | "all") => {
    if (type === "lv") setWorkDays([1, 2, 3, 4, 5]);
    if (type === "ls") setWorkDays([1, 2, 3, 4, 5, 6]);
    if (type === "all") setWorkDays([1, 2, 3, 4, 5, 6, 0]);
  };

  const handlePresetHours = (start: string, end: string) => {
    setScheduleStart(start);
    setScheduleEnd(end);
  };

  const handleCalculateDaily = () => {
    const parseMin = (t: string) => {
      const parts = (t || "").split(":");
      return (parseInt(parts[0], 10) || 0) * 60 + (parseInt(parts[1], 10) || 0);
    };
    const diffMin = Math.max(0, parseMin(scheduleEnd) - parseMin(scheduleStart));
    const effectiveMin = diffMin > 300 ? diffMin - 60 : diffMin;
    const hours = Math.round((effectiveMin / 60) * 2) / 2;
    setTargetDailyHours(Math.max(1, Math.min(16, hours)));
    toast.info(`Meta calculada: ${hours} horas (descontando 1h de descanso)`);
  };

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
        }),
      });

      if (res.ok) {
        setIsCustom(customValue);
        toast.success(
          customValue
            ? `Horario personalizado asignado a ${agentName || agentEmail}`
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
                  <UserCheck className="h-3 w-3" /> Personalizado
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

          {/* RANGO HORARIO & META DIARIA */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
            {/* Rango Horario */}
            <div className="space-y-2.5">
              <div className="flex items-center justify-between">
                <label className="text-xs font-bold text-foreground flex items-center gap-1.5">
                  <Clock className="h-3.5 w-3.5 text-brand-500" />
                  Rango Horario de Jornada:
                </label>
                <div className="flex items-center gap-1 text-[11px]">
                  <span className="text-muted-foreground text-[10px] mr-0.5">Rápido:</span>
                  <button
                    type="button"
                    onClick={() => handlePresetHours("08:00", "17:00")}
                    className="px-1.5 py-0.5 rounded bg-muted hover:bg-brand-500 hover:text-white font-mono text-[10px] text-muted-foreground transition-colors"
                  >
                    8a-5p
                  </button>
                  <button
                    type="button"
                    onClick={() => handlePresetHours("07:00", "16:00")}
                    className="px-1.5 py-0.5 rounded bg-muted hover:bg-brand-500 hover:text-white font-mono text-[10px] text-muted-foreground transition-colors"
                  >
                    7a-4p
                  </button>
                  <button
                    type="button"
                    onClick={() => handlePresetHours("06:00", "18:00")}
                    className="px-1.5 py-0.5 rounded bg-muted hover:bg-brand-500 hover:text-white font-mono text-[10px] text-muted-foreground transition-colors"
                  >
                    6a-6p
                  </button>
                </div>
              </div>

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
                  <Sparkles className="h-3.5 w-3.5 text-amber-500" />
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
                  {[6, 8, 9, 10].map((h) => (
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
              <p className="text-[11px] text-muted-foreground">
                Define las horas productivas que este empleado debe cumplir diariamente.
              </p>
            </div>
          </div>

          {/* ESTADO DE CONTROL HORARIO */}
          <div className="p-4 rounded-xl bg-muted/30 border border-border flex items-center justify-between gap-3">
            <div className="space-y-0.5">
              <p className="text-xs font-bold text-foreground">Control Horario Activo para este Usuario</p>
              <p className="text-[11px] text-muted-foreground">
                Si está desactivado, su actividad se medirá las 24 horas del día.
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
