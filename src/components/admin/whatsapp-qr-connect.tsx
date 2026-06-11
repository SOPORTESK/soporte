"use client";
import * as React from "react";
import { Smartphone, RefreshCw, Unlink, CheckCircle } from "lucide-react";
import { toast } from "sonner";

export function WhatsAppQRConnect() {
  const [status, setStatus] = React.useState<"unknown" | "open" | "close" | "connecting">("unknown");
  const [checking, setChecking] = React.useState(false);
  const [instance, setInstance] = React.useState("sekunet");
  const [evoUrl, setEvoUrl] = React.useState("http://localhost:8080");
  const [showManager, setShowManager] = React.useState(false);
  const [lastError, setLastError] = React.useState<string | null>(null);
  const [lastResponse, setLastResponse] = React.useState<string | null>(null);

  // Cargar config del servidor al montar
  React.useEffect(() => {
    fetch("/api/admin/evolution/config")
      .then(r => r.json())
      .then(data => {
        if (data.url) setEvoUrl(data.url);
        if (data.instance) setInstance(data.instance);
      })
      .catch(() => {});
  }, []);

  async function evoProxy(endpoint: string, method = "GET", body?: any) {
    const res = await fetch("/api/admin/evolution/proxy", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ endpoint, method, body }),
    });
    return res.json();
  }

  async function checkState() {
    setChecking(true);
    setLastError(null);
    try {
      const r1 = await evoProxy("/instance/fetchInstances");
      setLastResponse(`fetchInstances: HTTP ${r1.status}\n${JSON.stringify(r1.data).slice(0, 500)}`);
      if (r1.ok) {
        const instances = Array.isArray(r1.data) ? r1.data : r1.data?.instances || [];
        const inst = instances.find((i: any) => i.instanceName === instance || i.name === instance);
        if (inst) {
          const state = String(inst.state || inst.status || "").toLowerCase();
          setStatus(state === "open" || state === "connected" ? "open" : state === "connecting" ? "connecting" : "close");
          setChecking(false);
          return;
        }
      }
      const r2 = await evoProxy(`/instance/restart/${encodeURIComponent(instance)}`, "POST");
      setLastResponse(`restart: HTTP ${r2.status}\n${JSON.stringify(r2.data).slice(0, 500)}`);
      if (r2.ok) {
        const inst = r2.data?.instance || r2.data;
        const state = String(inst?.state || "").toLowerCase();
        setStatus(state === "open" || state === "connected" ? "open" : state === "connecting" ? "connecting" : "close");
        setChecking(false);
        return;
      }
      throw new Error(`No se pudo obtener estado. HTTP ${r2.status}`);
    } catch (e: any) {
      setStatus("unknown");
      setLastError(String(e?.message || e));
    } finally {
      setChecking(false);
    }
  }

  async function logout() {
    setLastError(null);
    try {
      let r = await evoProxy(`/instance/logout/${encodeURIComponent(instance)}`, "DELETE");
      if (!r.ok) r = await evoProxy(`/instance/logout/${encodeURIComponent(instance)}`, "POST");
      setLastResponse(`logout: HTTP ${r.status}\n${JSON.stringify(r.data).slice(0, 500)}`);
      if (!r.ok) throw new Error(`HTTP ${r.status}: ${JSON.stringify(r.data)}`);
      toast.success("Sesión cerrada. Puede generar QR ahora.");
      setStatus("close");
    } catch (e: any) {
      toast.error("Error cerrando sesión: " + (e?.message || e));
      setLastError(String(e?.message || e));
    }
  }

  async function fetchQR() {
    setShowManager(true);
  }

  // Verificar estado al montar
  React.useEffect(() => {
    checkState();
  }, []);

  return (
    <div className="mt-4 p-4 rounded-xl border border-border/60 bg-muted/20 space-y-4">
      <div className="flex items-center gap-2">
        <Smartphone className="h-4 w-4 text-emerald-500" />
        <h3 className="text-sm font-bold">Conexión WhatsApp</h3>
        <span className={`ml-auto text-[10px] font-bold px-2 py-0.5 rounded-full ${
          status === "open" ? "bg-emerald-500/15 text-emerald-600" :
          status === "connecting" ? "bg-amber-500/15 text-amber-600" :
          "bg-red-500/15 text-red-600"
        }`}>
          {status === "open" ? "CONECTADO" : status === "connecting" ? "CONECTANDO..." : "DESCONECTADO"}
        </span>
      </div>

      <div className="space-y-2">
        <input
          value={evoUrl}
          onChange={e => setEvoUrl(e.target.value)}
          placeholder="URL Evolution"
          className="w-full px-3 py-2 rounded-lg bg-muted/40 border border-border text-sm"
        />
        <input
          value={instance}
          onChange={e => setInstance(e.target.value)}
          placeholder="Nombre instancia"
          className="w-full px-3 py-2 rounded-lg bg-muted/40 border border-border text-sm"
        />
        <p className="text-[10px] text-muted-foreground">
          La API Key está guardada cifrada en Supabase. No se muestra por seguridad.
        </p>
      </div>

      <div className="flex gap-2">
        <button
          onClick={checkState}
          disabled={checking}
          className="px-3 py-2 rounded-lg text-sm font-medium border border-border hover:bg-muted transition-colors flex items-center gap-1.5"
        >
          <RefreshCw className={`h-3.5 w-3.5 ${checking ? "animate-spin" : ""}`} />
          Verificar estado
        </button>
        <button
          onClick={logout}
          className="px-3 py-2 rounded-lg text-sm font-medium border border-border hover:bg-red-50 text-red-600 transition-colors flex items-center gap-1.5"
        >
          <Unlink className="h-3.5 w-3.5" />
          Desconectar
        </button>
        <button
          onClick={fetchQR}
          disabled={checking}
          className="px-3 py-2 rounded-lg text-sm font-medium bg-emerald-600 text-white hover:bg-emerald-700 disabled:opacity-40 transition-colors flex items-center gap-1.5"
        >
          <Smartphone className="h-3.5 w-3.5" />
          Obtener QR
        </button>
      </div>

      {status === "open" && (
        <div className="flex items-center gap-2 text-emerald-600 text-sm font-medium p-2 bg-emerald-500/10 rounded-lg">
          <CheckCircle className="h-4 w-4" />
          WhatsApp conectado correctamente.
        </div>
      )}

      {showManager && (
        <div className="space-y-2">
          <div className="flex items-center justify-between text-xs text-muted-foreground">
            <span>Panel de Evolution — Login con <strong>SEKUNET_EVO_KEY_123</strong></span>
            <button onClick={() => setShowManager(false)} className="text-red-500 hover:text-red-600 font-bold px-2">X</button>
          </div>
          <iframe
            src={`${evoUrl.replace(/\/$/, "")}/manager`}
            className="w-full h-[500px] rounded-xl border border-border bg-white"
            title="Evolution Manager"
          />
        </div>
      )}
    </div>
  );
}
