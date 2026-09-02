"use client";

import React, { useState, useEffect } from "react";
import {
  Camera,
  Maximize2,
  X,
  ChevronLeft,
  ChevronRight,
  Download,
  Clock,
  Laptop,
  RefreshCw,
} from "lucide-react";

interface ScreenshotItem {
  id: string;
  name: string;
  url: string;
  created_at: string;
  size: number;
}

interface Props {
  agentEmail?: string;
  agentName?: string;
  date: string;
}

function formatTime(iso: string): string {
  try {
    return new Date(iso).toLocaleTimeString("es-CR", {
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    });
  } catch {
    return "";
  }
}

export function ActivityScreenGallery({ agentEmail, agentName, date }: Props) {
  const [screenshots, setScreenshots] = useState<ScreenshotItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [selectedIdx, setSelectedIdx] = useState<number | null>(null);

  const fetchScreenshots = async () => {
    if (!agentEmail) return;
    setLoading(true);
    try {
      const res = await fetch(`/api/activity/screenshots?agent=${encodeURIComponent(agentEmail)}&date=${date}`);
      const data = await res.json();
      setScreenshots(data.screenshots || []);
    } catch (e) {
      console.error("[gallery] error:", e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchScreenshots();
  }, [agentEmail, date]);

  // Navegación con teclado en modal
  useEffect(() => {
    if (selectedIdx === null) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") setSelectedIdx(null);
      if (e.key === "ArrowLeft" && selectedIdx > 0) setSelectedIdx(selectedIdx - 1);
      if (e.key === "ArrowRight" && selectedIdx < screenshots.length - 1) setSelectedIdx(selectedIdx + 1);
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [selectedIdx, screenshots.length]);

  if (!agentEmail) {
    return (
      <div className="p-12 text-center rounded-2xl bg-card border border-border/70 text-muted-foreground text-xs">
        Seleccione un colaborador para ver sus capturas de pantalla de escritorio.
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Camera className="h-4 w-4 text-violet-500" />
          <h3 className="font-bold text-sm text-foreground">
            Auditoría Visual de Pantalla — {agentName || agentEmail} ({date})
          </h3>
          <span className="text-xs font-semibold px-2.5 py-0.5 rounded-full bg-violet-500/10 text-violet-400 border border-violet-500/20">
            {screenshots.length} capturas
          </span>
        </div>

        <button
          onClick={fetchScreenshots}
          disabled={loading}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-border bg-card hover:bg-muted text-xs font-semibold transition-colors disabled:opacity-50"
        >
          <RefreshCw className={`h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`} />
          Refrescar capturas
        </button>
      </div>

      {loading ? (
        <div className="p-12 text-center rounded-2xl bg-card border border-border/70 text-muted-foreground text-xs">
          Cargando capturas de pantalla...
        </div>
      ) : screenshots.length === 0 ? (
        <div className="p-12 text-center rounded-2xl bg-card border border-border/70 space-y-2">
          <Laptop className="h-8 w-8 text-muted-foreground/50 mx-auto" />
          <p className="text-xs font-medium text-foreground">No hay capturas registradas para esta fecha.</p>
          <p className="text-[11px] text-muted-foreground">
            Las capturas se registran automáticamente cada 60 segundos cuando el colaborador tiene la app de Electron abierta.
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3">
          {screenshots.map((item, idx) => (
            <div
              key={item.id}
              onClick={() => setSelectedIdx(idx)}
              className="group relative rounded-xl border border-border/70 bg-card overflow-hidden cursor-pointer hover:border-violet-500/60 hover:shadow-lg transition-all"
            >
              <div className="aspect-video bg-muted/40 overflow-hidden relative">
                <img
                  src={item.url}
                  alt={`Captura ${formatTime(item.created_at)}`}
                  className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                  loading="lazy"
                />
                <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                  <Maximize2 className="h-5 w-5 text-white" />
                </div>
              </div>
              <div className="p-2 flex items-center justify-between text-[11px] font-semibold text-foreground/90 bg-card">
                <span className="flex items-center gap-1">
                  <Clock className="h-3 w-3 text-muted-foreground" />
                  {formatTime(item.created_at)}
                </span>
                <span className="text-[9px] text-muted-foreground uppercase font-mono">HD</span>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Modal Visor en Alta Resolución */}
      {selectedIdx !== null && screenshots[selectedIdx] && (
        <div
          onClick={() => setSelectedIdx(null)}
          className="fixed inset-0 z-[100] bg-black/90 backdrop-blur-md flex flex-col items-center justify-center p-4 sm:p-6 animate-in fade-in duration-200"
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="w-full max-w-5xl bg-card border border-border rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh]"
          >
            {/* Header modal */}
            <div className="p-4 border-b border-border flex items-center justify-between">
              <div className="flex items-center gap-3">
                <span className="h-2.5 w-2.5 rounded-full bg-violet-500" />
                <div>
                  <p className="font-bold text-sm text-foreground">
                    Captura #{selectedIdx + 1} de {screenshots.length} — {formatTime(screenshots[selectedIdx].created_at)}
                  </p>
                  <p className="text-xs text-muted-foreground">{agentName || agentEmail} • {date}</p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <a
                  href={screenshots[selectedIdx].url}
                  download={`captura_${date}_${selectedIdx + 1}.jpg`}
                  target="_blank"
                  rel="noreferrer"
                  className="p-2 rounded-lg border border-border hover:bg-muted text-muted-foreground hover:text-foreground transition-colors"
                  title="Descargar imagen"
                >
                  <Download className="h-4 w-4" />
                </a>
                <button
                  onClick={() => setSelectedIdx(null)}
                  className="p-2 rounded-lg border border-border hover:bg-muted text-muted-foreground hover:text-foreground transition-colors"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
            </div>

            {/* Imagen central con controles */}
            <div className="relative flex-1 bg-black/60 overflow-auto flex items-center justify-center p-2 min-h-[400px]">
              <img
                src={screenshots[selectedIdx].url}
                alt="Captura ampliada"
                className="max-h-[70vh] w-auto object-contain rounded-lg shadow-2xl"
              />

              {/* Botón anterior */}
              {selectedIdx > 0 && (
                <button
                  onClick={() => setSelectedIdx(selectedIdx - 1)}
                  className="absolute left-4 top-1/2 -translate-y-1/2 h-10 w-10 rounded-full bg-black/70 hover:bg-black/90 text-white border border-white/20 grid place-items-center transition-transform hover:scale-110"
                >
                  <ChevronLeft className="h-6 w-6" />
                </button>
              )}

              {/* Botón siguiente */}
              {selectedIdx < screenshots.length - 1 && (
                <button
                  onClick={() => setSelectedIdx(selectedIdx + 1)}
                  className="absolute right-4 top-1/2 -translate-y-1/2 h-10 w-10 rounded-full bg-black/70 hover:bg-black/90 text-white border border-white/20 grid place-items-center transition-transform hover:scale-110"
                >
                  <ChevronRight className="h-6 w-6" />
                </button>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}