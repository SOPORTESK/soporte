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
    const q = searchParams.get("q")?.trim() || "";

    if (!q || q.length < 2) {
      return NextResponse.json({ items: [] });
    }

    const client = createGarantiasServiceClient();

    // Buscar en inventario por articulo, marca o descripcion
    const { data, error } = await client
      .from("inventario")
      .select("id, articulo, marca, descripcion, bodega, disponible")
      .or(`articulo.ilike.%${q}%,marca.ilike.%${q}%,descripcion.ilike.%${q}%`)
      .limit(15);

    if (error) {
      console.error("[garantias/inventario] Error al buscar:", error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ items: data || [] });
  } catch (e: any) {
    console.error("[garantias/inventario] Unexpected:", e);
    return NextResponse.json({ error: e?.message || "Error al buscar inventario" }, { status: 500 });
  }
}
