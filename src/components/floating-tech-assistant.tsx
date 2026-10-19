"use client";

import * as React from "react";
import {
  MessageCircle,
  X,
  Send,
  Loader2,
  Minimize2,
  Maximize2,
  GripVertical,
  Paperclip,
  FileText,
  Image as ImageIcon,
  XCircle,
  RotateCcw,
  Reply,
  ExternalLink,
  FolderArchive,
  Globe,
  BookOpen,
  Sparkles,
  PanelLeftOpen,
  PanelRightOpen,
  CheckCircle2,
} from "lucide-react";
import { toast } from "sonner";
import ReactDraggable, { DraggableEvent, DraggableData } from "react-draggable";
const Draggable = ReactDraggable as any;

interface TechMessage {
  role: "user" | "assistant";
  content: string;
  time: string;
  mediaUrl?: string;
  mediaType?: string;
  fileName?: string;
}

interface PendingAttachment {
  url: string;
  type: string;
  name: string;
  uploading: boolean;
}

interface Position {
  x: number;
  y: number;
}

export function FloatingTechAssistant() {
  const [isOpen, setIsOpen] = React.useState(false);
  const [isMinimized, setIsMinimized] = React.useState(false);
  const [isWide, setIsWide] = React.useState(false);
  const [input, setInput] = React.useState("");
  const [messages, setMessages] = React.useState<TechMessage[]>([]);
  const [loading, setLoading] = React.useState(false);
  const [sessionId, setSessionId] = React.useState<string | null>(null);
  const [caseId, setCaseId] = React.useState<string | null>(null);
  const [pendingAttachment, setPendingAttachment] = React.useState<PendingAttachment | null>(null);
  const [bubblePosition, setBubblePosition] = React.useState<Position>({ x: 0, y: 0 });
  const [panelPosition, setPanelPosition] = React.useState<Position>({ x: 0, y: 0 });
  const [previewPrecedent, setPreviewPrecedent] = React.useState<{
    id: string;
    label?: string;
    resolver?: string;
    details?: string;
    loading: boolean;
    caseData?: any;
  } | null>(null);
  const [previewManual, setPreviewManual] = React.useState<{
    docName: string;
    label?: string;
    loading: boolean;
    chunks?: { id: string | number; content: string }[];
  } | null>(null);

  const bubbleRef = React.useRef<HTMLButtonElement>(null);
  const panelRef = React.useRef<HTMLDivElement>(null);
  const scrollRef = React.useRef<HTMLDivElement>(null);
  const inputRef = React.useRef<HTMLTextAreaElement>(null);
  const fileInputRef = React.useRef<HTMLInputElement>(null);
  const dragMovedRef = React.useRef(false);

  React.useEffect(() => {
    const bubbleSize = 56;
    const padding = 24;
    setBubblePosition((prev) => {
      if (prev.x !== 0 || prev.y !== 0) return prev;
      return {
        x: Math.max(padding, window.innerWidth - bubbleSize - padding),
        y: Math.max(padding, window.innerHeight - bubbleSize - padding),
      };
    });
  }, []);

  React.useEffect(() => {
    const saved = localStorage.getItem("sek_tech_assistant_bubble_pos_v3");
    if (saved) {
      try {
        const parsed = JSON.parse(saved) as Position;
        if (typeof parsed.x === "number" && typeof parsed.y === "number") {
          setBubblePosition(clampPosition(parsed, 56, 8));
        }
      } catch {
        /* ignorar */
      }
    }
  }, []);

  const clampPosition = (pos: Position, size: number, padding: number): Position => {
    if (typeof window === "undefined") return pos;
    return {
      x: Math.max(padding, Math.min(pos.x, window.innerWidth - size - padding)),
      y: Math.max(padding, Math.min(pos.y, window.innerHeight - size - padding)),
    };
  };

  const resolveCurrentCaseId = React.useCallback((): string | null => {
    if (typeof window === "undefined") return null;
    const globalId = (window as any).__CURRENT_OPEN_CASE_ID__;
    const globalPhone = (window as any).__CURRENT_OPEN_CASE_PHONE__;
    const params = new URLSearchParams(window.location.search);
    const urlC = params.get("c");

    if (globalId) {
      const gStr = String(globalId).trim();
      if (gStr && !gStr.startsWith("cuenta:")) {
        if (gStr.startsWith("tel:") || gStr.startsWith("case:")) return gStr;
        return /^\+?\d{8,15}$/.test(gStr) ? `tel:${gStr}` : `case:${gStr}`;
      }
    }
    if (urlC && !urlC.startsWith("cuenta:")) {
      if (urlC.startsWith("tel:") || urlC.startsWith("case:")) return urlC;
      return /^\+?\d{8,15}$/.test(urlC) ? `tel:${urlC}` : `case:${urlC}`;
    }
    if (globalPhone) {
      const cleanPhone = String(globalPhone).replace(/^tel:/, "").trim();
      if (cleanPhone) return `tel:${cleanPhone}`;
    }
    return null;
  }, []);

  React.useEffect(() => {
    const readCaseId = () => {
      const resolved = resolveCurrentCaseId();
      setCaseId((prev) => (prev !== resolved ? resolved : prev));
    };
    readCaseId();

    window.addEventListener("popstate", readCaseId);
    window.addEventListener("sek-open-case-change", readCaseId as EventListener);

    const origPush = history.pushState;
    const origReplace = history.replaceState;
    history.pushState = function (...args) {
      const ret = origPush.apply(this, args as any);
      queueMicrotask(readCaseId);
      return ret;
    };
    history.replaceState = function (...args) {
      const ret = origReplace.apply(this, args as any);
      queueMicrotask(readCaseId);
      return ret;
    };

    const pollInterval = setInterval(readCaseId, 500);

    return () => {
      window.removeEventListener("popstate", readCaseId);
      window.removeEventListener("sek-open-case-change", readCaseId as EventListener);
      history.pushState = origPush;
      history.replaceState = origReplace;
      clearInterval(pollInterval);
    };
  }, [resolveCurrentCaseId]);

  const prevCaseRef = React.useRef<string | null>(null);
  React.useEffect(() => {
    if (prevCaseRef.current !== null && caseId !== null && prevCaseRef.current !== caseId) {
      setMessages([]);
      setSessionId(null);
      setPendingAttachment(null);
      localStorage.removeItem("sek_tech_assistant_session_v9");
    }
    prevCaseRef.current = caseId;
  }, [caseId]);

  React.useEffect(() => {
    if (!isOpen) return;
    try {
      localStorage.removeItem("sek_tech_assistant_session");
      localStorage.removeItem("sek_tech_assistant_session_v3");
      localStorage.removeItem("sek_tech_assistant_session_v4");
      localStorage.removeItem("sek_tech_assistant_session_v5");
      localStorage.removeItem("sek_tech_assistant_session_v6");
      localStorage.removeItem("sek_tech_assistant_session_v7");
      localStorage.removeItem("sek_tech_assistant_session_v8");
    } catch {
      /* ignorar */
    }
    const saved = localStorage.getItem("sek_tech_assistant_session_v9");
    if (saved) {
      try {
        const parsed = JSON.parse(saved);
        if (parsed.messages && Array.isArray(parsed.messages)) {
          const cleaned = parsed.messages.map((m: any) => {
            if (
              m.content &&
              typeof m.content === "string" &&
              m.content.includes("Instrucciones de atención al cliente") &&
              m.content.includes("Redacte la respuesta")
            ) {
              return { ...m, content: "Redactar propuesta de respuesta para el cliente basada en el caso abierto" };
            }
            return m;
          });
          setSessionId(parsed.session_id || null);
          setMessages(cleaned.slice(-10));
        }
      } catch {
        /* ignorar */
      }
    }
  }, [isOpen]);

  React.useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages, isOpen, loading]);

  // Auto-ajuste de altura del textarea sin barra de scroll fea
  React.useEffect(() => {
    const el = inputRef.current;
    if (!el) return;
    el.style.height = "34px";
    const nextHeight = Math.min(el.scrollHeight, 108);
    el.style.height = `${Math.max(34, nextHeight)}px`;
  }, [input]);

  const handleSend = async (text?: string, currentMessages?: TechMessage[], targetCaseId?: string | null) => {
    const messageText = text?.trim() || input.trim();
    if ((!messageText && !pendingAttachment) || loading) return;
    if (!text) setInput("");
    setLoading(true);

    const messagesToSend = currentMessages ?? messages;
    const effectiveCaseId = targetCaseId || caseId || resolveCurrentCaseId();

    try {
      const res = await fetch("/api/tech-assistant/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          message: messageText,
          case_id: effectiveCaseId,
          messages: messagesToSend.slice(-9),
          mediaUrl: pendingAttachment?.url,
          mediaType: pendingAttachment?.type,
          fileName: pendingAttachment?.name,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Error del asistente");

      const finalMessages = (data.messages || []).slice(-10);
      setPendingAttachment(null);
      setMessages(finalMessages);
      localStorage.setItem(
        "sek_tech_assistant_session_v9",
        JSON.stringify({
          session_id: sessionId || null,
          messages: finalMessages,
        })
      );
    } catch (e: any) {
      toast.error(e?.message || "Error del asistente técnico");
    } finally {
      setLoading(false);
      inputRef.current?.focus();
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const uploadFile = async (file: File) => {
    const MAX_FILE_SIZE = 10 * 1024 * 1024;
    if (file.size > MAX_FILE_SIZE) {
      toast.error("Archivo demasiado grande", { description: "El límite es 10 MB." });
      return;
    }
    const isImage = file.type.startsWith("image/");
    const displayName = isImage && !file.name ? `imagen_${Date.now()}.png` : file.name || `archivo_${Date.now()}`;
    setPendingAttachment({ url: "", type: file.type || "application/octet-stream", name: displayName, uploading: true });
    try {
      const supabase = (await import("@/lib/supabase/client")).createClient();
      const safeName = displayName.replace(/[^a-zA-Z0-9._-]/g, "_");
      const path = `tech-assistant/${Date.now()}_${safeName}`;
      const { data, error } = await supabase.storage
        .from("attachments")
        .upload(path, file, { contentType: file.type || "application/octet-stream" });
      if (error) throw error;
      const { data: urlData } = supabase.storage.from("attachments").getPublicUrl(data.path);
      setPendingAttachment({
        url: urlData.publicUrl,
        type: file.type || "application/octet-stream",
        name: displayName,
        uploading: false,
      });
    } catch (e: any) {
      toast.error("Error al subir archivo", { description: e?.message });
      setPendingAttachment(null);
    }
  };

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    e.target.value = "";
    await uploadFile(file);
  };

  const handlePaste = async (e: React.ClipboardEvent) => {
    const items = e.clipboardData?.items;
    if (!items) return;
    for (const item of items) {
      if (item.kind === "file") {
        const file = item.getAsFile();
        if (file) {
          e.preventDefault();
          await uploadFile(file);
          return;
        }
      }
    }
  };

  const attachmentIcon = (type: string) => {
    if (type.startsWith("image/")) return <ImageIcon className="h-3.5 w-3.5 shrink-0" />;
    return <FileText className="h-3.5 w-3.5 shrink-0" />;
  };

  const handleBubbleDrag = (_e: DraggableEvent, data: DraggableData) => {
    dragMovedRef.current = true;
    setBubblePosition({ x: data.x, y: data.y });
  };

  const handleBubbleDragStop = (_e: DraggableEvent, data: DraggableData) => {
    const next = clampPosition({ x: data.x, y: data.y }, 56, 8);
    setBubblePosition(next);
    localStorage.setItem("sek_tech_assistant_bubble_pos_v3", JSON.stringify(next));
  };

  const handleBubbleMouseDown = () => {
    dragMovedRef.current = false;
  };

  const handleBubbleClick = (e: React.MouseEvent) => {
    if (dragMovedRef.current) {
      e.preventDefault();
      e.stopPropagation();
      dragMovedRef.current = false;
      return;
    }
    openFromBubble();
  };

  const handlePanelDrag = (_e: DraggableEvent, data: DraggableData) => {
    setPanelPosition({ x: data.x, y: data.y });
  };

  const handlePanelDragStop = (_e: DraggableEvent, data: DraggableData) => {
    setPanelPosition({ x: data.x, y: data.y });
  };

  const startNewChat = () => {
    setMessages([]);
    setSessionId(null);
    setPendingAttachment(null);
    localStorage.removeItem("sek_tech_assistant_session_v9");
    inputRef.current?.focus();
  };

  const insertReplyToClient = async () => {
    setLoading(true);
    const effectiveCaseId = caseId || resolveCurrentCaseId();
    try {
      const res = await fetch("/api/tech-assistant/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "draft_client_reply",
          displayMessage: "Redactar propuesta de respuesta para el cliente basada en el caso abierto",
          case_id: effectiveCaseId,
          messages: messages.slice(-9),
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Error del asistente");
      const aiResponse = data.messages?.[data.messages.length - 1]?.content || "";
      if (aiResponse && !aiResponse.startsWith("Disculpe, no pude")) {
        const finalMessages = (data.messages || []).slice(-10);
        setMessages(finalMessages);
        localStorage.setItem(
          "sek_tech_assistant_session_v9",
          JSON.stringify({
            session_id: sessionId || null,
            messages: finalMessages,
          })
        );
        window.dispatchEvent(new CustomEvent("sek-insert-draft", { detail: { text: data.clientDraft || aiResponse } }));
        toast.success("Respuesta insertada en el chat del cliente");
      } else {
        const finalMessages = (data.messages || []).slice(-10);
        setMessages(finalMessages);
        toast.error("El asistente no pudo generar la respuesta en este momento");
      }
    } catch (e: any) {
      toast.error(e?.message || "Error al generar respuesta");
    } finally {
      setLoading(false);
      inputRef.current?.focus();
    }
  };

  const startNewCaseChat = async () => {
    const resolved = resolveCurrentCaseId();
    setCaseId(resolved);
    setSessionId(null);
    setMessages([]);
    localStorage.removeItem("sek_tech_assistant_session_v9");
    if (resolved) {
      await handleSend(
        "Diagnostique y resuelva la avería de este caso: identifique el equipo y la falla reportada por el cliente, consulte los precedentes y casos similares resueltos en Sekunet, y brinde el procedimiento técnico exacto y comprobado para solucionarlo de inmediato.",
        [],
        resolved
      );
    }
  };

  const handleOpenHistoricalCase = (cId: string, label?: string, resolver?: string, details?: string) => {
    setPreviewPrecedent({
      id: cId,
      label,
      resolver,
      details,
      loading: true,
      caseData: null,
    });
    fetch(`/api/cases/${cId}`)
      .then((r) => r.json())
      .then((data) => {
        if (data.ok && data.case) {
          setPreviewPrecedent((prev) => (prev && prev.id === cId ? { ...prev, loading: false, caseData: data.case } : prev));
        } else {
          setPreviewPrecedent((prev) => (prev && prev.id === cId ? { ...prev, loading: false } : prev));
        }
      })
      .catch(() => {
        setPreviewPrecedent((prev) => (prev && prev.id === cId ? { ...prev, loading: false } : prev));
      });
  };

  const handleOpenManual = (docName: string, label?: string) => {
    setPreviewManual({
      docName,
      label,
      loading: true,
      chunks: [],
    });
    fetch(`/api/cases/manual?doc=${encodeURIComponent(docName)}`)
      .then((r) => r.json())
      .then((data) => {
        if (data.ok && Array.isArray(data.chunks)) {
          setPreviewManual((prev) =>
            prev && prev.docName === docName ? { ...prev, loading: false, chunks: data.chunks } : prev
          );
        } else {
          setPreviewManual((prev) => (prev && prev.docName === docName ? { ...prev, loading: false } : prev));
        }
      })
      .catch(() => {
        setPreviewManual((prev) => (prev && prev.docName === docName ? { ...prev, loading: false } : prev));
      });
  };

  const getPanelDimensions = React.useCallback(
    (wideMode = isWide) => {
      if (typeof window === "undefined") return { width: 560, height: 620 };
      const vw = window.innerWidth;
      const vh = window.innerHeight;
      const desiredW = wideMode ? 720 : 560;
      const width = vw < 640 ? Math.max(320, vw - 16) : Math.min(desiredW, vw - 24);
      const height = Math.min(wideMode ? 680 : 620, vh - 24);
      return { width, height };
    },
    [isWide]
  );

  const openFromBubble = () => {
    const rect = bubbleRef.current?.getBoundingClientRect();
    const bubbleSize = 56;
    const { width: panelWidth, height: panelHeight } = getPanelDimensions(isWide);
    const padding = 10;
    let left = (rect?.left ?? window.innerWidth - bubbleSize - padding) + bubbleSize - panelWidth;
    let top = (rect?.top ?? window.innerHeight - bubbleSize - padding) + bubbleSize - panelHeight;
    left = Math.max(padding, Math.min(left, window.innerWidth - panelWidth - padding));
    top = Math.max(padding, Math.min(top, window.innerHeight - panelHeight - padding));
    setPanelPosition({ x: left, y: top });
    setIsOpen(true);
  };

  const toggleWideMode = () => {
    const nextWide = !isWide;
    setIsWide(nextWide);
    if (typeof window !== "undefined") {
      const { width: nextW, height: nextH } = getPanelDimensions(nextWide);
      const padding = 10;
      setPanelPosition((prev) => ({
        x: Math.max(padding, Math.min(prev.x, window.innerWidth - nextW - padding)),
        y: Math.max(padding, Math.min(prev.y, window.innerHeight - nextH - padding)),
      }));
    }
  };

  if (!isOpen) {
    return (
      <Draggable
        nodeRef={bubbleRef as any}
        position={bubblePosition}
        onDrag={handleBubbleDrag}
        onStop={handleBubbleDragStop}
        bounds={
          typeof window !== "undefined"
            ? { left: 8, top: 8, right: window.innerWidth - 64, bottom: window.innerHeight - 64 }
            : undefined
        }
        handle=".sek-tech-drag-handle"
      >
        <button
          ref={bubbleRef}
          suppressHydrationWarning
          onMouseDown={handleBubbleMouseDown}
          onClick={handleBubbleClick}
          className="sek-tech-drag-handle fixed top-0 left-0 z-50 flex h-14 w-14 items-center justify-center rounded-full bg-gradient-to-br from-violet-600 to-indigo-600 text-white shadow-xl shadow-violet-600/35 ring-1 ring-white/20 hover:from-violet-500 hover:to-indigo-500 transition-all hover:scale-105"
          aria-label="Asistente técnico"
        >
          <MessageCircle className="h-6 w-6" />
        </button>
      </Draggable>
    );
  }

  const { width: activeW, height: activeH } = getPanelDimensions(isWide);

  return (
    <>
      <Draggable
        nodeRef={panelRef as any}
        position={panelPosition}
        onDrag={handlePanelDrag}
        onStop={handlePanelDragStop}
        bounds={
          typeof window !== "undefined"
            ? {
                left: 8,
                top: 8,
                right: Math.max(8, window.innerWidth - (isMinimized ? 320 : activeW) - 8),
                bottom: Math.max(8, window.innerHeight - (isMinimized ? 56 : activeH) - 8),
              }
            : undefined
        }
        handle=".sek-tech-drag-handle"
      >
        <div
          ref={panelRef}
          suppressHydrationWarning
          style={
            isMinimized
              ? { width: 320, height: 52 }
              : { width: activeW, height: activeH }
          }
          className="fixed top-0 left-0 z-50 flex flex-col rounded-2xl border border-border/80 bg-card/98 backdrop-blur-md shadow-2xl overflow-hidden transition-[width,height] duration-150"
        >
          {/* Header Premium de 1 sola línea garantizada (sin solapamientos ni cortes) */}
          <div className="sek-tech-drag-handle flex items-center justify-between gap-2 px-3.5 h-[52px] shrink-0 bg-gradient-to-r from-violet-600 via-violet-600 to-indigo-600 text-white cursor-grab active:cursor-grabbing select-none border-b border-white/10">
            <div className="flex items-center gap-2 min-w-0">
              <GripVertical className="h-4 w-4 opacity-60 shrink-0" />
              <div className="h-7 w-7 rounded-lg bg-white/15 flex items-center justify-center shrink-0 ring-1 ring-white/20">
                <Sparkles className="h-3.5 w-3.5 text-white" />
              </div>
              <div className="flex items-center gap-2 min-w-0">
                <span className="text-[13px] font-semibold tracking-tight whitespace-nowrap">
                  Asistente Técnico
                </span>
                {caseId && !isMinimized && (
                  <span
                    className="hidden sm:inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full bg-emerald-400/20 border border-emerald-300/30 text-[10px] font-medium text-emerald-100 whitespace-nowrap"
                    title="Sincronizado con el caso activo en pantalla"
                  >
                    <span className="h-1.5 w-1.5 rounded-full bg-emerald-300 animate-pulse" />
                    Caso activo
                  </span>
                )}
              </div>
            </div>

            <div className="flex items-center gap-1 shrink-0">
              {!isMinimized && caseId && (
                <button
                  type="button"
                  onClick={startNewCaseChat}
                  disabled={loading}
                  onMouseDown={(e) => e.stopPropagation()}
                  onTouchStart={(e) => e.stopPropagation()}
                  className="inline-flex items-center gap-1 text-[11px] font-semibold bg-white text-violet-700 hover:bg-violet-50 disabled:opacity-50 px-2.5 py-1 rounded-lg cursor-pointer transition-all shadow-xs whitespace-nowrap"
                  title="Diagnosticar el caso abierto contra toda la base de datos y manuales"
                >
                  <Sparkles className="h-3 w-3 shrink-0" />
                  <span>Analizar Caso</span>
                </button>
              )}
              {!isMinimized && messages.length > 0 && (
                <button
                  type="button"
                  onClick={startNewChat}
                  onMouseDown={(e) => e.stopPropagation()}
                  onTouchStart={(e) => e.stopPropagation()}
                  className="inline-flex items-center gap-1 text-[11px] font-medium bg-white/12 hover:bg-white/22 px-2 py-1 rounded-lg cursor-pointer transition-colors whitespace-nowrap"
                  title="Limpiar conversación"
                >
                  <RotateCcw className="h-3 w-3 shrink-0" />
                  <span className="hidden sm:inline">Limpiar</span>
                </button>
              )}
              {!isMinimized && (
                <button
                  type="button"
                  onClick={toggleWideMode}
                  onMouseDown={(e) => e.stopPropagation()}
                  onTouchStart={(e) => e.stopPropagation()}
                  className="hidden sm:flex h-7 w-7 items-center justify-center rounded-lg hover:bg-white/20 transition-colors"
                  title={isWide ? "Vista estándar (560px)" : "Vista ampliada (720px)"}
                  aria-label="Cambiar ancho de ventana"
                >
                  {isWide ? <PanelRightOpen className="h-3.5 w-3.5" /> : <PanelLeftOpen className="h-3.5 w-3.5" />}
                </button>
              )}
              <button
                type="button"
                onClick={() => setIsMinimized(!isMinimized)}
                onMouseDown={(e) => e.stopPropagation()}
                onTouchStart={(e) => e.stopPropagation()}
                className="h-7 w-7 flex items-center justify-center rounded-lg hover:bg-white/20 transition-colors"
                aria-label={isMinimized ? "Maximizar" : "Minimizar"}
              >
                {isMinimized ? <Maximize2 className="h-3.5 w-3.5" /> : <Minimize2 className="h-3.5 w-3.5" />}
              </button>
              <button
                type="button"
                onClick={() => setIsOpen(false)}
                onMouseDown={(e) => e.stopPropagation()}
                onTouchStart={(e) => e.stopPropagation()}
                className="h-7 w-7 flex items-center justify-center rounded-lg hover:bg-white/20 transition-colors"
                aria-label="Cerrar"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
          </div>

          {!isMinimized && (
            <>
              {!caseId && (
                <div className="px-3.5 py-1.5 bg-amber-500/10 border-b border-amber-500/20 text-amber-700 dark:text-amber-300 text-[11px] flex items-center justify-between gap-2 shrink-0">
                  <span className="truncate">
                    Modo consulta libre: consultando 1,494 casos resueltos, manuales y web en vivo.
                  </span>
                </div>
              )}

              {/* Área de Mensajes (aprovecha el 100% del ancho sin columnas aplastadas) */}
              <div ref={scrollRef} className="flex-1 overflow-y-auto px-3.5 py-3 space-y-3">
                {messages.length === 0 && (
                  <div className="h-full flex flex-col items-center justify-center text-center px-6 py-8">
                    <div className="h-11 w-11 rounded-2xl bg-violet-500/10 border border-violet-500/20 flex items-center justify-center mb-3 text-violet-600 dark:text-violet-400">
                      <Sparkles className="h-5 w-5" />
                    </div>
                    <p className="text-sm font-semibold text-foreground mb-1">
                      Copiloto de Ingeniería y Soporte Sekunet
                    </p>
                    <p className="text-xs text-muted-foreground max-w-sm leading-relaxed mb-4">
                      Conectado en tiempo real a los 1,494 casos históricos resueltos en taller, manuales técnicos oficiales y documentación de fabricantes.
                    </p>
                    {caseId && (
                      <button
                        type="button"
                        onClick={startNewCaseChat}
                        className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-violet-600 hover:bg-violet-700 text-white text-xs font-semibold shadow-sm transition-all cursor-pointer"
                      >
                        <Sparkles className="h-3.5 w-3.5" />
                        <span>Diagnosticar Caso Abierto Ahora</span>
                      </button>
                    )}
                  </div>
                )}

                {messages.map((m, i) => {
                  const isUser = m.role === "user";
                  return (
                    <div key={i} className={`flex ${isUser ? "justify-end" : "justify-start w-full"}`}>
                      <div
                        className={
                          isUser
                            ? "max-w-[82%] rounded-2xl rounded-br-sm bg-gradient-to-br from-violet-600 to-indigo-600 text-white px-3.5 py-2 text-[13px] leading-relaxed shadow-xs"
                            : "w-full rounded-2xl bg-muted/45 dark:bg-zinc-900/80 border border-border/70 text-foreground px-4 py-3 text-[13px] shadow-xs"
                        }
                      >
                        {m.mediaUrl && (
                          <a
                            href={m.mediaUrl}
                            target="_blank"
                            rel="noreferrer"
                            className="inline-flex items-center gap-1.5 mb-2 px-2 py-1 rounded-md bg-black/10 dark:bg-white/10 text-xs underline opacity-90 hover:opacity-100"
                            onClick={(e) => e.stopPropagation()}
                          >
                            {attachmentIcon(m.mediaType || "")}
                            <span className="truncate max-w-[220px]">{m.fileName || "Archivo adjunto"}</span>
                          </a>
                        )}
                        {m.role === "assistant" ? (
                          renderAssistantMessage(m.content, handleOpenHistoricalCase, handleOpenManual)
                        ) : (
                          <p className="whitespace-pre-wrap break-words">
                            {m.content &&
                            m.content.includes("Instrucciones de atención al cliente") &&
                            m.content.includes("Redacte la respuesta")
                              ? "Redactar propuesta de respuesta para el cliente basada en el caso abierto"
                              : m.content}
                          </p>
                        )}
                      </div>
                    </div>
                  );
                })}

                {loading && (
                  <div className="flex justify-start w-full">
                    <div className="w-full rounded-2xl bg-muted/40 border border-border/60 px-4 py-3 flex items-center gap-2.5">
                      <Loader2 className="h-4 w-4 animate-spin text-violet-500 shrink-0" />
                      <span className="text-xs text-muted-foreground">
                        Consultando base de datos de casos resueltos, manuales oficiales y fuentes web...
                      </span>
                    </div>
                  </div>
                )}
              </div>

              {/* Barra Inferior de Composición (Compacta, Unificada y Sin Cortes) */}
              <div className="border-t border-border/80 px-3 py-2.5 bg-card/95 shrink-0">
                {pendingAttachment && (
                  <div className="flex items-center gap-2 mb-2 px-2.5 py-1.5 rounded-lg bg-violet-500/10 border border-violet-500/20 text-xs">
                    {attachmentIcon(pendingAttachment.type)}
                    <span className="truncate flex-1 font-medium">{pendingAttachment.name}</span>
                    {pendingAttachment.uploading ? (
                      <Loader2 className="h-3.5 w-3.5 animate-spin text-violet-500" />
                    ) : (
                      <button
                        type="button"
                        onClick={() => setPendingAttachment(null)}
                        className="text-muted-foreground hover:text-red-500 transition-colors"
                      >
                        <XCircle className="h-4 w-4" />
                      </button>
                    )}
                  </div>
                )}

                <div className="flex items-center gap-1.5 rounded-xl border border-input bg-background px-2 py-1 focus-within:ring-2 focus-within:ring-violet-500/25 focus-within:border-violet-500/50 transition-all">
                  <input
                    type="file"
                    ref={fileInputRef}
                    className="hidden"
                    onChange={handleFileSelect}
                    accept="image/*,audio/*,video/*,.pdf,.xml,.txt,.doc,.docx,.xls,.xlsx,.zip"
                  />
                  <button
                    type="button"
                    onClick={() => fileInputRef.current?.click()}
                    disabled={loading || !!pendingAttachment}
                    className="h-8 w-8 shrink-0 flex items-center justify-center rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted disabled:opacity-40 transition-colors cursor-pointer"
                    title="Adjuntar foto, audio o documento técnico"
                    aria-label="Adjuntar archivo"
                  >
                    <Paperclip className="h-4 w-4" />
                  </button>
                  <button
                    type="button"
                    onClick={insertReplyToClient}
                    disabled={loading}
                    className="h-8 px-2 shrink-0 flex items-center gap-1 rounded-lg bg-violet-500/10 hover:bg-violet-500/20 text-violet-700 dark:text-violet-300 border border-violet-500/20 disabled:opacity-40 transition-colors text-[11px] font-semibold cursor-pointer whitespace-nowrap"
                    title="Redactar e insertar respuesta lista para enviar al cliente"
                    aria-label="Responder al cliente"
                  >
                    <Reply className="h-3.5 w-3.5 shrink-0" />
                    <span className="hidden sm:inline">Al Cliente</span>
                  </button>

                  <textarea
                    ref={inputRef}
                    value={input}
                    onChange={(e) => setInput(e.target.value)}
                    onKeyDown={handleKeyDown}
                    onPaste={handlePaste}
                    placeholder={
                      pendingAttachment
                        ? "Escriba su consulta sobre el adjunto..."
                        : "Consulte una falla, modelo o pegue una imagen..."
                    }
                    rows={1}
                    className="flex-1 resize-none bg-transparent px-1.5 py-1 text-[13px] leading-snug text-foreground placeholder:text-muted-foreground/75 focus:outline-none overflow-hidden min-h-[34px] max-h-[108px]"
                  />

                  <button
                    type="button"
                    onClick={() => handleSend()}
                    disabled={(!input.trim() && !pendingAttachment) || loading}
                    className="h-8 w-8 shrink-0 flex items-center justify-center rounded-lg bg-violet-600 text-white disabled:opacity-40 disabled:cursor-not-allowed hover:bg-violet-700 transition-colors shadow-xs cursor-pointer"
                    aria-label="Enviar consulta"
                  >
                    {loading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Send className="h-3.5 w-3.5" />}
                  </button>
                </div>
              </div>
            </>
          )}
        </div>
      </Draggable>

      {/* Modal Flotante para Previsualizar Caso Precedente (#C1, #C2, #C3) */}
      {previewPrecedent && (
        <div className="fixed inset-0 z-[9999] flex items-center justify-center p-4 bg-black/65 backdrop-blur-xs">
          <div className="w-full max-w-lg rounded-2xl bg-card border border-border shadow-2xl overflow-hidden flex flex-col max-h-[85vh] animate-in fade-in zoom-in-95 duration-150">
            <div className="flex items-center justify-between px-4 py-3 border-b border-border bg-muted/40">
              <div className="flex items-center gap-2 min-w-0">
                <div className="h-7 w-7 rounded-lg bg-violet-500/15 border border-violet-500/30 flex items-center justify-center shrink-0">
                  <FolderArchive className="h-4 w-4 text-violet-500" />
                </div>
                <div className="min-w-0">
                  <h3 className="font-bold text-sm truncate">
                    Caso Precedente #{previewPrecedent.id.substring(0, 8)}
                  </h3>
                  {previewPrecedent.resolver && (
                    <p className="text-[11px] text-muted-foreground truncate">
                      Resuelto por {previewPrecedent.resolver}
                    </p>
                  )}
                </div>
              </div>
              <button
                type="button"
                onClick={() => setPreviewPrecedent(null)}
                className="h-7 w-7 rounded-lg hover:bg-muted grid place-items-center text-muted-foreground hover:text-foreground"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="p-4 space-y-3.5 overflow-y-auto flex-1 text-sm">
              {previewPrecedent.loading ? (
                <div className="flex flex-col items-center justify-center py-10 gap-2 text-muted-foreground">
                  <Loader2 className="h-6 w-6 animate-spin text-violet-500" />
                  <p className="text-xs">Cargando expediente técnico del caso...</p>
                </div>
              ) : (
                <>
                  <div className="space-y-1">
                    <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
                      Equipo y Avería Reportada
                    </span>
                    <p className="font-semibold text-foreground text-sm leading-snug">
                      {previewPrecedent.caseData?.title || previewPrecedent.details || "Avería técnica resuelta"}
                    </p>
                    {(previewPrecedent.caseData?.marca || previewPrecedent.caseData?.modelo) && (
                      <p className="text-xs text-muted-foreground">
                        Dispositivo: {previewPrecedent.caseData.marca || ""} {previewPrecedent.caseData.modelo || ""}
                      </p>
                    )}
                  </div>

                  <div className="space-y-1.5 rounded-xl bg-violet-500/10 border border-violet-500/20 p-3.5">
                    <span className="text-[10px] font-bold uppercase tracking-wider text-violet-600 dark:text-violet-400 block">
                      Solución Técnica Aplicada en Taller
                    </span>
                    <p className="text-xs text-foreground whitespace-pre-wrap leading-relaxed">
                      {previewPrecedent.caseData?.resolucion ||
                        previewPrecedent.caseData?.problema ||
                        previewPrecedent.details ||
                        "Caso resuelto satisfactoriamente en taller."}
                    </p>
                  </div>

                  {Array.isArray(previewPrecedent.caseData?.histtecnico) &&
                    previewPrecedent.caseData.histtecnico.length > 0 && (
                      <div className="space-y-1.5">
                        <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
                          Intervenciones del Técnico
                        </span>
                        <div className="space-y-1.5 max-h-48 overflow-y-auto pr-1">
                          {previewPrecedent.caseData.histtecnico
                            .filter((n: any) => n.content && typeof n.content === "string")
                            .slice(-4)
                            .map((n: any, idx: number) => (
                              <div key={idx} className="p-2.5 rounded-lg bg-muted/50 border border-border/50 text-xs">
                                <span className="font-semibold text-[11px] text-violet-600 dark:text-violet-400 block mb-0.5">
                                  {n.author || "Técnico Sekunet"}
                                </span>
                                <p className="text-muted-foreground leading-snug whitespace-pre-wrap">{n.content}</p>
                              </div>
                            ))}
                        </div>
                      </div>
                    )}
                </>
              )}
            </div>

            <div className="p-3 border-t border-border bg-muted/30 flex items-center justify-between gap-2">
              <button
                type="button"
                onClick={() => {
                  window.open(`/inbox?c=${previewPrecedent.id}`, "_blank");
                }}
                className="px-3 py-1.5 rounded-xl bg-violet-600 hover:bg-violet-700 text-white text-xs font-semibold flex items-center gap-1.5 shadow-xs cursor-pointer"
              >
                <ExternalLink className="h-3.5 w-3.5" />
                <span>Abrir expediente completo</span>
              </button>
              <button
                type="button"
                onClick={() => setPreviewPrecedent(null)}
                className="px-3 py-1.5 rounded-xl bg-muted hover:bg-muted/80 text-foreground text-xs font-semibold cursor-pointer"
              >
                Cerrar
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal Flotante para Previsualizar Manual Oficial de Base de Conocimiento (#M1, #M2) */}
      {previewManual && (
        <div className="fixed inset-0 z-[9999] flex items-center justify-center p-4 bg-black/65 backdrop-blur-xs">
          <div className="w-full max-w-lg rounded-2xl bg-card border border-border shadow-2xl overflow-hidden flex flex-col max-h-[85vh] animate-in fade-in zoom-in-95 duration-150">
            <div className="flex items-center justify-between px-4 py-3 border-b border-border bg-muted/40">
              <div className="flex items-center gap-2 min-w-0">
                <div className="h-7 w-7 rounded-lg bg-amber-500/15 border border-amber-500/30 flex items-center justify-center shrink-0">
                  <BookOpen className="h-4 w-4 text-amber-500" />
                </div>
                <div className="min-w-0">
                  <h3 className="font-bold text-sm truncate">{previewManual.docName}</h3>
                  <p className="text-[11px] text-muted-foreground truncate">
                    Base de Conocimiento Oficial Sekunet
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setPreviewManual(null)}
                className="h-7 w-7 rounded-lg hover:bg-muted grid place-items-center text-muted-foreground hover:text-foreground"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="p-4 space-y-3 overflow-y-auto flex-1 text-xs">
              {previewManual.loading ? (
                <div className="flex flex-col items-center justify-center py-10 gap-2 text-muted-foreground">
                  <Loader2 className="h-6 w-6 animate-spin text-amber-500" />
                  <p className="text-xs">Extrayendo fragmentos técnicos del manual...</p>
                </div>
              ) : previewManual.chunks && previewManual.chunks.length > 0 ? (
                previewManual.chunks.map((ch, idx) => (
                  <div
                    key={ch.id || idx}
                    className="p-3 rounded-xl bg-amber-500/5 border border-amber-500/20 space-y-1"
                  >
                    <span className="text-[10px] font-bold uppercase tracking-wider text-amber-600 dark:text-amber-400">
                      Sección #{idx + 1}
                    </span>
                    <p className="text-foreground/90 whitespace-pre-wrap leading-relaxed">{ch.content}</p>
                  </div>
                ))
              ) : (
                <p className="text-muted-foreground py-6 text-center">
                  Documento indexado en la Base de Conocimiento Oficial de Sekunet.
                </p>
              )}
            </div>

            <div className="p-3 border-t border-border bg-muted/30 flex items-center justify-end">
              <button
                type="button"
                onClick={() => setPreviewManual(null)}
                className="px-3.5 py-1.5 rounded-xl bg-muted hover:bg-muted/80 text-foreground text-xs font-semibold cursor-pointer"
              >
                Cerrar
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

function renderStructuredBody(mainBody: string) {
  const lines = mainBody.split("\n");
  const blocks: React.ReactNode[] = [];

  const SECTION_HEADER_REGEX =
    /^(?:•\s*)?(Falla y Causa Ra[ií]z|Soluci[oó]n Comprobada[^:]*|Procedimiento de Resoluci[oó]n[^:]*|Instrucci[oó]n Concreta[^:]*|Diagn[oó]stico[^:]*|Causa Ra[ií]z[^:]*|Pasos de Resoluci[oó]n[^:]*):\s*(.*)$/i;

  lines.forEach((rawLine, idx) => {
    const line = rawLine.trim();
    if (!line) {
      blocks.push(<div key={`sp-${idx}`} className="h-1.5" />);
      return;
    }

    const secMatch = line.match(SECTION_HEADER_REGEX);
    if (secMatch) {
      const title = secMatch[1].trim();
      const rest = secMatch[2]?.trim();
      blocks.push(
        <div key={`sec-${idx}`} className="pt-2 first:pt-0 space-y-1">
          <div className="flex items-center gap-1.5">
            <span className="h-3.5 w-1 rounded-full bg-violet-500 shrink-0" />
            <span className="text-[11px] font-bold uppercase tracking-wider text-violet-600 dark:text-violet-400">
              {title}
            </span>
          </div>
          {rest && <p className="text-[13px] text-foreground/95 leading-relaxed pl-2.5">{rest}</p>}
        </div>
      );
      return;
    }

    const numMatch = line.match(/^(\d+)\.\s+(.*)$/);
    if (numMatch) {
      blocks.push(
        <div key={`num-${idx}`} className="flex items-start gap-2 pl-1 py-0.5">
          <span className="h-5 min-w-[20px] px-1 rounded-md bg-violet-500/15 border border-violet-500/25 text-violet-700 dark:text-violet-300 text-[11px] font-bold flex items-center justify-center shrink-0 mt-0.5">
            {numMatch[1]}
          </span>
          <p className="text-[13px] text-foreground/95 leading-relaxed flex-1 break-words">{numMatch[2]}</p>
        </div>
      );
      return;
    }

    if (line.startsWith("•")) {
      const bulletText = line.replace(/^•\s*/, "").trim();
      blocks.push(
        <div key={`bul-${idx}`} className="flex items-start gap-2 pl-1.5 py-0.5">
          <span className="h-1.5 w-1.5 rounded-full bg-violet-500 shrink-0 mt-2" />
          <p className="text-[13px] text-foreground/95 leading-relaxed flex-1 break-words">{bulletText}</p>
        </div>
      );
      return;
    }

    blocks.push(
      <p key={`p-${idx}`} className="text-[13px] text-foreground/95 leading-relaxed break-words">
        {line}
      </p>
    );
  });

  return <div className="space-y-1">{blocks}</div>;
}

function renderAssistantMessage(
  content: string,
  onOpenCase: (caseId: string, label?: string, resolver?: string, details?: string) => void,
  onOpenManual: (docName: string, label?: string) => void
) {
  const sourcesMatch = content.match(/\n*(?:Fuentes(?:\s+t[eé]cnicas)?\s+consultadas|Fuentes:)([\s\S]*)$/i);
  let mainBody = content;
  let sourcesPart = "";

  if (sourcesMatch && sourcesMatch.index !== undefined) {
    mainBody = content.substring(0, sourcesMatch.index).trim();
    sourcesPart = sourcesMatch[1].trim();
  }

  return (
    <div className="space-y-2.5 w-full">
      {renderStructuredBody(mainBody)}
      {sourcesPart && renderSourcesFooter(sourcesPart, onOpenCase, onOpenManual)}
    </div>
  );
}

function extractCleanDomain(rawUrl: string): { domain: string; isPdf: boolean } {
  const isPdf = /\.pdf($|\?)/i.test(rawUrl);
  try {
    const u = new URL(rawUrl);
    return { domain: u.hostname.replace(/^www\./i, ""), isPdf };
  } catch {
    return { domain: "Fuente oficial", isPdf };
  }
}

function renderSourcesFooter(
  sourcesText: string,
  onOpenCase: (caseId: string, label?: string, resolver?: string, details?: string) => void,
  onOpenManual: (docName: string, label?: string) => void
) {
  const manualRegex = /\[(M\d+)\]\s*Manual(?:\s+Oficial)?:\s*(.+?)\s*\(([^)\n]+)\)/gi;
  const caseRegex =
    /\[(C\d+)\]\s*Caso(?:\s+Sekunet)?\s*#([0-9a-f]{6,36})(?:\s+resuelto\s+por\s+([^(,\n]+))?(?:\s*\(([^)\n]+)\))?/gi;
  const webRegex = /\[(W\d+)\]\s*(.+?)\s*\((https?:\/\/[^\s)]+)\)/gi;

  const cards: React.ReactNode[] = [];
  let match: RegExpExecArray | null;

  // 1. Casos Precedentes Resueltos en Sekunet ([C1], [C2], [C3])
  const seenCaseIds = new Set<string>();
  let caseCounter = 0;
  while ((match = caseRegex.exec(sourcesText)) !== null) {
    const caseId = match[2].trim();
    if (seenCaseIds.has(caseId)) continue;
    seenCaseIds.add(caseId);

    caseCounter++;
    const displayLabel = `C${caseCounter}`;
    const resolver = match[3]?.trim() || "Taller Sekunet";
    const details = match[4]?.trim() || "Avería técnica resuelta";

    cards.push(
      <button
        type="button"
        key={`case-${caseId}-${caseCounter}`}
        onClick={() => onOpenCase(caseId, displayLabel, resolver, details)}
        className="group text-left p-2 rounded-xl bg-violet-500/8 hover:bg-violet-500/16 border border-violet-500/25 hover:border-violet-500/45 transition-all cursor-pointer flex flex-col justify-between gap-1 min-w-0 shadow-2xs"
        title={`Ver solución del Caso #${caseId.substring(0, 8)} (${resolver}): ${details}`}
      >
        <div className="flex items-center justify-between gap-1.5 w-full min-w-0">
          <div className="flex items-center gap-1 min-w-0">
            <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md bg-violet-500/20 text-violet-700 dark:text-violet-300 font-bold text-[10px] shrink-0">
              <FolderArchive className="h-3 w-3 shrink-0" />
              {displayLabel} #{caseId.substring(0, 6)}
            </span>
            <span className="text-[11px] font-semibold text-foreground/85 truncate">{resolver}</span>
          </div>
          <ExternalLink className="h-3 w-3 text-violet-500 opacity-60 group-hover:opacity-100 shrink-0 transition-opacity" />
        </div>
        <p className="text-[11px] text-muted-foreground leading-snug line-clamp-2 break-words">{details}</p>
      </button>
    );
  }

  // 2. Manuales Oficiales en Base de Conocimiento ([M1], [M2])
  const seenDocs = new Set<string>();
  let manualCounter = 0;
  while ((match = manualRegex.exec(sourcesText)) !== null) {
    const docName = match[2].trim();
    const normDoc = docName.toLowerCase();
    if (seenDocs.has(normDoc)) continue;
    seenDocs.add(normDoc);

    manualCounter++;
    const displayLabel = `M${manualCounter}`;

    cards.push(
      <button
        type="button"
        key={`manual-${normDoc}-${manualCounter}`}
        onClick={() => onOpenManual(docName, displayLabel)}
        className="group text-left p-2 rounded-xl bg-amber-500/8 hover:bg-amber-500/16 border border-amber-500/25 hover:border-amber-500/45 transition-all cursor-pointer flex flex-col justify-between gap-1 min-w-0 shadow-2xs"
        title={`Consultar Manual Oficial: ${docName}`}
      >
        <div className="flex items-center justify-between gap-1.5 w-full min-w-0">
          <div className="flex items-center gap-1 min-w-0">
            <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md bg-amber-500/20 text-amber-700 dark:text-amber-300 font-bold text-[10px] shrink-0">
              <BookOpen className="h-3 w-3 shrink-0" />
              {displayLabel} Manual
            </span>
            <span className="text-[10px] font-medium text-amber-700/80 dark:text-amber-300/80 truncate">
              Base Conocimiento
            </span>
          </div>
          <ExternalLink className="h-3 w-3 text-amber-500 opacity-60 group-hover:opacity-100 shrink-0 transition-opacity" />
        </div>
        <p className="text-[11px] font-medium text-foreground/90 leading-snug line-clamp-2 break-words">{docName}</p>
      </button>
    );
  }

  // 3. Fuentes Web Oficiales en Vivo ([W1], [W2])
  const seenUrls = new Set<string>();
  let webCounter = 0;
  while ((match = webRegex.exec(sourcesText)) !== null) {
    const title = match[2].trim();
    const url = match[3].trim();
    if (seenUrls.has(url)) continue;
    seenUrls.add(url);

    webCounter++;
    const displayLabel = `W${webCounter}`;
    const { domain, isPdf } = extractCleanDomain(url);

    cards.push(
      <a
        key={`web-${url}-${webCounter}`}
        href={url}
        target="_blank"
        rel="noreferrer"
        className="group text-left p-2 rounded-xl bg-sky-500/8 hover:bg-sky-500/16 border border-sky-500/25 hover:border-sky-500/45 transition-all cursor-pointer flex flex-col justify-between gap-1 min-w-0 shadow-2xs"
        title={`${title}\n${url}`}
      >
        <div className="flex items-center justify-between gap-1.5 w-full min-w-0">
          <div className="flex items-center gap-1 min-w-0">
            <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md bg-sky-500/20 text-sky-700 dark:text-sky-300 font-bold text-[10px] shrink-0">
              <Globe className="h-3 w-3 shrink-0" />
              {displayLabel}
            </span>
            <span className="text-[10px] font-semibold text-sky-700/90 dark:text-sky-300/90 truncate">{domain}</span>
            {isPdf && (
              <span className="px-1 py-0.2 rounded bg-sky-500/20 text-[9px] font-bold text-sky-600 dark:text-sky-300 uppercase shrink-0">
                PDF
              </span>
            )}
          </div>
          <ExternalLink className="h-3 w-3 text-sky-500 opacity-60 group-hover:opacity-100 shrink-0 transition-opacity" />
        </div>
        <p className="text-[11px] font-medium text-foreground/90 leading-snug line-clamp-2 break-words">{title}</p>
      </a>
    );
  }

  const hasCurrentCase = /conversaci[oó]n/i.test(sourcesText);

  return (
    <div className="mt-3 pt-2.5 border-t border-border/60 w-full space-y-2">
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <div className="font-bold text-[10px] uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
          <BookOpen className="h-3 w-3 text-violet-500 shrink-0" />
          <span>Fuentes y Precedentes ({cards.length})</span>
        </div>
        {hasCurrentCase && (
          <span className="inline-flex items-center gap-1 text-[10px] text-emerald-600 dark:text-emerald-400 font-medium">
            <CheckCircle2 className="h-3 w-3 shrink-0" />
            Hilo y adjuntos del caso actual
          </span>
        )}
      </div>

      {cards.length > 0 && (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5 w-full">{cards}</div>
      )}
    </div>
  );
}
