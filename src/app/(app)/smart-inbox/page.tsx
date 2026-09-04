import { createClient } from "@/lib/supabase/server";
import { InboxClient } from "@/components/chat/inbox-client";
import { queryWithFallback } from "@/lib/supabase/resilient";

export const dynamic = "force-dynamic";

export default async function SmartInboxPage({ searchParams }: { searchParams: { c?: string } }) {
  const supabase = createClient();

  const { data: smartCases, error } = await queryWithFallback(
    "smart_inbox",
    async () => {
      const { data, error } = await supabase
        .from("sek_cases")
        .select("*")
        .eq("estado", "ia_atendiendo")
        .neq("canal", "simulator")
        .neq("es_test", true)
        .order("last_message_at", { ascending: false, nullsFirst: false })
        .order("created_at", { ascending: false })
        .limit(500);
      return { data, error };
    },
    []
  );
  if (error) console.error("[smart-inbox] sek_cases error:", error);

  const selectedId = searchParams.c ?? null;

  return (
    <InboxClient
      initialCases={(smartCases as any[]) || []}
      initialSelectedId={selectedId}
      containerType={"smart-inbox" as const}
    />
  );
}
