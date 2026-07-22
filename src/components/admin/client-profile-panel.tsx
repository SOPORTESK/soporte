"use client";

import { useState, useMemo, useEffect } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import Link from "next/link";
import {
  Users, TrendingUp, TrendingDown, Minus, ExternalLink, Star,
  ShieldCheck, ShieldAlert, Search, X, ChevronDown, ChevronUp,
  Activity, Clock, Phone, Mail, IdCard, BarChart3, Repeat2, Globe,
} from "lucide-react";

export type PerfilClienteDTO = {
  nombre: string; telefono: string; correo: string; cedula: string;
  total: number; resueltos: number; abiertos: number;
  primerCaso: string; ultimoCaso: string; ultimoCasoId: string | number;
  cats: string[];
  antiguedadDias: number; diasSinContacto: number; frecuenciaMes: number;
  tipo: "nuevo" | "ocasional" | "recurrente" | "frecuente";
  tendencia: "subiendo" | "estable" | "bajando";
  healthScore: number;
  salud: "saludable" | "atencion" | "riesgo";
  avgCal: number | null;
  canalPreferido: string;
};

const canalLabels: Record<string, string> = {
  widget: "Widget", whatsapp: "WhatsApp", messenger: "Messenger", web: "Web", email: "Email",
};
const canalBadge: Record<string, string> = {
  widget: "bg-brand-500/10 text-brand-500",
  whatsapp: "bg-emerald-500/10 text-emerald-500",
  messenger: "bg-blue-500/10 text-blue-500",
  web: "bg-violet-500/10 text-violet-500",
  email: "bg-amber-500/10 text-amber-500",
};

const saludConfig = {
  saludable: { color: "text-sky-500", bg: "bg-sky-500/10", dot: "bg-sky-500", label: "Saludable", border: "border-sky-500/30" },
  atencion:  { color: "text-amber-400", bg: "bg-amber-400/10", dot: "bg-amber-400", label: "Atención", border: "border-amber-400/30" },
  riesgo:    { color: "text-rose-500", bg: "bg-rose-500/10", dot: "bg-rose-500", label: "Riesgo", border: "border-rose-500/30" },
};

const tipoConfig: Record<string, { badge: string; label: string }> = {
  frecuente:  { badge: "bg-violet-500/10 text-violet-500 border-violet-500/20", label: "Frecuente" },
  recurrente: { badge: "bg-brand-500/10 text-brand-500 border-brand-500/20", label: "Recurrente" },
  ocasional:  { badge: "bg-sky-500/10 text-sky-500 border-sky-500/20", label: "Ocasional" },
  nuevo:      { badge: "bg-muted/30 text-muted-foreground border-border/30", label: "Nuevo" },
};

type SaludFilter = "todos" | "saludable" | "atencion" | "riesgo";
type TipoFilter = "todos" | "nuevo" | "ocasional" | "recurrente" | "frecuente";

