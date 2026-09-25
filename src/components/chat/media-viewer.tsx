"use client";

import * as React from "react";
import {
  X, Download, ZoomIn, ZoomOut, RotateCcw, Play, Pause,
  Copy, Check, Search, FileCode, FileText, FileArchive, Loader2
} from "lucide-react";

interface MediaViewerProps {
  url: string;
  type?: string;
  name?: string;
  onClose: () => void;
}

export function MediaViewer({ url, type, name, onClose }: MediaViewerProps) {
  const ext = (name || url).split("?")[0].split(".").pop()?.toLowerCase() || "";
  
  const isVideo = (type || "").startsWith("video/") ||
    /\.(mp4|mov|webm|mkv)(\?|$)/i.test(url);
  const isImage = (type || "").startsWith("image/") ||
    /\.(jpg|jpeg|png|gif|webp|svg|bmp)(\?|$)/i.test(url);
  const isPdf = (type || "").includes("pdf") || ext === "pdf";
  const isTextDoc = ["xml", "txt", "json", "csv", "log", "html", "htm", "sql", "yaml", "yml"].includes(ext) ||
    (type || "").includes("xml") || (type || "").includes("text/") || (type || "").includes("json");
  const isArchive = ["zip", "rar", "7z", "tar", "gz"].includes(ext) ||
    (type || "").includes("zip") || (type || "").includes("compressed");

  const [scale, setScale] = React.useState(1);
  const [tx, setTx] = React.useState(0);
  const [ty, setTy] = React.useState(0);
  const [dragging, setDragging] = React.useState(false);
  const dragStart = React.useRef({ x: 0, y: 0, tx: 0, ty: 0 });
  const [playing, setPlaying] = React.useState(false);
  const videoRef = React.useRef<HTMLVideoElement>(null);

  // Estados para visor de texto/XML/JSON
  const [textContent, setTextContent] = React.useState<string | null>(null);
  const [loadingText, setLoadingText] = React.useState(false);
  const [textError, setTextError] = React.useState<string | null>(null);
  const [searchTerm, setSearchTerm] = React.useState("");
  const [copied, setCopied] = React.useState(false);

  // Cargar texto de archivos XML / TXT / JSON / CSV
  React.useEffect(() => {
    if (isTextDoc && url) {
      setLoadingText(true);
      setTextError(null);
      fetch(url)
        .then(async (res) => {
          if (!res.ok) throw new Error(`HTTP ${res.status}`);
          return res.text();
        })
        .then((txt) => setTextContent(txt))
        .catch((err) => setTextError(err.message || "Error al cargar contenido"))
        .finally(() => setLoadingText(false));
    }
  }, [isTextDoc, url]);

  // Reset transform on open
  React.useEffect(() => {
    setScale(1); setTx(0); setTy(0);
  }, [url]);

  // Keyboard controls
  React.useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
      if (!isTextDoc && !isPdf) {
        if (e.key === "+" || e.key === "=") setScale(s => Math.min(s + 0.25, 5));
        if (e.key === "-") setScale(s => Math.max(s - 0.25, 0.5));
        if (e.key === "0") { setScale(1); setTx(0); setTy(0); }
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose, isTextDoc, isPdf]);

  // Wheel zoom
  function onWheel(e: React.WheelEvent) {
    if (isTextDoc || isPdf || isArchive) return;
    e.preventDefault();
    const delta = e.deltaY > 0 ? -0.15 : 0.15;
    setScale(s => Math.max(0.5, Math.min(s + delta, 5)));
  }

  // Pan
  function onPointerDown(e: React.PointerEvent) {
    if (isTextDoc || isPdf || isArchive) return;
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
      a.download = name || (isVideo ? "video.mp4" : isImage ? "imagen.jpg" : isPdf ? "documento.pdf" : "archivo");
      document.body.appendChild(a);
      a.click();
      a.remove();
      window.URL.revokeObjectURL(blobUrl);
    } catch {
      window.open(url, "_blank");
    }
  }

  function handleCopy() {
    if (!textContent) return;
    navigator.clipboard.writeText(textContent);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  const transform = `translate(${tx}px, ${ty}px) scale(${scale})`;

  // Líneas de texto con filtro de búsqueda
  const filteredLines = React.useMemo(() => {
    if (!textContent) return [];
    const lines = textContent.split("\n");
    if (!searchTerm.trim()) return lines.map((l, i) => ({ num: i + 1, text: l, match: false }));
    const term = searchTerm.toLowerCase();
    return lines.map((l, i) => ({
      num: i + 1,
      text: l,
      match: l.toLowerCase().includes(term)
    }));
  }, [textContent, searchTerm]);

  return (
    <div
      className="fixed inset-0 z-[9999] bg-black/90 backdrop-blur-sm flex items-center justify-center select-none"
      onClick={onClose}
      onWheel={onWheel}
    >
      {/* Top bar */}
      <div className="absolute top-0 left-0 right-0 z-20 flex items-center justify-between px-4 py-3 bg-gradient-to-b from-black/80 via-black/50 to-transparent">
        <div className="flex items-center gap-2.5 max-w-[60%]">
          {isTextDoc && <FileCode className="h-5 w-5 text-amber-400 shrink-0" />}
          {isPdf && <FileText className="h-5 w-5 text-rose-400 shrink-0" />}
          {isArchive && <FileArchive className="h-5 w-5 text-purple-400 shrink-0" />}
          <span className="text-sm font-semibold text-white truncate">
            {name || (isVideo ? "Video" : isImage ? "Imagen" : isPdf ? "Documento PDF" : isTextDoc ? `Archivo ${ext.toUpperCase()}` : "Archivo")}
          </span>
          {ext && (
            <span className="text-[10px] font-black px-1.5 py-0.5 rounded uppercase tracking-wider bg-white/10 text-white/80 border border-white/15 shrink-0">
              {ext}
            </span>
          )}
        </div>

        <div className="flex items-center gap-2">
          {/* Zoom controls (solo para imágenes y videos) */}
          {(isImage || isVideo) && (
            <>
              <button onClick={(e) => { e.stopPropagation(); zoomOut(); }} className="p-2 rounded-lg hover:bg-white/10 text-white transition-colors" title="Alejar (-)">
                <ZoomOut className="h-4 w-4" />
              </button>
              <span className="text-xs text-white/60 w-12 text-center tabular-nums">{Math.round(scale * 100)}%</span>
              <button onClick={(e) => { e.stopPropagation(); zoomIn(); }} className="p-2 rounded-lg hover:bg-white/10 text-white transition-colors" title="Acercar (+)">
                <ZoomIn className="h-4 w-4" />
              </button>
              <button onClick={(e) => { e.stopPropagation(); reset(); }} className="p-2 rounded-lg hover:bg-white/10 text-white transition-colors" title="Restablecer (0)">
                <RotateCcw className="h-4 w-4" />
              </button>
              <div className="w-px h-6 bg-white/20 mx-1" />
            </>
          )}

          {/* Copiar texto (para documentos de texto/XML/JSON) */}
          {isTextDoc && textContent && (
            <button
              onClick={(e) => { e.stopPropagation(); handleCopy(); }}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-white/10 hover:bg-white/20 text-white text-xs font-medium transition-colors"
              title="Copiar contenido"
            >
              {copied ? <Check className="h-4 w-4 text-emerald-400" /> : <Copy className="h-4 w-4" />}
              <span>{copied ? "Copiado" : "Copiar todo"}</span>
            </button>
          )}

          {/* Download */}
          <button
            onClick={handleDownload}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-medium transition-colors shadow-sm"
            title="Descargar archivo"
          >
            <Download className="h-4 w-4" />
            <span className="hidden sm:inline">Descargar</span>
          </button>

          {/* Close */}
          <button
            onClick={onClose}
            className="p-2 rounded-lg hover:bg-white/10 text-white transition-colors ml-1"
            title="Cerrar (Esc)"
          >
            <X className="h-5 w-5" />
          </button>
        </div>
      </div>

      {/* Main Content Area */}
      <div
        className="relative w-full h-full flex items-center justify-center p-4 pt-16 pb-8 overflow-hidden"
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
        style={{ cursor: (!isTextDoc && !isPdf && scale > 1) ? (dragging ? "grabbing" : "grab") : "default" }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* CASO 1: Archivo de Texto / XML / JSON / CSV */}
        {isTextDoc ? (
          <div className="w-full max-w-5xl h-[86vh] flex flex-col rounded-2xl bg-neutral-950 border border-white/15 shadow-2xl overflow-hidden">
            {/* Barra interna de búsqueda y estadísticas */}
            <div className="flex items-center justify-between px-4 py-2.5 bg-neutral-900 border-b border-white/10 text-xs">
              <div className="flex items-center gap-2 flex-1 max-w-md">
                <Search className="h-3.5 w-3.5 text-white/40 shrink-0" />
                <input
                  type="text"
                  placeholder="Buscar texto en el documento (ej: serie, código, etiqueta)..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="bg-neutral-800/80 border border-white/10 rounded-md px-2.5 py-1 text-white text-xs placeholder:text-white/30 focus:outline-none focus:border-amber-500 w-full"
                />
              </div>
              <div className="flex items-center gap-3 text-white/50 text-[11px]">
                {searchTerm && (
                  <span className="text-amber-400 font-semibold">
                    {filteredLines.filter(l => l.match).length} coincidencia(s)
                  </span>
                )}
                <span>{filteredLines.length} líneas</span>
              </div>
            </div>

            {/* Contenido con scroll y numeración de líneas */}
            <div className="flex-1 overflow-auto p-4 font-mono text-xs leading-relaxed select-text bg-neutral-950">
              {loadingText ? (
                <div className="flex flex-col items-center justify-center h-full gap-2 text-white/60">
                  <Loader2 className="h-7 w-7 animate-spin text-amber-400" />
                  <p>Cargando vista previa del documento...</p>
                </div>
              ) : textError ? (
                <div className="flex flex-col items-center justify-center h-full gap-3 text-rose-400">
                  <p className="text-sm font-semibold">No se pudo cargar la vista previa directa</p>
                  <p className="text-xs text-white/60">{textError}</p>
                  <button
                    onClick={handleDownload}
                    className="mt-2 px-4 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white font-sans text-xs flex items-center gap-2"
                  >
                    <Download className="h-4 w-4" />
                    Descargar archivo para ver en tu equipo
                  </button>
                </div>
              ) : (
                <div className="divide-y divide-white/[0.03]">
                  {filteredLines.map((l) => (
                    <div
                      key={l.num}
                      className={`flex gap-3 py-0.5 px-1 rounded transition-colors ${
                        l.match ? "bg-amber-500/20 text-amber-200 font-medium" : "hover:bg-white/[0.04] text-slate-300"
                      }`}
                    >
                      <span className="w-12 shrink-0 text-right text-white/20 select-none text-[11px] tabular-nums">
                        {l.num}
                      </span>
                      <pre className="flex-1 whitespace-pre-wrap break-all font-mono">
                        {l.text}
                      </pre>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        ) : isPdf ? (
          /* CASO 2: Documento PDF */
          <div className="w-[94vw] max-w-6xl h-[86vh] rounded-2xl bg-neutral-900 border border-white/15 shadow-2xl overflow-hidden flex flex-col">
            <iframe
              src={`${url}#toolbar=1`}
              className="w-full h-full bg-white"
              title={name || "Visor PDF"}
            />
          </div>
        ) : isArchive ? (
          /* CASO 3: Archivo Comprimido ZIP / RAR */
          <div className="max-w-md w-full rounded-2xl bg-neutral-900 border border-purple-500/30 p-8 shadow-2xl text-center flex flex-col items-center gap-4">
            <div className="h-20 w-20 rounded-2xl bg-purple-500/20 border border-purple-500/40 flex items-center justify-center text-purple-300 shadow-inner">
              <FileArchive className="h-10 w-10" />
            </div>
            <div>
              <div className="inline-block px-2.5 py-0.5 rounded-full text-[11px] font-black uppercase tracking-wider bg-purple-500/30 text-purple-200 border border-purple-500/40 mb-2">
                Paquete Comprimido {ext.toUpperCase()}
              </div>
              <h3 className="text-base font-semibold text-white break-all">{name || `archivo.${ext}`}</h3>
              <p className="text-xs text-white/60 mt-1.5">
                Este archivo contiene múltiples elementos empaquetados. Descárgalo para descomprimirlo y ver su contenido.
              </p>
            </div>
            <button
              onClick={handleDownload}
              className="w-full mt-2 py-3 rounded-xl bg-purple-600 hover:bg-purple-500 text-white font-semibold text-sm flex items-center justify-center gap-2 shadow-lg transition-all active:scale-[0.98]"
            >
              <Download className="h-4 w-4" />
              Descargar {ext.toUpperCase()}
            </button>
          </div>
        ) : isVideo ? (
          /* CASO 4: Video */
          <div className="relative" style={{ transform, transition: dragging ? "none" : "transform 0.1s" }}>
            <video
              ref={videoRef}
              src={url}
              controls
              playsInline
              className="max-w-[90vw] max-h-[85vh] rounded-lg shadow-2xl"
              onEnded={() => setPlaying(false)}
              onClick={(e) => e.stopPropagation()}
            />
          </div>
        ) : isImage ? (
          /* CASO 5: Imagen */
          <img
            src={url}
            alt={name || "Vista completa"}
            className="max-w-[90vw] max-h-[85vh] object-contain rounded-lg shadow-2xl"
            style={{ transform, transition: dragging ? "none" : "transform 0.1s" }}
            draggable={false}
          />
        ) : (
          /* CASO 6: Otro formato */
          <div className="max-w-md w-full rounded-2xl bg-neutral-900 border border-white/15 p-8 shadow-2xl text-center flex flex-col items-center gap-4">
            <div className="h-16 w-16 rounded-2xl bg-white/10 flex items-center justify-center text-white/60">
              <FileText className="h-8 w-8" />
            </div>
            <div>
              <h3 className="text-sm font-semibold text-white break-all">{name || "Archivo adjunto"}</h3>
              <p className="text-xs text-white/50 mt-1">Descarga el archivo para abrirlo con el software correspondiente en tu equipo.</p>
            </div>
            <button
              onClick={handleDownload}
              className="w-full mt-2 py-2.5 rounded-xl bg-white/15 hover:bg-white/25 text-white font-medium text-xs flex items-center justify-center gap-2 transition"
            >
              <Download className="h-4 w-4" />
              Descargar archivo
            </button>
          </div>
        )}
      </div>

      {/* Bottom hint para imágenes/videos */}
      {(isImage || isVideo) && (
        <div className="absolute bottom-4 left-1/2 -translate-x-1/2 text-[10px] text-white/40 flex items-center gap-3 pointer-events-none">
          <span>Rueda = Zoom</span>
          <span>Arrastrar = Pan</span>
          <span>Esc = Cerrar</span>
        </div>
      )}
    </div>
  );
}
