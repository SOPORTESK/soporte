"use client";

import { useEffect, useState } from "react";
import { Crown, LogOut, Inbox } from "lucide-react";

export function GodModeBanner() {
  const [godMode, setGodMode] = useState<{ email: string; name: string } | null>(null);

  useEffect(() => {
    const email = localStorage.getItem("god_mode_target_email");
    const name = localStorage.getItem("god_mode_target_name");
    if (email && localStorage.getItem("god_mode_active") === "true") {
      setGodMode({ email, name: name || email });
    }
  }, []);

  const salir = () => {
    localStorage.removeItem("god_mode_target_email");
    localStorage.removeItem("god_mode_target_name");
    localStorage.removeItem("god_mode_active");
    window.location.href = "/admin/equipo";
  };

  const irAlInbox = () => {
    window.location.href = "/inbox";
  };

  if (!godMode) return null;

  return (
    <div className="rounded-xl bg-gradient-to-r from-amber-500 via-orange-500 to-rose-500 text-white px-4 py-3 flex items-center justify-between mb-6 shadow-lg shadow-orange-500/20">
      <div className="flex items-center gap-2">
        <Crown className="h-5 w-5" />
        <span className="text-sm font-bold">
          MODO DIOS — Viendo perfil de: <strong className="underline">{godMode.name}</strong>
        </span>
      </div>
      <div className="flex items-center gap-2">
        <button 
          onClick={irAlInbox} 
          className="flex items-center gap-1 text-xs bg-white/20 hover:bg-white/30 px-3 py-1.5 rounded-md transition-colors font-medium"
        >
          <Inbox className="h-3 w-3" /> Ver casos
        </button>
        <button 
          onClick={salir} 
          className="flex items-center gap-1 text-xs bg-white/30 hover:bg-white/40 px-3 py-1.5 rounded-md transition-colors font-medium"
        >
          <LogOut className="h-3 w-3" /> Salir
        </button>
      </div>
    </div>
  );
}
