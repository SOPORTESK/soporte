"use client";

import React, { useMemo, useState } from "react";
import {
  Calendar,
  Clock,
  CheckCircle2,
  AlertCircle,
  TrendingUp,
  BarChart3,
  Flame,
  Layers,
  Sparkles,
  Search,
  MessageSquare,
  Code2,
  Wrench,
  Laptop,
  PauseCircle,
  ShieldCheck,
  Zap,
  FolderOpen,
  Mail,
  Phone,
  Package,
  GraduationCap,
} from "lucide-react";
import { extractSmartAppName } from "./activity-apps-ranking";

interface TimelineEntry {
  id?: number;
  agent_email: string;
  agent_name: string;
  action: string;
  category: string;
  case_id?: string | null;
  metadata?: Record<string, any> | null;
  duration_ms?: number | null;
  created_at: string;
}

interface Props {
  timeline: TimelineEntry[];
  selectedDate: string;
  onDateChange: (date: string, endDate?: string) => void;
  onRefresh: () => void;
  refreshing?: boolean;
  scheduleStart?: string;
  scheduleEnd?: string;
}

function formatHoursMinutes(ms: number): string {
  const totalMin = Math.round(ms / 60000);
  const h = Math.floor(totalMin / 60);
  const m = totalMin % 60;
  return `${h.toString().padStart(2, "0")}:${m.toString().padStart(2, "0")}h`;
}

// Colores oficiales por categoría del sistema Sekunet
const CATEGORY_HEX: Record<string, string> = {
  "Mensajería": "#10b981",              // emerald
  "Atención chat": "#10b981",           // emerald
  "Atención de tickets": "#3b82f6",     // blue
  "Atención de Tickets": "#3b82f6",     // blue
  "Atención telefónica": "#f97316",     // orange
  "Atención por llamada": "#f97316",    // orange
  "Trámites de garantías": "#a855f7",   // purple
  "Gestión de Garantías": "#f59e0b",    // amber
  "Investigación y desarrollo": "#06b6d4", // cyan
  "Optimización de procesos": "#8b5cf6", // violet
  "Control administrativo": "#ec4899",  // pink
  "Gestión de correos": "#eab308",      // yellow
  "Gestión de Correos": "#3b82f6",      // blue
  "Gestión de casos": "#10b981",        // emerald
  "Escalado": "#ef4444",                // red
  "Asistente IA": "#06b6d4",            // cyan
  "Inactividad": "#64748b",             // slate
  "Pausa personal": "#38bdf8",          // sky
  "Tiempo de descanso": "#f59e0b",      // amber
  "Navegación": "#0284c7",              // sky
  "Actividad general": "#64748b",       // slate
  "Soporte técnico": "#06b6d4",         // cyan
  "Labores manuales": "#f59e0b",        // amber
  "Atención presencial": "#0284c7",     // sky
  "Inventario": "#6366f1",              // indigo
  "Mantenimiento": "#06b6d4",           // cyan
  "Soporte comercial": "#3b82f6",       // blue
  "Capacitación": "#8b5cf6",            // violet
  "Reunión interna": "#6366f1",         // indigo
  "Justificación": "#ec4899",           // pink
  "Otros": "#64748b",                   // slate
};

function getCategoryColor(cat: string): string {
  return CATEGORY_HEX[cat] || "#64748b";
}

function getTaskIcon(name: string) {
  const lower = name.toLowerCase();
  if (lower.includes("chat") || lower.includes("whatsapp") || lower.includes("caso") || lower.includes("mensaje")) {
    return MessageSquare;
  }
  if (lower.includes("ticket") || lower.includes("odoo")) {
    return FolderOpen;
  }
  if (lower.includes("antigravity") || lower.includes("code") || lower.includes("gemini") || lower.includes("terminal")) {
    return Code2;
  }
  if (lower.includes("taller") || lower.includes("ivms") || lower.includes("cctv") || lower.includes("mikrotik") || lower.includes("diagnóstico")) {
    return Wrench;
  }
  if (lower.includes("correo") || lower.includes("mail") || lower.includes("outlook")) {
    return Mail;
  }
  if (lower.includes("teléfono") || lower.includes("llamada") || lower.includes("linkus")) {
    return Phone;
  }
  return Laptop;
}

