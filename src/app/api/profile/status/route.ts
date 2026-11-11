import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";
import { broadcastAgentEvent } from "@/lib/realtime-broadcast";

export const dynamic = "force-dynamic";

const lastStatusWriteByEmail = new Map<string, { status: string; ts: number }>();
const STATUS_HEARTBEAT_MIN_MS = 150 * 1000; // 2.5 min si el estado no cambió

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}));
    const { status } = body;
    const valid = ["online", "away", "busy", "offline"];
    if (!valid.includes(status)) return NextResponse.json({ error: "Estado inválido" }, { status: 400 });

    let email: string | null = body.email || null;

    if (!email) {
      // Intentar extraer email desde cookie JWT sin llamar a la red
      try {
        const allCookies = req.cookies.getAll();
        for (const c of allCookies) {
          if (c.name.includes("auth-token") && c.value) {
            try {
              const parsed = JSON.parse(c.value);
              const token = Array.isArray(parsed) ? parsed[0] : (parsed?.access_token || c.value);
              if (typeof token === "string" && token.includes(".")) {
                const payload = JSON.parse(Buffer.from(token.split(".")[1], "base64").toString("utf-8"));
                if (payload?.email) {
                  email = payload.email;
                  break;
                }
              }
            } catch {}
          }
        }
      } catch {}
    }

    if (!email) {
      try {
        const supabase = createClient();
        const r = await Promise.race([
          supabase.auth.getUser(),
          new Promise<null>((resolve) => setTimeout(() => resolve(null), 500)),
        ]);
        email = (r as any)?.data?.user?.email || null;
      } catch {}
    }

    if (!email) {
      return NextResponse.json({ ok: false, reason: "no_auth" }, { status: 200 });
    }

    const normEmail = email.trim().toLowerCase();
    const nowMs = Date.now();
    const prev = lastStatusWriteByEmail.get(normEmail);
    if (prev && prev.status === status && nowMs - prev.ts < STATUS_HEARTBEAT_MIN_MS) {
      return NextResponse.json({ ok: true, cached: true });
    }

    const lastSeenAt = new Date(nowMs).toISOString();
    const svc = createServiceClient();
    await svc
      .from("sek_agent_config")
      .update({ status, last_seen_at: lastSeenAt })
      .ilike("email", normEmail);

    lastStatusWriteByEmail.set(normEmail, { status, ts: nowMs });
    await broadcastAgentEvent({
      eventType: "UPDATE",
      email: normEmail,
      status,
      last_seen_at: lastSeenAt,
    });
    return NextResponse.json({ ok: true });
  } catch (err: any) {
    return NextResponse.json({ ok: false, error: err?.message }, { status: 200 });
  }
}
