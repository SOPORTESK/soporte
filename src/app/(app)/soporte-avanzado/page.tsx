import { createClient } from "@/lib/supabase/server";
import { InboxClient } from "@/components/chat/inbox-client";

export const dynamic = "force-dynamic";

export default async function SoporteAvanzadoPage({ searchParams }: { searchParams: { c?: string } }) {
  const supabase = createClient();
  
  // Obtener todos los casos y filtrar por etiqueta "n2"
  const { data: allCases, error } = await supabase
    .from("sek_cases")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(200);
  
  if (error) console.error("[soporte-avanzado] sek_cases error:", error.message);
  
  // Filtrar casos con etiqueta "n2" (case-insensitive, busca cualquier tag que contenga "n2")
  const n2Cases = (allCases || []).filter(c => {
    const tags = Array.isArray(c.tags) ? c.tags : [];
    const hasN2 = tags.some((t: string) => t.toLowerCase().includes("n2"));
    // Log para diagnóstico
    if (hasN2) {
      console.log(`[soporte-avanzado] Caso con etiqueta n2: #${c.id} - ${JSON.stringify(c.tags)}`);
    }
    return hasN2;
  });
  console.log(`[soporte-avanzado] Total casos: ${allCases?.length || 0}, Casos n2: ${n2Cases.length}`);
  
  const selectedId = searchParams.c || (n2Cases?.[0]?.id ? String(n2Cases[0].id) : null);

  return (
    <InboxClient
      initialCases={(n2Cases as any[]) || []}
      initialSelectedId={selectedId}
      containerType={"soporte-avanzado" as const}
    />
  );
}
