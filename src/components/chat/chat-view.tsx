"use client";
import * as React from "react";
import { ArrowLeft, MoreVertical, Phone, Send, Paperclip, Bot, Mail, Building2, User } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { Avatar, Badge } from "@/components/ui/avatar";
import { Textarea } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { cn, formatTime, asText, clienteInfo } from "@/lib/utils";
import { toast } from "sonner";
import type { SekCase, SekHistEntry, ChannelKind } from "@/lib/types";

type UnifiedMessage = {
  id: string;
  source: "user" | "assistant" | "tecnico";
  content: string;
  time: string;
  authorName?: string;
  status?: "pending" | "sent" | "error";
};

function unifyMessages(c: SekCase): UnifiedMessage[] {
  const out: UnifiedMessage[] = [];
  const fromCliente = Array.isArray(c.histcliente) ? c.histcliente : [];
  const fromTecnico = Array.isArray(c.histtecnico) ? c.histtecnico : [];

  fromCliente.forEach((e, i) => {
    const role = String(e.role || "user");
    out.push({
      id: `c-${i}`,
      source: role === "assistant" ? "assistant" : "user",
      content: asText(e.content),
      time: e.time || c.created_at,
      authorName: role === "assistant" ? "IA · Armando Zonas" : undefined,
      status: "sent"
    });
  });

  fromTecnico.forEach((e, i) => {
    out.push({
      id: `t-${i}`,
      source: "tecnico",
      content: asText(e.content),
      time: e.time || c.created_at,
      authorName: asText(e.author) || undefined,
      status: "sent"
    });
  });

  return out.sort((a, b) => new Date(a.time).getTime() - new Date(b.time).getTime());
}

export function ChatView({ sekCase: initialCase, onBack }: { sekCase: SekCase; onBack: () => void }) {
  const supabase = React.useMemo(() => createClient(), []);
  const [sekCase, setSekCase] = React.useState<SekCase>(initialCase);
  const [messages, setMessages] = React.useState<UnifiedMessage[]>([]);
  const [draft, setDraft] = React.useState("");
  const [sending, setSending] = React.useState(false);
  const [agentEmail, setAgentEmail] = React.useState<string | null>(null);
  const [agentName, setAgentName] = React.useState<string | null>(null);
  const scrollerRef = React.useRef<HTMLDivElement>(null);

  React.useEffect(() => { setSekCase(initialCase); }, [initialCase]);
  React.useEffect(() => { setMessages(unifyMessages(sekCase)); }, [sekCase]);

  React.useEffect(() => {
    let mounted = true;
    (async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!mounted || !user?.email) return;
      setAgentEmail(user.email);
      const { data: agent } = await supabase
        .from("sek_agent_config").select("nombre,apellido").ilike("email", user.email).maybeSingle();
      if (!mounted) return;
      const a: any = agent;
      setAgentName([a?.nombre, a?.apellido].filter(Boolean).join(" ") || user.email);
    })();

    const channel = supabase
      .channel(`case-${initialCase.id}`)
      .on("postgres_changes", {
        event: "UPDATE", schema: "public", table: "sek_cases",
        filter: `id=eq.${initialCase.id}`
      }, (payload) => {
        setSekCase(prev => ({ ...prev, ...(payload.new as any) }));
      })
      .subscribe();

    return () => { mounted = false; supabase.removeChannel(channel); };
  }, [initialCase.id, supabase]);

  React.useEffect(() => {
    const el = scrollerRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [messages.length]);

  async function send() {
    const body = draft.trim();
    if (!body || sending || !agentEmail) return;
    setSending(true);
    const entry: SekHistEntry = {
      role: "tecnico",
      time: new Date().toISOString(),
      content: body,
      author: agentName || agentEmail
    };
    const optimisticMsg: UnifiedMessage = {
      id: `temp-${Date.now()}`,
      source: "tecnico",
      content: body,
      time: entry.time,
      authorName: entry.author,
      status: "pending"
    };
    setMessages(prev => [...prev, optimisticMsg]);
    setDraft("");

    try {
      const newHist = [...(sekCase.histtecnico || []), entry];
      setSekCase(prev => ({ ...prev, histtecnico: newHist }));
      const { error } = await supabase
        .from("sek_cases")
        .update({ histtecnico: newHist })
        .eq("id", sekCase.id);
      if (error) throw error;
      setMessages(prev => prev.map(m => m.id === optimisticMsg.id ? { ...m, status: "sent" } : m));
    } catch (e: any) {
      toast.error("No se pudo enviar el mensaje", { description: e?.message });
      setMessages(prev => prev.map(m => m.id === optimisticMsg.id ? { ...m, status: "error" } : m));
    } finally { setSending(false); }
  }

  function onKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send(); }
  }

  const canalKind = (sekCase.canal as ChannelKind) || "web";
  const ci = clienteInfo(sekCase.cliente);
  const display = ci.nombre || ci.telefono || asText(sekCase.title) || "Cliente";
  const estadoLower = String(sekCase.estado || "").toLowerCase();
  const cerrado = estadoLower === "cerrado" || estadoLower === "resuelto";

  return (
    <div className="flex flex-col h-full min-h-0">
      <header className="px-4 py-3 border-b border-border bg-card">
        <div className="flex items-center gap-3">
          <button onClick={onBack} className="md:hidden p-2 -ml-2 rounded-md hover:bg-muted" aria-label="Volver">
            <ArrowLeft className="h-5 w-5" />
          </button>
          <Avatar name={display} channel={canalKind} size={44} />
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2 flex-wrap">
              <p className="font-semibold truncate">{display}</p>
              <Badge variant="muted" className="capitalize text-[10px]">{canalKind}</Badge>
              {sekCase.estado && (
                <Badge variant={cerrado ? "success" : "muted"} className="capitalize text-[10px]">{sekCase.estado}</Badge>
              )}
              {sekCase.prioridad && sekCase.prioridad !== "normal" && (
                <Badge variant={sekCase.prioridad === "urgente" ? "danger" : sekCase.prioridad === "alta" ? "warning" : "muted"} className="capitalize text-[10px]">{sekCase.prioridad}</Badge>
              )}
            </div>
            {asText(sekCase.title) && (
              <p className="text-sm text-muted-foreground truncate mt-0.5">{asText(sekCase.title)}</p>
            )}
            <div className="flex items-center gap-3 mt-1 text-xs text-muted-foreground flex-wrap">
              {ci.telefono && <span className="inline-flex items-center gap-1"><Phone className="h-3 w-3" />{ci.telefono}</span>}
              {ci.correo && <span className="inline-flex items-center gap-1"><Mail className="h-3 w-3" />{ci.correo}</span>}
              {ci.cuenta && <span className="inline-flex items-center gap-1"><Building2 className="h-3 w-3" />{ci.cuenta}</span>}
            </div>
          </div>
          <button className="p-2 rounded-md hover:bg-muted" aria-label="Más opciones"><MoreVertical className="h-4 w-4" /></button>
        </div>
      </header>

      <div ref={scrollerRef} className="flex-1 overflow-y-auto p-4 space-y-2 bg-muted/20">
        {messages.length === 0 && (
          <p className="text-center text-sm text-muted-foreground py-12">Sin mensajes en este caso.</p>
        )}
        {messages.map((m, i) => {
          const prev = messages[i - 1];
          const showDate = !prev || new Date(prev.time).toDateString() !== new Date(m.time).toDateString();
          return (
            <React.Fragment key={m.id}>
              {showDate && (
                <div className="my-4 flex items-center gap-3 text-xs text-muted-foreground">
                  <div className="flex-1 h-px bg-border" />
                  <span>{new Date(m.time).toLocaleDateString()}</span>
                  <div className="flex-1 h-px bg-border" />
                </div>
              )}
              <Bubble m={m} clienteName={ci.nombre} />
            </React.Fragment>
          );
        })}
      </div>

      <div className="p-3 border-t border-border bg-card">
        {cerrado && (
          <p className="text-xs text-center text-muted-foreground mb-2">
            Caso <strong>{sekCase.estado}</strong> · Tu mensaje quedará registrado en histtecnico.
          </p>
        )}
        <div className="flex items-end gap-2">
          <button className="h-10 w-10 grid place-items-center rounded-lg text-muted-foreground hover:bg-muted" aria-label="Adjuntar" title="Adjuntar (próximamente)">
            <Paperclip className="h-4 w-4" />
          </button>
          <Textarea
            value={draft} onChange={e => setDraft(e.target.value)} onKeyDown={onKeyDown}
            placeholder="Escribe un mensaje al cliente… (Enter envía, Shift+Enter nueva línea)"
            rows={1} aria-label="Mensaje" className="flex-1 max-h-40"
          />
          <Button onClick={send} loading={sending} disabled={!draft.trim()} aria-label="Enviar">
            <Send className="h-4 w-4" /> <span className="hidden sm:inline">Enviar</span>
          </Button>
        </div>
      </div>
    </div>
  );
}

