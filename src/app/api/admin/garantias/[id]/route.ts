import { NextRequest, NextResponse } from "next/server";
import { createGarantiasServiceClient } from "@/lib/supabase-garantias";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";
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

    if (!updated) {
      console.error("[garantias update] Falló: 0 filas modificadas por RLS en Supabase (falta service_role key)");
      return NextResponse.json({
        error: "Permisos insuficientes en Supabase de Garantías (RLS): La base de datos externa rechazó la actualización porque falta la GARANTIAS_SUPABASE_SERVICE_ROLE_KEY."
      }, { status: 403 });
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

    // Sincronización automática hacia la base de datos de Soporte (sek_cases)
    try {
      const chatSupabase = createServiceClient();
      const ticketVal = String(body.ticket || prevRecord?.ticket || "").trim().replace(/^#/, "");
      const clientName = String(body.nombre || prevRecord?.nombre || "").trim();
      const clientSerie = String(body.numero_serie || body.serie || prevRecord?.numero_serie || prevRecord?.serie || "").trim();

      let matchedCases: any[] = [];

      // 1. Prioridad: Buscar por ticket
      if (ticketVal) {
        const { data: byTicket } = await chatSupabase
          .from("sek_cases")
          .select("id, cliente, marca, modelo, problema")
          .or(`cliente->>ticket.eq.${ticketVal},cliente->>ticket.eq.#${ticketVal},title.ilike.%${ticketVal}%`)
          .limit(5);
        if (byTicket && byTicket.length > 0) matchedCases = byTicket;
      }

      // 2. Prioridad: Buscar por serie
      if (matchedCases.length === 0 && clientSerie && clientSerie.length >= 4) {
        const { data: bySerie } = await chatSupabase
          .from("sek_cases")
          .select("id, cliente, marca, modelo, problema")
          .or(`cliente->>serie.eq.${clientSerie},cliente->>modelo.eq.${clientSerie}`)
          .limit(5);
        if (bySerie && bySerie.length > 0) matchedCases = bySerie;
      }

      // 3. Prioridad: Buscar por nombre de cliente
      if (matchedCases.length === 0 && clientName && clientName.length >= 4) {
        const { data: byName } = await chatSupabase
          .from("sek_cases")
          .select("id, cliente, marca, modelo, problema")
          .or(`cliente->>nombre.ilike.%${clientName}%,cliente->>cuenta.ilike.%${clientName}%`)
          .limit(5);
        if (byName && byName.length > 0) matchedCases = byName;
      }

      if (matchedCases.length > 0) {
        for (const c of matchedCases) {
          const cCliente = (c.cliente && typeof c.cliente === "object") ? { ...c.cliente } : {};
          if (body.marca !== undefined) cCliente.marca = body.marca || "";
          if (body.serie !== undefined) cCliente.modelo = body.serie || ""; // en garantias serie es modelo
          if (body.numero_serie !== undefined) cCliente.serie = body.numero_serie || ""; // en garantias numero_serie es serial
          if (body.falla !== undefined || body.descripcion !== undefined) {
            cCliente.descripcion = body.falla || body.descripcion || "";
          }
          if (body.ticket !== undefined) cCliente.ticket = body.ticket;
          if (body.boleta || prevRecord?.boleta) cCliente.boleta = body.boleta || prevRecord?.boleta;
          if (body.estatus !== undefined) cCliente.estatus_garantia = body.estatus;
          if (body.dev !== undefined) cCliente.dev = body.dev;

          const updates: Record<string, any> = {
            cliente: cCliente,
            updated_at: now
          };
          if (body.marca !== undefined) updates.marca = body.marca || null;
          if (body.serie !== undefined) updates.modelo = body.serie || null;
          if (body.falla !== undefined) updates.problema = body.falla || null;

          await chatSupabase.from("sek_cases").update(updates).eq("id", c.id);
        }
        console.log(`[garantias->soporte] Sincronizados ${matchedCases.length} casos para garantía ${params.id}`);
      }
    } catch (syncErr) {
      console.warn("[garantias->soporte] Error sincronizando con sek_cases:", syncErr);
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
