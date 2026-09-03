import { redirect } from "next/navigation";
import Image from "next/image";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { ThemeToggle } from "@/components/theme-toggle";
import { LogoutButton } from "@/components/logout-button";
import { Avatar } from "@/components/ui/avatar";
import { SidebarLink } from "@/components/sidebar-link";
import { MobileBottomNav } from "@/components/mobile-bottom-nav";
import { Inbox, ShieldCheck, ChevronRight, Wrench, FolderKanban, Bot } from "lucide-react";
import type { SekAgent } from "@/lib/types";
import { GodModeWrapper } from "@/components/god-mode-wrapper";
import { SidebarUserPanel } from "@/components/sidebar-user-panel";
import { N2Badge } from "@/components/n2-badge";
import { SmartInboxBadge } from "@/components/smart-inbox-badge";
import { EscalatedCasesBanner } from "@/components/escalated-cases-banner";
import { FloatingTechAssistant } from "@/components/floating-tech-assistant";
import { ActivityTrackerProvider } from "@/components/activity-tracker-provider";
import { getUserWithTimeout, queryWithFallback } from "@/lib/supabase/resilient";

export const dynamic = 'force-dynamic';

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const supabase = createClient();
  const { user } = await getUserWithTimeout(supabase);

  if (!user) {
    redirect("/login");
  }

  const email = user.email!;
  const twoMinutesAgo = new Date(Date.now() - 2 * 60 * 1000).toISOString();

  // Paralelizar todas las queries del layout con cache de alta velocidad
  const [
    agentResult,
    onlineAgentsResult,
    n2CountResult,
    smartCountResult,
  ] = await Promise.all([
    queryWithFallback(
      `agent_config_${email}`,
      async () => {
        const { data, error } = await supabase
          .from("sek_agent_config").select("*").ilike("email", email).maybeSingle();
        return { data, error };
      },
      null
    ),
    queryWithFallback(
      "online_agents",
      async () => {
        const { data, error } = await supabase
          .from("sek_agent_config")
          .select("email, nombre, apellido, avatar_url, status, last_seen_at")
          .neq("status", "offline")
          .gte("last_seen_at", twoMinutesAgo);
        return { data, error };
      },
      []
    ),
    queryWithFallback(
      "n2_count",
      async () => {
        const { count, error } = await supabase
          .from("sek_cases")
          .select("*", { count: "exact", head: true })
          .eq("estado", "escalado")
          .is("assigned_to", null);
        return { data: count as any, error };
      },
      0
    ),
    queryWithFallback(
      "smart_count",
      async () => {
        const { count, error } = await supabase
          .from("sek_cases")
          .select("*", { count: "exact", head: true })
          .eq("estado", "ia_atendiendo")
          .neq("canal", "simulator");
        return { data: count as any, error };
      },
      0
    ),
  ]);

  let a = agentResult.data as SekAgent | null;
  if (!a) {
    const fallbackRol = (email === "cbatista@sekunet.com" || email.includes("admin")) ? "superadmin" : "tecnico";
    a = {
      id: "agent-fallback",
      email,
      nombre: "César Andrés",
      apellido: "Batista",
      rol: fallbackRol,
      activo: true,
      color: "#6366f1",
      created_at: new Date().toISOString(),
    } as any;
  }

  const onlineAgents = (onlineAgentsResult.data || []) as any[];
  const n2Count = (n2CountResult.data as number) ?? 0;
  const smartCount = (smartCountResult.data as number) ?? 0;

  const currentAgent = a as SekAgent;
  const isAdmin = ["admin","superadmin"].includes(currentAgent.rol);
  const isTecnico = currentAgent.rol === "tecnico";
  const canAccessAdmin = isAdmin || isTecnico;
  const adminHref = isTecnico ? "/admin/equipo" : "/admin";
  const fullName = [currentAgent.nombre, currentAgent.apellido].filter(Boolean).join(" ") || email;

  return (
    <GodModeWrapper originalAgent={currentAgent}>
    <div className="h-dvh flex flex-col overflow-hidden">
    <div className="flex-1 flex min-h-0 bg-muted/30">
      {/* ── Desktop sidebar ── */}
      <aside className="hidden lg:flex lg:flex-col w-[260px] shrink-0 border-r border-border bg-card">
        {canAccessAdmin ? (
          <Link
            href={adminHref}
            className="group relative px-5 py-5 flex items-center gap-3 border-b border-border overflow-hidden hover:bg-muted/50 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            title="Abrir Panel de Administración"
          >
            <div className="absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity bg-gradient-to-br from-blue-600/20 via-violet-600/20 to-orange-500/20 backdrop-blur-sm" aria-hidden />
            <div className="relative group/logo">
              <div className="absolute -inset-1 bg-gradient-to-r from-blue-600 via-violet-500 to-orange-500 rounded-2xl blur opacity-20 group-hover/logo:opacity-40 transition duration-500" />
              <div className="relative w-10 h-10 rounded-xl bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 p-0.5 shadow-2xl shadow-blue-500/20 group-hover:shadow-blue-500/40 group-hover:scale-105 transition-all duration-300">
                <div className="w-full h-full rounded-[10px] bg-slate-950 flex items-center justify-center overflow-hidden">
                  <Image src="/logoTienda3D.png" alt="Sekunet" width={36} height={36} className="object-contain drop-shadow-[0_0_15px_rgba(59,130,246,0.5)]" />
                </div>
              </div>
            </div>
            <div className="relative flex-1 min-w-0">
              <p className="font-bold leading-none transition-colors group-hover:text-white">Sekunet</p>
              <p className="text-xs text-muted-foreground transition-colors group-hover:text-white/85 flex items-center gap-1">
                <ShieldCheck className="h-3 w-3" /> Panel Admin
              </p>
            </div>
            <ChevronRight className="relative h-4 w-4 text-muted-foreground transition-all group-hover:text-white group-hover:translate-x-0.5" aria-hidden />
          </Link>
        ) : (
          <div className="px-5 py-5 flex items-center gap-3 border-b border-border">
            <div className="relative group/logo">
              <div className="absolute -inset-1 bg-gradient-to-r from-blue-600 via-violet-500 to-orange-500 rounded-2xl blur opacity-20 group-hover/logo:opacity-40 transition duration-500" />
              <div className="relative w-10 h-10 rounded-xl bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 p-0.5 shadow-2xl shadow-blue-500/20 group-hover:shadow-blue-500/40 group-hover:scale-105 transition-all duration-300">
                <div className="w-full h-full rounded-[10px] bg-slate-950 flex items-center justify-center overflow-hidden">
                  <Image src="/logoTienda3D.png" alt="Sekunet" width={36} height={36} className="object-contain drop-shadow-[0_0_15px_rgba(59,130,246,0.5)]" />
                </div>
              </div>
            </div>
            <div>
              <p className="font-bold leading-none">Sekunet</p>
              <p className="text-xs text-muted-foreground">Centro de Atención</p>
            </div>
          </div>
        )}

        <nav className="flex-1 min-h-0 p-3 space-y-1 overflow-y-auto">
          <SidebarLink href="/smart-inbox" icon={<Bot className="h-4 w-4" />} badge={<SmartInboxBadge initialCount={smartCount ?? 0} />}>Smart Inbox</SidebarLink>
          <SidebarLink href="/soporte-avanzado" icon={<Wrench className="h-4 w-4" />} badge={<N2Badge initialCount={n2Count ?? 0} />}>Soporte Avanzado</SidebarLink>
          <SidebarLink href="/mi-gestion" icon={<FolderKanban className="h-4 w-4" />}>Mi Bandeja de Gestión</SidebarLink>
          <SidebarLink href="/inbox" icon={<Inbox className="h-4 w-4" />}>Bandeja</SidebarLink>
        </nav>

        <div className="flex items-center gap-1 px-4 pb-2 pt-2">
          <ThemeToggle />
        </div>
        <SidebarUserPanel agent={a as any} onlineAgents={onlineAgents || []} />
      </aside>

      {/* ── Main content area ── */}
      <main id="main" className="flex-1 min-w-0 min-h-0 flex flex-col">
        <EscalatedCasesBanner />
        {children}
      </main>
    </div>

    {/* ── Mobile bottom navigation bar ── */}
    <MobileBottomNav
      isAdmin={canAccessAdmin}
      agentName={fullName}
      avatarUrl={currentAgent.avatar_url || null}
      agent={{ email: currentAgent.email, nombre: currentAgent.nombre, apellido: currentAgent.apellido, rol: currentAgent.rol, avatar_url: currentAgent.avatar_url, status: currentAgent.status }}
      onlineAgents={onlineAgents || []}
    />
    <FloatingTechAssistant />
    <ActivityTrackerProvider agentEmail={currentAgent.email} agentName={fullName} enabled={true} />
    </div>
    </GodModeWrapper>
  );
}
