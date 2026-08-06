"use client";

import * as React from "react";
import { Clock, ChevronDown } from "lucide-react";

export interface CasoResolucion {
  id: string | number;
  title: string;
  agente: string;
  cliente: string;
  created_at: string;
  closed_at: string;
  accepted_at: string;
  minutos: number;
}

interface Grupo {
  label: string;
  count: number;
  color: string;
  text: string;
  casos: CasoResolucion[];
}

function formatMin(m: number): string {
  if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60);
  const r = m % 60;
  return r > 0 ? `${h}h ${r}m` : `${h}h`;
}

function formatDate(d: string): string {
  return new Date(d).toLocaleString("es-CR", { dateStyle: "short", timeStyle: "short" });
}

export function ResolucionHumanaChart({ grupos, totalValidos, excluidos, sinDatos, totalCasos }: {
  grupos: Grupo[];
  totalValidos: number;
  excluidos: { count: number; casos: CasoResolucion[] };
  sinDatos: { count: number; casos: CasoResolucion[] };
  totalCasos: number;
}) {
  const [expanded, setExpanded] = React.useState<string | null>(null);

  function toggle(label: string) {
    setExpanded(prev => prev === label ? null : label);
  }

  return (
    <div className="lg:col-span-6 rounded-2xl border border-border bg-card p-6">
      <div className="flex items-center gap-2 mb-5">
        <div className="h-7 w-7 rounded-lg bg-emerald-500/10 text-emerald-500 grid place-items-center"><Clock className="h-3.5 w-3.5" /></div>
        <h3 className="font-black text-sm uppercase tracking-widest text-muted-foreground whitespace-nowrap">Resolución Equipo de Soporte</h3>
      </div>
      {totalValidos > 0 ? (
        <div className="space-y-3">
          {grupos.map(row => (
            <div key={row.label}>
              <button
                onClick={() => row.count > 0 && toggle(row.label)}
                className={`w-full space-y-1.5 ${row.count > 0 ? "cursor-pointer hover:opacity-80" : "cursor-default"}`}
              >
                <div className="flex justify-between items-center">
                  <span className={`text-xs font-black ${row.text} flex items-center gap-1`}>
                    {row.label}
                    {row.count > 0 && <ChevronDown className={`h-3 w-3 transition-transform ${expanded === row.label ? "rotate-180" : ""}`} />}
                  </span>
                  <div className="flex items-center gap-2">
                    <span className="text-[10px] text-muted-foreground">{totalValidos > 0 ? Math.round((row.count / totalValidos) * 100) : 0}%</span>
                    <span className={`text-xs font-black tabular-nums ${row.text}`}>{row.count}</span>
                  </div>
                </div>
                <div className="h-2 w-full bg-muted rounded-full overflow-hidden">
                  <div className={`h-full ${row.color} rounded-full transition-all`} style={{ width: `${totalValidos > 0 ? (row.count / totalValidos) * 100 : 0}%` }} />
                </div>
              </button>
              {expanded === row.label && row.count > 0 && (
                <div className="mt-2 space-y-1.5 max-h-48 overflow-y-auto pr-1">
                  {row.casos.map(c => (
                    <a
                      key={c.id}
                      href={`/inbox?c=${c.id}`}
                      className="block rounded-lg border border-border bg-muted/30 px-3 py-2 hover:bg-muted/60 transition-colors"
                    >
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-[11px] font-bold truncate">{c.title}</span>
                        <span className={`text-[10px] font-black tabular-nums shrink-0 ${row.text}`}>{formatMin(c.minutos)}</span>
                      </div>
                      <div className="flex items-center justify-between gap-2 mt-0.5">
                        <span className="text-[9px] text-muted-foreground truncate">{c.agente} · {c.cliente}</span>
                        <span className="text-[9px] text-muted-foreground shrink-0">{formatDate(c.created_at)}</span>
                      </div>
                    </a>
                  ))}
                </div>
              )}
            </div>
          ))}

          {excluidos.count > 0 && (
            <div className="pt-2 border-t border-border">
              <button
                onClick={() => toggle("Excluidos (+7 días)")}
                className="w-full space-y-1.5 cursor-pointer hover:opacity-80"
              >
                <div className="flex justify-between items-center">
                  <span className="text-xs font-black text-muted-foreground flex items-center gap-1">
                    Excluidos (+7 días)
                    <ChevronDown className={`h-3 w-3 transition-transform ${expanded === "Excluidos (+7 días)" ? "rotate-180" : ""}`} />
                  </span>
                  <div className="flex items-center gap-2">
                    <span className="text-[10px] text-muted-foreground">—</span>
                    <span className="text-xs font-black tabular-nums text-muted-foreground">{excluidos.count}</span>
                  </div>
                </div>
                <p className="text-[9px] text-muted-foreground/60">Casos que tardaron más de 7 días en cerrarse</p>
              </button>
              {expanded === "Excluidos (+7 días)" && (
                <div className="mt-2 space-y-1.5 max-h-48 overflow-y-auto pr-1">
                  {excluidos.casos.map(c => (
                    <a
                      key={c.id}
                      href={`/inbox?c=${c.id}`}
                      className="block rounded-lg border border-border bg-muted/30 px-3 py-2 hover:bg-muted/60 transition-colors"
                    >
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-[11px] font-bold truncate">{c.title}</span>
                        <span className="text-[10px] font-black tabular-nums shrink-0 text-muted-foreground">{formatMin(c.minutos)}</span>
                      </div>
                      <div className="flex items-center justify-between gap-2 mt-0.5">
                        <span className="text-[9px] text-muted-foreground truncate">{c.agente} · {c.cliente}</span>
                        <span className="text-[9px] text-muted-foreground shrink-0">{formatDate(c.created_at)}</span>
                      </div>
                    </a>
                  ))}
                </div>
              )}
            </div>
          )}

          {sinDatos.count > 0 && (
            <div className="pt-2 border-t border-border">
              <button
                onClick={() => toggle("Sin datos de cierre")}
                className="w-full space-y-1.5 cursor-pointer hover:opacity-80"
              >
                <div className="flex justify-between items-center">
                  <span className="text-xs font-black text-muted-foreground flex items-center gap-1">
                    Sin datos de cierre
                    <ChevronDown className={`h-3 w-3 transition-transform ${expanded === "Sin datos de cierre" ? "rotate-180" : ""}`} />
                  </span>
                  <div className="flex items-center gap-2">
                    <span className="text-[10px] text-muted-foreground">—</span>
                    <span className="text-xs font-black tabular-nums text-muted-foreground">{sinDatos.count}</span>
                  </div>
                </div>
                <p className="text-[9px] text-muted-foreground/60">Casos sin fecha de aceptación/cierre o con fechas inconsistentes</p>
              </button>
              {expanded === "Sin datos de cierre" && (
                <div className="mt-2 space-y-1.5 max-h-48 overflow-y-auto pr-1">
                  {sinDatos.casos.map(c => (
                    <a
                      key={c.id}
                      href={`/inbox?c=${c.id}`}
                      className="block rounded-lg border border-border bg-muted/30 px-3 py-2 hover:bg-muted/60 transition-colors"
                    >
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-[11px] font-bold truncate">{c.title}</span>
                        <span className="text-[10px] font-black tabular-nums shrink-0 text-muted-foreground">—</span>
                      </div>
                      <div className="flex items-center justify-between gap-2 mt-0.5">
                        <span className="text-[9px] text-muted-foreground truncate">{c.agente} · {c.cliente}</span>
                        <span className="text-[9px] text-muted-foreground shrink-0">{formatDate(c.created_at)}</span>
                      </div>
                    </a>
                  ))}
                </div>
              )}
            </div>
          )}

          <div className="pt-2 border-t border-border">
            <div className="flex justify-between items-center">
              <span className="text-[10px] font-black text-muted-foreground uppercase tracking-wider">Total</span>
              <span className="text-[10px] font-black tabular-nums text-muted-foreground">{totalCasos}</span>
            </div>
          </div>
        </div>
      ) : <p className="text-xs text-muted-foreground italic">Sin datos de resolución</p>}
    </div>
  );
}
