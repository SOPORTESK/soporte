import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/service";

export const runtime = "nodejs";

const APP_MAPPINGS_KEY = "activity_app_categories";
const CATEGORIES_LIST_KEY = "activity_categories_list";

const DEFAULT_CATEGORIES = [
  {
    id: "Soporte",
    label: "Soporte",
    color: "text-emerald-400 border-emerald-500/30 bg-emerald-500/15",
    bgBar: "bg-emerald-500",
    iconName: "Headphones",
    subcategories: ["Telefónico", "Mensajería", "Presencial", "Remoto"],
  },
  {
    id: "Servicio de Taller",
    label: "Servicio de Taller",
    color: "text-amber-400 border-amber-500/30 bg-amber-500/15",
    bgBar: "bg-amber-500",
    iconName: "Wrench",
    subcategories: [
      "Diagnóstico (MANUAL)",
      "Reparación (MANUAL)",
      "Mantenimiento (MANUAL)",
      "Pruebas y Validación (MANUAL)",
    ],
  },
  {
    id: "Control Administrativo",
    label: "Control Administrativo",
    color: "text-blue-400 border-blue-500/30 bg-blue-500/15",
    bgBar: "bg-blue-500",
    iconName: "TrendingUp",
    subcategories: [
      "Optimización de Procesos",
      "Inventarios",
      "Gestión de Garantías",
      "Gestión de Desechos",
      "Seguimiento de Casos",
      "Devoluciones",
    ],
  },
  {
    id: "Gestión del Taller",
    label: "Gestión del Taller",
    color: "text-indigo-400 border-indigo-500/30 bg-indigo-500/15",
    bgBar: "bg-indigo-500",
    iconName: "Package",
    subcategories: [
      "Orden y Limpieza de Taller",
      "Organización de Equipos",
      "Acondicionamiento del Área",
    ],
  },
  {
    id: "Gestión de Residuos",
    label: "Gestión de Residuos",
    color: "text-rose-400 border-rose-500/30 bg-rose-500/15",
    bgBar: "bg-rose-500",
    iconName: "Trash2",
    subcategories: [
      "Desecho de equipos abandonados",
      "Residuos electrónicos",
    ],
  },
  {
    id: "On-the-Job Training (OJT)",
    label: "On-the-Job Training (OJT)",
    color: "text-violet-400 border-violet-500/30 bg-violet-500/15",
    bgBar: "bg-violet-500",
    iconName: "GraduationCap",
    subcategories: [
      "Certificaciones oficiales",
      "Educación Continua",
    ],
  },
  {
    id: "Pausas y Descansos",
    label: "Pausas y Descansos",
    color: "text-amber-400 border-amber-500/30 bg-amber-500/15",
    bgBar: "bg-amber-500",
    iconName: "Clock",
    subcategories: [
      "Tiempo de Descanso",
      "Pausa Sanitaria",
      "Almuerzo",
      "Pausa Operativa",
    ],
  },
];

