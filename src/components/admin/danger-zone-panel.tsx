"use client";
import * as React from "react";
import { Trash2, AlertTriangle, RefreshCw, CheckCircle2 } from "lucide-react";
import { toast } from "sonner";

export function DangerZonePanel() {
  const [counts, setCounts] = React.useState<{ cases: number; clientes: number } | null>(null);
  const [confirmText, setConfirmText] = React.useState("");
  const [showConfirm, setShowConfirm] = React.useState(false);
  const [running, setRunning] = React.useState(false);
  const [done, setDone] = React.useState<string | null>(null);

  async function fetchCounts() {
    try {
      const res = await fetch("/api/admin/reset-operational-data/counts");
      if (!res.ok) return;
      const json = await res.json();
      setCounts({ cases: json.counts?.cases || 0, clientes: json.counts?.clientes || 0 });
    } catch {}
  }

  React.useEffect(() => { fetchCounts(); }, []);

  async function runReset() {
    if (confirmText !== "BORRAR") { toast.error('Escribí "BORRAR" para confirmar'); return; }
    setRunning(true);
    try {
      const res = await fetch("/api/admin/reset-operational-data", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ confirm: "BORRAR" }),
      });
      const json = await res.json();
      if (json.ok) {
        toast.success("Reset completado");
        const totalDeleted = Object.values(json.result || {})
          .map((v: any) => v.deleted || 0)
          .reduce((a: number, b: number) => a + b, 0);
        setDone(`✓ ${totalDeleted} registro${totalDeleted === 1 ? "" : "s"} eliminado${totalDeleted === 1 ? "" : "s"}. Sistema listo para producción.`);
        setShowConfirm(false);
        setConfirmText("");
        await fetchCounts();
      } else {
        toast.error("Reset terminó con errores. Revisá la consola.");
        console.error("[reset]", json.result);
      }
    } catch (e: any) {
      toast.error(e?.message || "Error de red");
    } finally {
      setRunning(false);
    }
  }

  const total = counts ? counts.cases + counts.clientes : 0;
  const isEmpty = counts !== null && total === 0;

  return (
    <div className="space-y-4">
      {/* Resumen simple */}
      <div className="flex items-center gap-4 text-sm">
        <span className="text-muted-foreground">Datos a borrar:</span>
        <span className="font-black tabular-nums">
          {counts === null ? "…" : `${counts.cases} chats · ${counts.clientes} clientes`}
        </span>
        <button
          onClick={fetchCounts}
          className="ml-auto text-[11px] text-muted-foreground hover:text-foreground flex items-center gap-1"
        >
          <RefreshCw className="h-3 w-3" /> actualizar
        </button>
      </div>

      {/* Confirmación o botón */}
      {!showConfirm ? (
        <button
          onClick={() => setShowConfirm(true)}
          disabled={isEmpty}
          className="w-full flex items-center justify-center gap-2 px-4 py-3 rounded-lg bg-rose-500 hover:bg-rose-600 text-white text-sm font-black transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
        >
          <Trash2 className="h-4 w-4" />
          {isEmpty ? "Nada que borrar" : "Borrar todos los chats y clientes"}
        </button>
      ) : (
        <div className="space-y-2 p-3 rounded-lg border-2 border-rose-500 bg-rose-500/10">
          <p className="text-xs font-black text-rose-500 flex items-center gap-1.5">
            <AlertTriangle className="h-3.5 w-3.5" />
            Escribí <code className="px-1.5 py-0.5 rounded bg-background border border-rose-500/40 font-mono">BORRAR</code> para confirmar:
          </p>
          <input
            type="text"
            value={confirmText}
            onChange={e => setConfirmText(e.target.value)}
            placeholder="BORRAR"
            autoFocus
            disabled={running}
            className="w-full px-3 py-2 rounded-lg border border-rose-500/60 bg-background text-foreground text-sm font-mono uppercase tracking-wider focus:outline-none focus:border-rose-500 disabled:opacity-50"
          />
          <div className="flex items-center gap-2 justify-end">
            <button
              onClick={() => { setShowConfirm(false); setConfirmText(""); }}
              disabled={running}
              className="px-3 py-1.5 rounded-lg bg-muted hover:bg-muted/80 text-xs font-bold transition-colors disabled:opacity-50"
            >
              Cancelar
            </button>
            <button
              onClick={runReset}
              disabled={running || confirmText !== "BORRAR"}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-rose-500 hover:bg-rose-600 text-white text-xs font-black transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {running ? <RefreshCw className="h-3 w-3 animate-spin" /> : <Trash2 className="h-3 w-3" />}
              {running ? "Borrando…" : "Sí, borrar todo"}
            </button>
          </div>
        </div>
      )}

      {done && (
        <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-emerald-500/10 border border-emerald-500/30 text-emerald-500 text-xs font-bold">
          <CheckCircle2 className="h-3.5 w-3.5" />
          {done}
        </div>
      )}

      <p className="text-[10px] text-muted-foreground leading-relaxed">
        Borra: chats, clientes, aprendizajes y cache de chats, adjuntos. Conserva: prompt, agentes, inventario, manuales y chunks del RAG.
      </p>
    </div>
  );
}
