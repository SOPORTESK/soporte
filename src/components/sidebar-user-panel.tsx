"use client";

import { useState, useRef, useEffect } from "react";
import { Camera, Lock, Eye, EyeOff, Check, X, ChevronUp, Circle, LogOut } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { useRouter } from "next/navigation";
import { toast } from "sonner";

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
  const [tab, setTab] = useState<"profile" | "team">("profile");
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

  // Marcar online al montar + auto-away por inactividad + heartbeat
  useEffect(() => {
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
          // Only auto-away from "online" — don't override manual states
          if (prev === "online") {
            isIdle = true;
            fetch("/api/profile/status", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ status: "away" }) }).catch(() => {});
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
        <div className="border-b border-border bg-card">
          {/* Tabs */}
          <div className="flex border-b border-border">
            <button onClick={() => setTab("profile")} className={`flex-1 text-xs font-semibold py-2.5 transition-colors ${tab === "profile" ? "text-foreground border-b-2 border-violet-500" : "text-muted-foreground hover:text-foreground"}`}>Mi Perfil</button>
            <button onClick={() => setTab("team")} className={`flex-1 text-xs font-semibold py-2.5 transition-colors ${tab === "team" ? "text-foreground border-b-2 border-violet-500" : "text-muted-foreground hover:text-foreground"}`}>
              Equipo {others.length > 0 && <span className="ml-1 px-1.5 py-0.5 rounded-full bg-emerald-500/10 text-emerald-500 text-[10px]">{others.length}</span>}
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
