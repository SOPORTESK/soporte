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
    iconName: "Wrench",
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
    id: "comunicacion",
    label: "Comunicación (ms-teams)",
    category: "Gestión del Taller",
    subcategory: "Reuniones y Charlas",
    iconName: "Users",
    color: "violet",
  },
];

export async function GET() {
  try {
    const supabase = createServiceClient();
    const { data } = await supabase
      .from("sek_app_settings")
      .select("value")
      .eq("key", MANUAL_TASKS_KEY)
      .maybeSingle();

    let tasks: ManualTaskItem[] = DEFAULT_MANUAL_TASKS;
    if (data?.value) {
      try {
        const parsed = JSON.parse(data.value);
        if (Array.isArray(parsed)) {
          tasks = parsed;
        }
      } catch {}
    } else {
      // Inicializar por defecto si no existe registro
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
          { onConflict: "key" }
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
    const { data } = await supabase
      .from("sek_app_settings")
      .select("value")
      .eq("key", MANUAL_TASKS_KEY)
      .maybeSingle();

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