function Bubble({ m, clienteName }: { m: UnifiedMessage; clienteName: string }) {
  const isCliente = m.source === "user";
  const isIA = m.source === "assistant";
  const isTecnico = m.source === "tecnico";

  return (
    <div className={cn("flex animate-fade-in", isCliente ? "justify-start" : "justify-end")}>
      <div className={cn(
        "max-w-[78%] rounded-2xl px-4 py-2 shadow-sm",
        isCliente && "bg-card border border-border rounded-bl-sm",
        isIA && "bg-gradient-to-br from-violet-500/95 to-violet-600/95 text-white rounded-br-sm",
        isTecnico && "bg-brand-700 text-white rounded-br-sm"
      )}>
        <div className={cn(
          "flex items-center gap-1.5 text-[10px] font-semibold mb-0.5",
          isCliente && "text-muted-foreground",
          (isIA || isTecnico) && "opacity-90"
        )}>
          {isCliente && <><User className="h-3 w-3" /> {clienteName || "Cliente"}</>}
          {isIA && <><Bot className="h-3 w-3" /> {m.authorName || "IA · Asistente"}</>}
          {isTecnico && <><User className="h-3 w-3" /> {m.authorName || "Técnico"}</>}
        </div>

        <p className="whitespace-pre-wrap break-words text-sm leading-relaxed">{m.content}</p>

        <div className={cn(
          "flex items-center gap-2 text-[10px] mt-1",
          isCliente ? "text-muted-foreground" : "text-white/75 justify-end"
        )}>
          <span>{formatTime(m.time)}</span>
          {m.status === "pending" && <span>⏳</span>}
          {m.status === "error" && <span className="text-[hsl(var(--danger))]">❌</span>}
        </div>
      </div>
    </div>
  );
}
