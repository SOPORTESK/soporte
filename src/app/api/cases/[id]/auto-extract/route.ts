import { NextRequest, NextResponse } from "next/server";
import { performAutoExtract } from "@/lib/ai/auto-extract";

export async function POST(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  let force = false;
  try {
    const body = await req.json().catch(() => ({}));
    if (body?.force) force = true;
  } catch {}
  const result = await performAutoExtract(params.id, { force });
  return NextResponse.json(result, { status: result.ok ? 200 : 500 });
}