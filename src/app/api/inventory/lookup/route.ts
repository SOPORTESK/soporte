import { NextRequest, NextResponse } from "next/server";
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
    const mode = searchParams.get("mode") || "search";
    const q = searchParams.get("q")?.trim() || "";
    const marcaFilter = searchParams.get("marca")?.trim() || "";

    if (mode === "brands") {
      // Obtener todas las marcas únicas del inventario
      const { data, error } = await supabase
        .from("sek_inventario")
        .select("marca")
        .limit(4000);

      if (error) {
        return NextResponse.json({ error: error.message }, { status: 500 });
      }

      const brandSet = new Set<string>();
      for (const row of data || []) {
        const b = (row.marca || "").trim();
        if (b && b.toUpperCase() !== "GENÉRICO" && b.toUpperCase() !== "GENERICO") {
          brandSet.add(b.toUpperCase());
        }
      }
      // Añadir marcas frecuentes por si acaso y GENÉRICO al final
      const sortedBrands = Array.from(brandSet).sort((a, b) => a.localeCompare(b));
      sortedBrands.push("GENÉRICO");

      return NextResponse.json({ brands: sortedBrands });
    }

    // Modo búsqueda de modelos / artículos
    let query = supabase
      .from("sek_inventario")
      .select("id, codigo, modelo, marca, nombre, categoria");

    if (marcaFilter && marcaFilter.toUpperCase() !== "GENÉRICO") {
      query = query.ilike("marca", `%${marcaFilter}%`);
    }

    if (q) {
      // Limpiar caracteres especiales que rompen ilike/or
      const cleanQ = q.replace(/[,()]/g, " ").trim();
      if (cleanQ) {
        query = query.or(
          `modelo.ilike.%${cleanQ}%,codigo.ilike.%${cleanQ}%,nombre.ilike.%${cleanQ}%,marca.ilike.%${cleanQ}%`
        );
      }
    }

    const { data, error } = await query
      .order("modelo", { ascending: true })
      .limit(30);

    if (error) {
      console.error("[inventory/lookup] Error:", error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    const items = (data || []).map((row: any) => ({
      id: row.id,
      modelo: row.modelo || row.codigo || "",
      codigo: row.codigo || "",
      marca: row.marca || "",
      descripcion: row.nombre || "",
      categoria: row.categoria || "",
    }));

    return NextResponse.json({ items });
  } catch (err: any) {
    console.error("[inventory/lookup] Unexpected:", err);
    return NextResponse.json({ error: err?.message || "Error al consultar inventario" }, { status: 500 });
  }
}
