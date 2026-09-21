import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/service";

export const runtime = "nodejs";

const EVENTS_KEY = "agenda_events";
const TASKS_KEY = "agenda_tasks";

export interface AgendaEvent {
  id: string;
  title: string;
  description?: string;
  date: string; // YYYY-MM-DD
  start_time?: string; // HH:mm
  end_time?: string; // HH:mm
  all_day?: boolean;
  category: "reunion" | "taller" | "entrega" | "cliente" | "personal" | "otro";
  assigned_to?: string; // email o "all"
  created_by: string;
  created_by_name?: string;
  location?: string;
  status: "confirmed" | "pending" | "completed" | "cancelled";
  created_at: string;
  updated_at: string;
}

export interface TaskChecklistItem {
  id: string;
  text: string;
  done: boolean;
}

export interface AgendaTask {
  id: string;
  title: string;
  description?: string;
  priority: "alta" | "media" | "baja";
  status: "pending" | "in_progress" | "completed";
  due_date?: string; // YYYY-MM-DD
  assigned_to?: string; // email o "all"
  created_by: string;
  created_by_name?: string;
  checklist?: TaskChecklistItem[];
  tags?: string[];
  created_at: string;
  updated_at: string;
  completed_at?: string | null;
}

async function getStoredData<T>(supabase: any, key: string, defaultValue: T): Promise<T> {
  try {
    const { data } = await supabase
      .from("sek_app_settings")
      .select("value")
      .eq("key", key)
      .maybeSingle();

    if (data?.value) {
      const parsed = JSON.parse(data.value);
      return Array.isArray(parsed) ? (parsed as unknown as T) : defaultValue;
    }
  } catch (err) {
    console.error(`Error reading ${key}:`, err);
  }
  return defaultValue;
}

async function saveStoredData(supabase: any, key: string, data: any) {
  const { error } = await supabase
    .from("sek_app_settings")
    .upsert(
      {
        key,
        value: JSON.stringify(data),
        iv: "none",
        tag: "none",
        updated_at: new Date().toISOString(),
      },
      { onConflict: "key" }
    );
  if (error) throw error;
}

