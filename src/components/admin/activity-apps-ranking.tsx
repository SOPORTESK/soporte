"use client";

import React, { useState } from "react";
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
  Layers,
  RotateCcw,
  Headphones,
  Network,
  Cpu,
  GraduationCap,
  Briefcase,
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

const OFFICIAL_CATEGORY_CONFIG: Record<string, { icon: any; color: string; barColor: string }> = {
  "Atención por llamada": { icon: Phone, color: "text-orange-400 bg-orange-500/10 border-orange-500/20", barColor: "bg-orange-500" },
  "Gestión de Correos": { icon: Mail, color: "text-blue-400 bg-blue-500/10 border-blue-500/20", barColor: "bg-blue-500" },
  "Atención de Tickets": { icon: ShieldCheck, color: "text-indigo-400 bg-indigo-500/10 border-indigo-500/20", barColor: "bg-indigo-500" },
  "Gestión de Garantías": { icon: ShieldCheck, color: "text-purple-400 bg-purple-500/10 border-purple-500/20", barColor: "bg-purple-500" },
  "Devoluciones": { icon: RotateCcw, color: "text-amber-400 bg-amber-500/10 border-amber-500/20", barColor: "bg-amber-500" },
  "Atención chat": { icon: MessageSquare, color: "text-emerald-400 bg-emerald-500/10 border-emerald-500/20", barColor: "bg-emerald-500" },
  "Soporte técnico": { icon: Headphones, color: "text-teal-400 bg-teal-500/10 border-teal-500/20", barColor: "bg-teal-500" },
  "Mantenimiento de redes": { icon: Network, color: "text-sky-400 bg-sky-500/10 border-sky-500/20", barColor: "bg-sky-500" },
  "Optimización de procesos": { icon: Cpu, color: "text-violet-400 bg-violet-500/10 border-violet-500/20", barColor: "bg-violet-500" },
  "Control administrativo": { icon: Briefcase, color: "text-cyan-400 bg-cyan-500/10 border-cyan-500/20", barColor: "bg-cyan-500" },
  "Capacitación personal": { icon: GraduationCap, color: "text-yellow-400 bg-yellow-500/10 border-yellow-500/20", barColor: "bg-yellow-500" },
  "Entretenimiento": { icon: Youtube, color: "text-rose-400 bg-rose-500/10 border-rose-500/20", barColor: "bg-rose-500" },
};

