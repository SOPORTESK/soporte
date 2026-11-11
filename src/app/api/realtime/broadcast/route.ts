import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import {
  broadcastAgentEvents,
  broadcastCaseEvents,
  pickCaseScalarMeta,
  type AgentBroadcastPayload,
  type CaseBroadcastPayload,
} from "@/lib/realtime-broadcast";

export const dynamic = "force-dynamic";

const MAX_EVENT_JSON_BYTES = 32_768;

function sanitizeCaseEvent(raw: any): CaseBroadcastPayload | null {
  if (!raw || typeof raw !== "object") return null;
  const serializedLen = Buffer.byteLength(JSON.stringify(raw), "utf8");
  if (serializedLen > MAX_EVENT_JSON_BYTES) return null;

  const eventType = raw.eventType === "INSERT" || raw.eventType === "DELETE" ? raw.eventType : "UPDATE";
  const validActions = new Set(["meta", "deltaEntry", "refresh_history", "insert", "delete", "delete_bulk"]);
  const action = validActions.has(raw.action) ? raw.action : "meta";

  const cleanedNew = pickCaseScalarMeta(raw.new);
  const delta =
    raw.delta &&
    typeof raw.delta === "object" &&
    (raw.delta.col === "histcliente" || raw.delta.col === "histtecnico") &&
    raw.delta.entry &&
    typeof raw.delta.entry === "object"
      ? { col: raw.delta.col as "histcliente" | "histtecnico", entry: raw.delta.entry }
      : undefined;

  return {
    eventType,
    action,
    ...(raw.caseId ? { caseId: String(raw.caseId) } : {}),
    ...(Array.isArray(raw.caseIds)
      ? { caseIds: raw.caseIds.slice(0, 200).map((id: any) => String(id)) }
      : {}),
    ...(cleanedNew ? { new: cleanedNew } : {}),
    ...(raw.old && typeof raw.old === "object"
      ? {
          old: {
            ...(raw.old.estado !== undefined ? { estado: String(raw.old.estado) } : {}),
            ...(raw.old.assigned_to !== undefined ? { assigned_to: raw.old.assigned_to } : {}),
            ...(raw.old.unread_count !== undefined ? { unread_count: Number(raw.old.unread_count) } : {}),
            ...(Array.isArray(raw.old.tags) ? { tags: raw.old.tags } : {}),
          },
        }
      : {}),
    ...(delta ? { delta } : {}),
    ts: Date.now(),
  };
}

function sanitizeAgentEvent(raw: any): AgentBroadcastPayload | null {
  if (!raw || typeof raw !== "object") return null;
  const serializedLen = Buffer.byteLength(JSON.stringify(raw), "utf8");
  if (serializedLen > MAX_EVENT_JSON_BYTES) return null;

  return {
    eventType: raw.eventType === "INSERT" || raw.eventType === "DELETE" ? raw.eventType : "UPDATE",
    ...(raw.email ? { email: String(raw.email) } : {}),
    ...(raw.nombre !== undefined ? { nombre: String(raw.nombre) } : {}),
    ...(raw.apellido !== undefined ? { apellido: String(raw.apellido) } : {}),
    ...(raw.avatar_url !== undefined ? { avatar_url: raw.avatar_url ? String(raw.avatar_url) : null } : {}),
    ...(raw.status !== undefined ? { status: String(raw.status) } : {}),
    ...(raw.last_seen_at !== undefined ? { last_seen_at: String(raw.last_seen_at) } : {}),
    ...(raw.rol !== undefined ? { rol: String(raw.rol) } : {}),
    ...(raw.ia_activa !== undefined ? { ia_activa: Boolean(raw.ia_activa) } : {}),
    ...(raw.modo_no_atendido !== undefined ? { modo_no_atendido: Boolean(raw.modo_no_atendido) } : {}),
    ...(raw.auto_close_paused !== undefined ? { auto_close_paused: Boolean(raw.auto_close_paused) } : {}),
    ...(raw.fullReload ? { fullReload: true } : {}),
    ts: Date.now(),
  };
}

export async function POST(req: NextRequest) {
  try {
    const supabase = createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user?.email) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await req.json().catch(() => null);
    if (!body || typeof body !== "object") {
      return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
    }

    const kind = body.kind === "agent" ? "agent" : "case";
    const rawList = Array.isArray(body.events)
      ? body.events
      : body.payload
        ? [body.payload]
        : [body];

    if (kind === "agent") {
      const cleaned = rawList
        .map(sanitizeAgentEvent)
        .filter((x: AgentBroadcastPayload | null): x is AgentBroadcastPayload => Boolean(x));
      if (cleaned.length === 0) {
        return NextResponse.json({ ok: true, sent: 0 });
      }
      const ok = await broadcastAgentEvents(cleaned);
      return NextResponse.json({ ok, sent: cleaned.length });
    }

    const cleaned = rawList
      .map(sanitizeCaseEvent)
      .filter((x: CaseBroadcastPayload | null): x is CaseBroadcastPayload => Boolean(x));
    if (cleaned.length === 0) {
      return NextResponse.json({ ok: true, sent: 0 });
    }
    const ok = await broadcastCaseEvents(cleaned);
    return NextResponse.json({ ok, sent: cleaned.length });
  } catch (err: any) {
    return NextResponse.json({ error: err?.message || "Broadcast failed" }, { status: 500 });
  }
}
