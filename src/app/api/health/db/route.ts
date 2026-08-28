import { NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/service";

// Keep-alive para Supabase free tier.
// El free tier pausa la BD tras 7 dias sin consultas. Este endpoint hace
// un SELECT 1 (lo mas ligero posible) para mantenerla despierta.
// Lo llama un cron de GitHub Actions cada 5 minutos.

export const maxDuration = 10;

export async function GET() {
  const t0 = Date.now();
  try {
    const supabase = createServiceClient();
    // select count + limit 1: lo mas ligero posible
    const { error } = await supabase
      .from("sek_cases")
      .select("id", { count: "exact", head: true })
      .limit(1);

    const ms = Date.now() - t0;
    if (error) {
      return NextResponse.json({ ok: false, error: error.message, ms }, { status: 500 });
    }
    return NextResponse.json({ ok: true, ms, ts: new Date().toISOString() });
  } catch (e: any) {
    const ms = Date.now() - t0;
    return NextResponse.json({ ok: false, error: e?.message, ms }, { status: 500 });
  }
}
