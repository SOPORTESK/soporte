"use client";

import React from "react";
import {
  Monitor,
  Phone,
  MessageSquare,
  Mail,
  FileText,
  Code,
  Globe,
  Youtube,
  ShieldCheck,
  TrendingUp,
} from "lucide-react";

interface TimelineItem {
  created_at?: string;
  action: string;
  category: string;
  duration_ms?: number | null;
  metadata?: Record<string, any> | null;
}

interface Props {
  timeline: TimelineItem[];
}

function getAppIcon(appName: string) {
  const name = appName.toLowerCase();
  if (name.includes("whatsapp")) return <MessageSquare className="h-4 w-4 text-emerald-400" />;
  if (name.includes("linkus") || name.includes("phone") || name.includes("llamada"))
    return <Phone className="h-4 w-4 text-orange-400" />;
  if (name.includes("outlook") || name.includes("mail") || name.includes("correo"))
    return <Mail className="h-4 w-4 text-blue-400" />;
  if (name.includes("excel") || name.includes("word") || name.includes("office"))
    return <FileText className="h-4 w-4 text-indigo-400" />;
  if (name.includes("code") || name.includes("terminal") || name.includes("powershell"))
    return <Code className="h-4 w-4 text-cyan-400" />;
  if (name.includes("youtube") || name.includes("spotify") || name.includes("netflix"))
    return <Youtube className="h-4 w-4 text-rose-400" />;
  if (name.includes("odoo") || name.includes("garant") || name.includes("seka"))
    return <ShieldCheck className="h-4 w-4 text-violet-400" />;
  return <Globe className="h-4 w-4 text-muted-foreground" />;
}

function getProductivityType(appName: string): { label: string; color: string } {
  const name = appName.toLowerCase();
  if (name.includes("youtube") || name.includes("spotify") || name.includes("facebook") || name.includes("instagram") || name.includes("tiktok") || name.includes("juegos") || name.includes("steam")) {
    return { label: "Distracción", color: "bg-rose-500/15 text-rose-400 border-rose-500/30" };
  }
  if (name.includes("whatsapp") || name.includes("linkus") || name.includes("odoo") || name.includes("seka") || name.includes("sekunet") || name.includes("outlook") || name.includes("excel") || name.includes("word") || name.includes("garant")) {
    return { label: "Productiva", color: "bg-emerald-500/15 text-emerald-400 border-emerald-500/30" };
  }
  return { label: "Neutra", color: "bg-amber-500/15 text-amber-400 border-amber-500/30" };
}

function formatDuration(ms: number): string {
  const totalSeconds = Math.round(ms / 1000);
  if (totalSeconds < 60) return `${totalSeconds}s`;
  const minutes = Math.floor(totalSeconds / 60);
  const hours = Math.floor(minutes / 60);
  const remMinutes = minutes % 60;
  if (hours > 0) return `${hours}h ${remMinutes}m`;
  return `${minutes}m`;
}

export function ActivityAppsRanking({ timeline }: Props) {
  // Consolidar tiempo por app usando intervalos cronológicos reales (calibrados con reloj)
  const appMap: Record<string, { durationMs: number; count: number }> = {};
  let totalActiveTime = 0;

  if (timeline && timeline.length > 0) {
    const sorted = [...timeline]
      .filter((t) => Boolean(t.created_at))
      .sort((a, b) => new Date(a.created_at!).getTime() - new Date(b.created_at!).getTime());

    const IDLE_GAP_MS = 5 * 60 * 1000; // 5 minutos máximo por bloque

    for (let i = 0; i < sorted.length; i++) {
      const curr = sorted[i];
      if (curr.category === "Inactividad") continue;

      const currTime = new Date(curr.created_at!).getTime();
      const nextTime = i < sorted.length - 1 ? new Date(sorted[i + 1].created_at!).getTime() : currTime + 60000;
      const gap = Math.max(0, nextTime - currTime);
      const effectiveDuration = Math.min(gap, IDLE_GAP_MS);

      const meta = (curr.metadata || {}) as Record<string, any>;
      const appName = meta.app_name || meta.label || (curr.category === "Navegación" ? (meta.page || "Seka Chat") : curr.category) || "Plataforma Sekunet";

      if (!appMap[appName]) {
        appMap[appName] = { durationMs: 0, count: 0 };
      }
      appMap[appName].durationMs += effectiveDuration;
      appMap[appName].count++;
      totalActiveTime += effectiveDuration;
    }
  }

  const sortedApps = Object.entries(appMap)
    .sort((a, b) => b[1].durationMs - a[1].durationMs)
    .slice(0, 10);

  if (sortedApps.length === 0) {
    return (
      <div className="p-6 rounded-2xl bg-card border border-border/70 text-center text-muted-foreground text-xs">
        No hay registros de aplicaciones en este rango de fecha.
      </div>
    );
  }

  return (
    <div className="p-5 rounded-2xl bg-card border border-border/70 shadow-sm space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Monitor className="h-4 w-4 text-violet-500" />
          <h3 className="font-bold text-sm text-foreground">Top Aplicaciones y Software Utilizado</h3>
        </div>
        <span className="text-xs text-muted-foreground font-medium">
          Total activo: {formatDuration(totalActiveTime)}
        </span>
      </div>

      <div className="space-y-2.5">
        {sortedApps.map(([appName, stats], index) => {
          const percentage = totalActiveTime > 0 ? Math.round((stats.durationMs / totalActiveTime) * 100) : 0;
          const prod = getProductivityType(appName);

          return (
            <div
              key={appName}
              className="p-3 rounded-xl bg-muted/20 border border-border/40 hover:bg-muted/40 transition-colors"
            >
              <div className="flex items-center justify-between gap-3 text-xs mb-1.5">
                <div className="flex items-center gap-2 min-w-0">
                  <span className="text-[10px] font-black text-muted-foreground/60 w-4">
                    #{index + 1}
                  </span>
                  {getAppIcon(appName)}
                  <span className="font-bold text-foreground truncate" title={appName}>
                    {appName}
                  </span>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full border ${prod.color}`}>
                    {prod.label}
                  </span>
                  <span className="font-mono font-bold text-foreground">
                    {formatDuration(stats.durationMs)}
                  </span>
                  <span className="text-muted-foreground font-medium w-9 text-right">
                    {percentage}%
                  </span>
                </div>
              </div>

              {/* Progress bar */}
              <div className="h-1.5 w-full rounded-full bg-muted/60 overflow-hidden">
                <div
                  className={`h-full rounded-full transition-all ${
                    prod.label === "Distracción"
                      ? "bg-rose-500"
                      : prod.label === "Productiva"
                      ? "bg-emerald-500"
                      : "bg-amber-500"
                  }`}
                  style={{ width: `${percentage}%` }}
                />
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}