"use client";
import * as React from "react";
import { useRouter } from "next/navigation";
import {
  ArrowLeft, MoreVertical, Phone, Send, Paperclip, Bot,
  Mail, Building2, User, Users, UserPlus, StickyNote, Zap, CheckCircle2,
  XCircle, Image as ImageIcon, FileText, Music, Video,
  Download, X, ChevronDown, History, HandMetal, Star, Tag, AlertTriangle,
  Mic, Play, Pause, Square, Smile, Trash2, UserCheck
} from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { Avatar, Badge } from "@/components/ui/avatar";
import { Textarea } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { cn, formatTime, asText, clienteInfo } from "@/lib/utils";
import { toast } from "sonner";
import { CaseHistoryDrawer } from "./case-history-drawer";
import { TemplateManager } from "./template-manager";
import type { SekCase, SekHistEntry, ChannelKind } from "@/lib/types";

type UnifiedMessage = {
  id: string;
  source: "user" | "assistant" | "tecnico" | "nota";
  content: string;
  time: string;
  authorName?: string;
  status?: "pending" | "sent" | "error";
  read_at?: string;
  mediaUrl?: string;
  mediaType?: string;
  fileName?: string;
  reactions?: any[];
  deleted?: boolean;
  deleted_for_me?: string[];
  originalIndex?: number;
  historyType?: "histcliente" | "histtecnico";
  sourceCaseId?: string | number;
  messageId?: string;
  fromMe?: boolean;
};

function unifyMessages(c: SekCase): UnifiedMessage[] {
  const out: UnifiedMessage[] = [];
  const fromCliente = Array.isArray(c.histcliente) ? c.histcliente : [];
  const fromTecnico = Array.isArray(c.histtecnico) ? c.histtecnico : [];

  fromCliente.forEach((e, i) => {
    const role = String(e.role || "user");
    const isAgente = role === "assistant" || role === "tecnico" || role === "nota" || role === "ia";
    out.push({
      id: `c-${i}`,
      source: role === "assistant" || role === "ia" ? "assistant" : role === "nota" ? "nota" : role === "tecnico" ? "tecnico" : "user",
      content: asText(e.content),
      time: e.time || c.created_at,
      authorName: isAgente ? (asText(e.author) || "Soporte Sekunet") : undefined,
      status: "sent",
      read_at: e.read_at as string | undefined,
      mediaUrl: e.mediaUrl as string | undefined,
      mediaType: e.mediaType as string | undefined,
      fileName: e.fileName as string | undefined,
      reactions: (e as any).reactions,
      deleted: (e as any).deleted,
      deleted_for_me: (e as any).deleted_for_me,
      originalIndex: (e as any)._sourceIndex ?? i,
      historyType: "histcliente",
      sourceCaseId: (e as any)._sourceCaseId ?? c.id,
      messageId: (e as any).messageId,
      fromMe: (e as any).fromMe ?? isAgente,
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
      read_at: e.read_at as string | undefined,
      mediaUrl: e.mediaUrl as string | undefined,
      mediaType: e.mediaType as string | undefined,
      fileName: e.fileName as string | undefined,
      reactions: (e as any).reactions,
      deleted: (e as any).deleted,
      deleted_for_me: (e as any).deleted_for_me,
      originalIndex: (e as any)._sourceIndex ?? i,
      historyType: "histtecnico",
      sourceCaseId: (e as any)._sourceCaseId ?? c.id,
      messageId: (e as any).messageId,
      fromMe: (e as any).fromMe ?? true,
    });
  });

  return out.sort((a, b) => new Date(a.time).getTime() - new Date(b.time).getTime());
}

