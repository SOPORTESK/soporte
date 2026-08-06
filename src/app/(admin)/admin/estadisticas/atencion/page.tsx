import { createClient } from "@/lib/supabase/server";
import { Users, Clock, Star, TrendingUp, CheckCircle, FileText, Activity, ArrowUpRight, Target, BarChart3, Zap, AlertTriangle, UserCheck, TrendingDown, Minus, Layers } from "lucide-react";
import Link from "next/link";
import { StatsExportButton } from "@/components/admin/stats-export-button";
import { AgentRankingTable } from "@/components/admin/agent-ranking-table";
import { MonthSelector } from "@/components/admin/month-selector";
import { PeriodToggle } from "@/components/admin/period-toggle";

export const dynamic = "force-dynamic";

export default async function EstadisticasAtencionPage({ searchParams }: { searchParams: { mes?: string; periodo?: string } }) {
  const supabase = createClient();

  const { data: todosLosCasos } = await supabase
    .from("sek_cases")
    .select("id, assigned_to, created_at, updated_at, closed_at, estado, cliente, title, canal, cat, prioridad, histtecnico, histcliente, accepted_at, escalado_at, tags, problema");

  // Excluir casos del simulador — no representan atención real
  const casos = (todosLosCasos || []).filter(c => c.canal !== "simulator");

  // ── Filtrar por mes si viene en searchParams (formato: YYYY-MM)
  const mesSeleccionado = searchParams.mes || "all";
  const casosFiltrados = mesSeleccionado !== "all"
    ? casos.filter(c => {
        const d = new Date(c.created_at);
        const ym = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
        return ym === mesSeleccionado;
      })
    : casos;

  // ── Meses disponibles para el selector (basado en todos los casos)
  const mesesSet = new Set<string>();
  casos.forEach(c => {
    const d = new Date(c.created_at);
    mesesSet.add(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`);
  });
  const mesesDisponibles = Array.from(mesesSet).sort().reverse();

  // Helper: nombre legible del cliente para la lista desplegable
  const getClienteNombre = (c: any): string => {
    let cl: any = c.cliente;
    if (typeof cl === "string") { try { cl = JSON.parse(cl); } catch { return "Anónimo"; } }
    if (!cl || typeof cl !== "object") return "Anónimo";
    return cl.cuenta || cl.empresa || cl.nombre || cl.name || cl.telefono || cl.phone || "Anónimo";
  };

  const { data: agentes } = await supabase
    .from("sek_agent_config")
    .select("email, nombre, apellido, rol");

  const agenteMap: Record<string, string> = {};
  agentes?.forEach(a => {
    agenteMap[a.email.toLowerCase()] = `${a.nombre || ""} ${a.apellido || ""}`.trim() || a.email;
  });

  // ── Fechas de referencia
  const now = new Date();
  const hoy = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const hace7dias = new Date(hoy); hace7dias.setDate(hoy.getDate() - 7);
  const hace14dias = new Date(hoy); hace14dias.setDate(hoy.getDate() - 14);
  const hace30dias = new Date(hoy); hace30dias.setDate(hoy.getDate() - 30);

  const casosConAsig = casosFiltrados.filter(c => c.assigned_to && !c.assigned_to.includes("system_prompt"));
  const casosSinAsig = casosFiltrados.filter(c => !c.assigned_to || c.assigned_to.includes("system_prompt"));

  // ── Métricas globales (solo agentes humanos)
  const totalCasos = casosConAsig.length;
  const totalResueltos = casosConAsig.filter(c => c.estado === "resuelto" || c.estado === "cerrado" || (c as any).closed_at).length;
  const totalActivos = casosConAsig.filter(c => c.estado === "abierto").length;
  const tasaResolucion = totalCasos > 0 ? Math.round((totalResueltos / totalCasos) * 100) : 0;

  // ── Tendencia 7d vs 7d anterior (siempre últimos 7 días reales, sin filtro de mes)
  const casosHumanos = casos.filter(c => c.assigned_to && !c.assigned_to.includes("system_prompt"));
  const casos7d = casosHumanos.filter(c => new Date(c.created_at) >= hace7dias).length;
  const casosAntes7d = casosHumanos.filter(c => new Date(c.created_at) >= hace14dias && new Date(c.created_at) < hace7dias).length;
  const tendencia7d = casosAntes7d > 0 ? Math.round(((casos7d - casosAntes7d) / casosAntes7d) * 100) : null;

  // ── SLA (solo humanos): tiempo desde que la IA escala el caso hasta que un humano lo acepta
  const tiemposTodos = casosConAsig
    .filter(c => c.escalado_at && c.accepted_at)
    .map(c => {
      const start = new Date(c.escalado_at!);
      const end = new Date(c.accepted_at!);
      if (isNaN(start.getTime()) || isNaN(end.getTime())) return 0;
      return Math.round((end.getTime() - start.getTime()) / 60000);
    })
    .filter(t => t > 0 && t < 10080);
  const slaLt1h = tiemposTodos.filter(t => t <= 60).length;
  const sla1_4h = tiemposTodos.filter(t => t > 60 && t <= 240).length;
  const slaGt4h = tiemposTodos.filter(t => t > 240).length;
  const avgSlaGlobal = tiemposTodos.length > 0 ? Math.round(tiemposTodos.reduce((a, b) => a + b, 0) / tiemposTodos.length) : 0;

  // ── Distribución de tiempo de resolución humana (aceptación → cierre, solo humanos)
  const tiemposResolucionTodos = casosConAsig
    .filter(c => c.estado === "resuelto" || c.estado === "cerrado" || (c as any).closed_at)
    .filter(c => c.accepted_at && (c as any).closed_at)
    .map(c => {
      const start = new Date(c.accepted_at!);
      const end = new Date((c as any).closed_at!);
      if (isNaN(start.getTime()) || isNaN(end.getTime())) return 0;
      return Math.round((end.getTime() - start.getTime()) / 60000);
    })
    .filter(t => t > 0 && t < 10080);
  const resLt1h = tiemposResolucionTodos.filter(t => t <= 60).length;
  const res1_4h = tiemposResolucionTodos.filter(t => t > 60 && t <= 240).length;
  const res4_8h = tiemposResolucionTodos.filter(t => t > 240 && t <= 480).length;
  const resGt8h = tiemposResolucionTodos.filter(t => t > 480).length;

  // ── AHT (Average Handle Time): tiempo efectivo que el agente dedicó a cada caso
  // Se calcula después de tiempoEfectivo(), se deja el placeholder aquí y se resuelve abajo

  // ── Prioridades (solo humanos)
  const prioridades: Record<string, number> = { urgente: 0, alta: 0, media: 0, baja: 0 };
  casosConAsig.forEach(c => { if (c.prioridad && prioridades[c.prioridad] !== undefined) prioridades[c.prioridad]++; });

  // ── Últimos 7 días — volumen por día (siempre últimos 7 días reales, sin filtro de mes)
  const spark7d: number[] = Array(7).fill(0);
  casosHumanos.forEach(c => {
    const d = new Date(c.created_at);
    if (d >= hace7dias) {
      const idx = Math.floor((d.getTime() - hace7dias.getTime()) / 86400000);
      if (idx >= 0 && idx < 7) spark7d[idx]++;
    }
  });
  const sparkMax7d = Math.max(...spark7d, 1);

  // ── Modo mes: volumen del mes actual vs mes anterior
  const periodoModo = searchParams.periodo || "semana";
  const mesActualDate = mesSeleccionado !== "all" ? new Date(mesSeleccionado + "-01") : new Date(now.getFullYear(), now.getMonth(), 1);
  const mesAnteriorDate = new Date(mesActualDate.getFullYear(), mesActualDate.getMonth() - 1, 1);
  const mesActualEnd = new Date(mesActualDate.getFullYear(), mesActualDate.getMonth() + 1, 1);
  const casosMesActual_data = casosHumanos.filter(c => { const d = new Date(c.created_at); return d >= mesActualDate && d < mesActualEnd; });
  const casosMesActual = casosMesActual_data.length;
  const casosMesAnterior = casosHumanos.filter(c => { const d = new Date(c.created_at); return d >= mesAnteriorDate && d < mesActualDate; }).length;
  const tendenciaMes = casosMesAnterior > 0 ? Math.round(((casosMesActual - casosMesAnterior) / casosMesAnterior) * 100) : null;

  // Spark por día del mes actual
  const diasEnMes = new Date(mesActualDate.getFullYear(), mesActualDate.getMonth() + 1, 0).getDate();
  const sparkMes: number[] = Array(diasEnMes).fill(0);
  casosMesActual_data.forEach(c => {
    const d = new Date(c.created_at);
    if (d >= mesActualDate && d < mesActualEnd) {
      const idx = d.getDate() - 1;
      if (idx >= 0 && idx < diasEnMes) sparkMes[idx]++;
    }
  });
  const sparkMaxMes = Math.max(...sparkMes, 1);

  // ── Tiempo efectivo del agente: solo cuenta gaps cuando el SIGUIENTE mensaje es del agente
  //    cliente→agente = tiempo de respuesta del operador (cuenta, capado a UMBRAL)
  //    agente→agente  = operador sigue escribiendo (cuenta, capado a UMBRAL)
  //    agente→cliente = cliente leyendo/escribiendo (NO cuenta — es tiempo del cliente)
  //    Gaps > UMBRAL = inactividad/espera larga, no cuentan
  const UMBRAL_GAP_MIN = 15;
  const isAgentRole = (r: any) => r === "agente" || r === "agent" || r === "tecnico";
  function tiempoEfectivo(histtecnico: any[], histcliente: any[], accepted_at?: string | null): number {
    const tech = (Array.isArray(histtecnico) ? histtecnico : [])
      .filter((m: any) => m && m.time && isAgentRole(m.role) && m.role !== "nota")
      .map((m: any) => ({ t: new Date(m.time).getTime(), agent: true }));
    const cli = (Array.isArray(histcliente) ? histcliente : [])
      .filter((m: any) => m && m.time)
      .map((m: any) => ({ t: new Date(m.time).getTime(), agent: false }));
    const msgs = [...tech, ...cli]
      .filter(m => !isNaN(m.t))
      .sort((a, b) => a.t - b.t);
    if (accepted_at) {
      const t = new Date(accepted_at).getTime();
      if (!isNaN(t)) msgs.unshift({ t, agent: true });
    }
    if (msgs.length < 2) return 0;
    let total = 0;
    for (let i = 1; i < msgs.length; i++) {
      // Solo cuenta gap cuando el SIGUIENTE mensaje es del agente
      if (!msgs[i].agent) continue;
      const gap = Math.round((msgs[i].t - msgs[i - 1].t) / 60000);
      if (gap > 0 && gap <= UMBRAL_GAP_MIN) total += gap;
    }
    return total;
  }

  // ── AHT Global: promedio de tiempo efectivo por caso
  const ahtTodos = casosConAsig
    .map(c => tiempoEfectivo((c as any).histtecnico, (c as any).histcliente, c.accepted_at))
    .filter(t => t > 0);
  const avgAHTGlobal = ahtTodos.length > 0 ? Math.round(ahtTodos.reduce((a, b) => a + b, 0) / ahtTodos.length) : 0;

  // ── Helper para leer calificación desde objeto cliente
  function getCal(c: any): number | null {
    const cl = typeof c.cliente === "object" && c.cliente ? c.cliente as any : null;
    const v = cl?.calificacion_cliente;
    const n = Number(v);
    return v != null && !isNaN(n) && n >= 1 && n <= 5 ? n : null;
  }

  // ── NPS estimado (solo humanos)
  const todasCals = casosConAsig.map(getCal).filter((v): v is number => v !== null);
  const MIN_CALIFICACIONES = 20;
  const avgCalificacionClienteGlobal = todasCals.length >= MIN_CALIFICACIONES
    ? (todasCals.reduce((a, b) => a + b, 0) / todasCals.length).toFixed(1) : "N/A";

  // ── Stats por agente
  const statsPorAgente: Record<string, {
    email: string; nombre: string; totalAtendidos: number; resueltos: number; activos: number;
    escalados: number; calificaciones: number[]; tiemposResolucion: number[]; ultimoCaso: string;
    urgentes: number; casos7d: number; casos30d: number; tiemposEfectivos: number[]; tiemposEspera: number[];
    casos: Array<{ id: string | number; title: string; estado: string; created_at: string; cliente: string; canal: string }>;
  }> = {};

  casosConAsig.forEach(caso => {
    const email = caso.assigned_to!.toLowerCase();
    if (!statsPorAgente[email]) {
      statsPorAgente[email] = { email, nombre: agenteMap[email] || caso.assigned_to!, totalAtendidos: 0, resueltos: 0, activos: 0, escalados: 0, calificaciones: [], tiemposResolucion: [], ultimoCaso: caso.title || "Caso sin título", urgentes: 0, casos7d: 0, casos30d: 0, tiemposEfectivos: [], tiemposEspera: [], casos: [] };
    }
    const s = statsPorAgente[email];
    s.totalAtendidos++;
    s.casos.push({ id: caso.id, title: caso.title || "Caso sin título", estado: caso.estado || "—", created_at: caso.created_at, cliente: getClienteNombre(caso), canal: caso.canal || "—" });
    if (["abierto","asignado","pendiente"].includes(caso.estado || "")) s.activos++;
    if (caso.estado === "escalado") s.escalados++;
    if (caso.estado === "resuelto" || caso.estado === "cerrado" || (caso as any).closed_at) {
      s.resueltos++;
      const closedAt = (caso as any).closed_at;
      if (closedAt) {
        let startTimestamp = caso.accepted_at;
        if (!startTimestamp && Array.isArray(caso.histtecnico)) {
          const firstMsg = caso.histtecnico.find((h: any) => h.role === "tecnico");
          if (firstMsg) startTimestamp = firstMsg.time;
        }
        const start = startTimestamp ? new Date(startTimestamp) : new Date(caso.created_at);
        const end = new Date(closedAt);
        if (!isNaN(start.getTime()) && !isNaN(end.getTime())) {
          const diff = Math.round((end.getTime() - start.getTime()) / 60000);
          if (diff > 0 && diff < 10080) s.tiemposResolucion.push(diff);
        }
      }
      const te = tiempoEfectivo((caso as any).histtecnico, (caso as any).histcliente, (caso as any).accepted_at);
      if (te > 0) s.tiemposEfectivos.push(te);
    }
    if (caso.accepted_at) {
      const tAccepted = new Date(caso.accepted_at).getTime();
      let lastMsgTime = new Date(caso.created_at).getTime();
      
      // Si la IA registró exactamente cuándo lo escaló, usamos eso como inicio de espera.
      if (caso.escalado_at) {
        lastMsgTime = new Date(caso.escalado_at).getTime();
      } else {
        // Fallback: usar el último mensaje antes de la aceptación
        const allMsgs = [...(Array.isArray((caso as any).histcliente) ? (caso as any).histcliente : []), ...(Array.isArray((caso as any).histtecnico) ? (caso as any).histtecnico : [])];
        allMsgs.forEach((m: any) => {
          const t = m.time ? new Date(m.time).getTime() : 0;
          if (!isNaN(t) && t < tAccepted && t > lastMsgTime) lastMsgTime = t;
        });
      }
      
      const espera = Math.round((tAccepted - lastMsgTime) / 60000);
      if (espera >= 0) s.tiemposEspera.push(espera);
    }
    const cal = getCal(caso); if (cal !== null) s.calificaciones.push(cal);
    if (caso.prioridad === "urgente") s.urgentes++;
    if (new Date(caso.created_at) >= hace7dias) s.casos7d++;
    if (new Date(caso.created_at) >= hace30dias) s.casos30d++;
  });

  const MIN_CASOS_SCORE = 5;
  const maxTotalAtendidos = Math.max(1, ...Object.values(statsPorAgente).map(s => s.totalAtendidos));

  const rankingAgentes = Object.values(statsPorAgente).map(s => {
    const MIN_CALS_AGENTE = 4;
    const avgCal = s.calificaciones.length > 0 ? (s.calificaciones.reduce((a, b) => a + b, 0) / s.calificaciones.length) : 0;
    const avgSLA = s.tiemposEspera.length > 0 ? Math.round(s.tiemposEspera.reduce((a, b) => a + b, 0) / s.tiemposEspera.length) : 0;
    const tasa = s.totalAtendidos > 0 ? (s.resueltos / s.totalAtendidos) * 100 : 0;
    const avgEfectivo = s.tiemposEfectivos.length > 0
      ? Math.round(s.tiemposEfectivos.reduce((a, b) => a + b, 0) / s.tiemposEfectivos.length) : 0;
    const avgEspera = s.tiemposEspera.length > 0
      ? Math.round(s.tiemposEspera.reduce((a, b) => a + b, 0) / s.tiemposEspera.length) : 0;
    const avgResolucion = s.tiemposResolucion.length > 0
      ? Math.round(s.tiemposResolucion.reduce((a, b) => a + b, 0) / s.tiemposResolucion.length) : 0;
    const volumenDiario = s.casos30d > 0 ? (s.casos30d / 30) : 0;

    // Score compuesto con redistribución de pesos cuando no hay datos
    const maxResolucionMin = 480; // 8 horas como tope penalizable
    const scoreRes = Math.round(tasa);
    const scoreTiempoResolucion = avgResolucion > 0 ? Math.max(0, 100 - Math.round((avgResolucion / maxResolucionMin) * 100)) : null;
    const scoreSLA = avgSLA > 0 ? Math.max(0, 100 - Math.round((avgSLA / 480) * 100)) : null;
    const scoreSat = avgCal > 0 && s.calificaciones.length >= MIN_CALS_AGENTE ? Math.round((avgCal / 5) * 100) : null;
    const scoreVolumen = Math.round((s.totalAtendidos / maxTotalAtendidos) * 100);

    // Pesos base: 30% resolución, 25% tiempo, 20% sat, 15% SLA, 10% volumen
    // Redistribuir el peso de componentes sin datos entre los que sí tienen
    const pesos: Record<string, number> = { res: 0.30, tiempo: 0.25, sat: 0.20, sla: 0.15, vol: 0.10 };
    const componentes: Record<string, number | null> = { res: scoreRes, tiempo: scoreTiempoResolucion, sat: scoreSat, sla: scoreSLA, vol: scoreVolumen };
    const pesosActivos = Object.entries(pesos).filter(([k]) => componentes[k] !== null);
    const pesoTotal = pesosActivos.reduce((sum, [, p]) => sum + p, 0);
    const score = Math.round(pesosActivos.reduce((sum, [k, p]) => sum + (componentes[k] as number) * (p / pesoTotal), 0));
    const scoreValido = s.totalAtendidos >= MIN_CASOS_SCORE;

    const tasaEsc = s.totalAtendidos > 0 ? Math.round((s.escalados / s.totalAtendidos) * 100) : 0;
    return { ...s, avgCalificacionCliente: avgCal > 0 && s.calificaciones.length >= MIN_CALS_AGENTE ? avgCal.toFixed(1) : "N/A", avgSLA, tasa: Math.round(tasa), score, scoreValido, tasaEsc, avgEfectivo, avgEspera, avgResolucion, volumenDiario, calificacionesCount: s.calificaciones.length };
  }).sort((a, b) => (Number(b.scoreValido) - Number(a.scoreValido)) || (b.score - a.score));

  // ── Casos concurrentes: promedio de casos activos simultáneos
  // Para cada caso, el intervalo activo va desde created_at hasta closed_at (o updated_at, o now si sigue abierto)
  const intervalos = casosConAsig.map(c => {
    const start = new Date(c.created_at).getTime();
    const endRaw = (c as any).closed_at || c.updated_at;
    const end = endRaw ? new Date(endRaw).getTime() : Date.now();
    return { start, end };
  }).filter(i => !isNaN(i.start) && !isNaN(i.end) && i.end > i.start);

  // Crear eventos de inicio (+1) y fin (-1), ordenarlos, y calcular el promedio ponderado por tiempo
  const eventos: Array<{ t: number; delta: number }> = [];
  intervalos.forEach(i => {
    eventos.push({ t: i.start, delta: 1 });
    eventos.push({ t: i.end, delta: -1 });
  });
  eventos.sort((a, b) => a.t - b.t);

  let concurrentesActuales = 0;
  let sumaPonderada = 0;
  let tiempoTotal = 0;
  for (let i = 0; i < eventos.length - 1; i++) {
    concurrentesActuales += eventos[i].delta;
    const gap = eventos[i + 1].t - eventos[i].t;
    if (gap > 0) {
      sumaPonderada += concurrentesActuales * gap;
      tiempoTotal += gap;
    }
  }
  const avgConcurrentes = tiempoTotal > 0 ? (sumaPonderada / tiempoTotal).toFixed(1) : "0";
  const maxConcurrentes = eventos.length > 0 ? Math.max(...eventos.reduce((acc, e, i) => {
    if (i === 0) { acc.push(e.delta); return acc; }
    acc.push(acc[acc.length - 1] + e.delta); return acc;
  }, [] as number[])) : 0;

  // ── Volumen promedio: diario, semanal y mensual (solo humanos)
  const casos30d = casosConAsig.filter(c => new Date(c.created_at) >= hace30dias).length;
  const promedioDiario = casos30d > 0 ? (casos30d / 30) : 0;

  // ── Tiempo de resolución promedio global (aceptación → cierre)
  const tiemposResolucionGlobal = rankingAgentes.flatMap(a => (a as any).tiemposResolucion);
  const avgTiempoResolucionGlobal = tiemposResolucionGlobal.length > 0
    ? Math.round(tiemposResolucionGlobal.reduce((sum, t) => sum + t, 0) / tiemposResolucionGlobal.length)
    : 0;
  const totalCasosResolucion = casosConAsig.filter(c =>
    (c.estado === "resuelto" || c.estado === "cerrado" || (c as any).closed_at) && c.accepted_at && (c as any).closed_at
  ).length;
  const casosExcluidosResolucion = totalCasosResolucion - tiemposResolucionGlobal.length;

  // ── Canales / Categorías (solo humanos)
  const canales: Record<string, number> = {};
  casosConAsig.forEach(c => { if (c.canal) canales[c.canal] = (canales[c.canal] || 0) + 1; });
  const categorias: Record<string, number> = {};
  casosConAsig.forEach(c => { if (c.cat) categorias[c.cat] = (categorias[c.cat] || 0) + 1; });

  // ── Problemas por agente (solo humanos): deriva de columna problema, tags o title
  const problemasLabels: Record<string, string> = {
    sin_imagen: "Sin imagen", sin_grabacion: "Sin grabación", sin_acceso_remoto: "Sin acceso remoto",
    sin_energia: "Sin energía", error_configuracion: "Error de configuración", conectividad_red: "Conectividad / red",
    reset_contrasena: "Reset contraseña", desvinculacion_cuenta: "Desvinculación cuenta",
    dano_fisico: "Daño físico", actualizacion_firmware: "Actualización firmware",
    instalacion_nueva: "Instalación nueva", deteccion_incendio: "Detección incendio",
    control_acceso: "Control de acceso", intrusion_alarma: "Intrusión / alarma", otro: "Otro",
    configuraciones: "Configuraciones", software: "Software", soporte: "Soporte general", licencias: "Licencias",
    camara: "Cámaras", nvr: "NVR / Grabador", dvr: "DVR / Grabador", alarma: "Alarma / Intrusión",
    incendio: "Detección incendio", red: "Conectividad / red", firmware: "Actualización firmware",
  };
  const tagAProblema: Record<string, string> = {
    reset: "Reset contraseña", reset_contrasena: "Reset contraseña", verificacion_pendiente: "Reset contraseña",
    imagen_pendiente: "Reset contraseña", xml_pendiente: "Reset contraseña", modelo_pendiente: "Reset contraseña",
    modelo_no_validado: "Reset contraseña", desvinculacion: "Desvinculación cuenta", desvinculacion_cuenta: "Desvinculación cuenta",
    sin_imagen: "Sin imagen", sin_grabacion: "Sin grabación", sin_acceso_remoto: "Sin acceso remoto",
    sin_energia: "Sin energía", error_configuracion: "Error de configuración", conectividad_red: "Conectividad / red",
    dano_fisico: "Daño físico", actualizacion_firmware: "Actualización firmware", instalacion_nueva: "Instalación nueva",
    deteccion_incendio: "Detección incendio", control_acceso: "Control de acceso", intrusion_alarma: "Intrusión / alarma", otro: "Otro",
    configuraciones: "Configuraciones", software: "Software", licencias: "Licencias", firmware: "Actualización firmware",
  };
  const tagsNoProblema = new Set(["saliente", "entrante", "urgente", "vip"]);
  const temaAProblema: Record<string, string> = {
    reset: "Reset contraseña", desvinculacion: "Desvinculación cuenta", configuraciones: "Configuraciones",
    software: "Software", soporte: "Soporte general", licencias: "Licencias", acceso: "Control de acceso", camara: "Cámaras",
    nvr: "NVR / Grabador", dvr: "DVR / Grabador", alarma: "Alarma / Intrusión", incendio: "Detección incendio",
    red: "Conectividad / red", firmware: "Actualización firmware", otro: "Otro",
  };

  const deriveProblema = (c: any): string | null => {
    if (c.problema) return problemasLabels[c.problema] || c.problema;
    const tags: string[] = Array.isArray(c.tags) ? c.tags : [];
    for (const t of tags) {
      const tl = String(t).toLowerCase().trim();
      if (tagsNoProblema.has(tl)) continue;
      if (tagAProblema[tl]) return tagAProblema[tl];
      if (problemasLabels[tl]) return problemasLabels[tl];
    }
    const title = String(c.title || "").trim();
    const tema = title.split("\u2014")[0].trim().toLowerCase().replace(/[^a-z0-9]/g, "");
    if (tema && temaAProblema[tema]) return temaAProblema[tema];
    return null;
  };

  const problemasMap: Record<string, { label: string; total: number; agentes: Record<string, number> }> = {};
  casosConAsig.forEach(c => {
    const p = deriveProblema(c);
    if (!p) return;
    const email = c.assigned_to?.toLowerCase() || "sin_agente";
    if (!problemasMap[p]) problemasMap[p] = { label: p, total: 0, agentes: {} };
    problemasMap[p].total++;
    problemasMap[p].agentes[email] = (problemasMap[p].agentes[email] || 0) + 1;
  });
  const topProblemas = Object.values(problemasMap)
    .map(p => {
      const topAgente = Object.entries(p.agentes).sort(([, a], [, b]) => b - a)[0];
      return { ...p, topAgenteEmail: topAgente?.[0] || "", topAgenteCount: topAgente?.[1] || 0 };
    })
    .sort((a, b) => b.total - a.total)
    .slice(0, 10);

  console.log("[DEBUG] total casos humanos:", casosConAsig.length);
  console.log("[DEBUG] problemasMap:", JSON.stringify(problemasMap, null, 2));
  console.log("[DEBUG] topProblemas:", JSON.stringify(topProblemas, null, 2));

  const formatSLA = (m: number) => m === 0 ? "—" : m < 60 ? `${m}m` : `${Math.floor(m / 60)}h${m % 60 > 0 ? ` ${m % 60}m` : ""}`;

  const canalColors: Record<string, string> = {
    widget: "from-brand-600 to-brand-400", whatsapp: "from-emerald-600 to-emerald-400",
    messenger: "from-blue-600 to-blue-400", web: "from-violet-600 to-violet-400", email: "from-amber-600 to-amber-400",
  };

  const nowStr = new Date().toLocaleString("es-CR", { timeZone: "America/Costa_Rica", dateStyle: "long", timeStyle: "short" });

  return (
    <div className="max-w-[1400px] mx-auto p-6 lg:p-8 space-y-8">

      {/* ── HEADER ── */}
      <header className="relative">
        <div className="absolute -top-16 -left-16 w-72 h-72 bg-brand-500/5 rounded-full blur-3xl pointer-events-none" />
        <div className="relative flex flex-col sm:flex-row sm:items-end sm:justify-between gap-4">
          <div>
            <div className="flex items-center gap-2 mb-2">
              <div className="h-6 w-6 rounded-lg bg-brand-500/10 text-brand-500 grid place-items-center">
                <TrendingUp className="h-3.5 w-3.5" />
              </div>
              <p className="text-[10px] font-black uppercase tracking-[0.25em] text-brand-600 dark:text-brand-400">Rendimiento · Estadísticas de Atención</p>
            </div>
            <h1 className="text-4xl lg:text-5xl font-black tracking-tight">Estadísticas de Atención</h1>
            <p className="text-muted-foreground mt-2 text-sm">{nowStr} · {totalCasos} casos · {rankingAgentes.length} agentes{mesSeleccionado !== "all" ? ` · ${mesSeleccionado}` : ""}</p>
          </div>
          <div className="flex items-center gap-3 shrink-0 flex-wrap">
            <MonthSelector availableMonths={mesesDisponibles} />
            <Link href="/admin/estadisticas" className="flex items-center gap-2 px-4 py-2.5 rounded-xl border border-border bg-card text-sm font-bold hover:bg-muted transition-all group">
              Analítica Clientes <ArrowUpRight className="h-3.5 w-3.5 opacity-40 group-hover:opacity-100" />
            </Link>
            <Link href="/admin/equipo" className="flex items-center gap-2 px-4 py-2.5 rounded-xl border border-border bg-card text-sm font-bold hover:bg-muted transition-all group">
              Equipo <ArrowUpRight className="h-3.5 w-3.5 opacity-40 group-hover:opacity-100" />
            </Link>
          </div>
        </div>
      </header>

      {/* ── Exportar KPIs del mes ── */}
      <div className="flex justify-end">
        <StatsExportButton
          data={[{
            Mes: mesSeleccionado !== "all" ? mesSeleccionado : "Todos",
            Total_Casos: totalCasos,
            Casos_Activos: totalActivos,
            Casos_Resueltos: totalResueltos,
            Tasa_Resolucion_Pct: tasaResolucion,
            AHT: formatSLA(avgAHTGlobal),
            SLA_Promedio: formatSLA(avgSlaGlobal),
            Casos_Concurrentes_Promedio: avgConcurrentes,
            Casos_Concurrentes_Pico: maxConcurrentes,
            Volumen_7d: casos7d,
            Tendencia_7d: tendencia7d === null ? "N/A" : `${tendencia7d > 0 ? "+" : ""}${tendencia7d}%`,
            Volumen_Mes: casosMesActual,
            Tendencia_Mes: tendenciaMes === null ? "N/A" : `${tendenciaMes > 0 ? "+" : ""}${tendenciaMes}%`,
            Periodo_Activo: periodoModo === "mes" ? "Mes" : "7 días",
            Tiempo_Resolucion: avgTiempoResolucionGlobal > 0 ? formatSLA(avgTiempoResolucionGlobal) : "—",
            Casos_Resolucion: tiemposResolucionGlobal.length,
            Casos_Excluidos_Resolucion: casosExcluidosResolucion,
            Volumen_Promedio_Diario: promedioDiario > 0 ? promedioDiario.toFixed(1) : "—",
            Casos_30d: casos30d,
            Agentes: rankingAgentes.length,
            Fecha_Reporte: nowStr,
          }]}
          fileName={`Reporte_KPIs_Atencion_Sekunet_${mesSeleccionado !== "all" ? mesSeleccionado : new Date().toISOString().slice(0,10)}`}
        />
      </div>

      {/* ── KPIs FILA 1: Operacionales ── */}
      <section className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
        {[
          { label: "Total Casos",      value: totalCasos.toString(),  icon: Users,        color: "text-brand-500",   bg: "bg-brand-500/10",   sub: `${totalActivos} activos ahora`              },
          { label: "Tasa Resolución",  value: `${tasaResolucion}%`,   icon: CheckCircle,  color: "text-emerald-500", bg: "bg-emerald-500/10", sub: `${totalResueltos} de ${totalCasos} resueltos` },
          { label: "AHT",              value: formatSLA(avgAHTGlobal),    icon: Clock,    color: "text-violet-500",  bg: "bg-violet-500/10",  sub: `Tiempo activo por caso` },
          { label: "SLA Promedio",     value: formatSLA(avgSlaGlobal),icon: Clock,        color: "text-sky-500",     bg: "bg-sky-500/10",     sub: `Espera IA → humano`   },
          { label: "Concurrentes",     value: avgConcurrentes, icon: Layers,    color: "text-amber-400",   bg: "bg-amber-400/10",   sub: `Promedio casos activos simultáneos · pico ${maxConcurrentes}` },
        ].map((k, i) => (

          <div key={i} className="relative rounded-2xl border border-border bg-card p-5 overflow-hidden hover:shadow-xl hover:-translate-y-0.5 transition-all ring-1 ring-border/50">
            <div className={`absolute -top-8 -right-8 h-28 w-28 rounded-full ${k.bg} blur-2xl`} />
            <div className="relative">
              <div className={`inline-flex items-center justify-center h-10 w-10 rounded-xl ${k.bg} ${k.color} mb-3`}>
                <k.icon className="h-5 w-5" />
              </div>
              <p className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">{k.label}</p>
              <p className={`text-4xl font-black mt-1 tracking-tight tabular-nums ${k.color}`}>{k.value}</p>
              <p className="text-[11px] text-muted-foreground mt-1.5">{k.sub}</p>
            </div>
          </div>
        ))}
      </section>

      {/* ── KPIs FILA 2: Estratégicos ── */}
      <section className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {/* Volumen con toggle 7 días / Mes */}
        <div className="relative rounded-2xl border border-border bg-card p-5 overflow-hidden ring-1 ring-border/50">
          <div className="absolute -top-8 -right-8 h-28 w-28 rounded-full bg-violet-500/10 blur-2xl" />
          <div className="relative">
            <div className="flex items-center justify-between mb-3">
              <div className="inline-flex items-center justify-center h-10 w-10 rounded-xl bg-violet-500/10 text-violet-500">
                <Activity className="h-5 w-5" />
              </div>
              <PeriodToggle />
            </div>
            <p className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">{periodoModo === "mes" ? "Volumen del mes" : "Volumen 7 días"}</p>
            <div className="flex items-baseline gap-2 mt-1">
              <p className="text-4xl font-black tracking-tight tabular-nums text-violet-500">{periodoModo === "mes" ? casosMesActual : casos7d}</p>
              {(() => {
                const tend = periodoModo === "mes" ? tendenciaMes : tendencia7d;
                return (
                  <span className={`text-xs font-black flex items-center gap-0.5 ${tend === null ? "text-muted-foreground" : tend > 0 ? "text-rose-400" : tend < 0 ? "text-emerald-400" : "text-muted-foreground"}`}>
                    {tend === null ? <Minus className="h-3 w-3" /> : tend > 0 ? <TrendingUp className="h-3 w-3" /> : tend < 0 ? <TrendingDown className="h-3 w-3" /> : <Minus className="h-3 w-3" />}
                    {tend === null ? "N/A" : `${tend > 0 ? "+" : ""}${tend}%`}
                  </span>
                );
              })()}
            </div>
            <p className="text-[10px] text-muted-foreground mt-1">{periodoModo === "mes" ? "este mes vs mes anterior" : "últimos 7 días vs semana anterior"}</p>
            {/* Barra comparativa: actual vs anterior */}
            <div className="flex items-end gap-3 mt-3 h-10">
              {(() => {
                const actual = periodoModo === "mes" ? casosMesActual : casos7d;
                const anterior = periodoModo === "mes" ? casosMesAnterior : casosAntes7d;
                const max = Math.max(actual, anterior, 1);
                const labelActual = periodoModo === "mes" ? "Este mes" : "7 días";
                const labelAnterior = periodoModo === "mes" ? "Mes ant." : "Sem. ant.";
                return (
                  <>
                    <div className="flex-1 flex flex-col items-center gap-1">
                      <span className="text-[10px] font-black tabular-nums text-violet-500">{actual}</span>
                      <div className="w-full bg-violet-500 rounded-sm transition-all" style={{ height: `${Math.max(8, Math.round((actual / max) * 100))}%` }} />
                      <span className="text-[9px] text-muted-foreground font-bold">{labelActual}</span>
                    </div>
                    <div className="flex-1 flex flex-col items-center gap-1">
                      <span className="text-[10px] font-black tabular-nums text-muted-foreground">{anterior}</span>
                      <div className="w-full bg-muted-foreground/30 rounded-sm transition-all" style={{ height: `${Math.max(8, Math.round((anterior / max) * 100))}%` }} />
                      <span className="text-[9px] text-muted-foreground font-bold">{labelAnterior}</span>
                    </div>
                  </>
                );
              })()}
            </div>
          </div>
        </div>

        {/* Tiempo de resolución promedio */}
        <div className="relative rounded-2xl border border-border bg-card p-5 overflow-hidden ring-1 ring-border/50">
          <div className="absolute -top-8 -right-8 h-28 w-28 rounded-full bg-emerald-500/10 blur-2xl" />
          <div className="relative">
            <div className="inline-flex items-center justify-center h-10 w-10 rounded-xl bg-emerald-500/10 text-emerald-500 mb-3">
              <CheckCircle className="h-5 w-5" />
            </div>
            <p className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">Tiempo de Resolución</p>
            <p className="text-4xl font-black mt-1 tracking-tight tabular-nums text-emerald-500">{avgTiempoResolucionGlobal > 0 ? formatSLA(avgTiempoResolucionGlobal) : "—"}</p>
            <p className="text-[11px] text-muted-foreground mt-1.5">promedio aceptación → cierre · {tiemposResolucionGlobal.length} casos{casosExcluidosResolucion > 0 ? ` · ${casosExcluidosResolucion} excluidos (+7d)` : ""}</p>
          </div>
        </div>

        {/* Volumen promedio de atención */}
        <div className="relative rounded-2xl border border-border bg-card p-5 overflow-hidden ring-1 ring-border/50">
          <div className="absolute -top-8 -right-8 h-28 w-28 rounded-full bg-cyan-500/10 blur-2xl" />
          <div className="relative">
            <div className="inline-flex items-center justify-center h-10 w-10 rounded-xl bg-cyan-500/10 text-cyan-500 mb-3">
              <BarChart3 className="h-5 w-5" />
            </div>
            <p className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">Volumen Promedio</p>
            <p className="text-4xl font-black mt-1 tracking-tight tabular-nums text-cyan-500">{promedioDiario > 0 ? `${promedioDiario.toFixed(1)}/día` : "—"}</p>
            <p className="text-[11px] text-muted-foreground mt-1.5">{casos7d} esta semana · {casos30d} este mes</p>
          </div>
        </div>

        {/* CSAT promedio */}
        <div className="relative rounded-2xl border border-border bg-card p-5 overflow-hidden ring-1 ring-border/50">
          <div className="absolute -top-8 -right-8 h-28 w-28 rounded-full bg-amber-400/10 blur-2xl" />
          <div className="relative">
            <div className="inline-flex items-center justify-center h-10 w-10 rounded-xl bg-amber-400/10 text-amber-400 mb-3">
              <Star className="h-5 w-5" />
            </div>
            <p className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">CSAT Promedio</p>
            <p className="text-4xl font-black mt-1 tracking-tight tabular-nums text-amber-400">{avgCalificacionClienteGlobal !== "N/A" ? `${avgCalificacionClienteGlobal}/5` : "—"}</p>
            <p className="text-[11px] text-muted-foreground mt-1.5">{todasCals.length >= MIN_CALIFICACIONES ? `${todasCals.length} calificaciones del cliente` : `Muestra insuficiente (${todasCals.length}/${MIN_CALIFICACIONES})`}</p>
          </div>
        </div>
      </section>

      {/* ── CUERPO ── */}
      <div className="grid gap-6 lg:grid-cols-12">

        {/* ── TABLA DE DESEMPEÑO ── */}
        <div className="lg:col-span-12 rounded-2xl border border-border bg-card overflow-hidden">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 px-6 py-4 border-b border-border bg-gradient-to-r from-muted/20 to-transparent">
            <div className="flex items-center gap-3">
              <div className="h-8 w-8 rounded-lg bg-brand-500/10 text-brand-500 grid place-items-center"><BarChart3 className="h-4 w-4" /></div>
              <div>
                <h2 className="font-black text-sm">Desempeño Individual</h2>
                <p className="text-[11px] text-muted-foreground">Score compuesto: 30% resolución · 25% tiempo resolución · 20% calif. cliente · 15% SLA · 10% volumen · pesos redistribuidos si falta dato (mín. 5 casos, mín. 4 calif.)</p>
              </div>
            </div>
            <StatsExportButton
              data={rankingAgentes.map(a => ({
                Agente: a.nombre, Email: a.email, Score: a.score,
                Total_Casos: a.totalAtendidos, Tasa_Resolucion_Pct: a.tasa,
                AHT_min: (a as any).avgEfectivo,
                Tiempo_Resolucion_Avg_min: (a as any).avgResolucion,
                SLA_Promedio_min: a.avgSLA,
                CalificacionCliente_Avg: a.avgCalificacionCliente,
                Volumen_7d: a.casos7d, Volumen_Promedio_Diario: (a as any).volumenDiario.toFixed(1),
                Fecha_Reporte: nowStr
              }))}
              fileName={`Reporte_Desempeño_Atencion_Sekunet_${mesSeleccionado !== "all" ? mesSeleccionado : new Date().toISOString().slice(0,10)}`}
            />
          </div>

          <AgentRankingTable
            agentes={rankingAgentes.map(a => ({
              email: a.email,
              nombre: a.nombre,
              score: a.score,
              scoreValido: a.scoreValido,
              totalAtendidos: a.totalAtendidos,
              activos: a.activos,
              resueltos: a.resueltos,
              tasa: a.tasa,
              avgEfectivo: (a as any).avgEfectivo,
              avgResolucion: (a as any).avgResolucion,
              avgSLA: a.avgSLA,
              avgCalificacionCliente: a.avgCalificacionCliente,
              calificacionesCount: a.calificaciones.length,
              casos7d: a.casos7d,
              volumenDiario: (a as any).volumenDiario,
              casos: a.casos,
            }))}
          />
        </div>

        {/* Histograma de tiempo de resolución humana */}
        <div className="lg:col-span-3 rounded-2xl border border-border bg-card p-6">
            <div className="flex items-center gap-2 mb-5">
              <div className="h-7 w-7 rounded-lg bg-emerald-500/10 text-emerald-500 grid place-items-center"><Clock className="h-3.5 w-3.5" /></div>
              <h3 className="font-black text-sm uppercase tracking-widest text-muted-foreground">Resolución Humana</h3>
            </div>
            {tiemposResolucionTodos.length > 0 ? (
              <div className="space-y-3">
                {[
                  { label: "< 1 hora", count: resLt1h, color: "bg-emerald-500", text: "text-emerald-500" },
                  { label: "1 – 4 horas", count: res1_4h, color: "bg-amber-500", text: "text-amber-500" },
                  { label: "4 – 8 horas", count: res4_8h, color: "bg-orange-500", text: "text-orange-500" },
                  { label: "+8 horas", count: resGt8h, color: "bg-rose-500", text: "text-rose-500" },
                ].map(row => (
                  <div key={row.label} className="space-y-1.5">
                    <div className="flex justify-between items-center">
                      <span className={`text-xs font-black ${row.text}`}>{row.label}</span>
                      <div className="flex items-center gap-2">
                        <span className="text-[10px] text-muted-foreground">{tiemposResolucionTodos.length > 0 ? Math.round((row.count / tiemposResolucionTodos.length) * 100) : 0}%</span>
                        <span className={`text-xs font-black tabular-nums ${row.text}`}>{row.count}</span>
                      </div>
                    </div>
                    <div className="h-2 w-full bg-muted rounded-full overflow-hidden">
                      <div className={`h-full ${row.color} rounded-full`} style={{ width: `${tiemposResolucionTodos.length > 0 ? (row.count / tiemposResolucionTodos.length) * 100 : 0}%` }} />
                    </div>
                  </div>
                ))}
              </div>
            ) : <p className="text-xs text-muted-foreground italic">Sin datos de resolución</p>}
          </div>

          {/* Prioridades */}
          <div className="lg:col-span-3 rounded-2xl border border-border bg-card p-6">
            <div className="flex items-center gap-2 mb-5">
              <div className="h-7 w-7 rounded-lg bg-rose-500/10 text-rose-500 grid place-items-center"><AlertTriangle className="h-3.5 w-3.5" /></div>
              <h3 className="font-black text-sm uppercase tracking-widest text-muted-foreground">Por Prioridad</h3>
            </div>
            <div className="space-y-3">
              {[
                { k: "urgente", label: "Urgente", color: "bg-rose-500",   text: "text-rose-500"   },
                { k: "alta",    label: "Alta",    color: "bg-amber-500",  text: "text-amber-500"  },
                { k: "media",   label: "Media",   color: "bg-sky-500",    text: "text-sky-500"    },
                { k: "baja",    label: "Baja",    color: "bg-emerald-500",text: "text-emerald-500"},
              ].map(row => (
                <div key={row.k} className="flex items-center justify-between gap-3">
                  <div className="flex items-center gap-2 flex-1">
                    <span className={`h-2 w-2 rounded-full ${row.color}`} />
                    <span className="text-xs font-bold uppercase tracking-wide">{row.label}</span>
                    <div className="flex-1 h-1.5 bg-muted rounded-full overflow-hidden">
                      <div className={`h-full ${row.color} rounded-full`} style={{ width: `${totalCasos > 0 ? (prioridades[row.k] / totalCasos) * 100 : 0}%` }} />
                    </div>
                  </div>
                  <span className={`text-xs font-black tabular-nums ${row.text} w-6 text-right`}>{prioridades[row.k]}</span>
                </div>
              ))}
            </div>
          </div>

          {/* Canales */}
          <div className="lg:col-span-3 rounded-2xl border border-border bg-card p-6">
            <div className="flex items-center gap-2 mb-5">
              <div className="h-7 w-7 rounded-lg bg-brand-500/10 text-brand-500 grid place-items-center"><Activity className="h-3.5 w-3.5" /></div>
              <h3 className="font-black text-sm uppercase tracking-widest text-muted-foreground">Canales de Origen</h3>
            </div>
            <div className="space-y-3">
              {Object.entries(canales).length > 0 ? Object.entries(canales).sort(([,a],[,b]) => b - a).map(([canal, count]) => (
                <div key={canal} className="space-y-1.5">
                  <div className="flex justify-between items-center">
                    <div className="flex items-center gap-2">
                      <span className={`h-2 w-2 rounded-full bg-gradient-to-r ${canalColors[canal] || "from-muted-foreground to-muted-foreground"}`} />
                      <span className="text-xs font-black uppercase tracking-wide">{canal}</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-[10px] text-muted-foreground">{totalCasos > 0 ? Math.round((count / totalCasos) * 100) : 0}%</span>
                      <span className="text-xs font-black tabular-nums text-brand-500">{count}</span>
                    </div>
                  </div>
                  <div className="h-1.5 w-full bg-muted rounded-full overflow-hidden">
                    <div className={`h-full bg-gradient-to-r ${canalColors[canal] || "from-muted-foreground/40 to-muted-foreground/20"} rounded-full`} style={{ width: `${totalCasos > 0 ? (count / totalCasos) * 100 : 0}%` }} />
                  </div>
                </div>
              )) : <p className="text-xs text-muted-foreground italic">Sin datos por canal</p>}
            </div>
          </div>

          {/* Problemas por Agente */}
          {topProblemas.length > 0 && (
            <div className="lg:col-span-3 rounded-2xl border border-border bg-card p-6">
              <div className="flex items-center gap-2 mb-5">
                <div className="h-7 w-7 rounded-lg bg-emerald-500/10 text-emerald-500 grid place-items-center"><FileText className="h-3.5 w-3.5" /></div>
                <h3 className="font-black text-sm uppercase tracking-widest text-muted-foreground">Problemas por Agente</h3>
              </div>
              <div className="space-y-3">
                {topProblemas.map((p, i) => {
                  const topAgenteNombre = agenteMap[p.topAgenteEmail] || p.topAgenteEmail.split("@")[0] || "Sin agente";
                  return (
                    <div key={p.label} className="space-y-1.5">
                      <div className="flex justify-between items-center">
                        <div className="flex items-center gap-2">
                          <span className="text-[10px] font-black text-muted-foreground w-4">#{i + 1}</span>
                          <span className="text-xs font-bold uppercase tracking-wide">{p.label}</span>
                        </div>
                        <span className="text-xs font-black tabular-nums text-emerald-500">{p.total}</span>
                      </div>
                      <div className="h-1.5 w-full bg-muted rounded-full overflow-hidden">
                        <div className="h-full bg-emerald-500 rounded-full" style={{ width: `${topProblemas[0].total > 0 ? (p.total / topProblemas[0].total) * 100 : 0}%` }} />
                      </div>
                      <p className="text-[10px] text-muted-foreground">Más atendido por <span className="font-bold text-foreground">{topAgenteNombre}</span> ({p.topAgenteCount})</p>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

      </div>
    </div>
  );
}
