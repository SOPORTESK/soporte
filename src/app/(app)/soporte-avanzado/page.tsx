import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { InboxClient } from "@/components/chat/inbox-client";
import { getUserWithTimeout, queryWithFallback } from "@/lib/supabase/resilient";
import { getAgentGroupPermissions } from "@/lib/permissions";

export const dynamic = "force-dynamic";

export default async function SoporteAvanzadoPage({ searchParams }: { searchParams: { c?: string } }) {
  const supabase = createClient();
  const { user } = await getUserWithTimeout(supabase);
  const agentEmail = user?.email;

  const { data: agentConfig } = agentEmail
    ? await queryWithFallback(
        `agent_config_${agentEmail}`,
        async () => {
          const { data, error } = await supabase.from("sek_agent_config").select("nombre,apellido,rol").ilike("email", agentEmail).maybeSingle();
          return { data, error };
        },
        null,
        60000
      )
    : { data: null };

  const userPerms = await getAgentGroupPermissions(agentConfig?.rol || "tecnico");
  const inboxSubs: Record<string, boolean> = ((userPerms as any)?.inbox?.subcategories || {}) as Record<string, boolean>;
  const isSuperadmin = agentConfig?.rol === "superadmin";

  if (!isSuperadmin && inboxSubs.soporte_avanzado === false && !searchParams.c) {
    if (inboxSubs.mi_gestion !== false) redirect("/mi-gestion");
    redirect("/inbox");
  }

  const CASE_LIST_FIELDS = "id,estado,canal,cliente,assigned_to,last_message_at,last_message_preview,unread_count,created_at,updated_at,title,prioridad,tags,customer_phone,es_test";
  const { data: n2Cases, error } = await queryWithFallback(
    "soporte_avanzado",
    async () => {
      const { data, error } = await supabase
        .from("sek_cases")
        .select(CASE_LIST_FIELDS)
        .eq("estado", "escalado")
        .is("assigned_to", null)
        .neq("canal", "simulator")
        .neq("es_test", true)
        .order("last_message_at", { ascending: false, nullsFirst: false })
        .order("created_at", { ascending: false })
        .limit(1500);
      return { data, error };
    },
    [],
    10000 // 10s fresh TTL para navegación instantánea
  );
  if (error) console.error("[soporte-avanzado] sek_cases error:", error);
  console.log(`[soporte-avanzado] Casos escalados sin agente: ${n2Cases?.length || 0}`);

  const selectedId = searchParams.c ?? null;

  return (
    <InboxClient
      initialCases={(n2Cases as any[]) || []}
      initialSelectedId={selectedId}
      containerType={"soporte-avanzado" as const}
      initialAgentEmail={agentEmail}
      initialInboxPerms={inboxSubs}
    />
  );
}
