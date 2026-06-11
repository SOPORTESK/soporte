"use client";
import * as React from "react";
import { Smartphone, RefreshCw, Unlink, CheckCircle, AlertTriangle } from "lucide-react";
import { toast } from "sonner";

export function WhatsAppQRConnect() {
  const [status, setStatus] = React.useState<"unknown" | "open" | "close" | "connecting">("unknown");
  const [qrCode, setQrCode] = React.useState<string | null>(null);
  const [checking, setChecking] = React.useState(false);
  const [instance, setInstance] = React.useState("sekunet");
  const [evoUrl, setEvoUrl] = React.useState("http://localhost:8080");
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
          const qr = inst?.qrcode || inst?.qr || inst?.base64;
          if (qr && state !== "open" && state !== "connected") setQrCode(qr);
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
      setQrCode(null);
      setStatus("close");
    } catch (e: any) {
      toast.error("Error cerrando sesión: " + (e?.message || e));
      setLastError(String(e?.message || e));
    }
  }

  async function fetchQR() {
    setQrCode(null);
    setChecking(true);
    setLastError(null);
    try {
      // Intentar obtener QR directamente via connect endpoint
      const r = await evoProxy(`/instance/connect/${encodeURIComponent(instance)}`, "POST");
      setLastResponse(`connect POST: HTTP ${r.status}\n${JSON.stringify(r.data).slice(0, 600)}`);
      if (r.ok && r.data) {
        const inst = r.data?.instance || r.data;
        const state = String(inst?.state || "").toLowerCase();
        const qr = inst?.qrcode || inst?.qr || inst?.base64 || r.data?.qrcode || r.data?.qr || r.data?.base64;
        if (qr) {
          setQrCode(qr);
          setStatus("connecting");
          toast.success("QR generado. Escanee con WhatsApp.");
          setChecking(false);
          return;
        }
        if (state === "open" || state === "connected") {
          setStatus("open");
          toast.info("Instancia ya conectada. Desconecte primero para cambiar número.");
          setChecking(false);
          return;
        }
      }
      // Fallback: reiniciar y esperar QR via polling
      const r2 = await evoProxy(`/instance/restart/${encodeURIComponent(instance)}`, "POST");
      setLastResponse(`restart POST: HTTP ${r2.status}\n${JSON.stringify(r2.data).slice(0, 600)}`);
      if (r2.ok) {
        toast.success("Instancia reiniciada. Consultando QR...");
        // Iniciar polling hasta obtener QR o conexion
        const poll = setInterval(async () => {
          const pr = await evoProxy("/instance/fetchInstances");
          if (pr.ok && pr.data) {
            const instances = Array.isArray(pr.data) ? pr.data : pr.data?.instances || [];
            const inst = instances.find((i: any) => i.instanceName === instance || i.name === instance);
            if (inst) {
              const state = String(inst.state || inst.status || "").toLowerCase();
              const qr = inst?.qrcode || inst?.qr || inst?.base64;
              if (qr) {
                setQrCode(qr);
                setStatus("connecting");
                clearInterval(poll);
                setChecking(false);
                toast.success("QR listo. Escanee con WhatsApp.");
                return;
              }
              if (state === "open" || state === "connected") {
                setStatus("open");
                clearInterval(poll);
                setChecking(false);
                toast.info("Ya conectado.");
                return;
              }
            }
          }
        }, 2500);
        // Parar polling tras 30s
        setTimeout(() => { clearInterval(poll); setChecking(false); }, 30000);
      } else {
        throw new Error("No se pudo reiniciar la instancia.");
      }
    } catch (e: any) {
      toast.error("Error: " + (e?.message || e));
      setLastError(String(e?.message || e));
      setChecking(false);
    }
  }

  // Polling automático de estado cada 3s mientras hay QR visible
  React.useEffect(() => {
    if (!qrCode) return;
    const t = setInterval(() => {
      checkState();
    }, 3000);
    return () => clearInterval(t);
  }, [qrCode]);

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

      {qrCode && status !== "open" && (
        <div className="flex flex-col items-center gap-2 p-4 bg-white rounded-xl border border-border">
          <p className="text-sm font-semibold text-gray-800">Escanea con WhatsApp</p>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={qrCode} alt="QR WhatsApp" className="w-64 h-64" />
          <p className="text-xs text-gray-500">Abra WhatsApp → Menú → Dispositivos vinculados → Vincular</p>
          <p className="text-[10px] text-amber-600 font-medium animate-pulse">Esperando conexión...</p>
        </div>
      )}

      {status === "open" && (
        <div className="flex items-center gap-2 text-emerald-600 text-sm font-medium p-2 bg-emerald-500/10 rounded-lg">
          <CheckCircle className="h-4 w-4" />
          WhatsApp conectado correctamente.
        </div>
      )}

      {lastError && (
        <div className="p-2 rounded-lg bg-red-500/10 border border-red-500/20 text-red-600 text-xs">
          <p className="font-bold">Error:</p>
          <p className="break-all">{lastError}</p>
        </div>
      )}

      {lastResponse && (
        <details className="text-xs">
          <summary className="cursor-pointer text-muted-foreground hover:text-foreground font-medium">Ver respuesta de Evolution</summary>
          <pre className="mt-1 p-2 bg-muted rounded-lg overflow-x-auto text-[10px] text-muted-foreground">{lastResponse}</pre>
        </details>
      )}
    </div>
  );
}
