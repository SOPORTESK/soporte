import { NextRequest, NextResponse } from "next/server";
import { inspectHikvisionConfigFile, inspectHikvisionSADPXml } from "@/lib/hikvision-config-parser";

export async function POST(req: NextRequest) {
  try {
    const contentType = req.headers.get("content-type") || "";

    let fileBuffer: Buffer | null = null;
    let fileName = "archivo";

    if (contentType.includes("multipart/form-data")) {
      const formData = await req.formData();
      const file = formData.get("file") as File | null;
      if (!file) {
        return NextResponse.json({ error: "No se proporcionó ningún archivo" }, { status: 400 });
      }
      fileName = file.name;
      const arrayBuffer = await file.arrayBuffer();
      fileBuffer = Buffer.from(arrayBuffer);
    } else if (contentType.includes("application/json")) {
      const body = await req.json();
      const { fileUrl, name } = body;
      if (name) fileName = name;

      if (!fileUrl) {
        return NextResponse.json({ error: "fileUrl es requerido" }, { status: 400 });
      }

      // Descargar desde URL de Supabase / almacenamiento
      const res = await fetch(fileUrl);
      if (!res.ok) {
        return NextResponse.json({ error: `No se pudo descargar el archivo (${res.status})` }, { status: 400 });
      }
      const arrayBuffer = await res.arrayBuffer();
      fileBuffer = Buffer.from(arrayBuffer);
    } else {
      return NextResponse.json({ error: "Tipo de contenido no soportado" }, { status: 400 });
    }

    if (!fileBuffer || fileBuffer.length === 0) {
      return NextResponse.json({ error: "El archivo está vacío" }, { status: 400 });
    }

    // Inspeccionar
    const result = inspectHikvisionConfigFile(fileBuffer, fileName);
    return NextResponse.json({ success: true, result });
  } catch (error: any) {
    console.error("[hikvision-inspect API] Error:", error);
    return NextResponse.json({ error: error.message || "Error al procesar archivo" }, { status: 500 });
  }
}
