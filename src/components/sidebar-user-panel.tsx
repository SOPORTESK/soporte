"use client";

import { useState, useRef, useEffect, useMemo, useCallback } from "react";
import { Camera, Lock, Eye, EyeOff, Check, X, ChevronUp, ChevronDown, ChevronLeft, Circle, LogOut, Activity as ActivityIcon, FileText, ChevronRight, X as XIcon, RefreshCw, Wrench, Coffee, Timer, BarChart3, Package, LayoutDashboard, ClipboardList, Sparkles, UserPlus, Briefcase, GraduationCap, Users, Utensils, Sandwich, Bath, Square, Trash2, Clock, CheckCircle2, Calendar, Maximize2, Minimize2, Plus, UserCheck, Save, MessageSquare, Search, Play, Layers } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { logActivity } from "@/lib/activity-client";
import { ModalMyActivity } from "@/components/modal-my-activity";
import { ModalAgenda } from "@/components/modal-agenda";
import { AgendaEvent, AgendaTask } from "@/app/api/agenda/route";
import { InternalChatView } from "@/components/internal-chat/internal-chat-view";
import { buildDirectChannelId } from "@/lib/internal-chat-types";

interface Agent {
  email: string;
  nombre: string | null;
  apellido: string | null;
  rol: string;
  avatar_url?: string | null;
  status?: string | null;
  phone?: string | null;
}

interface OnlineAgent {
  email: string;
  nombre: string | null;
  apellido: string | null;
  avatar_url?: string | null;
  status?: string | null;
  rol?: string | null;
}

const STATUS_LABELS: Record<string, { label: string; color: string; icon?: string }> = {
  online:  { label: "En línea",                 color: "bg-emerald-500" },
  away:    { label: "Ausente",                  color: "bg-amber-400" },
  busy:    { label: "Ocupado (Atendiendo)",    color: "bg-rose-500" },
  offline: { label: "Desconectado",             color: "bg-gray-400" },
};

const IDLE_TIMEOUT_MS = 15 * 60 * 1000; // 15 minutos (tolerancia de taller)

function getTaskIcon(name: string) {
  const lower = (name || "").toLowerCase();
  if (lower.includes("bodega")) return Package;
  if (lower.includes("exhibidor")) return LayoutDashboard;
  if (lower.includes("inventario")) return ClipboardList;
  if (lower.includes("limpieza") || lower.includes("orden")) return Sparkles;
  if (lower.includes("residuo") || lower.includes("desecho") || lower.includes("reciclaj") || lower.includes("disposici")) return Trash2;
  if (lower.includes("ventanilla") || lower.includes("mostrador")) return UserPlus;
  if (lower.includes("diagnóstico") || lower.includes("diagnostico") || lower.includes("repara")) return Wrench;
  if (lower.includes("venta")) return Briefcase;
  if (lower.includes("capacita") || lower.includes("inducci") || lower.includes("entrena") || lower.includes("curso") || lower.includes("autoaprendizaje")) return GraduationCap;
  if (lower.includes("descanso") || lower.includes("almuerzo") || lower.includes("comida")) return Sandwich;
  if (lower.includes("sanitaria") || lower.includes("baño") || lower.includes("bano")) return Bath;
  if (lower.includes("reunión") || lower.includes("reunion") || lower.includes("charla")) return Users;
  if (lower.includes("correo") || lower.includes("mail")) return FileText;
  if (lower.includes("reloj") || lower.includes("pausa")) return Clock;
  return Timer;
}

function getCategoryIcon(name: string) {
  const lower = (name || "").toLowerCase();
  if (lower.includes("soporte") || lower.includes("atención")) return Briefcase;
  if (lower.includes("servicio") || lower.includes("taller") && lower.includes("servicio")) return Wrench;
  if (lower.includes("control") || lower.includes("admin")) return ClipboardList;
  if (lower.includes("gestión del taller") || lower.includes("bodega")) return Package;
  if (lower.includes("residuo") || lower.includes("desecho") || lower.includes("reciclaj")) return Trash2;
  if (lower.includes("pausa") || lower.includes("descanso") || lower.includes("almuerzo")) return Sandwich;
  if (lower.includes("limpieza")) return Sparkles;
  if (lower.includes("capacita") || lower.includes("ojt")) return GraduationCap;
  return LayoutDashboard;
}

interface ManualTaskItem {
  label: string;
  short: string;
  category: string;
  subcategory?: string;
  icon: any;
}

const TAREAS_GROUPED: { group: string; color?: string; items: ManualTaskItem[] }[] = [
  {
    group: "Gestión del Taller",
    items: [
      { label: "Ir a Bodega", short: "Bodega", category: "Gestión del Taller", icon: Package },
      { label: "Exhibidores", short: "Exhibidores", category: "Gestión del Taller", icon: LayoutDashboard },
      { label: "Inventario y Actualización de Bodega GAR", short: "Inventario GAR", category: "Gestión del Taller", icon: ClipboardList },
      { label: "Limpieza de taller", short: "Limpieza", category: "Gestión del Taller", icon: Sparkles },
    ]
  },
  {
    group: "Servicio de Taller",
    items: [
      { label: "Iniciar Diagnóstico Físico", short: "Diagnóstico", category: "Servicio de Taller", icon: Wrench },
      { label: "Gestión de Residuos", short: "Residuos", category: "Gestión de Residuos", icon: Trash2 },
    ]
  },
  {
    group: "Soporte",
    items: [
      { label: "Ir a Ventanilla", short: "Ventanilla", category: "Soporte", icon: UserPlus },
      { label: "Soporte a Ventas", short: "Soporte Ventas", category: "Soporte", icon: Briefcase },
      { label: "Capacitacion de clientes", short: "Capacitar Cliente", category: "On-the-Job Training (OJT)", icon: GraduationCap },
      { label: "Reunión", short: "Reunión", category: "Control Administrativo", icon: Users },
    ]
  },
  {
    group: "Descansos",
    items: [
      { label: "Tiempo de Descanso", short: "Descanso", category: "Descansos", icon: Sandwich },
      { label: "Almuerzo", short: "Almuerzo", category: "Descansos", icon: Sandwich },
    ]
  },
  {
    group: "Pausa Sanitaria",
    items: [
      { label: "Pausa Sanitaria", short: "Pausa Sanitaria", category: "Pausa Sanitaria", icon: Bath },
      { label: "Baño", short: "Baño", category: "Pausa Sanitaria", icon: Bath },
    ]
  }
];

const MACRO_COLOR_PALETTE = [
  {
    bg: "bg-orange-500/15",
    border: "border-orange-500/40",
    hover: "hover:bg-orange-500/25 hover:border-orange-500/70",
    text: "text-orange-950 dark:text-orange-200",
    iconBg: "bg-orange-500/25 text-orange-600 dark:text-orange-300 border-orange-500/40",
  },
  {
    bg: "bg-sky-500/15",
    border: "border-sky-500/40",
    hover: "hover:bg-sky-500/25 hover:border-sky-500/70",
    text: "text-sky-950 dark:text-sky-200",
    iconBg: "bg-sky-500/25 text-sky-600 dark:text-sky-300 border-sky-500/40",
  },
  {
    bg: "bg-emerald-500/15",
    border: "border-emerald-500/40",
    hover: "hover:bg-emerald-500/25 hover:border-emerald-500/70",
    text: "text-emerald-950 dark:text-emerald-200",
    iconBg: "bg-emerald-500/25 text-emerald-600 dark:text-emerald-300 border-emerald-500/40",
  },
  {
    bg: "bg-cyan-500/15",
    border: "border-cyan-500/40",
    hover: "hover:bg-cyan-500/25 hover:border-cyan-500/70",
    text: "text-cyan-950 dark:text-cyan-200",
    iconBg: "bg-cyan-500/25 text-cyan-600 dark:text-cyan-300 border-cyan-500/40",
  },
  {
    bg: "bg-purple-500/15",
    border: "border-purple-500/40",
    hover: "hover:bg-purple-500/25 hover:border-purple-500/70",
    text: "text-purple-950 dark:text-purple-200",
    iconBg: "bg-purple-500/25 text-purple-600 dark:text-purple-300 border-purple-500/40",
  },
  {
    bg: "bg-rose-500/15",
    border: "border-rose-500/40",
    hover: "hover:bg-rose-500/25 hover:border-rose-500/70",
    text: "text-rose-950 dark:text-rose-200",
    iconBg: "bg-rose-500/25 text-rose-600 dark:text-rose-300 border-rose-500/40",
  },
  {
    bg: "bg-amber-500/15",
    border: "border-amber-500/40",
    hover: "hover:bg-amber-500/25 hover:border-amber-500/70",
    text: "text-amber-950 dark:text-amber-200",
    iconBg: "bg-amber-500/25 text-amber-600 dark:text-amber-300 border-amber-500/40",
  },
  {
    bg: "bg-indigo-500/15",
    border: "border-indigo-500/40",
    hover: "hover:bg-indigo-500/25 hover:border-indigo-500/70",
    text: "text-indigo-950 dark:text-indigo-200",
    iconBg: "bg-indigo-500/25 text-indigo-600 dark:text-indigo-300 border-indigo-500/40",
  },
  {
    bg: "bg-teal-500/15",
    border: "border-teal-500/40",
    hover: "hover:bg-teal-500/25 hover:border-teal-500/70",
    text: "text-teal-950 dark:text-teal-200",
    iconBg: "bg-teal-500/25 text-teal-600 dark:text-teal-300 border-teal-500/40",
  },
  {
    bg: "bg-pink-500/15",
    border: "border-pink-500/40",
    hover: "hover:bg-pink-500/25 hover:border-pink-500/70",
    text: "text-pink-950 dark:text-pink-200",
    iconBg: "bg-pink-500/25 text-pink-600 dark:text-pink-300 border-pink-500/40",
  },
];

function AvatarImg({ url, name, size = 36 }: { url?: string | null; name?: string | null; size?: number }) {
  const safeName = (typeof name === "string" ? name : "").trim() || "Usuario";
  const initials = safeName
    .split(/\s+/)
    .filter(Boolean)
    .map(w => w[0])
    .slice(0, 2)
    .join("")
    .toUpperCase() || "U";
  const colors = ["bg-violet-500", "bg-indigo-500", "bg-sky-500", "bg-emerald-500", "bg-amber-500", "bg-rose-500"];
  const color = colors[safeName.charCodeAt(0) % colors.length];

  if (url) {
    return <img src={url} alt={safeName} style={{ width: size, height: size }} className="rounded-full object-cover ring-2 ring-border" />;
  }
  return (
    <div style={{ width: size, height: size, fontSize: size * 0.35 }} className={`${color} rounded-full flex items-center justify-center text-white font-bold shrink-0`}>
      {initials}
    </div>
  );
}

