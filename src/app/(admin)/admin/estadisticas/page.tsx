import { createClient } from "@/lib/supabase/server";
import { Users, TrendingUp, CheckCircle, Star, ArrowUpRight, Repeat2, AlertCircle, BarChart3, TrendingDown, Minus, ExternalLink, Cpu, Wrench, Clock, Zap, Activity, Globe, UserPlus, ShieldAlert } from "lucide-react";
import Link from "next/link";
import { StatsExportButton } from "@/components/admin/stats-export-button";

export const dynamic = "force-dynamic";

export default async function EstadisticasClientePage() {
  const supabase = createClient();

  // Intentar con columnas nuevas; si fallan (aún no migradas), usar columnas base
  let { data: casos, error: casosErr } = await supabase
    .from("sek_cases")
    .select("id, estado, cliente, created_at, updated_at, canal, cat, title, prioridad, assigned_to, marca, modelo, resolucion, problema")
    .order("created_at", { ascending: false });
  if (casosErr) {
    const { data: casosFallback } = await supabase
      .from("sek_cases")
      .select("id, estado, cliente, created_at, updated_at, canal, cat, title, prioridad, assigned_to")
      .order("created_at", { ascending: false });
    casos = casosFallback as any;
  }

  // ── Fechas
  const hoy = new Date(); hoy.setHours(0,0,0,0);
  const hace7 = new Date(hoy); hace7.setDate(hoy.getDate() - 7);
  const hace14 = new Date(hoy); hace14.setDate(hoy.getDate() - 14);
  const hace30 = new Date(hoy); hace30.setDate(hoy.getDate() - 30);

  // ── Parsear cliente helper
  const parseCliente = (raw: unknown): { nombre: string; telefono: string; correo: string; cedula: string } => {
    if (!raw) return { nombre: "Anónimo", telefono: "—", correo: "", cedula: "" };
    try {
      const c = typeof raw === "string" ? JSON.parse(raw) : raw as Record<string, string>;
      return {
        nombre: c.nombre || c.name || "Anónimo",
        telefono: c.telefono || c.phone || "—",
        correo: c.correo || c.email || "",
        cedula: c.cedula || "",
      };
    } catch { return { nombre: "Anónimo", telefono: "—", correo: "", cedula: "" }; }
  };

  // ── Leer calificación del cliente desde objeto cliente
  const getCal = (raw: unknown): number | null => {
    if (!raw) return null;
    const c = typeof raw === "string" ? JSON.parse(raw) : raw as any;
    const v = c?.calificacion_cliente ?? c?.calificacion_agente;
    const n = Number(v);
    return v != null && !isNaN(n) && n >= 1 && n <= 5 ? n : null;
  };

  // ── Agrupar por cliente — clave: cédula > correo > teléfono > nombre+primerCasoId
  const mapa: Record<string, {
    nombre: string; telefono: string; correo: string; cedula: string;
    total: number; resueltos: number; abiertos: number;
    calificaciones: number[]; canales: Record<string, number>;
    primerCaso: string; ultimoCaso: string; ultimoCasoId: string | number;
    cats: string[];
  }> = {};

  (casos || []).forEach(c => {
    const { nombre, telefono, correo, cedula } = parseCliente(c.cliente);
    // Clave única: prioridad cedula > correo > telefono; si ninguno, cada caso es su propio cliente
    const key = cedula || correo || (telefono !== "—" ? telefono : `_id_${c.id}`);
    if (!mapa[key]) {
      mapa[key] = { nombre, telefono, correo, cedula, total: 0, resueltos: 0, abiertos: 0, calificaciones: [], canales: {}, primerCaso: c.created_at, ultimoCaso: c.created_at, ultimoCasoId: c.id, cats: [] };
    }
    const m = mapa[key];
    m.total++;
    if (c.estado === "resuelto" || c.estado === "cerrado") m.resueltos++; else m.abiertos++;
    const cal = getCal(c.cliente); if (cal !== null) m.calificaciones.push(cal);
    const canal = c.canal || "web";
    m.canales[canal] = (m.canales[canal] || 0) + 1;
    if (c.created_at < m.primerCaso) m.primerCaso = c.created_at;
    if (c.created_at > m.ultimoCaso) { m.ultimoCaso = c.created_at; m.ultimoCasoId = c.id; }
    if (c.cat && !m.cats.includes(c.cat)) m.cats.push(c.cat);
  });

  const topClientes = Object.values(mapa).sort((a, b) => b.total - a.total);

  // ── Equipos más reportados (solo casos que tienen marca+modelo)
  const equipoMap: Record<string, {
    marca: string; modelo: string; cat: string;
    total: number; resueltos: number;
    clientes: Set<string>; ultimoCasoId: string | number; ultimoCasoAt: string;
  }> = {};
  (casos || []).forEach(c => {
    if (!c.marca || !c.modelo) return;
    const key = `${c.marca}||${c.modelo}`;
    if (!equipoMap[key]) {
      equipoMap[key] = { marca: c.marca, modelo: c.modelo, cat: c.cat || "", total: 0, resueltos: 0, clientes: new Set(), ultimoCasoId: c.id, ultimoCasoAt: c.created_at };
    }
    const e = equipoMap[key];
    e.total++;
    if (c.estado === "resuelto" || c.estado === "cerrado") e.resueltos++;
    const { cedula, correo, telefono, nombre } = parseCliente(c.cliente);
    const clienteKey = cedula || correo || (telefono !== "—" ? telefono : nombre);
    e.clientes.add(clienteKey);
    if (c.created_at > e.ultimoCasoAt) { e.ultimoCasoAt = c.created_at; e.ultimoCasoId = c.id; }
  });
  const topEquipos = Object.values(equipoMap)
    .map(e => ({ ...e, clientesCount: e.clientes.size }))
    .sort((a, b) => b.total - a.total)
    .slice(0, 15);

  // ── Solicitudes / problemas más frecuentes
  const labels: Record<string, string> = {
    sin_imagen: "Sin imagen", sin_grabacion: "Sin grabación", sin_acceso_remoto: "Sin acceso remoto",
    sin_energia: "Sin energía", error_configuracion: "Error de configuración", conectividad_red: "Conectividad / red",
    reset_contrasena: "Reset contraseña", desvinculacion_cuenta: "Desvinculación cuenta",
    dano_fisico: "Daño físico", actualizacion_firmware: "Actualización firmware",
    instalacion_nueva: "Instalación nueva", deteccion_incendio: "Detección incendio",
    control_acceso: "Control de acceso", intrusion_alarma: "Intrusión / alarma", otro: "Otro",
  };
  const problemaMap: Record<string, { label: string; total: number; resueltos: number; ultimoCasoId: string | number }> = {};
  (casos || []).forEach(c => {
    if (!c.problema) return;
    if (!problemaMap[c.problema]) {
      problemaMap[c.problema] = { label: labels[c.problema] || c.problema, total: 0, resueltos: 0, ultimoCasoId: c.id };
    }
    problemaMap[c.problema].total++;
    if (c.estado === "resuelto" || c.estado === "cerrado") problemaMap[c.problema].resueltos++;
  });
  const topProblemas = Object.values(problemaMap).sort((a, b) => b.total - a.total);
  const maxProblema = topProblemas[0]?.total || 1;

  // ── KPIs globales de clientes
  const totalClientes = topClientes.length;
  const clientesRecurrentes = topClientes.filter(c => c.total > 1).length;
  const pctRecurrencia = totalClientes > 0 ? Math.round((clientesRecurrentes / totalClientes) * 100) : 0;
  const clientesActivos = topClientes.filter(c => c.abiertos > 0).length;

  const todasCals = topClientes.flatMap(c => c.calificaciones);
  const avgSat = todasCals.length > 0 ? (todasCals.reduce((a, b) => a + b, 0) / todasCals.length).toFixed(1) : "N/A";
  const promotores = todasCals.filter(c => c >= 4).length;
  const detractores = todasCals.filter(c => c <= 2).length;
  const nps = todasCals.length > 0 ? Math.round(((promotores - detractores) / todasCals.length) * 100) : null;

  const totalCasos = (casos || []).length;
  const casos7d = (casos || []).filter(c => new Date(c.created_at) >= hace7).length;
  const casosAntes7d = (casos || []).filter(c => new Date(c.created_at) >= hace14 && new Date(c.created_at) < hace7).length;
  const tendencia7d = casosAntes7d > 0 ? Math.round(((casos7d - casosAntes7d) / casosAntes7d) * 100) : 0;

  // ── Tiempo promedio apertura→cierre (solo estados terminales, descarta outliers > 30 días)
  // Nota: usa updated_at como proxy del cierre; es válido si el estado es "resuelto" o "cerrado"
  // y el caso no fue reabierto. Se excluyen casos con diff <= 0 (datos corruptos).
  const tiemposRes: number[] = [];
  (casos || []).forEach(c => {
    if ((c.estado === "resuelto" || c.estado === "cerrado") && c.created_at && c.updated_at) {
      const diff = Math.round((new Date(c.updated_at).getTime() - new Date(c.created_at).getTime()) / 60000);
      if (diff > 0 && diff < 43200) tiemposRes.push(diff); // 43200 min = 30 días
    }
  });
  const avgResMin = tiemposRes.length > 0 ? Math.round(tiemposRes.reduce((a, b) => a + b, 0) / tiemposRes.length) : 0;
  const formatTiempo = (min: number) => {
    if (min < 60) return { value: min.toString(), unit: "min" };
    if (min < 1440) return { value: (min / 60).toFixed(1), unit: "hrs" };
    return { value: (min / 1440).toFixed(1), unit: "días" };
  };
  const avgResFormatted = formatTiempo(avgResMin);

  // ── Tasa de resolución rápida (< 24h)
  const resueltosRapido = tiemposRes.filter(t => t <= 1440).length;
  const tasaRapida = tiemposRes.length > 0 ? Math.round((resueltosRapido / tiemposRes.length) * 100) : 0;

  // ── Distribución por canal
  const canalCount: Record<string, number> = {};
  (casos || []).forEach(c => {
    const canal = c.canal || "web";
    canalCount[canal] = (canalCount[canal] || 0) + 1;
  });
  const canalesOrdenados = Object.entries(canalCount).sort(([,a], [,b]) => b - a);
  const canalTotal = Object.values(canalCount).reduce((a, b) => a + b, 0);

  // ── Nuevos vs Recurrentes por mes (últimos 6 meses)
  const meses6: { label: string; nuevos: number; recurrentes: number }[] = [];
  for (let i = 5; i >= 0; i--) {
    const desde = new Date(hoy); desde.setDate(1); desde.setMonth(hoy.getMonth() - i);
    const hasta = new Date(desde); hasta.setMonth(desde.getMonth() + 1);
    const clientesEseMes = new Set<string>();
    const clientesAntes = new Set<string>();
    (casos || []).forEach(c => {
      const d = new Date(c.created_at);
      const key = parseCliente(c.cliente); const k = key.cedula || key.correo || (key.telefono !== "—" ? key.telefono : `_id_${c.id}`);
      if (d < desde) clientesAntes.add(k);
      if (d >= desde && d < hasta) clientesEseMes.add(k);
    });
    let nuevos = 0; let recurrentes = 0;
    clientesEseMes.forEach(k => { if (clientesAntes.has(k)) recurrentes++; else nuevos++; });
    meses6.push({ label: desde.toLocaleDateString("es-CR", { month: "short", year: "2-digit" }), nuevos, recurrentes });
  }
  const meses6Max = Math.max(...meses6.map(m => m.nuevos + m.recurrentes), 1);

  // ── Histograma: distribución de clientes por número de casos
  const histogramaMap: Record<string, number> = { "1": 0, "2": 0, "3-5": 0, "6-10": 0, "11+": 0 };
  topClientes.forEach(c => {
    if (c.total === 1) histogramaMap["1"]++;
    else if (c.total === 2) histogramaMap["2"]++;
    else if (c.total <= 5) histogramaMap["3-5"]++;
    else if (c.total <= 10) histogramaMap["6-10"]++;
    else histogramaMap["11+"]++;
  });
  const histMax = Math.max(...Object.values(histogramaMap), 1);

  // ── Clientes en riesgo: casos abiertos hace más de 3 días sin actualización
  const hace3 = new Date(hoy); hace3.setDate(hoy.getDate() - 3);
  const clientesRiesgo = topClientes
    .filter(c => c.abiertos > 0 && new Date(c.ultimoCaso) < hace3)
    .sort((a, b) => new Date(a.ultimoCaso).getTime() - new Date(b.ultimoCaso).getTime());

  const nowStr = new Date().toLocaleString("es-CR", { timeZone: "America/Costa_Rica", dateStyle: "long", timeStyle: "short" });

  const canalBadge: Record<string, string> = {
    widget: "bg-brand-500/10 text-brand-500",
    whatsapp: "bg-emerald-500/10 text-emerald-500",
    messenger: "bg-blue-500/10 text-blue-500",
    web: "bg-violet-500/10 text-violet-500",
    email: "bg-amber-500/10 text-amber-500",
  };
  const canalColors: Record<string, string> = {
    widget: "from-brand-500 to-brand-400",
    whatsapp: "from-emerald-500 to-emerald-400",
    messenger: "from-blue-500 to-blue-400",
    web: "from-violet-500 to-violet-400",
    email: "from-amber-500 to-amber-400",
  };
  const canalLabels: Record<string, string> = {
    widget: "Widget", whatsapp: "WhatsApp", messenger: "Messenger", web: "Web", email: "Email",
  };

  return (
    <div className="max-w-[1600px] mx-auto p-4 md:p-6 xl:p-8 space-y-6">

      {/* ══════════════════════════════════════════════════════════════════
          HEADER — Ultra-premium glassmorphism
      ══════════════════════════════════════════════════════════════════ */}
      <header className="relative overflow-hidden rounded-3xl border border-border/60 bg-gradient-to-br from-card via-card to-muted/20 p-6 lg:p-8">
        <div className="absolute -top-24 -right-24 w-80 h-80 bg-brand-500/8 rounded-full blur-[100px] pointer-events-none" />
        <div className="absolute -bottom-20 -left-20 w-60 h-60 bg-violet-500/5 rounded-full blur-[80px] pointer-events-none" />
        <div className="relative flex flex-col lg:flex-row lg:items-end lg:justify-between gap-6">
          <div>
            <div className="flex items-center gap-2.5 mb-3">
              <div className="h-7 w-7 rounded-lg bg-gradient-to-br from-brand-500 to-brand-600 text-white grid place-items-center shadow-lg shadow-brand-500/25">
                <Activity className="h-3.5 w-3.5" />
              </div>
              <p className="text-[10px] font-black uppercase tracking-[0.3em] text-brand-500">Centro de Analítica</p>
            </div>
            <h1 className="text-3xl lg:text-4xl font-black tracking-tight bg-gradient-to-r from-foreground to-foreground/70 bg-clip-text">
              Analítica de Clientes
            </h1>
            <div className="flex flex-wrap items-center gap-3 mt-3">
              <span className="text-xs text-muted-foreground">{nowStr}</span>
              <span className="h-1 w-1 rounded-full bg-muted-foreground/30" />
              <span className="text-xs font-bold text-brand-500">{totalClientes} clientes</span>
              <span className="h-1 w-1 rounded-full bg-muted-foreground/30" />
              <span className="text-xs font-bold text-violet-500">{totalCasos} casos</span>
            </div>
          </div>
          <div className="flex items-center gap-2.5 shrink-0">
            <Link href="/admin/estadisticas/atencion"
              className="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-gradient-to-r from-brand-600 to-brand-500 hover:from-brand-700 hover:to-brand-600 text-white text-xs font-black transition-all shadow-lg shadow-brand-600/30 hover:shadow-xl hover:shadow-brand-600/40 hover:-translate-y-0.5">
              Desempeño Agentes <ArrowUpRight className="h-3.5 w-3.5" />
            </Link>
            <Link href="/admin"
              className="flex items-center gap-2 px-5 py-2.5 rounded-xl border border-border/80 bg-card/80 backdrop-blur-sm text-xs font-black hover:bg-muted/80 transition-all hover:-translate-y-0.5">
              Panel <ArrowUpRight className="h-3.5 w-3.5 opacity-40" />
            </Link>
          </div>
        </div>
      </header>

      {/* ══════════════════════════════════════════════════════════════════
          KPI ROW — 6 cards in bento style
      ══════════════════════════════════════════════════════════════════ */}
      <section className="grid gap-3 grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
        {[
          { label: "Clientes", value: totalClientes.toString(), icon: Users, color: "text-brand-500", gradient: "from-brand-500/15 to-brand-500/5", sub: `${clientesActivos} activos` },
          { label: "Recurrencia", value: `${pctRecurrencia}%`, icon: Repeat2, color: "text-violet-500", gradient: "from-violet-500/15 to-violet-500/5", sub: `${clientesRecurrentes} repiten` },
          { label: "CSAT", value: avgSat !== "N/A" ? `${avgSat}` : "—", icon: Star, color: "text-amber-400", gradient: "from-amber-400/15 to-amber-400/5", sub: `${todasCals.length} ratings` },
          { label: "NPS", value: nps === null ? "—" : `${nps > 0 ? "+" : ""}${nps}`, icon: TrendingUp, color: nps === null ? "text-muted-foreground" : nps >= 50 ? "text-emerald-500" : nps >= 0 ? "text-amber-400" : "text-rose-500", gradient: nps !== null && nps >= 50 ? "from-emerald-500/15 to-emerald-500/5" : "from-amber-400/15 to-amber-400/5", sub: `${promotores}P · ${detractores}D` },
          { label: "T. Resolución", value: tiemposRes.length > 0 ? avgResFormatted.value : "—", icon: Clock, color: "text-sky-500", gradient: "from-sky-500/15 to-sky-500/5", sub: tiemposRes.length > 0 ? `${avgResFormatted.unit} apertura→cierre` : "sin datos aún" },
          { label: "Resueltos <24h", value: tiemposRes.length > 0 ? `${tasaRapida}%` : "—", icon: Zap, color: "text-emerald-500", gradient: "from-emerald-500/15 to-emerald-500/5", sub: tiemposRes.length > 0 ? `${resueltosRapido} de ${tiemposRes.length}` : "sin datos aún" },
        ].map((k, i) => (
          <div key={i} className="group relative rounded-2xl border border-border/60 bg-gradient-to-br from-card to-card/80 p-4 overflow-hidden hover:border-border hover:shadow-lg hover:-translate-y-0.5 transition-all duration-300">
            <div className={`absolute inset-0 bg-gradient-to-br ${k.gradient} opacity-0 group-hover:opacity-100 transition-opacity duration-500`} />
            <div className="relative">
              <div className={`inline-flex items-center justify-center h-8 w-8 rounded-lg bg-gradient-to-br ${k.gradient} ${k.color} mb-2`}>
                <k.icon className="h-4 w-4" />
              </div>
              <p className="text-[9px] font-black uppercase tracking-widest text-muted-foreground/70">{k.label}</p>
              <p className={`text-2xl xl:text-3xl font-black mt-0.5 tracking-tight tabular-nums ${k.color}`}>{k.value}</p>
              <p className="text-[10px] text-muted-foreground mt-1">{k.sub}</p>
            </div>
          </div>
        ))}
      </section>

      {/* ══════════════════════════════════════════════════════════════════
          BENTO GRID — Main analytics area
      ══════════════════════════════════════════════════════════════════ */}
      <section className="grid gap-4 lg:grid-cols-12">

        {/* ── Nuevos vs Recurrentes por mes ── */}
        <div className="lg:col-span-8 rounded-2xl border border-border/60 bg-card p-5 overflow-hidden">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2.5">
              <div className="h-7 w-7 rounded-lg bg-brand-500/10 text-brand-500 grid place-items-center">
                <UserPlus className="h-3.5 w-3.5" />
              </div>
              <div>
                <h3 className="text-sm font-black">Nuevos vs Recurrentes</h3>
                <p className="text-[10px] text-muted-foreground">Clientes por mes · últimos 6 meses</p>
              </div>
            </div>
            <div className="flex items-center gap-3">
              <span className="flex items-center gap-1 text-[10px] font-bold text-brand-500"><span className="h-2 w-2 rounded-sm bg-brand-500"/>Nuevos</span>
              <span className="flex items-center gap-1 text-[10px] font-bold text-violet-500"><span className="h-2 w-2 rounded-sm bg-violet-500"/>Recurrentes</span>
            </div>
          </div>
          <div className="flex items-end gap-3 h-32">
            {meses6.map((m, i) => (
              <div key={i} className="flex-1 flex flex-col items-center gap-0.5 group/m relative">
                <div className="w-full flex flex-col-reverse gap-px" style={{ height: "100%" }}>
                  <div
                    className="w-full bg-gradient-to-t from-violet-600/80 to-violet-400/60 rounded-t-none hover:opacity-90 transition-opacity cursor-default"
                    style={{ height: `${Math.round((m.recurrentes / meses6Max) * 100)}%` }}
                  />
                  <div
                    className="w-full bg-gradient-to-t from-brand-600/80 to-brand-400/60 rounded-t-sm hover:opacity-90 transition-opacity cursor-default"
                    style={{ height: `${Math.round((m.nuevos / meses6Max) * 100)}%` }}
                  />
                </div>
                <div className="absolute -top-8 left-1/2 -translate-x-1/2 hidden group-hover/m:flex flex-col items-center bg-foreground text-background text-[9px] font-bold px-1.5 py-0.5 rounded whitespace-nowrap z-10">
                  <span className="text-brand-300">{m.nuevos} nuevos</span>
                  <span className="text-violet-300">{m.recurrentes} recurrentes</span>
                </div>
              </div>
            ))}
          </div>
          <div className="flex justify-between mt-2">
            {meses6.map((m, i) => (
              <span key={i} className="flex-1 text-center text-[9px] text-muted-foreground/50">{m.label}</span>
            ))}
          </div>
        </div>

        {/* ── Distribución por estado (donut visual) ── */}
        <div className="lg:col-span-4 rounded-2xl border border-border/60 bg-card p-5">
          <div className="flex items-center gap-2.5 mb-4">
            <div className="h-7 w-7 rounded-lg bg-emerald-500/10 text-emerald-500 grid place-items-center">
              <CheckCircle className="h-3.5 w-3.5" />
            </div>
            <div>
              <h3 className="text-sm font-black">Resolución</h3>
              <p className="text-[10px] text-muted-foreground">Estado de casos</p>
            </div>
          </div>
          <div className="flex items-center justify-center my-4">
            <div className="relative h-28 w-28">
              <svg viewBox="0 0 36 36" className="h-full w-full -rotate-90">
                <circle cx="18" cy="18" r="14" fill="none" stroke="currentColor" className="text-muted/30" strokeWidth="3.5" />
                <circle cx="18" cy="18" r="14" fill="none" stroke="currentColor" className="text-emerald-500"
                  strokeWidth="3.5" strokeDasharray={`${totalCasos > 0 ? ((casos || []).filter(c => c.estado === "resuelto" || c.estado === "cerrado").length / totalCasos) * 88 : 0} 88`} strokeLinecap="round" />
              </svg>
              <div className="absolute inset-0 flex flex-col items-center justify-center">
                <span className="text-2xl font-black text-emerald-500 tabular-nums">
                  {totalCasos > 0 ? Math.round(((casos || []).filter(c => c.estado === "resuelto" || c.estado === "cerrado").length / totalCasos) * 100) : 0}%
                </span>
                <span className="text-[9px] text-muted-foreground font-bold">resueltos</span>
              </div>
            </div>
          </div>
          <div className="space-y-2">
            {[
              { label: "Resueltos", count: (casos || []).filter(c => c.estado === "resuelto" || c.estado === "cerrado").length, color: "bg-emerald-500", text: "text-emerald-500" },
              { label: "Activos", count: (casos || []).filter(c => ["abierto","asignado","pendiente"].includes(c.estado || "")).length, color: "bg-brand-500", text: "text-brand-500" },
              { label: "Escalados", count: (casos || []).filter(c => c.estado === "escalado").length, color: "bg-rose-500", text: "text-rose-500" },
            ].map(row => (
              <div key={row.label} className="flex items-center gap-2.5 p-2 rounded-lg hover:bg-muted/30 transition-colors">
                <span className={`h-2.5 w-2.5 rounded-full ${row.color} shrink-0`} />
                <span className="text-xs text-muted-foreground flex-1">{row.label}</span>
                <span className={`text-xs font-black tabular-nums ${row.text}`}>{row.count}</span>
              </div>
            ))}
          </div>
        </div>

        {/* ── Histograma: distribución de casos por cliente ── */}
        <div className="lg:col-span-5 rounded-2xl border border-border/60 bg-card p-5">
          <div className="flex items-center gap-2.5 mb-4">
            <div className="h-7 w-7 rounded-lg bg-sky-500/10 text-sky-500 grid place-items-center">
              <BarChart3 className="h-3.5 w-3.5" />
            </div>
            <div>
              <h3 className="text-sm font-black">Casos por Cliente</h3>
              <p className="text-[10px] text-muted-foreground">Distribución de frecuencia</p>
            </div>
          </div>
          <div className="space-y-2.5">
            {Object.entries(histogramaMap).map(([rango, count]) => {
              const pct = Math.round((count / histMax) * 100);
              return (
                <div key={rango}>
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-xs font-bold">{rango} caso{rango === "1" ? "" : "s"}</span>
                    <div className="flex items-center gap-1.5">
                      <span className="text-[10px] font-black tabular-nums text-sky-500">{count}</span>
                      <span className="text-[9px] text-muted-foreground">clientes</span>
                    </div>
                  </div>
                  <div className="h-1.5 w-full bg-muted/40 rounded-full overflow-hidden">
                    <div className="h-full bg-gradient-to-r from-sky-600 to-sky-400 rounded-full transition-all" style={{ width: `${pct}%` }} />
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* ── Canales ── */}
        <div className="lg:col-span-3 rounded-2xl border border-border/60 bg-card p-5">
          <div className="flex items-center gap-2.5 mb-4">
            <div className="h-7 w-7 rounded-lg bg-brand-500/10 text-brand-500 grid place-items-center">
              <Globe className="h-3.5 w-3.5" />
            </div>
            <div>
              <h3 className="text-sm font-black">Canales</h3>
              <p className="text-[10px] text-muted-foreground">Origen de casos</p>
            </div>
          </div>
          <div className="space-y-2.5">
            {canalesOrdenados.map(([canal, count]) => {
              const pct = canalTotal > 0 ? Math.round((count / canalTotal) * 100) : 0;
              return (
                <div key={canal}>
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-xs font-bold">{canalLabels[canal] || canal}</span>
                    <div className="flex items-center gap-1.5">
                      <span className="text-[10px] font-black tabular-nums">{count}</span>
                      <span className="text-[9px] text-muted-foreground">({pct}%)</span>
                    </div>
                  </div>
                  <div className="h-1.5 w-full bg-muted/50 rounded-full overflow-hidden">
                    <div className={`h-full bg-gradient-to-r ${canalColors[canal] || "from-gray-500 to-gray-400"} rounded-full transition-all`} style={{ width: `${pct}%` }} />
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* ── Clientes en riesgo (abiertos > 3 días) + Clientes activos ── */}
        <div className="lg:col-span-4 rounded-2xl border border-border/60 bg-card p-5">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2.5">
              <div className="h-7 w-7 rounded-lg bg-rose-500/10 text-rose-500 grid place-items-center">
                <ShieldAlert className="h-3.5 w-3.5" />
              </div>
              <div>
                <h3 className="text-sm font-black">Clientes en Riesgo</h3>
                <p className="text-[10px] text-muted-foreground">Casos abiertos sin mover &gt;3 días</p>
              </div>
            </div>
            <span className="text-xl font-black text-rose-500 tabular-nums">{clientesRiesgo.length}</span>
          </div>
          <div className="space-y-2">
            {clientesRiesgo.slice(0, 5).map((c, i) => {
              const diasSinMover = Math.floor((hoy.getTime() - new Date(c.ultimoCaso).getTime()) / 86400000);
              return (
                <div key={i} className="flex items-center justify-between p-2.5 rounded-xl bg-rose-500/5 border border-rose-500/10 hover:border-rose-500/30 transition-colors">
                  <div className="flex items-center gap-2.5 min-w-0">
                    <div className="h-7 w-7 rounded-lg bg-gradient-to-br from-rose-500/20 to-rose-600/20 text-rose-500 text-[9px] font-black grid place-items-center shrink-0">
                      {c.nombre[0]?.toUpperCase()}
                    </div>
                    <div className="min-w-0">
                      <span className="text-xs font-bold truncate block">{c.nombre}</span>
                      <span className="text-[9px] text-muted-foreground">{c.abiertos} abierto{c.abiertos > 1 ? "s" : ""}</span>
                    </div>
                  </div>
                  <span className="text-[10px] font-black text-rose-500 bg-rose-500/10 px-2 py-0.5 rounded-full ml-2 shrink-0">{diasSinMover}d</span>
                </div>
              );
            })}
            {clientesRiesgo.length === 0 && (
              <div className="flex items-center justify-center gap-2 p-6 text-emerald-500">
                <CheckCircle className="h-4 w-4" />
                <span className="text-xs font-bold">Sin clientes en riesgo</span>
              </div>
            )}
          </div>
        </div>
      </section>

      {/* ══════════════════════════════════════════════════════════════════
          EQUIPOS + SOLICITUDES — Side by side premium tables
      ══════════════════════════════════════════════════════════════════ */}
      <section className="grid gap-4 lg:grid-cols-2">

        {/* Equipos más reportados */}
        <div className="rounded-2xl border border-border/60 bg-card overflow-hidden">
          <div className="flex items-center justify-between px-5 py-4 border-b border-border/50 bg-gradient-to-r from-sky-500/5 to-transparent">
            <div className="flex items-center gap-2.5">
              <div className="h-7 w-7 rounded-lg bg-sky-500/10 text-sky-500 grid place-items-center"><Cpu className="h-3.5 w-3.5" /></div>
              <h3 className="font-black text-sm">Equipos Más Reportados</h3>
            </div>
            <span className="text-[10px] font-black px-2 py-0.5 rounded-full bg-sky-500/10 text-sky-500">{topEquipos.length}</span>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b border-border/30">
                  <th className="px-4 py-2.5 text-left text-[9px] font-black uppercase tracking-widest text-muted-foreground/60">Equipo</th>
                  <th className="px-3 py-2.5 text-center text-[9px] font-black uppercase tracking-widest text-muted-foreground/60">Casos</th>
                  <th className="px-3 py-2.5 text-center text-[9px] font-black uppercase tracking-widest text-muted-foreground/60">Tasa</th>
                  <th className="px-3 py-2.5 text-center text-[9px] font-black uppercase tracking-widest text-muted-foreground/60"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border/30">
                {topEquipos.slice(0, 8).map((e, i) => {
                  const tasa = e.total > 0 ? Math.round((e.resueltos / e.total) * 100) : 0;
                  return (
                    <tr key={i} className="hover:bg-muted/20 transition-colors">
                      <td className="px-4 py-2.5">
                        <div className="flex items-center gap-2">
                          <div className="h-6 w-6 rounded-md bg-sky-500/10 text-sky-500 grid place-items-center shrink-0">
                            <Cpu className="h-3 w-3" />
                          </div>
                          <div className="min-w-0">
                            <p className="font-bold text-xs truncate">{e.marca}</p>
                            <p className="text-[9px] text-muted-foreground truncate">{e.modelo}</p>
                          </div>
                        </div>
                      </td>
                      <td className="px-3 py-2.5 text-center">
                        <span className="font-black text-sm tabular-nums text-sky-500">{e.total}</span>
                      </td>
                      <td className="px-3 py-2.5 text-center">
                        <div className="inline-flex items-center gap-1">
                          <div className="h-1 w-8 bg-muted rounded-full overflow-hidden">
                            <div className="h-full bg-emerald-500 rounded-full" style={{ width: `${tasa}%` }} />
                          </div>
                          <span className="text-[9px] font-bold text-emerald-500">{tasa}%</span>
                        </div>
                      </td>
                      <td className="px-3 py-2.5 text-center">
                        <Link href={`/inbox?case=${e.ultimoCasoId}`} className="text-brand-500 hover:text-brand-600">
                          <ExternalLink className="h-3 w-3" />
                        </Link>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>

        {/* Solicitudes más frecuentes */}
        <div className="rounded-2xl border border-border/60 bg-card overflow-hidden">
          <div className="flex items-center justify-between px-5 py-4 border-b border-border/50 bg-gradient-to-r from-violet-500/5 to-transparent">
            <div className="flex items-center gap-2.5">
              <div className="h-7 w-7 rounded-lg bg-violet-500/10 text-violet-500 grid place-items-center"><Wrench className="h-3.5 w-3.5" /></div>
              <h3 className="font-black text-sm">Problemas Frecuentes</h3>
            </div>
            <span className="text-[10px] font-black px-2 py-0.5 rounded-full bg-violet-500/10 text-violet-500">{topProblemas.length}</span>
          </div>
          <div className="p-5 space-y-3">
            {topProblemas.length === 0 && (
              <div className="flex flex-col items-center justify-center gap-2 py-10 text-center">
                <div className="h-10 w-10 rounded-xl bg-violet-500/10 text-violet-500/40 grid place-items-center"><Wrench className="h-5 w-5" /></div>
                <p className="text-xs font-bold text-muted-foreground/50">Sin clasificaciones aún</p>
                <p className="text-[10px] text-muted-foreground/30">Se clasifican automáticamente</p>
              </div>
            )}
            {topProblemas.slice(0, 8).map((p, i) => {
              const pct = Math.round((p.total / maxProblema) * 100);
              const resPct = p.total > 0 ? Math.round((p.resueltos / p.total) * 100) : 0;
              return (
                <div key={i} className="group/p">
                  <div className="flex items-center justify-between mb-1.5">
                    <div className="flex items-center gap-2 min-w-0">
                      <span className="text-[9px] font-black text-muted-foreground/40 w-4 tabular-nums shrink-0">{i+1}</span>
                      <span className="text-xs font-bold truncate">{p.label}</span>
                    </div>
                    <div className="flex items-center gap-2.5 shrink-0 ml-2">
                      <span className="text-[9px] text-emerald-500 font-bold">{resPct}%</span>
                      <span className="text-xs font-black tabular-nums text-violet-500">{p.total}</span>
                      <Link href={`/inbox?case=${p.ultimoCasoId}`} className="text-brand-500 hover:text-brand-600 opacity-0 group-hover/p:opacity-100 transition-opacity">
                        <ExternalLink className="h-3 w-3" />
                      </Link>
                    </div>
                  </div>
                  <div className="h-1.5 w-full bg-muted/40 rounded-full overflow-hidden">
                    <div className="h-full bg-gradient-to-r from-violet-600 to-violet-400 rounded-full transition-all" style={{ width: `${pct}%` }} />
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </section>

      {/* ══════════════════════════════════════════════════════════════════
          TOP CLIENTES TABLE — Premium data table
      ══════════════════════════════════════════════════════════════════ */}
      <div className="rounded-2xl border border-border/60 bg-card overflow-hidden">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 px-5 py-4 border-b border-border/50 bg-gradient-to-r from-brand-500/5 to-transparent">
          <div className="flex items-center gap-2.5">
            <div className="h-8 w-8 rounded-lg bg-gradient-to-br from-brand-500/20 to-brand-600/20 text-brand-500 grid place-items-center">
              <Users className="h-4 w-4" />
            </div>
            <div>
              <h3 className="font-black text-sm">Top Clientes</h3>
              <p className="text-[10px] text-muted-foreground">Por volumen de casos · {topClientes.filter(c => c.total > 1).length} recurrentes</p>
            </div>
          </div>
          <StatsExportButton
            data={topClientes.map(c => ({
              Cliente: c.nombre, Telefono: c.telefono,
              Total_Casos: c.total, Resueltos: c.resueltos, Abiertos: c.abiertos,
              Calificacion_Avg: c.calificaciones.length > 0 ? (c.calificaciones.reduce((a,b) => a+b,0)/c.calificaciones.length).toFixed(1) : "N/A",
              Canal_Principal: Object.entries(c.canales).sort(([,a],[,b]) => b-a)[0]?.[0] || "—",
              Primer_Caso: new Date(c.primerCaso).toLocaleDateString("es-CR"),
              Ultimo_Caso: new Date(c.ultimoCaso).toLocaleDateString("es-CR"),
            }))}
            fileName="Reporte_Clientes_Sekunet"
          />
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border/30 bg-muted/5">
                <th className="px-5 py-3 text-left text-[9px] font-black uppercase tracking-widest text-muted-foreground/60 w-8">#</th>
                <th className="px-4 py-3 text-left text-[9px] font-black uppercase tracking-widest text-muted-foreground/60">Cliente</th>
                <th className="px-3 py-3 text-center text-[9px] font-black uppercase tracking-widest text-muted-foreground/60">Casos</th>
                <th className="px-3 py-3 text-center text-[9px] font-black uppercase tracking-widest text-muted-foreground/60">Resueltos</th>
                <th className="px-3 py-3 text-center text-[9px] font-black uppercase tracking-widest text-muted-foreground/60">Activos</th>
                <th className="px-3 py-3 text-center text-[9px] font-black uppercase tracking-widest text-muted-foreground/60">Rating</th>
                <th className="px-3 py-3 text-center text-[9px] font-black uppercase tracking-widest text-muted-foreground/60">Canal</th>
                <th className="px-3 py-3 text-right text-[9px] font-black uppercase tracking-widest text-muted-foreground/60">Último</th>
                <th className="px-3 py-3 w-8"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border/30">
              {topClientes.length === 0 ? (
                <tr><td colSpan={9} className="py-16 text-center text-sm text-muted-foreground">Sin datos de clientes.</td></tr>
              ) : topClientes.slice(0, 20).map((c, i) => {
                const tasa = c.total > 0 ? Math.round((c.resueltos / c.total) * 100) : 0;
                const canalPrincipal = Object.entries(c.canales).sort(([,a],[,b]) => b-a)[0]?.[0] || "web";
                const avgCal = c.calificaciones.length > 0 ? (c.calificaciones.reduce((a, b) => a + b, 0) / c.calificaciones.length).toFixed(1) : null;
                const isRecurrente = c.total > 1;
                const initials = c.nombre.split(" ").filter(Boolean).map(n => n[0]).join("").substring(0, 2).toUpperCase();
                return (
                  <tr key={i} className="group hover:bg-muted/20 transition-colors">
                    <td className="px-5 py-3">
                      <span className="text-[10px] font-black text-muted-foreground/30 tabular-nums">{i + 1}</span>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2.5">
                        <div className="h-8 w-8 rounded-lg bg-gradient-to-br from-brand-500/15 to-brand-600/15 text-brand-500 text-[10px] font-black grid place-items-center shrink-0 ring-1 ring-brand-500/10">
                          {initials}
                        </div>
                        <div className="min-w-0">
                          <div className="flex items-center gap-1.5">
                            <p className="font-bold text-xs truncate">{c.nombre}</p>
                            {isRecurrente && (
                              <span className="text-[8px] font-black px-1.5 py-px rounded-full bg-violet-500/10 text-violet-500 border border-violet-500/15 shrink-0">R</span>
                            )}
                          </div>
                          <p className="text-[9px] text-muted-foreground truncate">{c.telefono}</p>
                        </div>
                      </div>
                    </td>
                    <td className="px-3 py-3 text-center">
                      <span className="font-black text-sm tabular-nums">{c.total}</span>
                    </td>
                    <td className="px-3 py-3 text-center">
                      <div className="inline-flex flex-col items-center">
                        <span className="font-black text-emerald-500 tabular-nums text-xs">{c.resueltos}</span>
                        <div className="h-1 w-8 bg-muted/50 rounded-full overflow-hidden mt-0.5">
                          <div className="h-full bg-emerald-500 rounded-full" style={{ width: `${tasa}%` }} />
                        </div>
                      </div>
                    </td>
                    <td className="px-3 py-3 text-center">
                      {c.abiertos > 0
                        ? <span className="inline-flex items-center gap-0.5 text-[10px] font-black text-rose-500 bg-rose-500/10 px-1.5 py-0.5 rounded-full">
                            <span className="h-1 w-1 rounded-full bg-rose-500 animate-pulse" />{c.abiertos}
                          </span>
                        : <span className="text-muted-foreground/20 text-xs">—</span>}
                    </td>
                    <td className="px-3 py-3 text-center">
                      {avgCal ? (
                        <div className="flex items-center justify-center gap-0.5">
                          <Star className="h-2.5 w-2.5 text-amber-400 fill-amber-400" />
                          <span className="font-black text-amber-400 text-xs tabular-nums">{avgCal}</span>
                        </div>
                      ) : <span className="text-muted-foreground/20 text-xs">—</span>}
                    </td>
                    <td className="px-3 py-3 text-center">
                      <span className={`text-[9px] font-black px-1.5 py-0.5 rounded-full uppercase ${canalBadge[canalPrincipal] || "bg-muted text-muted-foreground"}`}>
                        {canalLabels[canalPrincipal] || canalPrincipal}
                      </span>
                    </td>
                    <td className="px-3 py-3 text-right">
                      <span className="text-[10px] text-muted-foreground">{new Date(c.ultimoCaso).toLocaleDateString("es-CR", { day: "numeric", month: "short" })}</span>
                    </td>
                    <td className="px-3 py-3">
                      <Link href={`/inbox?case=${c.ultimoCasoId}`} className="opacity-0 group-hover:opacity-100 text-brand-500 hover:text-brand-600 transition-all">
                        <ExternalLink className="h-3 w-3" />
                      </Link>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* ══════════════════════════════════════════════════════════════════
          FEEDBACK RECIENTE — Premium review cards
      ══════════════════════════════════════════════════════════════════ */}
      <section>
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2.5">
            <div className="h-7 w-7 rounded-lg bg-amber-400/10 text-amber-400 grid place-items-center"><Star className="h-3.5 w-3.5" /></div>
            <h3 className="font-black text-sm">Feedback Reciente</h3>
            <span className="text-[10px] font-black px-2 py-0.5 rounded-full bg-amber-400/10 text-amber-400">{(casos || []).filter(c => getCal(c.cliente) !== null).length}</span>
          </div>
        </div>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {(casos || []).filter(c => getCal(c.cliente) !== null).slice(0, 6).map((c, i) => {
            const { nombre } = parseCliente(c.cliente);
            const stars = getCal(c.cliente) as number;
            const cl = typeof c.cliente === "object" && c.cliente ? c.cliente as any : null;
            const comentario = cl?.calificacion_comentario || cl?.calificacion_agente_comentario || null;
            return (
              <div key={i} className="group relative rounded-2xl border border-border/60 bg-card p-4 overflow-hidden hover:border-amber-400/30 hover:shadow-lg transition-all duration-300">
                <div className="absolute -top-8 -right-8 h-20 w-20 rounded-full bg-amber-400/5 blur-2xl group-hover:bg-amber-400/10 transition-all" />
                <div className="relative">
                  <div className="flex items-center justify-between mb-2.5">
                    <div className="min-w-0 flex-1">
                      <p className="text-[10px] font-black text-brand-500 uppercase tracking-wider truncate">{nombre}</p>
                    </div>
                    <div className="flex items-center gap-px shrink-0 ml-2">
                      {Array.from({ length: 5 }).map((_, si) => (
                        <Star key={si} className={`h-3 w-3 ${si < stars ? "text-amber-400 fill-amber-400" : "text-muted-foreground/15"}`} />
                      ))}
                    </div>
                  </div>
                  <p className="text-xs font-bold line-clamp-1 text-foreground/80 mb-2">{c.title || "Atención Finalizada"}</p>
                  <div className="p-2.5 bg-muted/30 rounded-lg text-[11px] italic text-muted-foreground border border-border/30 leading-relaxed line-clamp-2">
                    &quot;{comentario || "Sin comentario."}&quot;
                  </div>
                  <div className="mt-2.5 flex justify-between items-center text-[9px] text-muted-foreground">
                    <span>{new Date(c.updated_at || c.created_at).toLocaleDateString("es-CR", { day: "numeric", month: "short" })}</span>
                    <Link href={`/inbox?case=${c.id}`} className="flex items-center gap-1 text-brand-500 hover:text-brand-600 font-bold opacity-0 group-hover:opacity-100 transition-opacity">
                      <ExternalLink className="h-3 w-3" /> Ver caso
                    </Link>
                  </div>
                </div>
              </div>
            );
          })}
          {!(casos || []).some(c => getCal(c.cliente) !== null) && (
            <div className="col-span-full p-12 text-center border border-dashed border-border/60 rounded-2xl text-muted-foreground">
              <Star className="h-6 w-6 mx-auto mb-2 text-muted-foreground/20" />
              <p className="text-xs">Aún no se han recibido calificaciones</p>
            </div>
          )}
        </div>
      </section>
    </div>
  );
}