const DEFAULT_APP_MAPPINGS: Record<string, { category: string; subcategory: string }> = {
  "Linkus": { category: "Soporte", subcategory: "Telefónico" },
  "Linkus (Softphone)": { category: "Soporte", subcategory: "Telefónico" },
  "WhatsApp llamadas": { category: "Soporte", subcategory: "Telefónico" },
  "Seka Chat": { category: "Soporte", subcategory: "Mensajería" },
  "WhatsApp": { category: "Soporte", subcategory: "Mensajería" },
  "WhatsApp Mensajería": { category: "Soporte", subcategory: "Mensajería" },
  "web.whatsapp.com": { category: "Soporte", subcategory: "Mensajería" },
  "WhatsApp Web": { category: "Soporte", subcategory: "Mensajería" },
  "Tickets (Odoo)": { category: "Soporte", subcategory: "Presencial" },
  "Odoo ERP": { category: "Soporte", subcategory: "Presencial" },
  "odoo.com": { category: "Soporte", subcategory: "Presencial" },
  "Atención": { category: "Soporte", subcategory: "Presencial" },
  "Soporte a Ventas": { category: "Soporte", subcategory: "Presencial" },
  "AnyDesk": { category: "Soporte", subcategory: "Remoto" },
  "TeamViewer": { category: "Soporte", subcategory: "Remoto" },
  "Asistencia Rápida": { category: "Soporte", subcategory: "Remoto" },
  "Iniciar Diagnóstico Físico": { category: "Servicio de Taller", subcategory: "Diagnóstico (MANUAL)" },
  "Diagnóstico (MANUAL)": { category: "Servicio de Taller", subcategory: "Diagnóstico (MANUAL)" },
  "Reparación (MANUAL)": { category: "Servicio de Taller", subcategory: "Reparación (MANUAL)" },
  "Mantenimiento (MANUAL)": { category: "Servicio de Taller", subcategory: "Mantenimiento (MANUAL)" },
  "Pruebas y Validación (MANUAL)": { category: "Servicio de Taller", subcategory: "Pruebas y Validación (MANUAL)" },
  "AntiGravity": { category: "Control Administrativo", subcategory: "Optimización de Procesos" },
  "Devin": { category: "Control Administrativo", subcategory: "Optimización de Procesos" },
  "Github": { category: "Control Administrativo", subcategory: "Optimización de Procesos" },
  "github.com": { category: "Control Administrativo", subcategory: "Optimización de Procesos" },
  "Ir a Bodega": { category: "Control Administrativo", subcategory: "Inventarios" },
  "Inventarios": { category: "Control Administrativo", subcategory: "Inventarios" },
  "Inventario y Actualización de Bodega GAR": { category: "Control Administrativo", subcategory: "Inventarios" },
  "Gestión de Garantías": { category: "Control Administrativo", subcategory: "Gestión de Garantías" },
  "Limpieza de taller": { category: "Gestión del Taller", subcategory: "Orden y Limpieza de Taller" },
  "Orden y Limpieza de Taller": { category: "Gestión del Taller", subcategory: "Orden y Limpieza de Taller" },
  "Organización de Equipos": { category: "Gestión del Taller", subcategory: "Organización de Equipos" },
  "Acondicionamiento del Área": { category: "Gestión del Taller", subcategory: "Acondicionamiento del Área" },
  "Desecho de equipos abandonados": { category: "Gestión de Residuos", subcategory: "Desecho de equipos abandonados" },
  "Residuos electrónicos": { category: "Gestión de Residuos", subcategory: "Residuos electrónicos" },
  "Certificaciones oficiales": { category: "On-the-Job Training (OJT)", subcategory: "Certificaciones oficiales" },
  "Educación Continua": { category: "On-the-Job Training (OJT)", subcategory: "Educación Continua" },
  "Tiempo de Descanso": { category: "Pausas y Descansos", subcategory: "Tiempo de Descanso" },
  "Pausa Sanitaria": { category: "Pausas y Descansos", subcategory: "Pausa Sanitaria" },
  "Almuerzo": { category: "Pausas y Descansos", subcategory: "Almuerzo" },
  "Pausa e Inactividad": { category: "Pausas y Descansos", subcategory: "Pausa Operativa" },
};

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

    let appMappings: Record<string, any> = {};
    let categories = DEFAULT_CATEGORIES;
    let hasCustomAppMappings = false;

    for (const row of data || []) {
      if (row.key === APP_MAPPINGS_KEY && row.value) {
        try {
          appMappings = JSON.parse(row.value);
          if (appMappings && typeof appMappings === "object" && Object.keys(appMappings).length > 0) {
            hasCustomAppMappings = true;
          }
        } catch {}
      } else if (row.key === CATEGORIES_LIST_KEY && row.value) {
        try {
          const parsed = JSON.parse(row.value);
          if (Array.isArray(parsed) && parsed.length > 0) {
            // Asegurar que cada categoría tenga su array de subcategorías
            categories = parsed.map((cat: any) => ({
              ...cat,
              subcategories: Array.isArray(cat.subcategories) ? cat.subcategories : [],
            }));
          }
        } catch {}
      }
    }

    delete appMappings["Formación de Usuarios"];
    const finalMappings = hasCustomAppMappings ? appMappings : DEFAULT_APP_MAPPINGS;
    return NextResponse.json({ appMappings: finalMappings, categories });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const {
      appName,
      category,
      subcategory,
      appMappings,
      categories,
      resetCategories,
      action,
      categoryId,
      subcatName,
    } = body;
    const supabase = createServiceClient();

    // 1. Restablecer categorías a las predeterminadas con sus subcategorías
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

    // 2. Acción específica para añadir o eliminar una subcategoría directamente
    if (action === "addSubcategory" && categoryId && subcatName) {
      const { data } = await supabase
        .from("sek_app_settings")
        .select("value")
        .eq("key", CATEGORIES_LIST_KEY)
        .maybeSingle();

      let currentCats: any[] = DEFAULT_CATEGORIES;
      if (data?.value) {
        try {
          currentCats = JSON.parse(data.value);
        } catch {}
      }

      const updated = currentCats.map((cat) => {
        if (cat.id === categoryId) {
          const currentSubs: string[] = Array.isArray(cat.subcategories) ? cat.subcategories : [];
          const trimmed = subcatName.trim();
          if (trimmed && !currentSubs.includes(trimmed)) {
            return { ...cat, subcategories: [...currentSubs, trimmed] };
          }
        }
        return cat;
      });

      await supabase
        .from("sek_app_settings")
        .upsert(
          {
            key: CATEGORIES_LIST_KEY,
            value: JSON.stringify(updated),
            iv: "none",
            tag: "none",
            updated_at: new Date().toISOString(),
          },
          { onConflict: "key" }
        );

      return NextResponse.json({ success: true, categories: updated });
    }

    if (action === "deleteSubcategory" && categoryId && subcatName) {
      const { data } = await supabase
        .from("sek_app_settings")
        .select("value")
        .eq("key", CATEGORIES_LIST_KEY)
        .maybeSingle();

      let currentCats: any[] = DEFAULT_CATEGORIES;
      if (data?.value) {
        try {
          currentCats = JSON.parse(data.value);
        } catch {}
      }

      const updated = currentCats.map((cat) => {
        if (cat.id === categoryId && Array.isArray(cat.subcategories)) {
          return {
            ...cat,
            subcategories: cat.subcategories.filter((s: string) => s !== subcatName),
          };
        }
        return cat;
      });

      await supabase
        .from("sek_app_settings")
        .upsert(
          {
            key: CATEGORIES_LIST_KEY,
            value: JSON.stringify(updated),
            iv: "none",
            tag: "none",
            updated_at: new Date().toISOString(),
          },
          { onConflict: "key" }
        );

      return NextResponse.json({ success: true, categories: updated });
    }

    // 3. Guardar lista completa de categorías (agregar, editar, eliminar)
    if (categories && Array.isArray(categories)) {
      const normalizedCats = categories.map((cat: any) => ({
        ...cat,
        subcategories: Array.isArray(cat.subcategories) ? cat.subcategories : [],
      }));

      const { error } = await supabase
        .from("sek_app_settings")
        .upsert(
          {
            key: CATEGORIES_LIST_KEY,
            value: JSON.stringify(normalizedCats),
            iv: "none",
            tag: "none",
            updated_at: new Date().toISOString(),
          },
          { onConflict: "key" }
        );

      if (error) throw error;
      return NextResponse.json({ success: true, categories: normalizedCats });
    }

    // 4. Guardar mapeo completo de aplicaciones
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

    // 5. Actualizar una sola aplicación (admite categoría y subcategoría opcional)
    if (appName) {
      const { data } = await supabase
        .from("sek_app_settings")
        .select("value")
        .eq("key", APP_MAPPINGS_KEY)
        .maybeSingle();

      let currentMap: Record<string, any> = {};
      if (data?.value) {
        try {
          currentMap = JSON.parse(data.value);
        } catch {
          currentMap = {};
        }
      }

      if (body.action === "deleteApp" || body.delete) {
        delete currentMap[appName];
      } else if (category === null || category === undefined || category === "auto" || category === "Sin Clasificar" || category === "unassigned") {
        currentMap[appName] = { category: "Sin Clasificar", subcategory: null };
      } else {
        if (subcategory) {
          currentMap[appName] = { category, subcategory };
        } else {
          currentMap[appName] = category;
        }
      }

      delete currentMap["Formación de Usuarios"];

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
