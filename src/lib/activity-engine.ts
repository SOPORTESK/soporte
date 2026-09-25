/**
 * MOTOR UNIFICADO DE CÁLCULO DE ACTIVIDAD Y JORNADA LABORAL
 * Single Source of Truth para:
 * - ActivityExecutiveCharts (Donut Master)
 * - ActivityAppsRanking (Distribución por Categorías Operativas y Software)
 * - ModalMyActivity (Resumen del Agente y Justificaciones)
 * - ActivityTracker (Suite de Auditoría General)
 *
 * REGLAS DE CONSISTENCIA MATEMÁTICA:
 * 1. Nivel 1 (Master): Productivo + Inactivo + Descanso + Pausa Sanitaria = Total Jornada (100%)
 * 2. Nivel 2 (Operativas):
 *    - Suma de (Soporte + Servicio de Taller + Control Adm. + Gestión Taller + Residuos + OJT) === Productivo
 *    - Descansos === Descanso Master
 *    - Pausa Sanitaria === Pausa Sanitaria Master
 * 3. Ausencias Reales (Lagunas): Solo períodos continuos >= 15 min sin interacción ni labor.
 */

export interface TimelineEntry {
  id?: string;
  agent_email?: string;
  agent_name?: string;
  action: string;
  category?: string;
  created_at: string;
  duration_ms?: number;
  metadata?: Record<string, any> | null;
}

export type MasterCategory = "Productivo" | "Inactivo" | "Descanso" | "Pausa Sanitaria";

export interface MasterBucket {
  id: MasterCategory;
  label: string;
  durationMs: number;
  formattedTime: string;
  percentage: number;
  hex: string;
  bg: string;
  text: string;
}

export interface OperationalBucket {
  id: string;
  label: string;
  durationMs: number;
  formattedTime: string;
  percentage: number;
  color: string;
  bgBar: string;
  iconName: string;
  isProductive: boolean;
}

export interface SoftwareBucket {
  name: string;
  category: string;
  durationMs: number;
  formattedTime: string;
  percentage: number;
  count: number;
}

export interface DetectedAbsenceGap {
  id: string;
  dateStr: string;
  dateFormatted: string;
  startTime: string;
  endTime: string;
  startTimeVal: string;
  endTimeVal: string;
  durationMs: number;
  minutes: number;
  reason: string;
}

export interface UnifiedDayMetrics {
  totalDayMs: number;
  totalDayTime: string;
  firstLoginTime: string | null;
  lastLogoutTime: string | null;
  productivityScore: number;
  masterBuckets: Record<MasterCategory, MasterBucket>;
  masterList: MasterBucket[];
  operationalBuckets: OperationalBucket[];
  topSoftware: SoftwareBucket[];
  detectedGaps: DetectedAbsenceGap[];
  hourlyTrend: Record<number, number>;
  targetDailyHours: number;
  compliancePercent: number;
  pcWorkMs: number;
  pcWorkTime: string;
  manualJustificationMs: number;
  manualJustificationTime: string;
}

export const MASTER_COLORS: Record<MasterCategory, { hex: string; bg: string; text: string }> = {
  Productivo:        { hex: "#0284c7", bg: "bg-sky-600", text: "text-sky-400" },
  Inactivo:          { hex: "#64748b", bg: "bg-slate-500", text: "text-slate-400" },
  Descanso:          { hex: "#f59e0b", bg: "bg-amber-500", text: "text-amber-400" },
  "Pausa Sanitaria": { hex: "#10b981", bg: "bg-emerald-500", text: "text-emerald-400" },
};

export const OFFICIAL_OPERATIONAL_CATEGORIES: {
  id: string;
  label: string;
  color: string;
  bgBar: string;
  iconName: string;
  isProductive: boolean;
}[] = [
  { id: "Soporte", label: "Soporte", color: "text-emerald-400 border-emerald-500/30 bg-emerald-500/15", bgBar: "bg-emerald-500", iconName: "Headphones", isProductive: true },
  { id: "Servicio de Taller", label: "Servicio de Taller", color: "text-amber-400 border-amber-500/30 bg-amber-500/15", bgBar: "bg-amber-500", iconName: "Wrench", isProductive: true },
  { id: "Control Administrativo", label: "Control Administrativo", color: "text-blue-400 border-blue-500/30 bg-blue-500/15", bgBar: "bg-blue-500", iconName: "TrendingUp", isProductive: true },
  { id: "Gestión del Taller", label: "Gestión del Taller", color: "text-indigo-400 border-indigo-500/30 bg-indigo-500/15", bgBar: "bg-indigo-500", iconName: "Package", isProductive: true },
  { id: "Gestión de Residuos", label: "Gestión de Residuos", color: "text-rose-400 border-rose-500/30 bg-rose-500/15", bgBar: "bg-rose-500", iconName: "Trash2", isProductive: true },
  { id: "On-the-Job Training (OJT)", label: "On-the-Job Training (OJT)", color: "text-violet-400 border-violet-500/30 bg-violet-500/15", bgBar: "bg-violet-500", iconName: "GraduationCap", isProductive: true },
  { id: "Justificación Manual", label: "Justificación Manual", color: "text-purple-400 border-purple-500/30 bg-purple-500/15", bgBar: "bg-purple-500", iconName: "ClipboardCheck", isProductive: true },
  { id: "Utilidades", label: "Utilidades", color: "text-slate-400 border-slate-500/30 bg-slate-500/15", bgBar: "bg-slate-500", iconName: "SlidersHorizontal", isProductive: true },
  { id: "Descansos", label: "Descansos", color: "text-amber-400 border-amber-500/30 bg-amber-500/15", bgBar: "bg-amber-500", iconName: "Sandwich", isProductive: false },
  { id: "Pausa Sanitaria", label: "Pausa Sanitaria", color: "text-emerald-400 border-emerald-500/30 bg-emerald-500/15", bgBar: "bg-emerald-500", iconName: "Bath", isProductive: false },
];

export function formatDurationMs(ms: number | null | undefined): string {
  if (!ms || ms < 60000) return "0m";
  const totalMin = Math.round(ms / 60000);
  if (totalMin < 60) return `${totalMin}m`;
  const h = Math.floor(totalMin / 60);
  const remM = totalMin % 60;
  return `${h}h ${remM < 10 ? `0${remM}` : remM}m`;
}

export function formatTimeCR(dateStr: string): string {
  if (!dateStr) return "";
  const d = new Date(dateStr);
  if (isNaN(d.getTime())) return "";
  return d.toLocaleTimeString("es-CR", { hour: "2-digit", minute: "2-digit", timeZone: "America/Costa_Rica" });
}

