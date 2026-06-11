"use client";
import * as React from "react";
import { Smartphone, RefreshCw, Unlink, CheckCircle, AlertTriangle, ExternalLink } from "lucide-react";
import { toast } from "sonner";

export function WhatsAppQRConnect() {
  const [status, setStatus] = React.useState<"unknown" | "open" | "close" | "connecting">("unknown");
  const [qrCode, setQrCode] = React.useState<string | null>(null);
  const [checking, setChecking] = React.useState(false);
  const [instance, setInstance] = React.useState("sekunet");
  const [evoUrl, setEvoUrl] = React.useState("http://localhost:8080");
  const [evoKey, setEvoKey] = React.useState("");
  const [lastError, setLastError] = React.useState<string | null>(null);
  const [lastResponse, setLastResponse] = React.useState<string | null>(null);

  async function api(endpoint: string, opts?: RequestInit) {
    const url = `${evoUrl.replace(/\/$/, "")}${endpoint}`;
    const headers: Record<string, string> = { "Content-Type": "application/json" };
    if (evoKey) headers.apikey = evoKey;
    const res = await fetch(url, { ...opts, headers });
    const text = await res.text();
    return { ok: res.ok, status: res.status, text };
  }

  async function checkState() {
    setChecking(true);
    setLastError(null);
    try {
      // Intento 1: fetchInstances (funciona en esta versión)
      const { ok, status, text } = await api(`/instance/fetchInstances`);
      setLastResponse(`fetchInstances: HTTP ${status}\n${text.slice(0, 500)}`);
      if (ok) {
        const data = JSON.parse(text);
        const instances = Array.isArray(data) ? data : data?.instances || [];
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
      // Intento 2: restart (también devuelve estado en esta versión)
      const r2 = await api(`/instance/restart/${encodeURIComponent(instance)}`, { method: "POST" });
      setLastResponse(`restart: HTTP ${r2.status}\n${r2.text.slice(0, 500)}`);
      if (r2.ok) {
        const d2 = JSON.parse(r2.text);
        const inst = d2?.instance || d2;
        const state = String(inst?.state || "").toLowerCase();
        setStatus(state === "open" || state === "connected" ? "open" : state === "connecting" ? "connecting" : "close");
        setChecking(false);
        return;
      }
      throw new Error(`No se pudo obtener estado. HTTP ${status}: ${text}`);
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
      // Intento 1: DELETE
      let { ok, status, text } = await api(`/instance/logout/${encodeURIComponent(instance)}`, { method: "DELETE" });
      if (!ok) {
        // Intento 2: POST (algunas versiones usan POST)
        const r2 = await api(`/instance/logout/${encodeURIComponent(instance)}`, { method: "POST" });
        ok = r2.ok; status = r2.status; text = r2.text;
      }
      setLastResponse(`logout: HTTP ${status}\n${text.slice(0, 500)}`);
      if (!ok) throw new Error(`HTTP ${status}: ${text}`);
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
      // En esta versión de Evolution no hay endpoint /instance/qr ni /instance/connect
      // El QR solo está disponible desde el panel web de Evolution
      // Reiniciamos para forzar estado "connecting" y dirigimos al panel web
      const r4 = await api(`/instance/restart/${encodeURIComponent(instance)}`, { method: "POST" });
      setLastResponse(`restart POST: HTTP ${r4.status}\n${r4.text.slice(0, 500)}`);
      if (r4.ok) {
        const d4 = JSON.parse(r4.text);
        const inst = d4?.instance || d4;
        const state = String(inst?.state || "").toLowerCase();
        if (state === "open" || state === "connected") {
          toast.info("Instancia conectada. Para cambiar de número, desconecte primero.");
        } else {
          toast.success("Instancia reiniciada. Abra el panel de Evolution para ver el QR.");
        }
      } else {
        throw new Error("No se pudo reiniciar la instancia.");
      }
    } catch (e: any) {
      toast.error("Error: " + (e?.message || e));
      setLastError(String(e?.message || e));
    } finally {
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
        <div className="flex gap-2">
          <input
            value={instance}
            onChange={e => setInstance(e.target.value)}
            placeholder="Nombre instancia"
            className="flex-1 px-3 py-2 rounded-lg bg-muted/40 border border-border text-sm"
          />
          <input
            value={evoKey}
            onChange={e => setEvoKey(e.target.value)}
            placeholder="API Key"
            className="flex-1 px-3 py-2 rounded-lg bg-muted/40 border border-border text-sm"
          />
        </div>
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

      {/* Link directo al panel de Evolution para QR */}
      <a
        href={`${evoUrl.replace(/\/$/, "")}/instance/connect/${encodeURIComponent(instance)}`}
        target="_blank"
        rel="noreferrer"
        className="flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg text-sm font-medium bg-[#25D366] text-white hover:bg-[#128C7E] transition-colors"
      >
        <Smartphone className="h-4 w-4" />
        Abrir panel de Evolution para escanear QR
        <ExternalLink className="h-3.5 w-3.5" />
      </a>
      <p className="text-[10px] text-muted-foreground text-center">
        O vaya directamente a <code className="bg-muted px-1 rounded">{evoUrl}</code> → instancia <code className="bg-muted px-1 rounded">{instance}</code> → Conectar
      </p>

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
