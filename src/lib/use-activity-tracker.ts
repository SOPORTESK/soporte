"use client";

import { useEffect, useRef } from "react";
import { usePathname } from "next/navigation";
import { logActivity } from "@/lib/activity-client";

const HEARTBEAT_INTERVAL = 5 * 60 * 1000; // 5 minutos
const IDLE_THRESHOLD = 5 * 60 * 1000; // 5 minutos

// Flags globales para evitar duplicar entre layouts
let sessionLogged = false;
let sessionStart = Date.now();

// Helper: leer case ID del URL sin usar useSearchParams (evita re-renders)
function getCaseIdFromURL(): string {
  if (typeof window === "undefined") return "";
  try {
    const params = new URLSearchParams(window.location.search);
    return params.get("c") || "";
  } catch {
    return "";
  }
}

export function useActivityTracker(agentEmail: string, agentName: string, enabled: boolean = true) {
  const pathname = usePathname();
  const lastPathRef = useRef<string>("");
  const lastCaseIdRef = useRef<string>("");
  const pageEnterRef = useRef<number>(Date.now());
  const caseEnterRef = useRef<number>(Date.now());
  const lastHeartbeatRef = useRef<number>(Date.now());
  const isIdleRef = useRef<boolean>(false);
  const hasFocusRef = useRef<boolean>(true);
  const mountedRef = useRef<boolean>(false);

  // Interaction counters per page
  const clickCountRef = useRef<number>(0);
  const keyCountRef = useRef<number>(0);
  const scrollCountRef = useRef<number>(0);
  const interactionLoggedRef = useRef<Set<string>>(new Set());

  // ── Track route changes only (no search params) ──
  useEffect(() => {
    if (!agentEmail || !enabled) return;

    const now = Date.now();
    const currentCaseId = getCaseIdFromURL();
    const caseChanged = currentCaseId !== lastCaseIdRef.current;

    // Si cambió de caso, loguear el tiempo del caso anterior como Mensajería
    if (caseChanged && lastCaseIdRef.current) {
      const caseDuration = now - caseEnterRef.current;
      const keys = keyCountRef.current;
      const clicks = clickCountRef.current;
      const totalInteractions = clicks + keys + scrollCountRef.current;

      if (caseDuration > 3000) {
        logActivity({
          agent_email: agentEmail,
          agent_name: agentName,
          action: `Atendió caso ${lastCaseIdRef.current} durante ${formatDwell(caseDuration / 1000)} (${totalInteractions} interacciones)`,
          category: "Mensajería",
          case_id: lastCaseIdRef.current,
          duration_ms: caseDuration,
          metadata: {
            case_id: lastCaseIdRef.current,
            duration_seconds: Math.round(caseDuration / 1000),
            clicks,
            key_presses: keys,
            total_interactions: totalInteractions,
            page: lastPathRef.current,
          },
        });
      }

      clickCountRef.current = 0;
      keyCountRef.current = 0;
      scrollCountRef.current = 0;
      interactionLoggedRef.current = new Set();
      caseEnterRef.current = now;
    }

    // Si cambió de ruta, loguear tiempo en página anterior como Navegación
    if (pathname !== lastPathRef.current) {
      if (lastPathRef.current) {
        const dwellSec = Math.round((now - pageEnterRef.current) / 1000);
        const clicks = clickCountRef.current;
        const keys = keyCountRef.current;
        const scrolls = scrollCountRef.current;
        const totalInteractions = clicks + keys + scrolls;

        const prevLabel = pathnameToLabel(lastPathRef.current);
        let detail = `Permaneció en "${prevLabel}" durante ${formatDwell(dwellSec)}`;

        if (totalInteractions > 0) {
          const parts: string[] = [];
          if (clicks > 0) parts.push(`${clicks} clicks`);
          if (keys > 0) parts.push(`${keys} pulsaciones de teclado`);
          if (scrolls > 0) parts.push(`${scrolls} scrolls`);
          detail += `. Interacciones: ${parts.join(", ")}`;
        }

        logActivity({
          agent_email: agentEmail,
          agent_name: agentName,
          action: detail,
          category: "Navegación",
          duration_ms: now - pageEnterRef.current,
          metadata: {
            page: lastPathRef.current,
            dwell_seconds: dwellSec,
            clicks,
            key_presses: keys,
            scrolls,
            total_interactions: totalInteractions,
          },
        });

        clickCountRef.current = 0;
        keyCountRef.current = 0;
        scrollCountRef.current = 0;
        interactionLoggedRef.current = new Set();
      }

      // Registrar navegación (solo el cambio, sin esperar)
      const pageLabel = pathnameToLabel(pathname);
      const navDetail = lastPathRef.current
        ? `Navegó de "${pathnameToLabel(lastPathRef.current)}" a "${pageLabel}"`
        : `Abrió la página: ${pageLabel}`;

      logActivity({
        agent_email: agentEmail,
        agent_name: agentName,
        action: navDetail,
        category: "Navegación",
        metadata: { path: pathname, from: lastPathRef.current || null },
      });

      lastPathRef.current = pathname;
      pageEnterRef.current = now;
      caseEnterRef.current = now;
    }

    lastCaseIdRef.current = currentCaseId;
  }, [pathname, agentEmail, agentName]);

  // ── Track interactions, idle, focus, heartbeat ──
  useEffect(() => {
    if (!agentEmail || !enabled) return;
    if (mountedRef.current) return;
    mountedRef.current = true;

    let idleTimer: ReturnType<typeof setTimeout>;
    let scrollTimer: ReturnType<typeof setTimeout>;

    // Log de inicio de sesión solo una vez
    if (!sessionLogged) {
      sessionLogged = true;
      sessionStart = Date.now();
      logActivity({
        agent_email: agentEmail,
        agent_name: agentName,
        action: `Inició sesión en el sistema`,
        category: "Navegación",
        metadata: { session_start: new Date().toISOString() },
      });
    }

    const logHeartbeat = () => {
      if (isIdleRef.current || !hasFocusRef.current) return;
      const now = Date.now();
      const elapsed = now - lastHeartbeatRef.current;
      if (elapsed >= HEARTBEAT_INTERVAL) {
        lastHeartbeatRef.current = now;
        const pageLabel = pathnameToLabel(lastPathRef.current);
        const dwellSec = Math.round((now - pageEnterRef.current) / 1000);
        const clicks = clickCountRef.current;
        const keys = keyCountRef.current;
        const totalInteractions = clicks + keys + scrollCountRef.current;
        const activeCaseId = lastCaseIdRef.current;

        // Solo loguear si hubo interacciones reales
        if (totalInteractions > 0) {
          // Si está atendiendo un caso = Mensajería, sino Navegación
          const isOnCase = !!activeCaseId && ["/inbox", "/smart-inbox", "/mi-gestion", "/soporte-avanzado"].includes(lastPathRef.current);
          const category = isOnCase ? "Mensajería" : "Navegación";
          const detail = isOnCase
            ? `Atendiendo caso ${activeCaseId} (${formatDwell(dwellSec)}) - ${totalInteractions} interacciones`
            : `Activo en "${pageLabel}" (${formatDwell(dwellSec)}) - ${totalInteractions} interacciones`;

          logActivity({
            agent_email: agentEmail,
            agent_name: agentName,
            action: detail,
            category,
            case_id: isOnCase ? activeCaseId : undefined,
            duration_ms: elapsed,
            metadata: {
              page: lastPathRef.current,
              case_id: isOnCase ? activeCaseId : undefined,
              dwell_seconds: dwellSec,
              clicks,
              key_presses: keys,
              total_interactions: totalInteractions,
            },
          });
        }
      }
    };

    let lastResetTime = 0;
    const resetIdle = () => {
      const now = Date.now();
      if (isIdleRef.current) {
        isIdleRef.current = false;
        const idleDurationSec = (now - lastHeartbeatRef.current) / 1000;
        const pageLabel = pathnameToLabel(lastPathRef.current);
        if (idleDurationSec >= 30) {
          logActivity({
            agent_email: agentEmail,
            agent_name: agentName,
            action: `Reanudó labores tras ${formatDwell(idleDurationSec)} de pausa en "${pageLabel}"`,
            category: "Navegación",
            metadata: { idle_seconds: Math.round(idleDurationSec), page: lastPathRef.current },
          });
        }
      }
      lastHeartbeatRef.current = now;

      // Throttlear recreación de timers a máximo 1 vez cada 10 segundos para mantener la UI al 100% de agilidad
      if (now - lastResetTime < 10000) return;
      lastResetTime = now;

      clearTimeout(idleTimer);
      idleTimer = setTimeout(() => {
        isIdleRef.current = true;
        const pageLabel = pathnameToLabel(lastPathRef.current);
        logActivity({
          agent_email: agentEmail,
          agent_name: agentName,
          action: `Pausa de 5 minutos sin interacción en "${pageLabel}"`,
          category: "Inactividad",
          duration_ms: IDLE_THRESHOLD,
          metadata: { page: lastPathRef.current },
        });
      }, IDLE_THRESHOLD);
    };

    // ── Track clicks (solo contar e idle reset, sin spamear logs individuales) ──
    const handleClick = (_e: MouseEvent) => {
      clickCountRef.current++;
      resetIdle();
    };

    // ── Track teclado (solo contar, no loguear cada tecla) ──
    const handleKeydown = (e: KeyboardEvent) => {
      keyCountRef.current++;
      resetIdle();
    };

    // ── Track scroll (debounced, solo contar) ──
    const handleScroll = () => {
      scrollCountRef.current++;
      clearTimeout(scrollTimer);
      scrollTimer = setTimeout(() => resetIdle(), 150);
    };

    const handleFocus = () => {
      if (!hasFocusRef.current) {
        hasFocusRef.current = true;
      }
      resetIdle();
    };

    const handleBlur = () => {
      if (hasFocusRef.current) {
        hasFocusRef.current = false;
      }
    };

    const handleVisibilityChange = () => {
      if (!document.hidden) {
        resetIdle();
      }
    };

    const handleUnload = () => {
      const sessionDuration = Date.now() - sessionStart;
      const pageLabel = pathnameToLabel(lastPathRef.current);
      const dwellSec = Math.round((Date.now() - pageEnterRef.current) / 1000);
      const activeCaseId = lastCaseIdRef.current;
      const isOnCase = !!activeCaseId && ["/inbox", "/smart-inbox", "/mi-gestion", "/soporte-avanzado"].includes(lastPathRef.current);

      // Loguear caso activo como Mensajería al cerrar
      if (isOnCase) {
        const caseDuration = Date.now() - caseEnterRef.current;
        if (caseDuration > 3000) {
          logActivity({
            agent_email: agentEmail,
            agent_name: agentName,
            action: `Atendió caso ${activeCaseId} durante ${formatDwell(caseDuration / 1000)} (al cerrar sesión)`,
            category: "Mensajería",
            case_id: activeCaseId,
            duration_ms: caseDuration,
            metadata: {
              case_id: activeCaseId,
              duration_seconds: Math.round(caseDuration / 1000),
              page: lastPathRef.current,
            },
          });
        }
      }

      logActivity({
        agent_email: agentEmail,
        agent_name: agentName,
        action: `Cerró sesión. Tiempo total: ${formatDwell(sessionDuration / 1000)}. Última página: "${pageLabel}" (${formatDwell(dwellSec)})`,
        category: "Navegación",
        duration_ms: sessionDuration,
        metadata: { session_duration_s: Math.round(sessionDuration / 1000), last_page: lastPathRef.current },
      });
    };

    // Registrar listeners
    window.addEventListener("click", handleClick, { passive: true });
    window.addEventListener("keydown", handleKeydown, { passive: true });
    window.addEventListener("scroll", handleScroll, { passive: true });
    window.addEventListener("focus", handleFocus);
    window.addEventListener("blur", handleBlur);
    document.addEventListener("visibilitychange", handleVisibilityChange);
    window.addEventListener("beforeunload", handleUnload);

    const heartbeatInterval = setInterval(logHeartbeat, HEARTBEAT_INTERVAL);

    // Polling ligero: detectar cambios de caso (c=) sin useSearchParams
    const casePoll = setInterval(() => {
      const currentCaseId = getCaseIdFromURL();
      if (currentCaseId !== lastCaseIdRef.current) {
        const now = Date.now();
        const prevCaseId = lastCaseIdRef.current;
        if (prevCaseId) {
          const caseDuration = now - caseEnterRef.current;
          const totalInteractions = clickCountRef.current + keyCountRef.current + scrollCountRef.current;
          if (caseDuration > 3000) {
            logActivity({
              agent_email: agentEmail,
              agent_name: agentName,
              action: `Atendió caso ${prevCaseId} durante ${formatDwell(caseDuration / 1000)} (${totalInteractions} interacciones)`,
              category: "Mensajería",
              case_id: prevCaseId,
              duration_ms: caseDuration,
              metadata: {
                case_id: prevCaseId,
                duration_seconds: Math.round(caseDuration / 1000),
                total_interactions: totalInteractions,
                page: lastPathRef.current,
              },
            });
          }
        }
        clickCountRef.current = 0;
        keyCountRef.current = 0;
        scrollCountRef.current = 0;
        interactionLoggedRef.current = new Set();
        caseEnterRef.current = now;
        lastCaseIdRef.current = currentCaseId;
      }
    }, 3000);

    resetIdle();

    return () => {
      window.removeEventListener("click", handleClick);
      window.removeEventListener("keydown", handleKeydown);
      window.removeEventListener("scroll", handleScroll);
      window.removeEventListener("focus", handleFocus);
      window.removeEventListener("blur", handleBlur);
      document.removeEventListener("visibilitychange", handleVisibilityChange);
      window.removeEventListener("beforeunload", handleUnload);
      clearTimeout(idleTimer);
      clearTimeout(scrollTimer);
      clearInterval(heartbeatInterval);
      clearInterval(casePoll);
    };
  }, [agentEmail, agentName]);
}

