// GET /api/admin/reset-operational-data/counts
// Devuelve los conteos actuales de datos operacionales (solo superadmin).
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";
import { NextResponse } from "next/server";
import { unifyClients } from "@/lib/client-analytics";

export const dynamic = "force-dynamic";

export async function GET() {
  // Auth check con cliente normal (respeta sesión del usuario)
  const auth = createClient();
  const { data: { user } } = await auth.auth.getUser();
  if (!user) return NextResponse.json({ error: "No autenticado" }, { status: 401 });
  const { data: agent } = await auth
    .from("sek_agent_config").select("rol").ilike("email", user.email!).maybeSingle();
  if (agent?.rol !== "superadmin") {
    return NextResponse.json({ error: "Solo superadmin" }, { status: 403 });
  }

  // Counts con service client (bypassa RLS, ve TODAS las filas reales)
  const supabase = createServiceClient();

  // Manuales reales = chunks con doc_id apuntando a sek_docs.
  // Aprendizajes de chats = chunks insertados por learn-case/auto-close/ia-agent (doc_id null, source_label "Aprendizaje de conversación").
  const [casesCount, casesBatch1, casesBatch2, clientesData, docs, learnings, manualesChunks, webCache, attachments] = await Promise.all([
    supabase.from("sek_cases").select("id", { count: "exact", head: true }),
    supabase.from("sek_cases").select("id, customer_phone, cliente, created_at, estado, closed_at").range(0, 999),
    supabase.from("sek_cases").select("id, customer_phone, cliente, created_at, estado, closed_at").range(1000, 2499),
    supabase.from("sek_clientes").select("telefono, correo, cedula"),
    supabase.from("sek_docs").select("id", { count: "exact", head: true }),
    supabase
      .from("sek_doc_chunks")
      .select("id", { count: "exact", head: true })
      .eq("source_label", "Aprendizaje de conversación"),
    supabase
      .from("sek_doc_chunks")
      .select("id", { count: "exact", head: true })
      .not("doc_id", "is", null),
    supabase
      .from("sek_doc_chunks")
      .select("id", { count: "exact", head: true })
      .eq("source_label", "Búsqueda Web"),
    supabase.storage.from("sek-attachments").list("", { limit: 1000 }),
  ]);

  const allCases = [...(casesBatch1.data || []), ...(casesBatch2.data || [])];
  const unifiedClientsList = unifyClients(allCases);
  const uniqueClientsCount = unifiedClientsList.length;

  return NextResponse.json({
    counts: {
      cases: casesCount.count || 0,
      clientes: uniqueClientsCount,
      learnings: learnings.count || 0,
      manuales_docs: docs.count || 0,
      manuales_chunks: manualesChunks.count || 0,
      web_cache: webCache.count || 0,
      attachments: attachments.data?.length || 0,
    },
  });
}
