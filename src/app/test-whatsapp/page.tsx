"use client";
import * as React from "react";
import { Smartphone, Send, RotateCcw, Wifi, WifiOff } from "lucide-react";
import { toast } from "sonner";

interface Msg {
  role: string;
  content: string;
  author?: string;
  time?: string;
}

export default function TestWhatsAppPage() {
  const [name, setName] = React.useState("Cliente Prueba");
  const [phone, setPhone] = React.useState("50600000000");
  const [input, setInput] = React.useState("");
  const [messages, setMessages] = React.useState<Msg[]>([]);
  const [caseId, setCaseId] = React.useState<string | null>(null);
  const [sending, setSending] = React.useState(false);
  const [online, setOnline] = React.useState(true);
  const [lastUpdated, setLastUpdated] = React.useState<string | null>(null);
  const scrollRef = React.useRef<HTMLDivElement>(null);

  // Polling cada 3s para recibir respuestas del agente humano o IA
  React.useEffect(() => {
    if (!caseId) return;
    const timer = setInterval(async () => {
      try {
        const r = await fetch(`/api/test/whatsapp?case_id=${caseId}`);
        if (!r.ok) { setOnline(false); return; }
        setOnline(true);
        const data = await r.json();
        if (!data) return;

        // Combinar histcliente + histtecnico en orden cronológico
        const all: Msg[] = [
          ...(data.histcliente ?? []).map((m: any) => ({ ...m, role: "user" })),
          ...(data.histtecnico ?? []).map((m: any) => ({ ...m, role: "tecnico", author: m.author || "Agente" })),
        ].sort((a, b) => new Date(a.time || 0).getTime() - new Date(b.time || 0).getTime());

        setMessages(prev => {
          if (all.length !== prev.length) return all;
          const lastDiff = all.find((m, i) => m.content !== prev[i]?.content || m.time !== prev[i]?.time);
          return lastDiff ? all : prev;
        });

        setLastUpdated(data.updated_at);
      } catch { setOnline(false); }
    }, 3000);
    return () => clearInterval(timer);
  }, [caseId]);

  React.useEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
  }, [messages]);

  async function send() {
    if (!input.trim() || sending) return;
    setSending(true);
    // Optimistic
    const userMsg: Msg = { role: "user", content: input.trim(), time: new Date().toISOString() };
    setMessages(prev => [...prev, userMsg]);

    try {
      const r = await fetch("/api/test/whatsapp", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: input.trim(), case_id: caseId, client_name: name, phone }),
      });
      if (!r.ok) {
        const e = await r.json();
        toast.error(e.error || "Error enviando");
        return;
      }
      const data = await r.json();
      if (data.case_id) setCaseId(data.case_id);
      setInput("");

      // Refrescar historial inmediatamente con la respuesta de la IA
      const all: Msg[] = [
        ...(data.histcliente ?? []).map((m: any) => ({ ...m, role: "user" })),
        ...(data.histtecnico ?? []).map((m: any) => ({ ...m, role: "tecnico", author: m.author || "Agente" })),
      ].sort((a, b) => new Date(a.time || 0).getTime() - new Date(b.time || 0).getTime());
      setMessages(all);
    } catch {
      toast.error("Error de red");
    } finally {
      setSending(false);
    }
  }

  function reset() {
    setCaseId(null);
    setMessages([]);
    setInput("");
    setLastUpdated(null);
  }

  return (
    <div className="min-h-screen bg-gray-100 flex items-center justify-center p-3 sm:p-6">
      <div className="w-full max-w-md h-[90vh] bg-white rounded-2xl shadow-2xl flex flex-col overflow-hidden border border-gray-200">
        {/* Header estilo WhatsApp */}
        <div className="bg-[#128C7E] text-white px-4 py-3 flex items-center gap-3 shrink-0">
          <Smartphone className="h-5 w-5" />
          <div className="flex-1 min-w-0">
            <p className="font-semibold text-sm truncate">WhatsApp de Prueba</p>
            <p className="text-[10px] opacity-80 truncate">{name} · {phone} {caseId ? `· #${(caseId as string).slice(0, 6)}` : ""}</p>
          </div>
          <div className="flex items-center gap-2">
            {online ? (
              <Wifi className="h-3.5 w-3.5 text-green-300" />
            ) : (
              <WifiOff className="h-3.5 w-3.5 text-red-300" />
            )}
            <button onClick={reset} title="Nueva conversación" className="p-1.5 hover:bg-white/20 rounded-full transition-colors">
              <RotateCcw className="h-4 w-4" />
            </button>
          </div>
        </div>

        {/* Config rápida (solo antes de iniciar) */}
        {!caseId && (
          <div className="p-3 bg-gray-50 border-b space-y-2 shrink-0">
            <input
              value={name}
              onChange={e => setName(e.target.value)}
              placeholder="Nombre del cliente"
              className="w-full px-3 py-2 text-sm rounded-lg border border-gray-200 focus:outline-none focus:ring-2 focus:ring-[#128C7E]"
            />
            <input
              value={phone}
              onChange={e => setPhone(e.target.value)}
              placeholder="Teléfono (ej: 50688888888)"
              className="w-full px-3 py-2 text-sm rounded-lg border border-gray-200 focus:outline-none focus:ring-2 focus:ring-[#128C7E]"
            />
            <p className="text-[10px] text-gray-400">
              Este chat aparecerá en el inbox como <strong>WhatsApp de Prueba</strong>. Un agente real puede responder.
            </p>
          </div>
        )}

        {/* Mensajes */}
        <div ref={scrollRef} className="flex-1 overflow-y-auto p-3 space-y-2 bg-[#E5DDD5]">
          {messages.length === 0 && (
            <div className="text-center text-sm text-gray-500 mt-10">
              <p className="font-medium">Inicia una conversación de prueba</p>
              <p className="text-xs mt-1 opacity-70 max-w-[200px] mx-auto">
                Escribe un mensaje. Aparecerá en la bandeja del inbox como un chat de WhatsApp real.
              </p>
            </div>
          )}
          {messages.map((m, i) => {
            const isUser = m.role === "user";
            return (
              <div key={i} className={`flex ${isUser ? "justify-end" : "justify-start"}`}>
                <div className={`max-w-[85%] px-3 py-2 rounded-xl text-sm leading-relaxed ${
                  isUser
                    ? "bg-[#DCF8C6] text-gray-900 rounded-tr-none"
                    : "bg-white text-gray-900 rounded-tl-none shadow-sm"
                }`}>
                  <p>{m.content}</p>
                  {m.author && !isUser && (
                    <p className="text-[10px] text-gray-500 mt-0.5 font-medium">{m.author}</p>
                  )}
                </div>
              </div>
            );
          })}
        </div>

        {/* Input */}
        <div className="p-3 bg-white border-t border-gray-200 flex items-center gap-2 shrink-0">
          <input
            value={input}
            onChange={e => setInput(e.target.value)}
            onKeyDown={e => e.key === "Enter" && send()}
            placeholder="Escribe un mensaje..."
            className="flex-1 px-4 py-2.5 rounded-full bg-gray-100 text-sm focus:outline-none focus:ring-2 focus:ring-[#128C7E] transition-all"
          />
          <button
            onClick={send}
            disabled={sending || !input.trim()}
            className="h-10 w-10 rounded-full bg-[#128C7E] text-white grid place-items-center disabled:opacity-40 transition-opacity shrink-0"
          >
            <Send className="h-4 w-4" />
          </button>
        </div>
      </div>
    </div>
  );
}
