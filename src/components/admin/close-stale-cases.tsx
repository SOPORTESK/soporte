"use client";

import * as React from "react";
import { createClient } from "@/lib/supabase/client";
import { toast } from "sonner";
import { Clock, XCircle, Loader2 } from "lucide-react";

type StaleCase = {
  id: string;
  title: string | null;
  estado: string;
  assigned_to: string | null;
  created_at: string;
  last_message_at: string | null;
  canal: string;
};

export function CloseStaleCases({ hoursThreshold = 2 }: { hoursThreshold?: number }) {
  const supabase = React.useMemo(() => createClient(), []);
  const [staleCases, setStaleCases] = React.useState<StaleCase[]>([]);
  const [loading, setLoading] = React.useState(false);
  const [closing, setClosing] = React.useState(false);
  const [showPanel, setShowPanel] = React.useState(false);

  async function fetchStaleCases() {
    setLoading(true);
    try {
      const threshold = new Date(Date.now() - hoursThreshold * 60 * 60 * 1000).toISOString();
      const { data, error } = await supabase
        .from("sek_cases")
        .select("id, title, estado, assigned_to, created_at, last_message_at, canal")
        .in("estado", ["abierto", "ia_atendiendo", "escalado", "pendiente"])
        .neq("canal", "simulator")
        .lt("created_at", threshold)
        .order("created_at", { ascending: true })
        .limit(50);

      if (error) throw error;
      setStaleCases(data || []);
      setShowPanel(true);
    } catch (e: any) {
      toast.error("Error al buscar casos", { description: e?.message });
    } finally {
      setLoading(false);
    }
  }

  async function closeAllStale() {
    if (staleCases.length === 0) return;
    setClosing(true);
    try {
      const ids = staleCases.map(c => c.id);
      const now = new Date().toISOString();
      const { error } = await supabase
        .from("sek_cases")
        .update({ estado: "cerrado", closed_at: now })
        .in("id", ids);

      if (error) throw error;
      toast.success(`${ids.length} casos cerrados`);
      setStaleCases([]);
      setShowPanel(false);
    } catch (e: any) {
      toast.error("Error al cerrar casos", { description: e?.message });
    } finally {
      setClosing(false);
    }
  }

  async function closeOne(id: string) {
    try {
      const now = new Date().toISOString();
      const { error } = await supabase
        .from("sek_cases")
        .update({ estado: "cerrado", closed_at: now })
        .eq("id", id);

      if (error) throw error;
      setStaleCases(prev => prev.filter(c => c.id !== id));
      toast.success("Caso cerrado");
    } catch (e: any) {
      toast.error("Error al cerrar caso", { description: e?.message });
    }
  }

  function formatDaysAgo(dateStr: string) {
    const diffMs = Date.now() - new Date(dateStr).getTime();
    const diffH = Math.floor(diffMs / (1000 * 60 * 60));
    const diffM = Math.floor((diffMs % (1000 * 60 * 60)) / (1000 * 60));
    return diffH > 0 ? `${diffH}h ${diffM}m` : `${diffM}m`;
  }

  return (
    <div className="rounded-2xl border border-border/60 bg-card p-5">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2.5">
          <div className="h-9 w-9 rounded-xl bg-amber-500/10 grid place-items-center text-amber-500">
            <Clock className="h-5 w-5" />
          </div>
          <div>
            <h3 className="text-sm font-black">Casos Abiertos Prolongados</h3>
            <p className="text-[10px] text-muted-foreground">Abiertos hace m&aacute;s de {hoursThreshold < 1 ? `${Math.round(hoursThreshold * 60)} min` : `${hoursThreshold}h`}</p>
          </div>
        </div>
        <button
          onClick={fetchStaleCases}
          disabled={loading}
          className="inline-flex items-center gap-2 px-3 py-2 rounded-xl bg-brand-700 hover:bg-brand-800 text-white text-xs font-semibold transition-colors disabled:opacity-50"
        >
          {loading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Clock className="h-3.5 w-3.5" />}
          {loading ? "Buscando..." : "Buscar"}
        </button>
      </div>

      {showPanel && staleCases.length > 0 && (
        <div className="space-y-2">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-bold text-muted-foreground">{staleCases.length} caso(s) encontrado(s)</span>
            <button
              onClick={closeAllStale}
              disabled={closing}
              className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-rose-600 hover:bg-rose-700 text-white text-[11px] font-semibold transition-colors disabled:opacity-50"
            >
              {closing ? <Loader2 className="h-3 w-3 animate-spin" /> : <XCircle className="h-3 w-3" />}
              {closing ? "Cerrando..." : "Cerrar todos"}
            </button>
          </div>
          <div className="max-h-64 overflow-y-auto space-y-1.5">
            {staleCases.map(c => (
              <div key={c.id} className="flex items-center gap-2 px-3 py-2 rounded-lg bg-muted/40 hover:bg-muted/60 transition-colors">
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-semibold truncate">{c.title || "Sin t&iacute;tulo"}</p>
                  <p className="text-[10px] text-muted-foreground">
                    {c.canal} &middot; {c.assigned_to || "Sin asignar"} &middot; {formatDaysAgo(c.created_at)} atr&aacute;s
                  </p>
                </div>
                <span className="text-[10px] font-bold uppercase px-1.5 py-0.5 rounded-full bg-amber-500/10 text-amber-600">
                  {c.estado}
                </span>
                <button
                  onClick={() => closeOne(c.id)}
                  className="shrink-0 h-6 w-6 grid place-items-center rounded-md text-muted-foreground hover:bg-rose-500/10 hover:text-rose-500 transition-colors"
                  title="Cerrar caso"
                >
                  <XCircle className="h-3.5 w-3.5" />
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {showPanel && staleCases.length === 0 && (
        <p className="text-xs text-muted-foreground text-center py-6">No hay casos abiertos hace m&aacute;s de {hoursThreshold < 1 ? `${Math.round(hoursThreshold * 60)} min` : `${hoursThreshold}h`}.</p>
      )}
    </div>
  );
}
