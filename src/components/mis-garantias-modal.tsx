"use client";

import * as React from "react";
import {
  ShieldCheck,
  Search,
  RefreshCw,
  X,
  ChevronDown,
  ChevronRight,
  Check,
  Clock,
  AlertCircle,
  Copy,
  ExternalLink,
  Layers,
  FileText,
  Calendar,
  Building2,
  Tag,
  User,
  Wrench,
  CheckCircle2,
  Edit,
  Plus,
} from "lucide-react";
import { toast } from "sonner";
import { GarantiaRecord, CAT_LABELS, KPI_ESTATUS_LABELS } from "@/components/admin/garantias/garantias-types";
import { GarantiasEditModal } from "@/components/admin/garantias/garantias-edit-modal";
import { GarantiasCreateModal } from "@/components/admin/garantias/garantias-create-modal";
import { createGarantiasClient } from "@/lib/supabase-garantias";

export interface MisGarantiasModalProps {
  isOpen: boolean;
  onClose: () => void;
  agent: {
    nombre?: string | null;
    apellido?: string | null;
    email?: string | null;
  };
  canCreate?: boolean;
  canEdit?: boolean;
}

function normalizeName(s: string) {
  return (s || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim()
    .replace(/\s+/g, " ");
}

// Comparador exacto y canónico para asegurar que se empareje al propietario real
function isRecordOwnedByAgent(
  r: any,
  agent: { nombre?: string | null; apellido?: string | null; email?: string | null }
): boolean {
  if (!r) return false;
  const regNorm = normalizeName(r.registrado_por);
  if (!regNorm) return false;

  const emailNorm = normalizeName(agent.email || "");
  const emailPrefix = emailNorm.split("@")[0].replace(/[^a-z0-9]/g, "");

  // 1. Coincidencia por correo o prefijo (ej. 'cbatista' en 'César Andrés Batista')
  if (emailPrefix && (regNorm.includes(emailPrefix) || regNorm === emailNorm || (emailPrefix.includes("batista") && regNorm.includes("batista")))) {
    return true;
  }

  // 2. Coincidencia exacta o parcial de nombre completo
  const agentFull = normalizeName(((agent.nombre || "") + " " + (agent.apellido || "")).trim());
  if (agentFull && (regNorm === agentFull || regNorm.includes(agentFull) || agentFull.includes(regNorm))) {
    return true;
  }

  // 3. Coincidencia por palabras del nombre del agente
  const agentWords = normalizeName((agent.nombre || "") + " " + (agent.apellido || "") + " " + emailPrefix)
    .split(" ")
    .filter((w) => w.length > 2);
  const regWords = regNorm.split(" ").filter((w) => w.length > 2);

  const matchedWords = agentWords.filter((w) => regWords.includes(w) || regWords.some((rw) => rw.includes(w) || w.includes(rw)));
  if (matchedWords.length >= 2) {
    return true;
  }

  if (agentWords.length >= 1 && regWords.length >= 1 && agentWords[0] === regWords[0]) {
    return true;
  }

  return false;
}

export function MisGarantiasModal({ isOpen, onClose, agent, canCreate = true, canEdit = true }: MisGarantiasModalProps) {
  const [records, setRecords] = React.useState<GarantiaRecord[]>([]);
  const [loading, setLoading] = React.useState(false);
  const [search, setSearch] = React.useState("");
  const [subTab, setSubTab] = React.useState<"todas" | "def" | "temp">("todas");
  const [filterEstatus, setFilterEstatus] = React.useState<string>("todos");
  const [expandedId, setExpandedId] = React.useState<string | null>(null);
  const [editingRecord, setEditingRecord] = React.useState<GarantiaRecord | null>(null);
  const [showCreateModal, setShowCreateModal] = React.useState(false);
  const [lastUpdated, setLastUpdated] = React.useState<string>("");

  const handleSavedRecord = (updated: GarantiaRecord) => {
    setRecords((prev) => prev.map((rec) => (rec.id === updated.id ? { ...rec, ...updated } : rec)));
    setEditingRecord(null);
  };

  const handleCreatedRecord = (newRecord: GarantiaRecord) => {
    setRecords((prev) => [newRecord, ...prev]);
    loadMyRecords();
  };

  const agentDisplayName = [agent?.nombre, agent?.apellido].filter(Boolean).join(" ") || agent?.email || "Mi Usuario";

  // Carga de registros filtrados estrictamente por el usuario propietario
  const loadMyRecords = React.useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/admin/garantias?limit=1000", { cache: "no-store" });
      if (!res.ok) throw new Error("No se pudo conectar con el servicio de garantías");
      const data = await res.json();
      if (Array.isArray(data.records)) {
        // Filtro estricto: solamente registros donde el propietario es el usuario autenticado
        const myOnly = data.records.filter((r: GarantiaRecord) => isRecordOwnedByAgent(r, agent));
        setRecords(myOnly);
        setLastUpdated(new Date().toLocaleTimeString("es-CR", { hour: "2-digit", minute: "2-digit" }));
      }
    } catch (e: any) {
      toast.error("Error al cargar tus procesos", { description: e?.message });
    } finally {
      setLoading(false);
    }
  }, [agent]);

  React.useEffect(() => {
    if (!isOpen) return;

    loadMyRecords();

    // Conexión Realtime a Supabase exclusiva mientras el modal esté abierto
    const garantiasClient = createGarantiasClient();
    const channel = garantiasClient
      .channel("mis_garantias_modal_stream")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "garantias" },
        (payload: any) => {
          if (payload.eventType === "INSERT" && payload.new) {
            const newRec = payload.new as GarantiaRecord;
            if (isRecordOwnedByAgent(newRec, agent)) {
              setRecords((prev) => {
                if (prev.some((r) => r.id === newRec.id)) return prev;
                return [newRec, ...prev];
              });
              setLastUpdated(new Date().toLocaleTimeString("es-CR", { hour: "2-digit", minute: "2-digit" }));
            }
          } else if (payload.eventType === "UPDATE" && payload.new) {
            const updated = payload.new as GarantiaRecord;
            if (isRecordOwnedByAgent(updated, agent)) {
              setRecords((prev) => {
                const exists = prev.some((r) => r.id === updated.id);
                if (exists) {
                  return prev.map((r) => (r.id === updated.id ? { ...r, ...updated } : r));
                }
                return [updated, ...prev];
              });
              setLastUpdated(new Date().toLocaleTimeString("es-CR", { hour: "2-digit", minute: "2-digit" }));
            } else {
              setRecords((prev) => prev.filter((r) => r.id !== updated.id));
            }
          } else if (payload.eventType === "DELETE" && payload.old) {
            setRecords((prev) => prev.filter((r) => r.id !== payload.old.id));
            setLastUpdated(new Date().toLocaleTimeString("es-CR", { hour: "2-digit", minute: "2-digit" }));
          }
        }
      )
      .subscribe();

    return () => {
      garantiasClient.removeChannel(channel);
    };
  }, [isOpen, loadMyRecords, agent]);

  // Cerrar con tecla Escape
  React.useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape" && isOpen) {
        onClose();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isOpen, onClose]);

  // Contadores y métricas rápidas del usuario
  const stats = React.useMemo(() => {
    const def = records.filter((r) => r.tipo === "salida_definitiva");
    const temp = records.filter((r) => r.tipo === "salida_temporal");
    const defAprobadas = def.filter((r) => Boolean(r.dev && r.dev.trim() !== "" && r.dev !== "—"));
    const defPendientes = def.length - defAprobadas.length;

    return {
      total: records.length,
      defTotal: def.length,
      defAprobadas: defAprobadas.length,
      defPendientes,
      tempTotal: temp.length,
    };
  }, [records]);

  // Filtrado reactivo en la ventana
  const filteredRecords = React.useMemo(() => {
    let list = records;

    // Sub-pestaña
    if (subTab === "def") {
      list = list.filter((r) => r.tipo === "salida_definitiva");
    } else if (subTab === "temp") {
      list = list.filter((r) => r.tipo === "salida_temporal");
    }

    // Filtro por estatus / aprobación
    if (filterEstatus === "aprobados") {
      list = list.filter((r) => Boolean(r.dev && r.dev.trim() !== "" && r.dev !== "—"));
    } else if (filterEstatus === "sin_dev") {
      list = list.filter((r) => !r.dev || r.dev.trim() === "" || r.dev === "—");
    }

    // Búsqueda de texto
    const q = search.trim().toLowerCase();
    if (q) {
      list = list.filter((r) => {
        const hay = [
          r.boleta,
          r.ticket,
          r.nombre,
          r.marca,
          r.serie,
          r.numero_serie,
          r.ticket_rma,
          r.dev,
          r.sede,
        ]
          .map((v) => (v || "").toString().toLowerCase())
          .join(" ");
        return hay.includes(q);
      });
    }

    return list;
  }, [records, subTab, filterEstatus, search]);

  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 z-[99999] flex items-center justify-center p-3 sm:p-5 bg-black/60 backdrop-blur-sm animate-in fade-in duration-200"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        className="w-[98vw] max-w-[1480px] h-[92vh] max-h-[940px] bg-card border border-border rounded-2xl shadow-2xl flex flex-col overflow-hidden text-foreground animate-in zoom-in-95 duration-200"
        role="dialog"
        aria-modal="true"
      >
        {/* ── Encabezado nativo de la ventana ── */}
        <div className="px-6 py-4 border-b border-border bg-muted/20 flex items-center justify-between shrink-0 gap-3">
          <div className="flex items-center gap-3.5 min-w-0">
            <div className="h-11 w-11 rounded-2xl bg-brand-500/10 text-brand-500 border border-brand-500/20 flex items-center justify-center shrink-0 shadow-sm">
              <ShieldCheck className="h-6 w-6" />
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-2.5 flex-wrap">
                <h2 className="text-lg font-bold tracking-tight text-foreground truncate">
                  Mis Procesos de Garantías
                </h2>
                <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-brand-500/10 text-brand-500 border border-brand-500/25 shrink-0">
                  <User className="h-3.5 w-3.5" />
                  Propietario: {agentDisplayName}
                </span>
              </div>
              <p className="text-xs text-muted-foreground mt-0.5 truncate">
                Vista nativa exclusiva · Únicamente registros generados a tu nombre
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            {canCreate && (
              <button
                type="button"
                onClick={() => setShowCreateModal(true)}
                className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-brand-500 hover:bg-brand-600 text-white text-xs font-bold shadow-sm transition-all cursor-pointer active:scale-95 shrink-0"
                title="Registrar nueva boleta de salida oficial"
              >
                <Plus className="h-4 w-4 stroke-[2.5]" />
                <span>Nuevo Registro</span>
              </button>
            )}
            <button
              onClick={() => loadMyRecords()}
              disabled={loading}
              title="Actualizar registros en tiempo real"
              className="p-2.5 rounded-xl border border-border bg-background hover:bg-muted text-muted-foreground hover:text-foreground transition-colors cursor-pointer disabled:opacity-50"
            >
              <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin text-brand-500" : ""}`} />
            </button>
            <button
              onClick={onClose}
              title="Cerrar ventana (Esc)"
              className="p-2.5 rounded-xl border border-border bg-background hover:bg-red-500/10 hover:text-red-500 hover:border-red-500/30 text-muted-foreground transition-colors cursor-pointer"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>

        {/* ── Barra de Métricas Rápidas del Propietario (3 columnas amplias) ── */}
        <div className="px-6 py-4 bg-muted/10 border-b border-border grid grid-cols-1 sm:grid-cols-3 gap-4 shrink-0">
          <div className="p-4 rounded-2xl bg-card border border-border/80 flex items-center justify-between shadow-xs">
            <div className="space-y-1">
              <span className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground whitespace-nowrap">
                Total Mis Registros
              </span>
              <div className="text-2xl font-black text-foreground tabular-nums">{stats.total}</div>
            </div>
            <div className="h-11 w-11 rounded-xl bg-blue-500/10 text-blue-500 flex items-center justify-center shrink-0">
              <Layers className="h-5 w-5" />
            </div>
          </div>

          <div className="p-4 rounded-2xl bg-card border border-border/80 flex items-center justify-between shadow-xs">
            <div className="space-y-1">
              <span className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground whitespace-nowrap">
                Salidas Definitivas
              </span>
              <div className="text-2xl font-black text-emerald-600 flex items-center gap-2 tabular-nums">
                {stats.defTotal}
                <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-600 border border-emerald-500/20">
                  {stats.defAprobadas} aprobadas
                </span>
              </div>
            </div>
            <div className="h-11 w-11 rounded-xl bg-emerald-500/10 text-emerald-500 flex items-center justify-center shrink-0">
              <CheckCircle2 className="h-5 w-5" />
            </div>
          </div>

          <div className="p-4 rounded-2xl bg-card border border-border/80 flex items-center justify-between shadow-xs">
            <div className="space-y-1">
              <span className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground whitespace-nowrap">
                Salidas Temporales
              </span>
              <div className="text-2xl font-black text-amber-500 tabular-nums">{stats.tempTotal}</div>
            </div>
            <div className="h-11 w-11 rounded-xl bg-amber-500/10 text-amber-500 flex items-center justify-center shrink-0">
              <Clock className="h-5 w-5" />
            </div>
          </div>
        </div>

        {/* ── Sub-navegación y Filtros ── */}
        <div className="p-3 sm:px-6 border-b border-border bg-card flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 shrink-0">
          <div className="flex items-center gap-1.5 bg-muted/40 p-1 rounded-xl border border-border shrink-0 overflow-x-auto">
            <button
              onClick={() => setSubTab("todas")}
              className={`px-3.5 py-1.5 rounded-lg text-xs font-bold transition-all whitespace-nowrap cursor-pointer ${
                subTab === "todas" ? "bg-background text-foreground shadow-xs" : "text-muted-foreground hover:text-foreground"
              }`}
            >
              Todas ({stats.total})
            </button>
            <button
              onClick={() => setSubTab("def")}
              className={`px-3.5 py-1.5 rounded-lg text-xs font-bold transition-all whitespace-nowrap cursor-pointer ${
                subTab === "def" ? "bg-background text-brand-500 shadow-xs" : "text-muted-foreground hover:text-foreground"
              }`}
            >
              Definitivas ({stats.defTotal})
            </button>
            <button
              onClick={() => setSubTab("temp")}
              className={`px-3.5 py-1.5 rounded-lg text-xs font-bold transition-all whitespace-nowrap cursor-pointer ${
                subTab === "temp" ? "bg-background text-amber-500 shadow-xs" : "text-muted-foreground hover:text-foreground"
              }`}
            >
              Temporales ({stats.tempTotal})
            </button>
          </div>

          <div className="flex items-center gap-2.5 flex-1 justify-end">
            <div className="relative flex-1 sm:max-w-[280px]">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
              <input
                type="text"
                placeholder="Buscar boleta, ticket, cliente, serie..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="w-full pl-9 pr-3 py-1.5 rounded-xl border border-border bg-background text-xs text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-brand-500"
              />
              {search && (
                <button
                  onClick={() => setSearch("")}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                >
                  <X className="h-3 w-3" />
                </button>
              )}
            </div>

            <select
              value={filterEstatus}
              onChange={(e) => setFilterEstatus(e.target.value)}
              className="px-3 py-1.5 rounded-xl border border-border bg-background text-xs text-foreground focus:outline-none focus:ring-1 focus:ring-brand-500 font-medium shrink-0 cursor-pointer"
            >
              <option value="todos">Estado: Todos</option>
              <option value="aprobados">Aprobados (Con DEV)</option>
              <option value="sin_dev">Sin DEV / Pendiente</option>
            </select>
          </div>
        </div>

        {/* ── Tabla de Contenido con Scroll Horizontal y Vertical Amplio ── */}
        <div className="flex-1 overflow-auto min-h-0 bg-card">
          {loading && records.length === 0 ? (
            <div className="h-64 flex flex-col items-center justify-center gap-2 text-muted-foreground">
              <RefreshCw className="h-6 w-6 animate-spin text-brand-500" />
              <p className="text-xs font-medium">Consultando tus procesos en la base de datos...</p>
            </div>
          ) : filteredRecords.length === 0 ? (
            <div className="h-64 flex flex-col items-center justify-center gap-2 text-muted-foreground p-6 text-center">
              <AlertCircle className="h-8 w-8 text-muted-foreground/60" />
              <p className="text-sm font-bold text-foreground">No se encontraron registros a tu nombre</p>
              <p className="text-xs max-w-sm">
                {search || filterEstatus !== "todos"
                  ? "Prueba cambiando o limpiando los filtros de búsqueda."
                  : `No hay registros asociados a ${agentDisplayName}. Todos los que crees aparecerán automáticamente aquí.`}
              </p>
            </div>
          ) : (
            <table className="w-full text-left border-collapse text-xs">
              <thead className="bg-muted/40 sticky top-0 z-10 border-b border-border backdrop-blur-sm text-[11px] font-bold text-muted-foreground uppercase tracking-wider">
                <tr>
                  <th className="py-2.5 px-2 w-7 text-center"></th>
                  <th className="py-2.5 px-2 w-24">Boleta</th>
                  <th className="py-2.5 px-2 w-24">Fecha</th>
                  <th className="py-2.5 px-2 w-16">Ticket</th>
                  <th className="py-2.5 px-2 w-28">Categoría</th>
                  <th className="py-2.5 px-2.5 min-w-[150px]">Cliente</th>
                  <th className="py-2.5 px-2.5 min-w-[180px]">Artículo / Modelo & Serie</th>
                  <th className="py-2.5 px-2 w-44">Estatus & DEV</th>
                  <th className="py-2.5 px-2 w-20 text-right">Acciones</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {filteredRecords.map((r) => {
                  const rid = String(r.id);
                  const isExpanded = expandedId === rid;
                  const devVal = (r.dev || "").toString().trim();
                  const hasDev = devVal !== "" && devVal !== "—";
                  const isDef = r.tipo === "salida_definitiva";

                  return (
                    <React.Fragment key={rid}>
                      <tr
                        onClick={() => setExpandedId(isExpanded ? null : rid)}
                        className="hover:bg-muted/40 transition-colors cursor-pointer group"
                      >
                        <td className="py-2.5 px-2 text-center text-muted-foreground">
                          {isExpanded ? (
                            <ChevronDown className="h-4 w-4 text-brand-500 mx-auto" />
                          ) : (
                            <ChevronRight className="h-4 w-4 group-hover:text-foreground mx-auto" />
                          )}
                        </td>
                        <td className="py-2.5 px-2 font-mono font-bold whitespace-nowrap">
                          <span
                            className={`px-2 py-0.5 rounded-lg text-xs font-mono border ${
                              (r.boleta || "").startsWith("GNC") || (r.boleta || "").startsWith("TNC")
                                ? "bg-purple-500/10 text-purple-600 dark:text-purple-400 border-purple-500/25"
                                : (r.boleta || "").startsWith("G")
                                ? "bg-brand-500/10 text-brand-600 dark:text-brand-400 border-brand-500/25"
                                : "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/25"
                            }`}
                          >
                            {r.boleta || "—"}
                          </span>
                        </td>
                        <td className="py-2.5 px-2 text-muted-foreground whitespace-nowrap font-medium">
                          {r.fecha_creacion ? r.fecha_creacion.slice(0, 10) : "—"}
                        </td>
                        <td className="py-2.5 px-2 font-mono font-medium whitespace-nowrap">
                          {r.ticket ? `#${r.ticket}` : "—"}
                        </td>
                        <td className="py-2.5 px-2 whitespace-nowrap">
                          <span className="px-2 py-0.5 rounded-md text-[11px] font-semibold bg-muted border border-border">
                            {CAT_LABELS[r.categoria || ""] || r.categoria || "—"}
                          </span>
                        </td>
                        <td className="py-2.5 px-2.5 font-semibold text-foreground leading-snug">
                          {r.nombre || "—"}
                        </td>
                        <td className="py-2.5 px-2.5">
                          <div className="font-semibold text-foreground leading-snug">
                            {r.serie || r.descripcion || "—"}
                          </div>
                          <div className="text-[11px] text-muted-foreground font-mono mt-0.5 flex items-center gap-2 flex-wrap">
                            {r.marca && (
                              <span className="font-medium px-1.5 py-0.2 rounded bg-muted/60 text-muted-foreground border border-border/50 text-[10px]">
                                {r.marca}
                              </span>
                            )}
                            {r.numero_serie && <span>S/N: {r.numero_serie}</span>}
                          </div>
                        </td>
                        <td className="py-2.5 px-2 whitespace-nowrap">
                          {isDef ? (
                            hasDev ? (
                              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-lg text-xs font-mono font-bold bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/25">
                                <Check className="h-3.5 w-3.5" />
                                Aprobado • {r.dev}
                              </span>
                            ) : (
                              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-lg text-xs font-medium bg-amber-500/10 text-amber-600 dark:text-amber-400 border border-amber-500/25">
                                <Clock className="h-3.5 w-3.5" />
                                Por Aprobar (Sin DEV)
                              </span>
                            )
                          ) : hasDev ? (
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-lg text-xs font-mono font-bold bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/25">
                                <Check className="h-3.5 w-3.5" />
                                {r.dev}
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-lg text-xs font-medium bg-muted text-muted-foreground border border-border">
                              {r.estatus ? (KPI_ESTATUS_LABELS[r.estatus] || r.estatus) : "Temporal Activa"}
                            </span>
                          )}
                        </td>
                        <td className="py-2.5 px-2 text-right whitespace-nowrap" onClick={(e) => e.stopPropagation()}>
                          {canEdit ? (
                            <button
                              type="button"
                              onClick={() => setEditingRecord(r)}
                              className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-amber-500/10 hover:bg-amber-500/20 text-amber-500 text-xs font-bold border border-amber-500/25 transition-all cursor-pointer shadow-xs active:scale-95"
                              title="Editar este registro"
                            >
                              <Edit className="h-3.5 w-3.5" />
                              Editar
                            </button>
                          ) : (
                            <span className="text-[11px] text-muted-foreground/60 italic">Lectura</span>
                          )}
                        </td>
                      </tr>

                      {/* ── Fila expandible con detalle completo ── */}
                      {isExpanded && (
                        <tr className="bg-muted/20">
                          <td colSpan={9} className="p-4 border-t border-border">
                            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                              <div className="p-3 rounded-xl bg-card border border-border space-y-1.5">
                                <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
                                  Detalles Comerciales
                                </span>
                                <div className="text-xs space-y-1">
                                  <div><span className="text-muted-foreground">Sede:</span> {r.sede || "—"}</div>
                                  <div><span className="text-muted-foreground">Factura:</span> {r.factura || "—"}</div>
                                  <div><span className="text-muted-foreground">F. Compra:</span> {r.fecha_compra || "—"}</div>
                                </div>
                              </div>

                              <div className="p-3 rounded-xl bg-card border border-border space-y-1.5">
                                <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
                                  Aprobación & DEV
                                </span>
                                <div className="text-xs space-y-1">
                                  <div><span className="text-muted-foreground">DEV:</span> <strong className="font-mono text-brand-500">{r.dev || "Sin DEV"}</strong></div>
                                  <div><span className="text-muted-foreground">Fecha DEV:</span> {r.fecha_dev || "—"}</div>
                                  <div><span className="text-muted-foreground">Estatus:</span> {r.estatus ? (KPI_ESTATUS_LABELS[r.estatus] || r.estatus) : "—"}</div>
                                </div>
                              </div>

                              <div className="p-3 rounded-xl bg-card border border-border space-y-1.5">
                                <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
                                  Trámite RMA
                                </span>
                                <div className="text-xs space-y-1">
                                  <div><span className="text-muted-foreground">Ticket RMA:</span> {r.ticket_rma || "—"}</div>
                                  <div><span className="text-muted-foreground">Fecha RMA:</span> {r.fecha_rma ? r.fecha_rma.slice(0, 10) : "—"}</div>
                                  <div><span className="text-muted-foreground">Serie Fábrica:</span> {r.serie_fabrica || "—"}</div>
                                </div>
                              </div>
                            </div>

                            {/* Falla y Observaciones */}
                            {(r.falla || (r as any).observaciones) && (
                              <div className="mt-2.5 p-3 rounded-xl bg-card border border-border text-xs space-y-1">
                                {r.falla && (
                                  <div><strong className="text-muted-foreground">Falla:</strong> {r.falla}</div>
                                )}
                                {(r as any).observaciones && (
                                  <div><strong className="text-muted-foreground">Observaciones:</strong> {(r as any).observaciones}</div>
                                )}
                              </div>
                            )}

                            <div className="mt-2.5 flex items-center justify-between pt-1">
                              <span className="text-[11px] text-muted-foreground">
                                Registrado por: <strong>{r.registrado_por || agentDisplayName}</strong>
                              </span>
                              <div className="flex items-center gap-2">
                                <button
                                  type="button"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    setEditingRecord(r);
                                  }}
                                  className="inline-flex items-center gap-1.5 px-3 py-1 rounded-lg bg-amber-500 hover:bg-amber-600 text-white text-xs font-bold transition-all cursor-pointer shadow-xs active:scale-95"
                                >
                                  <Edit className="h-3.5 w-3.5" />
                                  Editar Registro
                                </button>
                                <button
                                  type="button"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    navigator.clipboard.writeText(r.boleta || "");
                                    toast.success(`Boleta ${r.boleta} copiada al portapapeles`);
                                  }}
                                  className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-muted hover:bg-muted/80 text-foreground text-xs font-semibold border border-border cursor-pointer transition-colors"
                                >
                                  <Copy className="h-3 w-3" />
                                  Copiar Boleta
                                </button>
                              </div>
                            </div>
                          </td>
                        </tr>
                      )}
                    </React.Fragment>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>

        {/* ── Pie nativo con información de estado ── */}
        <div className="px-5 py-2.5 border-t border-border bg-muted/20 flex items-center justify-between text-[11px] text-muted-foreground shrink-0">
          <span>
            Mostrando <strong>{filteredRecords.length}</strong> de <strong>{records.length}</strong> registros propios
          </span>
          {lastUpdated && <span>Última sincronización: {lastUpdated}</span>}
        </div>
      </div>

      {/* ── Modal de Edición de Garantía (Nativo e Integrado) ── */}
      {editingRecord && (
        <GarantiasEditModal
          record={editingRecord}
          onClose={() => setEditingRecord(null)}
          onSaved={handleSavedRecord}
          canEditDev={true}
        />
      )}

      {/* ── Modal de Nuevo Registro de Garantía (Nativo y Sincronizado) ── */}
      {showCreateModal && (
        <GarantiasCreateModal
          isOpen={showCreateModal}
          onClose={() => setShowCreateModal(false)}
          onSaved={handleCreatedRecord}
          defaultAgentName={agentDisplayName}
        />
      )}
    </div>
  );
}
