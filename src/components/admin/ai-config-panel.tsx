"use client";

import * as React from "react";
import { toast } from "sonner";
import {
  RefreshCw, CheckCircle2, XCircle, KeyRound, Clock, Plus, Trash2, Pencil,
  Eye, EyeOff, Save, X, ExternalLink, Cpu, Zap, AlertTriangle, Loader2,
} from "lucide-react";

interface Provider {
  id: string;
  nombre: string;
  base_url: string | null;
  activo: boolean;
  orden: number;
  docs_url: string | null;
  api_key_masked: string | null;
  has_key: boolean;
}

interface Model {
  id: string;
  provider_id: string;
  modelo: string;
  proposito: string | null;
  usado_en: string[] | null;
  activo: boolean;
  orden: number;
  last_status: "up" | "down" | "no-key" | null;
  last_latency_ms: number | null;
  last_error: string | null;
  last_checked_at: string | null;
}

const providerStyle: Record<string, { grad: string; ring: string; badge: string }> = {
  google:     { grad: "from-violet-500 to-indigo-600", ring: "hover:border-violet-500/40", badge: "bg-violet-500/10 text-violet-500 border-violet-500/20" },
  groq:       { grad: "from-orange-500 to-red-600",    ring: "hover:border-orange-500/40", badge: "bg-orange-500/10 text-orange-500 border-orange-500/20" },
  openrouter: { grad: "from-blue-500 to-cyan-600",     ring: "hover:border-blue-500/40",   badge: "bg-blue-500/10 text-blue-500 border-blue-500/20" },
  nvidia:     { grad: "from-green-500 to-emerald-600", ring: "hover:border-green-500/40",  badge: "bg-green-500/10 text-green-500 border-green-500/20" },
  openai:     { grad: "from-teal-500 to-cyan-600",     ring: "hover:border-teal-500/40",   badge: "bg-teal-500/10 text-teal-500 border-teal-500/20" },
};

const statusStyle = {
  up:       { Icon: CheckCircle2, cls: "text-emerald-500", bg: "bg-emerald-500/10 border-emerald-500/20", label: "UP" },
  down:     { Icon: XCircle,      cls: "text-rose-500",    bg: "bg-rose-500/10 border-rose-500/20",       label: "DOWN" },
  "no-key": { Icon: KeyRound,     cls: "text-amber-500",   bg: "bg-amber-500/10 border-amber-500/20",     label: "SIN KEY" },
};

