"use client";

import React, { useState, useEffect } from "react";
import {
  Wrench,
  Package,
  Sparkles,
  ClipboardList,
  RefreshCw,
  Users,
  Phone,
  FileText,
  Briefcase,
  Bath,
  Sandwich,
  ShieldCheck,
  GraduationCap,
  Utensils,
  SlidersHorizontal,
  Trash2,
  Plus,
  Edit2,
  X,
  Check,
  RotateCcw,
  Tag,
  FolderTree,
} from "lucide-react";
import { toast } from "sonner";

export interface ManualTaskItem {
  id: string;
  label: string;
  category: string;
  subcategory?: string | null;
  iconName?: string;
  color?: string;
}

const AVAILABLE_ICONS: { name: string; label: string; icon: any }[] = [
  { name: "Wrench", label: "Herramienta", icon: Wrench },
  { name: "Package", label: "Paquete / Bodega", icon: Package },
  { name: "Sparkles", label: "Limpieza", icon: Sparkles },
  { name: "ClipboardList", label: "Inventario / Lista", icon: ClipboardList },
  { name: "RefreshCw", label: "Firmware / Reset", icon: RefreshCw },
  { name: "Users", label: "Reuniones / Equipo", icon: Users },
  { name: "Phone", label: "Llamadas / Teléfono", icon: Phone },
  { name: "Briefcase", label: "Gestión", icon: Briefcase },
  { name: "FileText", label: "Documentos", icon: FileText },
  { name: "ShieldCheck", label: "Garantías / Seguridad", icon: ShieldCheck },
  { name: "GraduationCap", label: "Capacitación (OJT)", icon: GraduationCap },
  { name: "Sandwich", label: "Descanso / Almuerzo", icon: Sandwich },
  { name: "Bath", label: "Pausa Sanitaria", icon: Bath },
  { name: "Trash2", label: "Residuos", icon: Trash2 },
];

export function getTaskIconComponent(iconName?: string) {
  const found = AVAILABLE_ICONS.find((i) => i.name.toLowerCase() === (iconName || "").toLowerCase());
  return found ? found.icon : Wrench;
}

interface Props {
  isOpen: boolean;
  onClose: () => void;
  categoriesConfig?: any[];
  onTasksUpdated?: (tasks: ManualTaskItem[]) => void;
}

