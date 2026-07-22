import { NextRequest, NextResponse } from "next/server";

export async function POST(req: NextRequest) {
  try {
    const formData = await req.formData();
    const file = formData.get("files") as File;
    if (!file) return NextResponse.json({ error: "No file" }, { status: 400 });

    const buffer = Buffer.from(await file.arrayBuffer());
    const name = file.name.toLowerCase();
    let text = "";

    if (name.endsWith(".pdf")) {
      const pdf = (await import("pdf-parse/lib/pdf-parse.js")).default;
      const data = await pdf(buffer);
      text = data.text;
    } else if (name.endsWith(".docx") || name.endsWith(".doc")) {
      const mammoth = (await import("mammoth")).default;
      const result = await mammoth.extractRawText({ buffer });
      text = result.value;
    } else if (
      file.type.includes("text") ||
      name.endsWith(".csv") ||
      name.endsWith(".md") ||
      name.endsWith(".txt") ||
      name.endsWith(".json") ||
      name.endsWith(".xml") ||
      name.endsWith(".html") ||
      name.endsWith(".htm")
    ) {
      text = buffer.toString("utf-8");
    } else {
      text = `[Archivo binario: ${file.name} — no se puede extraer texto]`;
    }

    return NextResponse.json({ text: text.substring(0, 12000) });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
