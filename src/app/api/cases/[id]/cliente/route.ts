import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/service";
import { createClient } from "@/lib/supabase/server";
import { createGarantiasServiceClient } from "@/lib/supabase-garantias";

export async function PATCH(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const supabase = createServiceClient();
    const id = params.id;

    // Verificar autenticación del agente
    const supabaseAuth = createClient();
    const { data: { user } } = await supabaseAuth.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: "No autenticado" }, { status: 401 });
    }

    const body = await req.json();
    const { fields } = body as { fields: Record<string, string> };

    if (!fields || typeof fields !== "object" || Object.keys(fields).length === 0) {
      return NextResponse.json({ error: "Campos inválidos" }, { status: 400 });
    }

    // Solo permitir editar campos seguros del cliente
    const allowedFields = new Set([
      "nombre", "cuenta", "correo", "telefono", "cedula", 
      "descripcion", "marca", "modelo", "serie", "tipo_consulta", "ticket", "boleta"
    ]);
    const cleanFields: Record<string, string> = {};
    for (const [key, value] of Object.entries(fields)) {
      if (allowedFields.has(key) && typeof value === "string") {
        cleanFields[key] = value.trim();
      }
    }

    if (Object.keys(cleanFields).length === 0) {
      return NextResponse.json({ error: "No hay campos válidos para actualizar" }, { status: 400 });
    }

    // Resolver caso actual soportando UUID, tel: o teléfono
    let targetCaseId = id;
    let caseData: any = null;

    const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id);

    if (isUuid) {
      const { data, error } = await supabase
        .from("sek_cases")
        .select("id, cliente, customer_phone")
        .eq("id", id)
        .maybeSingle();
      if (!error && data) {
        caseData = data;
        targetCaseId = data.id;
      }
    }

    if (!caseData) {
      // Buscar por teléfono si el id empieza con tel: o no es UUID
      const cleanPhone = id.replace(/^tel:/i, "").replace(/^case:/i, "").replace(/[^0-9]/g, "");
      if (cleanPhone) {
        const { data: phoneCase } = await supabase
          .from("sek_cases")
          .select("id, cliente, customer_phone")
          .or(`customer_phone.eq.${cleanPhone},customer_phone.eq.${cleanPhone}@s.whatsapp.net,customer_phone.eq.${cleanPhone}@g.us,cliente->>telefono.eq.${cleanPhone}`)
          .order("last_message_at", { ascending: false })
          .limit(1)
          .maybeSingle();
        if (phoneCase) {
          caseData = phoneCase;
          targetCaseId = phoneCase.id;
        }
      }
    }

    if (!caseData) {
      return NextResponse.json({ error: "Caso no encontrado" }, { status: 404 });
    }

    const currentCliente = (caseData.cliente && typeof caseData.cliente === "object")
      ? caseData.cliente as Record<string, unknown>
      : {};

    // Merge: actualizar solo los campos enviados
    const updatedCliente = { ...currentCliente, ...cleanFields };

    // Determinar el teléfono para buscar todos los casos del mismo cliente
    const clienteTel = (currentCliente.telefono as string || caseData.customer_phone || "").trim().replace(/[^0-9]/g, "");

    // Actualizar el caso actual (sincronizando también columnas principales de marca/modelo/problema si se editaron)
    const caseUpdates: Record<string, unknown> = {
      cliente: updatedCliente,
      updated_at: new Date().toISOString()
    };
    if (cleanFields.marca !== undefined) caseUpdates.marca = cleanFields.marca || null;
    if (cleanFields.modelo !== undefined) caseUpdates.modelo = cleanFields.modelo || null;
    if (cleanFields.descripcion !== undefined) caseUpdates.problema = cleanFields.descripcion || null;

    const { error: updateError } = await supabase
      .from("sek_cases")
      .update(caseUpdates)
      .eq("id", targetCaseId);

    if (updateError) {
      console.error("[PATCH /api/cases/[id]/cliente] Error:", updateError.message);
      return NextResponse.json({ error: updateError.message }, { status: 500 });
    }

    // Propagar datos de identidad del contacto a los demás casos del cliente
    const contactOnlyFields: Record<string, string> = {};
    for (const k of ["nombre", "cuenta", "correo", "cedula", "telefono"]) {
      if (cleanFields[k] !== undefined) {
        contactOnlyFields[k] = cleanFields[k];
      }
    }

    if (clienteTel && Object.keys(contactOnlyFields).length > 0) {
      const { data: relatedCases } = await supabase
        .from("sek_cases")
        .select("id, cliente")
        .or(`customer_phone.eq.${clienteTel},customer_phone.eq.${clienteTel}@s.whatsapp.net,customer_phone.eq.${clienteTel}@g.us`)
        .neq("id", targetCaseId);

      if (relatedCases && relatedCases.length > 0) {
        for (const rc of relatedCases) {
          const rcCliente = (rc.cliente && typeof rc.cliente === "object")
            ? rc.cliente as Record<string, unknown>
            : {};
          const mergedCliente = { ...rcCliente, ...contactOnlyFields };
          await supabase
            .from("sek_cases")
            .update({ cliente: mergedCliente })
            .eq("id", rc.id);
        }
      }
    }

    // ── Sincronización automática hacia la base de datos de Garantías ──
    try {
      const clientGarantias = createGarantiasServiceClient();
      const clientName = cleanFields.nombre || (updatedCliente.nombre as string) || (updatedCliente.cuenta as string) || "";
      const clientSerie = cleanFields.serie || (updatedCliente.serie as string) || "";
      const clientTicket = (cleanFields.ticket as string) || (updatedCliente.ticket as string) || "";
      const clientBoleta = (cleanFields.boleta as string) || (updatedCliente.boleta as string) || "";

      let matchedGarantias: any[] = [];

      // 1. Prioridad: Buscar por boleta si existe
      if (clientBoleta) {
        const { data: byBoleta } = await clientGarantias
          .from("garantias")
          .select("id, boleta, ticket, nombre, marca, serie, numero_serie")
          .ilike("boleta", `%${clientBoleta}%`)
          .limit(3);
        if (byBoleta && byBoleta.length > 0) matchedGarantias = byBoleta;
      }

      // 2. Prioridad: Buscar por ticket
      if (matchedGarantias.length === 0 && clientTicket) {
        const cleanT = clientTicket.replace(/^#/, "");
        const { data: byTicket } = await clientGarantias
          .from("garantias")
          .select("id, boleta, ticket, nombre, marca, serie, numero_serie")
          .or(`ticket.eq.${cleanT},ticket.eq.#${cleanT}`)
          .limit(5);
        if (byTicket && byTicket.length > 0) matchedGarantias = byTicket;
      }

      // 3. Prioridad: Buscar por número de serie
      if (matchedGarantias.length === 0 && clientSerie && clientSerie.length >= 4) {
        const { data: bySerie } = await clientGarantias
          .from("garantias")
          .select("id, boleta, ticket, nombre, marca, serie, numero_serie")
          .or(`numero_serie.eq.${clientSerie},serie.eq.${clientSerie}`)
          .limit(5);
        if (bySerie && bySerie.length > 0) matchedGarantias = bySerie;
      }

      // 4. Prioridad: Buscar por nombre del cliente
      if (matchedGarantias.length === 0 && clientName && clientName.length >= 4) {
        const { data: byName } = await clientGarantias
          .from("garantias")
          .select("id, boleta, ticket, nombre, marca, serie, numero_serie")
          .ilike("nombre", `%${clientName}%`)
          .limit(3);
        if (byName && byName.length > 0) matchedGarantias = byName;
      }

      // Aplicar actualización a las garantías emparejadas
      if (matchedGarantias.length > 0) {
        const agentName = user.email?.split("@")[0] || "Soporte";
        const gUpdates: Record<string, any> = {
          fecha_modificacion: new Date().toISOString(),
          modificado_por: agentName,
        };
        if (cleanFields.marca) gUpdates.marca = cleanFields.marca;
        if (cleanFields.modelo) gUpdates.serie = cleanFields.modelo;
        if (cleanFields.serie) gUpdates.numero_serie = cleanFields.serie;
        if (cleanFields.descripcion) gUpdates.falla = cleanFields.descripcion;
        if (cleanFields.nombre) gUpdates.nombre = cleanFields.nombre;

        for (const gRec of matchedGarantias) {
          await clientGarantias.from("garantias").update(gUpdates).eq("id", gRec.id);
        }
        console.log(`[soporte->garantias] Sincronizadas ${matchedGarantias.length} garantías desde Soporte`);
      }
    } catch (gSyncErr) {
      console.warn("[soporte->garantias] Error al sincronizar con garantías:", gSyncErr);
    }

    return NextResponse.json({ ok: true, cliente: updatedCliente });
  } catch (e: any) {
    console.error("[PATCH /api/cases/[id]/cliente] Exception:", e.message);
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
