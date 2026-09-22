"use client";

import React, { useState, useEffect } from "react";
import { Clock, MessageSquare, ChevronDown, CheckCircle2, RotateCcw, AlertCircle, Sparkles } from "lucide-react";
import { toast } from "sonner";

const DEFAULT_CLOSE_MESSAGE =
  "Al no haber recibido respuesta, procederemos a cerrar esta conversación. Si necesita asistencia adicional, puede contactarnos nuevamente y con gusto le atenderemos. ¡Que tenga un excelente día!";

const TIME_PRESETS = [
  { label: "5 min", value: 5 },
  { label: "10 min", value: 10 },
  { label: "15 min", value: 15 },
  { label: "30 min", value: 30 },
  { label: "1 hora", value: 60 },
  { label: "2 horas", value: 120 },
];

export function AutoCloseConfigPanel() {
  const [enabled, setEnabled] = useState<boolean>(true);
  const [inactivityMinutes, setInactivityMinutes] = useState<number>(10);
  const [closeMessage, setCloseMessage] = useState<string>(DEFAULT_CLOSE_MESSAGE);
  const [showMessageEditor, setShowMessageEditor] = useState<boolean>(false);
  const [loading, setLoading] = useState<boolean>(true);
  const [saving, setSaving] = useState<boolean>(false);
  const [hasChanges, setHasChanges] = useState<boolean>(false);

  // Cargar configuración actual desde la API
  useEffect(() => {
    fetch("/api/admin/auto-close-config")
      .then((r) => r.json())
      .then((data) => {
        if (data?.success && data?.config) {
          setEnabled(Boolean(data.config.enabled));
          setInactivityMinutes(Number(data.config.inactivity_minutes) || 10);
          if (data.config.close_message) {
            setCloseMessage(data.config.close_message);
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

  const handleMessageChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setCloseMessage(e.target.value);
    setHasChanges(true);
  };

  const handleResetMessage = () => {
    setCloseMessage(DEFAULT_CLOSE_MESSAGE);
    setHasChanges(true);
    toast.info("Mensaje restablecido al predeterminado");
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
        }),
      });

      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data?.error || "Error al guardar");
      }

      setHasChanges(false);
      toast.success(
        enabled
          ? `Auto-cierre activado a los ${finalMinutes} minutos de inactividad.`
          : "Auto-cierre apagado globalmente. Ningún caso se cerrará de forma automática."
      );
    } catch (err: any) {
      toast.error(err.message || "Error al guardar configuración");
    } finally {
      setSaving(false);
    }
  };

  return (
    <section className="rounded-2xl border border-border/60 bg-card p-5 lg:p-6 shadow-sm transition-all">
      {/* Header con Switch ON / OFF */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="flex items-start gap-3">
          <div
            className={`h-9 w-9 rounded-xl grid place-items-center shrink-0 transition-colors ${
              enabled ? "bg-emerald-500/10 text-emerald-500" : "bg-muted text-muted-foreground"
            }`}
          >
            <Clock className="h-4 w-4" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-sm font-black tracking-tight">Auto-Cierre por Inactividad</h2>
              <span
                className={`text-[9px] font-black uppercase tracking-wider px-2 py-0.5 rounded-full ${
                  enabled
                    ? "bg-emerald-500/15 text-emerald-500 border border-emerald-500/30"
                    : "bg-muted text-muted-foreground border border-border"
                }`}
              >
                {enabled ? "Activado" : "Apagado"}
              </span>
            </div>
            <p className="text-[11px] text-muted-foreground mt-0.5 max-w-lg">
              {enabled
                ? `Cierra automáticamente los chats que tengan más de ${inactivityMinutes} min sin respuesta del cliente.`
                : "El auto-cierre está apagado. Ningún chat se cerrará de manera automática."}
            </p>
          </div>
        </div>

        {/* Switch deslizante tipo iOS */}
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
            className={`relative inline-flex h-7 w-12 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 focus-visible:ring-offset-2 ${
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

      {/* Contenido si está activado */}
      {enabled && (
        <div className="mt-5 pt-4 border-t border-border/50 space-y-4">
          {/* Fila: Control de tiempo (Presets + Input exacto) */}
          <div>
            <div className="flex items-center justify-between gap-2 mb-2">
              <label className="text-[10px] font-black uppercase tracking-wider text-muted-foreground">
                Tiempo de espera sin respuesta del cliente
              </label>
              <span className="text-xs font-black tabular-nums text-brand-500">
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
                      ? "bg-brand-600 text-white shadow-sm ring-1 ring-brand-500"
                      : "bg-muted/40 hover:bg-muted text-muted-foreground hover:text-foreground border border-border/40"
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
                  className="w-16 h-8 rounded-lg border border-border bg-background px-2 text-center text-xs font-bold tabular-nums focus:outline-none focus:ring-1 focus:ring-brand-500"
                />
                <span className="text-[11px] text-muted-foreground font-medium">min</span>
              </div>
            </div>
          </div>

          {/* Acordeón discreto para el mensaje de cierre */}
          <div className="rounded-xl border border-border/40 bg-muted/20 overflow-hidden transition-all">
            <button
              type="button"
              onClick={() => setShowMessageEditor((prev) => !prev)}
              className="w-full flex items-center justify-between px-3.5 py-2.5 text-xs font-bold text-muted-foreground hover:text-foreground hover:bg-muted/40 transition-colors"
            >
              <div className="flex items-center gap-2">
                <MessageSquare className="h-3.5 w-3.5 text-brand-500" />
                <span>Mensaje de despedida enviado al cerrar el caso</span>
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
                  onChange={handleMessageChange}
                  rows={3}
                  placeholder="Escribe el mensaje de cierre..."
                  className="w-full rounded-lg border border-border bg-background p-2.5 text-xs leading-relaxed focus:outline-none focus:ring-1 focus:ring-brand-500 resize-none"
                />
                <div className="flex justify-end">
                  <button
                    type="button"
                    onClick={handleResetMessage}
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

      {/* Aviso si está apagado */}
      {!enabled && (
        <div className="mt-4 p-3 rounded-xl bg-amber-500/10 border border-amber-500/20 flex items-center gap-2.5 text-amber-500">
          <AlertCircle className="h-4 w-4 shrink-0" />
          <p className="text-xs font-medium">
            El sistema no cerrará ningún ticket automáticamente. Los técnicos deben cerrar cada caso manualmente desde su bandeja.
          </p>
        </div>
      )}

      {/* Barra inferior de guardar (solo si hay cambios o si se desea confirmar) */}
      <div className="mt-4 pt-3 border-t border-border/40 flex items-center justify-between gap-3">
        <p className="text-[10px] text-muted-foreground">
          {hasChanges
            ? "⚠️ Hay cambios sin guardar en la configuración de auto-cierre."
            : "✓ Configuración sincronizada con la base de datos."}
        </p>

        <button
          type="button"
          onClick={handleSave}
          disabled={saving || loading}
          className={`flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-black transition-all ${
            hasChanges
              ? "bg-brand-600 hover:bg-brand-500 text-white shadow-md shadow-brand-500/20 ring-1 ring-brand-500"
              : "bg-muted text-muted-foreground hover:bg-muted/80"
          }`}
        >
          {saving ? (
            <span>Guardando...</span>
          ) : (
            <>
              <CheckCircle2 className="h-3.5 w-3.5" />
              <span>Guardar Configuración</span>
            </>
          )}
        </button>
      </div>
    </section>
  );
}
