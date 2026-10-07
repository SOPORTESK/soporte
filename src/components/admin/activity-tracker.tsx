"use client";

import React, { useState, useEffect, useCallback } from "react";
import { toast } from "sonner";
import {
  Activity,
  Clock,
  TrendingUp,
  BarChart3,
  RefreshCw,
  Settings,
  Mail,
  MessageSquare,
  Wrench,
  FolderOpen,
  AlertCircle,
  Bot,
  Eye,
  Phone,
  Headphones,
  Trash2,
  Pencil,
  ShieldCheck,
  Code,
  Camera,
  Flame,
  Monitor,
  Sparkles,
  Calendar,
  Users,
  Filter,
  Search,
  CheckCircle2,
  ChevronRight,
  Laptop,
  Package,
  LayoutDashboard,
  ClipboardList,
  UserPlus,
  Briefcase,
  GraduationCap,
  Sandwich,
  Bath,
  LogIn,
  LogOut,
  XCircle,
  X,
  SlidersHorizontal,
  FolderTree,
} from "lucide-react";
import { Toilet } from "./manual-tasks-manager-modal";
import { Avatar } from "@/components/ui/avatar";
import { ActivityLivePulse, type LiveAgent } from "./activity-live-pulse";
import { ActivityHeatmap } from "./activity-heatmap";
import { ActivityAppsRanking, DEFAULT_CATEGORIES } from "./activity-apps-ranking";
import { ActivityScreenGallery } from "./activity-screen-gallery";
import { ActivityAiBriefing } from "./activity-ai-briefing";
import { ActivityAnalyticsTab } from "./activity-analytics-tab";
import { computeUnifiedActivityMetrics, extractCleanItemName } from "@/lib/activity-engine";

interface TimelineEntry {
  id: number;
  agent_email: string;
  agent_name: string;
  action: string;
  category: string;
  case_id: string | null;
  metadata: Record<string, any> | null;
  duration_ms: number | null;
  created_at: string;
}

interface Props {
  agentEmail?: string;
  agentName?: string;
  isAdmin?: boolean;
}

const CATEGORY_ICONS: Record<string, any> = {
  "Soporte": Headphones,
  "Servicio de Taller": Wrench,
  "Control Administrativo": TrendingUp,
  "Gestión del Taller": Package,
  "Gestión de Residuos": Trash2,
  "On-the-Job Training (OJT)": GraduationCap,
  "Soporte Telefónico": Phone,
  "Soporte Mensajería": MessageSquare,
  "Atención telefónica": Phone,
  "Atención por llamada": Phone,
  "Mensajería": MessageSquare,
  "Atención chat": MessageSquare,
  "Atención de tickets": FolderOpen,
  "Atención de Tickets": FolderOpen,
  "Trámites de garantías": ShieldCheck,
  "Gestión de Garantías": ShieldCheck,
  "Investigación y desarrollo": Code,
  "Optimización de procesos": Code,
  "Control administrativo": TrendingUp,
  "Gestión de correos": Mail,
  "Gestión de Correos": Mail,
  "Gestión de casos": FolderOpen,
  "Escalado": AlertCircle,
  "Asistente IA": Bot,
  "Inactividad": Clock,
  "Navegación": Eye,
  "Actividad general": Activity,
  "Soporte técnico": Wrench,
  "Labores manuales": Package,
  "Tiempo de descanso": Sandwich,
  "Pausa personal": Toilet,
  "Pausa Sanitaria": Toilet,
  "Atención presencial": UserPlus,
  "Inventario": ClipboardList,
  "Mantenimiento": Sparkles,
  "Soporte comercial": Briefcase,
  "Capacitación": GraduationCap,
  "Reunión interna": Users,
  "Justificación": ClipboardList,
  "Utilidades": SlidersHorizontal,
  "Descansos": Sandwich,
  "Sin Clasificar": FolderTree,
  "Otros": Activity,
};

const CATEGORY_COLORS: Record<string, string> = {
  "Soporte": "text-emerald-400 bg-emerald-500/10 border-emerald-500/20",
  "Servicio de Taller": "text-amber-400 bg-amber-500/10 border-amber-500/20",
  "Control Administrativo": "text-blue-400 bg-blue-500/10 border-blue-500/20",
  "Gestión del Taller": "text-indigo-400 bg-indigo-500/10 border-indigo-500/20",
  "Gestión de Residuos": "text-rose-400 bg-rose-500/10 border-rose-500/20",
  "On-the-Job Training (OJT)": "text-violet-400 bg-violet-500/10 border-violet-500/20",
  "Utilidades": "text-slate-400 bg-slate-500/10 border-slate-500/20",
  "Descansos": "text-amber-400 bg-amber-500/10 border-amber-500/20",
  "Pausa Sanitaria": "text-emerald-400 bg-emerald-500/10 border-emerald-500/20",
  "Sin Clasificar": "text-zinc-400 bg-zinc-500/10 border-zinc-500/20",
  "Soporte Telefónico": "text-orange-400 bg-orange-500/10 border-orange-500/20",
  "Soporte Mensajería": "text-emerald-400 bg-emerald-500/10 border-emerald-500/20",
  "Atención telefónica": "text-orange-400 bg-orange-500/10 border-orange-500/20",
  "Atención por llamada": "text-orange-400 bg-orange-500/10 border-orange-500/20",
  "Mensajería": "text-emerald-400 bg-emerald-500/10 border-emerald-500/20",
  "Atención chat": "text-emerald-400 bg-emerald-500/10 border-emerald-500/20",
  "Atención de tickets": "text-blue-400 bg-blue-500/10 border-blue-500/20",
  "Atención de Tickets": "text-indigo-400 bg-indigo-500/10 border-indigo-500/20",
  "Trámites de garantías": "text-purple-400 bg-purple-500/10 border-purple-500/20",
  "Gestión de Garantías": "text-amber-400 bg-amber-500/10 border-amber-500/20",
  "Investigación y desarrollo": "text-cyan-400 bg-cyan-500/10 border-cyan-500/20",
  "Optimización de procesos": "text-violet-400 bg-violet-500/10 border-violet-500/20",
  "Control administrativo": "text-fuchsia-400 bg-fuchsia-500/10 border-fuchsia-500/20",
  "Gestión de correos": "text-yellow-400 bg-yellow-500/10 border-yellow-500/20",
  "Gestión de Correos": "text-blue-400 bg-blue-500/10 border-blue-500/20",
  "Gestión de casos": "text-emerald-400 bg-emerald-500/10 border-emerald-500/20",
  "Escalado": "text-red-400 bg-red-500/10 border-red-500/20",
  "Asistente IA": "text-cyan-400 bg-cyan-500/10 border-cyan-500/20",
  "Inactividad": "text-zinc-400 bg-zinc-500/10 border-zinc-500/20",
  "Navegación": "text-sky-400 bg-sky-500/10 border-sky-500/20",
  "Actividad general": "text-slate-400 bg-slate-500/10 border-slate-500/20",
  "Soporte técnico": "text-cyan-400 bg-cyan-500/10 border-cyan-500/20",
  "Labores manuales": "text-amber-400 bg-amber-500/10 border-amber-500/20",
  "Tiempo de descanso": "text-amber-400 bg-amber-500/10 border-amber-500/20",
  "Pausa personal": "text-sky-400 bg-sky-500/10 border-sky-500/20",
  "Atención presencial": "text-sky-400 bg-sky-500/10 border-sky-500/20",
  "Inventario": "text-indigo-400 bg-indigo-500/10 border-indigo-500/20",
  "Mantenimiento": "text-cyan-400 bg-cyan-500/10 border-cyan-500/20",
  "Soporte comercial": "text-blue-400 bg-blue-500/10 border-blue-500/20",
  "Capacitación": "text-violet-400 bg-violet-500/10 border-violet-500/20",
  "Reunión interna": "text-indigo-400 bg-indigo-500/10 border-indigo-500/20",
  "Justificación": "text-pink-400 bg-pink-500/10 border-pink-500/20",
  "Otros": "text-slate-400 bg-slate-500/10 border-slate-500/20",
};

function formatTime(ts: string): string {
  if (!ts) return "";
  const d = new Date(ts);
  if (isNaN(d.getTime())) return "";
  return d.toLocaleTimeString("es-CR", { hour: "2-digit", minute: "2-digit", second: "2-digit" });
}

function formatDuration(ms: number | null): string {
  if (!ms) return "";
  const totalSec = Math.round(ms / 1000);
  if (totalSec < 60) return `${totalSec}s`;
  const m = Math.floor(totalSec / 60);
  const s = totalSec % 60;
  if (m < 60) return `${m}m ${s}s`;
  const h = Math.floor(m / 60);
  const remM = m % 60;
  return `${h}h ${remM}m`;
}

function cleanExecutiveTitle(title: string): string {
  if (!title) return "";
  return title
    .replace(/\s*[-–—]\s*(Brave|Google Chrome|Microsoft Edge|Firefox|Opera|Outlook|Visual Studio Code).*$/i, "")
    .replace(/^\(\d+\)\s*/, "")
    .replace(/\.exe/gi, "")
    .replace(/atenci[óo]n/gi, "atención")
    .replace(/garant[íi]a/gi, "garantía")
    .replace(/gesti[óo]n/gi, "gestión")
    .replace(/operaci[óo]n/gi, "operación")
    .replace(/\uFFFD/g, "ó")
    .trim();
}

