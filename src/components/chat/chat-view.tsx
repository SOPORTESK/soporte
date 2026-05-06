"use client";
import * as React from "react";
import {
  ArrowLeft, MoreVertical, Phone, Send, Paperclip, Bot,
  Mail, Building2, User, StickyNote, Zap, CheckCircle2,
  XCircle, Image as ImageIcon, FileText, Music, Video,
  Download, X, ChevronDown, History, HandMetal
} from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { Avatar, Badge } from "@/components/ui/avatar";
import { Textarea } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { cn, formatTime, asText, clienteInfo } from "@/lib/utils";
import { toast } from "sonner";
import { CaseHistoryDrawer } from "./case-history-drawer";
import type { SekCase, SekHistEntry, ChannelKind } from "@/lib/types";

type UnifiedMessage = {
  id: string;
  source: "user" | "assistant" | "tecnico" | "nota";
  content: string;
  time: string;
  authorName?: string;
  status?: "pending" | "sent" | "error";
  mediaUrl?: string;
  mediaType?: string;
  fileName?: string;
};

function unifyMessages(c: SekCase): UnifiedMessage[] {
  const out: UnifiedMessage[] = [];
  const fromCliente = Array.isArray(c.histcliente) ? c.histcliente : [];
  const fromTecnico = Array.isArray(c.histtecnico) ? c.histtecnico : [];

  fromCliente.forEach((e, i) => {
    const role = String(e.role || "user");
    const isAgente = role === "assistant" || role === "tecnico" || role === "nota";
    out.push({
      id: `c-${i}`,
      source: isAgente ? "tecnico" : "user",
      content: asText(e.content),
      time: e.time || c.created_at,
      authorName: isAgente ? (asText(e.author) || "Soporte Sekunet") : undefined,
      status: "sent",
      mediaUrl: e.mediaUrl as string | undefined,
      mediaType: e.mediaType as string | undefined,
      fileName: e.fileName as string | undefined,
    });
  });

  fromTecnico.forEach((e, i) => {
    const isNota = e.role === "nota";
    out.push({
      id: `t-${i}`,
      source: isNota ? "nota" : "tecnico",
      content: asText(e.content),
      time: e.time || c.created_at,
      authorName: asText(e.author) || undefined,
      status: "sent",
      mediaUrl: e.mediaUrl as string | undefined,
      mediaType: e.mediaType as string | undefined,
      fileName: e.fileName as string | undefined,
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
  const [mode, setMode] = React.useState<"reply" | "nota">("reply");
  const [showPlantillas, setShowPlantillas] = React.useState(false);
  const [plantillas, setPlantillas] = React.useState<any[]>([]);
  const [uploadingFile, setUploadingFile] = React.useState(false);
  const [showActions, setShowActions] = React.useState(false);
  const [showHistory, setShowHistory] = React.useState(false);
  const [clienteTyping, setClienteTyping] = React.useState(false);
  const [agentTyping, setAgentTyping] = React.useState(false);
  const fileInputRef = React.useRef<HTMLInputElement>(null);
  const scrollerRef = React.useRef<HTMLDivElement>(null);
  const typingTimerRef = React.useRef<ReturnType<typeof setTimeout> | null>(null);
  const presenceChannelRef = React.useRef<ReturnType<typeof supabase.channel> | null>(null);

  React.useEffect(() => { setSekCase(initialCase); }, [initialCase]);
  React.useEffect(() => { setMessages(unifyMessages(sekCase)); }, [sekCase]);

  /* Cargar plantillas */
  React.useEffect(() => {
    supabase.from("sek_plantillas").select("id,nombre,texto,cat").limit(30)
      .then(({ data }) => { if (data) setPlantillas(data); });
  }, [supabase]);

  const isGrouped = !!initialCase._group;
  const targetId = initialCase._group?.targetCaseId ?? initialCase.id;
  const targetHisttecnico = initialCase._group?.targetHisttecnico ?? (Array.isArray(initialCase.histtecnico) ? initialCase.histtecnico : []);
  const targetEstado = initialCase._group?.targetEstado ?? initialCase.estado;

  React.useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        const { data: { user } } = await supabase.auth.getUser();
        if (!mounted || !user?.email) return;
        setAgentEmail(user.email);
        const { data: agent } = await supabase
          .from("sek_agent_config").select("nombre,apellido").ilike("email", user.email).maybeSingle();
        if (!mounted) return;
        const a: any = agent;
        setAgentName([a?.nombre, a?.apellido].filter(Boolean).join(" ") || user.email);
      } catch { /* lock timeout en dev - ignorar */ }
    })();

    /* Si es agrupado, el padre (InboxClient) ya maneja polling/realtime de todos los casos */
    if (isGrouped) {
      /* Solo presence para typing indicator usando el targetId */
      const presenceCh = supabase.channel(`wgt-typing-${targetId}`, { config: { presence: { key: "agent" } } })
        .on("presence", { event: "sync" }, () => {
          const state = presenceCh.presenceState<{ role: string; typing: boolean }>();
          const entries = Object.values(state).flat();
          setClienteTyping(entries.some((e: any) => e.role === "cliente" && e.typing));
          setAgentTyping(entries.some((e: any) => e.role === "agente" && e.typing));
        })
        .subscribe();
      presenceChannelRef.current = presenceCh;
      return () => { mounted = false; supabase.removeChannel(presenceCh); };
    }

    const channel = supabase
      .channel(`case-${targetId}`)
      .on("postgres_changes", {
        event: "UPDATE", schema: "public", table: "sek_cases",
        filter: `id=eq.${targetId}`
      }, (payload) => {
        setSekCase(prev => ({ ...prev, ...(payload.new as any) }));
      })
      .subscribe();

    /* Presence para indicador de escritura — mismo canal que widget */
    const presenceCh = supabase.channel(`wgt-typing-${targetId}`, { config: { presence: { key: "agent" } } })
      .on("presence", { event: "sync" }, () => {
        const state = presenceCh.presenceState<{ role: string; typing: boolean }>();
        const entries = Object.values(state).flat();
        setClienteTyping(entries.some((e: any) => e.role === "cliente" && e.typing));
        setAgentTyping(entries.some((e: any) => e.role === "agente" && e.typing));
      })
      .subscribe();
    presenceChannelRef.current = presenceCh;

    /* Polling de respaldo cada 3s por si Realtime falla */
    const poll = setInterval(async () => {
      const { data } = await supabase.from("sek_cases").select("*").eq("id", targetId).maybeSingle();
      if (data && mounted) setSekCase(prev => {
        const prevLen = (prev.histcliente?.length || 0) + (prev.histtecnico?.length || 0);
        const newLen = (data.histcliente?.length || 0) + (data.histtecnico?.length || 0);
        return newLen !== prevLen ? { ...prev, ...data } : prev;
      });
    }, 3000);

    return () => { mounted = false; clearInterval(poll); supabase.removeChannel(channel); supabase.removeChannel(presenceCh); };
  }, [targetId, supabase, isGrouped]);

  React.useEffect(() => {
    const el = scrollerRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [messages.length]);

  async function send(overrideContent?: string, mediaUrl?: string, mediaType?: string, fileName?: string) {
    const body = (overrideContent ?? draft).trim();
    if ((!body && !mediaUrl) || sending || !agentEmail) return;
    setSending(true);
    const isNota = mode === "nota" && !overrideContent;
    const entry: SekHistEntry = {
      role: isNota ? "nota" : "tecnico",
      time: new Date().toISOString(),
      content: body || (fileName ?? "Archivo adjunto"),
      author: agentName || agentEmail,
      ...(mediaUrl ? { mediaUrl, mediaType, fileName } : {})
    };
    const optimisticMsg: UnifiedMessage = {
      id: `temp-${Date.now()}`,
      source: isNota ? "nota" : "tecnico",
      content: entry.content,
      time: entry.time,
      authorName: entry.author as string,
      status: "pending",
      mediaUrl, mediaType, fileName
    };
    setMessages(prev => [...prev, optimisticMsg]);
    if (!overrideContent) setDraft("");

    try {
      const baseHist = targetHisttecnico;
      const newHist = [...baseHist, entry];
      setSekCase(prev => ({ ...prev, histtecnico: newHist }));
      const updates: Record<string, unknown> = { histtecnico: newHist };
      const targetCerrado = String(targetEstado || "").toLowerCase() === "cerrado" || String(targetEstado || "").toLowerCase() === "resuelto";
      if (targetCerrado && !isNota) updates.estado = "abierto";
      const { error } = await supabase
        .from("sek_cases")
        .update(updates)
        .eq("id", targetId);
      if (error) throw error;
      setMessages(prev => prev.map(m => m.id === optimisticMsg.id ? { ...m, status: "sent" } : m));
    } catch (e: any) {
      toast.error("No se pudo enviar", { description: (e as any)?.message });
      setMessages(prev => prev.map(m => m.id === optimisticMsg.id ? { ...m, status: "error" } : m));
    } finally { setSending(false); }
  }

  async function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file || !agentEmail) return;
    setUploadingFile(true);
    try {
      const ext = file.name.split(".").pop();
      const path = `cases/${targetId}/${Date.now()}.${ext}`;
      const { error: upErr } = await supabase.storage
        .from("attachments")
        .upload(path, file, { upsert: true });
      if (upErr) throw upErr;
      const { data: urlData } = supabase.storage.from("attachments").getPublicUrl(path);
      await send("", urlData.publicUrl, file.type, file.name);
    } catch (err: any) {
      toast.error("Error al subir archivo", { description: err?.message });
    } finally {
      setUploadingFile(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  }

  async function toggleCaso() {
    const newEstado = cerrado ? "abierto" : "cerrado";
    const { error } = await supabase.from("sek_cases").update({ estado: newEstado }).eq("id", targetId);
    if (error) { toast.error("Error al cambiar estado"); return; }
    setSekCase(prev => ({ ...prev, estado: newEstado }));
    toast.success(`Caso ${newEstado}`);
    setShowActions(false);
    if (newEstado === "cerrado") {
      supabase.functions.invoke("send-transcript", { body: { case_id: targetId } }).catch(() => {});
    }
  }

  function onKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send(); }
  }

  function onTyping() {
    const ch = presenceChannelRef.current;
    if (!ch) return;
    ch.track({ role: "agente", typing: true });
    if (typingTimerRef.current) clearTimeout(typingTimerRef.current);
    typingTimerRef.current = setTimeout(() => ch.track({ role: "agente", typing: false }), 2000);
  }

  const canalKind = (sekCase.canal as ChannelKind) || "web";
  const ci = clienteInfo(sekCase.cliente);
  const display = ci.nombre || ci.telefono || asText(sekCase.title) || "Cliente";
  const estadoLower = String(sekCase.estado || "").toLowerCase();
  const cerrado = estadoLower === "cerrado" || estadoLower === "resuelto";
  const isEscalado = estadoLower === "escalado" || estadoLower === "ia_atendiendo";
  const [accepting, setAccepting] = React.useState(false);

  async function acceptCase() {
    if (accepting || !agentEmail) return;
    setAccepting(true);
    try {
      const { error } = await supabase.from("sek_cases").update({
        estado: "abierto",
        assigned_to: agentEmail,
      }).eq("id", targetId);
      if (error) throw error;
      setSekCase(prev => ({ ...prev, estado: "abierto", assigned_to: agentEmail }));
      toast.success("Caso aceptado");
    } catch (e: any) {
      toast.error("Error al aceptar", { description: e?.message });
    } finally {
      setAccepting(false);
    }
  }

  return (
    <div className="flex flex-col h-full min-h-0">
      {/* ── Header ── */}
      <header className="px-4 py-3 border-b border-border bg-card flex-shrink-0">
        <div className="flex items-center gap-3">
          <button onClick={onBack} className="md:hidden p-2 -ml-2 rounded-md hover:bg-muted" aria-label="Volver">
            <ArrowLeft className="h-5 w-5" />
          </button>
          <Avatar name={display} channel={canalKind as any} size={44} />
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
            <div className="flex items-center gap-3 mt-0.5 text-xs text-muted-foreground flex-wrap">
              {ci.telefono && <span className="inline-flex items-center gap-1"><Phone className="h-3 w-3" />{ci.telefono}</span>}
              {ci.correo && <span className="inline-flex items-center gap-1"><Mail className="h-3 w-3" />{ci.correo}</span>}
              {ci.cuenta && <span className="inline-flex items-center gap-1"><Building2 className="h-3 w-3" />{ci.cuenta}</span>}
            </div>
          </div>
          {/* Historial */}
          <button
            onClick={() => setShowHistory(true)}
            className="p-2 rounded-md hover:bg-muted"
            aria-label="Ver historial de conversaciones"
            title="Historial de conversaciones"
          >
            <History className="h-4 w-4" />
          </button>

          {/* Acciones rápidas */}
          <div className="relative">
            <button
              onClick={() => setShowActions(p => !p)}
              className="p-2 rounded-md hover:bg-muted"
              aria-label="Acciones"
            >
              <MoreVertical className="h-4 w-4" />
            </button>
            {showActions && (
              <div className="absolute right-0 top-10 z-50 w-48 rounded-xl border border-border bg-card shadow-xl py-1">
                <button
                  onClick={toggleCaso}
                  className="w-full flex items-center gap-2 px-4 py-2.5 text-sm hover:bg-muted transition-colors"
                >
                  {cerrado
                    ? <><CheckCircle2 className="h-4 w-4 text-green-500" /> Reabrir caso</>  
                    : <><XCircle className="h-4 w-4 text-red-500" /> Cerrar caso</>}
                </button>
              </div>
            )}
          </div>
        </div>
      </header>

      {/* ── Mensajes ── */}
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
        {/* Indicador cliente escribiendo */}
        {clienteTyping && (
          <div className="flex justify-start animate-fade-in">
            <div className="bg-card border border-border rounded-2xl rounded-bl-sm px-4 py-2 shadow-sm">
              <div className="flex items-center gap-1">
                <span className="w-1.5 h-1.5 rounded-full bg-muted-foreground animate-bounce" style={{animationDelay:"0ms"}} />
                <span className="w-1.5 h-1.5 rounded-full bg-muted-foreground animate-bounce" style={{animationDelay:"150ms"}} />
                <span className="w-1.5 h-1.5 rounded-full bg-muted-foreground animate-bounce" style={{animationDelay:"300ms"}} />
                <span className="text-[10px] text-muted-foreground ml-1">Cliente escribiendo…</span>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* ── Plantillas popup ── */}
      {showPlantillas && plantillas.length > 0 && (
        <div className="border-t border-border bg-card max-h-48 overflow-y-auto flex-shrink-0">
          <div className="flex items-center justify-between px-4 py-2 border-b border-border">
            <span className="text-xs font-semibold text-muted-foreground">Respuestas rápidas</span>
            <button onClick={() => setShowPlantillas(false)}><X className="h-3.5 w-3.5" /></button>
          </div>
          {plantillas.map((p: any) => (
            <button
              key={p.id}
              onClick={() => {
                const tieneCorchetes = /\[[^\]]+\]/.test(p.texto || "");
                if (tieneCorchetes) {
                  setDraft(p.texto);
                  setShowPlantillas(false);
                  setTimeout(() => {
                    const ta = document.querySelector<HTMLTextAreaElement>('textarea[aria-label="Mensaje"]');
                    if (ta) {
                      ta.focus();
                      const match = /\[[^\]]+\]/.exec(ta.value);
                      if (match) ta.setSelectionRange(match.index, match.index + match[0].length);
                    }
                  }, 0);
                } else {
                  send(p.texto);
                  setShowPlantillas(false);
                }
              }}
              className="w-full text-left px-4 py-2.5 hover:bg-muted transition-colors border-b border-border/50 last:border-0"
            >
              <p className="text-xs font-semibold">{p.nombre}</p>
              <p className="text-xs text-muted-foreground truncate mt-0.5">{p.texto}</p>
            </button>
          ))}
        </div>
      )}

      {/* ── Accept banner for escalated cases ── */}
      {isEscalado && (
        <div className="flex-shrink-0 border-t border-border bg-amber-50 dark:bg-amber-900/20 px-4 py-3">
          <div className="flex items-center gap-3">
            <div className="flex-1">
              <p className="text-sm font-semibold text-amber-800 dark:text-amber-200">
                {estadoLower === "ia_atendiendo" ? "El asistente IA esta atendiendo este caso" : "Este caso fue escalado por el asistente y espera un agente"}
              </p>
              <p className="text-xs text-amber-700 dark:text-amber-300 mt-0.5">
                {(sekCase.cliente as any)?.equipo ? `Equipo: ${(sekCase.cliente as any).equipo}` : ""}
              </p>
            </div>
            <button
              onClick={acceptCase}
              disabled={accepting}
              className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-brand-700 hover:bg-brand-800 text-white font-semibold text-sm transition-colors disabled:opacity-50 shadow-md"
            >
              <HandMetal className="h-4 w-4" />
              {accepting ? "Aceptando..." : "Aceptar conversacion"}
            </button>
          </div>
        </div>
      )}

      {/* ── Input bar ── */}
      <div className="flex-shrink-0 border-t border-border bg-card">
        {/* Modo: Responder / Nota interna */}
        <div className="flex items-center gap-1 px-3 pt-2">
          <button
            onClick={() => setMode("reply")}
            className={cn(
              "inline-flex items-center gap-1.5 px-3 py-1 rounded-md text-xs font-medium transition-colors",
              mode === "reply" ? "bg-brand-700 text-white" : "text-muted-foreground hover:bg-muted"
            )}
          >
            <Send className="h-3 w-3" /> Responder
          </button>
          <button
            onClick={() => setMode("nota")}
            className={cn(
              "inline-flex items-center gap-1.5 px-3 py-1 rounded-md text-xs font-medium transition-colors",
              mode === "nota" ? "bg-amber-500 text-white" : "text-muted-foreground hover:bg-muted"
            )}
          >
            <StickyNote className="h-3 w-3" /> Nota interna
          </button>
          <div className="flex-1" />
          <button
            onClick={() => setShowPlantillas(p => !p)}
            className="inline-flex items-center gap-1.5 px-3 py-1 rounded-md text-xs font-medium text-muted-foreground hover:bg-muted transition-colors"
            title="Respuestas rápidas"
          >
            <Zap className="h-3 w-3" /> Plantillas
          </button>
        </div>

        <div className="flex items-end gap-2 p-2">
          {/* Adjuntar archivo */}
          <input
            ref={fileInputRef}
            type="file"
            className="hidden"
            accept="image/*,video/*,audio/*,.pdf,.xml,.xlsx,.xls,.xlsm,.doc,.docx,.ppt,.pptx,.pps,.ppsx,.txt,.csv,.json,.zip,.rar,.7z,.tar,.gz"
            onChange={handleFile}
          />
          <button
            onClick={() => fileInputRef.current?.click()}
            disabled={uploadingFile}
            className="h-10 w-10 grid place-items-center rounded-lg text-muted-foreground hover:bg-muted disabled:opacity-50"
            aria-label="Adjuntar archivo"
            title="Adjuntar archivo"
          >
            {uploadingFile ? (
              <span className="h-4 w-4 border-2 border-brand-700 border-t-transparent rounded-full animate-spin" />
            ) : (
              <Paperclip className="h-4 w-4" />
            )}
          </button>

          <Textarea
            value={draft}
            onChange={e => { setDraft(e.target.value); onTyping(); }}
            onKeyDown={onKeyDown}
            placeholder={mode === "nota" ? "Escribe una nota interna (solo visible para el equipo)…" : "Escribe un mensaje al cliente… (Enter envía)"}
            rows={1}
            aria-label="Mensaje"
            className={cn(
              "flex-1 max-h-40 transition-colors",
              mode === "nota" && "border-amber-400 focus-visible:ring-amber-400/30"
            )}
          />

          <Button
            onClick={() => send()}
            loading={sending}
            disabled={!draft.trim() && !uploadingFile}
            aria-label="Enviar"
            className={cn(mode === "nota" && "bg-amber-500 hover:bg-amber-600")}
          >
            <Send className="h-4 w-4" />
            <span className="hidden sm:inline">{mode === "nota" ? "Anotar" : "Enviar"}</span>
          </Button>
        </div>
      </div>

      {/* Drawer de historial */}
      <CaseHistoryDrawer
        isOpen={showHistory}
        onClose={() => setShowHistory(false)}
        currentCase={sekCase}
      />
    </div>
  );
}

