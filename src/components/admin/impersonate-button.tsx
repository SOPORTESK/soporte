"use client";

import { useState } from "react";
import { LogIn, Loader2 } from "lucide-react";

export function ImpersonateButton({ email, name }: { email: string; name: string }) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleImpersonate = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/admin/impersonate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, agentName: name }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Error desconocido");
      // Guardar datos de impersonación sin cambiar sesión
      localStorage.setItem("sek_impersonating_email", email);
      localStorage.setItem("sek_impersonating_name", data.agentName || name);
      localStorage.setItem("sek_impersonating_mode", "true");
      // Ir al inbox para ver la vista del compañero
      window.location.href = "/inbox";
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Error al impersonar");
      setLoading(false);
    }
  };

  return (
    <div className="flex flex-col items-end gap-1">
      <button
        onClick={handleImpersonate}
        disabled={loading}
        className="flex items-center gap-2 px-4 py-2 rounded-xl bg-gradient-to-r from-rose-600 to-rose-500 hover:from-rose-500 hover:to-rose-400 text-white text-sm font-bold shadow-lg shadow-rose-500/25 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
      >
        {loading
          ? <><Loader2 className="h-4 w-4 animate-spin" /> Generando acceso...</>
          : <><LogIn className="h-4 w-4" /> Entrar como {name.split(" ")[0]}</>
        }
      </button>
      {error && <p className="text-[11px] text-rose-400">{error}</p>}
    </div>
  );
}