// GET: Recupera eventos, tareas y la lista de usuarios del equipo
export async function GET() {
  try {
    const supabase = createServiceClient();

    const [events, tasks, agentsRes] = await Promise.all([
      getStoredData<AgendaEvent[]>(supabase, EVENTS_KEY, []),
      getStoredData<AgendaTask[]>(supabase, TASKS_KEY, []),
      supabase
        .from("sek_agent_config")
        .select("email, nombre, apellido, avatar_url, rol")
        .neq("rol", "bot")
        .neq("rol", "sistema"),
    ]);

    // Filtrar cuentas virtuales del asistente
    const agents = (agentsRes.data || []).filter((a: any) => {
      const email = String(a.email || "").toLowerCase();
      const rol = String(a.rol || "").toLowerCase();
      return (
        rol !== "bot" &&
        rol !== "sistema" &&
        !email.includes("agent") &&
        !email.includes("assistant") &&
        !email.includes("system_prompt")
      );
    });

    return NextResponse.json({ events, tasks, agents });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

// POST: Crear o actualizar un evento o tarea
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { type, item } = body;
    const supabase = createServiceClient();

    if (!type || !item) {
      return NextResponse.json({ error: "Faltan parámetros 'type' o 'item'" }, { status: 400 });
    }

    if (type === "event") {
      const events = await getStoredData<AgendaEvent[]>(supabase, EVENTS_KEY, []);
      const now = new Date().toISOString();

      let updatedEvent: AgendaEvent;
      if (item.id) {
        // Actualizar existente
        const idx = events.findIndex((e) => e.id === item.id);
        if (idx >= 0) {
          updatedEvent = {
            ...events[idx],
            ...item,
            updated_at: now,
          };
          events[idx] = updatedEvent;
        } else {
          updatedEvent = {
            ...item,
            id: item.id,
            created_at: now,
            updated_at: now,
          };
          events.unshift(updatedEvent);
        }
      } else {
        // Nuevo evento
        updatedEvent = {
          ...item,
          id: `evt_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
          status: item.status || "confirmed",
          created_at: now,
          updated_at: now,
        };
        events.unshift(updatedEvent);
      }

      await saveStoredData(supabase, EVENTS_KEY, events);
      return NextResponse.json({ success: true, item: updatedEvent, events });
    }

    if (type === "task") {
      const tasks = await getStoredData<AgendaTask[]>(supabase, TASKS_KEY, []);
      const now = new Date().toISOString();

      let updatedTask: AgendaTask;
      if (item.id) {
        // Actualizar tarea existente
        const idx = tasks.findIndex((t) => t.id === item.id);
        if (idx >= 0) {
          const wasCompleted = tasks[idx].status === "completed";
          const isNowCompleted = item.status === "completed";
          updatedTask = {
            ...tasks[idx],
            ...item,
            updated_at: now,
            completed_at: isNowCompleted ? (wasCompleted ? tasks[idx].completed_at : now) : null,
          };
          tasks[idx] = updatedTask;
        } else {
          updatedTask = {
            ...item,
            id: item.id,
            created_at: now,
            updated_at: now,
          };
          tasks.unshift(updatedTask);
        }
      } else {
        // Nueva tarea
        updatedTask = {
          ...item,
          id: `tsk_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
          priority: item.priority || "media",
          status: item.status || "pending",
          checklist: Array.isArray(item.checklist) ? item.checklist : [],
          created_at: now,
          updated_at: now,
          completed_at: item.status === "completed" ? now : null,
        };
        tasks.unshift(updatedTask);
      }

      await saveStoredData(supabase, TASKS_KEY, tasks);
      return NextResponse.json({ success: true, item: updatedTask, tasks });
    }

    return NextResponse.json({ error: "Tipo inválido (debe ser 'event' o 'task')" }, { status: 400 });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

// PATCH: Cambio rápido de estado de tarea (completar, cambiar estado Kanban, checklist)
export async function PATCH(req: NextRequest) {
  try {
    const body = await req.json();
    const { taskId, status, checklistItemId, checklistDone } = body;
    const supabase = createServiceClient();

    if (!taskId) {
      return NextResponse.json({ error: "Falta 'taskId'" }, { status: 400 });
    }

    const tasks = await getStoredData<AgendaTask[]>(supabase, TASKS_KEY, []);
    const idx = tasks.findIndex((t) => t.id === taskId);
    if (idx === -1) {
      return NextResponse.json({ error: "Tarea no encontrada" }, { status: 404 });
    }

    const now = new Date().toISOString();
    const current = tasks[idx];

    if (status !== undefined) {
      current.status = status;
      current.completed_at = status === "completed" ? now : null;
    }

    if (checklistItemId && checklistDone !== undefined) {
      current.checklist = (current.checklist || []).map((ci) =>
        ci.id === checklistItemId ? { ...ci, done: Boolean(checklistDone) } : ci
      );
    }

    current.updated_at = now;
    tasks[idx] = current;

    await saveStoredData(supabase, TASKS_KEY, tasks);
    return NextResponse.json({ success: true, task: current, tasks });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

// DELETE: Eliminar un evento o tarea
export async function DELETE(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const id = searchParams.get("id");
    const type = searchParams.get("type");
    const supabase = createServiceClient();

    if (!id || !type) {
      return NextResponse.json({ error: "Faltan parámetros 'id' y 'type'" }, { status: 400 });
    }

    if (type === "event") {
      const events = await getStoredData<AgendaEvent[]>(supabase, EVENTS_KEY, []);
      const filtered = events.filter((e) => e.id !== id);
      await saveStoredData(supabase, EVENTS_KEY, filtered);
      return NextResponse.json({ success: true, events: filtered });
    }

    if (type === "task") {
      const tasks = await getStoredData<AgendaTask[]>(supabase, TASKS_KEY, []);
      const filtered = tasks.filter((t) => t.id !== id);
      await saveStoredData(supabase, TASKS_KEY, filtered);
      return NextResponse.json({ success: true, tasks: filtered });
    }

    return NextResponse.json({ error: "Tipo inválido" }, { status: 400 });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