function formatExecutiveDisplay(rawAction: string, category: string, meta: Record<string, any> = {}): { title: string; subtitle?: string } {
  let action = rawAction || "";
  const rawTitle = meta.title || meta.context || "";
  const cleanTitle = cleanExecutiveTitle(rawTitle);

  // Limpiar cualquier residuo de duración en paréntesis del título original (ej: (5 min), (21min 8s), (1h 10m))
  action = action.replace(/\s*\(\d+(?:\s*(?:s|seg|segundos|m|min|minutos|h|horas))?(?:\s*\d+(?:\s*(?:s|seg|segundos))?)?\)/gi, "").trim();

  const lower = action.toLowerCase();
  const titleLower = cleanTitle.toLowerCase();
  const appLower = (meta.app || meta.app_name || "").toLowerCase();

  // 1. Entornos de desarrollo, programación y herramientas técnicas (Antigravity, Cursor, VS Code, Terminal, Devin)
  const isDevTool =
    appLower.includes("antigravity") ||
    appLower.includes("cursor") ||
    appLower.includes("windsurf") ||
    appLower.includes("code") ||
    appLower.includes("devin") ||
    appLower.includes("visual studio") ||
    appLower.includes("terminal") ||
    category === "Investigación y desarrollo" ||
    lower.includes("antigravity");

  if (isDevTool) {
    return {
      title: "Optimización, programación y desarrollo de software y sistemas técnicos",
      subtitle: cleanTitle ? `${meta.app || "Entorno de desarrollo"}: ${cleanTitle}` : "Herramientas de ingeniería y desarrollo",
    };
  }

  // 2. Videovigilancia y CCTV (iVMS-4200, SADP, Hik-Partner)
  if (lower.includes("ivms") || titleLower.includes("ivms") || appLower.includes("ivms") || lower.includes("sadp") || lower.includes("hik-partner")) {
    return {
      title: "Monitoreo de sistemas de videovigilancia y gestión de cámaras mediante iVMS-4200 / SADP",
      subtitle: cleanTitle || "Configuración y verificación de dispositivos CCTV",
    };
  }

  // 3. Captura de evidencia (Herramienta de Recortes / SnippingTool)
  if (lower.includes("snipping") || lower.includes("recorte") || titleLower.includes("recorte") || appLower.includes("snipping")) {
    return {
      title: "Uso de la herramienta de recortes para captura y documentación de evidencia técnica",
      subtitle: cleanTitle || "Documentación visual para caso de soporte",
    };
  }

  // 4. Control de asistencia y marcas (Nextime, BioTime, ZKTime)
  if (lower.includes("nextime") || lower.includes("biotime") || lower.includes("zktime") || titleLower.includes("nextime") || titleLower.includes("biotime") || lower.includes("bitacora-automatica")) {
    return {
      title: "Consulta y gestión de registros de asistencia de personal en plataforma de control horario",
      subtitle: cleanTitle || "Sistema de marcas y control horario",
    };
  }

  // 4.1 Inicio y Cierre de Sesión oficial
  if (lower.includes("inicio de sesión") || lower.includes("inició sesión") || meta.type === "auth_login") {
    return {
      title: "🟢 Inicio de sesión en el sistema (Entrada de jornada)",
      subtitle: meta.timestamp ? `Hora de registro: ${formatTime(meta.timestamp)}` : "Apertura de sesión del colaborador",
    };
  }
  if (lower.includes("cierre de sesión") || lower.includes("cerró sesión") || meta.type === "auth_logout") {
    return {
      title: "🔴 Cierre de sesión del sistema (Salida de jornada)",
      subtitle: meta.timestamp ? `Hora de registro: ${formatTime(meta.timestamp)}` : "Cierre voluntario de sesión",
    };
  }

  // 5. Atención y tickets en Odoo ERP
  if (lower.includes("odoo") || titleLower.includes("odoo") || appLower.includes("odoo")) {
    const caseMatch = action.match(/#(\d+)/) || cleanTitle.match(/#(\d+)/);
    const num = caseMatch ? ` #${caseMatch[1]}` : "";
    return {
      title: `Atención, seguimiento y resolución de tickets en portal Odoo ERP${num}`,
      subtitle: cleanTitle ? `Detalle: ${cleanTitle}` : "Gestión de soporte técnico y órdenes",
    };
  }

  // 6. Mensajería y Chat (WhatsApp, Sekunet Chat)
  if (lower.includes("whatsapp") || titleLower.includes("whatsapp") || appLower.includes("whatsapp")) {
    return {
      title: "Atención y comunicación con usuarios o equipo de trabajo a través de la aplicación de mensajería WhatsApp",
      subtitle: cleanTitle ? `Contacto / Chat: ${cleanTitle}` : "Canal de mensajería",
    };
  }
  if (lower.includes("seka chat") || lower.includes("chat sekunet") || appLower.includes("seka") || lower.includes("evolution api") || lower.includes("evolution-api")) {
    return {
      title: "Atención al cliente y soporte técnico mediante plataforma Sekunet Chat",
      subtitle: cleanTitle || "Gestión de mensajería omnicanal de soporte",
    };
  }

  // 7. Redes y Equipos (MikroTik, Winbox, UniFi, GNS3)
  if (lower.includes("winbox") || lower.includes("mikrotik") || lower.includes("unifi") || lower.includes("gns3")) {
    return {
      title: "Administración, diagnóstico y configuración de infraestructura de red y telecomunicaciones",
      subtitle: cleanTitle || "Gestión de equipos de red y enlaces",
    };
  }

  // 8. Trámites de Garantías y RMA (Tienda 3D)
  if (lower.includes("tienda 3d") || lower.includes("tienda3d") || lower.includes("garant") || lower.includes("rma")) {
    return {
      title: "Gestión y tramitación de garantías técnicas y recepción de equipos RMA en Tienda 3D",
      subtitle: cleanTitle || "Servicio técnico y trámite de garantías",
    };
  }

  // 9. Correo electrónico (Outlook)
  if (lower.includes("outlook") || lower.includes("correo") || appLower.includes("outlook")) {
    return {
      title: "Gestión de mensajería electrónica y correspondencia corporativa en Outlook",
      subtitle: cleanTitle ? `Asunto: ${cleanTitle}` : "Bandeja de entrada corporativa",
    };
  }

  // 10. Documentos de oficina (Word, Excel, PDF)
  if (lower.includes("excel") || appLower.includes("excel") || lower.includes("antenas.xlsx")) {
    return {
      title: "Control administrativo, análisis y elaboración de hojas de cálculo en Microsoft Excel",
      subtitle: cleanTitle ? `Archivo: ${cleanTitle}` : "Registro de datos y control administrativo",
    };
  }
  if (lower.includes("word") || appLower.includes("word") || lower.includes(".docx")) {
    return {
      title: "Redacción, revisión y edición de informes técnicos y documentación en Microsoft Word",
      subtitle: cleanTitle ? `Documento: ${cleanTitle}` : "Elaboración de informe técnico",
    };
  }

  // 12. Páginas internas de la plataforma
  if (action.includes("Permaneció en") || action.includes("Reanudó labores tras")) {
    const isResume = action.includes("Reanudó labores");
    const prefix = isResume ? "Reanudó labores en" : "Sesión activa en";
    if (lower.includes("mi-gestion") || lower.includes("mi bandeja de gestión")) {
      return { title: `${prefix} portal de atención técnica y bandeja de gestión de casos` };
    }
    if (lower.includes("admin") || lower.includes("panel admin") || lower.includes("activity tracker")) {
      return { title: `${prefix} suite de supervisión, auditoría y control de actividades` };
    }
    if (lower.includes("soporte-avanzado") || lower.includes("soporte avanzado")) {
      return { title: `${prefix} panel de soporte avanzado (Nivel 2) y resolución especializada` };
    }
  }

  // 13. Labores manuales y físicas en taller
  if (
    meta.manual ||
    meta.task ||
    lower.startsWith("inició:") ||
    lower.startsWith("inicio:") ||
    lower.startsWith("terminó:") ||
    lower.startsWith("termino:")
  ) {
    const taskName = meta.task || meta.label || action.replace(/^inici[oó]:\s*|^termin[oó]:\s*/i, "").split("(")[0].trim();
    const isStart = lower.startsWith("inició:") || lower.startsWith("inicio:");
    return {
      title: isStart ? `Inicio de labor física: ${taskName}` : `Labor física en taller: ${taskName}`,
      subtitle: meta.duration_seconds
        ? `Duración registrada: ${Math.round(meta.duration_seconds / 60)} min`
        : "Registro de actividad manual en taller",
    };
  }

  // 14. Justificaciones de tiempo presencial / manual
  if (
    meta.justification ||
    category === "Justificación Manual" ||
    lower.startsWith("justificación manual:") ||
    lower.startsWith("justificacion manual:") ||
    lower.startsWith("justificación:") ||
    lower.startsWith("justificacion:")
  ) {
    const reason = meta.reason || action.replace(/^justificaci[oó]n(\s+manual)?:\s*/i, "").split("(")[0].trim();
    return {
      title: `Justificación Manual: ${reason}`,
      subtitle: meta.minutes ? `Tiempo justificado: ${meta.minutes} min` : (meta.time_range ? `Lapso: ${meta.time_range}` : "Justificación de labor manual"),
    };
  }

  // 15. Inactividad
  if (category === "Inactividad" || lower.includes("sin actividad") || lower.includes("pausa prolongada") || lower.includes("bloqueada")) {
    return {
      title: "Inactividad",
      subtitle: cleanTitle ? `Última aplicación en pantalla: ${cleanTitle}` : "Período sin interacción en la estación",
    };
  }

  // 16. Formato estructurado preexistente o títulos sueltos (limpieza narrativa final)
  if (action.includes(":")) {
    const parts = action.split(":");
    const prefix = parts[0].trim();
    const detail = parts.slice(1).join(":").trim();
    return {
      title: `${prefix}: ${cleanExecutiveTitle(detail)}`,
      subtitle: cleanTitle && cleanTitle !== action ? cleanTitle : undefined,
    };
  }

  return { title: action, subtitle: cleanTitle && cleanTitle !== action ? cleanTitle : undefined };
}

export function isManualEntry(entry?: { action?: string; category?: string; metadata?: any } | null): boolean {
  if (!entry) return false;
  const meta = (entry.metadata || {}) as Record<string, any>;
  const act = (entry.action || "").toLowerCase().trim();
  const cat = (entry.category || "").toLowerCase().trim();

  return Boolean(
    meta.manual ||
    meta.task ||
    meta.justification ||
    act.startsWith("inició:") ||
    act.startsWith("inicio:") ||
    act.startsWith("terminó:") ||
    act.startsWith("termino:") ||
    act.startsWith("justificación:") ||
    act.startsWith("justificacion:") ||
    cat === "labores manuales" ||
    cat === "capacitación" ||
    cat === "capacitacion" ||
    cat === "tiempo de descanso" ||
    cat === "pausa personal" ||
    cat === "reunión interna" ||
    cat === "reunion interna" ||
    cat === "atención presencial" ||
    cat === "atencion presencial" ||
    cat === "mantenimiento" ||
    cat === "inventario"
  );
}

// ─── CONSOLIDADOR NARRATIVO CADA 5 MINUTOS ──────────────────────────────────────
interface ConsolidatedBlock {
  id: string;
  startTime: string; // ej: 09:15 a. m.
  endTime: string;   // ej: 09:20 a. m.
  narrative: string;
  category: string;
  totalDurationMs: number;
  apps: string[];
  eventCount: number;
  manualTask?: string | null;
}

function buildConsolidatedNarrative(items: TimelineEntry[]): string {
  if (!items.length) return "";

  // 1. PRIORIDAD ABSOLUTA: Si hay una labor manual/física, se pausan e ignoran los demás logs en el informe
  for (const item of items) {
    const meta = (item.metadata || {}) as Record<string, any>;
    const action = (item.action || "").toLowerCase();
    const taskName = meta.task || meta.label || item.action.replace(/^inici[oó]:\s*|^termin[oó]:\s*|^justificaci[oó]n:\s*/i, "").split("(")[0].trim();
    const raw = `${action} ${taskName.toLowerCase()} ${(meta.app || "").toLowerCase()}`;

    if (raw.includes("capacita") || item.category === "Capacitación") {
      return `Sesión de capacitación e inducción técnica: ${taskName || "Capacitación de Personal"}.`;
    }
    if (raw.includes("bodega")) {
      return `Labores manuales en bodega y despacho de repuestos o equipos.`;
    }
    if (raw.includes("ventanilla") || raw.includes("mostrador")) {
      return `Atención presencial a clientes en mostrador y ventanilla.`;
    }
    if (raw.includes("diagnóstic") || raw.includes("diagnostico")) {
      return `Diagnóstico físico, inspección técnica y banco de pruebas de taller.`;
    }
    if (raw.includes("soporte a ventas") || raw.includes("soporte ventas")) {
      return `Soporte técnico y asesoramiento comercial al equipo de ventas.`;
    }
    if (raw.includes("descanso") || raw.includes("almuerzo") || item.category === "Tiempo de descanso") {
      return `Tiempo de descanso y receso laboral.`;
    }
    if (raw.includes("baño") || raw.includes("bano") || raw.includes("sanitaria") || raw.includes("sanitario") || item.category === "Pausa personal") {
      return `Pausa sanitaria operativa.`;
    }
    if (raw.includes("reunión") || raw.includes("reunion") || item.category === "Reunión interna") {
      return `Reunión de coordinación y seguimiento de equipo: ${taskName || "Reunión"}.`;
    }
    if (raw.includes("inventario")) {
      return `Inventario físico y actualización de existencias en bodega GAR.`;
    }
    if (raw.includes("limpieza")) {
      return `Mantenimiento, orden y limpieza en áreas de taller.`;
    }
    if (raw.includes("exhibidor")) {
      return `Revisión y organización de productos en exhibidores de tienda.`;
    }
    if (meta.manual || meta.task || meta.justification || action.startsWith("inició:") || action.startsWith("terminó:") || action.startsWith("justificación:")) {
      return `Labor manual en taller: ${taskName}.`;
    }
  }

  // Agrupar actividades de software y navegación
  const phrases = new Set<string>();
  let hasCctv = false;
  let hasRecortes = false;
  let hasWhatsapp = false;
  let hasSekaChat = false;
  let hasOdoo = false;
  let hasAttendance = false;
  let hasNetworks = false;
  let hasDev = false;
  let hasOffice = false;
  let hasPause = false;

  for (const item of items) {
    const meta = (item.metadata || {}) as Record<string, any>;
    const app = (meta.app || meta.app_name || "").toLowerCase();
    const action = (item.action || "").toLowerCase();
    const title = (meta.title || meta.context || "").toLowerCase();
    const raw = `${action} ${title} ${app}`;
    const isDevItem =
      app.includes("antigravity") ||
      app.includes("cursor") ||
      app.includes("windsurf") ||
      app.includes("code") ||
      app.includes("devin") ||
      app.includes("visual studio") ||
      raw.includes("antigravity") ||
      item.category === "Investigación y desarrollo";

    if (isDevItem) {
      hasDev = true;
      continue;
    }

    if (raw.includes("ivms") || raw.includes("sadp") || raw.includes("hik") || raw.includes("cctv")) hasCctv = true;
    else if (raw.includes("recorte") || raw.includes("snipping")) hasRecortes = true;
    else if (raw.includes("whatsapp")) hasWhatsapp = true;
    else if (raw.includes("seka chat") || raw.includes("chat sekunet") || raw.includes("evolution api") || raw.includes("evolution-api")) hasSekaChat = true;
    else if (raw.includes("odoo")) hasOdoo = true;
    else if (raw.includes("nextime") || raw.includes("biotime") || raw.includes("asistencia")) hasAttendance = true;
    else if (raw.includes("winbox") || raw.includes("mikrotik") || raw.includes("unifi")) hasNetworks = true;
    else if (raw.includes("excel") || raw.includes("word") || raw.includes(".docx") || raw.includes(".xlsx")) hasOffice = true;
    else if (item.category === "Inactividad" || raw.includes("sin actividad") || raw.includes("bloqueada") || raw.includes("pausa")) hasPause = true;
  }

  // Redactar narrativa fluida combinada
  if (hasWhatsapp && hasSekaChat) {
    phrases.add("Atención y soporte al cliente a través de canales de mensajería como Chat Sekunet y WhatsApp");
  } else if (hasWhatsapp) {
    phrases.add("Atención y comunicación con usuarios o equipo de trabajo a través de la aplicación de mensajería WhatsApp");
  } else if (hasSekaChat) {
    phrases.add("Atención al cliente y soporte técnico mediante plataforma Sekunet Chat");
  }

  if (hasOdoo) {
    phrases.add("atención, seguimiento y resolución de tickets en portal Odoo ERP");
  }

  if (hasCctv) {
    phrases.add("monitoreo de sistemas de videovigilancia y gestión de cámaras mediante iVMS-4200");
  }

  if (hasRecortes) {
    phrases.add("uso de la herramienta de recortes para captura y documentación de evidencia técnica");
  }

  if (hasAttendance) {
    phrases.add("consulta y gestión de registros de asistencia de personal en plataforma de control horario");
  }

  if (hasNetworks) {
    phrases.add("administración y configuración de infraestructura de red y telecomunicaciones en MikroTik");
  }

  if (hasDev) {
    phrases.add("optimización, programación y desarrollo de software y sistemas técnicos");
  }

  if (hasOffice) {
    phrases.add("control administrativo, elaboración de informes técnicos y gestión documental");
  }


  if (hasPause && phrases.size === 0) {
    return "Pausa operativa / Período sin interacción activa en la estación de trabajo.";
  }

  if (phrases.size === 0) {
    // Tomar el título formateado del primer evento representativo
    const firstDisp = formatExecutiveDisplay(items[0].action, items[0].category, items[0].metadata || {});
    return firstDisp.title + ".";
  }

  const phraseArr = Array.from(phrases);
  if (phraseArr.length === 1) {
    return phraseArr[0].charAt(0).toUpperCase() + phraseArr[0].slice(1) + ".";
  }

  // Concatenar coherentemente: A, B y C
  const lastPhrase = phraseArr.pop()!;
  const combined = phraseArr.join(", ") + " y " + lastPhrase;
  return combined.charAt(0).toUpperCase() + combined.slice(1) + ".";
}

function consolidateTimelineByBlocks(
  entries: TimelineEntry[],
  intervalMinutes: number = 5,
  scheduleStart?: string,
  scheduleEnd?: string,
  scheduleEnabled?: boolean,
  workDays: number[] = [1, 2, 3, 4, 5]
): ConsolidatedBlock[] {
  if (!entries || entries.length === 0) return [];

  const parseTimeToMinutes = (t: string) => {
    if (!t) return 0;
    const parts = t.split(":");
    return (parseInt(parts[0], 10) || 0) * 60 + (parseInt(parts[1], 10) || 0);
  };
  const startMin = parseTimeToMinutes(scheduleStart || "08:00");
  const endMin = parseTimeToMinutes(scheduleEnd || "17:00");

  // Ordenar cronológicamente ascendente para agrupar
  const sorted = [...entries]
    .filter((e) => Boolean(e.created_at))
    .sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime());

  const blocksMap = new Map<number, TimelineEntry[]>();
  const intervalMs = intervalMinutes * 60 * 1000;

  for (const entry of sorted) {
    const time = new Date(entry.created_at).getTime();
    if (isNaN(time)) continue;

    // Si el horario laboral está activo, omitir eventos automáticos fuera de rango o día laboral
    // Las labores manuales TIENEN JERARQUÍA ABSOLUTA y NUNCA se suprimen por horario
    if (scheduleEnabled && !isManualEntry(entry)) {
      const d = new Date(time);
      const dayOfWeek = d.getDay();
      if (!workDays.includes(dayOfWeek)) {
        continue;
      }
      const minOfDay = d.getHours() * 60 + d.getMinutes();
      if (minOfDay < startMin || minOfDay >= endMin) {
        continue;
      }
    }

    // Bucket al inicio del intervalo de 5 min
    const bucketKey = Math.floor(time / intervalMs) * intervalMs;
    const list = blocksMap.get(bucketKey) || [];
    list.push(entry);
    blocksMap.set(bucketKey, list);
  }

  // Convertir cada bucket en un bloque consolidado (de más reciente a más antiguo para lectura ejecutiva)
  const sortedKeys = Array.from(blocksMap.keys()).sort((a, b) => b - a);

  return sortedKeys.map((bucketKey) => {
    const items = blocksMap.get(bucketKey)!;
    const bucketDate = new Date(bucketKey);
    const bucketEndDate = new Date(bucketKey + intervalMs);

    const startTime = bucketDate.toLocaleTimeString("es-CR", { hour: "2-digit", minute: "2-digit" });
    const endTime = bucketEndDate.toLocaleTimeString("es-CR", { hour: "2-digit", minute: "2-digit" });

    // Determinar categoría primaria con prioridad a labores manuales
    const catCounts: Record<string, number> = {};
    const apps = new Set<string>();
    let totalDur = 0;
    let manualCategory: string | null = null;
    let manualTaskName: string | null = null;

    for (const it of items) {
      const meta = (it.metadata || {}) as Record<string, any>;
      const act = (it.action || "").toLowerCase();
      const isManual = isManualEntry(it);

      if (isManual) {
        manualCategory = it.category || "Labores manuales";
        manualTaskName =
          meta.task ||
          meta.label ||
          it.action.replace(/^inici[oó]:\s*|^termin[oó]:\s*|^justificaci[oó]n:\s*/i, "").split("(")[0].trim();
      }

      let app = meta.task || meta.app_name || meta.label || meta.app || "";
      if (!app) {
        if (act.startsWith("inició:") || act.startsWith("inicio:")) {
          app = it.action.replace(/^inici[oó]:\s*/i, "").trim();
        } else if (act.startsWith("terminó:") || act.startsWith("termino:")) {
          app = it.action.replace(/^termin[oó]:\s*/i, "").split("(")[0].trim();
        } else if (act.startsWith("justificación:") || act.startsWith("justificacion:")) {
          app = it.action.replace(/^justificaci[oó]n:\s*/i, "").split("(")[0].trim();
        }
      }
      if (app && app !== "Unknown") apps.add(app);
      if (it.duration_ms) totalDur += it.duration_ms;

      let cat = it.category || "Operación Sekunet";
      const appLower = app.toLowerCase();
      if (
        appLower.includes("antigravity") ||
        appLower.includes("cursor") ||
        appLower.includes("code") ||
        appLower.includes("windsurf") ||
        appLower.includes("devin")
      ) {
        cat = "Investigación y desarrollo";
      }
      catCounts[cat] = (catCounts[cat] || 0) + 1;
    }

    // SI HAY UNA LABOR MANUAL EN ESTE BLOQUE, SE LE OTORGA PRIORIDAD MÁXIMA
    const topCategory = manualCategory || Object.entries(catCounts).sort((a, b) => b[1] - a[1])[0]?.[0] || "Operación Sekunet";
    const narrative = buildConsolidatedNarrative(items);
    // Si hubo una labor manual, silenciar las demás apps de fondo y reportar exclusivamente la labor manual
    const displayApps = manualTaskName ? [manualTaskName] : Array.from(apps);

    return {
      id: `block-${bucketKey}`,
      startTime,
      endTime,
      narrative,
      category: topCategory,
      totalDurationMs: totalDur || intervalMs,
      apps: displayApps,
      eventCount: items.length,
      manualTask: manualTaskName,
    };
  });
}

