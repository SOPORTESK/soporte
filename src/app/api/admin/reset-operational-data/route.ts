// ════════════════════════════════════════════════════════════════════════════
// RESET OPERATIONAL DATA — solo superadmin
// Borra TODOS los chats, mensajes y clientes para arrancar limpio.
// Preserva configuración: prompt, agentes, inventario, manuales RAG.
// ════════════════════════════════════════════════════════════════════════════
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

async function getSuperadmin() {
  // Auth con cliente normal (respeta sesión)
  const auth = createClient();
  const { data: { user } } = await auth.auth.getUser();
  if (!user) return { error: "No autenticado", supabase: null };
  const { data: agent } = await auth
    .from("sek_agent_config").select("rol").ilike("email", user.email!).maybeSingle();
  if (agent?.rol !== "superadmin") return { error: "Solo superadmin puede realizar esta acción", supabase: null };
  // Service client para borrar (bypassa RLS — sek_clientes solo permite anon)
  return { error: null, supabase: createServiceClient() };
}

export async function POST(req: Request) {
  try {
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

    // 1) sek_cases
    {
      const { count: before, error: countErr } = await supabase.from("sek_cases").select("id", { count: "exact", head: true });
      const { error: e } = await supabase.from("sek_cases").delete().not("id", "is", null);
      result.sek_cases = { deleted: before ?? null, error: e?.message || countErr?.message };
    }

    // 2) sek_messages
    {
      const { count: before, error: countErr } = await supabase.from("sek_messages").select("id", { count: "exact", head: true });
      const { error: e } = await supabase.from("sek_messages").delete().not("id", "is", null);
      result.sek_messages = { deleted: before ?? null, error: e?.message || countErr?.message };
    }

    // 3) sek_clientes
    {
      const { count: before, error: countErr } = await supabase.from("sek_clientes").select("id", { count: "exact", head: true });
      const { error: e } = await supabase.from("sek_clientes").delete().not("id", "is", null);
      result.sek_clientes = { deleted: before ?? null, error: e?.message || countErr?.message };
    }

    // 4) sek_doc_chunks (aprendizajes y caché web)
    {
      const { count: before, error: countErr } = await supabase
        .from("sek_doc_chunks")
        .select("id", { count: "exact", head: true })
        .eq("source_label", "Aprendizaje de conversación");
      const { error: e } = await supabase
        .from("sek_doc_chunks")
        .delete()
        .eq("source_label", "Aprendizaje de conversación");
      result["sek_doc_chunks (aprendizajes)"] = { deleted: before ?? null, error: e?.message || countErr?.message };
    }
    {
      const { count: before, error: countErr } = await supabase
        .from("sek_doc_chunks")
        .select("id", { count: "exact", head: true })
        .eq("source_label", "Búsqueda Web");
      const { error: e } = await supabase
        .from("sek_doc_chunks")
        .delete()
        .eq("source_label", "Búsqueda Web");
      result["sek_doc_chunks (cache web)"] = { deleted: before ?? null, error: e?.message || countErr?.message };
    }

    // 5) Storage sek-attachments
    try {
      const { data: files, error: listError } = await supabase.storage.from("sek-attachments").list("", { limit: 1000 });
      if (listError) {
        result["storage sek-attachments"] = { deleted: null, error: listError.message };
      } else if (files && files.length > 0) {
        const paths = files.map((f: any) => f.name);
        const { error: e } = await supabase.storage.from("sek-attachments").remove(paths);
        result["storage sek-attachments"] = { deleted: paths.length, error: e?.message };
      } else {
        result["storage sek-attachments"] = { deleted: 0 };
      }
    } catch (e: any) {
      result["storage sek-attachments"] = { deleted: null, error: e?.message || "Error desconocido al borrar storage" };
    }

    const hasErrors = Object.values(result).some(r => !!r.error);
    return NextResponse.json({ ok: !hasErrors, result }, { status: hasErrors ? 207 : 200 });
  } catch (error: any) {
    console.error("[FATAL ERROR IN RESET API]:", error);
    return NextResponse.json({ ok: false, error: "Error interno del servidor al procesar el borrado", details: error?.message }, { status: 500 });
  }
}