export function isCategoryName(c: string): boolean {
  const cl = (c || "").toLowerCase().trim();
  return (
    cl === "control administrativo" ||
    cl === "soporte" ||
    cl === "servicio de taller" ||
    cl === "gestión del taller" ||
    cl === "gestion del taller" ||
    cl === "gestión de residuos" ||
    cl === "gestion de residuos" ||
    cl === "on-the-job training (ojt)" ||
    cl === "ojt" ||
    cl === "justificación manual" ||
    cl === "justificacion manual" ||
    cl === "descansos" ||
    cl === "descanso" ||
    cl.includes("descanso") ||
    cl.includes("almuerzo") ||
    cl.includes("merienda") ||
    cl === "pausa sanitaria" ||
    cl.includes("sanitaria") ||
    cl.includes("baño") ||
    cl.includes("bano") ||
    cl === "utilidades" ||
    cl === "actividad general" ||
    cl === "operativa" ||
    cl === "sin clasificar" ||
    cl === "inactividad" ||
    cl === "inactivo" ||
    cl === "pausa" ||
    cl.includes("inactiv") ||
    cl.includes("pausa") ||
    cl === "navegación" ||
    cl === "navegacion" ||
    cl === "navegación web" ||
    cl === "navegacion web" ||
    cl === "navegador" ||
    cl === "navegador web" ||
    cl.startsWith("navegador:")
  );
}

/**
 * Normaliza y extrae el nombre limpio del software o labor manual real
 */
export function extractCleanItemName(item: TimelineEntry): string {
  const meta = (item.metadata || {}) as Record<string, any>;
  const act = (item.action || "").toLowerCase();
  const cat = (item.category || "").toLowerCase();

  // 0. Si es inactividad, descanso o pausa del sistema, no es una aplicación de software
  if (
    cat.includes("inactiv") ||
    act.includes("sin actividad") ||
    act.includes("pausa prolongada") ||
    act.includes("pausa operativa") ||
    cat.includes("descanso") ||
    act.includes("descanso") ||
    act.includes("almuerzo") ||
    cat.includes("sanitaria") ||
    act.includes("sanitaria") ||
    act.includes("baño") ||
    act.includes("bano")
  ) {
    return "Pausa / Descanso";
  }

  // 1. Si es labor manual explícita
  if (meta.task) return meta.task;
  if (meta.manual && meta.label) return meta.label;

  // 2. Patrones directos de acciones manuales conocidas
  if (act.startsWith("inició:") || act.startsWith("inicio:") || act.startsWith("terminó:") || act.startsWith("termino:")) {
    const raw = item.action.replace(/^inici[oó]:\s*|^termin[oó]:\s*/i, "").split("(")[0].trim();
    if (raw) return raw;
  }
  if (
    act.startsWith("justificación:") ||
    act.startsWith("justificacion:") ||
    act.startsWith("justificación manual") ||
    act.startsWith("justificacion manual") ||
    meta.justification
  ) {
    const raw = meta.reason || meta.task || item.action.replace(/^justificaci[oó]n(\s*manual)?:\s*/i, "").split("(")[0].trim();
    return raw ? `Justificación Manual: ${raw}` : "Justificación Manual";
  }

  // 3. Software de escritorio y aplicaciones web
  const rawApp = (meta.app_name || meta.app || "").toLowerCase();
  const rawTitle = (meta.window_title || meta.title || "").toLowerCase();

  // Herramientas del sistema y accesorios
  if (rawTitle.includes("program manager") || act.includes("program manager") || rawApp.includes("program manager")) return "Escritorio de Windows";
  if (rawTitle.includes("conmutac") || act.includes("conmutac") || rawTitle.includes("task switching")) return "Conmutación de tareas";
  if (rawTitle.includes("google one") || rawApp.includes("google one") || act.includes("google one")) return "Google One";
  if (rawTitle.includes("supabase") || rawApp.includes("supabase") || act.includes("supabase")) return "Supabase";
  if (rawTitle.includes("youtube") || rawApp.includes("youtube") || act.includes("youtube")) return "YouTube";
  if (rawTitle.includes("google drive") || rawTitle.includes("drive.google") || rawApp.includes("drive")) return "Google Drive";
  if (rawTitle.includes("google docs") || rawTitle.includes("docs.google")) return "Google Docs";
  if (rawTitle.includes("google sheets") || rawTitle.includes("sheets.google")) return "Google Sheets";
  if (rawTitle.includes("gmail") || rawTitle.includes("mail.google")) return "Gmail";
  if (rawTitle.includes("mercadolibre") || rawTitle.includes("mercado libre")) return "Mercado Libre";
  if (rawTitle.includes("winbox") || rawApp.includes("winbox") || act.includes("winbox")) return "MikroTik WinBox";
  if (rawTitle.includes("mikrotik") || rawApp.includes("mikrotik")) return "MikroTik";
  if (rawTitle.includes("ivms") || rawApp.includes("ivms")) return "iVMS-4200";
  if (rawTitle.includes("sadp") || rawApp.includes("sadp")) return "Hikvision SADP";
  if (rawApp.includes("spotify") || rawTitle.includes("spotify") || act.includes("spotify")) return "Spotify";
  if (rawApp.includes("calc") || rawTitle.includes("calculadora")) return "Calculadora";
  if (rawApp.includes("notepad") || rawTitle.includes("bloc de notas")) return "Bloc de notas";

  if (rawApp.includes("linkus") || act.includes("linkus")) return "Linkus";
  if (rawApp.includes("whatsapp") || act.includes("whatsapp") || rawTitle.includes("whatsapp")) return "WhatsApp";
  if (rawApp.includes("odoo") || rawTitle.includes("odoo") || act.includes("odoo")) return "Odoo ERP";
  if (rawApp.includes("anydesk") || act.includes("anydesk")) return "AnyDesk";
  if (rawApp.includes("teamviewer") || act.includes("teamviewer")) return "TeamViewer";
  if (rawApp.includes("outlook") || rawApp.includes("correo") || rawTitle.includes("outlook")) return "Outlook";
  if (rawApp.includes("antigravity") || rawTitle.includes("antigravity") || act.includes("antigravity")) return "Antigravity";
  if (rawApp.includes("devin") || rawTitle.includes("devin")) return "Devin";
  if (rawApp.includes("github") || rawTitle.includes("github")) return "GitHub";
  if (rawApp.includes("chatgpt") || rawTitle.includes("chatgpt")) return "ChatGPT";
  if (rawApp.includes("nextime") || rawTitle.includes("nextime")) return "Nextime PRO";
  if (rawApp.includes("tienda 3d") || rawTitle.includes("tienda 3d")) return "Tienda 3D";
  if (rawTitle.includes("hikvision") || rawApp.includes("hikvision")) return "Hikvision";

  // 4. Si es navegador web (Brave, Chrome, Edge, Firefox), extraer dominio o título limpio
  const isBrowser = rawApp.includes("chrome") || rawApp.includes("brave") || rawApp.includes("edge") || rawApp.includes("firefox");
  if (isBrowser) {
    if (meta.domain) return meta.domain;
    if (meta.url) {
      try {
        const u = new URL(meta.url.startsWith("http") ? meta.url : `https://${meta.url}`);
        return u.hostname.replace(/^www\./, "");
      } catch {}
    }
    const cleanWinTitle = (meta.window_title || meta.title || "")
      .replace(/\s*[-–—]\s*(Brave|Google Chrome|Microsoft Edge|Firefox|Opera).*$/i, "")
      .trim();
    if (cleanWinTitle) {
      const lowerClean = cleanWinTitle.toLowerCase();
      if (lowerClean.includes("chat sekunet") || lowerClean.includes("atención al cliente")) {
        return "Seka Chat";
      }
      if (lowerClean.includes("buscar con google") || lowerClean.includes("google search")) {
        return "Búsqueda en Google";
      }
      if (lowerClean.includes("hik-connect") || lowerClean.includes("hikvision") || lowerClean.includes("cloudsso")) {
        return "Hikvision";
      }
      const stripped = cleanWinTitle.replace(/^Navegador:\s*/i, "").trim();
      return stripped.length > 30 ? stripped.substring(0, 30) + "..." : stripped;
    }
  }

  // 5. Todo lo que ocurre en la web/plataforma interna es Seka Chat
  if (act.includes("chat") || act.includes("caso") || rawApp.includes("seka")) {
    return "Seka Chat";
  }

  // 6. Si es búsqueda de Google o Hikvision en la acción registrada
  if (act.includes("buscar con google") || act.includes("google search")) {
    return "Búsqueda en Google";
  }
  if (act.includes("hikvision") || rawTitle.includes("hikvision")) {
    return "Hikvision";
  }

  if (meta.app_name && meta.app_name !== "ApplicationFrameHost") {
    let clean = meta.app_name.trim();
    if (clean.toLowerCase().startsWith("navegador:")) {
      clean = clean.replace(/^navegador:\s*/i, "").trim();
    }
    if (clean.toLowerCase().includes("buscar con google") || clean.toLowerCase().includes("google search")) {
      return "Búsqueda en Google";
    }
    if (!isCategoryName(clean)) return clean;
  }

  if (item.category && !isCategoryName(item.category)) return item.category;

  return "Seka Chat";
}