// Comparador eficiente de igualdad para evitar renders innecesarios en auto-refresco en segundo plano
function areTimelinesEqual(a: TimelineEntry[], b: TimelineEntry[]): boolean {
  if (a === b) return true;
  if (!a || !b || a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) {
    const itemA = a[i];
    const itemB = b[i];
    if (
      itemA.id !== itemB.id ||
      itemA.action !== itemB.action ||
      itemA.category !== itemB.category ||
      itemA.duration_ms !== itemB.duration_ms ||
      itemA.created_at !== itemB.created_at
    ) {
      return false;
    }
  }
  return true;
}

function areLiveAgentsEqual(a: LiveAgent[], b: LiveAgent[]): boolean {
  if (a === b) return true;
  if (!a || !b || a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) {
    const agA = a[i];
    const agB = b[i];
    if (
      agA.email !== agB.email ||
      agA.status !== agB.status ||
      agA.currentApp !== agB.currentApp ||
      agA.activeMinutes !== agB.activeMinutes ||
      agA.idleMinutes !== agB.idleMinutes ||
      agA.productivityScore !== agB.productivityScore ||
      agA.todayEventsCount !== agB.todayEventsCount
    ) {
      return false;
    }
  }
  return true;
}

export function ActivityTracker({ agentEmail, agentName, isAdmin = false }: Props) {
  const defaultEmail = agentEmail || "cbatista@sekunet.com";
  const [liveAgents, setLiveAgents] = useState<LiveAgent[]>([]);
  const [selectedAgent, setSelectedAgent] = useState<string | undefined>(defaultEmail);
  const [selectedDate, setSelectedDate] = useState(new Date().toISOString().split("T")[0]);
  const [selectedEndDate, setSelectedEndDate] = useState<string | undefined>(undefined);
  const [dateRangeMode, setDateRangeMode] = useState<"single" | "range">("single");
  const [activeTab, setActiveTab] = useState<"live" | "timeline" | "screenshots" | "apps" | "briefing" | "analytics">("live");

  const handleSuiteDatePreset = (preset: "hoy" | "ayer" | "7d" | "15d" | "mes") => {
    const now = new Date();
    const toYMD = (d: Date) => d.toISOString().split("T")[0];
    if (preset === "hoy") {
      const today = toYMD(now);
      setDateRangeMode("single");
      setSelectedDate(today);
      setSelectedEndDate(undefined);
    } else if (preset === "ayer") {
      const yest = new Date(now.getTime() - 86400000);
      const yStr = toYMD(yest);
      setDateRangeMode("single");
      setSelectedDate(yStr);
      setSelectedEndDate(undefined);
    } else if (preset === "7d") {
      const past7 = new Date(now.getTime() - 6 * 86400000);
      setDateRangeMode("range");
      setSelectedDate(toYMD(past7));
      setSelectedEndDate(toYMD(now));
    } else if (preset === "15d") {
      const past15 = new Date(now.getTime() - 14 * 86400000);
      setDateRangeMode("range");
      setSelectedDate(toYMD(past15));
      setSelectedEndDate(toYMD(now));
    } else if (preset === "mes") {
      const firstDay = new Date(now.getFullYear(), now.getMonth(), 1);
      setDateRangeMode("range");
      setSelectedDate(toYMD(firstDay));
      setSelectedEndDate(toYMD(now));
    }
  };

  const [timeline, setTimeline] = useState<TimelineEntry[]>([]);
  const [categoryFilter, setCategoryFilter] = useState<string>("all");
  const [searchFilter, setSearchFilter] = useState<string>("");
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [autoRefreshSec, setAutoRefreshSec] = useState<number>(30);

  // Estados para rangos de horarios laborales manuales
  const [scheduleEnabled, setScheduleEnabled] = useState<boolean>(() => {
    if (typeof window === "undefined") return true;
    try {
      const saved = localStorage.getItem("sekunet_activity_schedule_enabled");
      return saved !== null ? saved === "true" : true;
    } catch {
      return true;
    }
  });

  const [scheduleStart, setScheduleStart] = useState<string>(() => {
    if (typeof window === "undefined") return "08:00";
    try {
      return localStorage.getItem("sekunet_activity_schedule_start") || "08:00";
    } catch {
      return "08:00";
    }
  });

  const [scheduleEnd, setScheduleEnd] = useState<string>(() => {
    if (typeof window === "undefined") return "17:00";
    try {
      return localStorage.getItem("sekunet_activity_schedule_end") || "17:00";
    } catch {
      return "17:00";
    }
  });

  const [workDays, setWorkDays] = useState<number[]>([1, 2, 3, 4, 5]);
  const [targetDailyHours, setTargetDailyHours] = useState<number>(() => {
    if (typeof window === "undefined") return 10;
    try {
      const saved = localStorage.getItem("sekunet_activity_target_daily_hours");
      return saved ? Number(saved) : 10;
    } catch {
      return 10;
    }
  });

  const [toleranceMinutes, setToleranceMinutes] = useState<number>(() => {
    if (typeof window === "undefined") return 3;
    try {
      const saved = localStorage.getItem("sekunet_activity_tolerance_minutes");
      return saved ? Number(saved) : 3;
    } catch {
      return 3;
    }
  });

  const [useMixedSchedule, setUseMixedSchedule] = useState<boolean>(false);
  const [daySchedules, setDaySchedules] = useState<Record<number, any> | undefined>(undefined);
  const [appMappings, setAppMappings] = useState<Record<string, any>>(() => {
    if (typeof window === "undefined") return {};
    try {
      const saved = localStorage.getItem("sek_app_categories");
      return saved ? JSON.parse(saved) : {};
    } catch {
      return {};
    }
  });

  // Solicitudes de horas extras (Overtime)
  const [overtimeRequests, setOvertimeRequests] = useState<any[]>([]);
  const [reviewingOvertime, setReviewingOvertime] = useState<boolean>(false);

  const fetchOvertime = useCallback(async () => {
    try {
      const res = await fetch(`/api/activity/overtime?date=${selectedDate}`);
      const data = await res.json();
      if (data?.success && Array.isArray(data.requests)) {
        setOvertimeRequests((prev) => {
          if (JSON.stringify(prev) === JSON.stringify(data.requests)) return prev;
          return data.requests;
        });
      }
    } catch (e) {
      console.error("[tracker] error fetching overtime:", e);
    }
  }, [selectedDate]);

  // Cargar horario específico del agente seleccionado
  useEffect(() => {
    if (!selectedAgent) return;
    fetch(`/api/activity/schedule?agentEmail=${encodeURIComponent(selectedAgent)}`)
      .then((r) => r.json())
      .then((data) => {
        if (data?.success) {
          if (data.scheduleStart) setScheduleStart(data.scheduleStart);
          if (data.scheduleEnd) setScheduleEnd(data.scheduleEnd);
          if (data.scheduleEnabled !== undefined) setScheduleEnabled(Boolean(data.scheduleEnabled));
          if (Array.isArray(data.workDays) && data.workDays.length > 0) setWorkDays(data.workDays);
          if (data.targetDailyHours) setTargetDailyHours(Number(data.targetDailyHours));
          if (data.toleranceMinutes) setToleranceMinutes(Number(data.toleranceMinutes));
          setUseMixedSchedule(Boolean(data.useMixedSchedule));
          setDaySchedules(data.daySchedules || undefined);
        }
      })
      .catch((e) => console.error("[tracker] error fetching agent schedule:", e));
  }, [selectedAgent]);

  // Cargar mapeos de procesos y aplicaciones
  useEffect(() => {
    fetch("/api/activity/app-categories")
      .then((r) => r.json())
      .then((data) => {
        if (data?.appMappings) {
          setAppMappings(data.appMappings);
          try { localStorage.setItem("sek_app_categories", JSON.stringify(data.appMappings)); } catch {}
        }
      })
      .catch(() => {});

    const handler = (e: any) => {
      if (e.detail) {
        setAppMappings(e.detail);
      } else {
        try {
          const stored = localStorage.getItem("sek_app_categories");
          if (stored) setAppMappings(JSON.parse(stored));
        } catch {}
      }
    };
    window.addEventListener("sek_app_categories_updated", handler);
    return () => window.removeEventListener("sek_app_categories_updated", handler);
  }, []);

  // Cargar horario oficial y días guardados en base de datos al montar
  useEffect(() => {
    fetch("/api/activity/schedule")
      .then((r) => r.json())
      .then((data) => {
        if (data?.success) {
          if (data.scheduleStart && !selectedAgent) {
            setScheduleStart(data.scheduleStart);
            try { localStorage.setItem("sekunet_activity_schedule_start", data.scheduleStart); } catch {}
          }
          if (data.scheduleEnd && !selectedAgent) {
            setScheduleEnd(data.scheduleEnd);
            try { localStorage.setItem("sekunet_activity_schedule_end", data.scheduleEnd); } catch {}
          }
          if (data.scheduleEnabled !== undefined && !selectedAgent) {
            setScheduleEnabled(Boolean(data.scheduleEnabled));
            try { localStorage.setItem("sekunet_activity_schedule_enabled", String(data.scheduleEnabled)); } catch {}
          }
          if (Array.isArray(data.workDays) && data.workDays.length > 0 && !selectedAgent) {
            setWorkDays(data.workDays);
          }
          if (data.targetDailyHours && !selectedAgent) {
            setTargetDailyHours(Number(data.targetDailyHours));
            try { localStorage.setItem("sekunet_activity_target_daily_hours", String(data.targetDailyHours)); } catch {}
          }
          if (data.toleranceMinutes) {
            setToleranceMinutes(Number(data.toleranceMinutes));
            try { localStorage.setItem("sekunet_activity_tolerance_minutes", String(data.toleranceMinutes)); } catch {}
          }
        }
      })
      .catch(() => {});
  }, [selectedAgent]);

  const [timelineViewMode, setTimelineViewMode] = useState<"consolidated" | "logs">("consolidated");
  const [onlyManualFilter, setOnlyManualFilter] = useState<boolean>(false);
  const [serverMetrics, setServerMetrics] = useState<any>(null);
  const [visibleLogsCount, setVisibleLogsCount] = useState<number>(60);
  const [reclassifyingId, setReclassifyingId] = useState<number | null>(null);

  // Estados para Modal de Ajuste Administrativo de Registros
  const [editingLog, setEditingLog] = useState<TimelineEntry | null>(null);
  const [editDurationMin, setEditDurationMin] = useState<string>("");
  const [editCategory, setEditCategory] = useState<string>("");
  const [editSubcategory, setEditSubcategory] = useState<string>("");
  const [editAction, setEditAction] = useState<string>("");
  const [editReason, setEditReason] = useState<string>("");
  const [savingEdit, setSavingEdit] = useState<boolean>(false);
  const [deletingLogId, setDeletingLogId] = useState<number | null>(null);
  const fetchLive = useCallback(async () => {
    try {
      const res = await fetch("/api/activity/live");
      const data = await res.json();
      if (data.ok && Array.isArray(data.agents)) {
        setLiveAgents((prev) => {
          if (areLiveAgentsEqual(prev, data.agents)) return prev;
          return data.agents;
        });
        setSelectedAgent((prev) => {
          if (prev) return prev;
          const found = data.agents.find((a: LiveAgent) => a.email.toLowerCase() === defaultEmail.toLowerCase());
          return found ? found.email : data.agents[0]?.email;
        });
      }
    } catch (e) {
      console.error("[tracker] error fetching live:", e);
    }
  }, [defaultEmail]);

  // Cargar timeline del agente y fecha seleccionados (con soporte para refresco en segundo plano silencioso)
  const fetchTimeline = useCallback(async (isSilent = false) => {
    if (!selectedAgent) return;
    if (!isSilent) setRefreshing(true);
    try {
      const endParam = selectedEndDate ? `&endDate=${encodeURIComponent(selectedEndDate)}` : "";
      const res = await fetch(`/api/activity/timeline?agent=${encodeURIComponent(selectedAgent)}&date=${selectedDate}${endParam}&metrics=true&_t=${Date.now()}`);
      const data = await res.json();
      const newTimeline: TimelineEntry[] = data.timeline || [];
      setTimeline((prev) => {
        if (areTimelinesEqual(prev, newTimeline)) return prev;
        return newTimeline;
      });
      if (data.metrics) {
        setServerMetrics(data.metrics);
      }
    } catch (e) {
      console.error("[tracker] error fetching timeline:", e);
    } finally {
      if (!isSilent) setRefreshing(false);
      setLoading(false);
    }
  }, [selectedAgent, selectedDate, selectedEndDate]);

  const handleOpenEditLog = (item: TimelineEntry) => {
    setEditingLog(item);
    const durMin = item.duration_ms ? Math.round(item.duration_ms / 60000) : 0;
    setEditDurationMin(String(durMin));
    setEditCategory(item.category || "Descansos");
    const meta = (item.metadata || {}) as Record<string, any>;
    setEditSubcategory(meta.manual_subcategory || meta.subcategory || "");
    setEditAction(item.action || "");
    setEditReason(meta.adjusted_reason || "");
  };

  const handleSaveEditLog = async () => {
    if (!editingLog) return;
    setSavingEdit(true);
    try {
      const minVal = parseInt(editDurationMin, 10);
      const newDurationMs = isNaN(minVal) ? 0 : minVal * 60 * 1000;

      const res = await fetch("/api/activity/log", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: editingLog.id,
          duration_ms: newDurationMs,
          category: editCategory,
          subcategory: editSubcategory,
          action: editAction,
          reason: editReason || "Corrección manual por administrador",
          adjusted_by: defaultEmail || "Administrador",
        }),
      });

      const data = await res.json();
      if (!res.ok || data.error) {
        throw new Error(data.error || "Error al actualizar registro");
      }

      toast.success("Registro corregido exitosamente. Recalculando analíticas...");
      setEditingLog(null);
      fetchTimeline(true);
    } catch (err: any) {
      toast.error(err.message || "Error al guardar el ajuste");
    } finally {
      setSavingEdit(false);
    }
  };

  const handleDeleteLog = async (item: TimelineEntry) => {
    const isBreak = item.category === "Descansos";
    const promptMsg = isBreak
      ? `¿Desea anular/eliminar este registro de descanso ("${item.action}")?\n\nEl tiempo se liberará y las analíticas de jornada se recalcularán de inmediato.`
      : `¿Desea anular/eliminar este registro ("${item.action}")?`;

    if (!confirm(promptMsg)) return;

    setDeletingLogId(item.id);
    try {
      const res = await fetch(`/api/activity/log?id=${item.id}`, {
        method: "DELETE",
      });
      const data = await res.json();
      if (!res.ok || data.error) {
        throw new Error(data.error || "Error al eliminar registro");
      }

      toast.success("Registro eliminado exitosamente. Recalculando analíticas...");
      setTimeline((prev) => prev.filter((t) => t.id !== item.id));
      fetchTimeline(true);
    } catch (err: any) {
      toast.error(err.message || "Error al eliminar el registro");
    } finally {
      setDeletingLogId(null);
    }
  };

  useEffect(() => {
    fetchLive();
  }, [fetchLive]);

  useEffect(() => {
    fetchTimeline(false);
    fetchOvertime();
  }, [fetchTimeline, fetchOvertime]);

  // Auto-refresco periódico 100% silencioso y fluido (sin parpadeos de DOM ni animaciones)
  useEffect(() => {
    if (autoRefreshSec <= 0) return;
    const interval = setInterval(() => {
      fetchLive();
      fetchTimeline(true);
      fetchOvertime();
    }, autoRefreshSec * 1000);
    return () => clearInterval(interval);
  }, [autoRefreshSec, fetchLive, fetchTimeline, fetchOvertime]);

  const currentAgentObj = liveAgents.find((a) => a.email.toLowerCase() === selectedAgent?.toLowerCase());

  // Filtrar timeline dentro del horario laboral y con jerarquía absoluta de labores manuales
  const timelineWithinSchedule = React.useMemo(() => {
    // 1. Filtrar por horario laboral si está habilitado
    let list = timeline;
    if (scheduleEnabled) {
      const parseTimeToMinutes = (t: string) => {
        if (!t) return 0;
        const parts = t.split(":");
        return (parseInt(parts[0], 10) || 0) * 60 + (parseInt(parts[1], 10) || 0);
      };
      const startMin = parseTimeToMinutes(scheduleStart || "08:00");
      const endMin = parseTimeToMinutes(scheduleEnd || "17:00");

      list = list.filter((entry) => {
        // Jerarquía absoluta: Las labores manuales NUNCA se suprimen por horario
        if (isManualEntry(entry)) return true;

        if (!entry.created_at) return false;
        const dCR = new Date(new Date(entry.created_at).toLocaleString("en-US", { timeZone: "America/Costa_Rica" }));
        if (isNaN(dCR.getTime())) return false;
        const dayOfWeek = dCR.getDay();
        if (!workDays.includes(dayOfWeek)) return false;

        let effectiveStartMin = startMin;
        let effectiveEndMin = endMin;
        if (useMixedSchedule && daySchedules && daySchedules[dayOfWeek]) {
          if (daySchedules[dayOfWeek].start) effectiveStartMin = parseTimeToMinutes(daySchedules[dayOfWeek].start);
          if (daySchedules[dayOfWeek].end) effectiveEndMin = parseTimeToMinutes(daySchedules[dayOfWeek].end);
        }

        const minOfDay = dCR.getHours() * 60 + dCR.getMinutes();
        return minOfDay >= effectiveStartMin && minOfDay < effectiveEndMin;
      });
    }

    // 2. Extraer todos los intervalos de labores manuales (Capacitación, Bodega, Ventanilla, Diagnóstico, etc.)
    // La actividad manual tiene JERARQUÍA ABSOLUTA: dentro de su intervalo, todos los demás logs de fondo se pausan y se silencian
    interface ManualRange {
      startMs: number;
      endMs: number;
    }
    const manualRanges: ManualRange[] = [];

    for (const it of list) {
      const meta = (it.metadata || {}) as Record<string, any>;
      const act = (it.action || "").toLowerCase();
      const isEnd = act.startsWith("terminó:") || act.startsWith("termino:");
      const isJust = act.startsWith("justificación:") || act.startsWith("justificacion:") || meta.justification;

      if (isEnd || isJust) {
        const endMs = new Date(it.created_at).getTime();
        const discreteMs = Number(
          it.duration_ms ||
          (meta.duration_seconds ? meta.duration_seconds * 1000 : 0) ||
          (meta.minutes ? meta.minutes * 60000 : 0)
        ) || 0;
        const durMs = Math.min(discreteMs, 4 * 3600 * 1000);
        if (durMs > 0) {
          manualRanges.push({ startMs: endMs - durMs, endMs });
        }
      }
    }

    // Detectar labor manual activa actualmente (Inició sin Terminó posterior)
    const sorted = [...list].sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime());
    for (let i = sorted.length - 1; i >= 0; i--) {
      const it = sorted[i];
      const meta = (it.metadata || {}) as Record<string, any>;
      const act = (it.action || "").toLowerCase();
      const isStart = (act.startsWith("inició:") || act.startsWith("inicio:")) && (meta.manual || meta.task);
      if (isStart) {
        const startMs = new Date(it.created_at).getTime();
        const hasEndLater = sorted.slice(i + 1).some((after) => {
          const afterAct = (after.action || "").toLowerCase();
          return (afterAct.startsWith("terminó:") || afterAct.startsWith("termino:")) && new Date(after.created_at).getTime() > startMs;
        });
        if (!hasEndLater) {
          manualRanges.push({ startMs, endMs: Date.now() });
        }
        break;
      }
    }

    if (manualRanges.length === 0) return list;

    // 3. Suprimir cualquier log de software/fondo que caiga dentro de un rango de actividad manual
    return list.filter((item) => {
      if (isManualEntry(item)) return true;

      const itemMs = new Date(item.created_at).getTime();
      const inManual = manualRanges.some((r) => itemMs >= r.startMs && itemMs <= r.endMs);
      return !inManual;
    });
  }, [timeline, scheduleEnabled, scheduleStart, scheduleEnd, workDays]);

  // Filtrado final de timeline según filtros de UI
  const filteredTimeline = React.useMemo(() => {
    let list = timelineWithinSchedule;

    if (onlyManualFilter) {
      list = list.filter((item) => isManualEntry(item));
    }

    if (categoryFilter !== "all") {
      list = list.filter((item) => item.category === categoryFilter);
    }

    if (searchFilter.trim()) {
      const term = searchFilter.toLowerCase();
      list = list.filter((item) => {
        const actionMatch = (item.action || "").toLowerCase().includes(term);
        const catMatch = (item.category || "").toLowerCase().includes(term);
        const appMatch = JSON.stringify(item.metadata || {}).toLowerCase().includes(term);
        return actionMatch || catMatch || appMatch;
      });
    }

    return list;
  }, [timelineWithinSchedule, onlyManualFilter, categoryFilter, searchFilter]);

  // Reset de límite de eventos visibles al cambiar filtros o selección
  useEffect(() => {
    setVisibleLogsCount(60);
  }, [selectedAgent, selectedDate, categoryFilter, searchFilter, onlyManualFilter]);

  // Reclasificación directa e instantánea desde la fila de log con persistencia en BD
  const handleReclassifyLog = async (
    item: TimelineEntry,
    newCategory: string,
    newSubcategory?: string
  ) => {
    const cleanApp = extractCleanItemName(item as any);
    setReclassifyingId(item.id);

    // Actualización optimista inmediata en estado local
    setTimeline((prev) =>
      prev.map((t) => {
        if (t.id === item.id) {
          return {
            ...t,
            category: newCategory,
            metadata: {
              ...(t.metadata || {}),
              app_name: cleanApp,
              manual_category: newCategory,
              manual_subcategory: newSubcategory || null,
            },
          };
        }
        return t;
      })
    );

    try {
      const res = await fetch("/api/activity/app-categories", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          appName: cleanApp,
          category: newCategory,
          subcategory: newSubcategory || "",
          logId: item.id,
          existingMetadata: item.metadata,
        }),
      });
      const data = await res.json();
      if (data?.success) {
        toast.success(`"${cleanApp}" reclasificado a ${newCategory}${newSubcategory ? ` • ${newSubcategory}` : ""}`);
      } else {
        toast.error("No se pudo guardar la clasificación en base de datos");
      }
    } catch (err) {
      console.error("[tracker] Error reclassifying log:", err);
      toast.error("Error de conexión al reclasificar");
    } finally {
      setReclassifyingId(null);
    }
  };

  // Bloques de 5 minutos memoizados para el resumen de la pestaña En Vivo
  const liveConsolidatedBlocks = React.useMemo(() => {
    return consolidateTimelineByBlocks(
      timelineWithinSchedule,
      5,
      scheduleStart,
      scheduleEnd,
      scheduleEnabled,
      workDays
    );
  }, [timelineWithinSchedule, scheduleStart, scheduleEnd, scheduleEnabled, workDays]);

  // Bloques de 5 minutos memoizados para la pestaña Línea de Tiempo (respetando filtros)
  const filteredConsolidatedBlocks = React.useMemo(() => {
    return consolidateTimelineByBlocks(
      filteredTimeline,
      5,
      scheduleStart,
      scheduleEnd,
      scheduleEnabled,
      workDays
    );
  }, [filteredTimeline, scheduleStart, scheduleEnd, scheduleEnabled, workDays]);

  // Lista de logs invertida y paginada para rendimiento ultra-rápido en modo Logs
  const reversedLogs = React.useMemo(() => {
    return [...filteredTimeline].reverse();
  }, [filteredTimeline]);

  const visibleLogs = React.useMemo(() => {
    return reversedLogs.slice(0, visibleLogsCount);
  }, [reversedLogs, visibleLogsCount]);

  // Medición oficial de cumplimiento de la Jornada Laboral (Horas hábiles / efectivas vs Meta)
  const agentDailyCompliance = React.useMemo(() => {
    // Si tenemos las métricas oficiales del servidor (la misma fuente de verdad que el Sidebar), las usamos directamente
    if (serverMetrics) {
      const targetMins = Math.round((serverMetrics.targetDailyHours || targetDailyHours || 10) * 60);
      const activeMins = Math.round((serverMetrics.totalActiveMs || 0) / 60000);
      const rawActiveMins = Math.round((serverMetrics.rawActiveMs || 0) / 60000);
      const breakMins = Math.round(((serverMetrics.totalBreakMs || 0) + (serverMetrics.totalSanitaryMs || 0)) / 60000);
      const workdayMins = serverMetrics.totalWorkdayMs
        ? Math.round(serverMetrics.totalWorkdayMs / 60000)
        : (activeMins + breakMins);
      const deficitMins = Math.round((serverMetrics.deficitMs || 0) / 60000);
      const rawOtMins = Math.round((serverMetrics.rawOvertimeMs || 0) / 60000);
      const percent = targetMins > 0 ? Math.min(100, Math.round((workdayMins / targetMins) * 100)) : 0;

      const currentOtReq = overtimeRequests.find(
        (r) => r.agent_email?.toLowerCase() === (selectedAgent || "").toLowerCase()
      );
      const isOvertimeApproved = serverMetrics.isOvertimeApproved || currentOtReq?.status === "approved";
      const isOvertimePending = serverMetrics.overtimeStatus === "pending" || currentOtReq?.status === "pending";
      const isOvertimeRejected = serverMetrics.overtimeStatus === "rejected" || currentOtReq?.status === "rejected";

      return {
        rawActiveMinutes: rawActiveMins,
        activeMinutes: activeMins,
        workdayMinutes: workdayMins,
        breakMinutes: breakMins,
        targetMinutes: targetMins,
        targetDailyHours: serverMetrics.targetDailyHours || targetDailyHours || 10,
        percent,
        diffMinutes: workdayMins - targetMins,
        isCompleted: workdayMins >= targetMins,
        overtimeMinutes: rawOtMins,
        deficitMinutes: deficitMins,
        isOvertimeApproved,
        isOvertimePending,
        isOvertimeRejected,
        currentOtReq,
        firstLoginTime: serverMetrics.firstLoginTime,
        lastLogoutTime: serverMetrics.lastLogoutTime,
        isShiftActive: serverMetrics.isShiftActive,
        pcWorkTime: serverMetrics.pcWorkTime || "0m",
        manualJustificationTime: serverMetrics.manualJustificationTime || "0m",
        totalIdleTime: serverMetrics.totalIdleTime || "0m",
      };
    }

    const computed = computeUnifiedActivityMetrics((timeline || []) as any[], {
      targetDailyHours,
      toleranceMinutes,
      scheduleStart,
      scheduleEnd,
      useMixedSchedule,
      daySchedules,
      appMappings,
    });
    const productiveMs = computed.masterBuckets.Productivo.durationMs;
    const breakMs = computed.masterBuckets.Descanso.durationMs;
    const sanitaryMs = computed.masterBuckets["Pausa Sanitaria"].durationMs;
    const workdayMs = productiveMs + breakMs + sanitaryMs;
    const workdayMinutes = Math.round(workdayMs / 60000);
    const rawActiveMinutes = Math.round(productiveMs / 60000);
    const breakMinutes = Math.round((breakMs + sanitaryMs) / 60000);
    const targetMinutes = Math.round(targetDailyHours * 60);
    const diffMinutes = workdayMinutes - targetMinutes;
    const rawOvertimeMinutes = diffMinutes > 0 ? diffMinutes : 0;
    const deficitMinutes = diffMinutes < 0 ? Math.abs(diffMinutes) : 0;

    const currentOtReq = overtimeRequests.find(
      (r) => r.agent_email?.toLowerCase() === (selectedAgent || "").toLowerCase()
    );
    const isOvertimeApproved = currentOtReq?.status === "approved";
    const isOvertimePending = currentOtReq?.status === "pending";
    const isOvertimeRejected = currentOtReq?.status === "rejected";

    const workdayMinutesDisplay = (rawOvertimeMinutes > 0 && !isOvertimeApproved)
      ? targetMinutes
      : workdayMinutes;

    const percent = targetMinutes > 0 ? Math.min(100, Math.round((workdayMinutesDisplay / targetMinutes) * 100)) : 0;

    return {
      rawActiveMinutes,
      activeMinutes: rawActiveMinutes,
      workdayMinutes: workdayMinutesDisplay,
      breakMinutes,
      targetMinutes,
      targetDailyHours,
      percent,
      diffMinutes,
      isCompleted: workdayMinutes >= targetMinutes,
      overtimeMinutes: rawOvertimeMinutes,
      deficitMinutes,
      isOvertimeApproved,
      isOvertimePending,
      isOvertimeRejected,
      currentOtReq,
      firstLoginTime: computed.firstLoginTime,
      lastLogoutTime: computed.lastLogoutTime,
      isShiftActive: computed.isShiftActive,
      pcWorkTime: computed.pcWorkTime || "0m",
      manualJustificationTime: computed.manualJustificationTime || "0m",
      totalIdleTime: computed.masterBuckets.Inactivo.formattedTime || "0m",
    };
  }, [serverMetrics, timeline, targetDailyHours, toleranceMinutes, scheduleStart, scheduleEnd, useMixedSchedule, daySchedules, appMappings, overtimeRequests, selectedAgent]);

  const categoriesAvailable = Array.from(new Set(timeline.map((t) => t.category).filter(Boolean)));

  return (
    <div className="h-full flex flex-col bg-background overflow-hidden">
      {/* ── HEADER PRINCIPAL PREMIUM ── */}
      <div className="border-b border-border bg-card/60 backdrop-blur-md px-6 py-4 flex-shrink-0 flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="h-10 w-10 rounded-2xl bg-gradient-to-tr from-violet-600 to-indigo-600 text-white grid place-items-center shadow-md shadow-violet-600/20">
            <Activity className="h-5 w-5" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-base font-black text-foreground">Suite de Auditoría y Actividad</h1>
              <span className="text-[10px] font-extrabold uppercase px-2 py-0.5 rounded-full bg-violet-500/15 text-violet-400 border border-violet-500/30">
                Enterprise
              </span>
            </div>
            <p className="text-xs text-muted-foreground mt-0.5">
              Monitoreo integral de espacios de trabajo, llamadas, mensajería y aplicaciones de escritorio.
            </p>
          </div>
        </div>

        {/* Controles de fecha, rango de tiempo y refresco */}
        <div className="flex flex-wrap items-center gap-2.5">
          {/* Selector de Modalidad Temporal: Día Único vs Rango */}
          <div className="flex items-center p-0.5 rounded-xl border border-border bg-background shadow-sm">
            <button
              onClick={() => {
                setDateRangeMode("single");
                setSelectedEndDate(undefined);
              }}
              className={`px-2.5 py-1 rounded-lg text-xs font-bold transition-all ${
                dateRangeMode === "single"
                  ? "bg-violet-600 text-white shadow-sm"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              1 Día
            </button>
            <button
              onClick={() => {
                setDateRangeMode("range");
                if (!selectedEndDate || selectedEndDate === selectedDate) {
                  setSelectedEndDate(selectedDate);
                }
              }}
              className={`px-2.5 py-1 rounded-lg text-xs font-bold transition-all ${
                dateRangeMode === "range"
                  ? "bg-violet-600 text-white shadow-sm"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              Rango
            </button>
          </div>

          {/* Selector de Fecha(s) */}
          {dateRangeMode === "single" ? (
            <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-border bg-background shadow-sm text-xs font-semibold">
              <Calendar className="h-3.5 w-3.5 text-muted-foreground" />
              <input
                type="date"
                value={selectedDate}
                onChange={(e) => {
                  setSelectedDate(e.target.value);
                  setSelectedEndDate(undefined);
                }}
                className="bg-transparent text-foreground focus:outline-none cursor-pointer"
              />
            </div>
          ) : (
            <div className="flex items-center gap-2 px-3 py-1.5 rounded-xl border border-border bg-background shadow-sm text-xs font-semibold">
              <Calendar className="h-3.5 w-3.5 text-violet-400 shrink-0" />
              <span className="text-[10px] text-muted-foreground uppercase font-bold">Desde:</span>
              <input
                type="date"
                value={selectedDate}
                onChange={(e) => setSelectedDate(e.target.value)}
                className="bg-transparent text-foreground focus:outline-none cursor-pointer"
              />
              <span className="text-muted-foreground font-bold">→</span>
              <span className="text-[10px] text-muted-foreground uppercase font-bold">Hasta:</span>
              <input
                type="date"
                value={selectedEndDate || selectedDate}
                onChange={(e) => setSelectedEndDate(e.target.value)}
                className="bg-transparent text-foreground focus:outline-none cursor-pointer"
              />
            </div>
          )}

          {/* Atajos Rápidos de Fechas */}
          <div className="hidden xl:flex items-center gap-1">
            <button
              onClick={() => handleSuiteDatePreset("hoy")}
              className="px-2 py-1 rounded-lg border border-border bg-background hover:bg-muted text-[11px] font-semibold text-muted-foreground hover:text-foreground transition-colors"
            >
              Hoy
            </button>
            <button
              onClick={() => handleSuiteDatePreset("ayer")}
              className="px-2 py-1 rounded-lg border border-border bg-background hover:bg-muted text-[11px] font-semibold text-muted-foreground hover:text-foreground transition-colors"
            >
              Ayer
            </button>
            <button
              onClick={() => handleSuiteDatePreset("7d")}
              className="px-2 py-1 rounded-lg border border-border bg-background hover:bg-muted text-[11px] font-semibold text-muted-foreground hover:text-foreground transition-colors"
            >
              7d
            </button>
            <button
              onClick={() => handleSuiteDatePreset("15d")}
              className="px-2 py-1 rounded-lg border border-border bg-background hover:bg-muted text-[11px] font-semibold text-muted-foreground hover:text-foreground transition-colors"
            >
              15d
            </button>
            <button
              onClick={() => handleSuiteDatePreset("mes")}
              className="px-2 py-1 rounded-lg border border-border bg-background hover:bg-muted text-[11px] font-semibold text-muted-foreground hover:text-foreground transition-colors"
            >
              Mes
            </button>
          </div>

          {/* Selector de Auto-refresco */}
          <div className="flex items-center gap-1 px-2 py-1 rounded-xl border border-border bg-background text-xs font-semibold text-muted-foreground">
            <span className="text-[10px] uppercase font-bold text-muted-foreground/80 pl-1">Auto:</span>
            {[
              { label: "15s", val: 15 },
              { label: "30s", val: 30 },
              { label: "60s", val: 60 },
              { label: "Off", val: 0 },
            ].map((opt) => (
              <button
                key={opt.val}
                onClick={() => setAutoRefreshSec(opt.val)}
                className={`px-2 py-0.5 rounded-lg text-[11px] font-bold transition-colors ${
                  autoRefreshSec === opt.val
                    ? "bg-violet-600 text-white"
                    : "hover:bg-muted text-muted-foreground"
                }`}
              >
                {opt.label}
              </button>
            ))}
          </div>

          {/* Botón refrescar */}
          <button
            onClick={() => {
              fetchLive();
              fetchTimeline();
            }}
            disabled={refreshing}
            className="p-2 rounded-xl border border-border bg-background hover:bg-muted text-muted-foreground hover:text-foreground transition-colors disabled:opacity-50"
            title="Refrescar datos ahora"
          >
            <RefreshCw className={`h-4 w-4 ${refreshing ? "animate-spin text-violet-500" : ""}`} />
          </button>
        </div>
      </div>

      {/* ── BARRA HORIZONTAL DE COLABORADORES ── */}
      <div className="border-b border-border bg-card/30 px-6 py-2.5 flex-shrink-0 flex items-center gap-2 overflow-x-auto scrollbar-none">
        <span className="text-[11px] font-black uppercase tracking-wider text-muted-foreground shrink-0 mr-1 flex items-center gap-1.5">
          <Users className="h-3.5 w-3.5" /> Equipo:
        </span>

        {liveAgents.map((ag) => {
          const isSelected = selectedAgent?.toLowerCase() === ag.email.toLowerCase();
          const isOnline = ag.status === "active";
          const isAway = ag.status === "away";

          return (
            <button
              key={ag.email}
              onClick={() => setSelectedAgent(ag.email)}
              className={`flex items-center gap-2 px-3 py-1.5 rounded-xl border text-xs font-semibold transition-all shrink-0 ${
                isSelected
                  ? "border-violet-500 bg-violet-500/15 text-violet-300 shadow-sm"
                  : "border-border/60 bg-card hover:bg-muted/40 text-muted-foreground hover:text-foreground"
              }`}
            >
              <span className="relative">
                <Avatar src={ag.avatar_url} name={ag.name} className="h-5 w-5 text-[9px] font-black" />
                <span
                  className={`absolute -bottom-0.5 -right-0.5 h-2 w-2 rounded-full border border-card ${
                    isOnline ? "bg-emerald-500" : isAway ? "bg-amber-500" : "bg-zinc-400"
                  }`}
                />
              </span>
              <span className="truncate max-w-[130px]">{(ag.name || "Agente").split(" ")[0]}</span>
              {ag.hasDesktopApp && (
                <span title="Desktop App Conectada">
                  <Laptop className="h-3 w-3 text-blue-400/80 shrink-0" />
                </span>
              )}
            </button>
          );
        })}
      </div>

      {/* ── NAVEGACIÓN POR PESTAÑAS ── */}
      <div className="border-b border-border px-6 flex-shrink-0 bg-card/20 flex items-center gap-1 overflow-x-auto scrollbar-none">
        {[
          { id: "live", label: "En Vivo & Resumen", icon: Activity },
          { id: "apps", label: "Productividad & Apps", icon: Monitor },
          { id: "analytics", label: "Analíticas & Estadísticas", icon: BarChart3 },
          { id: "timeline", label: "Línea de Tiempo", icon: Clock },
          { id: "screenshots", label: "Capturas de Pantalla", icon: Camera },
          { id: "briefing", label: "Dictamen IA & Reportes", icon: Sparkles },
        ].map((tab) => {
          const Icon = tab.icon;
          const isActive = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id as any)}
              className={`flex items-center gap-2 px-4 py-3 border-b-2 text-xs font-bold transition-all shrink-0 ${
                isActive
                  ? "border-violet-500 text-violet-400 bg-violet-500/5"
                  : "border-transparent text-muted-foreground hover:text-foreground hover:bg-muted/20"
              }`}
            >
              <Icon className={`h-4 w-4 ${isActive ? "text-violet-400" : "text-muted-foreground"}`} />
              {tab.label}
            </button>
          );
        })}
      </div>

      {/* ── CUERPO PRINCIPAL CON SCROLL ── */}
      <div className="flex-1 overflow-y-auto p-6 space-y-6">
        {/* PESTAÑA 1: EN VIVO & RESUMEN */}
        {activeTab === "live" && (
          <div className="space-y-6">
            <ActivityLivePulse
              agents={liveAgents}
              selectedAgent={selectedAgent}
              onSelectAgent={(email) => setSelectedAgent(email)}
              loading={loading}
              targetDailyHours={targetDailyHours}
            />

            {/* Banner Premium de Cumplimiento de Jornada Laboral */}
            <div className="p-4 sm:p-5 rounded-2xl bg-card border border-border/70 shadow-sm relative overflow-hidden space-y-3">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div className="space-y-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-[10px] font-black uppercase tracking-wider px-2 py-0.5 rounded-full bg-violet-500/15 text-violet-400 border border-violet-500/30 flex items-center gap-1">
                      <Briefcase className="h-3 w-3" /> Jornada Laboral
                    </span>
                    <span className="text-xs font-bold text-foreground">
                      {currentAgentObj?.name || selectedAgent}
                    </span>
                    <span className="text-[11px] text-muted-foreground font-mono">
                      ({selectedEndDate && selectedEndDate !== selectedDate ? `${selectedDate} al ${selectedEndDate}` : selectedDate})
                    </span>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    Tiempo medido acumulado en chats, plataforma y labores manuales de taller vs. la jornada meta contratada.
                  </p>
                </div>

                <div className="flex items-center gap-3 self-end sm:self-center">
                  <div className="text-right">
                    <div className="flex items-baseline justify-end gap-1 font-mono">
                      <span className="text-2xl font-black text-foreground">
                        {Math.floor(agentDailyCompliance.workdayMinutes / 60)}h {(agentDailyCompliance.workdayMinutes % 60).toString().padStart(2, "0")}m
                      </span>
                      <span className="text-xs font-semibold text-muted-foreground">
                        / {targetDailyHours.toFixed(1)}h meta
                      </span>
                    </div>
                    <div className="flex items-center justify-end gap-1.5 mt-0.5">
                      {agentDailyCompliance.isCompleted ? (
                        <span className="text-[11px] font-bold text-emerald-400 flex items-center gap-1">
                          <CheckCircle2 className="h-3.5 w-3.5" /> Jornada Cumplida ({agentDailyCompliance.percent}%)
                        </span>
                      ) : (
                        <span className="text-[11px] font-bold text-sky-400 flex items-center gap-1">
                          <Clock className="h-3.5 w-3.5" /> {agentDailyCompliance.percent}% completado ({Math.floor(agentDailyCompliance.deficitMinutes / 60)}h {agentDailyCompliance.deficitMinutes % 60}m restantes de jornada)
                        </span>
                      )}
                    </div>
                  </div>
                </div>
              </div>

              {/* Marcas de Entrada/Salida, Desglose Operativo y Control de Horas Extras */}
              <div className="flex flex-wrap items-center justify-between gap-3 pt-2 border-t border-border/40 text-xs">
                {/* 1. Registro explícito de Entrada, Salida y Desglose Operativo */}
                <div className="flex items-center gap-2 font-mono flex-wrap">
                  <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-400">
                    <LogIn className="h-3.5 w-3.5" />
                    <span className="text-[10px] uppercase font-sans font-bold text-emerald-500/80">Entrada:</span>
                    <span className="font-bold">{agentDailyCompliance.firstLoginTime || "--:--"}</span>
                  </div>
                  {agentDailyCompliance.isShiftActive ? (
                    <div
                      className="flex items-center gap-1.5 px-2.5 py-1 rounded-xl bg-emerald-500/15 border border-emerald-500/30 text-emerald-300 font-bold shadow-sm shadow-emerald-500/10"
                      title="Jornada en curso. Última actividad registrada en tiempo real."
                    >
                      <span className="relative flex h-2 w-2">
                        <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                        <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
                      </span>
                      <span className="text-[10px] uppercase font-sans font-bold text-emerald-400">En curso:</span>
                      <span className="font-bold">{agentDailyCompliance.lastLogoutTime || "--:--"}</span>
                    </div>
                  ) : (
                    <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-xl bg-slate-500/10 border border-slate-500/20 text-slate-300">
                      <LogOut className="h-3.5 w-3.5" />
                      <span className="text-[10px] uppercase font-sans font-bold text-slate-400">Salida:</span>
                      <span className="font-bold">{agentDailyCompliance.lastLogoutTime || "--:--"}</span>
                    </div>
                  )}

                  <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-xl bg-violet-500/15 border border-violet-500/30 text-violet-300 font-bold" title="Tiempo total de permanencia de la jornada transcurrido desde la hora de entrada">
                    <Clock className="h-3.5 w-3.5 text-violet-400" />
                    <span className="text-[10px] uppercase font-sans font-bold text-violet-400/80">Jornada:</span>
                    <span>{serverMetrics?.totalWorkdayTime || `${Math.floor(agentDailyCompliance.workdayMinutes / 60)}h ${agentDailyCompliance.workdayMinutes % 60}m`}</span>
                  </div>

                  <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-xl bg-emerald-500/15 border border-emerald-500/30 text-emerald-300 font-bold">
                    <Activity className="h-3.5 w-3.5 text-emerald-400" />
                    <span className="text-[10px] uppercase font-sans font-bold text-emerald-400/80">Activo:</span>
                    <span>{serverMetrics?.totalActiveTime || `${Math.floor(agentDailyCompliance.activeMinutes / 60)}h ${agentDailyCompliance.activeMinutes % 60}m`}</span>
                  </div>
                  <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-xl bg-amber-500/15 border border-amber-500/30 text-amber-300 font-bold">
                    <Sandwich className="h-3.5 w-3.5 text-amber-400" />
                    <span className="text-[10px] uppercase font-sans font-bold text-amber-400/80">Descansos:</span>
                    <span>{serverMetrics?.totalBreakTime || `${agentDailyCompliance.breakMinutes}m`}</span>
                  </div>
                  <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-xl bg-muted/60 border border-border text-foreground">
                    <Monitor className="h-3.5 w-3.5 text-sky-400" />
                    <span className="text-[10px] uppercase font-sans font-bold text-muted-foreground">PC:</span>
                    <span className="font-bold">{serverMetrics?.pcWorkTime || agentDailyCompliance.pcWorkTime || "--"}</span>
                  </div>
                  <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-xl bg-cyan-500/10 border border-cyan-500/20 text-cyan-400">
                    <CheckCircle2 className="h-3.5 w-3.5" />
                    <span className="text-[10px] uppercase font-sans font-bold text-cyan-500/80">Justificación Manual:</span>
                    <span className="font-bold">{serverMetrics?.manualJustificationTime || agentDailyCompliance.manualJustificationTime || "0m"}</span>
                  </div>
                  <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-xl bg-rose-500/10 border border-rose-500/20 text-rose-300">
                    <Clock className="h-3.5 w-3.5" />
                    <span className="text-[10px] uppercase font-sans font-bold text-rose-400/80">Inactividad:</span>
                    <span className="font-bold">{serverMetrics?.totalIdleTime || agentDailyCompliance.totalIdleTime || "0m"}</span>
                  </div>
                </div>

                {/* 2. Estado de Horas Extras y Acciones Administrativas */}
                {agentDailyCompliance.overtimeMinutes > 0 ? (
                  <div className="flex items-center gap-2 flex-wrap">
                    {agentDailyCompliance.isOvertimeApproved ? (
                      <span className="px-2.5 py-1 rounded-xl bg-emerald-500/15 border border-emerald-500/30 text-emerald-400 font-bold flex items-center gap-1.5">
                        <CheckCircle2 className="h-3.5 w-3.5" />
                        Tiempo Extra Autorizado: +{Math.floor(agentDailyCompliance.overtimeMinutes / 60)}h {agentDailyCompliance.overtimeMinutes % 60}m
                      </span>
                    ) : (
                      <div className="flex items-center gap-2">
                        <span className="px-2.5 py-1 rounded-xl bg-amber-500/15 border border-amber-500/30 text-amber-400 font-bold flex items-center gap-1.5">
                          <Clock className="h-3.5 w-3.5 animate-pulse" />
                          Tiempo Extra Detectado (+{Math.floor(agentDailyCompliance.overtimeMinutes / 60)}h {agentDailyCompliance.overtimeMinutes % 60}m) — Topado a 10h (Sin autorizar)
                        </span>

                        {isAdmin && (
                          <div className="flex items-center gap-1">
                            <button
                              disabled={reviewingOvertime}
                              onClick={async () => {
                                setReviewingOvertime(true);
                                try {
                                  // 1. Asegurar solicitud
                                  await fetch("/api/activity/overtime", {
                                    method: "POST",
                                    headers: { "Content-Type": "application/json" },
                                    body: JSON.stringify({
                                      action: "request",
                                      agentEmail: selectedAgent,
                                      agentName: currentAgentObj?.name || selectedAgent,
                                      date: selectedDate,
                                      overtimeMinutes: agentDailyCompliance.overtimeMinutes,
                                      totalActiveMinutes: agentDailyCompliance.rawActiveMinutes,
                                    }),
                                  });
                                  // 2. Aprobar solicitud
                                  const reqId = `ot-${(selectedAgent || "").toLowerCase().trim()}-${selectedDate}`;
                                  await fetch("/api/activity/overtime", {
                                    method: "POST",
                                    headers: { "Content-Type": "application/json" },
                                    body: JSON.stringify({
                                      action: "review",
                                      id: reqId,
                                      status: "approved",
                                      reviewedBy: agentEmail || "admin@sekunet.com",
                                      notes: "Autorizado por la administración",
                                    }),
                                  });
                                  toast.success("Horas extras autorizadas con éxito.");
                                  fetchOvertime();
                                } catch (e) {
                                  toast.error("Error al autorizar horas extras");
                                } finally {
                                  setReviewingOvertime(false);
                                }
                              }}
                              className="px-2.5 py-1 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs flex items-center gap-1 shadow-sm transition-all"
                            >
                              <CheckCircle2 className="h-3.5 w-3.5" />
                              Autorizar Extra
                            </button>

                            <button
                              disabled={reviewingOvertime}
                              onClick={async () => {
                                setReviewingOvertime(true);
                                try {
                                  const reqId = `ot-${(selectedAgent || "").toLowerCase().trim()}-${selectedDate}`;
                                  await fetch("/api/activity/overtime", {
                                    method: "POST",
                                    headers: { "Content-Type": "application/json" },
                                    body: JSON.stringify({
                                      action: "review",
                                      id: reqId,
                                      status: "rejected",
                                      reviewedBy: agentEmail || "admin@sekunet.com",
                                      notes: "No autorizado",
                                    }),
                                  });
                                  toast.info("Horas extras denegadas. Se mantienen 10 horas.");
                                  fetchOvertime();
                                } catch (e) {
                                  toast.error("Error al procesar");
                                } finally {
                                  setReviewingOvertime(false);
                                }
                              }}
                              className="px-2.5 py-1 rounded-xl bg-rose-600/80 hover:bg-rose-600 text-white font-bold text-xs flex items-center gap-1 transition-all"
                            >
                              <XCircle className="h-3.5 w-3.5" />
                              Denegar
                            </button>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                ) : (
                  <span className="text-muted-foreground text-[11px]">
                    Sin excedente de jornada en esta fecha.
                  </span>
                )}
              </div>

              {/* Barra de Progreso Visual de la Jornada */}
              <div className="space-y-1">
                <div className="h-2.5 w-full bg-muted/40 rounded-full overflow-hidden p-0.5 border border-border/40">
                  <div
                    className={`h-full rounded-full transition-all duration-700 ${
                      agentDailyCompliance.isCompleted
                        ? "bg-gradient-to-r from-emerald-500 via-teal-400 to-emerald-400 shadow-sm shadow-emerald-500/30"
                        : "bg-gradient-to-r from-violet-600 via-indigo-500 to-violet-400 shadow-sm shadow-violet-500/20"
                    }`}
                    style={{ width: `${Math.min(100, agentDailyCompliance.percent)}%` }}
                  />
                </div>
              </div>
            </div>

            {/* Vista rápida de bitácora consolidada de 5 minutos */}
            <div className="p-5 rounded-2xl bg-card border border-border/70 shadow-sm space-y-3">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-sm font-bold text-foreground">Bitácora Operativa Consolidada (Intervalos de 5 min)</h3>
                  <p className="text-[11px] text-muted-foreground">Trazabilidad cronológica de actividades y tareas continuas del colaborador</p>
                </div>
                <button
                  onClick={() => setActiveTab("timeline")}
                  className="text-xs font-bold text-violet-400 hover:text-violet-300 flex items-center gap-1 transition-colors"
                >
                  Ver auditoría detallada <ChevronRight className="h-3.5 w-3.5" />
                </button>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-3 max-h-[400px] overflow-y-auto pr-1">
                {liveConsolidatedBlocks.slice(0, 8).map((block) => {
                  const Icon = CATEGORY_ICONS[block.category] || Activity;
                  const colorClass = CATEGORY_COLORS[block.category] || "text-zinc-400 bg-zinc-500/10 border-zinc-500/20";
                  return (
                    <div
                      key={block.id}
                      className="p-3.5 rounded-xl bg-muted/20 border border-border/50 hover:border-violet-500/30 transition-all flex items-start gap-3 text-xs"
                    >
                      <div className={`p-2 rounded-xl border shrink-0 ${colorClass}`}>
                        <Icon className="h-4 w-4" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="font-semibold text-foreground leading-relaxed text-justify">{block.narrative}</p>
                        <div className="flex items-center gap-2 mt-2 text-[11px] text-muted-foreground font-mono flex-wrap">
                          <span className="font-bold text-foreground/80">{block.startTime} – {block.endTime}</span>
                          {block.manualTask && (
                            <span className="px-1.5 py-0.5 rounded bg-emerald-500/15 border border-emerald-500/30 text-emerald-400 text-[10px] font-bold flex items-center gap-1">
                              <Wrench className="h-2.5 w-2.5" /> {block.manualTask}
                            </span>
                          )}
                          {block.apps.length > 0 && (
                            <>
                              <span>•</span>
                              <span className="font-sans text-muted-foreground truncate">{block.apps.join(", ")}</span>
                            </>
                          )}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        )}

        {/* PESTAÑA 2: LÍNEA DE TIEMPO PROFUNDA */}
        {activeTab === "timeline" && (
          <div className="space-y-4">
            {/* Selector de modo de vista: Bloques Consolidados vs Registro Detallado de Logs */}
            <div className="flex flex-wrap items-center justify-between gap-3 p-3 rounded-2xl bg-card border border-border/70 shadow-sm">
              <div className="flex items-center gap-1 bg-muted/40 p-1 rounded-xl border border-border/40">
                <button
                  onClick={() => setTimelineViewMode("consolidated")}
                  className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${
                    timelineViewMode === "consolidated"
                      ? "bg-violet-600 text-white shadow-sm"
                      : "text-muted-foreground hover:text-foreground"
                  }`}
                >
                  Bitácora Consolidada (5 min)
                </button>
                <button
                  onClick={() => setTimelineViewMode("logs")}
                  className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${
                    timelineViewMode === "logs"
                      ? "bg-violet-600 text-white shadow-sm"
                      : "text-muted-foreground hover:text-foreground"
                  }`}
                >
                  Registro Detallado de Eventos (Logs)
                </button>
              </div>

              {/* Filtro rápido: Solo Labores Manuales */}
              <button
                onClick={() => setOnlyManualFilter(!onlyManualFilter)}
                className={`px-3 py-1.5 rounded-xl border text-xs font-bold transition-all flex items-center gap-1.5 ${
                  onlyManualFilter
                    ? "bg-emerald-500/15 border-emerald-500/40 text-emerald-400 shadow-sm"
                    : "bg-background border-border/60 hover:bg-muted text-muted-foreground hover:text-foreground"
                }`}
              >
                <Wrench className="h-3.5 w-3.5 text-emerald-400" />
                <span>Solo Labores Manuales & Físicas</span>
                {onlyManualFilter && <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" />}
              </button>
            </div>

            {/* Barra de Filtros y Búsqueda */}
            <div className="p-4 rounded-2xl bg-card border border-border/70 shadow-sm flex flex-col sm:flex-row items-center justify-between gap-3">
              <div className="flex items-center gap-2 w-full sm:w-auto">
                <div className="relative flex-1 sm:w-64">
                  <Search className="h-3.5 w-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
                  <input
                    type="text"
                    placeholder="Buscar en eventos y reportes..."
                    value={searchFilter}
                    onChange={(e) => setSearchFilter(e.target.value)}
                    className="w-full pl-9 pr-3 py-1.5 rounded-xl border border-border bg-background text-xs text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-violet-500"
                  />
                </div>

                <select
                  value={categoryFilter}
                  onChange={(e) => setCategoryFilter(e.target.value)}
                  className="px-3 py-1.5 rounded-xl border border-border bg-background text-xs text-foreground focus:outline-none focus:ring-1 focus:ring-violet-500 [color-scheme:light] dark:[color-scheme:dark]"
                >
                  <option value="all" className="bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100">Todas las categorías</option>
                  {categoriesAvailable.map((c) => (
                    <option key={c} value={c} className="bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100">
                      {c}
                    </option>
                  ))}
                </select>
              </div>

              {timelineViewMode === "consolidated" ? (
                <span className="text-xs text-muted-foreground font-semibold">
                  Mostrando {filteredConsolidatedBlocks.length} intervalos consolidados {scheduleEnabled && `(${scheduleStart} – ${scheduleEnd})`}
                </span>
              ) : (
                <span className="text-xs text-muted-foreground font-semibold">
                  Mostrando {Math.min(visibleLogs.length, filteredTimeline.length)} de {filteredTimeline.length} eventos registrados {scheduleEnabled && `(${scheduleStart} – ${scheduleEnd})`}
                </span>
              )}
            </div>

            {/* MODO 1: Lista Cronológica Consolidada en Bloques de 5 Minutos */}
            {timelineViewMode === "consolidated" && (
              <div className="space-y-3">
                {filteredConsolidatedBlocks.length === 0 ? (
                  <div className="p-12 text-center rounded-2xl bg-card border border-border/70 text-muted-foreground text-xs">
                    No hay registros operativos para esta fecha, horario o filtros.
                  </div>
                ) : (
                  filteredConsolidatedBlocks.map((block) => {
                    const Icon = CATEGORY_ICONS[block.category] || Activity;
                    const colorClass = CATEGORY_COLORS[block.category] || "text-zinc-400 bg-zinc-500/10 border-zinc-500/20";

                    return (
                      <div
                        key={block.id}
                        className="p-5 rounded-2xl bg-card border border-border/70 hover:border-violet-500/40 transition-all flex flex-col sm:flex-row sm:items-start justify-between gap-4 text-xs"
                      >
                        <div className="flex items-start gap-3.5 min-w-0 flex-1">
                          <div className={`p-2.5 rounded-xl border shrink-0 mt-0.5 ${colorClass}`}>
                            <Icon className="h-4 w-4" />
                          </div>
                          <div className="min-w-0 flex-1 space-y-2">
                            <p className="font-medium text-foreground text-sm leading-relaxed text-justify">
                              {block.narrative}
                            </p>

                            <div className="flex flex-wrap items-center gap-2 text-[11px] text-muted-foreground">
                              <span className="font-semibold px-2 py-0.5 rounded-lg bg-muted/60 border border-border/40 text-foreground/80">
                                {block.category}
                              </span>
                              {block.manualTask && (
                                <span className="px-2 py-0.5 rounded-lg bg-emerald-500/15 border border-emerald-500/30 text-emerald-400 font-bold flex items-center gap-1">
                                  <Wrench className="h-3 w-3" /> Labor: {block.manualTask}
                                </span>
                              )}
                              {block.apps.map((app) => (
                                <span
                                  key={app}
                                  className="px-2 py-0.5 rounded-lg bg-muted/40 border border-border/40 text-muted-foreground font-medium"
                                >
                                  {app}
                                </span>
                              ))}
                            </div>
                          </div>
                        </div>

                        {/* Columna Horaria Lateral */}
                        <div className="flex sm:flex-col items-end justify-between sm:justify-start gap-1 shrink-0 font-mono text-[11px] self-stretch sm:self-auto border-t sm:border-t-0 pt-2 sm:pt-0 border-border/40">
                          <span className="font-bold text-foreground text-xs">
                            {block.startTime} – {block.endTime}
                          </span>
                          <span className="text-muted-foreground text-[10px]">
                            Bloque 5 min
                          </span>
                        </div>
                      </div>
                    );
                  })
                )}
              </div>
            )}

            {/* MODO 2: Registro Detallado de Eventos (Logs) con Reclasificación Directa */}
            {timelineViewMode === "logs" && (
              <div className="space-y-2">
                {visibleLogs.length === 0 ? (
                  <div className="p-12 text-center rounded-2xl bg-card border border-border/70 text-muted-foreground text-xs">
                    No hay eventos registrados para los filtros u horario seleccionados.
                  </div>
                ) : (
                  visibleLogs.map((item, idx) => {
                    const itemDate = item.created_at ? new Date(item.created_at) : null;
                    const timeStr = itemDate
                      ? itemDate.toLocaleTimeString("es-CR", { hour: "2-digit", minute: "2-digit", second: "2-digit" })
                      : "--:--";
                    const meta = (item.metadata || {}) as Record<string, any>;
                    const cleanApp = extractCleanItemName(item as any);
                    const cleanTitle = cleanExecutiveTitle(meta.title || meta.window_title || "");
                    const isManual = isManualEntry(item);

                    const currentCat = item.category || "Sin Clasificar";
                    const categoryDef = DEFAULT_CATEGORIES.find(
                      (c) => c.id.toLowerCase() === currentCat.toLowerCase() || c.label.toLowerCase() === currentCat.toLowerCase()
                    );
                    const currentSubcat = meta.manual_subcategory || meta.subcategory || "";

                    const isSystemState = item.category === "Inactividad" || 
                                          cleanApp.toLowerCase().includes("inactiv") || 
                                          cleanApp.toLowerCase().includes("pausa operativa") || 
                                          (item.action && item.action.toLowerCase().includes("sin actividad")) ||
                                          (item.action && item.action.toLowerCase().includes("inicio de sesión")) ||
                                          (item.action && item.action.toLowerCase().includes("cierre de sesión"));

                    const Icon = CATEGORY_ICONS[item.category] || Activity;
                    const colorClass = CATEGORY_COLORS[item.category] || "text-zinc-400 bg-zinc-500/10 border-zinc-500/20";
                    const durSeconds = item.duration_ms
                      ? Math.round(item.duration_ms / 1000)
                      : meta.duration_seconds || (meta.minutes ? meta.minutes * 60 : null);

                    return (
                      <div
                        key={item.id || `log-${idx}`}
                        className={`p-3.5 rounded-2xl bg-card border transition-all flex flex-col lg:flex-row lg:items-center justify-between gap-3 text-xs ${
                          isManual
                            ? "border-emerald-500/40 bg-emerald-500/5 hover:border-emerald-500/60"
                            : isSystemState
                            ? "border-border/40 bg-muted/10 opacity-80"
                            : "border-border/60 hover:border-violet-500/30"
                        }`}
                      >
                        {/* Lado Izquierdo: Software detectado, contexto y categoría actual */}
                        <div className="flex items-center gap-3 min-w-0 flex-1">
                          <div className={`p-2 rounded-xl border shrink-0 ${colorClass}`}>
                            <Icon className="h-4 w-4" />
                          </div>

                          <div className="min-w-0 flex-1 space-y-0.5">
                            <div className="flex items-center gap-2 flex-wrap">
                              <span className="font-bold text-foreground text-sm tracking-tight truncate max-w-xs">
                                {cleanApp}
                              </span>
                              {isManual && (
                                <span className="px-2 py-0.5 rounded-md bg-emerald-500/15 border border-emerald-500/30 text-emerald-400 text-[10px] font-bold flex items-center gap-1">
                                  <Wrench className="h-2.5 w-2.5" /> Labor Manual
                                </span>
                              )}
                              {meta.task && meta.task !== cleanApp && (
                                <span className="px-2 py-0.5 rounded-md bg-violet-500/15 border border-violet-500/30 text-violet-300 text-[10px] font-medium truncate max-w-[180px]">
                                  {meta.task}
                                </span>
                              )}
                              <span className={`px-2 py-0.5 rounded-md text-[10px] font-bold border ${colorClass}`}>
                                {item.category}
                              </span>
                            </div>

                            <div className="flex items-center gap-2 text-[11px] text-muted-foreground truncate">
                              {cleanTitle && cleanTitle !== cleanApp ? (
                                <span className="truncate max-w-md text-foreground/80 font-medium">
                                  {cleanTitle}
                                </span>
                              ) : item.action && item.action !== cleanApp ? (
                                <span className="truncate max-w-md">{item.action}</span>
                              ) : null}
                              {meta.source && (
                                <span className="text-[10px] opacity-60">({meta.source})</span>
                              )}
                            </div>
                          </div>
                        </div>

                        {/* Lado Derecho: Gestión Inmediata de Reclasificación + Duración + Hora */}
                        <div className="flex items-center justify-between lg:justify-end gap-3 shrink-0 pt-2 lg:pt-0 border-t lg:border-t-0 border-border/40">
                          {/* Controles de Reclasificación 1-Click (Solo para apps y tareas, nunca para inactividad) */}
                          {isSystemState ? (
                            <span className="px-2.5 py-1 rounded-xl bg-zinc-500/10 border border-zinc-500/20 text-zinc-400 font-semibold text-[11px] flex items-center gap-1.5 shrink-0">
                              <Clock className="h-3 w-3 text-zinc-400" /> Evento de Sistema
                            </span>
                          ) : (
                            <div className="flex items-center gap-1.5 flex-shrink-0">
                              {/* Selector de Categoría */}
                              <div className="flex items-center gap-1 bg-muted/40 hover:bg-muted/70 border border-border/50 rounded-xl px-2 py-1 transition-colors">
                                <span className="text-[10px] uppercase font-bold text-muted-foreground/70">Cat:</span>
                                <select
                                  value={categoryDef ? categoryDef.id : currentCat}
                                  disabled={reclassifyingId === item.id}
                                  onChange={(e) => {
                                    const newCat = e.target.value;
                                    const found = DEFAULT_CATEGORIES.find((c) => c.id === newCat);
                                    const firstSub = found?.subcategories?.[0] || "";
                                    handleReclassifyLog(item, newCat, firstSub);
                                  }}
                                  className="bg-transparent text-xs font-semibold text-foreground focus:outline-none cursor-pointer [color-scheme:light] dark:[color-scheme:dark]"
                                  title="Reclasificar categoría de este evento y guardar regla en el sistema"
                                >
                                  {DEFAULT_CATEGORIES.map((cat) => (
                                    <option key={cat.id} value={cat.id} className="bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100">
                                      {cat.label}
                                    </option>
                                  ))}
                                </select>
                              </div>

                              {/* Selector de Subcategoría (dinámico) */}
                              {categoryDef && categoryDef.subcategories && categoryDef.subcategories.length > 0 && (
                                <div className="flex items-center gap-1 bg-muted/30 hover:bg-muted/60 border border-border/40 rounded-xl px-2 py-1 transition-colors">
                                  <span className="text-[10px] uppercase font-bold text-muted-foreground/60">Sub:</span>
                                  <select
                                    value={currentSubcat || categoryDef.subcategories[0]}
                                    disabled={reclassifyingId === item.id}
                                    onChange={(e) => handleReclassifyLog(item, currentCat, e.target.value)}
                                    className="bg-transparent text-xs text-muted-foreground hover:text-foreground focus:outline-none cursor-pointer max-w-[140px] truncate [color-scheme:light] dark:[color-scheme:dark]"
                                    title="Reclasificar subcategoría"
                                  >
                                    {categoryDef.subcategories.map((sub) => (
                                      <option key={sub} value={sub} className="bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100">
                                        {sub}
                                      </option>
                                    ))}
                                  </select>
                                </div>
                              )}

                              {reclassifyingId === item.id && (
                                <RefreshCw className="h-3.5 w-3.5 animate-spin text-violet-400 shrink-0" />
                              )}
                            </div>
                          )}

                          {/* Duración y Hora */}
                          <div className="flex items-center gap-2 font-mono text-[11px] shrink-0">
                            {durSeconds && durSeconds > 0 ? (
                              <span className="px-2 py-0.5 rounded-lg bg-muted/60 border border-border/40 font-bold text-foreground/90 whitespace-nowrap">
                                {durSeconds >= 60 ? `${Math.floor(durSeconds / 60)}m ${durSeconds % 60}s` : `${durSeconds}s`}
                              </span>
                            ) : null}
                            <span className="font-bold text-foreground text-xs whitespace-nowrap">
                              {timeStr}
                            </span>

                            {/* Acciones Administrativas: Editar y Eliminar */}
                            <div className="flex items-center gap-1 pl-1 ml-1 border-l border-border/50">
                              <button
                                type="button"
                                onClick={() => handleOpenEditLog(item)}
                                className="h-7 w-7 rounded-lg bg-muted/50 hover:bg-violet-600/20 hover:text-violet-400 text-muted-foreground grid place-items-center transition-all cursor-pointer"
                                title="Ajustar duración, categoría o motivo del registro"
                              >
                                <Pencil className="h-3.5 w-3.5" />
                              </button>
                              <button
                                type="button"
                                onClick={() => handleDeleteLog(item)}
                                disabled={deletingLogId === item.id}
                                className="h-7 w-7 rounded-lg bg-muted/50 hover:bg-rose-600/20 hover:text-rose-400 text-muted-foreground grid place-items-center transition-all cursor-pointer disabled:opacity-50"
                                title="Anular o eliminar este registro erróneo"
                              >
                                {deletingLogId === item.id ? (
                                  <RefreshCw className="h-3 w-3 animate-spin text-rose-400" />
                                ) : (
                                  <Trash2 className="h-3.5 w-3.5" />
                                )}
                              </button>
                            </div>
                          </div>
                        </div>
                      </div>
                    );
                  })
                )}

                {/* Botón de paginación para fluidez total del scroll */}
                {reversedLogs.length > visibleLogsCount && (
                  <div className="pt-3 pb-2 flex items-center justify-center gap-3">
                    <button
                      onClick={() => setVisibleLogsCount((prev) => prev + 60)}
                      className="px-4 py-2 rounded-xl border border-border/70 bg-card hover:bg-muted text-xs font-bold text-foreground transition-colors shadow-sm flex items-center gap-2"
                    >
                      <span>Cargar más eventos (+60)</span>
                      <span className="text-muted-foreground font-normal">
                        ({visibleLogs.length} de {reversedLogs.length})
                      </span>
                    </button>
                    <button
                      onClick={() => setVisibleLogsCount(reversedLogs.length)}
                      className="px-3 py-2 rounded-xl border border-border/50 text-xs font-semibold text-muted-foreground hover:text-foreground transition-colors"
                    >
                      Ver todos ({reversedLogs.length})
                    </button>
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        {/* PESTAÑA 3: CAPTURAS DE PANTALLA */}
        {activeTab === "screenshots" && (
          <ActivityScreenGallery
            agentEmail={selectedAgent}
            agentName={currentAgentObj?.name || selectedAgent}
            date={selectedDate}
            endDate={selectedEndDate}
          />
        )}

        {/* PESTAÑA 2: PRODUCTIVIDAD & APLICACIONES */}
        {activeTab === "apps" && (
          <div className="space-y-6">
            <div className="grid grid-cols-1 gap-6">
              <ActivityAppsRanking
                timeline={timeline}
                scheduleStart={scheduleStart}
                scheduleEnd={scheduleEnd}
                scheduleEnabled={scheduleEnabled}
                workDays={workDays}
                toleranceMinutes={toleranceMinutes}
                useMixedSchedule={useMixedSchedule}
                daySchedules={daySchedules}
                onAppMappingsChange={(newMap) => setAppMappings(newMap)}
              />
            </div>
          </div>
        )}

        {/* PESTAÑA 3: ANALÍTICAS & ESTADÍSTICAS (INDIVIDUALES Y GRUPALES) */}
        {activeTab === "analytics" && (
          <ActivityAnalyticsTab
            agents={liveAgents}
            selectedAgent={selectedAgent}
            onSelectAgent={(email) => setSelectedAgent(email)}
            selectedDate={selectedDate}
            selectedEndDate={selectedEndDate}
            onDateChange={(date, endDate) => {
              setSelectedDate(date);
              setSelectedEndDate(endDate);
              setDateRangeMode(endDate ? "range" : "single");
            }}
            individualTimeline={timelineWithinSchedule}
            scheduleStart={scheduleStart}
            scheduleEnd={scheduleEnd}
            compliance={agentDailyCompliance}
            serverMetrics={serverMetrics}
            toleranceMinutes={toleranceMinutes}
            useMixedSchedule={useMixedSchedule}
            daySchedules={daySchedules}
            appMappings={appMappings}
            onRefresh={() => {
              fetchLive();
              fetchTimeline();
            }}
            refreshing={refreshing}
          />
        )}

        {/* PESTAÑA 5: DICTAMEN IA & REPORTES */}
        {activeTab === "briefing" && (
          <ActivityAiBriefing
            agentEmail={selectedAgent}
            agentName={currentAgentObj?.name || selectedAgent}
            date={selectedDate}
            endDate={selectedEndDate}
            timeline={timeline}
            allAgents={liveAgents}
          />
        )}
      </div>

      {/* ── MODAL ULTRA-PREMIUM DE AJUSTE ADMINISTRATIVO DE REGISTROS ── */}
      {editingLog && (
        <div 
          className="fixed inset-0 z-50 bg-black/75 backdrop-blur-sm flex items-center justify-center p-4 animate-in fade-in duration-150"
          onClick={() => setEditingLog(null)}
        >
          <div
            className="w-full max-w-md rounded-2xl bg-card border border-border/80 shadow-2xl p-6 space-y-4 animate-in zoom-in-95 duration-150 text-foreground"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between pb-3 border-b border-border/60">
              <div className="flex items-center gap-2.5">
                <div className="h-9 w-9 rounded-xl bg-violet-600/20 border border-violet-500/30 text-violet-400 grid place-items-center">
                  <Pencil className="h-4 w-4" />
                </div>
                <div>
                  <h3 className="font-bold text-sm text-foreground">Ajuste Administrativo</h3>
                  <p className="text-[11px] text-muted-foreground">
                    Modificar duración o reclasificar registro de actividad
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setEditingLog(null)}
                className="h-8 w-8 rounded-lg bg-muted/60 hover:bg-muted text-muted-foreground hover:text-foreground grid place-items-center transition-colors cursor-pointer"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            {/* Contexto del registro */}
            <div className="p-3 rounded-xl bg-muted/30 border border-border/50 text-xs space-y-1">
              <div className="flex justify-between text-muted-foreground">
                <span>Agente:</span>
                <span className="font-semibold text-foreground">{editingLog.agent_name || editingLog.agent_email}</span>
              </div>
              <div className="flex justify-between text-muted-foreground">
                <span>Fecha / Hora:</span>
                <span className="font-mono text-foreground">
                  {editingLog.created_at ? new Date(editingLog.created_at).toLocaleString("es-CR") : "--"}
                </span>
              </div>
              <div className="flex justify-between text-muted-foreground">
                <span>Acción original:</span>
                <span className="font-medium text-foreground truncate max-w-[200px]" title={editingLog.action}>
                  {editingLog.action}
                </span>
              </div>
            </div>

            {/* Formulario */}
            <div className="space-y-3 text-xs">
              <div>
                <label className="font-bold text-muted-foreground block mb-1">
                  Duración computable (en minutos):
                </label>
                <div className="flex items-center gap-2">
                  <input
                    type="number"
                    min="0"
                    max="1440"
                    value={editDurationMin}
                    onChange={(e) => setEditDurationMin(e.target.value)}
                    className="w-full px-3 py-2 rounded-xl bg-background border border-border/70 text-foreground font-mono font-bold focus:outline-none focus:ring-2 focus:ring-violet-500"
                    placeholder="Ej. 45"
                  />
                  <span className="text-muted-foreground font-semibold">minutos</span>
                </div>
                <span className="text-[10px] text-muted-foreground mt-0.5 block">
                  Equivale a: {Math.floor((parseInt(editDurationMin, 10) || 0) / 60)}h {(parseInt(editDurationMin, 10) || 0) % 60}m
                </span>
              </div>

              <div>
                <label className="font-bold text-muted-foreground block mb-1">Categoría oficial:</label>
                <select
                  value={editCategory}
                  onChange={(e) => {
                    setEditCategory(e.target.value);
                    const found = DEFAULT_CATEGORIES.find((c) => c.id === e.target.value);
                    if (found && found.subcategories?.[0]) {
                      setEditSubcategory(found.subcategories[0]);
                    }
                  }}
                  className="w-full px-3 py-2 rounded-xl bg-background border border-border/70 text-foreground font-semibold focus:outline-none focus:ring-2 focus:ring-violet-500 cursor-pointer [color-scheme:light] dark:[color-scheme:dark]"
                >
                  {DEFAULT_CATEGORIES.map((cat) => (
                    <option key={cat.id} value={cat.id} className="bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100">
                      {cat.label}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="font-bold text-muted-foreground block mb-1">Subcategoría:</label>
                {(() => {
                  const catDef = DEFAULT_CATEGORIES.find((c) => c.id === editCategory);
                  if (catDef && catDef.subcategories && catDef.subcategories.length > 0) {
                    return (
                      <select
                        value={editSubcategory || catDef.subcategories[0]}
                        onChange={(e) => setEditSubcategory(e.target.value)}
                        className="w-full px-3 py-2 rounded-xl bg-background border border-border/70 text-foreground font-semibold focus:outline-none focus:ring-2 focus:ring-violet-500 cursor-pointer [color-scheme:light] dark:[color-scheme:dark]"
                      >
                        {catDef.subcategories.map((sub) => (
                          <option key={sub} value={sub} className="bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100">
                            {sub}
                          </option>
                        ))}
                      </select>
                    );
                  }
                  return (
                    <input
                      type="text"
                      value={editSubcategory}
                      onChange={(e) => setEditSubcategory(e.target.value)}
                      placeholder="Subcategoría opcional"
                      className="w-full px-3 py-2 rounded-xl bg-background border border-border/70 text-foreground font-medium focus:outline-none focus:ring-2 focus:ring-violet-500"
                    />
                  );
                })()}
              </div>

              <div>
                <label className="font-bold text-muted-foreground block mb-1">Título / Acción visible:</label>
                <input
                  type="text"
                  value={editAction}
                  onChange={(e) => setEditAction(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl bg-background border border-border/70 text-foreground font-medium focus:outline-none focus:ring-2 focus:ring-violet-500"
                  placeholder="Descripción de la actividad"
                />
              </div>

              <div>
                <label className="font-bold text-muted-foreground block mb-1">
                  Motivo del ajuste (Auditoría administrativa):
                </label>
                <input
                  type="text"
                  value={editReason}
                  onChange={(e) => setEditReason(e.target.value)}
                  placeholder="Ej. Temporizador dejado en segundo plano por error"
                  className="w-full px-3 py-2 rounded-xl bg-background border border-border/70 text-foreground font-medium focus:outline-none focus:ring-2 focus:ring-violet-500"
                />
              </div>
            </div>

            {/* Botones de acción */}
            <div className="flex items-center justify-end gap-2 pt-3 border-t border-border/60">
              <button
                type="button"
                onClick={() => setEditingLog(null)}
                className="px-4 py-2 rounded-xl border border-border/60 hover:bg-muted font-bold text-xs text-muted-foreground hover:text-foreground transition-colors cursor-pointer"
              >
                Cancelar
              </button>
              <button
                type="button"
                disabled={savingEdit}
                onClick={handleSaveEditLog}
                className="px-4 py-2 rounded-xl bg-violet-600 hover:bg-violet-700 text-white font-bold text-xs shadow-md shadow-violet-600/25 transition-all cursor-pointer flex items-center gap-1.5 disabled:opacity-50"
              >
                {savingEdit ? (
                  <>
                    <RefreshCw className="h-3.5 w-3.5 animate-spin" />
                    Guardando...
                  </>
                ) : (
                  <>
                    <CheckCircle2 className="h-3.5 w-3.5" />
                    Aplicar Corrección
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}