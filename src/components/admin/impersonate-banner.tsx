"use client";

import { useEffect, useState } from "react";
import { Eye, LogOut } from "lucide-react";

export function ImpersonateBanner() {
  const [impersonating, setImpersonating] = useState<{ email: string; name: string } | null>(null);

  useEffect(() => {
    const email = localStorage.getItem("sek_impersonating_email");
    const name = localStorage.getItem("sek_impersonating_name");
    if (email) setImpersonating({ email, name: name || email });
  }, []);

  const salir = () => {
    localStorage.removeItem("sek_impersonating_email");
    localStorage.removeItem("sek_impersonating_name");
    localStorage.removeItem("sek_impersonating_mode");
    window.location.href = "/admin/equipo";
  };

  if (!impersonating) return null;

  return (
    <div className="rounded-xl bg-gradient-to-r from-violet-600 via-purple-600 to-rose-500 text-white px-4 py-3 flex items-center justify-between mb-6">
      <div className="flex items-center gap-2">
        <Eye className="h-4 w-4" />
        <span className="text-sm font-medium">
          Estás viendo el perfil como: <strong>{impersonating.name}</strong>
        </span>
      </div>
      <button onClick={salir} className="flex items-center gap-1 text-xs bg-white/20 hover:bg-white/30 px-3 py-1.5 rounded-md transition-colors">
        <LogOut className="h-3 w-3" /> Salir de vista
      </button>
    </div>
  );
}
