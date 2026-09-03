import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  // Extraer email del usuario sin bloquear — intentar cookie primero
  let email: string | null = null;
  try {
    const supabase = createClient();
    const r = await Promise.race([
      supabase.auth.getUser(),
      new Promise<null>((resolve) => setTimeout(() => resolve(null), 3000)),
    ]);
    email = (r as any)?.data?.user?.email || null;
  } catch {}

  if (!email) {
    return NextResponse.json({ ok: false, reason: "no_auth" }, { status: 200 });
  }

  const { status } = await req.json();
  const valid = ["online", "away", "busy", "offline"];
  if (!valid.includes(status)) return NextResponse.json({ error: "Estado inválido" }, { status: 400 });

  const svc = createServiceClient();
  Promise.resolve(
    svc.from("sek_agent_config")
      .update({ status, last_seen_at: new Date().toISOString() })
      .ilike("email", email)
  ).catch((e: any) => console.error("[profile/status] update error:", e?.message));

  return NextResponse.json({ ok: true });
}
