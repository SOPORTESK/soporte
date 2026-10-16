"use client";

import * as React from "react";
import { MessageCircle, X, Send, Loader2, Minimize2, Maximize2, GripVertical, Paperclip, FileText, Image as ImageIcon, XCircle, RotateCcw, Reply, ExternalLink, FolderArchive, Globe, BookOpen } from "lucide-react";
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
  const bubbleRef = React.useRef<HTMLButtonElement>(null);
  const panelRef = React.useRef<HTMLDivElement>(null);
  const scrollRef = React.useRef<HTMLDivElement>(null);
  const inputRef = React.useRef<HTMLTextAreaElement>(null);
  const fileInputRef = React.useRef<HTMLInputElement>(null);
  const dragStartPosRef = React.useRef<{ x: number; y: number } | null>(null);
  const dragMovedRef = React.useRef(false);

  // Set initial bubble position on client only
  React.useEffect(() => {
    const bubbleSize = 56;
    const padding = 24;
    setBubblePosition(prev => {
      if (prev.x !== 0 || prev.y !== 0) return prev;
      return {
        x: Math.max(padding, window.innerWidth - bubbleSize - padding),
        y: Math.max(padding, window.innerHeight - bubbleSize - padding),
      };
    });
  }, []);

  // Restaurar posición guardada de la burbuja (localStorage — persiste entre sesiones)
  React.useEffect(() => {
    const saved = localStorage.getItem("sek_tech_assistant_bubble_pos_v3");
    if (saved) {
      try {
        const parsed = JSON.parse(saved) as Position;
        if (typeof parsed.x === "number" && typeof parsed.y === "number") {
          setBubblePosition(clampPosition(parsed, 56, 8));
        }
      } catch { /* ignorar */ }
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

    if (urlC) {
      if (urlC.startsWith("tel:") || urlC.startsWith("case:")) return urlC;
      return /^\+?\d{8,15}$/.test(urlC) ? `tel:${urlC}` : `case:${urlC}`;
    }
    if (globalId) {
      const gStr = String(globalId).trim();
      if (gStr.startsWith("tel:") || gStr.startsWith("case:")) return gStr;
      return /^\+?\d{8,15}$/.test(gStr) ? `tel:${gStr}` : `case:${gStr}`;
    }
    if (globalPhone) {
      const cleanPhone = String(globalPhone).replace(/^tel:/, "").trim();
      if (cleanPhone) return `tel:${cleanPhone}`;
    }
    return null;
  }, []);

  // Detectar caso actual desde estado global, URL (?c=...) y eventos de navegación
  React.useEffect(() => {
    const readCaseId = () => {
      const resolved = resolveCurrentCaseId();
      setCaseId(prev => (prev !== resolved ? resolved : prev));
    };
    readCaseId();

    window.addEventListener("popstate", readCaseId);
    window.addEventListener("sek-open-case-change", readCaseId as EventListener);

    // Patch pushState/replaceState para detectar navegación client-side
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

    // Polling cada 500ms como respaldo
    const pollInterval = setInterval(readCaseId, 500);

    return () => {
      window.removeEventListener("popstate", readCaseId);
      window.removeEventListener("sek-open-case-change", readCaseId as EventListener);
      history.pushState = origPush;
      history.replaceState = origReplace;
      clearInterval(pollInterval);
    };
  }, []);

  // #8: Limpiar mensajes al cambiar de caso (evita contexto cruzado entre casos)
  const prevCaseRef = React.useRef<string | null>(null);
  React.useEffect(() => {
    if (prevCaseRef.current !== null && caseId !== null && prevCaseRef.current !== caseId) {
      setMessages([]);
      setSessionId(null);
      setPendingAttachment(null);
      localStorage.removeItem("sek_tech_assistant_session_v6");
    }
    prevCaseRef.current = caseId;
  }, [caseId]);

  // Cargar sesión previa desde localStorage (máx 10 mensajes)
  React.useEffect(() => {
    if (!isOpen) return;
    try {
      localStorage.removeItem("sek_tech_assistant_session");
      localStorage.removeItem("sek_tech_assistant_session_v3");
      localStorage.removeItem("sek_tech_assistant_session_v4");
      localStorage.removeItem("sek_tech_assistant_session_v5");
    } catch { /* ignorar */ }
    const saved = localStorage.getItem("sek_tech_assistant_session_v6");
    if (saved) {
      try {
        const parsed = JSON.parse(saved);
        if (parsed.messages && Array.isArray(parsed.messages)) {
          const cleaned = parsed.messages.map((m: any) => {
            if (m.content && typeof m.content === "string" && m.content.includes("Instrucciones de atención al cliente") && m.content.includes("Redacte la respuesta")) {
              return { ...m, content: "Redactar propuesta de respuesta para el cliente basada en el caso abierto" };
            }
            return m;
          });
          setSessionId(parsed.session_id || null);
          setMessages(cleaned.slice(-10));
        }
      } catch { /* ignorar */ }
    }
  }, [isOpen]);

  React.useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages, isOpen]);

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
      localStorage.setItem("sek_tech_assistant_session_v6", JSON.stringify({
        session_id: sessionId || null,
        messages: finalMessages,
      }));
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
      const { data, error } = await supabase.storage.from("attachments").upload(path, file, { contentType: file.type || "application/octet-stream" });
      if (error) throw error;
      const { data: urlData } = supabase.storage.from("attachments").getPublicUrl(data.path);
      setPendingAttachment({ url: urlData.publicUrl, type: file.type || "application/octet-stream", name: displayName, uploading: false });
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
    if (type.startsWith("image/")) return <ImageIcon className="h-4 w-4" />;
    return <FileText className="h-4 w-4" />;
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
    localStorage.removeItem("sek_tech_assistant_session_v6");
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
        localStorage.setItem("sek_tech_assistant_session_v6", JSON.stringify({
          session_id: sessionId || null,
          messages: finalMessages,
        }));
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
    localStorage.removeItem("sek_tech_assistant_session_v6");
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

  const openFromBubble = () => {
    const rect = bubbleRef.current?.getBoundingClientRect();
    const bubbleSize = 56;
    const panelWidth = typeof window !== "undefined" && window.innerWidth >= 640 ? 460 : 340;
    const panelHeight = 540;
    const padding = 8;
    // Posicionar el panel con su esquina inferior-derecha en la esquina inferior-derecha de la burbuja
    // (expande desde la burbuja hacia arriba-izquierda)
    let left = (rect?.left ?? window.innerWidth - bubbleSize - padding) + bubbleSize - panelWidth;
    let top = (rect?.top ?? window.innerHeight - bubbleSize - padding) + bubbleSize - panelHeight;
    left = Math.max(padding, Math.min(left, window.innerWidth - panelWidth - padding));
    top = Math.max(padding, Math.min(top, window.innerHeight - panelHeight - padding));
    setPanelPosition({ x: left, y: top });
    setIsOpen(true);
  };

  if (!isOpen) {
    return (
      <Draggable
        nodeRef={bubbleRef as any}
        position={bubblePosition}
        onDrag={handleBubbleDrag}
        onStop={handleBubbleDragStop}
        bounds={typeof window !== "undefined" ? { left: 8, top: 8, right: window.innerWidth - 64, bottom: window.innerHeight - 64 } : undefined}
        handle=".sek-tech-drag-handle"
      >
        <button
          ref={bubbleRef}
          suppressHydrationWarning
          onMouseDown={handleBubbleMouseDown}
          onClick={handleBubbleClick}
          className="sek-tech-drag-handle fixed top-0 left-0 z-50 flex h-14 w-14 items-center justify-center rounded-full bg-violet-600 text-white shadow-lg shadow-violet-600/30 hover:bg-violet-700 transition-all hover:scale-105"
          aria-label="Asistente técnico"
        >
          <MessageCircle className="h-6 w-6" />
        </button>
      </Draggable>
    );
  }

  return (
    <>
    <Draggable
      nodeRef={panelRef as any}
      position={panelPosition}
      onDrag={handlePanelDrag}
      onStop={handlePanelDragStop}
      bounds={typeof window !== "undefined" ? { left: 8, top: 8, right: window.innerWidth - 468, bottom: window.innerHeight - 548 } : undefined}
      handle=".sek-tech-drag-handle"
    >
      <div
        ref={panelRef}
        suppressHydrationWarning
        className={`fixed top-0 left-0 z-50 flex flex-col rounded-2xl border border-border bg-card shadow-2xl overflow-hidden ${isMinimized ? "h-14 w-72" : "h-[540px] w-80 sm:w-[460px]"}`}
      >
        {/* Header arrastrable */}
        <div
          className="sek-tech-drag-handle flex items-center justify-between px-4 py-3 bg-gradient-to-r from-violet-600 to-indigo-600 text-white cursor-grab active:cursor-grabbing select-none"
        >
        <div className="flex items-center gap-2">
          <GripVertical className="h-4 w-4 opacity-60" />
          <MessageCircle className="h-4 w-4" />
          <span className="text-sm font-semibold">Asistente Técnico</span>
          {caseId && (
            <button
              type="button"
              onClick={startNewCaseChat}
              onMouseDown={(e) => e.stopPropagation()}
              onTouchStart={(e) => e.stopPropagation()}
              className="ml-2 text-[11px] font-medium bg-white/20 hover:bg-white/30 px-2 py-0.5 rounded-md cursor-pointer transition-colors"
              title="Analizar y diagnosticar el caso abierto en pantalla"
            >
              Analizar Caso
            </button>
          )}
          {messages.length > 0 && (
            <button
              type="button"
              onClick={startNewChat}
              onMouseDown={(e) => e.stopPropagation()}
              onTouchStart={(e) => e.stopPropagation()}
              className="ml-1 text-[11px] flex items-center gap-1 bg-white/10 hover:bg-white/20 px-1.5 py-0.5 rounded-md cursor-pointer transition-colors"
              title="Borrar conversación y empezar de cero"
            >
              <RotateCcw className="h-3 w-3" />
              <span>Limpiar</span>
            </button>
          )}
        </div>
        <div className="flex items-center gap-1">
          <button
            onClick={() => setIsMinimized(!isMinimized)}
            onMouseDown={(e) => e.stopPropagation()}
            onTouchStart={(e) => e.stopPropagation()}
            className="p-1 rounded hover:bg-white/20"
            aria-label={isMinimized ? "Maximizar" : "Minimizar"}
          >
            {isMinimized ? <Maximize2 className="h-4 w-4" /> : <Minimize2 className="h-4 w-4" />}
          </button>
          <button
            onClick={() => setIsOpen(false)}
            onMouseDown={(e) => e.stopPropagation()}
            onTouchStart={(e) => e.stopPropagation()}
            className="p-1 rounded hover:bg-white/20"
            aria-label="Cerrar"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      </div>

      {!isMinimized && (
        <>
          {/* #2: Aviso cuando no hay caso seleccionado */}
          {!caseId && (
            <div className="px-3 py-2 bg-amber-500/10 border-b border-amber-500/20 text-amber-700 dark:text-amber-400 text-[11px] flex items-center gap-1.5">
              <span className="font-medium">Sin caso:</span>
              <span>El asistente responde sin contexto del caso. Abra un caso para contexto completo.</span>
            </div>
          )}
          {/* Messages */}
          <div ref={scrollRef} className="flex-1 overflow-y-auto p-4 space-y-3">
            {messages.length === 0 && (
              <div className="text-center text-xs text-muted-foreground py-6">
                <p className="font-medium mb-1">¿En qué le ayudo?</p>
                <p>Puede preguntar sobre diagnósticos, inventario, o pedir ayuda para responder un caso.</p>
              </div>
            )}
            {messages.map((m, i) => (
              <div
                key={i}
                className={`flex ${m.role === "user" ? "justify-end" : "justify-start"}`}
              >
                <div
                  className={`max-w-[85%] rounded-2xl px-3 py-2 text-sm ${
                    m.role === "user"
                      ? "bg-violet-600 text-white rounded-br-md"
                      : "bg-muted text-foreground rounded-bl-md"
                  }`}
                >
                  {m.mediaUrl && (
                    <a
                      href={m.mediaUrl}
                      target="_blank"
                      rel="noreferrer"
                      className="flex items-center gap-2 mb-2 text-xs underline opacity-90 hover:opacity-100"
                      onClick={(e) => e.stopPropagation()}
                    >
                      {attachmentIcon(m.mediaType || "")}
                      <span className="truncate max-w-[180px]">{m.fileName || "Adjunto"}</span>
                    </a>
                  )}
                  {m.role === "assistant" ? (
                    renderAssistantMessage(m.content, handleOpenHistoricalCase)
                  ) : (
                    <p className="whitespace-pre-wrap">
                      {m.content && m.content.includes("Instrucciones de atención al cliente") && m.content.includes("Redacte la respuesta")
                        ? "Redactar propuesta de respuesta para el cliente basada en el caso abierto"
                        : m.content}
                    </p>
                  )}
                </div>
              </div>
            ))}
            {loading && (
              <div className="flex justify-start">
                <div className="bg-muted rounded-2xl rounded-bl-md px-3 py-2 flex items-center gap-2">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  <span className="text-xs text-muted-foreground">Pensando...</span>
                </div>
              </div>
            )}
          </div>

          {/* Input */}
          <div className="border-t border-border p-3 bg-card">
            {pendingAttachment && (
              <div className="flex items-center gap-2 mb-2 px-2 py-1.5 rounded-lg bg-violet-100 dark:bg-violet-900/30 text-xs">
                {attachmentIcon(pendingAttachment.type)}
                <span className="truncate flex-1">{pendingAttachment.name}</span>
                {pendingAttachment.uploading ? (
                  <Loader2 className="h-3 w-3 animate-spin" />
                ) : (
                  <button onClick={() => setPendingAttachment(null)} className="hover:text-red-500">
                    <XCircle className="h-4 w-4" />
                  </button>
                )}
              </div>
            )}
            <div className="flex items-end gap-2">
              <input
                type="file"
                ref={fileInputRef}
                className="hidden"
                onChange={handleFileSelect}
                accept="image/*,audio/*,video/*,.pdf,.xml,.txt,.doc,.docx,.xls,.xlsx,.zip"
              />
              <button
                onClick={() => fileInputRef.current?.click()}
                disabled={loading || !!pendingAttachment}
                className="h-10 w-10 flex items-center justify-center rounded-full border border-input text-muted-foreground hover:bg-muted disabled:opacity-50"
                aria-label="Adjuntar archivo"
              >
                <Paperclip className="h-4 w-4" />
              </button>
              <button
                onClick={insertReplyToClient}
                disabled={loading}
                className="h-10 w-10 flex items-center justify-center rounded-full border border-input text-violet-600 hover:bg-violet-50 dark:hover:bg-violet-900/20 disabled:opacity-50"
                aria-label="Responder al cliente"
                title="Insertar instrucciones de respuesta al cliente"
              >
                <Reply className="h-4 w-4" />
              </button>
              <textarea
                ref={inputRef}
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={handleKeyDown}
                onPaste={handlePaste}
                placeholder={pendingAttachment ? "Escriba una pregunta sobre el archivo..." : "Escriba su consulta o pegue una imagen..."}
                rows={1}
                className="flex-1 resize-none rounded-xl border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-violet-500/30 min-h-[40px] max-h-[120px]"
              />
              <button
                onClick={() => handleSend()}
                disabled={(!input.trim() && !pendingAttachment) || loading}
                className="h-10 w-10 flex items-center justify-center rounded-full bg-violet-600 text-white disabled:opacity-50 disabled:cursor-not-allowed hover:bg-violet-700"
                aria-label="Enviar"
              >
                {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
              </button>
            </div>
          </div>
        </>
      )}
    </div>
    </Draggable>

    {/* Modal flotante de consulta de caso precedente (sin desarmar ni cambiar el caso activo) */}
    {previewPrecedent && (
      <div className="fixed inset-0 z-[9999] flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs">
        <div className="w-full max-w-lg rounded-2xl bg-card border border-border shadow-2xl overflow-hidden flex flex-col max-h-[85vh] animate-in fade-in zoom-in-95 duration-150">
          <div className="flex items-center justify-between px-4 py-3 border-b border-border bg-muted/40">
            <div className="flex items-center gap-2 min-w-0">
              <FolderArchive className="h-4 w-4 text-violet-500 shrink-0" />
              <h3 className="font-bold text-sm truncate">
                Precedente #{previewPrecedent.id.substring(0, 8)}
                {previewPrecedent.resolver ? ` • ${previewPrecedent.resolver}` : ""}
              </h3>
            </div>
            <button
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
                <p className="text-xs">Consultando detalles de la solución del caso...</p>
              </div>
            ) : (
              <>
                <div className="space-y-1">
                  <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Caso y Falla Reportada</span>
                  <p className="font-semibold text-foreground text-sm">
                    {previewPrecedent.caseData?.title || previewPrecedent.details || "Avería resuelta"}
                  </p>
                  {(previewPrecedent.caseData?.marca || previewPrecedent.caseData?.modelo) && (
                    <p className="text-xs text-muted-foreground">
                      Equipo: {previewPrecedent.caseData.marca || ""} {previewPrecedent.caseData.modelo || ""}
                    </p>
                  )}
                </div>

                <div className="space-y-1.5 rounded-xl bg-violet-500/10 border border-violet-500/20 p-3">
                  <span className="text-[10px] font-bold uppercase tracking-wider text-violet-600 dark:text-violet-400 block">
                    Procedimiento / Solución Técnica Registrada
                  </span>
                  <p className="text-xs text-foreground whitespace-pre-wrap leading-relaxed">
                    {previewPrecedent.caseData?.resolucion ||
                      previewPrecedent.caseData?.problema ||
                      previewPrecedent.details ||
                      "Caso resuelto en taller."}
                  </p>
                </div>

                {Array.isArray(previewPrecedent.caseData?.histtecnico) && previewPrecedent.caseData.histtecnico.length > 0 && (
                  <div className="space-y-1.5">
                    <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
                      Últimas Notas Técnicas
                    </span>
                    <div className="space-y-1.5 max-h-44 overflow-y-auto pr-1">
                      {previewPrecedent.caseData.histtecnico
                        .filter((n: any) => n.content && typeof n.content === "string")
                        .slice(-3)
                        .map((n: any, idx: number) => (
                          <div key={idx} className="p-2 rounded-lg bg-muted/50 border border-border/50 text-xs">
                            <span className="font-semibold text-[11px] text-violet-600 dark:text-violet-400 block mb-0.5">
                              {n.author || "Técnico"}
                            </span>
                            <p className="text-muted-foreground leading-snug">{n.content}</p>
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
              onClick={() => {
                window.open(`/inbox?c=${previewPrecedent.id}`, "_blank");
              }}
              className="px-3 py-1.5 rounded-xl bg-violet-600 hover:bg-violet-700 text-white text-xs font-semibold flex items-center gap-1.5 shadow-xs"
            >
              <ExternalLink className="h-3.5 w-3.5" />
              <span>Abrir chat completo en pestaña nueva</span>
            </button>
            <button
              onClick={() => setPreviewPrecedent(null)}
              className="px-3 py-1.5 rounded-xl bg-muted hover:bg-muted/80 text-foreground text-xs font-semibold"
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

function renderAssistantMessage(
  content: string,
  onOpenCase: (caseId: string, label?: string, resolver?: string, details?: string) => void
) {
  const sourcesMatch = content.match(/\n*(?:Fuentes(?:\s+t[eé]cnicas)?\s+consultadas|Fuentes:)([\s\S]*)$/i);
  let mainBody = content;
  let sourcesPart = "";

  if (sourcesMatch && sourcesMatch.index !== undefined) {
    mainBody = content.substring(0, sourcesMatch.index).trim();
    sourcesPart = sourcesMatch[1].trim();
  }

  return (
    <div className="space-y-2">
      <p className="whitespace-pre-wrap">{mainBody}</p>
      {sourcesPart && renderSourcesFooter(sourcesPart, onOpenCase)}
    </div>
  );
}

function renderSourcesFooter(
  sourcesText: string,
  onOpenCase: (caseId: string, label?: string, resolver?: string, details?: string) => void
) {
  const manualRegex = /\[(M\d+)\]\s*Manual(?:\s+Oficial)?:\s*([^(\n]+?)\s*\(([^)\n]+)\)/gi;
  const caseRegex = /\[(C\d+)\]\s*Caso(?:\s+Sekunet)?\s*#([0-9a-f]{6,36})(?:\s+resuelto\s+por\s+([^(,\n]+))?(?:\s*\(([^)\n]+)\))?/gi;
  const webRegex = /\[(W\d+)\]\s*([^(\n]+?)\s*\((https?:\/\/[^\s)]+)\)/gi;

  const elements: React.ReactNode[] = [];

  let match: RegExpExecArray | null;

  let manualCounter = 0;
  while ((match = manualRegex.exec(sourcesText)) !== null) {
    manualCounter++;
    const displayLabel = `M${manualCounter}`;
    const docName = match[2].trim();
    const sourceInfo = match[3].trim();

    elements.push(
      <div
        key={`manual-${docName}-${manualCounter}`}
        className="w-full text-left p-2.5 rounded-xl bg-amber-500/10 text-amber-950 dark:text-amber-100 border border-amber-500/25 shadow-xs flex flex-col gap-1"
      >
        <div className="flex items-start justify-between w-full gap-2">
          <div className="flex items-start gap-1.5 min-w-0 flex-1">
            <BookOpen className="h-4 w-4 text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" />
            <span className="font-bold text-xs text-amber-700 dark:text-amber-300 shrink-0">[{displayLabel}]</span>
            <span className="font-semibold text-xs text-foreground/90 break-words flex-1 leading-snug">{docName}</span>
          </div>
        </div>
        <span className="text-[11px] text-amber-700/80 dark:text-amber-400/80 break-words">
          {sourceInfo}
        </span>
      </div>
    );
  }

  let caseCounter = 0;
  while ((match = caseRegex.exec(sourcesText)) !== null) {
    caseCounter++;
    const displayLabel = `C${caseCounter}`;
    const caseId = match[2];
    const resolver = match[3]?.trim();
    const details = match[4]?.trim();

    elements.push(
      <button
        key={`case-${caseId}-${caseCounter}`}
        onClick={() => onOpenCase(caseId, displayLabel, resolver, details)}
        className="w-full text-left p-2.5 rounded-xl bg-violet-500/10 hover:bg-violet-500/20 text-violet-950 dark:text-violet-100 transition-all border border-violet-500/25 group cursor-pointer shadow-xs flex flex-col gap-1.5"
        title={`Clic para consultar solución del precedente #${caseId}`}
      >
        <div className="flex items-center justify-between w-full gap-2">
          <div className="flex items-center gap-1.5 min-w-0 flex-wrap">
            <span className="inline-flex items-center gap-1 font-bold text-xs text-violet-700 dark:text-violet-300">
              <FolderArchive className="h-4 w-4 text-violet-600 dark:text-violet-400 shrink-0" />
              [{displayLabel}] #{caseId.substring(0, 8)}
            </span>
            {resolver && (
              <span className="text-xs font-semibold text-foreground/90">
                • {resolver}
              </span>
            )}
          </div>
          <ExternalLink className="h-4 w-4 opacity-60 group-hover:opacity-100 text-violet-600 dark:text-violet-400 shrink-0" />
        </div>
        {details && (
          <p className="text-xs text-muted-foreground leading-relaxed break-words">
            {details}
          </p>
        )}
      </button>
    );
  }

  let webCounter = 0;
  while ((match = webRegex.exec(sourcesText)) !== null) {
    webCounter++;
    const displayLabel = `W${webCounter}`;
    const title = match[2].trim();
    const url = match[3].trim();

    elements.push(
      <a
        key={`web-${url}-${webCounter}`}
        href={url}
        target="_blank"
        rel="noreferrer"
        className="w-full text-left p-2.5 rounded-xl bg-sky-500/10 hover:bg-sky-500/20 text-sky-950 dark:text-sky-100 transition-all border border-sky-500/25 group cursor-pointer shadow-xs flex flex-col gap-1"
        title={url}
      >
        <div className="flex items-start justify-between w-full gap-2">
          <div className="flex items-start gap-1.5 min-w-0 flex-1">
            <Globe className="h-4 w-4 text-sky-600 dark:text-sky-400 shrink-0 mt-0.5" />
            <span className="font-bold text-xs text-sky-700 dark:text-sky-300 shrink-0">[{displayLabel}]</span>
            <span className="font-semibold text-xs text-foreground/90 break-words flex-1 leading-snug">{title}</span>
          </div>
          <ExternalLink className="h-4 w-4 opacity-60 group-hover:opacity-100 text-sky-600 dark:text-sky-400 shrink-0 mt-0.5" />
        </div>
        <span className="text-[11px] text-sky-600/80 dark:text-sky-400/80 break-all leading-snug">
          {url}
        </span>
      </a>
    );
  }

  if (/conversaci[oó]n/i.test(sourcesText) || elements.length === 0) {
    elements.push(
      <div
        key="current-case"
        className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-muted/60 text-muted-foreground text-[11px] border border-border/40 w-full"
      >
        <MessageCircle className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
        <span>Conversación y adjuntos del caso actual</span>
      </div>
    );
  }

  return (
    <div className="mt-3 pt-2.5 border-t border-border/50 text-xs w-full space-y-1.5">
      <div className="font-semibold text-[10px] uppercase tracking-wider text-muted-foreground flex items-center gap-1.5 mb-1">
        <BookOpen className="h-3.5 w-3.5 text-violet-500" />
        <span>Fuentes y Precedentes Consultados (clic para abrir)</span>
      </div>
      <div className="flex flex-col gap-1.5 w-full">
        {elements}
      </div>
    </div>
  );
}