export function ManualTasksManagerModal({
  isOpen,
  onClose,
  categoriesConfig = [],
  onTasksUpdated,
}: Props) {
  const [tasks, setTasks] = useState<ManualTaskItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);

  // Formulario de agregar / editar
  const [isEditing, setIsEditing] = useState<string | null>(null); // task ID or null
  const [formLabel, setFormLabel] = useState("");
  const [formCategory, setFormCategory] = useState("Servicio de Taller");
  const [formSubcategory, setFormSubcategory] = useState("");
  const [formIconName, setFormIconName] = useState("Wrench");

  // Cargar lista de labores
  const loadTasks = async () => {
    setLoading(true);
    try {
      // 1. Intentar desde localStorage primero
      const saved = localStorage.getItem("sek_manual_tasks_list");
      if (saved) {
        try {
          const parsed = JSON.parse(saved);
          if (Array.isArray(parsed) && parsed.length > 0) setTasks(parsed);
        } catch {}
      }

      // 2. Fetch desde API
      const res = await fetch("/api/activity/manual-tasks");
      const data = await res.json();
      if (data.success && Array.isArray(data.tasks)) {
        setTasks(data.tasks);
        localStorage.setItem("sek_manual_tasks_list", JSON.stringify(data.tasks));
        onTasksUpdated?.(data.tasks);
      }
    } catch (err) {
      console.error("Error al cargar labores manuales:", err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (isOpen) {
      loadTasks();
      resetForm();
    }
  }, [isOpen]);

  const resetForm = () => {
    setIsEditing(null);
    setFormLabel("");
    setFormCategory(categoriesConfig[0]?.label || categoriesConfig[0]?.id || "Servicio de Taller");
    setFormSubcategory("");
    setFormIconName("Wrench");
  };

  const handleStartEdit = (task: ManualTaskItem) => {
    setIsEditing(task.id);
    setFormLabel(task.label);
    setFormCategory(task.category);
    setFormSubcategory(task.subcategory || "");
    setFormIconName(task.iconName || "Wrench");
  };

  // Obtener subcategorías disponibles para la categoría seleccionada en el formulario
  const currentCategoryObj = categoriesConfig.find(
    (c) => (c.label || c.id || "").toLowerCase() === formCategory.toLowerCase()
  );
  const availableSubcategories: string[] = currentCategoryObj?.subcategories || [];

  const handleSave = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    const cleanLabel = formLabel.trim();
    if (!cleanLabel) {
      toast.error("El nombre de la labor es obligatorio");
      return;
    }

    setSaving(true);
    try {
      const taskPayload: ManualTaskItem = {
        id: isEditing || `manual_${Date.now()}`,
        label: cleanLabel,
        category: formCategory,
        subcategory: formSubcategory.trim() || null,
        iconName: formIconName,
      };

      let updatedList: ManualTaskItem[] = [];
      if (isEditing) {
        updatedList = tasks.map((t) => (t.id === isEditing ? taskPayload : t));
      } else {
        // Evitar duplicados por nombre
        updatedList = tasks.filter((t) => t.label.toLowerCase() !== cleanLabel.toLowerCase());
        updatedList.push(taskPayload);
      }

      // 1. Actualización optimista local
      setTasks(updatedList);
      localStorage.setItem("sek_manual_tasks_list", JSON.stringify(updatedList));
      window.dispatchEvent(new CustomEvent("sekunet_manual_tasks_updated", { detail: updatedList }));
      onTasksUpdated?.(updatedList);

      // 2. Persistir en servidor
      const res = await fetch("/api/activity/manual-tasks", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: isEditing ? "update" : "add",
          task: taskPayload,
        }),
      });

      const data = await res.json();
      if (data.success && Array.isArray(data.tasks)) {
        setTasks(data.tasks);
        localStorage.setItem("sek_manual_tasks_list", JSON.stringify(data.tasks));
        window.dispatchEvent(new CustomEvent("sekunet_manual_tasks_updated", { detail: data.tasks }));
        onTasksUpdated?.(data.tasks);
      }

      toast.success(isEditing ? "Labor manual actualizada" : "Labor manual agregada a la barra");
      resetForm();
    } catch (err: any) {
      toast.error("Error al guardar: " + err.message);
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (taskId: string, label: string) => {
    const updatedList = tasks.filter((t) => t.id !== taskId);
    setTasks(updatedList);
    localStorage.setItem("sek_manual_tasks_list", JSON.stringify(updatedList));
    window.dispatchEvent(new CustomEvent("sekunet_manual_tasks_updated", { detail: updatedList }));
    onTasksUpdated?.(updatedList);

    try {
      await fetch("/api/activity/manual-tasks", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "delete", id: taskId }),
      });
      toast.success(`"${label}" eliminada de la barra`);
    } catch {
      toast.error("Error al eliminar del servidor");
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[999999] bg-black/60 backdrop-blur-xs flex items-center justify-center p-3 animate-in fade-in duration-150">
      <div className="bg-card border border-border shadow-2xl rounded-2xl w-full max-w-2xl max-h-[90vh] flex flex-col overflow-hidden text-foreground">
        {/* Cabecera del Panel */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-border/70 bg-muted/20">
          <div className="flex items-center gap-2.5">
            <div className="h-8 w-8 rounded-xl bg-amber-500/20 text-amber-400 grid place-items-center border border-amber-500/30">
              <Wrench className="h-4 w-4" />
            </div>
            <div>
              <h3 className="text-sm font-black tracking-tight text-foreground">
                Gestión de Labores Manuales
              </h3>
              <p className="text-[11px] text-muted-foreground mt-0.5">
                Control exclusivo de las labores y cronómetros mostrados en la barra lateral.
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted/70 transition-colors cursor-pointer"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Contenido dividido: Formulario superior + Lista inferior */}
        <div className="flex-1 overflow-y-auto p-5 space-y-4">
          {/* Formulario Agregar / Editar */}
          <form
            onSubmit={handleSave}
            className="p-4 rounded-xl border border-violet-500/30 bg-violet-500/[0.04] space-y-3"
          >
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-violet-400 flex items-center gap-1.5">
                {isEditing ? <Edit2 className="h-3.5 w-3.5" /> : <Plus className="h-3.5 w-3.5" />}
                <span>{isEditing ? "Editar Labor Manual" : "Nueva Labor Manual para la Barra"}</span>
              </span>
              {isEditing && (
                <button
                  type="button"
                  onClick={resetForm}
                  className="text-[11px] text-muted-foreground hover:text-foreground font-semibold"
                >
                  Cancelar edición
                </button>
              )}
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {/* Nombre de la labor */}
              <div className="space-y-1">
                <label className="text-[11px] font-bold text-muted-foreground">
                  Nombre de la Labor / Tarea *
                </label>
                <input
                  type="text"
                  required
                  placeholder="Ej: Ir a Bodega, Diagnóstico, Limpieza..."
                  value={formLabel}
                  onChange={(e) => setFormLabel(e.target.value)}
                  className="w-full text-xs px-3 py-1.5 rounded-lg border border-border bg-background focus:outline-none focus:ring-1 focus:ring-violet-500 text-foreground"
                />
              </div>

              {/* Categoría Operativa */}
              <div className="space-y-1">
                <label className="text-[11px] font-bold text-muted-foreground">
                  Categoría Principal *
                </label>
                <select
                  value={formCategory}
                  onChange={(e) => {
                    setFormCategory(e.target.value);
                    setFormSubcategory("");
                  }}
                  className="w-full text-xs px-3 py-1.5 rounded-lg border border-border bg-background focus:outline-none focus:ring-1 focus:ring-violet-500 text-foreground cursor-pointer"
                >
                  {categoriesConfig.map((cat) => (
                    <option key={cat.id} value={cat.label || cat.id}>
                      {cat.label || cat.id}
                    </option>
                  ))}
                  {categoriesConfig.length === 0 && (
                    <>
                      <option value="Servicio de Taller">Servicio de Taller</option>
                      <option value="Gestión del Taller">Gestión del Taller</option>
                      <option value="Control Administrativo">Control Administrativo</option>
                      <option value="Soporte">Soporte</option>
                    </>
                  )}
                </select>
              </div>

              {/* Subcategoría Dependiente */}
              <div className="space-y-1">
                <label className="text-[11px] font-bold text-muted-foreground">
                  Subcategoría Operativa
                </label>
                {availableSubcategories.length > 0 ? (
                  <select
                    value={formSubcategory}
                    onChange={(e) => setFormSubcategory(e.target.value)}
                    className="w-full text-xs px-3 py-1.5 rounded-lg border border-border bg-background focus:outline-none focus:ring-1 focus:ring-violet-500 text-foreground cursor-pointer"
                  >
                    <option value="">-- General / Sin subcategoría --</option>
                    {availableSubcategories.map((sub) => (
                      <option key={sub} value={sub}>
                        {sub}
                      </option>
                    ))}
                  </select>
                ) : (
                  <input
                    type="text"
                    placeholder="Opcional: Subcategoría específica"
                    value={formSubcategory}
                    onChange={(e) => setFormSubcategory(e.target.value)}
                    className="w-full text-xs px-3 py-1.5 rounded-lg border border-border bg-background focus:outline-none focus:ring-1 focus:ring-violet-500 text-foreground"
                  />
                )}
              </div>

              {/* Selector de Ícono con vista previa */}
              <div className="space-y-1">
                <label className="text-[11px] font-bold text-muted-foreground">
                  Ícono Representativo
                </label>
                <div className="flex items-center gap-2">
                  <select
                    value={formIconName}
                    onChange={(e) => setFormIconName(e.target.value)}
                    className="w-full text-xs px-3 py-1.5 rounded-lg border border-border bg-background focus:outline-none focus:ring-1 focus:ring-violet-500 text-foreground cursor-pointer"
                  >
                    {AVAILABLE_ICONS.map((ic) => (
                      <option key={ic.name} value={ic.name}>
                        {ic.label}
                      </option>
                    ))}
                  </select>
                  <div className="h-8 w-8 rounded-lg bg-amber-500/20 text-amber-400 grid place-items-center shrink-0 border border-amber-500/30">
                    {React.createElement(getTaskIconComponent(formIconName), {
                      className: "h-4 w-4",
                    })}
                  </div>
                </div>
              </div>
            </div>

            <div className="flex justify-end pt-1">
              <button
                type="submit"
                disabled={saving || !formLabel.trim()}
                className="flex items-center gap-1.5 px-4 py-1.5 rounded-xl bg-violet-600 hover:bg-violet-700 text-white font-bold text-xs shadow-sm transition-all active:scale-95 disabled:opacity-50 cursor-pointer"
              >
                <Check className="h-3.5 w-3.5" />
                <span>{isEditing ? "Guardar Cambios" : "Agregar a la Barra"}</span>
              </button>
            </div>
          </form>

          {/* Lista actual de labores configuradas */}
          <div className="space-y-2">
            <div className="flex items-center justify-between px-1">
              <span className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">
                Labores Activas en la Barra ({tasks.length})
              </span>
              <span className="text-[10px] text-muted-foreground">
                Se muestran como botones directos con cronómetro
              </span>
            </div>

            {loading ? (
              <div className="py-8 text-center text-xs text-muted-foreground">
                Cargando labores...
              </div>
            ) : tasks.length === 0 ? (
              <div className="py-8 px-4 text-center rounded-xl border border-dashed border-border/70 text-muted-foreground">
                <Wrench className="h-6 w-6 mx-auto mb-1.5 opacity-50" />
                <p className="text-xs font-semibold">No hay labores manuales configuradas</p>
                <p className="text-[11px] mt-0.5">
                  Agregue una labor arriba para que aparezca inmediatamente en la barra lateral.
                </p>
              </div>
            ) : (
              <div className="grid grid-cols-1 gap-2">
                {tasks.map((task) => {
                  const Icon = getTaskIconComponent(task.iconName || task.label);
                  return (
                    <div
                      key={task.id}
                      className="flex items-center justify-between gap-3 p-2.5 px-3 rounded-xl border border-border/60 bg-muted/20 hover:bg-muted/40 transition-colors"
                    >
                      <div className="flex items-center gap-3 min-w-0 flex-1">
                        <div className="h-7 w-7 rounded-lg bg-amber-500/20 text-amber-400 grid place-items-center shrink-0 border border-amber-500/30">
                          <Icon className="h-3.5 w-3.5" />
                        </div>
                        <div className="min-w-0 flex-1">
                          <p className="font-bold text-xs text-foreground truncate">
                            {task.label}
                          </p>
                          <div className="flex items-center gap-1.5 mt-0.5 text-[10px] text-muted-foreground">
                            <span className="font-semibold text-violet-400">{task.category}</span>
                            {task.subcategory && (
                              <>
                                <span>•</span>
                                <span className="truncate">{task.subcategory}</span>
                              </>
                            )}
                          </div>
                        </div>
                      </div>

                      <div className="flex items-center gap-1 shrink-0">
                        <button
                          type="button"
                          onClick={() => handleStartEdit(task)}
                          title="Editar labor"
                          className="p-1.5 rounded-lg hover:bg-muted text-muted-foreground hover:text-foreground border border-border/50 transition-colors cursor-pointer"
                        >
                          <Edit2 className="h-3.5 w-3.5" />
                        </button>
                        <button
                          type="button"
                          onClick={() => handleDelete(task.id, task.label)}
                          title="Eliminar de la barra"
                          className="p-1.5 rounded-lg hover:bg-rose-500/20 text-muted-foreground hover:text-rose-400 border border-border/50 transition-colors cursor-pointer"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>

        {/* Footer */}
        <div className="px-5 py-3 border-t border-border/70 bg-muted/20 flex justify-end">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-1.5 rounded-xl border border-border hover:bg-muted text-xs font-semibold transition-colors cursor-pointer"
          >
            Cerrar
          </button>
        </div>
      </div>
    </div>
  );
}
