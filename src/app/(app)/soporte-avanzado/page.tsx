import { createClient } from "@/lib/supabase/server";
import { InboxClient } from "@/components/chat/inbox-client";

export const dynamic = "force-dynamic";

export default async function SoporteAvanzadoPage({ searchParams }: { searchParams: { c?: string } }) {
  const supabase = createClient();
  
  // Obtener todos los casos y filtrar: escalados sin agente asignado
  const { data: allCases, error } = await supabase
    .from("sek_cases")
    .select("*")
    .neq("canal", "simulator")
    .order("created_at", { ascending: false })
    .limit(200);

  if (error) console.error("[soporte-avanzado] sek_cases error:", error.message);

  // Soporte Avanzado: casos escalados que aún NO han sido tomados por ningún agente
  const n2Cases = (allCases || []).filter(c => {
    const estado = String(c.estado || "").toLowerCase();
    return estado === "escalado" && !c.assigned_to;
  });
  console.log(`[soporte-avanzado] Total casos: ${allCases?.length || 0}, Casos escalados sin agente: ${n2Cases.length}`);
  
  const selectedId = searchParams.c ?? null;

  return (
    <InboxClient
      initialCases={(n2Cases as any[]) || []}
      initialSelectedId={selectedId}
      containerType={"soporte-avanzado" as const}
    />
  );
}
