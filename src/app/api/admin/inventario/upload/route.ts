import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";
import { NextRequest, NextResponse } from "next/server";
import * as XLSX from "xlsx";
import { inferBrand, inferCategory } from "@/lib/inventory-classifier";
import { cacheDelete } from "@/lib/supabase/cache";
import crypto from "crypto";

export async function POST(req: NextRequest) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  
  // Verificar rol admin/superadmin
  const { data: agent } = await supabase
    .from("sek_agent_config")
    .select("rol")
    .ilike("email", user.email!)
    .single();
    
  if (!agent || !["admin", "superadmin"].includes(agent.rol)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  try {
    const formData = await req.formData();
    const file = formData.get("file") as File;
    
    if (!file) {
      return NextResponse.json({ error: "No file provided" }, { status: 400 });
    }

    // Leer archivo Excel
    const bytes = await file.arrayBuffer();
    const workbook = XLSX.read(bytes, { type: "array" });
    const sheetName = workbook.SheetNames[0];
    const worksheet = workbook.Sheets[sheetName];
    const data = XLSX.utils.sheet_to_json(worksheet, { header: 1 }) as any[][];

    if (data.length < 2) {
      return NextResponse.json({ error: "Excel vacío o sin datos" }, { status: 400 });
    }

    // Detectar columnas (filas: MARCA, MODELO, DESCRIPCION / CATEGORÍA)
    const headers = data[0].map((h: string) => h?.toString().toUpperCase().trim());
    const marcaIdx = headers.findIndex((h: string) => h.includes("MARCA"));
    const modeloIdx = headers.findIndex((h: string) => h.includes("MODELO") || h.includes("CODIGO") || h.includes("CÓDIGO"));
    const descIdx = headers.findIndex((h: string) => h.includes("DESCRIP") || h.includes("NOMBRE") || h.includes("PRODUCTO") || h.includes("DETALLE"));
    const catIdx = headers.findIndex((h: string) => h.includes("CATEGOR"));

    const hasValidDescCol = descIdx !== -1 || catIdx !== -1;

    if (modeloIdx === -1 || !hasValidDescCol) {
      return NextResponse.json({ 
        error: `Columnas no encontradas. Headers detectados: ${headers.join(", ")}. Se esperan al menos: MODELO y DESCRIPCION` 
      }, { status: 400 });
    }

    // Procesar datos (omitir fila de headers)
    const items = [];
    const errors = [];
    const nowIso = new Date().toISOString();
    
    for (let i = 1; i < data.length; i++) {
      const row = data[i];
      if (!row || row.length === 0) continue;
      
      const marcaRaw = marcaIdx !== -1 ? (row[marcaIdx]?.toString().trim() || "") : "";
      const modelo = row[modeloIdx]?.toString().trim() || "";
      let nombre = descIdx !== -1 ? (row[descIdx]?.toString().trim() || "") : "";

      // Fallback inteligente: si la columna de descripción está vacía pero en CATEGORÍA vino el texto del producto
      if (!nombre && catIdx !== -1 && row[catIdx]) {
        nombre = row[catIdx]?.toString().trim() || "";
      }

      if (!modelo && !nombre) continue; // Saltar filas completamente vacías

      const marca = inferBrand(marcaRaw, modelo, nombre);
      const categoria = inferCategory(marca, modelo, nombre);

      if (!nombre) {
        errors.push(`Fila ${i + 1}: sin descripción`);
        continue;
      }

      items.push({
        id: crypto.randomUUID(),
        marca: marca || "GENÉRICO",
        modelo: modelo || null,
        nombre: nombre || modelo,
        codigo: modelo || null,
        cantidad: 1,
        categoria: categoria,
        ubicacion: null,
        notas: null,
        date: nowIso
      });
    }

    if (items.length === 0) {
      return NextResponse.json({ error: "No se encontraron items válidos para importar" }, { status: 400 });
    }

    // Usar cliente de servicio para omitir restricciones RLS en la carga masiva del catálogo
    const serviceDb = createServiceClient();

    // Limpiar inventario anterior
    const { error: deleteError } = await serviceDb
      .from("sek_inventario")
      .delete()
      .neq("id", "00000000-0000-0000-0000-000000000000");

    if (deleteError) {
      return NextResponse.json({ error: `Error al limpiar inventario: ${deleteError.message}` }, { status: 500 });
    }

    // Insertar en batches de 500
    const batchSize = 500;
    let inserted = 0;
    
    for (let i = 0; i < items.length; i += batchSize) {
      const batch = items.slice(i, i + batchSize);
      const { data: insertedData, error: insertError } = await serviceDb
        .from("sek_inventario")
        .insert(batch)
        .select("id");

      if (insertError) {
        errors.push(`Batch ${Math.floor(i / batchSize) + 1}: ${insertError.message}`);
      } else {
        inserted += insertedData?.length || 0;
      }
    }

    // Invalidar caché en memoria del servidor
    cacheDelete("admin_inventario_items_full_v2");
    cacheDelete("admin_inventario_items_full");

    return NextResponse.json({ 
      success: true, 
      message: `${inserted} items cargados con éxito. ${errors.length > 0 ? errors.length + " errores." : ""}`,
      insertedCount: inserted,
      errors: errors.length > 0 ? errors : undefined
    });

  } catch (error: any) {
    return NextResponse.json({ error: error.message || "Error procesando Excel" }, { status: 500 });
  }
}
