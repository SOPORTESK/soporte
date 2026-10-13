"use client";

import React, { useEffect, useState } from "react";
import Image from "next/image";
import { Download, Monitor, ShieldAlert, CheckCircle2, ArrowRight, ExternalLink } from "lucide-react";

interface ElectronGatekeeperProps {
  requireElectron: boolean;
  userRole?: string;
}

export function ElectronGatekeeper({ requireElectron, userRole }: ElectronGatekeeperProps) {
  const [isBlocked, setIsBlocked] = useState<boolean>(false);
  const [downloadStarted, setDownloadStarted] = useState<boolean>(false);

  useEffect(() => {
    // Si la regla está apagada, no bloquear
    if (!requireElectron) {
      setIsBlocked(false);
      return;
    }

    // Exoneración 1: Si es superadmin, no bloquear jamás
    if (userRole === "superadmin") {
      setIsBlocked(false);
      return;
    }

    // Exoneración 2: Si el host es localhost o 127.0.0.1, no bloquear jamás
    if (typeof window !== "undefined") {
      const hostname = window.location.hostname.toLowerCase();
      if (
        hostname === "localhost" ||
        hostname === "127.0.0.1" ||
        hostname === "::1" ||
        hostname.endsWith(".local")
      ) {
        setIsBlocked(false);
        return;
      }

      // Verificación de si estamos corriendo dentro de la app oficial de Electron
      const isElectron = Boolean(
        (window as any).electronAPI?.isElectron ||
          navigator.userAgent.toLowerCase().includes("electron")
      );

      if (!isElectron) {
        setIsBlocked(true);
      }
    }
  }, [requireElectron, userRole]);

  if (!isBlocked) return null;

  return (
    <div className="fixed inset-0 z-[999999] flex items-center justify-center bg-background/95 backdrop-blur-xl p-4 md:p-6 overflow-y-auto animate-in fade-in duration-300">
      <div className="max-w-xl w-full rounded-3xl border-2 border-border/80 bg-card p-6 md:p-10 shadow-2xl text-center space-y-6 relative overflow-hidden">
        {/* Glow de fondo decorativo */}
        <div className="absolute -top-24 -left-24 w-64 h-64 bg-brand-500/10 rounded-full blur-[80px] pointer-events-none" />
        <div className="absolute -bottom-24 -right-24 w-64 h-64 bg-brand-600/10 rounded-full blur-[80px] pointer-events-none" />

        {/* Logo de la empresa */}
        <div className="relative mx-auto flex items-center justify-center">
          <div className="h-20 w-20 rounded-2xl bg-gradient-to-br from-brand-500/20 to-brand-600/10 border border-brand-500/30 flex items-center justify-center shadow-lg shadow-brand-500/10">
            <Image
              src="/logo.png"
              alt="Sekunet Logo"
              width={56}
              height={56}
              className="object-contain"
              priority
            />
          </div>
        </div>

        {/* Títulos y descripción */}
        <div className="space-y-2 relative">
          <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-amber-500/10 text-amber-600 dark:text-amber-400 border border-amber-500/20 text-xs font-black uppercase tracking-wider mb-1">
            <ShieldAlert className="h-3.5 w-3.5" />
            Acceso Web Restringido
          </div>
          <h1 className="text-2xl md:text-3xl font-black tracking-tight text-foreground">
            Instalación Obligatoria de la App de Escritorio
          </h1>
          <p className="text-xs md:text-sm text-muted-foreground leading-relaxed">
            Por disposición administrativa de Sekunet, el uso del sistema a través de navegadores web convencionales ha sido inhabilitado.
            Para garantizar el monitoreo de tareas, alertas en tiempo real y seguridad del taller, debe utilizar la aplicación oficial para Windows.
          </p>
        </div>

        {/* Beneficios / Requisitos */}
        <div className="rounded-2xl border border-border/60 bg-muted/30 p-4 text-left space-y-2.5 text-xs">
          <div className="flex items-center gap-2.5 text-foreground/90 font-medium">
            <CheckCircle2 className="h-4 w-4 text-emerald-500 shrink-0" />
            <span>Alertas sonoras y notificaciones nativas de Windows en segundo plano.</span>
          </div>
          <div className="flex items-center gap-2.5 text-foreground/90 font-medium">
            <CheckCircle2 className="h-4 w-4 text-emerald-500 shrink-0" />
            <span>Monitoreo preciso de productividad y tareas de taller.</span>
          </div>
          <div className="flex items-center gap-2.5 text-foreground/90 font-medium">
            <CheckCircle2 className="h-4 w-4 text-emerald-500 shrink-0" />
            <span>Actualizaciones automáticas integradas y mayor velocidad de carga.</span>
          </div>
        </div>

        {/* Botón de acción principal de descarga */}
        <div className="space-y-3 pt-2">
          <a
            href="/api/download/electron"
            onClick={() => setDownloadStarted(true)}
            className="w-full flex items-center justify-center gap-3 px-6 py-4 rounded-2xl bg-gradient-to-r from-brand-600 to-brand-500 hover:from-brand-500 hover:to-brand-600 text-white font-bold text-sm md:text-base shadow-lg shadow-brand-500/25 transition-all hover:scale-[1.01] active:scale-[0.99]"
          >
            <Download className="h-5 w-5" />
            <span>Descargar App para Windows (.EXE)</span>
          </a>

          {downloadStarted && (
            <p className="text-[11px] text-emerald-600 dark:text-emerald-400 font-semibold animate-pulse">
              ✓ Tu descarga ha comenzado. Ejecuta el archivo instalado para ingresar a la plataforma.
            </p>
          )}

          <p className="text-[11px] text-muted-foreground">
            Compatible con Windows 10 y Windows 11. Una vez instalada, inicie sesión normalmente.
          </p>
        </div>
      </div>
    </div>
  );
}
