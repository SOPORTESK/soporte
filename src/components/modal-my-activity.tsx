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
} from "lucide-react";
import { toast } from "sonner";
import { logActivity } from "@/lib/activity-client";

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

  const fetchMyData = async () => {
    setLoading(true);
    try {
      const today = new Date().toISOString().split("T")[0];
      const res = await fetch(
        `/api/activity/timeline?agent=${encodeURIComponent(agentEmail)}&date=${today}`
      );
      const data = await res.json();
      if (res.ok) {
        setTimeline(data.timeline || []);
      }
    } catch (e) {
      console.error("[ModalMyActivity] Error fetching timeline:", e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (isOpen) {
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
  const IDLE_GAP_MS = 15 * 60 * 1000; // 15 minutos

  for (let i = 0; i < sorted.length; i++) {
    const item = sorted[i];
    const currTime = new Date(item.created_at).getTime();
    const nextTime = i < sorted.length - 1 ? new Date(sorted[i + 1].created_at).getTime() : currTime + 60000;
    const gap = Math.max(0, nextTime - currTime);

    const meta = (item.metadata || {}) as Record<string, any>;
    let cat = item.category || "Operación Sekunet";

    if (cat === "Navegación") {
      const page = meta.page || "";
      if (page.includes("soporte-avanzado")) cat = "Soporte Avanzado (N2)";
      else if (page.includes("smart-inbox")) cat = "Smart Inbox & Casos";
      else if (page.includes("mi-gestion")) cat = "Mi Bandeja de Gestión";
      else if (page.includes("admin")) cat = "Panel de Administración";
      else if (page.includes("inbox")) cat = "Seka Chat (Bandeja)";
      else cat = "Operación Sekunet";
    }

    if (cat === "Inactividad") {
      totalIdleMs += Math.min(gap, 15 * 60 * 1000);
      continue;
    }

    const effectiveDur = Math.min(gap, IDLE_GAP_MS);
    totalActiveMs += effectiveDur;

    if (!categoryMap[cat]) categoryMap[cat] = { durationMs: 0, count: 0 };
    categoryMap[cat].durationMs += effectiveDur;
    categoryMap[cat].count++;

    if (gap > IDLE_GAP_MS) {
      totalIdleMs += (gap - IDLE_GAP_MS);
    }
  }

  const totalDayMs = totalActiveMs + totalIdleMs;
  const productivityScore = totalDayMs > 0 ? Math.round((totalActiveMs / totalDayMs) * 100) : 100;

  const categoriesList: CategoryUsage[] = Object.entries(categoryMap)
    .map(([cat, val]) => ({
      category: cat,
      durationMs: val.durationMs,
      count: val.count,
      percentage: totalActiveMs > 0 ? Math.round((val.durationMs / totalActiveMs) * 100) : 0,
    }))
    .sort((a, b) => b.durationMs - a.durationMs);

  const formatMinHours = (ms: number) => {
    const min = Math.round(ms / 60000);
    const h = Math.floor(min / 60);
    const m = min % 60;
    if (h > 0) return `${h}h ${m}m`;
    return `${m}m`;
  };

  const getCategoryIcon = (cat: string) => {
    const c = cat.toLowerCase();
    if (c.includes("mensajer") || c.includes("whatsapp")) return <MessageSquare className="h-4 w-4 text-emerald-400" />;
    if (c.includes("telef") || c.includes("llamada") || c.includes("linkus")) return <Phone className="h-4 w-4 text-orange-400" />;
    if (c.includes("ticket") || c.includes("caso") || c.includes("odoo")) return <ShieldCheck className="h-4 w-4 text-violet-400" />;
    if (c.includes("correo") || c.includes("mail")) return <Mail className="h-4 w-4 text-blue-400" />;
    if (c.includes("física") || c.includes("bodega") || c.includes("taller") || c.includes("diagnóstico")) return <Wrench className="h-4 w-4 text-amber-400" />;
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
        className="bg-card border border-border/80 rounded-3xl shadow-2xl w-full max-w-2xl max-h-[90vh] flex flex-col overflow-hidden animate-in fade-in zoom-in-95 duration-150"
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
                {/* 1. Tarjetas KPI de la Jornada */}
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <div className="p-4 rounded-2xl bg-muted/30 border border-border/60 flex items-center gap-3">
                    <div className="h-10 w-10 rounded-xl bg-violet-500/15 text-violet-400 grid place-items-center shrink-0">
                      <TrendingUp className="h-5 w-5" />
                    </div>
                    <div>
                      <p className="text-[10px] font-extrabold uppercase text-muted-foreground">
                        Productividad
                      </p>
                      <p className="text-xl font-black text-violet-400">{productivityScore}%</p>
                    </div>
                  </div>

                  <div className="p-4 rounded-2xl bg-muted/30 border border-border/60 flex items-center gap-3">
                    <div className="h-10 w-10 rounded-xl bg-emerald-500/15 text-emerald-400 grid place-items-center shrink-0">
                      <Clock className="h-5 w-5" />
                    </div>
                    <div>
                      <p className="text-[10px] font-extrabold uppercase text-muted-foreground">
                        Tiempo Activo
                      </p>
                      <p className="text-xl font-black text-emerald-400">{formatMinHours(totalActiveMs)}</p>
                    </div>
                  </div>

                  <div className="p-4 rounded-2xl bg-muted/30 border border-border/60 flex items-center gap-3">
                    <div className="h-10 w-10 rounded-xl bg-amber-500/15 text-amber-400 grid place-items-center shrink-0">
                      <Clock className="h-5 w-5" />
                    </div>
                    <div>
                      <p className="text-[10px] font-extrabold uppercase text-muted-foreground">
                        Inactividad / Pausas
                      </p>
                      <p className="text-xl font-black text-amber-400">{formatMinHours(totalIdleMs)}</p>
                    </div>
                  </div>
                </div>

                {/* Barra de Proporción */}
                <div className="p-4 rounded-2xl bg-muted/20 border border-border/50 space-y-2">
                  <div className="flex justify-between text-xs font-bold">
                    <span className="text-emerald-400">Activo: {formatMinHours(totalActiveMs)} ({productivityScore}%)</span>
                    <span className="text-amber-400">Pausas: {formatMinHours(totalIdleMs)} ({100 - productivityScore}%)</span>
                  </div>
                  <div className="h-2.5 w-full rounded-full bg-slate-800 overflow-hidden flex">
                    <div className="bg-emerald-500 transition-all duration-500" style={{ width: `${productivityScore}%` }} />
                    <div className="bg-amber-500 transition-all duration-500" style={{ width: `${100 - productivityScore}%` }} />
                  </div>
                </div>

                {/* 2. Desglose por Categorías de Tiempo */}
                <div className="space-y-3">
                  <h3 className="text-xs font-black uppercase tracking-wider text-muted-foreground flex items-center gap-2">
                    <BarChart3 className="h-4 w-4 text-violet-400" />
                    Distribución de Tiempo por Categorías
                  </h3>

                  {categoriesList.length === 0 ? (
                    <div className="p-8 text-center rounded-2xl bg-muted/20 border border-border/50 text-xs text-muted-foreground">
                      No hay suficientes actividades registradas hoy todavía.
                    </div>
                  ) : (
                    <div className="space-y-2.5">
                      {categoriesList.map((cat) => (
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

                {/* Minutos estimados */}
                <div className="space-y-1.5">
                  <label className="text-xs font-bold text-foreground">Tiempo aproximado (minutos):</label>
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