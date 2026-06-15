import { createClient } from "@/lib/supabase/server";
import { InboxClient } from "@/components/chat/inbox-client";

export const dynamic = "force-dynamic";

export default async function InboxPage({ searchParams }: { searchParams: { c?: string } }) {
  const supabase = createClient();
  const { data: allCases, error } = await supabase
    .from("sek_cases")
    .select("*")
    .neq("canal", "simulator")
    .order("created_at", { ascending: false })
    .limit(200);
  if (error) console.error("[inbox] sek_cases error:", error.message);

  // Bandeja = histórico: SOLO casos cerrados o resueltos
  const cases = (allCases || []).filter(c => {
    const estado = String(c.estado || "").toLowerCase();
    return estado === "cerrado" || estado === "resuelto";
  });

  const selectedId = searchParams.c ?? null;

  return (
    <InboxClient
      initialCases={(cases as any[]) || []}
      initialSelectedId={selectedId}
      containerType={"inbox" as const}
    />
  );
}
