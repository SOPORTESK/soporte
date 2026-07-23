import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createWorker } from "tesseract.js";

// ── Transcripción de audio con Groq Whisper ──
async function transcribeWithGroq(audioBuffer: Buffer, filename: string): Promise<string> {
  const GROQ_KEY = process.env.GROQ_API_KEY;
  if (!GROQ_KEY) throw new Error("GROQ_API_KEY no configurada en .env.local");

  const formData = new FormData();
  const blob = new Blob([audioBuffer], { type: "audio/mpeg" });
  formData.append("file", blob, filename);
  formData.append("model", "whisper-large-v3");
  formData.append("language", "es");
  formData.append("response_format", "text");

  const res = await fetch("https://api.groq.com/openai/v1/audio/transcriptions", {
    method: "POST",
    headers: { Authorization: `Bearer ${GROQ_KEY}` },
    body: formData,
  });

  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`Groq Whisper error ${res.status}: ${errText.substring(0, 200)}`);
  }

  return await res.text();
}

// ── Extraer audio de video con ffmpeg-static ──
async function extractAudioFromVideo(videoBuffer: Buffer): Promise<Buffer> {
  const ffmpegPath = (await import("ffmpeg-static")).default as string;
  const ffmpeg = (await import("fluent-ffmpeg")).default;

  return new Promise((resolve, reject) => {
    ffmpeg.setFfmpegPath(ffmpegPath);

    const chunks: Buffer[] = [];
    const stream = new (require("stream").Readable)();
    stream.push(videoBuffer);
    stream.push(null);

    ffmpeg(stream)
      .noVideo()
      .audioCodec("libmp3lame")
      .audioBitrate("128k")
      .format("mp3")
      .on("error", (err: Error) => reject(new Error(`ffmpeg: ${err.message}`)))
      .on("end", () => resolve(Buffer.concat(chunks)))
      .pipe()
      .on("data", (chunk: Buffer) => chunks.push(chunk));
  });
}

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
      } else if (file.type.startsWith("audio/") || name.endsWith(".mp3") || name.endsWith(".wav") || name.endsWith(".m4a") || name.endsWith(".ogg")) {
        // Audio → transcripción con Groq Whisper
        textContent = await transcribeWithGroq(buffer, file.name);
      } else if (file.type.startsWith("video/") || name.endsWith(".mp4") || name.endsWith(".avi") || name.endsWith(".mov") || name.endsWith(".mkv") || name.endsWith(".webm")) {
        // Video → extraer audio con ffmpeg, luego transcribir con Groq Whisper
        const audioBuffer = await extractAudioFromVideo(buffer);
        textContent = await transcribeWithGroq(audioBuffer, file.name);
      } else {
        console.log(`Formato no soportado: ${file.name}`);
        errors.push({ file: file.name, error: "Formato no soportado" });
        continue;
      }

      if (!textContent.trim()) {
        textContent = "[Sin contenido de texto extraíble]";
      }

      // 2. Guardar el documento principal (sin contenido — ya vive en chunks)
      const { data: docRecord, error: docError } = await supabase
        .from("sek_docs")
        .insert({
          id: crypto.randomUUID(),
          name: file.name,
          content: textContent.substring(0, 500),
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

      // 3. Crear Chunks para RAG (1500 chars, max 200 chunks, filtrar vacíos)
      const allChunks = chunkText(textContent, 1500)
        .filter(c => c.trim().length > 20);
      const chunks = allChunks.slice(0, 200);
      
      const chunkRecords = chunks.map((chunk, idx) => ({
        doc_id: docRecord.id,
        doc_name: file.name,
        content: chunk,
        chunk_index: idx,
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
