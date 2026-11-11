"use client";

import type { SupabaseClient } from "@supabase/supabase-js";

export type CaseBroadcastAction =
  | "meta"
  | "deltaEntry"
  | "refresh_history"
  | "insert"
  | "delete"
  | "delete_bulk";

export interface CaseRealtimePayload {
  eventType: "INSERT" | "UPDATE" | "DELETE" | string;
  action?: CaseBroadcastAction;
  caseId?: string;
  caseIds?: string[];
  new?: Record<string, any> | null;
  old?: Record<string, any> | null;
  delta?: {
    col: "histcliente" | "histtecnico";
    entry: Record<string, any>;
  };
  ts?: number;
}

export interface AgentRealtimePayload {
  eventType?: "INSERT" | "UPDATE" | "DELETE" | string;
  email?: string;
  nombre?: string;
  apellido?: string;
  avatar_url?: string | null;
  status?: string;
  last_seen_at?: string;
  rol?: string;
  ia_activa?: boolean;
  modo_no_atendido?: boolean;
  auto_close_paused?: boolean;
  fullReload?: boolean;
  ts?: number;
}

type CaseEventListener = (payload: CaseRealtimePayload) => void;
type StatusListener = (status: string) => void;
type AgentEventListener = (payload: AgentRealtimePayload) => void;

const CASES_TOPIC = "sek_cases_live";
const CASES_EVENT = "case_event";
const AGENTS_TOPIC = "sek_agents_live";
const AGENTS_EVENT = "agent_event";

const caseListeners = new Set<CaseEventListener>();
const caseStatusListeners = new Set<StatusListener>();
let casesChannel: any = null;
let casesClientRef: SupabaseClient | null = null;
let casesLastStatus = "";
let casesTeardownTimer: ReturnType<typeof setTimeout> | null = null;

const agentListeners = new Set<AgentEventListener>();
let agentsChannel: any = null;
let agentsClientRef: SupabaseClient | null = null;
let agentsTeardownTimer: ReturnType<typeof setTimeout> | null = null;

function ensureCasesChannel(supabase: SupabaseClient) {
  if (casesTeardownTimer) {
    clearTimeout(casesTeardownTimer);
    casesTeardownTimer = null;
  }

  if (casesChannel && casesClientRef === supabase) {
    return;
  }

  if (casesChannel && casesClientRef) {
    try {
      casesClientRef.removeChannel(casesChannel);
    } catch {}
    casesChannel = null;
    casesLastStatus = "";
  }

  casesClientRef = supabase;
  casesChannel = supabase
    .channel(CASES_TOPIC, { config: { broadcast: { self: true } } })
    .on("broadcast", { event: CASES_EVENT }, (msg: any) => {
      const payload = (msg?.payload ?? msg) as CaseRealtimePayload;
      if (!payload || typeof payload !== "object") return;
      caseListeners.forEach((cb) => {
        try {
          cb(payload);
        } catch (err) {
          console.error("[cases-realtime-bus] listener error:", err);
        }
      });
    })
    .subscribe((status: string) => {
      casesLastStatus = status;
      caseStatusListeners.forEach((cb) => {
        try {
          cb(status);
        } catch (err) {
          console.error("[cases-realtime-bus] status listener error:", err);
        }
      });
    });
}

function scheduleCasesTeardown() {
  if (caseListeners.size > 0 || caseStatusListeners.size > 0) return;
  if (casesTeardownTimer) clearTimeout(casesTeardownTimer);
  casesTeardownTimer = setTimeout(() => {
    casesTeardownTimer = null;
    if (caseListeners.size === 0 && caseStatusListeners.size === 0 && casesChannel && casesClientRef) {
      try {
        casesClientRef.removeChannel(casesChannel);
      } catch {}
      casesChannel = null;
      casesClientRef = null;
      casesLastStatus = "";
    }
  }, 400);
}

