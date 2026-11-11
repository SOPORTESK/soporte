import "@/lib/dns-boost";

export const CASES_BROADCAST_TOPIC = "sek_cases_live";
export const CASES_BROADCAST_EVENT = "case_event";
export const AGENTS_BROADCAST_TOPIC = "sek_agents_live";
export const AGENTS_BROADCAST_EVENT = "agent_event";

export type CaseBroadcastAction =
  | "meta"
  | "deltaEntry"
  | "refresh_history"
  | "insert"
  | "delete"
  | "delete_bulk";

export interface CaseBroadcastOldHints {
  estado?: string;
  assigned_to?: string | null;
  unread_count?: number;
  tags?: string[];
}

export interface CaseBroadcastDelta {
  col: "histcliente" | "histtecnico";
  entry: Record<string, any>;
}

export interface CaseBroadcastPayload {
  eventType: "INSERT" | "UPDATE" | "DELETE";
  action: CaseBroadcastAction;
  caseId?: string;
  caseIds?: string[];
  /** Scalar metadata fields ONLY — never include histcliente or histtecnico. */
  new?: Record<string, any>;
  old?: CaseBroadcastOldHints;
  delta?: CaseBroadcastDelta;
  ts?: number;
}

export interface AgentBroadcastPayload {
  eventType?: "INSERT" | "UPDATE" | "DELETE";
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

const CASE_SCALAR_KEYS = new Set([
  "id",
  "title",
  "canal",
  "estado",
  "assigned_to",
  "created_at",
  "updated_at",
  "last_message_at",
  "last_message_preview",
  "customer_phone",
  "unread_count",
  "cliente",
  "prioridad",
  "tags",
  "closed_at",
  "resolved_at",
  "ia_pausada",
  "es_test",
]);

/**
 * Picks ONLY lightweight scalar metadata fields from a case object, stripping heavy history arrays.
 */
export function pickCaseScalarMeta(
  row?: Record<string, any> | null
): Record<string, any> | undefined {
  if (!row || typeof row !== "object") return undefined;
  const out: Record<string, any> = {};
  for (const key of Object.keys(row)) {
    if (CASE_SCALAR_KEYS.has(key) && row[key] !== undefined) {
      out[key] = row[key];
    }
  }
  return Object.keys(out).length > 0 ? out : undefined;
}

function sanitizeCasePayload(p: CaseBroadcastPayload): CaseBroadcastPayload {
  const sanitizedNew = pickCaseScalarMeta(p.new);
  return {
    eventType: p.eventType,
    action: p.action,
    ...(p.caseId ? { caseId: String(p.caseId) } : {}),
    ...(Array.isArray(p.caseIds) && p.caseIds.length > 0
      ? { caseIds: p.caseIds.map((id) => String(id)) }
      : {}),
    ...(sanitizedNew ? { new: sanitizedNew } : {}),
    ...(p.old ? { old: p.old } : {}),
    ...(p.delta ? { delta: p.delta } : {}),
    ts: p.ts || Date.now(),
  };
}

async function postRealtimeBroadcast(
  messages: Array<{ topic: string; event: string; payload: Record<string, any> }>
): Promise<boolean> {
  if (messages.length === 0) return true;

  const supabaseUrl = (process.env.NEXT_PUBLIC_SUPABASE_URL || "").replace(/\/+$/, "");
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || "";
  if (!supabaseUrl || !serviceKey) return false;

  const BATCH_SIZE = 50;
  let allOk = true;

  for (let i = 0; i < messages.length; i += BATCH_SIZE) {
    const batch = messages.slice(i, i + BATCH_SIZE);
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 2500);
    try {
      const res = await fetch(`${supabaseUrl}/realtime/v1/api/broadcast`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          apikey: serviceKey,
          Authorization: `Bearer ${serviceKey}`,
        },
        body: JSON.stringify({ messages: batch }),
        signal: controller.signal,
        cache: "no-store",
      });
      if (!res.ok) {
        allOk = false;
        const errText = await res.text().catch(() => "");
        console.warn(`[realtime-broadcast] HTTP ${res.status}: ${errText.slice(0, 150)}`);
      }
    } catch (err: any) {
      allOk = false;
      console.warn("[realtime-broadcast] error:", err?.message || err);
    } finally {
      clearTimeout(timer);
    }
  }

  return allOk;
}

export async function broadcastCaseEvent(payload: CaseBroadcastPayload): Promise<boolean> {
  return broadcastCaseEvents([payload]);
}

export async function broadcastCaseEvents(payloads: CaseBroadcastPayload[]): Promise<boolean> {
  if (!Array.isArray(payloads) || payloads.length === 0) return true;
  const messages = payloads.map((p) => ({
    topic: CASES_BROADCAST_TOPIC,
    event: CASES_BROADCAST_EVENT,
    payload: sanitizeCasePayload(p),
  }));
  return postRealtimeBroadcast(messages);
}

export async function broadcastAgentEvent(payload: AgentBroadcastPayload): Promise<boolean> {
  return broadcastAgentEvents([payload]);
}

export async function broadcastAgentEvents(payloads: AgentBroadcastPayload[]): Promise<boolean> {
  if (!Array.isArray(payloads) || payloads.length === 0) return true;
  const messages = payloads.map((p) => ({
    topic: AGENTS_BROADCAST_TOPIC,
    event: AGENTS_BROADCAST_EVENT,
    payload: {
      ...p,
      eventType: p.eventType || "UPDATE",
      ts: p.ts || Date.now(),
    },
  }));
  return postRealtimeBroadcast(messages);
}
