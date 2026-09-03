"use client";

import { useState, useRef, useEffect } from "react";
import { Camera, Lock, Eye, EyeOff, Check, X, ChevronUp, Circle, LogOut, Activity as ActivityIcon, FileText, ChevronRight, X as XIcon, RefreshCw, Wrench, Coffee, Timer, BarChart3 } from "lucide-react";
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

const TAREAS_FISICAS = [
  { label: "Ir a Bodega", category: "Labores manuales" },
  { label: "Ir a Ventanilla", category: "Atención presencial" },
  { label: "Ir al Baño", category: "Pausa personal" },
  { label: "Iniciar Diagnóstico Físico", category: "Soporte técnico" },
  { label: "Reunión", category: "Reunión interna" },
  { label: "Exhibidores", category: "Labores manuales" },
  { label: "Soporte a Ventas", category: "Soporte comercial" },
  { label: "Capacitacion de clientes", category: "Capacitación" },
  { label: "Inventario y Actualización de Bodega GAR", category: "Inventario" },
  { label: "Limpieza de taller", category: "Mantenimiento" },
  { label: "Capacitacion de Personal", category: "Capacitación" },
];

function AvatarImg({ url, name, size = 36 }: { url?: string | null; name: string; size?: number }) {
  const initials = name.split(" ").map(w => w[0]).slice(0, 2).join("").toUpperCase();
  const colors = ["bg-violet-500", "bg-indigo-500", "bg-sky-500", "bg-emerald-500", "bg-amber-500", "bg-rose-500"];
  const color = colors[name.charCodeAt(0) % colors.length];

  if (url) {
    return <img src={url} alt={name} style={{ width: size, height: size }} className="rounded-full object-cover ring-2 ring-border" />;
  }
  return (
    <div style={{ width: size, height: size, fontSize: size * 0.35 }} className={`${color} rounded-full flex items-center justify-center text-white font-bold shrink-0`}>
      {initials}
    </div>
  );
}

