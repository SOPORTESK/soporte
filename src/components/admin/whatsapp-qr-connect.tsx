"use client";
import * as React from "react";
import { Smartphone, RefreshCw, Unlink, CheckCircle } from "lucide-react";
import { toast } from "sonner";

export function WhatsAppQRConnect() {
  const [status, setStatus] = React.useState<"unknown" | "open" | "close" | "connecting">("unknown");
  const [checking, setChecking] = React.useState(false);
  const [instance, setInstance] = React.useState("sekunet");
  const [evoUrl, setEvoUrl] = React.useState("http://localhost:7001");
  const [qrCode, setQrCode] = React.useState<string | null>(null);
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
          const state = String(inst.connectionStatus || inst.state || inst.status || "").toLowerCase();
          setStatus(state === "open" || state === "connected" ? "open" : state === "connecting" ? "connecting" : "close");
          if (state === "open" || state === "connected") setQrCode(null);
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
        if (state === "open" || state === "connected") setQrCode(null);
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
      const r = await evoProxy(`/instance/logout/${encodeURIComponent(instance)}`, "DELETE");
      setLastResponse(`logout: HTTP ${r.status}\n${JSON.stringify(r.data).slice(0, 500)}`);
      if (!r.ok) {
        throw new Error(
          `El servidor de Evolution (${evoUrl}) respondió HTTP ${r.status}. ` +
          `Verifique que la URL configurada arriba sea la correcta. Detalle: ${JSON.stringify(r.data)}`
        );
      }
      toast.success("Sesión cerrada. Puede generar QR ahora.");
      setStatus("close");
      setQrCode(null);
    } catch (e: any) {
      toast.error("Error cerrando sesión: " + (e?.message || e));
      setLastError(String(e?.message || e));
    }
  }

  async function fetchQR() {
    setChecking(true);
    setLastError(null);
    setQrCode(null);
    try {
      const r = await evoProxy(`/instance/connect/${encodeURIComponent(instance)}`, "GET");
      setLastResponse(`connect: HTTP ${r.status}\n${JSON.stringify(r.data).slice(0, 500)}`);
      if (r.ok && r.data?.base64) {
        setQrCode(r.data.base64);
        setStatus("connecting");
        toast.success("QR generado con éxito.");
      } else {
        throw new Error("No se devolvió código QR base64.");
      }
    } catch (e: any) {
      toast.error("Error obteniendo QR: " + (e?.message || e));
      setLastError(String(e?.message || e));
    } finally {
      setChecking(false);
    }
  }

  // Verificar estado al montar
  React.useEffect(() => {
    checkState();
  }, []);

  return (
    <section className="rounded-2xl border border-border/60 bg-card p-5 space-y-4 h-full flex flex-col justify-between">
      <div className="space-y-4">
        {/* Header */}
        <div className="flex items-center gap-2.5">
          <div className="h-7 w-7 rounded-lg bg-emerald-500/10 text-emerald-500 grid place-items-center">
            <Smartphone className="h-3.5 w-3.5" />
          </div>
          <div className="flex-1 min-w-0">
            <h2 className="text-sm font-black">Conexión WhatsApp</h2>
            <p className="text-[10px] text-muted-foreground">Estado de vinculación e instancia activa</p>
          </div>
          <span className={`text-[10px] font-bold px-2.5 py-0.5 rounded-full shrink-0 ${
            status === "open" ? "bg-emerald-500/15 text-emerald-600 border border-emerald-500/30" :
            status === "connecting" ? "bg-amber-500/15 text-amber-600 border border-amber-500/30" :
            "bg-red-500/15 text-red-600 border border-red-500/30"
          }`}>
            {status === "open" ? "CONECTADO" : status === "connecting" ? "CONECTANDO..." : "DESCONECTADO"}
          </span>
        </div>

        {/* Form fields */}
        <div className="space-y-3">
          <div>
            <label className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground mb-1 block">
              URL del Servidor
            </label>
            <input
              value={evoUrl}
              onChange={e => setEvoUrl(e.target.value)}
              placeholder="http://localhost:7001"
              className="w-full h-10 px-3 rounded-lg bg-muted/40 border border-border text-sm focus:outline-none focus:ring-1 focus:ring-emerald-500"
            />
          </div>
          <div>
            <label className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground mb-1 block">
              Nombre de Instancia
            </label>
            <input
              value={instance}
              onChange={e => setInstance(e.target.value)}
              placeholder="sekunet"
              className="w-full h-10 px-3 rounded-lg bg-muted/40 border border-border text-sm focus:outline-none focus:ring-1 focus:ring-emerald-500"
            />
            <p className="text-[10px] text-muted-foreground mt-1">
              La API Key está guardada cifrada en Supabase. No se muestra por seguridad.
            </p>
          </div>
        </div>

        {/* Actions */}
        <div className="flex flex-wrap gap-2 pt-1">
          <button
            onClick={checkState}
            disabled={checking}
            className="px-3 py-2 rounded-lg text-xs font-semibold border border-border bg-muted/30 hover:bg-muted transition-colors flex items-center gap-1.5"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${checking ? "animate-spin" : ""}`} />
            Verificar estado
          </button>
          <button
            onClick={logout}
            className="px-3 py-2 rounded-lg text-xs font-semibold border border-red-500/30 bg-red-500/10 hover:bg-red-500/20 text-red-600 transition-colors flex items-center gap-1.5"
          >
            <Unlink className="h-3.5 w-3.5" />
            Desconectar
          </button>
          <button
            onClick={fetchQR}
            disabled={checking}
            className="px-3.5 py-2 rounded-lg text-xs font-semibold bg-emerald-600 text-white hover:bg-emerald-700 disabled:opacity-40 transition-colors flex items-center gap-1.5 ml-auto"
          >
            <Smartphone className="h-3.5 w-3.5" />
            Obtener QR
          </button>
        </div>

        {status === "open" && (
          <div className="flex items-center gap-2 text-emerald-600 dark:text-emerald-400 text-xs font-semibold p-2.5 bg-emerald-500/10 border border-emerald-500/20 rounded-xl">
            <CheckCircle className="h-4 w-4 shrink-0" />
            WhatsApp conectado correctamente a la red de Meta.
          </div>
        )}

        {lastResponse && (
          <details className="text-xs pt-1">
            <summary className="cursor-pointer text-muted-foreground hover:text-foreground font-medium">Ver respuesta de Evolution</summary>
            <pre className="mt-1 p-2 bg-muted/60 border border-border/40 rounded-lg overflow-x-auto text-[10px] text-muted-foreground">{lastResponse}</pre>
          </details>
        )}

        {qrCode && (
          <div className="mt-2 p-4 flex flex-col items-center bg-white rounded-xl border border-border shadow-md">
            <p className="text-xs font-bold text-slate-800 mb-2">Escanee este código con WhatsApp</p>
            <img src={qrCode} alt="WhatsApp QR Code" className="w-56 h-56 object-contain" />
            <p className="text-[11px] text-slate-500 mt-2 text-center">
              Vaya a Dispositivos Vinculados en su celular y escanee este código.
            </p>
          </div>
        )}
      </div>
    </section>
  );
}
