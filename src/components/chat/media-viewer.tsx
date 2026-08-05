"use client";

import * as React from "react";
import { X, Download, ZoomIn, ZoomOut, RotateCcw, Play, Pause } from "lucide-react";

interface MediaViewerProps {
  url: string;
  type?: string;
  name?: string;
  onClose: () => void;
}

export function MediaViewer({ url, type, name, onClose }: MediaViewerProps) {
  const isVideo = (type || "").startsWith("video/") ||
    /\.(mp4|mov|webm|mkv)(\?|$)/i.test(url);
  const isImage = (type || "").startsWith("image/") ||
    /\.(jpg|jpeg|png|gif|webp|svg|bmp)(\?|$)/i.test(url);

  const [scale, setScale] = React.useState(1);
  const [tx, setTx] = React.useState(0);
  const [ty, setTy] = React.useState(0);
  const [dragging, setDragging] = React.useState(false);
  const dragStart = React.useRef({ x: 0, y: 0, tx: 0, ty: 0 });
  const [playing, setPlaying] = React.useState(false);
  const videoRef = React.useRef<HTMLVideoElement>(null);

  // Reset transform on open
  React.useEffect(() => {
    setScale(1); setTx(0); setTy(0);
  }, [url]);

  // Keyboard controls
  React.useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
      if (e.key === "+" || e.key === "=") setScale(s => Math.min(s + 0.25, 5));
      if (e.key === "-") setScale(s => Math.max(s - 0.25, 0.5));
      if (e.key === "0") { setScale(1); setTx(0); setTy(0); }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  // Wheel zoom
  function onWheel(e: React.WheelEvent) {
    e.preventDefault();
    const delta = e.deltaY > 0 ? -0.15 : 0.15;
    setScale(s => Math.max(0.5, Math.min(s + delta, 5)));
  }

  // Pan
  function onPointerDown(e: React.PointerEvent) {
    if (scale <= 1) return;
    setDragging(true);
    dragStart.current = { x: e.clientX, y: e.clientY, tx, ty };
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
  }
  function onPointerMove(e: React.PointerEvent) {
    if (!dragging) return;
    setTx(dragStart.current.tx + (e.clientX - dragStart.current.x));
    setTy(dragStart.current.ty + (e.clientY - dragStart.current.y));
  }
  function onPointerUp() {
    setDragging(false);
  }

  function zoomIn() { setScale(s => Math.min(s + 0.25, 5)); }
  function zoomOut() { setScale(s => Math.max(s - 0.25, 0.5)); }
  function reset() { setScale(1); setTx(0); setTy(0); }

  async function handleDownload(e: React.MouseEvent) {
    e.stopPropagation();
    try {
      const res = await fetch(url);
      const blob = await res.blob();
      const blobUrl = window.URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = blobUrl;
      a.download = name || (isVideo ? "video" : isImage ? "imagen" : "archivo");
      document.body.appendChild(a);
      a.click();
      a.remove();
      window.URL.revokeObjectURL(blobUrl);
    } catch {
      window.open(url, "_blank");
    }
  }

  function togglePlay(e: React.MouseEvent) {
    e.stopPropagation();
    const v = videoRef.current;
    if (!v) return;
    if (playing) { v.pause(); setPlaying(false); }
    else { v.play().catch(() => {}); setPlaying(true); }
  }

  const transform = `translate(${tx}px, ${ty}px) scale(${scale})`;

  return (
    <div
      className="fixed inset-0 z-[9999] bg-black/95 flex items-center justify-center select-none"
      onClick={onClose}
      onWheel={onWheel}
    >
      {/* Top bar */}
      <div className="absolute top-0 left-0 right-0 z-10 flex items-center justify-between px-4 py-3 bg-gradient-to-b from-black/60 to-transparent">
        <span className="text-xs text-white/70 truncate max-w-[50%]">{name || (isVideo ? "Video" : "Imagen")}</span>
        <div className="flex items-center gap-2">
          {/* Zoom controls */}
          <button onClick={(e) => { e.stopPropagation(); zoomOut(); }} className="p-2 rounded-lg hover:bg-white/10 text-white transition-colors" title="Alejar (-)">
            <ZoomOut className="h-5 w-5" />
          </button>
          <span className="text-xs text-white/60 w-12 text-center tabular-nums">{Math.round(scale * 100)}%</span>
          <button onClick={(e) => { e.stopPropagation(); zoomIn(); }} className="p-2 rounded-lg hover:bg-white/10 text-white transition-colors" title="Acercar (+)">
            <ZoomIn className="h-5 w-5" />
          </button>
          <button onClick={(e) => { e.stopPropagation(); reset(); }} className="p-2 rounded-lg hover:bg-white/10 text-white transition-colors" title="Restablecer (0)">
            <RotateCcw className="h-5 w-5" />
          </button>
          <div className="w-px h-6 bg-white/20 mx-1" />
          {/* Download */}
          <button onClick={handleDownload} className="p-2 rounded-lg hover:bg-white/10 text-white transition-colors" title="Descargar">
            <Download className="h-5 w-5" />
          </button>
          {/* Close */}
          <button onClick={onClose} className="p-2 rounded-lg hover:bg-white/10 text-white transition-colors" title="Cerrar (Esc)">
            <X className="h-5 w-5" />
          </button>
        </div>
      </div>

      {/* Media */}
      <div
        className="relative w-full h-full flex items-center justify-center overflow-hidden"
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
        style={{ cursor: scale > 1 ? (dragging ? "grabbing" : "grab") : "default" }}
        onClick={(e) => e.stopPropagation()}
      >
        {isVideo ? (
          <div className="relative" style={{ transform, transition: dragging ? "none" : "transform 0.1s" }}>
            <video
              ref={videoRef}
              src={url}
              controls
              playsInline
              className="max-w-[90vw] max-h-[85vh] rounded-lg"
              onEnded={() => setPlaying(false)}
              onClick={(e) => e.stopPropagation()}
            />
          </div>
        ) : isImage ? (
          <img
            src={url}
            alt={name || "Vista completa"}
            className="max-w-[90vw] max-h-[85vh] object-contain rounded-lg shadow-2xl"
            style={{ transform, transition: dragging ? "none" : "transform 0.1s" }}
            draggable={false}
          />
        ) : (
          <div className="text-white/60 text-sm">Formato no soportado para vista previa</div>
        )}
      </div>

      {/* Bottom hint */}
      <div className="absolute bottom-4 left-1/2 -translate-x-1/2 text-[10px] text-white/40 flex items-center gap-3 pointer-events-none">
        <span>Rueda = Zoom</span>
        <span>Arrastrar = Pan</span>
        <span>Esc = Cerrar</span>
      </div>
    </div>
  );
}
