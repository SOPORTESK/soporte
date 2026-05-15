"use client";

import { useState } from "react";
import { Crown, Loader2 } from "lucide-react";

export function GodModeButton({ email, name }: { email: string; name: string }) {
  const [loading, setLoading] = useState(false);

  const activateGodMode = async () => {
    setLoading(true);
    // Guardar modo dios
    localStorage.setItem("god_mode_target_email", email);
    localStorage.setItem("god_mode_target_name", name);
    localStorage.setItem("god_mode_active", "true");
    // Recargar para activar el banner en el perfil actual
    window.location.reload();
  };

  return (
    <button
      onClick={activateGodMode}
      disabled={loading}
      className="flex items-center gap-2 px-4 py-2 rounded-xl bg-gradient-to-r from-violet-600 to-purple-500 hover:from-violet-500 hover:to-purple-400 text-white text-sm font-bold shadow-lg shadow-violet-500/25 transition-all disabled:opacity-50"
    >
      {loading ? (
        <><Loader2 className="h-4 w-4 animate-spin" /> Activando...</>
      ) : (
        <><Crown className="h-4 w-4" /> Modo Dios: {name.split(" ")[0]}</>
      )}
    </button>
  );
}
