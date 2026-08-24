"use client";

import * as React from "react";
import { RefreshCw, CheckCircle2, XCircle, Zap, Clock, KeyRound, ChevronDown, Cpu } from "lucide-react";

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

const providerConfig: Record<string, { color: string; badge: string; icon: string }> = {
  "Google AI Studio": { color: "hover:border-violet-500/40", badge: "bg-violet-500/10 text-violet-500 border-violet-500/20", icon: "from-violet-500 to-indigo-600" },
  "Groq":             { color: "hover:border-orange-500/40", badge: "bg-orange-500/10 text-orange-500 border-orange-500/20", icon: "from-orange-500 to-red-600" },
  "OpenRouter":       { color: "hover:border-blue-500/40", badge: "bg-blue-500/10 text-blue-500 border-blue-500/20", icon: "from-blue-500 to-cyan-600" },
  "NVIDIA NIM":       { color: "hover:border-green-500/40", badge: "bg-green-500/10 text-green-500 border-green-500/20", icon: "from-green-500 to-emerald-600" },
  "OpenAI":           { color: "hover:border-teal-500/40", badge: "bg-teal-500/10 text-teal-500 border-teal-500/20", icon: "from-teal-500 to-cyan-600" },
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
      if (data?.models) { setModels(data.models); setLastUpdate(new Date()); }
    } catch (e) { console.error("Error fetching IA status:", e); }
    finally { setLoading(false); }
  }

  React.useEffect(() => { fetchStatus(); }, []);

  const upCount = models.filter(m => m.status === "up").length;
  const downCount = models.filter(m => m.status === "down").length;
  const noKeyCount = models.filter(m => m.status === "no-key").length;

  const byProvider = models.reduce((acc, m) => {
    if (!acc[m.provider]) acc[m.provider] = [];
    acc[m.provider].push(m);
    return acc;
  }, {} as Record<string, ModelCheck[]>);

  const statusConfig = {
    up:     { icon: CheckCircle2, color: "text-emerald-500", bg: "bg-emerald-500/10 border-emerald-500/20", label: "UP" },
    down:   { icon: XCircle,      color: "text-rose-500",    bg: "bg-rose-500/10 border-rose-500/20",       label: "DOWN" },
    "no-key": { icon: KeyRound,   color: "text-amber-500",   bg: "bg-amber-500/10 border-amber-500/20",     label: "SIN KEY" },
  };

  return (
    <section className="rounded-2xl border border-border bg-card p-6">
      <div className="flex items-center justify-between mb-5">
        <h2 className="text-sm font-bold uppercase tracking-widest text-muted-foreground flex items-center gap-2">
          <Cpu className="h-4 w-4" /> Estado de Modelos IA
        </h2>
        <div className="flex items-center gap-3">
          {lastUpdate && (
            <span className="text-[10px] text-muted-foreground" suppressHydrationWarning>
              {lastUpdate.toLocaleTimeString("es-CR")}
            </span>
          )}
          <button onClick={fetchStatus} disabled={loading}
            className="flex items-center gap-1.5 text-xs font-semibold text-brand-600 hover:text-brand-700 disabled:opacity-50 transition-colors">
            <RefreshCw className={`h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`} /> Verificar
          </button>
        </div>
      </div>

      {/* KPIs resumen */}
      {models.length > 0 && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-6">
          <div className="rounded-xl bg-emerald-500/10 border border-emerald-500/20 p-3 text-center">
            <p className="text-2xl font-black text-emerald-500 tabular-nums">{upCount}</p>
            <p className="text-[10px] font-bold uppercase tracking-wider text-emerald-600/80 mt-0.5">Operativos</p>
          </div>
          <div className="rounded-xl bg-rose-500/10 border border-rose-500/20 p-3 text-center">
            <p className="text-2xl font-black text-rose-500 tabular-nums">{downCount}</p>
            <p className="text-[10px] font-bold uppercase tracking-wider text-rose-600/80 mt-0.5">Caídos</p>
          </div>
          <div className="rounded-xl bg-amber-500/10 border border-amber-500/20 p-3 text-center">
            <p className="text-2xl font-black text-amber-500 tabular-nums">{noKeyCount}</p>
            <p className="text-[10px] font-bold uppercase tracking-wider text-amber-600/80 mt-0.5">Sin API Key</p>
          </div>
          <div className="rounded-xl bg-muted/40 border border-border p-3 text-center">
            <p className="text-2xl font-black text-muted-foreground tabular-nums">{models.length}</p>
            <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground mt-0.5">Total</p>
          </div>
        </div>
      )}

      {/* Modelos por provider */}
      <div className="space-y-5">
        {loading && models.length === 0 ? (
          <div className="space-y-3">
            {[1, 2, 3, 4, 5].map(i => (
              <div key={i} className="h-16 rounded-xl bg-muted/40 border border-border animate-pulse" />
            ))}
          </div>
        ) : models.length === 0 ? (
          <p className="text-xs text-muted-foreground italic py-4 text-center">No se pudieron verificar los modelos.</p>
        ) : (
          Object.entries(byProvider).map(([provider, providerModels]) => {
            const cfg = providerConfig[provider] || providerConfig["OpenRouter"];
            return (
              <div key={provider}>
                <div className="flex items-center gap-2 mb-2.5">
                  <span className={`inline-flex h-5 w-5 rounded-md bg-gradient-to-br ${cfg.icon} shadow-sm`} />
                  <h3 className="text-[11px] font-black uppercase tracking-widest text-muted-foreground">{provider}</h3>
                  <span className="text-[10px] text-muted-foreground">({providerModels.length})</span>
                </div>
                <div className="space-y-2">
                  {providerModels.map((m) => {
                    const sc = statusConfig[m.status];
                    const StatusIcon = sc.icon;
                    const isExpanded = expanded === m.id;
                    return (
                      <div key={m.id}
                        className={`group relative overflow-hidden rounded-xl border border-border bg-card p-3.5 ${cfg.color} transition-all duration-300`}>
                        <div className="absolute inset-0 bg-gradient-to-br from-violet-500/5 to-transparent opacity-0 group-hover:opacity-100 transition-opacity" />
                        <div className="relative">
                          <div className="flex items-center justify-between cursor-pointer" onClick={() => setExpanded(isExpanded ? null : m.id)}>
                            <div className="flex items-center gap-3 min-w-0">
                              <div className={`h-8 w-8 rounded-lg grid place-items-center border shrink-0 ${sc.bg}`}>
                                <StatusIcon className={`h-4 w-4 ${sc.color}`} />
                              </div>
                              <div className="min-w-0">
                                <p className="text-sm font-semibold font-mono truncate">{m.model}</p>
                                <p className="text-[11px] text-muted-foreground truncate">{m.purpose}</p>
                              </div>
                            </div>
                            <div className="flex flex-col items-end gap-1 shrink-0 ml-2">
                              <span className={`text-[10px] font-bold px-2.5 py-1 rounded-full border ${sc.bg} ${sc.color}`}>
                                {sc.label}
                              </span>
                              {m.status === "up" && (
                                <span className="text-[10px] text-muted-foreground flex items-center gap-1">
                                  <Clock className="h-2.5 w-2.5" /> {m.latencyMs}ms
                                </span>
                              )}
                            </div>
                          </div>

                          {isExpanded && (
                            <div className="mt-3 pt-3 border-t border-border/50 space-y-2">
                              {m.error && (
                                <p className="text-[10px] text-rose-500 font-mono bg-rose-500/5 px-2 py-1 rounded">{m.error}</p>
                              )}
                              <div>
                                <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground mb-1.5">Usado en:</p>
                                <div className="flex flex-wrap gap-1.5">
                                  {m.usedIn.map((u, i) => (
                                    <span key={i} className={`text-[10px] px-2 py-0.5 rounded-full border ${cfg.badge}`}>
                                      {u}
                                    </span>
                                  ))}
                                </div>
                              </div>
                            </div>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })
        )}
      </div>
    </section>
  );
}
