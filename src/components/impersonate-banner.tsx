"use client";

import { useEffect, useState } from "react";
import { LogOut, Eye } from "lucide-react";

export function ImpersonateBanner() {
  const [impName, setImpName] = useState<string | null>(null);

  useEffect(() => {
    const v = localStorage.getItem("sek_impersonating");
    if (v) setImpName(v);
  }, []);

  if (!impName) return null;

  const handleReturn = async () => {
    const returnUrl = localStorage.getItem("sek_return_url");
    localStorage.removeItem("sek_impersonating");
    localStorage.removeItem("sek_return_url");
    // returnUrl es el magic link del superadmin — navegar directo
    // /auth/confirm hará signOut del agente y establecerá sesión de César
    window.location.href = returnUrl || "/login";
  };

  return (
    <div className="flex items-center justify-between gap-3 px-4 py-2 bg-rose-600 text-white text-sm font-semibold shrink-0 z-50">
      <div className="flex items-center gap-2">
        <Eye className="h-4 w-4 shrink-0" />
        <span>Estás viendo la sesión de <strong>{impName}</strong></span>
      </div>
      <button
        onClick={handleReturn}
        className="flex items-center gap-1.5 px-3 py-1 rounded-lg bg-white/20 hover:bg-white/30 transition-colors text-xs font-bold whitespace-nowrap"
      >
        <LogOut className="h-3.5 w-3.5" /> Volver a mi sesión
      </button>
    </div>
  );
}
