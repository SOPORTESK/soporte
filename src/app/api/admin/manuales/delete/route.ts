import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function DELETE(req: NextRequest) {
  try {
    const supabase = createClient();
    const { searchParams } = new URL(req.url);
    const docId = searchParams.get("id");

    if (!docId) {
      return NextResponse.json({ error: "ID de documento requerido" }, { status: 400 });
    }

    // Eliminar chunks asociados primero
    const { error: chunksError } = await supabase
      .from("sek_doc_chunks")
      .delete()
      .eq("doc_id", docId);

    if (chunksError) {
      console.error("Error deleting chunks:", chunksError);
    }

    // Eliminar el documento
    const { error: docError } = await supabase
      .from("sek_docs")
      .delete()
      .eq("id", docId);

    if (docError) {
      console.error("Error deleting doc:", docError);
      return NextResponse.json({ error: "Error al eliminar documento" }, { status: 500 });
    }

    return NextResponse.json({ success: true });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