export function SidebarUserPanel({ agent, onlineAgents }: { agent: Agent; onlineAgents: OnlineAgent[] }) {
  const canAccessAdmin = ["admin", "superadmin"].includes(agent.rol);
  const [open, setOpen] = useState(false);
  const [tab, setTab] = useState<"profile" | "team" | "activity">("profile");
  const [status, setStatus] = useState(agent.status || "online");
  const [avatarUrl, setAvatarUrl] = useState(agent.avatar_url || null);
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
  const fullName = [agent.nombre, agent.apellido].filter(Boolean).join(" ") || agent.email;
  const [myMetrics, setMyMetrics] = useState<any>(null);
  const [showActivityModal, setShowActivityModal] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [lastUpdate, setLastUpdate] = useState<Date | null>(null);
  const [elapsed, setElapsed] = useState("");
  const [manualTask, setManualTask] = useState<{ type: string; label: string; start: number } | null>(null);
  const [manualElapsed, setManualElapsed] = useState("");

  useEffect(() => {
    if (tab !== "activity" || !open) return;
    const fetchActivity = () => {
      fetch(`/api/activity/timeline?agent=${encodeURIComponent(agent.email)}&date=${new Date().toISOString().split("T")[0]}&metrics=true`)
        .then(r => r.json())
        .then(d => setMyMetrics(d))
        .catch(() => {});
    };
    fetchActivity();
    setLastUpdate(new Date());
    const interval = setInterval(() => {
      fetchActivity();
      setLastUpdate(new Date());
    }, 600000);
    return () => { clearInterval(interval); };
  }, [tab, open, agent.email]);

  // Ticker separado: solo actualiza los textos "hace Xs". Va aparte del fetch
  // porque antes compartían efecto y setLastUpdate se re-disparaba a sí mismo,
  // provocando un bucle infinito de llamadas a /api/activity/timeline.
  useEffect(() => {
    if (tab !== "activity" || !open) return;
    const ticker = setInterval(() => {
      if (lastUpdate) {
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
    setManualTask({ type, label, start: Date.now() });
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
    const duration = Date.now() - manualTask.start;
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
    fetch(`/api/activity/timeline?agent=${encodeURIComponent(agent.email)}&date=${new Date().toISOString().split("T")[0]}&metrics=true`)
      .then(r => r.json())
      .then(d => setMyMetrics(d))
      .catch(() => {});
  };

  // Marcar online al montar + auto-away por inactividad + heartbeat
  useEffect(() => {
    fetch("/api/profile/status", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ status: "online" }) }).catch(() => {});
    const handleUnload = () => navigator.sendBeacon("/api/profile/status", JSON.stringify({ status: "offline" }));
    window.addEventListener("beforeunload", handleUnload);

    // Heartbeat cada 2 minutos (era 30s — causaba acumulación de queries bloqueadas)
    const heartbeat = setInterval(() => {
      fetch("/api/profile/status", { method: "POST", keepalive: true, headers: { "Content-Type": "application/json" }, body: JSON.stringify({ status: "online" }) }).catch(() => {});
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
            fetch("/api/profile/status", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ status: "online" }) }).catch(() => {});
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
            fetch("/api/profile/status", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ status: "away" }) }).catch(() => {});
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
  }, []);

  const handleStatusChange = async (s: string) => {
    setStatus(s);
    await fetch("/api/profile/status", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ status: s }) }).catch(() => {});
    logActivity({ agent_email: agent.email, agent_name: fullName, action: `Cambió su estado de conexión de "${status}" a "${s}"`, category: "Actividad general", metadata: { from: status, to: s } });
    router.refresh();
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
    await fetch("/api/profile/status", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ status: "offline" }) }).catch(() => {});
    await supabase.auth.signOut();
    router.push("/login");
  };

  const st = STATUS_LABELS[status] || STATUS_LABELS.offline;
  const others = onlineAgents.filter(a => a.email !== agent.email && a.status !== "offline");

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
            {canAccessAdmin && (
            <button onClick={() => setTab("activity")} className={`flex-1 text-xs font-semibold py-2.5 transition-colors ${tab === "activity" ? "text-foreground border-b-2 border-violet-500" : "text-muted-foreground hover:text-foreground"}`}>
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

          {tab === "activity" && canAccessAdmin && (
            <div className="flex flex-col" style={{ minHeight: "440px", maxHeight: "560px" }}>
              {/* Header con gradiente y métricas */}
              <div className="px-3.5 py-3 bg-gradient-to-br from-violet-500/15 via-indigo-500/5 to-transparent border-b border-border/50">
                <div className="flex items-center justify-between mb-1.5">
                  <span className="text-[11px] font-black tracking-wider text-foreground uppercase flex items-center gap-1.5">
                    <ActivityIcon className="h-3.5 w-3.5 text-violet-500" /> Actividad de hoy
                  </span>
                  <div className="flex items-center gap-1.5">
                    {elapsed && (
                      <span className="text-[9px] text-muted-foreground flex items-center gap-1">
                        <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 animate-pulse" />
                        {elapsed}
                      </span>
                    )}
                    <span className="text-[10px] font-black px-2 py-0.5 rounded-full bg-violet-500/15 text-violet-400 border border-violet-500/20">
                      {myMetrics?.productivityScore || 0}%
                    </span>
                  </div>
                </div>
                <div className="flex items-center gap-2 text-[10px] font-medium text-muted-foreground mb-2">
                  <span className="flex items-center gap-1 text-emerald-500 font-bold">
                    <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
                    {myMetrics?.totalActiveTime || "0m"} activo
                  </span>
                  <span className="text-border">|</span>
                  <span className="flex items-center gap-1 text-zinc-400 font-semibold">
                    <span className="h-1.5 w-1.5 rounded-full bg-zinc-400" />
                    {myMetrics?.totalIdleTime || "0m"} inactivo
                  </span>
                </div>
                <div className="h-2 rounded-full bg-muted/60 overflow-hidden flex shadow-inner">
                  <div className="h-full bg-gradient-to-r from-emerald-500 to-teal-400 transition-all duration-500" style={{ width: `${myMetrics?.productivityScore || 0}%` }} />
                  <div className="h-full bg-zinc-700/40 transition-all duration-500" style={{ width: `${100 - (myMetrics?.productivityScore || 0)}%` }} />
                </div>
              </div>

              {/* Timer manual activo si hay labor en curso */}
              {manualTask && (
                <div className="m-3 p-3 rounded-2xl bg-amber-500/10 border border-amber-500/30 flex items-center justify-between shadow-sm animate-in fade-in">
                  <div className="flex items-center gap-2 min-w-0">
                    <Timer className="h-4 w-4 text-amber-500 shrink-0 animate-pulse" />
                    <div>
                      <p className="text-[11px] font-bold text-amber-500 truncate leading-tight">{manualTask.label}</p>
                      <p className="text-[10px] text-amber-600/80 font-medium">Recolección automática en pausa</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <span className="text-xs font-mono font-black text-amber-500 tabular-nums px-2 py-0.5 rounded-lg bg-amber-500/15 border border-amber-500/20">
                      {manualElapsed}
                    </span>
                    <button
                      onClick={stopManualTask}
                      className="text-xs font-bold text-white px-2.5 py-1 rounded-xl bg-amber-600 hover:bg-amber-700 transition-colors shadow-sm"
                    >
                      Detener
                    </button>
                  </div>
                </div>
              )}

              {/* Tareas Físicas / Fuera de Estación Directas */}
              <div className="flex-1 overflow-y-auto px-3 py-2.5 space-y-2.5">
                <div>
                  <h4 className="text-xs font-black text-foreground tracking-tight">Tareas Físicas / Fuera de Estación</h4>
                  <p className="text-[10px] text-muted-foreground mt-0.5">
                    Selecciona una labor para pausar la recolección automática:
                  </p>
                </div>

                <div className="grid grid-cols-2 gap-2">
                  {TAREAS_FISICAS.map((task) => {
                    const isCurrent = manualTask?.label === task.label;
                    return (
                      <button
                        key={task.label}
                        onClick={() => {
                          if (isCurrent) stopManualTask();
                          else startManualTask(task.category, task.label);
                        }}
                        className={`w-full p-2.5 rounded-xl font-bold text-[11px] leading-tight text-center transition-all shadow-sm ${
                          isCurrent
                            ? "bg-amber-500 text-white ring-2 ring-amber-500/50 scale-[1.02]"
                            : "bg-blue-600 hover:bg-blue-700 active:bg-blue-800 text-white hover:scale-[1.02] active:scale-[0.98] shadow-blue-600/20"
                        }`}
                      >
                        {task.label}
                      </button>
                    );
                  })}
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
            <p className="text-xs text-muted-foreground capitalize leading-tight">{agent.rol}</p>
          </div>
          <ChevronUp className={`h-4 w-4 text-muted-foreground shrink-0 transition-transform ${open ? "" : "rotate-180"}`} />
        </button>
        <div className="flex items-center justify-between gap-1 px-1">
          <div className="flex items-center gap-1">
            {/* Indicadores de agentes online */}
            {others.slice(0, 4).map(a => {
              const n = [a.nombre, a.apellido].filter(Boolean).join(" ") || a.email;
              const s = STATUS_LABELS[a.status || "offline"] || STATUS_LABELS.offline;
              return (
                <div key={a.email} className="relative" title={`${n} — ${s.label}`}>
                  <AvatarImg url={a.avatar_url} name={n} size={22} />
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