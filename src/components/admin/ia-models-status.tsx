"use client";

import * as React from "react";
import { RefreshCw, CheckCircle2, XCircle, Zap, Clock, KeyRound, ChevronDown } from "lucide-react";

interface ModelCheck {
  id: string;
  model: string;
  provider: string;
  purpose: string;
  usedIn: string[];
  status: "up" | "down" | "no-key";
  latencyMs: number;
  error?: string;
}

const providerColors: Record<string, string> = {
  "Google AI Studio": "border-violet-500/20 bg-violet-500/5",
  "Groq": "border-orange-500/20 bg-orange-500/5",
  "OpenRouter": "border-blue-500/20 bg-blue-500/5",
  "NVIDIA NIM": "border-green-500/20 bg-green-500/5",
};

const providerBadge: Record<string, string> = {
  "Google AI Studio": "bg-violet-500/10 text-violet-500 border-violet-500/20",
  "Groq": "bg-orange-500/10 text-orange-500 border-orange-500/20",
  "OpenRouter": "bg-blue-500/10 text-blue-500 border-blue-500/20",
  "NVIDIA NIM": "bg-green-500/10 text-green-500 border-green-500/20",
};

export function IaModelsStatus() {
  const [models, setModels] = React.useState<ModelCheck[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [lastUpdate, setLastUpdate] = React.useState<Date | null>(null);
  const [expanded, setExpanded] = React.useState<string | null>(null);

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

  const upCount = models.filter(m => m.status === "up").length;
  const downCount = models.filter(m => m.status === "down").length;
  const noKeyCount = models.filter(m => m.status === "no-key").length;

  // Agrupar por provider
  const byProvider = models.reduce((acc, m) => {
    if (!acc[m.provider]) acc[m.provider] = [];
    acc[m.provider].push(m);
    return acc;
  }, {} as Record<string, ModelCheck[]>);

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
        <div className="mb-4 flex flex-wrap gap-2">
          <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-emerald-500/10 border border-emerald-500/20 text-emerald-600 text-xs font-bold">
            <CheckCircle2 className="h-3.5 w-3.5" /> {upCount} UP
          </div>
          {downCount > 0 && (
            <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-rose-500/10 border border-rose-500/20 text-rose-600 text-xs font-bold">
              <XCircle className="h-3.5 w-3.5" /> {downCount} DOWN
            </div>
          )}
          {noKeyCount > 0 && (
            <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-amber-500/10 border border-amber-500/20 text-amber-600 text-xs font-bold">
              <KeyRound className="h-3.5 w-3.5" /> {noKeyCount} SIN API KEY
            </div>
          )}
          <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-muted/40 border border-border text-muted-foreground text-xs font-bold">
            Total: {models.length} modelos
          </div>
        </div>
      )}

      {/* Lista por provider */}
      <div className="space-y-4">
        {loading && models.length === 0 ? (
          <div className="space-y-2.5">
            {[1, 2, 3, 4].map(i => (
              <div key={i} className="flex items-center justify-between p-3.5 rounded-xl bg-muted/40 border border-border animate-pulse">
                <div className="h-4 w-32 bg-muted rounded" />
                <div className="h-4 w-16 bg-muted rounded" />
              </div>
            ))}
          </div>
        ) : models.length === 0 ? (
          <p className="text-xs text-muted-foreground italic py-4 text-center">
            No se pudieron verificar los modelos.
          </p>
        ) : (
          Object.entries(byProvider).map(([provider, providerModels]) => (
            <div key={provider}>
              <h3 className="text-[10px] font-black uppercase tracking-widest text-muted-foreground mb-2">{provider}</h3>
              <div className="space-y-2">
                {providerModels.map((m) => (
                  <div key={m.id} className={`rounded-xl border p-3.5 ${providerColors[m.provider] || "border-border bg-muted/40"}`}>
                    <div
                      className="flex items-center justify-between cursor-pointer"
                      onClick={() => setExpanded(expanded === m.id ? null : m.id)}
                    >
                      <div className="flex items-center gap-3">
                        <div className={`h-8 w-8 rounded-lg grid place-items-center border shrink-0 ${
                          m.status === "up" ? "bg-emerald-500/10 border-emerald-500/20 text-emerald-500"
                          : m.status === "no-key" ? "bg-amber-500/10 border-amber-500/20 text-amber-500"
                          : "bg-rose-500/10 border-rose-500/20 text-rose-500"
                        }`}>
                          {m.status === "up" ? <CheckCircle2 className="h-4 w-4" />
                          : m.status === "no-key" ? <KeyRound className="h-4 w-4" />
                          : <XCircle className="h-4 w-4" />}
                        </div>
                        <div>
                          <p className="text-sm font-semibold font-mono">{m.model}</p>
                          <p className="text-[11px] text-muted-foreground">{m.purpose}</p>
                        </div>
                      </div>
                      <div className="flex flex-col items-end gap-1">
                        <span className={`text-[10px] font-bold px-2.5 py-1 rounded-full border ${
                          m.status === "up" ? "bg-emerald-500/10 text-emerald-500 border-emerald-500/20"
                          : m.status === "no-key" ? "bg-amber-500/10 text-amber-500 border-amber-500/20"
                          : "bg-rose-500/10 text-rose-500 border-rose-500/20"
                        }`}>
                          {m.status === "up" ? "UP" : m.status === "no-key" ? "SIN KEY" : "DOWN"}
                        </span>
                        {m.status === "up" && (
                          <span className="text-[10px] text-muted-foreground flex items-center gap-1">
                            <Clock className="h-2.5 w-2.5" /> {m.latencyMs}ms
                          </span>
                        )}
                      </div>
                    </div>

                    {/* Detalle expandido */}
                    {expanded === m.id && (
                      <div className="mt-3 pt-3 border-t border-border/50 space-y-2">
                        {m.error && (
                          <p className="text-[10px] text-rose-500 font-mono bg-rose-500/5 px-2 py-1 rounded">{m.error}</p>
                        )}
                        <div>
                          <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground mb-1">Usado en:</p>
                          <div className="flex flex-wrap gap-1">
                            {m.usedIn.map((u, i) => (
                              <span key={i} className={`text-[10px] px-2 py-0.5 rounded-full border ${providerBadge[m.provider] || "bg-muted text-muted-foreground border-border"}`}>
                                {u}
                              </span>
                            ))}
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          ))
        )}
      </div>
    </section>
  );
}
