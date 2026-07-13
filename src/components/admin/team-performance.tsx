"use client";

import { useState } from "react";
import Link from "next/link";
import {
  Edit2, Trash2, Save, X, Shield, UserCheck, Activity, UserPlus, Key, Loader2,
  TrendingUp, TrendingDown, Clock, Star, CheckCircle, MessageSquare, Zap, Bot,
  Award, Target, BarChart3, ArrowUpRight, ChevronDown, ChevronUp, Minus, Eye
} from "lucide-react";
import { Badge } from "@/components/ui/avatar";

interface AgentPerformance {
  email: string;
  nombre: string | null;
  apellido: string | null;
  rol: string;
  telefono: string | null;
  last_login: string | null;
  // Stats
  totalAtendidos: number;
  resueltos: number;
  tasaResolucion: number;
  avgSLA: number;
  avgCalificacionCliente: string;
  calificacionesClienteCount: number;
  casosHoy: number;
  casosEstaSemana: number;
  tendencia: "up" | "down" | "stable";
}

interface TeamPerformanceProps {
  agents: AgentPerformance[];
  isSuperadmin: boolean;
  globalStats: {
    totalCasos: number;
    totalResueltos: number;
    tasaResolucion: number;
    avgSLA: number;
    avgCalificacionClienteGlobal: string;
    casosHoy: number;
    casosEstaSemana: number;
    cargaPromedio: number;
    pctIA?: number;
    totalIA?: number;
    casosHumanos?: number;
  };
}

const Modal = ({ title, onClose, children }: { title: string; onClose: () => void; children: React.ReactNode }) => (
  <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4 animate-fade-in">
    <div className="bg-card border border-border rounded-2xl p-6 max-w-md w-full shadow-2xl">
      <div className="flex items-center justify-between mb-5">
        <h3 className="text-lg font-semibold">{title}</h3>
        <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-muted transition-colors">
          <X className="h-5 w-5" />
        </button>
      </div>
      {children}
    </div>
  </div>
);

