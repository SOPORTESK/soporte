"use client";

import * as React from "react";
import {
  X, Download, ZoomIn, ZoomOut, RotateCcw, RotateCw, Play,
  Copy, Check, Search, FileCode, FileText, FileArchive, Loader2,
  ChevronLeft, ChevronRight, MessageSquare
} from "lucide-react";

export interface MediaItem {
  id?: string | number;
  url: string;
  type?: string;
  name?: string;
  senderName?: string;
  time?: string | Date;
  caption?: string;
  messageId?: string | number;
}

interface MediaViewerProps {
  url: string;
  type?: string;
  name?: string;
  mediaList?: MediaItem[];
  initialIndex?: number;
  onJumpToMessage?: (messageId: string | number) => void;
  onClose: () => void;
}

export function MediaViewer({
  url: initialUrl,
  type: initialType,
  name: initialName,
  mediaList = [],
  initialIndex = 0,
  onJumpToMessage,
  onClose
}: MediaViewerProps) {
  // Índice actual dentro de la lista de medios
  const [currentIndex, setCurrentIndex] = React.useState<number>(() => {
    if (mediaList && mediaList.length > 0) {
      if (initialIndex >= 0 && initialIndex < mediaList.length) return initialIndex;
      const found = mediaList.findIndex((m) => m.url === initialUrl);
      return found >= 0 ? found : 0;
    }
    return 0;
  });

  // Ítem activo (si no hay lista, usamos las props iniciales)
  const activeItem: MediaItem = React.useMemo(() => {
    if (mediaList && mediaList.length > 0 && mediaList[currentIndex]) {
      return mediaList[currentIndex];
    }
    return {
      url: initialUrl,
      type: initialType,
      name: initialName,
    };
  }, [mediaList, currentIndex, initialUrl, initialType, initialName]);

  const activeUrl = activeItem.url;
  const activeType = activeItem.type || "";
  const activeName = activeItem.name || "";
  const ext = (activeName || activeUrl).split("?")[0].split(".").pop()?.toLowerCase() || "";

  const isVideo = activeType.startsWith("video/") || /\.(mp4|mov|webm|mkv)(\?|$)/i.test(activeUrl);
  const isImage = activeType.startsWith("image/") || /\.(jpg|jpeg|png|gif|webp|svg|bmp)(\?|$)/i.test(activeUrl);
  const isPdf = activeType.includes("pdf") || ext === "pdf";
  const isTextDoc =
    ["xml", "txt", "json", "csv", "log", "html", "htm", "sql", "yaml", "yml"].includes(ext) ||
    activeType.includes("xml") ||
    activeType.includes("text/") ||
    activeType.includes("json");
  const isArchive =
    ["zip", "rar", "7z", "tar", "gz"].includes(ext) ||
    activeType.includes("zip") ||
    activeType.includes("compressed");

  // Transformaciones de imagen: Zoom, Pan y Rotación
  const [scale, setScale] = React.useState(1);
  const [tx, setTx] = React.useState(0);
  const [ty, setTy] = React.useState(0);
  const [rotation, setRotation] = React.useState(0);
  const [dragging, setDragging] = React.useState(false);
  const dragStart = React.useRef({ x: 0, y: 0, tx: 0, ty: 0 });
  const videoRef = React.useRef<HTMLVideoElement>(null);
  const thumbnailsContainerRef = React.useRef<HTMLDivElement>(null);

  // Estados para visor de texto/XML/JSON
  const [textContent, setTextContent] = React.useState<string | null>(null);
  const [loadingText, setLoadingText] = React.useState(false);
  const [textError, setTextError] = React.useState<string | null>(null);
  const [searchTerm, setSearchTerm] = React.useState("");
  const [copied, setCopied] = React.useState(false);
  const [copiedImage, setCopiedImage] = React.useState(false);

  // Reset de transformación cada vez que cambia el archivo activo
  React.useEffect(() => {
    setScale(1);
    setTx(0);
    setTy(0);
    setRotation(0);
  }, [currentIndex, activeUrl]);

  // Cargar texto de archivos XML / TXT / JSON / CSV
  React.useEffect(() => {
    if (isTextDoc && activeUrl) {
      setLoadingText(true);
      setTextError(null);
      fetch(activeUrl)
        .then(async (res) => {
          if (!res.ok) throw new Error(`HTTP ${res.status}`);
          return res.text();
        })
        .then((txt) => setTextContent(txt))
        .catch((err) => setTextError(err.message || "Error al cargar contenido"))
        .finally(() => setLoadingText(false));
    }
  }, [isTextDoc, activeUrl]);

  // Centrar miniatura activa en el filmstrip
  React.useEffect(() => {
    if (thumbnailsContainerRef.current) {
      const activeThumb = thumbnailsContainerRef.current.querySelector(
        `[data-thumb-idx="${currentIndex}"]`
      ) as HTMLElement | null;
      if (activeThumb) {
        activeThumb.scrollIntoView({
          behavior: "smooth",
          inline: "center",
          block: "nearest",
        });
      }
    }
  }, [currentIndex]);

  const hasMultiple = mediaList && mediaList.length > 1;

  // Navegación
  const goToNext = React.useCallback(() => {
    if (!hasMultiple) return;
    setCurrentIndex((prev) => (prev + 1) % mediaList.length);
  }, [hasMultiple, mediaList.length]);

  const goToPrev = React.useCallback(() => {
    if (!hasMultiple) return;
    setCurrentIndex((prev) => (prev - 1 + mediaList.length) % mediaList.length);
  }, [hasMultiple, mediaList.length]);

  // Controles por teclado
  React.useEffect(() => {
    function onKey(e: KeyboardEvent) {
      // Ignorar si el usuario está escribiendo en el buscador de texto
      if (
        document.activeElement?.tagName === "INPUT" ||
        document.activeElement?.tagName === "TEXTAREA"
      ) {
        if (e.key === "Escape") onClose();
        return;
      }

      if (e.key === "Escape") {
        onClose();
        return;
      }

      if (e.key === "ArrowRight") {
        goToNext();
        return;
      }
      if (e.key === "ArrowLeft") {
        goToPrev();
        return;
      }

      if (e.key === "r" || e.key === "R") {
        setRotation((r) => (r + 90) % 360);
        return;
      }

      if (isVideo && e.key === " ") {
        e.preventDefault();
        if (videoRef.current) {
          if (videoRef.current.paused) videoRef.current.play();
          else videoRef.current.pause();
        }
        return;
      }

      if (!isTextDoc && !isPdf) {
        if (e.key === "+" || e.key === "=") setScale((s) => Math.min(s + 0.25, 5));
        if (e.key === "-") setScale((s) => Math.max(s - 0.25, 0.5));
        if (e.key === "0") {
          setScale(1);
          setTx(0);
          setTy(0);
          setRotation(0);
        }
      }
    }

    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose, goToNext, goToPrev, isVideo, isTextDoc, isPdf]);

  // Wheel zoom
  function onWheel(e: React.WheelEvent) {
    if (isTextDoc || isPdf || isArchive) return;
    e.preventDefault();
    const delta = e.deltaY > 0 ? -0.15 : 0.15;
    setScale((s) => Math.max(0.5, Math.min(s + delta, 5)));
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

  function zoomIn() {
    setScale((s) => Math.min(s + 0.25, 5));
  }
  function zoomOut() {
    setScale((s) => Math.max(s - 0.25, 0.5));
  }
  function reset() {
    setScale(1);
    setTx(0);
    setTy(0);
    setRotation(0);
  }
  function rotate() {
    setRotation((r) => (r + 90) % 360);
  }

  // Doble clic para zoom rápido 1x <-> 2.5x
  function handleDoubleClick(e: React.MouseEvent) {
    e.stopPropagation();
    if (isTextDoc || isPdf || isArchive) return;
    if (scale > 1) {
      reset();
    } else {
      setScale(2.5);
    }
  }

  async function handleDownload(e?: React.MouseEvent) {
    e?.stopPropagation();
    try {
      const res = await fetch(activeUrl);
      const blob = await res.blob();
      const blobUrl = window.URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = blobUrl;
      a.download =
        activeName ||
        (isVideo
          ? "video.mp4"
          : isImage
          ? "imagen.jpg"
          : isPdf
          ? "documento.pdf"
          : "archivo");
      document.body.appendChild(a);
      a.click();
      a.remove();
      window.URL.revokeObjectURL(blobUrl);
    } catch {
      window.open(activeUrl, "_blank");
    }
  }

  // Copiar imagen directamente al portapapeles
  async function handleCopyImage(e: React.MouseEvent) {
    e.stopPropagation();
    try {
      const response = await fetch(activeUrl);
      const blob = await response.blob();
      if (blob.type === "image/png") {
        await navigator.clipboard.write([new ClipboardItem({ "image/png": blob })]);
      } else {
        // Convertir a PNG via canvas para asegurar compatibilidad de portapapeles
        const img = new Image();
        img.crossOrigin = "anonymous";
        img.src = activeUrl;
        await new Promise((res, rej) => {
          img.onload = res;
          img.onerror = rej;
        });
        const canvas = document.createElement("canvas");
        canvas.width = img.width;
        canvas.height = img.height;
        const ctx = canvas.getContext("2d");
        ctx?.drawImage(img, 0, 0);
        canvas.toBlob(async (pngBlob) => {
          if (pngBlob) {
            await navigator.clipboard.write([new ClipboardItem({ "image/png": pngBlob })]);
          }
        }, "image/png");
      }
      setCopiedImage(true);
      setTimeout(() => setCopiedImage(false), 2000);
    } catch {
      // Fallback a copiar enlace
      navigator.clipboard.writeText(activeUrl);
      setCopiedImage(true);
      setTimeout(() => setCopiedImage(false), 2000);
    }
  }

  function handleCopyText() {
    if (!textContent) return;
    navigator.clipboard.writeText(textContent);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  const transform = `translate(${tx}px, ${ty}px) scale(${scale}) rotate(${rotation}deg)`;

  // Líneas de texto con filtro de búsqueda
  const filteredLines = React.useMemo(() => {
    if (!textContent) return [];
    const lines = textContent.split("\n");
    if (!searchTerm.trim()) return lines.map((l, i) => ({ num: i + 1, text: l, match: false }));
    const term = searchTerm.toLowerCase();
    return lines.map((l, i) => ({
      num: i + 1,
      text: l,
      match: l.toLowerCase().includes(term),
    }));
  }, [textContent, searchTerm]);

  // Formato de fecha del mensaje activo
  const formattedTime = React.useMemo(() => {
    if (!activeItem.time) return null;
    const d = new Date(activeItem.time);
    return isNaN(d.getTime())
      ? null
      : d.toLocaleTimeString("es-CR", { hour: "2-digit", minute: "2-digit", hour12: true });
  }, [activeItem.time]);

  return (
    <div
      className="fixed inset-0 z-[9999] bg-black/95 backdrop-blur-md flex items-center justify-center select-none animate-in fade-in duration-200"
      onClick={onClose}
      onWheel={onWheel}
    >
      {/* Top bar (Barra superior tipo Telegram/WhatsApp) */}
      <div
        className="absolute top-0 left-0 right-0 z-30 flex items-center justify-between px-5 py-3.5 bg-gradient-to-b from-black/90 via-black/60 to-transparent"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Información del archivo y remitente */}
        <div className="flex items-center gap-3 min-w-0 max-w-[55%]">
          {isTextDoc && <FileCode className="h-5 w-5 text-amber-400 shrink-0" />}
          {isPdf && <FileText className="h-5 w-5 text-rose-400 shrink-0" />}
          {isArchive && <FileArchive className="h-5 w-5 text-purple-400 shrink-0" />}

          <div className="min-w-0 flex flex-col">
            <div className="flex items-center gap-2">
              <span className="text-sm font-bold text-white truncate drop-shadow-sm">
                {activeName ||
                  (isVideo
                    ? "Video"
                    : isImage
                    ? "Imagen"
                    : isPdf
                    ? "Documento PDF"
                    : isTextDoc
                    ? `Archivo ${ext.toUpperCase()}`
                    : "Archivo")}
              </span>
              {ext && (
                <span className="text-[10px] font-black px-1.5 py-0.2 rounded uppercase tracking-wider bg-white/10 text-white/80 border border-white/15 shrink-0">
                  {ext}
                </span>
              )}
            </div>

            {/* Metadatos: Remitente, Fecha y Contador */}
            <div className="flex items-center gap-2 text-xs text-white/60 truncate mt-0.5">
              {hasMultiple && (
                <span className="font-semibold text-violet-300 bg-violet-500/20 px-1.5 py-0.5 rounded text-[11px] border border-violet-500/30 shrink-0">
                  {currentIndex + 1} de {mediaList.length}
                </span>
              )}
              {activeItem.senderName && (
                <span className="truncate font-medium text-white/80">
                  {activeItem.senderName}
                </span>
              )}
              {formattedTime && (
                <>
                  <span>•</span>
                  <span>{formattedTime}</span>
                </>
              )}
            </div>
          </div>
        </div>

        {/* Acciones principales en cabecera */}
        <div className="flex items-center gap-1.5">
          {/* Zoom controls (solo para imágenes y videos) */}
          {(isImage || isVideo) && (
            <div className="flex items-center bg-white/10 backdrop-blur-md rounded-xl p-1 border border-white/10 shadow-sm mr-1">
              <button
                type="button"
                onClick={zoomOut}
                className="p-1.5 rounded-lg hover:bg-white/15 text-white/80 hover:text-white transition-colors cursor-pointer"
                title="Alejar (-)"
              >
                <ZoomOut className="h-4 w-4" />
              </button>
              <span className="text-xs text-white/80 font-mono w-11 text-center tabular-nums font-semibold">
                {Math.round(scale * 100)}%
              </span>
              <button
                type="button"
                onClick={zoomIn}
                className="p-1.5 rounded-lg hover:bg-white/15 text-white/80 hover:text-white transition-colors cursor-pointer"
                title="Acercar (+)"
              >
                <ZoomIn className="h-4 w-4" />
              </button>
              <button
                type="button"
                onClick={reset}
                className="p-1.5 rounded-lg hover:bg-white/15 text-white/80 hover:text-white transition-colors cursor-pointer ml-0.5"
                title="Restablecer vista (0)"
              >
                <RotateCcw className="h-3.5 w-3.5" />
              </button>
              {isImage && (
                <button
                  type="button"
                  onClick={rotate}
                  className="p-1.5 rounded-lg hover:bg-white/15 text-white/80 hover:text-white transition-colors cursor-pointer"
                  title="Girar 90° (R)"
                >
                  <RotateCw className="h-3.5 w-3.5" />
                </button>
              )}
            </div>
          )}

          {/* Copiar imagen al portapapeles */}
          {isImage && (
            <button
              type="button"
              onClick={handleCopyImage}
              className="p-2 rounded-xl bg-white/10 hover:bg-white/20 text-white/90 hover:text-white transition-all cursor-pointer border border-white/10 shadow-sm"
              title="Copiar imagen al portapapeles"
            >
              {copiedImage ? (
                <Check className="h-4 w-4 text-emerald-400" />
              ) : (
                <Copy className="h-4 w-4" />
              )}
            </button>
          )}

          {/* Copiar texto (para documentos de texto/XML/JSON) */}
          {isTextDoc && textContent && (
            <button
              type="button"
              onClick={handleCopyText}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-white/10 hover:bg-white/20 text-white text-xs font-medium transition-colors border border-white/10"
              title="Copiar contenido"
            >
              {copied ? (
                <Check className="h-4 w-4 text-emerald-400" />
              ) : (
                <Copy className="h-4 w-4" />
              )}
              <span>{copied ? "Copiado" : "Copiar todo"}</span>
            </button>
          )}

          {/* Ir al mensaje en el chat */}
          {onJumpToMessage && activeItem.messageId && (
            <button
              type="button"
              onClick={() => onJumpToMessage(activeItem.messageId!)}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-violet-600/80 hover:bg-violet-600 text-white text-xs font-semibold transition-all border border-violet-400/30 shadow-sm cursor-pointer"
              title="Ir al mensaje en la conversación"
            >
              <MessageSquare className="h-3.5 w-3.5" />
              <span className="hidden md:inline">Ver en chat</span>
            </button>
          )}

          {/* Descargar */}
          <button
            type="button"
            onClick={handleDownload}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-semibold transition-all shadow-sm cursor-pointer border border-emerald-400/30"
            title="Descargar archivo original"
          >
            <Download className="h-4 w-4" />
            <span className="hidden sm:inline">Descargar</span>
          </button>

          {/* Cerrar */}
          <button
            type="button"
            onClick={onClose}
            className="p-2 rounded-xl bg-white/10 hover:bg-rose-600/80 text-white transition-colors cursor-pointer border border-white/10 ml-1"
            title="Cerrar (Esc)"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      </div>

      {/* Flechas flotantes de Navegación Lateral (Anterior y Siguiente) */}
      {hasMultiple && (
        <>
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              goToPrev();
            }}
            className="absolute left-4 top-1/2 -translate-y-1/2 z-30 p-3.5 rounded-full bg-black/60 hover:bg-black/90 text-white/90 hover:text-white backdrop-blur-md border border-white/15 shadow-2xl transition-all hover:scale-110 active:scale-95 cursor-pointer group"
            title="Anterior (Flecha izquierda ←)"
          >
            <ChevronLeft className="h-6 w-6 transition-transform group-hover:-translate-x-0.5" />
          </button>

          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              goToNext();
            }}
            className="absolute right-4 top-1/2 -translate-y-1/2 z-30 p-3.5 rounded-full bg-black/60 hover:bg-black/90 text-white/90 hover:text-white backdrop-blur-md border border-white/15 shadow-2xl transition-all hover:scale-110 active:scale-95 cursor-pointer group"
            title="Siguiente (Flecha derecha →)"
          >
            <ChevronRight className="h-6 w-6 transition-transform group-hover:translate-x-0.5" />
          </button>
        </>
      )}

      {/* Main Content Area */}
      <div
        className="relative w-full h-full flex items-center justify-center p-4 pt-16 pb-24 overflow-hidden"
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
        onDoubleClick={handleDoubleClick}
        style={{
          cursor:
            !isTextDoc && !isPdf && scale > 1
              ? dragging
                ? "grabbing"
                : "grab"
              : "default",
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* CASO 1: Archivo de Texto / XML / JSON / CSV */}
        {isTextDoc ? (
          <div className="w-full max-w-5xl h-[78vh] flex flex-col rounded-2xl bg-neutral-950 border border-white/15 shadow-2xl overflow-hidden">
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
                    {filteredLines.filter((l) => l.match).length} coincidencia(s)
                  </span>
                )}
                <span>{filteredLines.length} líneas</span>
              </div>
            </div>

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
                    onClick={() => handleDownload()}
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
                        l.match
                          ? "bg-amber-500/20 text-amber-200 font-medium"
                          : "hover:bg-white/[0.04] text-slate-300"
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
          <div className="w-[94vw] max-w-6xl h-[78vh] rounded-2xl bg-neutral-900 border border-white/15 shadow-2xl overflow-hidden flex flex-col">
            <iframe
              src={`${activeUrl}#toolbar=1`}
              className="w-full h-full bg-white"
              title={activeName || "Visor PDF"}
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
              <h3 className="text-base font-semibold text-white break-all">
                {activeName || `archivo.${ext}`}
              </h3>
              <p className="text-xs text-white/60 mt-1.5">
                Este archivo contiene múltiples elementos empaquetados. Descárgalo para
                descomprimirlo y ver su contenido.
              </p>
            </div>
            <button
              onClick={() => handleDownload()}
              className="w-full mt-2 py-3 rounded-xl bg-purple-600 hover:bg-purple-500 text-white font-semibold text-sm flex items-center justify-center gap-2 shadow-lg transition-all active:scale-[0.98]"
            >
              <Download className="h-4 w-4" />
              Descargar {ext.toUpperCase()}
            </button>
          </div>
        ) : isVideo ? (
          /* CASO 4: Video */
          <div
            className="relative"
            style={{
              transform,
              transition: dragging ? "none" : "transform 0.15s cubic-bezier(0.2, 0, 0, 1)",
            }}
          >
            <video
              ref={videoRef}
              key={activeUrl}
              src={activeUrl}
              controls
              autoPlay
              playsInline
              className="max-w-[90vw] max-h-[75vh] rounded-xl shadow-2xl border border-white/10"
              onClick={(e) => e.stopPropagation()}
            />
          </div>
        ) : isImage ? (
          /* CASO 5: Imagen con zoom, pan y rotación suave */
          <div className="relative flex items-center justify-center">
            <img
              key={activeUrl}
              src={activeUrl}
              alt={activeName || "Vista completa"}
              className="max-w-[90vw] max-h-[75vh] object-contain rounded-xl shadow-2xl border border-white/10 select-none"
              style={{
                transform,
                transition: dragging ? "none" : "transform 0.15s cubic-bezier(0.2, 0, 0, 1)",
              }}
              draggable={false}
            />
          </div>
        ) : (
          /* CASO 6: Otro formato */
          <div className="max-w-md w-full rounded-2xl bg-neutral-900 border border-white/15 p-8 shadow-2xl text-center flex flex-col items-center gap-4">
            <div className="h-16 w-16 rounded-2xl bg-white/10 flex items-center justify-center text-white/60">
              <FileText className="h-8 w-8" />
            </div>
            <div>
              <h3 className="text-sm font-semibold text-white break-all">
                {activeName || "Archivo adjunto"}
              </h3>
              <p className="text-xs text-white/50 mt-1">
                Descarga el archivo para abrirlo con el software correspondiente en tu equipo.
              </p>
            </div>
            <button
              onClick={() => handleDownload()}
              className="w-full mt-2 py-2.5 rounded-xl bg-white/15 hover:bg-white/25 text-white font-medium text-xs flex items-center justify-center gap-2 transition"
            >
              <Download className="h-4 w-4" />
              Descargar archivo
            </button>
          </div>
        )}
      </div>

      {/* Barra Inferior de Miniaturas (Filmstrip de primer nivel) */}
      {hasMultiple && (
        <div
          className="absolute bottom-4 left-1/2 -translate-x-1/2 z-30 flex flex-col items-center gap-2 max-w-[92vw]"
          onClick={(e) => e.stopPropagation()}
        >
          {/* Pie de foto / Caption si existe */}
          {activeItem.caption && (
            <div className="px-4 py-1.5 rounded-full bg-black/75 backdrop-blur-md border border-white/10 text-white text-xs text-center max-w-xl truncate shadow-lg">
              {activeItem.caption}
            </div>
          )}

          {/* Carrusel de miniaturas con scroll suave */}
          <div
            ref={thumbnailsContainerRef}
            className="flex items-center gap-2 p-1.5 rounded-2xl bg-black/70 backdrop-blur-xl border border-white/15 shadow-2xl overflow-x-auto max-w-full scrollbar-none"
            style={{ scrollbarWidth: "none" }}
          >
            {mediaList.map((item, idx) => {
              const isSelected = idx === currentIndex;
              const itemType = (item.type || "").toLowerCase();
              const itemExt = (item.name || item.url).split("?")[0].split(".").pop()?.toLowerCase() || "";
              const itemIsVid = itemType.startsWith("video/") || ["mp4", "mov", "webm"].includes(itemExt);
              const itemIsPdf = itemType.includes("pdf") || itemExt === "pdf";

              return (
                <button
                  key={`${item.url}-${idx}`}
                  type="button"
                  data-thumb-idx={idx}
                  onClick={() => setCurrentIndex(idx)}
                  className={`relative shrink-0 w-12 h-12 rounded-xl overflow-hidden transition-all duration-200 cursor-pointer ${
                    isSelected
                      ? "ring-2 ring-violet-400 scale-105 opacity-100 shadow-lg shadow-violet-500/25"
                      : "opacity-45 hover:opacity-85 hover:scale-100 border border-white/10"
                  }`}
                  title={`${item.name || (itemIsVid ? "Video" : "Foto")} (${idx + 1}/${mediaList.length})`}
                >
                  {itemIsVid ? (
                    <div className="w-full h-full bg-neutral-800 flex items-center justify-center relative">
                      <video src={item.url} className="w-full h-full object-cover" />
                      <div className="absolute inset-0 bg-black/40 flex items-center justify-center">
                        <Play className="h-4 w-4 text-white fill-white" />
                      </div>
                    </div>
                  ) : itemIsPdf ? (
                    <div className="w-full h-full bg-neutral-800 flex flex-col items-center justify-center text-rose-400">
                      <FileText className="h-5 w-5" />
                      <span className="text-[9px] font-black uppercase">PDF</span>
                    </div>
                  ) : (
                    <img
                      src={item.url}
                      alt=""
                      className="w-full h-full object-cover bg-neutral-900"
                      loading="lazy"
                    />
                  )}
                </button>
              );
            })}
          </div>

          {/* Atajos de teclado breves */}
          <div className="text-[10px] text-white/50 flex items-center gap-3 font-medium select-none">
            <span>← / → = Navegar</span>
            <span>Rueda / Doble clic = Zoom</span>
            <span>R = Girar</span>
            <span>Esc = Cerrar</span>
          </div>
        </div>
      )}

      {/* Indicador inferior cuando solo hay 1 archivo */}
      {!hasMultiple && (isImage || isVideo) && (
        <div className="absolute bottom-4 left-1/2 -translate-x-1/2 text-[10px] text-white/50 flex items-center gap-3 pointer-events-none font-medium">
          <span>Rueda / Doble clic = Zoom</span>
          <span>Arrastrar = Pan</span>
          {isImage && <span>R = Girar</span>}
          <span>Esc = Cerrar</span>
        </div>
      )}
    </div>
  );
}
