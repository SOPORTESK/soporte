import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/service";

function isBoilerplateOrFileNote(text?: string | null): boolean {
  if (!text || typeof text !== "string") return true;
  const t = text.trim();
  if (t.length < 18) return true;
  const l = t.toLowerCase();
  if (/^(nota-voz-[\w.-]+|image\.\w+|[\w-]+\.(webm|ogg|mp3|wav|jpg|jpeg|png|gif|pdf|zip|rar))$/i.test(t)) {
    return true;
  }
  return (
    l.includes("bienvenido al soporte") ||
    l.includes("gracias por contactarnos") ||
    l.includes("para el registro, por favor") ||
    l.includes("marca y modelo del equipo a consultar") ||
    l.includes("nombre del vendedor encargado") ||
    l.includes("ha sido un placer atenderle") ||
    l.includes("cerramos la conversación") ||
    l.includes("procederemos a cerrar esta conversación") ||
    l.includes("al no haber recibido respuesta") ||
    l.includes("quedamos a su disposición") ||
    l.includes("cualquier consulta quedamos atentos") ||
    l.includes("caso reasignado de") ||
    l.includes("inicio de conversación") ||
    l.includes("el cliente inicia la conversación") ||
    l.includes("no se detallan fallas") ||
    l.includes("cerrado por inactividad") ||
    l.includes("quedo a la espera") ||
    l.includes("queda a la espera") ||
    l.includes("algo mas en lo que te pueda ayudar") ||
    l.includes("algo más en lo que le pueda ayudar") ||
    l.includes("podría brindarnos más detalles sobre su consulta")
  );
}

function isClientQuestionSummary(text?: string | null): boolean {
  if (!text || typeof text !== "string") return true;
  const t = text.trim();
  if (/soluci[oó]n:|se recomienda|se indic[oó]|se brind[oó]|se realiz[oó]|debe reemplazar|bajar la resoluci[oó]n/i.test(t)) {
    return false;
  }
  return /^(el cliente consulta|cliente consulta|el cliente solicita|cliente solicita|consulta sobre|solicitud de|inicio de conversaci[oó]n)/i.test(
    t
  );
}

function isGenericCaseTitle(title?: string | null): boolean {
  if (!title || typeof title !== "string") return true;
  const t = title.trim();
  if (t.length < 8) return true;
  return /^(whatsapp|configuraciones|configuraci[oó]n|consulta|soporte|firmware|reparaci[oó]n\s*\/?\s*diagn[oó]stico|garant[ií]a|reset|aver[ií]a|sin asunto)(\s*[—–-].*)?$/i.test(
    t
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

    // Filtrar mensajes técnicos reales (excluyendo saludos, cierres y nombres de archivo sueltos)
    const tecNotes = Array.isArray(data.histtecnico)
      ? data.histtecnico.filter(
          (n: any) =>
            n.content &&
            typeof n.content === "string" &&
            n.role !== "ia" &&
            n.role !== "nota" &&
            !isBoilerplateOrFileNote(n.content)
        )
      : [];

    // Mensajes técnicos resolutivos (que no son simples preguntas cortas al cliente)
    const substantiveTecSolutions = tecNotes.filter((n: any) => {
      const c = String(n.content).trim();
      if (c.endsWith("?") && c.length < 95) return false;
      return c.length >= 25;
    });

    const cliNotes = Array.isArray(data.histcliente)
      ? data.histcliente.filter(
          (n: any) =>
            n.content &&
            typeof n.content === "string" &&
            n.content.trim().length > 12 &&
            !isBoilerplateOrFileNote(n.content)
        )
      : [];

    const rawRes = String(data.resolucion || "").trim();
    const clienteDesc = data.cliente?.descripcion ? String(data.cliente.descripcion).trim() : "";

    let cleanResolucion = "";
    if (rawRes && !isBoilerplateOrFileNote(rawRes) && !isClientQuestionSummary(rawRes)) {
      cleanResolucion = rawRes;
      if (substantiveTecSolutions.length > 0 && rawRes.length < 140) {
        const extraTec = substantiveTecSolutions.map((n: any) => String(n.content).trim()).join("\n\n");
        if (!extraTec.includes(rawRes)) {
          cleanResolucion = `${rawRes}\n\n${extraTec}`;
        }
      }
    } else if (substantiveTecSolutions.length > 0) {
      cleanResolucion = substantiveTecSolutions.map((n: any) => String(n.content).trim()).join("\n\n");
    } else if (rawRes && !isBoilerplateOrFileNote(rawRes)) {
      cleanResolucion = rawRes;
    }

    let cleanTitle = String(data.title || "").trim();
    if (isGenericCaseTitle(cleanTitle)) {
      const desc = clienteDesc && !isBoilerplateOrFileNote(clienteDesc) ? clienteDesc : "";
      const resAsSummary = isClientQuestionSummary(rawRes) && !isBoilerplateOrFileNote(rawRes) ? rawRes : "";
      const firstCli = cliNotes[0]?.content ? String(cliNotes[0].content).trim().substring(0, 140) : "";
      cleanTitle = desc || resAsSummary || firstCli || cleanTitle || "Caso técnico resuelto";
    }

    return NextResponse.json({
      ok: true,
      case: {
        ...data,
        title: cleanTitle,
        resolucion: cleanResolucion || "Resuelto en asistencia técnica directa.",
        histtecnico: substantiveTecSolutions.length > 0 ? substantiveTecSolutions : tecNotes,
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

  const isGroupId = id.includes(":") || isNaN(Number(id));

  if (isGroupId) {
    let query = supabase.from("sek_cases").select("id");

    if (id.startsWith("tel:")) {
      const phone = id.substring(4);
      query = query.or(`customer_phone.eq.${phone},customer_phone.eq.${phone}@s.whatsapp.net,customer_phone.eq.${phone}@g.us`);
    } else if (id.startsWith("mail:")) {
      const email = id.substring(5);
      query = query.ilike("cliente->>correo", email);
    } else if (id.startsWith("nom:")) {
      const parts = id.split(":");
      const name = parts[parts.length - 1];
      query = query.ilike("cliente->>nombre", name);
    } else if (id.startsWith("cuenta:")) {
      const cuenta = id.substring(7);
      query = query.or(`cliente->>cuenta.ilike.${cuenta},cliente->>empresa.ilike.${cuenta}`);
    } else if (id.startsWith("case:")) {
      const caseId = id.substring(5);
      query = query.eq("id", caseId);
    } else {
      query = query.eq("id", id);
    }

    const { data: cases, error: fetchError } = await query.limit(100);

    if (fetchError) {
      return NextResponse.json({ ok: false, error: fetchError.message }, { status: 500 });
    }

    if (cases && cases.length > 0) {
      const ids = cases.map((c) => c.id);
      const { error: deleteError } = await supabase.from("sek_cases").delete().in("id", ids);
      if (deleteError) {
        return NextResponse.json({ ok: false, error: deleteError.message }, { status: 500 });
      }
      return NextResponse.json({ ok: true, deleted: cases.length });
    } else {
      const { error: directDeleteError } = await supabase.from("sek_cases").delete().eq("id", id);
      if (directDeleteError) {
        return NextResponse.json({ ok: false, error: "No se encontraron casos y falló eliminación directa" }, { status: 404 });
      }
      return NextResponse.json({ ok: true, deleted: 1 });
    }
  } else {
    const { error } = await supabase.from("sek_cases").delete().eq("id", id);
    if (error) {
      return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
    }
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
        updated_at: new Date().toISOString(),
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