/**
 * Asigna una labor o software a una de las 8 Categorías Operativas oficiales
 */
export function assignToOperationalCategory(name: string, action: string = "", category: string = ""): string {
  const n = (name || "").toLowerCase();
  const a = (action || "").toLowerCase();
  const c = (category || "").toLowerCase();

  // Inactividad del sistema (NO es un descanso ni una aplicación)
  if (
    c.includes("inactiv") ||
    n.includes("inactiv") ||
    a.includes("inactiv") ||
    a.includes("sin actividad") ||
    a.includes("pausa prolongada") ||
    a.includes("pantalla bloqueada") ||
    n.includes("mystify") ||
    a.includes("mystify") ||
    n.endsWith(".scr") ||
    a.includes(".scr") ||
    n.includes("lockapp") ||
    a.includes("lockapp")
  ) {
    return "Inactividad";
  }

  // Justificación Manual
  if (
    c === "justificación manual" ||
    c === "justificacion manual" ||
    c.includes("justificaci") ||
    n.startsWith("justificación manual") ||
    n.startsWith("justificacion manual") ||
    a.startsWith("justificación manual") ||
    a.startsWith("justificacion manual") ||
    a.startsWith("justificación:") ||
    a.startsWith("justificacion:")
  ) {
    return "Justificación Manual";
  }

  // Pausa Sanitaria
  if (n.includes("baño") || n.includes("bano") || n.includes("sanitaria") || n.includes("sanitario") ||
      a.includes("baño") || a.includes("bano") || a.includes("sanitaria") || a.includes("sanitario")) {
    return "Pausa Sanitaria";
  }

  // Descansos
  if (n.includes("descanso") || n.includes("almuerzo") || n.includes("café") || n.includes("cafe") || n.includes("comida") ||
      a.includes("descanso") || a.includes("almuerzo") || a.includes("comida")) {
    return "Descansos";
  }

  // Servicio de Taller
  if (n.includes("diagnóstico") || n.includes("diagnostico") || n.includes("reparación") || n.includes("reparacion") ||
      n.includes("mantenimiento") || n.includes("tienda 3d") || c.includes("servicio de taller")) {
    return "Servicio de Taller";
  }

  // Gestión de Residuos
  if (n.includes("residuo") || n.includes("reciclaje") || n.includes("desecho") || n.includes("chatarra") || c.includes("residuos")) {
    return "Gestión de Residuos";
  }

  // Gestión del Taller
  if (n.includes("bodega") || n.includes("limpieza") || n.includes("exhibidor") || n.includes("orden") ||
      n.includes("herramienta") || c.includes("gestión del taller") || c.includes("gestion del taller")) {
    return "Gestión del Taller";
  }

  // On-the-Job Training (OJT)
  if (n.includes("capacita") || n.includes("ojt") || n.includes("training") || n.includes("inducci") ||
      n.includes("curso") || c.includes("ojt") || c.includes("training")) {
    return "On-the-Job Training (OJT)";
  }

  // Control Administrativo
  if (n.includes("reunión") || n.includes("reunion") || n.includes("inventario") || n.includes("garantía") ||
      n.includes("garantia") || n.includes("outlook") || n.includes("correo") || n.includes("antigravity") ||
      n.includes("devin") || n.includes("github") || n.includes("nextime") || n.includes("chatgpt") ||
      c.includes("administrativo") || c.includes("optimización")) {
    return "Control Administrativo";
  }

  // Utilidades (Spotify, Program Manager, accesorios del SO, calculadoras, etc.)
  if (n.includes("utilidad") || n.includes("spotify") || n.includes("program manager") ||
      n.includes("progman") || n.includes("calculadora") || n.includes("notepad") ||
      n.includes("bloc de notas") || n.includes("taskmgr") || n.includes("administrador de tareas") ||
      n.includes("escritorio") || n.includes("conmutac") || n.includes("task switching") ||
      n.includes("google one") ||
      c.includes("utilidades") || a.includes("spotify") || a.includes("program manager") ||
      a.includes("conmutac") || a.includes("escritorio") || a.includes("google one")) {
    return "Utilidades";
  }

  // Soporte (por defecto para chats, llamadas, Linkus, WhatsApp, Odoo, tickets)
  return "Soporte";
}

/**
 * MOTOR PRINCIPAL UNIFICADO: Calcula todos los KPIs y distribuciones con 100% de coherencia
 */
