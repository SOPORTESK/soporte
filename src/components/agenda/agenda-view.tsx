"use client";

import { useState, useEffect, useMemo } from "react";
import {
  Calendar as CalendarIcon,
  Clock,
  CheckSquare,
  Square,
  CheckCircle2,
  AlertCircle,
  Plus,
  Trash2,
  Edit3,
  ChevronLeft,
  ChevronRight,
  Search,
  Filter,
  Users,
  User,
  MapPin,
  Tag,
  Sparkles,
  Check,
  X,
  ListTodo,
  Columns,
  ArrowRight,
  Flame,
  Wrench,
  RefreshCw,
} from "lucide-react";
import { toast } from "sonner";
import { AgendaEvent, AgendaTask, TaskChecklistItem } from "@/app/api/agenda/route";

interface AgendaViewProps {
  currentAgent: {
    email: string;
    nombre?: string | null;
    apellido?: string | null;
    rol?: string | null;
    avatar_url?: string | null;
  };
}

const CATEGORY_COLORS: Record<string, { label: string; bg: string; text: string; border: string }> = {
  reunion:  { label: "Reunión", bg: "bg-blue-500/15", text: "text-blue-400", border: "border-blue-500/30" },
  taller:   { label: "Taller", bg: "bg-amber-500/15", text: "text-amber-400", border: "border-amber-500/30" },
  entrega:  { label: "Entrega", bg: "bg-emerald-500/15", text: "text-emerald-400", border: "border-emerald-500/30" },
  cliente:  { label: "Cliente", bg: "bg-purple-500/15", text: "text-purple-400", border: "border-purple-500/30" },
  personal: { label: "Personal", bg: "bg-rose-500/15", text: "text-rose-400", border: "border-rose-500/30" },
  otro:     { label: "Otro", bg: "bg-slate-500/15", text: "text-slate-400", border: "border-slate-500/30" },
};

const PRIORITY_STYLES: Record<string, { label: string; bg: string; text: string; border: string }> = {
  alta:  { label: "Alta", bg: "bg-rose-500/15", text: "text-rose-400", border: "border-rose-500/30" },
  media: { label: "Media", bg: "bg-amber-500/15", text: "text-amber-400", border: "border-amber-500/30" },
  baja:  { label: "Baja", bg: "bg-emerald-500/15", text: "text-emerald-400", border: "border-emerald-500/30" },
};

const MONTH_NAMES = [
  "Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio",
  "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre"
];

const DAY_NAMES = ["Lun", "Mar", "Mié", "Jue", "Vie", "Sáb", "Dom"];

