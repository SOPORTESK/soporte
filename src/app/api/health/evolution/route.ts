import { NextResponse } from "next/server";
import { getEvolutionConfig } from "@/lib/evolution-config";

export async function GET() {
  try {
    const evoCfg = await getEvolutionConfig();
    const EVO_URL = evoCfg.url;
    const EVO_KEY = evoCfg.apiKey;
    const EVO_INSTANCE = evoCfg.instance || "sekunet";

    if (!EVO_URL || !EVO_KEY) {
      return NextResponse.json(
        { ok: false, error: "evolution_not_configured" },
        { status: 503 }
      );
    }

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 8000);

    const res = await fetch(
      `${EVO_URL.replace(/\/$/, "")}/instance/connectionState/${encodeURIComponent(EVO_INSTANCE)}`,
      {
        headers: { apikey: EVO_KEY },
        signal: controller.signal,
      }
    );
    clearTimeout(timeout);

    if (!res.ok) {
      return NextResponse.json(
        { ok: false, httpStatus: res.status, error: "evolution_unreachable" },
        { status: 502 }
      );
    }

    const data = await res.json().catch(() => ({}));
    const state = data?.instance?.state || data?.state || "unknown";

    if (state !== "open") {
      return NextResponse.json(
        { ok: false, state, message: "WhatsApp disconnected" },
        { status: 503 }
      );
    }

    return NextResponse.json({ ok: true, state, instance: EVO_INSTANCE });
  } catch (err: any) {
    return NextResponse.json(
      { ok: false, error: err?.message || "timeout_or_network_error" },
      { status: 500 }
    );
  }
}