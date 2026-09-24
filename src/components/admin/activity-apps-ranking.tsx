"use client";

import React, { useState, useEffect, useMemo } from "react";
import { computeUnifiedActivityMetrics } from "@/lib/activity-engine";
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
  workDays?: number[];
}

export interface CategoryItem {
  id: string;
  label: string;
  color: string;
  bgBar: string;
  iconName: string;
  subcategories: string[];
  is_manual?: boolean;
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

  // 7. Descansos (Almuerzo, Café, Descanso programado, Inactividad)
  if (
    name.includes("descanso") ||
    name.includes("pausa") ||
    name.includes("almuerzo") ||
    name.includes("inactividad") ||
    name.includes("receso") ||
    act.includes("descanso") ||
    act.includes("pausa") ||
    act.includes("almuerzo") ||
    act.includes("inactividad") ||
    act.includes("receso") ||
    cat.includes("descanso") ||
    cat.includes("pausa") ||
    cat.includes("inactividad") ||
    cat.includes("almuerzo")
  ) {
    return "Descansos";
  }

  // 7. Soporte (WhatsApp, Seka Chat, Linkus llamadas, Odoo Tickets, Casos, Atención directa)
  return "Soporte";
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

function ActivityAppsRankingComponent({
  timeline,
  scheduleStart = "08:00",
  scheduleEnd = "17:00",
  scheduleEnabled = true,
  workDays = [1, 2, 3, 4, 5],
}: Props) {
  const [viewMode, setViewMode] = useState<"categories" | "apps">("categories");
  const [categories, setCategories] = useState<CategoryItem[]>(DEFAULT_CATEGORIES);
  const [customCategories, setCustomCategories] = useState<Record<string, any>>({});
  const [activeDropdownApp, setActiveDropdownApp] = useState<string | null>(null);
  const [showManageModal, setShowManageModal] = useState(false);
  const [activeModalTab, setActiveModalTab] = useState<"tree" | "apps" | "categories">("tree");
  const [searchQuery, setSearchQuery] = useState("");
  const [savingApp, setSavingApp] = useState<string | null>(null);

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
          subcategory: (custom.subcategory as string) || null,
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
    return {
      category: getDefaultCategoryForApp(appName, action, category),
      subcategory: null,
      isManual: false,
    };
  };