export function SidebarUserPanel({ 
  agent, 
  onlineAgents, 
  canViewActivityTracker,
  canViewAgenda = true,
}: { 
  agent: Agent; 
  onlineAgents: OnlineAgent[]; 
  canViewActivityTracker?: boolean; 
  canViewAgenda?: boolean;
}) {
  const safeAgent: Agent = {
    nombre: agent?.nombre ?? null,
    apellido: agent?.apellido ?? null,
    phone: agent?.phone ?? null,
    avatar_url: agent?.avatar_url ?? null,
    status: agent?.status ?? "online",
    rol: agent?.rol || "tecnico",
    email: agent?.email || "agente@sekunet.com",
  };
  const canAccessAdmin = ["admin", "superadmin"].includes(safeAgent.rol);
  const hasActivityAccess = canViewActivityTracker !== undefined ? canViewActivityTracker : canAccessAdmin;
  const [open, setOpen] = useState(false);
  const [tab, setTab] = useState<"profile" | "team" | "activity" | "agenda">("profile");
  const [showAgendaModal, setShowAgendaModal] = useState(false);
  const [panelAgendaEvents, setPanelAgendaEvents] = useState<AgendaEvent[]>([]);
  const [panelAgendaTasks, setPanelAgendaTasks] = useState<AgendaTask[]>([]);
  const [panelAgendaTab, setPanelAgendaTab] = useState<"tasks" | "events">("tasks");
  const [newQuickTaskTitle, setNewQuickTaskTitle] = useState("");
  const [creatingQuickTask, setCreatingQuickTask] = useState(false);
  const [status, setStatus] = useState(safeAgent.status === "busy" ? "busy" : "online");
  const statusRef = useRef(status);
  useEffect(() => {
    statusRef.current = status;
  }, [status]);

  // Tolerancia oficial de inactividad configurada por los administradores (en minutos)
  const [toleranceMin, setToleranceMin] = useState<number>(15);

  useEffect(() => {
    fetch("/api/activity/schedule")
      .then((r) => r.json())
      .then((data) => {
        if (data?.toleranceMinutes && Number(data.toleranceMinutes) > 0) {
          setToleranceMin(Number(data.toleranceMinutes));
        }
      })
      .catch(() => {});
  }, []);

  const [avatarUrl, setAvatarUrl] = useState(safeAgent.avatar_url || null);
  const [uploadingAvatar, setUploadingAvatar] = useState(false);
  const [showPwd, setShowPwd] = useState(false);
  const [pwd, setPwd] = useState("");
  const [pwd2, setPwd2] = useState("");
  const [showPwdVal, setShowPwdVal] = useState(false);
  const [showPwd2Val, setShowPwd2Val] = useState(false);
  const [savingPwd, setSavingPwd] = useState(false);
  const [profileNombre, setProfileNombre] = useState(safeAgent.nombre || "");
  const [profileApellido, setProfileApellido] = useState(safeAgent.apellido || "");
  const [savingProfile, setSavingProfile] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const router = useRouter();
  const supabase = useMemo(() => createClient(), []);
  const fullName = [profileNombre || safeAgent.nombre, profileApellido || safeAgent.apellido].filter(Boolean).join(" ") || safeAgent.email || "Usuario";

  // Gestión de agentes del equipo en tiempo real (para reflejar estados y ocultar desconectados)
  const [teamAgents, setTeamAgents] = useState<OnlineAgent[]>(() => onlineAgents || []);

  useEffect(() => {
    if (Array.isArray(onlineAgents) && onlineAgents.length > 0) {
      setTeamAgents((prev) => {
        const map = new Map<string, OnlineAgent>();
        onlineAgents.forEach(a => { if (a?.email) map.set(a.email.toLowerCase(), a); });
        prev.forEach(a => { if (a?.email && !map.has(a.email.toLowerCase())) map.set(a.email.toLowerCase(), a); });
        return Array.from(map.values());
      });
    }
  }, [onlineAgents]);

  useEffect(() => {
    const fetchTeam = async () => {
      try {
        const { data, error } = await supabase
          .from("sek_agent_config")
          .select("email, nombre, apellido, avatar_url, status, last_seen_at, rol")
          .not("rol", "in", "(bot,sistema)")
          .not("email", "in", "(technician_assistant@sekunet.com,whatsapp_agent@sekunet.com,system_prompt@sekunet.com)");
        if (!error && Array.isArray(data)) {
          setTeamAgents(data);
        }
      } catch {}
    };

    fetchTeam();
    const teamInterval = setInterval(fetchTeam, 15000);

    const agentChannel = supabase
      .channel("sidebar_team_agents_realtime")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "sek_agent_config" },
        (payload: any) => {
          const updated = payload.new as any;
          if (!updated || !updated.email) return;
          setTeamAgents((prev) => {
            const emailLower = updated.email.toLowerCase();
            const existingIdx = prev.findIndex(a => a.email.toLowerCase() === emailLower);
            if (existingIdx >= 0) {
              const copy = [...prev];
              copy[existingIdx] = { ...copy[existingIdx], ...updated };
              return copy;
            } else {
              return [...prev, updated];
            }
          });
        }
      )
      .subscribe();

    return () => {
      clearInterval(teamInterval);
      supabase.removeChannel(agentChannel);
    };
  }, [supabase]);

  // Conteo de casos abiertos en atención para auto-activar estado "Ocupado" (Rojo)
  const [activeChatsCount, setActiveChatsCount] = useState<number>(0);
  const activeChatsRef = useRef<number>(0);
  useEffect(() => {
    activeChatsRef.current = activeChatsCount;
  }, [activeChatsCount]);

  useEffect(() => {
    if (!safeAgent.email) return;

    const checkActiveChats = async () => {
      try {
        const { count, error } = await supabase
          .from("sek_cases")
          .select("id", { count: "exact", head: true })
          .ilike("assigned_to", safeAgent.email)
          .eq("estado", "abierto");

        if (error) return;
        const currentCount = count || 0;
        setActiveChatsCount(currentCount);

        // Si el agente tiene chats abiertos asignados:
        // Debe estar en "busy" (Rojo: Ocupado - Atendiendo clientes), excepto si está en "away" o "offline"
        if (currentCount > 0) {
          if (statusRef.current === "online") {
            setStatus("busy");
            fetch("/api/profile/status", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ status: "busy", email: safeAgent.email }),
            }).catch(() => {});
          }
        } else {
          // Si ya no tiene chats abiertos asignados (count === 0) y estaba en "busy":
          // Regresa automáticamente a "online" (Verde: En línea)
          if (statusRef.current === "busy") {
            setStatus("online");
            fetch("/api/profile/status", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ status: "online", email: safeAgent.email }),
            }).catch(() => {});
          }
        }
      } catch {}
    };

    let debounceTimer: any = null;
    const debouncedCheck = () => {
      if (debounceTimer) clearTimeout(debounceTimer);
      debounceTimer = setTimeout(checkActiveChats, 2500);
    };

    checkActiveChats();
    const interval = setInterval(checkActiveChats, 25000);

    const casesChannel = supabase
      .channel("sidebar_active_chats_realtime")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "sek_cases" },
        debouncedCheck
      )
      .subscribe();

    return () => {
      if (debounceTimer) clearTimeout(debounceTimer);
      clearInterval(interval);
      supabase.removeChannel(casesChannel);
    };
  }, [safeAgent.email, supabase]);

  useEffect(() => {
    if (safeAgent.nombre !== undefined) setProfileNombre(safeAgent.nombre || "");
    if (safeAgent.apellido !== undefined) setProfileApellido(safeAgent.apellido || "");
  }, [safeAgent.nombre, safeAgent.apellido]);

  const handleSaveProfile = async () => {
    if (!safeAgent.email) return;
    setSavingProfile(true);
    try {
      const { error } = await supabase
        .from("sek_agent_config")
        .update({ nombre: profileNombre.trim(), apellido: profileApellido.trim() })
        .ilike("email", safeAgent.email);
      if (error) throw error;
      toast.success("Perfil actualizado con éxito");
      router.refresh();
    } catch (e: any) {
      toast.error(e.message || "Error al actualizar perfil");
    } finally {
      setSavingProfile(false);
    }
  };

  // ── ESTADOS DE MENSAJERÍA INTERNA (DIRECTOS Y GRUPAL) ──
  const [selectedChat, setSelectedChat] = useState<{
    channelId: string;
    channelName: string;
    channelAvatar?: string | null;
    channelStatus?: string | null;
    isGroup?: boolean;
  } | null>(null);
  const [chatUnreadCounts, setChatUnreadCounts] = useState<Record<string, number>>({});
  const [totalChatUnread, setTotalChatUnread] = useState<number>(0);
  const [teamChatExpanded, setTeamChatExpanded] = useState<boolean>(false);

  // Popup flotante en el centro superior (6 segundos de duración, 100% visual)
  const [incomingPopup, setIncomingPopup] = useState<{
    channelId: string;
    senderName: string;
    senderAvatar?: string | null;
    content: string;
    isGroup: boolean;
    channelStatus?: string | null;
  } | null>(null);
  const popupTimerRef = useRef<any>(null);

  const chatUnreadCountsRef = useRef<Record<string, number>>({});
  const totalChatUnreadRef = useRef<number>(0);

  const triggerIncomingAlert = useCallback((data: {
    channelId: string;
    senderName: string;
    senderAvatar?: string | null;
    content?: string;
    mediaUrl?: string | null;
    isGroup?: boolean;
    channelStatus?: string | null;
  }) => {
    // Alerta puramente visual (sin sonido)
    try {
      (window as any).electronAPI?.notificarMensajeInterno?.({
        channelId: data.channelId,
        senderName: data.senderName,
        content: data.content || (data.mediaUrl ? "📎 Archivo adjunto" : ""),
        isGroup: data.isGroup || data.channelId === "group_general",
      });
    } catch {}

    if (popupTimerRef.current) clearTimeout(popupTimerRef.current);
    setIncomingPopup({
      channelId: data.channelId,
      senderName: data.senderName,
      senderAvatar: data.senderAvatar,
      content: data.content || (data.mediaUrl ? "📎 Archivo adjunto" : "Nuevo mensaje interno"),
      isGroup: data.isGroup || data.channelId === "group_general",
      channelStatus: data.channelStatus,
    });
    popupTimerRef.current = setTimeout(() => {
      setIncomingPopup(null);
    }, 6000);
  }, []);

  const loadChatConversations = useCallback(async () => {
    try {
      const res = await fetch("/api/internal-chat/conversations");
      const data = await res.json();
      if (data.success && Array.isArray(data.conversations)) {
        const counts: Record<string, number> = {};
        for (const c of data.conversations) {
          counts[c.channelId] = c.unreadCount || 0;
        }
        const newTotal = Number(data.totalUnread || 0);

        // Comparación estricta para evitar re-renders y parpadeos innecesarios
        const prevCounts = chatUnreadCountsRef.current;
        const prevKeys = Object.keys(prevCounts);
        const newKeys = Object.keys(counts);
        const hasCountsChanged =
          prevKeys.length !== newKeys.length ||
          newKeys.some((k) => prevCounts[k] !== counts[k]);

        if (hasCountsChanged) {
          chatUnreadCountsRef.current = counts;
          setChatUnreadCounts(counts);
        }

        if (totalChatUnreadRef.current !== newTotal) {
          const prevTotal = totalChatUnreadRef.current;
          totalChatUnreadRef.current = newTotal;
          setTotalChatUnread(newTotal);

          // Si incrementó el conteo de no leídos por polling, alerta visual en desktop
          if (newTotal > prevTotal && prevTotal > 0) {
            try {
              (window as any).electronAPI?.notificarMensajeInterno?.({
                channelId: "group_general",
                senderName: "Equipo Sekunet",
                content: `Tienes ${newTotal} mensajes internos sin leer`,
                isGroup: true,
              });
            } catch {}
          }
        }
      }
    } catch {}
  }, []);

  useEffect(() => {
    loadChatConversations();
    // Polling ligero de respaldo (cada 45s), no satura la BD ni ralentiza la navegación
    // Los mensajes en vivo se reciben instantáneamente mediante Supabase Realtime
    const pollInterval = setInterval(loadChatConversations, 45000);

    const handleFocus = () => loadChatConversations();
    window.addEventListener("focus", handleFocus);

    const ch = supabase.channel("sek_internal_chat");
    ch.on("broadcast", { event: "new_internal_message" }, ({ payload }) => {
      const msg = payload as any;
      if (msg) {
        if (!selectedChat || selectedChat.channelId !== msg.channelId) {
          if (msg.senderEmail?.toLowerCase() !== (safeAgent.email || "").toLowerCase()) {
            setChatUnreadCounts((prev) => ({
              ...prev,
              [msg.channelId]: (prev[msg.channelId] || 0) + 1,
            }));
            setTotalChatUnread((prev) => prev + 1);

            triggerIncomingAlert({
              channelId: msg.channelId,
              senderName: msg.senderName,
              senderAvatar: msg.senderAvatar,
              content: msg.content,
              mediaUrl: msg.mediaUrl,
              isGroup: msg.channelId === "group_general" || msg.isGroup,
            });
          }
        }
        loadChatConversations();
      }
    }).subscribe();

    return () => {
      clearInterval(pollInterval);
      window.removeEventListener("focus", handleFocus);
      supabase.removeChannel(ch);
      if (popupTimerRef.current) clearTimeout(popupTimerRef.current);
    };
  }, [loadChatConversations, selectedChat, safeAgent.email, supabase, triggerIncomingAlert]);

  const openInternalChat = (channelId: string, name: string, avatar?: string | null, status?: string | null, isGroup = false) => {
    setSelectedChat({ channelId, channelName: name, channelAvatar: avatar, channelStatus: status, isGroup });
    setChatUnreadCounts((prev) => {
      const copy = { ...prev };
      const current = copy[channelId] || 0;
      delete copy[channelId];
      setTotalChatUnread((t) => Math.max(0, t - current));
      return copy;
    });
  };

  const [myMetrics, setMyMetrics] = useState<any>(null);
  const [showActivityModal, setShowActivityModal] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [lastUpdate, setLastUpdate] = useState<Date | null>(null);
  const [elapsed, setElapsed] = useState("");
  const [manualTask, setManualTask] = useState<{ type: string; label: string; subcategory?: string; start: number } | null>(() => {
    if (typeof window === "undefined") return null;
    try {
      const saved = localStorage.getItem("sekunet_manual_task");
      return saved ? JSON.parse(saved) : null;
    } catch {
      return null;
    }
  });
  const [manualElapsed, setManualElapsed] = useState("");

  // Categorías dinámicas sincronizadas con "Gestionar Categorías"
  const [categoriesConfig, setCategoriesConfig] = useState<any[]>(() => {
    if (typeof window === "undefined") return [];
    try {
      const saved = localStorage.getItem("sek_categories_list");
      return saved ? JSON.parse(saved) : [];
    } catch {
      return [];
    }
  });

  const [appMappingsConfig, setAppMappingsConfig] = useState<Record<string, any>>(() => {
    if (typeof window === "undefined") return {};
    try {
      const saved = localStorage.getItem("sek_app_categories");
      return saved ? JSON.parse(saved) : {};
    } catch {
      return {};
    }
  });

  useEffect(() => {
    const loadCategories = () => {
      fetch("/api/activity/app-categories")
        .then((r) => r.json())
        .then((data) => {
          if (Array.isArray(data?.categories) && data.categories.length > 0) {
            setCategoriesConfig(data.categories);
            try {
              localStorage.setItem("sek_categories_list", JSON.stringify(data.categories));
            } catch {}
          }
          if (data?.appMappings && typeof data.appMappings === "object") {
            setAppMappingsConfig(data.appMappings);
            try {
              localStorage.setItem("sek_app_categories", JSON.stringify(data.appMappings));
            } catch {}
          }
        })
        .catch(() => {});
    };

    loadCategories();
    const handleUpdate = () => loadCategories();
    window.addEventListener("sekunet_categories_updated", handleUpdate);
    window.addEventListener("storage", handleUpdate);
    return () => {
      window.removeEventListener("sekunet_categories_updated", handleUpdate);
      window.removeEventListener("storage", handleUpdate);
    };
  }, []);

  useEffect(() => {
    if (tab === "agenda" || open) {
      fetch("/api/agenda")
        .then((r) => r.json())
        .then((d) => {
          if (Array.isArray(d?.events)) setPanelAgendaEvents(d.events);
          if (Array.isArray(d?.tasks)) setPanelAgendaTasks(d.tasks);
        })
        .catch(() => {});
    }
  }, [tab, open]);

  const taskGroups = useMemo(() => {
    if (!categoriesConfig || categoriesConfig.length === 0) {
      return TAREAS_GROUPED;
    }

    const isSoftwareOrUrl = (name: string) => {
      const n = name.trim().toLowerCase();
      if (n.startsWith("http://") || n.startsWith("https://") || n.startsWith("web:") || n.startsWith("web.")) return true;
      if (n.includes(".") && !n.endsWith(".exe") && (n.includes(".com") || n.includes(".org") || n.includes(".net") || n.includes(".io") || n.includes(".app") || n.includes(".co") || n.includes(".es") || n.includes(".la"))) {
        return true;
      }
      if (n.endsWith(".exe") || n.endsWith(".dll") || n.endsWith(".bat")) return true;
      if (["odoo erp", "nextime pro", "linkus", "seka chat", "whatsapp", "anydesk", "teamviewer", "chrome", "firefox", "edge", "explorer"].some(soft => n.includes(soft))) {
        return true;
      }
      return false;
    };

    const groups: {
      group: string;
      color?: string;
      items: { label: string; short: string; category: string; subcategory?: string; icon: any }[];
    }[] = [];

    for (const cat of categoriesConfig) {
      let subs: string[] = Array.isArray(cat.subcategories) ? [...cat.subcategories] : [];
      if (subs.length === 0) continue;

      const catLower = (cat.id || cat.label || "").toLowerCase();
      const isBreakCat = catLower.includes("descanso") || catLower.includes("pausa") || catLower.includes("sanitaria");

      const catItems: { label: string; short: string; category: string; subcategory?: string; icon: any }[] = [];
      const seenLabels = new Set<string>();

      for (const sub of subs) {
        if (!sub) continue;
        const isSubManual = /\(manual\)/i.test(sub) || /manual/i.test(sub) || cat.is_manual || isBreakCat;
        const sLower = sub.toLowerCase();
        const isMeeting = (sLower === "reunión" || sLower === "reuniones" || sLower === "reuniones y charlas");

        if (!isSubManual && !isMeeting) continue;

        const cleanSub = sub.replace(/\s*\(manual\)\s*/i, "").trim();

        // Buscar todas las tareas asociadas a esta subcategoría en appMappingsConfig
        const associatedTasks: string[] = [];
        if (appMappingsConfig && typeof appMappingsConfig === "object") {
          for (const [appName, val] of Object.entries(appMappingsConfig)) {
            const valCat = typeof val === "object" ? val?.category : val;
            const valSub = typeof val === "object" ? val?.subcategory : null;

            const catMatches = (valCat === cat.id || valCat === cat.label);
            if (!catMatches) continue;

            const cleanValSub = (valSub || "").replace(/\s*\(manual\)\s*/i, "").trim();
            const subMatches = valSub === sub || cleanValSub.toLowerCase() === cleanSub.toLowerCase();

            if (subMatches) {
              if (!isSoftwareOrUrl(appName)) {
                associatedTasks.push(appName.trim());
              }
            }
          }
        }

        if (associatedTasks.length > 0) {
          // Si tiene tareas específicas asociadas (ej: Atención en Ventanilla, Soporte a Ventas, etc.)
          for (const taskName of associatedTasks) {
            if (!seenLabels.has(taskName)) {
              seenLabels.add(taskName);
              catItems.push({
                label: taskName,
                short: taskName,
                category: cat.label || cat.id,
                subcategory: cleanSub,
                icon: getTaskIcon(taskName),
              });
            }
          }
        } else {
          // Si no tiene tareas hijas adicionales, el botón directo es la subcategoría
          if (!seenLabels.has(cleanSub)) {
            seenLabels.add(cleanSub);
            catItems.push({
              label: cleanSub,
              short: cleanSub,
              category: cat.label || cat.id,
              subcategory: cleanSub,
              icon: getTaskIcon(cleanSub),
            });
          }
        }
      }

      if (catItems.length > 0) {
        groups.push({
          group: cat.label || cat.id,
          color: cat.color,
          items: catItems,
        });
      }
    }

    return groups.length > 0 ? groups : TAREAS_GROUPED;
  }, [categoriesConfig, appMappingsConfig]);

  const [drillCategory, setDrillCategory] = useState<string | null>(null);
  const [manualSearchQuery, setManualSearchQuery] = useState<string>("");

  const totalAvailableTasks = useMemo(() => {
    return taskGroups.reduce((acc, g) => acc + g.items.length, 0);
  }, [taskGroups]);

  // Búsqueda global si el usuario escribe en el buscador rápido
  const searchResults = useMemo(() => {
    const q = (manualSearchQuery || "").trim().toLowerCase();
    if (!q) return [];
    return taskGroups.flatMap((g) => g?.items || []).filter(
      (item) =>
        (item?.label || "").toLowerCase().includes(q) ||
        (item?.subcategory ? String(item.subcategory).toLowerCase().includes(q) : false) ||
        (item?.category ? String(item.category).toLowerCase().includes(q) : false)
    );
  }, [taskGroups, manualSearchQuery]);

  // Labores de la categoría seleccionada en la vista Drill-down
  const drillItems = useMemo(() => {
    if (!drillCategory) return [];
    if (drillCategory === "all") {
      return taskGroups.flatMap((g) => g?.items || []);
    }
    const targetCat = (drillCategory || "").toLowerCase();
    const found = taskGroups.find((g) => (g?.group || "").toLowerCase() === targetCat);
    return found ? found.items || [] : [];
  }, [taskGroups, drillCategory]);

  useEffect(() => {
    if (tab === "activity" && !hasActivityAccess) {
      setTab("profile");
    }
  }, [hasActivityAccess, tab]);

  // Sincronización robusta y bidireccional de labor manual (Electron <-> Pestañas <-> Localhost):
  // 1) Lee localStorage al montar
  // 2) Sincroniza entre pestañas locales vía 'storage'
  // 3) Sincroniza en tiempo real entre apps (Desktop y Web) vía Supabase Broadcast
  // 4) Verifica con el timeline del servidor al montar, al recibir foco (focus) o al cambiar de pestaña (visibilitychange)
  useEffect(() => {
    // 1) Carga inicial de localStorage si es reciente (< 10h)
    let currentTask: { type: string; label: string; subcategory?: string; start: number } | null = null;
    try {
      const saved = localStorage.getItem("sekunet_manual_task");
      if (saved) {
        const parsed = JSON.parse(saved);
        if (Date.now() - parsed.start < 10 * 60 * 60 * 1000) {
          currentTask = parsed;
          setManualTask(parsed);
        } else {
          localStorage.removeItem("sekunet_manual_task");
        }
      }
    } catch {}

    // 2) Sincronización entre pestañas en el mismo origen
    const handleStorage = (e: StorageEvent) => {
      if (e.key === "sekunet_manual_task") {
        if (e.newValue) {
          try {
            setManualTask(JSON.parse(e.newValue));
          } catch {}
        } else {
          setManualTask(null);
          setManualElapsed("");
        }
      }
    };
    window.addEventListener("storage", handleStorage);

    // 3) Canal Supabase Broadcast para sincronización instantánea entre Electron y Navegador
    const syncChannel = supabase
      .channel(`sek_manual_task_sync_${agent.email}`)
      .on("broadcast", { event: "manual_task_change" }, (payload: any) => {
        const data = payload?.payload;
        if (!data) return;
        if (data.action === "stop") {
          setManualTask(null);
          setManualElapsed("");
          try { localStorage.removeItem("sekunet_manual_task"); } catch {}
        } else if (data.action === "start" && data.task) {
          setManualTask(data.task);
          try { localStorage.setItem("sekunet_manual_task", JSON.stringify(data.task)); } catch {}
        }
      })
      .subscribe();

    // 4) Verificación autoritativa con el servidor (detecta si se finalizó en otra instancia)
    const checkServerTimeline = async () => {
      if (!agent.email) return;
      try {
        const today = new Date().toISOString().split("T")[0];
        const res = await fetch(`/api/activity/timeline?agent=${encodeURIComponent(agent.email)}&date=${today}&lastMinutes=180&_t=${Date.now()}`);
        if (!res.ok) return;
        const data = await res.json();
        if (data?.timeline && Array.isArray(data.timeline)) {
          const sorted = [...data.timeline].filter((t: any) => Boolean(t.created_at));
          // Buscar el último registro manual (sea Inició o Terminó)
          const lastManual = sorted.find((it: any) => {
            const act = (it.action || "").toLowerCase();
            return (act.startsWith("inició:") || act.startsWith("inicio:") || act.startsWith("terminó:") || act.startsWith("termino:")) && (it.metadata?.manual || it.metadata?.task);
          });

          if (lastManual) {
            const act = (lastManual.action || "").toLowerCase();
            if (act.startsWith("terminó:") || act.startsWith("termino:")) {
              // El último evento registrado fue que TERMINÓ la labor
              setManualTask(null);
              setManualElapsed("");
              try { localStorage.removeItem("sekunet_manual_task"); } catch {}
            } else if (act.startsWith("inició:") || act.startsWith("inicio:")) {
              const startMs = new Date(lastManual.created_at).getTime();
              // Verificar si ya existe un evento posterior que lo haya terminado
              const hasEnd = sorted.some((it: any) => {
                const a = (it.action || "").toLowerCase();
                return (a.startsWith("terminó:") || a.startsWith("termino:")) && new Date(it.created_at).getTime() > startMs;
              });
              if (hasEnd || (Date.now() - startMs > 8 * 60 * 60 * 1000)) {
                setManualTask(null);
                setManualElapsed("");
                try { localStorage.removeItem("sekunet_manual_task"); } catch {}
              } else {
                const label = lastManual.metadata?.task || lastManual.metadata?.label || lastManual.action.replace(/^inici[oó]:\s*/i, "").trim();
                const restored = {
                  type: lastManual.category || "Labores manuales",
                  label,
                  subcategory: lastManual.metadata?.subcategory,
                  start: startMs,
                };
                setManualTask(restored);
                try { localStorage.setItem("sekunet_manual_task", JSON.stringify(restored)); } catch {}
              }
            }
          }
        }
      } catch {}
    };

    // Verificación inmediata al montar
    checkServerTimeline();

    // Verificación al volver a la ventana (p. ej. el usuario vuelve de almorzar o enfoca la app Electron)
    const handleFocus = () => checkServerTimeline();
    const handleVisibility = () => {
      if (document.visibilityState === "visible") checkServerTimeline();
    };
    window.addEventListener("focus", handleFocus);
    document.addEventListener("visibilitychange", handleVisibility);

    // Verificación periódica cada 25 segundos
    const syncInterval = setInterval(checkServerTimeline, 25000);

    return () => {
      window.removeEventListener("storage", handleStorage);
      window.removeEventListener("focus", handleFocus);
      document.removeEventListener("visibilitychange", handleVisibility);
      clearInterval(syncInterval);
      supabase.removeChannel(syncChannel);
    };
  }, [agent.email, supabase]);

  useEffect(() => {
    if (tab !== "activity" || !open) return;
    const fetchActivity = () => {
      fetch(`/api/activity/timeline?agent=${encodeURIComponent(agent.email)}&date=${new Date().toISOString().split("T")[0]}&metrics=true&_t=${Date.now()}`)
        .then(r => r.json())
        .then(d => setMyMetrics(d))
        .catch(() => {});
    };
    fetchActivity();
    setLastUpdate(new Date());
    const interval = setInterval(() => {
      fetchActivity();
      setLastUpdate(new Date());
    }, 20000);
    return () => { clearInterval(interval); };
  }, [tab, open, agent.email]);

  // Ticker separado: actualiza los textos "hace Xs" y el contador de la tarea manual activa
  useEffect(() => {
    const ticker = setInterval(() => {
      if (lastUpdate && (tab === "activity" && open)) {
        const sec = Math.floor((Date.now() - lastUpdate.getTime()) / 1000);
        if (sec < 60) setElapsed(`hace ${sec}s`);
        else if (sec < 3600) setElapsed(`hace ${Math.floor(sec / 60)}m`);
        else setElapsed(`hace ${Math.floor(sec / 3600)}h`);
      } else {
        setElapsed("");
      }
      if (manualTask) {
        const ms = Date.now() - manualTask.start;
        const m = Math.floor(ms / 60000);
        const s = Math.floor((ms % 60000) / 1000);
        setManualElapsed(`${m}:${s.toString().padStart(2, "0")}`);
      }
    }, 1000);
    return () => clearInterval(ticker);
  }, [tab, open, lastUpdate, manualTask]);

  const startManualTask = (type: string, label: string, subcategory?: string) => {
    if (manualTask) return;
    const taskObj = { type, label, subcategory, start: Date.now() };
    setManualTask(taskObj);
    try {
      localStorage.setItem("sekunet_manual_task", JSON.stringify(taskObj));
    } catch {}

    // Transmitir en tiempo real a las demás instancias abiertas (Electron / Web)
    try {
      supabase.channel(`sek_manual_task_sync_${agent.email}`).send({
        type: "broadcast",
        event: "manual_task_change",
        payload: { action: "start", task: taskObj },
      });
    } catch {}

    logActivity({
      agent_email: agent.email,
      agent_name: fullName,
      action: `Inició: ${label}`,
      category: type,
      metadata: { manual: true, task: label, subcategory },
    });
  };

  const stopManualTask = () => {
    if (!manualTask) return;
    const rawDuration = Date.now() - manualTask.start;
    // Tope de seguridad: si una tarea quedó abierta por días o se olvidó cerrar, limitar a máximo 4 horas
    const duration = Math.min(rawDuration, 4 * 60 * 60 * 1000);
    const min = Math.floor(duration / 60000);
    const sec = Math.round((duration % 60000) / 1000);
    logActivity({
      agent_email: agent.email,
      agent_name: fullName,
      action: `Terminó: ${manualTask.label} (${min}min ${sec}s)`,
      category: manualTask.type,
      duration_ms: duration,
      metadata: { manual: true, task: manualTask.label, subcategory: manualTask.subcategory, duration_seconds: Math.round(duration / 1000) },
    });
    setManualTask(null);
    setManualElapsed("");
    try {
      localStorage.removeItem("sekunet_manual_task");
    } catch {}

    // Transmitir inmediatamente el cese de la labor a Electron y demás ventanas
    try {
      supabase.channel(`sek_manual_task_sync_${agent.email}`).send({
        type: "broadcast",
        event: "manual_task_change",
        payload: { action: "stop" },
      });
    } catch {}

    fetchActivity();
  };

  const handleSync = async () => {
    setSyncing(true);
    try {
      const res = await fetch("/api/activity/process", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ agent_email: agent.email, agent_name: fullName, date: new Date().toISOString().split("T")[0] }),
      });
      const data = await res.json();
      if (res.ok) {
        toast.success(`Sincronizado con ${data.provider || "IA"}`);
        fetchActivity();
      } else {
        toast.error(data.error || "Error al sincronizar");
      }
    } catch (e) {
      toast.error("Error de red");
    } finally {
      setSyncing(false);
    }
  };

  const fetchActivity = () => {
    fetch(`/api/activity/timeline?agent=${encodeURIComponent(agent.email)}&date=${new Date().toISOString().split("T")[0]}&metrics=true&_t=${Date.now()}`)
      .then(r => r.json())
      .then(d => setMyMetrics(d))
      .catch(() => {});
  };

  // Marcar estado al montar + auto-away por inactividad con tolerancia oficial + heartbeat + registro de inicio de sesión
  useEffect(() => {
    const initialStatus = activeChatsRef.current > 0 ? "busy" : (statusRef.current === "busy" ? "busy" : "online");
    setStatus(initialStatus);
    fetch("/api/profile/status", { 
      method: "POST", 
      headers: { "Content-Type": "application/json" }, 
      body: JSON.stringify({ status: initialStatus, email: agent.email }) 
    }).catch(() => {});
    
    // Registrar Inicio de Sesión si es la primera vez que se monta en el día
    try {
      const todayStr = new Date().toISOString().split("T")[0];
      const loginKey = `sekunet_login_logged_${agent.email}_${todayStr}`;
      if (!localStorage.getItem(loginKey)) {
        localStorage.setItem(loginKey, "1");
        logActivity({
          agent_email: agent.email,
          agent_name: fullName,
          action: "Inicio de sesión en el sistema",
          category: "Control Administrativo",
          metadata: { type: "auth_login", date: todayStr, timestamp: new Date().toISOString() },
        });
      }
    } catch {}

    const handleUnload = () => navigator.sendBeacon("/api/profile/status", JSON.stringify({ status: "offline", email: agent.email }));
    window.addEventListener("beforeunload", handleUnload);

    // Heartbeat cada 2 minutos preservando el estado real actual (busy, online o away)
    const heartbeat = setInterval(() => {
      fetch("/api/profile/status", { 
        method: "POST", 
        keepalive: true, 
        headers: { "Content-Type": "application/json" }, 
        body: JSON.stringify({ status: statusRef.current, email: agent.email }) 
      }).catch(() => {});
    }, 120000);

    // Idle timer — auto switch to "away" after inactivity based on official tolerance
    const timeoutMs = (toleranceMin || 15) * 60 * 1000;
    let idleTimer: ReturnType<typeof setTimeout>;
    const resetIdle = () => {
      // Si el agente estaba ausente o desconectado, cualquier interacción humana lo reactiva:
      // Si tiene chats abiertos en atención -> vuelve a "busy" (Rojo)
      // Si no tiene chats abiertos -> vuelve a "online" (Verde)
      if (statusRef.current === "away" || statusRef.current === "offline") {
        const nextStatus = activeChatsRef.current > 0 ? "busy" : "online";
        setStatus(nextStatus);
        fetch("/api/profile/status", { 
          method: "POST", 
          headers: { "Content-Type": "application/json" }, 
          body: JSON.stringify({ status: nextStatus, email: agent.email }) 
        }).catch(() => {});
      }
      clearTimeout(idleTimer);
      idleTimer = setTimeout(() => {
        if (statusRef.current === "online" || statusRef.current === "busy") {
          setStatus("away");
          fetch("/api/profile/status", { 
            method: "POST", 
            headers: { "Content-Type": "application/json" }, 
            body: JSON.stringify({ status: "away", email: agent.email }) 
          }).catch(() => {});
        }
      }, timeoutMs);
    };
    const events = ["mousemove", "mousedown", "keydown", "touchstart", "scroll"] as const;
    events.forEach(e => window.addEventListener(e, resetIdle, { passive: true }));
    resetIdle(); // start timer

    return () => {
      window.removeEventListener("beforeunload", handleUnload);
      events.forEach(e => window.removeEventListener(e, resetIdle));
      clearTimeout(idleTimer);
      clearInterval(heartbeat);
    };
  }, [agent.email, fullName, toleranceMin]);

  const handleStatusChange = async (s: string) => {
    setStatus(s);
    await fetch("/api/profile/status", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ status: s, email: agent.email }) }).catch(() => {});
    logActivity({ agent_email: agent.email, agent_name: fullName, action: `Cambió su estado de conexión de "${status}" a "${s}"`, category: "Actividad general", metadata: { from: status, to: s } });
  };

  const handleAvatarChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploadingAvatar(true);
    const form = new FormData();
    form.append("avatar", file);
    const res = await fetch("/api/profile/avatar", { method: "POST", body: form });
    const data = await res.json();
    if (res.ok) { setAvatarUrl(data.url + "?t=" + Date.now()); toast.success("Avatar actualizado"); router.refresh(); }
    else toast.error(data.error || "Error al subir avatar");
    setUploadingAvatar(false);
  };

  const handlePasswordSave = async () => {
    if (pwd.length < 8) { toast.error("Mínimo 8 caracteres"); return; }
    if (pwd !== pwd2) { toast.error("Las contraseñas no coinciden"); return; }
    setSavingPwd(true);
    const res = await fetch("/api/profile/password", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ password: pwd }) });
    const data = await res.json();
    if (res.ok) { toast.success("Contraseña actualizada"); setPwd(""); setPwd2(""); setShowPwd(false); }
    else toast.error(data.error || "Error al cambiar contraseña");
    setSavingPwd(false);
  };

  const handleLogout = async () => {
    try {
      logActivity({
        agent_email: agent.email,
        agent_name: fullName,
        action: "Cierre de sesión del sistema",
        category: "Control Administrativo",
        metadata: { type: "auth_logout", method: "button", timestamp: new Date().toISOString() },
      });
    } catch {}
    await fetch("/api/profile/status", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ status: "offline" }) }).catch(() => {});
    await supabase.auth.signOut();
    router.push("/login");
  };

  const st = STATUS_LABELS[status] || STATUS_LABELS.offline;
  const isBotAgent = (a: any) => {
    const em = String(a.email || "").toLowerCase();
    const ro = String(a.rol || "").toLowerCase();
    const no = String(a.nombre || "").toLowerCase();
    return ro === "bot" || ro === "sistema" || em.includes("agent") || em.includes("assistant") || em.includes("system_prompt") || no.includes("asistente") || no.includes("agente whatsapp");
  };

  const getEffectiveAgentStatus = (a: any): string => {
    if (!a || !a.email) return "offline";
    if (a.status === "offline") return "offline";
    if (!a.last_seen_at) return "offline";
    const diff = Date.now() - new Date(a.last_seen_at).getTime();
    if (diff > 4 * 60 * 1000) return "offline";
    return a.status || "online";
  };

  const isAgentOnlineOrActive = (a: any) => {
    if (!a || !a.email) return false;
    const safeMyEmail = (safeAgent?.email || "").toLowerCase();
    if ((a.email || "").toLowerCase() === safeMyEmail) return false;
    if (isBotAgent(a)) return false;
    return getEffectiveAgentStatus(a) !== "offline";
  };

  const others = useMemo(() => {
    return (teamAgents || []).filter(isAgentOnlineOrActive);
  }, [teamAgents, safeAgent?.email]);

  const sortedDirectAgents = useMemo(() => {
    const safeMyEmail = (safeAgent?.email || "").toLowerCase();
    return (teamAgents || [])
      .filter((a) => (a?.email || "").toLowerCase() !== safeMyEmail)
      .sort((a, b) => {
        const stA = getEffectiveAgentStatus(a);
        const stB = getEffectiveAgentStatus(b);
        const scoreA = stA === "online" ? 3 : stA === "busy" ? 2 : stA === "away" ? 1 : 0;
        const scoreB = stB === "online" ? 3 : stB === "busy" ? 2 : stB === "away" ? 1 : 0;
        if (scoreB !== scoreA) return scoreB - scoreA;
        const nA = [a.nombre, a.apellido].filter(Boolean).join(" ") || a.email || "";
        const nB = [b.nombre, b.apellido].filter(Boolean).join(" ") || b.email || "";
        return nA.localeCompare(nB);
      });
  }, [teamAgents, safeAgent.email]);

  return (
    <div className="border-t border-border">
      {/* Panel expandible */}
      {open && (
        <div className="border-b border-border bg-card overflow-y-auto overflow-x-hidden" style={{ maxHeight: "78vh" }}>
          {/* Tabs */}
          <div className="flex border-b border-border">
            <button onClick={() => setTab("profile")} className={`flex-1 text-xs font-semibold py-2.5 transition-colors ${tab === "profile" ? "text-foreground border-b-2 border-violet-500" : "text-muted-foreground hover:text-foreground"}`}>Mi Perfil</button>
            <button
              onClick={() => setTab("team")}
              className={`flex-1 text-xs font-semibold py-2.5 transition-all flex items-center justify-center gap-1.5 ${
                tab === "team"
                  ? "text-foreground border-b-2 border-violet-500"
                  : totalChatUnread > 0
                  ? "text-violet-400 bg-violet-500/10 font-bold border-b-2 border-violet-500/70"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              <span>Equipo</span>
              {totalChatUnread > 0 ? (
                <span className="px-1.5 py-0.2 rounded-full bg-violet-600 text-white font-black text-[10px] shadow-sm">
                  {totalChatUnread}
                </span>
              ) : others.length > 0 ? (
                <span className="px-1.5 py-0.5 rounded-full bg-emerald-500/10 text-emerald-500 text-[10px]">
                  {others.length}
                </span>
              ) : null}
            </button>
            {hasActivityAccess && (
              <button onClick={() => setTab("activity")} className={`flex-1 text-xs font-semibold py-2.5 transition-colors flex items-center justify-center gap-1.5 ${tab === "activity" ? "text-violet-500 border-b-2 border-violet-500" : "text-muted-foreground hover:text-foreground"}`} title="Activity Tracker">
                <ActivityIcon className="h-3.5 w-3.5 inline-block" />
              </button>
            )}
            {canViewAgenda && (
              <button
                onClick={() => setTab("agenda")}
                className={`flex-1 text-xs font-semibold py-2.5 transition-colors flex items-center justify-center gap-1.5 ${
                  tab === "agenda"
                    ? "text-violet-500 border-b-2 border-violet-500"
                    : "text-muted-foreground hover:text-foreground"
                }`}
                title="Calendario, Agenda y Tareas"
              >
                <Calendar className="h-3.5 w-3.5 inline-block" />
              </button>
            )}
          </div>

          {tab === "profile" && (
            <div className="p-4 space-y-4">
              {/* Avatar */}
              <div className="flex flex-col items-center gap-3">
                <div className="relative group cursor-pointer" onClick={() => fileRef.current?.click()}>
                  <AvatarImg url={avatarUrl} name={fullName} size={72} />
                  <div className="absolute inset-0 rounded-full bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                    {uploadingAvatar ? <div className="h-4 w-4 border-2 border-white border-t-transparent rounded-full animate-spin" /> : <Camera className="h-5 w-5 text-white" />}
                  </div>
                  <div className={`absolute bottom-0.5 right-0.5 h-4 w-4 rounded-full border-2 border-card ${st.color}`} />
                </div>
                <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={handleAvatarChange} />
                <div className="text-center">
                  <span className="text-[10px] font-black uppercase px-2 py-0.5 rounded-full bg-brand-500/10 text-brand-400 border border-brand-500/20 inline-block">
                    {safeAgent.rol}
                  </span>
                  <p className="text-[11px] text-muted-foreground font-mono mt-1">{safeAgent.email}</p>
                </div>
              </div>

              {/* Formulario editable de Nombre y Apellido */}
              <div className="p-3 rounded-xl bg-muted/20 border border-border/60 space-y-2.5">
                <div className="flex items-center justify-between">
                  <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
                    <UserCheck className="h-3 w-3 text-brand-500" />
                    Datos Personales
                  </p>
                  {(profileNombre !== (safeAgent.nombre || "") || profileApellido !== (safeAgent.apellido || "")) && (
                    <span className="text-[9px] font-bold text-amber-500">Sin guardar</span>
                  )}
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="text-[10px] text-muted-foreground font-medium block mb-1">Nombre</label>
                    <input
                      type="text"
                      value={profileNombre}
                      onChange={(e) => setProfileNombre(e.target.value)}
                      placeholder="Nombre"
                      className="w-full text-xs px-2.5 py-1.5 rounded-lg border border-border bg-background focus:outline-none focus:ring-1 focus:ring-violet-500 text-foreground"
                    />
                  </div>
                  <div>
                    <label className="text-[10px] text-muted-foreground font-medium block mb-1">Apellido</label>
                    <input
                      type="text"
                      value={profileApellido}
                      onChange={(e) => setProfileApellido(e.target.value)}
                      placeholder="Apellido"
                      className="w-full text-xs px-2.5 py-1.5 rounded-lg border border-border bg-background focus:outline-none focus:ring-1 focus:ring-violet-500 text-foreground"
                    />
                  </div>
                </div>
                <button
                  type="button"
                  onClick={handleSaveProfile}
                  disabled={savingProfile}
                  className="w-full py-1.5 px-3 rounded-lg bg-brand-600 hover:bg-brand-500 text-white text-xs font-bold transition-all disabled:opacity-50 flex items-center justify-center gap-1.5 shadow-xs cursor-pointer"
                >
                  <Save className="h-3 w-3" />
                  <span>{savingProfile ? "Guardando..." : "Guardar Perfil"}</span>
                </button>
              </div>

              {/* Estado */}
              <div>
                <p className="text-xs font-semibold text-muted-foreground mb-2">Estado de conexión</p>
                <div className="grid grid-cols-2 gap-1.5">
                  {Object.entries(STATUS_LABELS).map(([key, { label, color }]) => (
                    <button key={key} onClick={() => handleStatusChange(key)}
                      className={`flex items-center gap-2 px-3 py-2 rounded-lg text-xs font-medium border transition-all cursor-pointer ${status === key ? "border-violet-500/50 bg-violet-500/10 text-foreground font-semibold" : "border-border hover:bg-muted/50 text-muted-foreground"}`}>
                      <span className={`h-2 w-2 rounded-full shrink-0 ${color}`} />
                      <span className="truncate">{key === "busy" && activeChatsCount > 0 ? `Ocupado (${activeChatsCount})` : label}</span>
                    </button>
                  ))}
                </div>
              </div>

              {/* Cambiar contraseña */}
              <div>
                <button onClick={() => setShowPwd(v => !v)} className="w-full flex items-center justify-between text-xs font-semibold text-muted-foreground hover:text-foreground transition-colors py-1">
                  <span className="flex items-center gap-1.5"><Lock className="h-3.5 w-3.5" /> Cambiar contraseña</span>
                  <ChevronUp className={`h-3.5 w-3.5 transition-transform ${showPwd ? "" : "rotate-180"}`} />
                </button>
                {showPwd && (
                  <div className="mt-2 space-y-2">
                    <div className="relative">
                      <input type={showPwdVal ? "text" : "password"} placeholder="Nueva contraseña" value={pwd} onChange={e => setPwd(e.target.value)}
                        className="w-full text-xs px-3 py-2 rounded-lg border border-border bg-background pr-8 focus:outline-none focus:ring-1 focus:ring-violet-500" />
                      <button type="button" onClick={() => setShowPwdVal(v => !v)} className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground">
                        {showPwdVal ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
                      </button>
                    </div>
                    <div className="relative">
                      <input type={showPwd2Val ? "text" : "password"} placeholder="Confirmar contraseña" value={pwd2} onChange={e => setPwd2(e.target.value)}
                        className="w-full text-xs px-3 py-2 rounded-lg border border-border bg-background pr-8 focus:outline-none focus:ring-1 focus:ring-violet-500" />
                      <button type="button" onClick={() => setShowPwd2Val(v => !v)} className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground">
                        {showPwd2Val ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
                      </button>
                    </div>
                    {pwd && pwd2 && (
                      <p className={`text-[10px] ${pwd === pwd2 ? "text-emerald-500" : "text-red-500"}`}>
                        {pwd === pwd2 ? "✓ Las contraseñas coinciden" : "✗ No coinciden"}
                      </p>
                    )}
                    <button onClick={handlePasswordSave} disabled={savingPwd || pwd.length < 8 || pwd !== pwd2}
                      className="w-full py-2 rounded-lg bg-violet-600 hover:bg-violet-700 text-white text-xs font-semibold disabled:opacity-50 transition-colors">
                      {savingPwd ? "Guardando..." : "Guardar contraseña"}
                    </button>
                  </div>
                )}
              </div>
            </div>
          )}

          {tab === "team" && selectedChat && !teamChatExpanded && (
            <div className="flex flex-col w-full overflow-hidden" style={{ height: "520px", maxHeight: "calc(78vh - 45px)" }}>
              <InternalChatView
                channelId={selectedChat.channelId}
                channelName={selectedChat.channelName}
                channelAvatar={selectedChat.channelAvatar}
                channelStatus={selectedChat.channelStatus}
                isGroup={selectedChat.isGroup}
                currentUserEmail={safeAgent.email}
                currentUserName={fullName}
                onBack={() => setSelectedChat(null)}
                onNewMessageSent={() => loadChatConversations()}
                isExpanded={false}
                onToggleExpand={() => setTeamChatExpanded(true)}
              />
            </div>
          )}

          {tab === "team" && !selectedChat && !teamChatExpanded && (
            <div className="p-3 space-y-3" style={{ minHeight: "380px", maxHeight: "560px", overflowY: "auto" }}>
              {/* Barra superior con botón para ampliar ventana */}
              <div className="flex items-center justify-between pb-1">
                <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
                  Canales & Chats
                </span>
                <button
                  type="button"
                  onClick={() => setTeamChatExpanded(true)}
                  className="flex items-center gap-1.5 px-2.5 py-1 rounded-xl bg-violet-600/10 hover:bg-violet-600/20 text-violet-400 border border-violet-500/25 text-[11px] font-bold transition-all cursor-pointer shadow-xs"
                  title="Ampliar ventana de mensajes internos"
                >
                  <Maximize2 className="h-3 w-3" />
                  <span>Ampliar ventana</span>
                </button>
              </div>
              {/* CANAL GENERAL DE EQUIPO (DESTACADO) */}
              <div
                onClick={() => openInternalChat("group_general", "Chat General del Equipo", null, null, true)}
                className="p-3 rounded-2xl bg-gradient-to-r from-violet-600/15 via-indigo-600/10 to-violet-600/5 border border-violet-500/30 hover:border-violet-500/60 cursor-pointer transition-all shadow-xs group"
              >
                <div className="flex items-center justify-between gap-2.5">
                  <div className="flex items-center gap-2.5 min-w-0">
                    <div className="h-9 w-9 rounded-xl bg-violet-600 text-white grid place-items-center shrink-0 shadow-sm shadow-violet-600/30 group-hover:scale-105 transition-transform">
                      <Users className="h-4.5 w-4.5" />
                    </div>
                    <div className="min-w-0">
                      <div className="flex items-center gap-1.5">
                        <span className="text-xs font-black text-foreground group-hover:text-violet-400 transition-colors truncate">
                          # General (Equipo)
                        </span>
                        <span className="text-[9px] uppercase font-extrabold px-1.5 py-0.2 rounded bg-violet-500/20 text-violet-300 border border-violet-500/30">
                          Grupal
                        </span>
                      </div>
                      <p className="text-[10px] text-muted-foreground truncate mt-0.5">
                        Canal colaborativo de todo el equipo técnico
                      </p>
                    </div>
                  </div>

                  {(chatUnreadCounts["group_general"] || 0) > 0 && (
                    <span className="px-2 py-0.5 rounded-full bg-violet-600 text-white text-[10px] font-black shrink-0 shadow-sm">
                      {chatUnreadCounts["group_general"]}
                    </span>
                  )}
                </div>
              </div>

              {/* LISTA DE COMPAÑEROS PARA MENSAJERÍA DIRECTA */}
              <div className="space-y-1.5">
                <div className="flex items-center justify-between px-1 pt-1">
                  <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
                    Mensajería Directa ({sortedDirectAgents.length})
                  </span>
                </div>

                {sortedDirectAgents.length === 0 ? (
                  <p className="text-xs text-muted-foreground text-center py-6">
                    No hay otros compañeros registrados
                  </p>
                ) : (
                  sortedDirectAgents.map((a) => {
                    const n = [a.nombre, a.apellido].filter(Boolean).join(" ") || a.email;
                    const effectiveStatus = getEffectiveAgentStatus(a);
                    const s = STATUS_LABELS[effectiveStatus] || STATUS_LABELS.offline;
                    const channelId = buildDirectChannelId(safeAgent.email, a.email);
                    const unread = chatUnreadCounts[channelId] || 0;

                    return (
                      <div
                        key={a.email}
                        onClick={() => openInternalChat(channelId, n, a.avatar_url, effectiveStatus, false)}
                        className="flex items-center justify-between gap-2.5 px-2.5 py-2 rounded-xl hover:bg-muted/60 border border-transparent hover:border-border/60 transition-all cursor-pointer group"
                      >
                        <div className="flex items-center gap-2.5 min-w-0 flex-1">
                          <div className="relative shrink-0">
                            <AvatarImg url={a.avatar_url} name={n} size={32} />
                            <span
                              className={`absolute bottom-0 right-0 h-2.5 w-2.5 rounded-full border-2 border-card ${s.color}`}
                            />
                          </div>
                          <div className="min-w-0 flex-1">
                            <div className="flex items-center gap-1.5">
                              <p className="text-xs font-bold text-foreground group-hover:text-violet-400 transition-colors truncate leading-tight">
                                {n}
                              </p>
                              {a.rol === "superadmin" && (
                                <span className="text-[8px] font-extrabold uppercase px-1 py-0.2 rounded bg-amber-500/15 text-amber-400 border border-amber-500/30">
                                  Admin
                                </span>
                              )}
                            </div>
                            <p className="text-[10px] text-muted-foreground leading-tight mt-0.5 truncate">
                              {s.label}
                            </p>
                          </div>
                        </div>

                        <div className="flex items-center gap-2 shrink-0">
                          {unread > 0 ? (
                            <span className="px-2 py-0.5 rounded-full bg-violet-600 text-white text-[10px] font-black shadow-sm">
                              {unread}
                            </span>
                          ) : (
                            <div className="h-7 w-7 rounded-lg text-muted-foreground group-hover:text-violet-400 group-hover:bg-violet-500/10 grid place-items-center transition-colors">
                              <MessageSquare className="h-3.5 w-3.5" />
                            </div>
                          )}
                        </div>
                      </div>
                    );
                  })
                )}
              </div>
            </div>
          )}

          {tab === "activity" && hasActivityAccess && (
            <div className="flex flex-col" style={{ minHeight: "440px", maxHeight: "560px" }}>
              {/* Header con gradiente y métricas compactas */}
              <div className="px-3 py-2 bg-gradient-to-br from-violet-500/15 via-indigo-500/5 to-transparent border-b border-border/50 space-y-1.5">
                {/* Fila 1: Título + Score */}
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2 min-w-0">
                    <div className="h-6 w-6 rounded-md bg-violet-500/20 text-violet-400 grid place-items-center shrink-0 border border-violet-500/30">
                      <ActivityIcon className="h-3.5 w-3.5" />
                    </div>
                    <div className="min-w-0">
                      <span className="text-[11px] font-black tracking-tight text-foreground block leading-tight">
                        JORNADA 10H
                      </span>
                      {myMetrics?.firstLoginTime && (
                        <span className="text-[9.5px] text-muted-foreground font-mono leading-tight block">
                          Entrada: {myMetrics.firstLoginTime}
                        </span>
                      )}
                    </div>
                  </div>
                  <span className="text-[10.5px] font-black px-1.5 py-0.5 rounded-md bg-violet-500/15 text-violet-400 border border-violet-500/30 leading-tight shrink-0">
                    {myMetrics?.productivityScore ?? 100}%
                  </span>
                </div>

                {/* Fila 2: Métricas en línea compactas */}
                <div className="flex items-center gap-2 pt-0.5 border-t border-border/40">
                  <div className="flex-1 flex items-center gap-1.5 bg-card/80 border border-emerald-500/25 rounded-lg px-2 py-1">
                    <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 animate-pulse shrink-0" />
                    <span className="text-[9.5px] font-bold text-muted-foreground uppercase">Activo</span>
                    <span className="text-[11px] font-black text-emerald-400 ml-auto">{myMetrics?.totalActiveTime || "0m"}</span>
                  </div>
                  <div className="flex-1 flex items-center gap-1.5 bg-card/80 border border-sky-500/25 rounded-lg px-2 py-1">
                    <Clock className="h-2.5 w-2.5 text-sky-400 shrink-0" />
                    <span className="text-[9.5px] font-bold text-muted-foreground uppercase">Resta</span>
                    <span className="text-[11px] font-black text-sky-400 ml-auto">{myMetrics?.deficitMs > 0 ? (myMetrics?.deficitTime || "0m") : "OK"}</span>
                  </div>
                </div>

                {/* Fila 3: Barra de progreso */}
                <div className="flex items-center gap-2">
                  <div className="h-1.5 flex-1 rounded-full bg-slate-800/80 overflow-hidden border border-border/40">
                    <div
                      className="h-full bg-gradient-to-r from-emerald-500 to-teal-400 transition-all duration-500 rounded-full"
                      style={{
                        width: `${Math.min(100, Math.round(((myMetrics?.totalActiveMs || 0) / (10 * 3600 * 1000)) * 100))}%`
                      }}
                    />
                  </div>
                  <span className="text-[9px] font-bold text-muted-foreground shrink-0">
                    {Math.min(100, Math.round(((myMetrics?.totalActiveMs || 0) / (10 * 3600 * 1000)) * 100))}%
                  </span>
                </div>
              </div>

              {/* Timer manual activo si hay labor en curso */}
              {manualTask && (() => {
                const ActiveIcon = taskGroups.flatMap(g => g.items).find(i => i.label === manualTask.label)?.icon || Timer;
                return (
                  <div className="mx-3 mt-1.5 px-2.5 py-1.5 rounded-lg bg-amber-500/10 border border-amber-500/30 shadow-sm animate-in fade-in slide-in-from-top-1">
                    <div className="flex items-center gap-2">
                      <div className="h-6 w-6 rounded-md bg-amber-500/20 text-amber-400 grid place-items-center shrink-0 border border-amber-500/30">
                        <ActiveIcon className="h-3 w-3" />
                      </div>
                      <p className="text-[11px] font-black text-amber-400 leading-snug truncate flex-1 min-w-0" title={manualTask.label}>
                        {manualTask.label}
                      </p>
                      <span className="text-[10.5px] font-mono font-black text-amber-300 tabular-nums px-1.5 py-0.5 rounded-md bg-amber-500/20 border border-amber-500/30 shrink-0">
                        {manualElapsed}
                      </span>
                      <button
                        type="button"
                        onClick={stopManualTask}
                        className="flex items-center gap-1 py-1 px-2 rounded-md bg-amber-600 hover:bg-amber-500 text-white font-bold text-[10px] shadow-sm transition-all active:scale-[0.98] shrink-0"
                      >
                        <Square className="h-2.5 w-2.5 fill-current" />
                        <span>Detener</span>
                      </button>
                    </div>
                  </div>
                );
              })()}

              {/* Labores Manuales Directas con Selectores Dinámicos de Primer Nivel */}
              <div className="flex-1 overflow-y-auto px-3 py-1.5 space-y-1.5">
                {/* Cabecera y contador */}
                <div className="flex items-center justify-between">
                  <h4 className="text-xs font-black text-foreground tracking-tight flex items-center gap-1.5">
                    <Wrench className="h-3.5 w-3.5 text-violet-500" />
                    <span>Labores Manuales</span>
                  </h4>
                  <span className="text-[9.5px] font-bold px-1.5 py-0.5 rounded-full bg-violet-500/10 text-violet-400 border border-violet-500/20 shrink-0">
                    {totalAvailableTasks}
                  </span>
                </div>

                {/* Buscador rápido integrado */}
                <div className="relative">
                  <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-3 w-3 text-muted-foreground pointer-events-none" />
                  <input
                    type="text"
                    value={manualSearchQuery}
                    onChange={(e) => setManualSearchQuery(e.target.value)}
                    placeholder="Buscar..."
                    className="w-full text-[11px] pl-7 pr-7 py-1 rounded-lg border border-border/60 bg-muted/20 placeholder:text-muted-foreground/60 text-foreground focus:outline-none focus:ring-1 focus:ring-violet-500/70 transition-all"
                  />
                  {manualSearchQuery && (
                    <button
                      type="button"
                      onClick={() => setManualSearchQuery("")}
                      className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground p-0.5"
                    >
                      <XIcon className="h-3.5 w-3.5" />
                    </button>
                  )}
                </div>

                {/* Vista Cuadrícula Macro (Sin Desplegables) */}
                <div className="pt-0.5">
                  {/* CASO A: Búsqueda activa global */}
                  {manualSearchQuery.trim() ? (
                    <div className="space-y-2">
                      <div className="flex items-center justify-between px-1 pb-1 border-b border-border/40">
                        <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
                          Resultados de búsqueda
                        </span>
                        <span className="text-[10px] font-bold text-violet-400">
                          {searchResults.length} encontradas
                        </span>
                      </div>

                      {searchResults.length === 0 ? (
                        <div className="py-8 text-center text-muted-foreground">
                          <p className="text-xs font-semibold">No se encontraron labores</p>
                          <p className="text-[10px] mt-0.5 text-muted-foreground/70">
                            Prueba con otro término o borra la búsqueda
                          </p>
                        </div>
                      ) : (
                        <div className="grid grid-cols-2 gap-2">
                          {searchResults.map((task, idx) => {
                            const isCurrent = manualTask?.label === task.label;
                            const Icon = task.icon;
                            const color = MACRO_COLOR_PALETTE[idx % MACRO_COLOR_PALETTE.length];
                            const displayLabel = (task as any).short && task.label.length > 20 ? (task as any).short : task.label;

                            return (
                              <button
                                key={task.label}
                                type="button"
                                title={task.label}
                                onClick={() => {
                                  if (isCurrent) stopManualTask();
                                  else startManualTask(task.category, task.label, task.subcategory);
                                }}
                                className={`group relative flex flex-col items-center justify-center p-2.5 rounded-2xl border text-center transition-all cursor-pointer shadow-xs active:scale-95 min-h-[74px] ${
                                  isCurrent
                                    ? "bg-amber-500/25 border-amber-500 ring-2 ring-amber-500/60 shadow-amber-500/20"
                                    : `${color.bg} ${color.border} ${color.hover}`
                                }`}
                              >
                                {isCurrent && (
                                  <span className="absolute top-1.5 right-1.5 flex h-2 w-2">
                                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-amber-400 opacity-75"></span>
                                    <span className="relative inline-flex rounded-full h-2 w-2 bg-amber-500"></span>
                                  </span>
                                )}
                                <div
                                  className={`h-7 w-7 rounded-xl grid place-items-center mb-1 transition-transform group-hover:scale-110 ${
                                    isCurrent
                                      ? "bg-amber-500/30 text-amber-300 border border-amber-500/40"
                                      : color.iconBg
                                  }`}
                                >
                                  <Icon className="h-3.5 w-3.5" />
                                </div>
                                <span
                                  className={`text-[11px] font-bold leading-tight break-words text-center px-0.5 ${
                                    isCurrent ? "text-amber-300 font-black" : color.text
                                  }`}
                                >
                                  {displayLabel}
                                </span>
                                {isCurrent && (
                                  <span className="text-[8px] font-black uppercase text-amber-400 mt-1 tracking-wider bg-amber-500/20 px-1.5 py-0.2 rounded-full border border-amber-500/30">
                                    En curso
                                  </span>
                                )}
                              </button>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  ) : drillCategory !== null ? (
                    /* NIVEL 2: TAREAS DE LA CATEGORÍA SELECCIONADA EN BOTONES MACRO */
                    <div className="space-y-2 animate-in fade-in-50 duration-150">
                      {/* Cabecera con botón Volver */}
                      <div className="flex items-center justify-between gap-2 pb-1.5 border-b border-border/40">
                        <button
                          type="button"
                          onClick={() => setDrillCategory(null)}
                          className="flex items-center gap-1 px-2 py-1 rounded-lg bg-muted/70 hover:bg-muted text-xs font-bold text-foreground border border-border/60 transition-all active:scale-95 cursor-pointer shadow-2xs"
                        >
                          <ChevronLeft className="h-3.5 w-3.5" />
                          <span>Volver</span>
                        </button>
                        <div className="text-right min-w-0">
                          <span className="text-xs font-black text-foreground truncate block">
                            {drillCategory === "all" ? "Todas las labores" : drillCategory}
                          </span>
                          <span className="text-[9.5px] text-muted-foreground font-semibold">
                            {drillItems.length} {drillItems.length === 1 ? "labor" : "labores"}
                          </span>
                        </div>
                      </div>

                      {/* Cuadrícula de botones macro de tareas */}
                      <div className="grid grid-cols-2 gap-2">
                        {drillItems.map((task, idx) => {
                          const isCurrent = manualTask?.label === task.label;
                          const Icon = task.icon;
                          const color = MACRO_COLOR_PALETTE[idx % MACRO_COLOR_PALETTE.length];
                          const displayLabel = (task as any).short && task.label.length > 20 ? (task as any).short : task.label;

                          return (
                            <button
                              key={task.label}
                              type="button"
                              title={task.label}
                              onClick={() => {
                                if (isCurrent) stopManualTask();
                                else startManualTask(task.category, task.label, task.subcategory);
                              }}
                              className={`group relative flex flex-col items-center justify-center p-2.5 rounded-2xl border text-center transition-all cursor-pointer shadow-xs active:scale-95 min-h-[74px] ${
                                isCurrent
                                  ? "bg-amber-500/25 border-amber-500 ring-2 ring-amber-500/60 shadow-amber-500/20"
                                  : `${color.bg} ${color.border} ${color.hover}`
                              }`}
                            >
                              {isCurrent && (
                                <span className="absolute top-1.5 right-1.5 flex h-2 w-2">
                                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-amber-400 opacity-75"></span>
                                  <span className="relative inline-flex rounded-full h-2 w-2 bg-amber-500"></span>
                                </span>
                              )}
                              <div
                                className={`h-7 w-7 rounded-xl grid place-items-center mb-1 transition-transform group-hover:scale-110 ${
                                  isCurrent
                                    ? "bg-amber-500/30 text-amber-300 border border-amber-500/40"
                                    : color.iconBg
                                }`}
                              >
                                <Icon className="h-3.5 w-3.5" />
                              </div>
                              <span
                                className={`text-[11px] font-bold leading-tight break-words text-center px-0.5 ${
                                  isCurrent ? "text-amber-300 font-black" : color.text
                                }`}
                              >
                                {displayLabel}
                              </span>
                              {isCurrent && (
                                <span className="text-[8px] font-black uppercase text-amber-400 mt-1 tracking-wider bg-amber-500/20 px-1.5 py-0.2 rounded-full border border-amber-500/30">
                                  En curso
                                </span>
                              )}
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  ) : (
                    /* NIVEL 1: SUBCATEGORÍAS / CATEGORÍAS EN BOTONES MACRO */
                    <div className="space-y-2 animate-in fade-in-50 duration-150">
                      <div className="flex items-center justify-between px-1 pb-1 border-b border-border/40">
                        <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
                          Selecciona una categoría
                        </span>
                        <span className="text-[10px] font-bold text-violet-400">
                          {totalAvailableTasks} labores
                        </span>
                      </div>

                      <div className="grid grid-cols-2 gap-2">
                        {taskGroups.map((group, idx) => {
                          const Icon = getCategoryIcon(group.group);
                          const color = MACRO_COLOR_PALETTE[idx % MACRO_COLOR_PALETTE.length];
                          const hasActiveTask = manualTask && group.items.some((i) => i.label === manualTask.label);

                          return (
                            <button
                              key={group.group}
                              type="button"
                              onClick={() => setDrillCategory(group.group)}
                              className={`group relative flex flex-col items-center justify-center p-2.5 rounded-2xl border text-center transition-all cursor-pointer shadow-xs active:scale-95 min-h-[78px] ${
                                hasActiveTask
                                  ? "bg-amber-500/20 border-amber-500 ring-2 ring-amber-500/50"
                                  : `${color.bg} ${color.border} ${color.hover}`
                              }`}
                            >
                              {hasActiveTask && (
                                <span className="absolute top-1.5 right-1.5 flex h-2 w-2">
                                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-amber-400 opacity-75"></span>
                                  <span className="relative inline-flex rounded-full h-2 w-2 bg-amber-500"></span>
                                </span>
                              )}
                              <div
                                className={`h-8 w-8 rounded-xl grid place-items-center mb-1 transition-transform group-hover:scale-110 ${
                                  hasActiveTask
                                    ? "bg-amber-500/30 text-amber-300 border border-amber-500/40"
                                    : color.iconBg
                                }`}
                              >
                                <Icon className="h-4 w-4" />
                              </div>
                              <span
                                className={`text-[11.5px] font-bold leading-tight ${
                                  hasActiveTask ? "text-amber-300 font-black" : color.text
                                }`}
                              >
                                {group.group}
                              </span>
                              <span className="text-[9.5px] font-semibold text-muted-foreground mt-0.5">
                                {group.items.length} {group.items.length === 1 ? "labor" : "labores"}
                              </span>
                              {hasActiveTask && (
                                <span className="text-[8px] font-black uppercase text-amber-400 mt-1 tracking-wider bg-amber-500/20 px-1.5 py-0.2 rounded-full border border-amber-500/30">
                                  En curso
                                </span>
                              )}
                            </button>
                          );
                        })}

                        {/* Botón Maestro: Todas las labores */}
                        {taskGroups.length > 1 && (
                          <button
                            type="button"
                            onClick={() => setDrillCategory("all")}
                            className="group relative flex flex-col items-center justify-center p-2.5 rounded-2xl border text-center transition-all cursor-pointer shadow-xs active:scale-95 min-h-[78px] bg-violet-500/15 border-violet-500/40 hover:bg-violet-500/25 hover:border-violet-500/70"
                          >
                            <div className="h-8 w-8 rounded-xl grid place-items-center mb-1 transition-transform group-hover:scale-110 bg-violet-500/25 text-violet-400 border border-violet-500/40">
                              <Layers className="h-4 w-4" />
                            </div>
                            <span className="text-[11.5px] font-bold leading-tight text-violet-950 dark:text-violet-200">
                              Todas
                            </span>
                            <span className="text-[9.5px] font-semibold text-muted-foreground mt-0.5">
                              {totalAvailableTasks} labores
                            </span>
                          </button>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              </div>

              {/* Footer con sincronización y reporte IA */}
              <div className="px-3 py-2.5 border-t border-border/50 bg-card/40 flex gap-2">
                <button
                  onClick={handleSync}
                  disabled={syncing}
                  className="flex-1 flex items-center justify-center gap-1.5 text-xs font-bold px-3 py-2 rounded-xl bg-gradient-to-r from-violet-600 to-indigo-600 text-white hover:from-violet-700 hover:to-indigo-700 transition-all duration-200 disabled:opacity-50 shadow-md shadow-violet-600/20"
                >
                  <RefreshCw className={`h-3.5 w-3.5 ${syncing ? "animate-spin" : ""}`} />
                  {syncing ? "Sincronizando..." : "Sincronizar"}
                </button>
                <button
                  onClick={() => setShowActivityModal(true)}
                  className="flex items-center justify-center gap-1.5 text-xs font-bold px-3 py-2 rounded-xl border border-border bg-card hover:bg-muted text-foreground transition-colors"
                  title="Ver mi actividad diaria y justificar tiempos"
                >
                  <BarChart3 className="h-3.5 w-3.5 text-violet-500" />
                  Mi Actividad
                </button>
              </div>
            </div>
          )}

          {tab === "agenda" && (
            <div className="p-3 space-y-3 flex flex-col">
              {/* Cabecera del tab */}
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-1 p-0.5 rounded-lg bg-muted/60 border border-border">
                  <button
                    onClick={() => setPanelAgendaTab("tasks")}
                    className={`px-2 py-0.5 rounded-md text-[10.5px] font-bold transition-all cursor-pointer ${
                      panelAgendaTab === "tasks" ? "bg-card text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"
                    }`}
                  >
                    Tareas ({panelAgendaTasks.filter(t => t.status !== "completed").length})
                  </button>
                  <button
                    onClick={() => setPanelAgendaTab("events")}
                    className={`px-2 py-0.5 rounded-md text-[10.5px] font-bold transition-all cursor-pointer ${
                      panelAgendaTab === "events" ? "bg-card text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"
                    }`}
                  >
                    Eventos ({panelAgendaEvents.length})
                  </button>
                </div>

                <button
                  onClick={() => setShowAgendaModal(true)}
                  className="flex items-center gap-1 text-[10.5px] font-bold px-2 py-1 rounded-lg bg-violet-500/10 text-violet-400 border border-violet-500/20 hover:bg-violet-500/20 transition-colors cursor-pointer"
                  title="Abrir vista completa"
                >
                  <Maximize2 className="h-3 w-3" />
                  <span>Expandir</span>
                </button>
              </div>

              {/* Contenido Tareas */}
              {panelAgendaTab === "tasks" && (
                <div className="space-y-2.5">
                  {/* Formulario rápido para añadir tarea */}
                  <form
                    onSubmit={async (e) => {
                      e.preventDefault();
                      const title = newQuickTaskTitle.trim();
                      if (!title) return;
                      setCreatingQuickTask(true);
                      try {
                        const res = await fetch("/api/agenda", {
                          method: "POST",
                          headers: { "Content-Type": "application/json" },
                          body: JSON.stringify({
                            type: "task",
                            item: {
                              title,
                              priority: "media",
                              status: "pending",
                              created_by: safeAgent.email,
                              created_by_name: fullName,
                            },
                          }),
                        });
                        if (res.ok) {
                          const data = await res.json();
                          setPanelAgendaTasks(data.tasks || []);
                          setNewQuickTaskTitle("");
                          toast.success("Tarea agregada");
                        }
                      } catch {
                        toast.error("Error al crear tarea");
                      } finally {
                        setCreatingQuickTask(false);
                      }
                    }}
                    className="flex items-center gap-1.5"
                  >
                    <input
                      type="text"
                      placeholder="Nueva tarea rápida..."
                      value={newQuickTaskTitle}
                      onChange={(e) => setNewQuickTaskTitle(e.target.value)}
                      className="flex-1 text-[11px] px-2.5 py-1.5 rounded-lg border border-border bg-background focus:outline-none focus:ring-1 focus:ring-violet-500 text-foreground placeholder:text-muted-foreground"
                    />
                    <button
                      type="submit"
                      disabled={creatingQuickTask || !newQuickTaskTitle.trim()}
                      className="p-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white transition-colors cursor-pointer"
                      title="Agregar tarea"
                    >
                      <Plus className="h-3.5 w-3.5" />
                    </button>
                  </form>

                  {/* Lista de tareas */}
                  <div className="space-y-1.5 max-h-[300px] overflow-y-auto pr-1">
                    {panelAgendaTasks.length === 0 ? (
                      <p className="text-center py-6 text-[11px] text-muted-foreground">
                        Sin tareas pendientes. ¡Todo al día!
                      </p>
                    ) : (
                      panelAgendaTasks.slice(0, 15).map((tsk) => {
                        const isDone = tsk.status === "completed";
                        return (
                          <div
                            key={tsk.id}
                            className={`p-2 rounded-lg border border-border/70 flex items-center justify-between gap-2 text-xs transition-colors hover:bg-muted/30 ${
                              isDone ? "bg-muted/10 opacity-50" : "bg-card"
                            }`}
                          >
                            <div className="flex items-center gap-2 min-w-0 flex-1">
                              <button
                                onClick={async () => {
                                  const nextStatus = isDone ? "pending" : "completed";
                                  await fetch("/api/agenda", {
                                    method: "PATCH",
                                    headers: { "Content-Type": "application/json" },
                                    body: JSON.stringify({ taskId: tsk.id, status: nextStatus }),
                                  });
                                  setPanelAgendaTasks((prev) =>
                                    prev.map((t) => (t.id === tsk.id ? { ...t, status: nextStatus } : t))
                                  );
                                }}
                                className="text-muted-foreground hover:text-emerald-400 shrink-0 cursor-pointer"
                              >
                                {isDone ? (
                                  <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500" />
                                ) : (
                                  <Square className="h-3.5 w-3.5" />
                                )}
                              </button>
                              <span className={`text-[11px] truncate leading-tight ${isDone ? "line-through text-muted-foreground" : "text-foreground"}`}>
                                {tsk.title}
                              </span>
                            </div>

                            {tsk.priority === "alta" && (
                              <span className="text-[9px] font-bold text-rose-400 shrink-0">🔥</span>
                            )}
                          </div>
                        );
                      })
                    )}
                  </div>
                </div>
              )}

              {/* Contenido Eventos */}
              {panelAgendaTab === "events" && (
                <div className="space-y-2">
                  <div className="flex items-center justify-between text-[11px] text-muted-foreground border-b border-border/50 pb-1.5">
                    <span className="font-semibold">Próximos eventos</span>
                    <button
                      onClick={() => setShowAgendaModal(true)}
                      className="text-violet-400 hover:underline font-bold cursor-pointer"
                    >
                      + Programar
                    </button>
                  </div>

                  <div className="space-y-1.5 max-h-[300px] overflow-y-auto pr-1">
                    {panelAgendaEvents.length === 0 ? (
                      <p className="text-center py-6 text-[11px] text-muted-foreground">
                        No hay eventos agendados próximos.
                      </p>
                    ) : (
                      panelAgendaEvents.slice(0, 10).map((evt) => (
                        <div
                          key={evt.id}
                          className="p-2 rounded-lg border border-border/70 bg-card space-y-1 text-xs"
                        >
                          <div className="flex items-center justify-between gap-1">
                            <h6 className="font-bold text-[11px] text-foreground truncate">{evt.title}</h6>
                            <span className="text-[10px] font-mono text-muted-foreground shrink-0">{evt.date}</span>
                          </div>
                          {evt.start_time && (
                            <p className="text-[10px] text-muted-foreground flex items-center gap-1">
                              <Clock className="h-2.5 w-2.5" /> {evt.start_time} {evt.end_time ? `- ${evt.end_time}` : ""}
                            </p>
                          )}
                        </div>
                      ))
                    )}
                  </div>
                </div>
              )}

              {/* Botón inferior a pantalla completa */}
              <button
                onClick={() => setShowAgendaModal(true)}
                className="w-full flex items-center justify-center gap-1.5 py-2 px-3 rounded-xl bg-violet-600 hover:bg-violet-500 text-white font-bold text-xs shadow-md shadow-violet-600/20 transition-all cursor-pointer mt-1"
              >
                <Calendar className="h-3.5 w-3.5" />
                <span>Abrir Calendario Completo</span>
              </button>
            </div>
          )}
        </div>
      )}

      {/* ── MODAL FLOTANTE / EXPANDIDO: MENSAJERÍA INTERNA DE EQUIPO ── */}
      {teamChatExpanded && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 backdrop-blur-md p-2 sm:p-5 md:p-8 animate-in fade-in duration-150"
          onClick={() => setTeamChatExpanded(false)}
        >
          <div
            className="bg-card border border-border/80 rounded-3xl shadow-2xl w-full max-w-5xl h-[90vh] flex flex-col overflow-hidden animate-in zoom-in-95 duration-150 ring-1 ring-border/50"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Header del Modal Expandido */}
            <div className="px-5 py-3.5 border-b border-border/70 flex items-center justify-between bg-muted/30 shrink-0">
              <div className="flex items-center gap-3 min-w-0">
                <div className="h-10 w-10 rounded-2xl bg-gradient-to-tr from-violet-600 to-indigo-600 text-white grid place-items-center shadow-md shadow-violet-600/25 shrink-0">
                  <Users className="h-5 w-5" />
                </div>
                <div className="min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <h2 className="text-sm sm:text-base font-black text-foreground">Mensajería Interna de Equipo</h2>
                    <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-violet-500/20 text-violet-300 font-mono">
                      Espacio Ampliado
                    </span>
                  </div>
                  <p className="text-xs text-muted-foreground truncate">
                    Comunicación directa y grupal, notas de voz y archivos compartidos
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-2 shrink-0">
                <button
                  type="button"
                  onClick={() => setTeamChatExpanded(false)}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-border/80 hover:bg-muted text-xs font-semibold text-muted-foreground hover:text-foreground transition-colors cursor-pointer"
                  title="Restaurar a la barra lateral"
                >
                  <Minimize2 className="h-4 w-4 text-violet-400" />
                  <span className="hidden sm:inline">Minimizar</span>
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setTeamChatExpanded(false);
                  }}
                  className="p-1.5 rounded-xl hover:bg-muted text-muted-foreground hover:text-foreground transition-colors cursor-pointer"
                  title="Cerrar ventana"
                >
                  <X className="h-5 w-5" />
                </button>
              </div>
            </div>

            {/* Contenido en 2 columnas: Lista a la izquierda, Chat activo a la derecha */}
            <div className="flex-1 flex overflow-hidden min-h-0 bg-background/30">
              {/* Columna Izquierda: Conversaciones */}
              <div
                className={`w-full md:w-80 border-r border-border/70 flex flex-col bg-card/60 ${
                  selectedChat ? "hidden md:flex" : "flex"
                }`}
              >
                <div className="p-3 border-b border-border/60 flex items-center justify-between">
                  <span className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">
                    Canales & Compañeros
                  </span>
                  {totalChatUnread > 0 && (
                    <span className="px-2 py-0.5 rounded-full bg-violet-600 text-white font-black text-[10px] shadow-sm">
                      {totalChatUnread} no leídos
                    </span>
                  )}
                </div>

                <div className="flex-1 overflow-y-auto p-3 space-y-3">
                  {/* CANAL GENERAL DE EQUIPO (DESTACADO) */}
                  <div
                    onClick={() => openInternalChat("group_general", "Chat General del Equipo", null, null, true)}
                    className={`p-3 rounded-2xl border cursor-pointer transition-all shadow-xs group ${
                      selectedChat?.channelId === "group_general"
                        ? "bg-violet-600/20 border-violet-500 text-violet-200 ring-1 ring-violet-500/40"
                        : "bg-gradient-to-r from-violet-600/15 via-indigo-600/10 to-violet-600/5 border-violet-500/30 hover:border-violet-500/60"
                    }`}
                  >
                    <div className="flex items-center justify-between gap-2.5">
                      <div className="flex items-center gap-2.5 min-w-0">
                        <div className="h-9 w-9 rounded-xl bg-violet-600 text-white grid place-items-center shrink-0 shadow-sm shadow-violet-600/30 group-hover:scale-105 transition-transform">
                          <Users className="h-4.5 w-4.5" />
                        </div>
                        <div className="min-w-0">
                          <div className="flex items-center gap-1.5">
                            <span className="text-xs font-black text-foreground group-hover:text-violet-400 transition-colors truncate">
                              # General (Equipo)
                            </span>
                            <span className="text-[9px] uppercase font-extrabold px-1.5 py-0.2 rounded bg-violet-500/20 text-violet-300 border border-violet-500/30">
                              Grupal
                            </span>
                          </div>
                          <p className="text-[10px] text-muted-foreground truncate mt-0.5">
                            Canal de todo el equipo
                          </p>
                        </div>
                      </div>

                      {(chatUnreadCounts["group_general"] || 0) > 0 && (
                        <span className="px-2 py-0.5 rounded-full bg-violet-600 text-white text-[10px] font-black shrink-0 shadow-sm">
                          {chatUnreadCounts["group_general"]}
                        </span>
                      )}
                    </div>
                  </div>

                  {/* LISTA DE COMPAÑEROS PARA MENSAJERÍA DIRECTA */}
                  <div className="space-y-1">
                    <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground px-1">
                      Mensajes Directos ({sortedDirectAgents.length})
                    </span>

                    {sortedDirectAgents.map((a) => {
                      const n = [a.nombre, a.apellido].filter(Boolean).join(" ") || a.email;
                      const effectiveStatus = getEffectiveAgentStatus(a);
                      const s = STATUS_LABELS[effectiveStatus] || STATUS_LABELS.offline;
                      const channelId = buildDirectChannelId(safeAgent.email, a.email);
                      const unread = chatUnreadCounts[channelId] || 0;
                      const isSelected = selectedChat?.channelId === channelId;

                      return (
                        <div
                          key={a.email}
                          onClick={() => openInternalChat(channelId, n, a.avatar_url, effectiveStatus, false)}
                          className={`flex items-center justify-between gap-2.5 px-3 py-2.5 rounded-2xl border transition-all cursor-pointer group ${
                            isSelected
                              ? "bg-violet-600/20 border-violet-500/60 shadow-xs"
                              : "hover:bg-muted/60 border-transparent hover:border-border/60"
                          }`}
                        >
                          <div className="flex items-center gap-2.5 min-w-0 flex-1">
                            <div className="relative shrink-0">
                              <AvatarImg url={a.avatar_url} name={n} size={34} />
                              <span className={`absolute bottom-0 right-0 h-2.5 w-2.5 rounded-full border-2 border-card ${s.color}`} />
                            </div>
                            <div className="min-w-0 flex-1">
                              <p className="text-xs font-bold text-foreground group-hover:text-violet-400 transition-colors truncate leading-tight">
                                {n}
                              </p>
                              <p className="text-[10px] text-muted-foreground truncate leading-tight mt-0.5">
                                {s.label}
                              </p>
                            </div>
                          </div>

                          {unread > 0 && (
                            <span className="px-2 py-0.5 rounded-full bg-violet-600 text-white text-[10px] font-black shrink-0 shadow-sm">
                              {unread}
                            </span>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>
              </div>

              {/* Columna Derecha: Chat Activo */}
              <div
                className={`flex-1 flex flex-col min-w-0 ${
                  !selectedChat ? "hidden md:flex items-center justify-center bg-card/30 p-8 text-center" : "flex"
                }`}
              >
                {selectedChat ? (
                  <InternalChatView
                    channelId={selectedChat.channelId}
                    channelName={selectedChat.channelName}
                    channelAvatar={selectedChat.channelAvatar}
                    channelStatus={selectedChat.channelStatus}
                    isGroup={selectedChat.isGroup}
                    currentUserEmail={safeAgent.email}
                    currentUserName={fullName}
                    onBack={() => setSelectedChat(null)}
                    onNewMessageSent={() => loadChatConversations()}
                    isExpanded={true}
                    onToggleExpand={() => setTeamChatExpanded(false)}
                  />
                ) : (
                  <div className="max-w-md mx-auto space-y-3 p-6 text-center">
                    <div className="h-16 w-16 rounded-3xl bg-violet-600/15 border border-violet-500/30 text-violet-400 grid place-items-center mx-auto shadow-inner">
                      <MessageSquare className="h-8 w-8" />
                    </div>
                    <h3 className="text-base font-bold text-foreground">Bandeja de Mensajes de Equipo</h3>
                    <p className="text-xs text-muted-foreground leading-relaxed">
                      Selecciona el chat general o cualquier compañero en el panel de la izquierda para ver la conversación en pantalla completa.
                    </p>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Modal: Mi Actividad Diaria & Justificación */}
      <ModalMyActivity
        isOpen={showActivityModal}
        onClose={() => setShowActivityModal(false)}
        agentEmail={agent.email}
        agentName={fullName}
      />

      {/* Modal: Calendario, Agenda & Tareas */}
      <ModalAgenda
        isOpen={showAgendaModal}
        onClose={() => {
          setShowAgendaModal(false);
          fetch("/api/agenda")
            .then((r) => r.json())
            .then((d) => {
              if (Array.isArray(d?.tasks)) setPanelAgendaTasks(d.tasks);
              if (Array.isArray(d?.events)) setPanelAgendaEvents(d.events);
            })
            .catch(() => {});
        }}
        currentAgent={safeAgent}
      />

      {/* Alerta visual persistente en barra lateral cuando hay mensajes de equipo sin leer */}
      {totalChatUnread > 0 && !open && (
        <div className="px-3 pt-2 pb-1">
          <div
            onClick={() => {
              setOpen(true);
              setTab("team");
            }}
            className="p-2.5 rounded-2xl bg-gradient-to-r from-violet-600/25 via-indigo-600/20 to-violet-600/15 border-2 border-violet-500 text-foreground flex items-center justify-between gap-2 shadow-lg shadow-violet-500/25 cursor-pointer hover:bg-violet-600/30 transition-all group"
          >
            <div className="flex items-center gap-2.5 min-w-0">
              <div className="relative shrink-0">
                <div className="h-8 w-8 rounded-xl bg-violet-600 text-white grid place-items-center shadow-md">
                  <MessageSquare className="h-4 w-4" />
                </div>
                <span className="absolute -top-1 -right-1 h-2.5 w-2.5 rounded-full bg-violet-400 ring-2 ring-card" />
              </div>
              <div className="min-w-0">
                <p className="text-xs font-bold text-violet-300 leading-tight">
                  Mensajes de Equipo
                </p>
                <p className="text-[10px] text-muted-foreground truncate leading-tight mt-0.5">
                  {totalChatUnread === 1 ? "1 nuevo mensaje sin leer" : `${totalChatUnread} mensajes sin leer`}
                </p>
              </div>
            </div>
            <div className="flex items-center gap-1.5 shrink-0">
              <span className="px-2 py-0.5 rounded-full bg-violet-600 text-white font-black text-xs shadow-md">
                {totalChatUnread}
              </span>
              <ChevronRight className="h-3.5 w-3.5 text-violet-400 group-hover:translate-x-0.5 transition-transform" />
            </div>
          </div>
        </div>
      )}

      {/* Barra inferior siempre visible */}
      <div className="p-3 space-y-2">
        <button
          onClick={() => setOpen(v => !v)}
          className={`w-full flex items-center gap-2.5 px-2 py-2 rounded-xl transition-all group cursor-pointer ${
            totalChatUnread > 0 && !open
              ? "border border-violet-500/60 bg-violet-500/10 hover:bg-violet-500/20 shadow-xs"
              : "hover:bg-muted/60"
          }`}
        >
          <div className="relative shrink-0">
            <AvatarImg url={avatarUrl} name={fullName} size={36} />
            <span className={`absolute bottom-0 right-0 h-2.5 w-2.5 rounded-full border-2 border-card ${st.color}`} />
          </div>
          <div className="min-w-0 flex-1 text-left">
            <p className="text-sm font-medium truncate leading-tight">{fullName}</p>
            <p className="text-xs text-muted-foreground capitalize leading-tight flex items-center gap-1.5">
              <span>{safeAgent.rol || "agente"}</span>
              <span className="text-[10px] opacity-75">
                • {status === "busy" && activeChatsCount > 0 ? `Atendiendo (${activeChatsCount})` : st.label}
              </span>
            </p>
          </div>
          {totalChatUnread > 0 && !open && (
            <span className="px-2 py-0.5 rounded-full bg-violet-600 text-white font-black text-[10px] shadow-sm shrink-0">
              {totalChatUnread}
            </span>
          )}
          <ChevronUp className={`h-4 w-4 text-muted-foreground shrink-0 transition-transform ${open ? "" : "rotate-180"}`} />
        </button>
        <div className="flex items-center justify-between gap-1 px-1">
          <div className="flex items-center gap-1 flex-wrap min-w-0">
            {/* Indicadores de agentes online (desaparecen automáticamente al desconectarse) */}
            {others.map(a => {
              const n = [a?.nombre, a?.apellido].filter(Boolean).join(" ") || a?.email || "Agente";
              const s = STATUS_LABELS[a?.status || "online"] || STATUS_LABELS.online;
              return (
                <div key={a?.email || Math.random().toString()} className="relative transition-all duration-300" title={`${n} — ${s.label}`}>
                  <AvatarImg url={a?.avatar_url} name={n} size={22} />
                  <span className={`absolute bottom-0 right-0 h-1.5 w-1.5 rounded-full border border-card ${s.color}`} />
                </div>
              );
            })}
          </div>
          <button onClick={handleLogout} title="Cerrar sesión" className="p-1.5 rounded-lg text-muted-foreground hover:text-red-500 hover:bg-red-500/10 transition-colors cursor-pointer">
            <LogOut className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>

      {/* Notificación flotante de mensaje entrante ANCLADA A LA BARRA LATERAL (6s) */}
      {incomingPopup && (
        <div className="fixed bottom-20 left-3 z-[99999] w-[316px] animate-in fade-in slide-in-from-bottom-3 duration-200 pointer-events-auto shadow-2xl">
          <div
            onClick={() => {
              setIncomingPopup(null);
              setOpen(true);
              setTab("team");
              openInternalChat(
                incomingPopup.channelId,
                incomingPopup.isGroup ? "Chat General del Equipo" : incomingPopup.senderName,
                incomingPopup.senderAvatar,
                incomingPopup.channelStatus,
                incomingPopup.isGroup
              );
            }}
            className="bg-card/95 backdrop-blur-md border-2 border-violet-500 rounded-2xl p-3 shadow-2xl shadow-violet-500/30 text-foreground flex items-start gap-2.5 cursor-pointer hover:border-violet-400 transition-all group"
          >
            <div className="relative shrink-0 mt-0.5">
              {incomingPopup.isGroup ? (
                <div className="h-9 w-9 rounded-xl bg-violet-600 text-white grid place-items-center shadow-md">
                  <Users className="h-4.5 w-4.5" />
                </div>
              ) : (
                <AvatarImg url={incomingPopup.senderAvatar} name={incomingPopup.senderName} size={36} />
              )}
              <span className="absolute -bottom-0.5 -right-0.5 h-2.5 w-2.5 rounded-full bg-emerald-500 border-2 border-card" />
            </div>

            <div className="flex-1 min-w-0">
              <div className="flex items-center justify-between gap-1.5">
                <span className="inline-flex items-center gap-1 px-1.5 py-0.2 rounded-full text-[9px] font-black uppercase tracking-wider bg-violet-600/25 text-violet-300 border border-violet-500/40">
                  {incomingPopup.isGroup ? "👥 MENSAJE GRUPAL" : "💬 MENSAJE DE AGENTE"}
                </span>
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    setIncomingPopup(null);
                  }}
                  className="text-muted-foreground hover:text-foreground p-1 rounded-lg hover:bg-muted/80 transition-colors"
                >
                  <X className="h-3 w-3" />
                </button>
              </div>

              <p className="text-xs font-bold text-foreground mt-1 truncate">
                {incomingPopup.senderName}
              </p>
              <p className="text-[11px] text-muted-foreground line-clamp-2 mt-0.5">
                {incomingPopup.content}
              </p>

              <div className="mt-2 flex items-center justify-between gap-2">
                <span className="text-[9px] text-violet-400/90 font-mono">
                  Clic para abrir
                </span>
                <span className="px-2 py-0.5 text-[11px] font-bold rounded-lg bg-violet-600 group-hover:bg-violet-500 text-white shadow-sm transition-all">
                  Ver Chat
                </span>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}