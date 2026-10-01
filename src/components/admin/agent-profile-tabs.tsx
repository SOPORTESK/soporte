"use client";

import React, { useState } from "react";
import { TrendingUp, Clock, History } from "lucide-react";

interface AgentProfileTabsProps {
  rendimientoContent: React.ReactNode;
  historialContent: React.ReactNode;
  gestionContent: React.ReactNode;
  casosCount?: number;
  defaultTab?: "rendimiento" | "historial" | "gestion";
}

export function AgentProfileTabs({
  rendimientoContent,
  historialContent,
  gestionContent,
  casosCount,
  defaultTab = "rendimiento",
}: AgentProfileTabsProps) {
  const [activeTab, setActiveTab] = useState<"rendimiento" | "historial" | "gestion">(defaultTab);

  const handleTabChange = (tab: "rendimiento" | "historial" | "gestion") => {
    setActiveTab(tab);
    if (typeof window !== "undefined") {
      const url = new URL(window.location.href);
      url.searchParams.set("tab", tab);
      window.history.replaceState({}, "", url.toString());
    }
  };

  return (
    <div className="space-y-6">
      {/* Selector de pestañas */}
      <div className="flex items-center gap-2 border-b border-border/70 overflow-x-auto scrollbar-none">
        <button
          type="button"
          onClick={() => handleTabChange("rendimiento")}
          className={`flex items-center gap-2 px-5 py-3 font-black text-sm tracking-tight transition-all border-b-2 -mb-px cursor-pointer shrink-0 rounded-t-xl ${
            activeTab === "rendimiento"
              ? "border-violet-500 text-violet-400 bg-violet-500/10 shadow-xs"
              : "border-transparent text-muted-foreground hover:text-foreground hover:bg-muted/40"
          }`}
        >
          <TrendingUp className="h-4 w-4" />
          <span>Rendimiento</span>
        </button>

        <button
          type="button"
          onClick={() => handleTabChange("historial")}
          className={`flex items-center gap-2 px-5 py-3 font-black text-sm tracking-tight transition-all border-b-2 -mb-px cursor-pointer shrink-0 rounded-t-xl ${
            activeTab === "historial"
              ? "border-violet-500 text-violet-400 bg-violet-500/10 shadow-xs"
              : "border-transparent text-muted-foreground hover:text-foreground hover:bg-muted/40"
          }`}
        >
          <History className="h-4 w-4" />
          <span>Historial de Casos</span>
          {typeof casosCount === "number" && (
            <span
              className={`text-[10px] font-bold px-2 py-0.5 rounded-full border transition-colors ${
                activeTab === "historial"
                  ? "bg-violet-500/20 text-violet-300 border-violet-500/30"
                  : "bg-muted text-muted-foreground border-border/60"
              }`}
            >
              {casosCount}
            </span>
          )}
        </button>

        <button
          type="button"
          onClick={() => handleTabChange("gestion")}
          className={`flex items-center gap-2 px-5 py-3 font-black text-sm tracking-tight transition-all border-b-2 -mb-px cursor-pointer shrink-0 rounded-t-xl ${
            activeTab === "gestion"
              ? "border-violet-500 text-violet-400 bg-violet-500/10 shadow-xs"
              : "border-transparent text-muted-foreground hover:text-foreground hover:bg-muted/40"
          }`}
        >
          <Clock className="h-4 w-4" />
          <span>Gestión de Trabajo</span>
        </button>
      </div>

      {/* Contenido de la pestaña activa */}
      {activeTab === "rendimiento" && (
        <div className="space-y-8 animate-in fade-in-50 duration-200">
          {rendimientoContent}
        </div>
      )}

      {activeTab === "historial" && (
        <div className="space-y-8 animate-in fade-in-50 duration-200">
          {historialContent}
        </div>
      )}

      {activeTab === "gestion" && (
        <div className="space-y-8 animate-in fade-in-50 duration-200">
          {gestionContent}
        </div>
      )}
    </div>
  );
}
