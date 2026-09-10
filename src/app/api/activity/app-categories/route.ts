import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/service";

export const runtime = "nodejs";

const APP_MAPPINGS_KEY = "activity_app_categories";
const CATEGORIES_LIST_KEY = "activity_categories_list";

const DEFAULT_CATEGORIES = [
  { id: "Atención chat", label: "Atención chat", color: "text-emerald-400 border-emerald-500/30 bg-emerald-500/15", bgBar: "bg-emerald-500", iconName: "MessageSquare" },
  { id: "Atención de Tickets", label: "Atención de Tickets", color: "text-indigo-400 border-indigo-500/30 bg-indigo-500/15", bgBar: "bg-indigo-500", iconName: "FileText" },
  { id: "Optimización de procesos", label: "Optimización de procesos", color: "text-violet-400 border-violet-500/30 bg-violet-500/15", bgBar: "bg-violet-500", iconName: "Code" },
  { id: "Control administrativo", label: "Control administrativo", color: "text-fuchsia-400 border-fuchsia-500/30 bg-fuchsia-500/15", bgBar: "bg-fuchsia-500", iconName: "TrendingUp" },
  { id: "Gestión de Correos", label: "Gestión de Correos", color: "text-blue-400 border-blue-500/30 bg-blue-500/15", bgBar: "bg-blue-500", iconName: "Mail" },
  { id: "Atención por llamada", label: "Atención por llamada", color: "text-orange-400 border-orange-500/30 bg-orange-500/15", bgBar: "bg-orange-500", iconName: "Phone" },
  { id: "Soporte técnico", label: "Soporte técnico", color: "text-cyan-400 border-cyan-500/30 bg-cyan-500/15", bgBar: "bg-cyan-500", iconName: "Monitor" },
  { id: "Gestión de Garantías", label: "Gestión de Garantías", color: "text-amber-400 border-amber-500/30 bg-amber-500/15", bgBar: "bg-amber-500", iconName: "ShieldCheck" },
  { id: "Actividad general", label: "Actividad general", color: "text-slate-400 border-slate-500/30 bg-slate-500/15", bgBar: "bg-slate-500", iconName: "Monitor" },
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
            categories = parsed;
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
