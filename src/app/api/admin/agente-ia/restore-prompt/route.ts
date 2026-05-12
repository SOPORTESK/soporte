import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function POST(req: NextRequest) {
  try {
    const supabase = createClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: "No autorizado" }, { status: 401 });
    }

    // Solo superadmin puede restaurar
    const { data: agentRow } = await supabase
      .from("sek_agent_config")
      .select("rol")
      .ilike("email", user.email!)
      .maybeSingle();

    if (agentRow?.rol !== "superadmin") {
      return NextResponse.json({ error: "Solo el superadmin puede restaurar versiones anteriores." }, { status: 403 });
    }

    const { historyId, currentPrompt } = await req.json();

    if (!historyId) {
      return NextResponse.json({ error: "Falta historyId" }, { status: 400 });
    }

    // Obtener la versión a restaurar
    const { data: entry, error: fetchError } = await supabase
      .from("sek_prompt_history")
      .select("prompt, summary")
      .eq("id", historyId)
      .maybeSingle();

    if (fetchError || !entry) {
      return NextResponse.json({ error: "Versión no encontrada" }, { status: 404 });
    }

    // Guardar el estado actual en historial antes de restaurar
    await supabase
      .from("sek_prompt_history")
      .insert({
        prompt: currentPrompt,
        summary: `Snapshot antes de restaurar versión: ${entry.summary}`,
        changed_by: user.email!,
        change_type: "restore",
      });

    // Restaurar la versión seleccionada
    await supabase
      .from("sek_agent_config")
      .update({ system_prompt: entry.prompt })
      .eq("email", "system_prompt@sekunet.com");

    return NextResponse.json({ success: true, restoredPrompt: entry.prompt });

  } catch (error: any) {
    console.error("Restore-prompt error:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function GET() {
  try {
    const supabase = createClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: "No autorizado" }, { status: 401 });
    }

    const { data: history, error } = await supabase
      .from("sek_prompt_history")
      .select("id, summary, changed_by, change_type, created_at")
      .order("created_at", { ascending: false })
      .limit(20);

    if (error) throw error;

    // Retornar también el prompt activo actual desde la BD
    const { data: activeConfig } = await supabase
      .from("sek_agent_config")
      .select("system_prompt")
      .eq("email", "system_prompt@sekunet.com")
      .maybeSingle();

    return NextResponse.json({ history: history || [], activePrompt: activeConfig?.system_prompt || null });

  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
