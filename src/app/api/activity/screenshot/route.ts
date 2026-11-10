import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/service";

export const dynamic = "force-dynamic";

export async function POST(_req: NextRequest) {
  // Desactivado para proteger la cuota de Storage y Egress del plan gratuito de Supabase
  return NextResponse.json({ url: null, skipped: true });
}
