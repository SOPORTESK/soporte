"use client";
import * as React from "react";
import { Search, MessageSquarePlus, Star, Clock, Trash2, Smartphone, Globe, X } from "lucide-react";
import { Avatar, Badge } from "@/components/ui/avatar";
import { Input } from "@/components/ui/input";
import { cn, formatTime, asText, clienteInfo } from "@/lib/utils";
import type { SekCase, ChannelKind, SekHistEntry } from "@/lib/types";

type ChannelFilter = "all" | "whatsapp" | "web" | "test";

function getChannelIcon(canal: string | null | undefined) {
  const c = String(canal || "").toLowerCase();
  if (c === "whatsapp") return <span className="text-green-400 text-xs">w</span>;
  if (c === "web" || c === "widget") return <span className="text-blue-400 text-xs">W</span>;
  if (c === "messenger") return <span className="text-blue-500 text-xs">M</span>;
  if (c === "email") return <span className="text-gray-400 text-xs">@</span>;
  return null;
}

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
  cases, selectedId, onSelect, agentRole, onDeleteSuccess
}: { cases: SekCase[]; selectedId: string | null; onSelect: (id: string) => void; agentRole?: string; onDeleteSuccess?: (id: string) => void }) {
  const [query, setQuery] = React.useState("");
  const [channelFilter, setChannelFilter] = React.useState<ChannelFilter>("all");
  const [tick, setTick] = React.useState(0);
  const [deletingId, setDeletingId] = React.useState<string | null>(null);
  const [confirmId, setConfirmId] = React.useState<string | null>(null);
  const [showModal, setShowModal] = React.useState(false);
  const [newName, setNewName] = React.useState("");
  const [newPhone, setNewPhone] = React.useState("");
  const [newCanal, setNewCanal] = React.useState<"web" | "whatsapp" | "whatsapp_test">("web");
  const [newMessage, setNewMessage] = React.useState("");
  const [creating, setCreating] = React.useState(false);
  
  const isAdmin = agentRole === "admin" || agentRole === "superadmin";

  React.useEffect(() => {
    const t = setInterval(() => setTick(n => n + 1), 60000);
    return () => clearInterval(t);
  }, []);

  const handleCreate = async () => {
    if (!newMessage.trim()) return;
    setCreating(true);
    try {
      const res = await fetch("/api/cases/create", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ nombre: newName, telefono: newPhone, canal: newCanal, mensaje: newMessage }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Error al crear");
      setShowModal(false);
      setNewName(""); setNewPhone(""); setNewCanal("web"); setNewMessage("");
      if (data.case_id) onSelect(data.case_id);
      window.location.reload();
    } catch (e: any) {
      alert("No se pudo crear: " + (e?.message || "error"));
    } finally {
      setCreating(false);
    }
  };

  const handleDelete = async (caseId: string) => {
    setDeletingId(caseId);
    try {
      const res = await fetch(`/api/cases/${caseId}`, { method: "DELETE" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Error al eliminar");
      setConfirmId(null);
      if (onDeleteSuccess) {
        onDeleteSuccess(caseId);
      } else {
        window.location.reload();
      }
    } catch (e: any) {
      alert("No se pudo eliminar: " + (e?.message || "error"));
    } finally {
      setDeletingId(null);
    }
  };


  const filtered = React.useMemo(() => {
    const list = cases.filter(c => {
      // Filtro de búsqueda por texto
      if (query.trim()) {
        const q = query.toLowerCase();
        const ci = clienteInfo(c.cliente);
        const matchesSearch = ci.nombre.toLowerCase().includes(q)
          || ci.telefono.toLowerCase().includes(q)
          || ci.cuenta.toLowerCase().includes(q)
          || asText(c.title).toLowerCase().includes(q)
          || asText(c.last_message_preview).toLowerCase().includes(q);
        if (!matchesSearch) return false;
      }
      
      // Filtro por canal
      if (channelFilter !== "all") {
        const canal = String(c.canal || "").toLowerCase();
        if (channelFilter === "whatsapp" && canal !== "whatsapp") return false;
        if (channelFilter === "web" && canal !== "web" && canal !== "widget") return false;
        if (channelFilter === "test" && canal !== "whatsapp_test") return false;
      }
      
      return true;
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
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cases, query, channelFilter, tick]);

  const emptyMsg = React.useMemo(() => {
    if (cases.length === 0) return "Aún no hay casos. Cuando un cliente escriba, aparecerá aquí.";
    return "Sin resultados con esos filtros.";
  }, [cases.length]);

  const counts = React.useMemo(() => {
    let whatsapp = 0;
    let web = 0;
    let test = 0;
    for (const c of cases) {
      const canal = String(c.canal || "").toLowerCase();
      if (canal === "whatsapp") whatsapp++;
      else if (canal === "web" || canal === "widget") web++;
      else if (canal === "whatsapp_test") test++;
    }
    return { all: cases.length, whatsapp, web, test };
  }, [cases]);

  const channelTabs: {
    key: ChannelFilter;
    label: string;
    count: number;
    icon: React.ReactNode;
    activeText: string;
    activeDot: string;
    activeBadge: string;
  }[] = [
    {
      key: "all",
      label: "Todos",
      count: counts.all,
      icon: null,
      activeText: "text-brand-600 dark:text-brand-300",
      activeDot: "bg-brand-500",
      activeBadge: "bg-brand-500/15 text-brand-600 dark:text-brand-300",
    },
    {
      key: "whatsapp",
      label: "WhatsApp",
      count: counts.whatsapp,
      icon: <Smartphone className="h-3.5 w-3.5" />,
      activeText: "text-green-600 dark:text-green-400",
      activeDot: "bg-green-500",
      activeBadge: "bg-green-500/15 text-green-600 dark:text-green-400",
    },
    {
      key: "web",
      label: "Web",
      count: counts.web,
      icon: <Globe className="h-3.5 w-3.5" />,
      activeText: "text-blue-600 dark:text-blue-400",
      activeDot: "bg-blue-500",
      activeBadge: "bg-blue-500/15 text-blue-600 dark:text-blue-400",
    },
    {
      key: "test",
      label: "Prueba",
      count: counts.test,
      icon: <span className="text-[10px] font-bold leading-none">T</span>,
      activeText: "text-orange-600 dark:text-orange-400",
      activeDot: "bg-orange-500",
      activeBadge: "bg-orange-500/15 text-orange-600 dark:text-orange-400",
    },
  ];

  return (
    <aside className={cn(
      "border-r border-border bg-card flex flex-col min-h-0",
      selectedId ? "hidden md:flex" : "flex"
    )} aria-label="Lista de conversaciones">
      <div className="p-3 sm:p-4 pt-safe border-b border-border space-y-2.5 sm:space-y-3 px-safe">
        <div className="flex items-center justify-between">
          <h1 className="text-lg sm:text-xl font-bold">Conversaciones</h1>
          <button
            onClick={() => setShowModal(true)}
            className="h-9 w-9 grid place-items-center rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted touch-target"
            aria-label="Nueva conversación" title="Nueva conversación"
          >
            <MessageSquarePlus className="h-4 w-4" />
          </button>
        </div>
        <div className="relative group">
          <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground transition-colors group-focus-within:text-brand-500" aria-hidden />
          <Input
            value={query} onChange={e => setQuery(e.target.value)}
            placeholder="Buscar por nombre, teléfono, cuenta…"
            className="pl-10 h-10 text-sm rounded-xl bg-muted/40 border-transparent focus-visible:bg-card focus-visible:border-brand-500/40 transition-colors"
            aria-label="Buscar conversaciones"
          />
        </div>

        {/* Filtros de Canal — control segmentado */}
        <div className="flex items-center gap-1 p-1 rounded-xl bg-muted/50" role="tablist" aria-label="Filtrar por canal">
          {channelTabs.map(tab => {
            const isActive = channelFilter === tab.key;
            return (
              <button
                key={tab.key}
                role="tab"
                aria-selected={isActive}
                onClick={() => setChannelFilter(tab.key)}
                className={cn(
                  "flex-1 flex items-center justify-center gap-1.5 px-2 py-1.5 rounded-lg text-xs font-semibold transition-all duration-200",
                  isActive
                    ? cn("bg-card shadow-sm ring-1 ring-border", tab.activeText)
                    : "text-muted-foreground hover:text-foreground hover:bg-card/50"
                )}
              >
                {tab.key === "all"
                  ? <span className={cn("h-1.5 w-1.5 rounded-full transition-colors", isActive ? tab.activeDot : "bg-muted-foreground/40")} />
                  : <span className={cn("transition-colors", isActive ? tab.activeText : "text-muted-foreground/70")}>{tab.icon}</span>}
                <span className="truncate">{tab.label}</span>
                <span className={cn(
                  "min-w-[20px] px-1.5 py-0.5 rounded-full text-[10px] font-bold leading-none text-center tabular-nums transition-colors",
                  isActive ? tab.activeBadge : "bg-foreground/5 text-muted-foreground"
                )}>
                  {tab.count}
                </span>
              </button>
            );
          })}
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
          const isEscaladoPendiente = estadoLower === "escalado" && !c.accepted_at;
          const minutosEsperando = isEscaladoPendiente && c.escalado_at
            ? Math.floor((Date.now() - new Date(c.escalado_at).getTime()) / 60000)
            : null;
          const semaforo = minutosEsperando === null ? null
            : minutosEsperando < 2 ? { color: "bg-emerald-500", text: "text-emerald-600 dark:text-emerald-400", label: `${minutosEsperando}m` }
            : minutosEsperando < 5 ? { color: "bg-amber-400", text: "text-amber-600 dark:text-amber-400", label: `${minutosEsperando}m` }
            : { color: "bg-red-500", text: "text-red-600 dark:text-red-400", label: `${minutosEsperando}m` };
          return (
            <li key={id} role="option" aria-selected={active} className="group relative flex items-stretch border-b border-border/50 min-w-0">
              {/* Botón principal de selección - con overflow hidden para truncar texto */}
              <button
                onClick={() => onSelect(id)}
                className={cn(
                  "flex-1 min-w-0 text-left flex items-start gap-3 px-3 sm:px-4 py-3 transition-colors focus-visible:outline-none focus-visible:bg-muted active:bg-muted/80",
                  active ? "bg-brand-50 dark:bg-brand-900/30" : "hover:bg-muted/60"
                )}
              >
                <Avatar name={display} channel={canalKind as any} size={44} />
                <div className="flex-1 min-w-0 overflow-hidden">
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-1.5 min-w-0 overflow-hidden">
                      <p className="font-semibold truncate">{display}</p>
                      {c._group?.avgRating && (
                        <div className="flex items-center gap-0.5 text-amber-500 font-bold text-[10px] shrink-0">
                          <Star className="h-2.5 w-2.5 fill-amber-500" />
                          {c._group.avgRating.toFixed(1)}
                        </div>
                      )}
                    </div>
                    <div className="flex items-center gap-1.5 shrink-0">
                      {semaforo && (
                        <span className={`inline-flex items-center gap-1 rounded-full px-1.5 py-0.5 text-[10px] font-bold ${semaforo.text} bg-current/10`}>
                          <span className={`h-1.5 w-1.5 rounded-full ${semaforo.color} animate-pulse`} />
                          <Clock className="h-2.5 w-2.5" />
                          {semaforo.label}
                        </span>
                      )}
                      <span className="text-xs text-muted-foreground" suppressHydrationWarning>{timeStr}</span>
                    </div>
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
                    {(estadoLower === "abierto" || estadoLower === "asignado") && (() => {
                      const agente = c.assigned_to
                        ? (c.assigned_to as string).split("@")[0].replace(/[._]/g, " ").replace(/\b\w/g, l => l.toUpperCase())
                        : null;
                      return (
                        <Badge variant="warning" className="text-[10px]">
                          {agente ? `Atendido por ${agente}` : "En proceso"}
                        </Badge>
                      );
                    })()}
                    {(estadoLower === "pendiente" || estadoLower === "" || !estadoLower) && (
                      <Badge variant="default" className="text-[10px]">Nuevo</Badge>
                    )}
                    {c.prioridad === "urgente" && <Badge variant="danger" className="text-[10px]">Urgente</Badge>}
                    {(() => {
                      const tags = Array.isArray(c.tags) ? c.tags : [];
                      const hasN2 = tags.some((t: string) => t.toLowerCase().includes("n2"));
                      return hasN2 ? <span className="inline-flex items-center rounded-full bg-red-600 px-2 py-0.5 text-[10px] font-semibold text-white">N2</span> : null;
                    })()}
                    {String(c.canal || "").toLowerCase() === "whatsapp_test" && (
                      <span className="inline-flex items-center rounded-full bg-orange-500 px-1.5 py-0.5 text-[10px] font-bold text-white">PRUEBA</span>
                    )}
                    {c.unread_count > 0 && <Badge variant="default" className="text-[10px]">{c.unread_count}</Badge>}
                  </div>
                </div>
              </button>

              {/* Botón de eliminar - SOLO PARA ADMIN/SUPERADMIN - shrink-0 para nunca empujarse */}
              {isAdmin && (
                <div className="shrink-0 flex items-center px-2 border-l border-border/30 bg-transparent">
                  {confirmId === id ? (
                    <div className="flex items-center gap-1 shrink-0">
                      <button 
                        onClick={(e) => { e.stopPropagation(); handleDelete(id); }} 
                        disabled={deletingId === id}
                        className="text-[10px] px-2 py-1 rounded bg-red-600 text-white hover:bg-red-700 disabled:opacity-50 whitespace-nowrap shrink-0"
                      >
                        {deletingId === id ? "..." : "Eliminar"}
                      </button>
                      <button 
                        onClick={(e) => { e.stopPropagation(); setConfirmId(null); }}
                        className="text-[10px] px-2 py-1 rounded bg-muted hover:bg-border whitespace-nowrap shrink-0"
                      >
                        Cancelar
                      </button>
                    </div>
                  ) : (
                    <button 
                      onClick={(e) => { e.stopPropagation(); setConfirmId(id); }}
                      className="shrink-0 p-2 rounded-md text-muted-foreground hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors"
                      title="Eliminar conversación"
                    >
                      <Trash2 className="h-4 w-4 shrink-0" />
                    </button>
                  )}
                </div>
              )}
            </li>
          );
        })}
      </ul>

      {/* Modal nueva conversación */}
      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm" onClick={() => setShowModal(false)}>
          <div className="bg-card border border-border rounded-2xl shadow-2xl w-full max-w-md mx-4 p-5 space-y-4" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-bold">Nueva conversación</h2>
              <button onClick={() => setShowModal(false)} className="p-1.5 rounded-lg hover:bg-muted transition-colors">
                <X className="h-4 w-4" />
              </button>
            </div>
            <div className="space-y-3">
              <div>
                <label className="text-xs font-medium text-muted-foreground mb-1 block">Canal</label>
                <select
                  value={newCanal}
                  onChange={e => setNewCanal(e.target.value as any)}
                  className="w-full h-10 px-3 rounded-lg bg-muted/40 border border-border text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
                >
                  <option value="web">Web</option>
                  <option value="whatsapp">WhatsApp</option>
                  <option value="whatsapp_test">Prueba WhatsApp</option>
                </select>
              </div>
              <div>
                <label className="text-xs font-medium text-muted-foreground mb-1 block">Nombre del cliente</label>
                <Input value={newName} onChange={e => setNewName(e.target.value)} placeholder="Ej: Juan Pérez" className="h-10 text-sm rounded-lg bg-muted/40 border-border" />
              </div>
              <div>
                <label className="text-xs font-medium text-muted-foreground mb-1 block">Teléfono</label>
                <Input value={newPhone} onChange={e => setNewPhone(e.target.value)} placeholder="Ej: 50688888888" className="h-10 text-sm rounded-lg bg-muted/40 border-border" />
              </div>
              <div>
                <label className="text-xs font-medium text-muted-foreground mb-1 block">Mensaje inicial *</label>
                <textarea
                  value={newMessage}
                  onChange={e => setNewMessage(e.target.value)}
                  placeholder="Escribe el primer mensaje del cliente..."
                  rows={3}
                  className="w-full px-3 py-2 rounded-lg bg-muted/40 border border-border text-sm focus:outline-none focus:ring-2 focus:ring-brand-500 resize-none"
                />
              </div>
            </div>
            <div className="flex justify-end gap-2 pt-1">
              <button onClick={() => setShowModal(false)} className="px-4 py-2 rounded-lg text-sm font-medium text-muted-foreground hover:bg-muted transition-colors">
                Cancelar
              </button>
              <button
                onClick={handleCreate}
                disabled={creating || !newMessage.trim()}
                className="px-4 py-2 rounded-lg text-sm font-medium bg-brand-600 text-white hover:bg-brand-700 disabled:opacity-40 transition-colors"
              >
                {creating ? "Creando..." : "Crear conversación"}
              </button>
            </div>
          </div>
        </div>
      )}
    </aside>
  );
}
