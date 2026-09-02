"use client";

import React from "react";
import {
  Users,
  Circle,
  Monitor,
  Clock,
  TrendingUp,
  AlertCircle,
  Phone,
  MessageSquare,
  Sparkles,
  Laptop,
} from "lucide-react";
import { Avatar } from "@/components/ui/avatar";

export interface LiveAgent {
  email: string;
  name: string;
  role: string;
  avatar_url?: string;
  status: "active" | "away" | "idle" | "offline";
  currentApp: string;
  secondsAgo: number;
  lastSeen: string | null;
  activeMinutes: number;
  idleMinutes: number;
  productivityScore: number;
  todayEventsCount: number;
  hasDesktopApp: boolean;
}

interface Props {
  agents: LiveAgent[];
  selectedAgent?: string;
  onSelectAgent: (email: string) => void;
  loading?: boolean;
}

function formatMinutes(min: number): string {
  if (min < 60) return `${min}m`;
  const h = Math.floor(min / 60);
  const m = min % 60;
  return `${h}h ${m}m`;
}

function formatRelativeTime(seconds: number): string {
  if (seconds < 60) return `hace ${seconds}s`;
  const min = Math.floor(seconds / 60);
  if (min < 60) return `hace ${min}m`;
  const h = Math.floor(min / 60);
  return `hace ${h}h`;
}

export function ActivityLivePulse({
  agents,
  selectedAgent,
  onSelectAgent,
  loading = false,
}: Props) {
  const activeCount = agents.filter((a) => a.status === "active").length;
  const awayCount = agents.filter((a) => a.status === "away").length;
  const offlineCount = agents.filter((a) => a.status === "offline" || a.status === "idle").length;
  const avgProductivity =
    agents.length > 0
      ? Math.round(agents.reduce((acc, a) => acc + a.productivityScore, 0) / agents.length)
      : 100;

  return (
    <div className="space-y-4">
      {/* Resumen Global del Equipo */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <div className="p-3.5 rounded-2xl bg-card border border-border/70 shadow-sm flex items-center justify-between">
          <div>
            <p className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">En Línea</p>
            <p className="text-xl font-black text-emerald-500 mt-0.5">{activeCount}</p>
          </div>
          <div className="h-9 w-9 rounded-xl bg-emerald-500/10 text-emerald-500 grid place-items-center">
            <Circle className="h-4 w-4 fill-emerald-500 animate-pulse" />
          </div>
        </div>

        <div className="p-3.5 rounded-2xl bg-card border border-border/70 shadow-sm flex items-center justify-between">
          <div>
            <p className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">En otra app</p>
            <p className="text-xl font-black text-amber-500 mt-0.5">{awayCount}</p>
          </div>
          <div className="h-9 w-9 rounded-xl bg-amber-500/10 text-amber-500 grid place-items-center">
            <Clock className="h-4 w-4" />
          </div>
        </div>

        <div className="p-3.5 rounded-2xl bg-card border border-border/70 shadow-sm flex items-center justify-between">
          <div>
            <p className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">Inactivos</p>
            <p className="text-xl font-black text-zinc-400 mt-0.5">{offlineCount}</p>
          </div>
          <div className="h-9 w-9 rounded-xl bg-zinc-500/10 text-zinc-400 grid place-items-center">
            <AlertCircle className="h-4 w-4" />
          </div>
        </div>

        <div className="p-3.5 rounded-2xl bg-card border border-border/70 shadow-sm flex items-center justify-between">
          <div>
            <p className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">Productividad Prom.</p>
            <p className="text-xl font-black text-violet-500 mt-0.5">{avgProductivity}%</p>
          </div>
          <div className="h-9 w-9 rounded-xl bg-violet-500/10 text-violet-500 grid place-items-center">
            <TrendingUp className="h-4 w-4" />
          </div>
        </div>
      </div>

      {/* Grid de Agentes */}
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
        {agents.map((ag) => {
          const isSelected = selectedAgent?.toLowerCase() === ag.email.toLowerCase();
          const isOnline = ag.status === "active";
          const isAway = ag.status === "away";

          let statusBadgeColor = "bg-zinc-500/10 text-zinc-400 border-zinc-500/20";
          let statusText = "Desconectado";
          if (isOnline) {
            statusBadgeColor = "bg-emerald-500/15 text-emerald-500 border-emerald-500/30";
            statusText = "Activo en vivo";
          } else if (isAway) {
            statusBadgeColor = "bg-amber-500/15 text-amber-500 border-amber-500/30";
            statusText = `Ausente (${formatRelativeTime(ag.secondsAgo)})`;
          }

          return (
            <div
              key={ag.email}
              onClick={() => onSelectAgent(ag.email)}
              className={`p-4 rounded-2xl border transition-all cursor-pointer relative overflow-hidden group ${
                isSelected
                  ? "border-violet-500 bg-violet-500/5 shadow-md ring-1 ring-violet-500/30"
                  : "border-border/70 bg-card hover:border-violet-500/40 hover:bg-muted/30"
              }`}
            >
              <div className="flex items-start justify-between gap-3">
                <div className="flex items-center gap-3 min-w-0">
                  <div className="relative">
                    <Avatar
                      src={ag.avatar_url}
                      name={ag.name}
                      className="h-10 w-10 ring-2 ring-border/50 text-sm font-bold"
                    />
                    <span
                      className={`absolute bottom-0 right-0 h-3 w-3 rounded-full border-2 border-card ${
                        isOnline
                          ? "bg-emerald-500 ring-2 ring-emerald-500/30 animate-pulse"
                          : isAway
                          ? "bg-amber-500"
                          : "bg-zinc-400"
                      }`}
                    />
                  </div>
                  <div className="min-w-0">
                    <div className="flex items-center gap-1.5">
                      <p className="font-bold text-sm truncate text-foreground group-hover:text-violet-400 transition-colors">
                        {ag.name}
                      </p>
                      {ag.hasDesktopApp && (
                        <span title="App de Escritorio Instalada y Conectada">
                          <Laptop className="h-3.5 w-3.5 text-blue-400 shrink-0" />
                        </span>
                      )}
                    </div>
                    <p className="text-xs text-muted-foreground truncate">{ag.email}</p>
                  </div>
                </div>

                <span
                  className={`text-[10px] font-bold px-2 py-0.5 rounded-full border shrink-0 ${statusBadgeColor}`}
                >
                  {statusText}
                </span>
              </div>

              {/* Ventana / App en uso */}
              <div className="mt-3.5 p-2 rounded-xl bg-muted/30 border border-border/50 flex items-center gap-2">
                <Monitor className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                <p className="text-xs font-medium text-foreground/90 truncate" title={ag.currentApp}>
                  {ag.currentApp}
                </p>
              </div>

              {/* Métricas de hoy */}
              <div className="mt-3 pt-3 border-t border-border/50 grid grid-cols-3 gap-2 text-center">
                <div>
                  <p className="text-[10px] font-bold uppercase text-muted-foreground">Activo hoy</p>
                  <p className="text-xs font-black text-emerald-500 mt-0.5">{formatMinutes(ag.activeMinutes)}</p>
                </div>
                <div>
                  <p className="text-[10px] font-bold uppercase text-muted-foreground">Inactivo</p>
                  <p className="text-xs font-black text-amber-500 mt-0.5">{formatMinutes(ag.idleMinutes)}</p>
                </div>
                <div>
                  <p className="text-[10px] font-bold uppercase text-muted-foreground">Score</p>
                  <p className="text-xs font-black text-violet-500 mt-0.5">{ag.productivityScore}%</p>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}