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
        requireElectron
          ? "border-brand-500/40 bg-brand-500/5 shadow-xs"
          : "border-border/60 bg-card"
      }`}
    >
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="flex items-center gap-3.5">
          <div
            className={`h-10 w-10 rounded-xl grid place-items-center shrink-0 transition-colors ${
              requireElectron
                ? "bg-brand-500/15 text-brand-600 dark:text-brand-400"
                : "bg-muted text-muted-foreground"
            }`}
          >
            {requireElectron ? <Laptop className="h-5 w-5" /> : <Globe className="h-5 w-5" />}
          </div>
          <div>
            <div className="flex items-center gap-2 flex-wrap">
              <p
                className={`text-sm font-black tracking-tight ${
                  requireElectron ? "text-brand-600 dark:text-brand-400" : "text-foreground"
                }`}
              >
                {requireElectron ? "Exigir App de Escritorio: ACTIVO" : "Exigir App de Escritorio (Electron)"}
              </p>
              <span className="text-[9px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-md bg-muted text-muted-foreground border border-border/70">
                Localhost & Superadmin Exonerados
              </span>
            </div>
            <p className="text-[11px] text-muted-foreground mt-0.5 max-w-xl">
              {requireElectron
                ? "Acceso web en producción restringido para usuarios regulares. Deben usar la app oficial de Windows."
                : "Permite el acceso a la plataforma tanto desde navegadores web como desde la aplicación de escritorio."}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-3 shrink-0 self-end sm:self-center">
          <a
            href="/api/download/electron"
            target="_blank"
            rel="noopener noreferrer"
            title="Descargar instalador (.exe)"
            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-xl border border-border/70 bg-card hover:bg-muted text-foreground transition-all hover:border-brand-500/40"
          >
            <Download className="h-3.5 w-3.5 text-brand-500" />
            <span>Instalador (.exe)</span>
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