export function normalizeOfficialCategory(category: string, action: string, appName: string): string {
  const cat = (category || "").toLowerCase();
  const act = (action || "").toLowerCase();
  const app = (appName || "").toLowerCase();

  if (cat.includes("llamada") || cat.includes("telefón") || cat.includes("telefon") || app.includes("linkus") || act.includes("linkus") || act.includes("llamada")) {
    return "Atención por llamada";
  }
  if (act.includes("devolucion") || act.includes("devolución") || cat.includes("devolucion") || cat.includes("devolución")) {
    return "Devoluciones";
  }
  if (cat.includes("correo") || app.includes("outlook") || app.includes("mail") || act.includes("correo") || act.includes("outlook")) {
    return "Gestión de Correos";
  }
  if (cat.includes("garant") || app.includes("garant") || act.includes("garant") || act.includes("rma")) {
    return "Gestión de Garantías";
  }
  if (cat.includes("ticket") || app.includes("odoo") || act.includes("odoo") || act.includes("ticket")) {
    return "Atención de Tickets";
  }
  if (cat.includes("mensaj") || cat.includes("chat") || app.includes("whatsapp") || act.includes("whatsapp") || act.includes("atendió caso") || act.includes("chat") || act.includes("bandeja")) {
    return "Atención chat";
  }
  if (cat.includes("red") || app.includes("winbox") || app.includes("mikrotik") || app.includes("ubiquiti") || act.includes("red")) {
    return "Mantenimiento de redes";
  }
  if (cat.includes("desarrollo") || cat.includes("investiga") || app.includes("antigravity") || app.includes("code") || app.includes("terminal")) {
    return "Optimización de procesos";
  }
  if (cat.includes("capacita") || act.includes("curso") || act.includes("capacita")) {
    return "Capacitación personal";
  }
  if (cat.includes("entreten") || cat.includes("no laboral") || app.includes("youtube") || app.includes("spotify") || app.includes("netflix")) {
    return "Entretenimiento";
  }
  if (cat.includes("admin") || cat.includes("archivo") || app.includes("excel") || app.includes("word") || act.includes("admin") || act.includes("equipo") || act.includes("inventario") || app.includes("explorador")) {
    return "Control administrativo";
  }
  return "Soporte técnico";
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
  if (name.includes("code") || name.includes("terminal") || name.includes("powershell") || name.includes("antigravity"))
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

  if (meta.app_name) return meta.app_name;
  if (meta.label) return meta.label;

  if (action.includes("whatsapp")) return "WhatsApp Desktop";
  if (action.includes("linkus") || action.includes("llamada")) return "Linkus (Softphone)";
  if (action.includes("odoo")) return "Odoo ERP";
  if (action.includes("outlook") || action.includes("correo")) return "Correo / Outlook";
  if (action.includes("excel")) return "Microsoft Excel";
  if (action.includes("word")) return "Microsoft Word";
  if (action.includes("antigravity")) return "Editor de Código (Antigravity)";
  if (action.includes("atendió caso") || action.includes("atendiendo caso")) return "Atención de Casos / Chats";
  if (action.includes("tomó el caso") || action.includes("gestión de casos")) return "Gestión y Asignación de Casos";

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

  if (action.includes("bodega")) return "Labores de Bodega";
  if (action.includes("ventanilla") || action.includes("mostrador")) return "Atención en Mostrador";
  if (action.includes("diagnóstico") || action.includes("diagnostico")) return "Diagnóstico Físico de Taller";
  return "Seka Chat - Plataforma";
}

