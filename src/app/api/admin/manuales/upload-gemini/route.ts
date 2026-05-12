import { NextRequest, NextResponse } from "next/server";

export async function POST(req: NextRequest) {
  try {
    const geminiKey = process.env.GEMINI_API_KEY;
    if (!geminiKey) return NextResponse.json({ error: "GEMINI_API_KEY no configurada" }, { status: 500 });

    const { name, mimeType, data } = await req.json();
    const buffer = Buffer.from(data);

    // 1. Iniciar upload resumable a Gemini File API
    const initRes = await fetch(
      `https://generativelanguage.googleapis.com/upload/v1beta/files?key=${geminiKey}`,
      {
        method: "POST",
        headers: {
          "X-Goog-Upload-Protocol": "resumable",
          "X-Goog-Upload-Command": "start",
          "X-Goog-Upload-Header-Content-Length": String(buffer.length),
          "X-Goog-Upload-Header-Content-Type": mimeType,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ file: { display_name: name } }),
      }
    );

    if (!initRes.ok) {
      const err = await initRes.text();
      return NextResponse.json({ error: `Error iniciando upload: ${err}` }, { status: 500 });
    }

    const uploadUrl = initRes.headers.get("x-goog-upload-url");
    if (!uploadUrl) return NextResponse.json({ error: "No se obtuvo upload URL" }, { status: 500 });

    // 2. Subir el archivo
    const uploadRes = await fetch(uploadUrl, {
      method: "POST",
      headers: {
        "Content-Length": String(buffer.length),
        "X-Goog-Upload-Offset": "0",
        "X-Goog-Upload-Command": "upload, finalize",
      },
      body: buffer,
    });

    if (!uploadRes.ok) {
      const err = await uploadRes.text();
      return NextResponse.json({ error: `Error subiendo archivo: ${err}` }, { status: 500 });
    }

    const fileData = await uploadRes.json();
    const fileUri = fileData.file?.uri;

    if (!fileUri) return NextResponse.json({ error: "No se obtuvo URI del archivo" }, { status: 500 });

    return NextResponse.json({ fileUri, mimeType, name });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
