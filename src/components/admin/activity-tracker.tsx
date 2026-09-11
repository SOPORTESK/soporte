"use client";

import React, { useState, useEffect, useCallback } from "react";
import { toast } from "sonner";
import {
  Activity,
  Clock,
  TrendingUp,
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
} from "lucide-react";
import { Avatar } from "@/components/ui/avatar";
import { ActivityLivePulse, type LiveAgent } from "./activity-live-pulse";
import { ActivityHeatmap } from "./activity-heatmap";
import { ActivityAppsRanking } from "./activity-apps-ranking";
import { ActivityScreenGallery } from "./activity-screen-gallery";
import { ActivityAiBriefing } from "./activity-ai-briefing";

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
  "Pausa personal": Bath,
  "Atención presencial": UserPlus,
  "Inventario": ClipboardList,
  "Mantenimiento": Sparkles,
  "Soporte comercial": Briefcase,
  "Capacitación": GraduationCap,
  "Reunión interna": Users,
  "Justificación": ClipboardList,
  "Otros": Activity,
};

const CATEGORY_COLORS: Record<string, string> = {
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

  // 14. Justificaciones de tiempo presencial
  if (meta.justification || lower.startsWith("justificación:") || lower.startsWith("justificacion:")) {
    const reason = meta.reason || action.replace(/^justificaci[oó]n:\s*/i, "").split("(")[0].trim();
    return {
      title: `Justificación de tiempo: ${reason}`,
      subtitle: meta.minutes ? `Tiempo justificado: ${meta.minutes} min` : "Justificación de labor presencial",
    };
  }

  // 15. Pausas e Inactividad
  if (category === "Inactividad" || lower.includes("sin actividad") || lower.includes("pausa prolongada") || lower.includes("bloqueada")) {
    return {
      title: "Pausa operativa / Período sin interacción activa en la estación",
      subtitle: cleanTitle ? `Última aplicación en pantalla: ${cleanTitle}` : "Pausa del sistema",
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
    if (raw.includes("baño") || item.category === "Pausa personal") {
      return `Pausa personal operativa.`;
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
  scheduleEnabled?: boolean
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

    // Si el horario laboral está activo, omitir eventos fuera de rango
    if (scheduleEnabled) {
      const d = new Date(time);
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
      const isManual = Boolean(
        meta.manual ||
        meta.task ||
        meta.justification ||
        act.startsWith("inició:") ||
        act.startsWith("inicio:") ||
        act.startsWith("terminó:") ||
        act.startsWith("termino:") ||
        act.startsWith("justificación:") ||
        act.startsWith("justificacion:")
      );

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

export function ActivityTracker({ agentEmail, agentName, isAdmin = false }: Props) {
  const defaultEmail = agentEmail || "cbatista@sekunet.com";
  const [liveAgents, setLiveAgents] = useState<LiveAgent[]>([]);
  const [selectedAgent, setSelectedAgent] = useState<string | undefined>(defaultEmail);
  const [selectedDate, setSelectedDate] = useState(new Date().toISOString().split("T")[0]);
  const [activeTab, setActiveTab] = useState<"live" | "timeline" | "screenshots" | "apps" | "briefing">("live");

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

  const [timelineViewMode, setTimelineViewMode] = useState<"consolidated" | "logs">("consolidated");
  const [onlyManualFilter, setOnlyManualFilter] = useState<boolean>(false);

  const handleScheduleChange = (start: string, end: string, enabled = true) => {
    setScheduleStart(start);
    setScheduleEnd(end);
    setScheduleEnabled(enabled);
    try {
      localStorage.setItem("sekunet_activity_schedule_start", start);
      localStorage.setItem("sekunet_activity_schedule_end", end);
      localStorage.setItem("sekunet_activity_schedule_enabled", enabled ? "true" : "false");
    } catch {}
  };

  const handleToggleSchedule = (enabled: boolean) => {
    setScheduleEnabled(enabled);
    try {
      localStorage.setItem("sekunet_activity_schedule_enabled", enabled ? "true" : "false");
    } catch {}
  };

  // Cargar estado en vivo de agentes
  const fetchLive = useCallback(async () => {
    try {
      const res = await fetch("/api/activity/live");
      const data = await res.json();
      if (data.ok && data.agents) {
        setLiveAgents(data.agents);
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

  // Cargar timeline del agente y fecha seleccionados
  const fetchTimeline = useCallback(async () => {
    if (!selectedAgent) return;
    setRefreshing(true);
    try {
      const res = await fetch(`/api/activity/timeline?agent=${encodeURIComponent(selectedAgent)}&date=${selectedDate}`);
      const data = await res.json();
      setTimeline(data.timeline || []);
    } catch (e) {
      console.error("[tracker] error fetching timeline:", e);
    } finally {
      setRefreshing(false);
      setLoading(false);
    }
  }, [selectedAgent, selectedDate]);

  useEffect(() => {
    fetchLive();
  }, [fetchLive]);

  useEffect(() => {
    fetchTimeline();
  }, [fetchTimeline]);

  // Auto-refresco periódico
  useEffect(() => {
    if (autoRefreshSec <= 0) return;
    const interval = setInterval(() => {
      fetchLive();
      fetchTimeline();
    }, autoRefreshSec * 1000);
    return () => clearInterval(interval);
  }, [autoRefreshSec, fetchLive, fetchTimeline]);

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
        if (!entry.created_at) return false;
        const d = new Date(entry.created_at);
        if (isNaN(d.getTime())) return false;
        const minOfDay = d.getHours() * 60 + d.getMinutes();
        return minOfDay >= startMin && minOfDay < endMin;
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
      const meta = (item.metadata || {}) as Record<string, any>;
      const act = (item.action || "").toLowerCase();
      const isManual = Boolean(
        meta.manual ||
        meta.task ||
        meta.justification ||
        act.startsWith("inició:") ||
        act.startsWith("inicio:") ||
        act.startsWith("terminó:") ||
        act.startsWith("termino:") ||
        act.startsWith("justificación:") ||
        act.startsWith("justificacion:")
      );
      if (isManual) return true;

      const itemMs = new Date(item.created_at).getTime();
      const inManual = manualRanges.some((r) => itemMs >= r.startMs && itemMs <= r.endMs);
      return !inManual;
    });
  }, [timeline, scheduleEnabled, scheduleStart, scheduleEnd]);

  // Filtrado final de timeline según filtros de UI
  const filteredTimeline = React.useMemo(() => {
    let list = timelineWithinSchedule;

    if (onlyManualFilter) {
      list = list.filter((item) => {
        const meta = (item.metadata || {}) as Record<string, any>;
        const act = (item.action || "").toLowerCase();
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
          item.category === "Labores manuales" ||
          item.category === "Capacitación" ||
          item.category === "Tiempo de descanso" ||
          item.category === "Pausa personal"
        );
      });
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

        {/* Controles de horario laboral, fecha y refresco */}
        <div className="flex flex-wrap items-center gap-2.5">
          {/* Selector de Horario Laboral Manual (Fuera de rango NADA se mide) */}
          <div className="flex items-center gap-2 px-3 py-1.5 rounded-xl border border-border bg-background shadow-sm text-xs font-semibold">
            <button
              onClick={() => handleToggleSchedule(!scheduleEnabled)}
              className={`flex items-center gap-1.5 transition-colors ${
                scheduleEnabled ? "text-violet-400" : "text-muted-foreground line-through opacity-70"
              }`}
              title={scheduleEnabled ? "Horario manual activo (clic para desactivar filtro)" : "Horario desactivado (24h)"}
            >
              <Clock className="h-3.5 w-3.5 text-violet-500" />
              <span className="text-[11px] font-bold">Horario:</span>
            </button>

            <div className="flex items-center gap-1.5">
              <input
                type="time"
                value={scheduleStart}
                onChange={(e) => handleScheduleChange(e.target.value, scheduleEnd, true)}
                className="bg-transparent text-foreground focus:outline-none cursor-pointer font-mono text-xs w-[48px] text-center [&::-webkit-calendar-picker-indicator]:hidden p-0 border-b border-border/60 hover:border-violet-500 transition-colors"
                title="Hora de inicio de jornada"
              />
              <span className="text-muted-foreground text-xs font-normal">a</span>
              <input
                type="time"
                value={scheduleEnd}
                onChange={(e) => handleScheduleChange(scheduleStart, e.target.value, true)}
                className="bg-transparent text-foreground focus:outline-none cursor-pointer font-mono text-xs w-[48px] text-center [&::-webkit-calendar-picker-indicator]:hidden p-0 border-b border-border/60 hover:border-violet-500 transition-colors"
                title="Hora de fin de jornada"
              />
            </div>
          </div>

          {/* Selector de fecha */}
          <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-border bg-background shadow-sm text-xs font-semibold">
            <Calendar className="h-3.5 w-3.5 text-muted-foreground" />
            <input
              type="date"
              value={selectedDate}
              onChange={(e) => setSelectedDate(e.target.value)}
              className="bg-transparent text-foreground focus:outline-none cursor-pointer"
            />
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
              <span className="truncate max-w-[130px]">{ag.name.split(" ")[0]}</span>
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
          { id: "timeline", label: "Línea de Tiempo", icon: Clock },
          { id: "screenshots", label: "Capturas de Pantalla", icon: Camera },
          { id: "apps", label: "Apps y Sitios Web", icon: Monitor },
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
            />

            {/* Heatmap de Intensidad */}
            <ActivityHeatmap timeline={timelineWithinSchedule} date={selectedDate} />

            {/* Top Apps y Resumen en 2 Columnas */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              <ActivityAppsRanking
                timeline={timeline}
                scheduleStart={scheduleStart}
                scheduleEnd={scheduleEnd}
                scheduleEnabled={scheduleEnabled}
              />

              {/* Vista rápida de informes narrados de 5 minutos */}
              <div className="p-5 rounded-2xl bg-card border border-border/70 shadow-sm space-y-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Sparkles className="h-4 w-4 text-violet-500" />
                    <h3 className="font-bold text-sm text-foreground">Informes de Actividad (Bloques de 5 Minutos)</h3>
                  </div>
                  <button
                    onClick={() => setActiveTab("timeline")}
                    className="text-xs font-bold text-violet-400 hover:text-violet-300 flex items-center gap-1"
                  >
                    Ver historial completo <ChevronRight className="h-3.5 w-3.5" />
                  </button>
                </div>

                <div className="space-y-2.5 max-h-[350px] overflow-y-auto pr-1">
                  {consolidateTimelineByBlocks(timelineWithinSchedule, 5, scheduleStart, scheduleEnd, scheduleEnabled).slice(0, 6).map((block) => {
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
                  Informes Narrados (Bloques 5 min)
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
                  className="px-3 py-1.5 rounded-xl border border-border bg-background text-xs text-foreground focus:outline-none focus:ring-1 focus:ring-violet-500"
                >
                  <option value="all">Todas las categorías</option>
                  {categoriesAvailable.map((c) => (
                    <option key={c} value={c}>
                      {c}
                    </option>
                  ))}
                </select>
              </div>

              {timelineViewMode === "consolidated" ? (
                (() => {
                  const blocks = consolidateTimelineByBlocks(filteredTimeline, 5, scheduleStart, scheduleEnd, scheduleEnabled);
                  return (
                    <span className="text-xs text-muted-foreground font-semibold">
                      Mostrando {blocks.length} informes narrados {scheduleEnabled && `(${scheduleStart} – ${scheduleEnd})`}
                    </span>
                  );
                })()
              ) : (
                <span className="text-xs text-muted-foreground font-semibold">
                  Mostrando {filteredTimeline.length} eventos registrados {scheduleEnabled && `(${scheduleStart} – ${scheduleEnd})`}
                </span>
              )}
            </div>

            {/* MODO 1: Lista Cronológica Consolidada en Bloques de 5 Minutos */}
            {timelineViewMode === "consolidated" && (
              <div className="space-y-3">
                {(() => {
                  const blocks = consolidateTimelineByBlocks(filteredTimeline, 5, scheduleStart, scheduleEnd, scheduleEnabled);
                  if (blocks.length === 0) {
                    return (
                      <div className="p-12 text-center rounded-2xl bg-card border border-border/70 text-muted-foreground text-xs">
                        No hay informes registrados para esta fecha, horario o filtros.
                      </div>
                    );
                  }

                  return blocks.map((block) => {
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
                  });
                })()}
              </div>
            )}

            {/* MODO 2: Registro Detallado de Eventos (Logs) */}
            {timelineViewMode === "logs" && (
              <div className="space-y-2">
                {filteredTimeline.length === 0 ? (
                  <div className="p-12 text-center rounded-2xl bg-card border border-border/70 text-muted-foreground text-xs">
                    No hay eventos registrados para los filtros u horario seleccionados.
                  </div>
                ) : (
                  [...filteredTimeline].reverse().map((item, idx) => {
                    const itemDate = item.created_at ? new Date(item.created_at) : null;
                    const timeStr = itemDate
                      ? itemDate.toLocaleTimeString("es-CR", { hour: "2-digit", minute: "2-digit", second: "2-digit" })
                      : "--:--";
                    const meta = (item.metadata || {}) as Record<string, any>;
                    const act = (item.action || "").toLowerCase();
                    const isManual = Boolean(
                      meta.manual ||
                      meta.task ||
                      meta.justification ||
                      act.startsWith("inició:") ||
                      act.startsWith("inicio:") ||
                      act.startsWith("terminó:") ||
                      act.startsWith("termino:") ||
                      act.startsWith("justificación:") ||
                      act.startsWith("justificacion:")
                    );

                    const Icon = CATEGORY_ICONS[item.category] || Activity;
                    const colorClass = CATEGORY_COLORS[item.category] || "text-zinc-400 bg-zinc-500/10 border-zinc-500/20";
                    const durSeconds = item.duration_ms
                      ? Math.round(item.duration_ms / 1000)
                      : meta.duration_seconds || (meta.minutes ? meta.minutes * 60 : null);

                    return (
                      <div
                        key={item.id || `log-${idx}`}
                        className={`p-3.5 rounded-2xl bg-card border transition-all flex items-center justify-between gap-4 text-xs ${
                          isManual
                            ? "border-emerald-500/40 bg-emerald-500/5 hover:border-emerald-500/60"
                            : "border-border/60 hover:border-border"
                        }`}
                      >
                        <div className="flex items-center gap-3 min-w-0 flex-1">
                          <div className={`p-2 rounded-xl border shrink-0 ${colorClass}`}>
                            <Icon className="h-4 w-4" />
                          </div>

                          <div className="min-w-0 flex-1 space-y-0.5">
                            <div className="flex items-center gap-2 flex-wrap">
                              <p className="font-semibold text-foreground text-xs truncate">
                                {item.action}
                              </p>
                              {isManual && (
                                <span className="px-2 py-0.5 rounded-md bg-emerald-500/15 border border-emerald-500/30 text-emerald-400 text-[10px] font-bold flex items-center gap-1">
                                  <Wrench className="h-2.5 w-2.5" /> Labor Manual
                                </span>
                              )}
                              {meta.task && (
                                <span className="px-2 py-0.5 rounded-md bg-violet-500/15 border border-violet-500/30 text-violet-300 text-[10px] font-medium">
                                  {meta.task}
                                </span>
                              )}
                            </div>

                            <div className="flex items-center gap-2 text-[11px] text-muted-foreground">
                              <span className="font-medium text-foreground/70">{item.category}</span>
                              {meta.app && (
                                <>
                                  <span>•</span>
                                  <span>{meta.app}</span>
                                </>
                              )}
                              {meta.title && (
                                <>
                                  <span>•</span>
                                  <span className="truncate max-w-xs">{cleanExecutiveTitle(meta.title)}</span>
                                </>
                              )}
                            </div>
                          </div>
                        </div>

                        <div className="flex items-center gap-3 shrink-0 font-mono text-[11px]">
                          {durSeconds && durSeconds > 0 && (
                            <span className="px-2 py-0.5 rounded-lg bg-muted/60 border border-border/40 font-bold text-foreground/90">
                              {durSeconds >= 60 ? `${Math.floor(durSeconds / 60)}m ${durSeconds % 60}s` : `${durSeconds}s`}
                            </span>
                          )}
                          <span className="font-bold text-foreground text-xs">
                            {timeStr}
                          </span>
                        </div>
                      </div>
                    );
                  })
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
          />
        )}

        {/* PESTAÑA 4: APPS Y SITIOS WEB */}
        {activeTab === "apps" && (
          <div className="space-y-6">
            <ActivityAppsRanking
              timeline={timeline}
              scheduleStart={scheduleStart}
              scheduleEnd={scheduleEnd}
              scheduleEnabled={scheduleEnabled}
            />
            <ActivityHeatmap timeline={timelineWithinSchedule} date={selectedDate} />
          </div>
        )}

        {/* PESTAÑA 5: DICTAMEN IA & REPORTES */}
        {activeTab === "briefing" && (
          <ActivityAiBriefing
            agentEmail={selectedAgent}
            agentName={currentAgentObj?.name || selectedAgent}
            date={selectedDate}
            timeline={timeline}
            allAgents={liveAgents}
          />
        )}
      </div>
    </div>
  );
}