import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/service";
import { createClient } from "@/lib/supabase/server";
import { getAgentGroupPermissions } from "@/lib/permissions";

export const dynamic = "force-dynamic";
export const revalidate = 0;

const MANUAL_TASKS_KEY = "activity_manual_tasks";

export interface ManualTaskItem {
  id: string;
  label: string;
  category: string;
  subcategory?: string | null;
  iconName?: string;
  color?: string;
}

const DEFAULT_MANUAL_TASKS: ManualTaskItem[] = [
  {
    id: "diagnostico",
    label: "Diagnóstico",
    category: "Servicio de Taller",
    subcategory: "Diagnóstico",
    iconName: "Wrench",
    color: "amber",
  },
  {
    id: "reparacion",
    label: "Reparación",
    category: "Servicio de Taller",
    subcategory: "Reparación",
    iconName: "Hammer",
    color: "sky",
  },
  {
    id: "ir_a_bodega",
    label: "Ir a Bodega",
    category: "Gestión del Taller",
    subcategory: "Bodega e Inventario",
    iconName: "Package",
    color: "orange",
  },
  {
    id: "limpieza_taller",
    label: "Limpieza de taller",
    category: "Gestión del Taller",
    subcategory: "Acondicionamiento del Área",
    iconName: "Sparkles",
    color: "emerald",
  },
  {
    id: "inventario",
    label: "Inventario",
    category: "Control Administrativo",
    subcategory: "Inventarios",
    iconName: "ClipboardList",
    color: "indigo",
  },
  {
    id: "manual_1790710905386",
    label: "Almuerzo",
    category: "Descansos",
    subcategory: "Tiempo de Descanso",
    iconName: "Utensils",
    color: "amber",
  },
  {
    id: "manual_1790711526002",
    label: "Baño",
    category: "Pausa Sanitaria",
    subcategory: "Pausa Sanitaria",
    iconName: "Bath",
    color: "amber",
  },
  {
    id: "manual_1790771698430",
    label: "Exhibidores",
    category: "Gestión del Taller",
    subcategory: "Exhibidor",
    iconName: "ShowcaseDisplay",
    color: "amber",
  },
  {
    id: "manual_1790771771582",
    label: "Inspección",
    category: "Control Administrativo",
    subcategory: "Devoluciones",
    iconName: "InspectionLens",
    color: "amber",
  },
  {
    id: "manual_1790771886118",
    label: "Soporte a Ventas",
    category: "Soporte",
    subcategory: "Presencial",
    iconName: "Briefcase",
    color: "amber",
  },
  {
    id: "manual_1790784750307",
    label: "Inducción a Clientes",
    category: "Soporte",
    subcategory: "Presencial",
    iconName: "Contact",
    color: "amber",
  },
  {
    id: "manual_1790784849970",
    label: "Ventanilla",
    category: "Soporte",
    subcategory: "Presencial",
    iconName: "ReceptionDesk",
    color: "amber",
  },
  {
    id: "manual_1790795333511",
    label: "OJT",
    category: "On-the-Job Training (OJT)",
    subcategory: "Capacitación Técnica",
    iconName: "TrainingBoard",
    color: "amber",
  },
  {
    id: "manual_1790795380335",
    label: "Reunión",
    category: "Control Administrativo",
    subcategory: "Informes y Documentación",
    iconName: "Users",
    color: "amber",
  },
];