export function getProductivityType(appName: string): { label: string; color: string } {
  const name = appName.toLowerCase();

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

  if (
    name.includes("admin") ||
    name.includes("estadística") ||
    name.includes("configuración") ||
    name.includes("auditoría") ||
    name.includes("equipo") ||
    name.includes("inventario")
  ) {
    return { label: "Administrativa", color: "bg-purple-500/15 text-purple-400 border-purple-500/30" };
  }

  if (name.includes("code") || name.includes("terminal") || name.includes("antigravity")) {
    return { label: "Investigación", color: "bg-cyan-500/15 text-cyan-400 border-cyan-500/30" };
  }

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

export function ActivityAppsRanking({ timeline }: Props) {
  const [viewMode, setViewMode] = useState<"categories" | "apps">("categories");

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
      const isExplicitPause = meta.reason === "lock_screen" || meta.reason === "suspend" || curr.category === "Pausa personal" || curr.category === "Inactividad";
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

  const sortedApps = Object.entries(appMap)
    .sort((a, b) => b[1].durationMs - a[1].durationMs)
    .slice(0, 10);

  const sortedCategories = Object.entries(catMap)
    .sort((a, b) => b[1].durationMs - a[1].durationMs);

  const currentItems = viewMode === "categories" ? sortedCategories : sortedApps;

  if (currentItems.length === 0) {
    return (
      <div className="p-6 rounded-2xl bg-card border border-border/70 text-center text-muted-foreground text-xs">
        No hay registros de actividad en este rango de fecha.
      </div>
    );
  }

  return (
    <div className="p-5 rounded-2xl bg-card border border-border/70 shadow-sm space-y-4">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-1 border-b border-border/40">
        <div className="flex items-center gap-2">
          {viewMode === "categories" ? (
            <Layers className="h-4 w-4 text-violet-500" />
          ) : (
            <Monitor className="h-4 w-4 text-violet-500" />
          )}
          <div>
            <h3 className="font-bold text-sm text-foreground">
              {viewMode === "categories" ? "Distribución por Categorías" : "Top Software y Aplicaciones"}
            </h3>
            <p className="text-[11px] text-muted-foreground">
              Total activo: <span className="font-semibold text-foreground">{formatDuration(totalActiveTime)}</span>
            </p>
          </div>
        </div>

        <div className="flex items-center gap-1 p-1 rounded-xl bg-muted/40 border border-border/60 shrink-0 self-start sm:self-auto">
          <button
            onClick={() => setViewMode("categories")}
            className={`px-2.5 py-1 rounded-lg text-xs font-bold transition-all flex items-center gap-1.5 ${
              viewMode === "categories"
                ? "bg-violet-600 text-white shadow-sm"
                : "text-muted-foreground hover:text-foreground hover:bg-muted/30"
            }`}
          >
            <Layers className="h-3 w-3" />
            Por Categoría
          </button>
          <button
            onClick={() => setViewMode("apps")}
            className={`px-2.5 py-1 rounded-lg text-xs font-bold transition-all flex items-center gap-1.5 ${
              viewMode === "apps"
                ? "bg-violet-600 text-white shadow-sm"
                : "text-muted-foreground hover:text-foreground hover:bg-muted/30"
            }`}
          >
            <Monitor className="h-3 w-3" />
            Por Software
          </button>
        </div>
      </div>

      <div className="space-y-2.5">
        {currentItems.map(([name, stats], index) => {
          const percentage = totalActiveTime > 0 ? Math.round((stats.durationMs / totalActiveTime) * 100) : 0;
          
          if (viewMode === "categories") {
            const catConfig = OFFICIAL_CATEGORY_CONFIG[name] || {
              icon: Layers,
              color: "text-zinc-400 bg-zinc-500/10 border-zinc-500/20",
              barColor: "bg-violet-500",
            };
            const Icon = catConfig.icon;

            return (
              <div key={name} className="p-3 rounded-xl bg-muted/20 border border-border/40 hover:bg-muted/40 transition-colors">
                <div className="flex items-center justify-between gap-3 text-xs mb-1.5">
                  <div className="flex items-center gap-2 min-w-0">
                    <span className="text-[10px] font-black text-muted-foreground/60 w-4">#{index + 1}</span>
                    <div className={`p-1 rounded-lg border ${catConfig.color}`}>
                      <Icon className="h-3.5 w-3.5" />
                    </div>
                    <span className="font-bold text-foreground truncate" title={name}>{name}</span>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <span className="font-mono font-bold text-foreground">{formatDuration(stats.durationMs)}</span>
                    <span className="text-muted-foreground font-medium w-9 text-right">{percentage}%</span>
                  </div>
                </div>
                <div className="h-1.5 w-full rounded-full bg-muted/60 overflow-hidden">
                  <div className={`h-full rounded-full transition-all ${catConfig.barColor}`} style={{ width: `${percentage}%` }} />
                </div>
              </div>
            );
          }

          const prod = getProductivityType(name);
          return (
            <div key={name} className="p-3 rounded-xl bg-muted/20 border border-border/40 hover:bg-muted/40 transition-colors">
              <div className="flex items-center justify-between gap-3 text-xs mb-1.5">
                <div className="flex items-center gap-2 min-w-0">
                  <span className="text-[10px] font-black text-muted-foreground/60 w-4">#{index + 1}</span>
                  {getAppIcon(name)}
                  <span className="font-bold text-foreground truncate" title={name}>{name}</span>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full border ${prod.color}`}>{prod.label}</span>
                  <span className="font-mono font-bold text-foreground">{formatDuration(stats.durationMs)}</span>
                  <span className="text-muted-foreground font-medium w-9 text-right">{percentage}%</span>
                </div>
              </div>
              <div className="h-1.5 w-full rounded-full bg-muted/60 overflow-hidden">
                <div
                  className={`h-full rounded-full transition-all ${
                    prod.label === "No Laboral" ? "bg-rose-500" : prod.label === "Productiva" || prod.label === "Operativa" ? "bg-emerald-500" : "bg-purple-500"
                  }`}
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