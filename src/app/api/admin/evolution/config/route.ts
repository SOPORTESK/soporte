import { NextRequest, NextResponse } from "next/server";
import { readFileSync, writeFileSync, existsSync } from "fs";
import { join } from "path";

const CONFIG_PATH = join(process.cwd(), "data", "evolution-config.json");

interface EvolutionConfig {
  url?: string;
  apiKey?: string;
  instance?: string;
  updatedAt?: string;
}

function readConfig(): EvolutionConfig {
  try {
    if (existsSync(CONFIG_PATH)) {
      const raw = readFileSync(CONFIG_PATH, "utf-8");
      return JSON.parse(raw) as EvolutionConfig;
    }
  } catch { /* ignore */ }
  return {};
}

function writeConfig(cfg: EvolutionConfig) {
  const { mkdirSync } = require("fs");
  const dir = join(process.cwd(), "data");
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
  writeFileSync(CONFIG_PATH, JSON.stringify(cfg, null, 2), "utf-8");
}

export async function GET() {
  const cfg = readConfig();
  return NextResponse.json({
    url: cfg.url || process.env.EVOLUTION_API_URL || "",
    apiKey: cfg.apiKey ? "••••••••" : (process.env.EVOLUTION_API_KEY ? "••••••••" : ""),
    instance: cfg.instance || process.env.EVOLUTION_INSTANCE || "",
    source: cfg.url ? "file" : "env",
  });
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const cfg: EvolutionConfig = {
      url: body.url || process.env.EVOLUTION_API_URL || "",
      apiKey: body.apiKey || process.env.EVOLUTION_API_KEY || "",
      instance: body.instance || process.env.EVOLUTION_INSTANCE || "",
      updatedAt: new Date().toISOString(),
    };
    writeConfig(cfg);
    return NextResponse.json({ ok: true });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || "Error" }, { status: 500 });
  }
}
