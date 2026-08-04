"use client";

import { useState } from "react";
import { toast } from "sonner";
import { EyeOff, MessageSquare } from "lucide-react";

export function UnattendedModeToggle({ initialValue }: { initialValue: boolean }) {
  const [unattended, setUnattended] = useState(initialValue);
  const [loading, setLoading] = useState(false);

  const toggle = async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/admin/unattended-mode", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ modo_no_atendido: !unattended }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Error");
      setUnattended(data.modo_no_atendido);
      toast.success(
        data.modo_no_atendido
          ? "Modo No Atendido activado — solo bienvenida y registro de mensajes."
          : "Modo No Atendido desactivado — funcionalidad normal restaurada."
      );
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className={`rounded-2xl border-2 p-5 transition-all ${unattended ? "border-amber-500/40 bg-amber-500/8" : "border-border/60 bg-card"}`}>
      <div className="flex items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className={`h-10 w-10 rounded-xl grid place-items-center shrink-0 ${unattended ? "bg-amber-500/15 text-amber-500" : "bg-muted text-muted-foreground"}`}>
            {unattended ? <EyeOff className="h-5 w-5" /> : <MessageSquare className="h-5 w-5" />}
          </div>
          <div>
            <p className={`text-sm font-black ${unattended ? "text-amber-500" : ""}`}>
              {unattended ? "⚠️ MODO NO ATENDIDO ACTIVO" : "Modo No Atendido"}
            </p>
            <p className="text-[11px] text-muted-foreground mt-0.5">
              {unattended
                ? "Solo bienvenida y registro de mensajes. Sin IA, sin auto-close, sin encuestas, sin escalado."
                : "Desactiva todas las funcionalidades automáticas. WhatsApp queda solo como buzón de mensajes."}
            </p>
          </div>
        </div>
        <button
          onClick={toggle}
          disabled={loading}
          className={`relative shrink-0 h-7 w-12 rounded-full transition-colors duration-200 focus:outline-none disabled:opacity-50 ${unattended ? "bg-amber-500" : "bg-muted-foreground/30"}`}
        >
          <span className={`absolute top-0.5 h-6 w-6 rounded-full bg-white shadow transition-transform duration-200 ${unattended ? "translate-x-5" : "translate-x-0.5"}`} />
        </button>
      </div>
    </div>
  );
}