function getCategoryForPage(path: string, hasKeyboardActivity: boolean): string {
  if (!path) return "Navegación";
  // Buzones = Navegación (Mensajería se loguea al enviar mensaje en chat-view.tsx)
  return "Navegación";
}

function formatDwell(seconds: number): string {
  if (seconds < 60) return `${Math.round(seconds)}s`;
  const min = Math.floor(seconds / 60);
  const sec = Math.round(seconds % 60);
  if (min < 60) return `${min}min ${sec}s`;
  const h = Math.floor(min / 60);
  const m = min % 60;
  return `${h}h ${m}min`;
}

function pathnameToLabel(path: string): string {
  if (!path) return "Página principal";
  if (path === "/inbox") return "Bandeja de entrada";
  if (path === "/smart-inbox") return "Smart Inbox (IA atendiendo)";
  if (path === "/soporte-avanzado") return "Soporte Avanzado (N2)";
  if (path === "/mi-gestion") return "Mi Bandeja de Gestión";
  if (path === "/admin") return "Panel Admin - Resumen";
  if (path === "/admin/equipo") return "Panel Admin - Equipo";
  if (path === "/admin/actividad") return "Panel Admin - Activity Tracker";
  if (path === "/admin/inventario") return "Panel Admin - Inventario";
  if (path === "/admin/manuales") return "Panel Admin - Manuales";
  if (path === "/admin/canales") return "Panel Admin - Canales";
  if (path === "/admin/agente-ia") return "Panel Admin - Agente IA";
  if (path === "/admin/settings") return "Panel Admin - Configuración";
  if (path === "/admin/estadisticas") return "Panel Admin - Estadísticas";
  if (path === "/admin/estadisticas/atencion") return "Panel Admin - Estadísticas de Atención";
  if (path === "/admin/flujos-bot") return "Panel Admin - Flujos del Bot";
  if (path === "/admin/clientes") return "Panel Admin - Clientes";
  if (path.startsWith("/admin/equipo/perfil")) return "Panel Admin - Perfil de Agente";
  if (path.startsWith("/admin")) return `Panel Admin - ${path.split("/")[2] || ""}`;
  return path;
}
