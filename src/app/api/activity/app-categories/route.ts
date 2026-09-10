import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/service";

export const runtime = "nodejs";

const SETTINGS_KEY = "activity_app_categories";

// GET: Retorna el mapeo personalizado guardado
export async function GET() {
  try {
    const supabase = createServiceClient();
    const { data, error } = await supabase
      .from("sek_app_settings")
      .select("value")
      .eq("key", SETTINGS_KEY)
      .maybeSingle();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    let categories: Record<string, string> = {};
    if (data?.value) {
      try {
        categories = JSON.parse(data.value);
      } catch {
        categories = {};
      }
    }

    return NextResponse.json({ categories });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

// POST: Guarda o actualiza mapeos personalizados
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { appName, category, categories: fullMap } = body;
    const supabase = createServiceClient();

    if (fullMap && typeof fullMap === "object") {
      const { error } = await supabase
        .from("sek_app_settings")
        .upsert(
          {
            key: SETTINGS_KEY,
            value: JSON.stringify(fullMap),
            iv: "none",
            tag: "none",
            updated_at: new Date().toISOString(),
          },
          { onConflict: "key" }
        );

      if (error) throw error;
      return NextResponse.json({ success: true, categories: fullMap });
    }

    if (appName) {
      const { data } = await supabase
        .from("sek_app_settings")
        .select("value")
        .eq("key", SETTINGS_KEY)
        .maybeSingle();

      let currentMap: Record<string, string> = {};
      if (data?.value) {
        try {
          currentMap = JSON.parse(data.value);
        } catch {
          currentMap = {};
        }
      }

      if (category === null || category === undefined || category === "auto") {
        delete currentMap[appName];
      } else {
        currentMap[appName] = category;
      }

      const { error } = await supabase
        .from("sek_app_settings")
        .upsert(
          {
            key: SETTINGS_KEY,
            value: JSON.stringify(currentMap),
            iv: "none",
            tag: "none",
            updated_at: new Date().toISOString(),
          },
          { onConflict: "key" }
        );

      if (error) throw error;
      return NextResponse.json({ success: true, categories: currentMap });
    }

    return NextResponse.json({ error: "Datos inválidos" }, { status: 400 });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
