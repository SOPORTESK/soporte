import { NextRequest, NextResponse } from "next/server";
import { createGarantiasServiceClient, GarantiaRecord } from "@/lib/supabase-garantias";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  try {
    const supabase = createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: "No autenticado" }, { status: 401 });
    }

    const { searchParams } = new URL(req.url);
    const tipo = searchParams.get("tipo"); // "def", "temp", "all"
    const tab = searchParams.get("tab"); // "registros", "rma", "nc_audit", "kpi"
    const query = searchParams.get("q")?.trim() || "";
    const marca = searchParams.get("marca")?.trim() || "";
    const sede = searchParams.get("sede")?.trim() || "";
    const estatus = searchParams.get("estatus")?.trim() || "";
    const limit = parseInt(searchParams.get("limit") || "1000", 10);
    const offset = parseInt(searchParams.get("offset") || "0", 10);

    const client = createGarantiasServiceClient();

    let dbQuery = client
      .from("garantias")
      .select("*", { count: "exact" });

    // Filtrado por tipo de salida
    if (tipo === "def") {
      dbQuery = dbQuery.eq("tipo", "salida_definitiva");
    } else if (tipo === "temp") {
      dbQuery = dbQuery.eq("tipo", "salida_temporal");
    }

    // Filtrado por sede
    if (sede) {
      dbQuery = dbQuery.ilike("sede", `%${sede}%`);
    }

    // Filtrado por marca
    if (marca) {
      dbQuery = dbQuery.ilike("marca", `%${marca}%`);
    }

    // Filtrado por estatus
    if (estatus) {
      dbQuery = dbQuery.eq("estatus", estatus);
    }

    // Búsqueda por texto (boleta, cliente, ticket, serie, articulo, falla)
    if (query) {
      dbQuery = dbQuery.or(
        `boleta.ilike.%${query}%,nombre.ilike.%${query}%,ticket.ilike.%${query}%,numero_serie.ilike.%${query}%,serie.ilike.%${query}%,marca.ilike.%${query}%,ticket_rma.ilike.%${query}%`
      );
    }

    dbQuery = dbQuery
      .order("fecha_creacion", { ascending: false })
      .range(offset, offset + limit - 1);

    const { data, count, error } = await dbQuery;

    if (error) {
      console.error("[garantias API] Error fetching records:", error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({
      records: (data || []) as GarantiaRecord[],
      total: count || 0,
      limit,
      offset
    });
  } catch (e: any) {
    console.error("[garantias API] Unexpected error:", e);
    return NextResponse.json({ error: e?.message || "Error interno" }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const supabase = createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: "No autenticado" }, { status: 401 });
    }

    const payload = await req.json();
    const client = createGarantiasServiceClient();

    // Obtener información del usuario en Sekunet
    const { data: agent } = await supabase
      .from("sek_agent_config")
      .select("nombre, apellido")
      .eq("email", user.email)
      .maybeSingle();

    const nombreCompleto = agent ? [agent.nombre, agent.apellido].filter(Boolean).join(" ") : user.email?.split("@")[0] || "Técnico";

    // Si no trae consecutivo, calcular el max + 1
    if (!payload.numero_consecutivo) {
      const { data: maxRows } = await client
        .from("garantias")
        .select("numero_consecutivo, boleta")
        .order("numero_consecutivo", { ascending: false })
        .limit(10);

      let maxNum = 29178;
      if (maxRows && maxRows.length > 0) {
        for (const r of maxRows) {
          const match = String(r.boleta || "").match(/(\d+)$/);
          const n = match ? parseInt(match[1], 10) : Number(r.numero_consecutivo) || 0;
          if (n > maxNum && n < 200000) maxNum = n;
        }
      }
      payload.numero_consecutivo = maxNum + 1;
    }

    // Prefijo boleta
    if (!payload.boleta) {
      const prefix = payload.tipo === "salida_definitiva" ? "G" : "T";
      const cat = String(payload.categoria || "").toLowerCase();
      const subPrefix = cat.includes("nota_credito") ? "NC" : "";
      payload.boleta = `${prefix}${subPrefix}${payload.numero_consecutivo}`;
    }

    payload.fecha_creacion = new Date().toISOString();
    payload.registrado_por = payload.registrado_por || nombreCompleto;

    const { data: newRecord, error } = await client
      .from("garantias")
      .insert(payload)
      .select()
      .single();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ ok: true, record: newRecord });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || "Error al crear registro" }, { status: 500 });
  }
}
