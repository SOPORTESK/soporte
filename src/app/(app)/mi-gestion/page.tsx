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
  
  // Buscar casos activos asignados al agente (assigned_to)
  const { data: allCases, error } = await supabase
    .from("sek_cases")
    .select("*")
    .neq("canal", "simulator")
    .order("created_at", { ascending: false })
    .limit(200);

  if (error) console.error("[mi-gestion] sek_cases error:", error.message);

  // Mi Gestión: casos activos asignados a este agente (o histórico como respaldo)
  const myCases = (allCases || []).filter(c => {
    const estado = String(c.estado || "").toLowerCase();
    // Excluir cerrados y resueltos (van a Bandeja)
    if (estado === "cerrado" || estado === "resuelto") return false;

    // Prioridad: assigned_to = mi email
    const assigned = String(c.assigned_to || "").toLowerCase();
    if (assigned && assigned === agentEmail.toLowerCase()) return true;

    // Respaldo: casos antiguos sin assigned_to pero con mensajes del agente
    const histtecnico = Array.isArray(c.histtecnico) ? c.histtecnico : [];
    return histtecnico.some((e: any) => {
      const author = String(e?.author || "").toLowerCase();
      return author === agentEmail.toLowerCase() ||
             author.includes(agentEmail.toLowerCase()) ||
             (agentName && author.includes(agentName.toLowerCase())) ||
             (agentFullName && author.includes(agentFullName));
    });
  });
  
  console.log(`[mi-gestion] Agente: ${agentEmail} (${agentFullName}), Total casos: ${allCases?.length || 0}, Mis casos: ${myCases.length}`);
  
  const selectedId = searchParams.c || (myCases?.[0]?.id ? String(myCases[0].id) : null);

  return (
    <InboxClient
      initialCases={(myCases as any[]) || []}
      initialSelectedId={selectedId}
      containerType={"mi-gestion" as const}
    />
  );
}
