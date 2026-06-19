import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/service";

export async function DELETE(
  _req: NextRequest,
  { params }: { params: { id: string } }
) {
  const supabase = createServiceClient();
  const id = params.id;

  console.log("[DELETE /api/cases/[id]] Iniciando eliminación", { id });

  // Verificar si es un ID de grupo (contiene prefijos como tel:, mail:, nom: o case:) o un ID numérico
  const isGroupId = id.includes(":") || isNaN(Number(id));

  console.log("[DELETE /api/cases/[id]] isGroupId:", isGroupId);

  if (isGroupId) {
    let query = supabase.from("sek_cases").select("id");

    if (id.startsWith("tel:")) {
      const phone = id.substring(4);
      console.log("[DELETE /api/cases/[id]] Buscando casos con teléfono:", phone);
      // Soportar coincidencia exacta de número, o con sufijo @s.whatsapp.net o @g.us, o ilike parcial
      query = query.or(`customer_phone.eq.${phone},customer_phone.eq.${phone}@s.whatsapp.net,customer_phone.ilike.%${phone}%`);
    } else if (id.startsWith("mail:")) {
      const email = id.substring(5);
      console.log("[DELETE /api/cases/[id]] Buscando casos con email:", email);
      query = query.ilike("cliente->>correo", email);
    } else if (id.startsWith("nom:")) {
      // nom:canal:nombre
      const parts = id.split(":");
      const name = parts[parts.length - 1];
      console.log("[DELETE /api/cases/[id]] Buscando casos con nombre de cliente:", name);
      query = query.ilike("cliente->>nombre", name);
    } else if (id.startsWith("cuenta:")) {
      const cuenta = id.substring(7);
      console.log("[DELETE /api/cases/[id]] Buscando casos con cuenta B2B:", cuenta);
      query = query.or(`cliente->>cuenta.ilike.${cuenta},cliente->>empresa.ilike.${cuenta}`);
    } else if (id.startsWith("case:")) {
      const caseId = id.substring(5);
      console.log("[DELETE /api/cases/[id]] Buscando caso individual por clave:", caseId);
      query = query.eq("id", caseId);
    } else {
      // Búsqueda genérica por si acaso
      console.log("[DELETE /api/cases/[id]] Búsqueda genérica por id original:", id);
      query = query.eq("id", id);
    }

    const { data: cases, error: fetchError } = await query.limit(100);

    if (fetchError) {
      console.error("[DELETE /api/cases/[id]] Error al buscar casos:", fetchError);
      return NextResponse.json({ ok: false, error: fetchError.message }, { status: 500 });
    }

    console.log("[DELETE /api/cases/[id]] Casos encontrados:", cases?.length || 0);

    if (cases && cases.length > 0) {
      const ids = cases.map(c => c.id);
      console.log("[DELETE /api/cases/[id]] IDs a eliminar:", ids);
      
      const { error: deleteError } = await supabase
        .from("sek_cases")
        .delete()
        .in("id", ids);

      if (deleteError) {
        console.error("[DELETE /api/cases/[id]] Error al eliminar:", deleteError);
        return NextResponse.json({ ok: false, error: deleteError.message }, { status: 500 });
      }
      
      console.log("[DELETE /api/cases/[id]] Eliminación de grupo exitosa");
      return NextResponse.json({ ok: true, deleted: cases.length });
    } else {
      console.log("[DELETE /api/cases/[id]] No se encontraron casos para eliminar con esa clave de grupo");
      // Intentar una eliminación directa por si el id era directamente el ID del caso
      const { error: directDeleteError } = await supabase.from("sek_cases").delete().eq("id", id);
      if (directDeleteError) {
        return NextResponse.json({ ok: false, error: "No se encontraron casos y falló eliminación directa" }, { status: 404 });
      }
      return NextResponse.json({ ok: true, deleted: 1 });
    }
  } else {
    // Es un ID numérico individual
    console.log("[DELETE /api/cases/[id]] Eliminando caso individual con ID:", id);
    
    const { error } = await supabase.from("sek_cases").delete().eq("id", id);
    if (error) {
      console.error("[DELETE /api/cases/[id]] Error al eliminar caso individual:", error);
      return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
    }
    
    console.log("[DELETE /api/cases/[id]] Eliminación individual exitosa");
    return NextResponse.json({ ok: true });
  }
}
