"use client";

import React, { useMemo } from "react";
import { Clock, Flame, Info } from "lucide-react";
import { computeUnifiedActivityMetrics } from "@/lib/activity-engine";

interface TimelineItem {
  id?: number;
  action: string;
  category: string;
  created_at: string;
  duration_ms?: number | null;
  metadata?: Record<string, any> | null;
}

interface Props {
  timeline: TimelineItem[];
  date: string;
}

const HOURS = [6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19];

function ActivityHeatmapComponent({ timeline, date }: Props) {
  const unifiedMetrics = useMemo(() => {
    return computeUnifiedActivityMetrics(timeline as any[]);
  }, [timeline]);

  // Organizar eventos por hora (06:00 a 19:00) y por bloques continuos
  const hourBuckets: Record<number, { activeMs: number; idleMs: number; count: number; apps: Set<string> }> = {};

  HOURS.forEach((h) => {
    const activeMs = unifiedMetrics.hourlyTrend[h] || 0;
    hourBuckets[h] = { activeMs, idleMs: 0, count: 0, apps: new Set() };
  });

  const sorted = [...timeline]
    .filter((t) => Boolean(t.created_at))
    .sort((a, b) => new Date(a.created_at!).getTime() - new Date(b.created_at!).getTime());

  for (let i = 0; i < sorted.length; i++) {
    const item = sorted[i];
    const d = new Date(item.created_at!);
    const h = d.getHours();

    if (hourBuckets[h]) {
      hourBuckets[h].count++;
      const meta = item.metadata || {};
      const app = meta.app_name || meta.task || item.action || "";
      if (app) hourBuckets[h].apps.add(app);
    }
  }

  return (
    <div className="p-4 sm:p-5 rounded-2xl bg-card border border-border/70 shadow-sm space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Flame className="h-4 w-4 text-orange-500" />
          <h3 className="font-bold text-sm text-foreground">Mapa de Intensidad Laboral (6:00 AM - 7:30 PM)</h3>
        </div>
        <div className="flex items-center gap-3 text-[11px] text-muted-foreground font-medium">
          <span className="flex items-center gap-1.5">
            <span className="h-2.5 w-2.5 rounded-full bg-emerald-500" /> Alta intensidad
          </span>
          <span className="flex items-center gap-1.5">
            <span className="h-2.5 w-2.5 rounded-full bg-amber-500" /> Moderada / Otra app
          </span>
          <span className="flex items-center gap-1.5">
            <span className="h-2.5 w-2.5 rounded-full bg-muted border border-border" /> Sin actividad
          </span>
        </div>
      </div>

      {/* Grid horizontal de horas */}
      <div className="grid grid-cols-4 sm:grid-cols-7 lg:grid-cols-14 gap-1.5 sm:gap-2">
        {HOURS.map((h) => {
          const b = hourBuckets[h];
          const activeMin = Math.round(b.activeMs / 60000);
          const idleMin = b.count > 0 || activeMin > 0 ? Math.max(0, 60 - activeMin) : 0;
          const totalMin = activeMin + idleMin;

          let blockBg = "bg-muted/30 border-border/40 text-muted-foreground/50";
          let intensityText = "Sin registro";

          if (activeMin >= 35) {
            blockBg = "bg-emerald-500/20 border-emerald-500/40 text-emerald-400 font-bold";
            intensityText = `${activeMin}m activo (${b.count} eventos)`;
          } else if (activeMin >= 10) {
            blockBg = "bg-amber-500/15 border-amber-500/35 text-amber-400 font-semibold";
            intensityText = `${activeMin}m activo / ${idleMin}m inactivo`;
          } else if (idleMin > 10) {
            blockBg = "bg-rose-500/10 border-rose-500/25 text-rose-400";
            intensityText = `${idleMin}m inactividad`;
          }

          const labelHour = h < 12 ? `${h} AM` : h === 12 ? "12 PM" : `${h - 12} PM`;

          return (
            <div
              key={h}
              title={`${labelHour}: ${intensityText}\nApps: ${Array.from(b.apps).join(", ") || "N/A"}`}
              className={`p-2.5 rounded-xl border flex flex-col items-center justify-between text-center transition-all hover:scale-105 hover:z-10 hover:shadow-md cursor-help ${blockBg}`}
            >
              <span className="text-[10px] font-black uppercase tracking-wider">{labelHour}</span>
              <div className="my-1 text-sm font-black">
                {activeMin > 0 ? `${activeMin}m` : "-"}
              </div>
              <div className="h-1.5 w-full rounded-full bg-background/50 overflow-hidden">
                <div
                  className="h-full bg-current rounded-full"
                  style={{ width: `${Math.min(100, Math.round((activeMin / 60) * 100))}%` }}
                />
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

export const ActivityHeatmap = React.memo(ActivityHeatmapComponent);