export function computeUnifiedActivityMetrics(
  timeline: TimelineEntry[],
  options: {
    targetDailyHours?: number;
    toleranceMinutes?: number;
    scheduleStart?: string;
    scheduleEnd?: string;
    useMixedSchedule?: boolean;
    daySchedules?: Record<number, { start?: string; end?: string; targetHours?: number }>;
  } = {}
): UnifiedDayMetrics {
  let targetDailyHours = options.targetDailyHours || 10;
  const toleranceMin = Math.max(1, options.toleranceMinutes ?? 15);
  const TOLERANCE_GAP_MS = toleranceMin * 60 * 1000;

  // 1. Filtrar y ordenar cronológicamente
  const sorted = [...timeline]
    .filter((t) => {
      if (!t.created_at || isNaN(new Date(t.created_at).getTime())) return false;
      const act = (t.action || "").toLowerCase();
      // Descartar falsos positivos de pestañas de navegador en segundo plano
      if (act.includes("pausa prolongada") && act.includes("sin interacción en")) {
        return false;
      }
      return true;
    })
    .sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime());

  if (options.useMixedSchedule && options.daySchedules && sorted.length > 0) {
    const firstCRDate = new Date(new Date(sorted[0].created_at!).toLocaleString("en-US", { timeZone: "America/Costa_Rica" }));
    const firstDay = firstCRDate.getDay();
    if (options.daySchedules[firstDay]?.targetHours) {
      targetDailyHours = Number(options.daySchedules[firstDay].targetHours);
    }
  }

  if (sorted.length === 0) {
    const emptyMaster: Record<MasterCategory, MasterBucket> = {
      Productivo: { id: "Productivo", label: "Productivo", durationMs: 0, formattedTime: "0s", percentage: 0, ...MASTER_COLORS.Productivo },
      Inactivo: { id: "Inactivo", label: "Inactivo", durationMs: 0, formattedTime: "0s", percentage: 0, ...MASTER_COLORS.Inactivo },
      Descanso: { id: "Descanso", label: "Descanso", durationMs: 0, formattedTime: "0s", percentage: 0, ...MASTER_COLORS.Descanso },
      "Pausa Sanitaria": { id: "Pausa Sanitaria", label: "Pausa Sanitaria", durationMs: 0, formattedTime: "0s", percentage: 0, ...MASTER_COLORS["Pausa Sanitaria"] },
    };
    return {
      totalDayMs: 0,
      totalDayTime: "0s",
      firstLoginTime: null,
      lastLogoutTime: null,
      productivityScore: 100,
      masterBuckets: emptyMaster,
      masterList: Object.values(emptyMaster),
      operationalBuckets: OFFICIAL_OPERATIONAL_CATEGORIES.map((c) => ({
        ...c,
        durationMs: 0,
        formattedTime: "0s",
        percentage: 0,
      })),
      topSoftware: [],
      detectedGaps: [],
      hourlyTrend: {},
      targetDailyHours,
      compliancePercent: 0,
      pcWorkMs: 0,
      pcWorkTime: "0s",
      manualJustificationMs: 0,
      manualJustificationTime: "0s",
    };
  }

  const firstLoginTime = formatTimeCR(sorted[0].created_at);
  const lastLogoutTime = formatTimeCR(sorted[sorted.length - 1].created_at);

  // Pre-escaneo de intervalos de labores manuales, descansos y justificaciones legítimas
  interface ActiveInterval {
    startMs: number;
    endMs: number;
    category: string;
    label: string;
  }
  const manualIntervals: ActiveInterval[] = [];
  let totalJustifiedMs = 0;

  for (let i = 0; i < sorted.length; i++) {
    const it = sorted[i];
    const act = (it.action || "").toLowerCase();
    const meta = (it.metadata || {}) as Record<string, any>;
    const tMs = new Date(it.created_at).getTime();

    const isStart = (act.startsWith("inició:") || act.startsWith("inicio:")) && (meta.manual || meta.task);
    const isEnd = (act.startsWith("terminó:") || act.startsWith("termino:")) && (meta.manual || meta.task);

    if (isStart) {
      const taskLabel = meta.task || it.action.replace(/^inici[oó]:\s*/i, "").trim();
      let foundEndMs = 0;
      for (let j = i + 1; j < sorted.length; j++) {
        const nextIt = sorted[j];
        const nextAct = (nextIt.action || "").toLowerCase();
        const nextMeta = (nextIt.metadata || {}) as Record<string, any>;
        if (
          (nextAct.startsWith("terminó:") || nextAct.startsWith("termino:")) &&
          (nextMeta.task === taskLabel || nextAct.includes(taskLabel.toLowerCase()))
        ) {
          foundEndMs = new Date(nextIt.created_at).getTime();
          break;
        }
      }
      if (foundEndMs > tMs) {
        manualIntervals.push({
          startMs: tMs,
          endMs: foundEndMs,
          category: it.category || "Descansos",
          label: taskLabel,
        });
      }
    } else if (isEnd) {
      const durSec = Number(meta.duration_seconds || (meta.duration_ms ? meta.duration_ms / 1000 : 0));
      if (durSec > 0) {
        const startMs = tMs - durSec * 1000;
        const alreadyCovered = manualIntervals.some(
          (inv) => Math.abs(inv.endMs - tMs) < 15000 && Math.abs(inv.startMs - startMs) < 15000
        );
        if (!alreadyCovered) {
          const taskLabel = meta.task || it.action.replace(/^termin[oó]:\s*/i, "").split("(")[0].trim();
          manualIntervals.push({
            startMs,
            endMs: tMs,
            category: it.category || "Descansos",
            label: taskLabel,
          });
        }
      }
    }

    const isJustification =
      Boolean(meta.justification) ||
      Boolean(meta.manual_justification) ||
      it.category === "Justificación Manual" ||
      it.category === "Justificación" ||
      act.startsWith("justificación:") ||
      act.startsWith("justificacion:") ||
      act.startsWith("justificación manual") ||
      act.startsWith("justificacion manual");

    if (isJustification) {
      const durMs = Number(
        it.duration_ms ||
          (meta.minutes ? meta.minutes * 60000 : 0) ||
          (meta.duration_seconds ? meta.duration_seconds * 1000 : 0)
      );
      if (durMs > 0) {
        totalJustifiedMs += durMs;
      }
      let justStartMs = 0;
      let justEndMs = 0;
      if (meta.date && meta.start_time && meta.end_time) {
        justStartMs = new Date(`${meta.date}T${meta.start_time}:00-06:00`).getTime();
        justEndMs = new Date(`${meta.date}T${meta.end_time}:00-06:00`).getTime();
      }
      if (justEndMs > justStartMs) {
        manualIntervals.push({
          startMs: justStartMs,
          endMs: justEndMs,
          category: "Justificación Manual",
          label: meta.reason || meta.task || "Justificación Manual",
        });
      }
    }
  }

  let usedOverlapJustificationMs = 0;
  const getCoveredOverlap = (gapStart: number, gapEnd: number) => {
    let overlapMs = 0;
    for (const inv of manualIntervals) {
      const s = Math.max(gapStart, inv.startMs);
      const e = Math.min(gapEnd, inv.endMs);
      if (e > s) {
        const part = e - s;
        overlapMs += part;
        if (inv.category === "Justificación Manual") {
          usedOverlapJustificationMs += part;
        }
      }
    }
    return overlapMs;
  };

  // Acumuladores de tiempo
  const opTimes: Record<string, number> = {};
  OFFICIAL_OPERATIONAL_CATEGORIES.forEach((c) => {
    opTimes[c.id] = 0;
  });

  const softTimes: Record<string, { durationMs: number; count: number; category: string }> = {};
  const hourlyTrend: Record<number, number> = {};
  for (let h = 6; h <= 19; h++) hourlyTrend[h] = 0;

  let idleTotalMs = 0;
  const detectedGaps: DetectedAbsenceGap[] = [];

  // ── DETECCIÓN DE TARDANZA AL INICIO DE JORNADA ──
  // Compara la hora programada de entrada contra el primer evento real del colaborador
  if (sorted.length > 0) {
    const firstEventMs = new Date(sorted[0].created_at).getTime();
    const crDateStr = new Date(firstEventMs).toLocaleDateString("en-CA", { timeZone: "America/Costa_Rica" });
    const currDay = new Date(new Date(firstEventMs).toLocaleString("en-US", { timeZone: "America/Costa_Rica" })).getDay();

    let sStart = options.scheduleStart;
    if (options.useMixedSchedule && options.daySchedules && options.daySchedules[currDay]?.start) {
      sStart = options.daySchedules[currDay].start;
    }

    if (sStart) {
      const schedStartMs = new Date(`${crDateStr}T${sStart.padStart(5, "0")}:00-06:00`).getTime();
      if (!isNaN(schedStartMs) && firstEventMs > schedStartMs) {
        const rawDelayMs = firstEventMs - schedStartMs;
        const coveredDelayMs = getCoveredOverlap(schedStartMs, firstEventMs);
        const effectiveDelayMs = Math.max(0, rawDelayMs - coveredDelayMs);

        // Horario programado es ley: CERO tolerancia para hora de entrada. Cualquier tardanza >= 1 min es inactividad a justificar.
        if (effectiveDelayMs >= 60000) {
          const excessMs = effectiveDelayMs;
          const excessMin = Math.round(excessMs / 60000);
          idleTotalMs += excessMs;

          const dStart = new Date(schedStartMs + coveredDelayMs);
          const dEnd = new Date(firstEventMs);
          detectedGaps.push({
            id: "gap-inicio-tardio",
            dateStr: crDateStr,
            dateFormatted: dStart.toLocaleDateString("es-CR", { day: "numeric", month: "short", timeZone: "America/Costa_Rica" }),
            startTime: formatTimeCR(dStart.toISOString()),
            endTime: formatTimeCR(dEnd.toISOString()),
            startTimeVal: dStart.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit", timeZone: "America/Costa_Rica" }),
            endTimeVal: dEnd.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit", timeZone: "America/Costa_Rica" }),
            durationMs: excessMs,
            minutes: excessMin,
            reason: `Inicio tardío respecto a horario programado (${sStart})`,
          });
        }
      }
    }
  }

  let currentIdleBlock: {
    start: number;
    end: number;
    durationMs: number;
    reason: string;
  } | null = null;

  const flushIdleBlock = () => {
    if (!currentIdleBlock) return;
    const dur = currentIdleBlock.durationMs;
    // La tolerancia configurada protege las pausas normales.
    // Solo si la inactividad supera la tolerancia oficial se evalúa como posible laguna.
    if (dur > TOLERANCE_GAP_MS) {
      const excessMs = dur - TOLERANCE_GAP_MS;
      const excessMin = Math.round(excessMs / 60000);
      // Solo si el exceso sobre la tolerancia es de al menos 3 minutos se crea laguna justificable.
      // Pequeños excesos de 1 o 2 minutos sobre la tolerancia se absorben como margen operativo normal.
      if (excessMin >= 3) {
        idleTotalMs += excessMs;
        const dStart = new Date(currentIdleBlock.start + TOLERANCE_GAP_MS);
        const dEnd = new Date(currentIdleBlock.end);
        let cleanReason = currentIdleBlock.reason
          .replace(/^Sin actividad por \d+ minutos mientras /i, "Inactividad en ")
          .replace(/^Pausa prolongada de \d+ minutos sin interacción en /i, "Sin interacción en ")
          .replace(/^Dejó de usar "[^"]+" \(([^)]+)\).*/i, "$1")
          .trim();
        if (cleanReason.toLowerCase().includes("mystify")) {
          cleanReason = "Protector de pantalla (Mystify.scr)";
        }
        detectedGaps.push({
          id: `idle-${currentIdleBlock.start}`,
          dateStr: dStart.toLocaleDateString("en-CA", { timeZone: "America/Costa_Rica" }),
          dateFormatted: dStart.toLocaleDateString("es-CR", { day: "numeric", month: "short", timeZone: "America/Costa_Rica" }),
          startTime: formatTimeCR(dStart.toISOString()),
          endTime: formatTimeCR(dEnd.toISOString()),
          startTimeVal: dStart.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit", timeZone: "America/Costa_Rica" }),
          endTimeVal: dEnd.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit", timeZone: "America/Costa_Rica" }),
          durationMs: excessMs,
          minutes: excessMin,
          reason: cleanReason || "Inactividad del sistema",
        });
      }
    }
    currentIdleBlock = null;
  };

  // Bucle cronológico continuo
  for (let i = 0; i < sorted.length; i++) {
    const it = sorted[i];
    const currTime = new Date(it.created_at).getTime();

    if (i === sorted.length - 1) {
      if (currentIdleBlock) {
        flushIdleBlock();
      }
      const meta = (it.metadata || {}) as Record<string, any>;
      const act = (it.action || "").toLowerCase();
      const isJustification = Boolean(
        meta.justification ||
          meta.manual_justification ||
          it.category === "Justificación Manual" ||
          it.category === "Justificación" ||
          act.startsWith("justificación:") ||
          act.startsWith("justificacion:") ||
          act.startsWith("justificación manual") ||
          act.startsWith("justificacion manual")
      );
      if (!isJustification) {
        const isManualEnd = (act.startsWith("terminó:") || act.startsWith("termino:")) && (meta.manual || meta.task);
        const dur = (isManualEnd || it.duration_ms) ? Number(it.duration_ms) : 60000;
        const itemName = extractCleanItemName(it);
        const opCategory = assignToOperationalCategory(itemName, it.action, it.category);
        opTimes[opCategory] = (opTimes[opCategory] || 0) + dur;
      }
      break;
    }

    const nextTime = new Date(sorted[i + 1].created_at).getTime();
    const rawGap = Math.max(0, nextTime - currTime);

    const meta = (it.metadata || {}) as Record<string, any>;
    const act = (it.action || "").toLowerCase();
    const isManualStart = (act.startsWith("inició:") || act.startsWith("inicio:")) && (meta.manual || meta.task);
    const isManualEnd = (act.startsWith("terminó:") || act.startsWith("termino:")) && (meta.manual || meta.task);
    const isJustification = Boolean(
      meta.justification ||
        meta.manual_justification ||
        it.category === "Justificación Manual" ||
        it.category === "Justificación" ||
        act.startsWith("justificación:") ||
        act.startsWith("justificacion:") ||
        act.startsWith("justificación manual") ||
        act.startsWith("justificacion manual")
    );

    const itemName = extractCleanItemName(it);
    const opCategory = assignToOperationalCategory(itemName, it.action, it.category);

    // Caso C: Inactividad del sistema (NO es software ni descanso)
    if (opCategory === "Inactividad") {
      const dur = Math.min(rawGap, 2 * 3600 * 1000);
      if (!currentIdleBlock) {
        currentIdleBlock = {
          start: currTime,
          end: nextTime,
          durationMs: dur,
          reason: it.action || "Inactividad del sistema",
        };
      } else {
        currentIdleBlock.end = nextTime;
        currentIdleBlock.durationMs += dur;
      }
      continue;
    }

    // Para cualquier otro evento que no sea Inactividad, cerramos el bloque de inactividad acumulado
    if (currentIdleBlock) {
      flushIdleBlock();
    }

    const recordSoftwareTime = (name: string, dur: number, cat: string) => {
      const l = (name || "").toLowerCase().trim();
      if (
        l.length < 2 ||
        isCategoryName(l) ||
        l.includes("inactiv") ||
        l.includes("pausa") ||
        l.includes("descanso") ||
        l.includes("almuerzo") ||
        l.includes("merienda") ||
        l.includes("sanitaria") ||
        l.includes("baño") ||
        l.includes("bano") ||
        l.startsWith("navegador:") ||
        l.startsWith("navegador web:") ||
        l.startsWith("mi bandeja") ||
        l === "explorer" ||
        l.includes("mystify")
      ) {
        return;
      }
      if (!softTimes[name]) softTimes[name] = { durationMs: 0, count: 0, category: cat };
      softTimes[name].durationMs += dur;
      softTimes[name].count++;
    };

    // Caso A: Tarea manual iniciada
    if (isManualStart) {
      const dur = Math.min(rawGap, 4 * 3600 * 1000);
      opTimes[opCategory] = (opTimes[opCategory] || 0) + dur;
      recordSoftwareTime(itemName, dur, opCategory);
      const crHour =
        parseInt(
          new Date(currTime).toLocaleString("en-US", { timeZone: "America/Costa_Rica", hour: "numeric", hour12: false }),
          10
        ) % 24;
      if (hourlyTrend[crHour] !== undefined) hourlyTrend[crHour] += dur;
      continue;
    }

    // Caso B: Tarea manual finalizada o justificación discreta
    if (isManualEnd || isJustification) {
      if (!isJustification) {
        const prev = i > 0 ? sorted[i - 1] : null;
        const prevAct = (prev?.action || "").toLowerCase();
        const prevWasStart = prev && (prevAct.startsWith("inició:") || prevAct.startsWith("inicio:"));
        if (!prevWasStart) {
          const discreteMs =
            Number(
              it.duration_ms ||
                (meta.minutes ? meta.minutes * 60000 : 0) ||
                (meta.duration_seconds ? meta.duration_seconds * 1000 : 0)
            ) || 0;
          const dur = Math.min(discreteMs, 4 * 3600 * 1000);
          if (dur > 0) {
            opTimes[opCategory] = (opTimes[opCategory] || 0) + dur;
            recordSoftwareTime(itemName, dur, opCategory);
            const crHour =
              parseInt(
                new Date(currTime).toLocaleString("en-US", { timeZone: "America/Costa_Rica", hour: "numeric", hour12: false }),
                10
              ) % 24;
            if (hourlyTrend[crHour] !== undefined) hourlyTrend[crHour] += dur;
          }
        }
      } else {
        const discreteMs =
          Number(
            it.duration_ms ||
              (meta.minutes ? meta.minutes * 60000 : 0) ||
              (meta.duration_seconds ? meta.duration_seconds * 1000 : 0)
          ) || 0;
        const dur = Math.min(discreteMs, 4 * 3600 * 1000);
        if (dur > 0) {
          recordSoftwareTime(itemName, dur, "Justificación Manual");
          const crHour =
            parseInt(
              new Date(currTime).toLocaleString("en-US", { timeZone: "America/Costa_Rica", hour: "numeric", hour12: false }),
              10
            ) % 24;
          if (hourlyTrend[crHour] !== undefined) hourlyTrend[crHour] += dur;
        }
      }
      continue;
    }

    // Caso C2: Pausas / Descansos explícitos (NO son software ni URLs, son tiempos de pausa laboral)
    if (opCategory === "Descansos") {
      const dur = Math.min(rawGap, 2 * 3600 * 1000);
      opTimes["Descansos"] = (opTimes["Descansos"] || 0) + dur;
      continue;
    }
    if (opCategory === "Pausa Sanitaria") {
      const dur = Math.min(rawGap, 30 * 60 * 1000);
      opTimes["Pausa Sanitaria"] = (opTimes["Pausa Sanitaria"] || 0) + dur;
      continue;
    }

    // Caso D: Trabajo estándar en PC
    // Transición de día, fin de jornada laboral nocturna o fuera de horario asignado:
    const dCurrStr = new Date(currTime).toLocaleDateString("en-CA", { timeZone: "America/Costa_Rica" });
    const dNextStr = new Date(nextTime).toLocaleDateString("en-CA", { timeZone: "America/Costa_Rica" });

    let isOutsideWorkingHours = false;
    let sStart = options.scheduleStart;
    let sEnd = options.scheduleEnd;
    const currCRDate = new Date(new Date(currTime).toLocaleString("en-US", { timeZone: "America/Costa_Rica" }));
    const currDay = currCRDate.getDay();

    if (options.useMixedSchedule && options.daySchedules && options.daySchedules[currDay]) {
      const ds = options.daySchedules[currDay];
      if (ds.start) sStart = ds.start;
      if (ds.end) sEnd = ds.end;
    }

    if (sEnd) {
      const [endH, endM] = sEnd.split(":").map(Number);
      const curMin = currCRDate.getHours() * 60 + currCRDate.getMinutes();
      const endLimitMin = endH * 60 + endM;
      if (curMin >= endLimitMin) {
        isOutsideWorkingHours = true;
      }
    }
    if (sStart) {
      const [startH, startM] = sStart.split(":").map(Number);
      const nextCRDate = new Date(new Date(nextTime).toLocaleString("en-US", { timeZone: "America/Costa_Rica" }));
      const nextMin = nextCRDate.getHours() * 60 + nextCRDate.getMinutes();
      const startLimitMin = startH * 60 + startM;
      if (nextMin <= startLimitMin) {
        isOutsideWorkingHours = true;
      }
    }

    if (dCurrStr !== dNextStr || rawGap > 4 * 3600 * 1000 || isOutsideWorkingHours) {
      // Transición nocturna entre días, fuera de turno o fuera de horario: se contabiliza el evento pero no la brecha
      const dur = 60000;
      opTimes[opCategory] = (opTimes[opCategory] || 0) + dur;
      recordSoftwareTime(itemName, dur, opCategory);
      continue;
    }

    if (rawGap <= TOLERANCE_GAP_MS) {
      const dur = rawGap > 0 ? rawGap : 60000;
      opTimes[opCategory] = (opTimes[opCategory] || 0) + dur;
      recordSoftwareTime(itemName, dur, opCategory);

      const crHour =
        parseInt(
          new Date(currTime).toLocaleString("en-US", { timeZone: "America/Costa_Rica", hour: "numeric", hour12: false }),
          10
        ) % 24;
      if (hourlyTrend[crHour] !== undefined) hourlyTrend[crHour] += dur;
    } else {
      // Verificar si la brecha está cubierta por tarea manual, descanso activo o labor previa reportada por el agente
      const coveredMs = getCoveredOverlap(currTime, nextTime);
      const nextMeta = (sorted[i + 1]?.metadata || {}) as Record<string, any>;
      const nextDur = Number(sorted[i + 1]?.duration_ms || (nextMeta.duration_seconds ? nextMeta.duration_seconds * 1000 : 0)) || 0;
      const workReportedMs = nextDur > 0 ? Math.min(nextDur, rawGap) : 0;
      const effectiveIdleGap = Math.max(0, rawGap - coveredMs - workReportedMs);

      if (effectiveIdleGap <= TOLERANCE_GAP_MS) {
        const dur = Math.min(effectiveIdleGap > 0 ? effectiveIdleGap : TOLERANCE_GAP_MS, rawGap);
        opTimes[opCategory] = (opTimes[opCategory] || 0) + dur;
        recordSoftwareTime(itemName, dur, opCategory);

        const crHour =
          parseInt(
            new Date(currTime).toLocaleString("en-US", { timeZone: "America/Costa_Rica", hour: "numeric", hour12: false }),
            10
          ) % 24;
        if (hourlyTrend[crHour] !== undefined) hourlyTrend[crHour] += dur;
      } else {
        // Brecha no cubierta que supera la tolerancia oficial configurada
        const excessMs = effectiveIdleGap - TOLERANCE_GAP_MS;
        const excessMin = Math.round(excessMs / 60000);

        // Si el exceso no supera los 2 minutos (ej. pausas normales apenas encima del límite),
        // se mantiene cubierto por la tolerancia y margen operativo normal de la jornada.
        if (excessMin < 3) {
          const dur = effectiveIdleGap;
          opTimes[opCategory] = (opTimes[opCategory] || 0) + dur;
          recordSoftwareTime(itemName, dur, opCategory);

          const crHour =
            parseInt(
              new Date(currTime).toLocaleString("en-US", { timeZone: "America/Costa_Rica", hour: "numeric", hour12: false }),
              10
            ) % 24;
          if (hourlyTrend[crHour] !== undefined) hourlyTrend[crHour] += dur;
        } else {
          // Superó la tolerancia en 3 o más minutos: se respeta la tolerancia oficial como productiva y el exceso es la laguna
          const productivePart = TOLERANCE_GAP_MS;
          const idlePart = Math.min(excessMs, 4 * 3600 * 1000);

          opTimes[opCategory] = (opTimes[opCategory] || 0) + productivePart;
          if (!softTimes[itemName]) softTimes[itemName] = { durationMs: 0, count: 0, category: opCategory };
          softTimes[itemName].durationMs += productivePart;
          softTimes[itemName].count++;

          const crHour =
            parseInt(
              new Date(currTime).toLocaleString("en-US", { timeZone: "America/Costa_Rica", hour: "numeric", hour12: false }),
              10
            ) % 24;
          if (hourlyTrend[crHour] !== undefined) hourlyTrend[crHour] += productivePart;

          idleTotalMs += idlePart;

          const dStart = new Date(currTime + coveredMs + TOLERANCE_GAP_MS);
          const dEnd = new Date(nextTime);
          const totalAbsenceMin = Math.round(effectiveIdleGap / 60000);
          detectedGaps.push({
            id: `gap-${i}`,
            dateStr: dStart.toLocaleDateString("en-CA", { timeZone: "America/Costa_Rica" }),
            dateFormatted: dStart.toLocaleDateString("es-CR", { day: "numeric", month: "short", timeZone: "America/Costa_Rica" }),
            startTime: formatTimeCR(dStart.toISOString()),
            endTime: formatTimeCR(dEnd.toISOString()),
            startTimeVal: dStart.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit", timeZone: "America/Costa_Rica" }),
            endTimeVal: dEnd.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit", timeZone: "America/Costa_Rica" }),
            durationMs: idlePart,
            minutes: excessMin,
            reason: `Ausencia de ${totalAbsenceMin} min (${formatTimeCR(dStart.toISOString())} - ${formatTimeCR(dEnd.toISOString())}) — excede tolerancia (${toleranceMin} min) en ${excessMin} min`,
          });
        }
      }
    }
  }

  // Cerrar bloque de inactividad final si quedó pendiente
  if (currentIdleBlock) {
    flushIdleBlock();
  }

  // ── DETECCIÓN DE SALIDA ANTICIPADA AL CIERRE DE JORNADA ──
  // Si la jornada ya concluyó según el reloj y el último evento ocurrió antes de la hora de salida
  if (sorted.length > 0) {
    const lastEventMs = new Date(sorted[sorted.length - 1].created_at).getTime();
    const crDateStr = new Date(lastEventMs).toLocaleDateString("en-CA", { timeZone: "America/Costa_Rica" });
    const currDay = new Date(new Date(lastEventMs).toLocaleString("en-US", { timeZone: "America/Costa_Rica" })).getDay();

    let sEnd = options.scheduleEnd;
    if (options.useMixedSchedule && options.daySchedules && options.daySchedules[currDay]?.end) {
      sEnd = options.daySchedules[currDay].end;
    }

    if (sEnd) {
      const schedEndMs = new Date(`${crDateStr}T${sEnd.padStart(5, "0")}:00-06:00`).getTime();
      const nowCostaRicaStr = new Date().toLocaleDateString("en-CA", { timeZone: "America/Costa_Rica" });
      const nowCostaRicaMs = new Date(new Date().toLocaleString("en-US", { timeZone: "America/Costa_Rica" })).getTime();
      const isShiftEnded = nowCostaRicaMs >= schedEndMs || crDateStr < nowCostaRicaStr;

      if (!isNaN(schedEndMs) && isShiftEnded && lastEventMs < schedEndMs) {
        const rawEarlyMs = schedEndMs - lastEventMs;
        const coveredEarlyMs = getCoveredOverlap(lastEventMs, schedEndMs);
        const effectiveEarlyMs = Math.max(0, rawEarlyMs - coveredEarlyMs);

        // Horario programado es ley: CERO tolerancia para salida anticipada. Salir >= 1 min antes es inactividad a justificar.
        if (effectiveEarlyMs >= 60000) {
          const excessMs = effectiveEarlyMs;
          const excessMin = Math.round(excessMs / 60000);
          idleTotalMs += excessMs;

          const dStart = new Date(lastEventMs + coveredEarlyMs);
          const dEnd = new Date(schedEndMs);
          detectedGaps.push({
            id: "gap-salida-anticipada",
            dateStr: crDateStr,
            dateFormatted: dStart.toLocaleDateString("es-CR", { day: "numeric", month: "short", timeZone: "America/Costa_Rica" }),
            startTime: formatTimeCR(dStart.toISOString()),
            endTime: formatTimeCR(dEnd.toISOString()),
            startTimeVal: dStart.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit", timeZone: "America/Costa_Rica" }),
            endTimeVal: dEnd.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit", timeZone: "America/Costa_Rica" }),
            durationMs: excessMs,
            minutes: excessMin,
            reason: `Salida anticipada respecto a horario programado (${sEnd})`,
          });
        }
      }
    }
  }

  // ── APLICAR JUSTIFICACIONES MANUALES A LA INACTIVIDAD Y LAGUNAS ──
  opTimes["Justificación Manual"] = totalJustifiedMs;

  if (totalJustifiedMs > 0) {
    let remainingJustifyPool = Math.max(0, totalJustifiedMs - usedOverlapJustificationMs);

    // Deducir de las lagunas pendientes en orden (FIFO)
    const pendingGaps: DetectedAbsenceGap[] = [];
    for (const gap of detectedGaps) {
      if (remainingJustifyPool >= gap.durationMs) {
        // La laguna queda 100% cubierta y justificada, se remueve
        remainingJustifyPool -= gap.durationMs;
      } else if (remainingJustifyPool > 0) {
        // La laguna queda parcialmente cubierta
        const leftoverMs = gap.durationMs - remainingJustifyPool;
        remainingJustifyPool = 0;
        const leftoverMin = Math.round(leftoverMs / 60000);
        if (leftoverMin >= 1) {
          pendingGaps.push({
            ...gap,
            durationMs: leftoverMs,
            minutes: leftoverMin,
          });
        }
      } else {
        pendingGaps.push(gap);
      }
    }
    detectedGaps.length = 0;
    detectedGaps.push(...pendingGaps);

    // Reducir la inactividad total acumulada
    const unappliedJustificationMs = Math.max(0, totalJustifiedMs - usedOverlapJustificationMs);
    idleTotalMs = Math.max(0, idleTotalMs - unappliedJustificationMs);
  }

  // PARIDAD MATEMÁTICA Y REGLA DE TOLERANCIA ESTRICTA:
  // La inactividad oficial corresponde exactamente con la suma de las lagunas pendientes detectadas.
  // Si no hay lagunas (o fueron justificadas/absorbidas por la tolerancia), la inactividad es CERO.
  // Cualquier residuo menor a 1 minuto (< 60,000 ms) queda absorbido.
  if (detectedGaps.length === 0) {
    idleTotalMs = 0;
  } else {
    idleTotalMs = detectedGaps.reduce((acc, g) => acc + g.durationMs, 0);
    if (idleTotalMs < 60000) {
      idleTotalMs = 0;
      detectedGaps.length = 0;
    }
  }

  // 2. CÁLCULO ESTRICTO DE CATEGORÍAS MASTER (Nivel 1)
  const productiveMs =
    (opTimes["Soporte"] || 0) +
    (opTimes["Servicio de Taller"] || 0) +
    (opTimes["Control Administrativo"] || 0) +
    (opTimes["Gestión del Taller"] || 0) +
    (opTimes["Gestión de Residuos"] || 0) +
    (opTimes["On-the-Job Training (OJT)"] || 0) +
    (opTimes["Justificación Manual"] || 0) +
    (opTimes["Utilidades"] || 0);

  const breakMs = opTimes["Descansos"] || 0;
  const sanitaryMs = opTimes["Pausa Sanitaria"] || 0;

  const totalDayMs = Math.max(1, productiveMs + idleTotalMs + breakMs + sanitaryMs);

  const masterBuckets: Record<MasterCategory, MasterBucket> = {
    Productivo: {
      id: "Productivo",
      label: "Productivo",
      durationMs: productiveMs,
      formattedTime: formatDurationMs(productiveMs),
      percentage: Math.round((productiveMs / totalDayMs) * 100),
      ...MASTER_COLORS.Productivo,
    },
    Inactivo: {
      id: "Inactivo",
      label: "Inactivo",
      durationMs: idleTotalMs,
      formattedTime: formatDurationMs(idleTotalMs),
      percentage: Math.round((idleTotalMs / totalDayMs) * 100),
      ...MASTER_COLORS.Inactivo,
    },
    Descanso: {
      id: "Descanso",
      label: "Descanso",
      durationMs: breakMs,
      formattedTime: formatDurationMs(breakMs),
      percentage: Math.round((breakMs / totalDayMs) * 100),
      ...MASTER_COLORS.Descanso,
    },
    "Pausa Sanitaria": {
      id: "Pausa Sanitaria",
      label: "Pausa Sanitaria",
      durationMs: sanitaryMs,
      formattedTime: formatDurationMs(sanitaryMs),
      percentage: Math.round((sanitaryMs / totalDayMs) * 100),
      ...MASTER_COLORS["Pausa Sanitaria"],
    },
  };

  // 3. CÁLCULO ESTRICTO DE CATEGORÍAS OPERATIVAS (Nivel 2)
  const operationalBuckets: OperationalBucket[] = OFFICIAL_OPERATIONAL_CATEGORIES.map((cat) => {
    const dur = opTimes[cat.id] || 0;
    return {
      ...cat,
      durationMs: dur,
      formattedTime: formatDurationMs(dur),
      percentage: Math.round((dur / totalDayMs) * 100),
    };
  }).sort((a, b) => b.durationMs - a.durationMs);

  // 4. RANKING DE SOFTWARE Y TAREAS (Nivel 3)
  const topSoftware: SoftwareBucket[] = Object.entries(softTimes)
    .map(([name, data]) => ({
      name,
      category: data.category,
      durationMs: data.durationMs,
      formattedTime: formatDurationMs(data.durationMs),
      percentage: Math.round((data.durationMs / totalDayMs) * 100),
      count: data.count,
    }))
    .sort((a, b) => b.durationMs - a.durationMs);

  const productivityScore = Math.min(100, Math.max(0, Math.round((productiveMs / (productiveMs + idleTotalMs || 1)) * 100)));
  const targetMs = targetDailyHours * 3600 * 1000;
  const compliancePercent = Math.min(100, Math.round((productiveMs / (targetMs || 1)) * 100));

  const manualJustificationMs = opTimes["Justificación Manual"] || 0;
  const pcWorkMs = Math.max(0, productiveMs - manualJustificationMs);

  return {
    totalDayMs,
    totalDayTime: formatDurationMs(totalDayMs),
    firstLoginTime,
    lastLogoutTime,
    productivityScore,
    masterBuckets,
    masterList: [masterBuckets.Productivo, masterBuckets.Inactivo, masterBuckets.Descanso, masterBuckets["Pausa Sanitaria"]],
    operationalBuckets,
    topSoftware,
    detectedGaps: detectedGaps.reverse(),
    hourlyTrend,
    targetDailyHours,
    compliancePercent,
    pcWorkMs,
    pcWorkTime: formatDurationMs(pcWorkMs),
    manualJustificationMs,
    manualJustificationTime: formatDurationMs(manualJustificationMs),
  };
}
