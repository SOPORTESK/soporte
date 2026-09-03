interface LogActivityParams {
  agent_email: string;
  agent_name: string;
  action: string;
  category: string;
  case_id?: string | null;
  metadata?: Record<string, any> | null;
  duration_ms?: number | null;
}

export function logActivity(params: LogActivityParams): void {
  if (typeof window === "undefined") return;
  try {
    const payload = JSON.stringify(params);
    if (typeof navigator !== "undefined" && navigator.sendBeacon) {
      const blob = new Blob([payload], { type: "application/json" });
      navigator.sendBeacon("/api/activity/log", blob);
    } else {
      fetch("/api/activity/log", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: payload,
        keepalive: true,
      }).catch(() => {});
    }
  } catch (e) {
    // Silencioso para no degradar el rendimiento de la UI
  }
}
