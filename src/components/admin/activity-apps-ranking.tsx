"use client";

import React from "react";
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
}

function getAppIcon(appName: string) {
  const name = appName.toLowerCase();
  if (name.includes("whatsapp")) return <MessageSquare className="h-4 w-4 text-emerald-400" />;
  if (name.includes("linkus") || name.includes("phone") || name.includes("llamada"))
    return <Phone className="h-4 w-4 text-orange-400" />;
  if (name.includes("outlook") || name.includes("mail") || name.includes("correo"))
    return <Mail className="h-4 w-4 text-blue-400" />;
  if (name.includes("excel") || name.includes("word") || name.includes("office"))
    return <FileText className="h-4 w-4 text-indigo-400" />;
  if (name.includes("code") || name.includes("terminal") || name.includes("powershell"))
    return <Code className="h-4 w-4 text-cyan-400" />;
  if (name.includes("youtube") || name.includes("spotify") || name.includes("netflix"))
    return <Youtube className="h-4 w-4 text-rose-400" />;
  if (name.includes("odoo") || name.includes("garant") || name.includes("seka"))
    return <ShieldCheck className="h-4 w-4 text-violet-400" />;
  return <Globe className="h-4 w-4 text-muted-foreground" />;
}

export function extractSmartAppName(item: TimelineItem): string {
  const meta = (item.metadata || {}) as Record<string, any>;
  const action = (item.action || "").toLowerCase();
  const rawPath = (meta.path || meta.page || "").toLowerCase();

  // 1. Apps de escritorio / externas explícitas
  if (meta.app_name) return meta.app_name;
  if (meta.label) return meta.label;

  // 2. Por contenido textual de la acción
  if (action.includes("whatsapp")) return "WhatsApp Desktop";
  if (action.includes("linkus") || action.includes("llamada")) return "Linkus (Softphone)";
  if (action.includes("odoo")) return "Odoo ERP";
  if (action.includes("outlook") || action.includes("correo")) return "Correo / Outlook";
  if (action.includes("excel")) return "Microsoft Excel";
  if (action.includes("word")) return "Microsoft Word";
  if (action.includes("atendió caso") || action.includes("atendiendo caso")) return "Atención de Casos / Chats";
  if (action.includes("tomó el caso") || action.includes("gestión de casos")) return "Gestión y Asignación de Casos";

  // 3. Por páginas y módulos del sistema
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

  // 4. Labores físicas
  if (action.includes("bodega")) return "Labores de Bodega";
  if (action.includes("ventanilla") || action.includes("mostrador")) return "Atención en Mostrador";
  if (action.includes("diagnóstico") || action.includes("diagnostico")) return "Diagnóstico Físico de Taller";
  return "Seka Chat - Plataforma";
}

