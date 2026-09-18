"use client";

import React, { useState, useMemo } from "react";
import Link from "next/link";
import {
  MessageSquare, Search, Filter, Calendar, ExternalLink,
  Star, Clock, X, ChevronDown, CheckCircle2, AlertCircle
} from "lucide-react";
import { clienteInfo } from "@/lib/utils";

export interface AgentCaseItem {
  id: string | number;
  estado: string;
  calificacion?: number | null;
  created_at: string;
  updated_at?: string | null;
  closed_at?: string | null;
  title?: string | null;
  canal?: string | null;
  cat?: string | null;
  cliente?: any;
  customer_phone?: string | null;
}

interface AgentCasesHistoryProps {
  cases: AgentCaseItem[];
}

const ESTADO_STYLES: Record<string, { label: string; bg: string; text: string; border: string }> = {
  resuelto:      { label: "Resuelto",      bg: "bg-emerald-500/10", text: "text-emerald-500", border: "border-emerald-500/25" },
  cerrado:       { label: "Cerrado",       bg: "bg-zinc-500/10",    text: "text-zinc-400",    border: "border-zinc-500/25" },
  abierto:       { label: "Abierto",       bg: "bg-brand-500/10",   text: "text-brand-500",   border: "border-brand-500/25" },
  asignado:      { label: "Asignado",      bg: "bg-sky-500/10",     text: "text-sky-500",     border: "border-sky-500/25" },
  pendiente:     { label: "Pendiente",     bg: "bg-amber-500/10",   text: "text-amber-500",   border: "border-amber-500/25" },
  ia_atendiendo: { label: "IA Atendiendo", bg: "bg-violet-500/10",  text: "text-violet-500",  border: "border-violet-500/25" },
  escalado:      { label: "Escalado",      bg: "bg-rose-500/10",    text: "text-rose-500",    border: "border-rose-500/25" },
};