export function AiConfigPanel() {
  const [providers, setProviders] = React.useState<Provider[]>([]);
  const [models, setModels] = React.useState<Model[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [validating, setValidating] = React.useState(false);
  const [validatingOne, setValidatingOne] = React.useState<string | null>(null);
  const [tableError, setTableError] = React.useState<string | null>(null);

  // Edición de keys
  const [editKey, setEditKey] = React.useState<string | null>(null);
  const [keyValue, setKeyValue] = React.useState("");
  const [showKey, setShowKey] = React.useState(false);
  const [savingKey, setSavingKey] = React.useState(false);

  // Nuevo modelo
  const [addingFor, setAddingFor] = React.useState<string | null>(null);
  const [newModel, setNewModel] = React.useState({ modelo: "", proposito: "" });

  // Edición de modelo
  const [editModel, setEditModel] = React.useState<string | null>(null);
  const [editModelData, setEditModelData] = React.useState({ modelo: "", proposito: "" });

  async function load() {
    setLoading(true);
    try {
      const res = await fetch("/api/admin/ai-config", { cache: "no-store" });
      const data = await res.json();
      if (data.error) { setTableError(data.error); return; }
      setTableError(null);
      setProviders(data.providers ?? []);
      setModels(data.models ?? []);
    } catch (e: any) {
      setTableError(e.message);
    } finally {
      setLoading(false);
    }
  }

  React.useEffect(() => { load(); }, []);

  async function saveKey(providerId: string) {
    setSavingKey(true);
    try {
      const res = await fetch("/api/admin/ai-config", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ provider_id: providerId, api_key: keyValue }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      toast.success("API key guardada");
      setEditKey(null); setKeyValue(""); setShowKey(false);
      await load();
    } catch (e: any) { toast.error(e.message); }
    finally { setSavingKey(false); }
  }

  async function toggleProvider(p: Provider) {
    try {
      const res = await fetch("/api/admin/ai-config", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ provider_id: p.id, activo: !p.activo }),
      });
      if (!res.ok) throw new Error((await res.json()).error);
      setProviders(prev => prev.map(x => x.id === p.id ? { ...x, activo: !x.activo } : x));
    } catch (e: any) { toast.error(e.message); }
  }

  async function addModel(providerId: string) {
    if (!newModel.modelo.trim()) { toast.error("Ingrese el nombre del modelo"); return; }
    try {
      const res = await fetch("/api/admin/ai-config/models", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ provider_id: providerId, ...newModel, orden: 99 }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      toast.success("Modelo agregado");
      setAddingFor(null); setNewModel({ modelo: "", proposito: "" });
      await load();
    } catch (e: any) { toast.error(e.message); }
  }

  async function saveModel(id: string) {
    try {
      const res = await fetch("/api/admin/ai-config/models", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, ...editModelData }),
      });
      if (!res.ok) throw new Error((await res.json()).error);
      toast.success("Modelo actualizado");
      setEditModel(null);
      await load();
    } catch (e: any) { toast.error(e.message); }
  }

  async function deleteModel(m: Model) {
    if (!confirm(`¿Eliminar el modelo "${m.modelo}"?`)) return;
    try {
      const res = await fetch(`/api/admin/ai-config/models?id=${m.id}`, { method: "DELETE" });
      if (!res.ok) throw new Error((await res.json()).error);
      toast.success("Modelo eliminado");
      setModels(prev => prev.filter(x => x.id !== m.id));
    } catch (e: any) { toast.error(e.message); }
  }

  async function toggleModel(m: Model) {
    try {
      const res = await fetch("/api/admin/ai-config/models", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: m.id, activo: !m.activo }),
      });
      if (!res.ok) throw new Error((await res.json()).error);
      setModels(prev => prev.map(x => x.id === m.id ? { ...x, activo: !x.activo } : x));
    } catch (e: any) { toast.error(e.message); }
  }

  async function validateAll() {
    setValidating(true);
    try {
      const res = await fetch("/api/admin/ai-config/validate", { method: "POST", headers: { "Content-Type": "application/json" }, body: "{}" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      const up = data.results.filter((r: any) => r.status === "up").length;
      toast.success(`${up} de ${data.results.length} modelos operativos`);
      await load();
    } catch (e: any) { toast.error(e.message); }
    finally { setValidating(false); }
  }

  async function validateOne(m: Model) {
    setValidatingOne(m.id);
    try {
      const res = await fetch("/api/admin/ai-config/validate", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ model_id: m.id }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      const r = data.results[0];
      if (r.status === "up") toast.success(`${m.modelo}: UP (${r.latencyMs}ms)`);
      else toast.error(`${m.modelo}: ${r.status.toUpperCase()} — ${r.error || ""}`);
      await load();
    } catch (e: any) { toast.error(e.message); }
    finally { setValidatingOne(null); }
  }

  const upCount = models.filter(m => m.last_status === "up").length;
  const downCount = models.filter(m => m.last_status === "down").length;
  const noKeyCount = models.filter(m => m.last_status === "no-key").length;
  const unchecked = models.filter(m => !m.last_status).length;

  if (tableError) {
    return (
      <section className="rounded-2xl border-2 border-amber-500/40 bg-amber-500/5 p-6">
        <div className="flex items-start gap-3">
          <AlertTriangle className="h-5 w-5 text-amber-500 shrink-0 mt-0.5" />
          <div>
            <h3 className="font-bold text-amber-600">Tablas de configuración no encontradas</h3>
            <p className="text-sm text-muted-foreground mt-1">
              Debe crear las tablas <code className="font-mono text-xs bg-muted px-1 rounded">sek_ai_providers</code> y{" "}
              <code className="font-mono text-xs bg-muted px-1 rounded">sek_ai_models</code> ejecutando el SQL de{" "}
              <code className="font-mono text-xs bg-muted px-1 rounded">scripts/ai-tables.sql</code> en el editor SQL de Supabase.
            </p>
            <p className="text-[11px] text-muted-foreground mt-2 font-mono">{tableError}</p>
          </div>
        </div>
      </section>
    );
  }

  return (
    <section className="rounded-2xl border border-border bg-card overflow-hidden">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 px-6 py-5 border-b border-border bg-gradient-to-r from-muted/40 to-transparent">
        <div>
          <h2 className="text-sm font-bold uppercase tracking-widest text-muted-foreground flex items-center gap-2">
            <Cpu className="h-4 w-4" /> Proveedores y Modelos IA
          </h2>
          <p className="text-[11px] text-muted-foreground mt-0.5">
            Gestione API keys, agregue o quite modelos y valide su disponibilidad
          </p>
        </div>
        <button onClick={validateAll} disabled={validating || loading}
          className="flex items-center justify-center gap-2 px-4 py-2 rounded-xl bg-brand-600 text-white text-sm font-semibold hover:bg-brand-700 disabled:opacity-50 transition-colors shadow-lg shadow-brand-600/25">
          {validating ? <Loader2 className="h-4 w-4 animate-spin" /> : <Zap className="h-4 w-4" />}
          {validating ? "Validando..." : "Validar todos"}
        </button>
      </div>

      {/* KPIs */}
      {models.length > 0 && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 px-6 py-4 border-b border-border">
          {[
            { n: upCount, label: "Operativos", cls: "text-emerald-500", bg: "bg-emerald-500/10 border-emerald-500/20" },
            { n: downCount, label: "Caídos", cls: "text-rose-500", bg: "bg-rose-500/10 border-rose-500/20" },
            { n: noKeyCount, label: "Sin key", cls: "text-amber-500", bg: "bg-amber-500/10 border-amber-500/20" },
            { n: unchecked, label: "Sin validar", cls: "text-muted-foreground", bg: "bg-muted/40 border-border" },
          ].map(k => (
            <div key={k.label} className={`rounded-xl border p-3 text-center ${k.bg}`}>
              <p className={`text-2xl font-black tabular-nums ${k.cls}`}>{k.n}</p>
              <p className="text-[10px] font-bold uppercase tracking-wider opacity-80 mt-0.5">{k.label}</p>
            </div>
          ))}
        </div>
      )}

      {/* Proveedores */}
      <div className="divide-y divide-border">
        {loading ? (
          <div className="p-6 space-y-3">
            {[1, 2, 3].map(i => <div key={i} className="h-24 rounded-xl bg-muted/40 animate-pulse" />)}
          </div>
        ) : providers.map(p => {
          const st = providerStyle[p.id] || providerStyle.openrouter;
          const pModels = models.filter(m => m.provider_id === p.id);
          const isEditingKey = editKey === p.id;

          return (
            <div key={p.id} className={`p-6 ${!p.activo ? "opacity-50" : ""}`}>
              {/* Header del proveedor */}
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-4">
                <div className="flex items-center gap-3">
                  <span className={`inline-flex h-10 w-10 rounded-2xl bg-gradient-to-br ${st.grad} shadow-lg items-center justify-center`}>
                    <Cpu className="h-5 w-5 text-white" />
                  </span>
                  <div>
                    <div className="flex items-center gap-2">
                      <h3 className="font-bold">{p.nombre}</h3>
                      {p.docs_url && (
                        <a href={p.docs_url} target="_blank" rel="noreferrer"
                          className="text-muted-foreground hover:text-brand-600 transition-colors" title="Obtener API key">
                          <ExternalLink className="h-3.5 w-3.5" />
                        </a>
                      )}
                    </div>
                    <p className="text-[11px] text-muted-foreground">{pModels.length} modelo{pModels.length !== 1 ? "s" : ""}</p>
                  </div>
                </div>
                <button onClick={() => toggleProvider(p)}
                  className={`relative shrink-0 h-6 w-11 rounded-full transition-colors ${p.activo ? "bg-emerald-500" : "bg-muted-foreground/30"}`}
                  title={p.activo ? "Desactivar proveedor" : "Activar proveedor"}>
                  <span className={`absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-transform ${p.activo ? "translate-x-5" : "translate-x-0.5"}`} />
                </button>
              </div>

              {/* API Key */}
              <div className="mb-4 rounded-xl border border-border bg-muted/30 p-3.5">
                <div className="flex items-center justify-between gap-3 mb-2">
                  <label className="text-[10px] font-black uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
                    <KeyRound className="h-3 w-3" /> API Key
                  </label>
                  {!isEditingKey && (
                    <button onClick={() => { setEditKey(p.id); setKeyValue(""); setShowKey(false); }}
                      className="text-[11px] font-semibold text-brand-600 hover:text-brand-700 flex items-center gap-1">
                      <Pencil className="h-3 w-3" /> {p.has_key ? "Cambiar" : "Configurar"}
                    </button>
                  )}
                </div>

                {isEditingKey ? (
                  <div className="flex items-center gap-2">
                    <div className="relative flex-1">
                      <input
                        type={showKey ? "text" : "password"}
                        value={keyValue}
                        onChange={e => setKeyValue(e.target.value)}
                        placeholder="Pegue la API key aquí"
                        autoFocus
                        className="w-full pl-3 pr-9 py-2 rounded-lg border border-border bg-background text-sm font-mono focus:outline-none focus:ring-2 focus:ring-brand-500/40"
                      />
                      <button type="button" onClick={() => setShowKey(v => !v)}
                        className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground">
                        {showKey ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                      </button>
                    </div>
                    <button onClick={() => saveKey(p.id)} disabled={savingKey}
                      className="p-2 rounded-lg bg-emerald-500/10 text-emerald-600 hover:bg-emerald-500/20 disabled:opacity-50 transition-colors" title="Guardar">
                      {savingKey ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                    </button>
                    <button onClick={() => { setEditKey(null); setKeyValue(""); }}
                      className="p-2 rounded-lg bg-muted text-muted-foreground hover:bg-muted/70 transition-colors" title="Cancelar">
                      <X className="h-4 w-4" />
                    </button>
                  </div>
                ) : (
                  <p className={`text-sm font-mono ${p.has_key ? "" : "text-amber-500 italic"}`}>
                    {p.has_key ? p.api_key_masked : "Sin configurar"}
                  </p>
                )}
              </div>

              {/* Modelos */}
              <div className="space-y-2">
                {pModels.map(m => {
                  const ss = m.last_status ? statusStyle[m.last_status] : null;
                  const isEditing = editModel === m.id;

                  return (
                    <div key={m.id}
                      className={`group rounded-xl border border-border bg-card p-3.5 ${st.ring} transition-all ${!m.activo ? "opacity-50" : ""}`}>
                      {isEditing ? (
                        <div className="space-y-2">
                          <input value={editModelData.modelo} onChange={e => setEditModelData(d => ({ ...d, modelo: e.target.value }))}
                            placeholder="Nombre del modelo" autoFocus
                            className="w-full px-3 py-2 rounded-lg border border-border bg-background text-sm font-mono focus:outline-none focus:ring-2 focus:ring-brand-500/40" />
                          <input value={editModelData.proposito} onChange={e => setEditModelData(d => ({ ...d, proposito: e.target.value }))}
                            placeholder="Propósito"
                            className="w-full px-3 py-2 rounded-lg border border-border bg-background text-sm focus:outline-none focus:ring-2 focus:ring-brand-500/40" />
                          <div className="flex gap-2">
                            <button onClick={() => saveModel(m.id)}
                              className="flex-1 py-1.5 rounded-lg bg-emerald-500/10 text-emerald-600 text-xs font-semibold hover:bg-emerald-500/20 transition-colors">
                              Guardar
                            </button>
                            <button onClick={() => setEditModel(null)}
                              className="flex-1 py-1.5 rounded-lg bg-muted text-muted-foreground text-xs font-semibold hover:bg-muted/70 transition-colors">
                              Cancelar
                            </button>
                          </div>
                        </div>
                      ) : (
                        <div className="flex items-center justify-between gap-3">
                          <div className="flex items-center gap-3 min-w-0">
                            {ss ? (
                              <div className={`h-8 w-8 rounded-lg grid place-items-center border shrink-0 ${ss.bg}`}>
                                <ss.Icon className={`h-4 w-4 ${ss.cls}`} />
                              </div>
                            ) : (
                              <div className="h-8 w-8 rounded-lg grid place-items-center border border-border bg-muted/40 shrink-0">
                                <Cpu className="h-4 w-4 text-muted-foreground" />
                              </div>
                            )}
                            <div className="min-w-0">
                              <p className="text-sm font-semibold font-mono truncate">{m.modelo}</p>
                              <p className="text-[11px] text-muted-foreground truncate">{m.proposito || "Sin propósito definido"}</p>
                              {m.last_error && (
                                <p className="text-[10px] text-rose-500 font-mono truncate mt-0.5">{m.last_error}</p>
                              )}
                            </div>
                          </div>

                          <div className="flex items-center gap-2 shrink-0">
                            {ss && (
                              <div className="flex flex-col items-end">
                                <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full border ${ss.bg} ${ss.cls}`}>{ss.label}</span>
                                {m.last_status === "up" && m.last_latency_ms != null && (
                                  <span className="text-[10px] text-muted-foreground flex items-center gap-0.5 mt-0.5">
                                    <Clock className="h-2.5 w-2.5" /> {m.last_latency_ms}ms
                                  </span>
                                )}
                              </div>
                            )}
                            <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                              <button onClick={() => validateOne(m)} disabled={validatingOne === m.id}
                                className="p-1.5 rounded-lg hover:bg-muted text-muted-foreground hover:text-brand-600 transition-colors" title="Validar">
                                {validatingOne === m.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}
                              </button>
                              <button onClick={() => { setEditModel(m.id); setEditModelData({ modelo: m.modelo, proposito: m.proposito || "" }); }}
                                className="p-1.5 rounded-lg hover:bg-muted text-muted-foreground hover:text-foreground transition-colors" title="Editar">
                                <Pencil className="h-3.5 w-3.5" />
                              </button>
                              <button onClick={() => deleteModel(m)}
                                className="p-1.5 rounded-lg hover:bg-rose-500/10 text-muted-foreground hover:text-rose-500 transition-colors" title="Eliminar">
                                <Trash2 className="h-3.5 w-3.5" />
                              </button>
                            </div>
                            <button onClick={() => toggleModel(m)}
                              className={`relative shrink-0 h-5 w-9 rounded-full transition-colors ${m.activo ? "bg-emerald-500" : "bg-muted-foreground/30"}`}
                              title={m.activo ? "Desactivar" : "Activar"}>
                              <span className={`absolute top-0.5 h-4 w-4 rounded-full bg-white shadow transition-transform ${m.activo ? "translate-x-4" : "translate-x-0.5"}`} />
                            </button>
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })}

                {/* Agregar modelo */}
                {addingFor === p.id ? (
                  <div className="rounded-xl border-2 border-dashed border-brand-500/40 bg-brand-500/5 p-3.5 space-y-2">
                    <input value={newModel.modelo} onChange={e => setNewModel(d => ({ ...d, modelo: e.target.value }))}
                      placeholder="Nombre exacto del modelo (ej: gemini-3.5-flash)" autoFocus
                      className="w-full px-3 py-2 rounded-lg border border-border bg-background text-sm font-mono focus:outline-none focus:ring-2 focus:ring-brand-500/40" />
                    <input value={newModel.proposito} onChange={e => setNewModel(d => ({ ...d, proposito: e.target.value }))}
                      placeholder="Propósito (ej: Chat principal)"
                      className="w-full px-3 py-2 rounded-lg border border-border bg-background text-sm focus:outline-none focus:ring-2 focus:ring-brand-500/40" />
                    <div className="flex gap-2">
                      <button onClick={() => addModel(p.id)}
                        className="flex-1 py-1.5 rounded-lg bg-brand-600 text-white text-xs font-semibold hover:bg-brand-700 transition-colors">
                        Agregar
                      </button>
                      <button onClick={() => { setAddingFor(null); setNewModel({ modelo: "", proposito: "" }); }}
                        className="flex-1 py-1.5 rounded-lg bg-muted text-muted-foreground text-xs font-semibold hover:bg-muted/70 transition-colors">
                        Cancelar
                      </button>
                    </div>
                  </div>
                ) : (
                  <button onClick={() => setAddingFor(p.id)}
                    className="w-full py-2.5 rounded-xl border-2 border-dashed border-border text-muted-foreground text-xs font-semibold hover:border-brand-500/40 hover:text-brand-600 hover:bg-brand-500/5 transition-all flex items-center justify-center gap-1.5">
                    <Plus className="h-3.5 w-3.5" /> Agregar modelo a {p.nombre}
                  </button>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}
