"use client";

import { Suspense, useState, useRef, useEffect } from "react";
import Link from "next/link";
import { usePathname, useSearchParams, useRouter } from "next/navigation";
import {
  Inbox, Wrench, FolderKanban, ShieldCheck, User,
  X, Camera, Lock, Eye, EyeOff, ChevronUp, LogOut,
  Moon, Sun, Monitor, Users
} from "lucide-react";
import { cn } from "@/lib/utils";
import { createClient } from "@/lib/supabase/client";
import { toast } from "sonner";
import { useTheme } from "next-themes";

interface OnlineAgent {
  email: string;
  nombre: string | null;
  apellido: string | null;
  avatar_url?: string | null;
  status?: string | null;
}

interface AgentData {
  email: string;
  nombre: string | null;
  apellido: string | null;
  rol: string;
  avatar_url?: string | null;
  status?: string | null;
}

export interface MobileBottomNavProps {
  isAdmin: boolean;
  agentName: string;
  avatarUrl: string | null;
  agent?: AgentData;
  onlineAgents?: OnlineAgent[];
}

export function MobileBottomNav(props: MobileBottomNavProps) {
  return (
    <Suspense fallback={<MobileBottomNavInner {...props} />}>
      <MobileBottomNavInner {...props} />
    </Suspense>
  );
}

/* ── Status config ── */
const STATUS_LABELS: Record<string, { label: string; color: string }> = {
  online:  { label: "En línea",      color: "bg-emerald-500" },
  away:    { label: "Ausente",       color: "bg-amber-400" },
  busy:    { label: "Ocupado",       color: "bg-red-500" },
  lunch:   { label: "Almorzando",    color: "bg-orange-400" },
  offline: { label: "Desconectado",  color: "bg-zinc-400" },
};

/* ── Avatar helper ── */
function NavAvatar({ url, name, size = 24 }: { url?: string | null; name: string; size?: number }) {
  const initials = name.split(" ").map(w => w[0]).slice(0, 2).join("").toUpperCase();
  const colors = ["bg-violet-500", "bg-indigo-500", "bg-sky-500", "bg-emerald-500", "bg-amber-500", "bg-rose-500"];
  const color = colors[name.charCodeAt(0) % colors.length];
  if (url) {
    return <img src={url} alt={name} style={{ width: size, height: size }} className="rounded-full object-cover" />;
  }
  return (
    <div style={{ width: size, height: size, fontSize: size * 0.38 }} className={`${color} rounded-full flex items-center justify-center text-white font-bold shrink-0`}>
      {initials}
    </div>
  );
}

