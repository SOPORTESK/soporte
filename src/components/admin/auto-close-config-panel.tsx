"use client";

import React, { useState, useEffect } from "react";
import {
  Clock,
  MessageSquare,
  ChevronDown,
  CheckCircle2,
  RotateCcw,
  AlertCircle,
  Sparkles,
  Moon,
  LogOut,
  Star,
  SlidersHorizontal,
} from "lucide-react";
import { toast } from "sonner";

const DEFAULT_CLOSE_MESSAGE =
  "Debido a que no hemos recibido respuesta, vamos a cerrar esta conversación. Si necesita ayuda, con gusto le atendemos. ¡Que tenga un buen día!";

const DEFAULT_AFTER_HOURS_MSG =
  "Gracias por contactarnos.\n\nEn este momento nos encontramos fuera de nuestro horario de atención.\n\nLe invitamos a comunicarse con nosotros en nuestro horario de servicio, de lunes a viernes, de 7:30 a. m. a 5:00 p. m.";

const DEFAULT_DAILY_CLOSE_MSG =
  "Estimado cliente, informamos que nuestra jornada de atención ha finalizado por hoy. Procedemos al cierre de esta sesión. Si requiere asistencia adicional, por favor escríbanos en nuestro horario habitual y con gusto le atenderemos.";

const DEFAULT_SURVEY_MSG =
  "¿Cómo calificaría la atención recibida? Responda con un número del 1 al 5, donde 1 es muy mala y 5 es excelente.";

const TIME_PRESETS = [
  { label: "5 min", value: 5 },
  { label: "10 min", value: 10 },
  { label: "15 min", value: 15 },
  { label: "30 min", value: 30 },
  { label: "1 hora", value: 60 },
  { label: "2 horas", value: 120 },
];

const DAILY_TIME_PRESETS = ["17:00", "17:30", "18:00", "18:30", "19:00", "20:00"];

