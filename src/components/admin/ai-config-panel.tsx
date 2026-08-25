"use client";

import * as React from "react";
import { toast } from "sonner";
import {
  RefreshCw, CheckCircle2, XCircle, KeyRound, Clock, Plus, Trash2, Pencil,
  Eye, EyeOff, Save, X, ExternalLink, Cpu, Zap, AlertTriangle, Loader2,
  ShieldCheck, ShieldAlert, ShieldQuestion, ChevronRight,
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
  key_status: "valid" | "invalid" | "no-key" | "unchecked";
  models_up: number;
  models_total: number;
}

interface Model {
  id: string;
  provider_id: string;
  modelo: string;
  proposito: string | null;
  usado_en: string[] | null;
  activo: boolean;
  orden: number;
  roles: string[] | null;
  last_status: "up" | "down" | "no-key" | null;
  last_latency_ms: number | null;
  last_error: string | null;
  last_checked_at: string | null;
}

interface RoleDef {
  id: string;
  nombre: string;
  descripcion: string | null;
}

const ROLE_LABELS: Record<string, string> = {
  chat: "Chat", web_search: "Web", vision: "Visión", transcribe: "Audio",
  meta_chat: "Meta", learn: "Aprender", auto_close: "Cierre", extract: "Extraer", activity: "Actividad",
};

const P: Record<string, { grad: string; accent: string; soft: string; text: string }> = {
  google:     { grad: "from-violet-500 to-indigo-600",  accent: "bg-violet-500",  soft: "bg-violet-500/10 border-violet-500/20",  text: "text-violet-500" },
  groq:       { grad: "from-orange-500 to-red-600",     accent: "bg-orange-500",  soft: "bg-orange-500/10 border-orange-500/20",  text: "text-orange-500" },
  openrouter: { grad: "from-sky-500 to-blue-600",       accent: "bg-sky-500",     soft: "bg-sky-500/10 border-sky-500/20",        text: "text-sky-500" },
  nvidia:     { grad: "from-lime-500 to-emerald-600",   accent: "bg-lime-500",    soft: "bg-lime-500/10 border-lime-500/20",      text: "text-lime-500" },
  openai:     { grad: "from-teal-500 to-cyan-600",      accent: "bg-teal-500",    soft: "bg-teal-500/10 border-teal-500/20",      text: "text-teal-500" },
};
const fallbackP = P.openrouter;

const KEY_ST = {
  valid:     { Icon: ShieldCheck,    label: "Key válida",     cls: "text-emerald-500", chip: "bg-emerald-500/10 border-emerald-500/25 text-emerald-500" },
  invalid:   { Icon: ShieldAlert,    label: "Key rechazada",  cls: "text-rose-500",    chip: "bg-rose-500/10 border-rose-500/25 text-rose-500" },
  "no-key":  { Icon: KeyRound,       label: "Sin configurar", cls: "text-amber-500",   chip: "bg-amber-500/10 border-amber-500/25 text-amber-500" },
  unchecked: { Icon: ShieldQuestion, label: "Sin validar",    cls: "text-muted-foreground", chip: "bg-muted/60 border-border text-muted-foreground" },
} as const;

const MODEL_ST = {
  up:       { dot: "bg-emerald-500", chip: "bg-emerald-500/10 border-emerald-500/25 text-emerald-500", label: "UP" },
  down:     { dot: "bg-rose-500",    chip: "bg-rose-500/10 border-rose-500/25 text-rose-500",          label: "DOWN" },
  "no-key": { dot: "bg-amber-500",   chip: "bg-amber-500/10 border-amber-500/25 text-amber-500",       label: "SIN KEY" },
} as const;

/** Plantillas de proveedores conocidos para agregar con un clic.
 *  Los que tienen {ACCOUNT_ID} requieren que el usuario reemplace el valor. */
const PROVIDER_PRESETS: { id: string; nombre: string; base_url: string; docs_url: string }[] = [
  { id: "deepseek",   nombre: "DeepSeek",   base_url: "https://api.deepseek.com/v1",                                   docs_url: "https://platform.deepseek.com/api_keys" },
  { id: "cloudflare", nombre: "Cloudflare", base_url: "https://api.cloudflare.com/client/v4/accounts/{ACCOUNT_ID}/ai/v1", docs_url: "https://developers.cloudflare.com/workers-ai/get-started/rest-api/" },
  { id: "novita",     nombre: "Novita AI",  base_url: "https://api.novita.ai/v3/openai",                               docs_url: "https://novita.ai/dashboard" },
  { id: "together",   nombre: "Together",   base_url: "https://api.together.xyz/v1",                                   docs_url: "https://api.together.ai/" },
  { id: "fireworks",  nombre: "Fireworks",  base_url: "https://api.fireworks.ai/inference/v1",                         docs_url: "https://fireworks.ai/api-keys" },
  { id: "mistral",    nombre: "Mistral",    base_url: "https://api.mistral.ai/v1",                                     docs_url: "https://console.mistral.ai/api-keys" },
  { id: "cohere",     nombre: "Cohere",     base_url: "https://api.cohere.ai/v1",                                      docs_url: "https://dashboard.cohere.com/api-keys" },
];

