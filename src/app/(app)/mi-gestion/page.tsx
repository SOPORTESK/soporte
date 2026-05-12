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
  
  // Buscar casos donde el agente haya enviado mensajes (histtecnico)
  const { data: allCases, error } = await supabase
    .from("sek_cases")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(200);
  
  if (error) console.error("[mi-gestion] sek_cases error:", error.message);
  
  // Filtrar casos donde el agente actual haya participado (por email o nombre)
  const myCases = (allCases || []).filter(c => {
    const histtecnico = Array.isArray(c.histtecnico) ? c.histtecnico : [];
    const hasMyMessage = histtecnico.some((e: any) => {
      const author = String(e?.author || "").toLowerCase();
      // Buscar por email o por nombre
      return author === agentEmail.toLowerCase() || 
             author.includes(agentEmail.toLowerCase()) ||
             (agentName && author.includes(agentName.toLowerCase())) ||
             (agentFullName && author.includes(agentFullName));
    });
    return hasMyMessage;
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