export function getProductivityType(appName: string): { label: string; color: string } {
  const name = appName.toLowerCase();

  // 1. Distracción / No Laboral
  if (
    name.includes("youtube") ||
    name.includes("spotify") ||
    name.includes("facebook") ||
    name.includes("instagram") ||
    name.includes("tiktok") ||
    name.includes("juegos") ||
    name.includes("steam") ||
    name.includes("netflix")
  ) {
    return { label: "No Laboral", color: "bg-rose-500/15 text-rose-400 border-rose-500/30" };
  }

  // 2. Taller / Soporte Presencial
  if (
    name.includes("bodega") ||
    name.includes("diagnóstico") ||
    name.includes("diagnostico") ||
    name.includes("ventanilla") ||
    name.includes("mostrador") ||
    name.includes("taller") ||
    name.includes("limpieza") ||
    name.includes("física") ||
    name.includes("fisica") ||
    name.includes("justificación") ||
    name.includes("justificacion")
  ) {
    return { label: "Taller Físico", color: "bg-amber-500/15 text-amber-400 border-amber-500/30" };
  }

  // 3. Administrativa
  if (
    name.includes("administra") ||
    name.includes("admin") ||
    name.includes("inventario") ||
    name.includes("equipo") ||
    name.includes("manuales") ||
    name.includes("configura") ||
    name.includes("auditor")
  ) {
    return { label: "Administrativa", color: "bg-violet-500/15 text-violet-400 border-violet-500/30" };
  }

  // 4. Operativa / Productiva
  return { label: "Operativa", color: "bg-emerald-500/15 text-emerald-400 border-emerald-500/30" };
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

export function normalizeOfficialCategory(category: string, action: string, appName: string): string {
  const cat = (category || "").toLowerCase();
  const act = (action || "").toLowerCase();
  const app = (appName || "").toLowerCase();

  if (app.includes("youtube") || app.includes("spotify") || cat.includes("entreteni") || act.includes("youtube")) return "Entretenimiento";
  if (app.includes("linkus") || app.includes("phone") || cat.includes("llamada") || act.includes("llamada")) return "Atención por llamada";
  if (app.includes("outlook") || app.includes("mail") || app.includes("correo") || cat.includes("correo")) return "Gestión de Correos";
  if (cat.includes("ticket") || act.includes("ticket")) return "Atención de Tickets";
  if (cat.includes("garant") || act.includes("garant") || app.includes("garant")) return "Gestión de Garantías";
  if (cat.includes("devolucion") || act.includes("devolucion") || app.includes("devolucion")) return "Devoluciones";
  if (cat.includes("chat") || act.includes("chat") || app.includes("whatsapp")) return "Atención chat";
  if (cat.includes("soporte") || act.includes("soporte") || app.includes("anydesk") || app.includes("teamviewer")) return "Soporte técnico";
  if (cat.includes("redes") || act.includes("mantenimiento")) return "Mantenimiento de redes";
  if (cat.includes("proceso") || act.includes("desarrollo") || app.includes("code") || app.includes("cursor")) return "Optimización de procesos";
  if (cat.includes("admin") || act.includes("admin") || app.includes("excel") || app.includes("inventario")) return "Control administrativo";
  if (cat.includes("capacita") || act.includes("capacita")) return "Capacitación personal";
  
  // Fallback
  return "Actividad general";
}

const CATEGORY_UI: Record<string, { icon: React.ReactNode; color: string; bgBar: string }> = {
  "Entretenimiento": { icon: <Youtube className="h-4 w-4" />, color: "text-rose-400 border-rose-500/30 bg-rose-500/15", bgBar: "bg-rose-500" },
  "Atención por llamada": { icon: <Phone className="h-4 w-4" />, color: "text-orange-400 border-orange-500/30 bg-orange-500/15", bgBar: "bg-orange-500" },
  "Gestión de Correos": { icon: <Mail className="h-4 w-4" />, color: "text-blue-400 border-blue-500/30 bg-blue-500/15", bgBar: "bg-blue-500" },
  "Atención de Tickets": { icon: <FileText className="h-4 w-4" />, color: "text-indigo-400 border-indigo-500/30 bg-indigo-500/15", bgBar: "bg-indigo-500" },
  "Gestión de Garantías": { icon: <ShieldCheck className="h-4 w-4" />, color: "text-amber-400 border-amber-500/30 bg-amber-500/15", bgBar: "bg-amber-500" },
  "Devoluciones": { icon: <ShieldCheck className="h-4 w-4" />, color: "text-yellow-400 border-yellow-500/30 bg-yellow-500/15", bgBar: "bg-yellow-500" },
  "Atención chat": { icon: <MessageSquare className="h-4 w-4" />, color: "text-emerald-400 border-emerald-500/30 bg-emerald-500/15", bgBar: "bg-emerald-500" },
  "Soporte técnico": { icon: <Monitor className="h-4 w-4" />, color: "text-cyan-400 border-cyan-500/30 bg-cyan-500/15", bgBar: "bg-cyan-500" },
  "Mantenimiento de redes": { icon: <Globe className="h-4 w-4" />, color: "text-sky-400 border-sky-500/30 bg-sky-500/15", bgBar: "bg-sky-500" },
  "Optimización de procesos": { icon: <Code className="h-4 w-4" />, color: "text-violet-400 border-violet-500/30 bg-violet-500/15", bgBar: "bg-violet-500" },
  "Control administrativo": { icon: <TrendingUp className="h-4 w-4" />, color: "text-fuchsia-400 border-fuchsia-500/30 bg-fuchsia-500/15", bgBar: "bg-fuchsia-500" },
  "Capacitación personal": { icon: <Monitor className="h-4 w-4" />, color: "text-teal-400 border-teal-500/30 bg-teal-500/15", bgBar: "bg-teal-500" },
  "Actividad general": { icon: <Monitor className="h-4 w-4" />, color: "text-slate-400 border-slate-500/30 bg-slate-500/15", bgBar: "bg-slate-500" }
};

export function ActivityAppsRanking({ timeline }: Props) {
  const [viewMode, setViewMode] = React.useState<"categories" | "apps">("categories");

  // Consolidar tiempo por app/categoría usando intervalos cronológicos reales
  const appMap: Record<string, { durationMs: number; count: number }> = {};
  const catMap: Record<string, { durationMs: number; count: number }> = {};
  let totalActiveTime = 0;

  if (timeline && timeline.length > 0) {
    const sorted = [...timeline]
      .filter((t) => Boolean(t.created_at))
      .sort((a, b) => new Date(a.created_at!).getTime() - new Date(b.created_at!).getTime());

    const LUNCH_GAP_MS = 30 * 60 * 1000;

    for (let i = 0; i < sorted.length; i++) {
      const curr = sorted[i];
      const meta = (curr.metadata || {}) as Record<string, any>;
      const isExplicitPause = meta.reason === "lock_screen" || meta.reason === "suspend" || curr.category === "Pausa personal";
      if (isExplicitPause) continue;

      const currTime = new Date(curr.created_at!).getTime();
      const nextTime = i < sorted.length - 1 ? new Date(sorted[i + 1].created_at!).getTime() : currTime + 60000;
      const gap = Math.max(0, nextTime - currTime);
      const effectiveDuration = Math.min(gap, LUNCH_GAP_MS);

      const appName = extractSmartAppName(curr);
      const officialCat = normalizeOfficialCategory(curr.category, curr.action, appName);

      if (!appMap[appName]) appMap[appName] = { durationMs: 0, count: 0 };
      appMap[appName].durationMs += effectiveDuration;
      appMap[appName].count++;

      if (!catMap[officialCat]) catMap[officialCat] = { durationMs: 0, count: 0 };
      catMap[officialCat].durationMs += effectiveDuration;
      catMap[officialCat].count++;

      totalActiveTime += effectiveDuration;
    }
  }

  const activeMap = viewMode === "categories" ? catMap : appMap;
  const sortedItems = Object.entries(activeMap)
    .sort((a, b) => b[1].durationMs - a[1].durationMs)
    .slice(0, 10);

  if (sortedItems.length === 0) {
    return (
      <div className="p-6 rounded-2xl bg-card border border-border/70 text-center text-muted-foreground text-xs">
        No hay registros en este rango de fecha.
      </div>
    );
  }

  return (
    <div className="p-5 rounded-2xl bg-card border border-border/70 shadow-sm space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Monitor className="h-4 w-4 text-violet-500" />
          <h3 className="font-bold text-sm text-foreground">Distribución de Tiempo</h3>
        </div>
        <div className="flex items-center gap-3">
          <div className="flex bg-muted/50 p-1 rounded-lg border border-border/50">
            <button
              onClick={() => setViewMode("categories")}
              className={`px-3 py-1 text-[10px] font-bold rounded-md transition-all ${
                viewMode === "categories" ? "bg-background text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"
              }`}
            >
              Por Categoría
            </button>
            <button
              onClick={() => setViewMode("apps")}
              className={`px-3 py-1 text-[10px] font-bold rounded-md transition-all ${
                viewMode === "apps" ? "bg-background text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"
              }`}
            >
              Por Software
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
            const ui = CATEGORY_UI[itemName] || CATEGORY_UI["Actividad general"];
            icon = <div className={ui.color.split(" ")[0]}>{ui.icon}</div>;
            labelNode = (
              <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full border ${ui.color}`}>
                Categoría Oficial
              </span>
            );
            barClass = ui.bgBar;
          } else {
            const prod = getProductivityType(itemName);
            icon = getAppIcon(itemName);
            labelNode = (
              <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full border ${prod.color}`}>
                {prod.label}
              </span>
            );
            barClass = prod.label === "No Laboral"
              ? "bg-rose-500"
              : prod.label === "Operativa"
              ? "bg-emerald-500"
              : prod.label === "Taller Físico"
              ? "bg-amber-500"
              : "bg-violet-500";
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

              {/* Progress bar */}
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
    </div>
  );
}