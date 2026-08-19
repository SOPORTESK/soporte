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
  // Solo para admins/tecnicos — los agentes regulares no tienen overhead
  useActivityTracker(agentEmail, agentName, enabled && !!process.env.VERCEL);

  // Iniciar desktop tracking si está en Electron
  useEffect(() => {
    if (!agentEmail || !enabled) return;

    const electronAPI = typeof window !== "undefined" ? window.electronAPI : undefined;

    if (!process.env.VERCEL && !electronAPI?.isElectron) return;

    if (electronAPI?.isElectron) {
      // Electron: usar IPC nativo para tracking de OS
      electronAPI.activityStart(agentEmail, agentName);
      return () => {
        electronAPI.activityStop();
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