export async function GET() {
  try {
    const supabase = createServiceClient();
    const { data, error } = await supabase
      .from("sek_app_settings")
      .select("value")
      .eq("key", MANUAL_TASKS_KEY)
      .maybeSingle();

    // Si hubo un error de conexión/timeout en Supabase, NO sobrescribir la base de datos ni el caché local
    if (error) {
      return NextResponse.json(
        { success: false, error: error.message, tasks: DEFAULT_MANUAL_TASKS },
        { status: 503, headers: { "Cache-Control": "no-store, no-cache, must-revalidate" } }
      );
    }

    let tasks: ManualTaskItem[] = DEFAULT_MANUAL_TASKS;
    if (data?.value) {
      try {
        const parsed = JSON.parse(data.value);
        if (Array.isArray(parsed) && parsed.length > 0) {
          tasks = parsed;
        }
      } catch {}
    } else if (!data) {
      // Inicializar por defecto únicamente si no existe el registro y sin sobrescribir si ya existe
      await supabase
        .from("sek_app_settings")
        .upsert(
          {
            key: MANUAL_TASKS_KEY,
            value: JSON.stringify(DEFAULT_MANUAL_TASKS),
            iv: "none",
            tag: "none",
            updated_at: new Date().toISOString(),
          },
          { onConflict: "key", ignoreDuplicates: true }
        );
    }

    return NextResponse.json(
      { success: true, tasks },
      { headers: { "Cache-Control": "no-store, no-cache, must-revalidate" } }
    );
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const serverSupabase = createClient();
    const { data: { user } } = await serverSupabase.auth.getUser();
    if (!user) return NextResponse.json({ error: "No autorizado" }, { status: 401 });

    const { data: caller } = await serverSupabase
      .from("sek_agent_config")
      .select("rol")
      .ilike("email", user.email || "")
      .maybeSingle();

    const role = caller?.rol || "tecnico";
    const perms = await getAgentGroupPermissions(role);
    const canManage = role === "superadmin" || (perms as any)?.activity?.subcategories?.gestionar_labores_manuales === true;

    if (!canManage) {
      return NextResponse.json({ error: "No tienes permiso para gestionar labores manuales" }, { status: 403 });
    }

    const body = await req.json();
    const supabase = createServiceClient();

    // 1. Reemplazar toda la lista si se envía un arreglo directamente
    if (Array.isArray(body.tasks)) {
      const sanitized: ManualTaskItem[] = body.tasks
        .map((t: any, idx: number) => ({
          id: t.id || `task_${Date.now()}_${idx}`,
          label: (t.label || "").trim(),
          category: (t.category || "Servicio de Taller").trim(),
          subcategory: t.subcategory ? String(t.subcategory).trim() : null,
          iconName: t.iconName || "Wrench",
          color: t.color || "amber",
        }))
        .filter((t: ManualTaskItem) => t.label.length > 0);

      await supabase
        .from("sek_app_settings")
        .upsert(
          {
            key: MANUAL_TASKS_KEY,
            value: JSON.stringify(sanitized),
            iv: "none",
            tag: "none",
            updated_at: new Date().toISOString(),
          },
          { onConflict: "key" }
        );

      return NextResponse.json({ success: true, tasks: sanitized });
    }

    // 2. Operaciones unitarias: add, update, update-icon, delete
    const { data, error: fetchError } = await supabase
      .from("sek_app_settings")
      .select("value")
      .eq("key", MANUAL_TASKS_KEY)
      .maybeSingle();

    if (fetchError) {
      return NextResponse.json(
        { error: "Error leyendo labores actuales de Supabase: " + fetchError.message },
        { status: 503 }
      );
    }

    let currentTasks: ManualTaskItem[] = DEFAULT_MANUAL_TASKS;
    if (data?.value) {
      try {
        const parsed = JSON.parse(data.value);
        if (Array.isArray(parsed)) currentTasks = parsed;
      } catch {}
    }

    if (body.action === "add" && body.task) {
      const newTask: ManualTaskItem = {
        id: body.task.id || `task_${Date.now()}`,
        label: body.task.label.trim(),
        category: (body.task.category || "Servicio de Taller").trim(),
        subcategory: body.task.subcategory ? String(body.task.subcategory).trim() : null,
        iconName: body.task.iconName || "Wrench",
        color: body.task.color || "amber",
      };
      // Evitar duplicados por id o nombre exacto
      currentTasks = currentTasks.filter(
        (t) => t.id !== newTask.id && t.label.toLowerCase() !== newTask.label.toLowerCase()
      );
      currentTasks.push(newTask);
    } else if (body.action === "update" && body.task) {
      currentTasks = currentTasks.map((t) => {
        if (t.id === body.task.id) {
          return {
            ...t,
            label: body.task.label?.trim() || t.label,
            category: body.task.category?.trim() || t.category,
            subcategory:
              body.task.subcategory !== undefined
                ? body.task.subcategory
                  ? String(body.task.subcategory).trim()
                  : null
                : t.subcategory,
            iconName: body.task.iconName || t.iconName,
            color: body.task.color || t.color,
          };
        }
        return t;
      });
    } else if (body.action === "update-icon" && body.id && body.iconName) {
      currentTasks = currentTasks.map((t) =>
        t.id === body.id ? { ...t, iconName: body.iconName } : t
      );
    } else if (body.action === "delete" && body.id) {
      currentTasks = currentTasks.filter((t) => t.id !== body.id && t.label !== body.id);
    }

    await supabase
      .from("sek_app_settings")
      .upsert(
        {
          key: MANUAL_TASKS_KEY,
          value: JSON.stringify(currentTasks),
          iv: "none",
          tag: "none",
          updated_at: new Date().toISOString(),
        },
        { onConflict: "key" }
      );

    return NextResponse.json({ success: true, tasks: currentTasks });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
