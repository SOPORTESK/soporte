import { createClient } from "@/lib/supabase/server";
import { InboxClient } from "@/components/chat/inbox-client";

export const dynamic = "force-dynamic";

export default async function MiGestionPage({ searchParams }: { searchParams: { c?: string } }) {
  const supabase = createClient();
  
  // Obtener usuario actual para filtrar casos donde participó
  const { data: { user } } = await supabase.auth.getUser();
  const agentEmail = user?.email;
  
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
  // Filtramos en el cliente porque Supabase no soporta filtro JSONB anidado fácilmente
  const { data: allCases, error } = await supabase
    .from("sek_cases")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(200);
  
  if (error) console.error("[mi-gestion] sek_cases error:", error.message);
  
  // Filtrar casos donde el agente actual haya participado
  const myCases = (allCases || []).filter(c => {
    const histtecnico = Array.isArray(c.histtecnico) ? c.histtecnico : [];
    const hasMyMessage = histtecnico.some((e: any) => {
      const author = String(e?.author || "").toLowerCase();
      return author === agentEmail.toLowerCase() || author.includes(agentEmail.toLowerCase());
    });
    // Log para diagnóstico
    if (hasMyMessage) {
      console.log(`[mi-gestion] Caso gestionado por ${agentEmail}: #${c.id} - ${histtecnico.length} mensajes técnicos`);
    }
    return hasMyMessage;
  });
  console.log(`[mi-gestion] Agente: ${agentEmail}, Total casos: ${allCases?.length || 0}, Mis casos: ${myCases.length}`);
  
  const selectedId = searchParams.c || (myCases?.[0]?.id ? String(myCases[0].id) : null);

  return (
    <InboxClient
      initialCases={(myCases as any[]) || []}
      initialSelectedId={selectedId}
      containerType={"mi-gestion" as const}
    />
  );
}
