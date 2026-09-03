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

export function ActivityAppsRanking({ timeline }: Props) {
  // Consolidar tiempo por app usando intervalos cronológicos reales (calibrados con reloj)
  const appMap: Record<string, { durationMs: number; count: number }> = {};
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

      if (!appMap[appName]) {
        appMap[appName] = { durationMs: 0, count: 0 };
      }
      appMap[appName].durationMs += effectiveDuration;
      appMap[appName].count++;
      totalActiveTime += effectiveDuration;
    }
  }

  const sortedApps = Object.entries(appMap)
    .sort((a, b) => b[1].durationMs - a[1].durationMs)
    .slice(0, 10);

  if (sortedApps.length === 0) {
    return (
      <div className="p-6 rounded-2xl bg-card border border-border/70 text-center text-muted-foreground text-xs">
        No hay registros de aplicaciones en este rango de fecha.
      </div>
    );
  }

  return (
    <div className="p-5 rounded-2xl bg-card border border-border/70 shadow-sm space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Monitor className="h-4 w-4 text-violet-500" />
          <h3 className="font-bold text-sm text-foreground">Top Aplicaciones y Software Utilizado</h3>
        </div>
        <span className="text-xs text-muted-foreground font-medium">
          Total activo: {formatDuration(totalActiveTime)}
        </span>
      </div>

      <div className="space-y-2.5">
        {sortedApps.map(([appName, stats], index) => {
          const percentage = totalActiveTime > 0 ? Math.round((stats.durationMs / totalActiveTime) * 100) : 0;
          const prod = getProductivityType(appName);

          return (
            <div
              key={appName}
              className="p-3 rounded-xl bg-muted/20 border border-border/40 hover:bg-muted/40 transition-colors"
            >
              <div className="flex items-center justify-between gap-3 text-xs mb-1.5">
                <div className="flex items-center gap-2 min-w-0">
                  <span className="text-[10px] font-black text-muted-foreground/60 w-4">
                    #{index + 1}
                  </span>
                  {getAppIcon(appName)}
                  <span className="font-bold text-foreground truncate" title={appName}>
                    {appName}
                  </span>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full border ${prod.color}`}>
                    {prod.label}
                  </span>
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
                  className={`h-full rounded-full transition-all ${
                    prod.label === "Distracción"
                      ? "bg-rose-500"
                      : prod.label === "Productiva"
                      ? "bg-emerald-500"
                      : "bg-amber-500"
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