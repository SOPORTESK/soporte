"use client";

import { useState, useRef, useEffect } from "react";
import { Camera, Lock, Eye, EyeOff, Check, X, ChevronUp, Circle, LogOut, Activity as ActivityIcon, FileText, ChevronRight, X as XIcon, RefreshCw, Wrench, Coffee, Timer } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { logActivity } from "@/lib/activity-client";

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
  busy:    { label: "Ocupado",       color: "bg-red-500" },
  lunch:   { label: "Almorzando",    color: "bg-orange-400" },
  offline: { label: "Desconectado",  color: "bg-zinc-400" },
};

const IDLE_TIMEOUT_MS = 5 * 60 * 1000; // 5 minutos

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
  const [myActivity, setMyActivity] = useState<any[]>([]);
  const [myMetrics, setMyMetrics] = useState<any>(null);
  const [showDetailModal, setShowDetailModal] = useState(false);
  const [showReportModal, setShowReportModal] = useState(false);
  const [myReport, setMyReport] = useState<string>("");
  const [loadingReport, setLoadingReport] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [lastUpdate, setLastUpdate] = useState<Date | null>(null);
  const [elapsed, setElapsed] = useState("");
  const [manualTask, setManualTask] = useState<{ type: string; label: string; start: number } | null>(null);
  const [manualElapsed, setManualElapsed] = useState("");

  useEffect(() => {
    if (tab !== "activity" || !open) return;
    const fetchActivity = () => {
      fetch(`/api/activity/timeline?agent=${encodeURIComponent(agent.email)}&date=${new Date().toISOString().split("T")[0]}`)
        .then(r => r.json())
        .then(d => setMyActivity(d.timeline || []))
        .catch(() => {});
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
    return () => { clearInterval(interval); clearInterval(ticker); };
  }, [tab, open, agent.email, lastUpdate, manualTask]);

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
    fetch(`/api/activity/timeline?agent=${encodeURIComponent(agent.email)}&date=${new Date().toISOString().split("T")[0]}`)
      .then(r => r.json())
      .then(d => setMyActivity(d.timeline || []))
      .catch(() => {});
    fetch(`/api/activity/timeline?agent=${encodeURIComponent(agent.email)}&date=${new Date().toISOString().split("T")[0]}&metrics=true`)
      .then(r => r.json())
      .then(d => setMyMetrics(d))
      .catch(() => {});
  };

  const handleMyReport = async () => {
    setLoadingReport(true);
    setShowReportModal(true);
    setMyReport("");
    try {
      const res = await fetch("/api/activity/process", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ agent_email: agent.email, agent_name: fullName, date: new Date().toISOString().split("T")[0] }),
      });
      const data = await res.json();
      if (data.report) {
        const r = data.report;
        setMyReport(`${r.resumen_ejecutivo || ""}\n\n--- Línea de tiempo ---\n${r.linea_tiempo || ""}\n\n--- Métricas ---\n${r.metricas || ""}\n\n--- Interpretación ---\n${r.interpretacion || ""}`);
      } else {
        setMyReport("No hay suficientes datos para generar un reporte.");
      }
    } catch (e) {
      setMyReport("Error al generar el reporte.");
    } finally {
      setLoadingReport(false);
    }
  };

  // Marcar online al montar + auto-away por inactividad + heartbeat
  useEffect(() => {
    if (!process.env.VERCEL) return;

    fetch("/api/profile/status", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ status: "online" }) }).catch(() => {});
    const handleUnload = () => navigator.sendBeacon("/api/profile/status", JSON.stringify({ status: "offline" }));
    window.addEventListener("beforeunload", handleUnload);

    // Heartbeat cada 30s para mantener last_seen_at actualizado
    const heartbeat = setInterval(() => {
      fetch("/api/profile/status", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ status: "online" }) }).catch(() => {});
    }, 30000);

    // Refrescar lista de agentes online cada 60s
    const refreshAgents = setInterval(() => router.refresh(), 60000);

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
      clearInterval(refreshAgents);
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
            <button onClick={() => setTab("activity")} className={`flex-1 text-xs font-semibold py-2.5 transition-colors ${tab === "activity" ? "text-foreground border-b-2 border-violet-500" : "text-muted-foreground hover:text-foreground"}`}>
              <ActivityIcon className="h-3.5 w-3.5 inline-block" />
            </button>
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

          {tab === "activity" && (
            <div className="flex flex-col" style={{ minHeight: "400px", maxHeight: "520px" }}>
              {/* Header con gradiente */}
              <div className="px-3 py-2.5 bg-gradient-to-br from-violet-500/10 via-indigo-500/5 to-transparent border-b border-border/50">
                <div className="flex items-center justify-between mb-1.5">
                  <span className="text-[11px] font-bold tracking-wide text-foreground/80 uppercase">Actividad de hoy</span>
                  <div className="flex items-center gap-1.5">
                    {elapsed && (
                      <span className="text-[9px] text-muted-foreground/70 flex items-center gap-0.5">
                        <span className="h-1 w-1 rounded-full bg-emerald-500 animate-pulse" />
                        {elapsed}
                      </span>
                    )}
                    <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded-full bg-violet-500/10 text-violet-500">
                      {myMetrics?.productivityScore || 0}%
                    </span>
                  </div>
                </div>
                <div className="flex items-center gap-2 text-[10px] text-muted-foreground mb-2">
                  <span className="flex items-center gap-1">
                    <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
                    {myMetrics?.totalActiveTime || "0m"} activo
                  </span>
                  <span className="text-border">|</span>
                  <span className="flex items-center gap-1">
                    <span className="h-1.5 w-1.5 rounded-full bg-zinc-400" />
                    {myMetrics?.totalIdleTime || "0m"} inactivo
                  </span>
                </div>
                <div className="h-1.5 rounded-full bg-muted overflow-hidden flex">
                  <div className="h-full bg-gradient-to-r from-emerald-500 to-teal-500 transition-all duration-500" style={{ width: `${myMetrics?.productivityScore || 0}%` }} />
                  <div className="h-full bg-zinc-600/40 transition-all duration-500" style={{ width: `${100 - (myMetrics?.productivityScore || 0)}%` }} />
                </div>
              </div>

              {/* Lista scrollable con cards */}
              <div className="flex-1 overflow-y-auto px-2.5 py-2 space-y-1" style={{ minHeight: "260px", maxHeight: "360px" }}>
                {myActivity.length === 0 ? (
                  <div className="flex flex-col items-center justify-center py-8 text-muted-foreground">
                    <ActivityIcon className="h-6 w-6 mb-2 opacity-30" />
                    <p className="text-[11px]">Sin actividad registrada hoy</p>
                  </div>
                ) : (
                  myActivity.slice(0, 30).map((e: any, i: number) => {
                    const catConfig: Record<string, { color: string; bg: string; ring: string }> = {
                      "Atención telefónica":      { color: "text-orange-400",  bg: "bg-orange-500/10",  ring: "bg-orange-500" },
                      "Mensajería":               { color: "text-green-400",   bg: "bg-green-500/10",   ring: "bg-green-500" },
                      "Atención de tickets":      { color: "text-blue-400",    bg: "bg-blue-500/10",    ring: "bg-blue-500" },
                      "Trámites de garantías":    { color: "text-purple-400",  bg: "bg-purple-500/10",  ring: "bg-purple-500" },
                      "Investigación y desarrollo": { color: "text-cyan-400",  bg: "bg-cyan-500/10",    ring: "bg-cyan-500" },
                      "Labores manuales":         { color: "text-amber-400",   bg: "bg-amber-500/10",   ring: "bg-amber-500" },
                      "Gestión de correos":       { color: "text-yellow-400",  bg: "bg-yellow-500/10",  ring: "bg-yellow-500" },
                      "Inactividad":              { color: "text-zinc-400",    bg: "bg-zinc-500/10",    ring: "bg-zinc-400" },
                      "Escalado":                 { color: "text-red-400",     bg: "bg-red-500/10",     ring: "bg-red-500" },
                      "Navegación":               { color: "text-sky-400",     bg: "bg-sky-500/10",     ring: "bg-sky-500" },
                      "Otros":                    { color: "text-violet-400",  bg: "bg-violet-500/10",  ring: "bg-violet-500" },
                    };
                    const cat = catConfig[e.category] || catConfig["Otros"];
                    const d = new Date(e.created_at);
                    const time = isNaN(d.getTime()) ? "" : d.toLocaleTimeString("es-CR", { hour: "2-digit", minute: "2-digit" });
                    return (
                      <div key={e.id} className={`group flex items-start gap-2 px-2.5 py-1.5 rounded-lg ${cat.bg} hover:bg-opacity-20 transition-all duration-150`}>
                        <div className="flex flex-col items-center pt-0.5 shrink-0">
                          <span className={`h-2 w-2 rounded-full ${cat.ring}`} />
                          {i < Math.min(myActivity.length, 30) - 1 && <span className="w-px h-full bg-border/40 mt-0.5" />}
                        </div>
                        <div className="flex-1 min-w-0 pb-1">
                          <p className="text-[11px] leading-snug text-foreground/90 line-clamp-2">{e.action}</p>
                          <div className="flex items-center gap-1.5 mt-0.5">
                            <span className="text-[9px] text-muted-foreground tabular-nums">{time}</span>
                            <span className={`text-[9px] font-medium ${cat.color}`}>· {e.category}</span>
                            {e.duration_ms && <span className="text-[9px] text-muted-foreground/70">· {Math.round(e.duration_ms / 1000)}s</span>}
                          </div>
                        </div>
                      </div>
                    );
                  })
                )}
              </div>

              {/* Timer manual activo */}
              {manualTask && (
                <div className="mx-2.5 mb-1 px-2.5 py-1.5 rounded-lg bg-amber-500/10 border border-amber-500/20 flex items-center justify-between">
                  <div className="flex items-center gap-1.5 min-w-0">
                    <Timer className="h-3 w-3 text-amber-500 shrink-0 animate-pulse" />
                    <span className="text-[10px] font-medium text-amber-600 truncate">{manualTask.label}</span>
                  </div>
                  <div className="flex items-center gap-1.5 shrink-0">
                    <span className="text-[10px] font-mono text-amber-600 tabular-nums">{manualElapsed}</span>
                    <button onClick={stopManualTask} className="text-[10px] font-semibold text-amber-700 hover:text-amber-800 px-1.5 py-0.5 rounded bg-amber-500/20 hover:bg-amber-500/30 transition-colors">
                      Detener
                    </button>
                  </div>
                </div>
              )}

              {/* Botones de tareas manuales */}
              {!manualTask && (
                <div className="px-2.5 flex gap-1.5">
                  <button
                    onClick={() => startManualTask("Labores manuales", "Salida a bodega")}
                    className="flex-1 flex items-center justify-center gap-1 text-[10px] font-medium px-1.5 py-1.5 rounded-lg bg-muted/40 hover:bg-muted/70 transition-colors"
                  >
                    <Wrench className="h-3 w-3" />
                    Bodega
                  </button>
                  <button
                    onClick={() => startManualTask("Labores manuales", "Acondicionamiento de demostradores")}
                    className="flex-1 flex items-center justify-center gap-1 text-[10px] font-medium px-1.5 py-1.5 rounded-lg bg-muted/40 hover:bg-muted/70 transition-colors"
                  >
                    <Wrench className="h-3 w-3" />
                    Demostradores
                  </button>
                  <button
                    onClick={() => startManualTask("Labores manuales", "Tarea manual")}
                    className="flex-1 flex items-center justify-center gap-1 text-[10px] font-medium px-1.5 py-1.5 rounded-lg bg-muted/40 hover:bg-muted/70 transition-colors"
                  >
                    <Wrench className="h-3 w-3" />
                    Otra
                  </button>
                  <button
                    onClick={() => startManualTask("Inactividad", "Almuerzo / Pausa")}
                    className="flex-1 flex items-center justify-center gap-1 text-[10px] font-medium px-1.5 py-1.5 rounded-lg bg-muted/40 hover:bg-muted/70 transition-colors"
                  >
                    <Coffee className="h-3 w-3" />
                    Almuerzo
                  </button>
                </div>
              )}

              {/* Footer con botones premium */}
              <div className="px-2.5 py-2 border-t border-border/50 space-y-1.5">
                <button
                  onClick={handleSync}
                  disabled={syncing}
                  className="w-full flex items-center justify-center gap-1.5 text-[11px] font-semibold px-2 py-2 rounded-lg bg-gradient-to-r from-violet-600 to-indigo-600 text-white hover:from-violet-700 hover:to-indigo-700 transition-all duration-200 disabled:opacity-50 shadow-sm"
                >
                  <RefreshCw className={`h-3 w-3 ${syncing ? "animate-spin" : ""}`} />
                  {syncing ? "Sincronizando..." : "Forzar sincronización"}
                </button>
                <div className="flex gap-1.5">
                  <button
                    onClick={() => setShowDetailModal(true)}
                    className="flex-1 flex items-center justify-center gap-1 text-[11px] font-medium px-2 py-1.5 rounded-lg bg-muted/50 hover:bg-muted transition-colors"
                  >
                    <ChevronRight className="h-3 w-3" />
                    Ver detalle
                  </button>
                  <button
                    onClick={handleMyReport}
                    className="flex-1 flex items-center justify-center gap-1 text-[11px] font-medium px-2 py-1.5 rounded-lg bg-muted/50 hover:bg-muted transition-colors"
                  >
                    <FileText className="h-3 w-3" />
                    Mi reporte
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>
      )}

          {/* Modal: Ver detalle */}
          {showDetailModal && (
            <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm" onClick={() => setShowDetailModal(false)}>
              <div className="bg-card border border-border rounded-xl shadow-2xl w-full max-w-lg max-h-[80vh] flex flex-col" onClick={e => e.stopPropagation()}>
                <div className="flex items-center justify-between px-4 py-3 border-b border-border">
                  <h3 className="text-sm font-bold">Mi actividad — Detalle del día</h3>
                  <button onClick={() => setShowDetailModal(false)} className="p-1 rounded-lg hover:bg-muted/50"><XIcon className="h-4 w-4" /></button>
                </div>
                <div className="flex-1 overflow-y-auto p-4 space-y-1.5">
                  {myActivity.length === 0 ? (
                    <p className="text-sm text-muted-foreground text-center py-8">Sin actividad registrada</p>
                  ) : myActivity.map((e: any) => {
                    const catColor =
                      e.category === "Atención de casos" ? "bg-blue-500" :
                      e.category === "Gestión de casos" ? "bg-emerald-500" :
                      e.category === "Inactividad" ? "bg-zinc-400" :
                      e.category === "Escalado" ? "bg-red-500" :
                      e.category === "Navegación" ? "bg-sky-500" :
                      e.category === "Gestión de correos" ? "bg-amber-500" :
                      e.category === "Soporte técnico" ? "bg-cyan-500" :
                      "bg-violet-500";
                    const d = new Date(e.created_at);
                    const time = isNaN(d.getTime()) ? "" : d.toLocaleTimeString("es-CR", { hour: "2-digit", minute: "2-digit" });
                    return (
                      <div key={e.id} className="flex items-start gap-2.5 px-3 py-2 rounded-lg hover:bg-muted/40 transition-colors">
                        <span className={`h-2 w-2 rounded-full mt-1.5 shrink-0 ${catColor}`} />
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium">{e.action}</p>
                          <p className="text-xs text-muted-foreground">{time} · {e.category}{e.duration_ms ? ` · ${Math.round(e.duration_ms / 1000)}s` : ""}</p>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          )}

          {/* Modal: Mi reporte IA */}
          {showReportModal && (
            <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm" onClick={() => setShowReportModal(false)}>
              <div className="bg-card border border-border rounded-xl shadow-2xl w-full max-w-lg max-h-[80vh] flex flex-col" onClick={e => e.stopPropagation()}>
                <div className="flex items-center justify-between px-4 py-3 border-b border-border">
                  <h3 className="text-sm font-bold">Mi reporte de actividad</h3>
                  <button onClick={() => setShowReportModal(false)} className="p-1 rounded-lg hover:bg-muted/50"><XIcon className="h-4 w-4" /></button>
                </div>
                <div className="flex-1 overflow-y-auto p-4">
                  {loadingReport ? (
                    <div className="flex flex-col items-center justify-center py-12">
                      <div className="h-6 w-6 border-2 border-violet-500 border-t-transparent rounded-full animate-spin mb-3" />
                      <p className="text-sm text-muted-foreground">Generando reporte con IA...</p>
                    </div>
                  ) : (
                    <div className="text-sm whitespace-pre-wrap leading-relaxed">{myReport}</div>
                  )}
                </div>
              </div>
            </div>
          )}

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