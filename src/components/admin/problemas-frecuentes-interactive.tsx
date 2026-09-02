"use client";

import React, { useState } from "react";
import { ChevronDown, ChevronUp, ExternalLink, Bot, User, Tag, Sparkles, CheckCircle2, Clock } from "lucide-react";
import Link from "next/link";

export interface CasoDetalle {
  id: string;
  title: string;
  clienteNombre: string;
  clienteCuenta: string;
  clienteTelefono: string;
  marca?: string | null;
  modelo?: string | null;
  estado: string;
  createdAt: string;
  razonClasificacion: string;
  tipoOrigen: "ia" | "manual" | "tag" | "titulo" | "general";
  descripcion?: string | null;
}

export interface ProblemaData {
  key: string;
  label: string;
  total: number;
  resueltos: number;
  ultimoCasoId: string | number;
  casos: CasoDetalle[];
}

export function ProblemasFrecuentesInteractive({
  problemas,
  maxProblema,
}: {
  problemas: ProblemaData[];
  maxProblema: number;
}) {
  const [expandedKey, setExpandedKey] = useState<string | null>(null);

  const toggleExpand = (key: string) => {
    setExpandedKey(prev => (prev === key ? null : key));
  };

  const getBadgeOrigen = (tipo: CasoDetalle["tipoOrigen"]) => {
    switch (tipo) {
      case "ia":
        return (
          <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[9px] font-bold bg-purple-500/10 text-purple-400 border border-purple-500/20">
            <Sparkles className="h-2.5 w-2.5" /> IA
          </span>
        );
      case "manual":
        return (
          <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[9px] font-bold bg-sky-500/10 text-sky-400 border border-sky-500/20">
            <User className="h-2.5 w-2.5" /> Manual
          </span>
        );
      case "tag":
        return (
          <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[9px] font-bold bg-amber-500/10 text-amber-400 border border-amber-500/20">
            <Tag className="h-2.5 w-2.5" /> Etiqueta
          </span>
        );
      default:
        return (
          <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[9px] font-bold bg-muted text-muted-foreground">
            General
          </span>
        );
    }
  };

  return (
    <div className="rounded-2xl border border-border/60 bg-card overflow-hidden flex flex-col h-full">
      <div className="flex items-center justify-between px-5 py-4 border-b border-border/50 bg-card/50">
        <div>
          <h3 className="font-black text-sm">Problemas Frecuentes</h3>
          <p className="text-[10px] text-muted-foreground mt-0.5">
            Haga clic en cualquier categoría para desplegar sus casos y motivos de clasificación
          </p>
        </div>
        <span className="text-[10px] font-black px-2 py-0.5 rounded-full bg-violet-500/10 text-violet-500">
          {problemas.length} categorías
        </span>
      </div>

      <div className="p-5 space-y-3.5 flex-1">
        {problemas.length === 0 && (
          <p className="py-8 text-center text-xs text-muted-foreground">
            Sin clasificaciones aún.
          </p>
        )}

        {problemas.map((p, i) => {
          const isExpanded = expandedKey === p.key;
          const pct = maxProblema > 0 ? Math.round((p.total / maxProblema) * 100) : 0;
          const resPct = p.total > 0 ? Math.floor((p.resueltos / p.total) * 100) : 0;

          return (
            <div
              key={p.key}
              className={`rounded-xl border transition-all duration-200 overflow-hidden ${
                isExpanded
                  ? "border-violet-500/40 bg-violet-950/10 shadow-lg shadow-violet-500/5"
                  : "border-border/40 hover:border-border bg-card/40"
              }`}
            >
              {/* Header de la categoría clickeable */}
              <button
                type="button"
                onClick={() => toggleExpand(p.key)}
                className="w-full text-left p-3.5 flex flex-col gap-2 group transition-colors cursor-pointer"
              >
                <div className="flex items-center justify-between w-full">
                  <div className="flex items-center gap-2.5 min-w-0">
                    <span className="text-[10px] font-black text-muted-foreground/50 w-4 tabular-nums shrink-0">
                      {i + 1}
                    </span>
                    <span className="text-xs font-bold text-foreground group-hover:text-violet-400 transition-colors truncate">
                      {p.label}
                    </span>
                  </div>

                  <div className="flex items-center gap-3 shrink-0 ml-2">
                    <span
                      className="text-[10px] text-emerald-500 font-bold px-1.5 py-0.5 rounded bg-emerald-500/10"
                      title="Tasa de resolución"
                    >
                      {resPct}% resuelto
                    </span>
                    <span className="text-xs font-black tabular-nums text-violet-400 px-2 py-0.5 rounded-lg bg-violet-500/10">
                      {p.total} {p.total === 1 ? "caso" : "casos"}
                    </span>
                    <div className="text-muted-foreground/60 group-hover:text-foreground transition-colors p-1">
                      {isExpanded ? (
                        <ChevronUp className="h-4 w-4" />
                      ) : (
                        <ChevronDown className="h-4 w-4" />
                      )}
                    </div>
                  </div>
                </div>

                {/* Barra de progreso visual */}
                <div className="h-1.5 w-full bg-muted/40 rounded-full overflow-hidden">
                  <div
                    className="h-full bg-gradient-to-r from-violet-500 to-fuchsia-500 rounded-full transition-all duration-500"
                    style={{ width: `${Math.max(5, pct)}%` }}
                  />
                </div>
              </button>

              {/* Contenido desplegable con scroll interno */}
              {isExpanded && (
                <div className="border-t border-border/40 bg-background/60 p-3.5 space-y-2.5 animate-in fade-in slide-in-from-top-2 duration-200">
                  <div className="flex items-center justify-between px-1 pb-1">
                    <span className="text-[10px] font-black uppercase tracking-wider text-muted-foreground">
                      Listado de casos en {p.label} ({p.casos.length})
                    </span>
                    <span className="text-[10px] text-muted-foreground/70">
                      Deslice para ver todos
                    </span>
                  </div>

                  <div className="max-h-[320px] overflow-y-auto space-y-2 pr-1.5 scrollbar-thin scrollbar-thumb-violet-500/20 scrollbar-track-transparent">
                    {p.casos.length === 0 ? (
                      <p className="text-xs text-muted-foreground py-4 text-center">
                        No hay detalles disponibles para estos casos.
                      </p>
                    ) : (
                      p.casos.map((caso) => {
                        const isResuelto = caso.estado === "resuelto" || caso.estado === "cerrado";
                        return (
                          <div
                            key={caso.id}
                            className="p-3 rounded-xl border border-border/40 bg-card/80 hover:bg-card hover:border-violet-500/30 transition-all text-xs space-y-2"
                          >
                            <div className="flex items-start justify-between gap-2">
                              <div className="min-w-0 flex-1">
                                <p className="font-bold text-foreground text-xs leading-snug">
                                  {caso.title || "Caso sin título"}
                                </p>
                                <div className="flex items-center gap-2 mt-1 flex-wrap text-[11px] text-muted-foreground">
                                  <span className="font-semibold text-foreground/90">
                                    👤 {caso.clienteNombre || "Cliente no identificado"}
                                  </span>
                                  {caso.clienteCuenta && (
                                    <span className="text-muted-foreground/80">
                                      🏢 {caso.clienteCuenta}
                                    </span>
                                  )}
                                  {caso.clienteTelefono && (
                                    <span className="text-muted-foreground/70">
                                      📞 {caso.clienteTelefono}
                                    </span>
                                  )}
                                </div>
                              </div>

                              <div className="flex flex-col items-end gap-1 shrink-0">
                                <span
                                  className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[9px] font-bold ${
                                    isResuelto
                                      ? "bg-emerald-500/10 text-emerald-400 border border-emerald-500/20"
                                      : "bg-amber-500/10 text-amber-400 border border-amber-500/20"
                                  }`}
                                >
                                  {isResuelto ? (
                                    <CheckCircle2 className="h-2.5 w-2.5" />
                                  ) : (
                                    <Clock className="h-2.5 w-2.5" />
                                  )}
                                  {isResuelto ? "Resuelto" : "Abierto"}
                                </span>
                                <Link
                                  href={`/inbox?case=${caso.id}`}
                                  className="inline-flex items-center gap-1 text-[10px] font-bold text-violet-400 hover:text-violet-300 transition-colors mt-0.5"
                                  title="Ver chat del caso"
                                >
                                  Ver chat <ExternalLink className="h-2.5 w-2.5" />
                                </Link>
                              </div>
                            </div>

                            {/* Equipo mencionado si existe */}
                            {(caso.marca || caso.modelo) && (
                              <div className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-md bg-muted/30 text-[10px] text-muted-foreground">
                                <span className="font-bold text-foreground/80">Equipo:</span>
                                <span>
                                  {caso.marca} {caso.modelo || ""}
                                </span>
                              </div>
                            )}

                            {/* Razón de clasificación */}
                            <div className="p-2 rounded-lg bg-background/80 border border-border/30 flex items-start gap-2">
                              <div className="shrink-0 mt-0.5">
                                {getBadgeOrigen(caso.tipoOrigen)}
                              </div>
                              <div className="min-w-0 flex-1">
                                <p className="text-[10px] text-muted-foreground leading-relaxed">
                                  <span className="font-semibold text-foreground/80">Motivo: </span>
                                  {caso.razonClasificacion}
                                </p>
                              </div>
                            </div>
                          </div>
                        );
                      })
                    )}
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}