"use client";
import * as React from "react";
import { Trash2, AlertTriangle, RefreshCw, MessageSquare, ExternalLink, ChevronLeft, ChevronRight } from "lucide-react";
import { toast } from "sonner";
import Link from "next/link";

interface Message {
  id: string | number;
  channel: string | null;
  from_number: string | null;
  from_name: string | null;
  content: string | null;
  status: string | null;
  case_id: string | number | null;
  created_at: string;
}

export function DangerZonePanel() {
  const [messages, setMessages] = React.useState<Message[]>([]);
  const [total, setTotal] = React.useState(0);
  const [page, setPage] = React.useState(1);
  const [loading, setLoading] = React.useState(false);
  const [deletingId, setDeletingId] = React.useState<string | number | null>(null);
  const [confirmClear, setConfirmClear] = React.useState(false);
  const [clearing, setClearing] = React.useState(false);

  const totalPages = Math.ceil(total / 50);

  async function fetchMessages(p = 1) {
    setLoading(true);
    try {
      const res = await fetch(`/api/admin/messages?page=${p}`);
      if (!res.ok) { const e = await res.json(); toast.error(e.error || "Error al cargar"); return; }
      const json = await res.json();
      setMessages(json.data || []);
      setTotal(json.count || 0);
      setPage(p);
    } catch { toast.error("Error de red"); }
    finally { setLoading(false); }
  }

  async function deleteOne(id: string | number) {
    setDeletingId(id);
    try {
      const res = await fetch(`/api/admin/messages?id=${id}`, { method: "DELETE" });
      if (!res.ok) { const e = await res.json(); toast.error(e.error || "Error"); return; }
      toast.success("Mensaje eliminado");
      setMessages(prev => prev.filter(m => m.id !== id));
      setTotal(prev => prev - 1);
    } catch { toast.error("Error de red"); }
    finally { setDeletingId(null); }
  }

  async function clearAll() {
    setClearing(true);
    try {
      const res = await fetch("/api/admin/messages", { method: "DELETE" });
      if (!res.ok) { const e = await res.json(); toast.error(e.error || "Error"); return; }
      toast.success("Todos los mensajes eliminados");
      setMessages([]);
      setTotal(0);
      setConfirmClear(false);
    } catch { toast.error("Error de red"); }
    finally { setClearing(false); }
  }

  React.useEffect(() => { fetchMessages(1); }, []);

  const fmt = (iso: string) => new Date(iso).toLocaleString("es-CR", { dateStyle: "short", timeStyle: "short" });

  return (
    <div className="space-y-4">
      {/* Barra superior: total + limpiar todo + refresh */}
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-2">
          <MessageSquare className="h-4 w-4 text-muted-foreground" />
          <span className="text-sm font-bold tabular-nums">{total.toLocaleString("es-CR")}</span>
          <span className="text-xs text-muted-foreground">mensajes almacenados</span>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => fetchMessages(page)}
            disabled={loading}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-border bg-muted/50 hover:bg-muted text-xs font-bold transition-colors disabled:opacity-50"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`} /> Actualizar
          </button>
          {!confirmClear ? (
            <button
              onClick={() => setConfirmClear(true)}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-rose-500/40 bg-rose-500/10 hover:bg-rose-500/20 text-rose-500 text-xs font-bold transition-colors"
            >
              <Trash2 className="h-3.5 w-3.5" /> Limpiar todo
            </button>
          ) : (
            <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg border border-rose-500 bg-rose-500/15 animate-pulse">
              <AlertTriangle className="h-3.5 w-3.5 text-rose-500" />
              <span className="text-xs font-black text-rose-500">¿Confirmar borrar todo?</span>
              <button
                onClick={clearAll}
                disabled={clearing}
                className="px-2 py-0.5 rounded bg-rose-500 text-white text-[10px] font-black hover:bg-rose-600 disabled:opacity-60 transition-colors"
              >
                {clearing ? "Borrando…" : "Sí, borrar"}
              </button>
              <button
                onClick={() => setConfirmClear(false)}
                className="px-2 py-0.5 rounded bg-muted text-[10px] font-black hover:bg-muted/80 transition-colors"
              >
                Cancelar
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Tabla de mensajes */}
      <div className="rounded-xl border border-border overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b border-border bg-muted/40">
                <th className="text-left px-3 py-2.5 font-black text-[10px] uppercase tracking-wider text-muted-foreground">ID</th>
                <th className="text-left px-3 py-2.5 font-black text-[10px] uppercase tracking-wider text-muted-foreground">Canal</th>
                <th className="text-left px-3 py-2.5 font-black text-[10px] uppercase tracking-wider text-muted-foreground">De</th>
                <th className="text-left px-3 py-2.5 font-black text-[10px] uppercase tracking-wider text-muted-foreground">Contenido</th>
                <th className="text-left px-3 py-2.5 font-black text-[10px] uppercase tracking-wider text-muted-foreground">Caso</th>
                <th className="text-left px-3 py-2.5 font-black text-[10px] uppercase tracking-wider text-muted-foreground">Fecha</th>
                <th className="px-3 py-2.5" />
              </tr>
            </thead>
            <tbody>
              {loading && messages.length === 0 && (
                <tr><td colSpan={7} className="text-center py-10 text-muted-foreground">Cargando…</td></tr>
              )}
              {!loading && messages.length === 0 && (
                <tr><td colSpan={7} className="text-center py-10 text-muted-foreground">No hay mensajes almacenados</td></tr>
              )}
              {messages.map((m, i) => (
                <tr key={m.id} className={`border-b border-border/60 hover:bg-muted/30 transition-colors ${i % 2 === 0 ? "" : "bg-muted/10"}`}>
                  <td className="px-3 py-2 font-mono text-muted-foreground">{String(m.id).slice(-6)}</td>
                  <td className="px-3 py-2">
                    <span className="px-1.5 py-0.5 rounded bg-muted text-muted-foreground capitalize">{m.channel || "—"}</span>
                  </td>
                  <td className="px-3 py-2 max-w-[120px]">
                    <p className="font-bold truncate">{m.from_name || "—"}</p>
                    <p className="text-muted-foreground truncate">{m.from_number || ""}</p>
                  </td>
                  <td className="px-3 py-2 max-w-[220px]">
                    <p className="truncate text-muted-foreground">{m.content || <em className="opacity-40">sin contenido</em>}</p>
                  </td>
                  <td className="px-3 py-2">
                    {m.case_id ? (
                      <Link href={`/admin/caso/${m.case_id}`} className="flex items-center gap-1 text-brand-500 hover:underline font-bold">
                        #{m.case_id} <ExternalLink className="h-2.5 w-2.5" />
                      </Link>
                    ) : <span className="text-muted-foreground">—</span>}
                  </td>
                  <td className="px-3 py-2 text-muted-foreground whitespace-nowrap">{fmt(m.created_at)}</td>
                  <td className="px-3 py-2">
                    <button
                      onClick={() => deleteOne(m.id)}
                      disabled={deletingId === m.id}
                      className="p-1.5 rounded-lg text-rose-500/60 hover:text-rose-500 hover:bg-rose-500/10 transition-colors disabled:opacity-40"
                      title="Eliminar mensaje"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Paginación */}
        {totalPages > 1 && (
          <div className="flex items-center justify-between px-4 py-3 border-t border-border bg-muted/20">
            <span className="text-xs text-muted-foreground">Página {page} de {totalPages}</span>
            <div className="flex items-center gap-1">
              <button
                onClick={() => fetchMessages(page - 1)}
                disabled={page <= 1 || loading}
                className="p-1.5 rounded-lg border border-border hover:bg-muted disabled:opacity-40 transition-colors"
              >
                <ChevronLeft className="h-3.5 w-3.5" />
              </button>
              <button
                onClick={() => fetchMessages(page + 1)}
                disabled={page >= totalPages || loading}
                className="p-1.5 rounded-lg border border-border hover:bg-muted disabled:opacity-40 transition-colors"
              >
                <ChevronRight className="h-3.5 w-3.5" />
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
