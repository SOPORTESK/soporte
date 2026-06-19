import { createClient } from "@/lib/supabase/server";
import { Users, Clock, Star, TrendingUp, CheckCircle, FileText, Activity, ArrowUpRight, Award, Target, BarChart3, Zap, AlertTriangle, UserCheck, TrendingDown, Minus } from "lucide-react";
import Link from "next/link";
import { StatsExportButton } from "@/components/admin/stats-export-button";

export const dynamic = "force-dynamic";

export default async function EstadisticasAtencionPage() {
  const supabase = createClient();

  const { data: todosLosCasos } = await supabase
    .from("sek_cases")
    .select("id, assigned_to, created_at, updated_at, estado, cliente, title, canal, cat, prioridad, histtecnico, histcliente, accepted_at");

  const casos = todosLosCasos || [];

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

  const casosConAsig = casos.filter(c => c.assigned_to && !c.assigned_to.includes("system_prompt"));
  const casosSinAsig = casos.filter(c => !c.assigned_to || c.assigned_to.includes("system_prompt"));

  // ── Métricas globales (solo agentes humanos)
  const totalCasos = casosConAsig.length;
  const totalResueltos = casosConAsig.filter(c => c.estado === "resuelto" || c.estado === "cerrado").length;
  const totalActivos = casosConAsig.filter(c => ["abierto","asignado","pendiente","escalado"].includes(c.estado || "")).length;
  const totalEscalados = casosConAsig.filter(c => c.estado === "escalado").length;
  const tasaResolucion = totalCasos > 0 ? Math.round((totalResueltos / totalCasos) * 100) : 0;
  const tasaEscalado = totalCasos > 0 ? Math.round((totalEscalados / totalCasos) * 100) : 0;

  // ── Tendencia 7d vs 7d anterior (solo humanos)
  const casos7d = casosConAsig.filter(c => new Date(c.created_at) >= hace7dias).length;
  const casosAntes7d = casosConAsig.filter(c => new Date(c.created_at) >= hace14dias && new Date(c.created_at) < hace7dias).length;
  const tendencia7d = casosAntes7d > 0 ? Math.round(((casos7d - casosAntes7d) / casosAntes7d) * 100) : 0;

  // ── Histograma SLA (solo humanos)
  const tiemposTodos = casosConAsig
    .filter(c => (c.estado === "resuelto" || c.estado === "cerrado") && c.updated_at)
    .map(c => {
      let startTimestamp = c.accepted_at;
      if (!startTimestamp && Array.isArray(c.histtecnico)) {
        const firstMsg = c.histtecnico.find((h: any) => h.role === "tecnico");
        if (firstMsg) startTimestamp = firstMsg.time;
      }
      const start = startTimestamp ? new Date(startTimestamp) : new Date(c.created_at);
      const end = new Date(c.updated_at);
      if (isNaN(start.getTime()) || isNaN(end.getTime())) return 0;
      return Math.round((end.getTime() - start.getTime()) / 60000);
    })
    .filter(t => t > 0);
  const slaLt1h = tiemposTodos.filter(t => t <= 60).length;
  const sla1_4h = tiemposTodos.filter(t => t > 60 && t <= 240).length;
  const slaGt4h = tiemposTodos.filter(t => t > 240).length;
  const avgSlaGlobal = tiemposTodos.length > 0 ? Math.round(tiemposTodos.reduce((a, b) => a + b, 0) / tiemposTodos.length) : 0;

  // ── Tiempo en Cola (Wait Time): desde que pasa del Smart Agent hasta que el humano lo atiende (accepted_at)
  const tiemposEspera = casosConAsig
    .filter(c => c.accepted_at)
    .map(c => {
      const tAccepted = new Date(c.accepted_at!).getTime();
      let lastMsgTime = new Date(c.created_at).getTime();
      const allMsgs = [...(Array.isArray((c as any).histcliente) ? (c as any).histcliente : []), ...(Array.isArray((c as any).histtecnico) ? (c as any).histtecnico : [])];
      allMsgs.forEach((m: any) => {
        const t = m.time ? new Date(m.time).getTime() : 0;
        if (!isNaN(t) && t < tAccepted && t > lastMsgTime) lastMsgTime = t;
      });
      return Math.round((tAccepted - lastMsgTime) / 60000);
    })
    .filter(t => t >= 0);
  const avgEsperaGlobal = tiemposEspera.length > 0 ? Math.round(tiemposEspera.reduce((a, b) => a + b, 0) / tiemposEspera.length) : 0;

  // ── Prioridades (solo humanos)
  const prioridades: Record<string, number> = { urgente: 0, alta: 0, media: 0, baja: 0 };
  casosConAsig.forEach(c => { if (c.prioridad && prioridades[c.prioridad] !== undefined) prioridades[c.prioridad]++; });

  // ── Últimos 7 días — volumen por día (solo humanos)
  const spark7d: number[] = Array(7).fill(0);
  casosConAsig.forEach(c => {
    const d = new Date(c.created_at);
    if (d >= hace7dias) {
      const idx = Math.floor((d.getTime() - hace7dias.getTime()) / 86400000);
      if (idx >= 0 && idx < 7) spark7d[idx]++;
    }
  });
  const sparkMax = Math.max(...spark7d, 1);

  // ── Tiempo efectivo del agente: solo cuenta gaps cuando el SIGUIENTE mensaje es del agente
  //    cliente→agente = tiempo de respuesta del operador (cuenta, capado a UMBRAL)
  //    agente→agente  = operador sigue escribiendo (cuenta, capado a UMBRAL)
  //    agente→cliente = cliente leyendo/escribiendo (NO cuenta — es tiempo del cliente)
  //    Gaps > UMBRAL = inactividad/espera larga, no cuentan
  const UMBRAL_GAP_MIN = 5;
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

  // ── Helper para leer calificación desde objeto cliente
  function getCal(c: any): number | null {
    const cl = typeof c.cliente === "object" && c.cliente ? c.cliente as any : null;
    const v = cl?.calificacion_cliente ?? cl?.calificacion_agente;
    const n = Number(v);
    return v != null && !isNaN(n) && n >= 1 && n <= 5 ? n : null;
  }

  // ── NPS estimado (solo humanos)
  const todasCals = casosConAsig.map(getCal).filter((v): v is number => v !== null);
  const promotores = todasCals.filter(c => c >= 4).length;
  const detractores = todasCals.filter(c => c <= 2).length;
  const nps = todasCals.length > 0 ? Math.round(((promotores - detractores) / todasCals.length) * 100) : null;
  const avgSatisfaccionGlobal = todasCals.length > 0
    ? (todasCals.reduce((a, b) => a + b, 0) / todasCals.length).toFixed(1) : "N/A";

  // ── Stats por agente
  const statsPorAgente: Record<string, {
    email: string; nombre: string; totalAtendidos: number; resueltos: number; activos: number;
    escalados: number; calificaciones: number[]; tiemposResolucion: number[]; ultimoCaso: string;
    urgentes: number; casos7d: number; tiemposEfectivos: number[];
  }> = {};

  casosConAsig.forEach(caso => {
    const email = caso.assigned_to!.toLowerCase();
    if (!statsPorAgente[email]) {
      statsPorAgente[email] = { email, nombre: agenteMap[email] || caso.assigned_to!, totalAtendidos: 0, resueltos: 0, activos: 0, escalados: 0, calificaciones: [], tiemposResolucion: [], ultimoCaso: caso.title || "Caso sin título", urgentes: 0, casos7d: 0, tiemposEfectivos: [] };
    }
    const s = statsPorAgente[email];
    s.totalAtendidos++;
    if (["abierto","asignado","pendiente"].includes(caso.estado || "")) s.activos++;
    if (caso.estado === "escalado") s.escalados++;
    if (caso.estado === "resuelto" || caso.estado === "cerrado") {
      s.resueltos++;
      if (caso.updated_at) {
        let startTimestamp = caso.accepted_at;
        if (!startTimestamp && Array.isArray(caso.histtecnico)) {
          const firstMsg = caso.histtecnico.find((h: any) => h.role === "tecnico");
          if (firstMsg) startTimestamp = firstMsg.time;
        }
        const start = startTimestamp ? new Date(startTimestamp) : new Date(caso.created_at);
        const end = new Date(caso.updated_at);
        if (!isNaN(start.getTime()) && !isNaN(end.getTime())) {
          const diff = Math.round((end.getTime() - start.getTime()) / 60000);
          if (diff > 0) s.tiemposResolucion.push(diff);
        }
      }
      const te = tiempoEfectivo((caso as any).histtecnico, (caso as any).histcliente, (caso as any).accepted_at);
      if (te > 0) s.tiemposEfectivos.push(te);
    }
    const cal = getCal(caso); if (cal !== null) s.calificaciones.push(cal);
    if (caso.prioridad === "urgente") s.urgentes++;
    if (new Date(caso.created_at) >= hace7dias) s.casos7d++;
  });

  const rankingAgentes = Object.values(statsPorAgente).map(s => {
    const avgCal = s.calificaciones.length > 0 ? (s.calificaciones.reduce((a, b) => a + b, 0) / s.calificaciones.length) : 0;
    const avgSLA = s.tiemposResolucion.length > 0 ? Math.round(s.tiemposResolucion.reduce((a, b) => a + b, 0) / s.tiemposResolucion.length) : 0;
    const tasa = s.totalAtendidos > 0 ? (s.resueltos / s.totalAtendidos) * 100 : 0;
    // Score compuesto: 40% resolución + 35% satisfacción (normalizado /5) + 25% SLA (inverso, máx 480min)
    const scoreSLA = avgSLA > 0 ? Math.max(0, 100 - Math.round((avgSLA / 480) * 100)) : 0;
    const scoreSat = avgCal > 0 ? Math.round((avgCal / 5) * 100) : 0;
    // Si no hay calificaciones ni SLA medido, score es solo resolución
    const weightSat = avgCal > 0 ? 0.35 : 0;
    const weightSLA = avgSLA > 0 ? 0.25 : 0;
    const weightRes = 1 - weightSat - weightSLA;
    const score = Math.round(tasa * weightRes + scoreSat * weightSat + scoreSLA * weightSLA);
    const tasaEsc = s.totalAtendidos > 0 ? Math.round((s.escalados / s.totalAtendidos) * 100) : 0;
    const avgEfectivo = s.tiemposEfectivos.length > 0
      ? Math.round(s.tiemposEfectivos.reduce((a, b) => a + b, 0) / s.tiemposEfectivos.length) : 0;
    return { ...s, avgCalificacion: avgCal > 0 ? avgCal.toFixed(1) : "N/A", avgSLA, tasa: Math.round(tasa), score, tasaEsc, avgEfectivo };
  }).sort((a, b) => b.score - a.score);

  // ── Canales / Categorías (solo humanos)
  const canales: Record<string, number> = {};
  casosConAsig.forEach(c => { if (c.canal) canales[c.canal] = (canales[c.canal] || 0) + 1; });
  const categorias: Record<string, number> = {};
  casosConAsig.forEach(c => { if (c.cat) categorias[c.cat] = (categorias[c.cat] || 0) + 1; });

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
            <p className="text-muted-foreground mt-2 text-sm">{nowStr} · {totalCasos} casos · {rankingAgentes.length} agentes</p>
          </div>
          <div className="flex items-center gap-3 shrink-0">
            <Link href="/admin/estadisticas" className="flex items-center gap-2 px-4 py-2.5 rounded-xl border border-border bg-card text-sm font-bold hover:bg-muted transition-all group">
              Analítica Clientes <ArrowUpRight className="h-3.5 w-3.5 opacity-40 group-hover:opacity-100" />
            </Link>
            <Link href="/admin/equipo" className="flex items-center gap-2 px-4 py-2.5 rounded-xl border border-border bg-card text-sm font-bold hover:bg-muted transition-all group">
              Equipo <ArrowUpRight className="h-3.5 w-3.5 opacity-40 group-hover:opacity-100" />
            </Link>
          </div>
        </div>
      </header>

      {/* ── KPIs FILA 1: Operacionales ── */}
      <section className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
        {[
          { label: "Total Casos",      value: totalCasos.toString(),  icon: Users,        color: "text-brand-500",   bg: "bg-brand-500/10",   sub: `${totalActivos} activos ahora`              },
          { label: "Tasa Resolución",  value: `${tasaResolucion}%`,   icon: CheckCircle,  color: "text-emerald-500", bg: "bg-emerald-500/10", sub: `${totalResueltos} de ${totalCasos} resueltos` },
          { label: "Tiempo en Cola",   value: formatSLA(avgEsperaGlobal), icon: Clock,    color: "text-violet-500",  bg: "bg-violet-500/10",  sub: `Espera por agente humano` },
          { label: "SLA Promedio",     value: formatSLA(avgSlaGlobal),icon: Clock,        color: "text-sky-500",     bg: "bg-sky-500/10",     sub: `Tiempo resolviendo (agentes)`   },
          { label: "Satisfacción",     value: avgSatisfaccionGlobal !== "N/A" ? `${avgSatisfaccionGlobal}/5` : "—", icon: Star, color: "text-amber-400", bg: "bg-amber-400/10", sub: `${todasCals.length} calificaciones` },
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
        {/* Volumen 7d con tendencia */}
        <div className="relative rounded-2xl border border-border bg-card p-5 overflow-hidden ring-1 ring-border/50">
          <div className="absolute -top-8 -right-8 h-28 w-28 rounded-full bg-violet-500/10 blur-2xl" />
          <div className="relative">
            <div className="inline-flex items-center justify-center h-10 w-10 rounded-xl bg-violet-500/10 text-violet-500 mb-3">
              <Activity className="h-5 w-5" />
            </div>
            <p className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">Volumen 7 días</p>
            <div className="flex items-baseline gap-2 mt-1">
              <p className="text-4xl font-black tracking-tight tabular-nums text-violet-500">{casos7d}</p>
              <span className={`text-xs font-black flex items-center gap-0.5 ${tendencia7d > 0 ? "text-rose-400" : tendencia7d < 0 ? "text-emerald-400" : "text-muted-foreground"}`}>
                {tendencia7d > 0 ? <TrendingUp className="h-3 w-3" /> : tendencia7d < 0 ? <TrendingDown className="h-3 w-3" /> : <Minus className="h-3 w-3" />}
                {tendencia7d > 0 ? "+" : ""}{tendencia7d}%
              </span>
            </div>
            {/* Spark chart */}
            <div className="flex items-end gap-0.5 mt-3 h-8">
              {spark7d.map((v, i) => (
                <div key={i} className="flex-1 bg-violet-500/20 rounded-sm transition-all hover:bg-violet-500/50" style={{ height: `${Math.max(4, Math.round((v / sparkMax) * 100))}%` }} title={`${v} casos`} />
              ))}
            </div>
            <p className="text-[10px] text-muted-foreground mt-1">últimos 7 días vs semana anterior</p>
          </div>
        </div>

        {/* Tasa de escalado */}
        <div className="relative rounded-2xl border border-border bg-card p-5 overflow-hidden ring-1 ring-border/50">
          <div className="absolute -top-8 -right-8 h-28 w-28 rounded-full bg-rose-500/10 blur-2xl" />
          <div className="relative">
            <div className="inline-flex items-center justify-center h-10 w-10 rounded-xl bg-rose-500/10 text-rose-500 mb-3">
              <AlertTriangle className="h-5 w-5" />
            </div>
            <p className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">Tasa Escalado</p>
            <p className={`text-4xl font-black mt-1 tracking-tight tabular-nums ${tasaEscalado > 20 ? "text-rose-500" : tasaEscalado > 10 ? "text-amber-500" : "text-emerald-500"}`}>{tasaEscalado}%</p>
            <p className="text-[11px] text-muted-foreground mt-1.5">{totalEscalados} casos escalados</p>
          </div>
        </div>

        {/* Carga por agente */}
        <div className="relative rounded-2xl border border-border bg-card p-5 overflow-hidden ring-1 ring-border/50">
          <div className="absolute -top-8 -right-8 h-28 w-28 rounded-full bg-cyan-500/10 blur-2xl" />
          <div className="relative">
            <div className="inline-flex items-center justify-center h-10 w-10 rounded-xl bg-cyan-500/10 text-cyan-500 mb-3">
              <UserCheck className="h-5 w-5" />
            </div>
            <p className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">Carga Promedio</p>
            <p className="text-4xl font-black mt-1 tracking-tight tabular-nums text-cyan-500">{rankingAgentes.length > 0 ? Math.round(totalCasos / rankingAgentes.length) : 0}</p>
            <p className="text-[11px] text-muted-foreground mt-1.5">casos por agente · {rankingAgentes.length} agentes</p>
          </div>
        </div>

        {/* NPS estimado */}
        <div className="relative rounded-2xl border border-border bg-card p-5 overflow-hidden ring-1 ring-border/50">
          <div className="absolute -top-8 -right-8 h-28 w-28 rounded-full bg-amber-400/10 blur-2xl" />
          <div className="relative">
            <div className="inline-flex items-center justify-center h-10 w-10 rounded-xl bg-amber-400/10 text-amber-400 mb-3">
              <Zap className="h-5 w-5" />
            </div>
            <p className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">NPS Estimado</p>
            <p className={`text-4xl font-black mt-1 tracking-tight tabular-nums ${nps === null ? "text-muted-foreground" : nps >= 50 ? "text-emerald-500" : nps >= 0 ? "text-amber-400" : "text-rose-500"}`}>
              {nps === null ? "—" : `${nps > 0 ? "+" : ""}${nps}`}
            </p>
            <p className="text-[11px] text-muted-foreground mt-1.5">{promotores} promotores · {detractores} detractores</p>
          </div>
        </div>
      </section>

      {/* ── CUERPO ── */}
      <div className="grid gap-6 lg:grid-cols-12">

        {/* ── COLUMNA LATERAL ── */}
        <div className="lg:col-span-4 space-y-6">

          {/* Histograma SLA */}
          <div className="rounded-2xl border border-border bg-card p-6">
            <div className="flex items-center gap-2 mb-5">
              <div className="h-7 w-7 rounded-lg bg-sky-500/10 text-sky-500 grid place-items-center"><Clock className="h-3.5 w-3.5" /></div>
              <h3 className="font-black text-sm uppercase tracking-widest text-muted-foreground">Distribución SLA</h3>
            </div>
            {tiemposTodos.length > 0 ? (
              <div className="space-y-3">
                {[
                  { label: "< 1 hora", count: slaLt1h, color: "bg-emerald-500", text: "text-emerald-500" },
                  { label: "1 – 4 horas", count: sla1_4h, color: "bg-amber-500", text: "text-amber-500" },
                  { label: "> 4 horas", count: slaGt4h, color: "bg-rose-500", text: "text-rose-500" },
                ].map(row => (
                  <div key={row.label} className="space-y-1.5">
                    <div className="flex justify-between items-center">
                      <span className={`text-xs font-black ${row.text}`}>{row.label}</span>
                      <div className="flex items-center gap-2">
                        <span className="text-[10px] text-muted-foreground">{tiemposTodos.length > 0 ? Math.round((row.count / tiemposTodos.length) * 100) : 0}%</span>
                        <span className={`text-xs font-black tabular-nums ${row.text}`}>{row.count}</span>
                      </div>
                    </div>
                    <div className="h-2 w-full bg-muted rounded-full overflow-hidden">
                      <div className={`h-full ${row.color} rounded-full`} style={{ width: `${tiemposTodos.length > 0 ? (row.count / tiemposTodos.length) * 100 : 0}%` }} />
                    </div>
                  </div>
                ))}
              </div>
            ) : <p className="text-xs text-muted-foreground italic">Sin datos de SLA</p>}
          </div>

          {/* Prioridades */}
          <div className="rounded-2xl border border-border bg-card p-6">
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
          <div className="rounded-2xl border border-border bg-card p-6">
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

          {/* Temas */}
          {Object.entries(categorias).length > 0 && (
            <div className="rounded-2xl border border-border bg-card p-6">
              <div className="flex items-center gap-2 mb-5">
                <div className="h-7 w-7 rounded-lg bg-emerald-500/10 text-emerald-500 grid place-items-center"><FileText className="h-3.5 w-3.5" /></div>
                <h3 className="font-black text-sm uppercase tracking-widest text-muted-foreground">Temas Frecuentes</h3>
              </div>
              <div className="space-y-2">
                {Object.entries(categorias).sort(([,a],[,b]) => b - a).map(([cat, count]) => (
                  <div key={cat} className="flex items-center justify-between p-2.5 rounded-xl bg-muted/40 border border-border hover:border-emerald-500/30 hover:bg-emerald-500/5 transition-all group">
                    <div className="flex items-center gap-2">
                      <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
                      <span className="text-xs font-bold uppercase tracking-wide">{cat}</span>
                    </div>
                    <span className="text-xs font-black tabular-nums text-emerald-500">{count}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* ── TABLA DE DESEMPEÑO ── */}
        <div className="lg:col-span-8 rounded-2xl border border-border bg-card overflow-hidden">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 px-6 py-4 border-b border-border bg-gradient-to-r from-muted/20 to-transparent">
            <div className="flex items-center gap-3">
              <div className="h-8 w-8 rounded-lg bg-brand-500/10 text-brand-500 grid place-items-center"><BarChart3 className="h-4 w-4" /></div>
              <div>
                <h2 className="font-black text-sm">Desempeño Individual</h2>
                <p className="text-[11px] text-muted-foreground">Score compuesto: 40% resolución · 35% satisfacción · 25% SLA</p>
              </div>
            </div>
            <StatsExportButton
              data={rankingAgentes.map(a => ({
                Agente: a.nombre, Email: a.email, Score: a.score,
                Total: a.totalAtendidos, Resueltos: a.resueltos, Activos: a.activos,
                Escalados: a.escalados, Tasa_Escalado_Pct: a.tasaEsc,
                Calificacion_Avg: a.avgCalificacion, SLA_Avg_min: a.avgSLA,
                Urgentes: a.urgentes, Casos_7d: a.casos7d
              }))}
              fileName="Reporte_Desempeño_Atencion_Sekunet"
            />
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-sm min-w-[900px]">
              <thead>
                <tr className="border-b border-border bg-muted/10">
                  <th className="px-3 py-3 text-left text-[10px] font-black uppercase tracking-wider text-muted-foreground w-10">#</th>
                  <th className="px-3 py-3 text-left text-[10px] font-black uppercase tracking-wider text-muted-foreground">Agente</th>
                  <th className="px-3 py-3 text-center text-[10px] font-black uppercase tracking-wider text-muted-foreground">Score</th>
                  <th className="px-3 py-3 text-center text-[10px] font-black uppercase tracking-wider text-muted-foreground">Resueltos</th>
                  <th className="px-3 py-3 text-center text-[10px] font-black uppercase tracking-wider text-muted-foreground">Escalados</th>
                  <th className="px-3 py-3 text-center text-[10px] font-black uppercase tracking-wider text-muted-foreground">SLA</th>
                  <th className="px-3 py-3 text-center text-[10px] font-black uppercase tracking-wider text-muted-foreground whitespace-nowrap">T. Efectivo</th>
                  <th className="px-3 py-3 text-center text-[10px] font-black uppercase tracking-wider text-muted-foreground">Rating</th>
                  <th className="px-3 py-3 text-center text-[10px] font-black uppercase tracking-wider text-muted-foreground whitespace-nowrap">7 días</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border/50">
                {rankingAgentes.length === 0 ? (
                  <tr><td colSpan={9} className="py-16 text-center text-sm text-muted-foreground">Sin datos de atención registrados.</td></tr>
                ) : rankingAgentes.map((a, i) => {
                  const isTop = i === 0 && rankingAgentes.length > 1;
                  const initials = a.nombre.split(" ").filter(Boolean).map((n: string) => n[0]).join("").substring(0, 2).toUpperCase();
                  const scoreColor = a.score >= 75 ? "text-emerald-500" : a.score >= 50 ? "text-amber-400" : "text-rose-500";
                  const scoreBg = a.score >= 75 ? "bg-emerald-500/10" : a.score >= 50 ? "bg-amber-400/10" : "bg-rose-500/10";
                  return (
                    <tr key={i} className="hover:bg-muted/20 transition-colors">
                      <td className="px-3 py-3.5">
                        {isTop
                          ? <div className="h-7 w-7 rounded-full bg-gradient-to-br from-amber-400 to-amber-600 grid place-items-center shadow-lg shadow-amber-500/30"><Award className="h-3.5 w-3.5 text-white" /></div>
                          : <span className="text-sm font-black text-muted-foreground/40">#{i + 1}</span>}
                      </td>
                      <td className="px-3 py-3.5">
                        <div className="flex items-center gap-2">
                          <div className="h-8 w-8 rounded-xl bg-gradient-to-br from-brand-500 to-brand-700 text-white text-[10px] font-black grid place-items-center shrink-0">
                            {initials}
                          </div>
                          <div>
                            <p className="font-black text-sm leading-tight">{a.nombre}</p>
                            <p className="text-[10px] text-muted-foreground">{a.activos} casos activos</p>
                          </div>
                        </div>
                      </td>
                      <td className="px-3 py-3 text-center">
                        <div className={`inline-flex flex-col items-center justify-center h-11 w-11 rounded-xl ${scoreBg} mx-auto`}>
                          <span className={`text-base font-black tabular-nums ${scoreColor}`}>{a.score}</span>
                          <span className="text-[8px] font-bold text-muted-foreground uppercase">pts</span>
                        </div>
                      </td>
                      <td className="px-3 py-3 text-center">
                        <p className="font-black text-emerald-500 tabular-nums text-base">{a.resueltos}</p>
                        <p className="text-[10px] text-muted-foreground">{a.tasa}% efect.</p>
                      </td>
                      <td className="px-3 py-3 text-center">
                        <span className={`text-sm font-black tabular-nums ${a.tasaEsc > 15 ? "text-rose-500" : a.tasaEsc > 5 ? "text-amber-500" : "text-emerald-500"}`}>{a.tasaEsc}%</span>
                        <p className="text-[10px] text-muted-foreground">{a.escalados} casos</p>
                      </td>
                      <td className="px-3 py-3 text-center">
                        <div className="flex items-center justify-center gap-1">
                          <Clock className="h-3 w-3 text-sky-500" />
                          <span className="font-black tabular-nums text-sky-500 text-sm">{formatSLA(a.avgSLA)}</span>
                        </div>
                      </td>
                      <td className="px-3 py-3 text-center">
                        {(a as any).avgEfectivo > 0 ? (
                          <div className="flex items-center justify-center gap-1">
                            <UserCheck className="h-3 w-3 text-violet-500" />
                            <span className="font-black tabular-nums text-violet-500 text-sm">{formatSLA((a as any).avgEfectivo)}</span>
                          </div>
                        ) : <span className="text-muted-foreground/40 text-sm">—</span>}
                        <p className="text-[9px] text-muted-foreground">activo</p>
                      </td>
                      <td className="px-3 py-3 text-center">
                        {a.avgCalificacion !== "N/A" ? (
                          <div className="flex items-center justify-center gap-0.5">
                            <Star className="h-3 w-3 text-amber-400 fill-amber-400" />
                            <span className="font-black text-amber-400 text-sm">{a.avgCalificacion}</span>
                          </div>
                        ) : <span className="text-muted-foreground/40 text-sm">—</span>}
                        <p className="text-[9px] text-muted-foreground">{a.calificaciones.length} votos</p>
                      </td>
                      <td className="px-3 py-3 text-center">
                        <span className="text-sm font-black tabular-nums text-violet-500">{a.casos7d}</span>
                        <p className="text-[10px] text-muted-foreground">esta semana</p>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
}
