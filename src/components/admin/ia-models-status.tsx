"use client";

import * as React from "react";
import { RefreshCw, CheckCircle2, XCircle, Zap, Clock } from "lucide-react";

interface ModelCheck {
  name: string;
  model: string;
  provider: string;
  purpose: string;
  status: "up" | "down";
  latencyMs: number;
  error?: string;
}

export function IaModelsStatus() {
  const [models, setModels] = React.useState<ModelCheck[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [lastUpdate, setLastUpdate] = React.useState<Date | null>(null);

  async function fetchStatus() {
    setLoading(true);
    try {
      const res = await fetch("/api/admin/ia-status", { cache: "no-store" });
      const data = await res.json();
      if (data?.models) {
        setModels(data.models);
        setLastUpdate(new Date());
      }
    } catch (e) {
      console.error("Error fetching IA status:", e);
    } finally {
      setLoading(false);
    }
  }

  React.useEffect(() => {
    fetchStatus();
  }, []);

  const allUp = models.length > 0 && models.every(m => m.status === "up");
  const anyDown = models.some(m => m.status === "down");

  return (
    <section className="rounded-2xl border border-border bg-card p-6">
      <div className="flex items-center justify-between mb-5">
        <h2 className="text-sm font-bold uppercase tracking-widest text-muted-foreground flex items-center gap-2">
          <Zap className="h-4 w-4" /> Estado de Modelos IA
        </h2>
        <div className="flex items-center gap-3">
          {lastUpdate && (
            <span className="text-[10px] text-muted-foreground" suppressHydrationWarning>
              {lastUpdate.toLocaleTimeString("es-CR")}
            </span>
          )}
          <button
            onClick={fetchStatus}
            disabled={loading}
            className="flex items-center gap-1.5 text-xs font-semibold text-brand-600 hover:text-brand-700 disabled:opacity-50 transition-colors"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`} />
            Verificar
          </button>
        </div>
      </div>

      {/* Resumen */}
      {models.length > 0 && (
        <div className={`mb-4 p-3 rounded-xl border text-sm font-semibold flex items-center gap-2 ${
          allUp ? "bg-emerald-500/10 border-emerald-500/20 text-emerald-600"
          : anyDown ? "bg-rose-500/10 border-rose-500/20 text-rose-600"
          : "bg-muted/40 border-border text-muted-foreground"
        }`}>
          {allUp ? <CheckCircle2 className="h-4 w-4" /> : <XCircle className="h-4 w-4" />}
          {allUp ? `Todos los modelos operativos (${models.length})`
          : `${models.filter(m => m.status === "down").length} de ${models.length} modelos caídos`}
        </div>
      )}

      {/* Lista de modelos */}
      <div className="space-y-2.5">
        {loading && models.length === 0 ? (
          <div className="space-y-2.5">
            {[1, 2, 3].map(i => (
              <div key={i} className="flex items-center justify-between p-3.5 rounded-xl bg-muted/40 border border-border animate-pulse">
                <div className="h-4 w-32 bg-muted rounded" />
                <div className="h-4 w-16 bg-muted rounded" />
              </div>
            ))}
          </div>
        ) : models.length === 0 ? (
          <p className="text-xs text-muted-foreground italic py-4 text-center">
            No se pudieron verificar los modelos. Verifique la API key.
          </p>
        ) : (
          models.map((m, i) => (
            <div key={i} className="flex items-center justify-between p-3.5 rounded-xl bg-muted/40 border border-border hover:bg-muted/70 transition-colors">
              <div className="flex items-center gap-3">
                <div className={`h-8 w-8 rounded-lg grid place-items-center border ${
                  m.status === "up"
                    ? "bg-emerald-500/10 border-emerald-500/20 text-emerald-500"
                    : "bg-rose-500/10 border-rose-500/20 text-rose-500"
                }`}>
                  {m.status === "up" ? <CheckCircle2 className="h-4 w-4" /> : <XCircle className="h-4 w-4" />}
                </div>
                <div>
                  <p className="text-sm font-semibold font-mono">{m.model}</p>
                  <p className="text-[11px] text-muted-foreground">{m.purpose}</p>
                  {m.error && (
                    <p className="text-[10px] text-rose-500 mt-0.5">{m.error}</p>
                  )}
                </div>
              </div>
              <div className="flex flex-col items-end gap-1">
                <span className={`text-[10px] font-bold px-2.5 py-1 rounded-full border ${
                  m.status === "up"
                    ? "bg-emerald-500/10 text-emerald-500 border-emerald-500/20"
                    : "bg-rose-500/10 text-rose-500 border-rose-500/20"
                }`}>
                  {m.status === "up" ? "UP" : "DOWN"}
                </span>
                {m.status === "up" && (
                  <span className="text-[10px] text-muted-foreground flex items-center gap-1">
                    <Clock className="h-2.5 w-2.5" /> {m.latencyMs}ms
                  </span>
                )}
              </div>
            </div>
          ))
        )}
      </div>
    </section>
  );
}