/**
 * Subscribe to lightweight case Broadcast events over shared `sek_cases_live` channel.
 */
export function subscribeCasesRealtime(
  supabase: SupabaseClient,
  onEvent: CaseEventListener,
  onStatus?: StatusListener
): () => void {
  caseListeners.add(onEvent);
  if (onStatus) caseStatusListeners.add(onStatus);

  ensureCasesChannel(supabase);

  let disposed = false;
  if (onStatus && casesLastStatus) {
    queueMicrotask(() => {
      if (!disposed && casesLastStatus) {
        try {
          onStatus(casesLastStatus);
        } catch {}
      }
    });
  }

  return () => {
    disposed = true;
    caseListeners.delete(onEvent);
    if (onStatus) caseStatusListeners.delete(onStatus);
    scheduleCasesTeardown();
  };
}

function ensureAgentsChannel(supabase: SupabaseClient) {
  if (agentsTeardownTimer) {
    clearTimeout(agentsTeardownTimer);
    agentsTeardownTimer = null;
  }

  if (agentsChannel && agentsClientRef === supabase) {
    return;
  }

  if (agentsChannel && agentsClientRef) {
    try {
      agentsClientRef.removeChannel(agentsChannel);
    } catch {}
    agentsChannel = null;
  }

  agentsClientRef = supabase;
  agentsChannel = supabase
    .channel(AGENTS_TOPIC, { config: { broadcast: { self: true } } })
    .on("broadcast", { event: AGENTS_EVENT }, (msg: any) => {
      const payload = (msg?.payload ?? msg) as AgentRealtimePayload;
      if (!payload || typeof payload !== "object") return;
      agentListeners.forEach((cb) => {
        try {
          cb(payload);
        } catch (err) {
          console.error("[cases-realtime-bus] agent listener error:", err);
        }
      });
    })
    .subscribe();
}

function scheduleAgentsTeardown() {
  if (agentListeners.size > 0) return;
  if (agentsTeardownTimer) clearTimeout(agentsTeardownTimer);
  agentsTeardownTimer = setTimeout(() => {
    agentsTeardownTimer = null;
    if (agentListeners.size === 0 && agentsChannel && agentsClientRef) {
      try {
        agentsClientRef.removeChannel(agentsChannel);
      } catch {}
      agentsChannel = null;
      agentsClientRef = null;
    }
  }, 400);
}

/**
 * Subscribe to lightweight agent presence/profile Broadcast events on `sek_agents_live`.
 */
export function subscribeAgentsRealtime(
  supabase: SupabaseClient,
  onEvent: AgentEventListener
): () => void {
  agentListeners.add(onEvent);
  ensureAgentsChannel(supabase);

  return () => {
    agentListeners.delete(onEvent);
    scheduleAgentsTeardown();
  };
}

/**
 * Emit one or more case Broadcast events from browser after a direct Supabase client write.
 */
export function emitCaseBroadcastClient(
  payloadOrList: CaseRealtimePayload | CaseRealtimePayload[]
): Promise<void> {
  if (typeof window === "undefined") return Promise.resolve();
  const events = Array.isArray(payloadOrList) ? payloadOrList : [payloadOrList];
  if (events.length === 0) return Promise.resolve();
  return fetch("/api/realtime/broadcast", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ kind: "case", events }),
    keepalive: true,
  })
    .then(() => {})
    .catch(() => {});
}

/**
 * Emit one or more agent Broadcast events from browser after a direct Supabase profile update.
 */
export function emitAgentBroadcastClient(
  payloadOrList: AgentRealtimePayload | AgentRealtimePayload[]
): void {
  if (typeof window === "undefined") return;
  const events = Array.isArray(payloadOrList) ? payloadOrList : [payloadOrList];
  if (events.length === 0) return;
  fetch("/api/realtime/broadcast", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ kind: "agent", events }),
    keepalive: true,
  }).catch(() => {});
}
