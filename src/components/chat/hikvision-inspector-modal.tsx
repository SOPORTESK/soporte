"use client";

import React, { useState, useEffect } from "react";
import { 
  ShieldCheck, 
  Cpu, 
  KeyRound, 
  CheckCircle2, 
  Info, 
  Loader2, 
  AlertCircle,
  Download,
  X
} from "lucide-react";
import { Button } from "@/components/ui/button";
import type { HikvisionInspectionResult } from "@/lib/hikvision-config-parser";

interface HikvisionInspectorModalProps {
  isOpen: boolean;
  onClose: () => void;
  fileUrl?: string;
  fileName?: string;
}

export function HikvisionInspectorModal({
  isOpen,
  onClose,
  fileUrl,
  fileName,
}: HikvisionInspectorModalProps) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [inspection, setInspection] = useState<HikvisionInspectionResult | null>(null);

  useEffect(() => {
    if (isOpen && fileUrl) {
      loadInspection();
    } else {
      setInspection(null);
      setError(null);
    }
  }, [isOpen, fileUrl]);

  async function loadInspection() {
    if (!fileUrl) return;
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/tools/hikvision-inspect", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ fileUrl, name: fileName }),
      });
      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.error || "No se pudo inspeccionar el archivo.");
      }
      setInspection(data.result);
    } catch (err: any) {
      console.error("[HikvisionInspectorModal] Error:", err);
      setError(err.message || "Error al analizar archivo.");
    } finally {
      setLoading(false);
    }
  }

  if (!isOpen) return null;

  const isSADP = inspection?.fileType === "SADP_RESET_XML";

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/75 backdrop-blur-sm">
      <div className="bg-neutral-950 border border-neutral-800 rounded-2xl w-full max-w-2xl max-h-[90vh] flex flex-col shadow-2xl overflow-hidden animate-in fade-in zoom-in-95 duration-200 text-neutral-100">
        
        {/* Header */}
        <div className="flex items-center justify-between p-5 border-b border-neutral-800 bg-gradient-to-r from-red-950/40 via-neutral-900 to-neutral-950">
          <div className="flex items-center gap-3 min-w-0">
            <div className="h-10 w-10 rounded-xl bg-red-600/20 border border-red-500/30 flex items-center justify-center text-red-400 shrink-0">
              {isSADP ? <KeyRound className="h-5 w-5" /> : <ShieldCheck className="h-5 w-5" />}
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <h2 className="text-base font-bold text-white truncate">
                  Inspección de Archivo Hikvision
                </h2>
                {inspection?.recognized && (
                  <span className="px-2 py-0.5 rounded-full text-[10px] font-mono uppercase bg-red-500/20 text-red-300 border border-red-500/30">
                    {isSADP ? "SADP Reset" : "Config Backup"}
                  </span>
                )}
              </div>
              <p className="text-xs text-neutral-400 mt-0.5 truncate max-w-md">
                {fileName || "Archivo de configuración o soporte de CCTV"}
              </p>
            </div>
          </div>
          <button 
            onClick={onClose} 
            className="p-1.5 rounded-lg hover:bg-neutral-800 text-neutral-400 hover:text-white transition-colors ml-2"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 p-6 space-y-5 overflow-y-auto max-h-[75vh]">
          {loading && (
            <div className="py-12 flex flex-col items-center justify-center gap-3 text-neutral-400">
              <Loader2 className="h-8 w-8 animate-spin text-red-500" />
              <p className="text-sm font-medium">Analizando estructura binaria y cabeceras...</p>
            </div>
          )}

          {error && (
            <div className="p-4 rounded-xl bg-red-950/30 border border-red-800/50 flex items-start gap-3 text-red-300">
              <AlertCircle className="h-5 w-5 shrink-0 mt-0.5" />
              <div className="text-xs space-y-1">
                <p className="font-semibold text-sm">Error en el análisis</p>
                <p>{error}</p>
              </div>
            </div>
          )}

          {inspection && !loading && (
            <div className="space-y-5">
              {/* Card de Resumen Principal */}
              <div className="p-4 rounded-xl bg-neutral-900/90 border border-neutral-800 space-y-2">
                <div className="flex items-center gap-2 text-red-400 font-semibold text-sm">
                  <Info className="h-4 w-4" />
                  <span>{inspection.details.title}</span>
                </div>
                <p className="text-xs text-neutral-300 leading-relaxed">
                  {inspection.details.description}
                </p>
              </div>

              {/* Parámetros detectados */}
              {inspection.details.parameters && (
                <div className="space-y-2">
                  <h4 className="text-xs font-semibold text-neutral-400 uppercase tracking-wider flex items-center gap-1.5">
                    <Cpu className="h-3.5 w-3.5 text-neutral-500" />
                    Parámetros Técnicos Detectados
                  </h4>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                    {Object.entries(inspection.details.parameters).map(([key, value]) => (
                      <div
                        key={key}
                        className="p-3 rounded-lg bg-neutral-900/60 border border-neutral-800/80 flex flex-col gap-0.5"
                      >
                        <span className="text-[10px] font-medium text-neutral-400">{key}</span>
                        <span className="text-xs font-semibold text-neutral-100 font-mono break-all">
                          {String(value)}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Recomendación Operativa */}
              <div className="p-4 rounded-xl bg-emerald-950/20 border border-emerald-800/40 space-y-1.5">
                <div className="flex items-center gap-2 text-emerald-400 font-semibold text-xs">
                  <CheckCircle2 className="h-4 w-4" />
                  <span>Procedimiento Recomendado para el Técnico / Cliente</span>
                </div>
                <p className="text-xs text-emerald-200/90 leading-relaxed">
                  {inspection.details.recommendation}
                </p>
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="p-4 bg-neutral-900/70 border-t border-neutral-800 flex justify-between items-center">
          {fileUrl ? (
            <Button
              variant="outline"
              size="sm"
              className="gap-2 border-neutral-700 hover:bg-neutral-800 text-xs text-neutral-200"
              onClick={() => {
                const a = document.createElement("a");
                a.href = fileUrl;
                a.download = fileName || "hikvision-file";
                a.click();
              }}
            >
              <Download className="h-3.5 w-3.5" />
              Descargar Archivo Original
            </Button>
          ) : <div />}
          <Button
            onClick={onClose}
            className="bg-red-600 hover:bg-red-500 text-white text-xs font-semibold"
          >
            Cerrar Visor
          </Button>
        </div>
      </div>
    </div>
  );
}
