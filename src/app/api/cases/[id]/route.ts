import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/service";

function isBoilerplateNote(text?: string | null): boolean {
  if (!text || typeof text !== "string") return true;
  const t = text.trim();
  if (t.length < 18) return true;
  const l = t.toLowerCase();
  return (
    l.includes("bienvenido al soporte") ||
    l.includes("gracias por contactarnos") ||
    l.includes("para el registro, por favor") ||
    l.includes("ha sido un placer atenderle") ||
    l.includes("cerramos la conversación") ||
    l.includes("quedamos a su disposición") ||
    l.includes("cualquier consulta quedamos atentos") ||
    l.includes("caso reasignado de") ||
    l.includes("inicio de conversación") ||
    l.includes("el cliente inicia la conversación") ||
    l.includes("no se detallan fallas") ||
    l.includes("cerrado por inactividad") ||
    l.includes("quedo a la espera") ||
    l.includes("queda a la espera")
  );
}

export async function GET(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const supabase = createServiceClient();
    const id = decodeURIComponent(params.id);

    // Soporte para previsualizar manuales de la base de conocimiento: /api/cases/manual?doc=...
    if (id === "manual") {
      const docName = req.nextUrl.searchParams.get("doc") || "";
      const { data: chunks, error: kbErr } = await supabase
        .from("sek_doc_chunks")
        .select("id, doc_name, content, chunk_index")
        .ilike("doc_name", `%${docName}%`)
        .order("chunk_index", { ascending: true })
        .limit(8);
      if (kbErr) {
        return NextResponse.json({ error: kbErr.message }, { status: 500 });
      }
      return NextResponse.json({
        ok: true,
        chunks: (chunks || []).map((c: any) => ({ id: c.id, content: c.content })),
        manual: {
          doc_name: chunks?.[0]?.doc_name || docName,
          chunks: (chunks || []).map((c: any) => c.content),
        },
      });
    }

    let query = supabase
      .from("sek_cases")
      .select("id, title, marca, modelo, problema, resolucion, histtecnico, histcliente, cliente, assigned_to, estado, closed_at, created_at");

    if (id.length < 36) {
      query = query.ilike("id", `${id}%`).limit(1);
    } else {
      query = query.eq("id", id).limit(1);
    }

    const { data, error } = await query.maybeSingle();
    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }
    if (!data) {
      return NextResponse.json({ error: "Caso no encontrado" }, { status: 404 });
    }

    const tecNotes = Array.isArray(data.histtecnico)
      ? data.histtecnico.filter(
          (n: any) =>
            n.content &&
            typeof n.content === "string" &&
            n.role !== "ia" &&
            !isBoilerplateNote(n.content)
        )
      : [];

    const cliNotes = Array.isArray(data.histcliente)
      ? data.histcliente.filter(
          (n: any) => n.content && typeof n.content === "string" && n.content.trim().length > 10
        )
      : [];

    let cleanResolucion = !isBoilerplateNote(data.resolucion) ? String(data.resolucion).trim() : "";
    if (!cleanResolucion && tecNotes.length > 0) {
      cleanResolucion = tecNotes.map((n: any) => n.content.trim()).join("\n\n");
    }

    let cleanTitle = data.title || "";
    if (!cleanTitle || cleanTitle.startsWith("WhatsApp —") || cleanTitle.toLowerCase() === "consulta") {
      const desc = data.cliente?.descripcion && !isBoilerplateNote(data.cliente.descripcion)
        ? String(data.cliente.descripcion).trim()
        : "";
      const firstCli = cliNotes[0]?.content ? String(cliNotes[0].content).trim().substring(0, 120) : "";
      cleanTitle = desc || firstCli || data.problema || cleanTitle || "Caso técnico resuelto";
    }

    return NextResponse.json({
      ok: true,
      case: {
        ...data,
        title: cleanTitle,
        resolucion: cleanResolucion || data.resolucion || "Resuelto en asistencia técnica directa.",
        histtecnico: tecNotes.length > 0 ? tecNotes : (data.histtecnico || []),
      },
    });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}

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
      // Coincidencia exacta o con sufijo @s.whatsapp.net/@g.us.
      // NO usar ilike parcial: "63381153" coincidiría con "50663381153" y borraría ambos.
      query = query.or(`customer_phone.eq.${phone},customer_phone.eq.${phone}@s.whatsapp.net,customer_phone.eq.${phone}@g.us`);
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

export async function PATCH(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const supabase = createServiceClient();
    const id = params.id;
    const body = await req.json();

    let targetCaseId = id;
    const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id);

    if (!isUuid) {
      const cleanPhone = id.replace(/^tel:/i, "").replace(/^case:/i, "").replace(/[^0-9]/g, "");
      if (cleanPhone) {
        const { data: phoneCase } = await supabase
          .from("sek_cases")
          .select("id")
          .or(`customer_phone.eq.${cleanPhone},customer_phone.eq.${cleanPhone}@s.whatsapp.net,customer_phone.eq.${cleanPhone}@g.us,cliente->>telefono.eq.${cleanPhone}`)
          .order("last_message_at", { ascending: false })
          .limit(1)
          .maybeSingle();
        if (phoneCase?.id) {
          targetCaseId = phoneCase.id;
        }
      }
    }

    const { data, error } = await supabase
      .from("sek_cases")
      .update({
        ...body,
        updated_at: new Date().toISOString()
      })
      .eq("id", targetCaseId)
      .select()
      .maybeSingle();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ ok: true, data, id: targetCaseId });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
