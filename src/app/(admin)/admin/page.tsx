import { createClient } from "@/lib/supabase/server";
import Link from "next/link";
import { redirect } from "next/navigation";
import {
  Users, Package, BookOpen, MessageCircle,
  TrendingUp, Bot, Settings, ChevronRight,
  ShieldAlert, BarChart3, Shield
} from "lucide-react";
import { CloseStaleCases } from "@/components/admin/close-stale-cases";
import { LiveDashboardStats } from "@/components/admin/live-dashboard-stats";

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
    supabase.from("sek_cases").select("*", { count: "exact", head: true }).in("estado", ["ia_atendiendo", "abierto", "escalado", "pendiente"]),
    supabase.from("sek_cases").select("*", { count: "exact", head: true }).eq("estado", "escalado"),
    supabase.from("sek_cases").select("*", { count: "exact", head: true }).eq("estado", "ia_atendiendo"),
    supabase.from("sek_channels").select("*", { count: "exact", head: true }),
    supabase.from("sek_doc_chunks").select("*", { count: "exact", head: true }),
    supabase.from("sek_inventario").select("*", { count: "exact", head: true }),
    supabase.from("sek_cases").select("id, title, estado, canal, created_at, assigned_to").order("created_at", { ascending: false }).limit(6),
    supabase.from("sek_cases").select("id, estado, created_at, updated_at, closed_at, cliente, assigned_to"),
    supabase.from("sek_agent_config").select("email, nombre, apellido, rol").neq("email", "system_prompt@sekunet.com"),
    supabase.from("sek_agent_config").select("system_prompt").eq("email", "system_prompt@sekunet.com").maybeSingle(),
  ]);

  // ── Calcular KPIs ──────────────────────────────────────────────────────────
  const totalResueltos = allCasos?.filter(c => c.estado === "resuelto" || c.estado === "cerrado" || (c as any).closed_at).length ?? 0;
  const totalCasosN = totalCasos ?? 0;
  const tasaResolucion = totalCasosN > 0 ? Math.round((totalResueltos / totalCasosN) * 100) : 0;

  const tiempos: number[] = [];
  allCasos?.forEach((c: any) => {
    const closedAt = c.closed_at || c.updated_at;
    if ((c.estado === "resuelto" || c.estado === "cerrado") && c.created_at && closedAt) {
      const diff = Math.round((new Date(closedAt).getTime() - new Date(c.created_at).getTime()) / 60000);
      if (diff > 0 && diff < 10080) tiempos.push(diff); // ignorar outliers > 7 días
    }
  });
  const avgSla = tiempos.length > 0 ? Math.round(tiempos.reduce((a, b) => a + b, 0) / tiempos.length) : 0;

  // Calificaciones del CLIENTE: calificacion_cliente que el cliente envía desde el widget al cerrar el chat.
  const cals = (allCasos ?? []).flatMap(c => {
    const cl = typeof c.cliente === "object" && c.cliente ? c.cliente as any : null;
    const vals: number[] = [];
    if (cl?.calificacion_cliente && !isNaN(Number(cl.calificacion_cliente))) vals.push(Number(cl.calificacion_cliente));
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

      <LiveDashboardStats initial={{
        casosAbiertos: casosAbiertos ?? 0,
        casosEscalados: casosEscalados ?? 0,
        casosIa: casosIa ?? 0,
        totalCasos: totalCasosN,
        casosRecientes: (casosRecientes as any[]) ?? [],
        totalResueltos,
        tasaResolucion,
        avgSla,
        avgSat: avgSat as string | null,
        calsCount: cals.length,
        casosUltSemana,
        totalAgentes: totalAgentes ?? 0,
        totalInventario: totalInventario ?? 0,
        totalDocs: totalDocs ?? 0,
        totalCanales: totalCanales ?? 0,
        promptLen,
        agentes: agentes ?? [],
        allCasos: allCasos ?? [],
      }} />

      {/* ── FILA 2.5: Cerrar casos abiertos prolongados ──────────────── */}
      <div className="grid gap-6 lg:grid-cols-3">
        <div className="lg:col-span-1">
          <CloseStaleCases hoursThreshold={0.5} />
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
