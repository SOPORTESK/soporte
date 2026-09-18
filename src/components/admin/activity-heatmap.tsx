"use client";

import React from "react";
import { Clock, Flame, Info } from "lucide-react";

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
  // Organizar eventos por hora (06:00 a 19:00) y por bloques continuos
  const hourBuckets: Record<number, { activeMs: number; idleMs: number; count: number; apps: Set<string> }> = {};

  HOURS.forEach((h) => {
    hourBuckets[h] = { activeMs: 0, idleMs: 0, count: 0, apps: new Set() };
  });

  const sorted = [...timeline]
    .filter((t) => Boolean(t.created_at))
    .sort((a, b) => new Date(a.created_at!).getTime() - new Date(b.created_at!).getTime());

  const IDLE_GAP_MS = 15 * 60 * 1000;

  for (let i = 0; i < sorted.length; i++) {
    const item = sorted[i];
    const currTime = new Date(item.created_at!).getTime();
    const nextTime = i < sorted.length - 1 ? new Date(sorted[i + 1].created_at!).getTime() : currTime + 60000;
    const gap = Math.max(0, nextTime - currTime);
    const d = new Date(item.created_at!);
    const h = d.getHours();

    if (item.category === "Inactividad" || item.category === "Pausa personal") {
      if (hourBuckets[h]) {
        hourBuckets[h].idleMs += Math.min(gap, 60 * 60 * 1000);
      }
    } else {
      const rawDur = Number(item.duration_ms || (item.metadata?.duration_seconds ? item.metadata.duration_seconds * 1000 : 0)) || 0;
      const isManual = (item.category || "").toLowerCase().includes("manual") || (item.category || "").toLowerCase().includes("taller") || (item.category || "").toLowerCase().includes("capacitaci") || (item.action || "").toLowerCase().startsWith("terminó:") || (item.action || "").toLowerCase().startsWith("termino:");

      if (rawDur > 0 && isManual) {
        const endMs = currTime;
        const startMs = Math.max(endMs - Math.min(rawDur, 12 * 3600 * 1000), 0);
        let cursor = startMs;
        while (cursor < endMs) {
          const dt = new Date(cursor);
          const ch = dt.getHours();
          const nextHour = new Date(cursor);
          nextHour.setMinutes(60, 0, 0);
          nextHour.setMilliseconds(0);
          const chunkEnd = Math.min(endMs, nextHour.getTime());
          const chunkDur = chunkEnd - cursor;
          if (hourBuckets[ch]) {
            hourBuckets[ch].activeMs = Math.min(60 * 60 * 1000, hourBuckets[ch].activeMs + chunkDur);
            hourBuckets[ch].count++;
            const meta = item.metadata || {};
            if (meta.task || item.action) hourBuckets[ch].apps.add(meta.task || item.action);
          }
          cursor = chunkEnd;
        }
      } else if (hourBuckets[h]) {
        const effectiveDuration = Math.min(gap, IDLE_GAP_MS);
        hourBuckets[h].activeMs = Math.min(60 * 60 * 1000, hourBuckets[h].activeMs + effectiveDuration);
        hourBuckets[h].count++;
        const meta = item.metadata || {};
        if (meta.app_name) hourBuckets[h].apps.add(meta.app_name);
        if (gap > IDLE_GAP_MS) {
          hourBuckets[h].idleMs += (gap - IDLE_GAP_MS);
        }
      }
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
          const idleMin = Math.round(b.idleMs / 60000);
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