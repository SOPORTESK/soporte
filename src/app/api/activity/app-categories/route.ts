import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/service";

export const runtime = "nodejs";

const APP_MAPPINGS_KEY = "activity_app_categories";
const CATEGORIES_LIST_KEY = "activity_categories_list";

const DEFAULT_CATEGORIES = [
  { id: "Soporte", label: "Soporte", color: "text-emerald-400 border-emerald-500/30 bg-emerald-500/15", bgBar: "bg-emerald-500", iconName: "Headphones" },
  { id: "Servicio de Taller", label: "Servicio de Taller", color: "text-amber-400 border-amber-500/30 bg-amber-500/15", bgBar: "bg-amber-500", iconName: "Wrench" },
  { id: "Control Administrativo", label: "Control Administrativo", color: "text-blue-400 border-blue-500/30 bg-blue-500/15", bgBar: "bg-blue-500", iconName: "TrendingUp" },
  { id: "Gestión del Taller", label: "Gestión del Taller", color: "text-indigo-400 border-indigo-500/30 bg-indigo-500/15", bgBar: "bg-indigo-500", iconName: "Package" },
  { id: "Gestión de Residuos", label: "Gestión de Residuos", color: "text-rose-400 border-rose-500/30 bg-rose-500/15", bgBar: "bg-rose-500", iconName: "Trash2" },
  { id: "On-the-Job Training (OJT)", label: "On-the-Job Training (OJT)", color: "text-violet-400 border-violet-500/30 bg-violet-500/15", bgBar: "bg-violet-500", iconName: "GraduationCap" },
];

export async function GET() {
  try {
    const supabase = createServiceClient();
    const { data, error } = await supabase
      .from("sek_app_settings")
      .select("key, value")
      .in("key", [APP_MAPPINGS_KEY, CATEGORIES_LIST_KEY]);

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    let appMappings: Record<string, string> = {};
    let categories = DEFAULT_CATEGORIES;

    for (const row of data || []) {
      if (row.key === APP_MAPPINGS_KEY && row.value) {
        try {
          appMappings = JSON.parse(row.value);
        } catch {}
      } else if (row.key === CATEGORIES_LIST_KEY && row.value) {
        try {
          const parsed = JSON.parse(row.value);
          if (Array.isArray(parsed) && parsed.length > 0) {
            const hasOld = parsed.some((c: any) =>
              c.id === "Atención chat" ||
              c.id === "Soporte Mensajería" ||
              c.id === "Soporte Telefónico" ||
              c.id === "Atención de Tickets" ||
              c.id === "Optimización de procesos" ||
              c.id === "Gestión de Correos" ||
              c.id === "Gestión de Garantías" ||
              c.id === "Actividad general" ||
              c.id === "Soporte técnico"
            );
            if (hasOld || parsed.length !== DEFAULT_CATEGORIES.length) {
              categories = DEFAULT_CATEGORIES;
            } else {
              categories = parsed;
            }
          }
        } catch {}
      }
    }

    return NextResponse.json({ appMappings, categories });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { appName, category, appMappings, categories, resetCategories } = body;
    const supabase = createServiceClient();

    // 1. Restablecer categorías a las predeterminadas
    if (resetCategories) {
      await supabase
        .from("sek_app_settings")
        .upsert(
          {
            key: CATEGORIES_LIST_KEY,
            value: JSON.stringify(DEFAULT_CATEGORIES),
            iv: "none",
            tag: "none",
            updated_at: new Date().toISOString(),
          },
          { onConflict: "key" }
        );
      return NextResponse.json({ success: true, categories: DEFAULT_CATEGORIES });
    }

    // 2. Guardar lista completa de categorías (agregar, editar, eliminar)
    if (categories && Array.isArray(categories)) {
      const { error } = await supabase
        .from("sek_app_settings")
        .upsert(
          {
            key: CATEGORIES_LIST_KEY,
            value: JSON.stringify(categories),
            iv: "none",
            tag: "none",
            updated_at: new Date().toISOString(),
          },
          { onConflict: "key" }
        );

      if (error) throw error;
      return NextResponse.json({ success: true, categories });
    }

    // 3. Guardar mapeo completo de aplicaciones
    if (appMappings && typeof appMappings === "object") {
      const { error } = await supabase
        .from("sek_app_settings")
        .upsert(
          {
            key: APP_MAPPINGS_KEY,
            value: JSON.stringify(appMappings),
            iv: "none",
            tag: "none",
            updated_at: new Date().toISOString(),
          },
          { onConflict: "key" }
        );

      if (error) throw error;
      return NextResponse.json({ success: true, appMappings });
    }

    // 4. Actualizar una sola aplicación
    if (appName) {
      const { data } = await supabase
        .from("sek_app_settings")
        .select("value")
        .eq("key", APP_MAPPINGS_KEY)
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
            key: APP_MAPPINGS_KEY,
            value: JSON.stringify(currentMap),
            iv: "none",
            tag: "none",
            updated_at: new Date().toISOString(),
          },
          { onConflict: "key" }
        );

      if (error) throw error;
      return NextResponse.json({ success: true, appMappings: currentMap });
    }

    return NextResponse.json({ error: "Datos inválidos" }, { status: 400 });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
