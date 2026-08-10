"use client";

import * as React from "react";
import { MessageCircle, X, Send, Loader2, Minimize2, Maximize2, GripVertical, Paperclip, FileText, Image as ImageIcon, XCircle, RotateCcw, Reply } from "lucide-react";
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

  // Detectar caso actual desde la URL (?c=...) — polling + eventos de navegación
  React.useEffect(() => {
    const readCaseId = () => {
      const params = new URLSearchParams(window.location.search);
      const c = params.get("c");
      setCaseId(prev => prev !== c ? c : prev);
    };
    readCaseId();

    // popstate: back/forward
    window.addEventListener("popstate", readCaseId);

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

    // Polling cada 800ms como respaldo para detectar cambios de URL
    const pollInterval = setInterval(readCaseId, 800);

    return () => {
      window.removeEventListener("popstate", readCaseId);
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
      localStorage.removeItem("sek_tech_assistant_session");
    }
    prevCaseRef.current = caseId;
  }, [caseId]);

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
    localStorage.removeItem("sek_tech_assistant_session");
    inputRef.current?.focus();
  };

  const insertReplyToClient = async () => {
    const instructionText = `Instrucciones de atención al cliente

Responda siempre como un agente humano, profesional y experto en servicio al cliente.

Estilo de comunicación

Utilice un lenguaje sencillo, claro, natural y fácil de entender.
Sea puntual, directo y conciso. Evite explicaciones innecesarias o respuestas excesivamente extensas.
Mantenga un tono cordial, profesional, cercano y orientado a resolver la necesidad del cliente.
Adapte la respuesta al contexto y al nivel técnico del cliente.
Evite emojis, asteriscos, adornos, signos de puntuación exagerados y expresiones que hagan que la respuesta parezca generada por un sistema automatizado.
No utilice lenguaje excesivamente técnico cuando no sea necesario.
No repita información que el cliente ya haya proporcionado.

Contexto y comportamiento

Consulte siempre sek_cases para comprender el contexto de la conversación, el historial del caso y la forma en que se atienden situaciones similares.
Utilice sek_cases como referencia para mantener coherencia con el tono, los criterios de atención y la dinámica habitual de servicio al cliente.
No copie literalmente respuestas anteriores. Utilice la información disponible para construir una respuesta natural y adecuada al caso actual.

Búsqueda y validación de información

Antes de realizar búsquedas en Internet, consulte siempre los RAG locales disponibles.
Priorice la información encontrada en los RAG locales cuando sea suficiente, pertinente y verificable.
Si la información disponible no es suficiente, actualizada o concluyente, realice una búsqueda en fuentes externas confiables.
Para consultas técnicas, priorice documentación oficial del fabricante, manuales, fichas técnicas, bases de conocimiento y sitios oficiales.
Cuando sea necesario complementar la información, consulte fuentes secundarias confiables, incluyendo foros técnicos, comunidades especializadas y redes sociales oficiales.
Las búsquedas en Internet deben ser exhaustivas cuando la complejidad o importancia de la consulta lo requiera.
No considere una fuente confiable únicamente por aparecer en los resultados de búsqueda. Evalúe su autoridad, actualidad, consistencia y relación con la consulta.

Exactitud y confiabilidad

No invente información, especificaciones, procedimientos, características, compatibilidades ni respuestas técnicas.
No presente suposiciones, inferencias o información no confirmada como hechos.
Toda información técnica proporcionada al cliente debe ser verificable y sustentable en una fuente confiable.
Cuando existan diferencias entre fuentes, priorice la documentación oficial y más reciente del fabricante.
Si después de consultar las fuentes disponibles no es posible confirmar una respuesta técnica de forma fiable, no improvise. Determine si el caso debe ser remitido a soporte avanzado.

Objetivo
La prioridad es proporcionar respuestas correctas, útiles y fáciles de comprender, manteniendo una experiencia de servicio profesional, humana y eficiente.

Redacte la respuesta para el cliente basándose en el contexto del caso y la última pregunta del cliente. Responda SOLO con el texto de la respuesta, sin explicaciones adicionales ni comentarios.`;
    setLoading(true);
    try {
      const res = await fetch("/api/tech-assistant/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          message: instructionText,
          case_id: caseId,
          messages: messages.slice(-9),
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Error del asistente");
      const aiResponse = data.messages?.[data.messages.length - 1]?.content || "";
      if (aiResponse) {
        const finalMessages = (data.messages || []).slice(-10);
        setMessages(finalMessages);
        localStorage.setItem("sek_tech_assistant_session", JSON.stringify({
          session_id: sessionId || null,
          messages: finalMessages,
        }));
        window.dispatchEvent(new CustomEvent("sek-insert-draft", { detail: { text: aiResponse } }));
        toast.success("Respuesta insertada en el chat del cliente");
      } else {
        toast.error("El asistente no generó una respuesta");
      }
    } catch (e: any) {
      toast.error(e?.message || "Error al generar respuesta");
    } finally {
      setLoading(false);
      inputRef.current?.focus();
    }
  };

  const startNewCaseChat = async () => {
    const params = new URLSearchParams(window.location.search);
    const c = params.get("c");
    setCaseId(c);
    setSessionId(null);
    setMessages([]);
    localStorage.removeItem("sek_tech_assistant_session");
    if (c) {
      await handleSend("Lea la última pregunta del cliente en el historial y respóndala directamente. Si es una consulta informativa simple (ej: qué batería usa, qué voltaje soporta), responda solo con esa información. NO haga diagnóstico ni análisis de problemas si el cliente no reportó ninguno. Use los adjuntos solo si son relevantes a la pregunta.", []);
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
    <Draggable
      nodeRef={panelRef as any}
      position={panelPosition}
      onDrag={handlePanelDrag}
      onStop={handlePanelDragStop}
      bounds={typeof window !== "undefined" ? { left: 8, top: 8, right: window.innerWidth - 392, bottom: window.innerHeight - 508 } : undefined}
      handle=".sek-tech-drag-handle"
    >
      <div
        ref={panelRef}
        suppressHydrationWarning
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
  );
}
