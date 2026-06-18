"use client";
import * as React from "react";
import { Smartphone, Save, RefreshCw, CheckCircle, AlertTriangle, ExternalLink, Eye, EyeOff, Power } from "lucide-react";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";

export function EvolutionConfigPanel() {
  const [config, setConfig] = React.useState({ url: "", apiKey: "", instance: "" });
  const [showKey, setShowKey] = React.useState(false);
  const [saving, setSaving] = React.useState(false);
  const [status, setStatus] = React.useState<"idle" | "checking" | "ok" | "error">("idle");
  const [restarting, setRestarting] = React.useState(false);
  const [services, setServices] = React.useState<{ pg: boolean; evolution: boolean; app: boolean } | null>(null);

  React.useEffect(() => {
    fetch("/api/admin/evolution/config")
      .then(r => r.json())
      .then(data => {
        setConfig({ url: data.url || "", apiKey: "", instance: data.instance || "" });
      })
      .catch(() => {});
  }, []);

  async function handleSave() {
    setSaving(true);
    try {
      const payload: any = { url: config.url, instance: config.instance };
      // Solo enviar apiKey si el usuario escribió una nueva (no si está enmascarada)
      if (config.apiKey && !config.apiKey.startsWith("•")) {
        payload.apiKey = config.apiKey;
      }
      const res = await fetch("/api/admin/evolution/config", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!res.ok) throw new Error("Error al guardar");
      toast.success("Configuración guardada.");
      setConfig(prev => ({ ...prev, apiKey: "" }));
    } catch (e: any) {
      toast.error(e?.message || "Error");
    } finally {
      setSaving(false);
    }
  }

  async function handleRestart() {
    setRestarting(true);
    setServices(null);
    try {
      const res = await fetch("/api/admin/services/restart", { method: "POST" });
      const data = await res.json();
      if (!res.ok || !data.ok) throw new Error(data?.error || "Error al reiniciar servicios");
      setServices(data.services || null);
      if (data.allUp) {
        toast.success("Servicios reiniciados. Todo está arriba.");
      } else {
        toast.warning(data.message || "Watcher relanzado. Espere unos segundos y verifique de nuevo.");
      }
    } catch (e: any) {
      toast.error(e?.message || "No se pudo reiniciar los servicios");
    } finally {
      setRestarting(false);
    }
  }

  async function checkStatus() {
    setStatus("checking");
    try {
      const res = await fetch("/api/admin/evolution/config");
      const data = await res.json();
      if (!data.url) { setStatus("error"); return; }
      const ping = await fetch("/api/admin/evolution/proxy", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ endpoint: "/instance/fetchInstances" }),
      });
      setStatus(ping.ok ? "ok" : "error");
    } catch {
      setStatus("error");
    }
  }

  return (
    <section className="rounded-2xl border border-border/60 bg-card p-5">
      <div className="flex items-center gap-2.5 mb-4">
        <div className="h-7 w-7 rounded-lg bg-emerald-500/10 text-emerald-500 grid place-items-center">
          <Smartphone className="h-3.5 w-3.5" />
        </div>
        <div className="flex-1">
          <h2 className="text-sm font-black">Evolution API (WhatsApp)</h2>
          <p className="text-[10px] text-muted-foreground">Configuración de conexión con Evolution</p>
        </div>
        {status === "ok" && <CheckCircle className="h-4 w-4 text-emerald-500" />}
        {status === "error" && <AlertTriangle className="h-4 w-4 text-rose-500" />}
      </div>

      <div className="space-y-3">
        <div>
          <label className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground mb-1 block">URL de Evolution</label>
          <Input
            value={config.url}
            onChange={e => setConfig(prev => ({ ...prev, url: e.target.value }))}
            placeholder="http://localhost:7001"
            className="h-10 text-sm rounded-lg bg-muted/40 border-border"
          />
        </div>
        <div>
          <label className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground mb-1 block">API Key</label>
          <div className="relative">
            <Input
              type={showKey ? "text" : "password"}
              value={config.apiKey}
              onChange={e => setConfig(prev => ({ ...prev, apiKey: e.target.value }))}
              placeholder="••••••••"
              className="h-10 text-sm rounded-lg bg-muted/40 border-border pr-10"
            />
            <button
              onClick={() => setShowKey(!showKey)}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
            >
              {showKey ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
            </button>
          </div>
        </div>
        <div>
          <label className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground mb-1 block">Nombre de instancia</label>
          <Input
            value={config.instance}
            onChange={e => setConfig(prev => ({ ...prev, instance: e.target.value }))}
            placeholder="sekunet"
            className="h-10 text-sm rounded-lg bg-muted/40 border-border"
          />
        </div>
      </div>

      <div className="flex items-center gap-2 mt-4">
        <button
          onClick={handleSave}
          disabled={saving}
          className="px-4 py-2 rounded-lg text-sm font-medium bg-brand-600 text-white hover:bg-brand-700 disabled:opacity-40 transition-colors flex items-center gap-2"
        >
          <Save className="h-3.5 w-3.5" />
          {saving ? "Guardando..." : "Guardar configuración"}
        </button>
        <button
          onClick={checkStatus}
          disabled={status === "checking"}
          className="px-4 py-2 rounded-lg text-sm font-medium border border-border hover:bg-muted transition-colors flex items-center gap-2"
        >
          <RefreshCw className={`h-3.5 w-3.5 ${status === "checking" ? "animate-spin" : ""}`} />
          {status === "checking" ? "Verificando..." : "Verificar conexión"}
        </button>
      </div>

      <div className="mt-3 p-3 rounded-xl border border-amber-500/30 bg-amber-500/5">
        <div className="flex items-center justify-between gap-3">
          <div className="flex-1">
            <p className="text-xs font-bold text-amber-600">Recuperación de servicios</p>
            <p className="text-[10px] text-muted-foreground">Use este botón si el autoarranque falló y WhatsApp no responde. Reinicia PostgreSQL, Evolution API y la app.</p>
          </div>
          <button
            onClick={handleRestart}
            disabled={restarting}
            className="px-4 py-2 rounded-lg text-sm font-medium bg-amber-500 text-white hover:bg-amber-600 disabled:opacity-40 transition-colors flex items-center gap-2 shrink-0"
          >
            <Power className={`h-3.5 w-3.5 ${restarting ? "animate-spin" : ""}`} />
            {restarting ? "Reiniciando..." : "Reiniciar servicios"}
          </button>
        </div>
        {services && (
          <div className="mt-3 grid grid-cols-3 gap-2">
            {([
              { label: "PostgreSQL", up: services.pg },
              { label: "Evolution", up: services.evolution },
              { label: "App", up: services.app },
            ] as const).map(s => (
              <div key={s.label} className={`flex items-center gap-1.5 rounded-lg px-2 py-1.5 text-[10px] font-semibold ${s.up ? "bg-emerald-500/10 text-emerald-600" : "bg-rose-500/10 text-rose-600"}`}>
                {s.up ? <CheckCircle className="h-3 w-3" /> : <AlertTriangle className="h-3 w-3" />}
                {s.label}
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="mt-4 p-3 rounded-xl bg-muted/30 border border-border/40 text-xs space-y-2">
        <p className="font-semibold text-muted-foreground">Cambiar número de WhatsApp:</p>
        <ol className="list-decimal list-inside space-y-1 text-muted-foreground">
          <li>Asegúrese de guardar la URL de su Evolution API en la nube (ej. Render) arriba.</li>
          <li>En la sección de abajo, haga clic en <strong>Obtener QR</strong>.</li>
          <li>Inicie sesión en el panel de Evolution con su API KEY Global (usualmente <code>SEKUNET_EVO_KEY_123</code>).</li>
          <li>Vaya a la instancia <strong>sekunet</strong> (o créela si no existe).</li>
          <li>Haga clic en el botón QR para escanear con su celular. El webhook ya estará configurado.</li>
        </ol>
      </div>
    </section>
  );
}
