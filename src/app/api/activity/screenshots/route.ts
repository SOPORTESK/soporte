import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/service";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const agentEmail = searchParams.get("agent");
    const date = searchParams.get("date") || new Date().toISOString().split("T")[0];

    if (!agentEmail) {
      return NextResponse.json({ error: "agent parameter required" }, { status: 400 });
    }

    const supabase = createServiceClient();
    const safeEmail = agentEmail.replace(/[^a-zA-Z0-9]/g, "_");
    const folderPath = `screenshots/${safeEmail}`;

    // Listar archivos del bucket
    const { data: files, error: storageErr } = await supabase.storage
      .from("attachments")
      .list(folderPath, {
        limit: 100,
        sortBy: { column: "name", order: "desc" },
      });

    if (storageErr) {
      console.warn("[screenshots] storage list error:", storageErr.message);
      return NextResponse.json({ screenshots: [] });
    }

    // Filtrar por fecha si el nombre contiene timestamp
    const targetDateStart = new Date(`${date}T00:00:00`).getTime();
    const targetDateEnd = new Date(`${date}T23:59:59`).getTime();

    const screenshots = (files || [])
      .filter((f) => {
        const timestampMatch = f.name.match(/^(\d+)\.(jpg|png|jpeg)$/);
        if (timestampMatch) {
          const ts = parseInt(timestampMatch[1], 10);
          return ts >= targetDateStart && ts <= targetDateEnd;
        }
        // Si tiene created_at en metadata
        if (f.created_at) {
          const ts = new Date(f.created_at).getTime();
          return ts >= targetDateStart && ts <= targetDateEnd;
        }
        return true;
      })
      .map((f) => {
        const { data: urlData } = supabase.storage
          .from("attachments")
          .getPublicUrl(`${folderPath}/${f.name}`);

        const timestampMatch = f.name.match(/^(\d+)\.(jpg|png|jpeg)$/);
        const fileTime = timestampMatch ? parseInt(timestampMatch[1], 10) : new Date(f.created_at || "").getTime();

        return {
          id: f.id || f.name,
          name: f.name,
          url: urlData.publicUrl,
          created_at: new Date(fileTime || Date.now()).toISOString(),
          size: f.metadata?.size || 0,
        };
      });

    return NextResponse.json({
      ok: true,
      agent: agentEmail,
      date,
      count: screenshots.length,
      screenshots,
    });
  } catch (err: any) {
    console.error("[api/activity/screenshots] Error:", err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}