import { createClient } from "@/lib/supabase/server";
import { BookOpen, FileText, Brain, Database, Layers, Search } from "lucide-react";
import { Badge } from "@/components/ui/avatar";
import { ManualesClient } from "@/components/admin/manuales-client";

export const dynamic = "force-dynamic";

export default async function AdminManualesPage() {
  const supabase = createClient();
  
  // Obtener documentos
  const { data: docs, error: docsError } = await supabase
    .from("sek_docs")
    .select("id,name,size,date")
    .order("date", { ascending: false });

  if (docsError) {
    console.error("[manuales] Error fetching docs:", docsError.message);
  }

  // Obtener chunks (fragmentos con embeddings)
  const { data: chunks, count: chunksCount, error: chunksError } = await supabase
    .from("sek_doc_chunks")
    .select("*", { count: "exact" })
    .order("created_at", { ascending: false })
    .limit(5);

  if (chunksError) {
    console.error("[manuales] Error fetching chunks:", chunksError.message);
  }

  const totalDocs = docs?.length || 0;
  const totalChunks = chunksCount || 0;

  return (
    <div className="max-w-7xl mx-auto p-6 lg:p-8 space-y-8">
      <header>
        <p className="text-xs font-bold uppercase tracking-[0.2em] text-brand-700 dark:text-brand-300">Gestión</p>
        <h1 className="text-3xl font-bold mt-1 flex items-center gap-3">
          <BookOpen className="h-7 w-7" /> Manuales — Sistema RAG
        </h1>
        <p className="text-muted-foreground mt-1">
          Base documental con embeddings vectoriales. El Asistente Virtual busca aquí para respuestas contextuales.
        </p>
      </header>

      <ManualesClient docs={docs as any[]} />

      {/* Stats RAG */}
      <section className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <div className="rounded-2xl border border-border bg-card p-5">
          <div className="flex items-start justify-between">
            <div>
              <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Documentos</p>
              <p className="text-3xl font-bold mt-2">{totalDocs}</p>
            </div>
            <div className="h-10 w-10 rounded-xl bg-sky-100 dark:bg-sky-900/40 text-sky-700 dark:text-sky-300 grid place-items-center">
              <FileText className="h-5 w-5" />
            </div>
          </div>
        </div>

        <div className="rounded-2xl border border-border bg-card p-5">
          <div className="flex items-start justify-between">
            <div>
              <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Chunks</p>
              <p className="text-3xl font-bold mt-2">{totalChunks}</p>
            </div>
            <div className="h-10 w-10 rounded-xl bg-violet-100 dark:bg-violet-900/40 text-violet-700 dark:text-violet-300 grid place-items-center">
              <Layers className="h-5 w-5" />
            </div>
          </div>
          <p className="text-xs text-muted-foreground mt-2">Fragmentos con embeddings</p>
        </div>

        <div className="rounded-2xl border border-border bg-card p-5">
          <div className="flex items-start justify-between">
            <div>
              <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Base Vectorial</p>
              <p className="text-3xl font-bold mt-2">pgvector</p>
            </div>
            <div className="h-10 w-10 rounded-xl bg-emerald-100 dark:bg-emerald-900/40 text-emerald-700 dark:text-emerald-300 grid place-items-center">
              <Database className="h-5 w-5" />
            </div>
          </div>
        </div>

        <div className="rounded-2xl border border-border bg-card p-5">
          <div className="flex items-start justify-between">
            <div>
              <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Búsqueda</p>
              <p className="text-3xl font-bold mt-2">textSearch</p>
            </div>
            <div className="h-10 w-10 rounded-xl bg-amber-100 dark:bg-amber-900/40 text-amber-700 dark:text-amber-300 grid place-items-center">
              <Search className="h-5 w-5" />
            </div>
          </div>
        </div>
      </section>

      {/* Cómo funciona RAG */}
      <section className="rounded-2xl border border-border bg-card p-6">
        <h2 className="text-lg font-semibold mb-4 flex items-center gap-2">
          <Brain className="h-5 w-5 text-brand-700" /> Sistema RAG — Cómo funciona
        </h2>
        <div className="grid gap-4 sm:grid-cols-3">
          <div className="p-4 rounded-xl bg-muted/50">
            <p className="font-semibold text-sm mb-2">1. Indexación</p>
            <p className="text-xs text-muted-foreground">
              Los PDFs se dividen en chunks (fragmentos) de ~1000 caracteres y se generan embeddings vectoriales.
            </p>
          </div>
          <div className="p-4 rounded-xl bg-muted/50">
            <p className="font-semibold text-sm mb-2">2. Búsqueda</p>
            <p className="text-xs text-muted-foreground">
              El Asistente Virtual usa textSearch en <code>sek_doc_chunks</code> para encontrar contenido relevante por palabras clave.
            </p>
          </div>
          <div className="p-4 rounded-xl bg-muted/50">
            <p className="font-semibold text-sm mb-2">3. Contexto</p>
            <p className="text-xs text-muted-foreground">
              Los chunks encontrados se inyectan en el prompt del Asistente Virtual como contexto para respuestas precisas.
            </p>
          </div>
        </div>
        
        <div className="mt-4 bg-zinc-950 text-zinc-100 p-4 rounded-xl font-mono text-xs overflow-x-auto">
          <pre>{`// Código RAG en la Edge Function ia-agent
const words = manualQuery.split(" ").filter(w => w.length > 3).slice(0, 6).join(" | ");
const { data: chunks } = await db
  .from("sek_doc_chunks")
  .select("content, doc_name")
  .textSearch("content", words, { type: "websearch" })
  .limit(4);

if (chunks?.length > 0) {
  const context = chunks.map(c => \`[\${c.doc_name}]: \${c.content}\`).join("\\n\\n");
  chatMessages.push({
    role: "system",
    content: \`Información de manuales:\\n\${context}\`
  });
}`}</pre>
        </div>
      </section>

      {/* Chunks de ejemplo */}
      {chunks && chunks.length > 0 && (
        <section className="rounded-2xl border border-border bg-card p-6">
          <h3 className="font-semibold mb-4 flex items-center gap-2">
            <Layers className="h-4 w-4" /> Chunks Recientes (Fragmentos con Embeddings)
          </h3>
          <div className="space-y-3">
            {chunks.map((chunk: any, idx: number) => (
              <div key={idx} className="p-4 rounded-xl bg-muted/30 border border-border">
                <div className="flex items-center gap-2 mb-2">
                  <Badge variant="muted" className="text-[10px]">{chunk.doc_name}</Badge>
                  <span className="text-xs text-muted-foreground">chunk {idx + 1}</span>
                </div>
                <p className="text-sm text-muted-foreground line-clamp-3">{chunk.content}</p>
              </div>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
