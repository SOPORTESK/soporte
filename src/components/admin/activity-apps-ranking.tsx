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

// Las 7-8 categorías oficiales del taller exactamente como se muestran en "Por Categoría"
export const WORKSHOP_CATEGORIES = [
  { id: "Atención chat", label: "Atención chat", icon: MessageSquare, color: "text-emerald-400 border-emerald-500/30 bg-emerald-500/15", bgBar: "bg-emerald-500" },
  { id: "Atención de Tickets", label: "Atención de Tickets", icon: FileText, color: "text-indigo-400 border-indigo-500/30 bg-indigo-500/15", bgBar: "bg-indigo-500" },
  { id: "Optimización de procesos", label: "Optimización de procesos", icon: Code, color: "text-violet-400 border-violet-500/30 bg-violet-500/15", bgBar: "bg-violet-500" },
  { id: "Control administrativo", label: "Control administrativo", icon: TrendingUp, color: "text-fuchsia-400 border-fuchsia-500/30 bg-fuchsia-500/15", bgBar: "bg-fuchsia-500" },
  { id: "Gestión de Correos", label: "Gestión de Correos", icon: Mail, color: "text-blue-400 border-blue-500/30 bg-blue-500/15", bgBar: "bg-blue-500" },
  { id: "Atención por llamada", label: "Atención por llamada", icon: Phone, color: "text-orange-400 border-orange-500/30 bg-orange-500/15", bgBar: "bg-orange-500" },
  { id: "Soporte técnico", label: "Soporte técnico", icon: Monitor, color: "text-cyan-400 border-cyan-500/30 bg-cyan-500/15", bgBar: "bg-cyan-500" },
  { id: "Gestión de Garantías", label: "Gestión de Garantías", icon: ShieldCheck, color: "text-amber-400 border-amber-500/30 bg-amber-500/15", bgBar: "bg-amber-500" },
  { id: "Actividad general", label: "Actividad general", icon: Monitor, color: "text-slate-400 border-slate-500/30 bg-slate-500/15", bgBar: "bg-slate-500" },
];

