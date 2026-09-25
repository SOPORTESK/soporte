import { NextRequest, NextResponse } from "next/server";
import { createGarantiasServiceClient } from "@/lib/supabase-garantias";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const supabase = createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: "No autenticado" }, { status: 401 });

    const client = createGarantiasServiceClient();
    const { data: record, error } = await client
      .from("garantias")
      .select("*")
      .eq("id", params.id)
      .maybeSingle();

    if (error || !record) {
      return NextResponse.json({ error: error?.message || "No encontrado" }, { status: 404 });
    }

    const { data: historial } = await client
      .from("garantias_historial")
      .select("*")
      .eq("garantia_id", params.id)
      .order("fecha", { ascending: false });

    return NextResponse.json({ record, historial: historial || [] });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || "Error al obtener registro" }, { status: 500 });
  }
}

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const supabase = createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: "No autenticado" }, { status: 401 });

    const { data: agent } = await supabase
      .from("sek_agent_config")
      .select("nombre, apellido")
      .eq("email", user.email)
      .maybeSingle();

    const nombreModificador = agent ? [agent.nombre, agent.apellido].filter(Boolean).join(" ") : user.email?.split("@")[0] || "Técnico";

    const body = await req.json();
    const client = createGarantiasServiceClient();

    // Obtener estado anterior para registrar cambios en el historial
    const { data: prevRecord } = await client
      .from("garantias")
      .select("*")
      .eq("id", params.id)
      .maybeSingle();

    const now = new Date().toISOString();
    const updatePayload: Record<string, any> = {
      ...body,
      fecha_modificacion: now,
      modificado_por: nombreModificador,
    };

    const { data: updated, error: updateError } = await client
      .from("garantias")
      .update(updatePayload)
      .eq("id", params.id)
      .select()
      .single();

    if (updateError) {
      return NextResponse.json({ error: updateError.message }, { status: 500 });
    }

    // Registrar en garantias_historial si hubo cambios
    if (prevRecord) {
      try {
        const cambios: Record<string, { anterior: any; nuevo: any }> = {};
        for (const key of Object.keys(body)) {
          if (body[key] !== prevRecord[key]) {
            cambios[key] = { anterior: prevRecord[key], nuevo: body[key] };
          }
        }

        await client.from("garantias_historial").insert({
          garantia_id: params.id,
          fecha: now,
          usuario: nombreModificador,
          nota: body.nota || (body.estatus !== prevRecord.estatus ? `Cambio de estatus: ${prevRecord.estatus || "Sin estatus"} ➔ ${body.estatus}` : "Actualización de campos"),
          cambios,
          estatus_anterior: prevRecord.estatus || null,
          estatus_nuevo: body.estatus || prevRecord.estatus || null,
        });
      } catch (histErr) {
        console.warn("[garantias historial] No se pudo guardar historial:", histErr);
      }
    }

    return NextResponse.json({ ok: true, record: updated });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || "Error al actualizar" }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const supabase = createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: "No autenticado" }, { status: 401 });

    const client = createGarantiasServiceClient();

    // Eliminar historial asociado
    await client.from("garantias_historial").delete().eq("garantia_id", params.id);

    // Eliminar registro
    const { error } = await client.from("garantias").delete().eq("id", params.id);
    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ ok: true });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || "Error al eliminar" }, { status: 500 });
  }
}