export function AiConfigPanel() {
  const [providers, setProviders] = React.useState<Provider[]>([]);
  const [models, setModels] = React.useState<Model[]>([]);
  const [roles, setRoles] = React.useState<RoleDef[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [validating, setValidating] = React.useState(false);
  const [busyModel, setBusyModel] = React.useState<string | null>(null);
  const [testingKey, setTestingKey] = React.useState<string | null>(null);
  const [keyResult, setKeyResult] = React.useState<Record<string, { status: string; latencyMs?: number; error?: string; modelsAvailable?: number | null; modelList?: string[] }>>({});
  const [tableError, setTableError] = React.useState<string | null>(null);
  const [collapsed, setCollapsed] = React.useState<Record<string, boolean>>({});

  const [editKey, setEditKey] = React.useState<string | null>(null);
  const [keyValue, setKeyValue] = React.useState("");
  const [showKey, setShowKey] = React.useState(false);
  const [savingKey, setSavingKey] = React.useState(false);

  const [addingFor, setAddingFor] = React.useState<string | null>(null);
  const [newModel, setNewModel] = React.useState({ modelo: "", proposito: "", roles: [] as string[] });

  const [editModel, setEditModel] = React.useState<string | null>(null);
  const [editData, setEditData] = React.useState({ modelo: "", proposito: "", roles: [] as string[] });

  const [showAddProvider, setShowAddProvider] = React.useState(false);
  const [newProvider, setNewProvider] = React.useState({ id: "", nombre: "", base_url: "", docs_url: "" });
  const [savingProvider, setSavingProvider] = React.useState(false);
  const [deletingProvider, setDeletingProvider] = React.useState<string | null>(null);
  const [accountId, setAccountId] = React.useState("");
  const [editBaseUrl, setEditBaseUrl] = React.useState<string | null>(null);
  const [baseUrlValue, setBaseUrlValue] = React.useState("");

  async function load() {
    setLoading(true);
    try {
      const res = await fetch("/api/admin/ai-config", { cache: "no-store" });
      const data = await res.json();
      if (data.error) { setTableError(data.error); return; }
      setTableError(null);
      setProviders(data.providers ?? []);
      setModels(data.models ?? []);
      setRoles(data.roles ?? []);
      // Guardar proveedores con key para auto-probar en el efecto
      providersWithKeyRef.current = (data.providers ?? []).filter((p: any) => p.has_key).map((p: any) => p.id);
    } catch (e: any) { setTableError(e.message); }
    finally { setLoading(false); }
  }

  const providersWithKeyRef = React.useRef<string[]>([]);

  React.useEffect(() => { load(); }, []);

  // Auto-probar las keys al cargar para tener las listas de modelos disponibles
  React.useEffect(() => {
    if (loading || providersWithKeyRef.current.length === 0) return;
    for (const id of providersWithKeyRef.current) {
      testKey(id).catch(() => {});
    }
  }, [loading]);

  async function api(url: string, init: RequestInit) {
    const res = await fetch(url, init);
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
    return data;
  }

  async function saveKey(id: string) {
    setSavingKey(true);
    try {
      await api("/api/admin/ai-config", {
        method: "PATCH", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ provider_id: id, api_key: keyValue }),
      });
      toast.success("API key guardada");
      setEditKey(null); setKeyValue(""); setShowKey(false);
      setKeyResult(r => { const n = { ...r }; delete n[id]; return n; });
      await load();
      // Probar la key y luego revalidar todos los modelos del proveedor
      await testKey(id);
      await revalidateProviderModels(id);
    } catch (e: any) { toast.error(e.message); }
    finally { setSavingKey(false); }
  }

  async function revalidateProviderModels(providerId: string) {
    const pModels = models.filter(m => m.provider_id === providerId && m.activo);
    for (const m of pModels) {
      setBusyModel(m.id);
      try {
        const data = await api("/api/admin/ai-config/validate", {
          method: "POST", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ model_id: m.id }),
        });
        const r = data.results[0];
        if (r.status === "up") toast.success(`${m.modelo} · UP · ${r.latencyMs}ms`);
        else if (r.status !== "no-key") toast.error(`${m.modelo} · ${r.status.toUpperCase()}: ${r.error || "sin detalle"}`);
      } catch (e: any) { toast.error(`${m.modelo} · error de validación: ${e.message}`); }
      finally { setBusyModel(null); }
    }
    await load();
  }

  async function testKey(id: string) {
    setTestingKey(id);
    try {
      const data = await api("/api/admin/ai-config/test-key", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ provider_id: id }),
      });
      setKeyResult(r => ({ ...r, [id]: data }));
      if (data.status === "valid") {
        toast.success(`Key válida${data.modelsAvailable ? ` · ${data.modelsAvailable} modelos disponibles` : ""} (${data.latencyMs}ms)`);
      } else {
        toast.error(`Key ${data.status === "no-key" ? "no configurada" : "rechazada"}: ${data.error || ""}`);
      }
    } catch (e: any) { toast.error(e.message); }
    finally { setTestingKey(null); }
  }

  async function toggleProvider(p: Provider) {
    try {
      await api("/api/admin/ai-config", {
        method: "PATCH", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ provider_id: p.id, activo: !p.activo }),
      });
      setProviders(prev => prev.map(x => x.id === p.id ? { ...x, activo: !x.activo } : x));
    } catch (e: any) { toast.error(e.message); }
  }

  async function addModel(pid: string) {
    if (!newModel.modelo.trim()) { toast.error("Ingrese el nombre del modelo"); return; }
    try {
      await api("/api/admin/ai-config/models", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ provider_id: pid, ...newModel, orden: 99 }),
      });
      toast.success("Modelo agregado");
      setAddingFor(null); setNewModel({ modelo: "", proposito: "", roles: [] });
      await load();
    } catch (e: any) { toast.error(e.message); }
  }

  async function saveModel(id: string) {
    try {
      await api("/api/admin/ai-config/models", {
        method: "PATCH", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, ...editData }),
      });
      toast.success("Modelo actualizado");
      setEditModel(null);
      await load();
    } catch (e: any) { toast.error(e.message); }
  }

  async function deleteModel(m: Model) {
    if (!confirm(`¿Eliminar el modelo "${m.modelo}"?`)) return;
    try {
      await api(`/api/admin/ai-config/models?id=${m.id}`, { method: "DELETE" });
      toast.success("Modelo eliminado");
      setModels(prev => prev.filter(x => x.id !== m.id));
    } catch (e: any) { toast.error(e.message); }
  }

  async function addProvider() {
    if (!newProvider.id.trim() || !newProvider.nombre.trim()) {
      toast.error("ID y nombre son obligatorios");
      return;
    }
    // Si la base_url tiene {ACCOUNT_ID}, reemplazarlo
    let baseUrl = newProvider.base_url.trim();
    if (baseUrl.includes("{ACCOUNT_ID}")) {
      if (!accountId.trim()) {
        toast.error("Debe ingresar el Account ID para este proveedor");
        return;
      }
      baseUrl = baseUrl.replace("{ACCOUNT_ID}", accountId.trim());
    }
    setSavingProvider(true);
    try {
      await api("/api/admin/ai-config", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...newProvider, base_url: baseUrl }),
      });
      toast.success("Proveedor agregado");
      setShowAddProvider(false);
      setNewProvider({ id: "", nombre: "", base_url: "", docs_url: "" });
      setAccountId("");
      await load();
    } catch (e: any) { toast.error(e.message); }
    finally { setSavingProvider(false); }
  }

  async function deleteProvider(p: Provider) {
    const pModels = models.filter(m => m.provider_id === p.id);
    const msg = pModels.length > 0
      ? `¿Eliminar el proveedor "${p.nombre}" y sus ${pModels.length} modelo(s)? Esta acción no se puede deshacer.`
      : `¿Eliminar el proveedor "${p.nombre}"?`;
    if (!confirm(msg)) return;
    setDeletingProvider(p.id);
    try {
      await api(`/api/admin/ai-config?provider_id=${p.id}`, { method: "DELETE" });
      toast.success("Proveedor eliminado");
      setModels(prev => prev.filter(m => m.provider_id !== p.id));
      await load();
    } catch (e: any) { toast.error(e.message); }
    finally { setDeletingProvider(null); }
  }

  async function saveBaseUrl(id: string) {
    try {
      await api("/api/admin/ai-config", {
        method: "PATCH", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ provider_id: id, base_url: baseUrlValue }),
      });
      toast.success("URL actualizada");
      setEditBaseUrl(null); setBaseUrlValue("");
      await load();
    } catch (e: any) { toast.error(e.message); }
  }

  async function toggleModel(m: Model) {
    try {
      await api("/api/admin/ai-config/models", {
        method: "PATCH", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: m.id, activo: !m.activo }),
      });
      setModels(prev => prev.map(x => x.id === m.id ? { ...x, activo: !x.activo } : x));
    } catch (e: any) { toast.error(e.message); }
  }

  async function validateAll() {
    setValidating(true);
    try {
      const data = await api("/api/admin/ai-config/validate", {
        method: "POST", headers: { "Content-Type": "application/json" }, body: "{}",
      });
      const up = data.results.filter((r: any) => r.status === "up").length;
      toast.success(`${up} de ${data.results.length} modelos operativos`);
      await load();
    } catch (e: any) { toast.error(e.message); }
    finally { setValidating(false); }
  }

  async function validateOne(m: Model) {
    setBusyModel(m.id);
    try {
      const data = await api("/api/admin/ai-config/validate", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ model_id: m.id }),
      });
      const r = data.results[0];
      if (r.status === "up") toast.success(`${m.modelo} · UP · ${r.latencyMs}ms`);
      else toast.error(`${m.modelo} · ${r.status.toUpperCase()} · ${r.error || ""}`);
      await load();
    } catch (e: any) { toast.error(e.message); }
    finally { setBusyModel(null); }
  }

  const up = models.filter(m => m.last_status === "up").length;
  const down = models.filter(m => m.last_status === "down").length;
  const nokey = models.filter(m => m.last_status === "no-key").length;
  const pend = models.filter(m => !m.last_status).length;
  const keysOk = providers.filter(p => p.key_status === "valid").length;

  if (tableError) {
    return (
      <section className="rounded-2xl border-2 border-amber-500/40 bg-amber-500/5 p-6">
        <div className="flex items-start gap-3">
          <AlertTriangle className="h-5 w-5 text-amber-500 shrink-0 mt-0.5" />
          <div>
            <h3 className="font-bold text-amber-600">Tablas de configuración no encontradas</h3>
            <p className="text-sm text-muted-foreground mt-1">
              Ejecute <code className="font-mono text-xs bg-muted px-1 rounded">scripts/ai-tables.sql</code> en el editor SQL de Supabase.
            </p>
            <p className="text-[11px] text-muted-foreground mt-2 font-mono">{tableError}</p>
          </div>
        </div>
      </section>
    );
  }

  return (
    <section className="relative overflow-hidden rounded-3xl border border-border bg-card">
      <div className="absolute -top-32 right-0 h-64 w-64 rounded-full bg-violet-500/5 blur-3xl pointer-events-none" />

      {/* ── HEADER ─────────────────────────────────────────────────────── */}
      <div className="relative flex flex-col lg:flex-row lg:items-center justify-between gap-4 px-6 py-5 border-b border-border">
        <div className="flex items-center gap-3">
          <span className="inline-flex h-11 w-11 items-center justify-center rounded-2xl bg-gradient-to-br from-slate-700 to-slate-900 dark:from-slate-600 dark:to-slate-800 shadow-lg">
            <Cpu className="h-5 w-5 text-white" />
          </span>
          <div>
            <h2 className="font-black text-lg tracking-tight">Proveedores y Modelos</h2>
            <p className="text-[11px] text-muted-foreground">
              {keysOk} de {providers.length} keys activas · {models.length} modelos registrados
            </p>
          </div>
        </div>
        <button onClick={validateAll} disabled={validating || loading}
          className="group relative flex items-center justify-center gap-2 px-5 py-2.5 rounded-xl bg-gradient-to-r from-brand-600 to-brand-700 text-white text-sm font-bold hover:from-brand-500 hover:to-brand-600 disabled:opacity-50 transition-all shadow-lg shadow-brand-600/25 hover:shadow-brand-600/40">
          {validating ? <Loader2 className="h-4 w-4 animate-spin" /> : <Zap className="h-4 w-4 group-hover:scale-110 transition-transform" />}
          {validating ? "Validando..." : "Validar todo"}
        </button>
      </div>

      {/* ── KPIs ───────────────────────────────────────────────────────── */}
      {models.length > 0 && (
        <div className="relative grid grid-cols-2 lg:grid-cols-4 divide-x divide-y lg:divide-y-0 divide-border border-b border-border">
          {[
            { n: up,    label: "Operativos",  cls: "text-emerald-500",      dot: "bg-emerald-500" },
            { n: down,  label: "Caídos",      cls: "text-rose-500",         dot: "bg-rose-500" },
            { n: nokey, label: "Sin key",     cls: "text-amber-500",        dot: "bg-amber-500" },
            { n: pend,  label: "Sin validar", cls: "text-muted-foreground", dot: "bg-muted-foreground/40" },
          ].map(k => (
            <div key={k.label} className="px-6 py-4">
              <div className="flex items-center gap-2">
                <span className={`h-1.5 w-1.5 rounded-full ${k.dot}`} />
                <p className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">{k.label}</p>
              </div>
              <p className={`text-3xl font-black tabular-nums mt-1 ${k.cls}`}>{k.n}</p>
            </div>
          ))}
        </div>
      )}

      {/* ── PROVEEDORES (con scroll) ───────────────────────────────────── */}
      <div className="relative divide-y divide-border overflow-y-auto" style={{ maxHeight: "min(70vh, 640px)" }}>
        {loading ? (
          <div className="p-6 space-y-4">
            {[1, 2, 3].map(i => <div key={i} className="h-28 rounded-2xl bg-muted/40 animate-pulse" />)}
          </div>
        ) : providers.map(p => {
          const st = P[p.id] || fallbackP;
          const pModels = models.filter(m => m.provider_id === p.id);
          const isEditingKey = editKey === p.id;
          const isEditingUrl = editBaseUrl === p.id;
          const live = keyResult[p.id];
          const ks = live
            ? (live.status === "valid" ? KEY_ST.valid : live.status === "no-key" ? KEY_ST["no-key"] : KEY_ST.invalid)
            : KEY_ST[p.key_status];
          const isCollapsed = collapsed[p.id];

          return (
            <div key={p.id} className={`relative ${!p.activo ? "opacity-45" : ""}`}>
              {/* barra de acento del proveedor */}
              <span className={`absolute left-0 top-0 bottom-0 w-[3px] ${st.accent}`} />

              <div className="pl-6 pr-6 py-5">
                {/* Cabecera del proveedor */}
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <button onClick={() => setCollapsed(c => ({ ...c, [p.id]: !c[p.id] }))}
                    className="flex items-center gap-3 group text-left">
                    <ChevronRight className={`h-4 w-4 text-muted-foreground transition-transform ${isCollapsed ? "" : "rotate-90"}`} />
                    <span className={`inline-flex h-9 w-9 rounded-xl bg-gradient-to-br ${st.grad} shadow-md items-center justify-center shrink-0`}>
                      <Cpu className="h-4 w-4 text-white" />
                    </span>
                    <span>
                      <span className="flex items-center gap-2">
                        <span className="font-bold group-hover:text-brand-600 transition-colors">{p.nombre}</span>
                        {p.docs_url && (
                          <a href={p.docs_url} target="_blank" rel="noreferrer" onClick={e => e.stopPropagation()}
                            className="text-muted-foreground hover:text-brand-600 transition-colors" title="Obtener API key">
                            <ExternalLink className="h-3.5 w-3.5" />
                          </a>
                        )}
                      </span>
                      <span className="block text-[11px] text-muted-foreground tabular-nums">
                        {p.models_up}/{p.models_total} modelos operativos
                      </span>
                    </span>
                  </button>

                  <div className="flex items-center gap-2.5">
                    {/* Estado de la KEY */}
                    <span className={`flex items-center gap-1.5 text-[10px] font-black uppercase tracking-wider px-2.5 py-1.5 rounded-full border ${ks.chip}`}>
                      <ks.Icon className="h-3 w-3" />
                      {ks.label}
                      {live?.status === "valid" && live.latencyMs != null && (
                        <span className="font-bold opacity-70 normal-case tabular-nums">· {live.latencyMs}ms</span>
                      )}
                    </span>
                    <button onClick={() => deleteProvider(p)} disabled={deletingProvider === p.id}
                      className="p-1.5 rounded-lg text-muted-foreground hover:text-rose-500 hover:bg-rose-500/10 transition-colors disabled:opacity-50"
                      title="Eliminar proveedor">
                      {deletingProvider === p.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Trash2 className="h-3.5 w-3.5" />}
                    </button>
                    <button onClick={() => toggleProvider(p)}
                      className={`relative shrink-0 h-6 w-11 rounded-full transition-colors ${p.activo ? "bg-emerald-500" : "bg-muted-foreground/30"}`}
                      title={p.activo ? "Desactivar proveedor" : "Activar proveedor"}>
                      <span className={`absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-transform ${p.activo ? "translate-x-5" : "translate-x-0.5"}`} />
                    </button>
                  </div>
                </div>

                {!isCollapsed && (
                  <div className="mt-4 space-y-3">
                    {/* ── API KEY ─────────────────────────────────────── */}
                    <div className={`rounded-2xl border p-4 ${st.soft}`}>
                      <div className="flex items-center justify-between gap-3 mb-2.5">
                        <label className="text-[10px] font-black uppercase tracking-widest text-muted-foreground flex items-center gap-1.5">
                          <KeyRound className="h-3 w-3" /> API Key
                        </label>
                        {!isEditingKey && (
                          <div className="flex items-center gap-3">
                            {p.has_key && (
                              <button onClick={() => testKey(p.id)} disabled={testingKey === p.id}
                                className="text-[11px] font-bold text-brand-600 hover:text-brand-700 disabled:opacity-50 flex items-center gap-1 transition-colors">
                                {testingKey === p.id ? <Loader2 className="h-3 w-3 animate-spin" /> : <ShieldCheck className="h-3 w-3" />}
                                Probar key
                              </button>
                            )}
                            <button onClick={() => { setEditKey(p.id); setKeyValue(""); setShowKey(false); }}
                              className="text-[11px] font-bold text-brand-600 hover:text-brand-700 flex items-center gap-1 transition-colors">
                              <Pencil className="h-3 w-3" /> {p.has_key ? "Cambiar" : "Configurar"}
                            </button>
                          </div>
                        )}
                      </div>

                      {isEditingKey ? (
                        <div className="flex items-center gap-2">
                          <div className="relative flex-1">
                            <input type={showKey ? "text" : "password"} value={keyValue}
                              onChange={e => setKeyValue(e.target.value)}
                              onKeyDown={e => { if (e.key === "Enter") saveKey(p.id); if (e.key === "Escape") setEditKey(null); }}
                              placeholder="Pegue la API key y presione Enter" autoFocus
                              className="w-full pl-3 pr-9 py-2.5 rounded-xl border border-border bg-background text-sm font-mono focus:outline-none focus:ring-2 focus:ring-brand-500/40" />
                            <button type="button" onClick={() => setShowKey(v => !v)}
                              className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors">
                              {showKey ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                            </button>
                          </div>
                          <button onClick={() => saveKey(p.id)} disabled={savingKey}
                            className="p-2.5 rounded-xl bg-emerald-500/15 text-emerald-600 hover:bg-emerald-500/25 disabled:opacity-50 transition-colors" title="Guardar y probar">
                            {savingKey ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                          </button>
                          <button onClick={() => { setEditKey(null); setKeyValue(""); }}
                            className="p-2.5 rounded-xl bg-muted text-muted-foreground hover:bg-muted/70 transition-colors" title="Cancelar">
                            <X className="h-4 w-4" />
                          </button>
                        </div>
                      ) : (
                        <>
                          <p className={`text-sm font-mono tracking-tight ${p.has_key ? "" : "text-amber-500 italic"}`}>
                            {p.has_key ? p.api_key_masked : "Sin configurar — pegue la key para habilitar este proveedor"}
                          </p>
                          {live?.error && (
                            <p className="text-[10px] text-rose-500 font-mono mt-1.5 bg-rose-500/5 px-2 py-1 rounded">{live.error}</p>
                          )}
                          {live?.status === "valid" && live.modelsAvailable != null && (
                            <div className="mt-2">
                              <p className="text-[10px] text-emerald-600 font-bold">{live.modelsAvailable} modelos disponibles en la cuenta</p>
                              {live.modelList && live.modelList.length > 0 && (
                                <div className="mt-1.5 max-h-32 overflow-y-auto rounded-lg bg-emerald-500/5 border border-emerald-500/15 p-2">
                                  <div className="flex flex-wrap gap-1">
                                    {live.modelList.map(m => {
                                      const yaAgregado = pModels.some(pm => pm.modelo === m);
                                      return (
                                        <span key={m}
                                          className={`text-[10px] font-mono px-1.5 py-0.5 rounded border ${yaAgregado ? "bg-brand-500/15 text-brand-600 border-brand-500/30" : "bg-background text-muted-foreground border-border"}`}
                                          title={yaAgregado ? "Ya agregado" : "Disponible para agregar"}>
                                          {m}{yaAgregado && " ✓"}
                                        </span>
                                      );
                                    })}
                                  </div>
                                </div>
                              )}
                            </div>
                          )}
                        </>
                      )}
                    </div>

                    {/* ── BASE URL ────────────────────────────────────── */}
                    <div className="rounded-2xl border border-border p-4">
                      <div className="flex items-center justify-between gap-3 mb-2.5">
                        <label className="text-[10px] font-black uppercase tracking-widest text-muted-foreground flex items-center gap-1.5">
                          <ExternalLink className="h-3 w-3" /> Base URL
                        </label>
                        {!isEditingUrl && (
                          <button onClick={() => { setEditBaseUrl(p.id); setBaseUrlValue(p.base_url || ""); }}
                            className="text-[11px] font-bold text-brand-600 hover:text-brand-700 flex items-center gap-1 transition-colors">
                            <Pencil className="h-3 w-3" /> {p.base_url ? "Editar" : "Configurar"}
                          </button>
                        )}
                      </div>
                      {isEditingUrl ? (
                        <div className="flex items-center gap-2">
                          <input value={baseUrlValue} onChange={e => setBaseUrlValue(e.target.value)}
                            onKeyDown={e => { if (e.key === "Enter") saveBaseUrl(p.id); if (e.key === "Escape") setEditBaseUrl(null); }}
                            placeholder="https://api.proveedor.com/v1" autoFocus
                            className="flex-1 px-3 py-2.5 rounded-xl border border-border bg-background text-sm font-mono focus:outline-none focus:ring-2 focus:ring-brand-500/40" />
                          <button onClick={() => saveBaseUrl(p.id)}
                            className="p-2.5 rounded-xl bg-emerald-500/15 text-emerald-600 hover:bg-emerald-500/25 transition-colors" title="Guardar">
                            <Save className="h-4 w-4" />
                          </button>
                          <button onClick={() => { setEditBaseUrl(null); setBaseUrlValue(""); }}
                            className="p-2.5 rounded-xl bg-muted text-muted-foreground hover:bg-muted/70 transition-colors" title="Cancelar">
                            <X className="h-4 w-4" />
                          </button>
                        </div>
                      ) : (
                        <p className={`text-sm font-mono tracking-tight ${p.base_url ? "" : "text-amber-500 italic"}`}>
                          {p.base_url || "Sin configurar"}
                        </p>
                      )}
                    </div>

                    {/* ── MODELOS ─────────────────────────────────────── */}
                    <div className="rounded-2xl border border-border overflow-hidden">
                      {pModels.map((m, idx) => {
                        const ms = m.last_status ? MODEL_ST[m.last_status] : null;
                        const isEditing = editModel === m.id;

                        return (
                          <div key={m.id}
                            className={`group relative px-4 py-3 transition-colors hover:bg-muted/40
                              ${idx > 0 ? "border-t border-border" : ""} ${!m.activo ? "opacity-45" : ""}`}>
                            {isEditing ? (
                              <div className="space-y-2">
                                <ModelSelector
                                  available={keyResult[m.provider_id]?.modelList}
                                  value={editData.modelo}
                                  onChange={v => setEditData(d => ({ ...d, modelo: v }))}
                                />
                                <input value={editData.proposito} onChange={e => setEditData(d => ({ ...d, proposito: e.target.value }))}
                                  placeholder="Propósito" onKeyDown={e => { if (e.key === "Enter") saveModel(m.id); }}
                                  className="w-full px-3 py-2 rounded-lg border border-border bg-background text-sm focus:outline-none focus:ring-2 focus:ring-brand-500/40" />
                                <div className="flex flex-wrap gap-1.5">
                                  {roles.map(r => {
                                    const on = editData.roles.includes(r.id);
                                    return (
                                      <button key={r.id} type="button"
                                        onClick={() => setEditData(d => ({ ...d, roles: on ? d.roles.filter(x => x !== r.id) : [...d.roles, r.id] }))}
                                        className={`text-[10px] font-bold px-2 py-1 rounded-md border transition-colors ${on ? "bg-brand-500/15 text-brand-600 border-brand-500/30" : "bg-muted/40 text-muted-foreground border-border hover:bg-muted"}`}
                                        title={r.descripcion || r.id}>
                                        {ROLE_LABELS[r.id] || r.id}
                                      </button>
                                    );
                                  })}
                                </div>
                                <div className="flex gap-2">
                                  <button onClick={() => saveModel(m.id)}
                                    className="flex-1 py-1.5 rounded-lg bg-emerald-500/15 text-emerald-600 text-xs font-bold hover:bg-emerald-500/25 transition-colors">Guardar</button>
                                  <button onClick={() => setEditModel(null)}
                                    className="flex-1 py-1.5 rounded-lg bg-muted text-muted-foreground text-xs font-bold hover:bg-muted/70 transition-colors">Cancelar</button>
                                </div>
                              </div>
                            ) : (
                              <div className="flex items-center gap-3">
                                {/* punto de estado */}
                                <span className={`h-2 w-2 rounded-full shrink-0 ${ms?.dot ?? "bg-muted-foreground/30"} ${m.last_status === "up" ? "shadow-[0_0_8px] shadow-emerald-500/50" : ""}`} />

                                {/* nombre + propósito + roles */}
                                <div className="min-w-0 flex-1">
                                  <p className="text-sm font-semibold font-mono truncate leading-tight">{m.modelo}</p>
                                  <p className="text-[11px] text-muted-foreground truncate leading-tight mt-0.5">
                                    {m.proposito || "Sin propósito definido"}
                                  </p>
                                  {m.last_error && (
                                    <p className="text-[10px] text-rose-500 font-mono truncate mt-0.5">{m.last_error}</p>
                                  )}
                                  {m.roles && m.roles.length > 0 && (
                                    <div className="flex flex-wrap gap-1 mt-1">
                                      {m.roles.map(r => (
                                        <span key={r} className="text-[9px] font-bold px-1.5 py-0.5 rounded bg-brand-500/10 text-brand-600 border border-brand-500/20">
                                          {ROLE_LABELS[r] || r}
                                        </span>
                                      ))}
                                    </div>
                                  )}
                                </div>

                                {/* estado + latencia */}
                                <div className="flex items-center gap-2 shrink-0">
                                  {m.last_status === "up" && m.last_latency_ms != null && (
                                    <span className="hidden sm:flex items-center gap-1 text-[11px] text-muted-foreground tabular-nums">
                                      <Clock className="h-3 w-3" /> {m.last_latency_ms}ms
                                    </span>
                                  )}
                                  {ms && (
                                    <span className={`text-[10px] font-black px-2 py-1 rounded-md border tabular-nums ${ms.chip}`}>{ms.label}</span>
                                  )}
                                  {!ms && (
                                    <span className="text-[10px] font-black px-2 py-1 rounded-md border border-border bg-muted/60 text-muted-foreground">—</span>
                                  )}

                                  {/* acciones */}
                                  <div className="flex items-center gap-0.5 sm:opacity-0 sm:group-hover:opacity-100 transition-opacity">
                                    <button onClick={() => validateOne(m)} disabled={busyModel === m.id}
                                      className="p-1.5 rounded-lg hover:bg-brand-500/10 text-muted-foreground hover:text-brand-600 transition-colors" title="Validar este modelo">
                                      {busyModel === m.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}
                                    </button>
                                    <button onClick={() => { setEditModel(m.id); setEditData({ modelo: m.modelo, proposito: m.proposito || "", roles: m.roles ?? [] }); }}
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
                                    title={m.activo ? "Desactivar modelo" : "Activar modelo"}>
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
                        <div className={`border-t border-border p-4 space-y-2 ${st.soft}`}>
                          <ModelSelector
                            available={keyResult[p.id]?.modelList}
                            value={newModel.modelo}
                            onChange={v => setNewModel(d => ({ ...d, modelo: v }))}
                          />
                          <input value={newModel.proposito} onChange={e => setNewModel(d => ({ ...d, proposito: e.target.value }))}
                            placeholder="Propósito (ej: Chat principal)" onKeyDown={e => { if (e.key === "Enter") addModel(p.id); }}
                            className="w-full px-3 py-2 rounded-lg border border-border bg-background text-sm focus:outline-none focus:ring-2 focus:ring-brand-500/40" />
                          <div className="flex flex-wrap gap-1.5">
                            {roles.map(r => {
                              const on = newModel.roles.includes(r.id);
                              return (
                                <button key={r.id} type="button"
                                  onClick={() => setNewModel(d => ({ ...d, roles: on ? d.roles.filter(x => x !== r.id) : [...d.roles, r.id] }))}
                                  className={`text-[10px] font-bold px-2 py-1 rounded-md border transition-colors ${on ? "bg-brand-500/15 text-brand-600 border-brand-500/30" : "bg-muted/40 text-muted-foreground border-border hover:bg-muted"}`}
                                  title={r.descripcion || r.id}>
                                  {ROLE_LABELS[r.id] || r.id}
                                </button>
                              );
                            })}
                          </div>
                          <div className="flex gap-2">
                            <button onClick={() => addModel(p.id)}
                              className="flex-1 py-2 rounded-lg bg-brand-600 text-white text-xs font-bold hover:bg-brand-700 transition-colors">Agregar modelo</button>
                            <button onClick={() => { setAddingFor(null); setNewModel({ modelo: "", proposito: "", roles: [] }); }}
                              className="flex-1 py-2 rounded-lg bg-muted text-muted-foreground text-xs font-bold hover:bg-muted/70 transition-colors">Cancelar</button>
                          </div>
                        </div>
                      ) : (
                        <button onClick={() => setAddingFor(p.id)}
                          className="w-full py-2.5 border-t border-border text-muted-foreground text-[11px] font-bold hover:bg-brand-500/5 hover:text-brand-600 transition-colors flex items-center justify-center gap-1.5">
                          <Plus className="h-3.5 w-3.5" /> Agregar modelo
                        </button>
                      )}
                    </div>
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* ── AGREGAR PROVEEDOR (fuera del scroll) ──────────────────────── */}
      {showAddProvider ? (
        <div className="border-t-2 border-border p-6 bg-muted/30">
          <div className="max-w-2xl space-y-4">
            <div className="flex items-center gap-2">
              <Plus className="h-4 w-4 text-brand-600" />
              <h3 className="font-bold text-sm">Nuevo proveedor</h3>
            </div>

            {/* Presets de proveedores conocidos */}
            <div>
              <p className="text-[10px] font-black uppercase tracking-widest text-muted-foreground mb-2">Plantillas rápidas</p>
              <div className="flex flex-wrap gap-2">
                {PROVIDER_PRESETS.map(preset => {
                  const exists = providers.some(p => p.id === preset.id);
                  return (
                    <button key={preset.id} type="button" disabled={exists}
                      onClick={() => setNewProvider({ id: preset.id, nombre: preset.nombre, base_url: preset.base_url, docs_url: preset.docs_url })}
                      className="text-[11px] font-bold px-3 py-1.5 rounded-lg border border-border bg-background hover:border-brand-500/40 hover:text-brand-600 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                      title={exists ? "Ya agregado" : preset.base_url}>
                      {preset.nombre}
                      {exists && <span className="ml-1 text-[9px] opacity-60">✓</span>}
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">ID (clave interna)</label>
                <input value={newProvider.id} onChange={e => setNewProvider(d => ({ ...d, id: e.target.value }))}
                  placeholder="ej: deepseek" onKeyDown={e => { if (e.key === "Enter") addProvider(); }}
                  className="w-full mt-1 px-3 py-2 rounded-lg border border-border bg-background text-sm font-mono focus:outline-none focus:ring-2 focus:ring-brand-500/40" />
                <p className="text-[10px] text-muted-foreground mt-1">Minúsculas, sin espacios. Se usa internamente.</p>
              </div>
              <div>
                <label className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">Nombre</label>
                <input value={newProvider.nombre} onChange={e => setNewProvider(d => ({ ...d, nombre: e.target.value }))}
                  placeholder="ej: DeepSeek" onKeyDown={e => { if (e.key === "Enter") addProvider(); }}
                  className="w-full mt-1 px-3 py-2 rounded-lg border border-border bg-background text-sm focus:outline-none focus:ring-2 focus:ring-brand-500/40" />
              </div>
              <div>
                <label className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">Base URL (API)</label>
                <input value={newProvider.base_url} onChange={e => setNewProvider(d => ({ ...d, base_url: e.target.value }))}
                  placeholder="ej: https://api.deepseek.com/v1" onKeyDown={e => { if (e.key === "Enter") addProvider(); }}
                  className="w-full mt-1 px-3 py-2 rounded-lg border border-border bg-background text-sm font-mono focus:outline-none focus:ring-2 focus:ring-brand-500/40" />
                <p className="text-[10px] text-muted-foreground mt-1">Endpoint compatible con OpenAI (sin /chat/completions).</p>
                {newProvider.base_url.includes("{ACCOUNT_ID}") && (
                  <div className="mt-2 p-3 rounded-lg bg-amber-500/10 border border-amber-500/30">
                    <label className="text-[10px] font-black uppercase tracking-widest text-amber-600 flex items-center gap-1">
                      <AlertTriangle className="h-3 w-3" /> Account ID requerido
                    </label>
                    <input value={accountId} onChange={e => setAccountId(e.target.value)}
                      placeholder="Pegue su Account ID aquí" autoFocus
                      className="w-full mt-1.5 px-3 py-2 rounded-lg border border-amber-500/30 bg-background text-sm font-mono focus:outline-none focus:ring-2 focus:ring-amber-500/40" />
                    <p className="text-[10px] text-muted-foreground mt-1.5">
                      Se reemplaza automáticamente en la URL al guardar.
                    </p>
                  </div>
                )}
              </div>
              <div>
                <label className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">URL de docs (opcional)</label>
                <input value={newProvider.docs_url} onChange={e => setNewProvider(d => ({ ...d, docs_url: e.target.value }))}
                  placeholder="ej: https://platform.deepseek.com/api_keys" onKeyDown={e => { if (e.key === "Enter") addProvider(); }}
                  className="w-full mt-1 px-3 py-2 rounded-lg border border-border bg-background text-sm font-mono focus:outline-none focus:ring-2 focus:ring-brand-500/40" />
              </div>
            </div>
            <div className="flex gap-2">
              <button onClick={addProvider} disabled={savingProvider}
                className="px-5 py-2 rounded-lg bg-brand-600 text-white text-xs font-bold hover:bg-brand-700 disabled:opacity-50 transition-colors flex items-center gap-1.5">
                {savingProvider ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Plus className="h-3.5 w-3.5" />}
                Crear proveedor
              </button>
              <button onClick={() => { setShowAddProvider(false); setNewProvider({ id: "", nombre: "", base_url: "", docs_url: "" }); setAccountId(""); }}
                className="px-5 py-2 rounded-lg bg-muted text-muted-foreground text-xs font-bold hover:bg-muted/70 transition-colors">
                Cancelar
              </button>
            </div>
          </div>
        </div>
      ) : (
        <div className="border-t border-border p-4 bg-card">
          <button onClick={() => setShowAddProvider(true)}
            className="w-full py-3 rounded-xl border-2 border-dashed border-border text-muted-foreground text-xs font-bold hover:border-brand-500/40 hover:text-brand-600 hover:bg-brand-500/5 transition-all flex items-center justify-center gap-1.5">
            <Plus className="h-4 w-4" /> Agregar proveedor
          </button>
        </div>
      )}
    </section>
  );
}

/** Selector de modelo: dropdown con los modelos disponibles en la cuenta del proveedor,
 *  o input manual si la lista no se cargó o el modelo no aparece en ella. */
function ModelSelector({ available, value, onChange }: {
  available?: string[];
  value: string;
  onChange: (v: string) => void;
}) {
  const [manual, setManual] = React.useState(false);
  const hasList = available && available.length > 0;
  const inList = hasList && available!.includes(value);

  // Si hay lista y el valor actual no está en ella, mostrar modo manual
  React.useEffect(() => {
    if (hasList && value && !inList) setManual(true);
  }, [hasList, inList, value]);

  if (!hasList || manual) {
    return (
      <div className="flex items-center gap-2">
        <input value={value} onChange={e => onChange(e.target.value)}
          placeholder="Nombre del modelo (ej: gemini-3.5-flash)" autoFocus
          className="flex-1 px-3 py-2 rounded-lg border border-border bg-background text-sm font-mono focus:outline-none focus:ring-2 focus:ring-brand-500/40" />
        {hasList && (
          <button type="button" onClick={() => setManual(false)}
            className="text-[10px] font-bold text-brand-600 hover:text-brand-700 whitespace-nowrap px-2">
            Ver lista
          </button>
        )}
      </div>
    );
  }

  return (
    <div className="flex items-center gap-2">
      <select value={value} onChange={e => onChange(e.target.value)}
        className="flex-1 px-3 py-2 rounded-lg border border-border bg-background text-sm font-mono focus:outline-none focus:ring-2 focus:ring-brand-500/40 cursor-pointer">
        <option value="">— Seleccione un modelo —</option>
        {available!.map(m => (
          <option key={m} value={m}>{m}</option>
        ))}
      </select>
      <button type="button" onClick={() => setManual(true)}
        className="text-[10px] font-bold text-muted-foreground hover:text-foreground whitespace-nowrap px-2">
        Escribir manual
      </button>
    </div>
  );
}
