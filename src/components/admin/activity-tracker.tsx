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
  "Mensajería": MessageSquare,
  "Atención de tickets": FolderOpen,
  "Trámites de garantías": ShieldCheck,
  "Investigación y desarrollo": Code,
  "Labores manuales": Wrench,
  "Gestión de correos": Mail,
  "Gestión de casos": FolderOpen,
  "Escalado": AlertCircle,
  "Asistente IA": Bot,
  "Inactividad": Clock,
  "Navegación": Eye,
  "Actividad general": Activity,
  "Soporte técnico": Wrench,
  "Otros": Activity,
};

const CATEGORY_COLORS: Record<string, string> = {
  "Atención telefónica": "text-orange-400 bg-orange-500/10 border-orange-500/20",
  "Mensajería": "text-emerald-400 bg-emerald-500/10 border-emerald-500/20",
  "Atención de tickets": "text-blue-400 bg-blue-500/10 border-blue-500/20",
  "Trámites de garantías": "text-purple-400 bg-purple-500/10 border-purple-500/20",
  "Investigación y desarrollo": "text-cyan-400 bg-cyan-500/10 border-cyan-500/20",
  "Labores manuales": "text-amber-400 bg-amber-500/10 border-amber-500/20",
  "Gestión de correos": "text-yellow-400 bg-yellow-500/10 border-yellow-500/20",
  "Gestión de casos": "text-emerald-400 bg-emerald-500/10 border-emerald-500/20",
  "Escalado": "text-red-400 bg-red-500/10 border-red-500/20",
  "Asistente IA": "text-cyan-400 bg-cyan-500/10 border-cyan-500/20",
  "Inactividad": "text-zinc-400 bg-zinc-500/10 border-zinc-500/20",
  "Navegación": "text-sky-400 bg-sky-500/10 border-sky-500/20",
  "Actividad general": "text-indigo-400 bg-indigo-500/10 border-indigo-500/20",
  "Soporte técnico": "text-amber-400 bg-amber-500/10 border-amber-500/20",
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
  if (lower.includes("seka chat") || lower.includes("chat sekunet") || appLower.includes("seka") || lower.includes("evolution")) {
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

  // 11. Entornos de desarrollo, programación y herramientas técnicas (Antigravity, Cursor, VS Code, Terminal, Devin)
  if (
    lower.includes("antigravity") ||
    lower.includes("code") ||
    lower.includes("cursor") ||
    lower.includes("windsurf") ||
    lower.includes("devin") ||
    lower.includes("visual studio") ||
    appLower.includes("antigravity") ||
    appLower.includes("code") ||
    category === "Investigación y desarrollo"
  ) {
    return {
      title: "Optimización, programación y desarrollo de software y sistemas técnicos",
      subtitle: cleanTitle || "Herramientas de ingeniería y desarrollo",
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

  // 13. Pausas e Inactividad
  if (category === "Inactividad" || lower.includes("sin actividad") || lower.includes("pausa prolongada") || lower.includes("bloqueada")) {
    return {
      title: "Pausa operativa / Período sin interacción activa en la estación",
      subtitle: cleanTitle ? `Última aplicación en pantalla: ${cleanTitle}` : "Pausa del sistema",
    };
  }

  // 14. Formato estructurado preexistente o títulos sueltos (limpieza narrativa final)
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
}

function buildConsolidatedNarrative(items: TimelineEntry[]): string {
  if (!items.length) return "";

  // Agrupar actividades por tema único
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
    const raw = `${item.action || ""} ${meta.title || ""} ${meta.app || ""}`.toLowerCase();

    if (raw.includes("ivms") || raw.includes("sadp") || raw.includes("hik") || raw.includes("cctv")) hasCctv = true;
    else if (raw.includes("recorte") || raw.includes("snipping")) hasRecortes = true;
    else if (raw.includes("whatsapp")) hasWhatsapp = true;
    else if (raw.includes("seka chat") || raw.includes("chat sekunet") || raw.includes("evolution")) hasSekaChat = true;
    else if (raw.includes("odoo")) hasOdoo = true;
    else if (raw.includes("nextime") || raw.includes("biotime") || raw.includes("asistencia")) hasAttendance = true;
    else if (raw.includes("winbox") || raw.includes("mikrotik") || raw.includes("unifi")) hasNetworks = true;
    else if (raw.includes("antigravity") || raw.includes("cursor") || raw.includes("code") || raw.includes("devin")) hasDev = true;
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

function consolidateTimelineByBlocks(entries: TimelineEntry[], intervalMinutes: number = 5): ConsolidatedBlock[] {
  if (!entries || entries.length === 0) return [];

  // Ordenar cronológicamente ascendente para agrupar
  const sorted = [...entries]
    .filter((e) => Boolean(e.created_at))
    .sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime());

  const blocksMap = new Map<number, TimelineEntry[]>();
  const intervalMs = intervalMinutes * 60 * 1000;

  for (const entry of sorted) {
    const time = new Date(entry.created_at).getTime();
    if (isNaN(time)) continue;
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

    // Determinar categoría primaria
    const catCounts: Record<string, number> = {};
    const apps = new Set<string>();
    let totalDur = 0;

    for (const it of items) {
      const cat = it.category || "Operación Sekunet";
      catCounts[cat] = (catCounts[cat] || 0) + 1;
      const meta = (it.metadata || {}) as Record<string, any>;
      const app = meta.app_name || meta.label || meta.app || "";
      if (app && app !== "Unknown") apps.add(app);
      if (it.duration_ms) totalDur += it.duration_ms;
    }

    const topCategory = Object.entries(catCounts).sort((a, b) => b[1] - a[1])[0]?.[0] || "Operación Sekunet";
    const narrative = buildConsolidatedNarrative(items);

    return {
      id: `block-${bucketKey}`,
      startTime,
      endTime,
      narrative,
      category: topCategory,
      totalDurationMs: totalDur || intervalMs,
      apps: Array.from(apps),
      eventCount: items.length,
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

  // Filtrado de timeline
  const filteredTimeline = timeline.filter((item) => {
    if (categoryFilter !== "all" && item.category !== categoryFilter) return false;
    if (searchFilter) {
      const term = searchFilter.toLowerCase();
      const actionMatch = (item.action || "").toLowerCase().includes(term);
      const catMatch = (item.category || "").toLowerCase().includes(term);
      const appMatch = JSON.stringify(item.metadata || {}).toLowerCase().includes(term);
      return actionMatch || catMatch || appMatch;
    }
    return true;
  });

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

        {/* Controles de fecha y refresco */}
        <div className="flex flex-wrap items-center gap-2.5">
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
            <ActivityHeatmap timeline={timeline} date={selectedDate} />

            {/* Top Apps y Resumen en 2 Columnas */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              <ActivityAppsRanking timeline={timeline} />

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
                  {consolidateTimelineByBlocks(timeline, 5).slice(0, 6).map((block) => {
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
                          <div className="flex items-center gap-2 mt-2 text-[11px] text-muted-foreground font-mono">
                            <span className="font-bold text-foreground/80">{block.startTime} – {block.endTime}</span>
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
            {/* Barra de Filtros y Búsqueda */}
            <div className="p-4 rounded-2xl bg-card border border-border/70 shadow-sm flex flex-col sm:flex-row items-center justify-between gap-3">
              <div className="flex items-center gap-2 w-full sm:w-auto">
                <div className="relative flex-1 sm:w-64">
                  <Search className="h-3.5 w-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
                  <input
                    type="text"
                    placeholder="Buscar en informes narrados..."
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

              {(() => {
                const blocks = consolidateTimelineByBlocks(filteredTimeline, 5);
                return (
                  <span className="text-xs text-muted-foreground font-semibold">
                    Mostrando {blocks.length} informes narrados (bloques de 5 min)
                  </span>
                );
              })()}
            </div>

            {/* Lista Cronológica Consolidada en Bloques de 5 Minutos */}
            <div className="space-y-3">
              {(() => {
                const blocks = consolidateTimelineByBlocks(filteredTimeline, 5);
                if (blocks.length === 0) {
                  return (
                    <div className="p-12 text-center rounded-2xl bg-card border border-border/70 text-muted-foreground text-xs">
                      No hay informes registrados para esta fecha o filtros.
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
            <ActivityAppsRanking timeline={timeline} />
            <ActivityHeatmap timeline={timeline} date={selectedDate} />
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