export function AutoCloseConfigPanel() {
  // Sección 1: Auto-cierre por inactividad
  const [enabled, setEnabled] = useState<boolean>(true);
  const [inactivityMinutes, setInactivityMinutes] = useState<number>(10);
  const [closeMessage, setCloseMessage] = useState<string>(DEFAULT_CLOSE_MESSAGE);
  const [showMessageEditor, setShowMessageEditor] = useState<boolean>(false);

  // Sección 2: Respuestas fuera de horario
  const [afterHoursEnabled, setAfterHoursEnabled] = useState<boolean>(false);
  const [afterHoursMsg, setAfterHoursMsg] = useState<string>(DEFAULT_AFTER_HOURS_MSG);
  const [showAfterHoursEditor, setShowAfterHoursEditor] = useState<boolean>(false);

  // Sección 3: Cierre general al fin de jornada
  const [dailyCloseEnabled, setDailyCloseEnabled] = useState<boolean>(false);
  const [dailyCloseTime, setDailyCloseTime] = useState<string>("18:00");
  const [dailyCloseMsg, setDailyCloseMsg] = useState<string>(DEFAULT_DAILY_CLOSE_MSG);
  const [showDailyCloseEditor, setShowDailyCloseEditor] = useState<boolean>(false);

  // Sección 4: Encuesta de Satisfacción (WhatsApp)
  const [surveyEnabled, setSurveyEnabled] = useState<boolean>(false);
  const [surveyMsg, setSurveyMsg] = useState<string>(DEFAULT_SURVEY_MSG);
  const [showSurveyEditor, setShowSurveyEditor] = useState<boolean>(false);

  // Estado general
  const [loading, setLoading] = useState<boolean>(true);
  const [saving, setSaving] = useState<boolean>(false);
  const [hasChanges, setHasChanges] = useState<boolean>(false);

  // Cargar configuración actual desde la API
  useEffect(() => {
    fetch("/api/admin/auto-close-config")
      .then((r) => r.json())
      .then((data) => {
        if (data?.success) {
          if (data.config) {
            setEnabled(Boolean(data.config.enabled));
            setInactivityMinutes(Number(data.config.inactivity_minutes) || 10);
            if (data.config.close_message) setCloseMessage(data.config.close_message);
          }
          if (data.after_hours) {
            setAfterHoursEnabled(Boolean(data.after_hours.enabled));
            if (data.after_hours.message) setAfterHoursMsg(data.after_hours.message);
          }
          if (data.daily_close) {
            setDailyCloseEnabled(Boolean(data.daily_close.enabled));
            if (data.daily_close.close_time) setDailyCloseTime(data.daily_close.close_time);
            if (data.daily_close.message) setDailyCloseMsg(data.daily_close.message);
          }
          if (data.survey) {
            setSurveyEnabled(Boolean(data.survey.enabled));
            if (data.survey.message) setSurveyMsg(data.survey.message);
          }
        }
      })
      .catch((err) => console.error("Error cargando configuración de auto-close:", err))
      .finally(() => setLoading(false));
  }, []);

  const handleToggle = () => {
    setEnabled((prev) => !prev);
    setHasChanges(true);
  };

  const handleSelectPreset = (minutes: number) => {
    setInactivityMinutes(minutes);
    setHasChanges(true);
  };

  const handleMinutesChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = parseInt(e.target.value, 10);
    if (!isNaN(val) && val >= 1) {
      setInactivityMinutes(val);
      setHasChanges(true);
    } else if (e.target.value === "") {
      setInactivityMinutes(0);
      setHasChanges(true);
    }
  };

  const handleSave = async () => {
    const finalMinutes = Math.max(1, inactivityMinutes || 10);
    setSaving(true);
    try {
      const res = await fetch("/api/admin/auto-close-config", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          enabled,
          inactivity_minutes: finalMinutes,
          close_message: closeMessage,
          after_hours: {
            enabled: afterHoursEnabled,
            message: afterHoursMsg,
          },
          daily_close: {
            enabled: dailyCloseEnabled,
            close_time: dailyCloseTime,
            message: dailyCloseMsg,
          },
          survey: {
            enabled: surveyEnabled,
            message: surveyMsg,
          },
        }),
      });

      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data?.error || "Error al guardar");
      }

      setHasChanges(false);
      toast.success("Configuración de cierre, fuera de horario y encuesta guardada exitosamente.");
    } catch (err: any) {
      toast.error(err.message || "Error al guardar configuración");
    } finally {
      setSaving(false);
    }
  };

  const activeRulesCount = [enabled, afterHoursEnabled, dailyCloseEnabled, surveyEnabled].filter(Boolean).length;

  return (
    <section className="rounded-2xl border border-border/60 bg-card p-5 lg:p-6 shadow-sm h-full flex flex-col justify-between space-y-5">
      {/* ── HEADER MAESTRO (SIMÉTRICO CON EL PANEL DE HORARIOS) ── */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-border/60 pb-4">
        <div className="flex items-start gap-3 min-w-0 flex-1">
          <div className="h-9 w-9 rounded-xl bg-brand-500/15 border border-brand-500/30 text-brand-400 grid place-items-center shrink-0">
            <SlidersHorizontal className="h-4.5 w-4.5" />
          </div>
          <div className="min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <h2 className="text-base font-black text-foreground whitespace-nowrap">Automatizaciones & Cierres</h2>
              <span className="text-[10px] font-extrabold uppercase px-2 py-0.5 rounded-full bg-brand-500/15 text-brand-400 border border-brand-500/30 shrink-0 whitespace-nowrap">
                Reglas del Chat
              </span>
            </div>
            <p className="text-xs text-muted-foreground mt-0.5 leading-relaxed">
              Gestión centralizada de auto-cierre, fuera de horario, fin de jornada y encuesta.
            </p>
          </div>
        </div>

        <div className="shrink-0 self-start sm:self-center">
          <span
            className={`px-3 py-1.5 rounded-xl border text-xs font-bold transition-all flex items-center gap-2 whitespace-nowrap shrink-0 ${
              activeRulesCount > 0
                ? "bg-emerald-500/15 text-emerald-400 border-emerald-500/30"
                : "bg-muted text-muted-foreground border-border/60"
            }`}
          >
            <span
              className={`h-2 w-2 rounded-full shrink-0 ${
                activeRulesCount > 0 ? "bg-emerald-400 animate-pulse" : "bg-muted-foreground"
              }`}
            />
            {activeRulesCount} de 4 Activas
          </span>
        </div>
      </div>

      {/* ── CONTENIDO PRINCIPAL: 4 HERRAMIENTAS MODULARES EN TARJETAS INDEPENDIENTES ── */}
      <div className="space-y-4 flex-1 flex flex-col justify-between">
        {/* ── TARJETA 1: AUTO-CIERRE POR INACTIVIDAD ── */}
        <div
          className={`p-4.5 rounded-xl border transition-all space-y-3.5 ${
            enabled
              ? "bg-muted/20 border-border/80 shadow-xs ring-1 ring-emerald-500/15"
              : "bg-muted/10 border-border/40"
          }`}
        >
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div className="flex items-start gap-3">
              <div
                className={`h-9 w-9 rounded-xl grid place-items-center shrink-0 transition-colors ${
                  enabled ? "bg-emerald-500/15 text-emerald-400 border border-emerald-500/30" : "bg-muted text-muted-foreground"
                }`}
              >
                <Clock className="h-4 w-4" />
              </div>
              <div>
                <div className="flex items-center gap-2 flex-wrap">
                  <h3 className="text-sm font-black tracking-tight text-foreground whitespace-nowrap">
                    Auto-Cierre por Inactividad
                  </h3>
                  <span
                    className={`text-[9px] font-black uppercase tracking-wider px-2 py-0.5 rounded-full shrink-0 whitespace-nowrap ${
                      enabled
                        ? "bg-emerald-500/15 text-emerald-400 border border-emerald-500/30"
                        : "bg-muted text-muted-foreground border border-border"
                    }`}
                  >
                    {enabled ? "Activado" : "Apagado"}
                  </span>
                </div>
                <p className="text-[11px] text-muted-foreground mt-0.5">
                  {enabled
                    ? `Cierra automáticamente los chats que tengan más de ${inactivityMinutes} min sin respuesta del cliente.`
                    : "El auto-cierre está apagado. Ningún chat se cerrará de manera automática."}
                </p>
              </div>
            </div>

            <div className="flex items-center gap-3 self-end sm:self-center shrink-0">
              <span className="text-xs font-bold text-muted-foreground">
                {enabled ? "ON" : "OFF"}
              </span>
              <button
                type="button"
                role="switch"
                aria-checked={enabled}
                onClick={handleToggle}
                disabled={loading}
                className={`relative inline-flex h-7 w-12 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 ${
                  enabled ? "bg-emerald-500" : "bg-muted-foreground/30"
                }`}
              >
                <span
                  className={`pointer-events-none inline-block h-6 w-6 transform rounded-full bg-white shadow-lg ring-0 transition duration-200 ease-in-out ${
                    enabled ? "translate-x-5" : "translate-x-0"
                  }`}
                />
              </button>
            </div>
          </div>

          {/* Controles cuando está habilitado */}
          {enabled && (
            <div className="pt-3 border-t border-border/40 space-y-3">
              <div>
                <div className="flex items-center justify-between gap-2 mb-2">
                  <label className="text-[10px] font-black uppercase tracking-wider text-muted-foreground">
                    Tiempo de espera sin respuesta del cliente:
                  </label>
                  <span className="text-xs font-black tabular-nums text-emerald-400">
                    {inactivityMinutes} min
                  </span>
                </div>

                <div className="flex flex-wrap items-center gap-2">
                  {TIME_PRESETS.map((preset) => (
                    <button
                      key={preset.value}
                      type="button"
                      onClick={() => handleSelectPreset(preset.value)}
                      className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${
                        inactivityMinutes === preset.value
                          ? "bg-emerald-600 text-white shadow-xs ring-1 ring-emerald-500"
                          : "bg-background/60 hover:bg-muted text-muted-foreground hover:text-foreground border border-border/40"
                      }`}
                    >
                      {preset.label}
                    </button>
                  ))}

                  <div className="flex items-center gap-1.5 ml-auto">
                    <span className="text-[11px] text-muted-foreground font-medium">Personalizado:</span>
                    <input
                      type="number"
                      min="1"
                      max="1440"
                      value={inactivityMinutes || ""}
                      onChange={handleMinutesChange}
                      className="w-16 h-8 rounded-lg border border-border bg-background px-2 text-center text-xs font-bold tabular-nums focus:outline-none focus:ring-1 focus:ring-emerald-500"
                    />
                    <span className="text-[11px] text-muted-foreground font-medium">min</span>
                  </div>
                </div>
              </div>

              {/* Mensaje de despedida */}
              <div className="rounded-xl border border-border/40 bg-background/60 overflow-hidden">
                <button
                  type="button"
                  onClick={() => setShowMessageEditor((prev) => !prev)}
                  className="w-full flex items-center justify-between px-3.5 py-2.5 text-xs font-bold text-muted-foreground hover:text-foreground hover:bg-muted/40 transition-colors"
                >
                  <div className="flex items-center gap-2">
                    <MessageSquare className="h-3.5 w-3.5 text-emerald-400" />
                    <span>Mensaje de despedida enviado al cerrar el caso</span>
                    <span className="text-[10px] text-muted-foreground font-normal">
                      ({closeMessage.length} caracteres)
                    </span>
                  </div>
                  <ChevronDown
                    className={`h-3.5 w-3.5 transition-transform duration-200 ${
                      showMessageEditor ? "rotate-180 text-foreground" : ""
                    }`}
                  />
                </button>

                {showMessageEditor && (
                  <div className="p-3.5 pt-1 border-t border-border/30 space-y-2">
                    <textarea
                      value={closeMessage}
                      onChange={(e) => {
                        setCloseMessage(e.target.value);
                        setHasChanges(true);
                      }}
                      rows={3}
                      className="w-full rounded-lg border border-border bg-background p-2.5 text-xs leading-relaxed focus:outline-none focus:ring-1 focus:ring-emerald-500 resize-none"
                    />
                    <div className="flex justify-end">
                      <button
                        type="button"
                        onClick={() => {
                          setCloseMessage(DEFAULT_CLOSE_MESSAGE);
                          setHasChanges(true);
                          toast.info("Mensaje restablecido al predeterminado");
                        }}
                        className="flex items-center gap-1 text-[10px] font-bold text-muted-foreground hover:text-foreground"
                      >
                        <RotateCcw className="h-2.5 w-2.5" />
                        Restablecer mensaje original
                      </button>
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}

          {!enabled && (
            <div className="p-2.5 rounded-lg bg-amber-500/10 border border-amber-500/20 flex items-center gap-2 text-amber-500 text-xs">
              <AlertCircle className="h-4 w-4 shrink-0" />
              <span>El sistema no cerrará tickets por inactividad. Los agentes deben cerrarlos manualmente.</span>
            </div>
          )}
        </div>

        {/* ── TARJETA 2: RESPUESTAS FUERA DE HORARIO ── */}
        <div
          className={`p-4.5 rounded-xl border transition-all space-y-3.5 ${
            afterHoursEnabled
              ? "bg-muted/20 border-border/80 shadow-xs ring-1 ring-indigo-500/15"
              : "bg-muted/10 border-border/40"
          }`}
        >
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div className="flex items-start gap-3">
              <div
                className={`h-9 w-9 rounded-xl grid place-items-center shrink-0 transition-colors ${
                  afterHoursEnabled ? "bg-indigo-500/15 text-indigo-400 border border-indigo-500/30" : "bg-muted text-muted-foreground"
                }`}
              >
                <Moon className="h-4 w-4" />
              </div>
              <div>
                <div className="flex items-center gap-2 flex-wrap">
                  <h3 className="text-sm font-black tracking-tight text-foreground whitespace-nowrap">
                    Respuestas Fuera de Horario
                  </h3>
                  <span
                    className={`text-[9px] font-black uppercase tracking-wider px-2 py-0.5 rounded-full shrink-0 whitespace-nowrap ${
                      afterHoursEnabled
                        ? "bg-indigo-500/15 text-indigo-400 border border-indigo-500/30"
                        : "bg-muted text-muted-foreground border border-border"
                    }`}
                  >
                    {afterHoursEnabled ? "Activado" : "Apagado"}
                  </span>
                </div>
                <p className="text-[11px] text-muted-foreground mt-0.5">
                  {afterHoursEnabled
                    ? "Envía un mensaje automático al cliente cuando escriba fuera de la ventana operativa."
                    : "Desactivado. No se enviará respuesta automática si un cliente escribe fuera de horario."}
                </p>
              </div>
            </div>

            <div className="flex items-center gap-3 self-end sm:self-center shrink-0">
              <span className="text-xs font-bold text-muted-foreground">
                {afterHoursEnabled ? "ON" : "OFF"}
              </span>
              <button
                type="button"
                role="switch"
                aria-checked={afterHoursEnabled}
                onClick={() => {
                  setAfterHoursEnabled((v) => !v);
                  setHasChanges(true);
                }}
                disabled={loading}
                className={`relative inline-flex h-7 w-12 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 ${
                  afterHoursEnabled ? "bg-indigo-500" : "bg-muted-foreground/30"
                }`}
              >
                <span
                  className={`pointer-events-none inline-block h-6 w-6 transform rounded-full bg-white shadow-lg ring-0 transition duration-200 ease-in-out ${
                    afterHoursEnabled ? "translate-x-5" : "translate-x-0"
                  }`}
                />
              </button>
            </div>
          </div>

          {/* Editor de mensaje fuera de horario */}
          <div className="rounded-xl border border-border/40 bg-background/60 overflow-hidden">
            <button
              type="button"
              onClick={() => setShowAfterHoursEditor((v) => !v)}
              className="flex items-center justify-between w-full text-left p-2.5 text-xs font-semibold text-foreground hover:bg-muted/40 transition-colors group"
            >
              <div className="flex items-center gap-2">
                <MessageSquare className="h-3.5 w-3.5 text-indigo-400" />
                <span>Mensaje automático para el cliente</span>
                <span className="text-[10px] text-muted-foreground font-normal">
                  ({afterHoursMsg.length} caracteres)
                </span>
              </div>
              <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground group-hover:text-foreground">
                <span>{showAfterHoursEditor ? "Ocultar" : "Personalizar"}</span>
                <ChevronDown
                  className={`h-3.5 w-3.5 transition-transform duration-200 ${
                    showAfterHoursEditor ? "rotate-180" : ""
                  }`}
                />
              </div>
            </button>

            {showAfterHoursEditor && (
              <div className="p-3.5 pt-1 border-t border-border/30 space-y-2">
                <div className="flex items-center justify-between">
                  <label className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider">
                    Texto del mensaje al recibir chat fuera de turno:
                  </label>
                  <button
                    type="button"
                    onClick={() => {
                      setAfterHoursMsg(DEFAULT_AFTER_HOURS_MSG);
                      setHasChanges(true);
                      toast.info("Mensaje restablecido al predeterminado");
                    }}
                    className="flex items-center gap-1 text-[10px] text-muted-foreground hover:text-foreground transition-colors px-2 py-0.5 rounded-md hover:bg-muted"
                  >
                    <RotateCcw className="h-2.5 w-2.5" /> Restablecer
                  </button>
                </div>

                <textarea
                  value={afterHoursMsg}
                  onChange={(e) => {
                    setAfterHoursMsg(e.target.value);
                    setHasChanges(true);
                  }}
                  rows={3}
                  className="w-full text-xs rounded-lg border border-border bg-background p-2.5 focus:outline-none focus:ring-1 focus:ring-indigo-500 resize-none leading-relaxed"
                  placeholder="Escriba el mensaje para el cliente..."
                />
              </div>
            )}
          </div>
        </div>

        {/* ── TARJETA 3: CIERRE GENERAL AL FIN DE JORNADA ── */}
        <div
          className={`p-4.5 rounded-xl border transition-all space-y-3.5 ${
            dailyCloseEnabled
              ? "bg-muted/20 border-border/80 shadow-xs ring-1 ring-amber-500/15"
              : "bg-muted/10 border-border/40"
          }`}
        >
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div className="flex items-start gap-3">
              <div
                className={`h-9 w-9 rounded-xl grid place-items-center shrink-0 transition-colors ${
                  dailyCloseEnabled ? "bg-amber-500/15 text-amber-400 border border-amber-500/30" : "bg-muted text-muted-foreground"
                }`}
              >
                <LogOut className="h-4 w-4" />
              </div>
              <div>
                <div className="flex items-center gap-2 flex-wrap">
                  <h3 className="text-sm font-black tracking-tight text-foreground whitespace-nowrap">
                    Cierre General al Fin de Jornada
                  </h3>
                  <span
                    className={`text-[9px] font-black uppercase tracking-wider px-2 py-0.5 rounded-full shrink-0 whitespace-nowrap ${
                      dailyCloseEnabled
                        ? "bg-amber-500/15 text-amber-400 border border-amber-500/30"
                        : "bg-muted text-muted-foreground border border-border"
                    }`}
                  >
                    {dailyCloseEnabled ? `Corte a las ${dailyCloseTime}` : "Apagado"}
                  </span>
                </div>
                <p className="text-[11px] text-muted-foreground mt-0.5">
                  {dailyCloseEnabled
                    ? `Cierra automáticamente los chats que sigan abiertos a las ${dailyCloseTime} y envía mensaje de cierre.`
                    : "Desactivado. Los casos abiertos no se cerrarán masivamente al finalizar la jornada."}
                </p>
              </div>
            </div>

            <div className="flex items-center gap-3 self-end sm:self-center shrink-0">
              <span className="text-xs font-bold text-muted-foreground">
                {dailyCloseEnabled ? "ON" : "OFF"}
              </span>
              <button
                type="button"
                role="switch"
                aria-checked={dailyCloseEnabled}
                onClick={() => {
                  setDailyCloseEnabled((v) => !v);
                  setHasChanges(true);
                }}
                disabled={loading}
                className={`relative inline-flex h-7 w-12 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 ${
                  dailyCloseEnabled ? "bg-amber-500" : "bg-muted-foreground/30"
                }`}
              >
                <span
                  className={`pointer-events-none inline-block h-6 w-6 transform rounded-full bg-white shadow-lg ring-0 transition duration-200 ease-in-out ${
                    dailyCloseEnabled ? "translate-x-5" : "translate-x-0"
                  }`}
                />
              </button>
            </div>
          </div>

          {/* Configuración de hora y mensaje */}
          <div className="space-y-2.5">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-2.5 rounded-xl bg-background/60 border border-border/40">
              <div className="flex items-center gap-2">
                <Clock className="h-3.5 w-3.5 text-amber-500" />
                <span className="text-xs font-bold">Hora de corte general:</span>
              </div>

              <div className="flex items-center gap-2 flex-wrap">
                <div className="flex items-center gap-1">
                  {DAILY_TIME_PRESETS.map((t) => (
                    <button
                      key={t}
                      type="button"
                      onClick={() => {
                        setDailyCloseTime(t);
                        setHasChanges(true);
                      }}
                      className={`px-2 py-0.5 text-[10px] font-bold rounded-md transition-colors ${
                        dailyCloseTime === t
                          ? "bg-amber-500 text-white shadow-xs"
                          : "bg-muted hover:bg-muted/80 text-muted-foreground"
                      }`}
                    >
                      {t}
                    </button>
                  ))}
                </div>

                <input
                  type="time"
                  value={dailyCloseTime}
                  onChange={(e) => {
                    setDailyCloseTime(e.target.value);
                    setHasChanges(true);
                  }}
                  className="text-xs font-mono font-bold bg-background border border-border rounded-md px-2 py-1 focus:outline-none focus:ring-1 focus:ring-amber-500"
                />
              </div>
            </div>

            <div className="rounded-xl border border-border/40 bg-background/60 overflow-hidden">
              <button
                type="button"
                onClick={() => setShowDailyCloseEditor((v) => !v)}
                className="flex items-center justify-between w-full text-left p-2.5 text-xs font-semibold text-foreground hover:bg-muted/40 transition-colors group"
              >
                <div className="flex items-center gap-2">
                  <MessageSquare className="h-3.5 w-3.5 text-amber-500" />
                  <span>Mensaje enviado al cerrar los casos</span>
                  <span className="text-[10px] text-muted-foreground font-normal">
                    ({dailyCloseMsg.length} caracteres)
                  </span>
                </div>
                <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground group-hover:text-foreground">
                  <span>{showDailyCloseEditor ? "Ocultar" : "Personalizar"}</span>
                  <ChevronDown
                    className={`h-3.5 w-3.5 transition-transform duration-200 ${
                      showDailyCloseEditor ? "rotate-180" : ""
                    }`}
                  />
                </div>
              </button>

              {showDailyCloseEditor && (
                <div className="p-3.5 pt-1 border-t border-border/30 space-y-2">
                  <div className="flex items-center justify-between">
                    <label className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider">
                      Texto del mensaje al cerrar los casos por fin de jornada:
                    </label>
                    <button
                      type="button"
                      onClick={() => {
                        setDailyCloseMsg(DEFAULT_DAILY_CLOSE_MSG);
                        setHasChanges(true);
                        toast.info("Mensaje restablecido al predeterminado");
                      }}
                      className="flex items-center gap-1 text-[10px] text-muted-foreground hover:text-foreground transition-colors px-2 py-0.5 rounded-md hover:bg-muted"
                    >
                      <RotateCcw className="h-2.5 w-2.5" /> Restablecer
                    </button>
                  </div>

                  <textarea
                    value={dailyCloseMsg}
                    onChange={(e) => {
                      setDailyCloseMsg(e.target.value);
                      setHasChanges(true);
                    }}
                    rows={3}
                    className="w-full text-xs rounded-lg border border-border bg-background p-2.5 focus:outline-none focus:ring-1 focus:ring-amber-500 resize-none leading-relaxed"
                    placeholder="Escriba el mensaje de fin de jornada..."
                  />
                </div>
              )}
            </div>
          </div>
        </div>

        {/* ── TARJETA 4: ENCUESTA DE SATISFACCIÓN (WHATSAPP) ── */}
        <div
          className={`p-4.5 rounded-xl border transition-all space-y-3.5 ${
            surveyEnabled
              ? "bg-muted/20 border-border/80 shadow-xs ring-1 ring-sky-500/15"
              : "bg-muted/10 border-border/40"
          }`}
        >
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div className="flex items-start gap-3">
              <div
                className={`h-9 w-9 rounded-xl grid place-items-center shrink-0 transition-colors ${
                  surveyEnabled ? "bg-sky-500/15 text-sky-400 border border-sky-500/30" : "bg-muted text-muted-foreground"
                }`}
              >
                <Star className="h-4 w-4" />
              </div>
              <div>
                <div className="flex items-center gap-2 flex-wrap">
                  <h3 className="text-sm font-black tracking-tight text-foreground whitespace-nowrap">
                    Encuesta de Satisfacción (WhatsApp)
                  </h3>
                  <span
                    className={`text-[9px] font-black uppercase tracking-wider px-2 py-0.5 rounded-full shrink-0 whitespace-nowrap ${
                      surveyEnabled
                        ? "bg-sky-500/15 text-sky-400 border border-sky-500/30"
                        : "bg-muted text-muted-foreground border border-border"
                    }`}
                  >
                    {surveyEnabled ? "Activado" : "Apagado"}
                  </span>
                </div>
                <p className="text-[11px] text-muted-foreground mt-0.5">
                  {surveyEnabled
                    ? "Envía automáticamente una encuesta de satisfacción (calificación 1 al 5) por WhatsApp al cliente al cerrarse un caso."
                    : "Desactivado. Al cerrar un caso no se enviará encuesta y finalizará directamente sin esperar calificación."}
                </p>
              </div>
            </div>

            <div className="flex items-center gap-3 self-end sm:self-center shrink-0">
              <span className="text-xs font-bold text-muted-foreground">
                {surveyEnabled ? "ON" : "OFF"}
              </span>
              <button
                type="button"
                role="switch"
                aria-checked={surveyEnabled}
                onClick={() => {
                  setSurveyEnabled((v) => !v);
                  setHasChanges(true);
                }}
                disabled={loading}
                className={`relative inline-flex h-7 w-12 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 ${
                  surveyEnabled ? "bg-sky-500" : "bg-muted-foreground/30"
                }`}
              >
                <span
                  className={`pointer-events-none inline-block h-6 w-6 transform rounded-full bg-white shadow-lg ring-0 transition duration-200 ease-in-out ${
                    surveyEnabled ? "translate-x-5" : "translate-x-0"
                  }`}
                />
              </button>
            </div>
          </div>

          {/* Plantilla de texto predeterminada para la encuesta */}
          <div className="rounded-xl border border-border/40 bg-background/60 overflow-hidden">
            <button
              type="button"
              onClick={() => setShowSurveyEditor((v) => !v)}
              className="flex items-center justify-between w-full text-left p-2.5 text-xs font-semibold text-foreground hover:bg-muted/40 transition-colors group"
            >
              <div className="flex items-center gap-2">
                <MessageSquare className="h-3.5 w-3.5 text-sky-400" />
                <span>Plantilla de texto predeterminada para la encuesta</span>
                <span className="text-[10px] text-muted-foreground font-normal">
                  ({surveyMsg.length} caracteres)
                </span>
              </div>
              <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground group-hover:text-foreground">
                <span>{showSurveyEditor ? "Ocultar" : "Personalizar"}</span>
                <ChevronDown
                  className={`h-3.5 w-3.5 transition-transform duration-200 ${
                    showSurveyEditor ? "rotate-180" : ""
                  }`}
                />
              </div>
            </button>

            {showSurveyEditor && (
              <div className="p-3.5 pt-1 border-t border-border/30 space-y-2">
                <div className="flex items-center justify-between">
                  <label className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider">
                    Texto enviado solicitando la calificación del cliente (1 al 5):
                  </label>
                  <button
                    type="button"
                    onClick={() => {
                      setSurveyMsg(DEFAULT_SURVEY_MSG);
                      setHasChanges(true);
                      toast.info("Mensaje restablecido a la plantilla original");
                    }}
                    className="flex items-center gap-1 text-[10px] text-muted-foreground hover:text-foreground transition-colors px-2 py-0.5 rounded-md hover:bg-muted"
                  >
                    <RotateCcw className="h-2.5 w-2.5" /> Restablecer
                  </button>
                </div>

                <textarea
                  value={surveyMsg}
                  onChange={(e) => {
                    setSurveyMsg(e.target.value);
                    setHasChanges(true);
                  }}
                  rows={3}
                  className="w-full text-xs rounded-lg border border-border bg-background p-2.5 focus:outline-none focus:ring-1 focus:ring-sky-500 resize-none leading-relaxed"
                  placeholder="Escriba el texto para solicitar la calificación..."
                />
              </div>
            )}
          </div>

          {!surveyEnabled && (
            <div className="p-2.5 rounded-lg bg-muted/30 border border-border/40 flex items-center gap-2 text-muted-foreground text-xs">
              <AlertCircle className="h-3.5 w-3.5 shrink-0 text-sky-500/70" />
              <span>La encuesta está apagada. Al cerrar los casos se finalizarán directamente sin solicitar calificación por WhatsApp.</span>
            </div>
          )}
        </div>
      </div>

      {/* ── FOOTER UNIFICADO (SIMÉTRICO CON EL PANEL DE HORARIOS) ── */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pt-3 border-t border-border/60 mt-auto">
        <p className="text-[11px] text-muted-foreground">
          {hasChanges ? (
            <span className="flex items-center gap-1.5 text-amber-500 font-medium">
              <span className="h-2 w-2 rounded-full bg-amber-500 animate-pulse" />
              Hay cambios pendientes por guardar.
            </span>
          ) : (
            <span className="flex items-center gap-1.5 text-emerald-500 font-medium">
              <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500" />
              Configuración sincronizada con la base de datos.
            </span>
          )}
        </p>

        <button
          type="button"
          onClick={handleSave}
          disabled={saving || loading || !hasChanges}
          className={`flex items-center gap-1.5 px-5 py-2 rounded-xl text-xs font-bold transition-all shadow-md ${
            hasChanges
              ? "bg-brand-600 hover:bg-brand-500 text-white shadow-brand-500/20 cursor-pointer"
              : "bg-muted text-muted-foreground cursor-not-allowed opacity-60"
          }`}
        >
          {saving ? (
            <span>Guardando cambios...</span>
          ) : (
            <>
              <CheckCircle2 className="h-4 w-4" />
              <span>Guardar Configuración</span>
            </>
          )}
        </button>
      </div>
    </section>
  );
}
