import { NextRequest, NextResponse } from "next/server";
import { createGarantiasServiceClient } from "@/lib/supabase-garantias";
import { createClient } from "@/lib/supabase/server";
import { cacheDelete } from "@/lib/supabase/cache";

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

    let finalHistorial = Array.isArray(historial) ? historial : [];

    // Fallback 1: Buscar historial embebido en usuario_id
    if (finalHistorial.length === 0 && record.usuario_id) {
      try {
        const parsed = JSON.parse(record.usuario_id);
        if (Array.isArray(parsed) && parsed.length > 0) {
          finalHistorial = parsed;
        }
      } catch (_) {}
    }

    // Fallback 2: Sintetizar historial base si el registro ya cuenta con notas u observaciones previas
    if (finalHistorial.length === 0) {
      if ((record.observaciones && String(record.observaciones).trim()) || (record.seguimiento && String(record.seguimiento).trim()) || record.fecha_modificacion) {
        finalHistorial = [{
          id: `hist_init_${record.id}`,
          garantia_id: record.id,
          fecha: record.fecha_modificacion || record.fecha_creacion || new Date().toISOString(),
          modificado_por: record.modificado_por || record.registrado_por || "Técnico",
          observaciones: record.observaciones || "(Sin observaciones registradas)",
          seguimiento: record.seguimiento || "(Sin seguimiento registrado)"
        }];
      }
    }

    return NextResponse.json({ record, historial: finalHistorial });
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
    delete updatePayload.nota;
    delete updatePayload.historial;
    delete updatePayload.id;

    const { data: updated, error: updateError } = await client
      .from("garantias")
      .update(updatePayload)
      .eq("id", params.id)
      .select()
      .maybeSingle();

    if (updateError) {
      return NextResponse.json({ error: updateError.message }, { status: 500 });
    }

    // Registrar en garantias_historial si hubo cambios
    if (prevRecord) {
      try {
        const cambios: string[] = [];
        for (const key of Object.keys(body)) {
          if (body[key] !== prevRecord[key] && key !== "fecha_modificacion" && key !== "modificado_por" && key !== "nota") {
            cambios.push(`${key}: ${prevRecord[key] || "—"} ➔ ${body[key]}`);
          }
        }

        const obsTexto = (body.observaciones && String(body.observaciones).trim()) || "";
        const segTexto = (body.seguimiento && String(body.seguimiento).trim()) || "";
        const obsFinal = obsTexto || (cambios.length > 0 ? cambios.join(" | ") : (body.nota || "Actualización de registro"));
        const segFinal = segTexto || prevRecord.seguimiento || (cambios.length > 0 ? cambios.join(" | ") : "");

        const historialPayload = {
          id: (typeof crypto !== "undefined" && crypto.randomUUID) ? crypto.randomUUID() : (`hist_${Date.now()}`),
          garantia_id: params.id,
          fecha: now,
          observaciones: obsFinal,
          seguimiento: segFinal,
          modificado_por: nombreModificador,
        };

        // 1. Intentar inserción en garantias_historial
        const { error: histInsertError } = await client
          .from("garantias_historial")
          .insert(historialPayload);

        if (histInsertError) {
          console.warn("[garantias historial] Error al guardar historial:", histInsertError);
        }

        // 2. Persistir siempre en el campo embebido usuario_id del registro para respaldo garantizado
        let prevHist: any[] = [];
        if (prevRecord.usuario_id) {
          try {
            const p = JSON.parse(prevRecord.usuario_id);
            if (Array.isArray(p)) prevHist = p;
          } catch (_) {}
        }
        const updatedHist = [historialPayload, ...prevHist].slice(0, 50);
        await client
          .from("garantias")
          .update({ usuario_id: JSON.stringify(updatedHist) })
          .eq("id", params.id);
      } catch (histErr) {
        console.warn("[garantias historial] No se pudo guardar historial:", histErr);
      }
    }

    cacheDelete("admin_garantias_records");
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

    cacheDelete("admin_garantias_records");
    return NextResponse.json({ ok: true });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || "Error al eliminar" }, { status: 500 });
  }
}
