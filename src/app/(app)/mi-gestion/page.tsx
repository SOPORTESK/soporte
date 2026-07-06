import { createClient } from "@/lib/supabase/server";
import { InboxClient } from "@/components/chat/inbox-client";

export const dynamic = "force-dynamic";

export default async function MiGestionPage({ searchParams }: { searchParams: { c?: string } }) {
  const supabase = createClient();
  
  // Obtener usuario actual y su nombre de agente
  const { data: { user } } = await supabase.auth.getUser();
  const agentEmail = user?.email;
  
  // Buscar nombre del agente en la config
  const { data: agentConfig } = await supabase
    .from("sek_agent_config")
    .select("nombre,apellido")
    .ilike("email", agentEmail || "")
    .maybeSingle();
  
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
  
  // Buscar casos asignados al agente (assigned_to) sin importar su estado
  const { data: myCases, error } = await supabase
    .from("sek_cases")
    .select("*")
    .neq("canal", "simulator")
    .eq("assigned_to", agentEmail)
    .order("last_message_at", { ascending: false, nullsFirst: false })
    .order("created_at", { ascending: false })
    .limit(1000);

  if (error) console.error("[mi-gestion] sek_cases error:", error.message);
  
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
