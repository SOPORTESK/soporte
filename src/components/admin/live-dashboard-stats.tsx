"use client";

import * as React from "react";
import { createClient } from "@/lib/supabase/client";
import {
  AlertCircle, CheckCircle, Clock, Star, ArrowUpRight,
  Circle, Activity, Brain, Zap, ChevronRight,
} from "lucide-react";
import Link from "next/link";

type RecentCase = {
  id: string;
  title: string | null;
  estado: string;
  canal: string | null;
  created_at: string;
  assigned_to: string | null;
};

interface LiveStats {
  casosAbiertos: number;
  casosEscalados: number;
  casosIa: number;
  totalCasos: number;
  casosRecientes: RecentCase[];
}

interface InitialData extends LiveStats {
  totalResueltos: number;
  tasaResolucion: number;
  avgSla: number;
  avgSat: string | null;
  calsCount: number;
  casosUltSemana: number;
  totalAgentes: number;
  totalInventario: number;
  totalDocs: number;
  totalCanales: number;
  promptLen: number;
  agentes: { email: string; nombre: string; apellido: string | null; rol: string }[];
  allCasos: any[];
}

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

export function LiveDashboardStats({ initial }: { initial: InitialData }) {
  const supabase = React.useMemo(() => createClient(), []);
  const [stats, setStats] = React.useState<LiveStats>({
    casosAbiertos: initial.casosAbiertos,
    casosEscalados: initial.casosEscalados,
    casosIa: initial.casosIa,
    totalCasos: initial.totalCasos,
    casosRecientes: initial.casosRecientes,
  });
  const [lastUpdate, setLastUpdate] = React.useState<Date | null>(null);
  const [mounted, setMounted] = React.useState(false);
  const mountedRef = React.useRef(true);

  async function fetchStats() {
    try {
      const [
        { count: casosAbiertos },
        { count: casosEscalados },
        { count: casosIa },
        { count: totalCasos },
        { data: casosRecientes },
      ] = await Promise.all([
        supabase.from("sek_cases").select("*", { count: "exact", head: true }).in("estado", ["ia_atendiendo", "abierto", "escalado", "pendiente"]),
        supabase.from("sek_cases").select("*", { count: "exact", head: true }).eq("estado", "escalado"),
        supabase.from("sek_cases").select("*", { count: "exact", head: true }).eq("estado", "ia_atendiendo"),
        supabase.from("sek_cases").select("*", { count: "exact", head: true }),
        supabase.from("sek_cases").select("id, title, estado, canal, created_at, assigned_to").order("created_at", { ascending: false }).limit(6),
      ]);

      if (!mountedRef.current) return;

      setStats({
        casosAbiertos: casosAbiertos ?? 0,
        casosEscalados: casosEscalados ?? 0,
        casosIa: casosIa ?? 0,
        totalCasos: totalCasos ?? 0,
        casosRecientes: (casosRecientes as RecentCase[]) ?? [],
      });
      setLastUpdate(new Date());
    } catch (e) {
      // Silencioso — no romper el dashboard por errores de red
    }
  }

  React.useEffect(() => {
    mountedRef.current = true;
    setMounted(true);
    setLastUpdate(new Date());

    // Polling cada 15 segundos
    const interval = setInterval(fetchStats, 15000);

    // Realtime: suscribirse a cambios en sek_cases
    const channel = supabase
      .channel("dashboard-stats")
      .on("postgres_changes", { event: "*", schema: "public", table: "sek_cases" }, () => {
        fetchStats();
      })
      .subscribe();

    return () => {
      mountedRef.current = false;
      clearInterval(interval);
      supabase.removeChannel(channel);
    };
  }, []); // eslint-disable-line

  const agenteMap: Record<string, string> = {};
  initial.agentes?.forEach(a => { agenteMap[a.email] = `${a.nombre || ""} ${a.apellido || ""}`.trim() || a.email; });

  const kpis = [
    {
      label: "Casos abiertos", value: stats.casosAbiertos.toString(),
      sub: `${stats.casosEscalados} escalados`, icon: AlertCircle,
      color: "text-amber-500", ring: "ring-amber-500/20", bg: "bg-amber-500/10",
      href: "/inbox"
    },
    {
      label: "Tasa resolución", value: `${initial.tasaResolucion}%`,
      sub: `${initial.totalResueltos} de ${stats.totalCasos} casos`, icon: CheckCircle,
      color: "text-emerald-500", ring: "ring-emerald-500/20", bg: "bg-emerald-500/10",
      href: "/admin/estadisticas/atencion"
    },
    {
      label: "SLA promedio", value: initial.avgSla > 0 ? `${initial.avgSla} min` : "—",
      sub: "tiempo de resolución", icon: Clock,
      color: "text-sky-500", ring: "ring-sky-500/20", bg: "bg-sky-500/10",
      href: "/admin/estadisticas/atencion"
    },
    {
      label: "Satisfacción", value: initial.avgSat ? `${initial.avgSat} / 5` : "—",
      sub: initial.calsCount > 0 ? `${initial.calsCount} calificaciones de clientes` : "Sin calificaciones aún", icon: Star,
      color: "text-amber-400", ring: "ring-amber-400/20", bg: "bg-amber-400/10",
      href: "/admin/estadisticas/atencion"
    },
  ];

  return (
    <>
      {/* Indicador de tiempo real */}
      <div className="flex items-center justify-end gap-2 -mb-2">
        <span className="flex items-center gap-1.5 text-[10px] font-bold text-emerald-600">
          <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 animate-pulse" />
          EN TIEMPO REAL{mounted && lastUpdate ? ` · actualizado ${lastUpdate.toLocaleTimeString("es-CR", { hour: "2-digit", minute: "2-digit", second: "2-digit" })}` : ""}
        </span>
      </div>

      {/* KPIs PRINCIPALES */}
      <section className="grid gap-4 grid-cols-2 lg:grid-cols-4">
        {kpis.map((k) => (
          <Link key={k.label} href={k.href}
            className={`group relative rounded-2xl border border-border bg-card p-5 hover:shadow-2xl hover:-translate-y-1 transition-all ring-1 ${k.ring} overflow-hidden`}>
            <div className={`absolute -top-6 -right-6 h-24 w-24 rounded-full ${k.bg} blur-2xl`} />
            <div className="relative">
              <div className={`inline-flex items-center justify-center h-9 w-9 rounded-xl ${k.bg} ${k.color} mb-3`}>
                <k.icon className="h-4 w-4" />
              </div>
              <p className="text-[11px] font-bold uppercase tracking-widest text-muted-foreground">{k.label}</p>
              <p className={`text-3xl font-black mt-1 tracking-tight ${k.color} transition-all`}>{k.value}</p>
              <p className="text-xs text-muted-foreground mt-1">{k.sub}</p>
              <ArrowUpRight className="absolute top-0 right-0 h-3.5 w-3.5 text-muted-foreground/40 group-hover:text-muted-foreground transition-colors" />
            </div>
          </Link>
        ))}
      </section>

      {/* FILA 2: Volumen + Actividad reciente */}
      <div className="grid gap-6 lg:grid-cols-3">
        {/* Volumen del sistema */}
        <div className="rounded-2xl border border-border bg-card p-6 space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="font-bold text-sm uppercase tracking-wider text-muted-foreground">Volumen del sistema</h2>
            <Activity className="h-4 w-4 text-muted-foreground" />
          </div>
          {[
            { label: "Total casos", value: stats.totalCasos, max: Math.max(stats.totalCasos, 1), color: "bg-brand-500" },
            { label: "Casos últimos 7 días", value: initial.casosUltSemana, max: Math.max(initial.casosUltSemana, 1), color: "bg-violet-500" },
            { label: "Equipos en inventario", value: initial.totalInventario, max: Math.max(initial.totalInventario, 1), color: "bg-teal-500" },
            { label: "Manuales cargados", value: initial.totalDocs, max: Math.max(initial.totalDocs, 1), color: "bg-sky-500" },
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
              { label: "Agentes", value: initial.totalAgentes, icon: AlertCircle, href: "/admin/equipo" },
              { label: "Canales", value: initial.totalCanales, icon: Activity, href: "/admin/canales" },
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
              <p className="text-xs text-muted-foreground mt-0.5">{initial.casosUltSemana} casos en los últimos 7 días</p>
            </div>
            <Link href="/inbox" className="text-xs text-brand-600 hover:text-brand-700 font-semibold flex items-center gap-1">
              Ver todos <ChevronRight className="h-3 w-3" />
            </Link>
          </div>
          <div className="divide-y divide-border">
            {stats.casosRecientes && stats.casosRecientes.length > 0 ? stats.casosRecientes.map((c) => (
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

      {/* Estado IA */}
      <div className="grid gap-6 lg:grid-cols-3">
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
                <p className="font-bold">Gemini 2.0 Flash</p>
                <p className="text-xs text-muted-foreground">Google AI · 1,500 RPD</p>
              </div>
            </div>
            <div className="space-y-3">
              {[
                { label: "Casos activos IA", value: stats.casosIa.toString(), color: "text-violet-500" },
                { label: "Escalados a N2", value: stats.casosEscalados.toString(), color: "text-amber-500" },
                { label: "Prompt (chars)", value: initial.promptLen.toLocaleString(), color: "text-brand-500" },
              ].map(item => (
                <div key={item.label} className="flex items-center justify-between py-2 border-b border-border last:border-0">
                  <span className="text-xs text-muted-foreground">{item.label}</span>
                  <span className={`text-sm font-bold tabular-nums ${item.color} transition-all`}>{item.value}</span>
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
                  initial.agentes?.forEach(a => {
                    perAgent[a.email] = { nombre: agenteMap[a.email] || a.email, rol: a.rol, total: 0, resueltos: 0, cals: [] };
                  });
                  initial.allCasos?.forEach((c: any) => {
                    if (!c.assigned_to || !perAgent[c.assigned_to]) return;
                    perAgent[c.assigned_to].total++;
                    if (c.estado === "resuelto" || c.estado === "cerrado" || c.closed_at) perAgent[c.assigned_to].resueltos++;
                    const cl = typeof c.cliente === "object" && c.cliente ? c.cliente as any : null;
                    if (cl?.calificacion_cliente) perAgent[c.assigned_to].cals.push(Number(cl.calificacion_cliente));
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
    </>
  );
}
