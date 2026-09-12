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
    const act = (params.action || "").toLowerCase();
    const cat = (params.category || "").toLowerCase();
    const meta = params.metadata || {};
    const isManualAction = Boolean(
      meta.manual ||
      meta.task ||
      meta.justification ||
      act.startsWith("inició:") ||
      act.startsWith("inicio:") ||
      act.startsWith("terminó:") ||
      act.startsWith("termino:") ||
      act.startsWith("justificación:") ||
      act.startsWith("justificacion:") ||
      cat === "labores manuales" ||
      cat === "capacitación" ||
      cat === "capacitacion" ||
      cat === "tiempo de descanso" ||
      cat === "pausa personal" ||
      cat === "reunión interna" ||
      cat === "reunion interna" ||
      cat === "atención presencial" ||
      cat === "atencion presencial" ||
      cat === "mantenimiento" ||
      cat === "inventario"
    );

    // Si hay una labor manual activa, SE PAUSAN TODOS LOS DEMÁS LOGS
    if (!isManualAction) {
      try {
        const saved = localStorage.getItem("sekunet_manual_task");
        if (saved) {
          const parsed = JSON.parse(saved);
          if (parsed?.start && Date.now() - parsed.start < 12 * 60 * 60 * 1000) {
            // Labor manual activa: no emitir logs de navegación, casos ni inactividad
            return;
          }
        }
      } catch {}
    }

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
