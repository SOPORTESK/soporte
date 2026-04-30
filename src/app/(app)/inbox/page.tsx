import { createClient } from "@/lib/supabase/server";
import { InboxClient } from "@/components/chat/inbox-client";

export const dynamic = "force-dynamic";

export default async function InboxPage({ searchParams }: { searchParams: { c?: string } }) {
  const supabase = createClient();
  const { data: cases, error } = await supabase
    .from("sek_cases")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(100);
  if (error) console.error("[inbox] sek_cases error:", error.message);

  const selectedId = searchParams.c || (cases?.[0]?.id ? String(cases[0].id) : null);

  return (
    <InboxClient
      initialCases={(cases as any[]) || []}
      initialSelectedId={selectedId}
    />
  );
}
