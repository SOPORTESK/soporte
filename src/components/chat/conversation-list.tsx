"use client";
import * as React from "react";
import { Search, MessageSquarePlus, Star } from "lucide-react";
import { Avatar, Badge } from "@/components/ui/avatar";
import { Input } from "@/components/ui/input";
import { cn, formatTime, asText, clienteInfo } from "@/lib/utils";
import type { SekCase, ChannelKind, SekHistEntry } from "@/lib/types";

function lastMessage(c: SekCase): { content: string; time: string } | null {
  const all: SekHistEntry[] = [];
  if (Array.isArray(c.histcliente)) all.push(...c.histcliente);
  if (Array.isArray(c.histtecnico)) all.push(...c.histtecnico);
  if (all.length === 0) return null;
  const sorted = [...all].sort((a, b) => new Date(a.time).getTime() - new Date(b.time).getTime());
  const last = sorted[sorted.length - 1];
  return { content: asText(last.content), time: last.time };
}

export function ConversationList({
  cases, selectedId, onSelect
}: { cases: SekCase[]; selectedId: string | null; onSelect: (id: string) => void }) {
  const [query, setQuery] = React.useState("");


  const filtered = React.useMemo(() => {
    const list = cases.filter(c => {
      if (!query.trim()) return true;
      const q = query.toLowerCase();
      const ci = clienteInfo(c.cliente);
      return ci.nombre.toLowerCase().includes(q)
        || ci.telefono.toLowerCase().includes(q)
        || ci.cuenta.toLowerCase().includes(q)
        || asText(c.title).toLowerCase().includes(q)
        || asText(c.last_message_preview).toLowerCase().includes(q);
    });
    /* Ordenar: escalado primero, luego el más reciente primero */
    return list.sort((a, b) => {
      const eA = String(a.estado || "").toLowerCase();
      const eB = String(b.estado || "").toLowerCase();
      if (eA === "escalado" && eB !== "escalado") return -1;
      if (eB === "escalado" && eA !== "escalado") return 1;
      const ta = lastMessage(a)?.time || a.last_message_at || a.updated_at || a.created_at || "";
      const tb = lastMessage(b)?.time || b.last_message_at || b.updated_at || b.created_at || "";
      return new Date(tb).getTime() - new Date(ta).getTime();
    });
  }, [cases, query]);

  const emptyMsg = React.useMemo(() => {
    if (cases.length === 0) return "Aún no hay casos. Cuando un cliente escriba, aparecerá aquí.";
    return "Sin resultados con esos filtros.";
  }, [cases.length]);

  return (
    <aside className={cn(
      "border-r border-border bg-card flex flex-col min-h-0",
      selectedId ? "hidden md:flex" : "flex"
    )} aria-label="Lista de conversaciones">
      <div className="p-3 sm:p-4 pt-safe border-b border-border space-y-2.5 sm:space-y-3 px-safe">
        <div className="flex items-center justify-between">
          <h1 className="text-lg sm:text-xl font-bold">Conversaciones</h1>
          <button
            className="h-9 w-9 grid place-items-center rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted touch-target"
            aria-label="Nueva conversación" title="Nueva conversación (próximamente)"
          >
            <MessageSquarePlus className="h-4 w-4" />
          </button>
        </div>
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" aria-hidden />
          <Input
            value={query} onChange={e => setQuery(e.target.value)}
            placeholder="Buscar por nombre, teléfono, cuenta…"
            className="pl-10 h-9 sm:h-10 text-sm" aria-label="Buscar conversaciones"
          />
        </div>
      </div>

      <ul className="flex-1 overflow-y-auto scrollbar-none px-safe" role="listbox">
        {filtered.length === 0 && (
          <li className="p-8 text-center text-sm text-muted-foreground">
            {emptyMsg}
          </li>
        )}
        {filtered.map(c => {
          const id = String(c.id);
          const active = id === selectedId;
          const canalKind = (c.canal as ChannelKind) || "otros";
          const ci = clienteInfo(c.cliente);
          const display = ci.nombre || ci.telefono || asText(c.title) || "Cliente";
          const sub = ci.cuenta || asText(c.title) || "";
          const lm = lastMessage(c);
          const preview = lm?.content || asText(c.last_message_preview) || sub || "Sin mensajes";
          const timeStr = formatTime(lm?.time || c.last_message_at || c.created_at);
          const estadoLower = String(c.estado || "").toLowerCase();
          return (
            <li key={id} role="option" aria-selected={active}>
              <button
                onClick={() => onSelect(id)}
                className={cn(
                  "w-full text-left flex items-start gap-3 px-3 sm:px-4 py-3 border-b border-border/50 transition-colors focus-visible:outline-none focus-visible:bg-muted active:bg-muted/80",
                  active ? "bg-brand-50 dark:bg-brand-900/30" : "hover:bg-muted/60"
                )}
              >
                <Avatar name={display} channel={canalKind as any} size={44} />
                <div className="min-w-0 flex-1">
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-1.5 min-w-0">
                      <p className="font-semibold truncate">{display}</p>
                      {c._group?.avgRating && (
                        <div className="flex items-center gap-0.5 text-amber-500 font-bold text-[10px] shrink-0">
                          <Star className="h-2.5 w-2.5 fill-amber-500" />
                          {c._group.avgRating.toFixed(1)}
                        </div>
                      )}
                    </div>
                    <span className="text-xs text-muted-foreground shrink-0">{timeStr}</span>
                  </div>
                  <p className="text-sm text-muted-foreground truncate mt-0.5">{preview}</p>
                  <div className="flex items-center gap-1 mt-1.5 flex-wrap">
                    {ci.cuenta && <Badge variant="muted" className="text-[10px]">{ci.cuenta}</Badge>}
                    {/* Etiqueta de estado y conteo de casos agrupados */}
                    {c._group && c._group.totalCases > 1 && (
                      <Badge variant="muted" className="text-[10px]">
                        {c._group.totalCases} casos{c._group.openCases > 0 ? ` · ${c._group.openCases} abierto${c._group.openCases > 1 ? 's' : ''}` : ''}
                      </Badge>
                    )}
                    {(estadoLower === "cerrado" || estadoLower === "resuelto") && (
                      <Badge variant="success" className="text-[10px]">Cerrado</Badge>
                    )}
                    {estadoLower === "escalado" && (
                      <Badge variant="danger" className="text-[10px] animate-pulse">Esperando agente</Badge>
                    )}
                    {estadoLower === "ia_atendiendo" && (
                      <Badge variant="muted" className="text-[10px]">IA atendiendo</Badge>
                    )}
                    {(estadoLower === "abierto" || estadoLower === "asignado") && (
                      <Badge variant="warning" className="text-[10px]">En proceso</Badge>
                    )}
                    {(estadoLower === "pendiente" || estadoLower === "" || !estadoLower) && (
                      <Badge variant="default" className="text-[10px]">Nuevo</Badge>
                    )}
                    {c.prioridad === "urgente" && <Badge variant="danger" className="text-[10px]">Urgente</Badge>}
                    {(() => {
                      const tags = Array.isArray(c.tags) ? c.tags : [];
                      const hasN2 = tags.some((t: string) => t.toLowerCase().includes("n2"));
                      return hasN2 ? <span className="inline-flex items-center rounded-full bg-red-600 px-2 py-0.5 text-[10px] font-semibold text-white">N2</span> : null;
                    })()}
                    {c.unread_count > 0 && <Badge variant="default" className="text-[10px]">{c.unread_count}</Badge>}
                  </div>
                </div>
              </button>
            </li>
          );
        })}
      </ul>
    </aside>
  );
}
