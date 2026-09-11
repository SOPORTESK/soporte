"use client";

import React, { useState, useEffect, useMemo } from "react";
import {
  Monitor,
  Phone,
  MessageSquare,
  Mail,
  FileText,
  Code,
  Globe,
  Youtube,
  ShieldCheck,
  TrendingUp,
  SlidersHorizontal,
  Check,
  RotateCcw,
  Search,
  X,
  ChevronDown,
  Plus,
  Trash2,
  Edit2,
  Wrench,
  Clock,
  Sparkles,
  Layers,
  Cpu,
  Package,
  LayoutDashboard,
  ClipboardList,
  UserPlus,
  Briefcase,
  GraduationCap,
  Users,
  Utensils,
  Sandwich,
  Bath,
  Hammer,
} from "lucide-react";

interface TimelineItem {
  created_at?: string;
  action: string;
  category: string;
  duration_ms?: number | null;
  metadata?: Record<string, any> | null;
}

interface Props {
  timeline: TimelineItem[];
  scheduleStart?: string;
  scheduleEnd?: string;
  scheduleEnabled?: boolean;
}

export interface CategoryItem {
  id: string;
  label: string;
  color: string;
  bgBar: string;
  iconName: string;
}

export const DEFAULT_CATEGORIES: CategoryItem[] = [
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

export const COLOR_PRESETS = [
  { name: "Verde", color: "text-emerald-400 border-emerald-500/30 bg-emerald-500/15", bgBar: "bg-emerald-500" },
  { name: "Índigo", color: "text-indigo-400 border-indigo-500/30 bg-indigo-500/15", bgBar: "bg-indigo-500" },
  { name: "Violeta", color: "text-violet-400 border-violet-500/30 bg-violet-500/15", bgBar: "bg-violet-500" },
  { name: "Fucsia", color: "text-fuchsia-400 border-fuchsia-500/30 bg-fuchsia-500/15", bgBar: "bg-fuchsia-500" },
  { name: "Azul", color: "text-blue-400 border-blue-500/30 bg-blue-500/15", bgBar: "bg-blue-500" },
  { name: "Naranja", color: "text-orange-400 border-orange-500/30 bg-orange-500/15", bgBar: "bg-orange-500" },
  { name: "Cyan", color: "text-cyan-400 border-cyan-500/30 bg-cyan-500/15", bgBar: "bg-cyan-500" },
  { name: "Ámbar", color: "text-amber-400 border-amber-500/30 bg-amber-500/15", bgBar: "bg-amber-500" },
  { name: "Rojo", color: "text-rose-400 border-rose-500/30 bg-rose-500/15", bgBar: "bg-rose-500" },
  { name: "Pizarra", color: "text-slate-400 border-slate-500/30 bg-slate-500/15", bgBar: "bg-slate-500" },
];

export const ICON_PRESETS = [
  "MessageSquare",
  "FileText",
  "Code",
  "TrendingUp",
  "Mail",
  "Phone",
  "Monitor",
  "ShieldCheck",
  "Wrench",
  "Globe",
  "Cpu",
  "Clock",
];

function renderCategoryIcon(iconName?: string, className: string = "h-4 w-4") {
  switch (iconName) {
    case "MessageSquare": return <MessageSquare className={className} />;
    case "FileText": return <FileText className={className} />;
    case "Code": return <Code className={className} />;
    case "TrendingUp": return <TrendingUp className={className} />;
    case "Mail": return <Mail className={className} />;
    case "Phone": return <Phone className={className} />;
    case "ShieldCheck": return <ShieldCheck className={className} />;
    case "Wrench": return <Wrench className={className} />;
    case "Globe": return <Globe className={className} />;
    case "Clock": return <Clock className={className} />;
    case "Sparkles": return <Sparkles className={className} />;
    case "Cpu": return <Cpu className={className} />;
    case "Monitor":
    default:
      return <Monitor className={className} />;
  }
}

export const WORKSHOP_CATEGORIES = DEFAULT_CATEGORIES;

export function getCategoryUI(catName: string) {
  const found = DEFAULT_CATEGORIES.find((c) => c.id === catName);
  if (found) return found;
  const lower = (catName || "").toLowerCase();
  if (lower.includes("chat") || lower.includes("mensajería")) return DEFAULT_CATEGORIES[0];
  if (lower.includes("ticket")) return DEFAULT_CATEGORIES[1];
  if (lower.includes("proceso") || lower.includes("desarrollo") || lower.includes("investiga")) return DEFAULT_CATEGORIES[2];
  if (lower.includes("admin") || lower.includes("control")) return DEFAULT_CATEGORIES[3];
  if (lower.includes("correo") || lower.includes("mail")) return DEFAULT_CATEGORIES[4];
  if (lower.includes("llamada") || lower.includes("telefón") || lower.includes("phone")) return DEFAULT_CATEGORIES[5];
  if (lower.includes("soporte") || lower.includes("redes") || lower.includes("taller")) return DEFAULT_CATEGORIES[6];
  if (lower.includes("garant") || lower.includes("rma")) return DEFAULT_CATEGORIES[7];
  return DEFAULT_CATEGORIES[DEFAULT_CATEGORIES.length - 1];
}

export const DEFAULT_KNOWN_MANUAL_TASKS = [
  "Ir a Bodega",
  "Exhibidores",
  "Inventario y Actualización de Bodega GAR",
  "Limpieza de taller",
  "Ir a Ventanilla",
  "Iniciar Diagnóstico Físico",
  "Soporte a Ventas",
  "Capacitacion de clientes",
  "Tiempo de Descanso",
  "Ir al Baño",
  "Reunión",
  "Capacitacion de Personal",
];

function getAppIcon(appName: string) {
  const name = appName.toLowerCase();
  // Labores manuales y físicas
  if (name.includes("bodega")) return <Package className="h-4 w-4 text-amber-400" />;
  if (name.includes("exhibidor")) return <LayoutDashboard className="h-4 w-4 text-emerald-400" />;
  if (name.includes("inventario gar") || name.includes("inventario y actualización") || name.includes("inventario bodega"))
    return <ClipboardList className="h-4 w-4 text-indigo-400" />;
  if (name.includes("limpieza")) return <Sparkles className="h-4 w-4 text-cyan-400" />;
  if (name.includes("ventanilla") || name.includes("mostrador")) return <UserPlus className="h-4 w-4 text-sky-400" />;
  if (name.includes("diagnóstico") || name.includes("diagnostico")) return <Wrench className="h-4 w-4 text-amber-500" />;
  if (name.includes("soporte a ventas") || name.includes("soporte ventas")) return <Briefcase className="h-4 w-4 text-blue-400" />;
  if (name.includes("capacita")) return <GraduationCap className="h-4 w-4 text-violet-400" />;
  if (name.includes("descanso") || name.includes("almuerzo") || name.includes("café") || name.includes("cafe"))
    return <Sandwich className="h-4 w-4 text-amber-400" />;
  if (name.includes("baño") || name.includes("bano")) return <Bath className="h-4 w-4 text-sky-400" />;
  if (name.includes("reunión") || name.includes("reunion")) return <Users className="h-4 w-4 text-indigo-400" />;
  if (name.includes("justificaci")) return <ClipboardList className="h-4 w-4 text-pink-400" />;

  // Aplicaciones de software
  if (name.includes("whatsapp")) return <MessageSquare className="h-4 w-4 text-emerald-400" />;
  if (name.includes("linkus") || name.includes("phone") || name.includes("llamada"))
    return <Phone className="h-4 w-4 text-orange-400" />;
  if (name.includes("outlook") || name.includes("mail") || name.includes("correo"))
    return <Mail className="h-4 w-4 text-blue-400" />;
  if (name.includes("excel") || name.includes("word") || name.includes("office"))
    return <FileText className="h-4 w-4 text-indigo-400" />;
  if (name.includes("antigravity") || name.includes("code") || name.includes("terminal") || name.includes("powershell") || name.includes("cursor"))
    return <Code className="h-4 w-4 text-cyan-400" />;
  if (name.includes("youtube") || name.includes("spotify") || name.includes("netflix"))
    return <Youtube className="h-4 w-4 text-rose-400" />;
  if (name.includes("odoo") || name.includes("garant") || name.includes("seka"))
    return <ShieldCheck className="h-4 w-4 text-violet-400" />;
  return <Globe className="h-4 w-4 text-muted-foreground" />;
}

export function extractSmartAppName(item: TimelineItem): string {
  const meta = (item.metadata || {}) as Record<string, any>;
  const rawAction = item.action || "";
  const action = rawAction.toLowerCase();
  const rawPath = (meta.path || meta.page || "").toLowerCase();

  // 1. Tareas manuales y justificaciones explícitas
  if (meta.task) return meta.task;
  if (meta.manual && meta.label) return meta.label;
  if (meta.justification && meta.reason) return `Justificación: ${meta.reason}`;

  // 2. Extracción de acciones manuales iniciadas / terminadas en taller
  if (action.startsWith("inició:") || action.startsWith("inicio:")) {
    const extracted = rawAction.replace(/^inici[oó]:\s*/i, "").trim();
    if (extracted) return extracted;
  }
  if (action.startsWith("terminó:") || action.startsWith("termino:")) {
    const withoutPrefix = rawAction.replace(/^termin[oó]:\s*/i, "").trim();
    const taskName = withoutPrefix.split("(")[0].trim();
    if (taskName) return taskName;
  }
  if (action.startsWith("justificación:") || action.startsWith("justificacion:")) {
    const withoutPrefix = rawAction.replace(/^justificaci[oó]n:\s*/i, "").trim();
    const taskName = withoutPrefix.split("(")[0].trim();
    if (taskName) return `Justificación: ${taskName}`;
  }

  // 3. Apps de escritorio / externas explícitas
  if (meta.app_name) return meta.app_name;
  if (meta.label) return meta.label;

  // 4. Labores físicas por contenido
  if (action.includes("bodega")) return "Ir a Bodega";
  if (action.includes("exhibidor")) return "Exhibidores";
  if (action.includes("inventario gar") || action.includes("inventario y actualización"))
    return "Inventario y Actualización de Bodega GAR";
  if (action.includes("limpieza")) return "Limpieza de taller";
  if (action.includes("ventanilla") || action.includes("mostrador")) return "Ir a Ventanilla";
  if (action.includes("diagnóstico") || action.includes("diagnostico")) return "Iniciar Diagnóstico Físico";
  if (action.includes("soporte a ventas") || action.includes("soporte ventas")) return "Soporte a Ventas";
  if (action.includes("descanso") || action.includes("almuerzo")) return "Tiempo de Descanso";
  if (action.includes("baño") || action.includes("bano")) return "Ir al Baño";
  if (action.includes("reunión") || action.includes("reunion")) return "Reunión";
  if (action.includes("capacita")) return "Capacitacion de Personal";

  // 5. Por contenido textual de la acción (Software)
  if (action.includes("whatsapp")) return "WhatsApp";
  if (action.includes("linkus") || action.includes("llamada")) return "Linkus (Softphone)";
  if (action.includes("odoo")) return "Odoo ERP";
  if (action.includes("outlook") || action.includes("correo")) return "Correo / Outlook";
  if (action.includes("excel")) return "Microsoft Excel";
  if (action.includes("word")) return "Microsoft Word";
  if (action.includes("atendió caso") || action.includes("atendiendo caso")) return "Atención de Casos / Chats";
  if (action.includes("tomó el caso") || action.includes("gestión de casos")) return "Gestión y Asignación de Casos";

  // 6. Por páginas y módulos del sistema
  if (rawPath.includes("soporte-avanzado") || action.includes("soporte avanzado")) return "Soporte Avanzado (N2)";
  if (rawPath.includes("smart-inbox") || action.includes("smart inbox")) return "Smart Inbox (IA & Casos)";
  if (rawPath.includes("mi-gestion") || action.includes("mi bandeja de gestión")) return "Mi Bandeja de Gestión";
  if (rawPath.includes("inventario") || action.includes("inventario")) return "Gestión de Inventario";
  if (rawPath.includes("equipo") || action.includes("equipo")) return "Gestión de Equipo";
  if (rawPath.includes("agente-ia") || action.includes("agente ia")) return "Configuración Agente IA";
  if (rawPath.includes("actividad") || action.includes("activity tracker") || action.includes("auditoría")) return "Suite de Auditoría y Actividad";
  if (rawPath.includes("estadisticas") || action.includes("estadística")) return "Estadísticas de Atención";
  if (rawPath === "/admin" || action.includes("panel admin - resumen")) return "Panel de Administración";
  if (rawPath.includes("inbox") || action.includes("bandeja de entrada")) return "Seka Chat (Bandeja)";

  return "Seka Chat - Plataforma";
}

export function getDefaultCategoryForApp(appName: string, action: string = "", category: string = ""): string {
  const name = (appName || "").toLowerCase();
  const act = (action || "").toLowerCase();
  const cat = (category || "").toLowerCase();

  // 1. Optimización de procesos (Programación, IDEs, Terminales, código, Capacitaciones, Reuniones)
  if (
    name.includes("antigravity") ||
    name.includes("code") ||
    name.includes("cursor") ||
    name.includes("terminal") ||
    name.includes("windsurf") ||
    name.includes("devin") ||
    name.includes("powershell") ||
    name.includes("cmd") ||
    name.includes("gemini") ||
    name.includes("github") ||
    name.includes("reunión") ||
    name.includes("reunion") ||
    name.includes("capacita") ||
    cat.includes("desarrollo") ||
    cat.includes("proceso") ||
    cat.includes("capacita") ||
    cat.includes("reunión") ||
    cat.includes("reunion")
  ) {
    return "Optimización de procesos";
  }

  // 2. Atención chat (Seka Chat, WhatsApp)
  if (
    name.includes("whatsapp") ||
    name.includes("seka chat") ||
    name.includes("chat") ||
    name.includes("inbox") ||
    cat.includes("chat") ||
    cat.includes("mensajería")
  ) {
    return "Atención chat";
  }

  // 3. Atención de Tickets (Odoo ERP)
  if (name.includes("odoo") || name.includes("ticket") || cat.includes("ticket")) {
    return "Atención de Tickets";
  }

  // 4. Gestión de Garantías (Tienda 3D, RMA)
  if (
    name.includes("tienda 3d") ||
    name.includes("tienda3d") ||
    name.includes("garant") ||
    name.includes("rma") ||
    cat.includes("garant")
  ) {
    return "Gestión de Garantías";
  }

  // 5. Gestión de Correos (Outlook)
  if (name.includes("outlook") || name.includes("mail") || name.includes("correo") || cat.includes("correo")) {
    return "Gestión de Correos";
  }

  // 6. Atención por llamada (Linkus, Softphone)
  if (name.includes("linkus") || name.includes("phone") || name.includes("llamada") || cat.includes("llamada") || cat.includes("telefón")) {
    return "Atención por llamada";
  }

  // 7. Control administrativo (Suite Auditoría, Excel, Word, Inventario, Admin, Inventario GAR)
  if (
    name.includes("auditor") ||
    name.includes("excel") ||
    name.includes("word") ||
    name.includes("office") ||
    name.includes("inventario") ||
    name.includes("admin") ||
    cat.includes("admin") ||
    cat.includes("inventario") ||
    act.includes("informe")
  ) {
    return "Control administrativo";
  }

  // 8. Soporte técnico (CCTV, iVMS, Winbox, MikroTik, Taller, Bodega, Exhibidores, Limpieza, Diagnóstico, Ventanilla)
  if (
    name.includes("ivms") ||
    name.includes("sadp") ||
    name.includes("winbox") ||
    name.includes("mikrotik") ||
    name.includes("unifi") ||
    name.includes("recorte") ||
    name.includes("snipping") ||
    name.includes("taller") ||
    name.includes("bodega") ||
    name.includes("exhibidor") ||
    name.includes("limpieza") ||
    name.includes("ventanilla") ||
    name.includes("mostrador") ||
    name.includes("diagnóstico") ||
    name.includes("diagnostico") ||
    name.includes("soporte a ventas") ||
    name.includes("soporte ventas") ||
    name.includes("justificación") ||
    cat.includes("soporte") ||
    cat.includes("manual") ||
    cat.includes("mantenimiento") ||
    cat.includes("atención presencial")
  ) {
    return "Soporte técnico";
  }

  return "Actividad general";
}

// Compatibilidad hacia atrás
export function getProductivityType(appName: string): { label: string; color: string } {
  const cat = getDefaultCategoryForApp(appName);
  const ui = getCategoryUI(cat);
  return { label: ui.label, color: ui.color };
}

export function normalizeOfficialCategory(category: string, action: string, appName: string): string {
  return getDefaultCategoryForApp(appName, action, category);
}

function formatDuration(ms: number): string {
  const totalSeconds = Math.round(ms / 1000);
  if (totalSeconds < 60) return `${totalSeconds}s`;
  const minutes = Math.floor(totalSeconds / 60);
  const hours = Math.floor(minutes / 60);
  const remMinutes = minutes % 60;
  if (hours > 0) return `${hours}h ${remMinutes}m`;
  return `${minutes}m`;
}

export function ActivityAppsRanking({
  timeline,
  scheduleStart = "08:00",
  scheduleEnd = "17:00",
  scheduleEnabled = true,
}: Props) {
  const [viewMode, setViewMode] = useState<"categories" | "apps">("categories");
  const [categories, setCategories] = useState<CategoryItem[]>(DEFAULT_CATEGORIES);
  const [customCategories, setCustomCategories] = useState<Record<string, string>>({});
  const [activeDropdownApp, setActiveDropdownApp] = useState<string | null>(null);
  const [showManageModal, setShowManageModal] = useState(false);
  const [activeModalTab, setActiveModalTab] = useState<"apps" | "categories">("apps");
  const [searchQuery, setSearchQuery] = useState("");
  const [savingApp, setSavingApp] = useState<string | null>(null);

  const [editingCategory, setEditingCategory] = useState<CategoryItem | null>(null);
  const [isCreatingNew, setIsCreatingNew] = useState(false);
  const [formCatName, setFormCatName] = useState("");
  const [formCatColorIdx, setFormCatColorIdx] = useState(0);
  const [formCatIcon, setFormCatIcon] = useState("Monitor");

  // Cargar categorías y mapeos de localStorage y API
  useEffect(() => {
    try {
      const localMaps = localStorage.getItem("sek_app_categories");
      if (localMaps) setCustomCategories(JSON.parse(localMaps));
      const localCats = localStorage.getItem("sek_categories_list");
      if (localCats) setCategories(JSON.parse(localCats));
    } catch {}

    fetch("/api/activity/app-categories")
      .then((res) => res.json())
      .then((data) => {
        if (data?.appMappings) {
          setCustomCategories(data.appMappings);
          try { localStorage.setItem("sek_app_categories", JSON.stringify(data.appMappings)); } catch {}
        }
        if (data?.categories && Array.isArray(data.categories) && data.categories.length > 0) {
          setCategories(data.categories);
          try { localStorage.setItem("sek_categories_list", JSON.stringify(data.categories)); } catch {}
        }
      })
      .catch(() => {});
  }, []);

  const getCategoryDef = (catName: string): CategoryItem => {
    const found = categories.find((c) => c.id === catName || c.label === catName);
    if (found) return found;
    return categories[categories.length - 1] || DEFAULT_CATEGORIES[DEFAULT_CATEGORIES.length - 1];
  };

  // Asignar categoría a una aplicación
  const handleSetCategory = async (appName: string, category: string | null) => {
    setSavingApp(appName);
    const newMap = { ...customCategories };
    if (!category || category === "auto") {
      delete newMap[appName];
    } else {
      newMap[appName] = category;
    }

    setCustomCategories(newMap);
    try { localStorage.setItem("sek_app_categories", JSON.stringify(newMap)); } catch {}
    setActiveDropdownApp(null);

    try {
      await fetch("/api/activity/app-categories", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ appName, category: category || "auto" }),
      });
    } catch (err) {
      console.error("Error al guardar categoría:", err);
    } finally {
      setSavingApp(null);
    }
  };

  const saveCategoriesList = async (updatedList: CategoryItem[]) => {
    setCategories(updatedList);
    try { localStorage.setItem("sek_categories_list", JSON.stringify(updatedList)); } catch {}
    try {
      await fetch("/api/activity/app-categories", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ categories: updatedList }),
      });
    } catch (err) {
      console.error("Error al guardar categorías:", err);
    }
  };

  const handleSaveCategoryForm = () => {
    const name = formCatName.trim();
    if (!name) return;

    const preset = COLOR_PRESETS[formCatColorIdx] || COLOR_PRESETS[0];

    if (editingCategory) {
      const updated = categories.map((c) => {
        if (c.id === editingCategory.id) {
          return {
            ...c,
            label: name,
            color: preset.color,
            bgBar: preset.bgBar,
            iconName: formCatIcon,
          };
        }
        return c;
      });

      if (editingCategory.id !== name) {
        const newMaps = { ...customCategories };
        let changed = false;
        for (const [app, cat] of Object.entries(newMaps)) {
          if (cat === editingCategory.id) {
            newMaps[app] = name;
            changed = true;
          }
        }
        if (changed) {
          setCustomCategories(newMaps);
          fetch("/api/activity/app-categories", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ appMappings: newMaps }),
          });
        }
      }

      saveCategoriesList(updated);
      setEditingCategory(null);
    } else {
      const newCat: CategoryItem = {
        id: name,
        label: name,
        color: preset.color,
        bgBar: preset.bgBar,
        iconName: formCatIcon,
      };
      saveCategoriesList([...categories, newCat]);
      setIsCreatingNew(false);
    }

    setFormCatName("");
  };

  const handleDeleteCategory = (catId: string) => {
    if (categories.length <= 1) {
      alert("Debe existir al menos una categoría en el sistema.");
      return;
    }
    if (!confirm(`¿Eliminar la categoría "${catId}"? Las aplicaciones que la usaban volverán a automático.`)) {
      return;
    }

    const updated = categories.filter((c) => c.id !== catId);
    saveCategoriesList(updated);

    const newMaps = { ...customCategories };
    let changed = false;
    for (const [app, cat] of Object.entries(newMaps)) {
      if (cat === catId) {
        delete newMaps[app];
        changed = true;
      }
    }
    if (changed) {
      setCustomCategories(newMaps);
      fetch("/api/activity/app-categories", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ appMappings: newMaps }),
      });
    }
  };

  const handleResetCategoriesToDefault = async () => {
    if (!confirm("¿Restablecer todas las categorías a las 9 preconfiguradas originales?")) return;
    setCategories(DEFAULT_CATEGORIES);
    try { localStorage.setItem("sek_categories_list", JSON.stringify(DEFAULT_CATEGORIES)); } catch {}
    await fetch("/api/activity/app-categories", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ resetCategories: true }),
    });
  };

  // Consolidar tiempo por app/categoría usando intervalos cronológicos reales y rangos de horario
  const { appMap, catMap, totalActiveTime, allDetectedApps } = useMemo(() => {
    const appM: Record<string, { durationMs: number; count: number }> = {};
    const catM: Record<string, { durationMs: number; count: number }> = {};
    const allAppsSet = new Set<string>();
    let totalTime = 0;

    if (timeline && timeline.length > 0) {
      const sorted = [...timeline]
        .filter((t) => Boolean(t.created_at))
        .sort((a, b) => new Date(a.created_at!).getTime() - new Date(b.created_at!).getTime());

      const LUNCH_GAP_MS = 30 * 60 * 1000;
      const parseTimeToMinutes = (t: string) => {
        if (!t) return 0;
        const parts = t.split(":");
        return (parseInt(parts[0], 10) || 0) * 60 + (parseInt(parts[1], 10) || 0);
      };

      const startMin = parseTimeToMinutes(scheduleStart || "08:00");
      const endMin = parseTimeToMinutes(scheduleEnd || "17:00");

      // 1. Identificar intervalos manuales discretos (inicio/fin) acotados al horario laboral
      interface ManualInterval {
        startMs: number;
        endMs: number;
        appName: string;
        effectiveCat: string;
      }
      const manualIntervals: ManualInterval[] = [];

      for (let i = 0; i < sorted.length; i++) {
        const it = sorted[i];
        const meta = (it.metadata || {}) as Record<string, any>;
        const act = (it.action || "").toLowerCase();
        const isEnd = act.startsWith("terminó:") || act.startsWith("termino:");
        const isJust = act.startsWith("justificación:") || act.startsWith("justificacion:") || meta.justification;

        if (isEnd || isJust) {
          const endMs = new Date(it.created_at!).getTime();
          const discreteMs = Number(
            it.duration_ms ||
            (meta.duration_seconds ? meta.duration_seconds * 1000 : 0) ||
            (meta.minutes ? meta.minutes * 60000 : 0)
          ) || 0;
          // Máximo 4 horas por olvido
          const durMs = Math.min(discreteMs, 4 * 3600 * 1000);
          const startMs = endMs - durMs;

          const appName = extractSmartAppName(it);
          allAppsSet.add(appName);
          const effectiveCat = customCategories[appName] || getDefaultCategoryForApp(appName, it.action, it.category);

          let clampedStart = startMs;
          let clampedEnd = endMs;

          if (scheduleEnabled) {
            const endDate = new Date(endMs);
            const dayStartMs = new Date(endDate).setHours(Math.floor(startMin / 60), startMin % 60, 0, 0);
            const dayEndMs = new Date(endDate).setHours(Math.floor(endMin / 60), endMin % 60, 0, 0);
            clampedStart = Math.max(startMs, dayStartMs);
            clampedEnd = Math.min(endMs, dayEndMs);
          }

          if (clampedEnd > clampedStart) {
            manualIntervals.push({
              startMs: clampedStart,
              endMs: clampedEnd,
              appName,
              effectiveCat,
            });
          }
        }
      }

      // Detectar labor manual actualmente abierta/en curso (Inició sin Terminó)
      for (let i = sorted.length - 1; i >= 0; i--) {
        const it = sorted[i];
        const meta = (it.metadata || {}) as Record<string, any>;
        const act = (it.action || "").toLowerCase();
        const isStart = (act.startsWith("inició:") || act.startsWith("inicio:")) && (meta.manual || meta.task);
        if (isStart) {
          const startMs = new Date(it.created_at!).getTime();
          const hasEndLater = sorted.slice(i + 1).some((after) => {
            const afterAct = (after.action || "").toLowerCase();
            return (afterAct.startsWith("terminó:") || afterAct.startsWith("termino:")) && new Date(after.created_at!).getTime() > startMs;
          });

          if (!hasEndLater) {
            const appName = extractSmartAppName(it);
            allAppsSet.add(appName);
            const effectiveCat = customCategories[appName] || getDefaultCategoryForApp(appName, it.action, it.category);

            let clampedStart = startMs;
            let clampedEnd = Date.now();

            if (scheduleEnabled) {
              const startDate = new Date(startMs);
              const dayStartMs = new Date(startDate).setHours(Math.floor(startMin / 60), startMin % 60, 0, 0);
              const dayEndMs = new Date(startDate).setHours(Math.floor(endMin / 60), endMin % 60, 0, 0);
              clampedStart = Math.max(startMs, dayStartMs);
              clampedEnd = Math.min(Date.now(), dayEndMs);
            }

            if (clampedEnd > clampedStart) {
              manualIntervals.push({
                startMs: clampedStart,
                endMs: clampedEnd,
                appName,
                effectiveCat,
              });
            }
          }
          break;
        }
      }

      // Sumar los intervalos manuales
      for (const m of manualIntervals) {
        const dur = m.endMs - m.startMs;
        if (dur > 0) {
          if (!appM[m.appName]) appM[m.appName] = { durationMs: 0, count: 0 };
          appM[m.appName].durationMs += dur;
          appM[m.appName].count++;

          if (!catM[m.effectiveCat]) catM[m.effectiveCat] = { durationMs: 0, count: 0 };
          catM[m.effectiveCat].durationMs += dur;
          catM[m.effectiveCat].count++;

          totalTime += dur;
        }
      }

      // 2. Procesar eventos de software secuenciales no solapados
      for (let i = 0; i < sorted.length; i++) {
        const curr = sorted[i];
        const meta = (curr.metadata || {}) as Record<string, any>;

        // Si es salvapantallas de Windows o suspensión de pantalla, descartar de software productivo
        const appName = extractSmartAppName(curr);
        const appLower = appName.toLowerCase();
        if (appLower.includes(".scr") || appLower.includes("mystify") || meta.reason === "lock_screen" || meta.reason === "suspend") {
          continue;
        }

        const currTime = new Date(curr.created_at!).getTime();
        const currDate = new Date(currTime);

        // Si el horario laboral está activo, verificar si está dentro del horario
        if (scheduleEnabled) {
          const currMinOfDay = currDate.getHours() * 60 + currDate.getMinutes();
          if (currMinOfDay < startMin || currMinOfDay >= endMin) {
            continue; // Fuera de horario laboral: NADA se mide
          }
        }

        // Si este instante de tiempo cae dentro de un intervalo de labor manual, la labor manual ya lo midió
        const inManual = manualIntervals.some((m) => currTime >= m.startMs && currTime <= m.endMs);
        if (inManual) continue;

        // Software regular (Brave, Antigravity, Odoo, etc.)
        allAppsSet.add(appName);
        const effectiveCat = customCategories[appName] || getDefaultCategoryForApp(appName, curr.action, curr.category);

        const nextTime = i < sorted.length - 1 ? new Date(sorted[i + 1].created_at!).getTime() : currTime + 60000;
        let clampedNext = nextTime;

        if (scheduleEnabled) {
          const dayEndMs = new Date(currDate).setHours(Math.floor(endMin / 60), endMin % 60, 0, 0);
          clampedNext = Math.min(nextTime, dayEndMs);
        }

        const gap = Math.max(0, clampedNext - currTime);
        const effectiveDuration = Math.min(gap, LUNCH_GAP_MS);

        if (effectiveDuration > 0) {
          if (!appM[appName]) appM[appName] = { durationMs: 0, count: 0 };
          appM[appName].durationMs += effectiveDuration;
          appM[appName].count++;

          if (!catM[effectiveCat]) catM[effectiveCat] = { durationMs: 0, count: 0 };
          catM[effectiveCat].durationMs += effectiveDuration;
          catM[effectiveCat].count++;

          totalTime += effectiveDuration;
        }
      }
    }

    return {
      appMap: appM,
      catMap: catM,
      totalActiveTime: totalTime,
      allDetectedApps: Array.from(allAppsSet),
    };
  }, [timeline, customCategories, scheduleStart, scheduleEnd, scheduleEnabled]);

  const activeMap = viewMode === "categories" ? catMap : appMap;
  const sortedItems = Object.entries(activeMap)
    .sort((a, b) => b[1].durationMs - a[1].durationMs)
    .slice(0, 10);

  // Lista de apps y labores para el modal de gestión
  const filteredModalApps = useMemo(() => {
    const combined = Array.from(
      new Set([...allDetectedApps, ...Object.keys(customCategories), ...DEFAULT_KNOWN_MANUAL_TASKS])
    ).sort();
    if (!searchQuery.trim()) return combined;
    return combined.filter((app) => app.toLowerCase().includes(searchQuery.toLowerCase()));
  }, [allDetectedApps, customCategories, searchQuery]);

  if (sortedItems.length === 0) {
    return (
      <div className="p-6 rounded-2xl bg-card border border-border/70 text-center text-muted-foreground text-xs">
        No hay registros en este rango de fecha.
      </div>
    );
  }

  return (
    <div className="p-5 rounded-2xl bg-card border border-border/70 shadow-sm space-y-4 relative">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <Monitor className="h-4 w-4 text-violet-500" />
          <h3 className="font-bold text-sm text-foreground">Distribución de Tiempo</h3>
        </div>

        <div className="flex items-center gap-2">
          {/* Botón Gestionar Categorías */}
          <button
            onClick={() => setShowManageModal(true)}
            className="px-2.5 py-1 text-[11px] font-bold rounded-lg border border-border/60 bg-muted/30 hover:bg-muted/60 text-muted-foreground hover:text-foreground transition-all flex items-center gap-1.5 shadow-sm"
            title="Administrar qué categoría tiene asignada cada aplicación"
          >
            <SlidersHorizontal className="h-3.5 w-3.5 text-violet-400" />
            <span>Gestionar</span>
            {Object.keys(customCategories).length > 0 && (
              <span className="h-1.5 w-1.5 rounded-full bg-violet-400" />
            )}
          </button>

          {/* Selector de Vista: Por Categoría / Por Software */}
          <div className="flex bg-muted/50 p-1 rounded-lg border border-border/50">
            <button
              onClick={() => {
                setViewMode("categories");
                setActiveDropdownApp(null);
              }}
              className={`px-3 py-1 text-[10px] font-bold rounded-md transition-all ${
                viewMode === "categories" ? "bg-background text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"
              }`}
            >
              Por Categoría
            </button>
            <button
              onClick={() => {
                setViewMode("apps");
                setActiveDropdownApp(null);
              }}
              className={`px-3 py-1 text-[10px] font-bold rounded-md transition-all ${
                viewMode === "apps" ? "bg-background text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"
              }`}
            >
              Por Software / Labor
            </button>
          </div>

          <span className="text-xs text-muted-foreground font-medium hidden sm:inline-block">
            Total: {formatDuration(totalActiveTime)}
          </span>
        </div>
      </div>

      <div className="space-y-2.5">
        {sortedItems.map(([itemName, stats], index) => {
          const percentage = totalActiveTime > 0 ? Math.round((stats.durationMs / totalActiveTime) * 100) : 0;

          let icon, labelNode, barClass;
          if (viewMode === "categories") {
            const ui = getCategoryUI(itemName);
            icon = <div className={ui.color.split(" ")[0]}>{renderCategoryIcon(ui.iconName, "h-4 w-4")}</div>;
            labelNode = (
              <span className={`text-[10px] font-bold px-2.5 py-0.5 rounded-full border ${ui.color}`}>
                Categoría Oficial
              </span>
            );
            barClass = ui.bgBar;
          } else {
            // Modo Por Software: muestra la categoría asignada
            const isManual = Boolean(customCategories[itemName]);
            const currentCat = customCategories[itemName] || getDefaultCategoryForApp(itemName);
            const ui = getCategoryUI(currentCat);
            icon = getAppIcon(itemName);
            barClass = ui.bgBar;

            labelNode = (
              <div className="relative inline-block">
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    setActiveDropdownApp(activeDropdownApp === itemName ? null : itemName);
                  }}
                  className={`text-[10px] font-bold px-2.5 py-0.5 rounded-full border flex items-center gap-1 transition-all hover:scale-105 cursor-pointer ${ui.color} ${
                    isManual ? "ring-1 ring-violet-500/50" : ""
                  }`}
                  title={isManual ? "Categoría personalizada manualmente (clic para cambiar)" : "Categoría asignada (clic para cambiar)"}
                >
                  {isManual && <span className="text-[9px] font-black mr-0.5">●</span>}
                  <span>{ui.label}</span>
                  <ChevronDown className="h-2.5 w-2.5 opacity-60 ml-0.5" />
                </button>

                {/* Dropdown flotante con las categorías de la pantalla */}
                {activeDropdownApp === itemName && (
                  <div
                    className="absolute right-0 top-full mt-1.5 w-60 rounded-xl bg-card border border-border shadow-2xl p-1.5 z-50 space-y-0.5 animate-in fade-in zoom-in-95 duration-100"
                    onClick={(e) => e.stopPropagation()}
                  >
                    <div className="px-2 py-1 text-[9px] font-black uppercase tracking-wider text-muted-foreground border-b border-border/50 mb-1 flex items-center justify-between">
                      <span>Categoría para {itemName}</span>
                      {savingApp === itemName && <span className="text-violet-400 font-bold">Guardando...</span>}
                    </div>

                    {categories.map((cat) => {
                      const isSelected = currentCat === cat.id;
                      return (
                        <button
                          key={cat.id}
                          type="button"
                          onClick={() => handleSetCategory(itemName, cat.id)}
                          className={`w-full text-left px-2.5 py-1.5 rounded-lg text-xs font-medium flex items-center justify-between transition-colors ${
                            isSelected
                              ? "bg-violet-500/15 text-violet-300 font-bold"
                              : "hover:bg-muted/60 text-foreground"
                          }`}
                        >
                          <div className="flex items-center gap-2 min-w-0">
                            <span className="opacity-80">{renderCategoryIcon(cat.iconName, "h-3.5 w-3.5")}</span>
                            <span className="text-[11px] truncate">{cat.label}</span>
                          </div>
                          {isSelected && <Check className="h-3.5 w-3.5 text-violet-400 shrink-0 ml-1" />}
                        </button>
                      );
                    })}

                    {isManual && (
                      <div className="pt-1 mt-1 border-t border-border/50">
                        <button
                          type="button"
                          onClick={() => handleSetCategory(itemName, null)}
                          className="w-full text-left px-2.5 py-1.5 rounded-lg text-[11px] font-medium text-amber-400 hover:bg-amber-500/10 flex items-center gap-2 transition-colors"
                        >
                          <RotateCcw className="h-3 w-3" />
                          <span>Restablecer a Automático</span>
                        </button>
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          }

          return (
            <div
              key={itemName}
              className="p-3 rounded-xl bg-muted/20 border border-border/40 hover:bg-muted/40 transition-colors"
            >
              <div className="flex items-center justify-between gap-3 text-xs mb-1.5">
                <div className="flex items-center gap-2 min-w-0">
                  <span className="text-[10px] font-black text-muted-foreground/60 w-4">
                    #{index + 1}
                  </span>
                  {icon}
                  <span className="font-bold text-foreground truncate" title={itemName}>
                    {itemName}
                  </span>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  {labelNode}
                  <span className="font-mono font-bold text-foreground">
                    {formatDuration(stats.durationMs)}
                  </span>
                  <span className="text-muted-foreground font-medium w-9 text-right">
                    {percentage}%
                  </span>
                </div>
              </div>

              {/* Barra de progreso */}
              <div className="h-1.5 w-full rounded-full bg-muted/60 overflow-hidden">
                <div
                  className={`h-full rounded-full transition-all ${barClass}`}
                  style={{ width: `${percentage}%` }}
                />
              </div>
            </div>
          );
        })}
      </div>

      {/* MODAL COMPLETO DE GESTIÓN (Mapeo de Apps + CRUD de Categorías) */}
      {showManageModal && (
        <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4">
          <div
            className="w-full max-w-2xl rounded-2xl bg-card border border-border shadow-2xl p-6 space-y-4 max-h-[90vh] flex flex-col"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Header del Modal con Tabs */}
            <div className="flex items-center justify-between border-b border-border/50 pb-3">
              <div className="flex items-center gap-2">
                <SlidersHorizontal className="h-5 w-5 text-violet-400" />
                <div>
                  <h3 className="font-bold text-base text-foreground">Gestión de Categorías y Software</h3>
                  <p className="text-xs text-muted-foreground">
                    Asigne aplicaciones o cree, edite y elimine categorías del taller
                  </p>
                </div>
              </div>
              <button
                onClick={() => {
                  setShowManageModal(false);
                  setIsCreatingNew(false);
                  setEditingCategory(null);
                }}
                className="p-1 rounded-lg hover:bg-muted text-muted-foreground hover:text-foreground transition-colors"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            {/* Pestañas del Modal */}
            <div className="flex border-b border-border/50 gap-4">
              <button
                onClick={() => { setActiveModalTab("apps"); setIsCreatingNew(false); setEditingCategory(null); }}
                className={`pb-2 text-xs font-bold transition-all border-b-2 flex items-center gap-1.5 ${
                  activeModalTab === "apps"
                    ? "border-violet-500 text-violet-400"
                    : "border-transparent text-muted-foreground hover:text-foreground"
                }`}
              >
                <Layers className="h-3.5 w-3.5" />
                <span>Mapeo de Software y Labores ({filteredModalApps.length})</span>
              </button>
              <button
                onClick={() => { setActiveModalTab("categories"); }}
                className={`pb-2 text-xs font-bold transition-all border-b-2 flex items-center gap-1.5 ${
                  activeModalTab === "categories"
                    ? "border-violet-500 text-violet-400"
                    : "border-transparent text-muted-foreground hover:text-foreground"
                }`}
              >
                <SlidersHorizontal className="h-3.5 w-3.5" />
                <span>Categorías del Taller ({categories.length})</span>
              </button>
            </div>

            {/* CONTENIDO PESTAÑA 1: MAPEO DE SOFTWARE Y LABORES */}
            {activeModalTab === "apps" && (
              <div className="flex-1 flex flex-col min-h-0 space-y-3">
                <div className="relative">
                  <Search className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
                  <input
                    type="text"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    placeholder="Buscar software o labor manual (ej: Bodega, WhatsApp, Odoo)..."
                    className="w-full pl-9 pr-4 py-2 text-xs rounded-xl bg-muted/40 border border-border focus:outline-none focus:ring-2 focus:ring-violet-500 text-foreground placeholder:text-muted-foreground"
                  />
                </div>

                <div className="flex-1 overflow-y-auto space-y-2 pr-1 min-h-[260px] max-h-[350px]">
                  {filteredModalApps.length === 0 ? (
                    <div className="p-8 text-center text-xs text-muted-foreground">
                      No se encontraron aplicaciones con ese nombre.
                    </div>
                  ) : (
                    filteredModalApps.map((appName) => {
                      const isManual = Boolean(customCategories[appName]);
                      const currentCat = customCategories[appName] || getDefaultCategoryForApp(appName);
                      const icon = getAppIcon(appName);

                      return (
                        <div
                          key={appName}
                          className="p-2.5 rounded-xl bg-muted/20 border border-border/50 flex items-center justify-between gap-3 hover:bg-muted/30 transition-colors"
                        >
                          <div className="flex items-center gap-2.5 min-w-0">
                            {icon}
                            <div className="min-w-0">
                              <p className="font-bold text-xs text-foreground truncate" title={appName}>
                                {appName}
                              </p>
                              <p className="text-[10px] text-muted-foreground">
                                {isManual ? (
                                  <span className="text-violet-400 font-semibold">● Asignación manual</span>
                                ) : (
                                  "Asignación automática"
                                )}
                              </p>
                            </div>
                          </div>

                          <div className="flex items-center gap-2 shrink-0">
                            <select
                              value={currentCat}
                              onChange={(e) => handleSetCategory(appName, e.target.value)}
                              className="text-xs font-bold px-2.5 py-1.5 rounded-lg bg-card border border-border focus:outline-none focus:ring-2 focus:ring-violet-500 text-foreground cursor-pointer max-w-[180px]"
                            >
                              {categories.map((cat) => (
                                <option key={cat.id} value={cat.id}>
                                  {cat.label}
                                </option>
                              ))}
                            </select>

                            {isManual && (
                              <button
                                onClick={() => handleSetCategory(appName, null)}
                                title="Restablecer a automático"
                                className="p-1.5 rounded-lg hover:bg-muted text-muted-foreground hover:text-amber-400 transition-colors"
                              >
                                <RotateCcw className="h-3.5 w-3.5" />
                              </button>
                            )}
                          </div>
                        </div>
                      );
                    })
                  )}
                </div>
              </div>
            )}

            {/* CONTENIDO PESTAÑA 2: CRUD DE CATEGORÍAS (AGREGAR / EDITAR / ELIMINAR) */}
            {activeModalTab === "categories" && (
              <div className="flex-1 flex flex-col min-h-0 space-y-3">
                {/* Formulario de Creación / Edición */}
                {(isCreatingNew || editingCategory) ? (
                  <div className="p-4 rounded-xl bg-muted/30 border border-violet-500/40 space-y-3 animate-in fade-in duration-150">
                    <div className="flex items-center justify-between">
                      <h4 className="text-xs font-bold text-violet-300">
                        {editingCategory ? `Editar Categoría: ${editingCategory.label}` : "Nueva Categoría"}
                      </h4>
                      <button
                        onClick={() => { setIsCreatingNew(false); setEditingCategory(null); }}
                        className="text-xs text-muted-foreground hover:text-foreground"
                      >
                        Cancelar
                      </button>
                    </div>

                    <div className="space-y-2">
                      <label className="text-[11px] font-semibold text-muted-foreground block">
                        Nombre de la Categoría
                      </label>
                      <input
                        type="text"
                        value={formCatName}
                        onChange={(e) => setFormCatName(e.target.value)}
                        placeholder="Ej: Logística, Calidad, etc."
                        className="w-full px-3 py-1.5 text-xs rounded-lg bg-card border border-border focus:outline-none focus:ring-2 focus:ring-violet-500 text-foreground"
                      />
                    </div>

                    <div className="grid grid-cols-2 gap-3">
                      {/* Color */}
                      <div className="space-y-1.5">
                        <label className="text-[11px] font-semibold text-muted-foreground block">Color</label>
                        <div className="flex flex-wrap gap-1.5">
                          {COLOR_PRESETS.map((p, idx) => (
                            <button
                              key={p.name}
                              type="button"
                              onClick={() => setFormCatColorIdx(idx)}
                              className={`h-6 w-6 rounded-full ${p.bgBar} transition-all ${
                                formCatColorIdx === idx ? "ring-2 ring-white scale-110 shadow-md" : "opacity-70 hover:opacity-100"
                              }`}
                              title={p.name}
                            />
                          ))}
                        </div>
                      </div>

                      {/* Icono */}
                      <div className="space-y-1.5">
                        <label className="text-[11px] font-semibold text-muted-foreground block">Icono</label>
                        <div className="flex flex-wrap gap-1.5 max-h-16 overflow-y-auto">
                          {ICON_PRESETS.map((ico) => (
                            <button
                              key={ico}
                              type="button"
                              onClick={() => setFormCatIcon(ico)}
                              className={`p-1.5 rounded-lg border transition-all ${
                                formCatIcon === ico
                                  ? "border-violet-500 bg-violet-500/20 text-violet-300"
                                  : "border-border/60 bg-card text-muted-foreground hover:text-foreground"
                              }`}
                            >
                              {renderCategoryIcon(ico, "h-3.5 w-3.5")}
                            </button>
                          ))}
                        </div>
                      </div>
                    </div>

                    <div className="pt-2 flex justify-end gap-2">
                      <button
                        onClick={() => { setIsCreatingNew(false); setEditingCategory(null); }}
                        className="px-3 py-1.5 text-xs font-semibold rounded-lg bg-muted text-muted-foreground hover:text-foreground"
                      >
                        Cancelar
                      </button>
                      <button
                        onClick={handleSaveCategoryForm}
                        disabled={!formCatName.trim()}
                        className="px-4 py-1.5 text-xs font-bold rounded-lg bg-violet-600 hover:bg-violet-700 text-white disabled:opacity-50 cursor-pointer"
                      >
                        {editingCategory ? "Guardar Cambios" : "Crear Categoría"}
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className="flex justify-between items-center">
                    <p className="text-xs text-muted-foreground">
                      Administre las categorías en las que se clasifica el tiempo laboral
                    </p>
                    <button
                      onClick={() => {
                        setIsCreatingNew(true);
                        setEditingCategory(null);
                        setFormCatName("");
                        setFormCatColorIdx(0);
                        setFormCatIcon("Monitor");
                      }}
                      className="px-3 py-1.5 text-xs font-bold rounded-lg bg-violet-600 hover:bg-violet-700 text-white flex items-center gap-1.5 shadow-sm transition-all cursor-pointer"
                    >
                      <Plus className="h-3.5 w-3.5" />
                      <span>Nueva Categoría</span>
                    </button>
                  </div>
                )}

                {/* Lista de Categorías Existentes */}
                <div className="flex-1 overflow-y-auto space-y-2 pr-1 min-h-[220px] max-h-[320px]">
                  {categories.map((cat) => (
                    <div
                      key={cat.id}
                      className="p-2.5 rounded-xl bg-muted/20 border border-border/50 flex items-center justify-between gap-3 hover:bg-muted/30 transition-colors"
                    >
                      <div className="flex items-center gap-2.5">
                        <div className={`p-1.5 rounded-lg border ${cat.color}`}>
                          {renderCategoryIcon(cat.iconName, "h-4 w-4")}
                        </div>
                        <div>
                          <span className="font-bold text-xs text-foreground">{cat.label}</span>
                          <p className="text-[10px] text-muted-foreground">
                            {cat.id === "Actividad general" ? "Categoría por defecto" : "Categoría activa"}
                          </p>
                        </div>
                      </div>

                      <div className="flex items-center gap-1.5">
                        <button
                          onClick={() => {
                            setEditingCategory(cat);
                            setIsCreatingNew(false);
                            setFormCatName(cat.label);
                            const foundIdx = COLOR_PRESETS.findIndex((p) => p.bgBar === cat.bgBar);
                            setFormCatColorIdx(foundIdx >= 0 ? foundIdx : 0);
                            setFormCatIcon(cat.iconName || "Monitor");
                          }}
                          className="p-1.5 rounded-lg hover:bg-muted text-muted-foreground hover:text-violet-300 transition-colors cursor-pointer"
                          title="Editar nombre, color o icono"
                        >
                          <Edit2 className="h-3.5 w-3.5" />
                        </button>

                        <button
                          onClick={() => handleDeleteCategory(cat.id)}
                          className="p-1.5 rounded-lg hover:bg-muted text-muted-foreground hover:text-rose-400 transition-colors cursor-pointer"
                          title="Eliminar categoría"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Footer */}
            <div className="border-t border-border/50 pt-3 flex items-center justify-between text-xs">
              {activeModalTab === "apps" ? (
                <span className="text-muted-foreground">
                  {Object.keys(customCategories).length} aplicación(es) con categoría personalizada
                </span>
              ) : (
                <button
                  onClick={handleResetCategoriesToDefault}
                  className="text-amber-400 hover:text-amber-300 font-semibold flex items-center gap-1 transition-colors cursor-pointer"
                >
                  <RotateCcw className="h-3 w-3" />
                  <span>Restablecer categorías predeterminadas</span>
                </button>
              )}

              <div className="flex items-center gap-2">
                {activeModalTab === "apps" && Object.keys(customCategories).length > 0 && (
                  <button
                    onClick={() => {
                      if (!confirm("¿Restablecer todas las aplicaciones a su categorización automática?")) return;
                      setCustomCategories({});
                      try {
                        localStorage.removeItem("sek_app_categories");
                      } catch {}
                      fetch("/api/activity/app-categories", {
                        method: "POST",
                        headers: { "Content-Type": "application/json" },
                        body: JSON.stringify({ fullMap: {} }),
                      });
                    }}
                    className="px-3 py-1.5 text-xs font-semibold rounded-lg text-amber-400 hover:bg-amber-500/10 transition-colors cursor-pointer"
                  >
                    Restablecer todas
                  </button>
                )}
                <button
                  onClick={() => setShowManageModal(false)}
                  className="px-4 py-1.5 text-xs font-bold rounded-lg bg-violet-600 hover:bg-violet-700 text-white transition-colors cursor-pointer"
                >
                  Listo
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