function MobileBottomNavInner({ isAdmin, agentName, avatarUrl, agent, onlineAgents }: MobileBottomNavProps) {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [profileOpen, setProfileOpen] = useState(false);

  // Hide bottom nav when a chat is open on mobile (has ?c= param)
  const hasChatOpen = searchParams.has("c");

  const navItems = [
    { href: "/inbox", label: "Bandeja", icon: Inbox },
    { href: "/soporte-avanzado", label: "Soporte", icon: Wrench },
    { href: "/mi-gestion", label: "Gestión", icon: FolderKanban },
    ...(isAdmin ? [{ href: "/admin", label: "Admin", icon: ShieldCheck }] : []),
  ];

  const isActive = (href: string) => pathname === href || pathname.startsWith(href + "/");

  return (
    <>
      {/* ── Bottom navigation bar ── */}
      <nav
        className={cn(
          "lg:hidden border-t border-border bg-card/95 backdrop-blur-xl px-safe transition-all",
          hasChatOpen && "hidden md:flex"
        )}
        style={{ paddingBottom: "env(safe-area-inset-bottom, 0px)" }}
        aria-label="Navegación principal"
      >
        <div className="flex items-center justify-around px-1 pt-1.5 pb-1">
          {navItems.map(({ href, label, icon: Icon }) => {
            const active = isActive(href);
            return (
              <Link
                key={href}
                href={href}
                className={cn(
                  "flex flex-col items-center gap-0.5 px-2 py-1.5 rounded-xl transition-all min-w-[52px] touch-target",
                  active
                    ? "text-brand-700 dark:text-brand-300"
                    : "text-muted-foreground active:scale-95"
                )}
                aria-current={active ? "page" : undefined}
              >
                <div className={cn(
                  "flex items-center justify-center w-10 h-7 rounded-full transition-all",
                  active && "bg-brand-100 dark:bg-brand-900/40"
                )}>
                  <Icon className={cn("h-[18px] w-[18px]", active && "stroke-[2.5]")} />
                </div>
                <span className={cn(
                  "text-[10px] leading-tight",
                  active ? "font-bold" : "font-medium"
                )}>
                  {label}
                </span>
              </Link>
            );
          })}

          {/* Perfil tab */}
          <button
            onClick={() => setProfileOpen(true)}
            className={cn(
              "flex flex-col items-center gap-0.5 px-2 py-1.5 rounded-xl transition-all min-w-[52px] touch-target",
              profileOpen
                ? "text-brand-700 dark:text-brand-300"
                : "text-muted-foreground active:scale-95"
            )}
          >
            <div className={cn(
              "flex items-center justify-center w-10 h-7 rounded-full transition-all",
              profileOpen && "bg-brand-100 dark:bg-brand-900/40"
            )}>
              {avatarUrl ? (
                <img src={avatarUrl} alt="" className="h-5 w-5 rounded-full object-cover" />
              ) : (
                <User className="h-[18px] w-[18px]" />
              )}
            </div>
            <span className={cn(
              "text-[10px] leading-tight",
              profileOpen ? "font-bold" : "font-medium"
            )}>
              Perfil
            </span>
          </button>
        </div>
      </nav>

      {/* ── Mobile profile drawer ── */}
      {profileOpen && (
        <MobileProfileDrawer
          agent={agent}
          agentName={agentName}
          avatarUrl={avatarUrl}
          onlineAgents={onlineAgents || []}
          onClose={() => setProfileOpen(false)}
        />
      )}
    </>
  );
}

/* ═══════════════════════════════════════════════════
   Mobile Profile Drawer — full-screen slide-up sheet
   ═══════════════════════════════════════════════════ */