function MediaPreview({ url, type, name }: { url: string; type?: string; name?: string }) {
  if (!url) return null;
  const t = type || "";
  if (t.startsWith("image/")) {
    return (
      <a href={url} target="_blank" rel="noopener noreferrer" className="block mt-1">
        <img src={url} alt={name || "imagen"} className="max-w-[240px] max-h-48 rounded-lg object-cover border border-white/20" />
      </a>
    );
  }
  if (t.startsWith("video/")) {
    return <video src={url} controls className="max-w-[240px] rounded-lg mt-1" />;
  }
  if (t.startsWith("audio/")) {
    return <audio src={url} controls className="mt-1 w-full max-w-[240px]" />;
  }
  const ext = (name || url).split(".").pop()?.toLowerCase();
  const Icon = ext === "xml" || ext === "csv" || ext === "txt" ? FileText
    : ext === "pdf" ? FileText : Download;
  return (
    <a
      href={url} target="_blank" rel="noopener noreferrer" download={name}
      className="mt-1 inline-flex items-center gap-2 px-3 py-2 rounded-lg bg-white/15 hover:bg-white/25 transition-colors text-xs font-medium"
    >
      <Icon className="h-4 w-4 shrink-0" />
      <span className="truncate max-w-[160px]">{name || "Archivo"}</span>
      <Download className="h-3 w-3 shrink-0 opacity-70" />
    </a>
  );
}