export function ActivityExecutiveCharts({
  timeline,
  selectedDate,
  onDateChange,
  onRefresh,
  refreshing = false,
  scheduleStart = "06:00",
  scheduleEnd = "19:30",
}: Props) {
  const [periodPreset, setPeriodPreset] = useState<"hoy" | "este_mes" | "este_ano">("hoy");

  // Manejo de presets rápidos reactivos (sin botones manuales)
  const handleSelectPreset = (preset: "hoy" | "este_mes" | "este_ano") => {
    setPeriodPreset(preset);
    const now = new Date();
    const todayStr = now.toISOString().split("T")[0];

    if (preset === "hoy") {
      onDateChange(todayStr);
    } else if (preset === "este_mes") {
      const year = now.getFullYear();
      const month = String(now.getMonth() + 1).padStart(2, "0");
      const firstDay = `${year}-${month}-01`;
      onDateChange(firstDay, todayStr);
    } else if (preset === "este_ano") {
      const year = now.getFullYear();
      const firstDay = `${year}-01-01`;
      onDateChange(firstDay, todayStr);
    }
  };

  // ── 1. Procesar datos usando las CATEGORÍAS REALES DEL SISTEMA ──────────────
  const { effectiveness, topTasks, hourlyTrend, totalCalculatedMs, globalProductivePct } = useMemo(() => {
    const sorted = [...timeline]
      .filter((t) => Boolean(t.created_at))
      .sort((a, b) => new Date(a.created_at!).getTime() - new Date(b.created_at!).getTime());

    const IDLE_GAP_MS = 15 * 60 * 1000;

    const catMap: Record<string, { ms: number; count: number }> = {};
    const taskMap: Record<string, { durationMs: number; count: number }> = {};
    const hourIntervals: Record<number, number> = {};

    for (let h = 6; h <= 19; h++) {
      hourIntervals[h] = 0;
    }

    let totalActiveMs = 0;
    let totalIdleMs = 0;

    for (let i = 0; i < sorted.length; i++) {
      const it = sorted[i];
      const currTime = new Date(it.created_at!).getTime();
      const nextTime = i < sorted.length - 1 ? new Date(sorted[i + 1].created_at!).getTime() : currTime + 60000;
      const gap = Math.max(0, nextTime - currTime);

      const rawCat = it.category ? it.category.trim() : "Otros";
      const act = (it.action || "").toLowerCase();
      const isIdle =
        rawCat.toLowerCase() === "inactividad" ||
        rawCat.toLowerCase() === "pausa personal" ||
        act.includes("pausa prolongada") ||
        act.includes("sin actividad detectada");

      const dur = isIdle ? Math.min(gap > 0 ? gap : 15 * 60 * 1000, 45 * 60 * 1000) : Math.min(gap > 0 ? gap : 60000, IDLE_GAP_MS);

      if (isIdle) {
        totalIdleMs += dur;
      } else {
        totalActiveMs += dur;
      }

      // Acumular por la categoría REAL existente en la base de datos
      if (!catMap[rawCat]) {
        catMap[rawCat] = { ms: 0, count: 0 };
      }
      catMap[rawCat].ms += dur;
      catMap[rawCat].count++;

      // Acumular tareas individuales reales (excluyendo salvapantallas)
      const smartName = extractSmartAppName(it);
      const nameLower = smartName.toLowerCase();
      if (!nameLower.includes(".scr") && !nameLower.includes("mystify") && !nameLower.includes("lockapp") && !isIdle) {
        if (!taskMap[smartName]) {
          taskMap[smartName] = { durationMs: 0, count: 0 };
        }
        taskMap[smartName].durationMs += dur;
        taskMap[smartName].count++;
      }

      // Distribución horaria (Costa Rica)
      if (!isIdle) {
        const d = new Date(it.created_at!);
        const crHourStr = d.toLocaleString("en-US", { timeZone: "America/Costa_Rica", hour: "numeric", hour12: false });
        const crHour = parseInt(crHourStr, 10) % 24;
        if (hourIntervals[crHour] !== undefined) {
          hourIntervals[crHour] = Math.min(60 * 60 * 1000, hourIntervals[crHour] + dur);
        }
      }
    }

    const grandTotalMs = totalActiveMs + totalIdleMs || 1;

    // Tomar las categorías reales activas ordenadas por tiempo
    const sortedCats = Object.entries(catMap)
      .map(([cat, data]) => ({
        id: cat,
        label: cat,
        color: getCategoryColor(cat),
        ms: data.ms,
        pct: Math.round((data.ms / grandTotalMs) * 100),
      }))
      .sort((a, b) => b.ms - a.ms);

    // Ajuste de porcentaje si la suma da 99% o 101% por redondeo
    const sumPct = sortedCats.reduce((acc, c) => acc + c.pct, 0);
    if (sumPct > 0 && sumPct !== 100 && sortedCats[0]) {
      sortedCats[0].pct += (100 - sumPct);
    }

    const globalProdPct = Math.round((totalActiveMs / grandTotalMs) * 100);

    // Top 5 tareas demandantes
    const tasksArr = Object.entries(taskMap)
      .map(([name, data]) => ({
        name,
        durationMs: data.durationMs,
        hours: Number((data.durationMs / 3600000).toFixed(2)),
        timeFormatted: formatHoursMinutes(data.durationMs),
      }))
      .sort((a, b) => b.durationMs - a.durationMs)
      .slice(0, 5);

    // Curva de tendencia
    const trendPoints = Object.entries(hourIntervals)
      .map(([hStr, ms]) => {
        const hour = parseInt(hStr, 10);
        const hoursFraction = Math.min(1.0, Number((ms / 3600000).toFixed(2)));
        const label = `${hour.toString().padStart(2, "0")}:00`;
        return { hour, hoursFraction, label };
      })
      .sort((a, b) => a.hour - b.hour);

    trendPoints.push({
      hour: 19.5,
      hoursFraction: trendPoints[trendPoints.length - 1]?.hoursFraction || 0,
      label: "19:30",
    });

    return {
      effectiveness: sortedCats,
      topTasks: tasksArr,
      hourlyTrend: trendPoints,
      totalCalculatedMs: grandTotalMs,
      globalProductivePct: globalProdPct,
    };
  }, [timeline]);

  // ── 2. Cálculos geométricos SVG para el Donut ──────────────────────────────
  const donutSegments = useMemo(() => {
    const size = 160;
    const strokeWidth = 20;
    const radius = (size - strokeWidth) / 2;
    const circumference = 2 * Math.PI * radius;

    let accumulatedPct = 0;
    return effectiveness.map((item) => {
      const strokeDasharray = `${(item.pct / 100) * circumference} ${circumference}`;
      const strokeDashoffset = -((accumulatedPct / 100) * circumference);
      accumulatedPct += item.pct;
      return {
        ...item,
        strokeDasharray,
        strokeDashoffset,
        radius,
      };
    });
  }, [effectiveness]);

  // ── 3. Cálculos geométricos para el Gráfico de Tendencia ────────────────────
  const trendSvgPath = useMemo(() => {
    if (hourlyTrend.length === 0) return { linePath: "", areaPath: "" };

    const width = 680;
    const height = 180;
    const paddingLeft = 40;
    const paddingRight = 20;
    const paddingTop = 20;
    const paddingBottom = 30;

    const plotWidth = width - paddingLeft - paddingRight;
    const plotHeight = height - paddingTop - paddingBottom;
    const maxHours = 1.0;

    const points = hourlyTrend.map((pt, i) => {
      const x = paddingLeft + (i / (hourlyTrend.length - 1)) * plotWidth;
      const y = paddingTop + plotHeight - (pt.hoursFraction / maxHours) * plotHeight;
      return { x, y, pt };
    });

    let linePath = `M ${points[0].x} ${points[0].y}`;
    for (let i = 0; i < points.length - 1; i++) {
      const p0 = points[i];
      const p1 = points[i + 1];
      const cx = (p0.x + p1.x) / 2;
      linePath += ` C ${cx} ${p0.y}, ${cx} ${p1.y}, ${p1.x} ${p1.y}`;
    }

    const lastX = points[points.length - 1].x;
    const firstX = points[0].x;
    const baselineY = paddingTop + plotHeight;
    const areaPath = `${linePath} L ${lastX} ${baselineY} L ${firstX} ${baselineY} Z`;

    return { linePath, areaPath, points, width, height, baselineY, plotWidth, paddingLeft, paddingTop, plotHeight };
  }, [hourlyTrend]);

  const maxTaskHours = useMemo(() => {
    if (topTasks.length === 0) return 2;
    const top = topTasks[0].hours;
    return Math.max(2, Math.ceil(top));
  }, [topTasks]);

  return (
    <div className="space-y-6 rounded-2xl bg-card border border-border/70 p-5 lg:p-7 shadow-xl relative overflow-hidden">
      {/* ── BARRA DE FILTROS SUPERIOR (100% Automática) ── */}
      <div className="flex flex-wrap items-center justify-between gap-3 pb-4 border-b border-border/50">
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2 px-3 py-1.5 rounded-xl border border-border bg-background shadow-inner text-xs font-semibold hover:border-brand-500/40 transition-colors">
            <Calendar className="h-3.5 w-3.5 text-brand-500" />
            <input
              type="date"
              value={selectedDate}
              onChange={(e) => {
                setPeriodPreset("hoy");
                onDateChange(e.target.value);
              }}
              className="bg-transparent text-foreground focus:outline-none cursor-pointer font-mono text-xs"
            />
          </div>

          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[10px] font-bold bg-emerald-500/10 text-emerald-400 border border-emerald-500/25">
            <span className={`h-1.5 w-1.5 rounded-full bg-emerald-400 ${refreshing ? "animate-ping" : "animate-pulse"}`} />
            {refreshing ? "Sincronizando..." : "Auto-actualizado"}
          </span>
        </div>

        {/* Presets Rápidos */}
        <div className="flex items-center gap-1 bg-muted/40 p-1 rounded-xl border border-border/50 text-xs font-semibold">
          {[
            { id: "hoy", label: "Hoy" },
            { id: "este_mes", label: "Este mes" },
            { id: "este_ano", label: "Este año" },
          ].map((btn) => (
            <button
              key={btn.id}
              onClick={() => handleSelectPreset(btn.id as any)}
              className={`px-3.5 py-1 rounded-lg transition-all cursor-pointer text-xs ${
                periodPreset === btn.id
                  ? "bg-brand-600 text-white font-bold shadow-md shadow-brand-600/25"
                  : "text-muted-foreground hover:text-foreground hover:bg-muted/50"
              }`}
            >
              {btn.label}
            </button>
          ))}
        </div>
      </div>

      {/* ── FILA SUPERIOR: DONUT DE EFECTIVIDAD REAL + TOP TAREAS DEMANDANTES ── */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* PANEL 1: DONUT CHART DE CATEGORÍAS REALES SIN TEXTO CORTADO */}
        <div className="p-5 rounded-2xl bg-muted/15 border border-border/60 flex flex-col justify-between shadow-xs">
          <div className="flex items-center justify-between mb-4">
            <h4 className="text-xs font-black uppercase tracking-wider text-muted-foreground flex items-center gap-2">
              <Sparkles className="h-3.5 w-3.5 text-brand-400" />
              Desglose Real por Categoría
            </h4>
            <span className="text-[11px] font-mono font-bold text-foreground/80 bg-background/80 px-2.5 py-1 rounded-lg border border-border/50">
              Total: {formatHoursMinutes(totalCalculatedMs)}
            </span>
          </div>

          <div className="flex flex-col sm:flex-row items-center gap-6">
            {/* Donut SVG con Anillo Luminoso */}
            <div className="relative flex items-center justify-center shrink-0">
              <svg width="150" height="150" className="transform -rotate-90 drop-shadow-md">
                {donutSegments.map((seg) => (
                  <circle
                    key={seg.id}
                    cx="75"
                    cy="75"
                    r={seg.radius}
                    fill="transparent"
                    stroke={seg.color}
                    strokeWidth="18"
                    strokeDasharray={seg.strokeDasharray}
                    strokeDashoffset={seg.strokeDashoffset}
                    className="transition-all duration-700 ease-out hover:opacity-85"
                  />
                ))}
              </svg>

              {/* Texto Central */}
              <div className="absolute inset-0 flex flex-col items-center justify-center text-center pointer-events-none">
                <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
                  Productivo
                </span>
                <span className="text-2xl font-black text-brand-400 font-mono tracking-tight">
                  {globalProductivePct}%
                </span>
              </div>
            </div>

            {/* Tabla de Categorías Reales - Con Ancho Completo sin cortar texto */}
            <div className="flex-1 w-full space-y-1.5 max-h-[220px] overflow-y-auto pr-1">
              <div className="flex items-center justify-between text-[10px] font-black uppercase tracking-wider text-muted-foreground/70 pb-1 border-b border-border/40 px-1">
                <span>Categoría</span>
                <div className="flex items-center gap-4">
                  <span className="w-8 text-center">%</span>
                  <span className="w-14 text-right">Horas</span>
                </div>
              </div>

              {effectiveness.map((item) => (
                <div
                  key={item.id}
                  className="flex items-center justify-between py-1 px-1.5 rounded-lg hover:bg-muted/30 transition-colors text-xs"
                >
                  <div className="flex items-center gap-2 min-w-0 pr-2">
                    <span
                      className="w-2.5 h-2.5 rounded-full shrink-0 shadow-xs"
                      style={{ backgroundColor: item.color }}
                    />
                    <span className="font-semibold text-foreground text-[11px] leading-tight break-words">
                      {item.label}
                    </span>
                  </div>

                  <div className="flex items-center gap-4 shrink-0 font-mono text-[11px]">
                    <span className="w-8 text-center font-bold text-foreground">
                      {item.pct}%
                    </span>
                    <span className="w-14 text-right font-semibold text-muted-foreground">
                      {formatHoursMinutes(item.ms)}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* PANEL 2: TOP TAREAS DEMANDANTES */}
        <div className="p-5 rounded-2xl bg-muted/15 border border-border/60 flex flex-col justify-between shadow-xs">
          <div className="flex items-center justify-between mb-3">
            <h4 className="text-xs font-black uppercase tracking-wider text-muted-foreground flex items-center gap-2">
              <BarChart3 className="h-3.5 w-3.5 text-brand-400" />
              Top Tareas más Demandantes
            </h4>
            <span className="text-[11px] font-mono font-bold text-muted-foreground uppercase">Horas Reales</span>
          </div>

          <div className="space-y-3 my-auto">
            {topTasks.map((task) => {
              const Icon = getTaskIcon(task.name);
              const barWidthPct = Math.min(100, Math.max(6, (task.hours / maxTaskHours) * 100));

              return (
                <div key={task.name} className="space-y-1 group">
                  <div className="flex items-center justify-between text-xs">
                    <div className="flex items-center gap-2 min-w-0 pr-2">
                      <div className="h-5 w-5 rounded-md bg-muted/60 border border-border/40 grid place-items-center shrink-0 text-brand-400">
                        <Icon className="h-3 w-3" />
                      </div>
                      <span className="font-semibold text-foreground text-[11px] truncate" title={task.name}>
                        {task.name}
                      </span>
                    </div>
                    <span className="font-mono text-xs font-bold text-brand-400 shrink-0">
                      {task.timeFormatted}
                    </span>
                  </div>

                  {/* Barra de Progreso */}
                  <div className="h-3 w-full bg-muted/30 rounded-full overflow-hidden relative border border-border/30 p-0.5">
                    <div
                      className="h-full bg-gradient-to-r from-brand-600 via-indigo-500 to-sky-400 rounded-full transition-all duration-700 shadow-xs"
                      style={{ width: `${barWidthPct}%` }}
                    />
                  </div>
                </div>
              );
            })}

            {topTasks.length === 0 && (
              <p className="text-center py-6 text-xs text-muted-foreground italic">
                Sin registros de tareas en este período
              </p>
            )}
          </div>

          {/* Eje X numérico en Horas reales (0, 1, 2, 3...) */}
          <div className="pt-2 border-t border-border/40 flex justify-between text-[10px] font-mono text-muted-foreground/80 px-1">
            {Array.from({ length: maxTaskHours + 1 }).map((_, i) => (
              <span key={i}>{i}h</span>
            ))}
          </div>
        </div>
      </div>

      {/* ── FILA INFERIOR: CURVA DE TENDENCIA HORARIA (06:00 AM A 19:30 PM) ── */}
      <div className="p-5 rounded-2xl bg-muted/15 border border-border/60 space-y-3 shadow-xs">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Flame className="h-4 w-4 text-brand-400" />
            <h4 className="text-xs font-black uppercase tracking-wider text-muted-foreground">
              Intensidad y Ritmo Laboral en el Día
            </h4>
          </div>
          <span className="text-[11px] font-mono text-muted-foreground">
            Franjas Horarias (06:00 AM – 07:30 PM)
          </span>
        </div>

        {/* SVG Responsive de la Curva de Tendencia */}
        <div className="relative w-full overflow-x-auto">
          <svg viewBox="0 0 680 180" className="w-full h-44 drop-shadow-sm">
            <defs>
              <linearGradient id="brandTrendArea" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#8b5cf6" stopOpacity="0.4" />
                <stop offset="60%" stopColor="#3b82f6" stopOpacity="0.12" />
                <stop offset="100%" stopColor="#3b82f6" stopOpacity="0.0" />
              </linearGradient>
            </defs>

            {/* Líneas horizontales de guía */}
            {[0.0, 0.2, 0.4, 0.6, 0.8, 1.0].map((val) => {
              const y = 20 + 130 - val * 130;
              return (
                <g key={val}>
                  <line
                    x1="40"
                    y1={y}
                    x2="660"
                    y2={y}
                    stroke="currentColor"
                    className="text-border/30"
                    strokeWidth="1"
                    strokeDasharray={val === 0 ? "none" : "3 3"}
                  />
                  <text
                    x="32"
                    y={y + 3}
                    textAnchor="end"
                    className="text-[9px] fill-muted-foreground/70 font-mono"
                  >
                    {val.toFixed(1)}h
                  </text>
                </g>
              );
            })}

            {/* Relleno con Gradiente (Área) */}
            {trendSvgPath.areaPath && (
              <path d={trendSvgPath.areaPath} fill="url(#brandTrendArea)" />
            )}

            {/* Línea Continua */}
            {trendSvgPath.linePath && (
              <path
                d={trendSvgPath.linePath}
                fill="none"
                stroke="#8b5cf6"
                strokeWidth="2.5"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            )}

            {/* Puntos Circulares Interactivos sobre la Curva */}
            {trendSvgPath.points?.map((pt, idx) => (
              <g key={idx} className="group cursor-pointer">
                <circle
                  cx={pt.x}
                  cy={pt.y}
                  r="4"
                  className="fill-brand-400 stroke-background stroke-2 transition-transform group-hover:scale-150"
                />
                <title>{`${pt.pt.label}: ${pt.pt.hoursFraction}h efectivas`}</title>
              </g>
            ))}

            {/* Etiquetas de eje horizontal */}
            {trendSvgPath.points?.map((pt, idx) => (
              <text
                key={idx}
                x={pt.x}
                y="172"
                textAnchor="middle"
                className="text-[9px] fill-muted-foreground/80 font-mono"
              >
                {pt.pt.label}
              </text>
            ))}
          </svg>
        </div>
      </div>
    </div>
  );
}
