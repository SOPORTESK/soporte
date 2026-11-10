"use client";

import type { RealtimeChannel, RealtimePostgresChangesPayload, SupabaseClient } from "@supabase/supabase-js";

export type SekCasesRealtimePayload = RealtimePostgresChangesPayload<Record<string, any>>;
export type SekCasesRealtimeListener = (payload: SekCasesRealtimePayload) => void;
export type SekCasesStatusListener = (status: string) => void;

const listeners = new Set<SekCasesRealtimeListener>();
const statusListeners = new Set<SekCasesStatusListener>();

let busChannel: RealtimeChannel | null = null;
let busSupabase: SupabaseClient<any, any, any> | null = null;
let retryTimer: ReturnType<typeof setTimeout> | null = null;
let retryAttempt = 0;
let onlineListenerBound = false;
let currentStatus: string = "IDLE";

function bindOnlineRecovery() {
  if (onlineListenerBound || typeof window === "undefined") return;
  onlineListenerBound = true;
  window.addEventListener("online", () => {
    retryAttempt = 0;
    if (listeners.size > 0 && busSupabase && currentStatus !== "SUBSCRIBED") {
      const sb = busSupabase;
      teardownChannel();
      ensureChannel(sb);
    }
  });
}

function notifyStatus(status: string) {
  currentStatus = status;
  statusListeners.forEach((cb) => {
    try {
      cb(status);
    } catch {}
  });
}

function teardownChannel() {
  if (retryTimer) {
    clearTimeout(retryTimer);
    retryTimer = null;
  }
  if (busChannel && busSupabase) {
    try {
      busSupabase.removeChannel(busChannel);
    } catch {}
  }
  busChannel = null;
  currentStatus = "IDLE";
}

function ensureChannel(supabase: SupabaseClient<any, any, any>) {
  if (typeof window === "undefined") return;
  bindOnlineRecovery();
  if (busChannel) return;
  if (typeof navigator !== "undefined" && navigator.onLine === false) {
    busSupabase = supabase;
    return;
  }

  busSupabase = supabase;
  notifyStatus("CONNECTING");

  const ch = supabase
    .channel("shared-sek-cases-bus")
    .on(
      "postgres_changes",
      { event: "*", schema: "public", table: "sek_cases" },
      (payload) => {
        listeners.forEach((cb) => {
          try {
            cb(payload as SekCasesRealtimePayload);
          } catch {}
        });
      }
    )
    .subscribe((status) => {
      if (busChannel !== ch) return;
      notifyStatus(status);

      if (status === "SUBSCRIBED") {
        retryAttempt = 0;
        if (retryTimer) {
          clearTimeout(retryTimer);
          retryTimer = null;
        }
      } else if (status === "CHANNEL_ERROR" || status === "TIMED_OUT") {
        if (listeners.size > 0 && !retryTimer) {
          retryAttempt = Math.min(retryAttempt + 1, 5);
          const delayMs = Math.min(4000 * Math.pow(1.8, retryAttempt - 1), 30000);
          retryTimer = setTimeout(() => {
            retryTimer = null;
            if (listeners.size === 0 || !busSupabase) return;
            const sb = busSupabase;
            teardownChannel();
            ensureChannel(sb);
          }, delayMs);
        }
      }
    });

  busChannel = ch;
}

/**
 * Suscripción compartida única a `sek_cases` por pestaña del navegador.
 * Evita abrir 5-7 canales Realtime duplicados enviando múltiples copias del
 * mismo JSONB (histcliente / histtecnico) sobre el socket.
 */
export function subscribeCasesRealtime(
  supabase: SupabaseClient<any, any, any>,
  onEvent: SekCasesRealtimeListener,
  onStatus?: SekCasesStatusListener
): () => void {
  if (typeof window === "undefined") {
    return () => {};
  }

  listeners.add(onEvent);
  if (onStatus) {
    statusListeners.add(onStatus);
    if (currentStatus !== "IDLE") {
      queueMicrotask(() => {
        if (statusListeners.has(onStatus)) {
          try {
            onStatus(currentStatus);
          } catch {}
        }
      });
    }
  }

  ensureChannel(supabase);

  return () => {
    listeners.delete(onEvent);
    if (onStatus) {
      statusListeners.delete(onStatus);
    }
    if (listeners.size === 0) {
      teardownChannel();
    }
  };
}
