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

    // Función auxiliar para calcular consecutivo fresco igual que el titular
    const fetchNextConsecutive = async (): Promise<number> => {
      const { data: recentRows } = await client
        .from("garantias")
        .select("boleta, numero_consecutivo")
        .order("fecha_creacion", { ascending: false })
        .limit(120);

      let maxNum = 29178;
      if (recentRows && recentRows.length > 0) {
        const modern = recentRows.filter(r => /^(GNC|TNC|G|T|NC)/i.test(String(r.boleta || "").trim()));
        const nums = modern.map(r => {
          const match = String(r.boleta || "").match(/(\d+)$/);
          return match ? parseInt(match[1], 10) : 0;
        }).filter(n => n > 0 && n < 200000);

        if (nums.length > 0) {
          maxNum = Math.max(...nums);
        }
      }
      return maxNum + 1;
    };

    // Función auxiliar para prefijo de boleta idéntico al titular
    const buildBoletaString = (tipo: string, categoria: string, num: number) => {
      let p = tipo === "salida_definitiva" ? "G" : tipo === "salida_temporal" ? "T" : "";
      const cat = String(categoria || "").toLowerCase();
      const esNC = cat.includes("nota_credito");
      if (esNC) p = p ? p + "NC" : "NC";
      return p ? `${p}${num}` : String(num);
    };

    let attempts = 0;
    const maxAttempts = 4;
    let lastError: any = null;
    let savedRecord: any = null;

    while (attempts < maxAttempts && !savedRecord) {
      attempts++;
      const nextNum = payload.numero_consecutivo || (await fetchNextConsecutive());
      const boletaStr = payload.boleta || buildBoletaString(payload.tipo || "", payload.categoria || "", nextNum);

      const recordToInsert = {
        ...payload,
        numero_consecutivo: nextNum,
        boleta: boletaStr,
        fecha_creacion: payload.fecha_creacion || new Date().toISOString(),
        registrado_por: payload.registrado_por || nombreCompleto,
      };

      const { data, error } = await client
        .from("garantias")
        .insert(recordToInsert)
        .select()
        .single();

      if (!error && data) {
        savedRecord = data;
        break;
      }

      // Si es error de colisión de clave única (23505 duplicate key), reintentar recalculando consecutivo
      if (error && (error.code === "23505" || /duplicate key|unique constraint|numero_consecutivo/i.test(error.message || ""))) {
        console.warn(`[garantias POST] Colisión detectada en consecutivo ${nextNum}. Reintentando (${attempts}/${maxAttempts})...`);
        payload.numero_consecutivo = null;
        payload.boleta = null;
        await new Promise(res => setTimeout(res, 60 * attempts));
        lastError = error;
        continue;
      }

      // Cualquier otro error
      lastError = error;
      break;
    }

    if (!savedRecord) {
      return NextResponse.json({ error: lastError?.message || "Error al insertar registro" }, { status: 500 });
    }

    return NextResponse.json({ ok: true, record: savedRecord });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || "Error al crear registro" }, { status: 500 });
  }
}