export function AgentCasesHistory({ cases = [] }: AgentCasesHistoryProps) {
  const [searchTerm, setSearchTerm] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [channelFilter, setChannelFilter] = useState("all");
  const [dateFilter, setDateFilter] = useState<"all" | "today" | "7d" | "30d" | "custom">("all");
  const [customDate, setCustomDate] = useState("");

  // Canales presentes en los casos
  const availableChannels = useMemo(() => {
    const set = new Set<string>();
    cases.forEach((c) => {
      if (c.canal) set.add(c.canal.toLowerCase());
    });
    return Array.from(set);
  }, [cases]);

  // Filtrado de casos
  const filteredCases = useMemo(() => {
    const now = new Date();
    const todayStr = now.toISOString().slice(0, 10);

    return cases.filter((c) => {
      // 1. Búsqueda por texto (título, id, cliente, teléfono, categoría)
      if (searchTerm.trim()) {
        const query = searchTerm.toLowerCase().trim();
        const ci = clienteInfo(c.cliente);
        const titleMatch = (c.title || "").toLowerCase().includes(query);
        const idMatch = String(c.id).includes(query);
        const clientNameMatch = ci.nombre.toLowerCase().includes(query);
        const clientPhoneMatch = (ci.telefono || c.customer_phone || "").includes(query);
        const catMatch = (c.cat || "").toLowerCase().includes(query);

        if (!titleMatch && !idMatch && !clientNameMatch && !clientPhoneMatch && !catMatch) {
          return false;
        }
      }

      // 2. Filtro por Estado
      if (statusFilter !== "all") {
        if (statusFilter === "resuelto_cerrado") {
          if (!["resuelto", "cerrado"].includes(c.estado)) return false;
        } else if (statusFilter === "activos") {
          if (!["abierto", "asignado", "pendiente"].includes(c.estado)) return false;
        } else if (c.estado !== statusFilter) {
          return false;
        }
      }

      // 3. Filtro por Canal
      if (channelFilter !== "all") {
        if ((c.canal || "").toLowerCase() !== channelFilter.toLowerCase()) {
          return false;
        }
      }

      // 4. Filtro por Fecha
      if (dateFilter !== "all") {
        const caseDate = new Date(c.created_at);
        if (dateFilter === "today") {
          const caseDateStr = caseDate.toISOString().slice(0, 10);
          if (caseDateStr !== todayStr) return false;
        } else if (dateFilter === "7d") {
          const sevenDaysAgo = new Date();
          sevenDaysAgo.setDate(now.getDate() - 7);
          if (caseDate < sevenDaysAgo) return false;
        } else if (dateFilter === "30d") {
          const thirtyDaysAgo = new Date();
          thirtyDaysAgo.setDate(now.getDate() - 30);
          if (caseDate < thirtyDaysAgo) return false;
        } else if (dateFilter === "custom" && customDate) {
          const caseDateStr = caseDate.toISOString().slice(0, 10);
          if (caseDateStr !== customDate) return false;
        }
      }

      return true;
    });
  }, [cases, searchTerm, statusFilter, channelFilter, dateFilter, customDate]);

  const hasActiveFilters =
    Boolean(searchTerm.trim()) ||
    statusFilter !== "all" ||
    channelFilter !== "all" ||
    dateFilter !== "all" ||
    Boolean(customDate);

  const clearFilters = () => {
    setSearchTerm("");
    setStatusFilter("all");
    setChannelFilter("all");
    setDateFilter("all");
    setCustomDate("");
  };

  const formatDateTime = (dateStr?: string | null): { date: string; time: string } => {
    if (!dateStr) return { date: "—", time: "—" };
    try {
      const d = new Date(dateStr);
      return {
        date: d.toLocaleDateString("es-CR", { day: "2-digit", month: "short", year: "numeric" }),
        time: d.toLocaleTimeString("es-CR", { hour: "2-digit", minute: "2-digit" }),
      };
    } catch {
      return { date: "—", time: "—" };
    }
  };

  return (
    <section className="rounded-2xl border border-border bg-card overflow-hidden shadow-sm">
      {/* ── HEADER CON CONTADORES ── */}
      <div className="px-6 py-4 border-b border-border bg-muted/15 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="h-8 w-8 rounded-lg bg-brand-500/10 border border-brand-500/20 text-brand-500 grid place-items-center">
            <MessageSquare className="h-4 w-4" />
          </div>
          <div>
            <h2 className="font-black text-sm uppercase tracking-wider text-foreground">
              Historial de Casos Atendidos
            </h2>
            <p className="text-xs text-muted-foreground">
              Haz clic en cualquier caso para abrirlo directamente en la bandeja de atención.
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <span className="text-xs font-bold px-2.5 py-1 rounded-full bg-brand-500/10 text-brand-500 border border-brand-500/20">
            {filteredCases.length} {filteredCases.length === 1 ? "caso" : "casos"}
            {hasActiveFilters && ` (de ${cases.length})`}
          </span>
          {hasActiveFilters && (
            <button
              onClick={clearFilters}
              className="text-xs text-muted-foreground hover:text-foreground flex items-center gap-1 px-2 py-1 rounded-md hover:bg-muted/80 transition-colors"
              title="Limpiar todos los filtros"
            >
              <X className="h-3.5 w-3.5" /> Limpiar
            </button>
          )}
        </div>
      </div>

      {/* ── BARRA DE BÚSQUEDA Y FILTROS ── */}
      <div className="p-4 border-b border-border bg-card/60 space-y-3">
        <div className="flex flex-col md:flex-row items-stretch md:items-center gap-3">
          {/* Input de Búsqueda */}
          <div className="relative flex-1">
            <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <input
              type="text"
              placeholder="Buscar por caso #ID, título, cliente, teléfono o categoría..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full pl-9 pr-8 py-2 bg-muted/30 border border-border rounded-xl text-xs font-medium text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-brand-500/40 focus:border-brand-500/40 transition-all"
            />
            {searchTerm && (
              <button
                onClick={() => setSearchTerm("")}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground p-0.5"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            )}
          </div>

          {/* Filtro de Estado */}
          <div className="flex items-center gap-2">
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="px-3 py-2 bg-muted/30 border border-border rounded-xl text-xs font-semibold text-foreground focus:outline-none focus:ring-2 focus:ring-brand-500/40"
            >
              <option value="all">Todos los estados</option>
              <option value="resuelto_cerrado">Resueltos / Cerrados</option>
              <option value="activos">Activos (Abierto/Asignado)</option>
              <option value="resuelto">Resuelto</option>
              <option value="cerrado">Cerrado</option>
              <option value="abierto">Abierto</option>
              <option value="asignado">Asignado</option>
              <option value="pendiente">Pendiente</option>
              <option value="ia_atendiendo">IA Atendiendo</option>
              <option value="escalado">Escalado</option>
            </select>

            {/* Filtro de Canal */}
            {availableChannels.length > 0 && (
              <select
                value={channelFilter}
                onChange={(e) => setChannelFilter(e.target.value)}
                className="px-3 py-2 bg-muted/30 border border-border rounded-xl text-xs font-semibold text-foreground focus:outline-none focus:ring-2 focus:ring-brand-500/40 capitalize"
              >
                <option value="all">Todos los canales</option>
                {availableChannels.map((ch) => (
                  <option key={ch} value={ch} className="capitalize">
                    {ch}
                  </option>
                ))}
              </select>
            )}
          </div>
        </div>

        {/* Filtro Rápido por Fechas */}
        <div className="flex items-center gap-1.5 flex-wrap text-xs pt-1">
          <span className="text-muted-foreground text-[11px] font-semibold flex items-center gap-1 mr-1">
            <Calendar className="h-3.5 w-3.5 text-muted-foreground" /> Fecha:
          </span>
          {[
            { id: "all", label: "Todas las fechas" },
            { id: "today", label: "Hoy" },
            { id: "7d", label: "Últimos 7 días" },
            { id: "30d", label: "Últimos 30 días" },
            { id: "custom", label: "Fecha exacta" },
          ].map((item) => (
            <button
              key={item.id}
              type="button"
              onClick={() => setDateFilter(item.id as any)}
              className={`px-2.5 py-1 rounded-lg text-[11px] font-bold transition-all ${
                dateFilter === item.id
                  ? "bg-brand-500 text-white shadow-sm"
                  : "bg-muted/40 text-muted-foreground hover:bg-muted hover:text-foreground"
              }`}
            >
              {item.label}
            </button>
          ))}

          {dateFilter === "custom" && (
            <input
              type="date"
              value={customDate}
              onChange={(e) => setCustomDate(e.target.value)}
              className="px-2.5 py-1 rounded-lg bg-muted/50 border border-border text-xs text-foreground font-mono focus:outline-none focus:ring-2 focus:ring-brand-500/40 ml-1"
            />
          )}
        </div>
      </div>

      {/* ── TABLA CON SCROLL CONTROLADO (NO INFINITO) ── */}
      <div className="max-h-[500px] overflow-y-auto relative divide-y divide-border/40 scrollbar-thin">
        <table className="w-full text-sm text-left border-collapse">
          <thead className="sticky top-0 z-10 bg-muted/95 backdrop-blur border-b border-border shadow-xs">
            <tr>
              <th className="px-6 py-3 text-[10px] font-black uppercase tracking-widest text-muted-foreground">
                Caso & Cliente
              </th>
              <th className="px-4 py-3 text-center text-[10px] font-black uppercase tracking-widest text-muted-foreground">
                Estado
              </th>
              <th className="px-4 py-3 text-center text-[10px] font-black uppercase tracking-widest text-muted-foreground">
                Canal
              </th>
              <th className="px-4 py-3 text-center text-[10px] font-black uppercase tracking-widest text-muted-foreground">
                Calificación
              </th>
              <th className="px-5 py-3 text-right text-[10px] font-black uppercase tracking-widest text-muted-foreground">
                Fecha / Hora
              </th>
              <th className="px-4 py-3 text-center text-[10px] font-black uppercase tracking-widest text-muted-foreground w-16">
                Abrir
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border/30">
            {filteredCases.map((c) => {
              const ci = clienteInfo(c.cliente);
              const clientDisplayName = ci.nombre || ci.telefono || c.customer_phone || "Cliente";
              const est = ESTADO_STYLES[c.estado] || {
                label: c.estado?.replace("_", " "),
                bg: "bg-muted",
                text: "text-muted-foreground",
                border: "border-border",
              };
              const { date, time } = formatDateTime(c.created_at);

              return (
                <tr
                  key={String(c.id)}
                  className="hover:bg-muted/30 transition-colors group"
                >
                  {/* CASO & CLIENTE */}
                  <td className="px-6 py-3.5">
                    <Link
                      href={`/inbox?c=${c.id}`}
                      className="block group/link"
                      title="Abrir este caso en la bandeja"
                    >
                      <div className="flex items-center gap-2">
                        <span className="text-[10px] font-mono font-black text-muted-foreground/70 bg-muted/60 px-1.5 py-0.5 rounded border border-border/50 shrink-0">
                          #{c.id}
                        </span>
                        <p className="font-bold text-xs text-foreground group-hover/link:text-brand-500 transition-colors truncate max-w-[280px]">
                          {c.title || `Caso #${c.id}`}
                        </p>
                      </div>
                      <div className="flex items-center gap-2 mt-1 text-[11px] text-muted-foreground">
                        <span className="font-medium text-foreground/80 truncate max-w-[180px]">
                          {clientDisplayName}
                        </span>
                        {c.cat && (
                          <>
                            <span className="text-muted-foreground/40">•</span>
                            <span className="text-[10px] px-1.5 py-0.2 rounded bg-muted/50 border border-border/40 text-muted-foreground truncate max-w-[140px]">
                              {c.cat}
                            </span>
                          </>
                        )}
                      </div>
                    </Link>
                  </td>

                  {/* ESTADO */}
                  <td className="px-4 py-3.5 text-center whitespace-nowrap">
                    <span
                      className={`inline-flex items-center text-[10px] font-black px-2.5 py-0.5 rounded-full border uppercase tracking-wider ${est.bg} ${est.text} ${est.border}`}
                    >
                      {est.label}
                    </span>
                  </td>

                  {/* CANAL */}
                  <td className="px-4 py-3.5 text-center whitespace-nowrap">
                    <span className="text-[10px] font-bold uppercase text-muted-foreground px-2 py-0.5 rounded-md bg-muted/40 border border-border/40">
                      {c.canal || "—"}
                    </span>
                  </td>

                  {/* CALIFICACIÓN */}
                  <td className="px-4 py-3.5 text-center whitespace-nowrap">
                    {c.calificacion ? (
                      <div className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-amber-400/10 border border-amber-400/20">
                        <Star className="h-3 w-3 text-amber-400 fill-amber-400 shrink-0" />
                        <span className="font-black text-amber-400 text-xs tabular-nums">
                          {c.calificacion}
                        </span>
                      </div>
                    ) : (
                      <span className="text-muted-foreground/30 text-xs">—</span>
                    )}
                  </td>

                  {/* FECHA / HORA */}
                  <td className="px-5 py-3.5 text-right whitespace-nowrap">
                    <p className="text-xs font-bold text-foreground tabular-nums">{date}</p>
                    <p className="text-[10px] text-muted-foreground tabular-nums">{time}</p>
                  </td>

                  {/* ACCIÓN ABRIR */}
                  <td className="px-4 py-3.5 text-center whitespace-nowrap">
                    <Link
                      href={`/inbox?c=${c.id}`}
                      className="inline-flex items-center justify-center h-7 w-7 rounded-lg bg-muted/40 hover:bg-brand-500 hover:text-white border border-border/60 text-muted-foreground transition-all shadow-xs"
                      title={`Abrir caso #${c.id}`}
                    >
                      <ExternalLink className="h-3.5 w-3.5" />
                    </Link>
                  </td>
                </tr>
              );
            })}

            {filteredCases.length === 0 && (
              <tr>
                <td colSpan={6} className="py-16 text-center">
                  <div className="flex flex-col items-center justify-center gap-2 max-w-sm mx-auto">
                    <AlertCircle className="h-8 w-8 text-muted-foreground/40" />
                    <p className="text-sm font-bold text-foreground">No se encontraron casos</p>
                    <p className="text-xs text-muted-foreground">
                      {hasActiveFilters
                        ? "Ningún caso coincide con los filtros aplicados. Prueba cambiando o restableciendo los criterios de búsqueda."
                        : "Este agente no tiene casos registrados todavía."}
                    </p>
                    {hasActiveFilters && (
                      <button
                        onClick={clearFilters}
                        className="mt-2 px-3 py-1.5 rounded-lg bg-brand-500 text-white text-xs font-bold hover:bg-brand-600 transition-colors"
                      >
                        Restablecer filtros
                      </button>
                    )}
                  </div>
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {/* ── FOOTER DE LA TABLA ── */}
      {filteredCases.length > 0 && (
        <div className="px-6 py-3 border-t border-border/60 bg-muted/10 flex items-center justify-between text-xs text-muted-foreground">
          <span>
            Mostrando <strong className="text-foreground">{filteredCases.length}</strong> de{" "}
            <strong className="text-foreground">{cases.length}</strong> casos totales
          </span>
          <span className="text-[11px] italic">
            Usa el scroll interno para navegar por toda la lista
          </span>
        </div>
      )}
    </section>
  );
}
