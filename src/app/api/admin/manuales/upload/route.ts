import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createWorker } from "tesseract.js";

// Helper para dividir texto en chunks
function chunkText(text: string, maxLen = 1000): string[] {
  const words = text.split(/\s+/);
  const chunks: string[] = [];
  let currentChunk = "";

  for (const word of words) {
    if ((currentChunk + " " + word).length > maxLen) {
      if (currentChunk) chunks.push(currentChunk.trim());
      currentChunk = word;
    } else {
      currentChunk += (currentChunk ? " " : "") + word;
    }
  }
  if (currentChunk) chunks.push(currentChunk.trim());
  return chunks;
}

export async function POST(req: NextRequest) {
  try {
    const supabase = createClient();
    
    // Verificar sesión/admin (omito validación estricta para el ejemplo, pero idealmente va aquí)

    const formData = await req.formData();
    const files = formData.getAll("files") as File[];

    if (!files || files.length === 0) {
      return NextResponse.json({ error: "No files uploaded" }, { status: 400 });
    }

    const MAX_FILE_SIZE = 10 * 1024 * 1024;
    for (const file of files) {
      if (file.size > MAX_FILE_SIZE) {
        return NextResponse.json({ error: `Archivo "${file.name}" excede el límite de 10MB` }, { status: 400 });
      }
    }

    const processedDocs = [];
    const errors = [];

    for (const file of files) {
      const buffer = Buffer.from(await file.arrayBuffer());
      let textContent = "";

      // 1. Procesamiento según tipo de archivo
      const name = file.name.toLowerCase();
      if (name.endsWith(".pdf")) {
        // PDF (pdf-parse v1 — dynamic import to avoid webpack issues)
        const pdf = (await import("pdf-parse/lib/pdf-parse.js")).default;
        const data = await pdf(buffer);
        textContent = data.text || "";
      } else if (file.type.startsWith("image/")) {
        // Imágenes (OCR local con Tesseract)
        const worker = await createWorker('spa');
        const { data: { text } } = await worker.recognize(buffer);
        textContent = text;
        await worker.terminate();
      } else if (name.endsWith(".docx") || name.endsWith(".doc")) {
        // Word (.docx) con mammoth
        const mammoth = (await import("mammoth")).default;
        const result = await mammoth.extractRawText({ buffer });
        textContent = result.value || "";
      } else if (
        file.type.includes("text") ||
        name.endsWith(".csv") ||
        name.endsWith(".md") ||
        name.endsWith(".txt") ||
        name.endsWith(".json") ||
        name.endsWith(".xml") ||
        name.endsWith(".html") ||
        name.endsWith(".htm") ||
        name.endsWith(".rtf")
      ) {
        // Texto plano
        textContent = buffer.toString("utf-8");
      } else if (file.type.startsWith("video/") || file.type.startsWith("audio/")) {
        errors.push({ file: file.name, error: "Transcripción de audio/video no soportada" });
        continue;
      } else {
        console.log(`Formato no soportado: ${file.name}`);
        errors.push({ file: file.name, error: "Formato no soportado" });
        continue;
      }

      if (!textContent.trim()) {
        textContent = "[Sin contenido de texto extraíble]";
      }

      // 2. Guardar el documento principal
      const { data: docRecord, error: docError } = await supabase
        .from("sek_docs")
        .insert({
          id: crypto.randomUUID(),
          name: file.name,
          content: textContent.substring(0, 5000),
          size: file.size,
          date: new Date().toISOString()
        })
        .select("id")
        .single();

      if (docError) {
        console.error("[manuales/upload] Error saving doc:", docError.message, docError.code);
        errors.push({ file: file.name, error: `doc: ${docError.message}` });
        continue;
      }

      // 3. Crear Chunks para RAG
      const chunks = chunkText(textContent, 1000);
      
      const chunkRecords = chunks.map(chunk => ({
        doc_id: docRecord.id,
        doc_name: file.name,
        content: chunk,
      }));

      let chunkCount = 0;
      if (chunkRecords.length > 0) {
        const { error: chunkError } = await supabase
          .from("sek_doc_chunks")
          .insert(chunkRecords);
          
        if (chunkError) {
          console.error("[manuales/upload] Error saving chunks:", chunkError.message, chunkError.code);
          errors.push({ file: file.name, error: `chunks: ${chunkError.message}` });
        } else {
          chunkCount = chunkRecords.length;
        }
      }

      processedDocs.push({ name: file.name, chunks: chunkCount });
    }

    return NextResponse.json({ 
      success: true, 
      processed: processedDocs.length,
      files: processedDocs,
      skipped: files.length - processedDocs.length,
      errors,
    });

  } catch (error: any) {
    console.error("Upload error:", error);
    return NextResponse.json({ error: error.message || "Internal server error" }, { status: 500 });
  }
}
