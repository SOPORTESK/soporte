import { createClient } from "@/lib/supabase/server";
import { InboxClient } from "@/components/chat/inbox-client";
import { queryWithFallback } from "@/lib/supabase/resilient";

export const dynamic = "force-dynamic";

export default async function InboxPage({ searchParams }: { searchParams: { c?: string } }) {
  const supabase = createClient();

  const { data: allCases, error } = await queryWithFallback(
    "inbox_cases",
    async () => {
      const { data, error } = await supabase
        .from("sek_cases")
        .select("*")
        .neq("canal", "simulator")
        .neq("es_test", true)
        .in("estado", ["cerrado", "resuelto"])
        .order("last_message_at", { ascending: false, nullsFirst: false })
        .order("created_at", { ascending: false })
        .limit(50);
      return { data, error };
    },
    []
  );
  if (error) console.error("[inbox] sek_cases error:", error);

  const selectedId = searchParams.c ?? null;

  return (
    <InboxClient
      initialCases={(allCases as any[]) || []}
      initialSelectedId={selectedId}
      containerType={"inbox" as const}
    />
  );
}