export function TeamPerformance({ agents, isSuperadmin, globalStats }: TeamPerformanceProps) {
  const [editingAgent, setEditingAgent] = useState<AgentPerformance | null>(null);
  const [resettingAgent, setResettingAgent] = useState<AgentPerformance | null>(null);
  const [isInviting, setIsInviting] = useState(false);
  const [loading, setLoading] = useState(false);
  const [formData, setFormData] = useState<Record<string, any>>({});
  const [expandedAgent, setExpandedAgent] = useState<string | null>(null);
  const [sortBy, setSortBy] = useState<"resueltos" | "calificacion" | "sla" | "nombre">("resueltos");

  const sortedAgents = [...agents].sort((a, b) => {
    switch (sortBy) {
      case "resueltos": return b.resueltos - a.resueltos;
      case "calificacion":
        const calA = a.avgCalificacionCliente === "N/A" ? 0 : parseFloat(a.avgCalificacionCliente);
        const calB = b.avgCalificacionCliente === "N/A" ? 0 : parseFloat(b.avgCalificacionCliente);
        return calB - calA;
      case "sla": return a.avgSLA - b.avgSLA;
      case "nombre": return (a.nombre || a.email).localeCompare(b.nombre || b.email);
      default: return 0;
    }
  });

  const handleSaveRole = async () => {
    if (!formData.email || !formData.rol) return;
    try {
      const res = await fetch("/api/admin/agentes", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: formData.email, rol: formData.rol })
      });
      if (res.ok) { window.location.reload(); }
      else { alert("Error al actualizar rol"); }
    } catch { alert("Error de conexión"); }
    setEditingAgent(null);
  };

  const handleDelete = async (email: string) => {
    if (!confirm("¿Estás seguro de eliminar este agente? Esta acción no se puede deshacer.")) return;
    try {
      const res = await fetch(`/api/admin/agentes?email=${email}`, { method: "DELETE" });
      if (res.ok) { window.location.reload(); }
      else { alert("Error al eliminar agente"); }
    } catch { alert("Error de conexión"); }
  };

  const handleInvite = async () => {
    if (!formData.email || !formData.password || !formData.nombre) {
      alert("Email, contraseña y nombre son obligatorios");
      return;
    }
    setLoading(true);
    try {
      const res = await fetch("/api/admin/agentes/invite", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(formData)
      });
      if (res.ok) { window.location.reload(); }
      else { const d = await res.json(); alert("Error: " + d.error); }
    } catch { alert("Error de conexión"); }
    setLoading(false);
  };

  const handleResetPassword = async () => {
    if (!resettingAgent || !formData.password) return;
    setLoading(true);
    try {
      const res = await fetch("/api/admin/agentes/reset-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: resettingAgent.email, newPassword: formData.password })
      });
      if (res.ok) { alert("Contraseña actualizada"); setResettingAgent(null); }
      else { const d = await res.json(); alert("Error: " + d.error); }
    } catch { alert("Error de conexión"); }
    setLoading(false);
  };

  const getPerformanceColor = (tasa: number) => {
    if (tasa >= 80) return "text-emerald-500";
    if (tasa >= 60) return "text-amber-500";
    return "text-rose-500";
  };

  const getPerformanceBg = (tasa: number) => {
    if (tasa >= 80) return "bg-emerald-500/10 border-emerald-500/20";
    if (tasa >= 60) return "bg-amber-500/10 border-amber-500/20";
    return "bg-rose-500/10 border-rose-500/20";
  };

  const getPerformanceRing = (tasa: number) => {
    if (tasa >= 80) return "ring-emerald-500/30";
    if (tasa >= 60) return "ring-amber-500/30";
    return "ring-rose-500/30";
  };

  const getTrendIcon = (trend: "up" | "down" | "stable") => {
    switch (trend) {
      case "up": return <TrendingUp className="h-3.5 w-3.5 text-emerald-500" />;
      case "down": return <TrendingDown className="h-3.5 w-3.5 text-rose-500" />;
      default: return <Minus className="h-3.5 w-3.5 text-muted-foreground" />;
    }
  };

  const formatSLA = (mins: number) => {
    if (mins === 0) return "—";
    if (mins < 60) return `${mins}m`;
    const h = Math.floor(mins / 60);
    const m = mins % 60;
    return m > 0 ? `${h}h ${m}m` : `${h}h`;
  };

  // Performance score (0-100)
  const getPerformanceScore = (agent: AgentPerformance) => {
    let score = 0;
    score += agent.tasaResolucion * 0.4; // 40% tasa resolución
    const calNum = agent.avgCalificacionCliente === "N/A" ? 3 : parseFloat(agent.avgCalificacionCliente);
    score += (calNum / 5) * 100 * 0.35; // 35% calificación del cliente
    const slaScore = agent.avgSLA === 0 ? 50 : Math.max(0, 100 - (agent.avgSLA / 60) * 10);
    score += slaScore * 0.25; // 25% SLA
    return Math.round(Math.min(100, score));
  };

  return (
    <>
      {/* ── TEAM PERFORMANCE OVERVIEW ─────────────────────── */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {/* Score del equipo */}
        <div className="relative rounded-2xl border border-brand-500/20 bg-gradient-to-br from-brand-500/5 to-transparent p-5 overflow-hidden ring-1 ring-brand-500/10">
          <div className="absolute -top-8 -right-8 h-28 w-28 rounded-full bg-brand-500/10 blur-2xl" />
          <div className="relative">
            <div className="flex items-center gap-2 mb-3">
              <div className="h-9 w-9 rounded-xl bg-brand-500/10 text-brand-500 grid place-items-center">
                <Target className="h-4 w-4" />
              </div>
              <span className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">Score Equipo</span>
            </div>
            <p className="text-5xl font-black tracking-tight text-brand-500 tabular-nums">{globalStats.tasaResolucion}%</p>
            <p className="text-[11px] text-muted-foreground mt-1">Tasa de resolución global</p>
          </div>
        </div>

        {/* SLA Promedio */}
        <div className="relative rounded-2xl border border-sky-500/20 bg-gradient-to-br from-sky-500/5 to-transparent p-5 overflow-hidden ring-1 ring-sky-500/10">
          <div className="absolute -top-8 -right-8 h-28 w-28 rounded-full bg-sky-500/10 blur-2xl" />
          <div className="relative">
            <div className="flex items-center gap-2 mb-3">
              <div className="h-9 w-9 rounded-xl bg-sky-500/10 text-sky-500 grid place-items-center">
                <Clock className="h-4 w-4" />
              </div>
              <span className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">SLA Promedio</span>
            </div>
            <p className="text-5xl font-black tracking-tight text-sky-500 tabular-nums">{formatSLA(globalStats.avgSLA)}</p>
            <p className="text-[11px] text-muted-foreground mt-1">IA + humanos · global</p>
          </div>
        </div>

        {/* Satisfacción */}
        <div className="relative rounded-2xl border border-amber-500/20 bg-gradient-to-br from-amber-500/5 to-transparent p-5 overflow-hidden ring-1 ring-amber-500/10">
          <div className="absolute -top-8 -right-8 h-28 w-28 rounded-full bg-amber-500/10 blur-2xl" />
          <div className="relative">
            <div className="flex items-center gap-2 mb-3">
              <div className="h-9 w-9 rounded-xl bg-amber-500/10 text-amber-500 grid place-items-center">
                <Star className="h-4 w-4" />
              </div>
              <span className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">Calif. cliente</span>
            </div>
            <p className="text-5xl font-black tracking-tight text-amber-500 tabular-nums">
              {globalStats.avgCalificacionClienteGlobal !== "N/A" ? globalStats.avgCalificacionClienteGlobal : "—"}
            </p>
            <p className="text-[11px] text-muted-foreground mt-1">
              {globalStats.avgCalificacionClienteGlobal !== "N/A" ? "de 5.0 · promedio global del cliente" : "sin calificaciones aún"}
            </p>
          </div>
        </div>

        {/* Actividad Hoy */}
        <div className="relative rounded-2xl border border-emerald-500/20 bg-gradient-to-br from-emerald-500/5 to-transparent p-5 overflow-hidden ring-1 ring-emerald-500/10">
          <div className="absolute -top-8 -right-8 h-28 w-28 rounded-full bg-emerald-500/10 blur-2xl" />
          <div className="relative">
            <div className="flex items-center gap-2 mb-3">
              <div className="h-9 w-9 rounded-xl bg-emerald-500/10 text-emerald-500 grid place-items-center">
                <Zap className="h-4 w-4" />
              </div>
              <span className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">Hoy</span>
            </div>
            <p className="text-5xl font-black tracking-tight text-emerald-500 tabular-nums">{globalStats.casosHoy}</p>
            <p className="text-[11px] text-muted-foreground mt-1">{globalStats.casosEstaSemana} esta semana</p>
          </div>
        </div>
      </div>

      {/* ── AUTOMATIZACIÓN IA — banner compacto ─────────────── */}
      <div className="relative rounded-2xl border border-cyan-500/20 bg-gradient-to-br from-cyan-500/5 via-transparent to-cyan-500/[0.02] p-5 overflow-hidden ring-1 ring-cyan-500/10">
        <div className="absolute -top-10 -right-10 h-36 w-36 rounded-full bg-cyan-500/10 blur-3xl" />
        <div className="relative flex flex-col sm:flex-row sm:items-center gap-4">
          <div className="flex items-center gap-3 shrink-0">
            <div className="h-12 w-12 rounded-xl bg-cyan-500/10 text-cyan-500 grid place-items-center">
              <Bot className="h-5 w-5" />
            </div>
            <div>
              <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">Automatización IA</p>
              <p className="text-3xl font-black tracking-tight text-cyan-500 tabular-nums">{globalStats.pctIA ?? 0}%</p>
            </div>
          </div>
          <div className="flex-1 space-y-2">
            <div className="h-2 w-full bg-muted rounded-full overflow-hidden">
              <div className="h-full bg-gradient-to-r from-cyan-600 to-cyan-400 rounded-full transition-all" style={{ width: `${globalStats.pctIA ?? 0}%` }} />
            </div>
            <div className="flex justify-between text-[11px] text-muted-foreground">
              <span><span className="font-bold text-cyan-500">{globalStats.totalIA ?? 0}</span> resueltos por IA</span>
              <span><span className="font-bold text-foreground">{globalStats.casosHumanos ?? 0}</span> atendidos por humanos</span>
            </div>
          </div>
        </div>
      </div>

      {/* ── AGENT PERFORMANCE CARDS ────────────────────────── */}
      <div className="rounded-2xl border border-border bg-card overflow-hidden">
        {/* Header con controles */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 px-6 py-4 border-b border-border bg-gradient-to-r from-muted/20 to-transparent">
          <div className="flex items-center gap-3">
            <div className="h-8 w-8 rounded-lg bg-brand-500/10 text-brand-500 grid place-items-center">
              <BarChart3 className="h-4 w-4" />
            </div>
            <div>
              <h2 className="font-black text-sm tracking-tight">Rendimiento por Agente</h2>
              <p className="text-[11px] text-muted-foreground">{agents.length} agentes · Ordenar por desempeño</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {/* Sort buttons */}
            <div className="flex items-center bg-muted/40 rounded-lg p-0.5 border border-border">
              {([
                { key: "resueltos", label: "Resueltos" },
                { key: "calificacion", label: "Calif. cliente" },
                { key: "sla", label: "SLA" },
                { key: "nombre", label: "Nombre" },
              ] as const).map(s => (
                <button
                  key={s.key}
                  onClick={() => setSortBy(s.key)}
                  className={`px-3 py-1.5 rounded-md text-[11px] font-bold transition-all ${
                    sortBy === s.key
                      ? "bg-brand-600 text-white shadow-sm"
                      : "text-muted-foreground hover:text-foreground"
                  }`}
                >
                  {s.label}
                </button>
              ))}
            </div>
            {isSuperadmin && (
              <button
                onClick={() => { setIsInviting(true); setFormData({ rol: "tecnico" }); }}
                className="flex items-center gap-2 px-4 py-2 bg-brand-600 hover:bg-brand-700 text-white rounded-lg text-[11px] font-bold transition-all shadow-lg shadow-brand-600/20"
              >
                <UserPlus className="h-3.5 w-3.5" /> Agregar
              </button>
            )}
          </div>
        </div>

        {/* Column Headers — grid idéntico al de las filas */}
        <div className="hidden md:grid items-center px-6 py-2 border-b border-border bg-muted/10"
          style={{ gridTemplateColumns: '2rem 1fr 5rem 4rem 6rem 6rem 4rem 5rem 7rem' }}>
          <div />{/* rank */}
          <div />{/* nombre */}
          <p className="text-[9px] font-bold uppercase tracking-wider text-muted-foreground text-center">Resueltos</p>
          <p className="text-[9px] font-bold uppercase tracking-wider text-muted-foreground text-center">Tasa</p>
          <p className="text-[9px] font-bold uppercase tracking-wider text-muted-foreground text-center">SLA</p>
          <p className="text-[9px] font-bold uppercase tracking-wider text-muted-foreground text-center">Calif. cliente</p>
          <p className="text-[9px] font-bold uppercase tracking-wider text-muted-foreground text-center">Trend</p>
          <p className="text-[9px] font-bold uppercase tracking-wider text-muted-foreground text-center">Score</p>
          <div />{/* actions */}
        </div>

        {/* Agent List */}
        <div className="divide-y divide-border/50">
          {sortedAgents.map((agent, index) => {
            const fullName = [agent.nombre, agent.apellido].filter(Boolean).join(" ") || agent.email;
            const initials = fullName.split(" ").map(n => n[0]).join("").substring(0, 2).toUpperCase();
            const score = getPerformanceScore(agent);
            const isExpanded = expandedAgent === agent.email;
            const isTop = index === 0 && agents.length > 1;

            return (
              <div key={agent.email} className={`group transition-all ${isExpanded ? "bg-muted/20" : "hover:bg-muted/10"}`}>
                {/* Main Row — mismo grid que el header */}
                <div className="hidden md:grid items-center px-6 py-3 gap-x-2"
                  style={{ gridTemplateColumns: '2rem 1fr 5rem 4rem 6rem 6rem 4rem 5rem 7rem' }}>

                  {/* Rank */}
                  <div className="flex items-center justify-center">
                    {isTop ? (
                      <div className="h-8 w-8 rounded-full bg-gradient-to-br from-amber-400 to-amber-600 grid place-items-center shadow-lg shadow-amber-500/30">
                        <Award className="h-4 w-4 text-white" />
                      </div>
                    ) : (
                      <span className="text-sm font-black text-muted-foreground/50 tabular-nums">#{index + 1}</span>
                    )}
                  </div>

                  {/* Avatar + Name */}
                  <div className="flex items-center gap-3 min-w-0">
                    <div className="relative shrink-0">
                      <div className={`h-11 w-11 rounded-xl bg-gradient-to-br from-brand-500 to-brand-700 text-white grid place-items-center text-sm font-black shadow-md ring-2 ${getPerformanceRing(agent.tasaResolucion)}`}>
                        {initials}
                      </div>
                      {agent.tendencia === "up" && (
                        <span className="absolute -top-1 -right-1 h-4 w-4 rounded-full bg-emerald-500 grid place-items-center ring-2 ring-card">
                          <TrendingUp className="h-2.5 w-2.5 text-white" />
                        </span>
                      )}
                    </div>
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <p className="font-black text-sm truncate">{fullName}</p>
                        {isTop && <span className="text-[9px] font-bold px-1.5 py-0.5 rounded bg-amber-500/10 text-amber-500 border border-amber-500/20">MVP</span>}
                      </div>
                      <p className="text-[11px] text-muted-foreground truncate">{agent.email}</p>
                      <div className="flex items-center gap-2 mt-0.5">
                        <Badge variant={agent.rol === "superadmin" ? "danger" : agent.rol === "admin" ? "warning" : "default"} className="text-[9px] capitalize">
                          {agent.rol === "superadmin" ? <Shield className="h-2.5 w-2.5" /> : agent.rol === "admin" ? <UserCheck className="h-2.5 w-2.5" /> : <Activity className="h-2.5 w-2.5" />}
                          {agent.rol === "tecnico" ? "Soporte Avz." : agent.rol}
                        </Badge>
                        {agent.last_login && (
                          <span className="text-[9px] text-muted-foreground">
                            Último acceso: {new Date(agent.last_login).toLocaleDateString("es-CR", { day: "numeric", month: "short" })}
                          </span>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* Resueltos */}
                  <div className="text-center">
                    <p className="text-xl font-black text-emerald-500 tabular-nums">{agent.resueltos}</p>
                  </div>

                  {/* Tasa */}
                  <div className="flex items-center justify-center">
                    <div className="relative h-11 w-11">
                      <svg className="h-11 w-11 -rotate-90" viewBox="0 0 36 36">
                        <circle cx="18" cy="18" r="15" fill="none" className="stroke-muted/30" strokeWidth="3" />
                        <circle cx="18" cy="18" r="15" fill="none" className={`${agent.tasaResolucion >= 80 ? "stroke-emerald-500" : agent.tasaResolucion >= 60 ? "stroke-amber-500" : "stroke-rose-500"}`}
                          strokeWidth="3" strokeDasharray={`${agent.tasaResolucion * 0.942} 100`} strokeLinecap="round" />
                      </svg>
                      <span className={`absolute inset-0 flex items-center justify-center text-[10px] font-black ${getPerformanceColor(agent.tasaResolucion)}`}>
                        {agent.tasaResolucion}%
                      </span>
                    </div>
                  </div>

                  {/* SLA */}
                  <div className="flex items-center justify-center gap-1">
                    <Clock className="h-3 w-3 text-sky-500 shrink-0" />
                    <p className="text-sm font-black text-sky-500 tabular-nums">{formatSLA(agent.avgSLA)}</p>
                  </div>

                  {/* Calif. cliente */}
                  <div className="flex items-center justify-center gap-0.5">
                    {agent.avgCalificacionCliente !== "N/A" && <Star className="h-3 w-3 text-amber-400 fill-amber-400 shrink-0" />}
                    <p className="text-sm font-black text-amber-400 tabular-nums">
                      {agent.avgCalificacionCliente !== "N/A" ? agent.avgCalificacionCliente : "—"}
                    </p>
                  </div>

                  {/* Trend */}
                  <div className="flex items-center justify-center">
                    {getTrendIcon(agent.tendencia)}
                  </div>

                  {/* Score */}
                  <div className="flex items-center justify-center">
                    <div className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl border ${getPerformanceBg(score)}`}>
                      <span className={`text-base font-black tabular-nums ${getPerformanceColor(score)}`}>{score}</span>
                      <span className="text-[9px] font-bold text-muted-foreground">pts</span>
                    </div>
                  </div>

                  {/* Actions */}
                  <div className="flex items-center justify-end gap-1">
                    <button
                      onClick={() => setExpandedAgent(isExpanded ? null : agent.email)}
                      className="p-2 rounded-lg hover:bg-muted transition-colors text-muted-foreground hover:text-foreground"
                    >
                      {isExpanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                    </button>
                    {isSuperadmin && (
                      <>
                        <button onClick={() => { setEditingAgent(agent); setFormData(agent); }}
                          className="p-2 rounded-lg hover:bg-muted transition-colors text-muted-foreground hover:text-foreground" title="Cambiar rol">
                          <Edit2 className="h-3.5 w-3.5" />
                        </button>
                        <button onClick={() => { setResettingAgent(agent); setFormData({ password: "" }); }}
                          className="p-2 rounded-lg hover:bg-muted transition-colors text-muted-foreground hover:text-amber-500" title="Resetear contraseña">
                          <Key className="h-3.5 w-3.5" />
                        </button>
                        <button onClick={() => handleDelete(agent.email)}
                          className="p-2 rounded-lg hover:bg-red-500/10 transition-colors text-muted-foreground hover:text-red-500" title="Eliminar">
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                        <Link
                          href={`/admin/equipo/perfil?email=${encodeURIComponent(agent.email)}`}
                          className="p-2 rounded-lg hover:bg-violet-500/10 transition-colors text-muted-foreground hover:text-violet-500"
                          title="Ver perfil del agente"
                        >
                          <Eye className="h-3.5 w-3.5" />
                        </Link>
                      </>
                    )}
                  </div>
                </div>

                {/* Expanded Detail */}
                {isExpanded && (
                  <div className="px-6 pb-5 pt-1 animate-fade-in">
                    <div className="ml-0 sm:ml-11 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                      <div className="rounded-xl border border-border bg-background/50 p-4">
                        <div className="flex items-center gap-2 mb-2">
                          <CheckCircle className="h-3.5 w-3.5 text-emerald-500" />
                          <span className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">Resolución</span>
                        </div>
                        <p className="text-2xl font-black text-emerald-500">{agent.resueltos}<span className="text-sm text-muted-foreground font-medium">/{agent.totalAtendidos}</span></p>
                        <div className="mt-2 h-1.5 w-full bg-muted rounded-full overflow-hidden">
                          <div className="h-full bg-gradient-to-r from-emerald-600 to-emerald-400 rounded-full transition-all" style={{ width: `${agent.tasaResolucion}%` }} />
                        </div>
                        <p className="text-[10px] text-muted-foreground mt-1">{agent.tasaResolucion}% de efectividad</p>
                      </div>

                      <div className="rounded-xl border border-border bg-background/50 p-4">
                        <div className="flex items-center gap-2 mb-2">
                          <Clock className="h-3.5 w-3.5 text-sky-500" />
                          <span className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">Tiempo Respuesta</span>
                        </div>
                        <p className="text-2xl font-black text-sky-500">{formatSLA(agent.avgSLA)}</p>
                        <p className="text-[10px] text-muted-foreground mt-1">
                          {agent.avgSLA === 0 ? "Sin datos de SLA" : agent.avgSLA < 30 ? "Excelente velocidad" : agent.avgSLA < 60 ? "Dentro de rango" : "Necesita mejorar"}
                        </p>
                      </div>

                      <div className="rounded-xl border border-border bg-background/50 p-4">
                        <div className="flex items-center gap-2 mb-2">
                          <Star className="h-3.5 w-3.5 text-amber-400" />
                          <span className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">Calif. del cliente</span>
                        </div>
                        <div className="flex items-baseline gap-1">
                          <p className="text-2xl font-black text-amber-400">{agent.avgCalificacionCliente !== "N/A" ? agent.avgCalificacionCliente : "—"}</p>
                          {agent.avgCalificacionCliente !== "N/A" && <span className="text-sm text-muted-foreground">/5</span>}
                        </div>
                        <p className="text-[10px] text-muted-foreground mt-1">{agent.calificacionesClienteCount} calificaciones del cliente</p>
                      </div>

                      <div className="rounded-xl border border-border bg-background/50 p-4">
                        <div className="flex items-center gap-2 mb-2">
                          <MessageSquare className="h-3.5 w-3.5 text-violet-500" />
                          <span className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">Actividad</span>
                        </div>
                        <p className="text-2xl font-black text-violet-500">{agent.casosHoy}</p>
                        <p className="text-[10px] text-muted-foreground mt-1">hoy · {agent.casosEstaSemana} esta semana</p>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            );
          })}

          {sortedAgents.length === 0 && (
            <div className="py-16 text-center">
              <Activity className="h-8 w-8 text-muted-foreground/30 mx-auto mb-3" />
              <p className="text-sm text-muted-foreground">No hay agentes registrados</p>
            </div>
          )}
        </div>
      </div>

      {/* ── MODALS ──────────────────────────────────────────── */}

      {/* Invitar */}
      {isInviting && (
        <Modal title="Agregar Nuevo Agente" onClose={() => setIsInviting(false)}>
          <div className="space-y-3">
            <div>
              <label className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground mb-1.5 block">Nombre</label>
              <input type="text" placeholder="Nombre completo"
                className="w-full p-3 rounded-xl border border-border bg-background text-sm focus:outline-none focus:ring-2 focus:ring-brand-500/30 transition-all"
                onChange={e => setFormData({...formData, nombre: e.target.value})} />
            </div>
            <div>
              <label className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground mb-1.5 block">Email</label>
              <input type="email" placeholder="correo@ejemplo.com"
                className="w-full p-3 rounded-xl border border-border bg-background text-sm focus:outline-none focus:ring-2 focus:ring-brand-500/30 transition-all"
                onChange={e => setFormData({...formData, email: e.target.value})} />
            </div>
            <div>
              <label className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground mb-1.5 block">Contraseña Inicial</label>
              <input type="password" placeholder="Mín. 6 caracteres"
                className="w-full p-3 rounded-xl border border-border bg-background text-sm focus:outline-none focus:ring-2 focus:ring-brand-500/30 transition-all"
                onChange={e => setFormData({...formData, password: e.target.value})} />
            </div>
            <div>
              <label className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground mb-1.5 block">Rol</label>
              <select value={formData.rol || "tecnico"} onChange={(e) => setFormData({...formData, rol: e.target.value})}
                className="w-full p-3 rounded-xl border border-border bg-background text-sm focus:outline-none focus:ring-2 focus:ring-brand-500/30 transition-all">
                <option value="tecnico">Soporte Avanzado</option>
                <option value="admin">Admin</option>
                <option value="superadmin">Superadmin</option>
              </select>
            </div>
            <button onClick={handleInvite} disabled={loading}
              className="w-full py-3 bg-brand-600 text-white rounded-xl font-bold text-sm hover:bg-brand-700 flex justify-center items-center gap-2 transition-all shadow-lg shadow-brand-600/20 mt-2">
              {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <UserPlus className="h-4 w-4" />}
              Crear Agente
            </button>
          </div>
        </Modal>
      )}

      {/* Reset Password */}
      {resettingAgent && (
        <Modal title="Resetear Contraseña" onClose={() => setResettingAgent(null)}>
          <div className="space-y-4">
            <div className="p-3 rounded-xl bg-amber-500/5 border border-amber-500/20">
              <p className="text-xs text-amber-600 dark:text-amber-400">Asignando nueva contraseña para: <strong>{resettingAgent.email}</strong></p>
            </div>
            <div>
              <label className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground mb-1.5 block">Nueva Contraseña</label>
              <input type="password" placeholder="Mín. 6 caracteres"
                className="w-full p-3 rounded-xl border border-border bg-background text-sm focus:outline-none focus:ring-2 focus:ring-amber-500/30 transition-all"
                onChange={e => setFormData({...formData, password: e.target.value})} />
            </div>
            <button onClick={handleResetPassword} disabled={loading}
              className="w-full py-3 bg-amber-600 text-white rounded-xl font-bold text-sm hover:bg-amber-700 flex justify-center items-center gap-2 transition-all shadow-lg shadow-amber-600/20">
              {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Key className="h-4 w-4" />}
              Actualizar Contraseña
            </button>
          </div>
        </Modal>
      )}

      {/* Cambiar Rol */}
      {editingAgent && (
        <Modal title="Cambiar Rol" onClose={() => setEditingAgent(null)}>
          <div className="space-y-4">
            <div className="p-3 rounded-xl bg-muted/40 border border-border">
              <p className="text-xs text-muted-foreground">Agente: <strong className="text-foreground">{editingAgent.email}</strong></p>
            </div>
            <div>
              <label className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground mb-1.5 block">Nuevo Rol</label>
              <select value={formData.rol || ""} onChange={(e) => setFormData({...formData, rol: e.target.value})}
                className="w-full p-3 rounded-xl border border-border bg-background text-sm focus:outline-none focus:ring-2 focus:ring-brand-500/30 transition-all">
                <option value="tecnico">Soporte Avanzado</option>
                <option value="admin">Admin</option>
                <option value="superadmin">Superadmin</option>
              </select>
            </div>
            <div className="flex gap-2 pt-2">
              <button onClick={handleSaveRole}
                className="flex-1 py-3 bg-brand-600 text-white rounded-xl font-bold text-sm hover:bg-brand-700 flex justify-center items-center gap-2 transition-all">
                <Save className="h-4 w-4" /> Guardar
              </button>
              <button onClick={() => setEditingAgent(null)}
                className="px-6 py-3 rounded-xl border border-border text-sm font-bold hover:bg-muted transition-all">
                Cancelar
              </button>
            </div>
          </div>
        </Modal>
      )}
    </>
  );
}
