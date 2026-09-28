import { NextRequest, NextResponse } from "next/server";
import { createGarantiasServiceClient } from "@/lib/supabase-garantias";
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
    const tipo = searchParams.get("tipo") || "salida_definitiva";
    const categoria = searchParams.get("categoria") || "";

    const client = createGarantiasServiceClient();

    const { data: recentRows, error } = await client
      .from("garantias")
      .select("boleta, numero_consecutivo")
      .order("fecha_creacion", { ascending: false })
      .limit(120);

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

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

    const nextConsecutive = maxNum + 1;

    // Calcular prefijo de boleta
    let p = tipo === "salida_definitiva" ? "G" : tipo === "salida_temporal" ? "T" : "";
    const esNC = String(categoria).toLowerCase().includes("nota_credito");
    if (esNC) p = p ? p + "NC" : "NC";
    const boletaPreview = p ? `${p}${nextConsecutive}` : String(nextConsecutive);

    return NextResponse.json({
      nextConsecutive,
      boletaPreview,
      prefix: p,
    });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || "Error al calcular consecutivo" }, { status: 500 });
  }
}