export function getCategoryUI(catName: string) {
  const found = WORKSHOP_CATEGORIES.find((c) => c.id === catName);
  if (found) return found;
  // Búsqueda aproximada si difiere ligeramente
  const lower = (catName || "").toLowerCase();
  if (lower.includes("chat") || lower.includes("mensajería")) return WORKSHOP_CATEGORIES[0];
  if (lower.includes("ticket")) return WORKSHOP_CATEGORIES[1];
  if (lower.includes("proceso") || lower.includes("desarrollo") || lower.includes("investiga")) return WORKSHOP_CATEGORIES[2];
  if (lower.includes("admin") || lower.includes("control")) return WORKSHOP_CATEGORIES[3];
  if (lower.includes("correo") || lower.includes("mail")) return WORKSHOP_CATEGORIES[4];
  if (lower.includes("llamada") || lower.includes("telefón") || lower.includes("phone")) return WORKSHOP_CATEGORIES[5];
  if (lower.includes("soporte") || lower.includes("redes") || lower.includes("taller")) return WORKSHOP_CATEGORIES[6];
  if (lower.includes("garant") || lower.includes("rma")) return WORKSHOP_CATEGORIES[7];
  return WORKSHOP_CATEGORIES[WORKSHOP_CATEGORIES.length - 1]; // Actividad general
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
  const action = (item.action || "").toLowerCase();
  const rawPath = (meta.path || meta.page || "").toLowerCase();

  // 1. Apps de escritorio / externas explícitas
  if (meta.app_name) return meta.app_name;
  if (meta.label) return meta.label;

  // 2. Por contenido textual de la acción
  if (action.includes("whatsapp")) return "WhatsApp";
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

export function getDefaultCategoryForApp(appName: string, action: string = "", category: string = ""): string {
  const name = (appName || "").toLowerCase();
  const act = (action || "").toLowerCase();
  const cat = (category || "").toLowerCase();

  // 1. Optimización de procesos (Programación, IDEs, Terminales, código)
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
    cat.includes("desarrollo") ||
    cat.includes("proceso")
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

  // 7. Control administrativo (Suite Auditoría, Excel, Word, Inventario, Admin)
  if (
    name.includes("auditor") ||
    name.includes("excel") ||
    name.includes("word") ||
    name.includes("office") ||
    name.includes("inventario") ||
    name.includes("admin") ||
    cat.includes("admin") ||
    act.includes("informe")
  ) {
    return "Control administrativo";
  }

  // 8. Soporte técnico (CCTV, iVMS, Winbox, MikroTik, Taller)
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
    name.includes("mostrador") ||
    name.includes("diagnóstico") ||
    name.includes("diagnostico") ||
    cat.includes("soporte") ||
    cat.includes("manual")
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

export function ActivityAppsRanking({ timeline }: Props) {
  const [viewMode, setViewMode] = useState<"categories" | "apps">("categories");
  const [customCategories, setCustomCategories] = useState<Record<string, string>>({});
  const [activeDropdownApp, setActiveDropdownApp] = useState<string | null>(null);
  const [showManageModal, setShowManageModal] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [savingApp, setSavingApp] = useState<string | null>(null);

  // Cargar categorías guardadas en localStorage y en el servidor
  useEffect(() => {
    try {
      const local = localStorage.getItem("sek_app_categories");
      if (local) {
        setCustomCategories(JSON.parse(local));
      }
    } catch {}

    fetch("/api/activity/app-categories")
      .then((res) => res.json())
      .then((data) => {
        if (data?.categories) {
          setCustomCategories(data.categories);
          try {
            localStorage.setItem("sek_app_categories", JSON.stringify(data.categories));
          } catch {}
        }
      })
      .catch(() => {});
  }, []);

  // Función para asignar categoría a una aplicación
  const handleSetCategory = async (appName: string, category: string | null) => {
    setSavingApp(appName);
    const newMap = { ...customCategories };
    if (!category || category === "auto") {
      delete newMap[appName];
    } else {
      newMap[appName] = category;
    }

    setCustomCategories(newMap);
    try {
      localStorage.setItem("sek_app_categories", JSON.stringify(newMap));
    } catch {}
    setActiveDropdownApp(null);

    try {
      await fetch("/api/activity/app-categories", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ appName, category: category || "auto" }),
      });
    } catch (err) {
      console.error("Error al guardar categoría de app:", err);
    } finally {
      setSavingApp(null);
    }
  };

  // Consolidar tiempo por app/categoría usando intervalos cronológicos reales
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

      for (let i = 0; i < sorted.length; i++) {
        const curr = sorted[i];
        const meta = (curr.metadata || {}) as Record<string, any>;
        const isExplicitPause =
          meta.reason === "lock_screen" || meta.reason === "suspend" || curr.category === "Pausa personal";
        if (isExplicitPause) continue;

        const currTime = new Date(curr.created_at!).getTime();
        const nextTime = i < sorted.length - 1 ? new Date(sorted[i + 1].created_at!).getTime() : currTime + 60000;
        const gap = Math.max(0, nextTime - currTime);
        const effectiveDuration = Math.min(gap, LUNCH_GAP_MS);

        const appName = extractSmartAppName(curr);
        allAppsSet.add(appName);

        // La categoría respeta la elección manual del usuario o el predeterminado
        const effectiveCat = customCategories[appName] || getDefaultCategoryForApp(appName, curr.action, curr.category);

        if (!appM[appName]) appM[appName] = { durationMs: 0, count: 0 };
        appM[appName].durationMs += effectiveDuration;
        appM[appName].count++;

        if (!catM[effectiveCat]) catM[effectiveCat] = { durationMs: 0, count: 0 };
        catM[effectiveCat].durationMs += effectiveDuration;
        catM[effectiveCat].count++;

        totalTime += effectiveDuration;
      }
    }

    return {
      appMap: appM,
      catMap: catM,
      totalActiveTime: totalTime,
      allDetectedApps: Array.from(allAppsSet),
    };
  }, [timeline, customCategories]);

  const activeMap = viewMode === "categories" ? catMap : appMap;
  const sortedItems = Object.entries(activeMap)
    .sort((a, b) => b[1].durationMs - a[1].durationMs)
    .slice(0, 10);

  // Lista de apps para el modal de gestión
  const filteredModalApps = useMemo(() => {
    const combined = Array.from(new Set([...allDetectedApps, ...Object.keys(customCategories)])).sort();
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
            const ui = getCategoryUI(itemName);
            const IconComp = ui.icon;
            icon = <div className={ui.color.split(" ")[0]}><IconComp className="h-4 w-4" /></div>;
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

                    {WORKSHOP_CATEGORIES.map((cat) => {
                      const isSelected = currentCat === cat.id;
                      const CatIcon = cat.icon;
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
                          <div className="flex items-center gap-2">
                            <CatIcon className="h-3.5 w-3.5 opacity-80" />
                            <span className="text-[11px]">{cat.label}</span>
                          </div>
                          {isSelected && <Check className="h-3.5 w-3.5 text-violet-400" />}
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

      {/* MODAL DE GESTIÓN GLOBAL DE CATEGORÍAS */}
      {showManageModal && (
        <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4">
          <div
            className="w-full max-w-xl rounded-2xl bg-card border border-border shadow-2xl p-6 space-y-4 max-h-[85vh] flex flex-col"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between border-b border-border/50 pb-3">
              <div className="flex items-center gap-2">
                <SlidersHorizontal className="h-5 w-5 text-violet-400" />
                <div>
                  <h3 className="font-bold text-base text-foreground">Gestión de Categorías de Software</h3>
                  <p className="text-xs text-muted-foreground">
                    Asigne a qué categoría oficial del taller pertenece cada software o herramienta
                  </p>
                </div>
              </div>
              <button
                onClick={() => setShowManageModal(false)}
                className="p-1 rounded-lg hover:bg-muted text-muted-foreground hover:text-foreground transition-colors"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            {/* Buscador */}
            <div className="relative">
              <Search className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Buscar software o aplicación..."
                className="w-full pl-9 pr-4 py-2 text-xs rounded-xl bg-muted/40 border border-border focus:outline-none focus:ring-2 focus:ring-violet-500 text-foreground placeholder:text-muted-foreground"
              />
            </div>

            {/* Lista de Software */}
            <div className="flex-1 overflow-y-auto space-y-2 pr-1 min-h-[250px]">
              {filteredModalApps.length === 0 ? (
                <div className="p-8 text-center text-xs text-muted-foreground">
                  No se encontraron aplicaciones que coincidan con la búsqueda.
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
                              <span className="text-violet-400 font-semibold">● Personalizada manualmente</span>
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
                          className="text-xs font-bold px-2.5 py-1.5 rounded-lg bg-card border border-border focus:outline-none focus:ring-2 focus:ring-violet-500 text-foreground cursor-pointer"
                        >
                          {WORKSHOP_CATEGORIES.map((cat) => (
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

            {/* Footer con resumen y acciones */}
            <div className="border-t border-border/50 pt-3 flex items-center justify-between text-xs">
              <span className="text-muted-foreground">
                {Object.keys(customCategories).length} aplicación(es) con categoría personalizada
              </span>

              <div className="flex items-center gap-2">
                {Object.keys(customCategories).length > 0 && (
                  <button
                    onClick={() => {
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
                    className="px-3 py-1.5 text-xs font-semibold rounded-lg text-amber-400 hover:bg-amber-500/10 transition-colors"
                  >
                    Restablecer todas
                  </button>
                )}
                <button
                  onClick={() => setShowManageModal(false)}
                  className="px-4 py-1.5 text-xs font-bold rounded-lg bg-violet-600 hover:bg-violet-700 text-white transition-colors"
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
