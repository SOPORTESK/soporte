import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export default async function PlantillasPage() {
  const supabase = createClient();
  const { data } = await supabase.from("sek_plantillas").select("*").order("created_at", { ascending: false });
  return (
    <div className="max-w-5xl mx-auto p-6">
      <header className="mb-6">
        <h1 className="text-3xl font-bold">Plantillas</h1>
        <p className="text-muted-foreground">Respuestas rápidas reutilizables del equipo.</p>
      </header>
      {(!data || data.length === 0) ? (
        <div className="rounded-xl border border-dashed border-border p-12 text-center text-muted-foreground">
          No hay plantillas todavía.
        </div>
      ) : (
        <ul className="grid gap-3 sm:grid-cols-2">
          {data.map((p: any) => (
            <li key={p.id} className="rounded-xl border border-border bg-card p-4">
              <p className="font-medium">{p.nombre}</p>
              <p className="text-xs text-muted-foreground capitalize">{p.cat || "general"}</p>
              <p className="text-sm mt-2 whitespace-pre-wrap line-clamp-4">{p.texto}</p>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
