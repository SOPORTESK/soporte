import { NextRequest, NextResponse } from "next/server";
import { getEvolutionConfig, saveEvolutionConfig, maskKey } from "@/lib/evolution-config";

export async function GET() {
  try {
    const cfg = await getEvolutionConfig();
    return NextResponse.json({
      url: cfg.url,
      apiKey: maskKey(cfg.apiKey),
      instance: cfg.instance,
      source: "supabase",
    });
  } catch (e: any) {
    return NextResponse.json({
      url: process.env.EVOLUTION_API_URL || "",
      apiKey: maskKey(process.env.EVOLUTION_API_KEY || ""),
      instance: process.env.EVOLUTION_INSTANCE || "",
      source: "env",
    });
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    await saveEvolutionConfig({
      url: body.url || process.env.EVOLUTION_API_URL || "",
      apiKey: body.apiKey || process.env.EVOLUTION_API_KEY || "",
      instance: body.instance || process.env.EVOLUTION_INSTANCE || "",
    });
    return NextResponse.json({ ok: true });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || "Error" }, { status: 500 });
  }
}
