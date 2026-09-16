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
} from "lucide-react";
import { extractSmartAppName, getDefaultCategoryForApp } from "./activity-apps-ranking";

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

export function ActivityExecutiveCharts({
  timeline,
  selectedDate,
  onDateChange,
  onRefresh,
  refreshing = false,
  scheduleStart = "07:00",
  scheduleEnd = "18:00",
}: Props) {
  const [periodPreset, setPeriodPreset] = useState<"hoy" | "este_mes" | "este_ano">("hoy");

  // Manejo de presets rápidos (Hoy, Este mes, Este año)
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

  // ── 1. Procesar datos para Efectividad (Donut) y Tareas Demandantes ────────
  const { effectiveness, topTasks, hourlyTrend, totalCalculatedMs } = useMemo(() => {
    // Buckets de efectividad
    let productiveMs = 0;
    let lunchMs = 0;
    let bathroomMs = 0;
    let inactiveMs = 0;

    const taskMap: Record<string, { durationMs: number; count: number }> = {};
    const hourIntervals: Record<number, number> = {};

    // Inicializar intervalos de 06:00 a 19:30 (paso de 1 hora)
    for (let h = 6; h <= 19; h++) {
      hourIntervals[h] = 0;
    }

    const sorted = [...timeline]
      .filter((t) => Boolean(t.created_at))
      .sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime());

    const MAX_DISCRETE_GAP = 30 * 60 * 1000; // 30 min max

    for (let i = 0; i < sorted.length; i++) {
      const it = sorted[i];
      const act = (it.action || "").toLowerCase();
      const cat = (it.category || "").toLowerCase();
      const meta = (it.metadata || {}) as Record<string, any>;
      const timeMs = new Date(it.created_at).getTime();

      // Duración calculada
      let durMs = 0;
      if (it.duration_ms && it.duration_ms > 0) {
        durMs = Math.min(it.duration_ms, 3 * 3600 * 1000);
      } else if (meta.duration_seconds && meta.duration_seconds > 0) {
        durMs = Math.min(meta.duration_seconds * 1000, 3 * 3600 * 1000);
      } else {
        const nextTime = i < sorted.length - 1 ? new Date(sorted[i + 1].created_at).getTime() : timeMs + 60000;
        const gap = Math.max(0, nextTime - timeMs);
        durMs = Math.min(gap, MAX_DISCRETE_GAP);
      }

      // Desglose de efectividad
      if (
        act.includes("descanso") ||
        act.includes("almuerzo") ||
        act.includes("café") ||
        act.includes("cafe") ||
        cat.includes("descanso")
      ) {
        lunchMs += durMs;
      } else if (act.includes("baño") || act.includes("bano") || cat.includes("pausa personal")) {
        bathroomMs += durMs;
      } else if (cat === "inactividad" || act.includes("inactividad") || act.includes("pausa prolongada")) {
        inactiveMs += durMs;
      } else {
        productiveMs += durMs;
      }

      // Desglose de tareas
      const taskName = extractSmartAppName(it);
      if (
        !taskName.toLowerCase().includes(".scr") &&
        !taskName.toLowerCase().includes("mystify")
      ) {
        if (!taskMap[taskName]) {
          taskMap[taskName] = { durationMs: 0, count: 0 };
        }
        taskMap[taskName].durationMs += durMs;
        taskMap[taskName].count++;
      }

      // Intervalo horario para tendencia (6 AM a 7 PM)
      const d = new Date(it.created_at);
      const hour = d.getHours();
      if (hourIntervals[hour] !== undefined && cat !== "inactividad") {
        hourIntervals[hour] += durMs;
      }
    }

    const totalMs = productiveMs + lunchMs + bathroomMs + inactiveMs || 1;

    const effData = [
      {
        id: "productive",
        label: "Productivo",
        color: "#ffffff",
        barColor: "bg-white",
        ms: productiveMs,
        pct: Math.round((productiveMs / totalMs) * 100),
      },
      {
        id: "lunch",
        label: "Almuerzo",
        color: "#f97316", // Naranja vibrante corporativo
        barColor: "bg-orange-500",
        ms: lunchMs,
        pct: Math.round((lunchMs / totalMs) * 100),
      },
      {
        id: "bathroom",
        label: "Baño",
        color: "#22c55e", // Verde
        barColor: "bg-emerald-500",
        ms: bathroomMs,
        pct: Math.round((bathroomMs / totalMs) * 100),
      },
      {
        id: "inactive",
        label: "Inactivo",
        color: "#71717a", // Zinc/gris
        barColor: "bg-zinc-500",
        ms: inactiveMs,
        pct: Math.round((inactiveMs / totalMs) * 100),
      },
    ];

    // Ajuste de porcentaje si redondeo no da 100%
    const sumPct = effData.reduce((a, b) => a + b.pct, 0);
    if (sumPct !== 100 && effData[0].pct > 0) {
      effData[0].pct += 100 - sumPct;
    }

    // Top 5 tareas más demandantes
    const tasksArr = Object.entries(taskMap)
      .map(([name, data]) => ({
        name,
        durationMs: data.durationMs,
        hours: Number((data.durationMs / 3600000).toFixed(2)),
        timeFormatted: formatHoursMinutes(data.durationMs),
      }))
      .sort((a, b) => b.durationMs - a.durationMs)
      .slice(0, 5);

    // Tendencia horaria en horas fraccionales (ej: 0.8h)
    const trendPoints = Object.entries(hourIntervals)
      .map(([hStr, ms]) => {
        const hour = parseInt(hStr, 10);
        const hoursFraction = Math.min(1.0, Number((ms / 3600000).toFixed(2)));
        const label = `${hour.toString().padStart(2, "0")}:00`;
        return { hour, hoursFraction, label };
      })
      .sort((a, b) => a.hour - b.hour);

    // Agregar punto final 19:30
    trendPoints.push({
      hour: 19.5,
      hoursFraction: trendPoints[trendPoints.length - 1]?.hoursFraction || 0,
      label: "19:30",
    });

    return {
      effectiveness: effData,
      topTasks: tasksArr,
      hourlyTrend: trendPoints,
      totalCalculatedMs: totalMs,
    };
  }, [timeline]);

  // ── 2. Cálculos geométricos SVG para el Donut de Efectividad ────────────────
  const donutSegments = useMemo(() => {
    const size = 160;
    const strokeWidth = 26;
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

    const maxHours = 1.0; // Eje Y va de 0 a 1.0

    const points = hourlyTrend.map((pt, i) => {
      const x = paddingLeft + (i / (hourlyTrend.length - 1)) * plotWidth;
      const y = paddingTop + plotHeight - (pt.hoursFraction / maxHours) * plotHeight;
      return { x, y, pt };
    });

    // Construir línea suave Bézier
    let linePath = `M ${points[0].x} ${points[0].y}`;
    for (let i = 0; i < points.length - 1; i++) {
      const p0 = points[i];
      const p1 = points[i + 1];
      const cx = (p0.x + p1.x) / 2;
      linePath += ` C ${cx} ${p0.y}, ${cx} ${p1.y}, ${p1.x} ${p1.y}`;
    }

    // Área cerrada para gradiente
    const lastX = points[points.length - 1].x;
    const firstX = points[0].x;
    const baselineY = paddingTop + plotHeight;
    const areaPath = `${linePath} L ${lastX} ${baselineY} L ${firstX} ${baselineY} Z`;

    return { linePath, areaPath, points, width, height, baselineY, plotWidth, paddingLeft, paddingTop, plotHeight };
  }, [hourlyTrend]);

  // Máximo en horas para la escala del gráfico horizontal de tareas
  const maxTaskHours = useMemo(() => {
    if (topTasks.length === 0) return 3;
    const top = topTasks[0].hours;
    return Math.max(3, Math.ceil(top));
  }, [topTasks]);

  return (
    <div className="space-y-5 rounded-2xl bg-card border border-border/80 p-5 shadow-sm">
      {/* ── BARRA DE FILTROS SUPERIOR (Estilo Imagen 2) ── */}
      <div className="flex flex-wrap items-center justify-between gap-3 pb-3 border-b border-border/60">
        <div className="flex items-center gap-2">
          <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-border bg-background/80 shadow-xs text-xs font-semibold">
            <Calendar className="h-3.5 w-3.5 text-orange-500" />
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

          <button
            onClick={() => onRefresh()}
            disabled={refreshing}
            className="px-4 py-1.5 rounded-xl bg-gradient-to-r from-orange-500 to-amber-500 hover:from-orange-600 hover:to-amber-600 text-white text-xs font-bold transition-all shadow-sm shadow-orange-500/20 active:scale-95 disabled:opacity-60 cursor-pointer"
          >
            {refreshing ? "Generando..." : "Generar"}
          </button>
        </div>

        {/* Botones de Presets: Hoy / Este mes / Este año */}
        <div className="flex items-center gap-1 bg-muted/40 p-1 rounded-xl border border-border/40 text-xs font-semibold">
          {[
            { id: "hoy", label: "Hoy" },
            { id: "este_mes", label: "Este mes" },
            { id: "este_ano", label: "Este año" },
          ].map((btn) => (
            <button
              key={btn.id}
              onClick={() => handleSelectPreset(btn.id as any)}
              className={`px-3 py-1 rounded-lg transition-all cursor-pointer ${
                periodPreset === btn.id
                  ? "bg-orange-500 text-white font-bold shadow-xs"
                  : "text-muted-foreground hover:text-foreground hover:bg-muted/50"
              }`}
            >
              {btn.label}
            </button>
          ))}
        </div>
      </div>

      {/* ── FILA SUPERIOR: DONUT DE EFECTIVIDAD + TOP TAREAS DEMANDANTES ── */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        {/* PANEL 1: DONUT CHART DE EFECTIVIDAD */}
        <div className="p-5 rounded-2xl bg-muted/10 border border-border/60 flex flex-col justify-between">
          <div className="flex items-center justify-between mb-4">
            <h4 className="text-xs font-black uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
              <Sparkles className="h-3.5 w-3.5 text-orange-500" />
              Efectividad & Desglose de Jornada
            </h4>
            <span className="text-[11px] font-mono text-muted-foreground">
              Total: {formatHoursMinutes(totalCalculatedMs)}
            </span>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 items-center">
            {/* Donut SVG con Centro */}
            <div className="relative flex items-center justify-center">
              <svg width="160" height="160" className="transform -rotate-90 drop-shadow-sm">
                {donutSegments.map((seg) => (
                  <circle
                    key={seg.id}
                    cx="80"
                    cy="80"
                    r={seg.radius}
                    fill="transparent"
                    stroke={seg.color}
                    strokeWidth="24"
                    strokeDasharray={seg.strokeDasharray}
                    strokeDashoffset={seg.strokeDashoffset}
                    className="transition-all duration-700 ease-out hover:opacity-90"
                  />
                ))}
              </svg>

              {/* Texto Central en el Donut */}
              <div className="absolute inset-0 flex flex-col items-center justify-center text-center pointer-events-none">
                <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
                  Efectividad
                </span>
                <span className="text-2xl font-black text-foreground font-mono">
                  {effectiveness[0]?.pct || 0}%
                </span>
              </div>
            </div>

            {/* Leyenda y Tabla (Estilo Imagen 2) */}
            <div className="space-y-2.5">
              <div className="grid grid-cols-3 text-[10px] font-black uppercase tracking-wider text-muted-foreground/70 pb-1 border-b border-border/40">
                <span>Efectividad</span>
                <span className="text-center">Porcentaje</span>
                <span className="text-right">Horas</span>
              </div>

              {effectiveness.map((item) => (
                <div key={item.id} className="grid grid-cols-3 items-center text-xs py-0.5 font-medium">
                  <div className="flex items-center gap-2 truncate">
                    <span
                      className="w-2.5 h-2.5 rounded-sm shrink-0 shadow-xs"
                      style={{ backgroundColor: item.color }}
                    />
                    <span className="truncate text-foreground/90 font-semibold">{item.label}</span>
                  </div>
                  <span className="text-center font-mono font-bold text-foreground">
                    {item.pct}%
                  </span>
                  <span className="text-right font-mono text-muted-foreground font-semibold">
                    {formatHoursMinutes(item.ms)}
                  </span>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* PANEL 2: TOP TAREAS MÁS DEMANDANTES (BARRAS HORIZONTALES CON ESCALA) */}
        <div className="p-5 rounded-2xl bg-muted/10 border border-border/60 flex flex-col justify-between">
          <div className="flex items-center justify-between mb-3">
            <h4 className="text-xs font-black uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
              <BarChart3 className="h-3.5 w-3.5 text-orange-500" />
              Top Tareas más Demandantes
            </h4>
            <span className="text-[11px] font-mono font-bold text-muted-foreground uppercase">Horas</span>
          </div>

          <div className="space-y-3 my-auto">
            {topTasks.map((task) => {
              const barWidthPct = Math.min(100, Math.max(8, (task.hours / maxTaskHours) * 100));
              return (
                <div key={task.name} className="space-y-1">
                  <div className="flex items-center justify-between text-xs">
                    <span className="font-semibold text-foreground/90 truncate max-w-[200px]" title={task.name}>
                      {task.name}
                    </span>
                    <span className="font-mono text-xs font-bold text-orange-400 shrink-0">
                      {task.timeFormatted}
                    </span>
                  </div>
                  <div className="h-5 w-full bg-muted/40 rounded-md overflow-hidden relative border border-border/30">
                    <div
                      className="h-full bg-gradient-to-r from-orange-600 via-orange-500 to-amber-400 rounded-md transition-all duration-700 shadow-sm"
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

          {/* Eje X numérico en Horas (0, 1, 2, 3...) */}
          <div className="pt-2 border-t border-border/40 flex justify-between text-[10px] font-mono text-muted-foreground/80 px-1">
            {Array.from({ length: maxTaskHours + 1 }).map((_, i) => (
              <span key={i}>{i}</span>
            ))}
          </div>
        </div>
      </div>

      {/* ── FILA INFERIOR: CURVA DE TENDENCIA (HORAS POR INTERVALO 6:00 AM A 7:30 PM) ── */}
      <div className="p-5 rounded-2xl bg-muted/10 border border-border/60 space-y-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Flame className="h-4 w-4 text-orange-500" />
            <h4 className="text-sm font-bold text-foreground">Tendencia</h4>
          </div>
          <span className="text-[11px] font-mono text-muted-foreground">
            Horas por Intervalo (6am a 7:30pm)
          </span>
        </div>

        {/* SVG Responsive de la Curva de Tendencia */}
        <div className="relative w-full overflow-x-auto">
          <svg viewBox="0 0 680 180" className="w-full h-44 drop-shadow-xs">
            <defs>
              <linearGradient id="orangeTrendArea" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#f97316" stopOpacity="0.55" />
                <stop offset="50%" stopColor="#f97316" stopOpacity="0.2" />
                <stop offset="100%" stopColor="#f97316" stopOpacity="0.0" />
              </linearGradient>
            </defs>

            {/* Líneas horizontales de guía (0.0, 0.2, 0.4, 0.6, 0.8, 1.0) */}
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
                    className="text-border/40"
                    strokeWidth="1"
                    strokeDasharray={val === 0 ? "none" : "3 3"}
                  />
                  <text
                    x="32"
                    y={y + 3}
                    textAnchor="end"
                    className="text-[9px] fill-muted-foreground/70 font-mono"
                  >
                    {val.toFixed(1)}
                  </text>
                </g>
              );
            })}

            {/* Título de eje vertical */}
            <text
              x="-85"
              y="12"
              transform="rotate(-90)"
              textAnchor="middle"
              className="text-[9px] fill-muted-foreground/80 font-mono font-semibold"
            >
              Cantidad de Horas
            </text>

            {/* Relleno con Gradiente (Área) */}
            {trendSvgPath.areaPath && (
              <path d={trendSvgPath.areaPath} fill="url(#orangeTrendArea)" />
            )}

            {/* Línea Naranja Continua */}
            {trendSvgPath.linePath && (
              <path
                d={trendSvgPath.linePath}
                fill="none"
                stroke="#f97316"
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
                  r="4.5"
                  className="fill-orange-400 stroke-background stroke-2 transition-transform hover:scale-150"
                />
                {/* Tooltip SVG en hover */}
                <title>{`${pt.pt.label}: ${pt.pt.hoursFraction}h trabajadas`}</title>
              </g>
            ))}

            {/* Etiquetas de eje horizontal (06:00, 07:00, ..., 19:30) */}
            {trendSvgPath.points?.map((pt, idx) => {
              return (
                <text
                  key={idx}
                  x={pt.x}
                  y="172"
                  textAnchor="middle"
                  className="text-[9px] fill-muted-foreground/80 font-mono"
                >
                  {pt.pt.label}
                </text>
              );
            })}
          </svg>
        </div>
      </div>
    </div>
  );
}
