import { NextResponse } from "next/server";
import { getEvolutionConfig } from "@/lib/evolution-config";

export const maxDuration = 30;

export async function GET() {
  try {
    const cfg = await getEvolutionConfig();
    if (!cfg.url) {
      return NextResponse.json({ ok: false, error: "no_evo_url" }, { status: 500 });
    }

    const start = Date.now();
    const res = await fetch(`${cfg.url.replace(/\/$/, "")}/instance/connectionState/${encodeURIComponent(cfg.instance)}`, {
      headers: { apikey: cfg.apiKey },
      signal: AbortSignal.timeout(20000),
    });
    const elapsed = Date.now() - start;

    if (!res.ok) {
      return NextResponse.json({ ok: false, status: res.status, elapsed }, { status: 502 });
    }

    const data = await res.json().catch(() => null);
    const state = data?.instance?.state || "unknown";
    console.log(`[keep-alive] Evolution ${cfg.instance}: ${state} (${elapsed}ms)`);
    return NextResponse.json({ ok: true, state, elapsed });
  } catch (e: any) {
    console.error("[keep-alive] Error:", e?.message);
    return NextResponse.json({ ok: false, error: e?.message }, { status: 500 });
  }
}
