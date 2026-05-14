"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  LayoutDashboard, Settings, BookOpen, Bot, Package,
  Users, MessageCircle, X, Menu, ShieldCheck, ShieldBan
} from "lucide-react";

const navItems = [
  { section: "General", items: [{ href: "/admin", label: "Resumen", icon: LayoutDashboard }] },
  { section: "Gestión", items: [
    { href: "/admin/equipo", label: "Equipo", icon: Users },
    { href: "/admin/clientes", label: "Clientes", icon: ShieldBan },
    { href: "/admin/inventario", label: "Inventario", icon: Package },
    { href: "/admin/manuales", label: "Manuales", icon: BookOpen },
  ]},
  { section: "Plataforma", items: [
    { href: "/admin/canales", label: "Canales", icon: MessageCircle },
    { href: "/admin/agente-ia", label: "Agente IA", icon: Bot },
    { href: "/admin/settings", label: "Configuración", icon: Settings },
  ]},
];

export function MobileNav() {
  const [isOpen, setIsOpen] = useState(false);
  const pathname = usePathname();

  return (
    <>
      {/* Botón hamburguesa */}
      <button
        onClick={() => setIsOpen(true)}
        className="lg:hidden flex items-center justify-center h-10 w-10 rounded-xl bg-muted/50 hover:bg-muted transition-colors"
        aria-label="Abrir menú"
      >
        <Menu className="h-5 w-5" />
      </button>

      {/* Overlay */}
      {isOpen && (
        <div className="lg:hidden fixed inset-0 z-50">
          {/* Backdrop */}
          <div 
            className="absolute inset-0 bg-black/60 backdrop-blur-sm"
            onClick={() => setIsOpen(false)}
          />
          
          {/* Drawer */}
          <div className="absolute left-0 top-0 bottom-0 w-[280px] bg-card border-r border-border shadow-2xl flex flex-col animate-in slide-in-from-left">
            {/* Header */}
            <div className="relative px-5 py-5 border-b border-border gradient-brand text-white overflow-hidden">
              <div className="absolute inset-0 opacity-30" aria-hidden style={{
                backgroundImage: "radial-gradient(circle at 20% 0%, rgba(255,255,255,.4), transparent 50%), radial-gradient(circle at 90% 100%, rgba(255,180,80,.5), transparent 50%)"
              }} />
              <div className="relative flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="bg-white rounded-lg p-1 shadow-lg">
                    <ShieldCheck className="h-6 w-6 text-brand-700" />
                  </div>
                  <div>
                    <p className="text-[10px] uppercase tracking-[0.2em] text-white/80 font-semibold">Sekunet</p>
                    <p className="font-bold leading-tight">Panel Admin</p>
                  </div>
                </div>
                <button 
                  onClick={() => setIsOpen(false)}
                  className="p-2 rounded-lg bg-white/20 hover:bg-white/30 transition-colors"
                >
                  <X className="h-5 w-5" />
                </button>
              </div>
            </div>

            {/* Navegación */}
            <nav className="flex-1 p-4 space-y-6 overflow-y-auto">
              {navItems.map((section) => (
                <div key={section.section} className="space-y-2">
                  <p className="px-3 text-[10px] font-bold uppercase tracking-[0.15em] text-muted-foreground/70">
                    {section.section}
                  </p>
                  <div className="space-y-1">
                    {section.items.map((item) => {
                      const isActive = pathname === item.href || pathname.startsWith(`${item.href}/`);
                      const Icon = item.icon;
                      return (
                        <Link
                          key={item.href}
                          href={item.href}
                          onClick={() => setIsOpen(false)}
                          className={`flex items-center gap-3 px-3 py-3 rounded-xl text-sm font-medium transition-all ${
                            isActive 
                              ? "bg-brand-500/10 text-brand-600 border border-brand-500/20" 
                              : "text-muted-foreground hover:text-foreground hover:bg-muted"
                          }`}
                        >
                          <Icon className={`h-4 w-4 ${isActive ? "text-brand-500" : ""}`} />
                          {item.label}
                        </Link>
                      );
                    })}
                  </div>
                </div>
              ))}
            </nav>

            {/* Footer */}
            <div className="p-4 border-t border-border">
              <Link
                href="/inbox"
                onClick={() => setIsOpen(false)}
                className="flex items-center gap-3 px-3 py-3 rounded-xl text-sm text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
              >
                <MessageCircle className="h-4 w-4" />
                Volver a Bandeja
              </Link>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