export function ChatView({ sekCase: initialCase, onBack }: { sekCase: SekCase; onBack: () => void }) {
  const router = useRouter();
  const supabase = React.useMemo(() => createClient(), []);
  const [sekCase, setSekCase] = React.useState<SekCase>(initialCase);
  const [messages, setMessages] = React.useState<UnifiedMessage[]>([]);
  const [draft, setDraft] = React.useState("");
  const [sending, setSending] = React.useState(false);
  const [agentEmail, setAgentEmail] = React.useState<string | null>(null);
  const [agentName, setAgentName] = React.useState<string | null>(null);
  const [agentRole, setAgentRole] = React.useState<string>("tecnico");

  const handleMessageUpdate = (
    historyType: "histcliente" | "histtecnico",
    originalIndex: number,
    fieldsToUpdate: any
  ) => {
    setSekCase(prev => {
      const history = prev[historyType] || [];
      const updatedHistory = [...history];
      if (originalIndex >= 0 && originalIndex < updatedHistory.length) {
        updatedHistory[originalIndex] = {
          ...updatedHistory[originalIndex],
          ...fieldsToUpdate,
        };
      }
      return { ...prev, [historyType]: updatedHistory };
    });
  };
  const [mode, setMode] = React.useState<"reply" | "nota">("reply");
  const [showPlantillas, setShowPlantillas] = React.useState(false);
  const [showTemplateManager, setShowTemplateManager] = React.useState(false);
  const [plantillas, setPlantillas] = React.useState<any[]>([]);
  const [personalPlantillas, setPersonalPlantillas] = React.useState<any[]>([]);
  const [uploadingFile, setUploadingFile] = React.useState(false);
  const [isRecording, setIsRecording] = React.useState(false);
  const mediaRecRef = React.useRef<MediaRecorder | null>(null);
  const audioChunksRef = React.useRef<Blob[]>([]);
  const processedFilesRef = React.useRef<Set<string>>(new Set());
  const [isRecordingVideo, setIsRecordingVideo] = React.useState(false);
  const videoRecRef = React.useRef<MediaRecorder | null>(null);
  const videoChunksRef = React.useRef<Blob[]>([]);
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
  const [autoClosePaused, setAutoClosePaused] = React.useState(!!(initialCase as any).auto_close_paused);
  const [editingPhone, setEditingPhone] = React.useState(false);
  const [realPhoneInput, setRealPhoneInput] = React.useState("");
  const [agents, setAgents] = React.useState<any[]>([]);
  const [showReassign, setShowReassign] = React.useState(false);
  const [reassigning, setReassigning] = React.useState(false);

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

  const [previewImage, setPreviewImage] = React.useState<string | null>(null);

  const fileInputRef = React.useRef<HTMLInputElement>(null);
  const scrollerRef = React.useRef<HTMLDivElement>(null);
  const typingTimerRef = React.useRef<ReturnType<typeof setTimeout> | null>(null);
  const presenceChannelRef = React.useRef<ReturnType<typeof supabase.channel> | null>(null);

  const historyLoadedRef = React.useRef(false);
  const initialCaseRef = React.useRef(initialCase);
  React.useEffect(() => { initialCaseRef.current = initialCase; }, [initialCase]);
  React.useEffect(() => {
    historyLoadedRef.current = false;
    setSekCase(initialCase);
  }, [initialCase?.id]);
  React.useEffect(() => { setMessages(unifyMessages(sekCase)); }, [sekCase]);

  /* Helper: combinar casos de un grupo en un único objeto histórico */
  const buildMergedCase = React.useCallback((baseCase: SekCase, casesData: SekCase[]): SekCase => {
    const sorted = [...casesData].sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime());
    const targetId2 = baseCase._group?.targetCaseId ?? baseCase.id;
    const target = sorted.find(c => String(c.id) === String(targetId2)) ?? sorted[sorted.length - 1] ?? casesData[0];
    const merged = {
      ...target,
      id: baseCase.id,
      cliente: baseCase.cliente ?? target.cliente,
      estado: (baseCase._group
        ? (sorted.some(c => {
            const e = String(c.estado || "").toLowerCase();
            return e !== "cerrado" && e !== "resuelto";
          }) ? "abierto" : target.estado)
        : baseCase.estado) as SekCase["estado"],
      histcliente: [],
      histtecnico: [],
      _group: baseCase._group,
    } as unknown as SekCase;
    sorted.forEach((c, idx) => {
      const hc = Array.isArray(c.histcliente) ? c.histcliente : [];
      const ht = Array.isArray(c.histtecnico) ? c.histtecnico : [];
      if (idx > 0) {
        (merged.histtecnico as any[]).push({
          role: "separator",
          time: c.created_at,
          content: `── Nueva conversación · ${new Date(c.created_at).toLocaleDateString("es-CR", { day: "2-digit", month: "short", year: "numeric" })} ──`,
          author: "",
          _separator: true,
        });
      }
      hc.forEach((e: any, ei: number) => (merged.histcliente as any[]).push({ ...e, _sourceCaseId: c.id, _sourceIndex: ei }));
      ht.forEach((e: any, ei: number) => (merged.histtecnico as any[]).push({ ...e, _sourceCaseId: c.id, _sourceIndex: ei }));
    });
    return merged;
  }, []);

  /* Cargar historial completo si el caso llegó en modo ligero (sin histcliente/histtecnico) */
  React.useEffect(() => {
    let mounted = true;
    (async () => {
      const hasHistory = (Array.isArray(initialCase.histcliente) && initialCase.histcliente.length > 0) ||
                         (Array.isArray(initialCase.histtecnico) && initialCase.histtecnico.length > 0);
      if (hasHistory) return;
      try {
        const ids = initialCase._group?.caseIds?.length ? initialCase._group.caseIds : [initialCase.id];
        const { data } = await supabase
          .from("sek_cases")
          .select("id,estado,canal,cliente,assigned_to,customer_phone,created_at,updated_at,last_message_at,last_message_preview,histcliente,histtecnico")
          .in("id", ids);
        if (!data || !mounted) return;
        const merged = buildMergedCase(initialCase, data as SekCase[]);
        if (mounted) {
          setSekCase(merged);
          historyLoadedRef.current = true;
        }
      } catch (e) {
        console.error("[chat-view] loadFullCase error:", e);
      }
    })();
    return () => { mounted = false; };
  }, [initialCase?.id, supabase, buildMergedCase]);

  /* Cargar plantillas */
  React.useEffect(() => {
    supabase.from("sek_plantillas").select("id,nombre,texto,cat").limit(30)
      .then(({ data }) => { if (data) setPlantillas(data.map(d => ({ ...d, isGlobal: true }))); });
  }, [supabase]);

  React.useEffect(() => {
    if (agentEmail) {
      try {
        const stored = localStorage.getItem(`sek_plantillas_${agentEmail}`);
        if (stored) setPersonalPlantillas(JSON.parse(stored));
      } catch (e) {
        console.error("Error loading personal templates", e);
      }
    }
  }, [agentEmail]);

  const isGrouped = !!initialCase._group;
  const targetId = initialCase._group?.targetCaseId ?? initialCase.id;
  const targetHisttecnico = initialCase._group?.targetHisttecnico ?? (Array.isArray(initialCase.histtecnico) ? initialCase.histtecnico : []);
  const targetEstado = initialCase._group?.targetEstado ?? initialCase.estado;

  /* Cargar agentes disponibles para reasignación */
  React.useEffect(() => {
    let mounted = true;
    (async () => {
      const { data, error } = await supabase
        .from("sek_agent_config")
        .select("email,nombre,apellido,rol")
        .in("rol", ["tecnico", "admin", "supervisor"])
        .order("nombre", { ascending: true });
      if (error) {
        console.error("[chat-view] Error cargando agentes:", error.message);
        return;
      }
      if (mounted && data) setAgents(data);
    })();
    return () => { mounted = false; };
  }, [supabase]);

  React.useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        const { data: { user } } = await supabase.auth.getUser();
        if (!mounted || !user?.email) return;
        setAgentEmail(user.email);
        const { data: agent } = await supabase
          .from("sek_agent_config").select("nombre,apellido,rol").ilike("email", user.email).maybeSingle();
        if (!mounted) return;
        const a: any = agent;
        setAgentName([a?.nombre, a?.apellido].filter(Boolean).join(" ") || user.email);
        setAgentRole(a?.rol || "tecnico");
      } catch { /* lock timeout en dev - ignorar */ }
    })();

    console.log(`[chat-view] Suscribiendo realtime para caso ${targetId}${isGrouped ? " (grupo)" : ""}`);
    const channel = supabase
      .channel(`case-${targetId}`)
      .on("system", { event: "*" }, (msg) => {
        console.log(`[chat-view] system event:`, msg.event, msg);
      })
      .on("postgres_changes", {
        event: "UPDATE", schema: "public", table: "sek_cases",
        filter: `id=eq.${targetId}`
      }, async (payload) => {
        console.log(`[chat-view] realtime UPDATE recibido para ${targetId}:`, {
          hasHistcliente: payload.new?.histcliente !== undefined,
          histclienteLen: Array.isArray(payload.new?.histcliente) ? payload.new.histcliente.length : 0,
          hasHisttecnico: payload.new?.histtecnico !== undefined,
          histtecnicoLen: Array.isArray(payload.new?.histtecnico) ? payload.new.histtecnico.length : 0,
        });

        // Para chats agrupados, el payload solo trae el caso objetivo; recargar el historial completo del grupo
        // para no perder mensajes de otros casos del mismo cliente.
        if (isGrouped && initialCaseRef.current._group?.caseIds?.length) {
          try {
            const { data } = await supabase
              .from("sek_cases")
              .select("id,estado,canal,cliente,assigned_to,customer_phone,created_at,updated_at,last_message_at,last_message_preview,histcliente,histtecnico")
              .in("id", initialCaseRef.current._group.caseIds);
            if (data && mounted) {
              setSekCase(buildMergedCase(initialCaseRef.current, data as SekCase[]));
            }
          } catch (e) {
            console.error("[chat-view] realtime reload group error:", e);
          }
          return;
        }

        setSekCase(prev => {
          const newData = payload.new as any;
          const update: any = { ...newData };
          // Proteger historial cargado: no reemplazar arrays con datos reales por arrays vacíos
          if (newData.histcliente !== undefined && Array.isArray(newData.histcliente) && newData.histcliente.length === 0 &&
              Array.isArray(prev.histcliente) && prev.histcliente.length > 0) {
            delete update.histcliente;
          }
          if (newData.histtecnico !== undefined && Array.isArray(newData.histtecnico) && newData.histtecnico.length === 0 &&
              Array.isArray(prev.histtecnico) && prev.histtecnico.length > 0) {
            delete update.histtecnico;
          }
          // Proteger estado escalado: el webhook puede cambiar el estado via realtime
          // pero si el caso estaba escalado, solo permitir cambios a abierto/cerrado/resuelto
          // (cambios hechos por acción explícita del agente), no retroceder a ia_atendiendo/pendiente
          if (prev.estado === "escalado" && update.estado && ["ia_atendiendo", "pendiente"].includes(update.estado)) {
            delete update.estado;
          }
          return { ...prev, ...update };
        });
      })
      .subscribe((status, err) => {
        console.log(`[chat-view] realtime subscription status:`, status, err || "");
        // Si el canal se cae (error, timeout o cierre inesperado), reconectar tras 2s
        // para no depender únicamente del polling en caso de fallas de red prolongadas.
        if (status === "CHANNEL_ERROR" || status === "TIMED_OUT" || status === "CLOSED") {
          console.warn(`[chat-view] canal realtime perdido (${status}), reintentando en 2s...`);
          setTimeout(() => { if (mounted) { try { channel.subscribe(); } catch {} } }, 2000);
        }
      });

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

    /* Función de refetch reutilizable: la usa tanto el polling periódico como
       el listener de visibilidad (para refrescar de inmediato al volver a la pestaña,
       cubriendo el caso donde el navegador/OS pausó los timers en segundo plano). */
    const doPoll = async () => {
      console.log(`[chat-view] polling ${targetId}${isGrouped ? " (grupo)" : ""}`);
      try {
        if (isGrouped && initialCaseRef.current._group?.caseIds?.length) {
          // Para chats agrupados, recargar el historial completo de todos los casos
          const { data } = await supabase
            .from("sek_cases")
            .select("id,estado,canal,cliente,assigned_to,customer_phone,created_at,updated_at,last_message_at,last_message_preview,histcliente,histtecnico")
            .in("id", initialCaseRef.current._group.caseIds);
          if (data && mounted) {
            setSekCase(buildMergedCase(initialCaseRef.current, data as SekCase[]));
          }
          return;
        }

        const { data, error } = await supabase
          .from("sek_cases")
          .select("id,estado,assigned_to,last_message_at,last_message_preview,histcliente,histtecnico")
          .eq("id", targetId)
          .maybeSingle();
        if (error) { console.error(`[chat-view] polling error:`, error); return; }
        if (data && mounted) {
          console.log(`[chat-view] polling data: hc=${Array.isArray(data.histcliente)?data.histcliente.length:0}, ht=${Array.isArray(data.histtecnico)?data.histtecnico.length:0}, last=${data.last_message_preview?.slice(0,40)}`);
          setSekCase(prev => {
            const update: any = {
              estado: data.estado,
              assigned_to: data.assigned_to,
              last_message_at: data.last_message_at,
              last_message_preview: data.last_message_preview,
            };
            // No reemplazar historial real por arrays vacíos recibidos en polling
            if (!(Array.isArray(data.histcliente) && data.histcliente.length === 0 && Array.isArray(prev.histcliente) && prev.histcliente.length > 0)) {
              update.histcliente = data.histcliente;
            }
            if (!(Array.isArray(data.histtecnico) && data.histtecnico.length === 0 && Array.isArray(prev.histtecnico) && prev.histtecnico.length > 0)) {
              update.histtecnico = data.histtecnico;
            }
            const hashOf = (c: any) => {
              const hc = c.histcliente || [], ht = c.histtecnico || [];
              return hc.length + "|" + ht.length + "|" +
                (hc.length ? (hc[hc.length-1]?.time || "") + (hc[hc.length-1]?.read_at || "") : "") + "|" +
                (ht.length ? (ht[ht.length-1]?.time || "") + (ht[ht.length-1]?.read_at || "") : "") + "|" +
                (c.estado || "") + "|" + (c.assigned_to || "");
            };
            const merged = { ...prev, ...update };
            return hashOf(prev) === hashOf(merged) ? prev : merged;
          });
          // Marcar mensajes del cliente sin read_at como leídos (agente tiene el chat abierto).
          // Se usa RPC atómica para evitar race conditions: si llega un mensaje nuevo durante
          // la lectura/escritura, la función lo conserva al bloquear la fila y re-leer el array.
          try {
            await supabase.rpc("mark_histcliente_read", { p_case_id: String(targetId), p_reader_email: agentEmail || undefined });
          } catch (err: any) {
            console.error("[chat-view] mark_histcliente_read error:", err?.message || err);
          }
        }
      } catch (e) {
        console.error(`[chat-view] polling error:`, e);
      }
    };

    /* Polling de respaldo cada 10s con campos mínimos */
    const poll = setInterval(doPoll, 10000);

    /* Refetch inmediato al volver a la pestaña/ventana. Cubre el caso donde el
       navegador o el sistema operativo pausó los timers en segundo plano (pestaña
       inactiva, minimizada, o equipo suspendido) y se perdieron mensajes nuevos
       sin que el agente lo notara. */
    const handleVisibility = () => {
      if (document.visibilityState === "visible") {
        console.log("[chat-view] pestaña visible de nuevo, forzando refetch inmediato");
        doPoll();
      }
    };
    document.addEventListener("visibilitychange", handleVisibility);
    window.addEventListener("focus", handleVisibility);

    // Marcar mensajes del cliente como leídos al abrir el chat (RPC atómica)
    (async () => {
      try {
        await supabase.rpc("mark_histcliente_read", { p_case_id: String(targetId), p_reader_email: agentEmail || undefined });
      } catch (err: any) {
        console.error("[chat-view] mark_histcliente_read (open) error:", err?.message || err);
      }
    })();

    return () => {
      mounted = false;
      clearInterval(poll);
      document.removeEventListener("visibilitychange", handleVisibility);
      window.removeEventListener("focus", handleVisibility);
      supabase.removeChannel(channel);
      supabase.removeChannel(presenceCh);
    };
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

  async function send(overrideContent?: string, mediaUrl?: string, mediaType?: string, fileName?: string, skipWhatsApp?: boolean) {
    const body = (overrideContent ?? draft).trim();
    if ((!body && !mediaUrl) || sending || !agentEmail) return;
    setSending(true);
    const isNota = mode === "nota" && !overrideContent;
    console.log("[DEBUG send] agentName:", agentName, "agentEmail:", agentEmail);
    const entry: SekHistEntry = {
      role: isNota ? "nota" : "tecnico",
      time: new Date().toISOString(),
      content: body || (fileName ?? "Archivo adjunto"),
      author: agentName || agentEmail,
      ...(mediaUrl ? { mediaUrl, mediaType, fileName } : {})
    };
    console.log("[DEBUG send] entry.author:", entry.author);
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
      const baseHist = Array.isArray(sekCase.histtecnico) ? sekCase.histtecnico : [];
      const newHist = [...baseHist, entry];
      setSekCase(prev => ({ ...prev, histtecnico: newHist }));
      const updates: Record<string, unknown> = { histtecnico: newHist };
      const targetCerrado = String(sekCase.estado || "").toLowerCase() === "cerrado" || String(sekCase.estado || "").toLowerCase() === "resuelto";
      if (targetCerrado && !isNota) updates.estado = "abierto";
      
      // Auto-aceptar caso si el agente responde y aún no tiene accepted_at
      if (!isNota && !sekCase.accepted_at) {
        updates.accepted_at = new Date().toISOString();
        updates.estado = "abierto";
        updates.assigned_to = agentEmail;
      }

      const { error } = await supabase
        .from("sek_cases")
        .update(updates)
        .eq("id", targetId);
      if (error) throw error;
      setMessages(prev => prev.map(m => m.id === optimisticMsg.id ? { ...m, status: "sent" } : m));

      // Envío por WhatsApp vía Evolution API (solo mensajes no-nota y canal whatsapp)
      const isWhatsApp = String(sekCase.canal || "").toLowerCase() === "whatsapp";
      if (!isNota && isWhatsApp && !skipWhatsApp) {
        // Disparar en segundo plano
        fetch("/api/evolution/send", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            case_id: targetId,
            text: body || undefined,
            mediaUrl: mediaUrl || undefined,
            mediaType: mediaType || undefined,
            fileName: fileName || undefined,
          })
        }).then(async res => {
          if (!res.ok) {
            const data = await res.json().catch(() => ({}));
            toast.error("Error al enviar a WhatsApp", { description: data.error || "Evolution API falló" });
            // Revertir estado si falló en Evolution? (Opcional, pero al menos mostramos el error)
          }
        }).catch(err => {
          console.error("Fetch evolution/send failed:", err);
          toast.error("Error de red al enviar a WhatsApp");
        });
      }
    } catch (e: any) {
      toast.error("No se pudo enviar", { description: (e as any)?.message });
      setMessages(prev => prev.map(m => m.id === optimisticMsg.id ? { ...m, status: "error" } : m));
    } finally { setSending(false); }
  }

  async function startRecording() {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      audioChunksRef.current = [];
      const rec = new MediaRecorder(stream);
      rec.ondataavailable = (e) => { if (e.data.size > 0) audioChunksRef.current.push(e.data); };
      rec.onstop = async () => {
        stream.getTracks().forEach(t => t.stop());
        const blob = new Blob(audioChunksRef.current, { type: "audio/webm" });
        if (blob.size < 1000) return; // descartar grabaciones muy cortas
        const file = new File([blob], `nota-voz-${Date.now()}.webm`, { type: "audio/webm" });
        setUploadingFile(true);
        try {
          const path = `cases/${targetId}/${file.name}`;
          const { error: upErr } = await supabase.storage.from("attachments").upload(path, file, { upsert: true, contentType: file.type || "audio/webm" });
          if (upErr) throw upErr;
          const { data: urlData } = supabase.storage.from("attachments").getPublicUrl(path);
          await send("", urlData.publicUrl, file.type, file.name);
        } catch (err: any) {
          toast.error("Error al subir audio", { description: err?.message });
        } finally { setUploadingFile(false); }
      };
      rec.start();
      mediaRecRef.current = rec;
      setIsRecording(true);
    } catch (err: any) { toast.error("No se pudo acceder al micrófono", { description: err?.message }); }
  }

  function stopRecording() {
    mediaRecRef.current?.stop();
    mediaRecRef.current = null;
    setIsRecording(false);
  }

  async function startVideoRecording() {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "user", width: 480, height: 480 }, audio: true });
      videoChunksRef.current = [];
      const rec = new MediaRecorder(stream, { mimeType: MediaRecorder.isTypeSupported("video/webm;codecs=vp9") ? "video/webm;codecs=vp9" : "video/webm" });
      rec.ondataavailable = (e) => { if (e.data.size > 0) videoChunksRef.current.push(e.data); };
      rec.onstop = async () => {
        stream.getTracks().forEach(t => t.stop());
        const blob = new Blob(videoChunksRef.current, { type: "video/webm" });
        if (blob.size < 5000) return;
        const file = new File([blob], `nota-video-${Date.now()}.webm`, { type: "video/webm" });
        setUploadingFile(true);
        try {
          const path = `cases/${targetId}/${file.name}`;
          const { error: upErr } = await supabase.storage.from("attachments").upload(path, file, { upsert: true, contentType: file.type || "video/webm" });
          if (upErr) throw upErr;
          const { data: urlData } = supabase.storage.from("attachments").getPublicUrl(path);
          await send("", urlData.publicUrl, file.type, file.name);
        } catch (err: any) {
          toast.error("Error al subir video", { description: err?.message });
        } finally { setUploadingFile(false); }
      };
      rec.start();
      videoRecRef.current = rec;
      setIsRecordingVideo(true);
    } catch (err: any) { toast.error("No se pudo acceder a la c\u00e1mara", { description: err?.message }); }
  }

  function stopVideoRecording() {
    videoRecRef.current?.stop();
    videoRecRef.current = null;
    setIsRecordingVideo(false);
  }

  async function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file || !agentEmail) return;

    const isWhatsApp = String(sekCase.canal || "").toLowerCase() === "whatsapp";
    const MAX_MB = isWhatsApp ? 100 : 50;

    if (file.size > MAX_MB * 1024 * 1024) {
      toast.error(`El archivo excede el límite de ${MAX_MB} MB`, {
        description: `"${file.name}" pesa ${(file.size / 1024 / 1024).toFixed(1)} MB. Comprímaló o compártalo por otro medio.`,
      });
      if (fileInputRef.current) fileInputRef.current.value = "";
      return;
    }

    setUploadingFile(true);
    try {
      if (isWhatsApp) {
        const DIRECT_BASE64_LIMIT = 3 * 1024 * 1024; // 3 MB → base64 directo; mayor → URL pública
        const caseIdStr = String(targetId);

        // Subir siempre a Storage para tener una URL con la que mostrar el adjunto en el chat
        const ext = file.name.split(".").pop() ?? "bin";
        const path = `cases/${targetId}/${Date.now()}.${ext}`;
        const { error: upErr } = await supabase.storage
          .from("attachments")
          .upload(path, file, { upsert: true, contentType: file.type || undefined });
        if (upErr) throw upErr;
        const { data: pub } = supabase.storage.from("attachments").getPublicUrl(path);

        let payload: Record<string, string>;
        if (file.size <= DIRECT_BASE64_LIMIT) {
          // Archivo pequeño: enviar a Evolution como base64 directo
          const reader = new FileReader();
          const base64 = await new Promise<string>((resolve, reject) => {
            reader.onload = () => resolve(reader.result as string);
            reader.onerror = reject;
            reader.readAsDataURL(file);
          });
          payload = { case_id: caseIdStr, base64, mimeType: file.type || "application/octet-stream", fileName: file.name };
        } else {
          // Archivo grande: enviar a Evolution por URL pública
          payload = { case_id: caseIdStr, mediaUrl: pub.publicUrl, mimeType: file.type || "application/octet-stream", fileName: file.name };
        }

        const res = await fetch("/api/evolution/send-base64", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });
        if (!res.ok) {
          const d = await res.json().catch(() => ({}));
          throw new Error(d.error || `Error ${res.status}`);
        }
        // Registrar en histtecnico con la URL de storage para que se vea el adjunto en el chat
        // skipWhatsApp=true: ya se envió por /api/evolution/send-base64, evitar duplicado
        await send("", pub.publicUrl, file.type, file.name, true);
      } else {
        // Otros canales (Widget, etc.): subir a Supabase Storage como antes
        const ext = file.name.split(".").pop();
        const path = `cases/${targetId}/${Date.now()}.${ext}`;
        const { error: upErr } = await supabase.storage
          .from("attachments")
          .upload(path, file, { upsert: true, contentType: file.type || undefined });
        if (upErr) throw upErr;
        const { data: urlData } = supabase.storage.from("attachments").getPublicUrl(path);
        await send("", urlData.publicUrl, file.type, file.name);
      }
    } catch (err: any) {
      const msg: string = err?.message || "";
      const isSize = msg.toLowerCase().includes("size") || msg.toLowerCase().includes("limit");
      toast.error("Error al subir archivo", {
        description: isSize ? `El archivo supera el límite. Intente con un archivo más pequeño.` : msg,
      });
    } finally {
      setUploadingFile(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  }

  // Handler para pegar desde el portapapeles (texto o imágenes)
  async function handlePaste(e: React.ClipboardEvent<HTMLTextAreaElement>) {
    const items = Array.from(e.clipboardData?.items || []);
    const hasFiles = items.some(item => item.kind === "file");
    
    if (!hasFiles || !agentEmail || uploadingFile) return;
    
    // Prevenir inmediatamente cualquier comportamiento por defecto
    e.preventDefault();
    e.stopPropagation();
    
    // Solo procesar el PRIMER archivo
    const fileItem = items.find(item => item.kind === "file");
    if (!fileItem) return;
    
    const file = fileItem.getAsFile();
    if (!file) return;
    
    // Crear ID único para este archivo
    const fileId = `${file.name}-${file.size}-${file.lastModified}`;
    
    // Verificar si ya procesamos este archivo
    if (processedFilesRef.current.has(fileId)) {
      console.log("[handlePaste] Archivo ya procesado, ignorando:", file.name);
      return;
    }
    
    // Marcar como procesado INMEDIATAMENTE
    processedFilesRef.current.add(fileId);
    
    setUploadingFile(true);
    try {
      const ext = file.name.split(".").pop() || "png";
      const path = `cases/${targetId}/${Date.now()}.${ext}`;
      const { error: upErr } = await supabase.storage
        .from("attachments")
        .upload(path, file, { upsert: true, contentType: file.type || undefined });
      if (upErr) throw upErr;
      const { data: urlData } = supabase.storage.from("attachments").getPublicUrl(path);
      await send("", urlData.publicUrl, file.type, file.name);
      toast.success("Imagen enviada");
    } catch (err: any) {
      toast.error("Error al enviar imagen", { description: err?.message });
      // En caso de error, remover del set para poder reintentar
      processedFilesRef.current.delete(fileId);
    } finally {
      setUploadingFile(false);
    }
  }

  async function toggleCaso() {
    const newEstado = cerrado ? "abierto" : "cerrado";
    
    // Siempre mostrar modal de calificación al cerrar
    // Si ya tiene calificación previa, pre-rellenar
    if (newEstado === "cerrado") {
      const prevRating = (sekCase.cliente as any)?.calificacion_agente;
      if (prevRating) setClientRating(Number(prevRating) || 5);
      modalShownRef.current = true;
      setShowRatingModal(true);
      setShowActions(false);
      return;
    }

    // Reabrir caso: no tocar closed_at (queda como registro histórico)
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
          cliente: updatedCliente,
          closed_at: new Date().toISOString(),
        })
        .eq("id", targetId);

      if (error) throw error;

      modalShownRef.current = true;
      prevEstadoRef.current = "cerrado";
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
  const iaAtendiendo = estadoLower === "ia_atendiendo";
  const isEscalado = estadoLower === "escalado";

  async function toggleAutoClosePaused() {
    try {
      const res = await fetch("/api/admin/toggle-auto-close-paused", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ caseId: targetId, paused: !autoClosePaused })
      });
      if (res.ok) {
        setAutoClosePaused(!autoClosePaused);
        toast.success(autoClosePaused ? "Auto-close reanudado" : "Auto-close pausado");
      } else {
        const d = await res.json();
        toast.error("Error", { description: d.error });
      }
    } catch (e) {
      toast.error("Error de conexión");
    }
  }

  async function acceptCase() {
    if (accepting || !agentEmail) return;
    setAccepting(true);
    try {
      const { error } = await supabase.from("sek_cases").update({
        estado: "abierto",
        assigned_to: agentEmail,
        accepted_at: new Date().toISOString(),
      }).eq("id", targetId);
      if (error) throw error;
      setSekCase(prev => ({ ...prev, estado: "abierto", assigned_to: agentEmail }));
      toast.success("Caso aceptado");
      fetch("/api/profile/status", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ status: "busy" }) });
      
      // Prevent the ChatView from disappearing by navigating to Mi Gestión where the case is currently assigned.
      router.push(`/mi-gestion?c=${targetId}`);
    } catch (e: any) {
      toast.error("Error al aceptar", { description: e?.message });
    } finally {
      setAccepting(false);
    }
  }

  async function reassignCase(newAgentEmail: string) {
    if (reassigning || !newAgentEmail || newAgentEmail === sekCase.assigned_to) return;
    setReassigning(true);
    try {
      const { error } = await supabase.from("sek_cases").update({
        assigned_to: newAgentEmail,
        accepted_at: new Date().toISOString(),
      }).eq("id", targetId);
      if (error) throw error;
      setSekCase(prev => ({ ...prev, assigned_to: newAgentEmail }));
      const agent = agents.find((a: any) => a.email === newAgentEmail);
      const name = agent ? [agent.nombre, agent.apellido].filter(Boolean).join(" ") : newAgentEmail;
      toast.success(`Caso reasignado a ${name}`);
      setShowReassign(false);
    } catch (e: any) {
      toast.error("Error al reasignar", { description: e?.message });
    } finally {
      setReassigning(false);
    }
  }

  async function saveRealPhone() {
    try {
      const cleanNum = realPhoneInput.replace(/[^0-9]/g, "");
      if (cleanNum.length < 8) {
        toast.error("El número debe tener al menos 8 dígitos");
        return;
      }
      const currentCliente = typeof sekCase.cliente === "object" ? sekCase.cliente : {};
      const updatedCliente = { ...currentCliente, telefono_real: cleanNum };
      const { error } = await supabase
        .from("sek_cases")
        .update({ cliente: updatedCliente })
        .eq("id", targetId);
      if (error) throw error;
      setSekCase(prev => ({ ...prev, cliente: updatedCliente }));
      toast.success("Teléfono real vinculado correctamente");
      setEditingPhone(false);
    } catch (e: any) {
      toast.error("Error al vincular teléfono", { description: e?.message });
    }
  }

  // Render main view
  return (
    <div className="flex flex-col h-full min-h-0 min-w-0">
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
              {canalKind === "whatsapp" && (String(sekCase.customer_phone || "").includes("@lid") || String(sekCase.customer_phone || "").length > 12) ? (
                (sekCase.cliente as any)?.telefono_real ? (
                  <span className="inline-flex items-center gap-1 text-green-500 font-medium" title="Teléfono real vinculado">
                    <Phone className="h-3 w-3" />
                    {(sekCase.cliente as any).telefono_real} (Vinculado)
                    <button onClick={() => { setRealPhoneInput((sekCase.cliente as any).telefono_real); setEditingPhone(true); }} className="hover:underline text-[10px] ml-1 font-semibold text-brand-500">
                      (Cambiar)
                    </button>
                  </span>
                ) : (
                  <span className="inline-flex items-center gap-1">
                    <Phone className="h-3 w-3" />
                    {ci.telefono}
                  </span>
                )
              ) : (
                ci.telefono && <span className="inline-flex items-center gap-1"><Phone className="h-3 w-3" />{ci.telefono}</span>
              )}
              {ci.correo && <span className="hidden sm:inline-flex items-center gap-1"><Mail className="h-3 w-3" />{ci.correo}</span>}
              {ci.cuenta && <span className="inline-flex items-center gap-1"><Building2 className="h-3 w-3" />{ci.cuenta}</span>}
              {(sekCase.estado === "cerrado" || sekCase.estado === "resuelto") && (
                <span className="inline-flex items-center gap-1 text-muted-foreground">
                  <UserCheck className="h-3 w-3" />
                  {sekCase.assigned_to ? `Atendido por: ${sekCase.assigned_to}` : "Atendido por: IA"}
                </span>
              )}
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
                {(iaAtendiendo || (estadoLower === "abierto" && !sekCase.assigned_to)) && (
                  <>
                    <button
                      onClick={() => { acceptCase(); setShowActions(false); }}
                      className="w-full flex items-center gap-2 px-4 py-2.5 text-sm hover:bg-muted transition-colors text-blue-500 font-medium"
                    >
                      <UserPlus className="h-4 w-4" /> Tomar caso
                    </button>
                    <div className="border-t border-border/50 my-1" />
                  </>
                )}
                {!cerrado && (sekCase.estado === "abierto" || sekCase.assigned_to) && (
                  <>
                    <button
                      onClick={() => { setShowReassign(true); setShowActions(false); }}
                      className="w-full flex items-center gap-2 px-4 py-2.5 text-sm hover:bg-muted transition-colors"
                    >
                      <Users className="h-4 w-4 text-blue-500" /> Reasignar caso
                    </button>
                    <div className="border-t border-border/50 my-1" />
                  </>
                )}
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
                  onClick={() => { toggleAutoClosePaused(); setShowActions(false); }}
                  className="w-full flex items-center gap-2 px-4 py-2.5 text-sm hover:bg-muted transition-colors"
                >
                  {autoClosePaused
                    ? <><Play className="h-4 w-4 text-green-500" /> Reanudar auto-close</>
                    : <><Pause className="h-4 w-4 text-amber-500" /> Pausar auto-close</>}
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

            {/* Panel de reasignación de caso */}
            {showReassign && (
              <div className="fixed inset-0 z-[100] flex items-end sm:items-center justify-center p-0 sm:p-4 bg-black/60 backdrop-blur-sm">
                <div className="bg-card border border-border rounded-t-3xl sm:rounded-3xl w-full max-w-sm shadow-2xl overflow-hidden pb-safe">
                  <div className="flex items-center justify-between p-5 border-b border-border">
                    <div className="flex items-center gap-2">
                      <Users className="h-4 w-4 text-blue-500" />
                      <p className="font-bold text-sm">Reasignar caso</p>
                    </div>
                    <button onClick={() => setShowReassign(false)} className="p-1.5 rounded-lg hover:bg-muted">
                      <X className="h-4 w-4" />
                    </button>
                  </div>
                  <div className="p-5 space-y-4">
                    <p className="text-xs text-muted-foreground">
                      Seleccione el técnico al que desea asignar este caso.
                    </p>
                    <div className="max-h-64 overflow-y-auto space-y-1">
                      {agents.length === 0 && (
                        <p className="text-sm text-muted-foreground text-center py-4">Cargando agentes...</p>
                      )}
                      {agents.map((a: any) => {
                        const name = [a.nombre, a.apellido].filter(Boolean).join(" ") || a.email;
                        const isCurrent = a.email === sekCase.assigned_to;
                        return (
                          <button
                            key={a.email}
                            disabled={isCurrent || reassigning}
                            onClick={() => reassignCase(a.email)}
                            className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm text-left transition-colors ${
                              isCurrent
                                ? "bg-muted text-muted-foreground cursor-default"
                                : "hover:bg-muted"
                            }`}
                          >
                            <User className="h-4 w-4 text-muted-foreground" />
                            <span className="flex-1 truncate">{name}</span>
                            {isCurrent && <span className="text-[10px] bg-brand-100 text-brand-700 px-1.5 py-0.5 rounded">Actual</span>}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* Modal de vincular teléfono real */}
            {editingPhone && (
              <div className="fixed inset-0 z-[100] flex items-end sm:items-center justify-center p-0 sm:p-4 bg-black/60 backdrop-blur-sm">
                <div className="bg-card border border-border rounded-t-3xl sm:rounded-3xl w-full max-w-sm shadow-2xl overflow-hidden pb-safe">
                  <div className="flex justify-between items-center px-4 py-3 border-b border-border bg-muted/20">
                    <div className="flex items-center gap-1.5">
                      <Phone className="h-4 w-4 text-brand-500" />
                      <p className="font-bold text-sm">Vincular Teléfono Real</p>
                    </div>
                    <button onClick={() => setEditingPhone(false)} className="p-1.5 rounded-lg hover:bg-muted">
                      <X className="h-4 w-4" />
                    </button>
                  </div>
                  <div className="p-4 flex flex-col gap-3">
                    <p className="text-xs text-muted-foreground leading-normal">
                      WhatsApp oculta el número real de este cliente debido a sus configuraciones de privacidad (ID de Red: {ci.telefono}).
                      <strong> Ingrese el número telefónico real</strong> de este cliente (con código de país, ej: 50688888888) para poder enviarle mensajes desde este panel.
                    </p>
                    <input
                      type="text"
                      value={realPhoneInput}
                      onChange={e => setRealPhoneInput(e.target.value)}
                      placeholder="Ej: 50688888888"
                      className="flex h-10 w-full rounded-xl border border-input bg-background px-3 py-2 text-sm ring-offset-background file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                    />
                    <div className="flex gap-2 justify-end mt-2">
                      <Button variant="ghost" onClick={() => setEditingPhone(false)}>
                        Cancelar
                      </Button>
                      <Button variant="default" onClick={saveRealPhone}>
                        Vincular Número
                      </Button>
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
                  <span suppressHydrationWarning>{new Date(m.time).toLocaleDateString()}</span>
                  <div className="flex-1 h-px bg-border" />
                </div>
              )}
              <Bubble m={m} clienteName={ci.nombre} onImageClick={setPreviewImage} agentEmail={agentEmail} onMessageUpdate={handleMessageUpdate} />
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
      {showPlantillas && (
        <div className="border-t border-border bg-card max-h-56 overflow-y-auto flex-shrink-0 px-safe relative">
          <div className="sticky top-0 bg-card/95 backdrop-blur-sm flex items-center justify-between px-4 py-2 border-b border-border z-10">
            <span className="text-xs font-semibold text-muted-foreground">Respuestas rápidas</span>
            <div className="flex items-center gap-2">
              <button onClick={() => setShowTemplateManager(true)} className="text-[10px] font-bold text-brand-500 hover:text-brand-600 transition-colors uppercase tracking-wider">
                Gestionar
              </button>
              <button onClick={() => setShowPlantillas(false)} className="text-muted-foreground hover:text-foreground"><X className="h-4 w-4" /></button>
            </div>
          </div>
          
          {personalPlantillas.length === 0 && plantillas.length === 0 && (
            <p className="text-xs text-center text-muted-foreground py-4">No hay plantillas disponibles.</p>
          )}

          {[...personalPlantillas, ...plantillas].map((p: any) => (
            <button
              key={p.id}
              onClick={() => {
                setDraft(p.texto);
                setShowPlantillas(false);
                setTimeout(() => {
                  const ta = document.querySelector<HTMLTextAreaElement>('textarea[aria-label="Mensaje"]');
                  if (ta) {
                    ta.focus();
                    const match = /\[[^\]]+\]/.exec(ta.value);
                    if (match) {
                      ta.setSelectionRange(match.index, match.index + match[0].length);
                    } else {
                      ta.setSelectionRange(ta.value.length, ta.value.length);
                    }
                  }
                }, 0);
              }}
              className="w-full text-left px-4 py-2.5 hover:bg-muted transition-colors border-b border-border/50 last:border-0 relative group"
            >
              <div className="flex justify-between items-start gap-2">
                <p className="text-xs font-semibold">{p.nombre}</p>
                <span className="text-[9px] font-bold tracking-wider uppercase text-muted-foreground opacity-50 shrink-0">
                  {p.isGlobal ? "Global" : "Personal"}
                </span>
              </div>
              <p className="text-xs text-muted-foreground truncate mt-0.5">{p.texto}</p>
            </button>
          ))}
        </div>
      )}

      {showTemplateManager && agentEmail && (
        <TemplateManager
          supabase={supabase}
          agentEmail={agentEmail}
          agentRole={agentRole}
          globalTemplates={plantillas}
          onGlobalTemplatesChange={setPlantillas}
          personalTemplates={personalPlantillas}
          onPersonalTemplatesChange={setPersonalPlantillas}
          onClose={() => setShowTemplateManager(false)}
        />
      )}

      {/* ── Accept banner para casos escalados (Soporte Avanzado) ── */}
      {isEscalado && (
        <div className="flex-shrink-0 border-t border-border bg-amber-50 dark:bg-amber-900/20 px-3 sm:px-4 py-3 px-safe">
          <div className="flex items-center gap-2 sm:gap-3">
            <div className="flex-1">
              <p className="text-sm font-semibold text-amber-800 dark:text-amber-200">
                Este caso fue escalado por el asistente y espera un agente
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
              {accepting ? "Tomando..." : "Tomar caso"}
            </button>
          </div>
        </div>
      )}

      {/* ── Aviso de bloqueo: la IA está atendiendo (Smart Inbox) ── */}
      {iaAtendiendo && (
        <div className="flex-shrink-0 border-t border-border bg-violet-50 dark:bg-violet-900/20 px-3 sm:px-4 py-4 px-safe">
          <div className="flex items-center gap-3">
            <div className="h-9 w-9 shrink-0 rounded-full bg-violet-500/15 text-violet-500 grid place-items-center">
              <Bot className="h-5 w-5" />
            </div>
            <div className="flex-1">
              <p className="text-sm font-semibold text-violet-800 dark:text-violet-200">
                El asistente inteligente está atendiendo este caso
              </p>
              <p className="text-xs text-violet-700/80 dark:text-violet-300/80 mt-0.5">
                Puede ver la conversación, pero no responder. El caso se habilitará cuando la IA lo escale a Soporte Avanzado.
              </p>
            </div>
          </div>
        </div>
      )}

      {/* ── Input bar ── */}
      {!iaAtendiendo && (
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
            accept="image/*,video/*,audio/*,.pdf,.xml,.xlsx,.xls,.xlsm,.doc,.docx,.ppt,.pptx,.pps,.ppsx,.txt,.csv,.json,.zip,.rar,.7z,.tar,.gz,.exe,.msi,.dmg,.apk,.ipa"
            onChange={handleFile}
          />
          <button
            onClick={() => fileInputRef.current?.click()}
            disabled={uploadingFile || isRecording}
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
          <button
            onMouseDown={startRecording}
            onMouseUp={stopRecording}
            onMouseLeave={isRecording ? stopRecording : undefined}
            onTouchStart={(e) => { e.preventDefault(); startRecording(); }}
            onTouchEnd={(e) => { e.preventDefault(); stopRecording(); }}
            disabled={uploadingFile || isRecordingVideo}
            className={cn(
              "h-10 w-10 grid place-items-center rounded-lg transition-colors disabled:opacity-50 select-none",
              isRecording ? "bg-red-500 text-white scale-110" : "text-muted-foreground hover:bg-muted"
            )}
            aria-label="Mantener para grabar audio"
            title="Mantener presionado para grabar audio · Soltar para enviar"
          >
            <Mic className="h-4 w-4" />
          </button>
          <button
            onMouseDown={startVideoRecording}
            onMouseUp={stopVideoRecording}
            onMouseLeave={isRecordingVideo ? stopVideoRecording : undefined}
            onTouchStart={(e) => { e.preventDefault(); startVideoRecording(); }}
            onTouchEnd={(e) => { e.preventDefault(); stopVideoRecording(); }}
            disabled={uploadingFile || isRecording}
            className={cn(
              "h-10 w-10 grid place-items-center rounded-lg transition-all disabled:opacity-50 select-none",
              isRecordingVideo ? "bg-red-500 text-white scale-110 animate-pulse" : "text-muted-foreground hover:bg-muted"
            )}
            aria-label="Mantener para grabar video"
            title="Mantener presionado para nota de video · Soltar para enviar"
          >
            <Video className="h-4 w-4" />
          </button>

          <Textarea
            value={draft}
            onChange={e => { setDraft(e.target.value); onTyping(); }}
            onKeyDown={onKeyDown}
            onPaste={handlePaste}
            placeholder={mode === "nota" ? "Escribe una nota interna (solo visible para el equipo)…" : "Escribe un mensaje al cliente… (Enter envía, Ctrl+V para pegar imágenes)"}
            rows={1}
            aria-label="Mensaje"
            className={cn(
              "flex-1 min-w-0 max-h-40 transition-colors",
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
      )}

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

      {/* Visor de imágenes a pantalla completa */}
      {previewImage && (
        <div 
          className="fixed inset-0 z-[9999] bg-black/90 flex items-center justify-center p-4 cursor-zoom-out animate-fade-in"
          onClick={() => setPreviewImage(null)}
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img 
            src={previewImage} 
            alt="Vista completa" 
            className="max-w-full max-h-full object-contain rounded-xl shadow-2xl transition-transform" 
          />
        </div>
      )}
    </div>
  );
}

function VideoNote({ url, type }: { url: string; type: string }) {
  const videoRef = React.useRef<HTMLVideoElement>(null);
  const [playing, setPlaying] = React.useState(false);

  function toggle() {
    const v = videoRef.current;
    if (!v) return;
    if (playing) { v.pause(); setPlaying(false); }
    else { v.play().catch(() => {}); setPlaying(true); }
  }

  function openFullscreen(e: React.MouseEvent) {
    e.stopPropagation();
    const v = videoRef.current as any;
    if (!v) return;
    const req = v.requestFullscreen || v.webkitRequestFullscreen || v.webkitEnterFullscreen;
    if (req) req.call(v);
    if (!playing) { v.play().catch(() => {}); setPlaying(true); }
  }

  return (
    <div className="relative mt-2 shrink-0" style={{ width: 160, height: 160 }}>
      <video
        ref={videoRef}
        preload="metadata"
        playsInline
        className="w-full h-full object-cover rounded-full bg-black"
        onEnded={() => setPlaying(false)}
        onClick={toggle}
      >
        <source src={url} type={type} />
      </video>
      {!playing && (
        <button
          onClick={toggle}
          className="absolute inset-0 flex items-center justify-center rounded-full bg-black/40 hover:bg-black/50 transition-colors"
        >
          <Play className="h-9 w-9 text-white ml-1" />
        </button>
      )}
      <button
        onClick={openFullscreen}
        title="Pantalla completa"
        className="absolute top-1 right-1 w-7 h-7 rounded-full bg-black/60 hover:bg-black/80 flex items-center justify-center text-white z-10"
      >
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M3 7V3h4M21 7V3h-4M3 17v4h4M21 17v4h-4"/></svg>
      </button>
    </div>
  );
}

function AudioPlayer({ url }: { url: string }) {
  const audioRef = React.useRef<HTMLAudioElement>(null);
  const [playing, setPlaying] = React.useState(false);
  const [progress, setProgress] = React.useState(0);
  const [duration, setDuration] = React.useState(0);

  function toggle() {
    const a = audioRef.current;
    if (!a) return;
    if (playing) { a.pause(); setPlaying(false); }
    else { a.play().catch(() => {}); setPlaying(true); }
  }

  function fmt(s: number) {
    if (!s || isNaN(s)) return "0:00";
    const m = Math.floor(s / 60), sec = Math.floor(s % 60);
    return `${m}:${sec.toString().padStart(2, "0")}`;
  }

  return (
    <div className="flex items-center gap-3 mt-2 px-3 py-2.5 rounded-2xl bg-white/15 backdrop-blur-sm border border-white/10 w-[260px]">
      <audio
        ref={audioRef}
        src={url}
        preload="metadata"
        onTimeUpdate={() => {
          const a = audioRef.current;
          if (a && a.duration) setProgress(a.currentTime / a.duration * 100);
        }}
        onLoadedMetadata={() => setDuration(audioRef.current?.duration || 0)}
        onEnded={() => { setPlaying(false); setProgress(0); }}
      />
      <button
        onClick={toggle}
        className="h-10 w-10 shrink-0 rounded-full bg-white/25 hover:bg-white/40 grid place-items-center transition-all hover:scale-105 active:scale-95 shadow-md"
      >
        {playing
          ? <Pause className="h-4 w-4" />
          : <Play className="h-4 w-4 ml-0.5" />}
      </button>
      <div className="flex-1 min-w-0 space-y-1.5">
        <div className="flex items-center gap-1.5">
          {[...Array(20)].map((_, i) => {
            const h = 4 + Math.sin(i * 1.7) * 3 + Math.sin(i * 0.9) * 2;
            const filled = (i / 20) * 100 <= progress;
            return (
              <div
                key={i}
                className={cn("w-1 rounded-full transition-colors shrink-0", filled ? "bg-white" : "bg-white/30")}
                style={{ height: `${h + 4}px` }}
              />
            );
          })}
        </div>
        <div className="flex justify-between items-center">
          <span className="text-[10px] font-medium opacity-70 flex items-center gap-1">
            <Mic className="h-2.5 w-2.5" /> Nota de voz
          </span>
          <span className="text-[10px] opacity-60">{fmt(duration)}</span>
        </div>
      </div>
    </div>
  );
}

function MediaPreview({ url, type, name, onImageClick }: { url: string; type?: string; name?: string; onImageClick?: (url: string) => void }) {
  if (!url) return null;
  const ext = (name || url).split("?")[0].split(".").pop()?.toLowerCase() ?? "";
  const audioExts = ["webm", "ogg", "mp3", "wav", "m4a", "aac", "opus"];
  const videoExts = ["mp4", "mov", "webm", "mkv"];
  const imageExts = ["jpg", "jpeg", "png", "gif", "webp", "svg"];
  // Si el type es genérico, inferir por extensión
  const isGeneric = !type || type === "application/octet-stream" || type === "application/octet-stream";
  const t = (!isGeneric ? type : "")
    || (audioExts.includes(ext) ? `audio/${ext === "mp3" ? "mpeg" : ext}` : "")
    || (videoExts.includes(ext) ? `video/${ext}` : "")
    || (imageExts.includes(ext) ? `image/${ext}` : "")
    || type
    || "";
  if (t.startsWith("image/")) {
    return (
      <div 
        onClick={() => onImageClick?.(url)} 
        className="block mt-1 cursor-pointer transition-transform hover:scale-[1.02] active:scale-[0.98]"
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={url} alt={name || "imagen"} className="max-w-[240px] max-h-48 rounded-lg object-cover border border-white/20 shadow-sm" />
      </div>
    );
  }
  if (t.startsWith("video/")) {
    const isNote = (name || url).includes("nota-video");
    if (isNote) return <VideoNote url={url} type={t} />;
    return <video src={url} controls className="max-w-[240px] rounded-lg mt-1" />;
  }
  if (t.startsWith("audio/")) {
    return <AudioPlayer url={url} />;
  }
  const Icon = ext === "xml" || ext === "csv" || ext === "txt" ? FileText
    : ext === "pdf" ? FileText : Download;
    
  const handleDownload = async (e: React.MouseEvent<HTMLAnchorElement>) => {
    e.preventDefault();
    try {
      const res = await fetch(url);
      const blob = await res.blob();
      const blobUrl = window.URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = blobUrl;
      a.download = name || "archivo";
      document.body.appendChild(a);
      a.click();
      a.remove();
      window.URL.revokeObjectURL(blobUrl);
    } catch (err) {
      window.open(url, "_blank");
    }
  };

  return (
    <a
      href={url} onClick={handleDownload} target="_blank" rel="noopener noreferrer" download={name}
      className="mt-1 inline-flex items-center gap-2 px-3 py-2 rounded-lg bg-white/15 hover:bg-white/25 transition-colors text-xs font-medium cursor-pointer"
    >
      <Icon className="h-4 w-4 shrink-0" />
      <span className="truncate max-w-[160px]">{name || "Archivo"}</span>
      <Download className="h-3 w-3 shrink-0 opacity-70" />
    </a>
  );
}

function Bubble({ m, clienteName, onImageClick, agentEmail, onMessageUpdate }: { 
  m: UnifiedMessage; 
  clienteName: string; 
  onImageClick?: (url: string) => void;
  agentEmail: string | null;
  onMessageUpdate?: (historyType: "histcliente" | "histtecnico", originalIndex: number, fieldsToUpdate: any) => void;
}) {
  const isCliente = m.source === "user";
  const isIA = m.source === "assistant";
  const isTecnico = m.source === "tecnico";
  const isNota = m.source === "nota";
  
  const [showEmojiPicker, setShowEmojiPicker] = React.useState(false);
  const [showDeleteMenu, setShowDeleteMenu] = React.useState(false);
  
  // Verificar si el mensaje está eliminado para el usuario actual
  const isDeletedForMe = m.deleted_for_me?.includes(agentEmail || "");
  const isDeletedForEveryone = m.deleted;

  // Emojis comunes
  const commonEmojis = ["👍", "❤️", "😂", "😮", "😢", "😡", "🎉", "🔥", "👏", "✅"];

  const handleReaction = async (emoji: string) => {
    const caseId = m.sourceCaseId;
    if (!agentEmail || m.originalIndex === undefined || !m.historyType || !caseId) {
      console.error("[Bubble] Datos faltantes para reacción", { agentEmail, originalIndex: m.originalIndex, historyType: m.historyType, caseId });
      return;
    }

    // Actualización local/optimista sin recargar pantalla
    const reactions = m.reactions || [];
    const existingReactionIndex = reactions.findIndex(
      (r: any) => r.emoji === emoji && r.author === agentEmail
    );
    let updatedReactions;
    if (existingReactionIndex >= 0) {
      updatedReactions = reactions.filter((_: any, i: number) => i !== existingReactionIndex);
    } else {
      updatedReactions = [
        ...reactions,
        { emoji, author: agentEmail, time: new Date().toISOString() }
      ];
    }

    if (onMessageUpdate) {
      onMessageUpdate(m.historyType, m.originalIndex, { reactions: updatedReactions });
    }
    setShowEmojiPicker(false);
    
    try {
      const res = await fetch(`/api/messages/${caseId}/${m.originalIndex}/reaction`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ emoji, author: agentEmail, historyType: m.historyType })
      });
      if (!res.ok) {
        // En caso de error, podríamos revertir, pero lo mantenemos simple e intuitivo
      }
    } catch (e) {
      console.error("Error al agregar reacción:", e);
    }
  };

  const handleDelete = async (deleteType: "for_everyone" | "for_me") => {
    const caseId = m.sourceCaseId;
    if (!agentEmail || m.originalIndex === undefined || !m.historyType || !caseId) {
      console.error("[Bubble] Datos faltantes para eliminar", { agentEmail, originalIndex: m.originalIndex, historyType: m.historyType, caseId });
      return;
    }

    // Actualización local/optimista sin recargar pantalla
    if (onMessageUpdate) {
      if (deleteType === "for_everyone") {
        onMessageUpdate(m.historyType, m.originalIndex, { deleted: true, content: "" });
      } else {
        const deletedForMe = m.deleted_for_me || [];
        onMessageUpdate(m.historyType, m.originalIndex, { deleted_for_me: [...deletedForMe, agentEmail] });
      }
    }
    setShowDeleteMenu(false);
    
    try {
      const res = await fetch(`/api/messages/${caseId}/${m.originalIndex}/delete`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ deleteType, author: agentEmail, historyType: m.historyType })
      });
      if (!res.ok) {
        // En caso de error, podríamos revertir o notificar
      }
    } catch (e) {
      console.error("Error al eliminar mensaje:", e);
    }
  };

  if (isDeletedForMe || isDeletedForEveryone) {
    // Mensaje eliminado - mostrar placeholder
    return (
      <div className={cn("flex animate-fade-in", isCliente ? "justify-start" : "justify-end")}>
        <div className={cn(
          "max-w-[85%] sm:max-w-[78%] rounded-2xl px-3.5 sm:px-4 py-2 shadow-sm bg-muted/50 text-muted-foreground text-sm italic"
        )}>
          {isDeletedForEveryone ? "Este mensaje fue eliminado" : "Eliminaste este mensaje"}
        </div>
      </div>
    );
  }

  if (isNota) {
    return (
      <div className="flex justify-center animate-fade-in">
        <div className="max-w-[85%] rounded-xl px-4 py-2 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 text-amber-800 dark:text-amber-200">
          <div className="flex items-center gap-1.5 text-[10px] font-semibold mb-0.5 opacity-75">
            <StickyNote className="h-3 w-3" /> Nota interna · {m.authorName || "Agente"}
          </div>
          <p className="whitespace-pre-wrap break-words text-sm leading-relaxed">{m.content}</p>
          <p className="text-[10px] mt-1 opacity-60 text-right" suppressHydrationWarning>{formatTime(m.time)}</p>
        </div>
      </div>
    );
  }

  return (
    <div className={cn("flex animate-fade-in group relative", isCliente ? "justify-start" : "justify-end")}>
      <div className={cn(
        "max-w-[85%] sm:max-w-[78%] rounded-2xl px-3.5 sm:px-4 py-2 shadow-sm relative",
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

        {m.mediaUrl && <MediaPreview url={m.mediaUrl} type={m.mediaType} name={m.fileName} onImageClick={onImageClick} />}
        
        {/* Contenido con detección de [SUGERENCIAS] */}
        <div className="text-sm leading-relaxed whitespace-pre-wrap break-words mt-1" suppressHydrationWarning>
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

        {/* Reacciones agrupadas por emoji */}
        {(() => {
          if (!m.reactions || m.reactions.length === 0) return null;
          
          // Agrupar reacciones por emoji
          const grouped: Record<string, { authors: string[]; emoji: string }> = {};
          for (const r of m.reactions) {
            if (!r || !r.emoji) continue;
            if (!grouped[r.emoji]) {
              grouped[r.emoji] = { authors: [], emoji: r.emoji };
            }
            if (r.author && !grouped[r.emoji].authors.includes(r.author)) {
              grouped[r.emoji].authors.push(r.author);
            }
          }

          const uniqueReactions = Object.values(grouped);
          if (uniqueReactions.length === 0) return null;

          // Si el bot reaccionó en nombre del agente (o viceversa), consolidarlo para que no se muestre duplicado
          const cleanedReactions = uniqueReactions.map(ur => {
            // Si tiene el agente e-mail y el número de bot, simplificar los autores
            const cleanedAuthors = ur.authors.filter(a => {
              // Si incluye el bot (ej. número de teléfono) y también tenemos el correo del agente real,
              // podemos quedarnos solo con el correo para una UI más limpia
              if (ur.authors.some(email => email.includes("@")) && !a.includes("@")) {
                return false;
              }
              return true;
            });
            return {
              ...ur,
              authors: cleanedAuthors.length > 0 ? cleanedAuthors : ur.authors
            };
          });

          return (
            <div className="flex flex-wrap gap-1 mt-2">
              {cleanedReactions.map((ur, idx) => (
                <span 
                  key={idx} 
                  className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs bg-white/20 hover:bg-white/30 cursor-pointer"
                  title={ur.authors.join(", ")}
                  onClick={() => handleReaction(ur.emoji)}
                >
                  {ur.emoji}
                  {ur.authors.length > 1 && (
                    <span className="opacity-70 font-semibold">{ur.authors.length}</span>
                  )}
                </span>
              ))}
            </div>
          );
        })()}

        <div className={cn(
          "flex items-center gap-2 text-[10px] mt-1",
          isCliente ? "text-muted-foreground" : "text-white/75 justify-end"
        )}>
          <span suppressHydrationWarning>{formatTime(m.time)}</span>
            {isTecnico && m.status === "pending" && (
            <svg className="h-3.5 w-3.5 opacity-50" viewBox="0 0 16 16" fill="currentColor"><path d="M13.5 4L6.5 11 3 7.5" stroke="currentColor" strokeWidth="1.8" fill="none" strokeLinecap="round" strokeLinejoin="round"/></svg>
          )}
          {isTecnico && m.status === "sent" && !m.read_at && (
            <span className="inline-flex opacity-70">
              <svg className="h-3.5 w-3.5 -mr-2" viewBox="0 0 16 16" fill="none"><path d="M2 8L6 12 14 4" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/></svg>
              <svg className="h-3.5 w-3.5" viewBox="0 0 16 16" fill="none"><path d="M2 8L6 12 14 4" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/></svg>
            </span>
          )}
          {isTecnico && m.read_at && (
            <span className="inline-flex text-blue-300">
              <svg className="h-3.5 w-3.5 -mr-2" viewBox="0 0 16 16" fill="none"><path d="M2 8L6 12 14 4" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/></svg>
              <svg className="h-3.5 w-3.5" viewBox="0 0 16 16" fill="none"><path d="M2 8L6 12 14 4" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/></svg>
            </span>
          )}
          {m.status === "error" && <span className="text-red-400">❌</span>}
        </div>

        {/* Botones de acción (hover) */}
        <div className={cn(
          "absolute top-1/2 -translate-y-1/2 flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity z-10",
          isCliente ? "left-full ml-2" : "right-full mr-2"
        )}>
          <button
            onClick={() => setShowEmojiPicker(!showEmojiPicker)}
            className="p-1.5 rounded-full bg-card border border-border shadow-sm hover:bg-muted"
            title="Reaccionar"
          >
            <Smile className="h-3.5 w-3.5" />
          </button>
          <button
            onClick={() => setShowDeleteMenu(!showDeleteMenu)}
            className="p-1.5 rounded-full bg-card border border-border shadow-sm hover:bg-muted text-red-500"
            title="Eliminar"
          >
            <Trash2 className="h-3.5 w-3.5" />
          </button>
        </div>

        {/* Emoji picker */}
        {showEmojiPicker && (
          <div className={cn(
            "absolute -top-16 bg-card border border-border rounded-xl shadow-xl p-2 flex flex-wrap gap-1 z-10",
            isCliente ? "left-0" : "right-0"
          )}>
            {commonEmojis.map(emoji => (
              <button
                key={emoji}
                onClick={() => handleReaction(emoji)}
                className="w-8 h-8 rounded-lg hover:bg-muted flex items-center justify-center text-lg"
              >
                {emoji}
              </button>
            ))}
          </div>
        )}

        {/* Menú de eliminación */}
        {showDeleteMenu && (
          <div className={cn(
            "absolute -top-20 bg-card border border-border rounded-xl shadow-xl p-2 flex flex-col gap-1 z-10 min-w-[140px]",
            isCliente ? "left-0" : "right-0"
          )}>
            <button
              onClick={() => handleDelete("for_me")}
              className="px-3 py-2 text-xs text-left hover:bg-muted rounded-lg"
            >
              Eliminar para mí
            </button>
            {isTecnico && (
              <button
                onClick={() => handleDelete("for_everyone")}
                className="px-3 py-2 text-xs text-left hover:bg-muted rounded-lg text-red-500"
              >
                Eliminar para todos
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
