import { createClient } from "@/lib/supabase/server";
import { InboxClient } from "@/components/chat/inbox-client";
import { getUserWithTimeout, queryWithFallback } from "@/lib/supabase/resilient";

export const dynamic = "force-dynamic";

export default async function MiGestionPage({ searchParams }: { searchParams: { c?: string } }) {
  const supabase = createClient();

  const { user } = await getUserWithTimeout(supabase);
  const agentEmail = user?.email;

  const { data: agentConfig } = agentEmail
    ? await queryWithFallback(
        "agent_config",
        async () => {
          const { data, error } = await supabase.from("sek_agent_config").select("nombre,apellido").ilike("email", agentEmail).maybeSingle();
          return { data, error };
        },
        null
      )
    : { data: null };

  const agentName = agentConfig?.nombre || "";
  const agentFullName = [agentConfig?.nombre, agentConfig?.apellido].filter(Boolean).join(" ").toLowerCase();

  if (!agentEmail) {
    return (
      <InboxClient
        initialCases={[]}
        initialSelectedId={null}
        containerType={"mi-gestion" as const}
      />
    );
  }

  const { data: myCases, error: casesError } = await queryWithFallback(
    "sek_cases",
    async () => {
      const { data, error } = await supabase
        .from("sek_cases")
        .select("*")
        .neq("canal", "simulator")
        .neq("es_test", true)
        .eq("assigned_to", agentEmail)
        .order("last_message_at", { ascending: false, nullsFirst: false })
        .order("created_at", { ascending: false })
        .limit(60);
      return { data, error };
    },
    []
  );

  if (casesError) console.error("[mi-gestion] sek_cases error:", casesError);

  const myCasesArray = myCases || [];
  console.log(`[mi-gestion] Agente: ${agentEmail} (${agentFullName}), Mis casos: ${myCasesArray.length}`);

  const selectedId = searchParams.c || (myCasesArray[0]?.id ? String(myCasesArray[0].id) : null);

  return (
    <InboxClient
      initialCases={myCasesArray as any[]}
      initialSelectedId={selectedId}
      containerType={"mi-gestion" as const}
    />
  );
}
