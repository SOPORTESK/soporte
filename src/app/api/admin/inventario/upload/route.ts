import { createClient } from "@/lib/supabase/server";
import { NextRequest, NextResponse } from "next/server";
import * as XLSX from "xlsx";

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

    // Detectar columnas (filas: MARCA, MODELO, DESCRIPCION)
    const headers = data[0].map((h: string) => h?.toString().toUpperCase().trim());
    const marcaIdx = headers.findIndex((h: string) => h.includes("MARCA"));
    const modeloIdx = headers.findIndex((h: string) => h.includes("MODELO"));
    const descIdx = headers.findIndex((h: string) => h.includes("DESCRIP") || h.includes("NOMBRE"));

    if (marcaIdx === -1 || modeloIdx === -1 || descIdx === -1) {
      return NextResponse.json({ 
        error: `Columnas no encontradas. Headers detectados: ${headers.join(", ")}. Se esperan: MARCA, MODELO, DESCRIPCION` 
      }, { status: 400 });
    }

    // Función para adivinar la marca si viene vacía
    const guessMarca = (marca: string | null, modelo: string | null, nombre: string | null) => {
      if (marca && marca.trim() !== "" && marca !== "—" && marca !== "-") return marca;
      const mod = (modelo || "").toUpperCase();
      const nom = (nombre || "").toUpperCase();
      
      if (mod.startsWith("HIK") || mod.startsWith("DS-") || nom.includes("HIKVISION")) return "HIKVISION";
      if (mod.startsWith("DH-") || mod.startsWith("HAC-") || mod.startsWith("IPC-") || nom.includes("DAHUA")) return "DAHUA";
      if (mod.startsWith("SAX") || nom.includes("SAXXON")) return "SAXXON";
      if (mod.startsWith("PRO") || nom.includes("PROVISION")) return "PROVISION";
      if (mod.startsWith("XMR") || nom.includes("EPCOM")) return "EPCOM";
      if (mod.startsWith("UBI") || nom.includes("UBIQUITI")) return "UBIQUITI";
      if (mod.startsWith("MI-") || nom.includes("XIAOMI")) return "XIAOMI";
      if (nom.includes("D-LINK") || mod.startsWith("DGS-")) return "D-LINK";
      if (nom.includes("TP-LINK") || mod.startsWith("TL-")) return "TP-LINK";
      if (nom.includes("WESTERN DIGITAL") || mod.startsWith("WD")) return "WESTERN DIGITAL";
      if (nom.includes("SEAGATE") || mod.startsWith("ST")) return "SEAGATE";
      if (nom.includes("KINGSTON")) return "KINGSTON";
      if (nom.includes("ADATA")) return "ADATA";
      if (nom.includes("ZKTECO") || mod.startsWith("ZK")) return "ZKTECO";
      if (mod.startsWith("EZV") || nom.includes("EZVIZ")) return "EZVIZ";
      if (mod.startsWith("IMOU") || nom.includes("IMOU")) return "IMOU";
      if (mod.startsWith("SYS") || nom.includes("SYCOM")) return "SYSCOM";
      if (mod.startsWith("LINK") || nom.includes("LINKSYS")) return "LINKSYS";
      
      return null;
    };

    // Procesar datos (omitir fila de headers)
    const items = [];
    const errors = [];
    
    for (let i = 1; i < data.length; i++) {
      const row = data[i];
      if (!row[marcaIdx] && !row[modeloIdx]) continue; // Saltar filas vacías

      let marca = row[marcaIdx]?.toString().trim() || "";
      const modelo = row[modeloIdx]?.toString().trim() || "";
      const nombre = row[descIdx]?.toString().trim() || "";

      marca = guessMarca(marca, modelo, nombre) || marca;

      if (!nombre) {
        errors.push(`Fila ${i + 1}: sin descripción`);
        continue;
      }

      items.push({
        marca: marca || null,
        modelo: modelo || null,
        nombre: nombre,
        codigo: modelo || null, // Usar modelo como código si no hay otro
        cantidad: 1,
        categoria: null,
        ubicacion: null,
        notas: null,
        date: new Date().toISOString().split("T")[0]
      });
    }

    if (items.length === 0) {
      return NextResponse.json({ error: "No se encontraron items válidos" }, { status: 400 });
    }

    // UPSERT: Eliminar inventario anterior y insertar nuevo
    // Opción A: Truncar tabla e insertar todo (sobrescribir completo)
    const { error: deleteError } = await supabase
      .from("sek_inventario")
      .delete()
      .neq("id", ""); // Eliminar todos

    if (deleteError) {
      return NextResponse.json({ error: `Error al limpiar inventario: ${deleteError.message}` }, { status: 500 });
    }

    // Insertar en batches de 500
    const batchSize = 500;
    let inserted = 0;
    
    for (let i = 0; i < items.length; i += batchSize) {
      const batch = items.slice(i, i + batchSize);
      const { data: insertedData, error: insertError } = await supabase
        .from("sek_inventario")
        .insert(batch)
        .select();

      if (insertError) {
        errors.push(`Batch ${i / batchSize + 1}: ${insertError.message}`);
      } else {
        inserted += insertedData?.length || 0;
      }
    }

    return NextResponse.json({ 
      success: true, 
      message: `${inserted} items cargados. ${errors.length > 0 ? errors.length + " errores." : ""}`,
      errors: errors.length > 0 ? errors : undefined
    });

  } catch (error: any) {
    return NextResponse.json({ error: error.message || "Error procesando Excel" }, { status: 500 });
  }
}
