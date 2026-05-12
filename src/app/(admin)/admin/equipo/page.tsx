import { createClient } from "@/lib/supabase/server";
import Link from "next/link";
import {
  Users, Shield, Activity, UserCheck,
  BarChart3, Brain, Zap, ArrowUpRight, Lock, Wrench, Crown
} from "lucide-react";
import { TeamPerformance } from "@/components/admin/team-performance";

export const dynamic = "force-dynamic";

export default async function AdminEquipoPage() {
  const supabase = createClient();

  const { data: { user } } = await supabase.auth.getUser();
  const { data: currentAgent } = await supabase
    .from("sek_agent_config")
    .select("rol")
    .ilike("email", user?.email || "")
    .single();

  const isSuperadmin = currentAgent?.rol === "superadmin";

  const { data: agents } = await supabase
    .from("sek_agent_config")
    .select("*")
    .order("created_at", { ascending: false });

  const sekaAgent = agents?.find(a => a.email === "system_prompt@sekunet.com");
  const humanAgents = agents?.filter(a => a.email !== "system_prompt@sekunet.com") || [];

  // ── Fetch performance data ──
  const { data: casos } = await supabase
    .from("sek_cases")
    .select("id, assigned_to, created_at, updated_at, estado, calificacion, canal")
    .not("assigned_to", "is", null);

  const now = new Date();
  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate()).toISOString();
  const weekStart = new Date(now.getFullYear(), now.getMonth(), now.getDate() - now.getDay()).toISOString();

  // Build per-agent stats
  const statsMap: Record<string, {
    totalAtendidos: number;
    resueltos: number;
    calificaciones: number[];
    tiempos: number[];
    casosHoy: number;
    casosEstaSemana: number;
    resueltosRecientes: number;
    totalRecientes: number;
  }> = {};

  (casos || []).forEach(c => {
    const email = c.assigned_to;
    if (!email) return;
    if (!statsMap[email]) {
      statsMap[email] = { totalAtendidos: 0, resueltos: 0, calificaciones: [], tiempos: [], casosHoy: 0, casosEstaSemana: 0, resueltosRecientes: 0, totalRecientes: 0 };
    }
    const s = statsMap[email];
    s.totalAtendidos++;

    if (c.estado === "resuelto" || c.estado === "cerrado") {
      s.resueltos++;
      if (c.created_at && c.updated_at) {
        const diff = Math.round((new Date(c.updated_at).getTime() - new Date(c.created_at).getTime()) / (1000 * 60));
        if (diff > 0) s.tiempos.push(diff);
      }
    }
    if (c.calificacion) s.calificaciones.push(c.calificacion);
    if (c.created_at >= todayStart) s.casosHoy++;
    if (c.created_at >= weekStart) {
      s.casosEstaSemana++;
      s.totalRecientes++;
      if (c.estado === "resuelto" || c.estado === "cerrado") s.resueltosRecientes++;
    }
  });

  // Merge agent data with stats
  const agentsWithPerformance = humanAgents.map(a => {
    const s = statsMap[a.email] || { totalAtendidos: 0, resueltos: 0, calificaciones: [], tiempos: [], casosHoy: 0, casosEstaSemana: 0, resueltosRecientes: 0, totalRecientes: 0 };
    const avgCal = s.calificaciones.length > 0
      ? (s.calificaciones.reduce((x, y) => x + y, 0) / s.calificaciones.length).toFixed(1)
      : "N/A";
    const avgSLA = s.tiempos.length > 0
      ? Math.round(s.tiempos.reduce((x, y) => x + y, 0) / s.tiempos.length)
      : 0;
    const tasa = s.totalAtendidos > 0 ? Math.round((s.resueltos / s.totalAtendidos) * 100) : 0;
    const tasaReciente = s.totalRecientes > 0 ? Math.round((s.resueltosRecientes / s.totalRecientes) * 100) : 0;
    const tendencia: "up" | "down" | "stable" = tasaReciente > tasa ? "up" : tasaReciente < tasa ? "down" : "stable";

    return {
      email: a.email,
      nombre: a.nombre,
      apellido: a.apellido,
      rol: a.rol,
      telefono: a.telefono || null,
      last_login: a.last_login || null,
      totalAtendidos: s.totalAtendidos,
      resueltos: s.resueltos,
      tasaResolucion: tasa,
      avgSLA,
      avgCalificacion: avgCal,
      calificacionesCount: s.calificaciones.length,
      casosHoy: s.casosHoy,
      casosEstaSemana: s.casosEstaSemana,
      tendencia,
    };
  });

  // Global stats
  const allCals = Object.values(statsMap).flatMap(s => s.calificaciones);
  const allTiempos = Object.values(statsMap).flatMap(s => s.tiempos);
  const globalStats = {
    totalCasos: casos?.length || 0,
    totalResueltos: (casos || []).filter(c => c.estado === "resuelto" || c.estado === "cerrado").length,
    tasaResolucion: casos && casos.length > 0
      ? Math.round(((casos.filter(c => c.estado === "resuelto" || c.estado === "cerrado").length) / casos.length) * 100)
      : 0,
    avgSLA: allTiempos.length > 0 ? Math.round(allTiempos.reduce((a, b) => a + b, 0) / allTiempos.length) : 0,
    avgSatisfaccion: allCals.length > 0
      ? (allCals.reduce((a, b) => a + b, 0) / allCals.length).toFixed(1)
      : "N/A",
    casosHoy: (casos || []).filter(c => c.created_at >= todayStart).length,
    casosEstaSemana: (casos || []).filter(c => c.created_at >= weekStart).length,
    cargaPromedio: humanAgents.length > 0 ? Math.round((casos?.length || 0) / humanAgents.length) : 0,
  };

  const totalAgents     = humanAgents.length;
  const superadmins     = humanAgents.filter(a => a.rol === "superadmin").length;
  const admins          = humanAgents.filter(a => a.rol === "admin").length;
  const soporteAvanzado = humanAgents.filter(a => a.rol === "tecnico").length;

  const nowStr = new Date().toLocaleString("es-CR", { timeZone: "America/Costa_Rica", dateStyle: "long", timeStyle: "short" });

  return (
    <div className="max-w-[1400px] mx-auto p-6 lg:p-8 space-y-8">

      {/* ── HEADER ──────────────────────────────────────────────────────── */}
      <header className="relative">
        <div className="absolute -top-16 -left-16 w-72 h-72 bg-brand-500/5 rounded-full blur-3xl pointer-events-none" />
        <div className="absolute -top-8 right-0 w-48 h-48 bg-violet-500/5 rounded-full blur-3xl pointer-events-none" />
        <div className="relative flex flex-col sm:flex-row sm:items-end sm:justify-between gap-4">
          <div>
            <div className="flex items-center gap-2 mb-2">
              <div className="h-6 w-6 rounded-lg bg-brand-500/10 text-brand-500 grid place-items-center">
                <Crown className="h-3.5 w-3.5" />
              </div>
              <p className="text-[10px] font-black uppercase tracking-[0.25em] text-brand-600 dark:text-brand-400">Centro de Operaciones</p>
            </div>
            <h1 className="text-4xl lg:text-5xl font-black tracking-tight">Equipo & Rendimiento</h1>
            <p className="text-muted-foreground mt-2 text-sm">{nowStr} · {totalAgents} agentes activos · {globalStats.totalCasos} casos gestionados</p>
          </div>
          <Link href="/admin/estadisticas/atencion"
            className="flex items-center gap-2 px-5 py-3 bg-brand-600 hover:bg-brand-700 text-white rounded-xl text-sm font-bold transition-all shadow-lg shadow-brand-600/25 shrink-0 group">
            <BarChart3 className="h-4 w-4" /> Estadísticas Detalladas
            <ArrowUpRight className="h-3.5 w-3.5 opacity-60 group-hover:opacity-100 transition-opacity" />
          </Link>
        </div>
      </header>

      {/* ── TEAM KPIs (roles breakdown) ────────────────────────────────── */}
      <section className="grid gap-3 grid-cols-2 lg:grid-cols-4">
        {[
          { label: "Total Agentes",   value: totalAgents,     icon: Users,      color: "text-brand-500",   ring: "ring-brand-500/20",   bg: "bg-brand-500/10",   gradient: "from-brand-500/10 to-transparent" },
          { label: "Superadmins",     value: superadmins,     icon: Lock,       color: "text-rose-500",    ring: "ring-rose-500/20",    bg: "bg-rose-500/10",    gradient: "from-rose-500/10 to-transparent"  },
          { label: "Admins",          value: admins,           icon: UserCheck,  color: "text-amber-500",   ring: "ring-amber-500/20",   bg: "bg-amber-500/10",   gradient: "from-amber-500/10 to-transparent" },
          { label: "Soporte Avanzado",value: soporteAvanzado, icon: Wrench,     color: "text-emerald-500", ring: "ring-emerald-500/20", bg: "bg-emerald-500/10", gradient: "from-emerald-500/10 to-transparent"},
        ].map(k => (
          <div key={k.label} className={`relative rounded-2xl border border-border bg-gradient-to-br ${k.gradient} p-4 ring-1 ${k.ring} overflow-hidden hover:shadow-xl hover:-translate-y-0.5 transition-all`}>
            <div className="flex items-center gap-3">
              <div className={`h-10 w-10 rounded-xl ${k.bg} ${k.color} grid place-items-center shrink-0`}>
                <k.icon className="h-4.5 w-4.5" />
              </div>
              <div>
                <p className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">{k.label}</p>
                <p className={`text-3xl font-black tracking-tight tabular-nums ${k.color}`}>{k.value}</p>
              </div>
            </div>
          </div>
        ))}
      </section>

      {/* ── SEKA ────────────────────────────────────────────────────────── */}
      {sekaAgent && (
        <section className="relative rounded-2xl border border-violet-500/30 bg-card overflow-hidden">
          <div className="absolute inset-0 bg-gradient-to-br from-violet-500/5 via-transparent to-transparent pointer-events-none" />
          <div className="absolute -top-12 -right-12 w-64 h-64 bg-violet-500/5 rounded-full blur-3xl pointer-events-none" />
          <div className="relative p-6 flex flex-col sm:flex-row sm:items-center gap-6">
            <div className="relative shrink-0">
              <div className="h-16 w-16 rounded-2xl bg-gradient-to-br from-violet-500 to-violet-700 text-white grid place-items-center shadow-xl shadow-violet-500/30">
                <Brain className="h-8 w-8" />
              </div>
              <span className="absolute -bottom-1 -right-1 flex h-4 w-4 items-center justify-center rounded-full bg-emerald-500 ring-2 ring-card">
                <span className="h-1.5 w-1.5 rounded-full bg-white animate-pulse" />
              </span>
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex flex-wrap items-center gap-2 mb-1">
                <h2 className="text-xl font-black">SEKA — Agente IA</h2>
                <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-violet-500/10 text-violet-500 border border-violet-500/20">Sistema</span>
                <span className="text-[10px] font-bold text-emerald-600 bg-emerald-500/10 px-2 py-0.5 rounded-full flex items-center gap-1">
                  <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 animate-pulse" /> EN LÍNEA
                </span>
              </div>
              <p className="text-sm text-muted-foreground mb-3">{sekaAgent.email}</p>
              <div className="flex flex-wrap gap-2 mb-3">
                {["Gemini 3.1 Flash-Lite", "Gemini 3.1 Vision", "RAG Manuales", "Búsqueda Web"].map(tag => (
                  <span key={tag} className="text-[11px] font-semibold px-2.5 py-1 rounded-lg bg-muted/60 border border-border text-muted-foreground">
                    {tag}
                  </span>
                ))}
              </div>
              {sekaAgent.system_prompt && (
                <div className="p-3 rounded-xl bg-zinc-950/60 border border-zinc-800/80 text-zinc-400 text-[11px] font-mono line-clamp-2 leading-relaxed">
                  {sekaAgent.system_prompt.substring(0, 200)}…
                </div>
              )}
            </div>
            <Link href="/admin/agente-ia"
              className="shrink-0 flex items-center gap-2 px-5 py-3 rounded-xl bg-violet-500/10 text-violet-500 text-sm font-bold hover:bg-violet-500/20 transition-colors border border-violet-500/20 shadow-lg shadow-violet-500/10">
              <Zap className="h-4 w-4" /> Gestionar SEKA
              <ArrowUpRight className="h-3.5 w-3.5 opacity-60" />
            </Link>
          </div>
        </section>
      )}

      {/* ── PERFORMANCE DASHBOARD ──────────────────────────────────────── */}
      <TeamPerformance
        agents={agentsWithPerformance}
        isSuperadmin={isSuperadmin}
        globalStats={globalStats}
      />

      {/* ── JERARQUÍA DE ROLES ──────────────────────────────────────────── */}
      <section className="rounded-2xl border border-border bg-card p-6">
        <div className="flex items-center gap-2 mb-6">
          <Shield className="h-4 w-4 text-muted-foreground" />
          <h2 className="font-bold text-sm uppercase tracking-widest text-muted-foreground">Jerarquía de Roles</h2>
        </div>
        <div className="grid gap-4 sm:grid-cols-3">
          {[
            { role: "Superadmin",       icon: Lock,       color: "text-rose-500",    bg: "bg-rose-500/10",    border: "border-rose-500/20",    ring: "ring-rose-500/10",    desc: "Acceso total. Centro de Operaciones, entrenamiento IA, configuración global y gestión de agentes." },
            { role: "Admin",            icon: UserCheck,  color: "text-amber-500",   bg: "bg-amber-500/10",   border: "border-amber-500/20",   ring: "ring-amber-500/10",   desc: "Gestión de equipo, inventario y manuales. Acceso completo al panel administrativo." },
            { role: "Soporte Avanzado", icon: Activity,   color: "text-emerald-500", bg: "bg-emerald-500/10", border: "border-emerald-500/20", ring: "ring-emerald-500/10", desc: "Técnicos N2. Acceso al inbox para atender casos escalados por la IA." },
          ].map(r => (
            <div key={r.role} className={`p-5 rounded-2xl border ${r.border} ring-1 ${r.ring} bg-card hover:-translate-y-0.5 hover:shadow-lg transition-all`}>
              <div className={`inline-flex items-center justify-center h-10 w-10 rounded-xl ${r.bg} ${r.color} mb-4`}>
                <r.icon className="h-5 w-5" />
              </div>
              <p className={`font-black text-base ${r.color}`}>{r.role}</p>
              <p className="text-xs text-muted-foreground mt-2 leading-relaxed">{r.desc}</p>
            </div>
          ))}
        </div>
      </section>

    </div>
  );
}