function Bubble({ m, clienteName }: { m: UnifiedMessage; clienteName: string }) {
  const isCliente = m.source === "user";
  const isIA = m.source === "assistant";
  const isTecnico = m.source === "tecnico";
  const isNota = m.source === "nota";

  if (isNota) {
    return (
      <div className="flex justify-center animate-fade-in">
        <div className="max-w-[85%] rounded-xl px-4 py-2 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 text-amber-800 dark:text-amber-200">
          <div className="flex items-center gap-1.5 text-[10px] font-semibold mb-0.5 opacity-75">
            <StickyNote className="h-3 w-3" /> Nota interna · {m.authorName || "Agente"}
          </div>
          <p className="whitespace-pre-wrap break-words text-sm leading-relaxed">{m.content}</p>
          <p className="text-[10px] mt-1 opacity-60 text-right">{formatTime(m.time)}</p>
        </div>
      </div>
    );
  }

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

        {m.mediaUrl
          ? <MediaPreview url={m.mediaUrl} type={m.mediaType} name={m.fileName} />
          : <p className="whitespace-pre-wrap break-words text-sm leading-relaxed">{m.content}</p>
        }

        <div className={cn(
          "flex items-center gap-2 text-[10px] mt-1",
          isCliente ? "text-muted-foreground" : "text-white/75 justify-end"
        )}>
          <span>{formatTime(m.time)}</span>
          {isTecnico && m.status === "pending" && <span className="opacity-60">✓</span>}
          {isTecnico && m.status === "sent" && <span className="opacity-90">✓✓</span>}
          {m.status === "error" && <span className="text-red-400">❌</span>}
        </div>
      </div>
    </div>
  );
}
