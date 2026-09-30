"use client";

import React, { useState, useEffect, useMemo } from "react";
import { computeUnifiedActivityMetrics, extractCleanItemName } from "@/lib/activity-engine";
import {
  Monitor,
  Phone,
  Headphones,
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
  FolderTree,
  ExternalLink,
  Link,
  Inbox,
  GripVertical,
  ArrowRightLeft,
  Info,
  EyeOff,
} from "lucide-react";

interface TimelineItem {
  created_at?: string;
  action: string;
  category: string;
  duration_ms?: number | null;
  metadata?: Record<string, any> | null;
  agent_name?: string | null;
  agent_email?: string | null;
}

interface Props {
  timeline: TimelineItem[];
  scheduleStart?: string;
  scheduleEnd?: string;
  scheduleEnabled?: boolean;
  workDays?: number[];
  toleranceMinutes?: number;
  useMixedSchedule?: boolean;
  daySchedules?: Record<number, { start?: string; end?: string; targetHours?: number }>;
  onAppMappingsChange?: (newMap: Record<string, any>) => void;
}

export interface CategoryItem {
  id: string;
  label: string;
  color: string;
  bgBar: string;
  iconName: string;
  subcategories: string[];
  is_manual?: boolean;
  manual_subcategories?: string[];
}

