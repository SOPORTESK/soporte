import { NextRequest, NextResponse } from "next/server";
import { performAutoExtract } from "@/lib/ai/auto-extract";

export async function POST(
  _req: NextRequest,
  { params }: { params: { id: string } }
) {
  const result = await performAutoExtract(params.id);
  return NextResponse.json(result, { status: result.ok ? 200 : 500 });
}