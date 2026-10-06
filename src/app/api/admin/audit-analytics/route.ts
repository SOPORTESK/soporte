// src/app/api/admin/audit-analytics/route.ts
// Endpoint de auto-auditoría matemática de analíticas e integridad de datos
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";
import { NextResponse } from "next/server";
import { runAnalyticsAudit } from "@/lib/client-analytics";

export const dynamic = "force-dynamic";

export async function GET() {
  const auth = createClient();
  const { data: { user } } = await auth.auth.getUser();
  if (!user) return NextResponse.json({ error: "No autenticado" }, { status: 401 });

  const supabase = createServiceClient();

  const loadedCasos: any[] = [];
  let pageOffset = 0;
  while (true) {
    const { data } = await supabase
      .from("sek_cases")
      .select("id, customer_phone, cliente, created_at, estado, closed_at")
      .range(pageOffset, pageOffset + 999);
    if (!data || data.length === 0) break;
    loadedCasos.push(...data);
    if (data.length < 1000) break;
    pageOffset += 1000;
  }

  const audit = runAnalyticsAudit(loadedCasos);

  return NextResponse.json({
    status: audit.scoreIntegridad === 100 ? "healthy" : "warning",
    audit,
  });
}
