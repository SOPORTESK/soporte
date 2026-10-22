import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  try {
    const formData = await req.formData();
    const file = formData.get("file") as File | null;
    const folder = (formData.get("folder") as string) || "attachments";
    const customPath = formData.get("path") as string | null;

    if (!file) {
      return NextResponse.json({ error: "No se proporcionó ningún archivo" }, { status: 400 });
    }

    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

    if (!supabaseUrl || !serviceRoleKey) {
      return NextResponse.json({ error: "Configuración de Supabase incompleta en servidor" }, { status: 500 });
    }

    const supabase = createClient(supabaseUrl, serviceRoleKey);

    const ext = file.name.split(".").pop() || "bin";
    const cleanName = file.name.replace(/[^a-zA-Z0-9._-]/g, "_");
    const filePath = customPath || `${folder}/${Date.now()}_${cleanName}`;

    const arrayBuffer = await file.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    const { error: upErr } = await supabase.storage
      .from("attachments")
      .upload(filePath, buffer, {
        contentType: file.type || "application/octet-stream",
        upsert: true,
      });

    if (upErr) {
      return NextResponse.json({ error: upErr.message }, { status: 500 });
    }

    const { data: pubData } = supabase.storage.from("attachments").getPublicUrl(filePath);

    return NextResponse.json({
      success: true,
      url: pubData.publicUrl,
      fileName: file.name,
      fileSize: file.size,
      mediaType: file.type || "application/octet-stream",
    });
  } catch (err: any) {
    return NextResponse.json({ error: err.message || "Error interno al procesar subida" }, { status: 500 });
  }
}
