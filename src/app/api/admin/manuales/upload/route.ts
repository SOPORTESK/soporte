import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
const pdf = require("pdf-parse");
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

    const processedDocs = [];

    for (const file of files) {
      const buffer = Buffer.from(await file.arrayBuffer());
      let textContent = "";

      // 1. Procesamiento según tipo de archivo
      if (file.name.toLowerCase().endsWith(".pdf")) {
        // PDF
        const data = await pdf(buffer);
        textContent = data.text;
      } else if (file.type.startsWith("image/")) {
        // Imágenes (OCR local con Tesseract)
        const worker = await createWorker('spa');
        const { data: { text } } = await worker.recognize(buffer);
        textContent = text;
        await worker.terminate();
      } else if (file.type.includes("text") || file.name.endsWith(".csv")) {
        // Texto plano
        textContent = buffer.toString("utf-8");
      } else if (file.type.startsWith("video/") || file.type.startsWith("audio/")) {
        // Multimedia: Transcripción con Whisper (Groq u OpenAI)
        const apiKey = process.env.GROQ_API_KEY || process.env.OPENAI_API_KEY;
        if (!apiKey) {
          throw new Error("Para procesar video/audio se requiere configurar GROQ_API_KEY u OPENAI_API_KEY en .env.local");
        }
        
        // Crear FormData para enviar a la API
        const audioFormData = new FormData();
        audioFormData.append("file", file);
        audioFormData.append("model", process.env.GROQ_API_KEY ? "whisper-large-v3" : "whisper-1");
        
        const apiUrl = process.env.GROQ_API_KEY 
          ? "https://api.groq.com/openai/v1/audio/transcriptions"
          : "https://api.openai.com/v1/audio/transcriptions";

        const res = await fetch(apiUrl, {
          method: "POST",
          headers: {
            "Authorization": `Bearer ${apiKey}`
          },
          body: audioFormData
        });

        if (!res.ok) {
          const errData = await res.text();
          throw new Error(`Error en API de transcripción: ${errData}`);
        }

        const data = await res.json();
        textContent = data.text;
      } else {
        console.log(`Formato no soportado para extracción profunda: ${file.name}`);
        textContent = `[Archivo multimedia/binario no soportado: ${file.name}]`;
      }

      if (!textContent.trim()) {
        textContent = "[Sin contenido de texto extraíble]";
      }

      // 2. Guardar el documento principal
      const { data: docRecord, error: docError } = await supabase
        .from("sek_docs")
        .insert({
          name: file.name,
          content: textContent.substring(0, 5000), // Guardar un preview del contenido original
          size: file.size,
          date: new Date().toISOString()
        })
        .select("id")
        .single();

      if (docError) {
        console.error("Error saving doc:", docError);
        continue;
      }

      // 3. Crear Chunks para RAG
      const chunks = chunkText(textContent, 1000);
      
      const chunkRecords = chunks.map(chunk => ({
        doc_id: docRecord.id,
        doc_name: file.name,
        content: chunk,
        source_label: "Documentación Oficial Sekunet",
        // embedding: [] // Aquí se conectaría la API de OpenAI (text-embedding-3-small) si se usara pgvector real
      }));

      if (chunkRecords.length > 0) {
        const { error: chunkError } = await supabase
          .from("sek_doc_chunks")
          .insert(chunkRecords);
          
        if (chunkError) {
          console.error("Error saving chunks:", chunkError);
        }
      }

      processedDocs.push(file.name);
    }

    return NextResponse.json({ 
      success: true, 
      processed: processedDocs.length,
      files: processedDocs
    });

  } catch (error: any) {
    console.error("Upload error:", error);
    return NextResponse.json({ error: error.message || "Internal server error" }, { status: 500 });
  }
}
