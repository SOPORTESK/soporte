"use client";

import { useState, useRef, useEffect, useMemo } from "react";
import { Camera, Lock, Eye, EyeOff, Check, X, ChevronUp, Circle, LogOut, Activity as ActivityIcon, FileText, ChevronRight, X as XIcon, RefreshCw, Wrench, Coffee, Timer, BarChart3, Package, LayoutDashboard, ClipboardList, Sparkles, UserPlus, Briefcase, GraduationCap, Users, Utensils, Sandwich, Bath, Square, Trash2, Clock, CheckCircle2 } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { logActivity } from "@/lib/activity-client";
import { ModalMyActivity } from "@/components/modal-my-activity";

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
}

const STATUS_LABELS: Record<string, { label: string; color: string; icon?: string }> = {
  online:  { label: "En línea",      color: "bg-emerald-500" },
  away:    { label: "Ausente",       color: "bg-amber-400" },
  busy:    { label: "Ocupado",       color: "bg-rose-500" },
  offline: { label: "Desconectado",  color: "bg-gray-400" },
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

const TAREAS_GROUPED = [
  {
    group: "Operativa",
    items: [
      { label: "Ir a Bodega", short: "Bodega", category: "Gestión del Taller", icon: Package },
      { label: "Exhibidores", short: "Exhibidores", category: "Gestión del Taller", icon: LayoutDashboard },
      { label: "Inventario y Actualización de Bodega GAR", short: "Inventario GAR", category: "Gestión del Taller", icon: ClipboardList },
      { label: "Limpieza de taller", short: "Limpieza", category: "Gestión del Taller", icon: Sparkles },
      { label: "Gestión de Residuos", short: "Residuos", category: "Gestión de Residuos", icon: Trash2 },
    ]
  },
  {
    group: "Soporte",
    items: [
      { label: "Ir a Ventanilla", short: "Ventanilla", category: "Gestión del Taller", icon: UserPlus },
      { label: "Iniciar Diagnóstico Físico", short: "Diagnóstico", category: "Servicio de Taller", icon: Wrench },
      { label: "Soporte a Ventas", short: "Soporte Ventas", category: "Soporte", icon: Briefcase },
      { label: "Capacitacion de clientes", short: "Capacitar Cliente", category: "On-the-Job Training (OJT)", icon: GraduationCap },
    ]
  },
  {
    group: "Personal",
    items: [
      { label: "Tiempo de Descanso", short: "Descanso", category: "Pausas y Descansos", icon: Sandwich },
      { label: "Pausa Sanitaria", short: "Pausa Sanitaria", category: "Pausas y Descansos", icon: Bath },
      { label: "Reunión", short: "Reunión", category: "Control Administrativo", icon: Users },
      { label: "Capacitacion de Personal", short: "Capacitar (Interno)", category: "On-the-Job Training (OJT)", icon: GraduationCap },
    ]
  }
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
  canViewActivityTracker 
}: { 
  agent: Agent; 
  onlineAgents: OnlineAgent[]; 
  canViewActivityTracker?: boolean; 
}) {
  const safeAgent = agent || ({ rol: "tecnico", email: "agente@sekunet.com" } as Agent);
  const canAccessAdmin = ["admin", "superadmin"].includes(safeAgent.rol);
  const hasActivityAccess = canViewActivityTracker !== undefined ? canViewActivityTracker : canAccessAdmin;
  const [open, setOpen] = useState(false);
  const [tab, setTab] = useState<"profile" | "team" | "activity">("profile");
  const [status, setStatus] = useState(safeAgent.status || "online");
  const [avatarUrl, setAvatarUrl] = useState(safeAgent.avatar_url || null);
  const [uploadingAvatar, setUploadingAvatar] = useState(false);
  const [showPwd, setShowPwd] = useState(false);
  const [pwd, setPwd] = useState("");
  const [pwd2, setPwd2] = useState("");
  const [showPwdVal, setShowPwdVal] = useState(false);
  const [showPwd2Val, setShowPwd2Val] = useState(false);
  const [savingPwd, setSavingPwd] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const router = useRouter();
  const supabase = createClient();
  const fullName = [safeAgent.nombre, safeAgent.apellido].filter(Boolean).join(" ") || safeAgent.email || "Usuario";
  const [myMetrics, setMyMetrics] = useState<any>(null);
  const [showActivityModal, setShowActivityModal] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [lastUpdate, setLastUpdate] = useState<Date | null>(null);
  const [elapsed, setElapsed] = useState("");
  const [manualTask, setManualTask] = useState<{ type: string; label: string; start: number } | null>(() => {
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

  const taskGroups = useMemo(() => {
    if (!categoriesConfig || categoriesConfig.length === 0) {
      return TAREAS_GROUPED;
    }

    const groups: {
      group: string;
      color?: string;
      items: { label: string; short: string; category: string; icon: any }[];
    }[] = [];

    for (const cat of categoriesConfig) {
      let subs: string[] = Array.isArray(cat.subcategories) ? [...cat.subcategories] : [];
      if (subs.length === 0 && (cat.id === "Pausas y Descansos" || cat.label === "Pausas y Descansos")) {
        subs = ["Tiempo de Descanso", "Pausa Sanitaria", "Almuerzo"];
      }

      if (subs.length === 0) continue;

      const items = subs.map((sub: string) => {
        const cleanShort = sub.replace(/\s*\(manual\)\s*/i, "").trim();
        return {
          label: cleanShort,
          short: cleanShort.length > 20 ? cleanShort.slice(0, 18) + "…" : cleanShort,
          category: cat.label || cat.id,
          icon: getTaskIcon(sub),
        };
      });

      groups.push({
        group: cat.label || cat.id,
        color: cat.color,
        items,
      });
    }

    return groups.length > 0 ? groups : TAREAS_GROUPED;
  }, [categoriesConfig]);

  useEffect(() => {
    if (tab === "activity" && !hasActivityAccess) {
      setTab("profile");
    }
  }, [hasActivityAccess, tab]);

  // Sincronización robusta de la labor manual al montar:
  // 1) Lee localStorage
  // 2) Escucha cambios entre pestañas vía evento 'storage'
  // 3) Si está vacío, consulta la base de datos Supabase para recuperar la labor activa no finalizada
  useEffect(() => {
    let currentTask: { type: string; label: string; start: number } | null = null;
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

    const handleStorage = (e: StorageEvent) => {
      if (e.key === "sekunet_manual_task") {
        if (e.newValue) {
          try {
            setManualTask(JSON.parse(e.newValue));
          } catch {}
        } else {
          setManualTask(null);
        }
      }
    };
    window.addEventListener("storage", handleStorage);

    // Consulta de respaldo a la base de datos si no hay tarea en localStorage
    if (!currentTask) {
      const today = new Date().toISOString().split("T")[0];
      fetch(`/api/activity/timeline?agent=${encodeURIComponent(agent.email)}&date=${today}`)
        .then((r) => r.json())
        .then((data) => {
          if (data?.timeline && Array.isArray(data.timeline)) {
            const sorted = [...data.timeline].filter((t: any) => Boolean(t.created_at));
            // Buscar el último Inició manual
            const lastStart = sorted.find((it: any) => {
              const act = (it.action || "").toLowerCase();
              return (act.startsWith("inició:") || act.startsWith("inicio:")) && (it.metadata?.manual || it.metadata?.task);
            });
            if (lastStart) {
              const startMs = new Date(lastStart.created_at).getTime();
              const hasEnd = sorted.some((it: any) => {
                const act = (it.action || "").toLowerCase();
                return (act.startsWith("terminó:") || act.startsWith("termino:")) && new Date(it.created_at).getTime() > startMs;
              });
              if (!hasEnd && (Date.now() - startMs < 10 * 60 * 60 * 1000)) {
                const label = lastStart.metadata?.task || lastStart.metadata?.label || lastStart.action.replace(/^inici[oó]:\s*/i, "").trim();
                const restored = { type: lastStart.category || "Labores manuales", label, start: startMs };
                setManualTask(restored);
                try { localStorage.setItem("sekunet_manual_task", JSON.stringify(restored)); } catch {}
              }
            }
          }
        })
        .catch(() => {});
    }

    return () => {
      window.removeEventListener("storage", handleStorage);
    };
  }, [agent.email]);

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

  const startManualTask = (type: string, label: string) => {
    if (manualTask) return;
    const taskObj = { type, label, start: Date.now() };
    setManualTask(taskObj);
    try {
      localStorage.setItem("sekunet_manual_task", JSON.stringify(taskObj));
    } catch {}
    logActivity({
      agent_email: agent.email,
      agent_name: fullName,
      action: `Inició: ${label}`,
      category: type,
      metadata: { manual: true, task: label },
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
      metadata: { manual: true, task: manualTask.label, duration_seconds: Math.round(duration / 1000) },
    });
    setManualTask(null);
    setManualElapsed("");
    try {
      localStorage.removeItem("sekunet_manual_task");
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

  // Marcar online al montar + auto-away por inactividad + heartbeat + registro de inicio de sesión
  useEffect(() => {
    fetch("/api/profile/status", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ status: "online", email: agent.email }) }).catch(() => {});
    
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

    // Heartbeat cada 2 minutos
    const heartbeat = setInterval(() => {
      fetch("/api/profile/status", { method: "POST", keepalive: true, headers: { "Content-Type": "application/json" }, body: JSON.stringify({ status: "online", email: agent.email }) }).catch(() => {});
    }, 120000);

    // Idle timer — auto switch to "away" after inactivity
    let idleTimer: ReturnType<typeof setTimeout>;
    let isIdle = false;
    const resetIdle = () => {
      if (isIdle) {
        isIdle = false;
        // Only restore to online if we were auto-set to away
        setStatus(prev => {
          if (prev === "away") {
            fetch("/api/profile/status", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ status: "online", email: agent.email }) }).catch(() => {});
            return "online";
          }
          return prev;
        });
      }
      clearTimeout(idleTimer);
      idleTimer = setTimeout(() => {
        setStatus(prev => {
          if (prev === "online") {
            isIdle = true;
            fetch("/api/profile/status", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ status: "away", email: agent.email }) }).catch(() => {});
            logActivity({ agent_email: agent.email, agent_name: fullName, action: `Sin actividad detectada por 5 minutos, estado cambiado automáticamente a "Ausente"`, category: "Inactividad", duration_ms: IDLE_TIMEOUT_MS });
            return "away";
          }
          return prev;
        });
      }, IDLE_TIMEOUT_MS);
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
  }, [agent.email, fullName]);

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
  const others = (onlineAgents || []).filter(a => a && a.email && a.email !== safeAgent.email && a.status !== "offline");

  return (
    <div className="border-t border-border">
      {/* Panel expandible */}
      {open && (
        <div className="border-b border-border bg-card overflow-y-auto" style={{ maxHeight: "70vh" }}>
          {/* Tabs */}
          <div className="flex border-b border-border">
            <button onClick={() => setTab("profile")} className={`flex-1 text-xs font-semibold py-2.5 transition-colors ${tab === "profile" ? "text-foreground border-b-2 border-violet-500" : "text-muted-foreground hover:text-foreground"}`}>Mi Perfil</button>
            <button onClick={() => setTab("team")} className={`flex-1 text-xs font-semibold py-2.5 transition-colors ${tab === "team" ? "text-foreground border-b-2 border-violet-500" : "text-muted-foreground hover:text-foreground"}`}>
              Equipo {others.length > 0 && <span className="ml-1 px-1.5 py-0.5 rounded-full bg-emerald-500/10 text-emerald-500 text-[10px]">{others.length}</span>}
            </button>
            {hasActivityAccess && (
              <button onClick={() => setTab("activity")} className={`flex-1 text-xs font-semibold py-2.5 transition-colors flex items-center justify-center gap-1.5 ${tab === "activity" ? "text-violet-500 border-b-2 border-violet-500" : "text-muted-foreground hover:text-foreground"}`} title="Activity Tracker">
                <ActivityIcon className="h-3.5 w-3.5 inline-block" />
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
                  <p className="font-semibold text-sm">{fullName}</p>
                  <p className="text-xs text-muted-foreground capitalize">{agent.rol}</p>
                  <p className="text-xs text-muted-foreground">{agent.email}</p>
                </div>
              </div>

              {/* Estado */}
              <div>
                <p className="text-xs font-semibold text-muted-foreground mb-2">Estado de conexión</p>
                <div className="grid grid-cols-2 gap-1.5">
                  {Object.entries(STATUS_LABELS).map(([key, { label, color }]) => (
                    <button key={key} onClick={() => handleStatusChange(key)}
                      className={`flex items-center gap-2 px-3 py-2 rounded-lg text-xs font-medium border transition-all ${status === key ? "border-violet-500/50 bg-violet-500/10 text-foreground" : "border-border hover:bg-muted/50 text-muted-foreground"}`}>
                      <span className={`h-2 w-2 rounded-full shrink-0 ${color}`} />
                      {label}
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

          {tab === "team" && (
            <div className="p-3 space-y-1 max-h-64 overflow-y-auto">
              {others.length === 0 ? (
                <p className="text-xs text-muted-foreground text-center py-4">No hay otros agentes conectados</p>
              ) : (
                others.map(a => {
                  const n = [a.nombre, a.apellido].filter(Boolean).join(" ") || a.email;
                  const s = STATUS_LABELS[a.status || "offline"] || STATUS_LABELS.offline;
                  return (
                    <div key={a.email} className="flex items-center gap-2.5 px-2 py-2 rounded-lg hover:bg-muted/50 transition-colors">
                      <div className="relative shrink-0">
                        <AvatarImg url={a.avatar_url} name={n} size={30} />
                        <span className={`absolute bottom-0 right-0 h-2.5 w-2.5 rounded-full border-2 border-card ${s.color}`} />
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="text-xs font-medium truncate">{n}</p>
                        <p className="text-[10px] text-muted-foreground">{s.label}</p>
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          )}

          {tab === "activity" && hasActivityAccess && (
            <div className="flex flex-col" style={{ minHeight: "440px", maxHeight: "560px" }}>
              {/* Header con gradiente y métricas con diseño amplio, sin textos cortados ni solapados */}
              <div className="p-3 bg-gradient-to-br from-violet-500/15 via-indigo-500/5 to-transparent border-b border-border/50 space-y-2.5">
                {/* Fila 1: Título de jornada + Estado/Entrada + Score */}
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2 min-w-0">
                    <div className="h-7 w-7 rounded-lg bg-violet-500/20 text-violet-400 grid place-items-center shrink-0 border border-violet-500/30">
                      <ActivityIcon className="h-4 w-4" />
                    </div>
                    <div className="min-w-0">
                      <span className="text-xs font-black tracking-tight text-foreground block leading-tight">
                        JORNADA 10H
                      </span>
                      {myMetrics?.firstLoginTime && (
                        <span className="text-[10px] text-muted-foreground font-mono leading-tight block">
                          Entrada: {myMetrics.firstLoginTime}
                        </span>
                      )}
                    </div>
                  </div>

                  <div className="flex flex-col items-end shrink-0">
                    <span className="text-[11px] font-black px-2 py-0.5 rounded-md bg-violet-500/15 text-violet-400 border border-violet-500/30 leading-tight">
                      {myMetrics?.productivityScore ?? 100}%
                    </span>
                    <span className="text-[9px] uppercase font-bold tracking-wider text-muted-foreground mt-0.5">
                      Efectividad
                    </span>
                  </div>
                </div>

                {/* Fila 2: Cuadrícula de métricas con tarjetas dedicadas para cero solapamientos */}
                <div className="grid grid-cols-2 gap-2 pt-1 border-t border-border/40">
                  <div className="bg-card/80 border border-emerald-500/25 rounded-xl p-2 flex flex-col justify-center">
                    <div className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
                      <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 animate-pulse shrink-0" />
                      <span className="truncate">Activo</span>
                    </div>
                    <p className="text-sm font-black text-emerald-400 mt-0.5 tracking-tight truncate">
                      {myMetrics?.totalActiveTime || "0m"}
                    </p>
                  </div>

                  <div className="bg-card/80 border border-sky-500/25 rounded-xl p-2 flex flex-col justify-center">
                    <div className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
                      <Clock className="h-2.5 w-2.5 text-sky-400 shrink-0" />
                      <span className="truncate">Restante</span>
                    </div>
                    <p className="text-sm font-black text-sky-400 mt-0.5 tracking-tight truncate">
                      {myMetrics?.deficitMs > 0 ? (myMetrics?.deficitTime || "0m") : "Cumplida"}
                    </p>
                  </div>
                </div>

                {/* Fila 3: Barra de progreso con porcentaje visible y sin textos solapados */}
                <div className="space-y-1 pt-0.5">
                  <div className="flex items-center justify-between text-[10px] font-semibold text-muted-foreground">
                    <span>Progreso</span>
                    <span className="font-bold text-foreground">
                      {Math.min(100, Math.round(((myMetrics?.totalActiveMs || 0) / (10 * 3600 * 1000)) * 100))}% de 10h
                    </span>
                  </div>
                  <div className="h-2 w-full rounded-full bg-slate-800/80 overflow-hidden flex border border-border/40">
                    <div
                      className="h-full bg-gradient-to-r from-emerald-500 to-teal-400 transition-all duration-500 rounded-full"
                      style={{
                        width: `${Math.min(100, Math.round(((myMetrics?.totalActiveMs || 0) / (10 * 3600 * 1000)) * 100))}%`
                      }}
                    />
                    <div
                      className="h-full bg-slate-700/40 transition-all duration-500"
                      style={{
                        width: `${Math.max(0, 100 - Math.min(100, Math.round(((myMetrics?.totalActiveMs || 0) / (10 * 3600 * 1000)) * 100)))}%`
                      }}
                    />
                  </div>
                </div>
              </div>

              {/* Timer manual activo si hay labor en curso */}
              {manualTask && (() => {
                const ActiveIcon = taskGroups.flatMap(g => g.items).find(i => i.label === manualTask.label)?.icon || Timer;
                return (
                  <div className="mx-3 mt-3 p-3 rounded-2xl bg-amber-500/10 border border-amber-500/30 shadow-sm space-y-2.5 animate-in fade-in slide-in-from-top-1">
                    {/* Fila superior: Ícono, Título y Cronómetro */}
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex items-center gap-2 min-w-0">
                        <div className="h-7 w-7 rounded-lg bg-amber-500/20 text-amber-400 grid place-items-center shrink-0 border border-amber-500/30">
                          <ActiveIcon className="h-4 w-4 animate-pulse" />
                        </div>
                        <div className="min-w-0">
                          <p className="text-xs font-black text-amber-400 truncate leading-tight" title={manualTask.label}>
                            {manualTask.label}
                          </p>
                          <p className="text-[10px] text-amber-500/80 font-medium leading-tight mt-0.5 truncate">
                            Auto-tracking en pausa
                          </p>
                        </div>
                      </div>
                      <span className="text-xs font-mono font-black text-amber-300 tabular-nums px-2 py-0.5 rounded-lg bg-amber-500/20 border border-amber-500/30 shrink-0">
                        {manualElapsed}
                      </span>
                    </div>

                    {/* Fila inferior: Botón Detener a ancho completo */}
                    <button
                      type="button"
                      onClick={stopManualTask}
                      className="w-full flex items-center justify-center gap-1.5 py-1.5 px-3 rounded-xl bg-amber-600 hover:bg-amber-500 text-white font-bold text-xs shadow-sm shadow-amber-600/30 transition-all active:scale-[0.98]"
                    >
                      <Square className="h-3 w-3 fill-current" />
                      <span>Detener labor</span>
                    </button>
                  </div>
                );
              })()}

              {/* Tareas Físicas / Fuera de Estación Directas */}
              <div className="flex-1 overflow-y-auto px-3 py-2.5 space-y-3">
                <div>
                  <h4 className="text-xs font-black text-foreground tracking-tight">Tareas Físicas / Fuera de Estación</h4>
                  <p className="text-[10px] text-muted-foreground mt-0.5 mb-2">
                    Selecciona una labor para pausar la recolección automática:
                  </p>
                </div>

                <div className="space-y-3 mt-1">
                  {taskGroups.map((group) => (
                    <div key={group.group}>
                      <h5 className="text-[10px] font-bold text-muted-foreground/70 uppercase tracking-wider mb-1.5 pl-1">{group.group}</h5>
                      <div className="grid grid-cols-2 gap-1.5">
                        {group.items.map((task) => {
                          const isCurrent = manualTask?.label === task.label;
                          const Icon = task.icon;
                          return (
                            <button
                              key={task.label}
                              title={task.label}
                              onClick={() => {
                                if (isCurrent) stopManualTask();
                                else startManualTask(task.category, task.label);
                              }}
                              className={`px-2.5 py-2 rounded-xl font-medium text-[10px] transition-all flex items-center gap-1.5 text-left border ${
                                isCurrent
                                  ? "bg-amber-500/10 border-amber-500/50 text-amber-500 shadow-sm"
                                  : "bg-card border-border hover:bg-muted hover:border-muted-foreground/30 text-muted-foreground"
                              }`}
                            >
                              {isCurrent ? <Timer className="h-3.5 w-3.5 animate-pulse shrink-0" /> : <Icon className="h-3.5 w-3.5 shrink-0 opacity-70" />}
                              <span className="truncate leading-tight">{task.short}</span>
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  ))}
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
        </div>
      )}

      {/* Modal: Mi Actividad Diaria & Justificación */}
      <ModalMyActivity
        isOpen={showActivityModal}
        onClose={() => setShowActivityModal(false)}
        agentEmail={agent.email}
        agentName={fullName}
      />

      {/* Barra inferior siempre visible */}
      <div className="p-3 space-y-2">
        <button onClick={() => setOpen(v => !v)} className="w-full flex items-center gap-2.5 px-2 py-2 rounded-xl hover:bg-muted/60 transition-colors group">
          <div className="relative shrink-0">
            <AvatarImg url={avatarUrl} name={fullName} size={36} />
            <span className={`absolute bottom-0 right-0 h-2.5 w-2.5 rounded-full border-2 border-card ${st.color}`} />
          </div>
          <div className="min-w-0 flex-1 text-left">
            <p className="text-sm font-medium truncate leading-tight">{fullName}</p>
            <p className="text-xs text-muted-foreground capitalize leading-tight">{safeAgent.rol || "agente"}</p>
          </div>
          <ChevronUp className={`h-4 w-4 text-muted-foreground shrink-0 transition-transform ${open ? "" : "rotate-180"}`} />
        </button>
        <div className="flex items-center justify-between gap-1 px-1">
          <div className="flex items-center gap-1">
            {/* Indicadores de agentes online */}
            {others.slice(0, 4).map(a => {
              const n = [a?.nombre, a?.apellido].filter(Boolean).join(" ") || a?.email || "Agente";
              const s = STATUS_LABELS[a?.status || "offline"] || STATUS_LABELS.offline;
              return (
                <div key={a?.email || Math.random().toString()} className="relative" title={`${n} — ${s.label}`}>
                  <AvatarImg url={a?.avatar_url} name={n} size={22} />
                  <span className={`absolute bottom-0 right-0 h-1.5 w-1.5 rounded-full border border-card ${s.color}`} />
                </div>
              );
            })}
            {others.length > 4 && <span className="text-[10px] text-muted-foreground ml-0.5">+{others.length - 4}</span>}
          </div>
          <button onClick={handleLogout} title="Cerrar sesión" className="p-1.5 rounded-lg text-muted-foreground hover:text-red-500 hover:bg-red-500/10 transition-colors">
            <LogOut className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>
    </div>
  );
}