export function AgendaView({ currentAgent }: AgendaViewProps) {
  const [events, setEvents] = useState<AgendaEvent[]>([]);
  const [tasks, setTasks] = useState<AgendaTask[]>([]);
  const [agents, setAgents] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  // Vistas
  const [activeTab, setActiveTab] = useState<"calendar" | "tasks">("calendar");
  const [taskViewMode, setTaskViewMode] = useState<"list" | "kanban">("list");

  // Filtros
  const [searchQuery, setSearchQuery] = useState("");
  const [filterAssigned, setFilterAssigned] = useState<"all" | "mine">("all");
  const [filterPriority, setFilterPriority] = useState<string>("all");

  // Estado del calendario mensual
  const today = new Date();
  const [currentYear, setCurrentYear] = useState(today.getFullYear());
  const [currentMonth, setCurrentMonth] = useState(today.getMonth());
  const [selectedDate, setSelectedDate] = useState<string>(
    `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}-${String(today.getDate()).padStart(2, "0")}`
  );

  // Modales
  const [showEventModal, setShowEventModal] = useState(false);
  const [editingEvent, setEditingEvent] = useState<AgendaEvent | null>(null);

  const [showTaskModal, setShowTaskModal] = useState(false);
  const [editingTask, setEditingTask] = useState<AgendaTask | null>(null);

  // Carga inicial
  const loadData = async () => {
    try {
      setLoading(true);
      const res = await fetch("/api/agenda");
      const data = await res.json();
      if (res.ok) {
        setEvents(data.events || []);
        setTasks(data.tasks || []);
        setAgents(data.agents || []);
      } else {
        toast.error("Error al cargar la agenda");
      }
    } catch {
      toast.error("Error de conexión al cargar datos");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  // Navegación de mes
  const handlePrevMonth = () => {
    if (currentMonth === 0) {
      setCurrentMonth(11);
      setCurrentYear((y) => y - 1);
    } else {
      setCurrentMonth((m) => m - 1);
    }
  };

  const handleNextMonth = () => {
    if (currentMonth === 11) {
      setCurrentMonth(0);
      setCurrentYear((y) => y + 1);
    } else {
      setCurrentMonth((m) => m + 1);
    }
  };

  const handleGoToday = () => {
    const now = new Date();
    setCurrentYear(now.getFullYear());
    setCurrentMonth(now.getMonth());
    setSelectedDate(
      `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`
    );
  };

  // Cuadrícula de días para el calendario
  const calendarDays = useMemo(() => {
    const firstDayIndex = new Date(currentYear, currentMonth, 1).getDay();
    // Ajustar para que Lunes sea 0 (domingo es 0 en JS -> convertir a 6)
    const startingDay = (firstDayIndex + 6) % 7;
    const daysInMonth = new Date(currentYear, currentMonth + 1, 0).getDate();
    const daysInPrevMonth = new Date(currentYear, currentMonth, 0).getDate();

    const days: { dateStr: string; dayNum: number; isCurrentMonth: boolean }[] = [];

    // Días del mes anterior
    for (let i = startingDay - 1; i >= 0; i--) {
      const d = daysInPrevMonth - i;
      const m = currentMonth === 0 ? 12 : currentMonth;
      const y = currentMonth === 0 ? currentYear - 1 : currentYear;
      days.push({
        dateStr: `${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`,
        dayNum: d,
        isCurrentMonth: false,
      });
    }

    // Días del mes actual
    for (let d = 1; d <= daysInMonth; d++) {
      days.push({
        dateStr: `${currentYear}-${String(currentMonth + 1).padStart(2, "0")}-${String(d).padStart(2, "0")}`,
        dayNum: d,
        isCurrentMonth: true,
      });
    }

    // Días del mes siguiente para completar cuadrícula (máximo 42 celdas = 6 semanas)
    const remaining = 42 - days.length;
    for (let d = 1; d <= remaining; d++) {
      const m = currentMonth === 11 ? 1 : currentMonth + 2;
      const y = currentMonth === 11 ? currentYear + 1 : currentYear;
      days.push({
        dateStr: `${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`,
        dayNum: d,
        isCurrentMonth: false,
      });
    }

    return days;
  }, [currentYear, currentMonth]);

  // Filtrado de eventos y tareas
  const filteredEvents = useMemo(() => {
    return events.filter((evt) => {
      if (filterAssigned === "mine" && evt.assigned_to && evt.assigned_to !== "all" && evt.assigned_to !== currentAgent.email) {
        return false;
      }
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        const matchTitle = (evt.title || "").toLowerCase().includes(q);
        const matchDesc = (evt.description || "").toLowerCase().includes(q);
        const matchLoc = (evt.location || "").toLowerCase().includes(q);
        if (!matchTitle && !matchDesc && !matchLoc) return false;
      }
      return true;
    });
  }, [events, filterAssigned, searchQuery, currentAgent.email]);

  const filteredTasks = useMemo(() => {
    return tasks.filter((tsk) => {
      if (filterAssigned === "mine" && tsk.assigned_to && tsk.assigned_to !== "all" && tsk.assigned_to !== currentAgent.email) {
        return false;
      }
      if (filterPriority !== "all" && tsk.priority !== filterPriority) {
        return false;
      }
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        const matchTitle = (tsk.title || "").toLowerCase().includes(q);
        const matchDesc = (tsk.description || "").toLowerCase().includes(q);
        if (!matchTitle && !matchDesc) return false;
      }
      return true;
    });
  }, [tasks, filterAssigned, filterPriority, searchQuery, currentAgent.email]);

  // Eventos y tareas para la fecha seleccionada
  const selectedDateEvents = useMemo(() => {
    return filteredEvents.filter((e) => e.date === selectedDate);
  }, [filteredEvents, selectedDate]);

  const selectedDateTasks = useMemo(() => {
    return filteredTasks.filter((t) => t.due_date === selectedDate);
  }, [filteredTasks, selectedDate]);

  // Métricas rápidas
  const todayStr = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}-${String(today.getDate()).padStart(2, "0")}`;
  const eventsTodayCount = events.filter((e) => e.date === todayStr).length;
  const pendingTasksCount = tasks.filter((t) => t.status !== "completed").length;
  const completedTasksCount = tasks.filter((t) => t.status === "completed").length;
  const completionRate = tasks.length > 0 ? Math.round((completedTasksCount / tasks.length) * 100) : 0;

  // Acciones sobre tareas
  const handleToggleTask = async (task: AgendaTask) => {
    const nextStatus = task.status === "completed" ? "pending" : "completed";
    try {
      const res = await fetch("/api/agenda", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ taskId: task.id, status: nextStatus }),
      });
      if (res.ok) {
        setTasks((prev) =>
          prev.map((t) =>
            t.id === task.id
              ? { ...t, status: nextStatus, completed_at: nextStatus === "completed" ? new Date().toISOString() : null }
              : t
          )
        );
        toast.success(nextStatus === "completed" ? "Tarea completada 🎉" : "Tarea reactivada");
      }
    } catch {
      toast.error("Error al actualizar tarea");
    }
  };

  const handleUpdateTaskStatus = async (taskId: string, newStatus: "pending" | "in_progress" | "completed") => {
    try {
      const res = await fetch("/api/agenda", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ taskId, status: newStatus }),
      });
      if (res.ok) {
        setTasks((prev) =>
          prev.map((t) => (t.id === taskId ? { ...t, status: newStatus } : t))
        );
      }
    } catch {
      toast.error("Error al mover tarea");
    }
  };

  const handleToggleChecklistItem = async (taskId: string, itemId: string, currentDone: boolean) => {
    try {
      const res = await fetch("/api/agenda", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ taskId, checklistItemId: itemId, checklistDone: !currentDone }),
      });
      if (res.ok) {
        setTasks((prev) =>
          prev.map((t) => {
            if (t.id === taskId) {
              const updatedCl = (t.checklist || []).map((ci) =>
                ci.id === itemId ? { ...ci, done: !currentDone } : ci
              );
              return { ...t, checklist: updatedCl };
            }
            return t;
          })
        );
      }
    } catch {
      toast.error("Error al actualizar checklist");
    }
  };

  const handleDeleteItem = async (id: string, type: "event" | "task") => {
    if (!confirm(`¿Eliminar ${type === "event" ? "este evento" : "esta tarea"} permanentemente?`)) return;
    try {
      const res = await fetch(`/api/agenda?id=${id}&type=${type}`, { method: "DELETE" });
      if (res.ok) {
        if (type === "event") {
          setEvents((prev) => prev.filter((e) => e.id !== id));
          toast.success("Evento eliminado");
        } else {
          setTasks((prev) => prev.filter((t) => t.id !== id));
          toast.success("Tarea eliminada");
        }
      }
    } catch {
      toast.error("Error al eliminar");
    }
  };

  const getAgentLabel = (email?: string) => {
    if (!email || email === "all") return "Equipo General";
    const found = agents.find((a) => a.email === email);
    if (found) {
      return [found.nombre, found.apellido].filter(Boolean).join(" ") || found.email;
    }
    return email.split("@")[0];
  };

  return (
    <div className="flex-1 flex flex-col min-h-0 bg-background text-foreground overflow-hidden">
      {/* ── Encabezado Premium ── */}
      <div className="px-6 py-4 border-b border-border/70 bg-card/60 backdrop-blur-sm shrink-0 space-y-3">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <div className="flex items-center gap-2">
              <div className="p-2 rounded-xl bg-gradient-to-tr from-violet-600 to-indigo-600 text-white shadow-lg shadow-violet-500/20">
                <CalendarIcon className="h-5 w-5" />
              </div>
              <div>
                <h1 className="text-lg font-black tracking-tight text-foreground flex items-center gap-2">
                  Calendario & Agenda
                  <span className="text-[10px] uppercase font-bold tracking-widest px-2 py-0.5 rounded-full bg-violet-500/10 text-violet-400 border border-violet-500/20">
                    Productividad Sekunet
                  </span>
                </h1>
                <p className="text-xs text-muted-foreground">
                  Organización unificada de eventos, citas y lista de tareas para todo el equipo
                </p>
              </div>
            </div>
          </div>

          {/* Botones de acción rápida */}
          <div className="flex items-center gap-2 shrink-0">
            <button
              onClick={() => {
                setEditingEvent(null);
                setShowEventModal(true);
              }}
              className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-gradient-to-r from-violet-600 to-indigo-600 text-white hover:from-violet-500 hover:to-indigo-500 font-bold text-xs shadow-md shadow-violet-600/20 transition-all active:scale-[0.98]"
            >
              <Plus className="h-3.5 w-3.5" />
              <span>Nuevo Evento</span>
            </button>
            <button
              onClick={() => {
                setEditingTask(null);
                setShowTaskModal(true);
              }}
              className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-secondary hover:bg-secondary/80 border border-border text-foreground font-bold text-xs transition-all active:scale-[0.98]"
            >
              <Plus className="h-3.5 w-3.5 text-violet-400" />
              <span>Nueva Tarea</span>
            </button>
            <button
              onClick={loadData}
              disabled={loading}
              title="Actualizar datos"
              className="p-2 rounded-xl border border-border bg-card hover:bg-muted text-muted-foreground hover:text-foreground transition-colors"
            >
              <RefreshCw className={`h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`} />
            </button>
          </div>
        </div>

        {/* Barra de métricas y pestañas */}
        <div className="flex flex-wrap items-center justify-between gap-3 pt-1">
          {/* Métricas rápidas */}
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-2 px-3 py-1.5 rounded-xl bg-muted/40 border border-border/50 text-xs">
              <Clock className="h-3.5 w-3.5 text-sky-400" />
              <span className="text-muted-foreground">Eventos hoy:</span>
              <span className="font-bold text-foreground">{eventsTodayCount}</span>
            </div>
            <div className="flex items-center gap-2 px-3 py-1.5 rounded-xl bg-muted/40 border border-border/50 text-xs">
              <Flame className="h-3.5 w-3.5 text-amber-400" />
              <span className="text-muted-foreground">Tareas pendientes:</span>
              <span className="font-bold text-foreground">{pendingTasksCount}</span>
            </div>
            <div className="hidden md:flex items-center gap-2 px-3 py-1.5 rounded-xl bg-muted/40 border border-border/50 text-xs">
              <CheckCircle2 className="h-3.5 w-3.5 text-emerald-400" />
              <span className="text-muted-foreground">Completadas:</span>
              <span className="font-bold text-emerald-400">{completedTasksCount} ({completionRate}%)</span>
            </div>
          </div>

          {/* Selector de Pestañas Principales */}
          <div className="flex items-center gap-1 p-1 rounded-xl bg-muted/50 border border-border/60">
            <button
              onClick={() => setActiveTab("calendar")}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${
                activeTab === "calendar"
                  ? "bg-card text-foreground shadow-sm border border-border/80"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              <CalendarIcon className="h-3.5 w-3.5 text-violet-400" />
              <span>Calendario & Agenda</span>
            </button>
            <button
              onClick={() => setActiveTab("tasks")}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${
                activeTab === "tasks"
                  ? "bg-card text-foreground shadow-sm border border-border/80"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              <ListTodo className="h-3.5 w-3.5 text-emerald-400" />
              <span>Tareas To-Do</span>
              {pendingTasksCount > 0 && (
                <span className="px-1.5 py-0.2 rounded-full bg-amber-500/20 text-amber-400 text-[10px] font-black">
                  {pendingTasksCount}
                </span>
              )}
            </button>
          </div>
        </div>
      </div>

      {/* ── Barra de Búsqueda y Filtros ── */}
      <div className="px-6 py-2.5 border-b border-border/40 bg-card/20 flex flex-wrap items-center justify-between gap-3 shrink-0">
        <div className="flex items-center gap-2 flex-1 max-w-sm">
          <div className="relative w-full">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
            <input
              type="text"
              placeholder="Buscar eventos o tareas..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-8 pr-3 py-1.5 rounded-xl border border-border bg-background text-xs text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-violet-500"
            />
            {searchQuery && (
              <button
                onClick={() => setSearchQuery("")}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
              >
                <X className="h-3 w-3" />
              </button>
            )}
          </div>
        </div>

        <div className="flex items-center gap-2">
          {/* Filtro asignado */}
          <div className="flex items-center gap-1 text-xs">
            <Filter className="h-3 w-3 text-muted-foreground" />
            <select
              value={filterAssigned}
              onChange={(e) => setFilterAssigned(e.target.value as any)}
              className="rounded-lg border border-border bg-background px-2.5 py-1 text-xs text-foreground focus:outline-none focus:ring-1 focus:ring-violet-500 cursor-pointer"
            >
              <option value="all">Todo el equipo</option>
              <option value="mine">Solo asignado a mí</option>
            </select>
          </div>

          {/* Si está en pestaña de tareas, mostrar filtro de prioridad y toggle lista/kanban */}
          {activeTab === "tasks" && (
            <>
              <select
                value={filterPriority}
                onChange={(e) => setFilterPriority(e.target.value)}
                className="rounded-lg border border-border bg-background px-2.5 py-1 text-xs text-foreground focus:outline-none focus:ring-1 focus:ring-violet-500 cursor-pointer"
              >
                <option value="all">Todas las prioridades</option>
                <option value="alta">Prioridad Alta</option>
                <option value="media">Prioridad Media</option>
                <option value="baja">Prioridad Baja</option>
              </select>

              <div className="flex items-center gap-1 p-0.5 rounded-lg bg-muted/60 border border-border">
                <button
                  onClick={() => setTaskViewMode("list")}
                  title="Vista de Lista"
                  className={`p-1.5 rounded-md transition-colors ${
                    taskViewMode === "list" ? "bg-card text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"
                  }`}
                >
                  <ListTodo className="h-3.5 w-3.5" />
                </button>
                <button
                  onClick={() => setTaskViewMode("kanban")}
                  title="Vista Tablero Kanban"
                  className={`p-1.5 rounded-md transition-colors ${
                    taskViewMode === "kanban" ? "bg-card text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"
                  }`}
                >
                  <Columns className="h-3.5 w-3.5" />
                </button>
              </div>
            </>
          )}
        </div>
      </div>

      {/* ── CUERPO PRINCIPAL SEGÚN PESTAÑA ── */}
      <div className="flex-1 min-h-0 overflow-y-auto p-6">
        {activeTab === "calendar" ? (
          /* ── VISTA 1: CALENDARIO MENSUAL + TIMELINE DEL DÍA ── */
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 min-h-full">
            {/* Calendario mensual interactivo (8 cols) */}
            <div className="lg:col-span-8 flex flex-col space-y-4">
              {/* Controles del mes */}
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <h2 className="text-base font-black text-foreground">
                    {MONTH_NAMES[currentMonth]} {currentYear}
                  </h2>
                  <button
                    onClick={handleGoToday}
                    className="text-[11px] font-bold px-2 py-0.5 rounded-lg bg-violet-500/10 text-violet-400 border border-violet-500/20 hover:bg-violet-500/20 transition-colors"
                  >
                    Hoy
                  </button>
                </div>

                <div className="flex items-center gap-1">
                  <button
                    onClick={handlePrevMonth}
                    className="p-1.5 rounded-lg border border-border bg-card hover:bg-muted text-muted-foreground hover:text-foreground transition-colors"
                    title="Mes anterior"
                  >
                    <ChevronLeft className="h-4 w-4" />
                  </button>
                  <button
                    onClick={handleNextMonth}
                    className="p-1.5 rounded-lg border border-border bg-card hover:bg-muted text-muted-foreground hover:text-foreground transition-colors"
                    title="Mes siguiente"
                  >
                    <ChevronRight className="h-4 w-4" />
                  </button>
                </div>
              </div>

              {/* Cuadrícula del Calendario */}
              <div className="rounded-2xl border border-border bg-card overflow-hidden shadow-sm">
                {/* Cabecera de días de la semana */}
                <div className="grid grid-cols-7 border-b border-border/80 bg-muted/40 text-center text-xs font-bold text-muted-foreground py-2.5">
                  {DAY_NAMES.map((dn) => (
                    <div key={dn}>{dn}</div>
                  ))}
                </div>

                {/* Celdas de días */}
                <div className="grid grid-cols-7 auto-rows-fr divide-x divide-y divide-border/60">
                  {calendarDays.map((cd) => {
                    const isToday = cd.dateStr === todayStr;
                    const isSelected = cd.dateStr === selectedDate;
                    const dayEvents = filteredEvents.filter((e) => e.date === cd.dateStr);
                    const dayTasks = filteredTasks.filter((t) => t.due_date === cd.dateStr && t.status !== "completed");

                    return (
                      <div
                        key={cd.dateStr}
                        onClick={() => setSelectedDate(cd.dateStr)}
                        className={`min-h-[96px] p-2 flex flex-col transition-all cursor-pointer ${
                          !cd.isCurrentMonth
                            ? "bg-muted/10 opacity-40 hover:opacity-75"
                            : isSelected
                            ? "bg-violet-500/10 ring-1 ring-inset ring-violet-500/40"
                            : "bg-card hover:bg-muted/30"
                        }`}
                      >
                        {/* Número del día */}
                        <div className="flex items-center justify-between mb-1.5">
                          <span
                            className={`text-xs font-bold h-6 w-6 grid place-items-center rounded-full ${
                              isToday
                                ? "bg-violet-600 text-white font-black shadow-md shadow-violet-600/30"
                                : isSelected
                                ? "bg-violet-500/20 text-violet-400"
                                : "text-muted-foreground"
                            }`}
                          >
                            {cd.dayNum}
                          </span>

                          {/* Indicadores de volumen */}
                          {(dayEvents.length > 0 || dayTasks.length > 0) && (
                            <div className="flex items-center gap-1">
                              {dayEvents.length > 0 && (
                                <span className="h-1.5 w-1.5 rounded-full bg-violet-400" />
                              )}
                              {dayTasks.length > 0 && (
                                <span className="h-1.5 w-1.5 rounded-full bg-amber-400" />
                              )}
                            </div>
                          )}
                        </div>

                        {/* Chips de eventos dentro de la celda (máx 2 visibles) */}
                        <div className="flex-1 space-y-1 overflow-hidden">
                          {dayEvents.slice(0, 2).map((evt) => {
                            const catStyle = CATEGORY_COLORS[evt.category] || CATEGORY_COLORS.otro;
                            return (
                              <div
                                key={evt.id}
                                className={`text-[10px] truncate px-1.5 py-0.5 rounded font-medium border ${catStyle.bg} ${catStyle.text} ${catStyle.border}`}
                                title={`${evt.start_time ? evt.start_time + " - " : ""}${evt.title}`}
                              >
                                {evt.start_time && <span className="font-mono text-[9px] mr-1">{evt.start_time}</span>}
                                <span>{evt.title}</span>
                              </div>
                            );
                          })}

                          {dayTasks.slice(0, 1).map((tsk) => (
                            <div
                              key={tsk.id}
                              className="text-[10px] truncate px-1.5 py-0.5 rounded font-medium bg-amber-500/10 text-amber-400 border border-amber-500/20"
                              title={`Tarea: ${tsk.title}`}
                            >
                              ✓ {tsk.title}
                            </div>
                          ))}

                          {dayEvents.length + dayTasks.length > 3 && (
                            <p className="text-[9px] font-bold text-muted-foreground pl-1">
                              +{dayEvents.length + dayTasks.length - 3} más
                            </p>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>

            {/* Panel lateral: Agenda y actividades de la fecha seleccionada (4 cols) */}
            <div className="lg:col-span-4 flex flex-col space-y-4">
              <div className="p-4 rounded-2xl border border-border bg-card shadow-sm space-y-4 flex-1 flex flex-col">
                <div className="flex items-center justify-between border-b border-border/70 pb-3">
                  <div>
                    <h3 className="text-xs font-black uppercase tracking-wider text-muted-foreground">
                      Agenda del Día
                    </h3>
                    <p className="text-sm font-bold text-foreground mt-0.5 capitalize">
                      {new Date(selectedDate + "T12:00:00").toLocaleDateString("es-ES", {
                        weekday: "long",
                        day: "numeric",
                        month: "long",
                      })}
                    </p>
                  </div>
                  <button
                    onClick={() => {
                      setEditingEvent({
                        id: "",
                        title: "",
                        date: selectedDate,
                        category: "reunion",
                        status: "confirmed",
                        created_by: currentAgent.email,
                        created_at: "",
                        updated_at: "",
                      });
                      setShowEventModal(true);
                    }}
                    className="p-1.5 rounded-lg bg-violet-600 hover:bg-violet-500 text-white transition-colors"
                    title="Añadir evento en este día"
                  >
                    <Plus className="h-4 w-4" />
                  </button>
                </div>

                {/* Lista de Eventos del Día */}
                <div className="flex-1 overflow-y-auto space-y-2.5 pr-1 max-h-[460px]">
                  {selectedDateEvents.length === 0 && selectedDateTasks.length === 0 ? (
                    <div className="text-center py-12 text-muted-foreground space-y-2">
                      <CalendarIcon className="h-8 w-8 mx-auto opacity-30 text-violet-400" />
                      <p className="text-xs">No hay eventos ni tareas agendadas para este día.</p>
                      <button
                        onClick={() => {
                          setEditingEvent({
                            id: "",
                            title: "",
                            date: selectedDate,
                            category: "reunion",
                            status: "confirmed",
                            created_by: currentAgent.email,
                            created_at: "",
                            updated_at: "",
                          });
                          setShowEventModal(true);
                        }}
                        className="text-xs font-semibold text-violet-400 hover:underline"
                      >
                        + Programar evento ahora
                      </button>
                    </div>
                  ) : (
                    <>
                      {/* Eventos */}
                      {selectedDateEvents.map((evt) => {
                        const catStyle = CATEGORY_COLORS[evt.category] || CATEGORY_COLORS.otro;
                        return (
                          <div
                            key={evt.id}
                            className="p-3 rounded-xl border border-border/80 bg-background/60 hover:bg-muted/30 transition-all space-y-2 group"
                          >
                            <div className="flex items-start justify-between gap-2">
                              <div className="space-y-1 min-w-0">
                                <div className="flex items-center gap-1.5 flex-wrap">
                                  <span className={`text-[9px] font-bold uppercase px-1.5 py-0.5 rounded border ${catStyle.bg} ${catStyle.text} ${catStyle.border}`}>
                                    {catStyle.label}
                                  </span>
                                  {evt.all_day ? (
                                    <span className="text-[10px] text-muted-foreground font-semibold">Todo el día</span>
                                  ) : (
                                    (evt.start_time || evt.end_time) && (
                                      <span className="text-[10px] font-mono text-muted-foreground">
                                        {evt.start_time || "--"} {evt.end_time ? `- ${evt.end_time}` : ""}
                                      </span>
                                    )
                                  )}
                                </div>
                                <h4 className="font-bold text-xs text-foreground leading-tight">
                                  {evt.title}
                                </h4>
                              </div>

                              <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                                <button
                                  onClick={() => {
                                    setEditingEvent(evt);
                                    setShowEventModal(true);
                                  }}
                                  className="p-1 rounded text-muted-foreground hover:text-foreground"
                                  title="Editar evento"
                                >
                                  <Edit3 className="h-3 w-3" />
                                </button>
                                <button
                                  onClick={() => handleDeleteItem(evt.id, "event")}
                                  className="p-1 rounded text-muted-foreground hover:text-rose-400"
                                  title="Eliminar evento"
                                >
                                  <Trash2 className="h-3 w-3" />
                                </button>
                              </div>
                            </div>

                            {evt.description && (
                              <p className="text-[11px] text-muted-foreground line-clamp-2">
                                {evt.description}
                              </p>
                            )}

                            <div className="flex items-center justify-between text-[10px] text-muted-foreground pt-1 border-t border-border/40">
                              {evt.location && (
                                <span className="flex items-center gap-1 truncate">
                                  <MapPin className="h-3 w-3" /> {evt.location}
                                </span>
                              )}
                              <span className="flex items-center gap-1 ml-auto font-medium">
                                <User className="h-3 w-3" /> {getAgentLabel(evt.assigned_to)}
                              </span>
                            </div>
                          </div>
                        );
                      })}

                      {/* Tareas con vencimiento este día */}
                      {selectedDateTasks.length > 0 && (
                        <div className="pt-2">
                          <p className="text-[10px] font-bold uppercase tracking-wider text-amber-400 mb-1.5">
                            Tareas por entregar hoy:
                          </p>
                          <div className="space-y-1.5">
                            {selectedDateTasks.map((tsk) => (
                              <div
                                key={tsk.id}
                                className="flex items-center gap-2 p-2 rounded-lg bg-amber-500/10 border border-amber-500/20 text-xs"
                              >
                                <button onClick={() => handleToggleTask(tsk)}>
                                  <Square className="h-4 w-4 text-amber-400" />
                                </button>
                                <span className="flex-1 truncate font-medium text-foreground">{tsk.title}</span>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}
                    </>
                  )}
                </div>
              </div>
            </div>
          </div>
        ) : (
          /* ── VISTA 2: LISTA DE TAREAS Y KANBAN BOARD ── */
          <div className="space-y-6">
            {taskViewMode === "list" ? (
              /* Vista Lista */
              <div className="rounded-2xl border border-border bg-card overflow-hidden shadow-sm">
                <div className="p-4 border-b border-border/80 flex items-center justify-between">
                  <h3 className="text-xs font-black uppercase tracking-wider text-muted-foreground">
                    Tareas Activas ({filteredTasks.length})
                  </h3>
                  <button
                    onClick={() => {
                      setEditingTask(null);
                      setShowTaskModal(true);
                    }}
                    className="flex items-center gap-1 text-xs font-bold text-violet-400 hover:text-violet-300"
                  >
                    <Plus className="h-3.5 w-3.5" />
                    <span>Añadir tarea</span>
                  </button>
                </div>

                {filteredTasks.length === 0 ? (
                  <div className="p-12 text-center text-muted-foreground space-y-2">
                    <CheckSquare className="h-8 w-8 mx-auto opacity-30 text-emerald-400" />
                    <p className="text-xs">No hay tareas pendientes según los filtros actuales.</p>
                  </div>
                ) : (
                  <div className="divide-y divide-border/60">
                    {filteredTasks.map((tsk) => {
                      const isCompleted = tsk.status === "completed";
                      const prStyle = PRIORITY_STYLES[tsk.priority] || PRIORITY_STYLES.media;
                      const isOverdue = tsk.due_date && tsk.due_date < todayStr && !isCompleted;
                      const isDueToday = tsk.due_date === todayStr && !isCompleted;
                      const checklistTotal = (tsk.checklist || []).length;
                      const checklistDone = (tsk.checklist || []).filter((c) => c.done).length;

                      return (
                        <div
                          key={tsk.id}
                          className={`p-3.5 flex items-start gap-3 transition-colors hover:bg-muted/30 group ${
                            isCompleted ? "opacity-60 bg-muted/10" : ""
                          }`}
                        >
                          {/* Checkbox de completado rápido */}
                          <button
                            onClick={() => handleToggleTask(tsk)}
                            className="mt-0.5 text-muted-foreground hover:text-emerald-400 transition-colors shrink-0"
                          >
                            {isCompleted ? (
                              <CheckCircle2 className="h-4 w-4 text-emerald-500 fill-emerald-500/20" />
                            ) : (
                              <Square className="h-4 w-4" />
                            )}
                          </button>

                          {/* Contenido de la tarea */}
                          <div className="flex-1 min-w-0 space-y-1">
                            <div className="flex items-center gap-2 flex-wrap">
                              <h4
                                className={`text-xs font-bold leading-tight ${
                                  isCompleted ? "line-through text-muted-foreground" : "text-foreground"
                                }`}
                              >
                                {tsk.title}
                              </h4>

                              {/* Badge de prioridad */}
                              <span className={`text-[9px] font-bold uppercase px-1.5 py-0.5 rounded border ${prStyle.bg} ${prStyle.text} ${prStyle.border}`}>
                                {prStyle.label}
                              </span>

                              {/* Badge de fecha límite */}
                              {tsk.due_date && (
                                <span
                                  className={`text-[10px] font-medium flex items-center gap-1 ${
                                    isOverdue
                                      ? "text-rose-400 font-bold"
                                      : isDueToday
                                      ? "text-amber-400 font-bold"
                                      : "text-muted-foreground"
                                  }`}
                                >
                                  <Clock className="h-3 w-3" />
                                  {isOverdue ? `Vencida (${tsk.due_date})` : isDueToday ? "Vence hoy" : tsk.due_date}
                                </span>
                              )}
                            </div>

                            {tsk.description && (
                              <p className="text-[11px] text-muted-foreground line-clamp-2">
                                {tsk.description}
                              </p>
                            )}

                            {/* Subtareas checklist */}
                            {checklistTotal > 0 && (
                              <div className="space-y-1 pt-1.5">
                                <div className="flex items-center gap-2 text-[10px] text-muted-foreground">
                                  <span>Subtareas: {checklistDone}/{checklistTotal}</span>
                                  <div className="h-1.5 w-24 bg-muted rounded-full overflow-hidden">
                                    <div
                                      className="h-full bg-emerald-500 rounded-full transition-all"
                                      style={{ width: `${Math.round((checklistDone / checklistTotal) * 100)}%` }}
                                    />
                                  </div>
                                </div>

                                <div className="space-y-1 pl-1">
                                  {tsk.checklist?.map((ci) => (
                                    <div
                                      key={ci.id}
                                      onClick={() => handleToggleChecklistItem(tsk.id, ci.id, ci.done)}
                                      className="flex items-center gap-1.5 text-[11px] text-muted-foreground hover:text-foreground cursor-pointer"
                                    >
                                      {ci.done ? (
                                        <Check className="h-3 w-3 text-emerald-400" />
                                      ) : (
                                        <Square className="h-3 w-3 opacity-60" />
                                      )}
                                      <span className={ci.done ? "line-through opacity-60" : ""}>{ci.text}</span>
                                    </div>
                                  ))}
                                </div>
                              </div>
                            )}
                          </div>

                          {/* Responsable y acciones */}
                          <div className="flex items-center gap-2 shrink-0">
                            <span className="text-[11px] text-muted-foreground font-medium flex items-center gap-1 hidden sm:flex">
                              <User className="h-3 w-3" /> {getAgentLabel(tsk.assigned_to)}
                            </span>

                            <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                              <button
                                onClick={() => {
                                  setEditingTask(tsk);
                                  setShowTaskModal(true);
                                }}
                                className="p-1 rounded text-muted-foreground hover:text-foreground"
                                title="Editar tarea"
                              >
                                <Edit3 className="h-3.5 w-3.5" />
                              </button>
                              <button
                                onClick={() => handleDeleteItem(tsk.id, "task")}
                                className="p-1 rounded text-muted-foreground hover:text-rose-400"
                                title="Eliminar tarea"
                              >
                                <Trash2 className="h-3.5 w-3.5" />
                              </button>
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            ) : (
              /* Vista Tablero Kanban */
              <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                {(
                  [
                    { id: "pending", title: "Por Hacer", color: "text-sky-400", border: "border-sky-500/30" },
                    { id: "in_progress", title: "En Proceso", color: "text-amber-400", border: "border-amber-500/30" },
                    { id: "completed", title: "Completadas", color: "text-emerald-400", border: "border-emerald-500/30" },
                  ] as const
                ).map((col) => {
                  const colTasks = filteredTasks.filter((t) => t.status === col.id);
                  return (
                    <div key={col.id} className="rounded-2xl border border-border bg-card/60 p-4 space-y-3 flex flex-col min-h-[450px]">
                      <div className="flex items-center justify-between border-b border-border/70 pb-2">
                        <div className="flex items-center gap-2">
                          <h4 className={`text-xs font-black uppercase tracking-wider ${col.color}`}>
                            {col.title}
                          </h4>
                          <span className="px-1.5 py-0.2 rounded-full bg-muted text-muted-foreground text-[10px] font-bold">
                            {colTasks.length}
                          </span>
                        </div>
                        {col.id === "pending" && (
                          <button
                            onClick={() => {
                              setEditingTask(null);
                              setShowTaskModal(true);
                            }}
                            className="p-1 rounded hover:bg-muted text-muted-foreground hover:text-foreground"
                            title="Nueva tarea"
                          >
                            <Plus className="h-3.5 w-3.5" />
                          </button>
                        )}
                      </div>

                      <div className="flex-1 space-y-2.5 overflow-y-auto pr-1">
                        {colTasks.length === 0 ? (
                          <div className="h-32 grid place-items-center text-center text-xs text-muted-foreground/60 border-2 border-dashed border-border/40 rounded-xl">
                            Sin tareas en esta columna
                          </div>
                        ) : (
                          colTasks.map((tsk) => {
                            const prStyle = PRIORITY_STYLES[tsk.priority] || PRIORITY_STYLES.media;
                            const isOverdue = tsk.due_date && tsk.due_date < todayStr && col.id !== "completed";

                            return (
                              <div
                                key={tsk.id}
                                className="p-3 rounded-xl border border-border bg-card shadow-sm hover:border-violet-500/40 transition-all space-y-2 group"
                              >
                                <div className="flex items-start justify-between gap-2">
                                  <h5 className={`font-bold text-xs leading-tight ${col.id === "completed" ? "line-through text-muted-foreground" : "text-foreground"}`}>
                                    {tsk.title}
                                  </h5>
                                  <span className={`text-[8px] font-bold uppercase px-1.5 py-0.2 rounded border shrink-0 ${prStyle.bg} ${prStyle.text} ${prStyle.border}`}>
                                    {prStyle.label}
                                  </span>
                                </div>

                                {tsk.description && (
                                  <p className="text-[11px] text-muted-foreground line-clamp-2">
                                    {tsk.description}
                                  </p>
                                )}

                                <div className="flex items-center justify-between text-[10px] text-muted-foreground pt-1 border-t border-border/40">
                                  {tsk.due_date && (
                                    <span className={isOverdue ? "text-rose-400 font-bold" : ""}>
                                      {tsk.due_date}
                                    </span>
                                  )}
                                  <span className="font-medium truncate ml-auto">
                                    {getAgentLabel(tsk.assigned_to)}
                                  </span>
                                </div>

                                {/* Movimiento de columnas */}
                                <div className="flex items-center justify-between pt-1 gap-1 border-t border-border/30">
                                  <div className="flex items-center gap-1">
                                    <button
                                      onClick={() => {
                                        setEditingTask(tsk);
                                        setShowTaskModal(true);
                                      }}
                                      className="p-1 rounded hover:bg-muted text-muted-foreground hover:text-foreground"
                                      title="Editar"
                                    >
                                      <Edit3 className="h-3 w-3" />
                                    </button>
                                    <button
                                      onClick={() => handleDeleteItem(tsk.id, "task")}
                                      className="p-1 rounded hover:bg-muted text-muted-foreground hover:text-rose-400"
                                      title="Eliminar"
                                    >
                                      <Trash2 className="h-3 w-3" />
                                    </button>
                                  </div>

                                  <div className="flex items-center gap-1">
                                    {col.id !== "pending" && (
                                      <button
                                        onClick={() => handleUpdateTaskStatus(tsk.id, col.id === "completed" ? "in_progress" : "pending")}
                                        className="px-1.5 py-0.5 rounded bg-muted text-[10px] font-semibold text-muted-foreground hover:text-foreground"
                                        title="Mover hacia atrás"
                                      >
                                        ←
                                      </button>
                                    )}
                                    {col.id !== "completed" && (
                                      <button
                                        onClick={() => handleUpdateTaskStatus(tsk.id, col.id === "pending" ? "in_progress" : "completed")}
                                        className="px-1.5 py-0.5 rounded bg-violet-600/20 text-violet-400 hover:bg-violet-600/30 text-[10px] font-bold flex items-center gap-0.5"
                                        title="Avanzar etapa"
                                      >
                                        <span>Avanzar</span>
                                        <ArrowRight className="h-2.5 w-2.5" />
                                      </button>
                                    )}
                                  </div>
                                </div>
                              </div>
                            );
                          })
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}
      </div>

      {/* ── MODAL: NUEVO / EDITAR EVENTO ── */}
      {showEventModal && (
        <div
          className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4 animate-in fade-in duration-150"
          onClick={() => setShowEventModal(false)}
        >
          <div
            className="w-full max-w-lg rounded-2xl border border-border bg-card shadow-2xl p-6 space-y-4"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between border-b border-border/70 pb-3">
              <h3 className="font-black text-sm text-foreground flex items-center gap-2">
                <CalendarIcon className="h-4 w-4 text-violet-400" />
                {editingEvent?.id ? "Editar Evento" : "Nuevo Evento de Agenda"}
              </h3>
              <button
                onClick={() => setShowEventModal(false)}
                className="p-1 rounded-lg hover:bg-muted text-muted-foreground"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <form
              onSubmit={async (e) => {
                e.preventDefault();
                const form = e.currentTarget;
                const fd = new FormData(form);
                const title = String(fd.get("title") || "").trim();
                if (!title) {
                  toast.error("El título es obligatorio");
                  return;
                }

                const itemPayload = {
                  id: editingEvent?.id || undefined,
                  title,
                  description: String(fd.get("description") || "").trim(),
                  date: String(fd.get("date") || selectedDate),
                  start_time: String(fd.get("start_time") || ""),
                  end_time: String(fd.get("end_time") || ""),
                  all_day: fd.get("all_day") === "on",
                  category: String(fd.get("category") || "reunion"),
                  assigned_to: String(fd.get("assigned_to") || "all"),
                  location: String(fd.get("location") || "").trim(),
                  created_by: currentAgent.email,
                  created_by_name: [currentAgent.nombre, currentAgent.apellido].filter(Boolean).join(" "),
                };

                try {
                  const res = await fetch("/api/agenda", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ type: "event", item: itemPayload }),
                  });
                  if (res.ok) {
                    toast.success(editingEvent?.id ? "Evento actualizado" : "Evento programado");
                    setShowEventModal(false);
                    loadData();
                  } else {
                    toast.error("No se pudo guardar el evento");
                  }
                } catch {
                  toast.error("Error de conexión");
                }
              }}
              className="space-y-3.5"
            >
              <div>
                <label className="block text-xs font-semibold text-muted-foreground mb-1">
                  Título del evento *
                </label>
                <input
                  name="title"
                  type="text"
                  required
                  defaultValue={editingEvent?.title || ""}
                  placeholder="Ej: Reunión semanal de taller, Entrega a cliente..."
                  className="w-full text-xs px-3 py-2 rounded-xl border border-border bg-background focus:outline-none focus:ring-1 focus:ring-violet-500 text-foreground"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-muted-foreground mb-1">
                    Categoría
                  </label>
                  <select
                    name="category"
                    defaultValue={editingEvent?.category || "reunion"}
                    className="w-full text-xs px-3 py-2 rounded-xl border border-border bg-background focus:outline-none focus:ring-1 focus:ring-violet-500 text-foreground cursor-pointer"
                  >
                    <option value="reunion">Reunión de Equipo</option>
                    <option value="taller">Taller / Mantenimiento</option>
                    <option value="entrega">Entrega de Equipo</option>
                    <option value="cliente">Atención a Cliente</option>
                    <option value="personal">Personal / Permiso</option>
                    <option value="otro">Otro</option>
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-muted-foreground mb-1">
                    Asignado a
                  </label>
                  <select
                    name="assigned_to"
                    defaultValue={editingEvent?.assigned_to || "all"}
                    className="w-full text-xs px-3 py-2 rounded-xl border border-border bg-background focus:outline-none focus:ring-1 focus:ring-violet-500 text-foreground cursor-pointer"
                  >
                    <option value="all">Equipo General (Todos)</option>
                    {agents.map((ag) => (
                      <option key={ag.email} value={ag.email}>
                        {[ag.nombre, ag.apellido].filter(Boolean).join(" ") || ag.email}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-3 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-muted-foreground mb-1">
                    Fecha
                  </label>
                  <input
                    name="date"
                    type="date"
                    required
                    defaultValue={editingEvent?.date || selectedDate}
                    className="w-full text-xs px-2.5 py-2 rounded-xl border border-border bg-background focus:outline-none focus:ring-1 focus:ring-violet-500 text-foreground"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-muted-foreground mb-1">
                    Hora inicio
                  </label>
                  <input
                    name="start_time"
                    type="time"
                    defaultValue={editingEvent?.start_time || "09:00"}
                    className="w-full text-xs px-2.5 py-2 rounded-xl border border-border bg-background focus:outline-none focus:ring-1 focus:ring-violet-500 text-foreground"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-muted-foreground mb-1">
                    Hora fin
                  </label>
                  <input
                    name="end_time"
                    type="time"
                    defaultValue={editingEvent?.end_time || "10:00"}
                    className="w-full text-xs px-2.5 py-2 rounded-xl border border-border bg-background focus:outline-none focus:ring-1 focus:ring-violet-500 text-foreground"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-muted-foreground mb-1">
                  Ubicación / Sala / Estación
                </label>
                <input
                  name="location"
                  type="text"
                  defaultValue={editingEvent?.location || ""}
                  placeholder="Ej: Mostrador 1, Sala de capacitación, Estación de taller..."
                  className="w-full text-xs px-3 py-2 rounded-xl border border-border bg-background focus:outline-none focus:ring-1 focus:ring-violet-500 text-foreground"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-muted-foreground mb-1">
                  Descripción o notas adicionales
                </label>
                <textarea
                  name="description"
                  rows={3}
                  defaultValue={editingEvent?.description || ""}
                  placeholder="Detalles relevantes, objetivos o requerimientos..."
                  className="w-full text-xs px-3 py-2 rounded-xl border border-border bg-background focus:outline-none focus:ring-1 focus:ring-violet-500 text-foreground resize-none"
                />
              </div>

              <div className="flex items-center justify-end gap-2 pt-2 border-t border-border/70">
                <button
                  type="button"
                  onClick={() => setShowEventModal(false)}
                  className="px-4 py-2 rounded-xl border border-border text-xs font-semibold hover:bg-muted transition-colors text-foreground"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 rounded-xl bg-violet-600 hover:bg-violet-500 text-white text-xs font-bold transition-all shadow-md shadow-violet-600/20"
                >
                  Guardar Evento
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ── MODAL: NUEVA / EDITAR TAREA ── */}
      {showTaskModal && (
        <div
          className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4 animate-in fade-in duration-150"
          onClick={() => setShowTaskModal(false)}
        >
          <div
            className="w-full max-w-lg rounded-2xl border border-border bg-card shadow-2xl p-6 space-y-4"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between border-b border-border/70 pb-3">
              <h3 className="font-black text-sm text-foreground flex items-center gap-2">
                <CheckSquare className="h-4 w-4 text-emerald-400" />
                {editingTask?.id ? "Editar Tarea" : "Nueva Tarea To-Do"}
              </h3>
              <button
                onClick={() => setShowTaskModal(false)}
                className="p-1 rounded-lg hover:bg-muted text-muted-foreground"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <form
              onSubmit={async (e) => {
                e.preventDefault();
                const form = e.currentTarget;
                const fd = new FormData(form);
                const title = String(fd.get("title") || "").trim();
                if (!title) {
                  toast.error("El título es obligatorio");
                  return;
                }

                const itemPayload = {
                  id: editingTask?.id || undefined,
                  title,
                  description: String(fd.get("description") || "").trim(),
                  priority: String(fd.get("priority") || "media"),
                  status: String(fd.get("status") || "pending"),
                  due_date: String(fd.get("due_date") || ""),
                  assigned_to: String(fd.get("assigned_to") || "all"),
                  checklist: editingTask?.checklist || [],
                  created_by: currentAgent.email,
                  created_by_name: [currentAgent.nombre, currentAgent.apellido].filter(Boolean).join(" "),
                };

                try {
                  const res = await fetch("/api/agenda", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ type: "task", item: itemPayload }),
                  });
                  if (res.ok) {
                    toast.success(editingTask?.id ? "Tarea actualizada" : "Tarea creada");
                    setShowTaskModal(false);
                    loadData();
                  } else {
                    toast.error("No se pudo guardar la tarea");
                  }
                } catch {
                  toast.error("Error de conexión");
                }
              }}
              className="space-y-3.5"
            >
              <div>
                <label className="block text-xs font-semibold text-muted-foreground mb-1">
                  Título de la tarea *
                </label>
                <input
                  name="title"
                  type="text"
                  required
                  defaultValue={editingTask?.title || ""}
                  placeholder="Ej: Calibrar cama de impresión, Cotizar repuesto a cliente..."
                  className="w-full text-xs px-3 py-2 rounded-xl border border-border bg-background focus:outline-none focus:ring-1 focus:ring-violet-500 text-foreground"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-muted-foreground mb-1">
                    Prioridad
                  </label>
                  <select
                    name="priority"
                    defaultValue={editingTask?.priority || "media"}
                    className="w-full text-xs px-3 py-2 rounded-xl border border-border bg-background focus:outline-none focus:ring-1 focus:ring-violet-500 text-foreground cursor-pointer"
                  >
                    <option value="alta">Prioridad Alta 🔥</option>
                    <option value="media">Prioridad Media ⚡</option>
                    <option value="baja">Prioridad Baja 🌱</option>
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-muted-foreground mb-1">
                    Estado
                  </label>
                  <select
                    name="status"
                    defaultValue={editingTask?.status || "pending"}
                    className="w-full text-xs px-3 py-2 rounded-xl border border-border bg-background focus:outline-none focus:ring-1 focus:ring-violet-500 text-foreground cursor-pointer"
                  >
                    <option value="pending">Por Hacer</option>
                    <option value="in_progress">En Proceso</option>
                    <option value="completed">Completada</option>
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-muted-foreground mb-1">
                    Fecha límite (Due Date)
                  </label>
                  <input
                    name="due_date"
                    type="date"
                    defaultValue={editingTask?.due_date || ""}
                    className="w-full text-xs px-3 py-2 rounded-xl border border-border bg-background focus:outline-none focus:ring-1 focus:ring-violet-500 text-foreground"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-muted-foreground mb-1">
                    Asignado a
                  </label>
                  <select
                    name="assigned_to"
                    defaultValue={editingTask?.assigned_to || currentAgent.email}
                    className="w-full text-xs px-3 py-2 rounded-xl border border-border bg-background focus:outline-none focus:ring-1 focus:ring-violet-500 text-foreground cursor-pointer"
                  >
                    <option value="all">Equipo General (Cualquiera)</option>
                    {agents.map((ag) => (
                      <option key={ag.email} value={ag.email}>
                        {[ag.nombre, ag.apellido].filter(Boolean).join(" ") || ag.email}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-muted-foreground mb-1">
                  Descripción o notas
                </label>
                <textarea
                  name="description"
                  rows={3}
                  defaultValue={editingTask?.description || ""}
                  placeholder="Instrucciones específicas, números de parte, contexto..."
                  className="w-full text-xs px-3 py-2 rounded-xl border border-border bg-background focus:outline-none focus:ring-1 focus:ring-violet-500 text-foreground resize-none"
                />
              </div>

              <div className="flex items-center justify-end gap-2 pt-2 border-t border-border/70">
                <button
                  type="button"
                  onClick={() => setShowTaskModal(false)}
                  className="px-4 py-2 rounded-xl border border-border text-xs font-semibold hover:bg-muted transition-colors text-foreground"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold transition-all shadow-md shadow-emerald-600/20"
                >
                  Guardar Tarea
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
