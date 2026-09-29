"use client";

import React, { useState, useEffect, useMemo } from "react";
import {
  Wrench,
  Hammer,
  Cpu,
  HardDrive,
  Laptop,
  Monitor,
  Zap,
  BatteryCharging,
  Stethoscope,
  Package,
  Boxes,
  Truck,
  Archive,
  Tag,
  ClipboardList,
  Layers,
  ShieldCheck,
  CheckCircle2,
  RefreshCw,
  FileText,
  FolderTree,
  Briefcase,
  SlidersHorizontal,
  Search,
  AlertTriangle,
  Users,
  UserPlus,
  Phone,
  Headphones,
  MessageSquare,
  Mail,
  Video,
  Sparkles,
  Brush,
  Trash2,
  Sandwich,
  Coffee,
  Bath,
  GraduationCap,
  Clock,
  Timer,
  Check,
  Edit2,
  X,
  Plus,
  LayoutGrid,
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

export interface AvailableIconDef {
  name: string;
  label: string;
  category: "taller" | "logistica" | "gestion" | "comunicacion" | "pausas";
  keywords: string;
  icon: any;
}

export const AVAILABLE_ICONS: AvailableIconDef[] = [
  // Taller & Hardware
  { name: "Wrench", label: "Herramienta", category: "taller", keywords: "llave inglesa reparacion taller tecnico", icon: Wrench },
  { name: "Hammer", label: "Martillo", category: "taller", keywords: "herramienta golpe construccion ensamblaje", icon: Hammer },
  { name: "Cpu", label: "Procesador", category: "taller", keywords: "chip cpu placa madre micro electronica", icon: Cpu },
  { name: "HardDrive", label: "Disco Duro", category: "taller", keywords: "almacenamiento ssd hdd disco memoria", icon: HardDrive },
  { name: "Laptop", label: "Portátil / Laptop", category: "taller", keywords: "pc portatil equipo computador notebook", icon: Laptop },
  { name: "Monitor", label: "Pantalla / Monitor", category: "taller", keywords: "display pantalla video monitor", icon: Monitor },
  { name: "Zap", label: "Energía / Soldadura", category: "taller", keywords: "voltaje corriente soldar electronica rayo", icon: Zap },
  { name: "BatteryCharging", label: "Carga / Batería", category: "taller", keywords: "bateria carga cargador pila energia", icon: BatteryCharging },
  { name: "Stethoscope", label: "Diagnóstico", category: "taller", keywords: "revision diagnostico chequeo prueba", icon: Stethoscope },
  
  // Logística & Bodega
  { name: "Package", label: "Paquete / Repuestos", category: "logistica", keywords: "bodega repuesto caja paquete envio", icon: Package },
  { name: "Boxes", label: "Bodega / Stock", category: "logistica", keywords: "cajas bodega inventario stock mercaderia", icon: Boxes },
  { name: "Truck", label: "Transporte / Entrega", category: "logistica", keywords: "camion flete despacho envio logistica", icon: Truck },
  { name: "Archive", label: "Archivo / Almacén", category: "logistica", keywords: "gaveta archivo almacenamiento cajon", icon: Archive },
  { name: "Tag", label: "Etiqueta / SKU", category: "logistica", keywords: "etiquetado codigo precio garantia tag", icon: Tag },
  { name: "ClipboardList", label: "Inventario / Lista", category: "logistica", keywords: "conteo inventario lista planilla control", icon: ClipboardList },
  { name: "Layers", label: "Pallets / Estantería", category: "logistica", keywords: "estantes niveles organizacion capas", icon: Layers },

  // Gestión, Calidad & Software
  { name: "ShieldCheck", label: "Garantía / Seguridad", category: "gestion", keywords: "garantia escudo seguro validado ok", icon: ShieldCheck },
  { name: "CheckCircle2", label: "Control de Calidad", category: "gestion", keywords: "aprobado calidad chequeo ok verificacion", icon: CheckCircle2 },
  { name: "RefreshCw", label: "Reset / Firmware", category: "gestion", keywords: "firmware actualizar reinicio reset mikrotik", icon: RefreshCw },
  { name: "FileText", label: "Informe / Guía", category: "gestion", keywords: "reporte papel factura documento orden", icon: FileText },
  { name: "FolderTree", label: "Clasificación", category: "gestion", keywords: "arbol carpetas gestion proceso", icon: FolderTree },
  { name: "Briefcase", label: "Gestión Administrativa", category: "gestion", keywords: "maletin oficina administracion tramite", icon: Briefcase },
  { name: "SlidersHorizontal", label: "Calibración", category: "gestion", keywords: "ajuste configuracion nivel calibrar", icon: SlidersHorizontal },
  { name: "Search", label: "Inspección Visual", category: "gestion", keywords: "lupa buscar inspeccionar revisar", icon: Search },
  { name: "AlertTriangle", label: "Incidencias", category: "gestion", keywords: "alerta peligro error aviso falla", icon: AlertTriangle },

  // Comunicación & Atención
  { name: "Users", label: "Reunión / Equipo", category: "comunicacion", keywords: "equipo reunion junta personas charla", icon: Users },
  { name: "UserPlus", label: "Ventanilla / Mostrador", category: "comunicacion", keywords: "cliente atencion mostrador ventanilla recepcion", icon: UserPlus },
  { name: "Phone", label: "Llamadas / Teléfono", category: "comunicacion", keywords: "llamada telefono soporte auricular", icon: Phone },
  { name: "Headphones", label: "Soporte Telefónico", category: "comunicacion", keywords: "diadema headset ayuda soporte callcenter", icon: Headphones },
  { name: "MessageSquare", label: "Chat / Mensajería", category: "comunicacion", keywords: "chat whatsapp mensaje respuesta", icon: MessageSquare },
  { name: "Mail", label: "Correo Electrónico", category: "comunicacion", keywords: "email correo mensaje carta", icon: Mail },
  { name: "Video", label: "Videollamada / Teams", category: "comunicacion", keywords: "camara teams zoom video reunion", icon: Video },

  // Pausas & Mantenimiento
  { name: "Sparkles", label: "Limpieza de Taller", category: "pausas", keywords: "limpieza orden brillar polvo aseo", icon: Sparkles },
  { name: "Brush", label: "Pintura / Detalle", category: "pausas", keywords: "brocha mantenimiento pulido acabado", icon: Brush },
  { name: "Trash2", label: "Desechos / Residuos", category: "pausas", keywords: "basura residuos reciclaje descartar", icon: Trash2 },
  { name: "Sandwich", label: "Almuerzo / Comida", category: "pausas", keywords: "almuerzo comer sandwich alimento pausa", icon: Sandwich },
  { name: "Coffee", label: "Café / Pausa Corta", category: "pausas", keywords: "cafe descanso break merienda relax", icon: Coffee },
  { name: "Bath", label: "Pausa Sanitaria", category: "pausas", keywords: "bano sanitario aseo personal bano", icon: Bath },
  { name: "GraduationCap", label: "Capacitación / OJT", category: "pausas", keywords: "estudio clase entrenamiento ojt birrete", icon: GraduationCap },
  { name: "Clock", label: "Tiempo / Espera", category: "pausas", keywords: "espera tiempo reloj parada", icon: Clock },
  { name: "Timer", label: "Cronómetro General", category: "pausas", keywords: "cronometro tiempo medir", icon: Timer },
];

export function getTaskIconComponent(iconName?: string) {
  if (!iconName) return Wrench;
  const match = AVAILABLE_ICONS.find(
    (i) => i.name.toLowerCase() === iconName.toLowerCase()
  );
  return match ? match.icon : Wrench;
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

  // Cajón de Iconos modal/drawer
  const [iconDrawerOpen, setIconDrawerOpen] = useState(false);
  const [iconDrawerTargetTaskId, setIconDrawerTargetTaskId] = useState<string | null>(null); // si es para cambio rápido en la lista, guarda el ID
  const [iconSearchQuery, setIconSearchQuery] = useState("");
  const [iconCategoryFilter, setIconCategoryFilter] = useState<string>("todos");

  // Cargar lista de labores
  const loadTasks = async () => {
    setLoading(true);
    try {
      const saved = localStorage.getItem("sek_manual_tasks_list");
      if (saved) {
        try {
          const parsed = JSON.parse(saved);
          if (Array.isArray(parsed)) setTasks(parsed);
        } catch {}
      }

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

  const currentCategoryObj = categoriesConfig.find(
    (c) => (c.label || c.id || "").toLowerCase() === formCategory.toLowerCase()
  );
  const availableSubcategories: string[] = currentCategoryObj?.subcategories || [];

  // Guardar en formulario (crear o editar)
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
        updatedList = tasks.filter((t) => t.label.toLowerCase() !== cleanLabel.toLowerCase());
        updatedList.push(taskPayload);
      }

      // Sincronización inmediata (optimista)
      setTasks(updatedList);
      localStorage.setItem("sek_manual_tasks_list", JSON.stringify(updatedList));
      window.dispatchEvent(new CustomEvent("sekunet_manual_tasks_updated", { detail: updatedList }));
      onTasksUpdated?.(updatedList);

      // Persistir en servidor / Supabase
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

  // Cambio directo de icono en un clic (gestión real e instantánea)
  const handleSelectIcon = async (iconName: string) => {
    if (iconDrawerTargetTaskId) {
      // Cambio rápido para una labor existente en la lista
      const targetId = iconDrawerTargetTaskId;
      const updatedList = tasks.map((t) => (t.id === targetId ? { ...t, iconName } : t));
      
      setTasks(updatedList);
      localStorage.setItem("sek_manual_tasks_list", JSON.stringify(updatedList));
      window.dispatchEvent(new CustomEvent("sekunet_manual_tasks_updated", { detail: updatedList }));
      onTasksUpdated?.(updatedList);
      setIconDrawerOpen(false);
      setIconDrawerTargetTaskId(null);

      try {
        await fetch("/api/activity/manual-tasks", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            action: "update-icon",
            id: targetId,
            iconName,
          }),
        });
        toast.success("Ícono actualizado en la barra lateral");
      } catch {
        toast.error("Error al guardar el nuevo ícono en el servidor");
      }
    } else {
      // Selección para el formulario de alta/edición
      setFormIconName(iconName);
      setIconDrawerOpen(false);
    }
  };

  // Eliminar labor
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
      toast.success(`"${label}" eliminada de la barra lateral`);
    } catch {
      toast.error("Error al eliminar del servidor");
    }
  };

  // Filtrado de iconos dentro del cajón
  const filteredIcons = useMemo(() => {
    const q = iconSearchQuery.trim().toLowerCase();
    return AVAILABLE_ICONS.filter((item) => {
      const matchCat = iconCategoryFilter === "todos" || item.category === iconCategoryFilter;
      const matchQuery =
        !q ||
        item.name.toLowerCase().includes(q) ||
        item.label.toLowerCase().includes(q) ||
        item.keywords.toLowerCase().includes(q);
      return matchCat && matchQuery;
    });
  }, [iconSearchQuery, iconCategoryFilter]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[999999] bg-black/70 backdrop-blur-xs flex items-center justify-center p-3 animate-in fade-in duration-150">
      <div className="bg-card border border-border shadow-2xl rounded-2xl w-full max-w-2xl max-h-[92vh] flex flex-col overflow-hidden text-foreground">
        
        {/* Cabecera del Panel */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-border/70 bg-muted/20">
          <div className="flex items-center gap-2.5">
            <div className="h-8 w-8 rounded-xl bg-amber-500/20 text-amber-400 grid place-items-center border border-amber-500/30">
              <LayoutGrid className="h-4 w-4" />
            </div>
            <div>
              <h3 className="text-sm font-black tracking-tight text-foreground flex items-center gap-2">
                <span>Gestión de Labores e Íconos</span>
                <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-amber-500/15 text-amber-400 border border-amber-500/30 font-bold">
                  EN VIVO
                </span>
              </h3>
              <p className="text-[11px] text-muted-foreground mt-0.5">
                Configura los botones cuadrados, asigna íconos y controla lo que ve el técnico en la barra lateral.
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

        {/* Contenido: Formulario superior + Lista inferior */}
        <div className="flex-1 overflow-y-auto p-5 space-y-4">
          
          {/* Formulario Agregar / Editar */}
          <form
            onSubmit={handleSave}
            className="p-4 rounded-xl border border-violet-500/30 bg-violet-500/[0.04] space-y-3"
          >
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-violet-400 flex items-center gap-1.5">
                {isEditing ? <Edit2 className="h-3.5 w-3.5" /> : <Plus className="h-3.5 w-3.5" />}
                <span>{isEditing ? "Editar Labor Manual" : "Nueva Labor para la Barra Cuadrada"}</span>
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
                  Nombre de la Labor *
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

              {/* Categoría Principal */}
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

              {/* Subcategoría Opcional */}
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

              {/* Selector de Ícono con botón para abrir Cajón */}
              <div className="space-y-1">
                <label className="text-[11px] font-bold text-muted-foreground">
                  Ícono Representativo
                </label>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      setIconDrawerTargetTaskId(null);
                      setIconDrawerOpen(true);
                    }}
                    className="flex-1 flex items-center justify-between px-3 py-1.5 rounded-lg border border-border bg-background hover:bg-muted/60 transition-colors text-xs text-foreground cursor-pointer"
                  >
                    <div className="flex items-center gap-2">
                      <div className="h-6 w-6 rounded-md bg-amber-500/20 text-amber-400 grid place-items-center border border-amber-500/30">
                        {React.createElement(getTaskIconComponent(formIconName), {
                          className: "h-3.5 w-3.5",
                        })}
                      </div>
                      <span className="font-semibold">
                        {AVAILABLE_ICONS.find((i) => i.name === formIconName)?.label || formIconName}
                      </span>
                    </div>
                    <span className="text-[10px] text-violet-400 font-bold">Cambiar ícono...</span>
                  </button>
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

          {/* Lista actual de labores con acceso al cajón directo */}
          <div className="space-y-2">
            <div className="flex items-center justify-between px-1">
              <span className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">
                Labores Activas en la Barra ({tasks.length})
              </span>
              <span className="text-[10.5px] text-muted-foreground">
                Haz clic en el ícono de cualquier labor para cambiarlo en un solo clic
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
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                {tasks.map((task) => {
                  const Icon = getTaskIconComponent(task.iconName || task.label);
                  return (
                    <div
                      key={task.id}
                      className="flex items-center justify-between gap-2.5 p-2.5 rounded-xl border border-border/60 bg-muted/20 hover:bg-muted/40 transition-colors"
                    >
                      <div className="flex items-center gap-2.5 min-w-0 flex-1">
                        {/* Botón de ícono que abre el cajón directo para esa labor */}
                        <button
                          type="button"
                          onClick={() => {
                            setIconDrawerTargetTaskId(task.id);
                            setIconDrawerOpen(true);
                          }}
                          title="Haz clic para cambiar el ícono en el cajón"
                          className="h-9 w-9 rounded-xl bg-amber-500/20 hover:bg-amber-500/30 text-amber-400 grid place-items-center shrink-0 border border-amber-500/30 hover:border-amber-400 transition-all hover:scale-105 cursor-pointer shadow-xs group"
                        >
                          <Icon className="h-4 w-4 transition-transform group-hover:scale-110" />
                        </button>

                        <div className="min-w-0 flex-1">
                          <p className="font-bold text-xs text-foreground truncate" title={task.label}>
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
                          title="Editar nombre y categoría"
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

        {/* MODAL / DRAWER FLOTANTE: "CAJÓN DE ÍCONOS" */}
        {iconDrawerOpen && (
          <div className="fixed inset-0 z-[9999999] bg-black/80 backdrop-blur-md flex items-center justify-center p-4 animate-in fade-in duration-150">
            <div className="bg-card border border-border/80 shadow-2xl rounded-2xl w-full max-w-xl max-h-[85vh] flex flex-col overflow-hidden text-foreground">
              
              {/* Cabecera del Cajón de Íconos */}
              <div className="flex items-center justify-between px-5 py-3.5 border-b border-border/60 bg-muted/30">
                <div className="flex items-center gap-2">
                  <div className="h-7 w-7 rounded-lg bg-amber-500/20 text-amber-400 grid place-items-center border border-amber-500/30">
                    <LayoutGrid className="h-3.5 w-3.5" />
                  </div>
                  <div>
                    <h4 className="text-xs font-black tracking-tight text-foreground uppercase">
                      Cajón de Íconos
                    </h4>
                    <p className="text-[10px] text-muted-foreground">
                      {iconDrawerTargetTaskId
                        ? "Selecciona el nuevo ícono para actualizar la labor en tiempo real"
                        : "Selecciona el ícono para la labor"}
                    </p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    setIconDrawerOpen(false);
                    setIconDrawerTargetTaskId(null);
                  }}
                  className="p-1 rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted transition-colors cursor-pointer"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>

              {/* Filtro y pestañas dentro del cajón */}
              <div className="p-3 border-b border-border/50 bg-background/50 space-y-2">
                {/* Buscador de íconos */}
                <div className="relative">
                  <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground pointer-events-none" />
                  <input
                    type="text"
                    value={iconSearchQuery}
                    onChange={(e) => setIconSearchQuery(e.target.value)}
                    placeholder="Buscar por nombre o palabra clave (ej: martillo, bodega, limpieza, pc)..."
                    className="w-full text-xs pl-8 pr-8 py-1.5 rounded-lg border border-border bg-muted/30 placeholder:text-muted-foreground/60 text-foreground focus:outline-none focus:ring-1 focus:ring-amber-500"
                  />
                  {iconSearchQuery && (
                    <button
                      type="button"
                      onClick={() => setIconSearchQuery("")}
                      className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground p-0.5"
                    >
                      <X className="h-3 w-3" />
                    </button>
                  )}
                </div>

                {/* Filtro de Categorías */}
                <div className="flex flex-wrap gap-1 text-[10px]">
                  {[
                    { id: "todos", label: "Todos" },
                    { id: "taller", label: "Taller & Hardware" },
                    { id: "logistica", label: "Logística & Bodega" },
                    { id: "gestion", label: "Gestión & Calidad" },
                    { id: "comunicacion", label: "Comunicación" },
                    { id: "pausas", label: "Pausas & Aseo" },
                  ].map((cat) => (
                    <button
                      key={cat.id}
                      type="button"
                      onClick={() => setIconCategoryFilter(cat.id)}
                      className={`px-2.5 py-1 rounded-lg font-bold transition-all cursor-pointer ${
                        iconCategoryFilter === cat.id
                          ? "bg-amber-500/20 text-amber-300 border border-amber-500/40"
                          : "text-muted-foreground hover:text-foreground hover:bg-muted/40 border border-transparent"
                      }`}
                    >
                      {cat.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Cuadrícula de Íconos del Cajón */}
              <div className="flex-1 overflow-y-auto p-4">
                {filteredIcons.length === 0 ? (
                  <div className="py-12 text-center text-muted-foreground text-xs">
                    No se encontraron íconos con "{iconSearchQuery}"
                  </div>
                ) : (
                  <div className="grid grid-cols-4 sm:grid-cols-6 gap-2.5">
                    {filteredIcons.map((item) => {
                      const IconComponent = item.icon;
                      const isSelected =
                        (!iconDrawerTargetTaskId && formIconName === item.name) ||
                        (iconDrawerTargetTaskId &&
                          tasks.find((t) => t.id === iconDrawerTargetTaskId)?.iconName === item.name);

                      return (
                        <button
                          key={item.name}
                          type="button"
                          onClick={() => handleSelectIcon(item.name)}
                          className={`group flex flex-col items-center justify-center p-2.5 rounded-xl border text-center transition-all cursor-pointer ${
                            isSelected
                              ? "bg-amber-500/25 border-amber-400 text-amber-300 ring-2 ring-amber-400/50 shadow-md shadow-amber-500/20"
                              : "bg-muted/20 hover:bg-muted/60 border-border/60 hover:border-slate-500 text-muted-foreground hover:text-foreground hover:scale-105 active:scale-95"
                          }`}
                        >
                          <IconComponent className="h-5 w-5 mb-1.5 transition-transform group-hover:scale-110" />
                          <span className="text-[10px] font-bold leading-tight truncate w-full">
                            {item.label}
                          </span>
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>

              {/* Pie del Cajón */}
              <div className="px-5 py-3 border-t border-border/60 bg-muted/20 flex items-center justify-between text-[11px] text-muted-foreground">
                <span>{filteredIcons.length} íconos disponibles</span>
                <button
                  type="button"
                  onClick={() => {
                    setIconDrawerOpen(false);
                    setIconDrawerTargetTaskId(null);
                  }}
                  className="px-3 py-1 rounded-lg bg-muted hover:bg-muted/80 text-foreground font-bold text-xs cursor-pointer"
                >
                  Cerrar cajón
                </button>
              </div>

            </div>
          </div>
        )}

      </div>
    </div>
  );
}