  // Función para normalizar categorías y asegurar que incluyan subcategorías
  const sanitizeCategoryList = (list: CategoryItem[]): CategoryItem[] => {
    if (!Array.isArray(list) || list.length === 0) return DEFAULT_CATEGORIES;
    return list.map((cat) => ({
      ...cat,
      subcategories: Array.isArray(cat.subcategories) ? cat.subcategories : [],
    }));
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
      if (localCats) setCategories(sanitizeCategoryList(JSON.parse(localCats)));
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
  const handleSetCategory = async (appName: string, category: string | null, subcategory?: string | null) => {
    setSavingApp(appName);
    const newMap = { ...customCategories };
    if (!category || category === "auto" || category === "Sin Clasificar") {
      newMap[appName] = { category: "Sin Clasificar", subcategory: null };
    } else {
      if (subcategory) {
        newMap[appName] = { category, subcategory };
      } else {
        newMap[appName] = category;
      }
    }

    if (appName === "Formación de Usuarios") {
      delete newMap[appName];
    }

    setCustomCategories(newMap);
    try { localStorage.setItem("sek_app_categories", JSON.stringify(newMap)); } catch {}
    if (typeof window !== "undefined") {
      window.dispatchEvent(new Event("sekunet_categories_updated"));
    }
    setActiveDropdownApp(null);

    try {
      await fetch("/api/activity/app-categories", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          appName,
          category: (!category || category === "auto" || category === "Sin Clasificar") ? "Sin Clasificar" : category,
          subcategory: subcategory || undefined,
        }),
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
    let trimmed = subcatName.trim();
    if (!trimmed) return;
    if (isManual && !/\(manual\)/i.test(trimmed)) {
      trimmed = `${trimmed} (MANUAL)`;
    }
    const updated = categories.map((cat) => {
      if (cat.id === catId) {
        const subs = cat.subcategories || [];
        if (!subs.includes(trimmed)) {
          return { ...cat, subcategories: [...subs, trimmed] };
        }
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
    const isCurrentlyManual = /\(manual\)/i.test(subcatName);
    const cleanName = subcatName.replace(/\s*\(manual\)/i, "").trim();
    const newName = isCurrentlyManual ? cleanName : `${cleanName} (MANUAL)`;

    const updated = categories.map((cat) => {
      if (cat.id === catId && cat.subcategories) {
        return {
          ...cat,
          subcategories: cat.subcategories.map((s) => (s === subcatName ? newName : s)),
        };
      }
      return cat;
    });
    saveCategoriesList(updated);

    // Si había mapeos de aplicaciones apuntando a esta subcategoría, actualizarlos también
    const newMap = { ...customCategories };
    let changed = false;
    for (const [app, val] of Object.entries(newMap)) {
      if (typeof val === "object" && val && (val.category === catId || val.category === getCategoryUI(catId).label) && val.subcategory === subcatName) {
        newMap[app] = { ...val, subcategory: newName };
        changed = true;
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
    const updated = categories.map((cat) => {
      if (cat.id === catId && cat.subcategories) {
        return { ...cat, subcategories: cat.subcategories.filter((s) => s !== subcatName) };
      }
      return cat;
    });
    saveCategoriesList(updated);

    // Desvincular de customCategories para que pasen a Sin Clasificar
    const newMap = { ...customCategories };
    let changed = false;
    for (const [app, val] of Object.entries(newMap)) {
      if (typeof val === "object" && val && (val.category === catId || val.category === getCategoryUI(catId).label) && val.subcategory === subcatName) {
        newMap[app] = { category: catId, subcategory: null };
        changed = true;
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
    if (!confirm("¿Restablecer el Árbol Operativo a las 6 columnas oficiales del taller (Excel)?")) return;
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
    return computeUnifiedActivityMetrics(timeline as any, { toleranceMinutes: 15 });
  }, [timeline]);

  const allDetectedApps = useMemo(() => {
    return metrics.topSoftware.map((s) => s.name);
  }, [metrics]);

  const currentTotal = metrics.totalDayMs;

  const sortedItems: [string, { durationMs: number; count: number }][] = useMemo(() => {
    if (viewMode === "categories") {
      return metrics.operationalBuckets.map((b) => [
        b.id,
        { durationMs: b.durationMs, count: 1 },
      ]);
    } else {
      return metrics.topSoftware.slice(0, 15).map((s) => [
        s.name,
        { durationMs: s.durationMs, count: s.count },
      ]);
    }
  }, [viewMode, metrics]);

  // Lista de apps y labores para el modal de gestión
  const filteredModalApps = useMemo(() => {
    const combined = Array.from(
      new Set([...allDetectedApps, ...Object.keys(customCategories)])
    ).sort();
    if (!searchQuery.trim()) return combined;
    return combined.filter((app) => app.toLowerCase().includes(searchQuery.toLowerCase()));
  }, [allDetectedApps, customCategories, searchQuery]);

  // Lista de apps y URLs pendientes de clasificar (sin subcategoría oficial asignada)
  const unassignedApps = useMemo(() => {
    return filteredModalApps.filter((appName) => {
      const asg = getAppAssignment(appName);
      const matchedCat = categories.find((c) => c.id === asg.category || c.label === asg.category);
      if (!matchedCat) return true;
      if (!asg.subcategory) return true;
      return false;
    });
  }, [filteredModalApps, categories, customCategories]);

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
              <span className={`text-[10px] font-bold px-2.5 py-0.5 rounded-full border ${ui.color}`}>
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
                  className={`text-[10px] font-bold px-2.5 py-0.5 rounded-full border flex items-center gap-1 transition-all hover:scale-105 cursor-pointer ${ui.color} ${
                    assignment.isManual ? "ring-1 ring-violet-500/50" : ""
                  }`}
                  title={assignment.isManual ? "Categoría personalizada manualmente (clic para cambiar)" : "Categoría asignada (clic para cambiar)"}
                >
                  {assignment.isManual && <span className="text-[9px] font-black mr-0.5">●</span>}
                  <span>{ui.label}</span>
                  <ChevronDown className="h-2.5 w-2.5 opacity-60 ml-0.5" />
                </button>

                {currentSub && (
                  <span
                    className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-muted/60 border border-border text-foreground/90"
                    title={`Subcategoría: ${currentSub}`}
                  >
                    {currentSub}
                  </span>
                )}

                {/* Dropdown flotante con las categorías y subcategorías */}
                {activeDropdownApp === itemName && (
                  <div
                    className="absolute right-0 top-full mt-1.5 w-64 rounded-xl bg-card border border-border shadow-2xl p-1.5 z-50 space-y-0.5 max-h-80 overflow-y-auto animate-in fade-in zoom-in-95 duration-100"
                    onClick={(e) => e.stopPropagation()}
                  >
                    <div className="px-2 py-1 text-[9px] font-black uppercase tracking-wider text-muted-foreground border-b border-border/50 mb-1 flex items-center justify-between">
                      <span className="truncate max-w-[150px]">Clasificar {itemName}</span>
                      {savingApp === itemName && <span className="text-violet-400 font-bold text-[9px]">Guardando...</span>}
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
                                className={`w-full text-left px-2 py-1 rounded text-[10px] flex items-center justify-between transition-colors ${
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
                                    className={`w-full text-left px-2 py-1 rounded text-[10px] flex items-center justify-between transition-colors ${
                                      isSubSelected
                                        ? "bg-violet-500/25 text-violet-200 font-bold"
                                        : "hover:bg-muted/50 text-muted-foreground hover:text-foreground"
                                    }`}
                                  >
                                    <span className="truncate">{sub}</span>
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
            className={`w-full transition-all duration-300 ${
              activeModalTab === "tree" ? "max-w-[96vw] xl:max-w-[1720px] h-[92vh]" : "max-w-3xl"
            } rounded-3xl bg-[#0b0f19] border border-border/80 shadow-2xl p-6 space-y-4 max-h-[94vh] flex flex-col`}
            onClick={(e) => e.stopPropagation()}
          >
            {/* Header del Modal con Tabs */}
            <div className="flex items-center justify-between border-b border-border/50 pb-3 shrink-0">
              <div className="flex items-center gap-2.5">
                <div className="p-2 rounded-xl bg-violet-500/15 border border-violet-500/20 text-violet-400">
                  <SlidersHorizontal className="h-5 w-5" />
                </div>
                <div>
                  <h3 className="font-bold text-base text-foreground tracking-tight">Gestión y Árbol Operativo del Taller</h3>
                  <p className="text-xs text-muted-foreground">
                    Organice aplicaciones, URLs y labores en categorías y subcategorías oficiales
                  </p>
                </div>
              </div>
              <button
                onClick={() => {
                  setShowManageModal(false);
                  setIsCreatingNew(false);
                  setEditingCategory(null);
                  setShowAddCustomModal(false);
                  setTreeSubcatAddTarget(null);
                  setEditingSubcat(null);
                  setTreeNewSubcatCatId(null);
                }}
                className="p-1.5 rounded-xl hover:bg-muted text-muted-foreground hover:text-foreground transition-colors cursor-pointer"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            {/* Pestañas del Modal */}
            <div className="flex border-b border-border/50 gap-4 overflow-x-auto pb-1 shrink-0">
              <button
                onClick={() => { setActiveModalTab("tree"); }}
                className={`pb-2.5 text-xs font-bold transition-all border-b-2 flex items-center gap-2 whitespace-nowrap cursor-pointer ${
                  activeModalTab === "tree"
                    ? "border-violet-500 text-violet-400"
                    : "border-transparent text-muted-foreground hover:text-foreground"
                }`}
              >
                <FolderTree className="h-4 w-4" />
                <span>Árbol Operativo (Vista Jerárquica)</span>
              </button>
              <button
                onClick={() => { setActiveModalTab("apps"); setIsCreatingNew(false); setEditingCategory(null); }}
                className={`pb-2.5 text-xs font-bold transition-all border-b-2 flex items-center gap-2 whitespace-nowrap cursor-pointer ${
                  activeModalTab === "apps"
                    ? "border-violet-500 text-violet-400"
                    : "border-transparent text-muted-foreground hover:text-foreground"
                }`}
              >
                <Layers className="h-4 w-4" />
                <span>Mapeo de Software y URLs ({filteredModalApps.length})</span>
              </button>
              <button
                onClick={() => { setActiveModalTab("categories"); }}
                className={`pb-2.5 text-xs font-bold transition-all border-b-2 flex items-center gap-2 whitespace-nowrap cursor-pointer ${
                  activeModalTab === "categories"
                    ? "border-violet-500 text-violet-400"
                    : "border-transparent text-muted-foreground hover:text-foreground"
                }`}
              >
                <SlidersHorizontal className="h-4 w-4" />
                <span>Categorías del Taller ({categories.length})</span>
              </button>
            </div>

            {/* CONTENIDO PESTAÑA 1: ÁRBOL OPERATIVO */}
            {activeModalTab === "tree" && (
              <div className="flex-1 flex flex-col min-h-0 space-y-3.5">
                {/* Barra de herramientas superior del Árbol */}
                <div className="flex flex-wrap items-center justify-between gap-3 bg-muted/20 border border-border/50 p-2.5 px-3.5 rounded-2xl shrink-0">
                  <div className="flex items-center gap-2 flex-1 min-w-[240px] max-w-md bg-muted/30 border border-border/60 rounded-xl px-3 py-1.5">
                    <Search className="h-4 w-4 text-muted-foreground shrink-0" />
                    <input
                      type="text"
                      value={treeSearch}
                      onChange={(e) => setTreeSearch(e.target.value)}
                      placeholder="Buscar por software, URL, subcategoría o labor..."
                      className="w-full bg-transparent text-xs text-foreground placeholder:text-muted-foreground focus:outline-none"
                    />
                    {treeSearch && (
                      <button onClick={() => setTreeSearch("")} className="text-muted-foreground hover:text-foreground">
                        <X className="h-3.5 w-3.5" />
                      </button>
                    )}
                  </div>

                  <div className="flex items-center gap-2 shrink-0 flex-wrap">
                    <button
                      onClick={() => setShowAddCustomModal(true)}
                      className="px-3.5 py-2 text-xs font-bold rounded-xl bg-violet-600 hover:bg-violet-700 text-white flex items-center gap-1.5 transition-colors shadow-sm cursor-pointer"
                    >
                      <Plus className="h-4 w-4" />
                      <span>Agregar Software o URL</span>
                    </button>
                    <button
                      onClick={() => {
                        setIsCreatingNew(true);
                        setEditingCategory(null);
                        setFormCatName("");
                        setFormCatColorIdx(0);
                        setFormCatIcon("Monitor");
                        setFormCatSubcategories([]);
                        setActiveModalTab("categories");
                      }}
                      className="px-3.5 py-2 text-xs font-semibold rounded-xl bg-muted/40 hover:bg-muted text-foreground border border-border/60 flex items-center gap-1.5 transition-colors cursor-pointer"
                    >
                      <Plus className="h-3.5 w-3.5 text-violet-400" />
                      <span>Nueva Categoría</span>
                    </button>
                    <button
                      onClick={handleResetToOfficialTree}
                      className="px-3 py-2 text-xs font-semibold rounded-xl hover:bg-amber-500/10 text-amber-400 border border-amber-500/30 flex items-center gap-1.5 transition-colors cursor-pointer"
                      title="Restablecer exactamente a las 6 columnas del Excel"
                    >
                      <RotateCcw className="h-3.5 w-3.5" />
                      <span>Restablecer Oficial (Excel)</span>
                    </button>
                  </div>
                </div>

                {/* ARQUITECTURA MASTER-DETAIL (2 PANELES, SIN SCROLL HORIZONTAL) */}
                <div className="flex-1 flex min-h-0 gap-4 overflow-hidden">
                  {/* PANEL IZQUIERDO: MASTER (Lista Vertical de Categorías + Sin Clasificar) */}
                  <div className="w-[280px] min-w-[280px] max-w-[300px] flex flex-col bg-[#0f1422]/95 border border-border/70 rounded-2xl overflow-hidden shadow-md shrink-0">
                    <div className="p-3 border-b border-border/60 bg-muted/20 flex items-center justify-between shrink-0">
                      <div className="flex items-center gap-2">
                        <Layers className="h-4 w-4 text-violet-400" />
                        <span className="text-xs font-bold text-foreground">Categorías ({categories.length})</span>
                      </div>
                      <span className="text-[10px] font-mono font-bold text-muted-foreground bg-muted/60 px-2 py-0.5 rounded-full border border-border/40">
                        Total {filteredModalApps.length}
                      </span>
                    </div>

                    <div className="p-2 space-y-1.5 flex-1 overflow-y-auto pr-1.5">
                      {/* Opción Destacada: 📥 Sin Clasificar */}
                      <button
                        type="button"
                        onClick={() => setSelectedTreeCatId("__unassigned__")}
                        onDragOver={(e) => {
                          e.preventDefault();
                          e.dataTransfer.dropEffect = "move";
                          if (dragOverTarget !== "master::__unassigned__") {
                            setDragOverTarget("master::__unassigned__");
                          }
                        }}
                        onDragLeave={(e) => {
                          if (e.currentTarget.contains(e.relatedTarget as Node)) return;
                          setDragOverTarget(null);
                        }}
                        onDrop={(e) => {
                          e.preventDefault();
                          const droppedApp = e.dataTransfer.getData("text/plain") || draggedItem;
                          if (droppedApp) {
                            handleSetCategory(droppedApp, null, null);
                          }
                          setDraggedItem(null);
                          setDragOverTarget(null);
                        }}
                        className={`w-full text-left p-2.5 rounded-xl border transition-all cursor-pointer flex items-center justify-between group ${
                          dragOverTarget === "master::__unassigned__"
                            ? "bg-amber-500/30 border-amber-400 ring-2 ring-amber-500/50 scale-[1.02]"
                            : selectedTreeCatId === "__unassigned__"
                            ? "bg-amber-500/15 border-amber-500/60 ring-1 ring-amber-500/40 shadow-sm"
                            : "bg-background/60 hover:bg-background border-border/50 hover:border-amber-500/40"
                        }`}
                      >
                        <div className="flex items-center gap-2.5 min-w-0">
                          <div className={`p-2 rounded-lg shrink-0 transition-colors ${
                            selectedTreeCatId === "__unassigned__"
                              ? "bg-amber-500 text-black font-bold"
                              : "bg-amber-500/15 text-amber-400 group-hover:bg-amber-500/25"
                          }`}>
                            <Inbox className="h-4 w-4" />
                          </div>
                          <div className="min-w-0">
                            <h5 className="font-bold text-xs text-foreground truncate">Sin Clasificar</h5>
                            <p className="text-[10px] text-muted-foreground truncate">Arrastre o asigne aquí</p>
                          </div>
                        </div>
                        <span className={`px-2 py-0.5 rounded-full text-[10px] font-mono font-bold shrink-0 ${
                          unassignedApps.length > 0
                            ? "bg-amber-500/20 text-amber-300 border border-amber-500/40"
                            : "bg-muted/60 text-muted-foreground"
                        }`}>
                          {unassignedApps.length}
                        </span>
                      </button>

                      <div className="pt-2 pb-1 px-1">
                        <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground/70">
                          Árbol Oficial
                        </span>
                      </div>

                      {/* Lista de las 6 Categorías */}
                      {categories.map((cat) => {
                        const countInCat = filteredModalApps.filter((appName) => {
                          const asg = getAppAssignment(appName);
                          return asg.category === cat.id || asg.category === cat.label;
                        }).length;

                        const isSelected = selectedTreeCatId === cat.id;
                        const isDropTarget = dragOverTarget === `master::${cat.id}`;

                        return (
                          <button
                            key={cat.id}
                            type="button"
                            onClick={() => setSelectedTreeCatId(cat.id)}
                            onDragOver={(e) => {
                              e.preventDefault();
                              e.dataTransfer.dropEffect = "move";
                              if (dragOverTarget !== `master::${cat.id}`) {
                                setDragOverTarget(`master::${cat.id}`);
                              }
                            }}
                            onDragLeave={(e) => {
                              if (e.currentTarget.contains(e.relatedTarget as Node)) return;
                              setDragOverTarget(null);
                            }}
                            onDrop={(e) => {
                              e.preventDefault();
                              const droppedApp = e.dataTransfer.getData("text/plain") || draggedItem;
                              if (droppedApp) {
                                handleSetCategory(droppedApp, cat.id, cat.subcategories?.[0] || null);
                                setSelectedTreeCatId(cat.id);
                              }
                              setDraggedItem(null);
                              setDragOverTarget(null);
                            }}
                            className={`w-full text-left p-2.5 rounded-xl border transition-all cursor-pointer flex items-center justify-between group ${
                              isDropTarget
                                ? "bg-violet-500/30 border-violet-400 ring-2 ring-violet-500/60 scale-[1.02]"
                                : isSelected
                                ? "bg-violet-600/15 border-violet-500/60 ring-1 ring-violet-500/40 shadow-sm"
                                : "bg-background/60 hover:bg-background border-border/50 hover:border-violet-500/30"
                            }`}
                          >
                            <div className="flex items-center gap-2.5 min-w-0 pr-1">
                              <div className={`p-2 rounded-lg shrink-0 ${cat.color.replace('text-', 'bg-')}/15 ${cat.color}`}>
                                {renderCategoryIcon(cat.iconName, "h-4 w-4")}
                              </div>
                              <div className="min-w-0">
                                <h5 className={`font-bold text-xs truncate leading-tight ${
                                  isSelected ? "text-violet-300" : "text-foreground group-hover:text-foreground"
                                }`}>
                                  {cat.label}
                                </h5>
                                <p className="text-[10px] text-muted-foreground truncate">
                                  {(cat.subcategories || []).length} subcategorías
                                </p>
                              </div>
                            </div>
                            <span className={`px-2 py-0.5 rounded-full text-[10px] font-mono font-bold shrink-0 border ${
                              isSelected
                                ? "bg-violet-500/20 text-violet-200 border-violet-500/40"
                                : "bg-muted/60 text-muted-foreground border-border/40"
                            }`}>
                              {countInCat}
                            </span>
                          </button>
                        );
                      })}
                    </div>
                  </div>

                  {/* PANEL DERECHO: DETALLE (Área de Trabajo Espaciosa de la Categoría Activa) */}
                  <div className="flex-1 flex flex-col min-h-0 bg-[#0f1422]/95 border border-border/70 rounded-2xl overflow-hidden shadow-md">
                    {/* Caso A: Detalle de Sin Clasificar */}
                    {selectedTreeCatId === "__unassigned__" ? (
                      <div className="flex-1 flex flex-col min-h-0 p-5 space-y-4">
                        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border/50 pb-4 shrink-0">
                          <div className="flex items-center gap-3">
                            <div className="p-3 rounded-2xl bg-amber-500/15 border border-amber-500/30 text-amber-400">
                              <Inbox className="h-6 w-6" />
                            </div>
                            <div>
                              <h4 className="font-bold text-base text-foreground tracking-tight flex items-center gap-2">
                                <span>Software y URLs Sin Clasificar</span>
                                <span className="px-2.5 py-0.5 rounded-full text-xs font-mono font-bold bg-amber-500/20 text-amber-300 border border-amber-500/40">
                                  {unassignedApps.length}
                                </span>
                              </h4>
                              <p className="text-xs text-muted-foreground">
                                Elementos detectados en jornada que no tienen una subcategoría asignada. Arrástrelos a una categoría en el panel izquierdo o haga clic para asignarlos.
                              </p>
                            </div>
                          </div>

                          <div className="flex items-center gap-2">
                            <div className="relative">
                              <Search className="absolute left-2.5 top-2 h-3.5 w-3.5 text-muted-foreground" />
                              <input
                                type="text"
                                value={unassignedSearch}
                                onChange={(e) => setUnassignedSearch(e.target.value)}
                                placeholder="Filtrar pendientes..."
                                className="pl-8 pr-3 py-1.5 text-xs rounded-xl bg-background border border-border/60 focus:outline-none focus:border-amber-500 text-foreground w-48 shadow-xs"
                              />
                            </div>
                          </div>
                        </div>

                        {/* Contenido Grid de Pendientes */}
                        <div className="flex-1 overflow-y-auto pr-1.5">
                          {filteredUnassigned.length === 0 ? (
                            <div className="p-12 text-center space-y-2 border border-dashed border-border/60 rounded-2xl bg-muted/10">
                              <div className="p-3 rounded-2xl bg-emerald-500/15 text-emerald-400 inline-block">
                                <Check className="h-6 w-6" />
                              </div>
                              <h5 className="font-bold text-sm text-foreground">¡Excelente! Sin pendientes</h5>
                              <p className="text-xs text-muted-foreground max-w-sm mx-auto">
                                Todas las aplicaciones, URLs y labores detectadas están clasificadas en las 6 categorías oficiales.
                              </p>
                            </div>
                          ) : (
                            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-2.5">
                              {filteredUnassigned.map((item) => {
                                const isUrl = item.includes(".") && !item.endsWith(".exe") && (item.includes(".com") || item.includes(".org") || item.includes(".net") || item.includes(".io") || item.includes(".app") || item.startsWith("http"));
                                return (
                                  <div
                                    key={item}
                                    draggable
                                    onDragStart={(e) => {
                                      e.dataTransfer.setData("text/plain", item);
                                      e.dataTransfer.effectAllowed = "move";
                                      setDraggedItem(item);
                                    }}
                                    onDragEnd={() => {
                                      setDraggedItem(null);
                                      setDragOverTarget(null);
                                    }}
                                    onClick={() => {
                                      const asg = getAppAssignment(item);
                                      setItemToManage({
                                        appName: item,
                                        currentCat: asg.category || categories[0]?.id || "Soporte",
                                        currentSub: asg.subcategory || null,
                                      });
                                      setManageTargetCat(asg.category || categories[0]?.id || "Soporte");
                                      setManageTargetSub(asg.subcategory || "");
                                    }}
                                    className="group/item flex items-center justify-between p-2.5 rounded-xl bg-background/80 hover:bg-background border border-amber-500/20 hover:border-amber-500/50 text-xs transition-all shadow-xs cursor-grab active:cursor-grabbing hover:shadow-md"
                                  >
                                    <div className="flex items-center gap-2 min-w-0 pr-2 flex-1">
                                      <GripVertical className="h-4 w-4 text-muted-foreground/30 group-hover/item:text-amber-400 shrink-0" />
                                      {isUrl ? (
                                        <Globe className="h-4 w-4 text-cyan-400 shrink-0" />
                                      ) : (
                                        <span className="shrink-0">{getAppIcon(item)}</span>
                                      )}
                                      <span className="text-xs font-medium text-foreground truncate" title={item}>
                                        {item}
                                      </span>
                                    </div>
                                    <button
                                      type="button"
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        const asg = getAppAssignment(item);
                                        setItemToManage({
                                          appName: item,
                                          currentCat: asg.category || categories[0]?.id || "Soporte",
                                          currentSub: asg.subcategory || null,
                                        });
                                        setManageTargetCat(asg.category || categories[0]?.id || "Soporte");
                                        setManageTargetSub(asg.subcategory || "");
                                      }}
                                      className="px-2 py-1 rounded-lg bg-amber-500/10 hover:bg-amber-500/20 text-amber-300 font-bold text-[10px] flex items-center gap-1 transition-colors shrink-0 cursor-pointer"
                                    >
                                      <ArrowRightLeft className="h-3 w-3" />
                                      <span>Clasificar</span>
                                    </button>
                                  </div>
                                );
                              })}
                            </div>
                          )}
                        </div>
                      </div>
                    ) : (
                      /* Caso B: Detalle de una Categoría Oficial Seleccionada */
                      (() => {
                        const activeCat = categories.find((c) => c.id === selectedTreeCatId) || categories[0];
                        if (!activeCat) return null;

                        const allAssignedInCat = filteredModalApps.filter((appName) => {
                          const asg = getAppAssignment(appName);
                          return asg.category === activeCat.id || asg.category === activeCat.label;
                        });

                        const isAddingSubcatToThisCat = treeNewSubcatCatId === activeCat.id;

                        return (
                          <div className="flex-1 flex flex-col min-h-0 p-5 space-y-4">
                            {/* Header Amplio de la Categoría Activa */}
                            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border/50 pb-4 shrink-0">
                              <div className="flex items-center gap-3 min-w-0">
                                <div className={`p-3 rounded-2xl ${activeCat.color.replace('text-', 'bg-')}/15 ${activeCat.color} shrink-0`}>
                                  {renderCategoryIcon(activeCat.iconName, "h-6 w-6")}
                                </div>
                                <div className="min-w-0">
                                  <div className="flex items-center gap-2">
                                    <h3 className="font-bold text-base text-foreground tracking-tight truncate">
                                      {activeCat.label}
                                    </h3>
                                    <span className="px-2.5 py-0.5 rounded-full text-xs font-mono font-bold bg-muted/70 text-muted-foreground border border-border/50 shrink-0">
                                      {allAssignedInCat.length} elementos
                                    </span>
                                  </div>
                                  <p className="text-xs text-muted-foreground">
                                    {(activeCat.subcategories || []).length} subcategorías operativas definidas
                                  </p>
                                </div>
                              </div>

                              <div className="flex items-center gap-2">
                                {isAddingSubcatToThisCat ? (
                                  <div className="flex items-center gap-1 bg-background border border-violet-500 rounded-xl p-1 shadow-xs">
                                    <input
                                      type="text"
                                      autoFocus
                                      value={treeNewSubcatInput}
                                      onChange={(e) => setTreeNewSubcatInput(e.target.value)}
                                      onKeyDown={(e) => {
                                        if (e.key === "Enter" && treeNewSubcatInput.trim()) {
                                          handleAddSubcategory(activeCat.id, treeNewSubcatInput.trim());
                                          setTreeNewSubcatInput("");
                                          setTreeNewSubcatCatId(null);
                                        } else if (e.key === "Escape") {
                                          setTreeNewSubcatCatId(null);
                                        }
                                      }}
                                      placeholder="Nombre de subcategoría..."
                                      className="text-xs px-2 py-1 bg-transparent text-foreground focus:outline-none w-44"
                                    />
                                    <button
                                      onClick={() => {
                                        if (!treeNewSubcatInput.trim()) return;
                                        handleAddSubcategory(activeCat.id, treeNewSubcatInput.trim());
                                        setTreeNewSubcatInput("");
                                        setTreeNewSubcatCatId(null);
                                      }}
                                      className="px-2.5 py-1 text-xs font-bold rounded-lg bg-violet-600 hover:bg-violet-700 text-white cursor-pointer"
                                    >
                                      Crear
                                    </button>
                                    <button
                                      onClick={() => setTreeNewSubcatCatId(null)}
                                      className="p-1 rounded-lg hover:bg-muted text-muted-foreground cursor-pointer"
                                    >
                                      <X className="h-3.5 w-3.5" />
                                    </button>
                                  </div>
                                ) : (
                                  <button
                                    onClick={() => {
                                      setTreeNewSubcatCatId(activeCat.id);
                                      setTreeNewSubcatInput("");
                                    }}
                                    className="px-3 py-1.5 text-xs font-semibold rounded-xl bg-violet-600/10 hover:bg-violet-600/20 text-violet-300 border border-violet-500/30 flex items-center gap-1.5 transition-colors cursor-pointer"
                                  >
                                    <Plus className="h-3.5 w-3.5" />
                                    <span>Nueva Subcategoría</span>
                                  </button>
                                )}
                              </div>
                            </div>

                            {/* Rejilla Espaciosa de Subcategorías (2 Columnas) */}
                            <div className="flex-1 overflow-y-auto pr-1.5">
                              {(activeCat.subcategories || []).length === 0 ? (
                                <div className="p-10 text-center text-xs text-muted-foreground border border-dashed border-border/60 rounded-2xl">
                                  No hay subcategorías en esta categoría. Haga clic en «Nueva Subcategoría» para crear una.
                                </div>
                              ) : (
                                <div className="grid grid-cols-1 xl:grid-cols-2 gap-4 pb-2">
                                  {(activeCat.subcategories || []).map((subcat) => {
                                    const assignedItems = filteredModalApps.filter((appName) => {
                                      const asg = getAppAssignment(appName);
                                      const matchCat = asg.category === activeCat.id || asg.category === activeCat.label;
                                      const matchSub = asg.subcategory === subcat || (!asg.subcategory && subcat === "General");
                                      if (!matchCat || !matchSub) return false;
                                      if (!treeSearch.trim()) return true;
                                      const q = treeSearch.toLowerCase();
                                      return (
                                        appName.toLowerCase().includes(q) ||
                                        subcat.toLowerCase().includes(q) ||
                                        activeCat.label.toLowerCase().includes(q)
                                      );
                                    });

                                    const isEditingThisSub = editingSubcat?.catId === activeCat.id && editingSubcat?.subcat === subcat;
                                    const isAddingHere = treeSubcatAddTarget === `${activeCat.id}::${subcat}`;
                                    const isManual = subcat.includes("(MANUAL)");
                                    const cleanSubcatTitle = subcat.replace(/\s*\(MANUAL\)\s*/i, "").trim();
                                    const isDropTarget = dragOverTarget === `${activeCat.id}::${subcat}`;

                                    return (
                                      <div
                                        key={subcat}
                                        onDragOver={(e) => {
                                          e.preventDefault();
                                          e.dataTransfer.dropEffect = "move";
                                          if (dragOverTarget !== `${activeCat.id}::${subcat}`) {
                                            setDragOverTarget(`${activeCat.id}::${subcat}`);
                                          }
                                        }}
                                        onDragLeave={(e) => {
                                          if (e.currentTarget.contains(e.relatedTarget as Node)) return;
                                          setDragOverTarget(null);
                                        }}
                                        onDrop={(e) => {
                                          e.preventDefault();
                                          const droppedApp = e.dataTransfer.getData("text/plain") || draggedItem;
                                          if (droppedApp) {
                                            handleSetCategory(droppedApp, activeCat.id, subcat);
                                          }
                                          setDraggedItem(null);
                                          setDragOverTarget(null);
                                        }}
                                        className={`group/sub p-4 rounded-2xl transition-all shadow-xs border flex flex-col justify-between ${
                                          isDropTarget
                                            ? "bg-violet-500/20 border-violet-400 ring-2 ring-violet-500/50 scale-[1.01]"
                                            : "bg-background/80 hover:bg-background border-border/70 hover:border-violet-500/40 space-y-3"
                                        }`}
                                      >
                                        <div>
                                          {/* Encabezado de la Subcategoría */}
                                          <div className="flex items-start justify-between gap-2 pb-2.5 border-b border-border/40">
                                            {isEditingThisSub ? (
                                              <div className="flex items-center gap-1 flex-1">
                                                <input
                                                  type="text"
                                                  autoFocus
                                                  value={editingSubcatValue}
                                                  onChange={(e) => setEditingSubcatValue(e.target.value)}
                                                  onKeyDown={(e) => {
                                                    if (e.key === "Enter") {
                                                      handleRenameSubcategory(activeCat.id, subcat, editingSubcatValue);
                                                    } else if (e.key === "Escape") {
                                                      setEditingSubcat(null);
                                                    }
                                                  }}
                                                  className="w-full text-xs px-2.5 py-1 rounded-lg bg-background border border-violet-500 text-foreground"
                                                />
                                                <button
                                                  onClick={() => handleRenameSubcategory(activeCat.id, subcat, editingSubcatValue)}
                                                  className="p-1 rounded-lg hover:bg-muted text-emerald-400 cursor-pointer"
                                                >
                                                  <Check className="h-3.5 w-3.5" />
                                                </button>
                                                <button
                                                  onClick={() => setEditingSubcat(null)}
                                                  className="p-1 rounded-lg hover:bg-muted text-muted-foreground cursor-pointer"
                                                >
                                                  <X className="h-3.5 w-3.5" />
                                                </button>
                                              </div>
                                            ) : (
                                              <>
                                                <div className="flex items-center gap-2 min-w-0">
                                                  <span className="text-xs font-bold text-foreground leading-snug">
                                                    {cleanSubcatTitle}
                                                  </span>
                                                  <button
                                                    type="button"
                                                    onClick={(e) => {
                                                      e.stopPropagation();
                                                      handleToggleSubcategoryManual(activeCat.id, subcat);
                                                    }}
                                                    className={`text-[9px] font-bold px-1.5 py-0.5 rounded transition-all cursor-pointer shrink-0 ${
                                                      isManual
                                                        ? "bg-amber-500/20 text-amber-300 border border-amber-500/40 hover:bg-amber-500/30"
                                                        : "bg-muted text-muted-foreground hover:text-foreground border border-border/40"
                                                    }`}
                                                    title={
                                                      isManual
                                                        ? "Configurada como labor manual (botón en barra lateral). Clic para cambiar a digital/PC."
                                                        : "Configurada como digital/PC. Clic para convertir en labor manual (botón en barra lateral)."
                                                    }
                                                  >
                                                    {isManual ? "🛠 MANUAL" : "💻 PC"}
                                                  </button>
                                                </div>

                                                <div className="flex items-center gap-1 shrink-0">
                                                  <span className="text-[10px] text-muted-foreground font-mono bg-muted/60 px-2 py-0.5 rounded-full border border-border/40">
                                                    {assignedItems.length}
                                                  </span>
                                                  <button
                                                    onClick={() => {
                                                      setEditingSubcat({ catId: activeCat.id, subcat });
                                                      setEditingSubcatValue(subcat);
                                                    }}
                                                    title="Renombrar subcategoría"
                                                    className="opacity-0 group-hover/sub:opacity-100 p-1 rounded-lg hover:bg-muted text-muted-foreground hover:text-foreground transition-opacity cursor-pointer"
                                                  >
                                                    <Edit2 className="h-3 w-3" />
                                                  </button>
                                                  <button
                                                    onClick={() => {
                                                      if (confirm(`¿Eliminar la subcategoría "${subcat}"?`)) {
                                                        handleDeleteSubcategory(activeCat.id, subcat);
                                                      }
                                                    }}
                                                    title="Eliminar subcategoría"
                                                    className="opacity-0 group-hover/sub:opacity-100 p-1 rounded-lg hover:bg-muted text-muted-foreground hover:text-rose-400 transition-opacity cursor-pointer"
                                                  >
                                                    <Trash2 className="h-3 w-3" />
                                                  </button>
                                                </div>
                                              </>
                                            )}
                                          </div>

                                          {/* Lista de Software o URLs Asignados */}
                                          <div className="pt-2.5 space-y-1.5 max-h-56 overflow-y-auto pr-1">
                                            {assignedItems.map((item) => {
                                              const isUrl = item.includes(".") && !item.endsWith(".exe") && (item.includes(".com") || item.includes(".org") || item.includes(".net") || item.includes(".io") || item.includes(".app") || item.startsWith("http"));
                                              return (
                                                <div
                                                  key={item}
                                                  draggable
                                                  onDragStart={(e) => {
                                                    e.dataTransfer.setData("text/plain", item);
                                                    e.dataTransfer.effectAllowed = "move";
                                                    setDraggedItem(item);
                                                  }}
                                                  onDragEnd={() => {
                                                    setDraggedItem(null);
                                                    setDragOverTarget(null);
                                                  }}
                                                  onClick={() => {
                                                    setItemToManage({
                                                      appName: item,
                                                      currentCat: activeCat.id,
                                                      currentSub: subcat,
                                                    });
                                                    setManageTargetCat(activeCat.id);
                                                    setManageTargetSub(subcat);
                                                  }}
                                                  className="group/item flex items-center justify-between p-2 rounded-xl bg-card/60 hover:bg-card border border-border/40 hover:border-violet-500/40 text-xs transition-all cursor-grab active:cursor-grabbing shadow-2xs"
                                                  title="Arrastre a otra subcategoría o haga clic para reasignar"
                                                >
                                                  <div className="flex items-center gap-2 min-w-0 pr-1 flex-1">
                                                    <GripVertical className="h-3.5 w-3.5 text-muted-foreground/30 group-hover/item:text-violet-400 shrink-0" />
                                                    {isUrl ? (
                                                      <Globe className="h-3.5 w-3.5 text-cyan-400 shrink-0" />
                                                    ) : (
                                                      <span className="shrink-0">{getAppIcon(item)}</span>
                                                    )}
                                                    <span className="text-[11px] font-medium text-foreground/90 truncate leading-tight">
                                                      {item}
                                                    </span>
                                                  </div>
                                                  <div className="flex items-center gap-1 shrink-0">
                                                    <button
                                                      type="button"
                                                      onClick={(e) => {
                                                        e.stopPropagation();
                                                        setItemToManage({
                                                          appName: item,
                                                          currentCat: activeCat.id,
                                                          currentSub: subcat,
                                                        });
                                                        setManageTargetCat(activeCat.id);
                                                        setManageTargetSub(subcat);
                                                      }}
                                                      title="Mover o reasignar"
                                                      className="opacity-0 group-hover/item:opacity-100 p-1 rounded-md text-muted-foreground hover:text-violet-400 hover:bg-violet-500/10 transition-all cursor-pointer"
                                                    >
                                                      <ArrowRightLeft className="h-3 w-3" />
                                                    </button>
                                                    <button
                                                      type="button"
                                                      onClick={(e) => {
                                                        e.stopPropagation();
                                                        handleSetCategory(item, null, null);
                                                      }}
                                                      title="Desvincular (enviar a Sin Clasificar)"
                                                      className="opacity-0 group-hover/item:opacity-100 p-1 rounded-md text-muted-foreground hover:text-rose-400 hover:bg-rose-500/10 transition-all cursor-pointer"
                                                    >
                                                      <X className="h-3 w-3" />
                                                    </button>
                                                  </div>
                                                </div>
                                              );
                                            })}
                                            {assignedItems.length === 0 && !isAddingHere && (
                                              <p className="text-[11px] text-muted-foreground/50 italic py-2 text-center">
                                                Sin elementos asignados (arrastre aquí)
                                              </p>
                                            )}
                                          </div>
                                        </div>

                                        {/* Footer de la Subcategoría: Añadir software o URL */}
                                        <div className="pt-2 border-t border-border/40">
                                          {isAddingHere ? (
                                            <div className="space-y-1.5">
                                              <input
                                                type="text"
                                                autoFocus
                                                value={treeSubcatItemInput}
                                                onChange={(e) => setTreeSubcatItemInput(e.target.value)}
                                                onKeyDown={(e) => {
                                                  if (e.key === "Enter" && treeSubcatItemInput.trim()) {
                                                    handleSetCategory(treeSubcatItemInput.trim(), activeCat.id, subcat);
                                                    setTreeSubcatItemInput("");
                                                    setTreeSubcatAddTarget(null);
                                                  } else if (e.key === "Escape") {
                                                    setTreeSubcatAddTarget(null);
                                                  }
                                                }}
                                                placeholder="Escriba software o URL..."
                                                className="w-full text-xs px-2.5 py-1.5 rounded-lg bg-background border border-violet-500/60 focus:outline-none text-foreground placeholder:text-muted-foreground/60 shadow-xs"
                                              />

                                              {/* Sugerencias de apps pendientes no asignadas */}
                                              {unassignedApps.length > 0 && (
                                                <div className="max-h-28 overflow-y-auto space-y-1 p-1 bg-background/80 rounded-lg border border-border/40">
                                                  <p className="text-[9px] font-semibold text-muted-foreground px-1 uppercase tracking-wider">
                                                    Sugerencias pendientes:
                                                  </p>
                                                  {unassignedApps
                                                    .filter((u) => !treeSubcatItemInput.trim() || u.toLowerCase().includes(treeSubcatItemInput.toLowerCase()))
                                                    .slice(0, 5)
                                                    .map((sug) => (
                                                      <button
                                                        key={sug}
                                                        type="button"
                                                        onClick={() => {
                                                          handleSetCategory(sug, activeCat.id, subcat);
                                                          setTreeSubcatItemInput("");
                                                          setTreeSubcatAddTarget(null);
                                                        }}
                                                        className="w-full text-left px-2 py-1 rounded text-[11px] hover:bg-violet-500/20 text-foreground/90 hover:text-violet-300 flex items-center justify-between transition-colors cursor-pointer"
                                                      >
                                                        <span className="truncate">{sug}</span>
                                                        <Plus className="h-3 w-3 text-violet-400 shrink-0" />
                                                      </button>
                                                    ))}
                                                </div>
                                              )}

                                              <div className="flex items-center gap-1.5 justify-end">
                                                <button
                                                  onClick={() => {
                                                    setTreeSubcatAddTarget(null);
                                                    setTreeSubcatItemInput("");
                                                  }}
                                                  className="px-2 py-0.5 text-xs rounded hover:bg-muted text-muted-foreground cursor-pointer"
                                                >
                                                  Cancelar
                                                </button>
                                                <button
                                                  disabled={!treeSubcatItemInput.trim()}
                                                  onClick={() => {
                                                    if (!treeSubcatItemInput.trim()) return;
                                                    handleSetCategory(treeSubcatItemInput.trim(), activeCat.id, subcat);
                                                    setTreeSubcatItemInput("");
                                                    setTreeSubcatAddTarget(null);
                                                  }}
                                                  className="px-2.5 py-0.5 text-xs font-bold rounded-md bg-violet-600 hover:bg-violet-700 text-white disabled:opacity-50 cursor-pointer"
                                                >
                                                  Añadir
                                                </button>
                                              </div>
                                            </div>
                                          ) : (
                                            <button
                                              onClick={() => {
                                                setTreeSubcatAddTarget(`${activeCat.id}::${subcat}`);
                                                setTreeSubcatItemInput("");
                                              }}
                                              className="w-full py-1 text-[11px] font-medium text-muted-foreground hover:text-violet-400 hover:bg-violet-500/10 rounded-lg flex items-center justify-center gap-1 transition-colors border border-dashed border-border/60 hover:border-violet-500/40 cursor-pointer"
                                            >
                                              <Plus className="h-3 w-3" />
                                              <span>Añadir software o URL</span>
                                            </button>
                                          )}
                                        </div>
                                      </div>
                                    );
                                  })}
                                </div>
                              )}
                            </div>
                          </div>
                        );
                      })()
                    )}
                  </div>
                </div>
              </div>
            )}

            {/* CONTENIDO PESTAÑA 2: MAPEO DE SOFTWARE Y LABORES */}
            {activeModalTab === "apps" && (
              <div className="flex-1 flex flex-col min-h-0 space-y-3">
                <div className="flex items-center justify-between gap-2">
                  <div className="relative flex-1">
                    <Search className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
                    <input
                      type="text"
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      placeholder="Buscar software, URL o labor manual (ej: github.com, Odoo, WhatsApp)..."
                      className="w-full pl-9 pr-4 py-2 text-xs rounded-xl bg-muted/40 border border-border focus:outline-none focus:ring-2 focus:ring-violet-500 text-foreground placeholder:text-muted-foreground"
                    />
                  </div>
                  <button
                    onClick={() => {
                      setShowAddCustomModal(!showAddCustomModal);
                      if (!newCustomItemCat && categories.length > 0) {
                        setNewCustomItemCat(categories[0].id);
                        setNewCustomItemSub(categories[0].subcategories?.[0] || "");
                      }
                    }}
                    className="px-3 py-2 text-xs font-bold rounded-xl bg-violet-600 hover:bg-violet-700 text-white flex items-center gap-1.5 transition-colors shrink-0 shadow-sm cursor-pointer"
                  >
                    <Plus className="h-3.5 w-3.5" />
                    <span>Agregar Software o URL</span>
                  </button>
                </div>

                {/* Formulario desplegable para agregar Software o URL manual */}
                {showAddCustomModal && (
                  <div className="p-3.5 rounded-xl bg-muted/30 border border-violet-500/40 space-y-2.5 animate-in fade-in duration-150">
                    <div className="flex items-center justify-between">
                      <h4 className="text-xs font-bold text-violet-300 flex items-center gap-1.5">
                        <Plus className="h-3.5 w-3.5" />
                        <span>Registrar Software, URL o Tarea Manual</span>
                      </h4>
                      <button
                        onClick={() => setShowAddCustomModal(false)}
                        className="text-muted-foreground hover:text-foreground p-0.5 cursor-pointer"
                      >
                        <X className="h-4 w-4" />
                      </button>
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                      <div>
                        <label className="text-[10px] text-muted-foreground block mb-1">Nombre o URL:</label>
                        <input
                          type="text"
                          value={newCustomItemName}
                          onChange={(e) => setNewCustomItemName(e.target.value)}
                          placeholder="ej: github.com o Linkus"
                          className="w-full px-2.5 py-1.5 text-xs rounded-lg bg-background border border-border focus:ring-2 focus:ring-violet-500 text-foreground placeholder:text-muted-foreground"
                        />
                      </div>
                      <div>
                        <label className="text-[10px] text-muted-foreground block mb-1">Categoría Principal:</label>
                        <select
                          value={newCustomItemCat}
                          onChange={(e) => {
                            setNewCustomItemCat(e.target.value);
                            const targetCat = categories.find((c) => c.id === e.target.value);
                            setNewCustomItemSub(targetCat?.subcategories?.[0] || "");
                          }}
                          className="w-full px-2.5 py-1.5 text-xs rounded-lg bg-background border border-border focus:ring-2 focus:ring-violet-500 text-foreground cursor-pointer"
                        >
                          {categories.map((c) => (
                            <option key={c.id} value={c.id}>{c.label}</option>
                          ))}
                        </select>
                      </div>
                      <div>
                        <label className="text-[10px] text-muted-foreground block mb-1">Subcategoría:</label>
                        <select
                          value={newCustomItemSub}
                          onChange={(e) => setNewCustomItemSub(e.target.value)}
                          className="w-full px-2.5 py-1.5 text-xs rounded-lg bg-background border border-border focus:ring-2 focus:ring-violet-500 text-foreground cursor-pointer"
                        >
                          <option value="">(Sin subcategoría)</option>
                          {(categories.find((c) => c.id === newCustomItemCat)?.subcategories || []).map((s) => (
                            <option key={s} value={s}>{s}</option>
                          ))}
                        </select>
                      </div>
                    </div>
                    <div className="flex justify-end gap-2 pt-1">
                      <button
                        onClick={() => setShowAddCustomModal(false)}
                        className="px-2.5 py-1 text-xs rounded-lg text-muted-foreground hover:bg-muted cursor-pointer"
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
                        className="px-3 py-1 text-xs font-bold rounded-lg bg-violet-600 hover:bg-violet-700 text-white disabled:opacity-50 cursor-pointer"
                      >
                        Guardar y Asignar
                      </button>
                    </div>
                  </div>
                )}

                <div className="flex-1 overflow-y-auto space-y-2 pr-1 min-h-[260px] max-h-[350px]">
                  {filteredModalApps.length === 0 ? (
                    <div className="p-8 text-center text-xs text-muted-foreground">
                      No se encontraron aplicaciones con ese nombre.
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

                      return (
                        <div
                          key={appName}
                          className="p-2.5 rounded-xl bg-muted/20 border border-border/50 flex flex-col sm:flex-row sm:items-center justify-between gap-3 hover:bg-muted/30 transition-colors"
                        >
                          <div className="flex items-center gap-2.5 min-w-0">
                            {icon}
                            <div className="min-w-0">
                              <p className="font-bold text-xs text-foreground truncate" title={appName}>
                                {appName}
                              </p>
                              <p className="text-[10px] text-muted-foreground flex items-center gap-1.5 flex-wrap">
                                {isManual ? (
                                  <span className="text-violet-400 font-semibold">● Asignación manual</span>
                                ) : (
                                  <span>Asignación automática</span>
                                )}
                                {currentSub && (
                                  <span className="text-foreground/80 font-medium px-1.5 py-0.2 bg-muted/60 rounded border border-border/50">
                                    {currentSub}
                                  </span>
                                )}
                              </p>
                            </div>
                          </div>

                          <div className="flex items-center gap-2 shrink-0 flex-wrap">
                            {/* Selector de Categoría Principal */}
                            <select
                              value={currentCat}
                              onChange={(e) => handleSetCategory(appName, e.target.value, null)}
                              className="text-xs font-bold px-2.5 py-1.5 rounded-lg bg-card border border-border focus:outline-none focus:ring-2 focus:ring-violet-500 text-foreground cursor-pointer max-w-[160px]"
                              title="Categoría Principal"
                            >
                              {categories.map((cat) => (
                                <option key={cat.id} value={cat.id}>
                                  {cat.label}
                                </option>
                              ))}
                            </select>

                            {/* Selector de Subcategoría Dependiente */}
                            {availableSubcats.length > 0 && (
                              <select
                                value={currentSub || ""}
                                onChange={(e) => handleSetCategory(appName, currentCat, e.target.value || null)}
                                className="text-xs font-medium px-2 py-1.5 rounded-lg bg-card border border-border focus:outline-none focus:ring-2 focus:ring-violet-500 text-foreground cursor-pointer max-w-[150px]"
                                title="Subcategoría"
                              >
                                <option value="">(Sin subcategoría)</option>
                                {availableSubcats.map((sub) => (
                                  <option key={sub} value={sub}>
                                    {sub}
                                  </option>
                                ))}
                              </select>
                            )}

                            {isManual && (
                              <button
                                onClick={() => handleSetCategory(appName, null, null)}
                                title="Restablecer a automático"
                                className="p-1.5 rounded-lg hover:bg-muted text-muted-foreground hover:text-amber-400 transition-colors cursor-pointer"
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

            {/* CONTENIDO PESTAÑA 2: CRUD DE CATEGORÍAS (AGREGAR / EDITAR / ELIMINAR Y SUBCATEGORÍAS) */}
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
                        className="text-xs text-muted-foreground hover:text-foreground cursor-pointer"
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

                    {/* Subcategorías de la Categoría en el Formulario */}
                    <div className="space-y-1.5 pt-1 border-t border-border/40">
                      <div className="flex items-center justify-between">
                        <label className="text-[11px] font-semibold text-muted-foreground block">
                          Subcategorías ({formCatSubcategories.length})
                        </label>
                        <span className="text-[10px] text-muted-foreground">Escriba y presione Enter</span>
                      </div>

                      {formCatSubcategories.length > 0 && (
                        <div className="flex flex-wrap gap-1.5 p-2 rounded-lg bg-card/60 border border-border/50 max-h-28 overflow-y-auto">
                          {formCatSubcategories.map((sub, sIdx) => {
                            const isMan = /\(manual\)/i.test(sub);
                            const clean = sub.replace(/\s*\(manual\)/i, "").trim();
                            return (
                              <span
                                key={sIdx}
                                className={`inline-flex items-center gap-1.5 text-xs font-medium px-2 py-1 rounded-lg border transition-all animate-in fade-in duration-100 ${
                                  isMan
                                    ? "bg-amber-500/15 border-amber-500/30 text-amber-300"
                                    : "bg-violet-500/15 border-violet-500/30 text-violet-300"
                                }`}
                              >
                                <span className="font-medium">{clean}</span>
                                <button
                                  type="button"
                                  onClick={() => {
                                    const toggled = isMan ? clean : `${clean} (MANUAL)`;
                                    const updated = [...formCatSubcategories];
                                    updated[sIdx] = toggled;
                                    setFormCatSubcategories(updated);
                                  }}
                                  className={`px-1.5 py-0.5 rounded text-[9px] font-bold uppercase transition-all cursor-pointer ${
                                    isMan
                                      ? "bg-amber-500/20 text-amber-300 border border-amber-500/40 hover:bg-amber-500/30"
                                      : "bg-muted text-muted-foreground hover:text-foreground border border-border/40"
                                  }`}
                                  title={isMan ? "Configurada como labor manual. Click para cambiar a digital/PC." : "Configurada como digital/PC. Click para marcar como labor manual."}
                                >
                                  {isMan ? "🛠 Manual" : "💻 PC"}
                                </button>
                                <button
                                  type="button"
                                  onClick={() => setFormCatSubcategories(formCatSubcategories.filter((_, i) => i !== sIdx))}
                                  className="text-muted-foreground hover:text-rose-400 transition-colors p-0.5 cursor-pointer ml-0.5"
                                  title="Quitar subcategoría"
                                >
                                  <X className="h-3 w-3" />
                                </button>
                              </span>
                            );
                          })}
                        </div>
                      )}

                      <div className="flex gap-2 items-center">
                        <input
                          type="text"
                          value={newSubcatInput}
                          onChange={(e) => setNewSubcatInput(e.target.value)}
                          onKeyDown={(e) => {
                            if (e.key === "Enter") {
                              e.preventDefault();
                              let trimmed = newSubcatInput.trim();
                              if (trimmed) {
                                if (formSubcatIsManual && !/\(manual\)/i.test(trimmed)) {
                                  trimmed = `${trimmed} (MANUAL)`;
                                }
                                if (!formCatSubcategories.includes(trimmed)) {
                                  setFormCatSubcategories([...formCatSubcategories, trimmed]);
                                  setNewSubcatInput("");
                                  setFormSubcatIsManual(false);
                                }
                              }
                            }
                          }}
                          placeholder="Nueva subcategoría (ej: Diagnóstico, Calidad)..."
                          className="flex-1 px-3 py-1.5 text-xs rounded-lg bg-card border border-border focus:outline-none focus:ring-2 focus:ring-violet-500 text-foreground"
                        />
                        <label className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground cursor-pointer select-none px-1 shrink-0">
                          <input
                            type="checkbox"
                            checked={formSubcatIsManual}
                            onChange={(e) => setFormSubcatIsManual(e.target.checked)}
                            className="rounded border-border accent-amber-500 h-3.5 w-3.5 cursor-pointer"
                          />
                          <span className={formSubcatIsManual ? "text-amber-400 font-bold" : ""}>Manual</span>
                        </label>
                        <button
                          type="button"
                          onClick={() => {
                            let trimmed = newSubcatInput.trim();
                            if (trimmed) {
                              if (formSubcatIsManual && !/\(manual\)/i.test(trimmed)) {
                                trimmed = `${trimmed} (MANUAL)`;
                              }
                              if (!formCatSubcategories.includes(trimmed)) {
                                setFormCatSubcategories([...formCatSubcategories, trimmed]);
                                setNewSubcatInput("");
                                setFormSubcatIsManual(false);
                              }
                            }
                          }}
                          disabled={!newSubcatInput.trim()}
                          className="px-3 py-1.5 text-xs font-semibold rounded-lg bg-muted hover:bg-muted/80 text-foreground disabled:opacity-40 cursor-pointer shrink-0"
                        >
                          + Añadir
                        </button>
                      </div>
                    </div>

                    <div className="pt-2 flex justify-end gap-2">
                      <button
                        onClick={() => { setIsCreatingNew(false); setEditingCategory(null); }}
                        className="px-3 py-1.5 text-xs font-semibold rounded-lg bg-muted text-muted-foreground hover:text-foreground cursor-pointer"
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
                      Administre las categorías y subcategorías operativas del taller
                    </p>
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
                      className="px-3 py-1.5 text-xs font-bold rounded-lg bg-violet-600 hover:bg-violet-700 text-white flex items-center gap-1.5 shadow-sm transition-all cursor-pointer"
                    >
                      <Plus className="h-3.5 w-3.5" />
                      <span>Nueva Categoría</span>
                    </button>
                  </div>
                )}

                {/* Lista de Categorías Existentes con sus Subcategorías */}
                <div className="flex-1 overflow-y-auto space-y-2 pr-1 min-h-[220px] max-h-[340px]">
                  {categories.map((cat) => (
                    <div
                      key={cat.id}
                      className="p-3 rounded-xl bg-muted/20 border border-border/50 space-y-2 hover:bg-muted/30 transition-colors"
                    >
                      <div className="flex items-center justify-between gap-3">
                        <div className="flex items-center gap-2.5">
                          <div className={`p-1.5 rounded-lg border ${cat.color}`}>
                            {renderCategoryIcon(cat.iconName, "h-4 w-4")}
                          </div>
                          <div>
                            <div className="flex items-center gap-2 flex-wrap">
                              <span className="font-bold text-xs text-foreground">{cat.label}</span>
                              <span className="text-[10px] px-1.5 py-0.5 rounded bg-muted/80 text-muted-foreground font-mono">
                                {cat.subcategories?.length || 0} subcat.
                              </span>
                              <button
                                type="button"
                                onClick={() => handleToggleCategoryManual(cat.id)}
                                className={`px-2 py-0.5 rounded-full text-[10px] font-bold transition-all cursor-pointer flex items-center gap-1 ${
                                  cat.is_manual
                                    ? "bg-amber-500/20 text-amber-300 border border-amber-500/40 hover:bg-amber-500/30"
                                    : "bg-muted/60 text-muted-foreground hover:text-foreground border border-border/40"
                                }`}
                                title={
                                  cat.is_manual
                                    ? "Toda la categoría está configurada como manual (aparece en Labores Manuales). Clic para desmarcar."
                                    : "Clic para marcar toda la categoría como manual (todos sus botones van a la barra lateral)."
                                }
                              >
                                {cat.is_manual ? "🛠 Manual (Completa)" : "💻 Digital / PC"}
                              </button>
                            </div>
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
                              setFormCatSubcategories(cat.subcategories ? [...cat.subcategories] : []);
                              setNewSubcatInput("");
                            }}
                            className="p-1.5 rounded-lg hover:bg-muted text-muted-foreground hover:text-violet-300 transition-colors cursor-pointer"
                            title="Editar nombre, color, icono y subcategorías"
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

                      {/* Subcategorías de la categoría con botón para agregar/eliminar en vivo */}
                      <div className="pt-2 border-t border-border/30">
                        <div className="flex flex-wrap items-center gap-1.5">
                          {(cat.subcategories || []).map((sub) => {
                            const isManual = /\(manual\)/i.test(sub) || !!cat.is_manual;
                            const cleanName = sub.replace(/\s*\(manual\)/i, "").trim();
                            const isExpanded = expandedManualSubcat === `${cat.id}::${sub}`;

                            const isSoftwareOrUrl = (name: string) => {
                              const n = name.trim().toLowerCase();
                              if (n.startsWith("http://") || n.startsWith("https://") || n.startsWith("web:") || n.startsWith("web.")) return true;
                              if (n.includes(".") && !n.endsWith(".exe") && (n.includes(".com") || n.includes(".org") || n.includes(".net") || n.includes(".io") || n.includes(".app") || n.includes(".co") || n.includes(".es") || n.includes(".la"))) {
                                return true;
                              }
                              if (n.endsWith(".exe") || n.endsWith(".dll") || n.endsWith(".bat")) return true;
                              if (["odoo erp", "nextime pro", "linkus", "seka chat", "whatsapp", "anydesk", "teamviewer", "chrome", "firefox", "edge", "explorer"].some(soft => n.includes(soft))) {
                                return true;
                              }
                              return false;
                            };

                            const associatedManualTasks = isManual
                              ? Object.entries(customCategories)
                                  .filter(([appName, val]) => {
                                    const valCat = typeof val === "object" ? val?.category : val;
                                    const valSub = typeof val === "object" ? val?.subcategory : null;
                                    const catMatches = valCat === cat.id || valCat === cat.label;
                                    if (!catMatches) return false;
                                    const cleanValSub = (valSub || "").replace(/\s*\(manual\)\s*/i, "").trim();
                                    const subMatches = valSub === sub || cleanValSub.toLowerCase() === cleanName.toLowerCase();
                                    if (!subMatches) return false;
                                    return !isSoftwareOrUrl(appName);
                                  })
                                  .map(([appName]) => appName.trim())
                              : [];

                            return (
                              <span
                                key={sub}
                                className={`inline-flex items-center gap-1.5 text-xs font-medium px-2.5 py-1 rounded-lg border transition-all ${
                                  isManual
                                    ? "bg-amber-500/10 border-amber-500/30 text-amber-300"
                                    : "bg-muted/60 border-border/60 text-foreground"
                                }`}
                              >
                                <span className="font-semibold">{cleanName}</span>
                                <button
                                  type="button"
                                  onClick={() => handleToggleSubcategoryManual(cat.id, sub)}
                                  className={`px-1.5 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider transition-all cursor-pointer flex items-center gap-1 ${
                                    isManual
                                      ? "bg-amber-500/20 text-amber-300 hover:bg-amber-500/30 border border-amber-500/40"
                                      : "bg-muted hover:bg-muted/80 text-muted-foreground hover:text-foreground border border-border/50"
                                  }`}
                                  title={
                                    isManual
                                      ? "Configurada como labor manual (aparece como botón en barra lateral). Clic para cambiar a digital/PC."
                                      : "Configurada como digital/PC. Clic para convertir a labor manual (botón en barra lateral)."
                                  }
                                >
                                  {isManual ? "🛠 Manual" : "💻 PC"}
                                </button>

                                {isManual && (
                                  <button
                                    type="button"
                                    onClick={() => {
                                      const key = `${cat.id}::${sub}`;
                                      setExpandedManualSubcat(isExpanded ? null : key);
                                    }}
                                    className={`px-1.5 py-0.5 rounded text-[10px] font-bold transition-all cursor-pointer flex items-center gap-1 ${
                                      isExpanded
                                        ? "bg-amber-500 text-black shadow-xs"
                                        : "bg-amber-500/20 hover:bg-amber-500/30 text-amber-300 border border-amber-500/30"
                                    }`}
                                    title="Ver / Gestionar labores hijas asociadas que aparecen en la barra lateral"
                                  >
                                    <span>{associatedManualTasks.length} {associatedManualTasks.length === 1 ? "labor" : "labores"}</span>
                                    <ChevronDown className={`h-2.5 w-2.5 transition-transform ${isExpanded ? "rotate-180" : ""}`} />
                                  </button>
                                )}

                                <button
                                  type="button"
                                  onClick={() => handleDeleteSubcategory(cat.id, sub)}
                                  className="text-muted-foreground hover:text-rose-400 transition-colors p-0.5 rounded cursor-pointer ml-0.5"
                                  title={`Eliminar subcategoría "${cleanName}"`}
                                >
                                  <X className="h-3 w-3" />
                                </button>
                              </span>
                            );
                          })}

                          {/* Input inline para agregar subcategoría al instante */}
                          {inlineAddSubcatCatId === cat.id ? (
                            <div className="inline-flex items-center gap-2 p-1 rounded-lg bg-background border border-violet-500/50 shadow-xs">
                              <input
                                type="text"
                                autoFocus
                                value={inlineSubcatValue}
                                onChange={(e) => setInlineSubcatValue(e.target.value)}
                                onKeyDown={(e) => {
                                  if (e.key === "Enter") {
                                    e.preventDefault();
                                    handleAddSubcategory(cat.id, inlineSubcatValue, inlineSubcatIsManual);
                                  } else if (e.key === "Escape") {
                                    setInlineAddSubcatCatId(null);
                                    setInlineSubcatValue("");
                                    setInlineSubcatIsManual(false);
                                  }
                                }}
                                placeholder="Nueva subcategoría..."
                                className="text-xs px-2.5 py-1 rounded bg-muted/30 border border-border focus:outline-none focus:border-violet-500 text-foreground w-40"
                              />
                              <label className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground cursor-pointer select-none px-1">
                                <input
                                  type="checkbox"
                                  checked={inlineSubcatIsManual}
                                  onChange={(e) => setInlineSubcatIsManual(e.target.checked)}
                                  className="rounded border-border accent-amber-500 h-3.5 w-3.5 cursor-pointer"
                                />
                                <span className={inlineSubcatIsManual ? "text-amber-400 font-bold" : ""}>Manual</span>
                              </label>
                              <button
                                type="button"
                                onClick={() => handleAddSubcategory(cat.id, inlineSubcatValue, inlineSubcatIsManual)}
                                className="px-2 py-1 rounded bg-violet-600 hover:bg-violet-700 text-white text-xs font-semibold cursor-pointer flex items-center gap-1"
                                title="Guardar subcategoría"
                              >
                                <Check className="h-3 w-3" />
                                <span>Agregar</span>
                              </button>
                              <button
                                type="button"
                                onClick={() => {
                                  setInlineAddSubcatCatId(null);
                                  setInlineSubcatValue("");
                                  setInlineSubcatIsManual(false);
                                }}
                                className="p-1 rounded hover:bg-muted text-muted-foreground text-xs cursor-pointer"
                                title="Cancelar"
                              >
                                <X className="h-3.5 w-3.5" />
                              </button>
                            </div>
                          ) : (
                            <button
                              type="button"
                              onClick={() => {
                                setInlineAddSubcatCatId(cat.id);
                                setInlineSubcatValue("");
                                setInlineSubcatIsManual(false);
                              }}
                              className="inline-flex items-center gap-1.5 text-xs font-semibold px-2.5 py-1 rounded-lg border border-dashed border-border hover:border-violet-500/60 hover:text-violet-300 text-muted-foreground transition-all cursor-pointer"
                            >
                              <Plus className="h-3 w-3" />
                              <span>Nueva Subcategoría</span>
                            </button>
                          )}
                        </div>

                        {/* Panel expandido para gestionar las labores hijas de la subcategoría manual seleccionada */}
                        {(() => {
                          if (!expandedManualSubcat || !expandedManualSubcat.startsWith(`${cat.id}::`)) return null;
                          const targetSub = expandedManualSubcat.split("::")[1];
                          const targetCleanName = targetSub.replace(/\s*\(manual\)\s*/i, "").trim();

                          const isSoftwareOrUrl = (name: string) => {
                            const n = name.trim().toLowerCase();
                            if (n.startsWith("http://") || n.startsWith("https://") || n.startsWith("web:") || n.startsWith("web.")) return true;
                            if (n.includes(".") && !n.endsWith(".exe") && (n.includes(".com") || n.includes(".org") || n.includes(".net") || n.includes(".io") || n.includes(".app") || n.includes(".co") || n.includes(".es") || n.includes(".la"))) {
                              return true;
                            }
                            if (n.endsWith(".exe") || n.endsWith(".dll") || n.endsWith(".bat")) return true;
                            if (["odoo erp", "nextime pro", "linkus", "seka chat", "whatsapp", "anydesk", "teamviewer", "chrome", "firefox", "edge", "explorer"].some(soft => n.includes(soft))) {
                              return true;
                            }
                            return false;
                          };

                          const currentTasks = Object.entries(customCategories)
                            .filter(([appName, val]) => {
                              const valCat = typeof val === "object" ? val?.category : val;
                              const valSub = typeof val === "object" ? val?.subcategory : null;
                              const catMatches = valCat === cat.id || valCat === cat.label;
                              if (!catMatches) return false;
                              const cleanValSub = (valSub || "").replace(/\s*\(manual\)\s*/i, "").trim();
                              const subMatches = valSub === targetSub || cleanValSub.toLowerCase() === targetCleanName.toLowerCase();
                              if (!subMatches) return false;
                              return !isSoftwareOrUrl(appName);
                            })
                            .map(([appName]) => appName.trim());

                          return (
                            <div className="w-full mt-2.5 p-3 rounded-xl bg-amber-950/20 border border-amber-500/40 space-y-2.5 animate-in fade-in duration-150">
                              <div className="flex items-center justify-between">
                                <div className="flex items-center gap-1.5 text-xs font-bold text-amber-300">
                                  <Wrench className="h-3.5 w-3.5 text-amber-400 shrink-0" />
                                  <span>Labores en barra lateral para &ldquo;{targetCleanName}&rdquo; ({currentTasks.length})</span>
                                </div>
                                <button
                                  type="button"
                                  onClick={() => setExpandedManualSubcat(null)}
                                  className="text-muted-foreground hover:text-foreground text-xs p-1 rounded-md hover:bg-muted cursor-pointer"
                                  title="Cerrar panel de labores"
                                >
                                  <X className="h-3 w-3" />
                                </button>
                              </div>

                              <p className="text-[11px] text-muted-foreground">
                                Estas labores aparecerán directamente como botones en la sección &ldquo;Labores Manuales&rdquo; de la barra lateral para pausar el auto-tracking de pantalla.
                              </p>

                              <div className="flex flex-wrap items-center gap-1.5 pt-1">
                                {currentTasks.map((tName) => (
                                  <span
                                    key={tName}
                                    className="inline-flex items-center gap-1.5 text-xs font-semibold px-2.5 py-1 rounded-lg bg-amber-500/15 border border-amber-500/40 text-amber-200"
                                  >
                                    <span>{tName}</span>
                                    <button
                                      type="button"
                                      onClick={() => handleSetCategory(tName, null, null)}
                                      className="text-amber-400 hover:text-rose-400 p-0.5 rounded cursor-pointer"
                                      title={`Desvincular labor "${tName}"`}
                                    >
                                      <X className="h-3 w-3" />
                                    </button>
                                  </span>
                                ))}
                                {currentTasks.length === 0 && (
                                  <p className="text-xs text-amber-300/70 italic py-1">
                                    Sin labores específicas asociadas. Actualmente se mostrará el botón directo &ldquo;{targetCleanName}&rdquo;.
                                  </p>
                                )}
                              </div>

                              <div className="flex items-center gap-2 pt-1">
                                <input
                                  type="text"
                                  value={newManualTaskInput}
                                  onChange={(e) => setNewManualTaskInput(e.target.value)}
                                  onKeyDown={(e) => {
                                    if (e.key === "Enter" && newManualTaskInput.trim()) {
                                      e.preventDefault();
                                      handleSetCategory(newManualTaskInput.trim(), cat.id, targetSub);
                                      setNewManualTaskInput("");
                                    }
                                  }}
                                  placeholder={`Añadir labor para "${targetCleanName}" (ej: Entrega de Equipos, Firma de Actas)...`}
                                  className="text-xs px-3 py-1.5 rounded-lg bg-background border border-border focus:outline-none focus:border-amber-500 text-foreground flex-1"
                                />
                                <button
                                  type="button"
                                  onClick={() => {
                                    if (newManualTaskInput.trim()) {
                                      handleSetCategory(newManualTaskInput.trim(), cat.id, targetSub);
                                      setNewManualTaskInput("");
                                    }
                                  }}
                                  disabled={!newManualTaskInput.trim()}
                                  className="px-3 py-1.5 rounded-lg bg-amber-600 hover:bg-amber-700 text-white text-xs font-bold disabled:opacity-40 cursor-pointer flex items-center gap-1"
                                >
                                  <Plus className="h-3.5 w-3.5" />
                                  <span>Añadir Labor</span>
                                </button>
                              </div>
                            </div>
                          );
                        })()}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Footer */}
            <div className="border-t border-border/50 pt-3 flex items-center justify-between text-xs">
              {activeModalTab === "tree" ? (
                <span className="text-muted-foreground">
                  Vista de árbol: 6 categorías operativas oficiales del taller
                </span>
              ) : activeModalTab === "apps" ? (
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
          </div>
        </div>
      )}
    </div>
  );
}

export const ActivityAppsRanking = React.memo(ActivityAppsRankingComponent);
