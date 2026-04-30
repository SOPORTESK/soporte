import { createClient } from "@/lib/supabase/server";
import { BookOpen, FileText } from "lucide-react";

export const dynamic = "force-dynamic";

export default async function AdminManualesPage() {
  const supabase = createClient();
  const { data } = await supabase
    .from("sek_docs")
    .select("id,name,size,date,created_at")
    .order("created_at", { ascending: false });

  return (
    <div className="max-w-6xl mx-auto p-6 lg:p-8 space-y-6">
      <header>
        <p className="text-xs font-bold uppercase tracking-[0.2em] text-brand-700 dark:text-brand-300">Gestión</p>
        <h1 className="text-3xl font-bold mt-1 flex items-center gap-3">
          <BookOpen className="h-7 w-7" /> Manuales
        </h1>
        <p className="text-muted-foreground mt-1">Base documental indexada con embeddings para el agente IA.</p>
      </header>

      {(!data || data.length === 0) ? (
        <div className="rounded-2xl border border-dashed border-border p-12 text-center text-muted-foreground bg-card">
          No hay documentos cargados todavía.
        </div>
      ) : (
        <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {data.map((d: any) => (
            <li key={d.id} className="rounded-2xl border border-border bg-card p-4 flex gap-3 hover:border-brand-300 dark:hover:border-brand-700 hover:shadow-lg transition-all">
              <div className="h-12 w-12 grid place-items-center rounded-xl bg-gradient-to-br from-sky-500 to-sky-600 text-white shrink-0 shadow-md">
                <FileText className="h-5 w-5" />
              </div>
              <div className="min-w-0 flex-1">
                <p className="font-semibold truncate">{d.name}</p>
                <p className="text-xs text-muted-foreground mt-0.5">
                  {d.size ? `${(d.size/1024).toFixed(1)} KB` : ""}
                  {d.created_at && ` · ${new Date(d.created_at).toLocaleDateString()}`}
                </p>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
