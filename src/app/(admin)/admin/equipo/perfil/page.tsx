import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import Link from "next/link";
import {
  ArrowLeft, Shield, UserCheck, Activity, Clock, Star,
  CheckCircle, MessageSquare, Mail, Phone, Calendar, Eye, Lock
} from "lucide-react";
import { GodModeButton } from "@/components/admin/god-mode-button";
import { GodModeBanner } from "@/components/admin/god-mode-banner";

export const dynamic = "force-dynamic";

export default async function AgentProfilePage({
  searchParams
}: {
  searchParams: { email?: string }
}) {
  const supabase = createClient();

  const { data: { user } } = await supabase.auth.getUser();
  const { data: currentAgent } = await supabase
    .from("sek_agent_config")
    .select("rol")
    .ilike("email", user?.email || "")
    .maybeSingle();

  const isAdmin = ["admin", "superadmin"].includes(currentAgent?.rol);
  const isSuperadmin = currentAgent?.rol === "superadmin";
  if (!isAdmin) redirect("/admin/equipo");

  const targetEmail = searchParams.email;
  if (!targetEmail) redirect("/admin/equipo");

  const { data: agent } = await supabase
    .from("sek_agent_config")
    .select("*")
    .ilike("email", targetEmail)
    .maybeSingle();

  if (!agent) redirect("/admin/equipo");

  // Stats del agente
  const { data: casos } = await supabase
    .from("sek_cases")
    .select("id, estado, calificacion, created_at, updated_at, closed_at, title, canal, cat, last_message_at")
    .ilike("assigned_to", targetEmail)
    .order("created_at", { ascending: false });

  const resueltos = (casos || []).filter(c => c.estado === "resuelto" || c.estado === "cerrado" || (c as any).closed_at);
  const abiertos  = (casos || []).filter(c => c.estado === "abierto" || c.estado === "asignado" || c.estado === "pendiente");
  const cals      = (casos || []).filter(c => c.calificacion).map(c => c.calificacion as number);
  const tiempos   = resueltos
    .filter(c => c.created_at && c.updated_at)
    .map(c => Math.round((new Date(c.updated_at).getTime() - new Date(c.created_at).getTime()) / 60000))
    .filter(t => t > 0);

  const avgCal  = cals.length > 0 ? (cals.reduce((a, b) => a + b, 0) / cals.length).toFixed(1) : null;
  const avgSLA  = tiempos.length > 0 ? Math.round(tiempos.reduce((a, b) => a + b, 0) / tiempos.length) : 0;
  const tasa    = (casos || []).length > 0 ? Math.round((resueltos.length / (casos || []).length) * 100) : 0;

  const now = new Date();
  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate()).toISOString();
  const casosHoy = (casos || []).filter(c => c.created_at >= todayStart).length;

  const fullName = [agent.nombre, agent.apellido].filter(Boolean).join(" ") || agent.email;
  const initials = fullName.split(" ").map((n: string) => n[0]).join("").substring(0, 2).toUpperCase();

  const rolConfig: Record<string, { label: string; color: string; bg: string; border: string; icon: React.ElementType }> = {
    superadmin:  { label: "Superadmin",       color: "text-rose-500",    bg: "bg-rose-500/10",    border: "border-rose-500/30",    icon: Lock      },
    admin:       { label: "Admin",            color: "text-amber-500",   bg: "bg-amber-500/10",   border: "border-amber-500/30",   icon: UserCheck },
    tecnico:     { label: "Soporte Avanzado", color: "text-emerald-500", bg: "bg-emerald-500/10", border: "border-emerald-500/30", icon: Activity  },
  };
  const rol = rolConfig[agent.rol] || rolConfig["tecnico"];
  const RolIcon = rol.icon;

  const formatSLA = (m: number) => {
    if (m === 0) return "—";
    if (m < 60) return `${m} min`;
    return `${Math.floor(m / 60)}h ${m % 60 > 0 ? `${m % 60}m` : ""}`.trim();
  };

  return (
    <div className="max-w-[1100px] mx-auto p-6 lg:p-8 space-y-8">

      {/* ── HEADER ── */}
      <header className="flex items-center justify-between gap-4 flex-wrap">
        <Link href="/admin/equipo"
          className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors">
          <ArrowLeft className="h-4 w-4" /> Volver a Equipo
        </Link>
        <div className="flex items-center gap-3 flex-wrap">
          <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-violet-500/10 border border-violet-500/20 text-violet-500 text-xs font-bold">
            <Eye className="h-3.5 w-3.5" /> Vista de perfil (solo tú puedes ver esto)
          </div>
          {isSuperadmin && <GodModeButton email={targetEmail} name={fullName} />}
        </div>
      </header>

      {/* ── BANNER MODO DIOS ── */}
      <GodModeBanner />

      {/* ── PROFILE CARD ── */}
      <section className="relative rounded-2xl border border-border bg-card overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-br from-brand-500/5 via-transparent to-violet-500/5 pointer-events-none" />
        <div className="absolute -top-12 -right-12 w-48 h-48 bg-brand-500/5 rounded-full blur-3xl pointer-events-none" />

        <div className="relative p-6 lg:p-8 flex flex-col sm:flex-row items-start gap-6">
          {/* Avatar grande */}
          <div className="relative shrink-0">
            <div className="h-20 w-20 rounded-2xl bg-gradient-to-br from-brand-500 to-brand-700 text-white grid place-items-center text-2xl font-black shadow-xl shadow-brand-500/30 ring-4 ring-brand-500/20">
              {initials}
            </div>
            <span className={`absolute -bottom-1.5 -right-1.5 flex items-center gap-1 ${rol.bg} ${rol.color} border ${rol.border} text-[9px] font-black px-1.5 py-0.5 rounded-full`}>
              <RolIcon className="h-2.5 w-2.5" /> {rol.label}
            </span>
          </div>

          {/* Info */}
          <div className="flex-1 min-w-0">
            <h1 className="text-3xl font-black tracking-tight">{fullName}</h1>
            <div className="flex flex-wrap items-center gap-x-4 gap-y-1 mt-2 text-sm text-muted-foreground">
              <span className="flex items-center gap-1.5"><Mail className="h-3.5 w-3.5" />{agent.email}</span>
              {agent.telefono && <span className="flex items-center gap-1.5"><Phone className="h-3.5 w-3.5" />{agent.telefono}</span>}
              {agent.created_at && (
                <span className="flex items-center gap-1.5">
                  <Calendar className="h-3.5 w-3.5" />
                  Desde {new Date(agent.created_at).toLocaleDateString("es-CR", { year: "numeric", month: "long" })}
                </span>
              )}
              {agent.last_login && (
                <span className="flex items-center gap-1.5">
                  <Clock className="h-3.5 w-3.5" />
                  Último acceso: {new Date(agent.last_login).toLocaleDateString("es-CR", { day: "numeric", month: "short", year: "numeric" })}
                </span>
              )}
            </div>
          </div>
        </div>
      </section>

      {/* ── KPI STATS ── */}
      <section className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {[
          { label: "Casos Totales",    value: (casos || []).length.toString(), icon: MessageSquare, color: "text-brand-500",   bg: "bg-brand-500/10",   sub: `${abiertos.length} activos ahora`  },
          { label: "Resueltos",        value: resueltos.length.toString(),     icon: CheckCircle,   color: "text-emerald-500", bg: "bg-emerald-500/10", sub: `${tasa}% tasa de resolución`       },
          { label: "SLA Promedio",     value: formatSLA(avgSLA),               icon: Clock,         color: "text-sky-500",     bg: "bg-sky-500/10",     sub: "Solo casos de este agente"         },
          { label: "Satisfacción",     value: avgCal ? `${avgCal}/5` : "—",   icon: Star,          color: "text-amber-400",   bg: "bg-amber-400/10",   sub: `${cals.length} calificaciones`     },
        ].map(k => (
          <div key={k.label} className="relative rounded-2xl border border-border bg-card p-5 ring-1 ring-border/50 overflow-hidden hover:shadow-lg hover:-translate-y-0.5 transition-all">
            <div className={`absolute -top-6 -right-6 h-20 w-20 rounded-full ${k.bg} blur-2xl`} />
            <div className="relative">
              <div className={`inline-flex items-center justify-center h-9 w-9 rounded-xl ${k.bg} ${k.color} mb-3`}>
                <k.icon className="h-4 w-4" />
              </div>
              <p className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">{k.label}</p>
              <p className={`text-3xl font-black mt-1 tracking-tight tabular-nums ${k.color}`}>{k.value}</p>
              <p className="text-[11px] text-muted-foreground mt-1">{k.sub}</p>
            </div>
          </div>
        ))}
      </section>

      {/* ── TASA DE RESOLUCIÓN VISUAL ── */}
      <section className="grid gap-6 lg:grid-cols-3">
        {/* Gauge de resolución */}
        <div className="rounded-2xl border border-border bg-card p-6 flex flex-col items-center justify-center">
          <p className="text-[10px] font-black uppercase tracking-widest text-muted-foreground mb-4">Efectividad Global</p>
          <div className="relative h-36 w-36">
            <svg className="h-36 w-36 -rotate-90" viewBox="0 0 36 36">
              <circle cx="18" cy="18" r="15" fill="none" className="stroke-muted/30" strokeWidth="2.5" />
              <circle cx="18" cy="18" r="15" fill="none"
                className={tasa >= 80 ? "stroke-emerald-500" : tasa >= 60 ? "stroke-amber-500" : "stroke-rose-500"}
                strokeWidth="2.5"
                strokeDasharray={`${tasa * 0.942} 100`}
                strokeLinecap="round"
              />
            </svg>
            <div className="absolute inset-0 flex flex-col items-center justify-center">
              <span className={`text-3xl font-black tabular-nums ${tasa >= 80 ? "text-emerald-500" : tasa >= 60 ? "text-amber-500" : "text-rose-500"}`}>{tasa}%</span>
              <span className="text-[10px] text-muted-foreground">resolución</span>
            </div>
          </div>
          <p className="text-xs text-muted-foreground mt-3 text-center">
            {tasa >= 80 ? "Rendimiento excelente" : tasa >= 60 ? "Rendimiento aceptable" : "Necesita mejorar"}
          </p>
        </div>

        {/* Actividad hoy */}
        <div className="rounded-2xl border border-border bg-card p-6">
          <p className="text-[10px] font-black uppercase tracking-widest text-muted-foreground mb-4">Distribución de Casos</p>
          <div className="space-y-3">
            {[
              { label: "Resueltos/Cerrados", count: resueltos.length, total: (casos || []).length, color: "bg-emerald-500" },
              { label: "Activos",            count: abiertos.length,  total: (casos || []).length, color: "bg-brand-500"   },
              { label: "Hoy",                count: casosHoy,          total: (casos || []).length, color: "bg-violet-500"  },
            ].map(row => (
              <div key={row.label} className="space-y-1">
                <div className="flex justify-between text-xs">
                  <span className="text-muted-foreground font-medium">{row.label}</span>
                  <span className="font-black tabular-nums">{row.count}</span>
                </div>
                <div className="h-2 w-full bg-muted rounded-full overflow-hidden">
                  <div className={`h-full ${row.color} rounded-full transition-all`}
                    style={{ width: row.total > 0 ? `${Math.round((row.count / row.total) * 100)}%` : "0%" }} />
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Satisfacción */}
        <div className="rounded-2xl border border-border bg-card p-6">
          <p className="text-[10px] font-black uppercase tracking-widest text-muted-foreground mb-4">Calificaciones Recibidas</p>
          {cals.length > 0 ? (
            <div>
              <div className="flex items-baseline gap-2 mb-4">
                <span className="text-5xl font-black text-amber-400 tabular-nums">{avgCal}</span>
                <span className="text-muted-foreground text-sm">/5.0</span>
              </div>
              <div className="space-y-2">
                {[5,4,3,2,1].map(star => {
                  const count = cals.filter(c => Math.round(c) === star).length;
                  return (
                    <div key={star} className="flex items-center gap-2">
                      <span className="text-[10px] font-bold text-amber-400 w-3">{star}</span>
                      <Star className="h-3 w-3 text-amber-400 fill-amber-400 shrink-0" />
                      <div className="flex-1 h-1.5 bg-muted rounded-full overflow-hidden">
                        <div className="h-full bg-amber-400 rounded-full" style={{ width: cals.length > 0 ? `${(count / cals.length) * 100}%` : "0%" }} />
                      </div>
                      <span className="text-[10px] text-muted-foreground w-4 text-right tabular-nums">{count}</span>
                    </div>
                  );
                })}
              </div>
            </div>
          ) : (
            <p className="text-sm text-muted-foreground italic">Sin calificaciones aún</p>
          )}
        </div>
      </section>

      {/* ── ÚLTIMOS CASOS ── */}
      <section className="rounded-2xl border border-border bg-card overflow-hidden">
        <div className="px-6 py-4 border-b border-border bg-muted/10 flex items-center gap-3">
          <MessageSquare className="h-4 w-4 text-muted-foreground" />
          <h2 className="font-black text-sm uppercase tracking-widest text-muted-foreground">Últimos Casos Asignados</h2>
          <span className="text-[10px] font-black px-2 py-0.5 rounded-full bg-brand-500/10 text-brand-500">{(casos || []).length}</span>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border bg-muted/10">
                <th className="px-6 py-3 text-left text-[10px] font-bold uppercase tracking-widest text-muted-foreground">Caso</th>
                <th className="px-4 py-3 text-center text-[10px] font-bold uppercase tracking-widest text-muted-foreground">Estado</th>
                <th className="px-4 py-3 text-center text-[10px] font-bold uppercase tracking-widest text-muted-foreground">Canal</th>
                <th className="px-4 py-3 text-center text-[10px] font-bold uppercase tracking-widest text-muted-foreground">Calificación</th>
                <th className="px-4 py-3 text-right text-[10px] font-bold uppercase tracking-widest text-muted-foreground">Fecha</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border/50">
              {(casos || []).slice(0, 20).map((c, i) => {
                const estadoStyles: Record<string, string> = {
                  resuelto:      "bg-emerald-500/10 text-emerald-500 border-emerald-500/20",
                  cerrado:       "bg-zinc-500/10 text-zinc-400 border-zinc-500/20",
                  abierto:       "bg-brand-500/10 text-brand-500 border-brand-500/20",
                  asignado:      "bg-sky-500/10 text-sky-500 border-sky-500/20",
                  pendiente:     "bg-amber-500/10 text-amber-500 border-amber-500/20",
                  ia_atendiendo: "bg-violet-500/10 text-violet-500 border-violet-500/20",
                  escalado:      "bg-rose-500/10 text-rose-500 border-rose-500/20",
                };
                return (
                  <tr key={i} className="hover:bg-muted/20 transition-colors">
                    <td className="px-6 py-3">
                      <p className="font-semibold text-sm truncate max-w-[220px]">{c.title || `Caso #${c.id}`}</p>
                      {c.cat && <p className="text-[10px] text-muted-foreground">{c.cat}</p>}
                    </td>
                    <td className="px-4 py-3 text-center">
                      <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full border capitalize ${estadoStyles[c.estado] || "bg-muted text-muted-foreground border-border"}`}>
                        {c.estado?.replace("_", " ")}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-center">
                      <span className="text-[10px] font-bold uppercase text-muted-foreground">{c.canal || "—"}</span>
                    </td>
                    <td className="px-4 py-3 text-center">
                      {c.calificacion ? (
                        <div className="flex items-center justify-center gap-1">
                          <Star className="h-3 w-3 text-amber-400 fill-amber-400" />
                          <span className="font-black text-amber-400 text-xs">{c.calificacion}</span>
                        </div>
                      ) : <span className="text-muted-foreground/40">—</span>}
                    </td>
                    <td className="px-4 py-3 text-right text-[11px] text-muted-foreground">
                      {new Date(c.created_at).toLocaleDateString("es-CR", { day: "numeric", month: "short", year: "2-digit" })}
                    </td>
                  </tr>
                );
              })}
              {(casos || []).length === 0 && (
                <tr><td colSpan={5} className="py-12 text-center text-sm text-muted-foreground">Este agente no tiene casos asignados aún.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </section>

    </div>
  );
}
