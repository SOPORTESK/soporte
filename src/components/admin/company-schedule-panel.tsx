"use client";

import React, { useState, useEffect } from "react";
import { Clock, CheckCircle2, Calendar, ShieldCheck, AlertCircle, Sparkles } from "lucide-react";
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

export function CompanySchedulePanel() {
  const [scheduleStart, setScheduleStart] = useState<string>("08:00");
  const [scheduleEnd, setScheduleEnd] = useState<string>("17:00");
  const [scheduleEnabled, setScheduleEnabled] = useState<boolean>(true);
  const [workDays, setWorkDays] = useState<number[]>([1, 2, 3, 4, 5]);
  const [loading, setLoading] = useState<boolean>(true);
  const [saving, setSaving] = useState<boolean>(false);
  const [savedSuccess, setSavedSuccess] = useState<boolean>(false);

  useEffect(() => {
    fetch("/api/activity/schedule")
      .then((r) => r.json())
      .then((data) => {
        if (data?.success) {
          if (data.scheduleStart) setScheduleStart(data.scheduleStart);
          if (data.scheduleEnd) setScheduleEnd(data.scheduleEnd);
          if (data.scheduleEnabled !== undefined) setScheduleEnabled(Boolean(data.scheduleEnabled));
          if (Array.isArray(data.workDays) && data.workDays.length > 0) setWorkDays(data.workDays);
        }
      })
      .catch((err) => console.error("Error loading schedule:", err))
      .finally(() => setLoading(false));
  }, []);

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

  const handleSave = async () => {
    setSaving(true);
    try {
      const res = await fetch("/api/activity/schedule", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          scheduleStart,
          scheduleEnd,
          scheduleEnabled,
          workDays,
        }),
      });

      if (res.ok) {
        setSavedSuccess(true);
        toast.success("Jornada y horarios laborales guardados con éxito en la base de datos");
        try {
          localStorage.setItem("sekunet_activity_schedule_start", scheduleStart);
          localStorage.setItem("sekunet_activity_schedule_end", scheduleEnd);
          localStorage.setItem("sekunet_activity_schedule_enabled", String(scheduleEnabled));
        } catch {}
        setTimeout(() => setSavedSuccess(false), 3000);
      } else {
        toast.error("Error al guardar la configuración");
      }
    } catch (e: any) {
      toast.error(e.message || "Error al conectar con el servidor");
    } finally {
      setSaving(false);
    }
  };

  return (
    <section className="rounded-2xl border border-border/60 bg-card p-5 lg:p-6 space-y-5">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-border/60 pb-4">
        <div className="flex items-center gap-3">
          <div className="h-9 w-9 rounded-xl bg-violet-500/15 border border-violet-500/30 text-violet-400 grid place-items-center">
            <Clock className="h-4.5 w-4.5" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-base font-black text-foreground">Gestión de Horarios y Jornada Laboral</h2>
              <span className="text-[10px] font-extrabold uppercase px-2 py-0.5 rounded-full bg-violet-500/15 text-violet-400 border border-violet-500/30">
                Oficial
              </span>
            </div>
            <p className="text-xs text-muted-foreground mt-0.5">
              Configura los días hábiles y el rango horario. Fuera de esta jornada, nada se mide ni se registra en el servidor.
            </p>
          </div>
        </div>

        <button
          type="button"
          onClick={() => setScheduleEnabled(!scheduleEnabled)}
          className={`px-3 py-1.5 rounded-xl border text-xs font-bold transition-all flex items-center gap-2 self-start sm:self-auto ${
            scheduleEnabled
              ? "bg-emerald-500/15 text-emerald-400 border-emerald-500/30"
              : "bg-muted text-muted-foreground border-border/60"
          }`}
        >
          <span className={`h-2 w-2 rounded-full ${scheduleEnabled ? "bg-emerald-400 animate-pulse" : "bg-muted-foreground"}`} />
          {scheduleEnabled ? "Control Horario Activo" : "Filtro Desactivado (24h)"}
        </button>
      </div>

      {loading ? (
        <div className="py-6 text-center text-xs text-muted-foreground">Cargando configuración oficial...</div>
      ) : (
        <div className="space-y-5">
          {/* DÍAS LABORALES */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <label className="text-xs font-bold text-foreground flex items-center gap-1.5">
                <Calendar className="h-3.5 w-3.5 text-violet-400" />
                Días de la Semana Laborables:
              </label>
              <div className="flex items-center gap-1 text-[11px]">
                <span className="text-muted-foreground text-[10px] mr-1">Rápido:</span>
                <button
                  type="button"
                  onClick={() => handlePresetDays("lv")}
                  className="px-1.5 py-0.5 rounded bg-muted/60 hover:bg-violet-600 hover:text-white font-mono text-[10px] text-muted-foreground transition-colors"
                >
                  L-V
                </button>
                <button
                  type="button"
                  onClick={() => handlePresetDays("ls")}
                  className="px-1.5 py-0.5 rounded bg-muted/60 hover:bg-violet-600 hover:text-white font-mono text-[10px] text-muted-foreground transition-colors"
                >
                  L-S
                </button>
                <button
                  type="button"
                  onClick={() => handlePresetDays("all")}
                  className="px-1.5 py-0.5 rounded bg-muted/60 hover:bg-violet-600 hover:text-white font-mono text-[10px] text-muted-foreground transition-colors"
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
                    className={`py-2 px-1 rounded-xl border text-center transition-all flex flex-col items-center justify-center gap-0.5 ${
                      active
                        ? "bg-violet-600 text-white border-violet-500 shadow-sm"
                        : "bg-muted/30 text-muted-foreground border-border/50 hover:bg-muted/60"
                    }`}
                  >
                    <span className="text-xs font-black">{day.label}</span>
                    <span className="text-[9px] opacity-80 hidden sm:inline">{day.full}</span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* RANGO HORARIO */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <label className="text-xs font-bold text-foreground flex items-center gap-1.5">
                <Clock className="h-3.5 w-3.5 text-violet-400" />
                Rango Horario de Jornada:
              </label>
              <div className="flex items-center gap-1 text-[11px]">
                <span className="text-muted-foreground text-[10px] mr-1">Rápido:</span>
                <button
                  type="button"
                  onClick={() => handlePresetHours("06:00", "18:00")}
                  className="px-1.5 py-0.5 rounded bg-muted/60 hover:bg-violet-600 hover:text-white font-mono text-[10px] text-muted-foreground transition-colors"
                >
                  6a-6p
                </button>
                <button
                  type="button"
                  onClick={() => handlePresetHours("08:00", "17:00")}
                  className="px-1.5 py-0.5 rounded bg-muted/60 hover:bg-violet-600 hover:text-white font-mono text-[10px] text-muted-foreground transition-colors"
                >
                  8a-5p
                </button>
                <button
                  type="button"
                  onClick={() => handlePresetHours("07:30", "16:30")}
                  className="px-1.5 py-0.5 rounded bg-muted/60 hover:bg-violet-600 hover:text-white font-mono text-[10px] text-muted-foreground transition-colors"
                >
                  7:30a-4:30p
                </button>
              </div>
            </div>

            <div className="flex items-center gap-3 p-3 rounded-xl bg-muted/20 border border-border/60">
              <div className="flex items-center gap-2">
                <span className="text-xs text-muted-foreground font-semibold">Desde:</span>
                <input
                  type="time"
                  value={scheduleStart}
                  onChange={(e) => setScheduleStart(e.target.value)}
                  className="bg-card px-3 py-1.5 rounded-lg border border-border text-foreground font-mono font-bold text-xs focus:outline-none focus:border-violet-500"
                />
              </div>

              <span className="text-xs text-muted-foreground font-bold">hasta</span>

              <div className="flex items-center gap-2">
                <span className="text-xs text-muted-foreground font-semibold">Hasta:</span>
                <input
                  type="time"
                  value={scheduleEnd}
                  onChange={(e) => setScheduleEnd(e.target.value)}
                  className="bg-card px-3 py-1.5 rounded-lg border border-border text-foreground font-mono font-bold text-xs focus:outline-none focus:border-violet-500"
                />
              </div>
            </div>
          </div>

          {/* BOTÓN DE GUARDADO */}
          <div className="flex items-center justify-between pt-2 border-t border-border/40">
            <p className="text-[11px] text-muted-foreground">
              Esta configuración aplica a toda la telemetría del sistema y a la Suite de Auditoría.
            </p>
            <button
              type="button"
              onClick={handleSave}
              disabled={saving}
              className={`px-5 py-2 rounded-xl text-xs font-bold transition-all flex items-center gap-2 shadow-md ${
                savedSuccess
                  ? "bg-emerald-600 text-white shadow-emerald-600/20"
                  : "bg-violet-600 hover:bg-violet-500 text-white shadow-violet-600/20"
              }`}
            >
              {saving ? (
                <span>Guardando cambios...</span>
              ) : savedSuccess ? (
                <>
                  <CheckCircle2 className="h-4 w-4" />
                  <span>Guardado en Servidor</span>
                </>
              ) : (
                <>
                  <ShieldCheck className="h-4 w-4" />
                  <span>Guardar Horario Oficial</span>
                </>
              )}
            </button>
          </div>
        </div>
      )}
    </section>
  );
}
