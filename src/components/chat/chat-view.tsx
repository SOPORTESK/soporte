"use client";
import * as React from "react";
import {
  ArrowLeft, MoreVertical, Phone, Send, Paperclip, Bot,
  Mail, Building2, User, StickyNote, Zap, CheckCircle2,
  XCircle, Image as ImageIcon, FileText, Music, Video,
  Download, X, ChevronDown, History, HandMetal, Star, Tag, AlertTriangle
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
  const [showRatingModal, setShowRatingModal] = React.useState(false);
  const [clientRating, setClientRating] = React.useState(5);
  const [clientComment, setClientComment] = React.useState("");
  const [submittingRating, setSubmittingRating] = React.useState(false);
  const [accepting, setAccepting] = React.useState(false);
  const [showClassify, setShowClassify] = React.useState(false);

  const CATEGORIAS = [
    { value: "sin_imagen", label: "Sin imagen" },
    { value: "sin_grabacion", label: "Sin grabación" },
    { value: "sin_acceso_remoto", label: "Sin acceso remoto" },
    { value: "sin_energia", label: "Sin energía" },
    { value: "error_configuracion", label: "Error de configuración" },
    { value: "conectividad_red", label: "Conectividad / Red" },
    { value: "reset_contrasena", label: "Reset contraseña" },
    { value: "desvinculacion_cuenta", label: "Desvinculación cuenta" },
    { value: "dano_fisico", label: "Daño físico" },
    { value: "actualizacion_firmware", label: "Actualización firmware" },
    { value: "instalacion_nueva", label: "Instalación nueva" },
    { value: "deteccion_incendio", label: "Detección incendio" },
    { value: "control_acceso", label: "Control de acceso" },
    { value: "intrusion_alarma", label: "Intrusión / Alarma" },
    { value: "otro", label: "Otro" },
  ];

  const PRIORIDADES = [
    { value: "baja", label: "Baja", color: "text-emerald-500" },
    { value: "media", label: "Media", color: "text-amber-500" },
    { value: "alta", label: "Alta", color: "text-orange-500" },
    { value: "urgente", label: "Urgente", color: "text-red-500" },
  ];

  async function updateClassification(field: "prioridad" | "cat", value: string) {
    const { error } = await supabase.from("sek_cases").update({ [field]: value }).eq("id", targetId);
    if (error) { toast.error("Error al actualizar"); return; }
    setSekCase(prev => ({ ...prev, [field]: value }));
    toast.success("Actualizado");
  }

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

  /* Detectar cierre externo (auto-close) → mostrar modal de calificación */
  const prevEstadoRef = React.useRef<string>("");
  const modalShownRef = React.useRef(false);
  React.useEffect(() => {
    const curr = (sekCase.estado || "").toLowerCase();
    const prev = prevEstadoRef.current.toLowerCase();
    const isFinal = (s: string) => s === "cerrado" || s === "resuelto";

    // prev === "" → carga inicial, no disparar
    // Solo disparar si cambió de un estado no-final a final durante esta sesión
    if (prev !== "" && !isFinal(prev) && isFinal(curr) && !modalShownRef.current) {
      modalShownRef.current = true;
      const prevRating = (sekCase.cliente as any)?.calificacion_agente;
      if (prevRating) setClientRating(Number(prevRating) || 5);
      setShowRatingModal(true);
    }
    // Si el caso se reabrió, resetear para que pueda volver a dispararse
    if (!isFinal(curr)) modalShownRef.current = false;
    prevEstadoRef.current = curr;
  }, [sekCase.estado]);

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
    
    // Siempre mostrar modal de calificación al cerrar
    // Si ya tiene calificación previa, pre-rellenar
    if (newEstado === "cerrado") {
      const prevRating = (sekCase.cliente as any)?.calificacion_agente;
      if (prevRating) setClientRating(Number(prevRating) || 5);
      setShowRatingModal(true);
      setShowActions(false);
      return;
    }

    const { error } = await supabase.from("sek_cases").update({ estado: newEstado }).eq("id", targetId);
    if (error) { toast.error("Error al cambiar estado"); return; }
    setSekCase(prev => ({ ...prev, estado: newEstado }));
    toast.success(`Caso ${newEstado}`);
    setShowActions(false);
  }

  async function confirmCloseWithRating() {
    if (submittingRating) return;
    setSubmittingRating(true);
    try {
      const currentCliente = typeof sekCase.cliente === "object" ? sekCase.cliente : {};
      const updatedCliente = {
        ...currentCliente,
        calificacion_agente: clientRating,
        calificacion_agente_comentario: clientComment,
        calificado_por: agentEmail,
        fecha_calificacion: new Date().toISOString()
      };

      const { error } = await supabase
        .from("sek_cases")
        .update({ 
          estado: "cerrado",
          cliente: updatedCliente
        })
        .eq("id", targetId);

      if (error) throw error;

      setSekCase(prev => ({ ...prev, estado: "cerrado", cliente: updatedCliente }));
      toast.success("Caso cerrado y cliente calificado");
      setShowRatingModal(false);
      fetch("/api/profile/status", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ status: "online" }) });

      // Bloqueo progresivo: calificación < 2 → incrementar contador, bloquear al 5to
      if (clientRating < 2) {
        const cedula = (sekCase.cliente as any)?.cedula;
        if (cedula) {
          fetch("/api/widget/bloqueo-check", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ cedula, incrementar: true }),
          }).catch(() => {});
        }
      }

      // Enviar transcripción si aplica
      supabase.functions.invoke("send-transcript", { body: { case_id: targetId } }).catch(() => {});

      // REGLA INMUTABLE #2 — aprendizaje obligatorio al cerrar el caso
      supabase.functions.invoke("learn-case", { body: { case_id: targetId } }).catch(() => {});
    } catch (e: any) {
      toast.error("Error al cerrar caso", { description: e.message });
    } finally {
      setSubmittingRating(false);
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
      fetch("/api/profile/status", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ status: "busy" }) });
    } catch (e: any) {
      toast.error("Error al aceptar", { description: e?.message });
    } finally {
      setAccepting(false);
    }
  }

  // Render main view
  return (
    <div className="flex flex-col h-full min-h-0">
      {/* ── Header ── */}
      <header className="px-3 sm:px-4 py-2.5 sm:py-3 pt-safe border-b border-border bg-card flex-shrink-0 px-safe">
        <div className="flex items-center gap-2 sm:gap-3">
          <button onClick={onBack} className="md:hidden p-2 -ml-1 rounded-xl hover:bg-muted active:bg-muted/80 touch-target" aria-label="Volver">
            <ArrowLeft className="h-5 w-5" />
          </button>
          <Avatar name={display} channel={canalKind as any} size={40} />
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2 flex-wrap">
              <p className="font-semibold truncate">{display}</p>
              {sekCase._group?.avgRating && (
                <div className="flex items-center gap-1 text-amber-500 font-bold text-xs bg-amber-500/10 px-2 py-0.5 rounded-full">
                  <Star className="h-3 w-3 fill-amber-500" />
                  {sekCase._group.avgRating.toFixed(1)}
                </div>
              )}
              <Badge variant="muted" className="capitalize text-[10px]">{canalKind}</Badge>
              {sekCase.estado && (
                <Badge variant={cerrado ? "success" : "muted"} className="capitalize text-[10px]">{sekCase.estado}</Badge>
              )}
              {sekCase.prioridad && sekCase.prioridad !== "normal" && (
                <Badge variant={sekCase.prioridad === "urgente" ? "danger" : sekCase.prioridad === "alta" ? "warning" : "muted"} className="capitalize text-[10px]">{sekCase.prioridad}</Badge>
              )}
            </div>
            <div className="flex items-center gap-2 sm:gap-3 mt-0.5 text-xs text-muted-foreground flex-wrap">
              {ci.telefono && <span className="inline-flex items-center gap-1"><Phone className="h-3 w-3" />{ci.telefono}</span>}
              {ci.correo && <span className="hidden sm:inline-flex items-center gap-1"><Mail className="h-3 w-3" />{ci.correo}</span>}
              {ci.cuenta && <span className="inline-flex items-center gap-1"><Building2 className="h-3 w-3" />{ci.cuenta}</span>}
            </div>
          </div>
          {/* Historial */}
          <button
            onClick={() => setShowHistory(true)}
            className="p-2 rounded-xl hover:bg-muted active:bg-muted/80 touch-target"
            aria-label="Ver historial de conversaciones"
            title="Historial de conversaciones"
          >
            <History className="h-4 w-4" />
          </button>

          {/* Acciones rápidas */}
          <div className="relative">
            <button
              onClick={() => setShowActions(p => !p)}
              className="p-2 rounded-xl hover:bg-muted active:bg-muted/80 touch-target"
              aria-label="Acciones"
            >
              <MoreVertical className="h-4 w-4" />
            </button>
            {showActions && (
              <div className="absolute right-0 top-10 z-50 w-56 rounded-xl border border-border bg-card shadow-xl py-1">
                <button
                  onClick={toggleCaso}
                  className="w-full flex items-center gap-2 px-4 py-2.5 text-sm hover:bg-muted transition-colors"
                >
                  {cerrado
                    ? <><CheckCircle2 className="h-4 w-4 text-green-500" /> Reabrir caso</>  
                    : <><XCircle className="h-4 w-4 text-red-500" /> Cerrar caso</>}
                </button>
                <div className="border-t border-border/50 my-1" />
                <button
                  onClick={() => { setShowClassify(true); setShowActions(false); }}
                  className="w-full flex items-center gap-2 px-4 py-2.5 text-sm hover:bg-muted transition-colors"
                >
                  <Tag className="h-4 w-4 text-violet-500" /> Clasificar caso
                </button>
              </div>
            )}

            {/* Panel de clasificación manual */}
            {showClassify && (
              <div className="fixed inset-0 z-[100] flex items-end sm:items-center justify-center p-0 sm:p-4 bg-black/60 backdrop-blur-sm">
                <div className="bg-card border border-border rounded-t-3xl sm:rounded-3xl w-full max-w-sm shadow-2xl overflow-hidden pb-safe">
                  <div className="flex items-center justify-between p-5 border-b border-border">
                    <div className="flex items-center gap-2">
                      <Tag className="h-4 w-4 text-violet-500" />
                      <p className="font-bold text-sm">Clasificar caso manualmente</p>
                    </div>
                    <button onClick={() => setShowClassify(false)} className="p-1.5 rounded-lg hover:bg-muted">
                      <X className="h-4 w-4" />
                    </button>
                  </div>
                  <div className="p-5 space-y-5">
                    {/* Prioridad */}
                    <div>
                      <p className="text-[11px] font-black uppercase tracking-wider text-muted-foreground mb-2">Prioridad</p>
                      <div className="grid grid-cols-2 gap-2">
                        {PRIORIDADES.map(p => (
                          <button
                            key={p.value}
                            onClick={() => updateClassification("prioridad", p.value)}
                            className={`flex items-center gap-2 px-3 py-2 rounded-xl border text-sm font-semibold transition-all ${
                              sekCase.prioridad === p.value
                                ? "border-violet-500 bg-violet-500/10 text-violet-500"
                                : "border-border hover:bg-muted"
                            }`}
                          >
                            <AlertTriangle className={`h-3.5 w-3.5 ${p.color}`} />
                            {p.label}
                          </button>
                        ))}
                      </div>
                    </div>
                    {/* Categoría */}
                    <div>
                      <p className="text-[11px] font-black uppercase tracking-wider text-muted-foreground mb-2">Categoría del problema</p>
                      <div className="grid grid-cols-1 gap-1 max-h-48 overflow-y-auto">
                        {CATEGORIAS.map(c => (
                          <button
                            key={c.value}
                            onClick={() => updateClassification("cat", c.value)}
                            className={`flex items-center gap-2 px-3 py-2 rounded-xl border text-sm text-left transition-all ${
                              sekCase.cat === c.value
                                ? "border-violet-500 bg-violet-500/10 text-violet-500 font-semibold"
                                : "border-transparent hover:bg-muted"
                            }`}
                          >
                            {sekCase.cat === c.value && <CheckCircle2 className="h-3.5 w-3.5 shrink-0" />}
                            {c.label}
                          </button>
                        ))}
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      </header>

      {/* ── Mensajes ── */}
      <div ref={scrollerRef} className="flex-1 overflow-y-auto p-3 sm:p-4 space-y-2 bg-muted/20 px-safe scrollbar-none">
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
        <div className="border-t border-border bg-card max-h-48 overflow-y-auto flex-shrink-0 px-safe">
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
        <div className="flex-shrink-0 border-t border-border bg-amber-50 dark:bg-amber-900/20 px-3 sm:px-4 py-3 px-safe">
          <div className="flex items-center gap-2 sm:gap-3">
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
      <div className="flex-shrink-0 border-t border-border bg-card px-safe pb-safe">
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

      {/* ── Modal de Calificación al Cliente ── */}
      {showRatingModal && (
        <div className="fixed inset-0 z-[100] flex items-end sm:items-center justify-center p-0 sm:p-4 bg-black/60 backdrop-blur-sm animate-fade-in">
          <div className="bg-card border border-border rounded-t-3xl sm:rounded-3xl w-full max-w-md shadow-2xl overflow-hidden animate-in zoom-in-95 duration-200 pb-safe">
            <div className="p-6 text-center border-b border-border bg-muted/20">
              <div className="w-16 h-16 bg-brand-500/10 rounded-2xl flex items-center justify-center mx-auto mb-4">
                <Star className="h-8 w-8 text-brand-500 fill-brand-500" />
              </div>
              <h3 className="text-xl font-bold">Calificar al Cliente</h3>
              <p className="text-sm text-muted-foreground mt-1">Antes de cerrar, evalúa el comportamiento del cliente.</p>
            </div>
            
            <div className="p-6 space-y-6">
              <div className="flex justify-center gap-3">
                {[1, 2, 3, 4, 5].map((star) => (
                  <button
                    key={star}
                    onClick={() => setClientRating(star)}
                    className={cn(
                      "p-2 rounded-xl transition-all hover:scale-110",
                      clientRating >= star ? "text-amber-500" : "text-muted opacity-30 hover:opacity-50"
                    )}
                  >
                    <Star className={cn("h-8 w-8", clientRating >= star && "fill-amber-500")} />
                  </button>
                ))}
              </div>

              <div className="space-y-2">
                <label className="text-xs font-bold uppercase tracking-wider text-muted-foreground ml-1">Notas sobre el cliente (opcional)</label>
                <Textarea 
                  placeholder="Ej: Cliente muy amable, facilitó toda la información..."
                  value={clientComment}
                  onChange={(e) => setClientComment(e.target.value)}
                  className="min-h-[100px] rounded-xl resize-none"
                />
              </div>

              <div className="flex gap-3">
                <Button 
                  variant="outline" 
                  onClick={() => setShowRatingModal(false)}
                  className="flex-1 rounded-xl"
                >
                  Cancelar
                </Button>
                <Button 
                  onClick={confirmCloseWithRating}
                  disabled={submittingRating}
                  className="flex-1 rounded-xl bg-brand-700 hover:bg-brand-800 disabled:opacity-50"
                >
                  {submittingRating ? "Guardando..." : "Cerrar Caso"}
                </Button>
              </div>
            </div>
          </div>
        </div>
      )}

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
        {/* eslint-disable-next-line @next/next/no-img-element */}
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
        "max-w-[85%] sm:max-w-[78%] rounded-2xl px-3.5 sm:px-4 py-2 shadow-sm",
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

        {m.mediaUrl && <MediaPreview url={m.mediaUrl} type={m.mediaType} name={m.fileName} />}
        
        {/* Contenido con detección de [SUGERENCIAS] */}
        <div className="text-sm leading-relaxed whitespace-pre-wrap break-words mt-1">
          {m.content?.includes("[SUGERENCIAS:") ? (
            <>
              {m.content.split("[SUGERENCIAS:")[0]}
              <div className="flex flex-wrap gap-2 mt-2">
                {m.content
                  .match(/\[SUGERENCIAS:\s*(.+?)\]/)?.[1]
                  .split(",")
                  .map((opt, idx) => (
                    <div
                      key={idx}
                      className={cn(
                        "px-3 py-1 rounded-full text-xs font-semibold border transition-all",
                        isCliente 
                          ? "bg-brand-50 text-brand-700 border-brand-200" 
                          : "bg-white/20 text-white border-white/40"
                      )}
                    >
                      {opt.trim()}
                    </div>
                  ))}
              </div>
              {m.content.split("]")[1]}
            </>
          ) : (
            m.content
          )}
        </div>

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