export const DEFAULT_CATEGORIES: CategoryItem[] = [
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
      "Diagnóstico",
      "Reparación",
      "Mantenimiento",
      "Pruebas y Validación",
    ],
    manual_subcategories: [
      "Diagnóstico",
      "Reparación",
      "Mantenimiento",
      "Pruebas y Validación",
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

export const COLOR_PRESETS = [
  { name: "Verde", color: "text-emerald-400 border-emerald-500/30 bg-emerald-500/15", bgBar: "bg-emerald-500" },
  { name: "Ámbar", color: "text-amber-400 border-amber-500/30 bg-amber-500/15", bgBar: "bg-amber-500" },
  { name: "Azul", color: "text-blue-400 border-blue-500/30 bg-blue-500/15", bgBar: "bg-blue-500" },
  { name: "Índigo", color: "text-indigo-400 border-indigo-500/30 bg-indigo-500/15", bgBar: "bg-indigo-500" },
  { name: "Rojo", color: "text-rose-400 border-rose-500/30 bg-rose-500/15", bgBar: "bg-rose-500" },
  { name: "Violeta", color: "text-violet-400 border-violet-500/30 bg-violet-500/15", bgBar: "bg-violet-500" },
  { name: "Fucsia", color: "text-fuchsia-400 border-fuchsia-500/30 bg-fuchsia-500/15", bgBar: "bg-fuchsia-500" },
  { name: "Cyan", color: "text-cyan-400 border-cyan-500/30 bg-cyan-500/15", bgBar: "bg-cyan-500" },
  { name: "Pizarra", color: "text-slate-400 border-slate-500/30 bg-slate-500/15", bgBar: "bg-slate-500" },
];

export const ICON_PRESETS = [
  "Headphones",
  "Wrench",
  "TrendingUp",
  "Package",
  "Trash2",
  "GraduationCap",
  "Clock",
  "MessageSquare",
  "FileText",
  "Mail",
  "Phone",
  "Monitor",
  "ShieldCheck",
];

function renderCategoryIcon(iconName?: string, className: string = "h-4 w-4") {
  switch (iconName) {
    case "Headphones": return <Headphones className={className} />;
    case "Trash2": return <Trash2 className={className} />;
    case "Package": return <Package className={className} />;
    case "GraduationCap": return <GraduationCap className={className} />;
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
  const found = DEFAULT_CATEGORIES.find((c) => c.id === catName || c.label === catName);
  if (found) return found;

  const lower = (catName || "").toLowerCase();

  // 1. Soporte
  if (
    (lower.includes("soporte") && !lower.includes("taller") && !lower.includes("residuo")) ||
    lower.includes("chat") ||
    lower.includes("mensajer") ||
    lower.includes("llamada") ||
    lower.includes("telef") ||
    lower.includes("phone") ||
    lower.includes("linkus") ||
    lower.includes("ticket") ||
    lower.includes("whatsapp")
  ) {
    return DEFAULT_CATEGORIES[0];
  }

  // 2. Servicio de Taller
  if (
    lower.includes("servicio") ||
    lower.includes("diagnóst") ||
    lower.includes("diagnost") ||
    lower.includes("repara") ||
    lower.includes("garant") ||
    lower.includes("rma") ||
    lower.includes("tienda 3d") ||
    lower.includes("tienda3d") ||
    lower.includes("ivms") ||
    lower.includes("cctv") ||
    lower.includes("sadp") ||
    lower.includes("mikrotik") ||
    lower.includes("winbox")
  ) {
    return DEFAULT_CATEGORIES[1];
  }

  // 3. Control Administrativo
  if (
    lower.includes("admin") ||
    lower.includes("control") ||
    lower.includes("correo") ||
    lower.includes("mail") ||
    lower.includes("outlook") ||
    lower.includes("excel") ||
    lower.includes("word") ||
    lower.includes("informe") ||
    lower.includes("office") ||
    lower.includes("proceso") ||
    lower.includes("desarrollo") ||
    lower.includes("investiga")
  ) {
    return DEFAULT_CATEGORIES[2];
  }

  // 4. Gestión del Taller
  if (
    lower.includes("gestión del taller") ||
    lower.includes("gestion del taller") ||
    lower.includes("taller") ||
    lower.includes("bodega") ||
    lower.includes("inventario") ||
    lower.includes("mostrador") ||
    lower.includes("ventanilla") ||
    lower.includes("limpieza") ||
    lower.includes("exhibidor") ||
    lower.includes("física") ||
    lower.includes("fisica")
  ) {
    return DEFAULT_CATEGORIES[3];
  }

  // 5. Gestión de Residuos
  if (
    lower.includes("residuo") ||
    lower.includes("desecho") ||
    lower.includes("reciclaj") ||
    lower.includes("chatarra") ||
    lower.includes("basura") ||
    lower.includes("descarte")
  ) {
    return DEFAULT_CATEGORIES[4];
  }

  // 6. On-the-Job Training (OJT)
  if (
    lower.includes("ojt") ||
    lower.includes("training") ||
    lower.includes("capacita") ||
    lower.includes("entrena") ||
    lower.includes("inducci") ||
    lower.includes("reunión") ||
    lower.includes("reunion") ||
    lower.includes("aprendizaje")
  ) {
    return DEFAULT_CATEGORIES[5];
  }

  // 7. Utilidades
  if (
    lower.includes("utilidad") ||
    lower.includes("spotify") ||
    lower.includes("program manager") ||
    lower.includes("calculadora") ||
    lower.includes("notepad") ||
    lower.includes("bloc de notas") ||
    lower.includes("taskmgr")
  ) {
    const found = DEFAULT_CATEGORIES.find((c) => c.id === "Utilidades");
    if (found) return found;
  }

  // 8. Pausa Sanitaria
  if (lower.includes("sanitaria") || lower.includes("baño") || lower.includes("bano")) {
    const found = DEFAULT_CATEGORIES.find((c) => c.id === "Pausa Sanitaria");
    if (found) return found;
  }

  // 9. Descansos
  if (
    lower.includes("pausa") ||
    lower.includes("descanso") ||
    lower.includes("almuerzo") ||
    lower.includes("receso") ||
    lower.includes("inactividad")
  ) {
    const found = DEFAULT_CATEGORIES.find((c) => c.id === "Descansos");
    if (found) return found;
  }

  return DEFAULT_CATEGORIES[0];
}

export const DEFAULT_KNOWN_MANUAL_TASKS: string[] = [];


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
  if (name.includes("baño") || name.includes("bano") || name.includes("sanitaria") || name.includes("sanitario")) return <Bath className="h-4 w-4 text-sky-400" />;
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
  const rawTitle = (meta.title || meta.context || "").trim();
  const rawApp = (meta.app || meta.app_name || "").toLowerCase();

  // 1. Tareas manuales y justificaciones explícitas
  if (meta.task) return meta.task;
  if (meta.manual && meta.label) return meta.label;
  if (meta.justification && meta.reason) return `Justificación: ${meta.reason}`;

  // 1.1 Detección de pausas, descansos e inactividad
  const catLower = (item.category || "").toLowerCase();
  const isPauseOrIdle =
    catLower === "inactividad" ||
    catLower === "tiempo de descanso" ||
    catLower === "pausa personal" ||
    catLower === "pausa sanitaria" ||
    catLower === "pausas y descansos" ||
    meta.reason === "lock_screen" ||
    meta.reason === "suspend" ||
    meta.reason === "idle" ||
    action.includes("sin interacción") ||
    action.includes("sin interaccion") ||
    action.includes("pausa prolongada");

  if (isPauseOrIdle) {
    if (action.includes("almuerzo") || action.includes("comida")) return "Almuerzo";
    if (action.includes("baño") || action.includes("bano") || action.includes("sanitaria") || action.includes("sanitario")) return "Pausa Sanitaria";
    if (action.includes("descanso") || action.includes("café") || action.includes("cafe")) return "Tiempo de Descanso";
    return "Tiempo de Descanso";
  }

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

  // 3. Extracción de URLs / Sitios Web desde Navegadores (Chrome, Brave, Edge, Firefox, etc.)
  const isBrowser =
    rawApp.includes("chrome") ||
    rawApp.includes("brave") ||
    rawApp.includes("edge") ||
    rawApp.includes("firefox") ||
    rawApp.includes("opera") ||
    rawApp.includes("browser") ||
    action.includes("navegador");

  if (meta.url) {
    try {
      const u = new URL(meta.url);
      return u.hostname.replace(/^www\./i, "");
    } catch {
      return meta.url;
    }
  }

  if (isBrowser && rawTitle) {
    const cleanTitle = rawTitle
      .replace(/\s*[-–—|]\s*(Google Chrome|Brave Browser|Brave|Microsoft Edge|Mozilla Firefox|Opera).*$/i, "")
      .trim();
    const lowerTitle = cleanTitle.toLowerCase();

    if (lowerTitle.includes("github")) return "github.com";
    if (lowerTitle.includes("whatsapp")) return "web.whatsapp.com";
    if (lowerTitle.includes("odoo")) return "odoo.com";
    if (lowerTitle.includes("google drive") || lowerTitle.includes("drive - google") || lowerTitle.includes("drive.google")) return "drive.google.com";
    if (lowerTitle.includes("google one") || lowerTitle.includes("one.google")) return "Google One";
    if (lowerTitle.includes("supabase")) return "Supabase";
    if (lowerTitle.includes("youtube")) return "youtube.com";
    if (lowerTitle.includes("canva")) return "canva.com";
    if (lowerTitle.includes("chatgpt") || lowerTitle.includes("openai")) return "chatgpt.com";
    if (lowerTitle.includes("claude")) return "claude.ai";
    if (lowerTitle.includes("devin")) return "devin.ai";
    if (lowerTitle.includes("linkedin")) return "linkedin.com";
    if (lowerTitle.includes("stackoverflow")) return "stackoverflow.com";
    if (lowerTitle.includes("seka chat") || lowerTitle.includes("sekunet") || lowerTitle.includes("localhost:3100")) return "Seka Chat";

    // Si tiene un dominio explícito (ej: portal.sekunet.cr o soporte.com)
    const domainMatch = cleanTitle.match(/\b([a-zA-Z0-9-]+\.(?:com|cr|net|org|io|ai|app|dev|edu|gov))\b/i);
    if (domainMatch) {
      return domainMatch[1].toLowerCase();
    }

    // Tomar el nombre del sitio web de la pestaña
    if (cleanTitle.length > 0) {
      const parts = cleanTitle.split(/[-–—|]/);
      const siteCandidate = parts[parts.length - 1].trim();
      if (siteCandidate.length > 2 && siteCandidate.length < 32) {
        return `Web: ${siteCandidate}`;
      }
      return `Web: ${cleanTitle.substring(0, 30)}`;
    }
  }

  // 4. Apps de escritorio / externas explícitas
  if (meta.app_name) {
    const rawAppNameLower = meta.app_name.toLowerCase();
    if (rawAppNameLower.includes("program manager") || rawTitle.toLowerCase().includes("program manager")) {
      return "Escritorio de Windows";
    }
    if (rawAppNameLower.includes("conmutac") || rawTitle.toLowerCase().includes("conmutac") || rawTitle.toLowerCase().includes("task switching")) {
      return "Conmutación de tareas";
    }
    if (meta.app_name.toLowerCase().includes("applicationframehost")) {
      if (rawTitle) {
        const cleanT = rawTitle.replace(/\s*[-–—|].*$/, "").trim();
        if (cleanT && !cleanT.toLowerCase().includes("applicationframehost")) return cleanT;
      }
      return "";
    }
    return meta.app_name;
  }
  if (meta.label && !meta.label.toLowerCase().startsWith("navegador web")) return meta.label;

  // 5. Labores físicas por contenido
  if (action.includes("bodega")) return "Ir a Bodega";
  if (action.includes("exhibidor")) return "Exhibidores";
  if (action.includes("inventario gar") || action.includes("inventario y actualización"))
    return "Inventario y Actualización de Bodega GAR";
  if (action.includes("limpieza")) return "Limpieza de taller";
  if (action.includes("ventanilla") || action.includes("mostrador")) return "Ir a Ventanilla";
  if (action.includes("diagnóstico") || action.includes("diagnostico")) return "Iniciar Diagnóstico Físico";
  if (action.includes("soporte a ventas") || action.includes("soporte ventas")) return "Soporte a Ventas";
  if (action.includes("descanso") || action.includes("almuerzo")) return "Tiempo de Descanso";
  if (action.includes("baño") || action.includes("bano") || action.includes("sanitaria") || action.includes("sanitario")) return "Pausa Sanitaria";
  if (action.includes("reunión") || action.includes("reunion")) return "Reunión";
  if (action.includes("capacita")) return "Capacitacion de Personal";

  // 6. Por contenido textual de la acción (Software)
  if (action.includes("whatsapp")) return "WhatsApp";
  if (action.includes("linkus") || action.includes("llamada")) return "Linkus (Softphone)";
  if (action.includes("odoo")) return "Odoo ERP";
  if (action.includes("outlook") || action.includes("correo")) return "Correo / Outlook";
  if (action.includes("excel")) return "Microsoft Excel";
  if (action.includes("word")) return "Microsoft Word";
  
  // Evitar nombres fantasma que sean idénticos a categorías
  const isPhantom = (s: string) => {
    const l = (s || "").toLowerCase().trim();
    return l === "control administrativo" || l === "soporte" || l === "servicio de taller" ||
           l === "gestión del taller" || l === "gestion del taller" || l === "gestión de residuos" ||
           l === "gestion de residuos" || l === "on-the-job training (ojt)" || l === "ojt" ||
           l === "descansos" || l === "pausa sanitaria" || l === "utilidades" ||
           l === "actividad general" || l === "operativa" || l === "sin clasificar";
  };
  if (item.category && !isPhantom(item.category)) return item.category;

  // 7. Todo lo que ocurre en la web/plataforma interna es Seka Chat
  return "Seka Chat";
}

export function getDefaultCategoryForApp(appName: string, action: string = "", category: string = ""): string {
  const name = (appName || "").toLowerCase();
  const act = (action || "").toLowerCase();
  const cat = (category || "").toLowerCase();

  // 1. On-the-Job Training (OJT) (Capacitaciones a clientes, personal, inducciones, reuniones formativas)
  if (
    name.includes("capacita") ||
    name.includes("reunión") ||
    name.includes("reunion") ||
    name.includes("ojt") ||
    name.includes("training") ||
    name.includes("inducci") ||
    act.includes("capacita") ||
    act.includes("reunión") ||
    act.includes("reunion") ||
    act.includes("ojt") ||
    cat.includes("capacita") ||
    cat.includes("reunión") ||
    cat.includes("reunion") ||
    cat.includes("ojt")
  ) {
    return "On-the-Job Training (OJT)";
  }

  // 2. Gestión de Residuos (Reciclaje, Desechos, Embalajes, Descarte de piezas, Chatarra)
  if (
    name.includes("residuo") ||
    name.includes("desecho") ||
    name.includes("reciclaj") ||
    name.includes("chatarra") ||
    name.includes("descarte") ||
    act.includes("residuo") ||
    act.includes("desecho") ||
    act.includes("reciclaj") ||
    cat.includes("residuo") ||
    cat.includes("desecho")
  ) {
    return "Gestión de Residuos";
  }

  // 3. Gestión del Taller (Bodega, Inventario, Mostrador, Ventanilla, Limpieza, Exhibidores)
  if (
    name.includes("bodega") ||
    name.includes("inventario") ||
    name.includes("exhibidor") ||
    name.includes("limpieza") ||
    name.includes("ventanilla") ||
    name.includes("mostrador") ||
    act.includes("bodega") ||
    act.includes("inventario") ||
    act.includes("exhibidor") ||
    act.includes("limpieza") ||
    act.includes("ventanilla") ||
    act.includes("mostrador") ||
    cat.includes("bodega") ||
    cat.includes("inventario") ||
    cat.includes("manual") ||
    cat.includes("mantenimiento")
  ) {
    return "Gestión del Taller";
  }

  // 4. Servicio de Taller (Diagnósticos, Banco de pruebas, Garantías, RMA, Tienda 3D, Cámaras CCTV, iVMS, SADP, MikroTik)
  if (
    name.includes("diagnóstico") ||
    name.includes("diagnostico") ||
    name.includes("tienda 3d") ||
    name.includes("tienda3d") ||
    name.includes("garant") ||
    name.includes("rma") ||
    name.includes("ivms") ||
    name.includes("sadp") ||
    name.includes("cctv") ||
    name.includes("winbox") ||
    name.includes("mikrotik") ||
    name.includes("unifi") ||
    act.includes("diagnóstico") ||
    act.includes("diagnostico") ||
    act.includes("garant") ||
    act.includes("rma") ||
    cat.includes("garant") ||
    cat.includes("diagnóst") ||
    cat.includes("diagnost")
  ) {
    return "Servicio de Taller";
  }

  // 5. Control Administrativo (Outlook, Correo, Excel, Word, Informes, Suite Auditoría, Programación y desarrollo técnico)
  if (
    name.includes("outlook") ||
    name.includes("mail") ||
    name.includes("correo") ||
    name.includes("excel") ||
    name.includes("word") ||
    name.includes("office") ||
    name.includes("antigravity") ||
    name.includes("code") ||
    name.includes("cursor") ||
    name.includes("terminal") ||
    name.includes("powershell") ||
    name.includes("cmd") ||
    name.includes("github") ||
    name.includes("gemini") ||
    name.includes("auditor") ||
    name.includes("admin") ||
    act.includes("informe") ||
    cat.includes("admin") ||
    cat.includes("correo") ||
    cat.includes("desarrollo") ||
    cat.includes("proceso")
  ) {
    return "Control Administrativo";
  }

  // 6. Pausa Sanitaria (Baño, Higiene)
  if (
    name.includes("sanitaria") ||
    name.includes("baño") ||
    name.includes("bano") ||
    act.includes("sanitaria") ||
    act.includes("baño") ||
    act.includes("bano") ||
    cat.includes("sanitaria") ||
    cat.includes("baño") ||
    cat.includes("bano")
  ) {
    return "Pausa Sanitaria";
  }

  // 7. Descansos (Almuerzo, Café, Descanso programado)
  if (
    name.includes("descanso") ||
    name.includes("almuerzo") ||
    name.includes("receso") ||
    act.includes("descanso") ||
    act.includes("almuerzo") ||
    act.includes("receso") ||
    cat.includes("descanso") ||
    cat.includes("almuerzo")
  ) {
    return "Descansos";
  }

  // 8. Utilidades (Spotify, Navegador Web, Program Manager, accesorios del SO, calculadoras, etc.)
  if (
    name.includes("utilidad") ||
    name.includes("spotify") ||
    name.includes("navegador") ||
    name.includes("browser") ||
    name.includes("búsqueda") ||
    name.includes("busqueda") ||
    name.includes("google") ||
    name.includes("explorador") ||
    name.includes("program manager") ||
    name.includes("conmutac") ||
    name.includes("task switching") ||
    name.includes("escritorio") ||
    name.includes("calculadora") ||
    name.includes("calc") ||
    name.includes("notepad") ||
    name.includes("bloc de notas") ||
    name.includes("taskmgr") ||
    name.includes("administrador de tareas") ||
    name.includes("google one") ||
    act.includes("spotify") ||
    act.includes("program manager") ||
    act.includes("conmutac") ||
    cat.includes("utilidad")
  ) {
    return "Utilidades";
  }

  // 9. Soporte (únicamente WhatsApp, Seka Chat, Linkus llamadas, Odoo Tickets, software remoto específico)
  if (
    name.includes("whatsapp") ||
    name.includes("seka chat") ||
    name.includes("linkus") ||
    name.includes("phone") ||
    name.includes("llamada") ||
    name.includes("anydesk") ||
    name.includes("teamviewer") ||
    name.includes("ultraviewer") ||
    name.includes("rustdesk") ||
    name.includes("supremo") ||
    name.includes("odoo") ||
    name.includes("ticket") ||
    name.includes("soporte") ||
    act.includes("whatsapp") ||
    act.includes("seka chat") ||
    act.includes("linkus") ||
    act.includes("odoo") ||
    cat.includes("soporte")
  ) {
    return "Soporte";
  }

  // 10. Si es navegación web genérica
  if (
    name.includes("brave") ||
    name.includes("chrome") ||
    name.includes("edge") ||
    name.includes("firefox") ||
    name.includes("opera") ||
    name.includes("web") ||
    name.includes("navegador") ||
    act.includes("navegador")
  ) {
    return "Utilidades";
  }

  // Si no coincide con ninguna regla oficial previa, debe quedar "Sin Clasificar" para que el supervisor decida
  return "Sin Clasificar";
}

/**
 * Deduce la subcategoría oficial adecuada según el software y su categoría principal
 */
export function getDefaultSubcategoryForApp(appName: string, category: string): string | null {
  const name = (appName || "").toLowerCase();
  if (category === "Utilidades") {
    if (name.includes("spotify") || name.includes("música") || name.includes("musica")) return "Música y Ambiente";
    if (name.includes("program manager") || name.includes("conmutac") || name.includes("escritorio") || name.includes("explorador") || name.includes("taskmgr")) return "Herramientas del Sistema";
    if (name.includes("calculadora") || name.includes("notepad") || name.includes("bloc de notas")) return "Accesorios de Escritorio";
    return "Navegación General";
  }
  if (category === "Soporte") {
    if (name.includes("linkus") || name.includes("phone") || name.includes("llamada")) return "Telefónico";
    if (name.includes("whatsapp") || name.includes("seka chat") || name.includes("chat")) return "Mensajería";
    if (name.includes("anydesk") || name.includes("teamviewer") || name.includes("ultraviewer") || name.includes("rustdesk") || name.includes("supremo") || name.includes("remoto") || name.includes("vnc") || name.includes("escritorio remoto")) return "Remoto";
    if (name.includes("odoo") || name.includes("ticket") || name.includes("presencial")) return "Presencial";
    return null; // NUNCA asignar "Remoto" ciegamente por defecto
  }
  if (category === "Control Administrativo") {
    if (name.includes("outlook") || name.includes("correo") || name.includes("mail")) return "Optimización de Procesos";
    if (name.includes("nextime") || name.includes("antigravity") || name.includes("devin") || name.includes("github") || name.includes("chatgpt") || name.includes("supabase")) return "Optimización de Procesos";
    if (name.includes("inventario")) return "Inventarios";
    if (name.includes("garantía") || name.includes("garantia")) return "Gestión de Garantías";
    if (name.includes("devoluci")) return "Devoluciones";
    if (name.includes("seguimiento")) return "Seguimiento de Casos";
  }
  if (category === "Servicio de Taller") {
    if (name.includes("diagnóst") || name.includes("diagnost")) return "Diagnóstico";
    if (name.includes("mantenimiento")) return "Mantenimiento";
    if (name.includes("prueba") || name.includes("validaci")) return "Pruebas y Validación";
    return "Reparación";
  }
  if (category === "Gestión del Taller") {
    if (name.includes("limpieza") || name.includes("orden")) return "Orden y Limpieza de Taller";
    if (name.includes("acondicionamiento")) return "Acondicionamiento del Área";
    return "Organización de Equipos";
  }
  if (category === "Descansos") {
    if (name.includes("almuerzo")) return "Almuerzo";
    if (name.includes("café") || name.includes("cafe") || name.includes("merienda")) return "Café / Merienda";
    return "Tiempo de Descanso";
  }
  if (category === "Pausa Sanitaria") {
    return "Pausa Sanitaria";
  }
  return null;
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

export function cleanSubcategoryName(name?: string | null): string {
  if (!name) return "";
  return name.replace(/\s*\((?:manual|labor manual|taller)\)\s*/gi, "").trim();
}

export function isSubcategoryManual(cat: CategoryItem | undefined, subName?: string | null): boolean {
  if (!cat || !subName) return false;
  if (cat.is_manual) return true;
  const clean = cleanSubcategoryName(subName).toLowerCase();
  if (/\(manual\)/i.test(subName)) return true;
  return (cat.manual_subcategories || []).some((m) => cleanSubcategoryName(m).toLowerCase() === clean);
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

function ActivityAppsRankingComponent({
  timeline,
  scheduleStart = "08:00",
  scheduleEnd = "17:00",
  scheduleEnabled = true,
  workDays = [1, 2, 3, 4, 5],
  toleranceMinutes = 3,
  useMixedSchedule = false,
  daySchedules,
  onAppMappingsChange,
}: Props) {
  const [viewMode, setViewMode] = useState<"categories" | "apps">("categories");
  const [categories, setCategories] = useState<CategoryItem[]>(DEFAULT_CATEGORIES);
  const [customCategories, setCustomCategories] = useState<Record<string, any>>({});
  const [activeDropdownApp, setActiveDropdownApp] = useState<string | null>(null);
  const [showManageModal, setShowManageModal] = useState(false);
  const [activeModalTab, setActiveModalTab] = useState<"apps" | "categories">("apps");
  const [searchQuery, setSearchQuery] = useState("");
  const [savingApp, setSavingApp] = useState<string | null>(null);
  const [hideSystemNoise, setHideSystemNoise] = useState(true);
  const [appsCategoryFilter, setAppsCategoryFilter] = useState<string>("all");

  // Estados para agregar software o URL manual
  const [showAddCustomModal, setShowAddCustomModal] = useState(false);
  const [newCustomItemName, setNewCustomItemName] = useState("");
  const [newCustomItemCat, setNewCustomItemCat] = useState("Soporte");
  const [newCustomItemSub, setNewCustomItemSub] = useState("");

  // Estado para inline add en Árbol Operativo
  const [treeSubcatAddTarget, setTreeSubcatAddTarget] = useState<string | null>(null);
  const [treeSubcatItemInput, setTreeSubcatItemInput] = useState("");

  // Estados para Tree View interactivo y edición
  const [treeSearch, setTreeSearch] = useState("");
  const [editingSubcat, setEditingSubcat] = useState<{ catId: string; subcat: string } | null>(null);
  const [editingSubcatValue, setEditingSubcatValue] = useState("");
  const [treeNewSubcatCatId, setTreeNewSubcatCatId] = useState<string | null>(null);
  const [treeNewSubcatInput, setTreeNewSubcatInput] = useState("");
  const [selectedTreeCatId, setSelectedTreeCatId] = useState<string>("Soporte");

  // Estados para Drag & Drop y Gestión Avanzada de Items
  const [draggedItem, setDraggedItem] = useState<string | null>(null);
  const [dragOverTarget, setDragOverTarget] = useState<string | null>(null);
  const [showUnassignedDrawer, setShowUnassignedDrawer] = useState(false);
  const [unassignedSearch, setUnassignedSearch] = useState("");
  const [itemToManage, setItemToManage] = useState<{
    appName: string;
    currentCat: string;
    currentSub: string | null;
  } | null>(null);
  const [manageTargetCat, setManageTargetCat] = useState<string>("");
  const [manageTargetSub, setManageTargetSub] = useState<string>("");

  const [editingCategory, setEditingCategory] = useState<CategoryItem | null>(null);
  const [isCreatingNew, setIsCreatingNew] = useState(false);
  const [formCatName, setFormCatName] = useState("");
  const [formCatColorIdx, setFormCatColorIdx] = useState(0);
  const [formCatIcon, setFormCatIcon] = useState("Monitor");
  const [formCatSubcategories, setFormCatSubcategories] = useState<string[]>([]);
  const [newSubcatInput, setNewSubcatInput] = useState("");
  const [inlineAddSubcatCatId, setInlineAddSubcatCatId] = useState<string | null>(null);
  const [inlineSubcatValue, setInlineSubcatValue] = useState("");
  const [inlineSubcatIsManual, setInlineSubcatIsManual] = useState(false);
  const [formSubcatIsManual, setFormSubcatIsManual] = useState(false);
  const [expandedManualSubcat, setExpandedManualSubcat] = useState<string | null>(null);
  const [expandedSubcatApps, setExpandedSubcatApps] = useState<string | null>(null);
  const [addingProcessForSubcat, setAddingProcessForSubcat] = useState<string | null>(null);
  const [newProcessInput, setNewProcessInput] = useState("");
  const [newManualTaskInput, setNewManualTaskInput] = useState("");

  // Helper para resolver la asignación completa (categoría + subcategoría) de una app
  const getAppAssignment = (appName: string, action?: string, category?: string) => {
    if (appName === "Formación de Usuarios") {
      return {
        category: "Sin Clasificar",
        subcategory: null,
        isManual: true,
      };
    }
    const custom = customCategories[appName];
    if (custom) {
      if (typeof custom === "object" && custom.category) {
        if (custom.category === "Sin Clasificar" || custom.category === "unassigned") {
          return {
            category: "Sin Clasificar",
            subcategory: null,
            isManual: true,
          };
        }
        return {
          category: custom.category as string,
          subcategory: custom.subcategory ? cleanSubcategoryName(custom.subcategory as string) : null,
          isManual: true,
        };
      }
      if (typeof custom === "string") {
        if (custom === "Sin Clasificar" || custom === "unassigned") {
          return {
            category: "Sin Clasificar",
            subcategory: null,
            isManual: true,
          };
        }
        return {
          category: custom,
          subcategory: null,
          isManual: true,
        };
      }
    }
    const defCat = getDefaultCategoryForApp(appName, action, category);
    const defSub = getDefaultSubcategoryForApp(appName, defCat);
    return {
      category: defCat,
      subcategory: defSub ? cleanSubcategoryName(defSub) : null,
      isManual: false,
    };
  };

  // Función para normalizar categorías y asegurar que incluyan subcategorías limpias
  const sanitizeCategoryList = (list: CategoryItem[]): CategoryItem[] => {
    if (!Array.isArray(list) || list.length === 0) return DEFAULT_CATEGORIES;
    return list.map((cat) => {
      const manualSet = new Set<string>(
        (cat.manual_subcategories || []).map((m) => cleanSubcategoryName(m).toLowerCase())
      );
      const cleanSubs: string[] = [];
      (cat.subcategories || []).forEach((s) => {
        const clean = cleanSubcategoryName(s);
        if (!clean) return;
        if (/\(manual\)/i.test(s)) {
          manualSet.add(clean.toLowerCase());
        }
        if (!cleanSubs.includes(clean)) {
          cleanSubs.push(clean);
        }
      });
      return {
        ...cat,
        subcategories: cleanSubs,
        manual_subcategories: Array.from(manualSet).map((m) => {
          const found = cleanSubs.find((s) => s.toLowerCase() === m);
          return found || m;
        }),
      };
    });
  };

  // Cargar categorías y mapeos de localStorage y API
  useEffect(() => {
    try {
      const localMaps = localStorage.getItem("sek_app_categories");
      if (localMaps) {
        const parsed = JSON.parse(localMaps);
        delete parsed["Formación de Usuarios"];
        setCustomCategories(parsed);
      }
      const localCats = localStorage.getItem("sek_categories_list");
      if (localCats) {
        const sanitized = sanitizeCategoryList(JSON.parse(localCats));
        setCategories(sanitized);
        try { localStorage.setItem("sek_categories_list", JSON.stringify(sanitized)); } catch {}
      }
    } catch {}

    fetch("/api/activity/app-categories")
      .then((res) => res.json())
      .then((data) => {
        if (data?.appMappings) {
          delete data.appMappings["Formación de Usuarios"];
          setCustomCategories(data.appMappings);
          try { localStorage.setItem("sek_app_categories", JSON.stringify(data.appMappings)); } catch {}
        }
        if (data?.categories && Array.isArray(data.categories) && data.categories.length > 0) {
          const sanitized = sanitizeCategoryList(data.categories);
          setCategories(sanitized);
          try { localStorage.setItem("sek_categories_list", JSON.stringify(sanitized)); } catch {}
          fetch("/api/activity/app-categories", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ categories: sanitized }),
          }).catch(() => {});
        }
      })
      .catch(() => {});
  }, []);

  const getCategoryDef = (catName: string): CategoryItem => {
    const ui = getCategoryUI(catName);
    const found = categories.find((c) => c.id === ui.id || c.label === ui.label);
    if (found) return found;
    return ui;
  };

  // Asignar categoría y subcategoría a una aplicación
  const handleSetCategory = async (
    appName: string,
    category: string | null,
    subcategory?: string | null,
    isManualTask?: boolean
  ) => {
    const cleanSub = subcategory ? cleanSubcategoryName(subcategory) : null;
    setSavingApp(appName);
    const newMap = { ...customCategories };
    const prev = newMap[appName];
    const prevManual = typeof prev === "object" && prev ? prev.is_manual_task : undefined;
    const finalManual = typeof isManualTask === "boolean" ? isManualTask : (prevManual ?? false);

    const isUnassigned = !category || category === "auto" || category === "Sin Clasificar";
    if (isUnassigned) {
      newMap[appName] = { category: "Sin Clasificar", subcategory: null, is_manual_task: false };
    } else {
      newMap[appName] = {
        category,
        subcategory: cleanSub || null,
        is_manual_task: finalManual,
      };
    }

    if (appName === "Formación de Usuarios") {
      delete newMap[appName];
    }

    setCustomCategories(newMap);
    try { localStorage.setItem("sek_app_categories", JSON.stringify(newMap)); } catch {}
    if (typeof window !== "undefined") {
      window.dispatchEvent(new CustomEvent("sekunet_categories_updated", { detail: newMap }));
    }
    setActiveDropdownApp(null);

    try {
      await fetch("/api/activity/app-categories", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          appName,
          category: isUnassigned ? "Sin Clasificar" : category,
          subcategory: cleanSub || undefined,
          is_manual_task: isUnassigned ? false : finalManual,
        }),
      });
      if (typeof window !== "undefined") {
        window.dispatchEvent(new CustomEvent("sekunet_categories_updated", { detail: newMap }));
      }
    } catch (err) {
      console.error("Error al guardar categoría:", err);
    } finally {
      setSavingApp(null);
    }
  };

  const checkIsProcessManual = (appName: string, _catId?: string, _subcatName?: string) => {
    const custom = customCategories[appName];
    if (custom && typeof custom === "object" && typeof custom.is_manual_task === "boolean") {
      return custom.is_manual_task;
    }
    return false;
  };

  const handleToggleProcessManual = async (appName: string, currentVal: boolean) => {
    const newVal = !currentVal;
    const existing = customCategories[appName];
    const asg = getAppAssignment(appName);
    const targetCat = (typeof existing === "object" && existing?.category) || asg.category || "Servicio de Taller";
    const targetSub = (typeof existing === "object" && existing?.subcategory) || asg.subcategory || null;
    await handleSetCategory(appName, targetCat, targetSub, newVal);
  };

  const handleDeleteApp = async (appName: string) => {
    setSavingApp(appName);
    const newMap = { ...customCategories };
    delete newMap[appName];

    setCustomCategories(newMap);
    try { localStorage.setItem("sek_app_categories", JSON.stringify(newMap)); } catch {}
    if (typeof window !== "undefined") {
      window.dispatchEvent(new CustomEvent("sekunet_categories_updated", { detail: newMap }));
    }

    try {
      await fetch("/api/activity/app-categories", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          appName,
          action: "deleteApp",
        }),
      });
      if (typeof window !== "undefined") {
        window.dispatchEvent(new CustomEvent("sekunet_categories_updated", { detail: newMap }));
      }
    } catch (err) {
      console.error("Error al eliminar software:", err);
    } finally {
      setSavingApp(null);
    }
  };

  const handleIgnoreApp = async (appName: string) => {
    setSavingApp(appName);
    const newMap = { ...customCategories };
    newMap[appName] = { category: "Ignorada", subcategory: "Ignorada", is_ignored: true };

    setCustomCategories(newMap);
    try { localStorage.setItem("sek_app_categories", JSON.stringify(newMap)); } catch {}
    if (typeof window !== "undefined") {
      window.dispatchEvent(new CustomEvent("sekunet_categories_updated", { detail: newMap }));
    }

    try {
      await fetch("/api/activity/app-categories", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          appMappings: newMap,
        }),
      });
      if (typeof window !== "undefined") {
        window.dispatchEvent(new CustomEvent("sekunet_categories_updated", { detail: newMap }));
      }
    } catch (err) {
      console.error("Error al ignorar software:", err);
    } finally {
      setSavingApp(null);
    }
  };

  const handleUnlinkProcess = async (appName: string) => {
    await handleDeleteApp(appName);
  };

  const handleAddProcessToSubcat = async (procName: string, catId: string, subcatName: string) => {
    const cleanProc = procName.trim();
    if (!cleanProc) return;
    await handleSetCategory(cleanProc, catId, subcatName, false);
    setAddingProcessForSubcat(null);
    setNewProcessInput("");
  };

  const saveCategoriesList = async (updatedList: CategoryItem[]) => {
    setCategories(updatedList);
    try { localStorage.setItem("sek_categories_list", JSON.stringify(updatedList)); } catch {}
    if (typeof window !== "undefined") {
      window.dispatchEvent(new Event("sekunet_categories_updated"));
    }
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

  // Agregar subcategoría rápida a una categoría existente
  const handleAddSubcategory = async (catId: string, subcatName: string, isManual: boolean = false) => {
    const clean = cleanSubcategoryName(subcatName);
    if (!clean) return;
    const updated = categories.map((cat) => {
      if (cat.id === catId) {
        const subs = (cat.subcategories || []).map((s) => cleanSubcategoryName(s));
        const manuals = (cat.manual_subcategories || []).map((m) => cleanSubcategoryName(m));
        if (!subs.some((s) => s.toLowerCase() === clean.toLowerCase())) {
          subs.push(clean);
        }
        if (isManual && !manuals.some((m) => m.toLowerCase() === clean.toLowerCase())) {
          manuals.push(clean);
        }
        return { ...cat, subcategories: subs, manual_subcategories: manuals };
      }
      return cat;
    });
    saveCategoriesList(updated);
    setInlineAddSubcatCatId(null);
    setInlineSubcatValue("");
    setInlineSubcatIsManual(false);
    setTreeNewSubcatCatId(null);
    setTreeNewSubcatInput("");
  };

  // Alternar si una subcategoría es Manual (botón en barra lateral) o Digital (PC)
  const handleToggleSubcategoryManual = async (catId: string, subcatName: string) => {
    const cleanName = cleanSubcategoryName(subcatName);
    const updated = categories.map((cat) => {
      if (cat.id === catId) {
        const currentSubs = (cat.subcategories || []).map((s) => cleanSubcategoryName(s));
        const currentManuals = (cat.manual_subcategories || []).map((m) => cleanSubcategoryName(m));
        const isCurrentlyManual = currentManuals.some((m) => m.toLowerCase() === cleanName.toLowerCase()) || /\(manual\)/i.test(subcatName);
        const newManuals = isCurrentlyManual
          ? currentManuals.filter((m) => m.toLowerCase() !== cleanName.toLowerCase())
          : [...currentManuals, cleanName];
        return {
          ...cat,
          manual_subcategories: newManuals,
          subcategories: currentSubs,
        };
      }
      return cat;
    });
    saveCategoriesList(updated);

    // Si había mapeos de aplicaciones con versiones antiguas que tenían (MANUAL), limpiarlos
    const newMap = { ...customCategories };
    let changed = false;
    for (const [app, val] of Object.entries(newMap)) {
      if (typeof val === "object" && val && (val.category === catId || val.category === getCategoryUI(catId).label) && val.subcategory) {
        const cleanSub = cleanSubcategoryName(val.subcategory);
        if (cleanSub.toLowerCase() === cleanName.toLowerCase() && val.subcategory !== cleanName) {
          newMap[app] = { ...val, subcategory: cleanName };
          changed = true;
        }
      }
    }
    if (changed) {
      setCustomCategories(newMap);
      try { localStorage.setItem("sek_app_categories", JSON.stringify(newMap)); } catch {}
      fetch("/api/activity/app-categories", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ appMappings: newMap }),
      }).catch(console.error);
    }
  };

  // Alternar categoría completa como manual o digital
  const handleToggleCategoryManual = async (catId: string) => {
    const updated = categories.map((cat) => {
      if (cat.id === catId) {
        return { ...cat, is_manual: !cat.is_manual };
      }
      return cat;
    });
    saveCategoriesList(updated);
  };

  // Eliminar subcategoría de una categoría
  const handleDeleteSubcategory = async (catId: string, subcatName: string) => {
    const cleanName = cleanSubcategoryName(subcatName).toLowerCase();
    const updated = categories.map((cat) => {
      if (cat.id === catId && cat.subcategories) {
        return {
          ...cat,
          subcategories: cat.subcategories.filter((s) => cleanSubcategoryName(s).toLowerCase() !== cleanName),
          manual_subcategories: (cat.manual_subcategories || []).filter((m) => cleanSubcategoryName(m).toLowerCase() !== cleanName),
        };
      }
      return cat;
    });
    saveCategoriesList(updated);

    // Desvincular de customCategories para que pasen a Sin Clasificar
    const newMap = { ...customCategories };
    let changed = false;
    for (const [app, val] of Object.entries(newMap)) {
      if (typeof val === "object" && val && (val.category === catId || val.category === getCategoryUI(catId).label) && val.subcategory) {
        if (cleanSubcategoryName(val.subcategory).toLowerCase() === cleanName) {
          newMap[app] = { category: catId, subcategory: null };
          changed = true;
        }
      }
    }
    if (changed) {
      setCustomCategories(newMap);
      try { localStorage.setItem("sek_app_categories", JSON.stringify(newMap)); } catch {}
      fetch("/api/activity/app-categories", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ appMappings: newMap }),
      });
    }
  };

  // Renombrar subcategoría y migrar las asignaciones existentes
  const handleRenameSubcategory = async (catId: string, oldName: string, newName: string) => {
    const trimmed = newName.trim();
    if (!trimmed || trimmed === oldName) {
      setEditingSubcat(null);
      return;
    }
    const updated = categories.map((cat) => {
      if (cat.id === catId && cat.subcategories) {
        return {
          ...cat,
          subcategories: cat.subcategories.map((s) => (s === oldName ? trimmed : s)),
        };
      }
      return cat;
    });
    saveCategoriesList(updated);

    const newMap = { ...customCategories };
    let changed = false;
    for (const [app, val] of Object.entries(newMap)) {
      if (typeof val === "object" && val.category === catId && val.subcategory === oldName) {
        newMap[app] = { category: catId, subcategory: trimmed };
        changed = true;
      }
    }
    if (changed) {
      setCustomCategories(newMap);
      try { localStorage.setItem("sek_app_categories", JSON.stringify(newMap)); } catch {}
      fetch("/api/activity/app-categories", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ fullMap: newMap }),
      });
    }
    setEditingSubcat(null);
    setEditingSubcatValue("");
  };

  // Restablecer al árbol oficial del taller (Excel)
  const handleResetToOfficialTree = async () => {
    if (!confirm("¿Restablecer el Árbol Operativo a las categorías oficiales del taller?")) return;
    try {
      localStorage.setItem("sek_categories_list", JSON.stringify(DEFAULT_CATEGORIES));
    } catch {}
    setCategories(DEFAULT_CATEGORIES);
    saveCategoriesList(DEFAULT_CATEGORIES);
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
            subcategories: formCatSubcategories,
            is_manual: editingCategory.is_manual,
          };
        }
        return c;
      });

      if (editingCategory.id !== name) {
        const newMaps = { ...customCategories };
        let changed = false;
        for (const [app, val] of Object.entries(newMaps)) {
          const currentCat = typeof val === "object" ? val?.category : val;
          if (currentCat === editingCategory.id) {
            if (typeof val === "object") {
              newMaps[app] = { ...val, category: name };
            } else {
              newMaps[app] = name;
            }
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
        subcategories: formCatSubcategories,
        is_manual: false,
      };
      saveCategoriesList([...categories, newCat]);
      setIsCreatingNew(false);
    }

    setFormCatName("");
    setFormCatSubcategories([]);
    setNewSubcatInput("");
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
    for (const [app, val] of Object.entries(newMaps)) {
      const currentCat = typeof val === "object" ? val?.category : val;
      if (currentCat === catId) {
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
    if (!confirm("¿Restablecer todas las categorías a las preconfiguradas originales?")) return;
    setCategories(DEFAULT_CATEGORIES);
    try { localStorage.setItem("sek_categories_list", JSON.stringify(DEFAULT_CATEGORIES)); } catch {}
    await fetch("/api/activity/app-categories", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ resetCategories: true }),
    });
  };

  // ── MOTOR UNIFICADO: Única Fuente de Verdad para distribución de tiempos ────
  const metrics = useMemo(() => {
    return computeUnifiedActivityMetrics(timeline as any, {
      toleranceMinutes,
      scheduleStart,
      scheduleEnd,
      useMixedSchedule,
      daySchedules,
      appMappings: customCategories,
    });
  }, [timeline, toleranceMinutes, scheduleStart, scheduleEnd, useMixedSchedule, daySchedules, customCategories]);

  const isPhantomCategory = (name: string) => {
    const l = (name || "").toLowerCase().trim();
    return (
      l === "control administrativo" ||
      l === "soporte" ||
      l === "servicio de taller" ||
      l === "gestión del taller" ||
      l === "gestion del taller" ||
      l === "gestión de residuos" ||
      l === "gestion de residuos" ||
      l === "on-the-job training (ojt)" ||
      l === "ojt" ||
      l === "descansos" ||
      l === "descanso" ||
      l.includes("descanso") ||
      l.includes("almuerzo") ||
      l.includes("merienda") ||
      l === "pausa sanitaria" ||
      l.includes("sanitaria") ||
      l.includes("baño") ||
      l.includes("bano") ||
      l === "utilidades" ||
      l === "actividad general" ||
      l === "operativa" ||
      l === "sin clasificar" ||
      l === "formación de usuarios" ||
      l === "inactividad" ||
      l === "inactivo" ||
      l.includes("inactiv") ||
      l === "pausa" ||
      l === "pausa operativa" ||
      l.startsWith("pausa") ||
      l.includes("pausa / inactividad") ||
      l.includes("pausa / descanso") ||
      l === "navegación" ||
      l === "navegacion" ||
      l === "navegación web" ||
      l === "navegacion web" ||
      l === "navegador" ||
      l === "navegador web" ||
      l.startsWith("navegador:") ||
      l.startsWith("navegador web:") ||
      l.startsWith("mi bandeja") ||
      l === "explorer" ||
      l.includes("mystify")
    );
  };

  const isSystemNoise = (name: string) => {
    const l = (name || "").toLowerCase().trim();
    return (
      l === "login" ||
      l.startsWith("login ") ||
      l.endsWith(" login") ||
      l === "iniciar sesión" ||
      l === "iniciar sesion" ||
      l.startsWith("iniciar sesi") ||
      l === "sign in" ||
      l.startsWith("sign in") ||
      l === "signin" ||
      l === "auth" ||
      l.startsWith("auth") ||
      l === "acceso" ||
      l === "nueva pestaña" ||
      l === "new tab" ||
      l === "bienvenido" ||
      l === "welcome" ||
      l === "blank" ||
      l === "about:blank" ||
      l === "cargando" ||
      l === "loading" ||
      l.includes("program manager") ||
      l.includes("conmutac") ||
      l.includes("task switching") ||
      l.includes("applicationframehost") ||
      l.includes("pickerhost") ||
      l.includes("file picker") ||
      l.includes("seleccionar carpeta") ||
      l.includes("guardar como") ||
      l.includes("abrir archivo") ||
      l === "explorador de windows" ||
      l.startsWith("explorador:") ||
      l === "escritorio de windows" ||
      l === "conmutación de tareas" ||
      l.includes("taskmgr") ||
      l.includes("mystify")
    );
  };

  const allDetectedApps = useMemo(() => {
    return metrics.topSoftware
      .map((s) => s.name)
      .filter((n) => !isPhantomCategory(n) && !isSystemNoise(n));
  }, [metrics]);

  const currentTotal = metrics.totalDayMs;

  const sortedItems: [string, { durationMs: number; count: number }][] = useMemo(() => {
    if (viewMode === "categories") {
      return metrics.operationalBuckets.map((b) => [
        b.id,
        { durationMs: b.durationMs, count: 1 },
      ]);
    } else {
      return metrics.topSoftware
        .filter((s) => !isPhantomCategory(s.name) && !isSystemNoise(s.name))
        .slice(0, 15)
        .map((s) => [
          s.name,
          { durationMs: s.durationMs, count: s.count },
        ]);
    }
  }, [viewMode, metrics]);


  const fixMojibake = (str: string): string => {
    if (!str) return "";
    return str
      .replace(/t[\uFFFD\?]+tulo/gi, "título")
      .replace(/sesi[\uFFFD\?]+n/gi, "sesión")
      .replace(/contrase[\uFFFD\?]+a/gi, "contraseña")
      .replace(/atenci[\uFFFD\?]+n/gi, "atención")
      .replace(/gesti[\uFFFD\?]+n/gi, "gestión")
      .replace(/reuni[\uFFFD\?]+n/gi, "reunión")
      .replace(/administraci[\uFFFD\?]+n/gi, "administración")
      .replace(/configuraci[\uFFFD\?]+n/gi, "configuración")
      .replace(/notificaci[\uFFFD\?]+n/gi, "notificación")
      .replace(/ubicaci[\uFFFD\?]+n/gi, "ubicación")
      .replace(/garant[\uFFFD\?]+a/gi, "garantía")
      .replace(/bater[\uFFFD\?]+a/gi, "batería")
      .replace(/informaci[\uFFFD\?]+n/gi, "información")
      .replace(/direcci[\uFFFD\?]+n/gi, "dirección")
      .replace(/electr[\uFFFD\?]+nico/gi, "electrónico")
      .replace(/m[\uFFFD\?]+sica/gi, "música")
      .replace(/p[\uFFFD\?]+gina/gi, "página")
      .replace(/tel[\uFFFD\?]+fono/gi, "teléfono");
  };

  const sanitizeAppName = (name: string): string => {
    let clean = fixMojibake((name || "").trim());
    // Limpiar badges de notificación como (1) , (43) , etc.
    clean = clean.replace(/^\(\d+\+?\)\s*/, "").replace(/^\*\s*/, "").trim();

    if (clean.toLowerCase().startsWith("navegador web:")) {
      clean = clean.replace(/^navegador web:\s*/i, "").trim();
    }
    if (clean.toLowerCase().startsWith("navegador:")) {
      clean = clean.replace(/^navegador:\s*/i, "").trim();
    }
    const lc = clean.toLowerCase();

    // 1. Odoo ERP (tickets #04xxx, cotizaciones, presupuestos, portal Odoo)
    if (
      lc.includes("odoo") ||
      /#\d{4,6}/.test(lc) ||
      lc.includes("cotizaciones") ||
      lc.includes("presupuesto") ||
      /\b[sS]\d{5}\b/.test(lc)
    ) {
      return "Odoo ERP";
    }

    if (lc.includes("chat sekunet") || lc.includes("atención al cliente") || lc.includes("seka chat")) {
      return "Seka Chat";
    }
    if (lc.includes("buscar con google") || lc.includes("google search")) {
      return "Búsqueda en Google";
    }
    if (lc.includes("hikvision") || lc.includes("hik-partner") || lc.includes("cloudsso")) {
      return "Hikvision";
    }

    // 2. Títulos genéricos de páginas o pestañas sin software específico
    if (
      lc === "nuevo" ||
      lc === "iniciar sesión" ||
      lc === "iniciar sesion" ||
      lc.startsWith("iniciar sesi") ||
      lc === "login" ||
      lc.startsWith("login ") ||
      lc === "sign in" ||
      lc === "nueva pestaña" ||
      lc === "new tab" ||
      lc === "acceso" ||
      lc === "acceder" ||
      lc === "sin título" ||
      lc === "sin titulo" ||
      lc === "configuración" ||
      lc === "configuracion" ||
      lc.includes("500: internal server error")
    ) {
      return "Navegador Web";
    }
    return clean;
  };

  const allSanitizedApps = useMemo(() => {
    const appMap = new Map<string, string>();

    // 1. Procesos y tareas configurados explícitamente en customCategories:
    for (const [rawKey, val] of Object.entries(customCategories)) {
      if (!rawKey || rawKey === "Formación de Usuarios") continue;
      if (isSystemNoise(rawKey)) continue;
      if (typeof val === "object" && (val?.is_ignored || val?.category === "Ignorada")) continue;
      const cat = typeof val === "object" ? val?.category : val;
      // Si fue desvinculada/puesta en Sin Clasificar y no está en apps detectadas en vivo, no retenerla
      if ((cat === "Sin Clasificar" || cat === "unassigned") && !allDetectedApps.some((d) => d.toLowerCase() === rawKey.toLowerCase())) {
        continue;
      }
      const trimmed = rawKey.trim();
      if (trimmed.length >= 2) {
        appMap.set(trimmed.toLowerCase(), trimmed);
      }
    }

    // 2. Apps detectadas en el sistema (hoy):
    for (const raw of allDetectedApps) {
      if (!raw) continue;
      if (isPhantomCategory(raw) || isSystemNoise(raw)) continue;
      const customVal = customCategories[raw];
      if (typeof customVal === "object" && (customVal?.is_ignored || customVal?.category === "Ignorada")) continue;

      const sanitized = sanitizeAppName(raw);
      if (isPhantomCategory(sanitized) || isSystemNoise(sanitized)) continue;
      const customSanitized = customCategories[sanitized];
      if (typeof customSanitized === "object" && (customSanitized?.is_ignored || customSanitized?.category === "Ignorada")) continue;

      if (sanitized.length < 2) continue;
      if (!appMap.has(sanitized.toLowerCase())) {
        appMap.set(sanitized.toLowerCase(), sanitized);
      }
    }

    return Array.from(appMap.values()).sort((a, b) => a.localeCompare(b, "es", { sensitivity: "base" }));
  }, [allDetectedApps, customCategories, hideSystemNoise]);

  const totalUnassignedCount = useMemo(() => {
    return allSanitizedApps.filter((appName) => {
      const asg = getAppAssignment(appName);
      const matchedCat = categories.find((c) => c.id === asg.category || c.label === asg.category);
      return !matchedCat || !asg.subcategory || asg.category === "Sin Clasificar";
    }).length;
  }, [allSanitizedApps, categories, customCategories]);

  const filteredModalApps = useMemo(() => {
    let combined = allSanitizedApps;

    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      combined = combined.filter((app) => app.toLowerCase().includes(q));
    }

    if (appsCategoryFilter !== "all") {
      combined = combined.filter((app) => {
        const asg = getAppAssignment(app);
        if (appsCategoryFilter === "unassigned") {
          const matchedCat = categories.find((c) => c.id === asg.category || c.label === asg.category);
          return !matchedCat || !asg.subcategory || asg.category === "Sin Clasificar";
        }
        return asg.category === appsCategoryFilter;
      });
    }

    return combined;
  }, [allSanitizedApps, searchQuery, appsCategoryFilter, categories]);

  const unassignedApps = useMemo(() => {
    return allSanitizedApps.filter((appName) => {
      const asg = getAppAssignment(appName);
      const matchedCat = categories.find((c) => c.id === asg.category || c.label === asg.category);
      return !matchedCat || !asg.subcategory || asg.category === "Sin Clasificar";
    });
  }, [allSanitizedApps, categories, customCategories]);

  const [selectedInspectApp, setSelectedInspectApp] = useState<string | null>(null);

  // Mapa de rastro detallado: extrae procesos, colaboradores, títulos y fechas para cada app
  const appTraceMap = useMemo(() => {
    const map = new Map<string, {
      process: string;
      fullTitles: Set<string>;
      agents: Set<string>;
      urls: Set<string>;
      contexts: Set<string>;
      lastSeen: string;
      totalMs: number;
      count: number;
    }>();

    for (const item of (timeline || [])) {
      const meta = (item.metadata || {}) as Record<string, any>;
      const rawTitle = fixMojibake((meta.window_title || meta.title || "").trim());
      const rawContext = fixMojibake((meta.context || "").trim());
      const rawProcess = (meta.process || meta.app || meta.app_name || "").trim();
      const rawAct = fixMojibake((item.action || "").trim());
      const agent = (item.agent_name || item.agent_email || "").trim();
      const url = (meta.url || meta.domain || "").trim();
      const dur = Number(item.duration_ms || (meta.duration_seconds ? meta.duration_seconds * 1000 : 0)) || 0;

      const engineName = extractCleanItemName(item as any);

      const candidates = [
        engineName,
        sanitizeAppName(meta.app_name || ""),
        sanitizeAppName(meta.label || ""),
        sanitizeAppName(meta.task || ""),
        sanitizeAppName(rawTitle),
        sanitizeAppName(rawAct),
      ].filter(Boolean);

      for (const cand of candidates) {
        if (!cand || cand.length < 2) continue;
        const normKey = cand.toLowerCase();
        let existing = map.get(normKey);
        if (!existing) {
          existing = {
            process: rawProcess,
            fullTitles: new Set(),
            agents: new Set(),
            urls: new Set(),
            contexts: new Set(),
            lastSeen: item.created_at || "",
            totalMs: 0,
            count: 0,
          };
          map.set(normKey, existing);
        }
        if (rawProcess && !existing.process) existing.process = rawProcess;
        if (rawTitle) existing.fullTitles.add(rawTitle);
        if (rawContext && rawContext !== rawTitle) existing.contexts.add(rawContext);
        if (agent) existing.agents.add(agent);
        if (url) existing.urls.add(url);
        existing.totalMs += dur;
        existing.count += 1;
        if (item.created_at && (!existing.lastSeen || item.created_at > existing.lastSeen)) {
          existing.lastSeen = item.created_at;
        }
      }
    }

    return map;
  }, [timeline]);

  const filteredUnassigned = useMemo(() => {
    if (!unassignedSearch.trim()) return unassignedApps;
    const q = unassignedSearch.toLowerCase();
    return unassignedApps.filter((a) => a.toLowerCase().includes(q));
  }, [unassignedApps, unassignedSearch]);

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
              className={`px-3 py-1 text-xs font-bold rounded-md transition-all ${
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
              className={`px-3 py-1 text-xs font-bold rounded-md transition-all ${
                viewMode === "apps" ? "bg-background text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"
              }`}
            >
              Por Software / Labor
            </button>
          </div>

          <span className="text-xs text-muted-foreground font-medium hidden sm:inline-block">
            Total: {formatDuration(currentTotal)}
          </span>
        </div>
      </div>

      <div className="space-y-2.5">
        {sortedItems.map(([itemName, stats], index) => {
          const percentage = currentTotal > 0 ? Math.round((stats.durationMs / currentTotal) * 100) : 0;

          let icon, labelNode, barClass;
          if (viewMode === "categories") {
            const ui = getCategoryUI(itemName);
            icon = <div className={ui.color.split(" ")[0]}>{renderCategoryIcon(ui.iconName, "h-4 w-4")}</div>;
            labelNode = (
              <span className={`text-xs font-bold px-2.5 py-0.5 rounded-full border ${ui.color}`}>
                Categoría Oficial
              </span>
            );
            barClass = ui.bgBar;
          } else {
            // Modo Por Software: muestra la categoría y subcategoría asignada
            const assignment = getAppAssignment(itemName);
            const currentCat = assignment.category;
            const currentSub = assignment.subcategory;
            const ui = getCategoryUI(currentCat);
            icon = getAppIcon(itemName);
            barClass = ui.bgBar;

            labelNode = (
              <div className="relative inline-flex items-center gap-1.5">
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    setActiveDropdownApp(activeDropdownApp === itemName ? null : itemName);
                  }}
                  className={`text-xs font-bold px-2.5 py-0.5 rounded-full border flex items-center gap-1 transition-all hover:scale-105 cursor-pointer ${ui.color} ${
                    assignment.isManual ? "ring-1 ring-violet-500/50" : ""
                  }`}
                  title={assignment.isManual ? "Categoría personalizada manualmente (clic para cambiar)" : "Categoría asignada (clic para cambiar)"}
                >
                  {assignment.isManual && <span className="text-[11px] font-black mr-0.5">●</span>}
                  <span>{ui.label}</span>
                  <ChevronDown className="h-2.5 w-2.5 opacity-60 ml-0.5" />
                </button>

                {currentSub && (
                  <span
                    className="text-xs font-semibold px-2 py-0.5 rounded-full bg-muted/60 border border-border text-foreground/90"
                    title={`Subcategoría: ${cleanSubcategoryName(currentSub)}`}
                  >
                    {cleanSubcategoryName(currentSub)}
                  </span>
                )}

                {/* Dropdown flotante con las categorías y subcategorías */}
                {activeDropdownApp === itemName && (
                  <div
                    className="absolute right-0 top-full mt-1.5 w-64 rounded-xl bg-card border border-border shadow-2xl p-1.5 z-50 space-y-0.5 max-h-80 overflow-y-auto animate-in fade-in zoom-in-95 duration-100"
                    onClick={(e) => e.stopPropagation()}
                  >
                    <div className="px-2 py-1 text-[11px] font-black uppercase tracking-wider text-muted-foreground border-b border-border/50 mb-1 flex items-center justify-between">
                      <span className="truncate max-w-[150px]">Clasificar {itemName}</span>
                      {savingApp === itemName && <span className="text-violet-400 font-bold text-[11px]">Guardando...</span>}
                    </div>

                    {categories.map((cat) => {
                      const isSelected = currentCat === cat.id;
                      return (
                        <div key={cat.id} className="space-y-0.5">
                          <button
                            type="button"
                            onClick={() => handleSetCategory(itemName, cat.id, null)}
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

                          {/* Opciones de subcategorías dependientes si la categoría está seleccionada */}
                          {isSelected && cat.subcategories && cat.subcategories.length > 0 && (
                            <div className="pl-6 pr-1 py-0.5 space-y-0.5 border-l-2 border-violet-500/30 ml-4 my-1">
                              <button
                                type="button"
                                onClick={() => handleSetCategory(itemName, cat.id, null)}
                                className={`w-full text-left px-2 py-1 rounded text-xs flex items-center justify-between transition-colors ${
                                  !currentSub
                                    ? "bg-violet-500/20 text-violet-200 font-bold"
                                    : "hover:bg-muted/40 text-muted-foreground"
                                }`}
                              >
                                <span>(Sin subcategoría)</span>
                                {!currentSub && <Check className="h-2.5 w-2.5 text-violet-400" />}
                              </button>
                              {cat.subcategories.map((sub) => {
                                const isSubSelected = currentSub === sub;
                                return (
                                  <button
                                    key={sub}
                                    type="button"
                                    onClick={() => handleSetCategory(itemName, cat.id, sub)}
                                    className={`w-full text-left px-2 py-1 rounded text-xs flex items-center justify-between transition-colors ${
                                      isSubSelected
                                        ? "bg-violet-500/25 text-violet-200 font-bold"
                                        : "hover:bg-muted/50 text-muted-foreground hover:text-foreground"
                                    }`}
                                  >
                                    <span className="truncate">{cleanSubcategoryName(sub)}</span>
                                    {isSubSelected && <Check className="h-2.5 w-2.5 text-violet-400 shrink-0" />}
                                  </button>
                                );
                              })}
                            </div>
                          )}
                        </div>
                      );
                    })}

                    {assignment.isManual && (
                      <div className="pt-1 mt-1 border-t border-border/50">
                        <button
                          type="button"
                          onClick={() => handleSetCategory(itemName, null, null)}
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
                  <span className="text-xs font-black text-muted-foreground/60 w-4">
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

      {/* MODAL DE GESTIÓN Y CLASIFICACIÓN (SIMPLIFICADO) */}
      {showManageModal && (
        <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4">
          <div
            className="w-full transition-all duration-300 max-w-5xl xl:max-w-6xl h-[90vh] rounded-3xl bg-card border border-border/80 shadow-2xl p-6 space-y-4 max-h-[94vh] flex flex-col"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Header del Modal */}
            <div className="flex items-center justify-between border-b border-border/50 pb-3 shrink-0">
              <div className="flex items-center gap-3">
                <div className="p-2.5 rounded-xl bg-violet-500/15 border border-violet-500/25 text-violet-400">
                  <SlidersHorizontal className="h-5 w-5" />
                </div>
                <div>
                  <h3 className="font-bold text-lg text-foreground tracking-tight">Gestión Operativa del Taller</h3>
                  <p className="text-xs text-muted-foreground">
                    Asigne aplicaciones, URLs y tareas a sus categorías oficiales
                  </p>
                </div>
              </div>
              <button
                onClick={() => {
                  setShowManageModal(false);
                  setIsCreatingNew(false);
                  setEditingCategory(null);
                  setShowAddCustomModal(false);
                }}
                aria-label="Cerrar"
                className="p-2 rounded-xl hover:bg-muted text-muted-foreground hover:text-foreground transition-colors cursor-pointer"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            {/* Pestañas del Modal - 2 VISTAS CLARAS */}
            <div className="flex border-b border-border/50 gap-4 pb-1 shrink-0">
              <button
                onClick={() => { setActiveModalTab("apps"); setIsCreatingNew(false); setEditingCategory(null); }}
                className={`pb-2.5 px-3 text-sm font-bold transition-all border-b-2 flex items-center gap-2 whitespace-nowrap cursor-pointer ${
                  activeModalTab === "apps"
                    ? "border-violet-500 text-violet-400"
                    : "border-transparent text-muted-foreground hover:text-foreground"
                }`}
              >
                <Layers className="h-4 w-4" />
                <span>Clasificar Software y URLs</span>
                <span className="text-xs px-2 py-0.5 rounded-full bg-violet-500/20 text-violet-300 font-mono font-bold">
                  {allSanitizedApps.length}
                </span>
                {totalUnassignedCount > 0 && (
                  <span className="text-xs px-2.5 py-0.5 rounded-full bg-amber-500/20 text-amber-300 border border-amber-500/40 font-bold animate-pulse">
                    ⚠️ {totalUnassignedCount} pendientes
                  </span>
                )}
              </button>

              <button
                onClick={() => { setActiveModalTab("categories"); }}
                className={`pb-2.5 px-3 text-sm font-bold transition-all border-b-2 flex items-center gap-2 whitespace-nowrap cursor-pointer ${
                  activeModalTab === "categories"
                    ? "border-violet-500 text-violet-400"
                    : "border-transparent text-muted-foreground hover:text-foreground"
                }`}
              >
                <FolderTree className="h-4 w-4" />
                <span>Categorías del Taller ({categories.length})</span>
              </button>
            </div>

            {/* VISTA 1: CLASIFICACIÓN DE SOFTWARE Y LABORES */}
            {activeModalTab === "apps" && (
              <div className="flex-1 flex flex-col min-h-0 space-y-3">
                {/* Barra de búsqueda y botones superiores */}
                <div className="space-y-2.5 shrink-0">
                  <div className="flex items-center justify-between gap-3">
                    <div className="relative flex-1">
                      <Search className="absolute left-3.5 top-3 h-4 w-4 text-muted-foreground" />
                      <input
                        type="text"
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                        placeholder="Buscar software o URL (ej: WhatsApp, YouTube, Linkus, Odoo)..."
                        className="w-full pl-10 pr-4 py-2.5 text-xs rounded-xl bg-muted/40 border border-border focus:outline-none focus:ring-2 focus:ring-violet-500 text-foreground placeholder:text-muted-foreground"
                      />
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <button
                        onClick={() => {
                          setShowAddCustomModal(!showAddCustomModal);
                          if (!newCustomItemCat && categories.length > 0) {
                            setNewCustomItemCat(categories[0].id);
                            setNewCustomItemSub(categories[0].subcategories?.[0] || "");
                          }
                        }}
                        className="px-3.5 py-2.5 text-xs font-bold rounded-xl bg-violet-600 hover:bg-violet-700 text-white flex items-center gap-1.5 transition-colors shadow-sm cursor-pointer"
                      >
                        <Plus className="h-4 w-4" />
                        <span>Agregar Software / URL</span>
                      </button>
                      <button
                        onClick={handleResetToOfficialTree}
                        className="px-3 py-2.5 text-xs font-semibold rounded-xl hover:bg-amber-500/10 text-amber-400 border border-amber-500/30 flex items-center gap-1.5 transition-colors cursor-pointer"
                        title="Restablecer a las categorías oficiales del taller"
                      >
                        <RotateCcw className="h-3.5 w-3.5" />
                        <span>Restablecer Oficial</span>
                      </button>
                    </div>
                  </div>

                  {/* Filtros rápidos por Categoría y Toggle de Ruido */}
                  <div className="flex flex-wrap items-center justify-between gap-2 pt-2 border-t border-border/50">
                    <div className="flex items-center gap-1.5 overflow-x-auto pb-1 text-xs">
                      {/* Botón Sin Clasificar (Destacado en ámbar) */}
                      <button
                        type="button"
                        onClick={() => setAppsCategoryFilter(appsCategoryFilter === "unassigned" ? "all" : "unassigned")}
                        className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer whitespace-nowrap flex items-center gap-1.5 shadow-sm ${
                          appsCategoryFilter === "unassigned"
                            ? "bg-amber-500 text-black ring-2 ring-amber-400"
                            : totalUnassignedCount > 0
                            ? "bg-amber-500/20 text-amber-300 border border-amber-500/40 hover:bg-amber-500/30"
                            : "bg-muted/30 text-muted-foreground hover:bg-muted"
                        }`}
                      >
                        <span>⚠️ Sin Clasificar</span>
                        <span className="px-1.5 py-0.2 rounded-full bg-black/20 text-xs font-mono">
                          {totalUnassignedCount}
                        </span>
                      </button>

                      <button
                        type="button"
                        onClick={() => setAppsCategoryFilter("all")}
                        className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer whitespace-nowrap flex items-center gap-1.5 ${
                          appsCategoryFilter === "all"
                            ? "bg-violet-600 text-white shadow-sm"
                            : "bg-muted/40 hover:bg-muted text-muted-foreground hover:text-foreground"
                        }`}
                      >
                        <span>Todas</span>
                        <span className="text-[11px] font-mono opacity-80">({allSanitizedApps.length})</span>
                      </button>

                      {categories.map((c) => {
                        const countInCat = allSanitizedApps.filter((a) => {
                          const asg = getAppAssignment(a);
                          return asg.category === c.id || asg.category === c.label;
                        }).length;
                        return (
                          <button
                            key={c.id}
                            type="button"
                            onClick={() => setAppsCategoryFilter(appsCategoryFilter === c.id ? "all" : c.id)}
                            className={`px-2.5 py-1.5 rounded-xl text-xs font-medium transition-all cursor-pointer whitespace-nowrap flex items-center gap-1.5 ${
                              appsCategoryFilter === c.id
                                ? "bg-violet-600 text-white font-bold shadow-sm"
                                : "bg-muted/30 hover:bg-muted text-muted-foreground hover:text-foreground"
                            }`}
                          >
                            <span>{c.label}</span>
                            <span className="text-[11px] opacity-70 font-mono">({countInCat})</span>
                          </button>
                        );
                      })}
                    </div>

                    <label className="flex items-center gap-2 text-xs text-muted-foreground cursor-pointer select-none hover:text-foreground shrink-0">
                      <input
                        type="checkbox"
                        checked={hideSystemNoise}
                        onChange={(e) => setHideSystemNoise(e.target.checked)}
                        className="rounded border-border text-violet-600 focus:ring-violet-500 h-3.5 w-3.5"
                      />
                      <span>Ocultar ruido del sistema (Alt+Tab, Escritorio)</span>
                    </label>
                  </div>
                </div>

                {/* Formulario desplegable para agregar Software o URL manual */}
                {showAddCustomModal && (
                  <div className="p-4 rounded-2xl bg-muted/40 border border-violet-500/40 space-y-3 animate-in fade-in duration-150 shrink-0">
                    <div className="flex items-center justify-between">
                      <h4 className="text-xs font-bold text-violet-300 flex items-center gap-1.5">
                        <Plus className="h-4 w-4" />
                        <span>Registrar Nuevo Software, URL o Labor</span>
                      </h4>
                      <button
                        onClick={() => setShowAddCustomModal(false)}
                        className="text-muted-foreground hover:text-foreground p-0.5 cursor-pointer"
                      >
                        <X className="h-4 w-4" />
                      </button>
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                      <div>
                        <label className="text-xs font-semibold text-muted-foreground block mb-1">Nombre o URL:</label>
                        <input
                          type="text"
                          value={newCustomItemName}
                          onChange={(e) => setNewCustomItemName(e.target.value)}
                          placeholder="ej: github.com o Linkus"
                          className="w-full px-3 py-2 text-xs rounded-xl bg-background border border-border focus:ring-2 focus:ring-violet-500 text-foreground placeholder:text-muted-foreground"
                        />
                      </div>
                      <div>
                        <label className="text-xs font-semibold text-muted-foreground block mb-1">Categoría Principal:</label>
                        <select
                          value={newCustomItemCat}
                          onChange={(e) => {
                            setNewCustomItemCat(e.target.value);
                            const targetCat = categories.find((c) => c.id === e.target.value);
                            setNewCustomItemSub(targetCat?.subcategories?.[0] || "");
                          }}
                          className="w-full px-3 py-2 text-xs rounded-xl bg-background border border-border focus:ring-2 focus:ring-violet-500 text-foreground cursor-pointer"
                        >
                          {categories.map((c) => (
                            <option key={c.id} value={c.id}>{c.label}</option>
                          ))}
                        </select>
                      </div>
                      <div>
                        <label className="text-xs font-semibold text-muted-foreground block mb-1">Subcategoría:</label>
                        <select
                          value={newCustomItemSub}
                          onChange={(e) => setNewCustomItemSub(e.target.value)}
                          className="w-full px-3 py-2 text-xs rounded-xl bg-background border border-border focus:ring-2 focus:ring-violet-500 text-foreground cursor-pointer"
                        >
                          <option value="">-- General / Sin subcat. --</option>
                          {(categories.find((c) => c.id === newCustomItemCat)?.subcategories || []).map((s) => (
                            <option key={s} value={s}>{cleanSubcategoryName(s)}</option>
                          ))}
                        </select>
                      </div>
                    </div>
                    <div className="flex justify-end gap-2 pt-1">
                      <button
                        onClick={() => setShowAddCustomModal(false)}
                        className="px-3 py-1.5 text-xs rounded-lg text-muted-foreground hover:bg-muted cursor-pointer"
                      >
                        Cancelar
                      </button>
                      <button
                        disabled={!newCustomItemName.trim()}
                        onClick={() => {
                          if (!newCustomItemName.trim()) return;
                          handleSetCategory(newCustomItemName.trim(), newCustomItemCat, newCustomItemSub || null);
                          setNewCustomItemName("");
                          setShowAddCustomModal(false);
                        }}
                        className="px-4 py-1.5 text-xs font-bold rounded-lg bg-violet-600 hover:bg-violet-700 text-white disabled:opacity-50 cursor-pointer shadow-sm"
                      >
                        Guardar y Asignar
                      </button>
                    </div>
                  </div>
                )}

                {/* Lista limpia y completa de software mapeado en formato TABLA ALINEADA */}
                <div className="flex-1 flex flex-col min-h-0 space-y-2">
                  {/* Encabezado fijo de columnas para perfecta alineación */}
                  <div className="grid grid-cols-[1fr_210px_230px_96px] items-center gap-3 px-4 py-2 rounded-xl bg-muted/40 border border-border/50 text-[11px] font-bold uppercase tracking-wider text-muted-foreground shrink-0 select-none">
                    <div>Software / Aplicación / Navegación</div>
                    <div>Categoría Principal</div>
                    <div>Subcategoría Operativa</div>
                    <div className="text-center">Opc.</div>
                  </div>

                  {/* Cuerpo scrollable de la tabla */}
                  <div className="flex-1 overflow-y-auto space-y-1.5 pr-1 min-h-0">
                    {filteredModalApps.length === 0 ? (
                      <div className="p-12 text-center space-y-2 rounded-2xl border border-dashed border-border/60 bg-muted/10">
                        <p className="text-sm font-semibold text-foreground">
                          No se encontraron aplicaciones con este filtro
                        </p>
                        <p className="text-xs text-muted-foreground">
                          {appsCategoryFilter === "unassigned"
                            ? "¡Excelente! Todas las aplicaciones detectadas tienen categoría y subcategoría asignada."
                            : "Pruebe buscando con otro término o seleccionando 'Todas'."}
                        </p>
                        {appsCategoryFilter !== "all" && (
                          <button
                            onClick={() => setAppsCategoryFilter("all")}
                            className="mt-2 px-3.5 py-1.5 text-xs font-semibold rounded-xl bg-violet-600 text-white hover:bg-violet-700 cursor-pointer"
                          >
                            Ver todas las aplicaciones
                          </button>
                        )}
                      </div>
                    ) : (
                      filteredModalApps.map((appName) => {
                        const assignment = getAppAssignment(appName);
                        const currentCat = assignment.category;
                        const currentSub = assignment.subcategory;
                        const isManual = assignment.isManual;
                        const icon = getAppIcon(appName);

                        const matchedCat = categories.find((c) => c.id === currentCat || c.label === currentCat);
                        const availableSubcats = matchedCat?.subcategories || [];
                        const isUnassigned = !matchedCat || !currentSub || currentCat === "Sin Clasificar";

                        const trace = appTraceMap.get(appName.toLowerCase());
                        const displayProcess = trace?.process 
                          ? (trace.process.toLowerCase().includes("brave") ? "Brave" 
                             : trace.process.toLowerCase().includes("chrome") ? "Chrome"
                             : trace.process.toLowerCase().includes("edge") ? "Edge"
                             : trace.process)
                          : null;
                        const displayAgent = trace?.agents && trace.agents.size > 0 ? Array.from(trace.agents)[0] : null;
                        const lastTimeFormatted = trace?.lastSeen 
                          ? new Date(trace.lastSeen).toLocaleTimeString("es-CR", { hour: "2-digit", minute: "2-digit", hour12: true }) 
                          : null;

                        // Rastro de auditoría: títulos de ventana reales capturados, URLs y contextos
                        const fullTitles = trace?.fullTitles ? Array.from(trace.fullTitles) : [];
                        const contexts = trace?.contexts ? Array.from(trace.contexts) : [];
                        const urls = trace?.urls ? Array.from(trace.urls) : [];
                        const rawDetail = fullTitles[0] || contexts[0] || urls[0] || null;
                        const cleanDetail = rawDetail ? fixMojibake(rawDetail) : null;
                        const isWeb = Boolean(
                          (displayProcess && ["brave", "chrome", "edge", "firefox", "opera"].includes(displayProcess.toLowerCase())) ||
                          urls.length > 0 ||
                          (rawDetail && (rawDetail.toLowerCase().includes("http") || rawDetail.toLowerCase().includes(".com") || rawDetail.toLowerCase().includes(".cr") || rawDetail.toLowerCase().includes(".net")))
                        );

                        return (
                          <div
                            key={appName}
                            className={`grid grid-cols-[1fr_210px_230px_96px] items-center gap-3 p-3 px-4 rounded-xl border transition-all ${
                              isUnassigned
                                ? "bg-amber-500/[0.04] border-amber-500/40 hover:border-amber-500/60 shadow-xs"
                                : "bg-card hover:bg-muted/20 border-border/60"
                            }`}
                          >
                            {/* Columna 1: Información detallada del software / navegación */}
                            <div className="flex items-start gap-3 min-w-0 pr-2">
                              <div className={`p-2 rounded-xl shrink-0 mt-0.5 ${isUnassigned ? "bg-amber-500/15 text-amber-400" : "bg-muted text-muted-foreground"}`}>
                                {icon}
                              </div>
                              <div className="min-w-0 flex-1">
                                <div className="flex items-center gap-2 flex-wrap">
                                  <p className="font-bold text-xs text-foreground" title={appName}>
                                    {fixMojibake(appName)}
                                  </p>
                                  {isUnassigned && (
                                    <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-amber-500/20 text-amber-300 border border-amber-500/40 shrink-0 whitespace-nowrap">
                                      ⚠️ Pendiente
                                    </span>
                                  )}
                                  <button
                                    type="button"
                                    onClick={() => setSelectedInspectApp(appName)}
                                    className="p-1 rounded-md hover:bg-muted text-muted-foreground hover:text-violet-400 transition-colors cursor-pointer shrink-0"
                                    title="Ver todas las capturas, URL, colaboradores y auditoría técnica"
                                  >
                                    <Info className="h-3.5 w-3.5" />
                                  </button>
                                </div>

                                {/* RASTRO DE VENTANA / PESTAÑA REAL CAPTURADA */}
                                {cleanDetail && cleanDetail !== appName && (
                                  <div className="mt-1 flex items-start gap-1.5 text-[11px] text-cyan-300 bg-cyan-950/40 border border-cyan-800/50 rounded-md px-2 py-1 max-w-full">
                                    <Globe className="h-3.5 w-3.5 mt-0.5 shrink-0 text-cyan-400" />
                                    <div className="min-w-0 flex-1 break-words">
                                      <span className="font-semibold text-cyan-400">{isWeb ? "Pestaña / URL capturada: " : "Ventana real: "}</span>
                                      <span className="font-mono text-cyan-100 select-all font-medium">{cleanDetail}</span>
                                    </div>
                                  </div>
                                )}

                                <div className="flex items-center gap-1.5 flex-wrap mt-1 text-[11px] text-muted-foreground">
                                  <span className="truncate">
                                    {matchedCat && currentCat !== "Sin Clasificar" ? matchedCat.label : <span className="text-amber-400 font-semibold">⚠️ Sin Categoría</span>}
                                    {currentSub ? ` ➔ ${cleanSubcategoryName(currentSub)}` : <span className="text-amber-400/80"> (Falta subcategoría)</span>}
                                  </span>
                                  {(displayProcess || displayAgent) && (
                                    <span className="inline-flex items-center gap-1 text-[10px] text-muted-foreground/80 bg-muted/60 px-1.5 py-0.5 rounded-md border border-border/40 whitespace-nowrap">
                                      {displayProcess && <span className="font-medium text-foreground/80">{displayProcess}</span>}
                                      {displayProcess && displayAgent && <span>•</span>}
                                      {displayAgent && <span>{displayAgent}</span>}
                                      {lastTimeFormatted && <span className="opacity-70 font-mono text-[9.5px]">({lastTimeFormatted})</span>}
                                    </span>
                                  )}
                                </div>
                              </div>
                            </div>

                            {/* Columna 2: Selector de Categoría Principal */}
                            <div className="w-full">
                              <select
                                value={(!currentCat || currentCat === "Sin Clasificar") ? "" : currentCat}
                                onChange={(e) => handleSetCategory(appName, e.target.value, null)}
                                className={`text-xs font-semibold px-2.5 py-1.5 rounded-lg border cursor-pointer w-full transition-colors truncate ${
                                  !currentCat || currentCat === "Sin Clasificar"
                                    ? "bg-amber-500/15 border-amber-500/50 text-amber-300 font-bold"
                                    : "bg-background hover:border-violet-500/60 border-border text-foreground"
                                }}`}
                                title="Categoría Principal"
                              >
                                <option value="" disabled>-- ⚠️ Seleccionar Categoría --</option>
                                {categories.map((cat) => (
                                  <option key={cat.id} value={cat.id}>
                                    {cat.label}
                                  </option>
                                ))}
                              </select>
                            </div>

                            {/* Columna 3: Selector de Subcategoría Dependiente */}
                            <div className="w-full">
                              <select
                                value={cleanSubcategoryName(currentSub) || ""}
                                onChange={(e) => handleSetCategory(appName, currentCat, e.target.value ? cleanSubcategoryName(e.target.value) : null)}
                                className={`text-xs font-semibold px-2.5 py-1.5 rounded-lg border cursor-pointer w-full transition-colors truncate ${
                                  !currentSub
                                    ? "bg-amber-500/15 border-amber-500/50 text-amber-300 font-bold"
                                    : "bg-background hover:border-violet-500/60 border-border text-foreground"
                                }}`}
                                title="Subcategoría"
                              >
                                <option value="">-- {availableSubcats.length > 0 ? "⚠️ Seleccione Subcategoría" : "General"} --</option>
                                {availableSubcats.map((sub) => {
                                  const clean = cleanSubcategoryName(sub);
                                  return (
                                    <option key={clean} value={clean}>
                                      {clean}
                                    </option>
                                  );
                                })}
                              </select>
                            </div>

                            {/* Columna 4: Acciones rápidas */}
                            <div className="flex items-center justify-center gap-1">
                              {isWeb && isUnassigned && (
                                <button
                                  type="button"
                                  onClick={() => handleSetCategory(appName, "Utilidades", "Navegación General")}
                                  title="Mapear a Navegación Web (Utilidades ➔ Navegación General)"
                                  className="p-1.5 rounded-lg bg-sky-500/15 hover:bg-sky-500/25 text-sky-300 border border-sky-500/40 transition-colors cursor-pointer"
                                >
                                  <Globe className="h-3.5 w-3.5" />
                                </button>
                              )}
                              {isManual && (
                                <button
                                  type="button"
                                  onClick={() => handleDeleteApp(appName)}
                                  title="Restablecer a detección automática"
                                  className="p-1.5 rounded-lg hover:bg-muted text-muted-foreground hover:text-amber-400 border border-border/50 transition-colors cursor-pointer"
                                >
                                  <RotateCcw className="h-3.5 w-3.5" />
                                </button>
                              )}
                              <button
                                type="button"
                                onClick={() => handleIgnoreApp(appName)}
                                title={`Descartar / Ocultar "${appName}" del listado (No es software de taller)`}
                                className="p-1.5 rounded-lg hover:bg-slate-500/15 text-muted-foreground hover:text-slate-300 border border-border/50 transition-colors cursor-pointer"
                              >
                                <EyeOff className="h-3.5 w-3.5" />
                              </button>
                              <button
                                type="button"
                                onClick={() => handleDeleteApp(appName)}
                                title={`Eliminar "${appName}"`}
                                className="p-1.5 rounded-lg hover:bg-rose-500/15 text-muted-foreground hover:text-rose-400 border border-border/50 transition-colors cursor-pointer"
                              >
                                <Trash2 className="h-3.5 w-3.5" />
                              </button>
                            </div>
                          </div>
                        );
                      })
                    )}
                  </div>
                </div>
              </div>
            )}

            {/* CONTENIDO PESTAÑA 2: ESTRUCTURA DE CATEGORÍAS Y SUBCATEGORÍAS */}
            {activeModalTab === "categories" && (
              <div className="flex-1 flex flex-col min-h-0 space-y-3">
                {/* Header de la sección de categorías */}
                <div className="flex flex-wrap items-center justify-between gap-3 bg-muted/20 border border-border/50 p-3 px-4 rounded-2xl shrink-0">
                  <div>
                    <h4 className="font-bold text-sm text-foreground flex items-center gap-2">
                      <FolderTree className="h-4 w-4 text-violet-400" />
                      <span>Estructura Oficial del Taller ({categories.length} Categorías)</span>
                    </h4>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      Organice las categorías operativas y sus respectivas subcategorías y labores.
                    </p>
                  </div>
                  <button
                    onClick={() => {
                      setIsCreatingNew(true);
                      setEditingCategory(null);
                      setFormCatName("");
                      setFormCatColorIdx(0);
                      setFormCatIcon("Monitor");
                      setFormCatSubcategories([]);
                      setNewSubcatInput("");
                    }}
                    className="px-3.5 py-2 text-xs font-bold rounded-xl bg-violet-600 hover:bg-violet-700 text-white flex items-center gap-1.5 transition-colors shadow-sm cursor-pointer"
                  >
                    <Plus className="h-4 w-4" />
                    <span>Nueva Categoría</span>
                  </button>
                </div>

                {/* Formulario de Creación / Edición */}
                {(isCreatingNew || editingCategory) && (
                  <div className="p-4 rounded-2xl bg-muted/30 border border-violet-500/40 space-y-3 animate-in fade-in duration-150 shrink-0">
                    <div className="flex items-center justify-between">
                      <h4 className="text-xs font-bold text-violet-300">
                        {editingCategory ? `Editar Categoría: ${editingCategory.label}` : "Crear Nueva Categoría"}
                      </h4>
                      <button
                        onClick={() => { setIsCreatingNew(false); setEditingCategory(null); }}
                        className="text-xs text-muted-foreground hover:text-foreground cursor-pointer"
                      >
                        Cancelar
                      </button>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                      <div>
                        <label className="text-xs font-semibold text-muted-foreground block mb-1">
                          Nombre de la Categoría:
                        </label>
                        <input
                          type="text"
                          value={formCatName}
                          onChange={(e) => setFormCatName(e.target.value)}
                          placeholder="Ej: Logística, Calidad, etc."
                          className="w-full px-3 py-1.5 text-xs rounded-xl bg-background border border-border focus:ring-2 focus:ring-violet-500 text-foreground"
                        />
                      </div>

                      {/* Color */}
                      <div>
                        <label className="text-xs font-semibold text-muted-foreground block mb-1">Color Distintivo:</label>
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
                      <div>
                        <label className="text-xs font-semibold text-muted-foreground block mb-1">Ícono:</label>
                        <div className="flex flex-wrap gap-1 max-h-16 overflow-y-auto">
                          {ICON_PRESETS.map((ico) => (
                            <button
                              key={ico}
                              type="button"
                              onClick={() => setFormCatIcon(ico)}
                              className={`p-1 rounded-lg border transition-all ${
                                formCatIcon === ico
                                  ? "border-violet-500 bg-violet-500/20 text-violet-300"
                                  : "border-border/60 bg-background text-muted-foreground hover:text-foreground"
                              }`}
                            >
                              {renderCategoryIcon(ico, "h-3.5 w-3.5")}
                            </button>
                          ))}
                        </div>
                      </div>
                    </div>

                    <div className="pt-2 flex justify-end gap-2 border-t border-border/40">
                      <button
                        onClick={() => { setIsCreatingNew(false); setEditingCategory(null); }}
                        className="px-3 py-1.5 text-xs font-semibold rounded-lg bg-muted text-muted-foreground hover:text-foreground cursor-pointer"
                      >
                        Cancelar
                      </button>
                      <button
                        onClick={handleSaveCategoryForm}
                        disabled={!formCatName.trim()}
                        className="px-4 py-1.5 text-xs font-bold rounded-xl bg-violet-600 hover:bg-violet-700 text-white disabled:opacity-50 cursor-pointer shadow-sm"
                      >
                        {editingCategory ? "Guardar Cambios" : "Crear Categoría"}
                      </button>
                    </div>
                  </div>
                )}

                {/* Lista limpia de Categorías en formato de jerarquía organizada */}
                <div className="flex-1 overflow-y-auto space-y-3 pr-1 min-h-0">
                  {categories.map((cat) => {
                    const subcats = cat.subcategories || [];
                    const appsInCat = allSanitizedApps.filter((a) => {
                      const asg = getAppAssignment(a);
                      const asgCat = (asg.category || "").toLowerCase().trim();
                      return asgCat === cat.id.toLowerCase().trim() || asgCat === (cat.label || "").toLowerCase().trim();
                    });

                    return (
                      <div
                        key={cat.id}
                        className="rounded-2xl border border-border/60 bg-card overflow-hidden shadow-xs hover:border-border transition-all"
                      >
                        {/* Cabecera de la Categoría */}
                        <div className="p-3.5 px-4 bg-muted/20 border-b border-border/40 flex items-center justify-between gap-3">
                          <div className="flex items-center gap-3 min-w-0">
                            <div className={`p-2 rounded-xl border ${cat.color} shrink-0`}>
                              {renderCategoryIcon(cat.iconName, "h-4 w-4")}
                            </div>
                            <div className="min-w-0">
                              <div className="flex items-center gap-2 flex-wrap">
                                <span className="font-bold text-sm text-foreground">{cat.label}</span>
                                <span className="text-xs px-2 py-0.5 rounded-full bg-muted border border-border/50 text-muted-foreground font-mono">
                                  {subcats.length} {subcats.length === 1 ? "subcategoría" : "subcategorías"}
                                </span>
                                <span className="text-xs px-2 py-0.5 rounded-full bg-violet-500/10 text-violet-300 font-mono">
                                  {appsInCat.length} {appsInCat.length === 1 ? "proceso vinculado" : "procesos vinculados"}
                                </span>
                              </div>
                            </div>
                          </div>

                          <div className="flex items-center gap-2 shrink-0">
                            <button
                              onClick={() => {
                                setInlineAddSubcatCatId(inlineAddSubcatCatId === cat.id ? null : cat.id);
                                setInlineSubcatValue("");
                                setInlineSubcatIsManual(false);
                              }}
                              className="px-2.5 py-1 text-xs font-semibold rounded-lg bg-violet-600/15 hover:bg-violet-600/25 text-violet-300 border border-violet-500/30 flex items-center gap-1 transition-colors cursor-pointer"
                            >
                              <Plus className="h-3.5 w-3.5" />
                              <span>Subcategoría</span>
                            </button>
                            <button
                              onClick={() => {
                                setEditingCategory(cat);
                                setIsCreatingNew(false);
                                setFormCatName(cat.label);
                                const foundIdx = COLOR_PRESETS.findIndex((p) => p.bgBar === cat.bgBar);
                                setFormCatColorIdx(foundIdx >= 0 ? foundIdx : 0);
                                setFormCatIcon(cat.iconName || "Monitor");
                                setFormCatSubcategories(cat.subcategories ? [...cat.subcategories] : []);
                                setNewSubcatInput("");
                              }}
                              className="p-1.5 rounded-lg hover:bg-muted text-muted-foreground hover:text-foreground transition-colors cursor-pointer"
                              title="Editar categoría"
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

                        {/* Formulario Inline para agregar subcategoría dentro de esta categoría */}
                        {inlineAddSubcatCatId === cat.id && (
                          <div className="p-3 bg-muted/30 border-b border-border/40 flex flex-wrap items-center gap-2 animate-in fade-in">
                            <input
                              type="text"
                              autoFocus
                              value={inlineSubcatValue}
                              onChange={(e) => setInlineSubcatValue(e.target.value)}
                              onKeyDown={(e) => {
                                if (e.key === "Enter" && inlineSubcatValue.trim()) {
                                  handleAddSubcategory(cat.id, inlineSubcatValue.trim(), inlineSubcatIsManual);
                                  setInlineSubcatValue("");
                                  setInlineAddSubcatCatId(null);
                                } else if (e.key === "Escape") {
                                  setInlineAddSubcatCatId(null);
                                }
                              }}
                              placeholder="Nombre de la nueva subcategoría..."
                              className="flex-1 min-w-[220px] text-xs px-3 py-1.5 rounded-lg bg-background border border-violet-500 focus:outline-none text-foreground"
                            />

                            <button
                              onClick={() => {
                                if (inlineSubcatValue.trim()) {
                                  handleAddSubcategory(cat.id, inlineSubcatValue.trim(), inlineSubcatIsManual);
                                  setInlineSubcatValue("");
                                  setInlineAddSubcatCatId(null);
                                }
                              }}
                              className="px-3 py-1.5 rounded-lg bg-violet-600 hover:bg-violet-700 text-white text-xs font-bold cursor-pointer"
                            >
                              Guardar
                            </button>
                            <button
                              onClick={() => setInlineAddSubcatCatId(null)}
                              className="px-2 py-1.5 text-xs text-muted-foreground hover:text-foreground cursor-pointer"
                            >
                              Cancelar
                            </button>
                          </div>
                        )}

                        {/* Lista estructurada y limpia de subcategorías */}
                        <div className="divide-y divide-border/30 bg-background/40">
                          {subcats.length === 0 ? (
                            <div className="p-4 text-center text-xs text-muted-foreground">
                              Esta categoría aún no tiene subcategorías. Toque &ldquo;+ Subcategoría&rdquo; para agregar la primera.
                            </div>
                          ) : (
                            subcats.map((sub) => {
                              const cleanName = cleanSubcategoryName(sub);
                              const isManual = isSubcategoryManual(cat, cleanName);

                              const appsInSub = appsInCat.filter((a) => {
                                const asg = getAppAssignment(a);
                                const subVal = cleanSubcategoryName(asg.subcategory || "").toLowerCase().trim();
                                return subVal === cleanName.toLowerCase().trim();
                              });

                              const subcatKey = `${cat.id}::${cleanName}`;
                              const isAppsExpanded = expandedSubcatApps === subcatKey;

                              return (
                                <div key={cleanName} className="flex flex-col">
                                  <div className="flex items-center justify-between p-2.5 px-4 hover:bg-muted/20 transition-colors text-xs">
                                    {/* Columna izquierda: Nombre y botón interactivo de conteo */}
                                    <div className="flex items-center gap-3 min-w-0 flex-1">
                                      <span className="font-semibold text-foreground text-xs">{cleanName}</span>
                                      <button
                                        type="button"
                                        onClick={() => setExpandedSubcatApps(isAppsExpanded ? null : subcatKey)}
                                        className={`text-[11px] font-mono px-2 py-0.5 rounded-md border transition-all flex items-center gap-1.5 cursor-pointer select-none ${
                                          isAppsExpanded
                                            ? "bg-violet-500/20 text-violet-300 border-violet-500/40 font-bold shadow-xs"
                                            : "text-muted-foreground bg-muted/60 border-border/30 hover:bg-muted hover:text-foreground"
                                        }`}
                                        title={isAppsExpanded ? "Clic para ocultar procesos" : "Clic para ver procesos vinculados"}
                                      >
                                        <span>{appsInSub.length} {appsInSub.length === 1 ? "proceso vinculado" : "procesos vinculados"}</span>
                                        <ChevronDown className={`h-3 w-3 transition-transform duration-200 ${isAppsExpanded ? "rotate-180 text-violet-400" : "opacity-60"}`} />
                                      </button>
                                    </div>

                                    {/* Columna derecha: Acciones */}
                                    <div className="flex items-center gap-2 shrink-0">
                                      <button
                                        type="button"
                                        onClick={() => {
                                          if (confirm(`¿Eliminar la subcategoría "${cleanName}"?`)) {
                                            handleDeleteSubcategory(cat.id, cleanName);
                                          }
                                        }}
                                        className="p-1 rounded-lg hover:bg-muted text-muted-foreground hover:text-rose-400 transition-colors cursor-pointer"
                                        title="Eliminar subcategoría"
                                      >
                                        <Trash2 className="h-3.5 w-3.5" />
                                      </button>
                                    </div>
                                  </div>

                                  {/* Desplegable animado con los procesos vinculados */}
                                  {isAppsExpanded && (
                                    <div className="p-3 bg-muted/15 border-t border-border/25 pl-6 pr-4 space-y-2.5 animate-in fade-in slide-in-from-top-1 duration-150">
                                      <div className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider flex items-center justify-between">
                                        <span>Procesos vinculados a &ldquo;{cleanName}&rdquo;:</span>
                                        <span className="text-[10px] text-muted-foreground font-mono">Total: {appsInSub.length}</span>
                                      </div>
                                      {appsInSub.length === 0 ? (
                                        <p className="text-xs text-muted-foreground/70 italic py-1">
                                          No hay procesos vinculados a esta subcategoría todavía.
                                        </p>
                                      ) : (
                                        <div className="flex flex-wrap items-center gap-1.5">
                                          {appsInSub.map((app) => {
                                            const isProcManual = checkIsProcessManual(app, cat.id, cleanName);
                                            return (
                                              <div
                                                key={app}
                                                className={`inline-flex items-center gap-1.5 py-1 px-2.5 rounded-lg border text-xs transition-all shadow-xs ${
                                                  isProcManual
                                                    ? "bg-amber-500/[0.08] border-amber-500/40 text-foreground"
                                                    : "bg-card border-border/60 text-foreground/90 hover:border-border"
                                                }`}
                                              >
                                                <div className="shrink-0 text-muted-foreground">
                                                  {getAppIcon(app)}
                                                </div>
                                                <span className="font-medium text-xs whitespace-nowrap" title={app}>
                                                  {app}
                                                </span>
                                                <label
                                                  className="flex items-center cursor-pointer select-none ml-0.5 pl-1.5 border-l border-border/40"
                                                  title={isProcManual ? "Labor Manual (activo)" : "Marcar como Labor Manual"}
                                                >
                                                  <input
                                                    type="checkbox"
                                                    checked={isProcManual}
                                                    onChange={() => handleToggleProcessManual(app, isProcManual)}
                                                    className="rounded border-border accent-amber-500 h-3 w-3 cursor-pointer"
                                                  />
                                                </label>
                                                <button
                                                  type="button"
                                                  onClick={() => handleUnlinkProcess(app)}
                                                  className="p-0.5 rounded text-muted-foreground/50 hover:text-rose-400 hover:bg-rose-500/10 transition-colors cursor-pointer"
                                                  title={`Desvincular "${app}" de ${cleanName}`}
                                                >
                                                  <X className="h-3 w-3" />
                                                </button>
                                              </div>
                                            );
                                          })}
                                        </div>
                                      )}

                                      {/* Formulario / botón para vincular nuevo proceso */}
                                      <div className="pt-1">
                                        {addingProcessForSubcat === subcatKey ? (
                                          <div className="flex items-center gap-2 max-w-lg animate-in fade-in">
                                            <input
                                              type="text"
                                              autoFocus
                                              value={newProcessInput}
                                              onChange={(e) => setNewProcessInput(e.target.value)}
                                              onKeyDown={(e) => {
                                                if (e.key === "Enter" && newProcessInput.trim()) {
                                                  handleAddProcessToSubcat(newProcessInput.trim(), cat.id, cleanName);
                                                } else if (e.key === "Escape") {
                                                  setAddingProcessForSubcat(null);
                                                  setNewProcessInput("");
                                                }
                                              }}
                                              placeholder="Nombre del proceso o tarea a vincular..."
                                              className="flex-1 text-xs px-3 py-1.5 rounded-lg bg-background border border-violet-500 focus:outline-none text-foreground"
                                            />
                                            <button
                                              type="button"
                                              onClick={() => {
                                                if (newProcessInput.trim()) {
                                                  handleAddProcessToSubcat(newProcessInput.trim(), cat.id, cleanName);
                                                }
                                              }}
                                              className="px-3 py-1.5 text-xs font-bold rounded-lg bg-violet-600 hover:bg-violet-700 text-white cursor-pointer"
                                            >
                                              Vincular
                                            </button>
                                            <button
                                              type="button"
                                              onClick={() => {
                                                setAddingProcessForSubcat(null);
                                                setNewProcessInput("");
                                              }}
                                              className="px-2 py-1.5 text-xs text-muted-foreground hover:text-foreground cursor-pointer"
                                            >
                                              Cancelar
                                            </button>
                                          </div>
                                        ) : (
                                          <button
                                            type="button"
                                            onClick={() => {
                                              setAddingProcessForSubcat(subcatKey);
                                              setNewProcessInput("");
                                            }}
                                            className="text-xs font-semibold px-2.5 py-1 rounded-lg border border-dashed border-border/80 hover:border-violet-500/60 text-muted-foreground hover:text-violet-300 hover:bg-violet-500/10 flex items-center gap-1.5 transition-colors cursor-pointer"
                                          >
                                            <Plus className="h-3 w-3" />
                                            <span>+ Vincular proceso o tarea</span>
                                          </button>
                                        )}
                                      </div>
                                    </div>
                                  )}
                                </div>
                              );
                            })
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Footer */}
            <div className="border-t border-border/50 pt-3 flex items-center justify-between text-xs">
              {activeModalTab === "apps" ? (
                <span className="text-muted-foreground">
                  {Object.keys(customCategories).length} aplicación(es) o URL(s) con categoría personalizada
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

            {/* MODAL DE REASIGNACIÓN RÁPIDA DE ITEM (SOFTWARE O URL) */}
            {itemToManage && (
              <div
                className="fixed inset-0 z-[70] bg-black/80 backdrop-blur-md flex items-center justify-center p-4 animate-in fade-in duration-150"
                onClick={() => setItemToManage(null)}
              >
                <div
                  className="w-full max-w-md bg-[#0f1424] border border-border/80 rounded-2xl shadow-2xl p-5 space-y-4"
                  onClick={(e) => e.stopPropagation()}
                >
                  <div className="flex items-start justify-between gap-2 border-b border-border/50 pb-3">
                    <div className="flex items-center gap-2.5 min-w-0">
                      <div className="p-2 rounded-xl bg-violet-500/15 text-violet-400 shrink-0">
                        {getAppIcon(itemToManage.appName)}
                      </div>
                      <div className="min-w-0">
                        <h4 className="font-bold text-sm text-foreground truncate">
                          {itemToManage.appName}
                        </h4>
                        <p className="text-[11px] text-muted-foreground">
                          Reasignar categoría o subcategoría operativa
                        </p>
                      </div>
                    </div>
                    <button
                      onClick={() => setItemToManage(null)}
                      className="p-1 rounded-lg hover:bg-muted text-muted-foreground hover:text-foreground cursor-pointer"
                    >
                      <X className="h-4 w-4" />
                    </button>
                  </div>

                  <div className="space-y-3.5 text-xs">
                    <div>
                      <label className="block text-[11px] font-bold text-muted-foreground mb-1.5">
                        Categoría Oficial:
                      </label>
                      <select
                        value={manageTargetCat}
                        onChange={(e) => {
                          const nextCat = e.target.value;
                          setManageTargetCat(nextCat);
                          const found = categories.find((c) => c.id === nextCat);
                          setManageTargetSub(found?.subcategories?.[0] || "");
                        }}
                        className="w-full px-3 py-2 rounded-xl bg-background border border-border/70 text-foreground text-xs focus:outline-none focus:border-violet-500 cursor-pointer"
                      >
                        {categories.map((c) => (
                          <option key={c.id} value={c.id}>
                            {c.label}
                          </option>
                        ))}
                      </select>
                    </div>

                    <div>
                      <label className="block text-[11px] font-bold text-muted-foreground mb-1.5">
                        Subcategoría Oficial:
                      </label>
                      {(() => {
                        const selectedCat = categories.find((c) => c.id === manageTargetCat);
                        const subs = selectedCat?.subcategories || [];
                        if (subs.length === 0) {
                          return (
                            <p className="text-muted-foreground text-[11px] italic py-1">
                              Esta categoría no tiene subcategorías definidas.
                            </p>
                          );
                        }
                        return (
                          <select
                            value={manageTargetSub}
                            onChange={(e) => setManageTargetSub(e.target.value)}
                            className="w-full px-3 py-2 rounded-xl bg-background border border-border/70 text-foreground text-xs focus:outline-none focus:border-violet-500 cursor-pointer"
                          >
                            {subs.map((s) => (
                              <option key={s} value={s}>
                                {s}
                              </option>
                            ))}
                          </select>
                        );
                      })()}
                    </div>
                  </div>

                  <div className="flex items-center justify-between pt-3 border-t border-border/50">
                    <button
                      type="button"
                      onClick={() => {
                        handleSetCategory(itemToManage.appName, null, null);
                        setItemToManage(null);
                      }}
                      className="px-3 py-1.5 text-xs font-semibold text-rose-400 hover:bg-rose-500/10 rounded-xl transition-colors cursor-pointer"
                    >
                      Desvincular
                    </button>

                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => setItemToManage(null)}
                        className="px-3 py-1.5 text-xs rounded-xl hover:bg-muted text-muted-foreground cursor-pointer"
                      >
                        Cancelar
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          if (manageTargetCat) {
                            handleSetCategory(
                              itemToManage.appName,
                              manageTargetCat,
                              manageTargetSub || null
                            );
                          }
                          setItemToManage(null);
                        }}
                        className="px-4 py-1.5 text-xs font-bold rounded-xl bg-violet-600 hover:bg-violet-700 text-white shadow-sm transition-colors cursor-pointer"
                      >
                        Guardar Cambios
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* Modal de Detalle y Rastro de Actividad */}
            {selectedInspectApp && (() => {
              const trace = appTraceMap.get(selectedInspectApp.toLowerCase());
              const titles = trace?.fullTitles ? Array.from(trace.fullTitles) : [];
              const agents = trace?.agents ? Array.from(trace.agents) : [];
              const asg = getAppAssignment(selectedInspectApp);

              return (
                <div className="fixed inset-0 z-[9999999] bg-black/80 backdrop-blur-xs flex items-center justify-center p-4 animate-in fade-in duration-150">
                  <div className="bg-card border border-border shadow-2xl rounded-2xl w-full max-w-lg p-5 space-y-4">
                    <div className="flex items-start justify-between gap-3 border-b border-border/60 pb-3">
                      <div className="flex items-center gap-3">
                        <div className="p-2.5 rounded-xl bg-violet-500/15 text-violet-400">
                          {getAppIcon(selectedInspectApp)}
                        </div>
                        <div>
                          <h4 className="font-bold text-sm text-foreground">
                            {selectedInspectApp}
                          </h4>
                          <p className="text-[11px] text-muted-foreground">
                            Rastro de auditoría y detalles técnicos de captura
                          </p>
                        </div>
                      </div>
                      <button
                        onClick={() => setSelectedInspectApp(null)}
                        className="p-1 rounded-lg hover:bg-muted text-muted-foreground hover:text-foreground cursor-pointer"
                      >
                        <X className="h-4 w-4" />
                      </button>
                    </div>

                    <div className="space-y-3 text-xs">
                      {/* Software / Proceso */}
                      <div className="p-2.5 rounded-xl bg-muted/30 border border-border/50 flex items-center justify-between">
                        <span className="text-muted-foreground font-semibold">Proceso / Software:</span>
                        <span className="font-bold text-foreground">
                          {trace?.process ? (trace.process.toLowerCase().includes("brave") ? "Navegador Brave (brave.exe)" : trace.process) : "Detección de Sistema"}
                        </span>
                      </div>

                      {/* Colaborador(es) */}
                      <div className="p-2.5 rounded-xl bg-muted/30 border border-border/50 flex items-center justify-between">
                        <span className="text-muted-foreground font-semibold">Colaborador(es):</span>
                        <span className="font-bold text-violet-400">
                          {agents.length > 0 ? agents.join(", ") : "Usuario del sistema"}
                        </span>
                      </div>

                      {/* Títulos originales capturados */}
                      <div className="space-y-1">
                        <span className="text-[11px] font-bold text-muted-foreground">
                          Títulos de Ventana Originales Capturados ({titles.length}):
                        </span>
                        <div className="max-h-36 overflow-y-auto p-2 rounded-xl bg-background border border-border/70 space-y-1">
                          {titles.length === 0 ? (
                            <p className="text-[11px] text-muted-foreground italic">No hay títulos específicos registrados</p>
                          ) : (
                            titles.map((t, idx) => (
                              <p key={idx} className="text-[11px] font-mono text-foreground/90 py-1 border-b border-border/20 last:border-none break-all">
                                {t}
                              </p>
                            ))
                          )}
                        </div>
                      </div>

                      {/* Estado y categoría actual */}
                      <div className="p-2.5 rounded-xl bg-amber-500/[0.08] border border-amber-500/30 flex items-center justify-between">
                        <div>
                          <p className="font-bold text-foreground text-[11px]">Asignación Actual:</p>
                          <p className="text-[10.5px] text-muted-foreground">
                            {asg.category || "Sin categoría"} {asg.subcategory ? `➔ ${asg.subcategory}` : "(Falta subcategoría)"}
                          </p>
                        </div>
                        {trace?.lastSeen && (
                          <span className="text-[10px] text-muted-foreground font-mono">
                            Última: {new Date(trace.lastSeen).toLocaleTimeString("es-CR", { hour: "2-digit", minute: "2-digit", hour12: true })}
                          </span>
                        )}
                      </div>
                    </div>

                    <div className="flex justify-end pt-2">
                      <button
                        onClick={() => setSelectedInspectApp(null)}
                        className="px-4 py-1.5 text-xs font-bold rounded-xl bg-violet-600 hover:bg-violet-700 text-white cursor-pointer"
                      >
                        Cerrar detalle
                      </button>
                    </div>
                  </div>
                </div>
              );
            })()}
          </div>
        </div>
      )}
    </div>
  );
}

export const ActivityAppsRanking = React.memo(ActivityAppsRankingComponent);
