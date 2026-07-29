"use client";

import { useState, useRef, useEffect } from "react";
import { MessageSquare, Send, RotateCcw, Play, Image, Mic, FileText, X, Zap, Star } from "lucide-react";

interface HistMsg {
  role: string;
  author: string;
  time: string;
  content: string;
  mediaType?: string;
  mediaUrl?: string;
}

interface TestBotChatProps {
  onClose: () => void;
}

const STEP_OPTIONS = [
  { id: "", label: "Flujo completo (desde el inicio)" },
  { id: "pedir_nombre", label: "Pedir nombre" },
  { id: "pedir_correo", label: "Pedir correo" },
  { id: "pedir_cuenta", label: "Pedir cuenta/empresa" },
  { id: "menu_temas", label: "Menú de temas" },
  { id: "t1_marca", label: "1. Configuraciones — pedir marca" },
  { id: "t1_modelo", label: "1. Configuraciones — pedir modelo" },
  { id: "t1_desc", label: "1. Configuraciones — pedir descripción" },
  { id: "t2_reset", label: "2. Reset — pedir marca" },
  { id: "t3_desvinc", label: "3. Desvinculación — pedir marca" },
  { id: "t4_firmware", label: "4. Firmware — pedir marca" },
  { id: "t5_software", label: "5. Software — pedir marca" },
  { id: "t6_licencias", label: "6. Licencias — pedir marca" },
  { id: "t7_otro", label: "7. Otro — pedir descripción" },
];

