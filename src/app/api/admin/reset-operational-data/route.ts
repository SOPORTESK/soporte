// ════════════════════════════════════════════════════════════════════════════
// RESET OPERATIONAL DATA — solo superadmin
// Borra TODOS los chats, mensajes y clientes para arrancar limpio.
// Preserva configuración: prompt, agentes, inventario, manuales RAG.
// ════════════════════════════════════════════════════════════════════════════
import { createClient } from "@/lib/supabase/server";
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

async function getSuperadmin() {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "No autenticado", supabase: null };
  const { data: agent } = await supabase
    .from("sek_agent_config").select("rol").ilike("email", user.email!).maybeSingle();
  if (agent?.rol !== "superadmin") return { error: "Solo superadmin puede realizar esta acción", supabase: null };
  return { error: null, supabase };
}

export async function POST(req: Request) {
  const { error, supabase } = await getSuperadmin();
  if (error || !supabase) return NextResponse.json({ error }, { status: 403 });

  const body = await req.json().catch(() => ({}));
  if (body?.confirm !== "BORRAR") {
    return NextResponse.json(
      { error: "Confirmación inválida. Envía { confirm: 'BORRAR' }" },
      { status: 400 }
    );
  }

  const result: Record<string, { deleted: number | null; error?: string }> = {};

  // 1) sek_cases — chats completos (incluye histcliente/histtecnico JSONB)
  {
    const { count: before } = await supabase.from("sek_cases").select("id", { count: "exact", head: true });
    const { error: e } = await supabase.from("sek_cases").delete().not("id", "is", null);
    result.sek_cases = { deleted: before ?? null, error: e?.message };
  }

  // 2) sek_messages — tabla vestigial (por si quedó algo)
  {
    const { count: before } = await supabase.from("sek_messages").select("id", { count: "exact", head: true });
    const { error: e } = await supabase.from("sek_messages").delete().not("id", "is", null);
    result.sek_messages = { deleted: before ?? null, error: e?.message };
  }

  // 3) sek_clientes — registro de clientes
  {
    const { count: before } = await supabase.from("sek_clientes").select("id", { count: "exact", head: true });
    const { error: e } = await supabase.from("sek_clientes").delete().not("id", "is", null);
    result.sek_clientes = { deleted: before ?? null, error: e?.message };
  }

  // 4) sek_doc_chunks — solo aprendizajes de chats y cache de búsquedas web, NO manuales
  {
    const { count: before } = await supabase
      .from("sek_doc_chunks")
      .select("id", { count: "exact", head: true })
      .eq("source_label", "Aprendizaje de conversación");
    const { error: e } = await supabase
      .from("sek_doc_chunks")
      .delete()
      .eq("source_label", "Aprendizaje de conversación");
    result["sek_doc_chunks (aprendizajes)"] = { deleted: before ?? null, error: e?.message };
  }
  {
    const { count: before } = await supabase
      .from("sek_doc_chunks")
      .select("id", { count: "exact", head: true })
      .eq("source_label", "Búsqueda Web");
    const { error: e } = await supabase
      .from("sek_doc_chunks")
      .delete()
      .eq("source_label", "Búsqueda Web");
    result["sek_doc_chunks (cache web)"] = { deleted: before ?? null, error: e?.message };
  }

  // 5) Storage sek-attachments — limpiar archivos subidos en chats
  try {
    const { data: files } = await supabase.storage.from("sek-attachments").list("", { limit: 1000 });
    if (files && files.length > 0) {
      const paths = files.map(f => f.name);
      const { error: e } = await supabase.storage.from("sek-attachments").remove(paths);
      result["storage sek-attachments"] = { deleted: paths.length, error: e?.message };
    } else {
      result["storage sek-attachments"] = { deleted: 0 };
    }
  } catch (e: any) {
    result["storage sek-attachments"] = { deleted: null, error: e?.message || "Error desconocido" };
  }

  const hasErrors = Object.values(result).some(r => !!r.error);
  return NextResponse.json({ ok: !hasErrors, result }, { status: hasErrors ? 207 : 200 });
}
