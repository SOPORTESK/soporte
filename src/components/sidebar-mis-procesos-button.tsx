"use client";

import * as React from "react";
import { ShieldCheck } from "lucide-react";

export function SidebarMisProcesosButton() {
  return (
    <button
      type="button"
      onClick={() => window.dispatchEvent(new CustomEvent("open-mis-garantias-modal"))}
      className="flex items-center gap-2.5 px-3 py-2 rounded-xl text-xs font-semibold text-muted-foreground hover:text-foreground hover:bg-muted/50 transition-colors w-full text-left cursor-pointer group"
      title="Abrir mis procesos de garantías donde soy el propietario"
    >
      <div className="h-6 w-6 rounded-lg bg-brand-500/10 text-brand-500 border border-brand-500/20 flex items-center justify-center group-hover:scale-105 transition-transform shrink-0">
        <ShieldCheck className="h-3.5 w-3.5" />
      </div>
      <div className="flex-1 min-w-0">
        <span className="text-xs font-bold text-foreground block leading-tight">Mis Procesos</span>
        <span className="text-[10px] text-muted-foreground block truncate leading-tight">Garantías Propias</span>
      </div>
    </button>
  );
}
