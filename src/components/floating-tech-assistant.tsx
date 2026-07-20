"use client";

import * as React from "react";
import { MessageCircle, X, Send, Loader2, Minimize2, Maximize2, GripVertical, Paperclip, FileText, Image as ImageIcon, XCircle, RotateCcw } from "lucide-react";
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
  const [bubblePosition, setBubblePosition] = React.useState<Position>(() => {
    const bubbleSize = 56;
    const padding = 24;
    if (typeof window === "undefined") return { x: 0, y: 0 };
    return {
      x: Math.max(padding, window.innerWidth - bubbleSize - padding),
      y: Math.max(padding, window.innerHeight - bubbleSize - padding),
    };
  });
  const [panelPosition, setPanelPosition] = React.useState<Position>({ x: 0, y: 0 });
  const bubbleRef = React.useRef<HTMLButtonElement>(null);
  const scrollRef = React.useRef<HTMLDivElement>(null);
  const inputRef = React.useRef<HTMLTextAreaElement>(null);
  const fileInputRef = React.useRef<HTMLInputElement>(null);

  // Restaurar posición guardada de la burbuja
  React.useEffect(() => {
    const saved = sessionStorage.getItem("sek_tech_assistant_bubble_pos_v2");
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

  // Detectar caso actual desde la URL (?c=...)
  React.useEffect(() => {
    const readCaseId = () => {
      const params = new URLSearchParams(window.location.search);
      const c = params.get("c");
      setCaseId(c);
    };
    readCaseId();
    const onPopState = () => readCaseId();
    window.addEventListener("popstate", onPopState);
    return () => window.removeEventListener("popstate", onPopState);
  }, []);

  // Cargar sesión previa desde localStorage (máx 10 mensajes)
  React.useEffect(() => {
    if (!isOpen) return;
    const saved = localStorage.getItem("sek_tech_assistant_session");
    if (saved) {
      try {
        const parsed = JSON.parse(saved);
        if (parsed.messages) {
          setSessionId(parsed.session_id || null);
          setMessages(parsed.messages.slice(-10));
        }
      } catch { /* ignorar */ }
    }
  }, [isOpen]);

  React.useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages, isOpen]);

  const handleSend = async (text?: string, currentMessages?: TechMessage[]) => {
    const messageText = text?.trim() || input.trim();
    if ((!messageText && !pendingAttachment) || loading) return;
    if (!text) setInput("");
    setLoading(true);

    const messagesToSend = currentMessages ?? messages;

    try {
      const res = await fetch("/api/tech-assistant/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          message: messageText,
          case_id: caseId,
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
      localStorage.setItem("sek_tech_assistant_session", JSON.stringify({
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

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    e.target.value = "";
    const MAX_FILE_SIZE = 10 * 1024 * 1024;
    if (file.size > MAX_FILE_SIZE) {
      toast.error("Archivo demasiado grande", { description: "El límite es 10 MB." });
      return;
    }
    setPendingAttachment({ url: "", type: file.type, name: file.name, uploading: true });
    try {
      const supabase = (await import("@/lib/supabase/client")).createClient();
      const path = `tech-assistant/${Date.now()}_${file.name.replace(/[^a-zA-Z0-9._-]/g, "_")}`;
      const { data, error } = await supabase.storage.from("attachments").upload(path, file, { contentType: file.type });
      if (error) throw error;
      const { data: urlData } = supabase.storage.from("attachments").getPublicUrl(data.path);
      setPendingAttachment({ url: urlData.publicUrl, type: file.type, name: file.name, uploading: false });
    } catch (e: any) {
      toast.error("Error al subir archivo", { description: e?.message });
      setPendingAttachment(null);
    }
  };

  const attachmentIcon = (type: string) => {
    if (type.startsWith("image/")) return <ImageIcon className="h-4 w-4" />;
    return <FileText className="h-4 w-4" />;
  };

  const handleBubbleDrag = (_e: DraggableEvent, data: DraggableData) => {
    setBubblePosition({ x: data.x, y: data.y });
  };

  const handleBubbleDragStop = (_e: DraggableEvent, data: DraggableData) => {
    const next = clampPosition({ x: data.x, y: data.y }, 56, 8);
    setBubblePosition(next);
    sessionStorage.setItem("sek_tech_assistant_bubble_pos_v2", JSON.stringify(next));
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
    localStorage.removeItem("sek_tech_assistant_session");
    inputRef.current?.focus();
  };

  const startNewCaseChat = async () => {
    const params = new URLSearchParams(window.location.search);
    const c = params.get("c");
    setCaseId(c);
    setSessionId(null);
    setMessages([]);
    localStorage.removeItem("sek_tech_assistant_session");
    if (c) {
      await handleSend("Analiza el caso técnico actual. No describas el estado administrativo del caso. Concéntrate en: 1) posibles causas técnicas del problema, 2) pasos de diagnóstico recomendados, 3) información que ya se observa en imágenes, audios, videos o documentos adjuntos, 4) si necesita más datos, indícale al técnico qué debe verificar; nunca pidas archivos al cliente final.", []);
    }
  };

  const openFromBubble = () => {
    const rect = bubbleRef.current?.getBoundingClientRect();
    const bubbleSize = 56;
    const panelWidth = typeof window !== "undefined" && window.innerWidth >= 640 ? 384 : 320;
    const panelHeight = 500;
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
        position={bubblePosition}
        onDrag={handleBubbleDrag}
        onStop={handleBubbleDragStop}
        bounds={typeof window !== "undefined" ? { left: 8, top: 8, right: window.innerWidth - 64, bottom: window.innerHeight - 64 } : undefined}
        handle=".sek-tech-drag-handle"
      >
        <button
          ref={bubbleRef}
          onClick={openFromBubble}
          className="sek-tech-drag-handle fixed top-0 left-0 z-50 flex h-14 w-14 items-center justify-center rounded-full bg-violet-600 text-white shadow-lg shadow-violet-600/30 hover:bg-violet-700 transition-all hover:scale-105"
          aria-label="Asistente técnico"
        >
          <MessageCircle className="h-6 w-6" />
        </button>
      </Draggable>
    );
  }

  return (
    <Draggable
      position={panelPosition}
      onDrag={handlePanelDrag}
      onStop={handlePanelDragStop}
      bounds={typeof window !== "undefined" ? { left: 8, top: 8, right: window.innerWidth - 392, bottom: window.innerHeight - 508 } : undefined}
      handle=".sek-tech-drag-handle"
    >
      <div
        className={`fixed top-0 left-0 z-50 flex flex-col rounded-2xl border border-border bg-card shadow-2xl overflow-hidden ${isMinimized ? "h-14 w-72" : "h-[500px] w-80 sm:w-96"}`}
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
              className="ml-2 text-[10px] bg-white/20 hover:bg-white/30 px-1.5 py-0.5 rounded cursor-pointer"
              title="Iniciar nueva conversación con el caso abierto"
            >
              Caso
            </button>
          )}
          {messages.length > 0 && (
            <button
              type="button"
              onClick={startNewChat}
              onMouseDown={(e) => e.stopPropagation()}
              onTouchStart={(e) => e.stopPropagation()}
              className="ml-1 p-1 rounded hover:bg-white/20 cursor-pointer"
              title="Borrar conversación y empezar de cero"
            >
              <RotateCcw className="h-3.5 w-3.5" />
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
                  <p className="whitespace-pre-wrap">{m.content}</p>
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
              <textarea
                ref={inputRef}
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder={pendingAttachment ? "Escriba una pregunta sobre el archivo..." : "Escriba su consulta..."}
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
  );
}
