import { NextRequest, NextResponse } from "next/server";
import { getEvolutionConfig } from "@/lib/evolution-config";

export async function POST(req: NextRequest) {
  try {
    const { endpoint, method = "GET", body } = await req.json();
    if (!endpoint || typeof endpoint !== "string") {
      return NextResponse.json({ error: "endpoint required" }, { status: 400 });
    }

    const cfg = await getEvolutionConfig();
    if (!cfg.url || !cfg.apiKey) {
      return NextResponse.json({ error: "not_configured" }, { status: 503 });
    }

    const url = `${cfg.url.replace(/\/$/, "")}${endpoint}`;
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
      apikey: cfg.apiKey,
    };

    const res = await fetch(url, {
      method,
      headers,
      body: body ? JSON.stringify(body) : (method === "POST" || method === "PUT" ? "{}" : undefined),
    });

    const text = await res.text();
    let data: any = null;
    try { data = JSON.parse(text); } catch { data = text; }

    return NextResponse.json({ ok: res.ok, status: res.status, data });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || "proxy_error" }, { status: 500 });
  }
}
