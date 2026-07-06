import { createClient } from "@/lib/supabase/server";
import { InboxClient } from "@/components/chat/inbox-client";

export const dynamic = "force-dynamic";

export default async function SmartInboxPage({ searchParams }: { searchParams: { c?: string } }) {
  const supabase = createClient();

  // Obtener todos los casos y filtrar por estado "ia_atendiendo"
  const { data: allCases, error } = await supabase
    .from("sek_cases")
    .select("*")
    .neq("canal", "simulator")
    .order("last_message_at", { ascending: false, nullsFirst: false })
    .order("created_at", { ascending: false })
    .limit(1000);

  if (error) console.error("[smart-inbox] sek_cases error:", error.message);

  // Smart Inbox: SOLO casos nuevos que la IA está atendiendo
  const smartCases = (allCases || []).filter(c => String(c.estado || "").toLowerCase() === "ia_atendiendo");

  const selectedId = searchParams.c ?? null;

  return (
    <InboxClient
      initialCases={(smartCases as any[]) || []}
      initialSelectedId={selectedId}
      containerType={"smart-inbox" as const}
    />
  );
}