export function ClientProfilePanel({ perfiles }: { perfiles: PerfilClienteDTO[] }) {
  const [saludFilter, setSaludFilter] = useState<SaludFilter>("todos");
  const [tipoFilter, setTipoFilter] = useState<TipoFilter>("todos");
  const [search, setSearch] = useState("");
  const [expandedIdx, setExpandedIdx] = useState<number | null>(null);
  const [mounted, setMounted] = useState(false);
  const PAGE_SIZE = 15;
  const [currentPage, setCurrentPage] = useState(0);
  const [displayCount, setDisplayCount] = useState(PAGE_SIZE);

  useEffect(() => {
    setMounted(true);
  }, []);

  // Reset pagination when filters change
  useEffect(() => {
    setCurrentPage(0);
    setDisplayCount(PAGE_SIZE);
  }, [tipoFilter, search]);

  // Read hash on mount and on change to allow donut links like #clientes-saludable
  useEffect(() => {
    const applyHash = () => {
      const hash = window.location.hash.replace("#", "");
      if (hash === "clientes-saludable") { setSaludFilter("saludable"); scrollToPanel(); }
      else if (hash === "clientes-atencion") { setSaludFilter("atencion"); scrollToPanel(); }
      else if (hash === "clientes-riesgo") { setSaludFilter("riesgo"); scrollToPanel(); }
    };
    const scrollToPanel = () => {
      setTimeout(() => document.getElementById("clientes-panel")?.scrollIntoView({ behavior: "smooth", block: "start" }), 50);
    };
    applyHash();
    window.addEventListener("hashchange", applyHash);
    return () => window.removeEventListener("hashchange", applyHash);
  }, []);

  const filtered = useMemo(() => {
    let list = perfiles;
    if (saludFilter !== "todos") list = list.filter(p => p.salud === saludFilter);
    if (tipoFilter !== "todos") list = list.filter(p => p.tipo === tipoFilter);
    if (search.trim()) {
      const q = search.toLowerCase();
      list = list.filter(p =>
        p.nombre.toLowerCase().includes(q) ||
        p.telefono.includes(q) ||
        p.correo.toLowerCase().includes(q) ||
        p.cedula.includes(q)
      );
    }
    return list;
  }, [perfiles, saludFilter, tipoFilter, search]);

  const totalPages = Math.ceil(filtered.length / PAGE_SIZE);
  const pageStart = currentPage * PAGE_SIZE;
  const pageEnd = Math.min(pageStart + displayCount, filtered.length);
  const visible = filtered.slice(pageStart, pageEnd);
  const hasMore = pageEnd < filtered.length;

  const tipoCounts = useMemo(() => ({
    todos: perfiles.length,
    frecuente: perfiles.filter(p => p.tipo === "frecuente").length,
    recurrente: perfiles.filter(p => p.tipo === "recurrente").length,
    ocasional: perfiles.filter(p => p.tipo === "ocasional").length,
    nuevo: perfiles.filter(p => p.tipo === "nuevo").length,
  }), [perfiles]);

  const counts = useMemo(() => ({
    todos: perfiles.length,
    saludable: perfiles.filter(p => p.salud === "saludable").length,
    atencion: perfiles.filter(p => p.salud === "atencion").length,
    riesgo: perfiles.filter(p => p.salud === "riesgo").length,
  }), [perfiles]);

  const antigStr = (d: number) => d > 365 ? `${(d / 365).toFixed(1)} años` : d > 30 ? `${Math.round(d / 30)} meses` : `${d} días`;

  return (
    <div id="clientes-panel" className="rounded-2xl border border-border/60 bg-card overflow-hidden scroll-mt-6" suppressHydrationWarning>
      {!mounted ? (
        <div className="px-5 py-10 text-center text-sm text-muted-foreground">Cargando perfiles...</div>
      ) : (
      <>
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 px-5 py-4 border-b border-border/50 bg-gradient-to-r from-brand-500/5 to-transparent">
        <div className="flex items-center gap-2.5">
          <div className="h-8 w-8 rounded-lg bg-gradient-to-br from-brand-500/20 to-brand-600/20 text-brand-500 grid place-items-center">
            <Users className="h-4 w-4" />
          </div>
          <div>
            <h3 className="font-black text-sm">Perfil de Clientes</h3>
            <p className="text-[10px] text-muted-foreground">
              {filtered.length} de {perfiles.length} clientes
              {tipoFilter !== "todos" && ` · ${tipoConfig[tipoFilter].label}`}
            </p>
          </div>
        </div>
      </div>

      {/* Filters bar */}
      <div className="px-5 py-3 border-b border-border/30 bg-muted/5 space-y-3">
        {/* Tipo tabs + search */}
        <div className="flex flex-wrap items-center gap-2">
          {([
            { key: "todos" as TipoFilter, label: "Todos", color: "bg-muted text-foreground", activeColor: "bg-foreground text-background" },
            { key: "frecuente" as TipoFilter, label: "Frecuentes", color: "bg-violet-500/10 text-violet-500", activeColor: "bg-violet-500 text-white" },
            { key: "recurrente" as TipoFilter, label: "Recurrentes", color: "bg-brand-500/10 text-brand-500", activeColor: "bg-brand-500 text-white" },
            { key: "ocasional" as TipoFilter, label: "Ocasionales", color: "bg-sky-500/10 text-sky-500", activeColor: "bg-sky-500 text-white" },
            { key: "nuevo" as TipoFilter, label: "Nuevos", color: "bg-emerald-500/10 text-emerald-500", activeColor: "bg-emerald-500 text-white" },
          ]).map(tab => (
            <button
              key={tab.key}
              onClick={() => setTipoFilter(tab.key)}
              className={`px-3 py-1.5 rounded-lg text-[10px] font-black uppercase tracking-wide transition-all ${
                tipoFilter === tab.key ? tab.activeColor : tab.color + " hover:opacity-80"
              }`}
            >
              {tab.label} ({tipoCounts[tab.key]})
            </button>
          ))}
          <div className="flex-1" />
          <div className="relative">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3 w-3 text-muted-foreground/40" />
            <input
              type="text"
              placeholder="Buscar cliente..."
              value={search}
              onChange={e => setSearch(e.target.value)}
              className="pl-7 pr-7 py-1.5 text-xs bg-muted/30 border border-border/30 rounded-lg focus:outline-none focus:ring-1 focus:ring-brand-500/40 w-48"
            />
            {search && (
              <button onClick={() => setSearch("")} className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground">
                <X className="h-3 w-3" />
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Table */}
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border/30 bg-muted/5">
              <th className="px-5 py-3 text-left text-[9px] font-black uppercase tracking-widest text-muted-foreground/60 w-8">#</th>
              <th className="px-4 py-3 text-left text-[9px] font-black uppercase tracking-widest text-muted-foreground/60">Cliente</th>
              <th className="px-3 py-3 text-center text-[9px] font-black uppercase tracking-widest text-muted-foreground/60">Salud</th>
              <th className="px-3 py-3 text-center text-[9px] font-black uppercase tracking-widest text-muted-foreground/60">Tipo</th>
              <th className="px-3 py-3 text-center text-[9px] font-black uppercase tracking-widest text-muted-foreground/60">Tendencia</th>
              <th className="px-3 py-3 text-center text-[9px] font-black uppercase tracking-widest text-muted-foreground/60">Casos</th>
              <th className="px-3 py-3 text-center text-[9px] font-black uppercase tracking-widest text-muted-foreground/60">Frec.</th>
              <th className="px-3 py-3 text-center text-[9px] font-black uppercase tracking-widest text-muted-foreground/60">Antig.</th>
              <th className="px-3 py-3 text-center text-[9px] font-black uppercase tracking-widest text-muted-foreground/60">Rating</th>
              <th className="px-3 py-3 text-center text-[9px] font-black uppercase tracking-widest text-muted-foreground/60">Canal</th>
              <th className="px-3 py-3 text-right text-[9px] font-black uppercase tracking-widest text-muted-foreground/60">Sin contacto</th>
              <th className="px-3 py-3 w-8"></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border/30">
            {visible.length === 0 ? (
              <tr><td colSpan={12} className="py-16 text-center text-sm text-muted-foreground">
                {perfiles.length === 0 ? "Sin datos de clientes." : "No hay clientes con estos filtros."}
              </td></tr>
            ) : visible.map((p, i) => {
              const sc = saludConfig[p.salud];
              const tc = tipoConfig[p.tipo];
              const initials = p.nombre.split(" ").filter(Boolean).map(n => n[0]).join("").substring(0, 2).toUpperCase();
              const tendIcon = p.tendencia === "subiendo" ? <TrendingUp className="h-3 w-3" /> : p.tendencia === "bajando" ? <TrendingDown className="h-3 w-3" /> : <Minus className="h-3 w-3" />;
              const tendColor = p.tendencia === "subiendo" ? "text-amber-400" : p.tendencia === "bajando" ? "text-emerald-500" : "text-muted-foreground";
              const antigShort = p.antiguedadDias > 365 ? `${(p.antiguedadDias / 365).toFixed(1)}a` : p.antiguedadDias > 30 ? `${Math.round(p.antiguedadDias / 30)}m` : `${p.antiguedadDias}d`;
              const sinContactoColor = p.diasSinContacto > 90 ? "text-rose-500" : p.diasSinContacto > 30 ? "text-amber-400" : "text-muted-foreground";
              const isExpanded = expandedIdx === i;

              return (
                <tr key={`${p.cedula || p.telefono}-${i}`} className="group">
                  {/* Normal row — clickable to expand */}
                  <td colSpan={12} className="p-0">
                    <div
                      className="grid grid-cols-[2rem_1fr_4.5rem_4.5rem_3rem_3.5rem_3rem_3rem_3.5rem_4rem_4rem_2rem] items-center hover:bg-muted/20 transition-colors cursor-pointer"
                      onClick={() => setExpandedIdx(isExpanded ? null : i)}
                    >
                      <span className="px-5 py-3 text-[10px] font-black text-muted-foreground/30 tabular-nums">{i + 1}</span>

                      <div className="px-4 py-3 flex items-center gap-2.5">
                        <div className="h-8 w-8 rounded-lg bg-gradient-to-br from-brand-500/15 to-brand-600/15 text-brand-500 text-[10px] font-black grid place-items-center shrink-0 ring-1 ring-brand-500/10 relative">
                          {initials}
                          <span className={`absolute -top-0.5 -right-0.5 h-2 w-2 rounded-full ${sc.dot} ring-2 ring-card`} />
                        </div>
                        <div className="min-w-0">
                          <p className="font-bold text-xs truncate">{p.nombre}</p>
                          <p className="text-[9px] text-muted-foreground truncate">{p.telefono}</p>
                        </div>
                        {isExpanded ? <ChevronUp className="h-3 w-3 text-muted-foreground/40 ml-auto" /> : <ChevronDown className="h-3 w-3 text-muted-foreground/20 ml-auto opacity-0 group-hover:opacity-100 transition-opacity" />}
                      </div>

                      <div className="px-3 py-3 text-center">
                        <div className={`inline-flex flex-col items-center gap-0.5 px-2 py-0.5 rounded-lg ${sc.bg}`}>
                          <span className={`text-xs font-black tabular-nums ${sc.color}`}>{p.healthScore}</span>
                          <span className={`text-[8px] font-black uppercase tracking-wide ${sc.color}`}>{sc.label}</span>
                        </div>
                      </div>

                      <div className="px-3 py-3 text-center">
                        <span className={`text-[9px] font-black px-1.5 py-0.5 rounded-full uppercase border ${tc.badge}`}>
                          {p.tipo}
                        </span>
                      </div>

                      <div className="px-3 py-3 text-center">
                        <span className={`inline-flex items-center justify-center ${tendColor}`} title={p.tendencia}>
                          {tendIcon}
                        </span>
                      </div>

                      <div className="px-3 py-3 text-center">
                        <span className="font-black text-sm tabular-nums">{p.total}</span>
                        {p.abiertos > 0 && (
                          <span className="text-[8px] font-black text-rose-500 block">{p.abiertos} abierto{p.abiertos > 1 ? "s" : ""}</span>
                        )}
                      </div>

                      <div className="px-3 py-3 text-center">
                        <span className="text-[10px] font-bold text-amber-400 tabular-nums">{p.frecuenciaMes}</span>
                        <span className="text-[8px] text-muted-foreground/60 block">/mes</span>
                      </div>

                      <div className="px-3 py-3 text-center">
                        <span className="text-[10px] font-bold text-sky-500">{antigShort}</span>
                      </div>

                      <div className="px-3 py-3 text-center">
                        {p.avgCal !== null ? (
                          <div className="flex items-center justify-center gap-0.5">
                            <Star className="h-2.5 w-2.5 text-amber-400 fill-amber-400" />
                            <span className="font-black text-amber-400 text-xs tabular-nums">{p.avgCal.toFixed(1)}</span>
                          </div>
                        ) : <span className="text-muted-foreground/20 text-xs">—</span>}
                      </div>

                      <div className="px-3 py-3 text-center">
                        <span className={`text-[9px] font-black px-1.5 py-0.5 rounded-full uppercase ${canalBadge[p.canalPreferido] || "bg-muted text-muted-foreground"}`}>
                          {canalLabels[p.canalPreferido] || p.canalPreferido}
                        </span>
                      </div>

                      <div className="px-3 py-3 text-right">
                        <span className={`text-[10px] font-bold ${sinContactoColor}`}>
                          {p.diasSinContacto === 0 ? "Hoy" : `${p.diasSinContacto}d`}
                        </span>
                      </div>

                      <div className="px-3 py-3">
                        <Link href={`/inbox?case=${p.ultimoCasoId}`} onClick={e => e.stopPropagation()} className="opacity-0 group-hover:opacity-100 text-brand-500 hover:text-brand-600 transition-all">
                          <ExternalLink className="h-3 w-3" />
                        </Link>
                      </div>
                    </div>

                    {/* Expanded profile card */}
                    {isExpanded && (
                      <div className="px-6 pb-5 pt-2 bg-gradient-to-b from-muted/10 to-transparent border-t border-border/20 animate-in slide-in-from-top-1 duration-200">
                        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">

                          {/* Col 1: Identidad */}
                          <div className="space-y-3">
                            <h4 className="text-[10px] font-black uppercase tracking-widest text-muted-foreground/60 flex items-center gap-1.5">
                              <IdCard className="h-3 w-3" /> Datos del Cliente
                            </h4>
                            <div className="space-y-2 text-xs">
                              <div className="flex items-center gap-2">
                                <span className="text-muted-foreground w-16 shrink-0">Nombre</span>
                                <span className="font-bold">{p.nombre}</span>
                              </div>
                              {p.cedula && (
                                <div className="flex items-center gap-2">
                                  <span className="text-muted-foreground w-16 shrink-0">Cédula</span>
                                  <span className="font-mono text-[11px]">{p.cedula}</span>
                                </div>
                              )}
                              <div className="flex items-center gap-2">
                                <Phone className="h-3 w-3 text-muted-foreground" />
                                <span>{p.telefono}</span>
                              </div>
                              {p.correo && (
                                <div className="flex items-center gap-2">
                                  <Mail className="h-3 w-3 text-muted-foreground" />
                                  <span className="text-[11px] truncate">{p.correo}</span>
                                </div>
                              )}
                              <div className="flex items-center gap-2">
                                <Globe className="h-3 w-3 text-muted-foreground" />
                                <span>{canalLabels[p.canalPreferido] || p.canalPreferido}</span>
                              </div>
                            </div>
                          </div>

                          {/* Col 2: Indicadores */}
                          <div className="space-y-3">
                            <h4 className="text-[10px] font-black uppercase tracking-widest text-muted-foreground/60 flex items-center gap-1.5">
                              <Activity className="h-3 w-3" /> Indicadores
                            </h4>
                            <div className="grid grid-cols-2 gap-2">
                              {[
                                { label: "Health Score", value: p.healthScore.toString(), color: sc.color, icon: <ShieldCheck className="h-3.5 w-3.5" /> },
                                { label: "Estado", value: sc.label, color: sc.color, icon: <span className={`h-2.5 w-2.5 rounded-full ${sc.dot}`} /> },
                                { label: "Casos Totales", value: p.total.toString(), color: "text-foreground", icon: <BarChart3 className="h-3.5 w-3.5 text-brand-500" /> },
                                { label: "Abiertos", value: p.abiertos.toString(), color: p.abiertos > 0 ? "text-rose-500" : "text-muted-foreground", icon: <ShieldAlert className="h-3.5 w-3.5" /> },
                                { label: "Resueltos", value: `${p.total > 0 ? Math.round((p.resueltos / p.total) * 100) : 0}%`, color: "text-emerald-500", icon: <Star className="h-3.5 w-3.5" /> },
                                { label: "Frecuencia", value: `${p.frecuenciaMes}/mes`, color: "text-amber-400", icon: <Repeat2 className="h-3.5 w-3.5" /> },
                              ].map((m, j) => (
                                <div key={j} className="flex items-center gap-2 p-2 rounded-lg bg-muted/20 border border-border/20">
                                  <span className={m.color}>{m.icon}</span>
                                  <div>
                                    <p className="text-[8px] text-muted-foreground/60 uppercase tracking-wider">{m.label}</p>
                                    <p className={`text-sm font-black tabular-nums ${m.color}`}>{m.value}</p>
                                  </div>
                                </div>
                              ))}
                            </div>
                          </div>

                          {/* Col 3: Historial */}
                          <div className="space-y-3">
                            <h4 className="text-[10px] font-black uppercase tracking-widest text-muted-foreground/60 flex items-center gap-1.5">
                              <Clock className="h-3 w-3" /> Historial
                            </h4>
                            <div className="space-y-2 text-xs">
                              <div className="flex justify-between p-2 rounded-lg bg-muted/20 border border-border/20">
                                <span className="text-muted-foreground">Antigüedad</span>
                                <span className="font-black text-sky-500">{antigStr(p.antiguedadDias)}</span>
                              </div>
                              <div className="flex justify-between p-2 rounded-lg bg-muted/20 border border-border/20">
                                <span className="text-muted-foreground">Primer caso</span>
                                <span className="font-bold">{new Date(p.primerCaso).toLocaleDateString("es-CR", { day: "2-digit", month: "short", year: "numeric" })}</span>
                              </div>
                              <div className="flex justify-between p-2 rounded-lg bg-muted/20 border border-border/20">
                                <span className="text-muted-foreground">Último caso</span>
                                <span className="font-bold">{new Date(p.ultimoCaso).toLocaleDateString("es-CR", { day: "2-digit", month: "short", year: "numeric" })}</span>
                              </div>
                              <div className="flex justify-between p-2 rounded-lg bg-muted/20 border border-border/20">
                                <span className="text-muted-foreground">Sin contacto</span>
                                <span className={`font-black ${sinContactoColor}`}>
                                  {p.diasSinContacto === 0 ? "Hoy" : `${p.diasSinContacto} días`}
                                </span>
                              </div>
                              <div className="flex justify-between p-2 rounded-lg bg-muted/20 border border-border/20">
                                <span className="text-muted-foreground">Tendencia</span>
                                <span className={`font-black flex items-center gap-1 ${tendColor}`}>
                                  {tendIcon} {p.tendencia === "subiendo" ? "Subiendo" : p.tendencia === "bajando" ? "Bajando" : "Estable"}
                                </span>
                              </div>
                              {p.cats.length > 0 && (
                                <div className="p-2 rounded-lg bg-muted/20 border border-border/20">
                                  <p className="text-muted-foreground mb-1">Categorías</p>
                                  <div className="flex flex-wrap gap-1">
                                    {p.cats.map(c => (
                                      <span key={c} className="text-[8px] font-bold px-1.5 py-0.5 rounded-full bg-brand-500/10 text-brand-500 uppercase">{c}</span>
                                    ))}
                                  </div>
                                </div>
                              )}
                              {p.avgCal !== null && (
                                <div className="flex justify-between p-2 rounded-lg bg-muted/20 border border-border/20">
                                  <span className="text-muted-foreground">Calificación</span>
                                  <span className="font-black text-amber-400 flex items-center gap-0.5">
                                    <Star className="h-3 w-3 fill-amber-400" /> {p.avgCal.toFixed(1)}/5
                                  </span>
                                </div>
                              )}
                            </div>
                            <Link
                              href={`/inbox?case=${p.ultimoCasoId}`}
                              className="flex items-center justify-center gap-2 mt-2 px-4 py-2 rounded-lg bg-brand-500/10 text-brand-500 hover:bg-brand-500/20 text-xs font-black transition-colors"
                            >
                              Ver último caso <ExternalLink className="h-3 w-3" />
                            </Link>
                          </div>
                        </div>
                      </div>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Pagination + Ver más */}
      {filtered.length > 0 && (
        <div className="px-5 py-3 border-t border-border/30 bg-muted/5 flex flex-wrap items-center justify-between gap-3">
          <span className="text-[10px] text-muted-foreground font-bold">
            Mostrando {pageStart + 1}-{pageEnd} de {filtered.length}
          </span>
          <div className="flex items-center gap-2">
            {hasMore && (
              <button
                onClick={() => setDisplayCount(c => c + PAGE_SIZE)}
                className="px-3 py-1.5 rounded-lg text-[10px] font-black bg-brand-500/10 text-brand-500 hover:bg-brand-500/20 transition-colors"
              >
                Ver más (+{Math.min(PAGE_SIZE, filtered.length - pageEnd)})
              </button>
            )}
            {totalPages > 1 && (
              <div className="flex items-center gap-1">
                <button
                  onClick={() => { setCurrentPage(p => Math.max(0, p - 1)); setDisplayCount(PAGE_SIZE); }}
                  disabled={currentPage === 0}
                  className="p-1.5 rounded-lg text-muted-foreground hover:bg-muted disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
                >
                  <ChevronLeft className="h-3.5 w-3.5" />
                </button>
                <span className="text-[10px] font-black tabular-nums px-2">
                  {currentPage + 1} / {totalPages}
                </span>
                <button
                  onClick={() => { setCurrentPage(p => Math.min(totalPages - 1, p + 1)); setDisplayCount(PAGE_SIZE); }}
                  disabled={currentPage >= totalPages - 1}
                  className="p-1.5 rounded-lg text-muted-foreground hover:bg-muted disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
                >
                  <ChevronRight className="h-3.5 w-3.5" />
                </button>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Legend */}
      <div className="px-5 py-3 border-t border-border/30 bg-muted/5">
        <div className="flex flex-wrap items-center gap-3 text-[9px] text-muted-foreground">
          <span className="flex items-center gap-1"><span className="h-2 w-2 rounded-full bg-sky-500" /> Saludable (≥70)</span>
          <span className="flex items-center gap-1"><span className="h-2 w-2 rounded-full bg-amber-400" /> Atención (40-69)</span>
          <span className="flex items-center gap-1"><span className="h-2 w-2 rounded-full bg-rose-500" /> Riesgo (&lt;40)</span>
          <span className="opacity-50">·</span>
          <span><strong>Frecuente:</strong> ≥10 casos</span>
          <span><strong>Recurrente:</strong> 4-9</span>
          <span><strong>Ocasional:</strong> 2-3</span>
          <span><strong>Nuevo:</strong> 1</span>
          <span className="opacity-50">·</span>
          <span className="italic">Click en una fila para ver perfil completo</span>
        </div>
      </div>
      </>
      )}
    </div>
  );
}