function MobileProfileDrawer({
  agent, agentName, avatarUrl, onlineAgents, onClose
}: {
  agent?: AgentData;
  agentName: string;
  avatarUrl: string | null;
  onlineAgents: OnlineAgent[];
  onClose: () => void;
}) {
  const router = useRouter();
  const supabase = createClient();
  const { theme, setTheme } = useTheme();

  const [tab, setTab] = useState<"profile" | "team">("profile");
  const [status, setStatus] = useState(agent?.status || "online");
  const [localAvatar, setLocalAvatar] = useState(avatarUrl);
  const [uploadingAvatar, setUploadingAvatar] = useState(false);
  const [showPwd, setShowPwd] = useState(false);
  const [pwd, setPwd] = useState("");
  const [pwd2, setPwd2] = useState("");
  const [showPwdVal, setShowPwdVal] = useState(false);
  const [showPwd2Val, setShowPwd2Val] = useState(false);
  const [savingPwd, setSavingPwd] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const st = STATUS_LABELS[status] || STATUS_LABELS.offline;
  const others = onlineAgents.filter(a => a.email !== agent?.email && a.status !== "offline");

  const handleStatusChange = async (s: string) => {
    setStatus(s);
    await fetch("/api/profile/status", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ status: s }) });
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
    if (res.ok) { setLocalAvatar(data.url + "?t=" + Date.now()); toast.success("Avatar actualizado"); router.refresh(); }
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
    await fetch("/api/profile/status", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ status: "offline" }) });
    await supabase.auth.signOut();
    router.push("/login");
  };

  // Close on Escape
  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [onClose]);

  return (
    <>
      {/* Overlay */}
      <div className="fixed inset-0 bg-black/50 z-40 lg:hidden" onClick={onClose} />

      {/* Drawer */}
      <div
        className="fixed inset-x-0 bottom-0 z-50 lg:hidden bg-card border-t border-border rounded-t-3xl shadow-2xl flex flex-col"
        style={{
          maxHeight: "85dvh",
          paddingBottom: "env(safe-area-inset-bottom, 0px)"
        }}
      >
        {/* Drag handle */}
        <div className="flex justify-center pt-3 pb-1">
          <div className="w-10 h-1 rounded-full bg-muted-foreground/30" />
        </div>

        {/* Header */}
        <div className="flex items-center justify-between px-5 pb-3">
          <h2 className="text-base font-bold">Mi Cuenta</h2>
          <button onClick={onClose} className="p-2 -mr-2 rounded-xl hover:bg-muted active:bg-muted/80 touch-target">
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Tabs */}
        <div className="flex border-b border-border mx-4">
          <button
            onClick={() => setTab("profile")}
            className={cn(
              "flex-1 text-xs font-semibold py-2.5 transition-colors border-b-2",
              tab === "profile" ? "text-foreground border-brand-600" : "text-muted-foreground hover:text-foreground border-transparent"
            )}
          >
            Mi Perfil
          </button>
          <button
            onClick={() => setTab("team")}
            className={cn(
              "flex-1 text-xs font-semibold py-2.5 transition-colors border-b-2",
              tab === "team" ? "text-foreground border-brand-600" : "text-muted-foreground hover:text-foreground border-transparent"
            )}
          >
            Equipo {others.length > 0 && (
              <span className="ml-1 px-1.5 py-0.5 rounded-full bg-emerald-500/10 text-emerald-500 text-[10px]">{others.length}</span>
            )}
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto scrollbar-none">
          {tab === "profile" && (
            <div className="p-5 space-y-5">
              {/* Avatar + info */}
              <div className="flex items-center gap-4">
                <div className="relative group cursor-pointer shrink-0" onClick={() => fileRef.current?.click()}>
                  <NavAvatar url={localAvatar} name={agentName} size={64} />
                  <div className="absolute inset-0 rounded-full bg-black/50 opacity-0 group-active:opacity-100 transition-opacity flex items-center justify-center">
                    {uploadingAvatar
                      ? <div className="h-4 w-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                      : <Camera className="h-5 w-5 text-white" />}
                  </div>
                  <div className={`absolute -bottom-0.5 -right-0.5 h-4 w-4 rounded-full border-2 border-card ${st.color}`} />
                </div>
                <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={handleAvatarChange} />
                <div className="min-w-0">
                  <p className="font-bold text-sm truncate">{agentName}</p>
                  <p className="text-xs text-muted-foreground capitalize">{agent?.rol || "agente"}</p>
                  <p className="text-xs text-muted-foreground truncate">{agent?.email}</p>
                </div>
              </div>

              {/* Estado */}
              <div>
                <p className="text-xs font-semibold text-muted-foreground mb-2">Estado de conexión</p>
                <div className="grid grid-cols-2 gap-2">
                  {Object.entries(STATUS_LABELS).map(([key, { label, color }]) => (
                    <button
                      key={key}
                      onClick={() => handleStatusChange(key)}
                      className={cn(
                        "flex items-center gap-2.5 px-3 py-2.5 rounded-xl text-xs font-medium border transition-all touch-target",
                        status === key
                          ? "border-brand-500/50 bg-brand-500/10 text-foreground"
                          : "border-border hover:bg-muted/50 text-muted-foreground active:bg-muted"
                      )}
                    >
                      <span className={`h-2.5 w-2.5 rounded-full shrink-0 ${color}`} />
                      {label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Tema */}
              <div>
                <p className="text-xs font-semibold text-muted-foreground mb-2">Apariencia</p>
                <div className="flex gap-2">
                  {[
                    { v: "light", icon: <Sun className="h-4 w-4" />, label: "Claro" },
                    { v: "system", icon: <Monitor className="h-4 w-4" />, label: "Auto" },
                    { v: "dark", icon: <Moon className="h-4 w-4" />, label: "Oscuro" },
                  ].map(o => (
                    <button
                      key={o.v}
                      onClick={() => setTheme(o.v)}
                      className={cn(
                        "flex-1 flex items-center justify-center gap-2 px-3 py-2.5 rounded-xl text-xs font-medium border transition-all touch-target",
                        theme === o.v
                          ? "border-brand-500/50 bg-brand-700 text-white"
                          : "border-border text-muted-foreground hover:bg-muted/50 active:bg-muted"
                      )}
                    >
                      {o.icon}
                      {o.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Cambiar contraseña */}
              <div>
                <button
                  onClick={() => setShowPwd(v => !v)}
                  className="w-full flex items-center justify-between text-xs font-semibold text-muted-foreground hover:text-foreground transition-colors py-2 touch-target"
                >
                  <span className="flex items-center gap-1.5"><Lock className="h-3.5 w-3.5" /> Cambiar contraseña</span>
                  <ChevronUp className={`h-3.5 w-3.5 transition-transform ${showPwd ? "" : "rotate-180"}`} />
                </button>
                {showPwd && (
                  <div className="mt-2 space-y-2.5">
                    <div className="relative">
                      <input
                        type={showPwdVal ? "text" : "password"} placeholder="Nueva contraseña"
                        value={pwd} onChange={e => setPwd(e.target.value)}
                        className="w-full text-sm px-3 py-2.5 rounded-xl border border-border bg-background pr-10 focus:outline-none focus:ring-2 focus:ring-brand-500/30"
                      />
                      <button type="button" onClick={() => setShowPwdVal(v => !v)} className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground touch-target">
                        {showPwdVal ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                      </button>
                    </div>
                    <div className="relative">
                      <input
                        type={showPwd2Val ? "text" : "password"} placeholder="Confirmar contraseña"
                        value={pwd2} onChange={e => setPwd2(e.target.value)}
                        className="w-full text-sm px-3 py-2.5 rounded-xl border border-border bg-background pr-10 focus:outline-none focus:ring-2 focus:ring-brand-500/30"
                      />
                      <button type="button" onClick={() => setShowPwd2Val(v => !v)} className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground touch-target">
                        {showPwd2Val ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                      </button>
                    </div>
                    {pwd && pwd2 && (
                      <p className={`text-xs ${pwd === pwd2 ? "text-emerald-500" : "text-red-500"}`}>
                        {pwd === pwd2 ? "✓ Las contraseñas coinciden" : "✗ No coinciden"}
                      </p>
                    )}
                    <button
                      onClick={handlePasswordSave}
                      disabled={savingPwd || pwd.length < 8 || pwd !== pwd2}
                      className="w-full py-2.5 rounded-xl bg-brand-600 hover:bg-brand-700 text-white text-sm font-semibold disabled:opacity-50 transition-colors touch-target"
                    >
                      {savingPwd ? "Guardando..." : "Guardar contraseña"}
                    </button>
                  </div>
                )}
              </div>

              {/* Logout */}
              <button
                onClick={handleLogout}
                className="w-full flex items-center justify-center gap-2 py-3 rounded-xl border border-red-200 dark:border-red-900/50 text-red-600 dark:text-red-400 text-sm font-semibold hover:bg-red-50 dark:hover:bg-red-900/20 active:bg-red-100 dark:active:bg-red-900/30 transition-colors touch-target"
              >
                <LogOut className="h-4 w-4" />
                Cerrar sesión
              </button>
            </div>
          )}

          {tab === "team" && (
            <div className="p-4 space-y-1.5">
              {others.length === 0 ? (
                <div className="text-center py-8">
                  <Users className="h-8 w-8 text-muted-foreground/40 mx-auto mb-2" />
                  <p className="text-xs text-muted-foreground">No hay otros agentes conectados</p>
                </div>
              ) : (
                others.map(a => {
                  const n = [a.nombre, a.apellido].filter(Boolean).join(" ") || a.email;
                  const s = STATUS_LABELS[a.status || "offline"] || STATUS_LABELS.offline;
                  return (
                    <div key={a.email} className="flex items-center gap-3 px-3 py-2.5 rounded-xl hover:bg-muted/50 active:bg-muted transition-colors">
                      <div className="relative shrink-0">
                        <NavAvatar url={a.avatar_url} name={n} size={36} />
                        <span className={`absolute bottom-0 right-0 h-2.5 w-2.5 rounded-full border-2 border-card ${s.color}`} />
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-medium truncate">{n}</p>
                        <p className="text-xs text-muted-foreground">{s.label}</p>
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          )}
        </div>
      </div>
    </>
  );
}
