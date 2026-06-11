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
      const { ok, status, text } = await api(`/instance/connectionState/${encodeURIComponent(instance)}`);
      setLastResponse(`connectionState: HTTP ${status}\n${text.slice(0, 500)}`);
      if (!ok) throw new Error(`HTTP ${status}: ${text}`);
      const data = JSON.parse(text);
      const state = data?.state?.toLowerCase?.() || "unknown";
      setStatus(state === "open" ? "open" : state === "connecting" ? "connecting" : "close");
      // Algunas versiones devuelven QR aquí
      const qr = data?.qrcode || data?.qr || data?.base64;
      if (qr && state !== "open") setQrCode(qr);
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
      const { ok, status, text } = await api(`/instance/logout/${encodeURIComponent(instance)}`, { method: "DELETE" });
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
      // Intento 1: GET /instance/qr/{instance}
      const r1 = await api(`/instance/qr/${encodeURIComponent(instance)}`);
      setLastResponse(`qr GET: HTTP ${r1.status}\n${r1.text.slice(0, 500)}`);
      if (r1.ok) {
        const d1 = JSON.parse(r1.text);
        const qr = d1?.qrcode || d1?.qr || d1?.base64 || d1?.code;
        if (qr) { setQrCode(qr); toast.success("Escanea el QR con WhatsApp"); setChecking(false); return; }
      }

      // Intento 2: POST /instance/connect/{instance}
      const r2 = await api(`/instance/connect/${encodeURIComponent(instance)}`, { method: "POST" });
      setLastResponse(`connect POST: HTTP ${r2.status}\n${r2.text.slice(0, 500)}`);
      if (r2.ok) {
        const d2 = JSON.parse(r2.text);
        const qr = d2?.qrcode || d2?.qr || d2?.base64 || d2?.code;
        if (qr) { setQrCode(qr); toast.success("Escanea el QR con WhatsApp"); setChecking(false); return; }
      }

      // Intento 3: GET /instance/connect/{instance}
      const r3 = await api(`/instance/connect/${encodeURIComponent(instance)}`);
      setLastResponse(`connect GET: HTTP ${r3.status}\n${r3.text.slice(0, 500)}`);
      if (r3.ok) {
        const d3 = JSON.parse(r3.text);
        const qr = d3?.qrcode || d3?.qr || d3?.base64 || d3?.code;
        if (qr) { setQrCode(qr); toast.success("Escanea el QR con WhatsApp"); setChecking(false); return; }
      }

      // Intento 4: POST /instance/restart/{instance}
      const r4 = await api(`/instance/restart/${encodeURIComponent(instance)}`, { method: "POST" });
      setLastResponse(`restart POST: HTTP ${r4.status}\n${r4.text.slice(0, 500)}`);
      if (r4.ok) {
        toast.info("Instancia reiniciada. Intente Verificar Estado en 5 segundos.");
      } else {
        throw new Error("Ningún endpoint de QR respondió. Verifique que la instancia exista.");
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
