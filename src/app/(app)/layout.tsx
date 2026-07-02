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

export const dynamic = 'force-dynamic';

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: agent } = await supabase
    .from("sek_agent_config").select("*").ilike("email", user.email!).maybeSingle();
  const a = agent as SekAgent | null;

  const twoMinutesAgo = new Date(Date.now() - 2 * 60 * 1000).toISOString();
  const { data: onlineAgents } = await supabase
    .from("sek_agent_config")
    .select("email, nombre, apellido, avatar_url, status, last_seen_at")
    .neq("status", "offline")
    .gte("last_seen_at", twoMinutesAgo);

  const { count: n2Count } = await supabase
    .from("sek_cases")
    .select("*", { count: "exact", head: true })
    .eq("estado", "escalado")
    .is("assigned_to", null);

  // Contar casos en Smart Inbox (IA atendiendo)
  const { count: smartCount } = await supabase
    .from("sek_cases")
    .select("*", { count: "exact", head: true })
    .eq("estado", "ia_atendiendo")
    .neq("canal", "simulator");

  if (!a) {
    return (
      <div className="min-h-dvh grid place-items-center p-6 px-safe">
        <div className="max-w-md text-center space-y-4">
          <h1 className="text-2xl font-bold">Acceso restringido</h1>
          <p className="text-muted-foreground">
            Tu correo <strong>{user.email}</strong> no está registrado como agente en
            <code className="mx-1 rounded bg-muted px-1">sek_agent_config</code>.
          </p>
          <LogoutButton />
        </div>
      </div>
    );
  }

  const isAdmin = ["admin","superadmin"].includes(a.rol);
  const isTecnico = a.rol === "tecnico";
  const canAccessAdmin = isAdmin || isTecnico;
  const adminHref = isTecnico ? "/admin/equipo" : "/admin";
  const fullName = [a.nombre, a.apellido].filter(Boolean).join(" ") || user.email!;

  return (
    <GodModeWrapper originalAgent={a}>
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

        <nav className="flex-1 p-3 space-y-1">
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
      avatarUrl={a.avatar_url || null}
      agent={{ email: a.email, nombre: a.nombre, apellido: a.apellido, rol: a.rol, avatar_url: a.avatar_url, status: a.status }}
      onlineAgents={onlineAgents || []}
    />
    </div>
    </GodModeWrapper>
  );
}
