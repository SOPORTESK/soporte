import { createClient } from "@/lib/supabase/server";
import { InboxClient } from "@/components/chat/inbox-client";

export const dynamic = "force-dynamic";

export default async function InboxPage({ searchParams }: { searchParams: { c?: string } }) {
  const supabase = createClient();
  // Bandeja general: SOLO casos cerrados para que todos los agentes puedan consultar el historial
  const { data: allCases, error } = await supabase
    .from("sek_cases")
    .select("*")
    .neq("canal", "simulator")
    .in("estado", ["cerrado", "resuelto"])
    .order("created_at", { ascending: false })
    .limit(200);
  if (error) console.error("[inbox] sek_cases error:", error.message);

  const selectedId = searchParams.c ?? null;

  return (
    <InboxClient
      initialCases={(allCases as any[]) || []}
      initialSelectedId={selectedId}
      containerType={"inbox" as const}
    />
  );
}
