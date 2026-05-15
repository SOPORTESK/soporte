"use client";

import { useEffect, useState } from "react";
import { Crown, LogOut, Inbox, Wrench, FolderKanban, ShieldCheck } from "lucide-react";
import Link from "next/link";
import Image from "next/image";
import { Avatar } from "@/components/ui/avatar";
import { SidebarLink } from "@/components/sidebar-link";
import { ThemeToggle } from "@/components/theme-toggle";
import { LogoutButton } from "@/components/logout-button";

interface GodModeData {
  email: string;
  name: string;
}

export function GodModeWrapper({ 
  children, 
  originalAgent 
}: { 
  children: React.ReactNode;
  originalAgent: { email: string; nombre?: string | null; apellido?: string | null; avatar_url?: string | null; rol: string } | null;
}) {
  const [godMode, setGodMode] = useState<GodModeData | null>(null);

  useEffect(() => {
    if (localStorage.getItem("god_mode_active") === "true") {
      const email = localStorage.getItem("god_mode_target_email");
      const name = localStorage.getItem("god_mode_target_name");
      if (email) {
        setGodMode({ email, name: name || email });
      }
    }
  }, []);

  const salirGodMode = () => {
    localStorage.removeItem("god_mode_target_email");
    localStorage.removeItem("god_mode_target_name");
    localStorage.removeItem("god_mode_active");
    window.location.href = "/admin/equipo";
  };

  // Si NO está en modo dios, renderizar children normal
  if (!godMode) {
    return <>{children}</>;
  }

  // Si está en MODO DIOS, mostrar interfaz del agente objetivo
  return (
    <div className="h-dvh flex flex-col overflow-hidden">
      {/* Banner MODO DIOS */}
      <div className="shrink-0 bg-gradient-to-r from-amber-500 via-orange-500 to-rose-500 text-white px-4 py-2 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Crown className="h-4 w-4" />
          <span className="text-sm font-bold">
            MODO DIOS ACTIVO — Eres: <strong>{godMode.name}</strong>
          </span>
        </div>
        <div className="flex items-center gap-2">
          <Link 
            href="/admin/equipo" 
            className="text-xs bg-white/20 hover:bg-white/30 px-3 py-1 rounded-md transition-colors"
          >
            ← Volver a equipo
          </Link>
          <button 
            onClick={salirGodMode} 
            className="text-xs bg-white/30 hover:bg-white/40 px-3 py-1 rounded-md transition-colors font-medium"
          >
            Salir de Modo Dios
          </button>
        </div>
      </div>

      <div className="flex-1 flex min-h-0 bg-muted/30">
        {/* Sidebar de AGENTE (no admin) */}
        <aside className="hidden lg:flex lg:flex-col w-[260px] shrink-0 border-r border-border bg-card">
          {/* Header como agente */}
          <div className="group relative px-5 py-5 flex items-center gap-3 border-b border-border overflow-hidden">
            <div className="relative group/logo">
              <div className="absolute -inset-1 bg-gradient-to-r from-blue-600 via-violet-500 to-orange-500 rounded-2xl blur opacity-20 transition duration-500" />
              <div className="relative w-10 h-10 rounded-xl bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 p-0.5 shadow-2xl">
                <div className="w-full h-full rounded-[10px] bg-slate-950 flex items-center justify-center overflow-hidden">
                  <Image src="/logoTienda3D.png" alt="Sekunet" width={36} height={36} className="object-contain" />
                </div>
              </div>
            </div>
            <div className="relative flex-1 min-w-0">
              <p className="font-bold leading-none">{godMode.name}</p>
              <p className="text-xs text-muted-foreground flex items-center gap-1">
                <Crown className="h-3 w-3 text-amber-500" /> Modo Dios
              </p>
            </div>
          </div>

          {/* Navegación de AGENTE */}
          <nav className="flex-1 p-3 space-y-1">
            <SidebarLink href="/inbox" icon={<Inbox className="h-4 w-4" />}>Bandeja</SidebarLink>
            <SidebarLink href="/soporte-avanzado" icon={<Wrench className="h-4 w-4" />}>Soporte Avanzado</SidebarLink>
            <SidebarLink href="/mi-gestion" icon={<FolderKanban className="h-4 w-4" />}>Mi Gestión</SidebarLink>
          </nav>

          <div className="flex items-center gap-1 px-4 pb-2 pt-2">
            <ThemeToggle />
          </div>
          
          {/* Panel de usuario como agente */}
          <div className="p-4 border-t border-border">
            <div className="flex items-center gap-3">
              <Avatar name={godMode.name} size={36} />
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium truncate">{godMode.name}</p>
                <p className="text-xs text-amber-500 font-medium">Modo Dios</p>
              </div>
            </div>
            <div className="flex items-center justify-between gap-2 mt-3">
              <ThemeToggle />
              <LogoutButton />
            </div>
          </div>
        </aside>

        {/* Main content */}
        <main id="main" className="flex-1 min-w-0 min-h-0 flex flex-col">
          {children}
        </main>
      </div>

      {/* Mobile bottom nav como agente */}
      <nav className="lg:hidden flex items-center justify-around p-2 border-t border-border bg-card">
        <Link href="/inbox" className="flex flex-col items-center gap-1 p-2 text-muted-foreground">
          <Inbox className="h-5 w-5" />
          <span className="text-[10px]">Bandeja</span>
        </Link>
        <Link href="/soporte-avanzado" className="flex flex-col items-center gap-1 p-2 text-muted-foreground">
          <Wrench className="h-5 w-5" />
          <span className="text-[10px]">N2</span>
        </Link>
        <Link href="/mi-gestion" className="flex flex-col items-center gap-1 p-2 text-muted-foreground">
          <FolderKanban className="h-5 w-5" />
          <span className="text-[10px]">Gestión</span>
        </Link>
      </nav>
    </div>
  );
}
