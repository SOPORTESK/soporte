"use client";

import { useState } from "react";
import { toast } from "sonner";
import { Bot, WifiOff } from "lucide-react";

export function IaModeToggle({ initialValue }: { initialValue: boolean }) {
  const [iaActiva, setIaActiva] = useState(initialValue);
  const [loading, setLoading] = useState(false);

  const toggle = async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/admin/ia-mode", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ia_activa: !iaActiva }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Error");
      setIaActiva(data.ia_activa);
      toast.success(data.ia_activa ? "Agente IA activado — el Asistente Virtual responde automáticamente." : "Modo Manual activado — todos los chats requieren atención humana.");
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className={`rounded-2xl border-2 p-5 transition-all ${iaActiva ? "border-emerald-500/30 bg-emerald-500/5" : "border-red-500/40 bg-red-500/8"}`}>
      <div className="flex items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className={`h-10 w-10 rounded-xl grid place-items-center shrink-0 ${iaActiva ? "bg-emerald-500/15 text-emerald-500" : "bg-red-500/15 text-red-500"}`}>
            {iaActiva ? <Bot className="h-5 w-5" /> : <WifiOff className="h-5 w-5" />}
          </div>
          <div>
            <p className={`text-sm font-black ${iaActiva ? "text-emerald-500" : "text-red-500"}`}>
              {iaActiva ? "Agente IA: ACTIVO" : "⚠️ MODO MANUAL — IA DESACTIVADA"}
            </p>
            <p className="text-[11px] text-muted-foreground mt-0.5">
              {iaActiva
                ? "El Asistente Virtual responde automáticamente a todos los chats entrantes."
                : "Todos los chats nuevos requieren atención de un agente humano. El Asistente Virtual no intervendrá."}
            </p>
          </div>
        </div>
        <button
          type="button"
          role="switch"
          aria-checked={iaActiva}
          onClick={toggle}
          disabled={loading}
          className={`relative inline-flex h-7 w-12 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none disabled:opacity-50 ${
            iaActiva ? "bg-emerald-500" : "bg-red-500"
          }`}
        >
          <span
            className={`pointer-events-none inline-block h-6 w-6 transform rounded-full bg-white shadow-md ring-0 transition duration-200 ease-in-out ${
              iaActiva ? "translate-x-5" : "translate-x-0"
            }`}
          />
        </button>
      </div>
    </div>
  );
}
