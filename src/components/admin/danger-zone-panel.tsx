"use client";
import * as React from "react";
import { Trash2, AlertTriangle, CheckCircle2, MessageSquare, Users, Sparkles, RefreshCw } from "lucide-react";
import { toast } from "sonner";

interface Counts {
  cases: number;
  clientes: number;
  messages: number;
  learnings: number;
}

interface ResetResult {
  ok: boolean;
  result: Record<string, { deleted: number | null; error?: string }>;
}

export function DangerZonePanel() {
  const [counts, setCounts] = React.useState<Counts | null>(null);
  const [loadingCounts, setLoadingCounts] = React.useState(false);
  const [confirmText, setConfirmText] = React.useState("");
  const [showConfirm, setShowConfirm] = React.useState(false);
  const [running, setRunning] = React.useState(false);
  const [lastResult, setLastResult] = React.useState<ResetResult | null>(null);

  async function fetchCounts() {
    setLoadingCounts(true);
    try {
      const res = await fetch("/api/admin/reset-operational-data/counts");
      if (!res.ok) {
        const e = await res.json().catch(() => ({}));
        toast.error(e.error || "Error al cargar conteos");
        return;
      }
      const json = await res.json();
      setCounts(json.counts);
    } catch {
      toast.error("Error de red");
    } finally {
      setLoadingCounts(false);
    }
  }

  React.useEffect(() => { fetchCounts(); }, []);

  async function runReset() {
    if (confirmText !== "BORRAR") {
      toast.error('Debes escribir exactamente "BORRAR"');
      return;
    }
    setRunning(true);
    setLastResult(null);
    try {
      const res = await fetch("/api/admin/reset-operational-data", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ confirm: "BORRAR" }),
      });
      const json = await res.json();
      setLastResult(json);
      if (json.ok) {
        toast.success("Reset operacional completado");
        setShowConfirm(false);
        setConfirmText("");
        await fetchCounts();
      } else {
        toast.error("El reset terminó con errores. Revisa el detalle.");
      }
    } catch (e: any) {
      toast.error(e?.message || "Error de red");
    } finally {
      setRunning(false);
    }
  }

  const totalAfectado = counts ? counts.cases + counts.clientes + counts.messages + counts.learnings : 0;

  return (
    <div className="space-y-5">
      {/* Resumen de lo que se va a borrar */}
      <div>
        <div className="flex items-center justify-between mb-3">
          <p className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Datos operacionales actuales</p>
          <button
            onClick={fetchCounts}
            disabled={loadingCounts}
            className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg border border-border bg-muted/50 hover:bg-muted text-[11px] font-bold transition-colors disabled:opacity-50"
          >
            <RefreshCw className={`h-3 w-3 ${loadingCounts ? "animate-spin" : ""}`} /> Actualizar
          </button>
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
          <CountCard icon={MessageSquare} label="Casos / chats" value={counts?.cases} color="rose" />
          <CountCard icon={Users} label="Clientes" value={counts?.clientes} color="amber" />
          <CountCard icon={MessageSquare} label="Mensajes (vestigial)" value={counts?.messages} color="muted" />
          <CountCard icon={Sparkles} label="Aprendizajes RAG" value={counts?.learnings} color="violet" />
        </div>
      </div>

      {/* Bloque de acción */}
      <div className="rounded-xl border border-rose-500/40 bg-rose-500/[0.04] p-4 space-y-3">
        <div className="flex items-start gap-2.5">
          <AlertTriangle className="h-4 w-4 text-rose-500 mt-0.5 shrink-0" />
          <div className="text-xs text-foreground/90 leading-relaxed">
            <p className="font-black text-rose-500 mb-1">Reset operacional para arranque en producción</p>
            <p className="text-muted-foreground">
              Borra <strong className="text-foreground">todos</strong> los chats, mensajes, clientes,
              aprendizajes RAG generados de conversaciones y archivos adjuntos subidos.
              <span className="block mt-1">
                <span className="text-emerald-500">Se conservan:</span> prompt activo, historial de versiones,
                agentes/usuarios, inventario, manuales RAG y configuración de canales.
              </span>
            </p>
          </div>
        </div>

        {!showConfirm ? (
          <button
            onClick={() => setShowConfirm(true)}
            disabled={totalAfectado === 0 && !!counts}
            className="w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg border border-rose-500/60 bg-rose-500/10 hover:bg-rose-500/20 text-rose-500 text-sm font-black transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
          >
            <Trash2 className="h-4 w-4" />
            {totalAfectado === 0 && counts ? "Nada que borrar" : "Borrar chats y clientes"}
          </button>
        ) : (
          <div className="space-y-3 p-3 rounded-lg border border-rose-500 bg-rose-500/10">
            <p className="text-xs font-black text-rose-500">
              ⚠ Esta acción es irreversible. Para confirmar escribí <code className="px-1.5 py-0.5 rounded bg-background border border-rose-500/40 font-mono">BORRAR</code> abajo:
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
      </div>

      {/* Resultado del último reset */}
      {lastResult && (
        <div className={`rounded-xl border p-4 ${lastResult.ok ? "border-emerald-500/40 bg-emerald-500/5" : "border-amber-500/40 bg-amber-500/5"}`}>
          <div className="flex items-center gap-2 mb-2.5">
            {lastResult.ok ? <CheckCircle2 className="h-4 w-4 text-emerald-500" /> : <AlertTriangle className="h-4 w-4 text-amber-500" />}
            <p className="text-xs font-black">
              {lastResult.ok ? "Reset completado correctamente" : "Reset completado con errores"}
            </p>
          </div>
          <div className="grid gap-1.5">
            {Object.entries(lastResult.result).map(([key, val]) => (
              <div key={key} className="flex items-center justify-between text-[11px] font-mono">
                <span className="text-muted-foreground">{key}</span>
                {val.error ? (
                  <span className="text-rose-500" title={val.error}>ERROR: {val.error.substring(0, 60)}</span>
                ) : (
                  <span className="text-emerald-500">{val.deleted ?? 0} eliminado{(val.deleted ?? 0) === 1 ? "" : "s"}</span>
                )}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function CountCard({ icon: Icon, label, value, color }: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  value: number | undefined;
  color: "rose" | "amber" | "violet" | "muted";
}) {
  const colorMap = {
    rose: "bg-rose-500/10 text-rose-500 border-rose-500/30",
    amber: "bg-amber-500/10 text-amber-500 border-amber-500/30",
    violet: "bg-violet-500/10 text-violet-500 border-violet-500/30",
    muted: "bg-muted text-muted-foreground border-border",
  }[color];
  return (
    <div className={`rounded-xl border p-3 ${colorMap}`}>
      <div className="flex items-center gap-1.5 mb-1.5">
        <Icon className="h-3 w-3" />
        <p className="text-[10px] font-black uppercase tracking-wider truncate">{label}</p>
      </div>
      <p className="text-xl font-black tabular-nums">{value === undefined ? "…" : value.toLocaleString("es-CR")}</p>
    </div>
  );
}
