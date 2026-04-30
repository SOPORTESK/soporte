import { createClient } from "@/lib/supabase/server";
import Link from "next/link";
import {
  Users, Package, BookOpen, MessageCircle, Inbox as InboxIcon,
  TrendingUp, Activity, Bot, Settings, ChevronRight
} from "lucide-react";

export const dynamic = "force-dynamic";

async function count(table: string) {
  const supabase = createClient();
  const { count } = await supabase.from(table).select("*", { count: "exact", head: true });
  return count ?? 0;
}

export default async function AdminDashboardPage() {
  const [agents, cases, openCases, messages, channels, docs, plantillas, inventario] = await Promise.all([
    count("sek_agent_config"), count("sek_cases"),
    (async () => {
      const supabase = createClient();
      const { count } = await supabase.from("sek_cases")
        .select("*", { count: "exact", head: true })
        .not("estado", "in", "(\"resuelto\",\"cerrado\")");
      return count ?? 0;
    })(),
    count("sek_messages"), count("sek_channels"),
    count("sek_docs"), count("sek_plantillas"), count("sek_inventario")
  ]);

  const stats = [
    { label: "Agentes",      value: agents,    icon: Users,        href: "/admin/equipo",     accent: "from-brand-600 to-brand-700" },
    { label: "Casos abiertos", value: openCases, icon: InboxIcon,    href: "/inbox",             accent: "from-accent-500 to-accent-600" },
    { label: "Casos totales",  value: cases,    icon: TrendingUp,   href: "/admin",             accent: "from-emerald-500 to-emerald-600" },
    { label: "Mensajes",     value: messages,  icon: Activity,     href: "/inbox",             accent: "from-violet-500 to-violet-600" },
    { label: "Canales",      value: channels,  icon: MessageCircle, href: "/admin/canales",    accent: "from-rose-500 to-rose-600" },
    { label: "Manuales",     value: docs,      icon: BookOpen,     href: "/admin/manuales",   accent: "from-sky-500 to-sky-600" },
    { label: "Plantillas",   value: plantillas, icon: Bot,          href: "/plantillas",        accent: "from-amber-500 to-amber-600" },
    { label: "Inventario",   value: inventario, icon: Package,      href: "/admin/inventario", accent: "from-teal-500 to-teal-600" }
  ];

  const quick = [
    { title: "Equipo",        desc: "Agentes, técnicos y permisos.",       href: "/admin/equipo",      icon: Users },
    { title: "Canales",       desc: "WhatsApp, Messenger y más.",          href: "/admin/canales",     icon: MessageCircle },
    { title: "Manuales",      desc: "Base documental para el agente IA.",  href: "/admin/manuales",    icon: BookOpen },
    { title: "Inventario",    desc: "Equipos, marcas y existencias.",      href: "/admin/inventario",  icon: Package },
    { title: "Configuración", desc: "Ajustes generales del sistema.",      href: "/admin/settings",    icon: Settings },
    { title: "Agente IA",     desc: "Próximamente: respuestas automáticas.", href: "/admin/agente-ia",   icon: Bot, disabled: true }
  ];

  return (
    <div className="p-6 lg:p-8 max-w-7xl mx-auto space-y-8">
      <header className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-3">
        <div>
          <p className="text-xs font-bold uppercase tracking-[0.2em] text-brand-700 dark:text-brand-300">Panel Admin</p>
          <h1 className="text-3xl font-bold mt-1">Resumen general</h1>
          <p className="text-muted-foreground mt-1">Vista rápida del estado de tu plataforma de atención.</p>
        </div>
      </header>

      {/* Stats grid */}
      <section aria-label="Indicadores" className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {stats.map(s => (
          <Link key={s.label} href={s.href}
            className="group relative overflow-hidden rounded-2xl border border-border bg-card p-5 hover:shadow-xl hover:-translate-y-0.5 transition-all focus-visible:ring-2 focus-visible:ring-ring">
            <div className={`absolute inset-0 bg-gradient-to-br ${s.accent} opacity-0 group-hover:opacity-10 transition-opacity`} aria-hidden />
            <div className="relative flex items-start justify-between">
              <div>
                <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">{s.label}</p>
                <p className="text-3xl font-bold mt-2 tabular-nums">{s.value.toLocaleString()}</p>
              </div>
              <div className={`h-10 w-10 rounded-xl bg-gradient-to-br ${s.accent} text-white grid place-items-center shadow-lg`}>
                <s.icon className="h-5 w-5" />
              </div>
            </div>
          </Link>
        ))}
      </section>

      {/* Quick actions */}
      <section aria-label="Accesos rápidos">
        <h2 className="text-lg font-semibold mb-4">Accesos rápidos</h2>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {quick.map(q => {
            const Icon = q.icon;
            const cls = "group relative rounded-2xl border border-border bg-card p-5 transition-all focus-visible:ring-2 focus-visible:ring-ring";
            const inner = (
              <>
                <div className="flex items-start gap-3">
                  <div className="h-10 w-10 rounded-xl bg-brand-100 dark:bg-brand-900/40 text-brand-700 dark:text-brand-300 grid place-items-center shrink-0">
                    <Icon className="h-5 w-5" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <p className="font-semibold">{q.title}</p>
                      {q.disabled && <span className="text-[10px] font-bold uppercase tracking-wider rounded-full bg-accent-100 text-accent-700 dark:bg-accent-700/30 dark:text-accent-300 px-2 py-0.5">Pronto</span>}
                    </div>
                    <p className="text-sm text-muted-foreground mt-1">{q.desc}</p>
                  </div>
                  {!q.disabled && <ChevronRight className="h-4 w-4 text-muted-foreground transition-transform group-hover:translate-x-0.5" />}
                </div>
              </>
            );
            if (q.disabled) {
              return <div key={q.title} className={`${cls} opacity-60 pointer-events-none`}>{inner}</div>;
            }
            return (
              <Link key={q.title} href={q.href} className={`${cls} hover:border-brand-300 dark:hover:border-brand-700 hover:shadow-lg hover:-translate-y-0.5`}>
                {inner}
              </Link>
            );
          })}
        </div>
      </section>
    </div>
  );
}
