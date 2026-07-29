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
    const allowedFields = new Set(["nombre", "cuenta", "correo", "telefono", "cedula", "descripcion"]);
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

    // Actualizar el caso actual
    const { error: updateError } = await supabase
      .from("sek_cases")
      .update({ cliente: updatedCliente })
      .eq("id", id);

    if (updateError) {
      console.error("[PATCH /api/cases/[id]/cliente] Error:", updateError.message);
      return NextResponse.json({ error: updateError.message }, { status: 500 });
    }

    // Propagar los cambios a todos los casos del mismo teléfono
    // para que las analíticas, agrupación e historial se mantengan consistentes
    if (clienteTel) {
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
          // Solo actualizar si el teléfono coincide en el JSON del cliente
          const rcTel = (rcCliente.telefono as string || "").trim().replace(/[^0-9]/g, "");
          if (rcTel === clienteTel) {
            const mergedCliente = { ...rcCliente, ...cleanFields };
            await supabase
              .from("sek_cases")
              .update({ cliente: mergedCliente })
              .eq("id", rc.id);
          }
        }
        console.log(`[PATCH /api/cases/[id]/cliente] Propagado a ${relatedCases.length} casos relacionados (tel: ${clienteTel})`);
      }
    }

    return NextResponse.json({ ok: true, cliente: updatedCliente });
  } catch (e: any) {
    console.error("[PATCH /api/cases/[id]/cliente] Exception:", e.message);
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
