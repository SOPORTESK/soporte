import { createClient } from "@/lib/supabase/server";
import { InboxClient } from "@/components/chat/inbox-client";
import { getUserWithTimeout, queryWithFallback } from "@/lib/supabase/resilient";
import { getAgentGroupPermissions } from "@/lib/permissions";

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
  const userPerms = await getAgentGroupPermissions(agentConfig?.rol || "tecnico");
  const isAdmin =
    agentConfig?.rol === "superadmin" ||
    Boolean((userPerms as any)?.inbox?.subcategories?.supervision_en_vivo ?? (agentConfig?.rol === "admin"));

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
  
  // Siempre traer TODOS los casos del agente (abiertos y cerrados, sin perder historial)
  // Y si es admin, traer también los casos activos asignados a otros agentes para supervisión
  const { data: myCases, error: casesError } = await queryWithFallback(
    isAdmin ? `mi_gestion_cases_admin_${agentEmail}` : `mi_gestion_cases_${agentEmail}`,
    async () => {
      const myCasesPromise = supabase
        .from("sek_cases")
        .select(CASE_LIST_FIELDS)
        .neq("canal", "simulator")
        .neq("es_test", true)
        .eq("assigned_to", agentEmail)
        .order("last_message_at", { ascending: false, nullsFirst: false })
        .order("created_at", { ascending: false })
        .limit(300);

      if (!isAdmin) {
        const { data, error } = await myCasesPromise;
        return { data: data || [], error };
      }

      // Para administradores: además traer casos activos de los demás técnicos
      const othersActivePromise = supabase
        .from("sek_cases")
        .select(CASE_LIST_FIELDS)
        .neq("canal", "simulator")
        .neq("es_test", true)
        .not("assigned_to", "is", null)
        .neq("assigned_to", agentEmail)
        .neq("estado", "cerrado")
        .neq("estado", "resuelto")
        .order("last_message_at", { ascending: false, nullsFirst: false })
        .order("created_at", { ascending: false })
        .limit(200);

      const [mineRes, othersRes] = await Promise.all([myCasesPromise, othersActivePromise]);
      const combined = [...(mineRes.data || []), ...(othersRes.data || [])];
      return { data: combined, error: mineRes.error || othersRes.error };
    },
    [],
    15000 // 15s TTL para respuesta ágil y actualización rápida
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
      initialAgentEmail={agentEmail}
    />
  );
}
