"use client";

import * as React from "react";
import { MessageCircle, X, Send, Loader2, Minimize2, Maximize2, GripVertical } from "lucide-react";
import { toast } from "sonner";

interface TechMessage {
  role: "user" | "assistant";
  content: string;
  time: string;
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
  const [position, setPosition] = React.useState<Position>({ x: -1, y: -1 }); // -1 = bottom-right default
  const [isDragging, setIsDragging] = React.useState(false);
  const dragStartRef = React.useRef<{ x: number; y: number; initialX: number; initialY: number } | null>(null);
  const positionRef = React.useRef(position);
  const scrollRef = React.useRef<HTMLDivElement>(null);
  const inputRef = React.useRef<HTMLTextAreaElement>(null);
  const containerRef = React.useRef<HTMLDivElement>(null);

  React.useEffect(() => { positionRef.current = position; }, [position]);

  // Restaurar posición guardada
  React.useEffect(() => {
    const saved = sessionStorage.getItem("sek_tech_assistant_pos");
    if (saved) {
      try {
        const parsed = JSON.parse(saved) as Position;
        if (typeof parsed.x === "number" && typeof parsed.y === "number") {
          setPosition(parsed);
        }
      } catch { /* ignorar */ }
    }
  }, []);

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

  // Cargar sesión previa si existe
  React.useEffect(() => {
    if (!isOpen) return;
    const saved = sessionStorage.getItem("sek_tech_assistant_session");
    if (saved) {
      try {
        const parsed = JSON.parse(saved);
        if (parsed.session_id && parsed.messages) {
          setSessionId(parsed.session_id);
          setMessages(parsed.messages);
        }
      } catch { /* ignorar */ }
    }
  }, [isOpen]);

  React.useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages, isOpen]);

  const handleSend = async () => {
    if (!input.trim() || loading) return;
    const text = input.trim();
    setInput("");
    setLoading(true);

    try {
      const res = await fetch("/api/tech-assistant/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          message: text,
          case_id: caseId,
          session_id: sessionId,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Error del asistente");

      setMessages(data.messages || []);
      if (data.session_id) {
        setSessionId(data.session_id);
        sessionStorage.setItem("sek_tech_assistant_session", JSON.stringify({
          session_id: data.session_id,
          messages: data.messages || [],
        }));
      }
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

  const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(value, max));

  const startDrag = (e: React.MouseEvent | React.TouchEvent) => {
    if (!containerRef.current) return;
    const clientX = "touches" in e ? e.touches[0].clientX : e.clientX;
    const clientY = "touches" in e ? e.touches[0].clientY : e.clientY;
    const rect = containerRef.current.getBoundingClientRect();
    dragStartRef.current = {
      x: clientX,
      y: clientY,
      initialX: rect.left,
      initialY: rect.top,
    };
    setIsDragging(true);
  };

  const onDrag = React.useCallback((e: MouseEvent | TouchEvent) => {
    if (!dragStartRef.current || !containerRef.current) return;
    const clientX = "touches" in e ? e.touches[0].clientX : e.clientX;
    const clientY = "touches" in e ? e.touches[0].clientY : e.clientY;
    const deltaX = clientX - dragStartRef.current.x;
    const deltaY = clientY - dragStartRef.current.y;
    const newX = clamp(dragStartRef.current.initialX + deltaX, 8, window.innerWidth - containerRef.current.offsetWidth - 8);
    const newY = clamp(dragStartRef.current.initialY + deltaY, 8, window.innerHeight - containerRef.current.offsetHeight - 8);
    setPosition({ x: newX, y: newY });
  }, []);

  const stopDrag = React.useCallback(() => {
    if (!dragStartRef.current) return;
    dragStartRef.current = null;
    setIsDragging(false);
    sessionStorage.setItem("sek_tech_assistant_pos", JSON.stringify(positionRef.current));
  }, []);

  React.useEffect(() => {
    if (!isDragging) return;
    window.addEventListener("mousemove", onDrag);
    window.addEventListener("mouseup", stopDrag);
    window.addEventListener("touchmove", onDrag, { passive: false });
    window.addEventListener("touchend", stopDrag);
    return () => {
      window.removeEventListener("mousemove", onDrag);
      window.removeEventListener("mouseup", stopDrag);
      window.removeEventListener("touchmove", onDrag);
      window.removeEventListener("touchend", stopDrag);
    };
  }, [isDragging, onDrag, stopDrag]);

  if (!isOpen) {
    return (
      <button
        onClick={() => setIsOpen(true)}
        className="fixed bottom-6 right-6 z-50 flex h-14 w-14 items-center justify-center rounded-full bg-violet-600 text-white shadow-lg shadow-violet-600/30 hover:bg-violet-700 transition-all hover:scale-105"
        aria-label="Asistente técnico"
      >
        <MessageCircle className="h-6 w-6" />
      </button>
    );
  }

  return (
    <div
      ref={containerRef}
      className={`fixed z-50 flex flex-col rounded-2xl border border-border bg-card shadow-2xl overflow-hidden ${isDragging ? "" : "transition-all duration-300"} ${isMinimized ? "h-14 w-72" : "h-[500px] w-80 sm:w-96"}`}
      style={position.x >= 0 && position.y >= 0 ? { left: position.x, top: position.y, right: "auto", bottom: "auto" } : { right: "1.5rem", bottom: "1.5rem" }}
    >
      {/* Header arrastrable */}
      <div
        className="flex items-center justify-between px-4 py-3 bg-gradient-to-r from-violet-600 to-indigo-600 text-white cursor-grab active:cursor-grabbing"
        onMouseDown={startDrag}
        onTouchStart={startDrag}
      >
        <div className="flex items-center gap-2">
          <GripVertical className="h-4 w-4 opacity-60" />
          <MessageCircle className="h-4 w-4" />
          <span className="text-sm font-semibold">Asistente Técnico</span>
          {caseId && <span className="ml-2 text-[10px] bg-white/20 px-1.5 py-0.5 rounded">Caso</span>}
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
            <div className="flex items-end gap-2">
              <textarea
                ref={inputRef}
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder="Escriba su consulta..."
                rows={1}
                className="flex-1 resize-none rounded-xl border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-violet-500/30 min-h-[40px] max-h-[120px]"
              />
              <button
                onClick={handleSend}
                disabled={!input.trim() || loading}
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
  );
}
