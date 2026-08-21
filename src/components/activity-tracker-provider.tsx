"use client";

import { useEffect } from "react";
import { useActivityTracker } from "@/lib/use-activity-tracker";

declare global {
  interface Window {
    electronAPI?: {
      isElectron: boolean;
      activityStart: (email: string, name: string) => void;
      activityStop: () => void;
    };
  }
}

export function ActivityTrackerProvider({
  agentEmail,
  agentName,
  enabled = true,
}: {
  agentEmail: string;
  agentName: string;
  enabled?: boolean;
}) {
  // Tracking web (navegación, clicks, tiempo por página, inactividad)
  // Funciona tanto en Vercel como en local
  useActivityTracker(agentEmail, agentName, enabled);

  // Iniciar desktop tracking si está en Electron
  useEffect(() => {
    if (!agentEmail || !enabled) return;

    const electronAPI = typeof window !== "undefined" ? window.electronAPI : undefined;

    if (electronAPI?.isElectron) {
      // Electron: usar IPC nativo para tracking de OS
      // Guard: el preload puede no exponer estas funciones en todas las versiones
      if (typeof electronAPI.activityStart !== "function") return;
      electronAPI.activityStart(agentEmail, agentName);
      return () => {
        if (typeof electronAPI.activityStop === "function") electronAPI.activityStop();
      };
    } else {
      // Web/local: intentar desktop-agent via API (solo funciona en local)
      const startDesktopAgent = async () => {
        try {
          await fetch("/api/activity/desktop-agent", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              action: "start",
              agent_email: agentEmail,
              agent_name: agentName,
            }),
          });
        } catch (e) {
          // Silencioso - no romper si no está disponible
        }
      };
      startDesktopAgent();
    }
  }, [agentEmail, agentName]);

  return null;
}
