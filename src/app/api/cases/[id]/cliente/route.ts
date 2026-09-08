import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/service";
import { createClient } from "@/lib/supabase/server";

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
      "descripcion", "marca", "modelo", "serie", "tipo_consulta"
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

    // Leer el caso actual para obtener el teléfono del cliente
    const { data: caseData, error: fetchError } = await supabase
      .from("sek_cases")
      .select("cliente, customer_phone")
      .eq("id", id)
      .maybeSingle();

    if (fetchError || !caseData) {
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
    const caseUpdates: Record<string, unknown> = { cliente: updatedCliente };
    if (cleanFields.marca !== undefined) caseUpdates.marca = cleanFields.marca || null;
    if (cleanFields.modelo !== undefined) caseUpdates.modelo = cleanFields.modelo || null;
    if (cleanFields.descripcion !== undefined) caseUpdates.problema = cleanFields.descripcion || null;

    const { error: updateError } = await supabase
      .from("sek_cases")
      .update(caseUpdates)
      .eq("id", id);

    if (updateError) {
      console.error("[PATCH /api/cases/[id]/cliente] Error:", updateError.message);
      return NextResponse.json({ error: updateError.message }, { status: 500 });
    }

    // Propagar ÚNICAMENTE los datos de identidad/perfil del contacto a los demás casos del cliente
    // (nombre, cuenta, correo, cédula, teléfono). NUNCA propagar marca, modelo, serie ni descripción
    // ya que cada caso/ticket tiene su propio equipo y problema independiente.
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
        .or(`customer_phone.eq.${clienteTel}`)
        .neq("id", id);

      if (relatedCases && relatedCases.length > 0) {
        for (const rc of relatedCases) {
          const rcCliente = (rc.cliente && typeof rc.cliente === "object")
            ? rc.cliente as Record<string, unknown>
            : {};
          const rcTel = (rcCliente.telefono as string || "").trim().replace(/[^0-9]/g, "");
          if (rcTel === clienteTel) {
            const mergedCliente = { ...rcCliente, ...contactOnlyFields };
            await supabase
              .from("sek_cases")
              .update({ cliente: mergedCliente })
              .eq("id", rc.id);
          }
        }
        console.log(`[PATCH /api/cases/[id]/cliente] Perfil de contacto propagado a ${relatedCases.length} casos relacionados (tel: ${clienteTel})`);
      }
    }

    return NextResponse.json({ ok: true, cliente: updatedCliente });
  } catch (e: any) {
    console.error("[PATCH /api/cases/[id]/cliente] Exception:", e.message);
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
