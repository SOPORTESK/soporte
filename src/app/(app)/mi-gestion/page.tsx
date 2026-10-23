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
        `agent_config_${agentEmail}`,
        async () => {
          const { data, error } = await supabase.from("sek_agent_config").select("nombre,apellido,rol").ilike("email", agentEmail).maybeSingle();
          return { data, error };
        },
        null,
        60000 // 1 min TTL
      )
    : { data: null };

  const agentName = agentConfig?.nombre || "";
  const agentFullName = [agentConfig?.nombre, agentConfig?.apellido].filter(Boolean).join(" ").toLowerCase();
  const isAdmin = agentConfig?.rol === "admin" || agentConfig?.rol === "superadmin";

  if (!agentEmail) {
    return (
      <InboxClient
        initialCases={[]}
        initialSelectedId={null}
        containerType={"mi-gestion" as const}
      />
    );
  }

  const CASE_LIST_FIELDS = "id,estado,canal,cliente,assigned_to,last_message_at,last_message_preview,unread_count,created_at,updated_at,title,prioridad,tags,customer_phone,es_test";
  const { data: myCases, error: casesError } = await queryWithFallback(
    isAdmin ? `mi_gestion_cases_admin_${agentEmail}` : `mi_gestion_cases_${agentEmail}`,
    async () => {
      let query = supabase
        .from("sek_cases")
        .select(CASE_LIST_FIELDS)
        .neq("canal", "simulator")
        .neq("es_test", true);

      if (isAdmin) {
        query = query
          .not("assigned_to", "is", null)
          .not("estado", "in", '("cerrado","resuelto","calificacion_pendiente")');
      } else {
        query = query.eq("assigned_to", agentEmail);
      }

      const { data, error } = await query
        .order("last_message_at", { ascending: false, nullsFirst: false })
        .order("created_at", { ascending: false })
        .limit(350);
      return { data, error };
    },
    [],
    60000 // 60s fresh TTL para navegación instantánea
  );

  if (casesError) console.error("[mi-gestion] sek_cases error:", casesError);

  const myCasesArray = myCases || [];
  console.log(`[mi-gestion] Agente: ${agentEmail} (${agentFullName}), Rol: ${agentConfig?.rol || 'tecnico'}, Casos cargados: ${myCasesArray.length}`);

  const selectedId = searchParams.c || (myCasesArray[0]?.id ? String(myCasesArray[0].id) : null);

  return (
    <InboxClient
      initialCases={myCasesArray as any[]}
      initialSelectedId={selectedId}
      containerType={"mi-gestion" as const}
      initialIsAdmin={isAdmin}
    />
  );
}