export function TestBotChat({ onClose }: TestBotChatProps) {
  const [caseId, setCaseId] = useState<string | null>(null);
  const [messages, setMessages] = useState<HistMsg[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [estado, setEstado] = useState("ia_atendiendo");
  const [cliente, setCliente] = useState<any>({});
  const [mediaType, setMediaType] = useState<string | null>(null);
  const [startFrom, setStartFrom] = useState("");
  const [ratingMode, setRatingMode] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    scrollRef.current?.scrollTo(0, scrollRef.current.scrollHeight);
  }, [messages]);

  async function startTest() {
    setLoading(true);
    try {
      const res = await fetch("/api/admin/test-bot", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "start", start_from: startFrom || undefined }),
      });
      const data = await res.json();
      if (data.error) throw new Error(data.error);

      setCaseId(data.case_id);
      setEstado(data.estado || "ia_atendiendo");
      setCliente(data.cliente || {});

      const allMsgs = combineMessages(data.histcliente, data.histtecnico);
      setMessages(allMsgs);
    } catch (e: any) {
      alert("Error: " + e.message);
    } finally {
      setLoading(false);
    }
  }

  async function sendMessage() {
    if (!caseId || (!input.trim() && !mediaType) || loading) return;
    setLoading(true);

    const msgContent = input.trim() || `[Archivo ${mediaType}]`;
    const now = new Date().toISOString();

    const userMsg: HistMsg = {
      role: "user",
      author: "Cliente",
      time: now,
      content: msgContent,
      mediaType: mediaType || undefined,
    };
    setMessages((prev) => [...prev, userMsg]);
    setInput("");
    const sentMediaType = mediaType;
    setMediaType(null);

    try {
      const res = await fetch("/api/admin/test-bot", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "send",
          case_id: caseId,
          message: msgContent,
          mediaType: sentMediaType || "text",
        }),
      });
      const data = await res.json();
      if (data.error) throw new Error(data.error);

      setEstado(data.estado || estado);
      setCliente(data.cliente || cliente);
      if (data.rating_mode !== undefined) setRatingMode(data.rating_mode);

      const allMsgs = combineMessages(data.histcliente, data.histtecnico);
      setMessages(allMsgs);
    } catch (e: any) {
      alert("Error: " + e.message);
    } finally {
      setLoading(false);
    }
  }

  async function closeAndRate() {
    if (!caseId || loading) return;
    setLoading(true);

    // Agregar mensaje del técnico cerrando
    const closeMsg: HistMsg = {
      role: "tecnico",
      author: "Técnico",
      time: new Date().toISOString(),
      content: "[Técnico cerró el caso]",
    };
    setMessages((prev) => [...prev, closeMsg]);

    try {
      const res = await fetch("/api/admin/test-bot", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "close_and_rate", case_id: caseId }),
      });
      const data = await res.json();
      if (data.error) throw new Error(data.error);

      setRatingMode(true);
      setEstado("calificacion_pendiente");

      // Agregar mensaje de encuesta
      if (data.reply) {
        const rateMsg: HistMsg = {
          role: "ia",
          author: "Asistente Sekunet",
          time: new Date().toISOString(),
          content: data.reply,
        };
        setMessages((prev) => [...prev, rateMsg]);
      }
    } catch (e: any) {
      alert("Error: " + e.message);
    } finally {
      setLoading(false);
    }
  }

  async function resetTest() {
    if (caseId) {
      await fetch("/api/admin/test-bot", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "reset", case_id: caseId }),
      });
    }
    setCaseId(null);
    setMessages([]);
    setEstado("ia_atendiendo");
    setCliente({});
    setInput("");
    setMediaType(null);
    setRatingMode(false);
  }

  function combineMessages(histcliente: HistMsg[], histtecnico: HistMsg[]): HistMsg[] {
    const all = [...(histcliente || []), ...(histtecnico || [])];
    return all.sort((a, b) => new Date(a.time || 0).getTime() - new Date(b.time || 0).getTime());
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  }

  return (
    <div className="fixed right-0 top-0 h-full w-96 bg-white shadow-2xl border-l border-gray-200 z-50 flex flex-col">
      {/* Header */}
      <div className="bg-indigo-600 text-white px-4 py-3 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <MessageSquare size={20} />
          <span className="font-semibold text-sm">Chat de Pruebas — Bot</span>
        </div>
        <button onClick={onClose} className="hover:bg-indigo-700 rounded p-1">
          <X size={18} />
        </button>
      </div>

      {/* Selector de paso */}
      {!caseId && (
        <div className="bg-gray-50 border-b px-4 py-3">
          <label className="text-xs font-medium text-gray-500 block mb-1">Probar desde:</label>
          <select
            value={startFrom}
            onChange={(e) => setStartFrom(e.target.value)}
            className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
          >
            {STEP_OPTIONS.map((opt) => (
              <option key={opt.id} value={opt.id}>{opt.label}</option>
            ))}
          </select>
        </div>
      )}

      {/* Estado del caso */}
      {caseId && (
        <div className="bg-gray-50 border-b px-4 py-2 text-xs space-y-1">
          <div className="flex justify-between">
            <span className="text-gray-500">Estado:</span>
            <span className="font-medium">{estado}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-gray-500">Cliente:</span>
            <span className="font-medium">{cliente?.nombre || "Sin nombre"} | {cliente?.correo || "Sin correo"} | {cliente?.cuenta || "Sin cuenta"}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-gray-500">Caso ID:</span>
            <span className="font-mono text-[10px]">{caseId.slice(0, 8)}...</span>
          </div>
          {ratingMode && (
            <div className="flex justify-between">
              <span className="text-amber-600 font-medium">Modo encuesta activo</span>
              <span className="text-amber-600 font-medium">responda 1-5</span>
            </div>
          )}
        </div>
      )}

      {/* Mensajes */}
      <div ref={scrollRef} className="flex-1 overflow-y-auto px-4 py-3 space-y-2 bg-gray-100">
        {messages.length === 0 && !caseId && (
          <div className="flex flex-col items-center justify-center h-full text-gray-400 gap-3">
            <Zap size={48} />
            <p className="text-sm text-center">
              Seleccione un paso o <strong>Iniciar</strong> para comenzar desde el inicio.
            </p>
          </div>
        )}
        {messages.map((msg, i) => {
          const isBot = msg.role === "ia" || msg.role === "assistant" || msg.role === "tecnico";
          return (
            <div
              key={i}
              className={`flex ${isBot ? "justify-start" : "justify-end"}`}
            >
              <div
                className={`max-w-[80%] rounded-lg px-3 py-2 text-sm ${
                  isBot
                    ? "bg-white border border-gray-200 text-gray-800"
                    : "bg-green-500 text-white"
                }`}
              >
                {msg.mediaType && msg.mediaType !== "text" && (
                  <div className="flex items-center gap-1 mb-1 text-xs opacity-75">
                    {msg.mediaType === "image" && <Image size={12} />}
                    {msg.mediaType === "audio" && <Mic size={12} />}
                    {msg.mediaType === "document" && <FileText size={12} />}
                    <span>{msg.mediaType}</span>
                  </div>
                )}
                <p className="whitespace-pre-wrap break-words">{msg.content}</p>
                <span className="text-[10px] opacity-50 block mt-1">
                  {new Date(msg.time).toLocaleTimeString("es-CR", { hour: "2-digit", minute: "2-digit" })}
                </span>
              </div>
            </div>
          );
        })}
        {loading && (
          <div className="flex justify-start">
            <div className="bg-white border border-gray-200 rounded-lg px-3 py-2 text-sm text-gray-400">
              <span className="animate-pulse">Escribiendo...</span>
            </div>
          </div>
        )}
      </div>

      {/* Selector de media */}
      {mediaType && (
        <div className="px-4 py-1 bg-amber-50 border-t flex items-center gap-2 text-xs">
          <span className="text-amber-700">Simulando envío de: <strong>{mediaType}</strong></span>
          <button onClick={() => setMediaType(null)} className="text-amber-700 hover:underline">
            cancelar
          </button>
        </div>
      )}

      {/* Input */}
      <div className="border-t px-3 py-2 flex items-center gap-2">
        {!caseId ? (
          <button
            onClick={startTest}
            disabled={loading}
            className="flex-1 bg-indigo-600 text-white rounded-lg px-4 py-2 text-sm font-medium hover:bg-indigo-700 disabled:opacity-50 flex items-center justify-center gap-2"
          >
            <Play size={16} />
            {startFrom ? `Iniciar desde: ${STEP_OPTIONS.find(o => o.id === startFrom)?.label}` : "Iniciar prueba completa"}
          </button>
        ) : (
          <>
            <div className="flex gap-1">
              <button
                onClick={() => setMediaType(mediaType === "image" ? null : "image")}
                className={`p-2 rounded-lg ${mediaType === "image" ? "bg-amber-100 text-amber-700" : "bg-gray-100 text-gray-500 hover:bg-gray-200"}`}
                title="Simular imagen"
              >
                <Image size={16} />
              </button>
              <button
                onClick={() => setMediaType(mediaType === "audio" ? null : "audio")}
                className={`p-2 rounded-lg ${mediaType === "audio" ? "bg-amber-100 text-amber-700" : "bg-gray-100 text-gray-500 hover:bg-gray-200"}`}
                title="Simular audio"
              >
                <Mic size={16} />
              </button>
              <button
                onClick={() => setMediaType(mediaType === "document" ? null : "document")}
                className={`p-2 rounded-lg ${mediaType === "document" ? "bg-amber-100 text-amber-700" : "bg-gray-100 text-gray-500 hover:bg-gray-200"}`}
                title="Simular documento"
              >
                <FileText size={16} />
              </button>
            </div>
            <input
              type="text"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder={mediaType ? "Texto del archivo..." : "Escriba un mensaje..."}
              disabled={loading}
              className="flex-1 border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
            />
            <button
              onClick={sendMessage}
              disabled={loading || (!input.trim() && !mediaType)}
              className="bg-green-500 text-white rounded-lg p-2 hover:bg-green-600 disabled:opacity-50"
            >
              <Send size={16} />
            </button>
            {!ratingMode && estado !== "cerrado" && (
              <button
                onClick={closeAndRate}
                disabled={loading}
                className="bg-amber-500 text-white rounded-lg p-2 hover:bg-amber-600"
                title="Simular cierre por técnico + encuesta"
              >
                <Star size={16} />
              </button>
            )}
            <button
              onClick={resetTest}
              disabled={loading}
              className="bg-gray-100 text-gray-500 rounded-lg p-2 hover:bg-gray-200"
              title="Reiniciar"
            >
              <RotateCcw size={16} />
            </button>
          </>
        )}
      </div>
    </div>
  );
}
