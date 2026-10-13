"use client";

import { useState } from "react";
import { toast } from "sonner";
import { Monitor, Globe, ShieldAlert, Download, Laptop } from "lucide-react";

export function RequireElectronToggle({ initialValue }: { initialValue: boolean }) {
  const [requireElectron, setRequireElectron] = useState(initialValue);
  const [loading, setLoading] = useState(false);

  const toggle = async () => {
    setLoading(true);
    const newValue = !requireElectron;
    try {
      const res = await fetch("/api/admin/require-electron", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ require_electron: newValue }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Error al actualizar la configuración");
      
      setRequireElectron(data.require_electron);
      toast.success(
        data.require_electron
          ? "Obligatoriedad activada: Solo usuarios en la app de escritorio (o localhost / superadmins) podrán acceder."
          : "Obligatoriedad desactivada: Los usuarios pueden ingresar desde cualquier navegador web."
      );
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div
      className={`rounded-2xl border-2 p-5 transition-all ${
        requireElectron ? "border-brand-500/50 bg-brand-500/8 shadow-sm" : "border-border/60 bg-card"
      }`}
    >
      <div className="flex items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div
            className={`h-10 w-10 rounded-xl grid place-items-center shrink-0 ${
              requireElectron
                ? "bg-brand-500/20 text-brand-600 dark:text-brand-400"
                : "bg-muted text-muted-foreground"
            }`}
          >
            {requireElectron ? <Laptop className="h-5 w-5" /> : <Globe className="h-5 w-5" />}
          </div>
          <div>
            <div className="flex items-center gap-2">
              <p className={`text-sm font-black ${requireElectron ? "text-brand-600 dark:text-brand-400" : "text-foreground"}`}>
                {requireElectron ? "🔒 EXIGIR APP DE ESCRITORIO (ELECTRON) ACTIVO" : "Exigir App de Escritorio (Electron)"}
              </p>
              <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20">
                Localhost & Superadmin Exonerados
              </span>
            </div>
            <p className="text-[11px] text-muted-foreground mt-0.5 max-w-xl">
              {requireElectron
                ? "Los usuarios que ingresen desde navegadores estándar (Chrome, Edge, etc.) en producción verán una pantalla de bloqueo obligándolos a descargar e instalar la app de escritorio."
                : "Permite el acceso a la plataforma tanto desde navegadores web convencionales como desde la app de escritorio de Electron."}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-3 shrink-0">
          <a
            href="/api/download/electron"
            target="_blank"
            rel="noopener noreferrer"
            title="Descargar instalador oficial (.exe)"
            className="hidden sm:inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-lg border border-border/80 bg-background hover:bg-muted text-foreground transition-colors"
          >
            <Download className="h-3.5 w-3.5 text-brand-500" />
            <span>Descargar .EXE</span>
          </a>
          <button
            onClick={toggle}
            disabled={loading}
            aria-label="Alternar obligatoriedad de app de escritorio"
            className={`relative shrink-0 h-7 w-12 rounded-full transition-colors duration-200 focus:outline-none disabled:opacity-50 ${
              requireElectron ? "bg-brand-600" : "bg-muted-foreground/30"
            }`}
          >
            <span
              className={`absolute top-0.5 h-6 w-6 rounded-full bg-white shadow transition-transform duration-200 ${
                requireElectron ? "translate-x-5" : "translate-x-0.5"
              }`}
            />
          </button>
        </div>
      </div>
    </div>
  );
}
