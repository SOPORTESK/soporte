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

  async function checkState() {
    setChecking(true);
    try {
      const res = await fetch(`${evoUrl.replace(/\/$/, "")}/instance/connectionState/${encodeURIComponent(instance)}`, {
        headers: { apikey: evoKey, "Content-Type": "application/json" },
      });
      if (!res.ok) throw new Error("Evolution no responde");
      const data = await res.json();
      const state = data?.state?.toLowerCase?.() || "unknown";
      setStatus(state === "open" ? "open" : state === "connecting" ? "connecting" : "close");
    } catch {
      setStatus("unknown");
    } finally {
      setChecking(false);
    }
  }

  async function logout() {
    try {
      await fetch(`${evoUrl.replace(/\/$/, "")}/instance/logout/${encodeURIComponent(instance)}`, {
        method: "DELETE",
        headers: { apikey: evoKey, "Content-Type": "application/json" },
      });
      toast.success("Sesión cerrada. Puede generar QR ahora.");
      setQrCode(null);
      setStatus("close");
    } catch {
      toast.error("Error cerrando sesión");
    }
  }

  async function fetchQR() {
    setQrCode(null);
    setChecking(true);
    try {
      // Intento 1: endpoint directo de QR
      const res = await fetch(`${evoUrl.replace(/\/$/, "")}/instance/qr/${encodeURIComponent(instance)}`, {
        headers: { apikey: evoKey, "Content-Type": "application/json" },
      });
      if (res.ok) {
        const data = await res.json();
        if (data?.qrcode || data?.qr) {
          setQrCode(data.qrcode || data.qr);
          toast.success("Escanea el QR con WhatsApp");
          return;
        }
      }
      // Intento 2: endpoint de conexión
      const res2 = await fetch(`${evoUrl.replace(/\/$/, "")}/instance/connect/${encodeURIComponent(instance)}`, {
        method: "POST",
        headers: { apikey: evoKey, "Content-Type": "application/json" },
      });
      if (res2.ok) {
        const data2 = await res2.json();
        if (data2?.qrcode || data2?.qr || data2?.base64) {
          setQrCode(data2.qrcode || data2.qr || data2.base64);
          toast.success("Escanea el QR con WhatsApp");
          return;
        }
      }
      toast.error("No se pudo obtener el QR. Asegúrese de que Docker esté encendido.");
    } catch {
      toast.error("Error conectando. ¿Docker está encendido?");
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

      {status === "unknown" && (
        <div className="flex items-center gap-2 text-amber-600 text-xs p-2 bg-amber-500/10 rounded-lg">
          <AlertTriangle className="h-4 w-4" />
          No se puede verificar el estado. ¿Docker está encendido? ¿La URL y API Key son correctas?
        </div>
      )}
    </div>
  );
}
