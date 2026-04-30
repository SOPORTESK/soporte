import { redirect } from "next/navigation";
import Image from "next/image";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { ThemeToggle } from "@/components/theme-toggle";
import { LogoutButton } from "@/components/logout-button";
import { Avatar } from "@/components/ui/avatar";
import { SidebarLink } from "@/components/sidebar-link";
import { Inbox, ShieldCheck, ChevronRight } from "lucide-react";
import type { SekAgent } from "@/lib/types";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: agent } = await supabase
    .from("sek_agent_config").select("*").ilike("email", user.email!).maybeSingle();
  const a = agent as SekAgent | null;

  if (!a) {
    return (
      <div className="min-h-dvh grid place-items-center p-6">
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
  const fullName = [a.nombre, a.apellido].filter(Boolean).join(" ") || user.email!;

  return (
    <div className="min-h-dvh grid grid-cols-1 lg:grid-cols-[260px_1fr] bg-muted/30">
      <aside className="hidden lg:flex lg:flex-col border-r border-border bg-card">
        {/* Logo - clickable hacia admin si tiene permiso */}
        {isAdmin ? (
          <Link
            href="/admin"
            className="group relative px-5 py-5 flex items-center gap-3 border-b border-border overflow-hidden hover:bg-muted/50 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            title="Abrir Panel de Administración"
          >
            <div className="absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity gradient-brand" aria-hidden />
            <div className="relative bg-white dark:bg-card rounded-lg p-1 shadow-sm border border-border ring-2 ring-transparent group-hover:ring-white/40 transition-all">
              <Image src="/logo.png" alt="Sekunet" width={32} height={32} />
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
            <div className="bg-white dark:bg-card rounded-lg p-1 shadow-sm border border-border">
              <Image src="/logo.png" alt="Sekunet" width={32} height={32} />
            </div>
            <div>
              <p className="font-bold leading-none">Sekunet</p>
              <p className="text-xs text-muted-foreground">Centro de Atención</p>
            </div>
          </div>
        )}

        <nav className="flex-1 p-3 space-y-1">
          <SidebarLink href="/inbox" icon={<Inbox className="h-4 w-4" />}>Bandeja</SidebarLink>
        </nav>

        <div className="p-3 border-t border-border space-y-3">
          <div className="flex items-center gap-3 px-2">
            <Avatar name={fullName} size={36} />
            <div className="min-w-0 flex-1">
              <p className="text-sm font-medium truncate">{fullName}</p>
              <p className="text-xs text-muted-foreground capitalize">{a.rol}</p>
            </div>
          </div>
          <div className="flex items-center justify-between gap-2">
            <ThemeToggle />
            <LogoutButton />
          </div>
        </div>
      </aside>

      <header className="lg:hidden flex items-center justify-between p-4 border-b border-border bg-card">
        <Link href={isAdmin ? "/admin" : "/inbox"} className="flex items-center gap-2">
          <Image src="/logo.png" alt="Sekunet" width={28} height={28} />
          <span className="font-semibold">Sekunet</span>
        </Link>
        <div className="flex items-center gap-2">
          <ThemeToggle />
          <LogoutButton />
        </div>
      </header>

      <main id="main" className="min-w-0 min-h-0">{children}</main>
    </div>
  );
}
