import { redirect } from "next/navigation";
import Image from "next/image";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { ThemeToggle } from "@/components/theme-toggle";
import { LogoutButton } from "@/components/logout-button";
import { Avatar, Badge } from "@/components/ui/avatar";
import { SidebarLink } from "@/components/sidebar-link";
import {
  LayoutDashboard, Settings, BookOpen, Bot, Package,
  ArrowLeft, Users, ShieldCheck, MessageCircle
} from "lucide-react";
import type { SekAgent } from "@/lib/types";

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: agent } = await supabase
    .from("sek_agent_config").select("*").ilike("email", user.email!).maybeSingle();
  const a = agent as SekAgent | null;
  if (!a) redirect("/login");

  const isAdmin = ["admin","superadmin"].includes(a.rol);
  if (!isAdmin) {
    return (
      <div className="min-h-dvh grid place-items-center p-6 bg-muted/30">
        <div className="max-w-md text-center space-y-4 rounded-2xl border border-border bg-card p-8 shadow-2xl">
          <div className="mx-auto h-16 w-16 rounded-full bg-[hsl(var(--danger)/.15)] grid place-items-center text-[hsl(var(--danger))]">
            <ShieldCheck className="h-8 w-8" />
          </div>
          <h1 className="text-2xl font-bold">Solo administradores</h1>
          <p className="text-muted-foreground">
            Este panel está reservado a roles <strong>admin</strong> y <strong>superadmin</strong>.
            Tu rol actual es <span className="capitalize rounded bg-muted px-2 py-0.5">{a.rol}</span>.
          </p>
          <Link href="/inbox" className="inline-flex items-center gap-2 text-brand-700 dark:text-brand-300 font-medium hover:underline">
            <ArrowLeft className="h-4 w-4" /> Volver a la bandeja
          </Link>
        </div>
      </div>
    );
  }

  const fullName = [a.nombre, a.apellido].filter(Boolean).join(" ") || user.email!;

  return (
    <div className="min-h-dvh grid grid-cols-1 lg:grid-cols-[280px_1fr] bg-muted/30">
      <aside className="hidden lg:flex lg:flex-col border-r border-border bg-card relative overflow-hidden">
        {/* Header con gradiente */}
        <div className="relative px-5 py-5 border-b border-border gradient-brand text-white overflow-hidden">
          <div className="absolute inset-0 opacity-30" aria-hidden style={{
            backgroundImage:
              "radial-gradient(circle at 20% 0%, rgba(255,255,255,.4), transparent 50%), radial-gradient(circle at 90% 100%, rgba(255,180,80,.5), transparent 50%)"
          }} />
          <div className="relative flex items-center gap-3">
            <div className="bg-white rounded-lg p-1 shadow-lg">
              <Image src="/logo.png" alt="Sekunet" width={32} height={32} />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-[10px] uppercase tracking-[0.2em] text-white/80 font-semibold">Sekunet</p>
              <p className="font-bold leading-tight flex items-center gap-1.5">
                <ShieldCheck className="h-4 w-4" /> Panel Admin
              </p>
            </div>
          </div>
        </div>

        <nav className="flex-1 p-3 space-y-4 overflow-y-auto">
          <Link
            href="/inbox"
            className="flex items-center gap-2 px-3 py-2 rounded-lg text-sm text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
          >
            <ArrowLeft className="h-4 w-4" /> Volver a Bandeja
          </Link>

          <NavSection title="General">
            <SidebarLink href="/admin" icon={<LayoutDashboard className="h-4 w-4" />}>Resumen</SidebarLink>
          </NavSection>

          <NavSection title="Gestión">
            <SidebarLink href="/admin/equipo" icon={<Users className="h-4 w-4" />}>Equipo</SidebarLink>
            <SidebarLink href="/admin/inventario" icon={<Package className="h-4 w-4" />}>Inventario</SidebarLink>
            <SidebarLink href="/admin/manuales" icon={<BookOpen className="h-4 w-4" />}>Manuales</SidebarLink>
          </NavSection>

          <NavSection title="Plataforma">
            <SidebarLink href="/admin/canales" icon={<MessageCircle className="h-4 w-4" />}>Canales</SidebarLink>
            <SidebarLink href="/admin/agente-ia" icon={<Bot className="h-4 w-4" />} disabled badge="Pronto">Agente IA</SidebarLink>
            <SidebarLink href="/admin/settings" icon={<Settings className="h-4 w-4" />}>Configuración</SidebarLink>
          </NavSection>
        </nav>

        <div className="p-3 border-t border-border space-y-3">
          <div className="flex items-center gap-3 px-2">
            <Avatar name={fullName} size={36} />
            <div className="min-w-0 flex-1">
              <p className="text-sm font-medium truncate">{fullName}</p>
              <div className="flex items-center gap-1">
                <Badge variant="danger" className="text-[10px]">{a.rol}</Badge>
              </div>
            </div>
          </div>
          <div className="flex items-center justify-between gap-2">
            <ThemeToggle />
            <LogoutButton />
          </div>
        </div>
      </aside>

      <header className="lg:hidden flex items-center justify-between p-4 border-b border-border bg-card">
        <Link href="/inbox" className="flex items-center gap-2 text-sm text-muted-foreground">
          <ArrowLeft className="h-4 w-4" /> Bandeja
        </Link>
        <div className="flex items-center gap-2 font-semibold">
          <ShieldCheck className="h-4 w-4 text-brand-700 dark:text-brand-300" /> Admin
        </div>
        <div className="flex items-center gap-2">
          <ThemeToggle />
          <LogoutButton />
        </div>
      </header>

      <main id="main" className="min-w-0 min-h-0">{children}</main>
    </div>
  );
}

function NavSection({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1">
      <p className="px-3 text-[10px] font-bold uppercase tracking-[0.15em] text-muted-foreground/80">{title}</p>
      <div className="space-y-0.5">{children}</div>
    </div>
  );
}
