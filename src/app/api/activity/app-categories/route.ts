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
    id: "Utilidades",
    label: "Utilidades",
    color: "text-slate-400 border-slate-500/30 bg-slate-500/15",
    bgBar: "bg-slate-500",
    iconName: "SlidersHorizontal",
    subcategories: [
      "Música y Ambiente",
      "Herramientas del Sistema",
      "Navegación General",
      "Accesorios de Escritorio",
    ],
  },
  {
    id: "Descansos",
    label: "Descansos",
    color: "text-amber-400 border-amber-500/30 bg-amber-500/15",
    bgBar: "bg-amber-500",
    iconName: "Sandwich",
    subcategories: [
      "Tiempo de Descanso",
      "Almuerzo",
      "Café / Merienda",
      "Pausa Operativa",
    ],
  },
  {
    id: "Pausa Sanitaria",
    label: "Pausa Sanitaria",
    color: "text-emerald-400 border-emerald-500/30 bg-emerald-500/15",
    bgBar: "bg-emerald-500",
    iconName: "Bath",
    subcategories: [
      "Pausa Sanitaria",
      "Baño",
    ],
  },
];

const DEFAULT_APP_MAPPINGS: Record<string, { category: string; subcategory: string }> = {
  "Linkus": { category: "Soporte", subcategory: "Telefónico" },
  "Linkus (Softphone)": { category: "Soporte", subcategory: "Telefónico" },
  "WhatsApp llamadas": { category: "Soporte", subcategory: "Telefónico" },
  "Seka Chat": { category: "Soporte", subcategory: "Mensajería" },
  "Seka Chat - Plataforma": { category: "Soporte", subcategory: "Mensajería" },
  "WhatsApp": { category: "Soporte", subcategory: "Mensajería" },
  "WhatsApp Mensajería": { category: "Soporte", subcategory: "Mensajería" },
  "web.whatsapp.com": { category: "Soporte", subcategory: "Mensajería" },
  "WhatsApp Web": { category: "Soporte", subcategory: "Mensajería" },
  "Tickets (Odoo)": { category: "Soporte", subcategory: "Presencial" },
  "Odoo ERP": { category: "Soporte", subcategory: "Presencial" },
  "odoo.com": { category: "Soporte", subcategory: "Presencial" },
  "AnyDesk": { category: "Soporte", subcategory: "Remoto" },
  "TeamViewer": { category: "Soporte", subcategory: "Remoto" },
  "Asistencia Rápida": { category: "Soporte", subcategory: "Remoto" },
  "cloudsso.hikvision.com": { category: "Soporte", subcategory: "Remoto" },
  "hikvision.com": { category: "Soporte", subcategory: "Remoto" },
  "https://www.hikvision.com/es-la/": { category: "Soporte", subcategory: "Remoto" },
  "Tienda 3D": { category: "Servicio de Taller", subcategory: "Reparación (MANUAL)" },
  "Outlook": { category: "Control Administrativo", subcategory: "Correo y Comunicaciones" },
  "Nextime PRO": { category: "Control Administrativo", subcategory: "Optimización de Procesos" },
  "AntiGravity": { category: "Control Administrativo", subcategory: "Optimización de Procesos" },
  "Devin": { category: "Control Administrativo", subcategory: "Optimización de Procesos" },
  "Github": { category: "Control Administrativo", subcategory: "Optimización de Procesos" },
  "github.com": { category: "Control Administrativo", subcategory: "Optimización de Procesos" },
  "chatgpt.com": { category: "Control Administrativo", subcategory: "Optimización de Procesos" },
  "Spotify": { category: "Utilidades", subcategory: "Música y Ambiente" },
  "Escritorio de Windows": { category: "Utilidades", subcategory: "Herramientas del Sistema" },
  "Conmutación de tareas": { category: "Utilidades", subcategory: "Herramientas del Sistema" },
  "Calculadora": { category: "Utilidades", subcategory: "Accesorios de Escritorio" },
  "Bloc de notas": { category: "Utilidades", subcategory: "Accesorios de Escritorio" },
  "Task Manager": { category: "Utilidades", subcategory: "Herramientas del Sistema" },
  "Google One": { category: "Utilidades", subcategory: "Navegación General" },
  "Búsqueda en Google": { category: "Utilidades", subcategory: "Navegación General" },
  "Google Drive": { category: "Utilidades", subcategory: "Navegación General" },
  "Portal Hikvision": { category: "Soporte", subcategory: "Remoto" },
  "Hikvision": { category: "Soporte", subcategory: "Remoto" },
  "Supabase": { category: "Control Administrativo", subcategory: "Optimización de Procesos" },
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

    const junkPrefixes = ['navegador:', 'navegador web:', 'mystify', 'explorer', 'mi bandeja'];
    const junkExact = ['navegación', 'navegacion', 'navegación web', 'navegacion web', 'inactividad', 'inactivo', 'pausa', 'operativa', 'actividad general'];

    for (const row of data || []) {
      if (row.key === APP_MAPPINGS_KEY && row.value) {
        try {
          const raw = typeof row.value === "string" ? JSON.parse(row.value) : row.value;
          if (raw && typeof raw === "object") {
            const clean: Record<string, any> = {};
            for (const [k, v] of Object.entries(raw)) {
              const kl = k.toLowerCase().trim();
              if (junkPrefixes.some((p) => kl.startsWith(p))) continue;
              if (junkExact.includes(kl)) continue;
              clean[k] = v;
            }
            appMappings = clean;
            if (Object.keys(clean).length > 0) {
              hasCustomAppMappings = true;
            }
          }
        } catch {}
      } else if (row.key === CATEGORIES_LIST_KEY && row.value) {
        try {
          const parsed = JSON.parse(row.value);
          if (Array.isArray(parsed) && parsed.length > 0) {
            // Migrar automáticamente si contiene el viejo "Pausas y Descansos"
            const hasLegacyBreak = parsed.some((c: any) => c.id === "Pausas y Descansos" || c.label === "Pausas y Descansos");
            if (hasLegacyBreak) {
              const withoutLegacy = parsed.filter((c: any) => c.id !== "Pausas y Descansos" && c.label !== "Pausas y Descansos");
              const descansoCat = DEFAULT_CATEGORIES.find((c) => c.id === "Descansos")!;
              const sanitariaCat = DEFAULT_CATEGORIES.find((c) => c.id === "Pausa Sanitaria")!;
              categories = [...withoutLegacy, descansoCat, sanitariaCat];
              supabase
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
                )
                .then(() => {});
            } else {
              categories = parsed.map((cat: any) => ({
                ...cat,
                subcategories: Array.isArray(cat.subcategories) ? cat.subcategories : [],
              }));
            }

            // Asegurar que la categoría "Utilidades" esté siempre presente
            const hasUtilidades = categories.some((c: any) => c.id === "Utilidades" || c.label === "Utilidades");
            if (!hasUtilidades) {
              const utilCat = DEFAULT_CATEGORIES.find((c) => c.id === "Utilidades")!;
              // Insertar antes de Descansos
              const breakIdx = categories.findIndex((c: any) => c.id === "Descansos");
              if (breakIdx !== -1) {
                categories.splice(breakIdx, 0, utilCat);
              } else {
                categories.push(utilCat);
              }
              supabase
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
                )
                .then(() => {});
            }
          }
        } catch {}
      }
    }

    delete appMappings["Formación de Usuarios"];
    // Fusionar siempre los mapeos oficiales por defecto con cualquier personalización guardada
    const finalMappings = { ...DEFAULT_APP_MAPPINGS, ...appMappings };
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

      // Si se proporciona un logId, actualizar directamente el registro histórico en activity_log
      if (body.logId) {
        try {
          await supabase
            .from("activity_log")
            .update({
              category: (!category || category === "auto" || category === "Sin Clasificar") ? "Sin Clasificar" : category,
              metadata: {
                ...(body.existingMetadata || {}),
                app_name: appName,
                manual_category: category,
                manual_subcategory: subcategory || null,
              },
            })
            .eq("id", body.logId);
        } catch (err) {
          console.error("[app-categories] Error actualizando log individual:", err);
        }
      }

      if (error) throw error;
      return NextResponse.json({ success: true, appMappings: currentMap });
    }

    return NextResponse.json({ error: "Datos inválidos" }, { status: 400 });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
