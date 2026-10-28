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
  totalWorkdayMs: number;
  totalWorkdayTime: string;
  firstLoginTime: string | null;
  lastLogoutTime: string | null;
  isShiftActive: boolean;
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

export function isPassiveTimelineItem(it: TimelineEntry): boolean {
  const act = (it.action || "").toLowerCase();
  const cat = (it.category || "").toLowerCase();
  return (
    cat.includes("inactiv") ||
    act.includes("sin actividad") ||
    act.includes("pantalla bloqueada") ||
    act.includes("lockapp") ||
    act.includes("mystify") ||
    act.endsWith(".scr") ||
    act.startsWith("inició:") ||
    act.startsWith("inicio:") ||
    act.startsWith("terminó:") ||
    act.startsWith("termino:")
  );
}

/**
 * Normaliza y extrae el nombre limpio del software o labor manual real
 */
export function extractCleanItemName(item: TimelineEntry, appMappings?: Record<string, any>): string {
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

  // 0.1 Mapeos de procesos y aplicaciones configurados por el usuario
  if (appMappings && typeof appMappings === "object") {
    const rawApp = (meta.app_name || meta.app || meta.process || "").trim();
    const rawTitle = (meta.window_title || meta.title || meta.context || "").trim();
    const taskName = (meta.task || meta.label || "").trim();
    const rawAct = item.action || "";

    // A. Coincidencia exacta de clave configurada
    for (const key of Object.keys(appMappings)) {
      const kl = key.toLowerCase().trim();
      if (!kl || kl === "sin clasificar" || kl === "unassigned") continue;
      if (
        kl === rawApp.toLowerCase() ||
        kl === rawTitle.toLowerCase() ||
        kl === taskName.toLowerCase() ||
        kl === rawAct.toLowerCase()
      ) {
        return key;
      }
    }

    // B. Coincidencia por inclusión (subcadena significativa)
    for (const key of Object.keys(appMappings)) {
      const kl = key.toLowerCase().trim();
      if (!kl || kl.length < 3 || kl === "sin clasificar" || kl === "unassigned") continue;
      if (
        (rawApp && rawApp.toLowerCase().includes(kl)) ||
        (rawTitle && rawTitle.toLowerCase().includes(kl)) ||
        (taskName && taskName.toLowerCase().includes(kl)) ||
        (rawAct && rawAct.toLowerCase().includes(kl))
      ) {
        return key;
      }
    }
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
  if (
    rawApp.includes("pickerhost") ||
    rawTitle.includes("pickerhost") ||
    rawApp.includes("file picker") ||
    rawTitle.includes("file picker") ||
    rawTitle.includes("seleccionar carpeta") ||
    rawTitle.includes("guardar como") ||
    rawTitle.includes("abrir archivo") ||
    rawApp.includes("applicationframehost")
  ) {
    return "Explorador de archivos";
  }

  // Pantallas transitorias y de autenticación (Login, Iniciar sesión, Nueva pestaña, etc.)
  // NUNCA deben tratarse como herramientas independientes de software del taller
  const cleanTitleForCheck = rawTitle.replace(/\s*[-–—]\s*(brave|google chrome|microsoft edge|edge|firefox|opera).*$/i, "").trim();
  const cleanAppForCheck = rawApp.replace(/^navegador:\s*/i, "").trim();
  if (
    cleanTitleForCheck === "login" ||
    cleanTitleForCheck.startsWith("login ") ||
    cleanTitleForCheck.endsWith(" login") ||
    cleanTitleForCheck === "iniciar sesión" ||
    cleanTitleForCheck === "iniciar sesion" ||
    cleanTitleForCheck.startsWith("iniciar sesi") ||
    cleanTitleForCheck === "sign in" ||
    cleanTitleForCheck.startsWith("sign in") ||
    cleanTitleForCheck === "auth" ||
    cleanTitleForCheck.startsWith("auth") ||
    cleanTitleForCheck === "acceso" ||
    cleanTitleForCheck === "nueva pestaña" ||
    cleanTitleForCheck === "new tab" ||
    cleanTitleForCheck === "bienvenido" ||
    cleanTitleForCheck === "cargando" ||
    cleanAppForCheck === "login" ||
    cleanAppForCheck.startsWith("login ") ||
    cleanAppForCheck.endsWith(" login") ||
    cleanAppForCheck === "iniciar sesión" ||
    cleanAppForCheck === "iniciar sesion" ||
    cleanAppForCheck.startsWith("iniciar sesi") ||
    cleanAppForCheck === "sign in" ||
    cleanAppForCheck === "auth" ||
    cleanAppForCheck === "acceso"
  ) {
    return "Navegador Web";
  }

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
  const isBrowser =
    rawApp.includes("chrome") ||
    rawApp.includes("brave") ||
    rawApp.includes("edge") ||
    rawApp.includes("firefox") ||
    rawApp.includes("opera") ||
    rawApp.startsWith("navegador") ||
    rawTitle.includes("brave") ||
    rawTitle.includes("chrome") ||
    rawTitle.includes("edge") ||
    rawTitle.includes("firefox");
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
      // Limpiar badges de notificación como (1) , (43) , etc.
      const strippedBadge = cleanWinTitle.replace(/^\(\d+\+?\)\s*/, "").replace(/^\*\s*/, "").trim();
      const lowerClean = strippedBadge.toLowerCase();

      // Odoo ERP (tickets #04xxx, cotizaciones, presupuestos, portal Odoo)
      if (
        lowerClean.includes("odoo") ||
        /#\d{4,6}/.test(lowerClean) ||
        lowerClean.includes("cotizaciones") ||
        lowerClean.includes("presupuesto") ||
        /\b[sS]\d{5}\b/.test(lowerClean)
      ) {
        return "Odoo ERP";
      }

      if (lowerClean.includes("chat sekunet") || lowerClean.includes("atención al cliente")) {
        return "Seka Chat";
      }
      if (lowerClean.includes("buscar con google") || lowerClean.includes("google search")) {
        return "Búsqueda en Google";
      }
      if (lowerClean.includes("hik-connect") || lowerClean.includes("hikvision") || lowerClean.includes("cloudsso") || lowerClean.includes("hik-partner")) {
        return "Hikvision";
      }

      // TÍTULOS GENÉRICOS DE NAVEGADOR: No son aplicaciones del taller, son navegación web
      if (
        lowerClean === "nuevo" ||
        lowerClean === "iniciar sesión" ||
        lowerClean === "iniciar sesion" ||
        lowerClean.startsWith("iniciar sesi") ||
        lowerClean === "login" ||
        lowerClean.startsWith("login ") ||
        lowerClean === "sign in" ||
        lowerClean === "nueva pestaña" ||
        lowerClean === "new tab" ||
        lowerClean === "bienvenido" ||
        lowerClean === "home" ||
        lowerClean === "acceso" ||
        lowerClean === "acceder" ||
        lowerClean === "sin título" ||
        lowerClean === "sin titulo" ||
        lowerClean === "configuración" ||
        lowerClean === "configuracion" ||
        lowerClean.includes("500: internal server error")
      ) {
        return "Navegador Web";
      }

      const stripped = strippedBadge.replace(/^Navegador:\s*/i, "").trim();
      return stripped.length > 80 ? stripped.substring(0, 80) + "..." : stripped;
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
 * respetando prioritariamente los mapeos personalizados configurados por el usuario
 */
export function assignToOperationalCategory(
  name: string,
  action: string = "",
  category: string = "",
  metadata?: Record<string, any> | null,
  appMappings?: Record<string, any>
): string {
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

  // Pausa Sanitaria del sistema o evento explícito
  if (n.includes("baño") || n.includes("bano") || n.includes("sanitaria") || n.includes("sanitario") ||
      a.includes("baño") || a.includes("bano") || a.includes("sanitaria") || a.includes("sanitario")) {
    return "Pausa Sanitaria";
  }

  // Descansos explícitos del sistema
  if (n.includes("descanso") || n.includes("almuerzo") || n.includes("café") || n.includes("cafe") || n.includes("comida") ||
      a.includes("descanso") || a.includes("almuerzo") || a.includes("comida")) {
    return "Descansos";
  }

  // Justificación Manual explícita
  if (
    c === "justificación manual" ||
    c === "justificacion manual" ||
    c.includes("justificaci") ||
    n.startsWith("justificación manual") ||
    n.startsWith("justificacion manual") ||
    a.startsWith("justificación manual") ||
    a.startsWith("justificacion manual") ||
    a.startsWith("justificación:") ||
    a.startsWith("justificacion:") ||
    metadata?.justification
  ) {
    return "Justificación Manual";
  }

  // ── PRIORIDAD ABSOLUTA: MAPEOS DE PROCESOS Y APLICACIONES DEL USUARIO ──
  if (appMappings && typeof appMappings === "object") {
    let mappedVal = appMappings[name];
    if (!mappedVal) {
      const meta = metadata || {};
      const rawApp = (meta.app_name || meta.app || meta.process || "").toLowerCase().trim();
      const rawTitle = (meta.window_title || meta.title || meta.context || "").toLowerCase().trim();
      const taskName = (meta.task || meta.label || "").toLowerCase().trim();
      const actLower = a.trim();
      const nameLower = n.trim();

      // Buscar coincidencia exacta o por subcadena en las claves de mapeo
      for (const [key, val] of Object.entries(appMappings)) {
        const kl = key.toLowerCase().trim();
        if (!kl || kl === "sin clasificar" || kl === "unassigned") continue;
        if (
          kl === nameLower ||
          kl === taskName ||
          kl === rawApp ||
          kl === rawTitle ||
          (kl.length >= 3 && (
            nameLower.includes(kl) ||
            (rawApp && rawApp.includes(kl)) ||
            (rawTitle && rawTitle.includes(kl)) ||
            (taskName && taskName.includes(kl)) ||
            (actLower && actLower.includes(kl))
          ))
        ) {
          mappedVal = val;
          break;
        }
      }
    }

    if (mappedVal) {
      const catCandidate = typeof mappedVal === "object" ? mappedVal.category : mappedVal;
      if (catCandidate && catCandidate !== "Sin Clasificar" && catCandidate !== "unassigned") {
        const foundOfficial = OFFICIAL_OPERATIONAL_CATEGORIES.find(
          (cat) => cat.id.toLowerCase() === catCandidate.toLowerCase() || cat.label.toLowerCase() === catCandidate.toLowerCase()
        );
        if (foundOfficial) {
          return foundOfficial.id;
        }
        return catCandidate;
      }
    }
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

  // Utilidades (Spotify, Navegador Web, Program Manager, accesorios del SO, calculadoras, etc.)
  if (n.includes("utilidad") || n.includes("spotify") || n.includes("program manager") ||
      n.includes("progman") || n.includes("calculadora") || n.includes("notepad") ||
      n.includes("bloc de notas") || n.includes("taskmgr") || n.includes("administrador de tareas") ||
      n.includes("escritorio") || n.includes("conmutac") || n.includes("task switching") ||
      n.includes("google one") || n.includes("navegador") || n.includes("browser") ||
      n.includes("búsqueda") || n.includes("busqueda") || n.includes("explorador") ||
      c.includes("utilidades") || a.includes("spotify") || a.includes("program manager") ||
      a.includes("conmutac") || a.includes("escritorio") || a.includes("google one")) {
    return "Utilidades";
  }

  // Soporte (únicamente para chats, llamadas, Linkus, WhatsApp, Odoo, tickets o soporte explícito)
  if (
    n.includes("whatsapp") || n.includes("seka chat") || n.includes("chat") ||
    n.includes("linkus") || n.includes("phone") || n.includes("llamada") ||
    n.includes("anydesk") || n.includes("teamviewer") || n.includes("ultraviewer") ||
    n.includes("rustdesk") || n.includes("odoo") || n.includes("ticket") ||
    c.includes("soporte") || a.includes("whatsapp") || a.includes("chat") ||
    a.includes("llamada") || a.includes("linkus")
  ) {
    return "Soporte";
  }

  // Navegación web genérica no clasificada
  if (
    n.includes("brave") || n.includes("chrome") || n.includes("edge") ||
    n.includes("firefox") || n.includes("opera") || n.includes("web") ||
    a.includes("navegador") || c.includes("navegaci")
  ) {
    return "Utilidades";
  }

  // Si no coincide con ninguna regla oficial, DEBE ser Sin Clasificar (no contaminar Soporte)
  return "Sin Clasificar";
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
    appMappings?: Record<string, any>;
  } = {}
): UnifiedDayMetrics {
  let targetDailyHours = options.targetDailyHours || 10;
  const toleranceMin = Math.max(1, options.toleranceMinutes ?? 3);
  const TOLERANCE_GAP_MS = toleranceMin * 60 * 1000;

  // 1. Filtrar y ordenar cronológicamente
  const rawSorted = [...timeline]
    .filter((t) => {
      if (!t.created_at || isNaN(new Date(t.created_at).getTime())) return false;
      const act = (t.action || "").toLowerCase();
      const cat = (t.category || "").toLowerCase();
      // Descartar falsos positivos de pestañas de navegador en segundo plano
      if (act.includes("pausa prolongada") && act.includes("sin interacción en")) {
        return false;
      }
      // Si no está clasificado como Inactividad, descartar protectores de pantalla disfrazados de apps
      if (cat !== "inactividad" && (act.includes("mystify") || act.includes(".scr") || act.includes("scrnsave"))) {
        return false;
      }
      // Descartar registros con duraciones negativas o inválidas
      if (t.duration_ms && (t.duration_ms < 0 || isNaN(t.duration_ms))) {
        return false;
      }
      return true;
    })
    .sort((a, b) => {
      const ta = new Date(a.created_at).getTime();
      const tb = new Date(b.created_at).getTime();
      if (Math.abs(ta - tb) <= 2000) {
        const aIsIdle = (a.category || "").toLowerCase() === "inactividad";
        const bIsIdle = (b.category || "").toLowerCase() === "inactividad";
        if (aIsIdle !== bIsIdle) return aIsIdle ? 1 : -1;
      }
      return ta - tb;
    });

  // 1.1 Quitar Inactividad residual nocturna (Mystify / Inactividad continua) antes del primer evento de usuario del día
  const firstRealIdx = rawSorted.findIndex((t) => {
    const act = (t.action || "").toLowerCase();
    const cat = (t.category || "").toLowerCase();
    const isIdle =
      cat === "inactividad" ||
      act.includes("sin actividad") ||
      act.includes("pantalla bloqueada") ||
      act.includes("mystify") ||
      act.includes(".scr");
    const isJust =
      cat === "justificación manual" ||
      cat === "justificacion manual" ||
      act.includes("justificaci");
    return !isIdle && !isJust;
  });

  const effectiveSorted = firstRealIdx > 0 ? rawSorted.slice(firstRealIdx) : rawSorted;

  // 1.2 Detectar ventanas de inactividad explícita (idle_timeout) para no aceptar checkpoints 'En curso •' emitidos dentro de ellas
  const explicitIdleWindows: { start: number; end: number }[] = [];
  for (const it of effectiveSorted) {
    const cat = (it.category || "").toLowerCase();
    const act = (it.action || "").toLowerCase();
    const isIdleTimeout =
      cat === "inactividad" &&
      (it.metadata?.reason === "idle_timeout" || act.startsWith("sin actividad por"));
    const durMs =
      Number(
        it.duration_ms ||
          (it.metadata?.idle_seconds ? it.metadata.idle_seconds * 1000 : 0)
      ) || 0;
    if (isIdleTimeout && durMs >= 60000) {
      const s = new Date(it.created_at).getTime();
      explicitIdleWindows.push({ start: s, end: s + Math.min(durMs, 30 * 60 * 1000) });
    }
  }

  // 1.3 Deduplicar eventos de finalización manual repetidos y descartar checkpoints emitidos dentro de ventanas de inactividad
  const sorted: typeof rawSorted = [];
  for (let i = 0; i < effectiveSorted.length; i++) {
    const cur = effectiveSorted[i];
    const curAct = (cur.action || "").toLowerCase();
    const curTime = new Date(cur.created_at).getTime();
    const prevAccepted = sorted[sorted.length - 1];

    const isCheckpoint = Boolean(cur.metadata?.checkpoint_5min || curAct.startsWith("en curso •"));
    if (isCheckpoint) {
      const insideIdle = explicitIdleWindows.some(
        (w) => curTime >= w.start - 2000 && curTime <= w.end
      );
      if (insideIdle) {
        continue;
      }
    }

    if (isCheckpoint && prevAccepted) {
      const prevCat = (prevAccepted.category || "").toLowerCase();
      const prevAct = (prevAccepted.action || "").toLowerCase();
      const prevIsIdle = prevCat === "inactividad" || prevAct.startsWith("sin actividad por") || prevAct.startsWith("pantalla bloqueada");
      const prevTime = new Date(prevAccepted.created_at).getTime();

      const nextEv = effectiveSorted[i + 1];
      const nextCat = (nextEv?.category || "").toLowerCase();
      const nextAct = (nextEv?.action || "").toLowerCase();
      const nextIsIdle = Boolean(nextEv && (nextCat === "inactividad" || nextAct.startsWith("sin actividad por") || nextAct.startsWith("pantalla bloqueada")));
      const nextTime = nextEv ? new Date(nextEv.created_at).getTime() : 0;

      if (prevIsIdle && (curTime - prevTime < 120_000) && (!nextEv || (nextIsIdle && (nextTime - curTime < 120_000)))) {
        continue;
      }
    }

    const isCurEnd = (curAct.startsWith("terminó:") || curAct.startsWith("termino:")) && (cur.metadata?.manual || cur.metadata?.task);
    if (isCurEnd) {
      const curTask = (cur.metadata?.task || cur.action.replace(/^termin[oó]:\s*/i, "").split("(")[0]).toLowerCase().trim();
      if (prevAccepted) {
        const prevAct = (prevAccepted.action || "").toLowerCase();
        const isPrevEnd = (prevAct.startsWith("terminó:") || prevAct.startsWith("termino:")) && (prevAccepted.metadata?.manual || prevAccepted.metadata?.task);
        if (isPrevEnd) {
          const prevTask = (prevAccepted.metadata?.task || prevAccepted.action.replace(/^termin[oó]:\s*/i, "").split("(")[0]).toLowerCase().trim();
          const prevTime = new Date(prevAccepted.created_at).getTime();
          if (curTask === prevTask && Math.abs(curTime - prevTime) < 120_000) {
            continue; // Descartar evento duplicado espurio
          }
        }
      }
    }
    sorted.push(cur);
  }

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
      totalWorkdayMs: 0,
      totalWorkdayTime: "0s",
      firstLoginTime: null,
      lastLogoutTime: null,
      isShiftActive: false,
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
  const lastEvent = sorted[sorted.length - 1];
  const lastAct = (lastEvent.action || "").toLowerCase();
  const lastMeta = (lastEvent.metadata || {}) as Record<string, any>;
  const isLastManualActive = (lastAct.startsWith("inició:") || lastAct.startsWith("inicio:")) && (lastMeta.manual || lastMeta.task);

  const crDateStrDay = new Date(sorted[0].created_at).toLocaleDateString("en-CA", { timeZone: "America/Costa_Rica" });
  const nowCostaRicaStrDay = new Date().toLocaleDateString("en-CA", { timeZone: "America/Costa_Rica" });
  const isTodayDay = crDateStrDay === nowCostaRicaStrDay;

  const lastLogoutTime = (isTodayDay && isLastManualActive)
    ? formatTimeCR(new Date().toISOString())
    : formatTimeCR(lastEvent.created_at);

  // Pre-escaneo de intervalos de labores manuales, descansos y justificaciones legítimas
  interface ActiveInterval {
    startMs: number;
    endMs: number;
    category: string;
    label: string;
  }
  const manualIntervals: ActiveInterval[] = [];
  const handledEndIndices = new Set<number>();
  let totalJustifiedMs = 0;
  let sanitaryJustifiedMs = 0;
  let breakJustifiedMs = 0;
  let workJustifiedMs = 0;

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
      let explicitDurMs = 0;
      for (let j = i + 1; j < sorted.length; j++) {
        const nextIt = sorted[j];
        const nextAct = (nextIt.action || "").toLowerCase();
        const nextMeta = (nextIt.metadata || {}) as Record<string, any>;
        if (
          (nextAct.startsWith("terminó:") || nextAct.startsWith("termino:")) &&
          (nextMeta.task === taskLabel || nextAct.includes(taskLabel.toLowerCase()))
        ) {
          foundEndMs = new Date(nextIt.created_at).getTime();
          explicitDurMs = Number(nextIt.duration_ms || (nextMeta.duration_seconds ? nextMeta.duration_seconds * 1000 : 0));
          handledEndIndices.add(j);
          break;
        }
      }
      if (foundEndMs > tMs) {
        const catLower = (it.category || "").toLowerCase();
        const isSanitary = catLower.includes("sanitaria") || taskLabel.toLowerCase().includes("baño") || taskLabel.toLowerCase().includes("bano");
        const isBreak = isSanitary || catLower.includes("descanso") || taskLabel.toLowerCase().includes("almuerzo") || taskLabel.toLowerCase().includes("café") || taskLabel.toLowerCase().includes("cafe");

        if (isBreak) {
          // Descomponer el intervalo en los lapsos donde el usuario estuvo efectivamente ausente del PC
          // sin absorber los eventos donde estuvo trabajando activamente en software
          let segStart = tMs;
          let totalSanitaryAccumMs = 0;
          for (let k = i + 1; k < sorted.length; k++) {
            const evK = sorted[k];
            const tK = new Date(evK.created_at).getTime();
            if (tK >= foundEndMs) break;

            if (!isPassiveTimelineItem(evK)) {
              // Hubo trabajo activo en PC en evK. El descanso físico se pausa aquí
              if (tK > segStart + 20000) {
                let segDur = tK - segStart;
                if (isSanitary) {
                  segDur = Math.min(segDur, Math.max(0, 15 * 60 * 1000 - totalSanitaryAccumMs));
                  totalSanitaryAccumMs += segDur;
                }
                if (segDur > 0) {
                  manualIntervals.push({
                    startMs: segStart,
                    endMs: segStart + segDur,
                    category: it.category || "Descansos",
                    label: taskLabel,
                  });
                }
              }
              // El nuevo segmento de pausa solo reanudará cuando el PC vuelva a estar inactivo/bloqueado
              segStart = tK + 60000;
            } else if (isPassiveTimelineItem(evK)) {
              if (segStart > tK) segStart = tK;
            }
          }

          if (foundEndMs > segStart + 20000) {
            let segDur = foundEndMs - segStart;
            if (isSanitary) {
              segDur = Math.min(segDur, Math.max(0, 15 * 60 * 1000 - totalSanitaryAccumMs));
            }
            if (segDur > 0) {
              manualIntervals.push({
                startMs: segStart,
                endMs: segStart + segDur,
                category: it.category || "Descansos",
                label: taskLabel,
              });
            }
          }
        } else {
          manualIntervals.push({
            startMs: tMs,
            endMs: foundEndMs,
            category: it.category || "Descansos",
            label: taskLabel,
          });
        }
      } else if (isTodayDay && i === sorted.length - 1) {
        // Tarea manual en curso únicamente si es hoy y es el último evento activo
        const nowMs = Date.now();
        const elapsedSinceStart = nowMs - tMs;
        if (elapsedSinceStart > 0 && elapsedSinceStart < 4 * 3600 * 1000) {
          const ongoingEndMs = nowMs;
          manualIntervals.push({
            startMs: tMs,
            endMs: ongoingEndMs,
            category: it.category || "Control Administrativo",
            label: taskLabel,
          });
        }
      }
    } else if (isEnd) {
      // Si este evento de fin ya fue emparejado con su inició previo, no duplicar el intervalo
      if (handledEndIndices.has(i)) {
        continue;
      }
      const durSec = Number(meta.duration_seconds || (meta.duration_ms ? meta.duration_ms / 1000 : 0));
      if (durSec > 0) {
        const startMs = tMs - durSec * 1000;
        const alreadyCovered = manualIntervals.some(
          (inv) => Math.abs(inv.endMs - tMs) < 60000 && Math.abs(inv.startMs - startMs) < 60000
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
      const catLower = (it.category || "").toLowerCase();
      const taskLower = String(meta.task || meta.reason || meta.label || it.action || "").toLowerCase();
      const subcatLower = String(meta.subcategory || meta.manual_subcategory || meta.original_category || "").toLowerCase();
      const isJustSanitary =
        catLower === "pausa sanitaria" ||
        catLower.includes("sanitaria") ||
        subcatLower === "pausa sanitaria" ||
        subcatLower.includes("sanitaria") ||
        taskLower.includes("baño") ||
        taskLower.includes("bano") ||
        taskLower.includes("sanitaria") ||
        taskLower.includes("sanitario") ||
        act.includes("baño") ||
        act.includes("bano") ||
        act.includes("sanitaria");

      const isJustBreak =
        !isJustSanitary && (
          catLower === "descansos" ||
          catLower.includes("descanso") ||
          subcatLower === "descansos" ||
          subcatLower.includes("descanso") ||
          taskLower.includes("descanso") ||
          taskLower.includes("almuerzo") ||
          taskLower.includes("café") ||
          taskLower.includes("cafe") ||
          taskLower.includes("comida") ||
          taskLower.includes("merienda") ||
          act.includes("descanso") ||
          act.includes("almuerzo") ||
          act.includes("comida")
        );

      const durMs = Number(
        it.duration_ms ||
          (meta.minutes ? meta.minutes * 60000 : 0) ||
          (meta.duration_seconds ? meta.duration_seconds * 1000 : 0)
      );
      if (durMs > 0) {
        totalJustifiedMs += durMs;
        if (isJustSanitary) {
          sanitaryJustifiedMs += durMs;
        } else if (isJustBreak) {
          breakJustifiedMs += durMs;
        } else {
          workJustifiedMs += durMs;
        }
      }
      let justStartMs = 0;
      let justEndMs = 0;
      if (meta.date && meta.start_time && meta.end_time) {
        justStartMs = new Date(`${meta.date}T${meta.start_time}:00-06:00`).getTime();
        justEndMs = new Date(`${meta.date}T${meta.end_time}:00-06:00`).getTime();
      }
      if (justEndMs > justStartMs) {
        const invCat = isJustSanitary ? "Pausa Sanitaria" : isJustBreak ? "Descansos" : (meta.original_category || "Justificación Manual");
        manualIntervals.push({
          startMs: justStartMs,
          endMs: justEndMs,
          category: invCat,
          label: meta.reason || meta.task || invCat,
        });
      }
    }
  }

  // Fusión de intervalos manuales para calcular cobertura física sin duplicar tiempos superpuestos
  manualIntervals.sort((a, b) => a.startMs - b.startMs);
  const mergedManualIntervals: ActiveInterval[] = [];
  for (const inv of manualIntervals) {
    const prev = mergedManualIntervals[mergedManualIntervals.length - 1];
    if (prev && inv.startMs < prev.endMs) {
      prev.endMs = Math.max(prev.endMs, inv.endMs);
    } else {
      mergedManualIntervals.push({ ...inv });
    }
  }

  let usedOverlapJustificationMs = 0;
  const getCoveredOverlap = (gapStart: number, gapEnd: number) => {
    let overlapMs = 0;
    for (const inv of mergedManualIntervals) {
      const s = Math.max(gapStart, inv.startMs);
      const e = Math.min(gapEnd, inv.endMs);
      if (e > s) {
        overlapMs += (e - s);
      }
    }
    for (const inv of manualIntervals) {
      const s = Math.max(gapStart, inv.startMs);
      const e = Math.min(gapEnd, inv.endMs);
      if (e > s && (inv.category === "Justificación Manual" || inv.category === "Pausa Sanitaria" || inv.category === "Descansos")) {
        usedOverlapJustificationMs += (e - s);
      }
    }
    return Math.min(gapEnd - gapStart, overlapMs);
  };

  // Acumuladores de tiempo
  const opTimes: Record<string, number> = {};
  OFFICIAL_OPERATIONAL_CATEGORIES.forEach((c) => {
    opTimes[c.id] = 0;
  });

  const softTimes: Record<string, { durationMs: number; count: number; category: string }> = {};
  const hourlyTrend: Record<number, number> = {};
  for (let h = 0; h < 24; h++) hourlyTrend[h] = 0;

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

        // La tolerancia configurada NO aplica a la hora de entrada: retraso efectivo >= 1 min es inicio tardío
        if (effectiveDelayMs >= 60000) {
          const excessMs = effectiveDelayMs;
          const excessMin = Math.round(excessMs / 60000);
          if (excessMin >= 1) {
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
              reason: `Inicio tardío respecto a horario programado (${sStart}) (${excessMin} min)`,
            });
          }
        }
      }
    }
  }

  const getScheduleBoundsForMs = (refMs: number): { startMs: number | null; endMs: number | null; isWithin: boolean } => {
    const crDateStr = new Date(refMs).toLocaleDateString("en-CA", { timeZone: "America/Costa_Rica" });
    const currDay = new Date(new Date(refMs).toLocaleString("en-US", { timeZone: "America/Costa_Rica" })).getDay();
    let sStart = options.scheduleStart;
    let sEnd = options.scheduleEnd;
    if (options.useMixedSchedule && options.daySchedules && options.daySchedules[currDay]) {
      if (options.daySchedules[currDay].start) sStart = options.daySchedules[currDay].start;
      if (options.daySchedules[currDay].end) sEnd = options.daySchedules[currDay].end;
    }
    const startMs = sStart ? new Date(`${crDateStr}T${sStart.padStart(5, "0")}:00-06:00`).getTime() : null;
    const endMs = sEnd ? new Date(`${crDateStr}T${sEnd.padStart(5, "0")}:00-06:00`).getTime() : null;
    const validStart = startMs !== null && !isNaN(startMs) ? startMs : null;
    const validEnd = endMs !== null && !isNaN(endMs) ? endMs : null;
    let isWithin = true;
    if (validStart !== null && refMs < validStart) isWithin = false;
    if (validEnd !== null && refMs >= validEnd) isWithin = false;
    return { startMs: validStart, endMs: validEnd, isWithin };
  };

  let currentIdleBlock: {
    start: number;
    end: number;
    durationMs: number;
    reason: string;
  } | null = null;

  const flushIdleBlock = () => {
    if (!currentIdleBlock) return;
    // Regla de filtro de horario: fuera del horario laboral (antes o después) el tiempo inactivo no se envía a ningún proceso
    const bounds = getScheduleBoundsForMs(currentIdleBlock.start);
    if (!bounds.isWithin) {
      currentIdleBlock = null;
      return;
    }
    const clampedStart = bounds.startMs !== null ? Math.max(currentIdleBlock.start, bounds.startMs) : currentIdleBlock.start;
    const clampedEnd = bounds.endMs !== null ? Math.min(currentIdleBlock.end, bounds.endMs) : currentIdleBlock.end;
    const clampedDur = Math.max(0, clampedEnd - clampedStart);

    const coveredMs = getCoveredOverlap(clampedStart, clampedEnd);
    const effectiveDur = Math.max(0, clampedDur - coveredMs);
    // Respetar estrictamente el panel de Tolerancia de Inactividad:
    // "Pausas menores a este límite cuentan como trabajo activo dentro de la jornada laboral."
    // Si la inactividad alcanza o supera el límite de tolerancia (ej. >= 3 min), se contabiliza íntegra como Inactivo.
    if (effectiveDur >= TOLERANCE_GAP_MS) {
      const idleMin = Math.max(1, Math.round(effectiveDur / 60000));
      idleTotalMs += effectiveDur;
      const dStart = new Date(clampedStart + coveredMs);
      const dEnd = new Date(clampedEnd);
      let cleanReason = currentIdleBlock.reason
        .replace(/^Inactividad finalizada \(([^)]+)\).*/i, "Inactividad ($1)")
        .replace(/^Sin actividad por \d+ minutos mientras /i, "Inactividad en ")
        .replace(/^Pausa prolongada de \d+ minutos sin interacción en /i, "Sin interacción en ")
        .replace(/^Dejó de usar "[^"]+" \(([^)]+)\).*/i, "$1")
        .trim();
      if (cleanReason.toLowerCase().includes("mystify") || cleanReason.toLowerCase().includes(".scr")) {
        cleanReason = "Inactividad (Protector de pantalla)";
      } else if (cleanReason.toLowerCase().includes("lockapp") || cleanReason.toLowerCase().includes("pantalla bloqueada")) {
        cleanReason = "Inactividad (Pantalla bloqueada)";
      }
      detectedGaps.push({
        id: `idle-${clampedStart}`,
        dateStr: dStart.toLocaleDateString("en-CA", { timeZone: "America/Costa_Rica" }),
        dateFormatted: dStart.toLocaleDateString("es-CR", { day: "numeric", month: "short", timeZone: "America/Costa_Rica" }),
        startTime: formatTimeCR(dStart.toISOString()),
        endTime: formatTimeCR(dEnd.toISOString()),
        startTimeVal: dStart.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit", timeZone: "America/Costa_Rica" }),
        endTimeVal: dEnd.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit", timeZone: "America/Costa_Rica" }),
        durationMs: effectiveDur,
        minutes: idleMin,
        reason: cleanReason || "Inactividad del sistema",
      });
    }
    currentIdleBlock = null;
  };

  const recordSoftwareTime = (name: string, dur: number, cat: string) => {
    const l = (name || "").toLowerCase().trim();
    if (
      l.length < 2 ||
      isCategoryName(l) ||
      l === "login" ||
      l.startsWith("login ") ||
      l.endsWith(" login") ||
      l === "iniciar sesión" ||
      l === "iniciar sesion" ||
      l.startsWith("iniciar sesi") ||
      l === "sign in" ||
      l.startsWith("sign in") ||
      l === "auth" ||
      l.startsWith("auth") ||
      l === "acceso" ||
      l === "nueva pestaña" ||
      l === "new tab" ||
      l.includes("pickerhost") ||
      l.includes("file picker") ||
      l.includes("seleccionar carpeta") ||
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

  // Bucle cronológico continuo
  for (let i = 0; i < sorted.length; i++) {
    const it = sorted[i];
    const currTime = new Date(it.created_at).getTime();

    if (i === sorted.length - 1) {
      const meta = (it.metadata || {}) as Record<string, any>;
      const act = (it.action || "").toLowerCase();
      const itemName = extractCleanItemName(it, options.appMappings);
      const opCategory = assignToOperationalCategory(itemName, it.action, it.category, meta, options.appMappings);

      if (opCategory === "Inactividad") {
        const bounds = getScheduleBoundsForMs(currTime);
        if (!bounds.isWithin) {
          if (currentIdleBlock) flushIdleBlock();
          break;
        }
        const nowMs = Date.now();
        const explicitIdleMs = Number(it.duration_ms || (meta.duration_seconds ? meta.duration_seconds * 1000 : 0) || (meta.idle_seconds ? meta.idle_seconds * 1000 : 0)) || 0;
        const ongoingIdleMs = isTodayDay ? Math.min(Math.max(explicitIdleMs, Math.max(0, nowMs - currTime)), 24 * 3600 * 1000) : explicitIdleMs;
        const rawEndIdleMs = currTime + ongoingIdleMs;
        const endIdleMs = bounds.endMs !== null ? Math.min(rawEndIdleMs, bounds.endMs) : rawEndIdleMs;
        const clampedOngoingMs = Math.max(0, endIdleMs - currTime);
        if (!currentIdleBlock) {
          currentIdleBlock = {
            start: currTime,
            end: endIdleMs,
            durationMs: clampedOngoingMs,
            reason: it.action || "Inactividad del sistema",
          };
        } else {
          currentIdleBlock.end = Math.max(currentIdleBlock.end, endIdleMs);
          currentIdleBlock.durationMs = Math.max(0, currentIdleBlock.end - currentIdleBlock.start);
        }
        flushIdleBlock();
        break;
      }

      if (currentIdleBlock) {
        flushIdleBlock();
      }

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
        const isManualStart = (act.startsWith("inició:") || act.startsWith("inicio:")) && (meta.manual || meta.task);
        const isManualEnd = (act.startsWith("terminó:") || act.startsWith("termino:")) && (meta.manual || meta.task);

        let dur = 60000;
        if (isManualStart) {
          const nowMs = Date.now();
          const elapsed = nowMs - currTime;
          dur = elapsed > 0 ? elapsed : 60000;
        } else if (isManualEnd) {
          // El cierre de una labor manual ya fue imputado por su evento de inicio correspondiente; dur = 0
          dur = 0;
        } else if (it.duration_ms) {
          dur = Number(it.duration_ms);
        }

        opTimes[opCategory] = (opTimes[opCategory] || 0) + dur;
        recordSoftwareTime(itemName, dur, opCategory);
        const crHour =
          parseInt(
            new Date(currTime).toLocaleString("en-US", { timeZone: "America/Costa_Rica", hour: "numeric", hour12: false }),
            10
          ) % 24;
        if (hourlyTrend[crHour] !== undefined) hourlyTrend[crHour] += dur;
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

    const itemName = extractCleanItemName(it, options.appMappings);
    const opCategory = assignToOperationalCategory(itemName, it.action, it.category, meta, options.appMappings);

    // Caso C: Inactividad del sistema (solo se envía dentro del horario laboral; fuera de horario el inactivo no se envía a ningún proceso)
    if (opCategory === "Inactividad") {
      const bounds = getScheduleBoundsForMs(currTime);
      if (!bounds.isWithin) {
        if (currentIdleBlock) flushIdleBlock();
        continue;
      }
      const explicitIdleMs = Number(it.duration_ms || (meta.duration_seconds ? meta.duration_seconds * 1000 : 0)) || 0;
      const effectiveEnd = Math.max(nextTime, currTime + Math.min(explicitIdleMs, rawGap));
      const clampedEnd = bounds.endMs !== null ? Math.min(effectiveEnd, bounds.endMs) : effectiveEnd;
      const dur = Math.max(0, clampedEnd - currTime);
      if (!currentIdleBlock) {
        currentIdleBlock = {
          start: currTime,
          end: clampedEnd,
          durationMs: dur,
          reason: it.action || "Inactividad del sistema",
        };
      } else {
        currentIdleBlock.end = Math.max(currentIdleBlock.end, clampedEnd);
        currentIdleBlock.durationMs = Math.max(0, currentIdleBlock.end - currentIdleBlock.start);
      }
      continue;
    }

    // Para cualquier otro evento que no sea Inactividad, cerramos el bloque de inactividad acumulado
    if (currentIdleBlock) {
      flushIdleBlock();
    }

    // Caso A: Tarea manual iniciada
    if (isManualStart) {
      let manualDuration = Math.min(rawGap, 4 * 3600 * 1000);
      const taskLabel = (meta.task || it.action.replace(/^inici[oó]:\s*/i, "").trim()).toLowerCase();
      for (let j = i + 1; j < sorted.length; j++) {
        const nextIt = sorted[j];
        const nextAct = (nextIt.action || "").toLowerCase();
        const nextMeta = (nextIt.metadata || {}) as Record<string, any>;
        if (
          (nextAct.startsWith("terminó:") || nextAct.startsWith("termino:")) &&
          (nextMeta.task?.toLowerCase() === taskLabel || nextAct.includes(taskLabel))
        ) {
          const explicitMs = Number(nextIt.duration_ms || (nextMeta.duration_seconds ? nextMeta.duration_seconds * 1000 : 0));
          const elapsedToEnd = Math.max(0, new Date(nextIt.created_at).getTime() - currTime);
          let effectiveMs = explicitMs > 0 ? Math.min(explicitMs, elapsedToEnd + 15 * 60 * 1000) : elapsedToEnd;
          const catLower = (it.category || "").toLowerCase();
          const isSanitary = catLower.includes("sanitaria") || taskLabel.includes("baño") || taskLabel.includes("bano");
          const isBreak = isSanitary || catLower.includes("descanso") || taskLabel.includes("almuerzo") || taskLabel.includes("café") || taskLabel.includes("cafe");

          if (isBreak) {
            // Calcular el tiempo pasivo real (ausencia de pantalla) dentro del intervalo
            let passiveAccumMs = 0;
            let currentPassiveStart = currTime;
            for (let k = i + 1; k < j; k++) {
              const evK = sorted[k];
              const tK = new Date(evK.created_at).getTime();
              if (!isPassiveTimelineItem(evK)) {
                if (tK > currentPassiveStart) {
                  passiveAccumMs += (tK - currentPassiveStart);
                }
                currentPassiveStart = tK + 60000;
              } else {
                if (currentPassiveStart > tK) currentPassiveStart = tK;
              }
            }
            const endEventTime = new Date(sorted[j].created_at).getTime();
            if (endEventTime > currentPassiveStart) {
              passiveAccumMs += (endEventTime - currentPassiveStart);
            }

            if (isSanitary) {
              passiveAccumMs = Math.min(passiveAccumMs, 15 * 60 * 1000);
            }
            effectiveMs = Math.max(60000, passiveAccumMs);
          }

          manualDuration = effectiveMs;
          handledEndIndices.add(j);
          break;
        }
      }

      const dur = manualDuration > 0 ? manualDuration : 60000;
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
        const alreadyHandled = handledEndIndices.has(i) || sorted.slice(0, i).some((prev) => {
          const prevAct = (prev.action || "").toLowerCase();
          const prevMeta = (prev.metadata || {}) as Record<string, any>;
          const prevIsStart = (prevAct.startsWith("inició:") || prevAct.startsWith("inicio:")) && (prevMeta.manual || prevMeta.task);
          const taskLabel = (meta.task || it.action.replace(/^termin[oó]:\s*/i, "").split("(")[0].trim()).toLowerCase();
          return prevIsStart && (prevMeta.task?.toLowerCase() === taskLabel || prevAct.includes(taskLabel));
        });

        if (!alreadyHandled) {
          const discreteMs =
            Number(
              it.duration_ms ||
                (meta.minutes ? meta.minutes * 60000 : 0) ||
                (meta.duration_seconds ? meta.duration_seconds * 1000 : 0)
            ) || 0;
          const firstDayEventMs = new Date(sorted[0].created_at).getTime();
          const maxElapsedSinceDayStart = Math.max(0, currTime - firstDayEventMs);
          const dur = discreteMs > 0 ? (maxElapsedSinceDayStart > 0 ? Math.min(discreteMs, maxElapsedSinceDayStart) : discreteMs) : 0;
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
        const catLower = (it.category || "").toLowerCase();
        const taskLower = String(meta.task || meta.reason || meta.label || it.action || "").toLowerCase();
        const subcatLower = String(meta.subcategory || meta.manual_subcategory || meta.original_category || "").toLowerCase();
        const isJustSanitary =
          catLower === "pausa sanitaria" ||
          catLower.includes("sanitaria") ||
          subcatLower === "pausa sanitaria" ||
          subcatLower.includes("sanitaria") ||
          taskLower.includes("baño") ||
          taskLower.includes("bano") ||
          taskLower.includes("sanitaria") ||
          taskLower.includes("sanitario") ||
          act.includes("baño") ||
          act.includes("bano") ||
          act.includes("sanitaria");

        const isJustBreak =
          !isJustSanitary && (
            catLower === "descansos" ||
            catLower.includes("descanso") ||
            subcatLower === "descansos" ||
            subcatLower.includes("descanso") ||
            taskLower.includes("descanso") ||
            taskLower.includes("almuerzo") ||
            taskLower.includes("café") ||
            taskLower.includes("cafe") ||
            taskLower.includes("comida") ||
            taskLower.includes("merienda") ||
            act.includes("descanso") ||
            act.includes("almuerzo") ||
            act.includes("comida")
          );

        const discreteMs =
          Number(
            it.duration_ms ||
              (meta.minutes ? meta.minutes * 60000 : 0) ||
              (meta.duration_seconds ? meta.duration_seconds * 1000 : 0)
          ) || 0;
        const dur = discreteMs;
        if (dur > 0) {
          if (!isJustSanitary && !isJustBreak) {
            recordSoftwareTime(itemName, dur, "Justificación Manual");
          }
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
      const dur = rawGap;
      opTimes["Descansos"] = (opTimes["Descansos"] || 0) + dur;
      continue;
    }
    if (opCategory === "Pausa Sanitaria") {
      const dur = rawGap;
      opTimes["Pausa Sanitaria"] = (opTimes["Pausa Sanitaria"] || 0) + dur;
      continue;
    }

    // Caso D: Trabajo estándar en PC (medido 24/7 para soportar jornada regular y horas extras)
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

    // Salto entre dos fechas distintas en consultas multidiarias: contabilizar la duración explícita del evento sin unir la noche entre días
    if (dCurrStr !== dNextStr) {
      const explicitDur = Number(it.duration_ms || (meta.duration_seconds ? meta.duration_seconds * 1000 : 0)) || 60000;
      opTimes[opCategory] = (opTimes[opCategory] || 0) + explicitDur;
      recordSoftwareTime(itemName, explicitDur, opCategory);
      continue;
    }

    const coveredMs = getCoveredOverlap(currTime, nextTime);
    const uncoveredGap = Math.max(0, rawGap - coveredMs);

    if (uncoveredGap <= TOLERANCE_GAP_MS) {
      const dur = uncoveredGap > 0 ? uncoveredGap : (coveredMs > 0 ? 0 : 60000);
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
    } else {
      const nextIt = sorted[i + 1];
      const nextMeta = (nextIt?.metadata || {}) as Record<string, any>;
      const nextAct = (nextIt?.action || "").toLowerCase();
      const nextIsManualEnd = (nextAct.startsWith("terminó:") || nextAct.startsWith("termino:")) && (nextMeta.manual || nextMeta.task);
      const nextIsJustification = Boolean(
        nextMeta.justification ||
        nextMeta.manual_justification ||
        nextIt?.category === "Justificación Manual" ||
        nextIt?.category === "Justificación" ||
        nextAct.startsWith("justificación:") ||
        nextAct.startsWith("justificacion:")
      );
      const nextIsIdle = (nextIt?.category || "").toLowerCase() === "inactividad" || nextAct.startsWith("sin actividad por") || nextAct.startsWith("pantalla bloqueada");

      // No reclamar como trabajo en PC la duración de un evento de cierre manual, justificación o inactividad
      // ni reutilizar la duración de la sesión que está finalizando cuando supera la tolerancia
      const nextDur = (!nextIsManualEnd && !nextIsJustification && !nextIsIdle)
        ? (Number(nextIt?.duration_ms || (nextMeta.duration_seconds ? nextMeta.duration_seconds * 1000 : 0)) || 0)
        : 0;
      const maxUnCoveredGap = Math.max(0, rawGap - coveredMs);
      // Si el siguiente evento es un heartbeat corto (ej. 30s-300s) tras un hueco largo, solo acredita su duración real (máx TOLERANCE_GAP_MS)
      const workReportedMs = nextDur > 0 ? Math.min(nextDur, maxUnCoveredGap, TOLERANCE_GAP_MS) : 0;
      const effectiveIdleGap = Math.max(0, rawGap - coveredMs - workReportedMs);

      if (effectiveIdleGap <= TOLERANCE_GAP_MS) {
        const dur = Math.min(effectiveIdleGap + workReportedMs, maxUnCoveredGap);
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
      } else {
        // Brecha no cubierta que supera la tolerancia oficial configurada en el panel (ej. 3 min)
        // Si todo el intervalo estuvo cubierto por tarea manual/descanso, productivePart es 0 para no duplicar
        // Como en Nextime: al superar la tolerancia, se reporta y contabiliza la inactividad real completa
        const productivePart = workReportedMs > 0 ? Math.min(maxUnCoveredGap, workReportedMs) : 0;
        const idlePart = Math.max(0, maxUnCoveredGap - productivePart);
        const idleMin = Math.max(1, Math.round(idlePart / 60000));

        if (productivePart > 0) {
          opTimes[opCategory] = (opTimes[opCategory] || 0) + productivePart;
          recordSoftwareTime(itemName, productivePart, opCategory);

          const crHour =
            parseInt(
              new Date(currTime).toLocaleString("en-US", { timeZone: "America/Costa_Rica", hour: "numeric", hour12: false }),
              10
            ) % 24;
          if (hourlyTrend[crHour] !== undefined) hourlyTrend[crHour] += productivePart;
        }

        // Si la brecha sin eventos ocurre dentro del horario laboral, es ausencia no justificada de turno;
        // si ocurre fuera de horario (ej. desconexión entre fin de jornada y conexión nocturna para horas extras),
        // no penaliza como ausencia de turno (la inactividad explícita con PC encendida ya la mide Caso C 24/7).
        if (!isOutsideWorkingHours && idlePart >= 60000) {
          idleTotalMs += idlePart;

          const dStart = new Date(currTime + coveredMs + productivePart);
          const dEnd = new Date(nextTime);
          const totalAbsenceMin = Math.max(1, Math.round(idlePart / 60000));
          detectedGaps.push({
            id: `gap-${i}`,
            dateStr: dStart.toLocaleDateString("en-CA", { timeZone: "America/Costa_Rica" }),
            dateFormatted: dStart.toLocaleDateString("es-CR", { day: "numeric", month: "short", timeZone: "America/Costa_Rica" }),
            startTime: formatTimeCR(dStart.toISOString()),
            endTime: formatTimeCR(dEnd.toISOString()),
            startTimeVal: dStart.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit", timeZone: "America/Costa_Rica" }),
            endTimeVal: dEnd.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit", timeZone: "America/Costa_Rica" }),
            durationMs: idlePart,
            minutes: idleMin,
            reason: `Ausencia de ${totalAbsenceMin} min (${formatTimeCR(dStart.toISOString())} - ${formatTimeCR(dEnd.toISOString())}) — supera tolerancia (${toleranceMin} min)`,
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

        // La tolerancia configurada NO aplica a la salida: retiro anticipado >= 1 min es salida anticipada
        if (effectiveEarlyMs >= 60000) {
          const excessMs = effectiveEarlyMs;
          const excessMin = Math.round(excessMs / 60000);
          if (excessMin >= 1) {
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
              reason: `Salida anticipada respecto a horario programado (${sEnd}) (${excessMin} min)`,
            });
          }
        }
      }
    }
  }

  // ── APLICAR JUSTIFICACIONES MANUALES A LA INACTIVIDAD Y LAGUNAS ──
  const rawIdleBeforeJustifyMs = idleTotalMs;

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

  // Acreditación de justificaciones según su naturaleza real:
  // 1. Pausas sanitarias justificadas (baño/sanitaria) se acreditan directo a "Pausa Sanitaria"
  if (sanitaryJustifiedMs > 0) {
    opTimes["Pausa Sanitaria"] = (opTimes["Pausa Sanitaria"] || 0) + sanitaryJustifiedMs;
  }
  // 2. Descansos justificados (almuerzo/comida/café) se acreditan directo a "Descansos"
  if (breakJustifiedMs > 0) {
    opTimes["Descansos"] = (opTimes["Descansos"] || 0) + breakJustifiedMs;
  }
  // 3. Justificaciones operativas/manuales de trabajo (Taller, Bodega, OJT, etc.)
  const effectiveWorkJustifiedMs = rawIdleBeforeJustifyMs > 0
    ? Math.min(workJustifiedMs, rawIdleBeforeJustifyMs)
    : workJustifiedMs;
  opTimes["Justificación Manual"] = (opTimes["Justificación Manual"] || 0) + effectiveWorkJustifiedMs;

  // 2. CÁLCULO ESTRICTO DE CATEGORÍAS MASTER (Nivel 1)
  const rawPcProductiveMs =
    (opTimes["Soporte"] || 0) +
    (opTimes["Servicio de Taller"] || 0) +
    (opTimes["Control Administrativo"] || 0) +
    (opTimes["Gestión del Taller"] || 0) +
    (opTimes["Gestión de Residuos"] || 0) +
    (opTimes["On-the-Job Training (OJT)"] || 0) +
    (opTimes["Utilidades"] || 0);

  const breakMs = opTimes["Descansos"] || 0;
  const sanitaryMs = opTimes["Pausa Sanitaria"] || 0;

  // INVARIANTE FÍSICA INQUEBRANTABLE (CONSERVACIÓN DEL TIEMPO EN PC Y MANUAL):
  // La suma de todas las categorías productivas + descansos + pausas sanitarias + inactividad interna
  // jamás puede superar el tiempo físico transcurrido entre el primer y último evento del día.
  const firstEvBoundMs = sorted.length > 0 ? new Date(sorted[0].created_at).getTime() : 0;
  const lastEvBoundMs = sorted.length > 0 ? new Date(sorted[sorted.length - 1].created_at).getTime() : 0;
  const physicalSpanMs = firstEvBoundMs > 0
    ? (isTodayDay ? Math.max(60000, Date.now() - firstEvBoundMs + 60000) : Math.max(60000, lastEvBoundMs - firstEvBoundMs + 60000))
    : 0;
  const nonSpanGapMs = detectedGaps
    .filter((g) => g.id === "gap-inicio-tardio" || g.id === "gap-salida-anticipada")
    .reduce((acc, g) => acc + g.durationMs, 0);
  const internalIdleMs = Math.max(0, idleTotalMs - nonSpanGapMs);

  const rawTotalProductiveMs = rawPcProductiveMs + (opTimes["Justificación Manual"] || 0);
  const maxAllowedProductiveMs = physicalSpanMs > 0
    ? Math.max(0, physicalSpanMs - breakMs - sanitaryMs - internalIdleMs)
    : rawTotalProductiveMs;

  if (rawTotalProductiveMs > maxAllowedProductiveMs && rawTotalProductiveMs > 0) {
    const scale = maxAllowedProductiveMs / rawTotalProductiveMs;
    const allProdKeys = [
      "Soporte",
      "Servicio de Taller",
      "Control Administrativo",
      "Gestión del Taller",
      "Gestión de Residuos",
      "On-the-Job Training (OJT)",
      "Utilidades",
      "Justificación Manual",
    ];
    for (const k of allProdKeys) {
      if (opTimes[k]) opTimes[k] = Math.round(opTimes[k] * scale);
    }
    for (const sKey of Object.keys(softTimes)) {
      softTimes[sKey].durationMs = Math.round(softTimes[sKey].durationMs * scale);
    }
  }

  const productiveMs =
    (opTimes["Soporte"] || 0) +
    (opTimes["Servicio de Taller"] || 0) +
    (opTimes["Control Administrativo"] || 0) +
    (opTimes["Gestión del Taller"] || 0) +
    (opTimes["Gestión de Residuos"] || 0) +
    (opTimes["On-the-Job Training (OJT)"] || 0) +
    (opTimes["Utilidades"] || 0) +
    (opTimes["Justificación Manual"] || 0);

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
  const firstEventMs = sorted.length > 0 ? new Date(sorted[0].created_at).getTime() : 0;
  const lastEventRawMs = sorted.length > 0 ? new Date(sorted[sorted.length - 1].created_at).getTime() : 0;
  const crDateStrDayCalc = sorted.length > 0 ? new Date(firstEventMs).toLocaleDateString("en-CA", { timeZone: "America/Costa_Rica" }) : "";
  const nowCostaRicaStrDayCalc = new Date().toLocaleDateString("en-CA", { timeZone: "America/Costa_Rica" });
  const isTodayDayCalc = crDateStrDayCalc === nowCostaRicaStrDayCalc;

  let elapsedWorkdayMs = 0;
  if (firstEventMs > 0) {
    if (isTodayDayCalc) {
      elapsedWorkdayMs = Math.max(0, Date.now() - firstEventMs);
    } else {
      elapsedWorkdayMs = Math.max(0, lastEventRawMs - firstEventMs);
    }
  }

  // La jornada laboral oficial comprende el tiempo de permanencia transcurrido desde la entrada (restringida al reloj real)
  const effectiveMaxSpanMs = isTodayDayCalc
    ? Math.max(60000, Date.now() - firstEventMs + 60000)
    : Math.max(60000, lastEventRawMs - firstEventMs + 60000);
  const totalWorkdayMs = Math.min(effectiveMaxSpanMs, Math.max(elapsedWorkdayMs, productiveMs + breakMs + sanitaryMs));
  const compliancePercent = Math.min(100, Math.round((totalWorkdayMs / (targetMs || 1)) * 100));

  // Todas las labores manuales de taller físicas (Limpieza, Bodega, Diagnóstico, etc.) registradas
  const workshopManualMs = manualIntervals
    .filter((inv) => inv.category !== "Descansos" && inv.category !== "Pausa Sanitaria" && inv.category !== "Justificación Manual")
    .reduce((acc, inv) => acc + Math.max(0, inv.endMs - inv.startMs), 0);
  const rawManualJustificationMs = opTimes["Justificación Manual"] || 0;
  const totalManualMs = Math.min(productiveMs, workshopManualMs + rawManualJustificationMs);
  const pcWorkMs = Math.max(0, productiveMs - totalManualMs);

  const lastEventMs = sorted.length > 0 ? new Date(sorted[sorted.length - 1].created_at).getTime() : 0;
  const minutesSinceLastEvent = lastEventMs > 0 ? Math.max(0, (Date.now() - lastEventMs) / 60000) : 999;
  const isShiftActive = isTodayDayCalc && minutesSinceLastEvent < 25;

  return {
    totalDayMs,
    totalDayTime: formatDurationMs(totalDayMs),
    totalWorkdayMs,
    totalWorkdayTime: formatDurationMs(totalWorkdayMs),
    firstLoginTime,
    lastLogoutTime,
    isShiftActive,
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
    manualJustificationMs: totalManualMs,
    manualJustificationTime: formatDurationMs(totalManualMs),
  };
}
