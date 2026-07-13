import { createClient } from "@/lib/supabase/server";
import Link from "next/link";
import { redirect } from "next/navigation";
import {
  Users, Package, BookOpen, MessageCircle,
  TrendingUp, Activity, Bot, Settings, ChevronRight,
  ShieldAlert, Clock, Star, CheckCircle, AlertCircle,
  Zap, BarChart3, ArrowUpRight, Circle, Brain, Shield
} from "lucide-react";

export const dynamic = "force-dynamic";

export default async function AdminDashboardPage() {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: currentAgent } = await supabase
    .from("sek_agent_config")
    .select("rol, nombre")
    .ilike("email", user.email!)
    .maybeSingle();

  const isAdmin = ["admin", "superadmin"].includes(currentAgent?.rol);
  if (currentAgent?.rol === "tecnico") redirect("/admin/equipo");
  if (!isAdmin) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] gap-4 p-8 text-center">
        <div className="h-14 w-14 rounded-2xl bg-amber-100 dark:bg-amber-900/30 text-amber-600 dark:text-amber-400 grid place-items-center">
          <ShieldAlert className="h-7 w-7" />
        </div>
        <h1 className="text-2xl font-bold">Acceso restringido</h1>
        <p className="text-muted-foreground max-w-sm">
          Este panel es exclusivo para <strong>administradores</strong> del sistema.
        </p>
        <Link href="/inbox" className="mt-2 px-4 py-2 rounded-xl bg-brand-600 text-white text-sm font-medium hover:bg-brand-700 transition-colors">
          Ir al inbox
        </Link>
      </div>
    );
  }
  const isSuperadmin = currentAgent?.rol === "superadmin";

  // ── Queries paralelas ──────────────────────────────────────────────────────
  const [
    { count: totalAgentes },
    { count: totalCasos },
    { count: casosAbiertos },
    { count: casosEscalados },
    { count: casosIa },
    { count: totalCanales },
    { count: totalDocs },
    { count: totalInventario },
    { data: casosRecientes },
    { data: allCasos },
    { data: agentes },
    { data: agentConfig },
  ] = await Promise.all([
    supabase.from("sek_agent_config").select("*", { count: "exact", head: true }),
    supabase.from("sek_cases").select("*", { count: "exact", head: true }),
    supabase.from("sek_cases").select("*", { count: "exact", head: true }).not("estado", "in", "(\"resuelto\",\"cerrado\")"),
    supabase.from("sek_cases").select("*", { count: "exact", head: true }).eq("estado", "escalado"),
    supabase.from("sek_cases").select("*", { count: "exact", head: true }).eq("estado", "ia_atendiendo"),
    supabase.from("sek_channels").select("*", { count: "exact", head: true }),
    supabase.from("sek_doc_chunks").select("*", { count: "exact", head: true }),
    supabase.from("sek_inventario").select("*", { count: "exact", head: true }),
    supabase.from("sek_cases").select("id, title, estado, canal, created_at, assigned_to").order("created_at", { ascending: false }).limit(6),
    supabase.from("sek_cases").select("id, estado, created_at, updated_at, cliente, assigned_to"),
    supabase.from("sek_agent_config").select("email, nombre, apellido, rol").neq("email", "system_prompt@sekunet.com"),
    supabase.from("sek_agent_config").select("system_prompt").eq("email", "system_prompt@sekunet.com").maybeSingle(),
  ]);

  // ── Calcular KPIs ──────────────────────────────────────────────────────────
  const totalResueltos = allCasos?.filter(c => c.estado === "resuelto" || c.estado === "cerrado").length ?? 0;
  const totalCasosN = totalCasos ?? 0;
  const tasaResolucion = totalCasosN > 0 ? Math.round((totalResueltos / totalCasosN) * 100) : 0;

  const tiempos: number[] = [];
  allCasos?.forEach(c => {
    if ((c.estado === "resuelto" || c.estado === "cerrado") && c.created_at && c.updated_at) {
      const diff = Math.round((new Date(c.updated_at).getTime() - new Date(c.created_at).getTime()) / 60000);
      if (diff > 0) tiempos.push(diff);
    }
  });
  const avgSla = tiempos.length > 0 ? Math.round(tiempos.reduce((a, b) => a + b, 0) / tiempos.length) : 0;

  // Calificaciones del CLIENTE (hechas por el agente al cerrar el caso). No es rating del operador.
  const cals = (allCasos ?? []).flatMap(c => {
    const cl = typeof c.cliente === "object" && c.cliente ? c.cliente as any : null;
    const vals: number[] = [];
    if (cl?.calificacion_cliente && !isNaN(Number(cl.calificacion_cliente))) vals.push(Number(cl.calificacion_cliente));
    if (cl?.calificacion_agente && !isNaN(Number(cl.calificacion_agente))) vals.push(Number(cl.calificacion_agente));
    return vals;
  });
  const avgSat = cals.length > 0 ? (cals.reduce((a, b) => a + b, 0) / cals.length).toFixed(1) : null;

  // Actividad últimos 7 días
  const hace7 = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
  const casosUltSemana = allCasos?.filter(c => c.created_at > hace7).length ?? 0;

  // Mapa de agentes
  const agenteMap: Record<string, string> = {};
  agentes?.forEach(a => { agenteMap[a.email] = `${a.nombre || ""} ${a.apellido || ""}`.trim() || a.email; });

  const promptLen = agentConfig?.system_prompt?.length ?? 0;

  const now = new Date().toLocaleString("es-CR", { timeZone: "America/Costa_Rica", dateStyle: "long", timeStyle: "short" });

  // ── Estado por color ───────────────────────────────────────────────────────
  function estadoColor(e: string) {
    if (e === "resuelto" || e === "cerrado") return "bg-emerald-500";
    if (e === "escalado") return "bg-amber-500";
    if (e === "ia_atendiendo") return "bg-violet-500";
    return "bg-sky-500";
  }
  function estadoLabel(e: string) {
    const map: Record<string, string> = {
      resuelto: "Resuelto", cerrado: "Cerrado", escalado: "Escalado",
      ia_atendiendo: "IA", abierto: "Abierto", pendiente: "Pendiente"
    };
    return map[e] ?? e;
  }

  return (
    <div className="p-6 lg:p-8 max-w-[1400px] mx-auto space-y-8">

      {/* ── HEADER ─────────────────────────────────────────────────────────── */}
      <header className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <Shield className="h-4 w-4 text-brand-500" />
            <p className="text-xs font-bold uppercase tracking-[0.2em] text-brand-600 dark:text-brand-400">{isSuperadmin ? "Superadmin" : "Admin"} · Panel de Control</p>
          </div>
          <h1 className="text-4xl font-black tracking-tight">Centro de Operaciones</h1>
          <p className="text-muted-foreground mt-1 text-sm">{now} · Sekunet Soporte</p>
        </div>
        <div className="flex items-center gap-2">
          <Link href="/admin/estadisticas/atencion"
            className="flex items-center gap-2 px-4 py-2 rounded-xl bg-brand-600 text-white text-sm font-semibold hover:bg-brand-700 transition-colors shadow-lg shadow-brand-600/25">
            <BarChart3 className="h-4 w-4" /> Reporte completo
          </Link>
        </div>
      </header>

      {/* ── KPIs PRINCIPALES — fila 1 ──────────────────────────────────────── */}
      <section className="grid gap-4 grid-cols-2 lg:grid-cols-4">
        {[
          {
            label: "Casos abiertos", value: (casosAbiertos ?? 0).toString(),
            sub: `${casosEscalados ?? 0} escalados`, icon: AlertCircle,
            color: "text-amber-500", ring: "ring-amber-500/20", bg: "bg-amber-500/10",
            href: "/inbox"
          },
          {
            label: "Tasa resolución", value: `${tasaResolucion}%`,
            sub: `${totalResueltos} de ${totalCasosN} casos`, icon: CheckCircle,
            color: "text-emerald-500", ring: "ring-emerald-500/20", bg: "bg-emerald-500/10",
            href: "/admin/estadisticas/atencion"
          },
          {
            label: "SLA promedio", value: avgSla > 0 ? `${avgSla} min` : "—",
            sub: "tiempo de resolución", icon: Clock,
            color: "text-sky-500", ring: "ring-sky-500/20", bg: "bg-sky-500/10",
            href: "/admin/estadisticas/atencion"
          },
          {
            label: "Calificación del cliente", value: avgSat ? `${avgSat} / 5` : "—",
            sub: `${cals.length} calificaciones por agente`, icon: Star,
            color: "text-amber-400", ring: "ring-amber-400/20", bg: "bg-amber-400/10",
            href: "/admin/estadisticas/atencion"
          },
        ].map((k) => (
          <Link key={k.label} href={k.href}
            className={`group relative rounded-2xl border border-border bg-card p-5 hover:shadow-2xl hover:-translate-y-1 transition-all ring-1 ${k.ring} overflow-hidden`}>
            <div className={`absolute -top-6 -right-6 h-24 w-24 rounded-full ${k.bg} blur-2xl`} />
            <div className="relative">
              <div className={`inline-flex items-center justify-center h-9 w-9 rounded-xl ${k.bg} ${k.color} mb-3`}>
                <k.icon className="h-4 w-4" />
              </div>
              <p className="text-[11px] font-bold uppercase tracking-widest text-muted-foreground">{k.label}</p>
              <p className={`text-3xl font-black mt-1 tracking-tight ${k.color}`}>{k.value}</p>
              <p className="text-xs text-muted-foreground mt-1">{k.sub}</p>
              <ArrowUpRight className="absolute top-0 right-0 h-3.5 w-3.5 text-muted-foreground/40 group-hover:text-muted-foreground transition-colors" />
            </div>
          </Link>
        ))}
      </section>

      {/* ── FILA 2: Volumen + Actividad reciente ───────────────────────────── */}
      <div className="grid gap-6 lg:grid-cols-3">

        {/* Volumen del sistema */}
        <div className="rounded-2xl border border-border bg-card p-6 space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="font-bold text-sm uppercase tracking-wider text-muted-foreground">Volumen del sistema</h2>
            <Activity className="h-4 w-4 text-muted-foreground" />
          </div>
          {[
            { label: "Total casos", value: totalCasosN, max: Math.max(totalCasosN, 1), color: "bg-brand-500" },
            { label: "Casos últimos 7 días", value: casosUltSemana, max: Math.max(casosUltSemana, 1), color: "bg-violet-500" },
            { label: "Equipos en inventario", value: totalInventario ?? 0, max: Math.max(totalInventario ?? 0, 1), color: "bg-teal-500" },
            { label: "Manuales cargados", value: totalDocs ?? 0, max: Math.max(totalDocs ?? 0, 1), color: "bg-sky-500" },
          ].map(item => (
            <div key={item.label} className="space-y-1.5">
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">{item.label}</span>
                <span className="font-bold tabular-nums">{item.value.toLocaleString()}</span>
              </div>
              <div className="h-1.5 w-full bg-muted rounded-full overflow-hidden">
                <div className={`h-full ${item.color} rounded-full transition-all`}
                  style={{ width: `${Math.min((item.value / item.max) * 100, 100)}%` }} />
              </div>
            </div>
          ))}

          <div className="pt-2 border-t border-border grid grid-cols-2 gap-3">
            {[
              { label: "Agentes", value: totalAgentes ?? 0, icon: Users, href: "/admin/equipo" },
              { label: "Canales", value: totalCanales ?? 0, icon: MessageCircle, href: "/admin/canales" },
            ].map(s => (
              <Link key={s.label} href={s.href}
                className="flex items-center gap-2 p-3 rounded-xl bg-muted/50 hover:bg-muted transition-colors group">
                <s.icon className="h-4 w-4 text-muted-foreground group-hover:text-brand-500 transition-colors" />
                <div>
                  <p className="text-xs text-muted-foreground">{s.label}</p>
                  <p className="text-lg font-bold">{s.value}</p>
                </div>
              </Link>
            ))}
          </div>
        </div>

        {/* Actividad reciente */}
        <div className="lg:col-span-2 rounded-2xl border border-border bg-card overflow-hidden">
          <div className="flex items-center justify-between px-6 py-4 border-b border-border">
            <div>
              <h2 className="font-bold text-sm uppercase tracking-wider text-muted-foreground">Actividad reciente</h2>
              <p className="text-xs text-muted-foreground mt-0.5">{casosUltSemana} casos en los últimos 7 días</p>
            </div>
            <Link href="/inbox" className="text-xs text-brand-600 hover:text-brand-700 font-semibold flex items-center gap-1">
              Ver todos <ChevronRight className="h-3 w-3" />
            </Link>
          </div>
          <div className="divide-y divide-border">
            {casosRecientes && casosRecientes.length > 0 ? casosRecientes.map((c) => (
              <div key={c.id} className="flex items-center gap-3 px-6 py-3 hover:bg-muted/30 transition-colors">
                <Circle className={`h-2 w-2 shrink-0 ${estadoColor(c.estado)} rounded-full`} />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium truncate">{c.title || "Caso sin título"}</p>
                  <p className="text-xs text-muted-foreground">
                    {c.canal && <span className="uppercase">{c.canal} · </span>}
                    {c.assigned_to ? agenteMap[c.assigned_to] || c.assigned_to : "Sin asignar"}
                  </p>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
                    c.estado === "resuelto" || c.estado === "cerrado" ? "bg-emerald-500/10 text-emerald-600" :
                    c.estado === "escalado" ? "bg-amber-500/10 text-amber-600" :
                    c.estado === "ia_atendiendo" ? "bg-violet-500/10 text-violet-600" :
                    "bg-sky-500/10 text-sky-600"
                  }`}>{estadoLabel(c.estado)}</span>
                  <span className="text-[10px] text-muted-foreground tabular-nums">
                    {new Date(c.created_at).toLocaleDateString("es-CR", { day: "2-digit", month: "short" })}
                  </span>
                </div>
              </div>
            )) : (
              <div className="p-12 text-center text-sm text-muted-foreground">Sin actividad registrada</div>
            )}
          </div>
        </div>
      </div>

      {/* ── FILA 3: Estado IA + Métricas rápidas de agentes ──────────────── */}
      <div className="grid gap-6 lg:grid-cols-3">

        {/* Estado del Asistente Virtual */}
        <div className="rounded-2xl border border-border bg-card p-6 relative overflow-hidden">
          <div className="absolute -bottom-8 -right-8 h-32 w-32 rounded-full bg-violet-500/5 blur-3xl" />
          <div className="relative">
            <div className="flex items-center justify-between mb-4">
              <h2 className="font-bold text-sm uppercase tracking-wider text-muted-foreground">Estado Asistente Virtual</h2>
              <span className="flex items-center gap-1.5 text-[10px] font-bold text-emerald-600 bg-emerald-500/10 px-2 py-1 rounded-full">
                <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 animate-pulse" /> EN LÍNEA
              </span>
            </div>
            <div className="flex items-center gap-3 mb-6">
              <div className="h-12 w-12 rounded-2xl bg-violet-500/10 text-violet-500 grid place-items-center">
                <Brain className="h-6 w-6" />
              </div>
              <div>
                <p className="font-bold">Gemini 3.1 Flash-Lite</p>
                <p className="text-xs text-muted-foreground">Google AI · 1,500 RPD</p>
              </div>
            </div>
            <div className="space-y-3">
              {[
                { label: "Casos activos IA", value: (casosIa ?? 0).toString(), color: "text-violet-500" },
                { label: "Escalados a N2", value: (casosEscalados ?? 0).toString(), color: "text-amber-500" },
                { label: "Prompt (chars)", value: promptLen.toLocaleString(), color: "text-brand-500" },
              ].map(item => (
                <div key={item.label} className="flex items-center justify-between py-2 border-b border-border last:border-0">
                  <span className="text-xs text-muted-foreground">{item.label}</span>
                  <span className={`text-sm font-bold tabular-nums ${item.color}`}>{item.value}</span>
                </div>
              ))}
            </div>
            <Link href="/admin/agente-ia"
              className="mt-4 w-full flex items-center justify-center gap-2 py-2.5 rounded-xl bg-violet-500/10 text-violet-600 text-sm font-semibold hover:bg-violet-500/20 transition-colors">
              <Zap className="h-4 w-4" /> Gestionar Asistente Virtual
            </Link>
          </div>
        </div>

        {/* Ranking de agentes */}
        <div className="lg:col-span-2 rounded-2xl border border-border bg-card overflow-hidden">
          <div className="flex items-center justify-between px-6 py-4 border-b border-border">
            <h2 className="font-bold text-sm uppercase tracking-wider text-muted-foreground">Desempeño de agentes</h2>
            <Link href="/admin/estadisticas/atencion" className="text-xs text-brand-600 hover:text-brand-700 font-semibold flex items-center gap-1">
              Detalle <ChevronRight className="h-3 w-3" />
            </Link>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border bg-muted/30">
                  <th className="px-6 py-3 text-left text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Agente</th>
                  <th className="px-4 py-3 text-center text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Rol</th>
                  <th className="px-4 py-3 text-center text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Casos</th>
                  <th className="px-4 py-3 text-center text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Resueltos</th>
                  <th className="px-4 py-3 text-center text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Cal. cliente</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {(() => {
                  const perAgent: Record<string, { nombre: string; rol: string; total: number; resueltos: number; cals: number[] }> = {};
                  agentes?.forEach(a => {
                    perAgent[a.email] = { nombre: agenteMap[a.email] || a.email, rol: a.rol, total: 0, resueltos: 0, cals: [] };
                  });
                  allCasos?.forEach(c => {
                    if (!c.assigned_to || !perAgent[c.assigned_to]) return;
                    perAgent[c.assigned_to].total++;
                    if (c.estado === "resuelto" || c.estado === "cerrado") perAgent[c.assigned_to].resueltos++;
                    const cl = typeof c.cliente === "object" && c.cliente ? c.cliente as any : null;
                    if (cl?.calificacion_cliente) perAgent[c.assigned_to].cals.push(Number(cl.calificacion_cliente));
                    else if (cl?.calificacion_agente) perAgent[c.assigned_to].cals.push(Number(cl.calificacion_agente));
                  });
                  const rows = Object.values(perAgent).sort((a, b) => b.resueltos - a.resueltos);
                  if (rows.length === 0) return (
                    <tr><td colSpan={5} className="py-10 text-center text-sm text-muted-foreground">Sin datos de agentes</td></tr>
                  );
                  return rows.map((a, i) => {
                    const avgC = a.cals.length > 0 ? (a.cals.reduce((x, y) => x + y, 0) / a.cals.length).toFixed(1) : "—";
                    const tasa = a.total > 0 ? Math.round((a.resueltos / a.total) * 100) : 0;
                    return (
                      <tr key={i} className="hover:bg-muted/30 transition-colors">
                        <td className="px-6 py-3">
                          <div className="flex items-center gap-2.5">
                            <div className="h-8 w-8 rounded-full bg-gradient-to-br from-brand-500 to-brand-700 text-white text-xs font-bold grid place-items-center shrink-0">
                              {a.nombre.charAt(0).toUpperCase()}
                            </div>
                            <div>
                              <p className="font-semibold text-sm leading-tight">{a.nombre}</p>
                            </div>
                          </div>
                        </td>
                        <td className="px-4 py-3 text-center">
                          <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
                            a.rol === "superadmin" ? "bg-brand-500/10 text-brand-600" :
                            a.rol === "admin" ? "bg-violet-500/10 text-violet-600" :
                            "bg-muted text-muted-foreground"
                          }`}>{a.rol}</span>
                        </td>
                        <td className="px-4 py-3 text-center font-bold tabular-nums">{a.total}</td>
                        <td className="px-4 py-3 text-center">
                          <div className="flex flex-col items-center gap-1">
                            <span className="font-bold text-emerald-600 tabular-nums">{a.resueltos}</span>
                            <div className="h-1 w-12 bg-muted rounded-full overflow-hidden">
                              <div className="h-full bg-emerald-500 rounded-full" style={{ width: `${tasa}%` }} />
                            </div>
                          </div>
                        </td>
                        <td className="px-4 py-3 text-center">
                          <div className="flex items-center justify-center gap-1">
                            {avgC !== "—" && <Star className="h-3 w-3 text-amber-400 fill-amber-400" />}
                            <span className="font-bold text-sm">{avgC}</span>
                          </div>
                        </td>
                      </tr>
                    );
                  });
                })()}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {/* ── ACCESOS RÁPIDOS ─────────────────────────────────────────────────── */}
      <section>
        <h2 className="text-xs font-bold uppercase tracking-widest text-muted-foreground mb-4">Accesos rápidos</h2>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {[
            { title: "Equipo", desc: "Agentes y permisos", href: "/admin/equipo", icon: Users, color: "text-brand-500", bg: "bg-brand-500/10" },
            { title: "Inventario", desc: "Equipos y marcas", href: "/admin/inventario", icon: Package, color: "text-teal-500", bg: "bg-teal-500/10" },
            { title: "Manuales", desc: "Base RAG del agente IA", href: "/admin/manuales", icon: BookOpen, color: "text-sky-500", bg: "bg-sky-500/10" },
            { title: "Canales", desc: "WhatsApp, Messenger", href: "/admin/canales", icon: MessageCircle, color: "text-rose-500", bg: "bg-rose-500/10" },
            { title: "Estadísticas", desc: "Analítica detallada", href: "/admin/estadisticas", icon: TrendingUp, color: "text-emerald-500", bg: "bg-emerald-500/10" },
            { title: "Agente IA", desc: "Entrenamiento del Asistente Virtual", href: "/admin/agente-ia", icon: Bot, color: "text-violet-500", bg: "bg-violet-500/10" },
            { title: "Configuración", desc: "Ajustes del sistema", href: "/admin/settings", icon: Settings, color: "text-zinc-500", bg: "bg-zinc-500/10" },
          ].map(q => (
            <Link key={q.title} href={q.href}
              className="group flex items-center gap-3 rounded-xl border border-border bg-card p-4 hover:border-brand-300 dark:hover:border-brand-800 hover:shadow-lg hover:-translate-y-0.5 transition-all">
              <div className={`h-9 w-9 rounded-xl ${q.bg} ${q.color} grid place-items-center shrink-0`}>
                <q.icon className="h-4 w-4" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="font-semibold text-sm">{q.title}</p>
                <p className="text-xs text-muted-foreground truncate">{q.desc}</p>
              </div>
              <ChevronRight className="h-3.5 w-3.5 text-muted-foreground/40 group-hover:text-muted-foreground group-hover:translate-x-0.5 transition-all" />
            </Link>
          ))}
        </div>
      </section>

    </div>
  );
}
