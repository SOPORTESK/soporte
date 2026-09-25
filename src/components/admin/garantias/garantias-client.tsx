"use client";

import * as React from "react";
import {
  ShieldCheck,
  Search,
  Filter,
  RefreshCw,
  Download,
  AlertTriangle,
  Clock,
  CheckCircle2,
  Calendar,
  FileSpreadsheet,
  Edit,
  Trash2,
  ChevronDown,
  ChevronRight,
  ExternalLink,
  Plus,
  ArrowUpDown,
  Building2,
  Tag,
  AlertCircle,
  HelpCircle,
  TrendingUp,
  Award,
  Layers,
  FileText,
  X,
} from "lucide-react";
import * as XLSX from "xlsx";
import { toast } from "sonner";
import {
  GarantiaRecord,
  CAT_LABELS,
  MOT_LABELS,
  KPI_ESTATUS_LABELS,
  ESTATUS_CERRADOS,
  SEDES,
  formatTimeElapsed,
} from "./garantias-types";
import { GarantiasEditModal } from "./garantias-edit-modal";

interface GarantiasClientProps {
  initialRecords?: GarantiaRecord[];
  initialStats?: any;
  isAdmin?: boolean;
  isSuperadmin?: boolean;
}

export function GarantiasClient({
  initialRecords = [],
  initialStats,
  isAdmin = true,
  isSuperadmin = false,
}: GarantiasClientProps) {
  // Navigation tabs: "def" | "temp" | "rma" | "auditoria" | "kpis"
  const [activeTab, setActiveTab] = React.useState<"def" | "temp" | "rma" | "auditoria" | "kpis">("def");
  const [rmaSubTab, setRmaSubTab] = React.useState<"registros" | "analisis">("registros");

  // State for records
  const [records, setRecords] = React.useState<GarantiaRecord[]>(initialRecords);
  const [loading, setLoading] = React.useState(false);
  const [statsData, setStatsData] = React.useState<any>(initialStats || null);

  // Filters state
  const [search, setSearch] = React.useState("");
  const [filterSede, setFilterSede] = React.useState("");
  const [filterCategoria, setFilterCategoria] = React.useState("");
  const [filterDevStatus, setFilterDevStatus] = React.useState<"todos" | "con_dev" | "sin_dev">("todos");
  const [filterFechaDesde, setFilterFechaDesde] = React.useState("");
  const [filterFechaHasta, setFilterFechaHasta] = React.useState("");

  // RMA specific filters
  const [filterRmaMarca, setFilterRmaMarca] = React.useState("");
  const [filterRmaEstatus, setFilterRmaEstatus] = React.useState("");

  // Pagination state
  const [currentPage, setCurrentPage] = React.useState(1);
  const pageSize = 15;

  // Expanded rows state
  const [expandedRows, setExpandedRows] = React.useState<Record<string | number, boolean>>({});

  // Edit modal & Delete confirm state
  const [editingRecord, setEditingRecord] = React.useState<GarantiaRecord | null>(null);
  const [deletingRecord, setDeletingRecord] = React.useState<GarantiaRecord | null>(null);
  const [isDeleting, setIsDeleting] = React.useState(false);

  // Load all records
  const loadRecords = React.useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/admin/garantias?limit=1000");
      if (!res.ok) throw new Error("Error al consultar las garantías");
      const data = await res.json();
      setRecords(data.records || []);

      // Refresh stats as well
      const statsRes = await fetch("/api/admin/garantias/stats");
      if (statsRes.ok) {
        const stats = await statsRes.json();
        setStatsData(stats);
      }
    } catch (err: any) {
      toast.error("Error al cargar garantías", { description: err.message });
    } finally {
      setLoading(false);
    }
  }, []);

  React.useEffect(() => {
    if (!initialRecords || initialRecords.length === 0) {
      loadRecords();
    }
  }, [loadRecords, initialRecords]);

  // Reset page when tab or filters change
  React.useEffect(() => {
    setCurrentPage(1);
    setExpandedRows({});
  }, [activeTab, search, filterSede, filterCategoria, filterDevStatus, filterFechaDesde, filterFechaHasta, filterRmaMarca, filterRmaEstatus]);

  // Derived collections
  const rawDefinitivas = React.useMemo(() => {
    return records.filter((r) => r.tipo === "salida_definitiva");
  }, [records]);

  const rawTemporales = React.useMemo(() => {
    return records.filter((r) => r.tipo === "salida_temporal");
  }, [records]);

  // RMA Pool: All temporales (unless excluir_rma) + definitivas that are RMA or have RMA fields
  const rmaPool = React.useMemo(() => {
    const cleanStr = (v: any) => (v ? v.toString().trim().replace(/^[\-\s—]+$/, "") : "");
    return records.filter((r) => {
      if (r.excluir_rma) return false;
      const cat = (r.categoria || "").toLowerCase();
      const esCatRMA = cat.includes("rma");
      const tieneCamposRMA =
        cleanStr(r.ticket_rma) !== "" ||
        cleanStr(r.fecha_rma) !== "" ||
        cleanStr(r.serie_fabrica) !== "" ||
        cleanStr(r.estatus) !== "";
      return r.tipo === "salida_temporal" || esCatRMA || tieneCamposRMA;
    });
  }, [records]);

  // NC without DEV audit: records with NC category/motive/boleta that lack DEV
  const ncSinDevList = React.useMemo(() => {
    return records.filter((r) => {
      const cat = (r.categoria || "").toLowerCase();
      const mot = (r.motivo || "").toLowerCase();
      const bol = (r.boleta || "").toUpperCase();
      const esNC = cat.includes("nota") || cat.includes("credito") || cat.includes("nc") || mot.includes("sin_existencias") || bol.startsWith("GNC") || bol.startsWith("TNC");
      if (!esNC) return false;
      const devVal = (r.dev || "").toString().trim();
      return !devVal || devVal === "" || devVal === "—";
    });
  }, [records]);

  // Filtered lists based on active tab
  const activeRecords = React.useMemo(() => {
    let list: GarantiaRecord[] = [];
    if (activeTab === "def") list = rawDefinitivas;
    else if (activeTab === "temp") list = rawTemporales;
    else if (activeTab === "rma") list = rmaPool;
    else if (activeTab === "auditoria") list = ncSinDevList;
    else return [];

    const q = search.trim().toLowerCase();

    return list.filter((r) => {
      // Search text query
      if (q) {
        const hay = [
          r.boleta,
          r.nombre,
          r.ticket,
          r.marca,
          r.factura,
          r.serie,
          r.numero_serie,
          r.ticket_rma,
          r.sede,
        ]
          .map((x) => (x || "").toString().toLowerCase())
          .join(" ");
        if (!hay.includes(q)) return false;
      }

      // Sede filter
      if (filterSede && (r.sede || "").toLowerCase() !== filterSede.toLowerCase()) {
        return false;
      }

      // Categoria filter
      if (filterCategoria && r.categoria !== filterCategoria) {
        return false;
      }

      // DEV status filter
      if (filterDevStatus !== "todos") {
        const hasDev = Boolean(r.dev && r.dev.toString().trim() !== "" && r.dev !== "—");
        if (filterDevStatus === "con_dev" && !hasDev) return false;
        if (filterDevStatus === "sin_dev" && hasDev) return false;
      }

      // Date range filter
      if (filterFechaDesde && r.fecha_creacion && r.fecha_creacion.slice(0, 10) < filterFechaDesde) {
        return false;
      }
      if (filterFechaHasta && r.fecha_creacion && r.fecha_creacion.slice(0, 10) > filterFechaHasta) {
        return false;
      }

      // RMA specific filters
      if (activeTab === "rma") {
        if (filterRmaMarca && (r.marca || "").trim().toUpperCase() !== filterRmaMarca.toUpperCase()) {
          return false;
        }
        if (filterRmaEstatus && r.estatus !== filterRmaEstatus) {
          return false;
        }
      }

      return true;
    });
  }, [
    activeTab,
    rawDefinitivas,
    rawTemporales,
    rmaPool,
    ncSinDevList,
    search,
    filterSede,
    filterCategoria,
    filterDevStatus,
    filterFechaDesde,
    filterFechaHasta,
    filterRmaMarca,
    filterRmaEstatus,
  ]);

  // Paginated records
  const totalPages = Math.max(1, Math.ceil(activeRecords.length / pageSize));
  const paginatedRecords = React.useMemo(() => {
    const start = (currentPage - 1) * pageSize;
    return activeRecords.slice(start, start + pageSize);
  }, [activeRecords, currentPage, pageSize]);

  // Toggle row expansion
  const toggleRow = (id: string | number) => {
    setExpandedRows((prev) => ({ ...prev, [id]: !prev[id] }));
  };

  // Delete handler
  const handleDelete = async () => {
    if (!deletingRecord) return;
    setIsDeleting(true);
    try {
      const res = await fetch(`/api/admin/garantias/${deletingRecord.id}`, {
        method: "DELETE",
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || "No se pudo eliminar el registro");
      }
      toast.success("Registro eliminado", { description: deletingRecord.boleta || String(deletingRecord.id) });
      setRecords((prev) => prev.filter((r) => r.id !== deletingRecord.id));
      setDeletingRecord(null);
    } catch (err: any) {
      toast.error("Error al eliminar", { description: err.message });
    } finally {
      setIsDeleting(false);
    }
  };

  // Callback when saved in edit modal
  const handleRecordSaved = (updated: GarantiaRecord) => {
    setRecords((prev) => prev.map((r) => (r.id === updated.id ? updated : r)));
    setEditingRecord(null);
    toast.success("Garantía actualizada", { description: updated.boleta || `ID: ${updated.id}` });
  };

  // Excel exports
  const exportCurrentViewToExcel = () => {
    if (activeRecords.length === 0) {
      toast.info("No hay registros para exportar");
      return;
    }

    const tabName =
      activeTab === "def"
        ? "Salidas Definitivas"
        : activeTab === "temp"
        ? "Salidas Temporales"
        : activeTab === "rma"
        ? "Trámites RMA"
        : "Auditoría NC sin DEV";

    const rows = activeRecords.map((r) => ({
      Boleta: r.boleta || "—",
      Fecha: r.fecha_creacion ? r.fecha_creacion.slice(0, 10) : "—",
      Ticket: r.ticket || "—",
      Sede: r.sede || "—",
      Cliente: r.nombre || "—",
      Marca: r.marca || "—",
      Artículo: r.serie || "—",
      "N° Serie": r.numero_serie || "—",
      Factura: r.factura || "—",
      Cantidad: r.cantidad || 1,
      Categoría: CAT_LABELS[r.categoria || ""] || r.categoria || "—",
      Motivo: MOT_LABELS[r.motivo || ""] || r.motivo || "—",
      DEV: r.dev || "—",
      "Ticket RMA": r.ticket_rma || "—",
      "Fecha RMA": r.fecha_rma ? r.fecha_rma.slice(0, 10) : "—",
      "Estatus RMA": KPI_ESTATUS_LABELS[r.estatus || ""] || r.estatus || "—",
      "Falla Reportada": r.falla || "—",
      "Registrado Por": r.registrado_por || "—",
    }));

    const ws = XLSX.utils.json_to_sheet(rows);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, tabName.slice(0, 31));
    const filename = `Sekunet_${tabName.replace(/\s+/g, "_")}_${new Date().toISOString().slice(0, 10)}.xlsx`;
    XLSX.writeFile(wb, filename);
    toast.success("Excel descargado", { description: `${activeRecords.length} registros exportados` });
  };

  const exportFullAuditToExcel = () => {
    if (records.length === 0) {
      toast.info("No hay registros en la base de datos");
      return;
    }

    const today = new Date().toISOString().slice(0, 10);
    const wb = XLSX.utils.book_new();

    // Hoja 1: Resumen
    const summary = [
      ["AUDITORÍA GENERAL DE GARANTÍAS - SEKUNET"],
      ["Fecha de Generación:", new Date().toLocaleString("es-CR")],
      ["Total Registros:", records.length],
      ["Salidas Definitivas:", rawDefinitivas.length],
      ["Salidas Temporales:", rawTemporales.length],
      ["Trámites RMA Activos:", rmaPool.length],
      ["NC sin DEV Pendientes:", ncSinDevList.length],
      [],
      ["Métrica", "Valor", "Detalle"],
      ["Total en Sistema", records.length, "Registros totales en Supabase"],
      ["Definitivas", rawDefinitivas.length, "Tipo = salida_definitiva"],
      ["Temporales", rawTemporales.length, "Tipo = salida_temporal"],
      ["Auditoría NC", ncSinDevList.length, "Notas de crédito sin número DEV"],
    ];
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(summary), "Resumen General");

    // Hoja 2: Todos los Registros
    const allRows = records.map((r) => ({
      Boleta: r.boleta || "—",
      Tipo: r.tipo === "salida_definitiva" ? "Definitiva" : "Temporal",
      Fecha: r.fecha_creacion ? r.fecha_creacion.slice(0, 10) : "—",
      Ticket: r.ticket || "—",
      Sede: r.sede || "—",
      Cliente: r.nombre || "—",
      Marca: r.marca || "—",
      Artículo: r.serie || "—",
      "N° Serie": r.numero_serie || "—",
      Categoría: CAT_LABELS[r.categoria || ""] || r.categoria || "—",
      Motivo: MOT_LABELS[r.motivo || ""] || r.motivo || "—",
      DEV: r.dev || "—",
      "Fecha DEV": r.fecha_dev || "—",
      "Ticket RMA": r.ticket_rma || "—",
      "Fecha RMA": r.fecha_rma ? r.fecha_rma.slice(0, 10) : "—",
      "Estatus RMA": KPI_ESTATUS_LABELS[r.estatus || ""] || r.estatus || "—",
      "Registrado Por": r.registrado_por || "—",
      "Modificado Por": r.modificado_por || "—",
    }));
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(allRows), "Todos los Registros");

    // Hoja 3: NC sin DEV
    const ncRows = ncSinDevList.map((r) => ({
      Boleta: r.boleta || "—",
      Cliente: r.nombre || "—",
      Sede: r.sede || "—",
      Marca: r.marca || "—",
      Artículo: r.serie || "—",
      Fecha: r.fecha_creacion ? r.fecha_creacion.slice(0, 10) : "—",
      Categoría: CAT_LABELS[r.categoria || ""] || r.categoria || "—",
      "DEV Actual": r.dev || "PENDIENTE",
      "Registrado Por": r.registrado_por || "—",
    }));
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(ncRows), "NC sin DEV");

    // Hoja 4: Trámites RMA
    const rmaRows = rmaPool.map((r) => {
      const dias =
        r.fecha_rma || r.fecha_creacion
          ? Math.max(
              0,
              Math.round(
                ((r.estatus && ESTATUS_CERRADOS.includes(r.estatus) && r.fecha_modificacion
                  ? new Date(r.fecha_modificacion).getTime()
                  : Date.now()) -
                  new Date(r.fecha_rma || r.fecha_creacion || "").getTime()) /
                  864e5
              )
            )
          : "";
      return {
        Boleta: r.boleta || "—",
        Ticket: r.ticket || "—",
        Cliente: r.nombre || "—",
        Marca: r.marca || "—",
        Artículo: r.serie || "—",
        Serie: r.numero_serie || "—",
        "Ticket RMA": r.ticket_rma || "—",
        "Fecha RMA": r.fecha_rma ? r.fecha_rma.slice(0, 10) : "—",
        "Días Transcurridos": dias,
        Estatus: KPI_ESTATUS_LABELS[r.estatus || ""] || r.estatus || "—",
        "Serie Reemplazo": r.serie_fabrica || "—",
        Falla: r.falla || "—",
      };
    });
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(rmaRows), "Trámites RMA");

    const filename = `Auditoria_Garantias_Sekunet_${today}.xlsx`;
    XLSX.writeFile(wb, filename);
    toast.success("Auditoría completa descargada", { description: `${records.length} registros exportados` });
  };

  // Distinct brands for RMA filtering
  const distinctRmaMarcas = React.useMemo(() => {
    return Array.from(
      new Set(rmaPool.map((r) => (r.marca || "").trim().toUpperCase()).filter(Boolean))
    ).sort();
  }, [rmaPool]);

  // Distinct RMA statuses present in data
  const distinctRmaEstatus = React.useMemo(() => {
    return Array.from(new Set(rmaPool.map((r) => r.estatus).filter((s): s is string => Boolean(s)))).sort();
  }, [rmaPool]);

  // Quick stats calculation
  const statsOverview = React.useMemo(() => {
    const total = records.length;
    const def = rawDefinitivas.length;
    const temp = rawTemporales.length;
    const ncMissing = ncSinDevList.length;
    const rmaTotal = rmaPool.length;

    const rmaCerrados = rmaPool.filter((r) => r.estatus && ESTATUS_CERRADOS.includes(r.estatus)).length;
    const rmaRate = rmaTotal > 0 ? ((rmaCerrados / rmaTotal) * 100).toFixed(1) : "0.0";

    return { total, def, temp, ncMissing, rmaTotal, rmaCerrados, rmaRate };
  }, [records, rawDefinitivas, rawTemporales, ncSinDevList, rmaPool]);

  return (
    <div className="space-y-6">
      {/* Header with Title and Actions */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-border pb-5">
        <div>
          <div className="flex items-center gap-2.5">
            <div className="p-2 rounded-xl bg-brand-500/10 text-brand-600 border border-brand-500/20">
              <ShieldCheck className="h-6 w-6" />
            </div>
            <div>
              <h1 className="text-xl font-bold text-foreground tracking-tight flex items-center gap-2">
                Gestión de Garantías
                <span className="text-xs px-2.5 py-0.5 rounded-full bg-brand-500/15 text-brand-600 border border-brand-500/25 font-semibold">
                  Admin
                </span>
              </h1>
              <p className="text-xs text-muted-foreground mt-0.5">
                Control de salidas definitivas, temporales, trámites de marca (RMA) y auditoría contable DEV.
              </p>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          <button
            onClick={loadRecords}
            disabled={loading}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-border bg-card hover:bg-muted text-xs font-medium text-foreground transition-colors disabled:opacity-50"
            title="Recargar datos desde Supabase"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`} />
            <span>Actualizar</span>
          </button>

          <button
            onClick={exportCurrentViewToExcel}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-emerald-500/30 bg-emerald-500/10 hover:bg-emerald-500/20 text-xs font-semibold text-emerald-600 dark:text-emerald-400 transition-colors"
            title="Exportar registros filtrados a Excel"
          >
            <Download className="h-3.5 w-3.5" />
            <span>Exportar Vista</span>
          </button>

          <button
            onClick={exportFullAuditToExcel}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-brand-500/30 bg-brand-500/10 hover:bg-brand-500/20 text-xs font-semibold text-brand-600 dark:text-brand-400 transition-colors"
            title="Descargar libro Excel multi-hoja con auditoría completa"
          >
            <FileSpreadsheet className="h-3.5 w-3.5" />
            <span>Auditoría Completa</span>
          </button>
        </div>
      </div>

      {/* KPI Cards Ribbon */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
        <div className="p-3.5 rounded-xl border border-border bg-card shadow-sm flex flex-col justify-between">
          <div className="flex items-center justify-between text-muted-foreground">
            <span className="text-[11px] font-semibold uppercase tracking-wider">Definitivas</span>
            <span className="h-2 w-2 rounded-full bg-blue-500" />
          </div>
          <div className="mt-2 flex items-baseline justify-between">
            <span className="text-2xl font-black text-foreground">{statsOverview.def}</span>
            <span className="text-[11px] text-muted-foreground">Salidas</span>
          </div>
        </div>

        <div className="p-3.5 rounded-xl border border-border bg-card shadow-sm flex flex-col justify-between">
          <div className="flex items-center justify-between text-muted-foreground">
            <span className="text-[11px] font-semibold uppercase tracking-wider">Temporales</span>
            <span className="h-2 w-2 rounded-full bg-amber-500" />
          </div>
          <div className="mt-2 flex items-baseline justify-between">
            <span className="text-2xl font-black text-foreground">{statsOverview.temp}</span>
            <span className="text-[11px] text-muted-foreground">Salidas</span>
          </div>
        </div>

        <div className="p-3.5 rounded-xl border border-border bg-card shadow-sm flex flex-col justify-between">
          <div className="flex items-center justify-between text-muted-foreground">
            <span className="text-[11px] font-semibold uppercase tracking-wider">Trámites RMA</span>
            <span className="h-2 w-2 rounded-full bg-purple-500" />
          </div>
          <div className="mt-2 flex items-baseline justify-between">
            <span className="text-2xl font-black text-foreground">{statsOverview.rmaTotal}</span>
            <span className="text-[11px] text-muted-foreground">{statsOverview.rmaRate}% resueltos</span>
          </div>
        </div>

        <div className="p-3.5 rounded-xl border border-border bg-card shadow-sm flex flex-col justify-between">
          <div className="flex items-center justify-between text-muted-foreground">
            <span className="text-[11px] font-semibold uppercase tracking-wider">Auditoría DEV</span>
            {statsOverview.ncMissing > 0 ? (
              <span className="h-2 w-2 rounded-full bg-rose-500 animate-pulse" />
            ) : (
              <span className="h-2 w-2 rounded-full bg-emerald-500" />
            )}
          </div>
          <div className="mt-2 flex items-baseline justify-between">
            <span className={`text-2xl font-black ${statsOverview.ncMissing > 0 ? "text-rose-500" : "text-emerald-500"}`}>
              {statsOverview.ncMissing}
            </span>
            <span className="text-[11px] text-muted-foreground">NC sin DEV</span>
          </div>
        </div>

        <div className="p-3.5 rounded-xl border border-border bg-card shadow-sm flex flex-col justify-between col-span-2 sm:col-span-1">
          <div className="flex items-center justify-between text-muted-foreground">
            <span className="text-[11px] font-semibold uppercase tracking-wider">Total BD</span>
            <Layers className="h-3.5 w-3.5 text-muted-foreground" />
          </div>
          <div className="mt-2 flex items-baseline justify-between">
            <span className="text-2xl font-black text-foreground">{statsOverview.total}</span>
            <span className="text-[11px] text-muted-foreground">Registros</span>
          </div>
        </div>
      </div>

      {/* Main Tabs Navigation */}
      <div className="flex items-center gap-1 border-b border-border overflow-x-auto pb-px">
        <button
          onClick={() => setActiveTab("def")}
          className={`flex items-center gap-2 px-4 py-2.5 text-xs font-semibold rounded-t-lg transition-all border-b-2 whitespace-nowrap ${
            activeTab === "def"
              ? "border-brand-500 text-brand-600 dark:text-brand-400 bg-brand-500/5 font-bold"
              : "border-transparent text-muted-foreground hover:text-foreground hover:bg-muted/50"
          }`}
        >
          <span>Salidas Definitivas</span>
          <span
            className={`px-1.5 py-0.2 rounded-full text-[10px] ${
              activeTab === "def" ? "bg-brand-500 text-white" : "bg-muted text-muted-foreground"
            }`}
          >
            {rawDefinitivas.length}
          </span>
        </button>

        <button
          onClick={() => setActiveTab("temp")}
          className={`flex items-center gap-2 px-4 py-2.5 text-xs font-semibold rounded-t-lg transition-all border-b-2 whitespace-nowrap ${
            activeTab === "temp"
              ? "border-brand-500 text-brand-600 dark:text-brand-400 bg-brand-500/5 font-bold"
              : "border-transparent text-muted-foreground hover:text-foreground hover:bg-muted/50"
          }`}
        >
          <span>Salidas Temporales</span>
          <span
            className={`px-1.5 py-0.2 rounded-full text-[10px] ${
              activeTab === "temp" ? "bg-brand-500 text-white" : "bg-muted text-muted-foreground"
            }`}
          >
            {rawTemporales.length}
          </span>
        </button>

        <button
          onClick={() => setActiveTab("rma")}
          className={`flex items-center gap-2 px-4 py-2.5 text-xs font-semibold rounded-t-lg transition-all border-b-2 whitespace-nowrap ${
            activeTab === "rma"
              ? "border-brand-500 text-brand-600 dark:text-brand-400 bg-brand-500/5 font-bold"
              : "border-transparent text-muted-foreground hover:text-foreground hover:bg-muted/50"
          }`}
        >
          <span>Trámites de Marca (RMA)</span>
          <span
            className={`px-1.5 py-0.2 rounded-full text-[10px] ${
              activeTab === "rma" ? "bg-brand-500 text-white" : "bg-muted text-muted-foreground"
            }`}
          >
            {rmaPool.length}
          </span>
        </button>

        <button
          onClick={() => setActiveTab("auditoria")}
          className={`flex items-center gap-2 px-4 py-2.5 text-xs font-semibold rounded-t-lg transition-all border-b-2 whitespace-nowrap ${
            activeTab === "auditoria"
              ? "border-rose-500 text-rose-600 dark:text-rose-400 bg-rose-500/5 font-bold"
              : "border-transparent text-muted-foreground hover:text-foreground hover:bg-muted/50"
          }`}
        >
          <span>Auditoría NC sin DEV</span>
          {ncSinDevList.length > 0 && (
            <span className="px-1.5 py-0.2 rounded-full text-[10px] bg-rose-500 text-white font-bold">
              {ncSinDevList.length}
            </span>
          )}
        </button>

        <button
          onClick={() => setActiveTab("kpis")}
          className={`flex items-center gap-2 px-4 py-2.5 text-xs font-semibold rounded-t-lg transition-all border-b-2 whitespace-nowrap ${
            activeTab === "kpis"
              ? "border-brand-500 text-brand-600 dark:text-brand-400 bg-brand-500/5 font-bold"
              : "border-transparent text-muted-foreground hover:text-foreground hover:bg-muted/50"
          }`}
        >
          <TrendingUp className="h-3.5 w-3.5" />
          <span>Control de Calidad & KPIs</span>
        </button>
      </div>

      {/* FILTER CONTROLS BAR (Shown for Def, Temp, RMA, Auditoria) */}
      {activeTab !== "kpis" && (
        <div className="p-4 rounded-xl border border-border bg-card shadow-sm space-y-3">
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-2.5">
            {/* Search Input */}
            <div className="relative sm:col-span-2">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Buscar boleta, cliente, serie, ticket..."
                className="w-full pl-9 pr-3 py-1.5 rounded-lg border border-border bg-background text-xs focus:outline-none focus:ring-1 focus:ring-brand-500"
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

            {/* Sede Selector */}
            <div>
              <select
                value={filterSede}
                onChange={(e) => setFilterSede(e.target.value)}
                className="w-full px-2.5 py-1.5 rounded-lg border border-border bg-background text-xs focus:outline-none focus:ring-1 focus:ring-brand-500"
              >
                <option value="">Todas las Sedes</option>
                {SEDES.map((s) => (
                  <option key={s} value={s}>
                    {s}
                  </option>
                ))}
              </select>
            </div>

            {/* Categoría Selector (For def & temp) */}
            {activeTab !== "rma" && activeTab !== "auditoria" && (
              <div>
                <select
                  value={filterCategoria}
                  onChange={(e) => setFilterCategoria(e.target.value)}
                  className="w-full px-2.5 py-1.5 rounded-lg border border-border bg-background text-xs focus:outline-none focus:ring-1 focus:ring-brand-500"
                >
                  <option value="">Todas las Categorías</option>
                  {Object.entries(CAT_LABELS).map(([key, label]) => (
                    <option key={key} value={key}>
                      {label}
                    </option>
                  ))}
                </select>
              </div>
            )}

            {/* DEV Status Selector */}
            {activeTab !== "rma" && (
              <div>
                <select
                  value={filterDevStatus}
                  onChange={(e) => setFilterDevStatus(e.target.value as any)}
                  className="w-full px-2.5 py-1.5 rounded-lg border border-border bg-background text-xs focus:outline-none focus:ring-1 focus:ring-brand-500"
                >
                  <option value="todos">Estado DEV: Todos</option>
                  <option value="con_dev">Con DEV (Aprobado)</option>
                  <option value="sin_dev">Sin DEV (Pendiente)</option>
                </select>
              </div>
            )}

            {/* RMA specific filters */}
            {activeTab === "rma" && (
              <>
                <div>
                  <select
                    value={filterRmaMarca}
                    onChange={(e) => setFilterRmaMarca(e.target.value)}
                    className="w-full px-2.5 py-1.5 rounded-lg border border-border bg-background text-xs focus:outline-none focus:ring-1 focus:ring-brand-500"
                  >
                    <option value="">Todas las Marcas</option>
                    {distinctRmaMarcas.map((m) => (
                      <option key={m} value={m}>
                        {m}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <select
                    value={filterRmaEstatus}
                    onChange={(e) => setFilterRmaEstatus(e.target.value)}
                    className="w-full px-2.5 py-1.5 rounded-lg border border-border bg-background text-xs focus:outline-none focus:ring-1 focus:ring-brand-500"
                  >
                    <option value="">Todos los Estatus RMA</option>
                    {distinctRmaEstatus.map((est) => (
                      <option key={est} value={est}>
                        {KPI_ESTATUS_LABELS[est] || est}
                      </option>
                    ))}
                  </select>
                </div>
              </>
            )}

            {/* Date Range From */}
            <div>
              <input
                type="date"
                value={filterFechaDesde}
                onChange={(e) => setFilterFechaDesde(e.target.value)}
                placeholder="Desde"
                className="w-full px-2 py-1.5 rounded-lg border border-border bg-background text-xs focus:outline-none focus:ring-1 focus:ring-brand-500"
                title="Fecha desde"
              />
            </div>

            {/* Date Range To */}
            <div>
              <input
                type="date"
                value={filterFechaHasta}
                onChange={(e) => setFilterFechaHasta(e.target.value)}
                placeholder="Hasta"
                className="w-full px-2 py-1.5 rounded-lg border border-border bg-background text-xs focus:outline-none focus:ring-1 focus:ring-brand-500"
                title="Fecha hasta"
              />
            </div>
          </div>

          {/* Quick Active Filter Badges & Clear Button */}
          {(search || filterSede || filterCategoria || filterDevStatus !== "todos" || filterFechaDesde || filterFechaHasta || filterRmaMarca || filterRmaEstatus) && (
            <div className="flex items-center justify-between text-xs pt-2 border-t border-border/50">
              <span className="text-muted-foreground text-[11px]">
                Filtrando <strong>{activeRecords.length}</strong> de{" "}
                <strong>
                  {activeTab === "def"
                    ? rawDefinitivas.length
                    : activeTab === "temp"
                    ? rawTemporales.length
                    : activeTab === "rma"
                    ? rmaPool.length
                    : ncSinDevList.length}
                </strong>{" "}
                registros
              </span>
              <button
                onClick={() => {
                  setSearch("");
                  setFilterSede("");
                  setFilterCategoria("");
                  setFilterDevStatus("todos");
                  setFilterFechaDesde("");
                  setFilterFechaHasta("");
                  setFilterRmaMarca("");
                  setFilterRmaEstatus("");
                }}
                className="text-xs text-brand-600 hover:text-brand-700 font-semibold"
              >
                Limpiar Filtros
              </button>
            </div>
          )}
        </div>
      )}

      {/* TAB 1 & 2: SALIDAS DEFINITIVAS Y TEMPORALES TABLE */}
      {(activeTab === "def" || activeTab === "temp") && (
        <div className="rounded-xl border border-border bg-card shadow-sm overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs border-collapse">
              <thead>
                <tr className="bg-muted/40 border-b border-border text-muted-foreground uppercase text-[10px] tracking-wider font-semibold">
                  <th className="p-3 w-8"></th>
                  <th className="p-3">Boleta</th>
                  <th className="p-3">Fecha</th>
                  <th className="p-3">Ticket</th>
                  <th className="p-3">Cliente</th>
                  <th className="p-3">Artículo / Marca</th>
                  <th className="p-3">Sede</th>
                  <th className="p-3">Categoría</th>
                  <th className="p-3">DEV / Estatus</th>
                  <th className="p-3 text-right">Acciones</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {loading && paginatedRecords.length === 0 ? (
                  <tr>
                    <td colSpan={10} className="p-8 text-center text-muted-foreground">
                      <RefreshCw className="h-6 w-6 animate-spin mx-auto mb-2 text-brand-500" />
                      <span>Cargando registros de garantías...</span>
                    </td>
                  </tr>
                ) : paginatedRecords.length === 0 ? (
                  <tr>
                    <td colSpan={10} className="p-8 text-center text-muted-foreground">
                      <AlertCircle className="h-6 w-6 mx-auto mb-2 opacity-50" />
                      <span>No se encontraron registros con los filtros seleccionados</span>
                    </td>
                  </tr>
                ) : (
                  paginatedRecords.map((r) => {
                    const isExpanded = expandedRows[r.id];
                    const hasDev = Boolean(r.dev && r.dev.trim() !== "" && r.dev !== "—");

                    return (
                      <React.Fragment key={r.id}>
                        <tr
                          onClick={() => toggleRow(r.id)}
                          className="hover:bg-muted/30 transition-colors cursor-pointer group"
                        >
                          <td className="p-3 text-muted-foreground">
                            {isExpanded ? (
                              <ChevronDown className="h-3.5 w-3.5 text-brand-500" />
                            ) : (
                              <ChevronRight className="h-3.5 w-3.5 group-hover:text-foreground" />
                            )}
                          </td>
                          <td className="p-3 font-mono font-bold text-foreground whitespace-nowrap">
                            <span className="px-2 py-0.5 rounded bg-muted border border-border text-foreground font-mono text-[11px]">
                              {r.boleta || "—"}
                            </span>
                          </td>
                          <td className="p-3 text-muted-foreground whitespace-nowrap">
                            {r.fecha_creacion ? r.fecha_creacion.slice(0, 10) : "—"}
                          </td>
                          <td className="p-3 font-mono font-medium text-foreground whitespace-nowrap">
                            {r.ticket ? `#${r.ticket}` : "—"}
                          </td>
                          <td className="p-3 font-medium text-foreground max-w-[180px] truncate" title={r.nombre || ""}>
                            {r.nombre || "—"}
                          </td>
                          <td className="p-3 max-w-[200px] truncate">
                            <div className="font-medium text-foreground truncate">{r.serie || "—"}</div>
                            <div className="text-[10px] text-muted-foreground">{r.marca || "Sin marca"}</div>
                          </td>
                          <td className="p-3 text-muted-foreground whitespace-nowrap">
                            <span className="inline-flex items-center gap-1">
                              <Building2 className="h-3 w-3 text-muted-foreground/70" />
                              {r.sede || "—"}
                            </span>
                          </td>
                          <td className="p-3 whitespace-nowrap">
                            <span className="px-2 py-0.5 rounded text-[10px] font-medium bg-blue-500/10 text-blue-600 dark:text-blue-400 border border-blue-500/20">
                              {CAT_LABELS[r.categoria || ""] || r.categoria || "—"}
                            </span>
                          </td>
                          <td className="p-3 whitespace-nowrap">
                            {hasDev ? (
                              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-mono font-bold bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20">
                                <CheckCircle2 className="h-3 w-3" />
                                {r.dev}
                              </span>
                            ) : (
                              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-medium bg-amber-500/10 text-amber-600 dark:text-amber-400 border border-amber-500/20">
                                <Clock className="h-3 w-3" />
                                Sin DEV
                              </span>
                            )}
                          </td>
                          <td className="p-3 text-right whitespace-nowrap" onClick={(e) => e.stopPropagation()}>
                            <div className="flex items-center justify-end gap-1.5">
                              <button
                                onClick={() => setEditingRecord(r)}
                                className="p-1.5 rounded hover:bg-muted text-muted-foreground hover:text-foreground transition-colors"
                                title="Editar registro"
                              >
                                <Edit className="h-3.5 w-3.5" />
                              </button>
                              <button
                                onClick={() => setDeletingRecord(r)}
                                className="p-1.5 rounded hover:bg-rose-500/10 text-muted-foreground hover:text-rose-500 transition-colors"
                                title="Eliminar registro"
                              >
                                <Trash2 className="h-3.5 w-3.5" />
                              </button>
                            </div>
                          </td>
                        </tr>

                        {/* Expanded details row */}
                        {isExpanded && (
                          <tr className="bg-muted/10 border-b border-border">
                            <td colSpan={10} className="p-4 pl-11">
                              <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-xs">
                                {/* Producto */}
                                <div className="space-y-1.5 p-3 rounded-lg bg-card border border-border">
                                  <p className="text-[11px] font-bold uppercase tracking-wider text-brand-600">
                                    Producto
                                  </p>
                                  <div className="flex justify-between py-0.5 border-b border-border/40">
                                    <span className="text-muted-foreground">Marca:</span>
                                    <span className="font-semibold">{r.marca || "—"}</span>
                                  </div>
                                  <div className="flex justify-between py-0.5 border-b border-border/40">
                                    <span className="text-muted-foreground">Artículo:</span>
                                    <span className="font-mono">{r.serie || "—"}</span>
                                  </div>
                                  <div className="flex justify-between py-0.5 border-b border-border/40">
                                    <span className="text-muted-foreground">N° Serie:</span>
                                    <span className="font-mono">{r.numero_serie || "—"}</span>
                                  </div>
                                  <div className="flex justify-between py-0.5">
                                    <span className="text-muted-foreground">Cantidad:</span>
                                    <span>{r.cantidad || 1}</span>
                                  </div>
                                </div>

                                {/* Comercial */}
                                <div className="space-y-1.5 p-3 rounded-lg bg-card border border-border">
                                  <p className="text-[11px] font-bold uppercase tracking-wider text-brand-600">
                                    Comercial
                                  </p>
                                  <div className="flex justify-between py-0.5 border-b border-border/40">
                                    <span className="text-muted-foreground">Sede:</span>
                                    <span className="font-semibold">{r.sede || "—"}</span>
                                  </div>
                                  <div className="flex justify-between py-0.5 border-b border-border/40">
                                    <span className="text-muted-foreground">Factura:</span>
                                    <span className="font-mono">{r.factura || "—"}</span>
                                  </div>
                                  <div className="flex justify-between py-0.5 border-b border-border/40">
                                    <span className="text-muted-foreground">F. Compra:</span>
                                    <span>{r.fecha_compra ? r.fecha_compra.slice(0, 10) : "—"}</span>
                                  </div>
                                  <div className="flex justify-between py-0.5">
                                    <span className="text-muted-foreground">DEV / Fecha DEV:</span>
                                    <span className="font-mono font-bold text-brand-600">
                                      {r.dev || "Sin DEV"} {r.fecha_dev ? `(${r.fecha_dev.slice(0, 10)})` : ""}
                                    </span>
                                  </div>
                                </div>

                                {/* Trámite & Trazabilidad */}
                                <div className="space-y-1.5 p-3 rounded-lg bg-card border border-border">
                                  <p className="text-[11px] font-bold uppercase tracking-wider text-brand-600">
                                    Trámite
                                  </p>
                                  <div className="flex justify-between py-0.5 border-b border-border/40">
                                    <span className="text-muted-foreground">Motivo:</span>
                                    <span>{MOT_LABELS[r.motivo || ""] || r.motivo || "—"}</span>
                                  </div>
                                  <div className="flex justify-between py-0.5 border-b border-border/40">
                                    <span className="text-muted-foreground">Ticket RMA:</span>
                                    <span className="font-mono">{r.ticket_rma || "—"}</span>
                                  </div>
                                  <div className="flex justify-between py-0.5 border-b border-border/40">
                                    <span className="text-muted-foreground">Fecha RMA:</span>
                                    <span>{r.fecha_rma ? r.fecha_rma.slice(0, 10) : "—"}</span>
                                  </div>
                                  <div className="flex justify-between py-0.5">
                                    <span className="text-muted-foreground">Estatus:</span>
                                    <span className="font-semibold">
                                      {KPI_ESTATUS_LABELS[r.estatus || ""] || r.estatus || "—"}
                                    </span>
                                  </div>
                                </div>
                              </div>

                              {/* Falla & Notas */}
                              {(r.falla || r.descripcion) && (
                                <div className="mt-3 p-3 rounded-lg bg-card border border-border text-xs space-y-1">
                                  {r.falla && (
                                    <p>
                                      <strong className="text-foreground">Falla Reportada:</strong>{" "}
                                      <span className="text-muted-foreground">{r.falla}</span>
                                    </p>
                                  )}
                                  {r.descripcion && (
                                    <p>
                                      <strong className="text-foreground">Descripción del Artículo:</strong>{" "}
                                      <span className="text-muted-foreground">{r.descripcion}</span>
                                    </p>
                                  )}
                                </div>
                              )}

                              <div className="mt-2 text-[10px] text-muted-foreground flex items-center justify-between">
                                <span>
                                  Registrado por <strong>{r.registrado_por || "—"}</strong> el{" "}
                                  {r.fecha_creacion ? new Date(r.fecha_creacion).toLocaleString("es-CR") : "—"}
                                </span>
                                {r.modificado_por && (
                                  <span>
                                    Modificado por <strong>{r.modificado_por}</strong>
                                  </span>
                                )}
                              </div>
                            </td>
                          </tr>
                        )}
                      </React.Fragment>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>

          {/* Pagination Controls */}
          {totalPages > 1 && (
            <div className="p-3 border-t border-border flex items-center justify-between text-xs text-muted-foreground">
              <span>
                Mostrando {(currentPage - 1) * pageSize + 1} -{" "}
                {Math.min(currentPage * pageSize, activeRecords.length)} de {activeRecords.length}
              </span>
              <div className="flex items-center gap-1">
                <button
                  onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                  disabled={currentPage <= 1}
                  className="px-2.5 py-1 rounded border border-border bg-card hover:bg-muted disabled:opacity-50"
                >
                  Anterior
                </button>
                {Array.from({ length: totalPages }, (_, i) => i + 1)
                  .filter((p) => p === 1 || p === totalPages || Math.abs(p - currentPage) <= 2)
                  .map((p, idx, arr) => {
                    const prev = arr[idx - 1];
                    return (
                      <React.Fragment key={p}>
                        {prev && p - prev > 1 && <span className="px-1 text-muted-foreground">...</span>}
                        <button
                          onClick={() => setCurrentPage(p)}
                          className={`px-2.5 py-1 rounded border ${
                            p === currentPage
                              ? "bg-brand-500 text-white border-brand-500 font-bold"
                              : "border-border bg-card hover:bg-muted text-foreground"
                          }`}
                        >
                          {p}
                        </button>
                      </React.Fragment>
                    );
                  })}
                <button
                  onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
                  disabled={currentPage >= totalPages}
                  className="px-2.5 py-1 rounded border border-border bg-card hover:bg-muted disabled:opacity-50"
                >
                  Siguiente
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* TAB 3: TRÁMITES DE MARCA (RMA) */}
      {activeTab === "rma" && (
        <div className="space-y-4">
          {/* Subtab Switcher: Registros RMA vs Análisis */}
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2 p-1 rounded-lg bg-muted border border-border w-fit text-xs font-medium">
              <button
                onClick={() => setRmaSubTab("registros")}
                className={`px-3 py-1.5 rounded-md transition-colors ${
                  rmaSubTab === "registros" ? "bg-card text-foreground shadow-sm font-semibold" : "text-muted-foreground hover:text-foreground"
                }`}
              >
                Tabla de Registros RMA ({activeRecords.length})
              </button>
              <button
                onClick={() => setRmaSubTab("analisis")}
                className={`px-3 py-1.5 rounded-md transition-colors ${
                  rmaSubTab === "analisis" ? "bg-card text-foreground shadow-sm font-semibold" : "text-muted-foreground hover:text-foreground"
                }`}
              >
                Análisis y Desempeño por Marca
              </button>
            </div>
          </div>

          {rmaSubTab === "registros" ? (
            <div className="rounded-xl border border-border bg-card shadow-sm overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs border-collapse">
                  <thead>
                    <tr className="bg-muted/40 border-b border-border text-muted-foreground uppercase text-[10px] tracking-wider font-semibold">
                      <th className="p-3">Boleta / Ticket</th>
                      <th className="p-3">Cliente</th>
                      <th className="p-3">Marca / Modelo</th>
                      <th className="p-3">Serie</th>
                      <th className="p-3">Ticket RMA</th>
                      <th className="p-3">Fecha RMA</th>
                      <th className="p-3">SLA / Días</th>
                      <th className="p-3">Estatus</th>
                      <th className="p-3">Serie Reemplazo</th>
                      <th className="p-3 text-right">Acciones</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {paginatedRecords.length === 0 ? (
                      <tr>
                        <td colSpan={10} className="p-8 text-center text-muted-foreground">
                          <AlertCircle className="h-6 w-6 mx-auto mb-2 opacity-50" />
                          <span>No hay trámites RMA registrados con estos filtros</span>
                        </td>
                      </tr>
                    ) : (
                      paginatedRecords.map((r) => {
                        const esCerrado = r.estatus && ESTATUS_CERRADOS.includes(r.estatus);
                        const fechaBase = r.fecha_rma || r.fecha_creacion;
                        const diffDays = fechaBase
                          ? Math.max(
                              0,
                              Math.round(
                                ((esCerrado && r.fecha_modificacion ? new Date(r.fecha_modificacion).getTime() : Date.now()) -
                                  new Date(fechaBase).getTime()) /
                                  864e5
                              )
                            )
                          : null;

                        const timeElapsedStr = formatTimeElapsed(fechaBase, r.fecha_modificacion, r.estatus);

                        // SLA Color badge
                        let slaBadgeColor = "bg-emerald-500/10 text-emerald-600 border-emerald-500/20";
                        if (!esCerrado && diffDays !== null) {
                          if (diffDays > 30) slaBadgeColor = "bg-rose-500/15 text-rose-600 border-rose-500/30 font-bold";
                          else if (diffDays > 14) slaBadgeColor = "bg-amber-500/15 text-amber-600 border-amber-500/30";
                          else if (diffDays > 7) slaBadgeColor = "bg-blue-500/10 text-blue-600 border-blue-500/20";
                        }

                        return (
                          <tr key={r.id} className="hover:bg-muted/30 transition-colors">
                            <td className="p-3 font-mono font-medium">
                              <div className="font-bold text-foreground">{r.boleta || "—"}</div>
                              {r.ticket && <div className="text-[10px] text-muted-foreground">#{r.ticket}</div>}
                            </td>
                            <td className="p-3 font-medium text-foreground max-w-[150px] truncate" title={r.nombre || ""}>
                              {r.nombre || "—"}
                            </td>
                            <td className="p-3 max-w-[180px] truncate">
                              <span className="font-bold text-foreground">{r.marca || "—"}</span>
                              <div className="text-[10px] text-muted-foreground truncate">{r.serie || "—"}</div>
                            </td>
                            <td className="p-3 font-mono text-[11px] text-muted-foreground max-w-[120px] truncate">
                              {r.numero_serie || "—"}
                            </td>
                            <td className="p-3 font-mono font-semibold text-brand-600">
                              {r.ticket_rma || <span className="text-amber-500 text-[10px]">PENDIENTE</span>}
                            </td>
                            <td className="p-3 text-muted-foreground whitespace-nowrap">
                              {r.fecha_rma ? r.fecha_rma.slice(0, 10) : <span className="text-muted-foreground/60">—</span>}
                            </td>
                            <td className="p-3 whitespace-nowrap">
                              <span className={`px-2 py-0.5 rounded text-[10px] font-mono border ${slaBadgeColor}`}>
                                {timeElapsedStr}
                              </span>
                            </td>
                            <td className="p-3 whitespace-nowrap">
                              {r.estatus ? (
                                <span
                                  className={`px-2 py-0.5 rounded text-[10px] font-medium border ${
                                    esCerrado
                                      ? "bg-emerald-500/10 text-emerald-600 border-emerald-500/20"
                                      : "bg-blue-500/10 text-blue-600 border-blue-500/20"
                                  }`}
                                >
                                  {KPI_ESTATUS_LABELS[r.estatus] || r.estatus}
                                </span>
                              ) : (
                                <span className="text-[10px] text-amber-500 font-medium">PENDIENTE</span>
                              )}
                            </td>
                            <td className="p-3 font-mono text-[11px] text-muted-foreground max-w-[120px] truncate">
                              {r.serie_fabrica || <span className="text-muted-foreground/50">—</span>}
                            </td>
                            <td className="p-3 text-right whitespace-nowrap">
                              <div className="flex items-center justify-end gap-1.5">
                                <button
                                  onClick={() => setEditingRecord(r)}
                                  className="p-1.5 rounded hover:bg-muted text-muted-foreground hover:text-foreground transition-colors"
                                  title="Editar trámite RMA"
                                >
                                  <Edit className="h-3.5 w-3.5" />
                                </button>
                                <button
                                  onClick={() => setDeletingRecord(r)}
                                  className="p-1.5 rounded hover:bg-rose-500/10 text-muted-foreground hover:text-rose-500 transition-colors"
                                  title="Eliminar trámite"
                                >
                                  <Trash2 className="h-3.5 w-3.5" />
                                </button>
                              </div>
                            </td>
                          </tr>
                        );
                      })
                    )}
                  </tbody>
                </table>
              </div>

              {/* Pagination Controls */}
              {totalPages > 1 && (
                <div className="p-3 border-t border-border flex items-center justify-between text-xs text-muted-foreground">
                  <span>
                    Mostrando {(currentPage - 1) * pageSize + 1} -{" "}
                    {Math.min(currentPage * pageSize, activeRecords.length)} de {activeRecords.length}
                  </span>
                  <div className="flex items-center gap-1">
                    <button
                      onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                      disabled={currentPage <= 1}
                      className="px-2.5 py-1 rounded border border-border bg-card hover:bg-muted disabled:opacity-50"
                    >
                      Anterior
                    </button>
                    {Array.from({ length: totalPages }, (_, i) => i + 1)
                      .filter((p) => p === 1 || p === totalPages || Math.abs(p - currentPage) <= 2)
                      .map((p, idx, arr) => {
                        const prev = arr[idx - 1];
                        return (
                          <React.Fragment key={p}>
                            {prev && p - prev > 1 && <span className="px-1 text-muted-foreground">...</span>}
                            <button
                              onClick={() => setCurrentPage(p)}
                              className={`px-2.5 py-1 rounded border ${
                                p === currentPage
                                  ? "bg-brand-500 text-white border-brand-500 font-bold"
                                  : "border-border bg-card hover:bg-muted text-foreground"
                              }`}
                            >
                              {p}
                            </button>
                          </React.Fragment>
                        );
                      })}
                    <button
                      onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
                      disabled={currentPage >= totalPages}
                      className="px-2.5 py-1 rounded border border-border bg-card hover:bg-muted disabled:opacity-50"
                    >
                      Siguiente
                    </button>
                  </div>
                </div>
              )}
            </div>
          ) : (
            /* Subtab: Análisis y Desempeño por Marca */
            <div className="space-y-4">
              {statsData?.por_marca ? (
                <div className="rounded-xl border border-border bg-card shadow-sm overflow-hidden">
                  <div className="p-4 border-b border-border flex items-center justify-between">
                    <div>
                      <h3 className="font-bold text-sm text-foreground">Desempeño y Tiempos de Respuesta por Marca</h3>
                      <p className="text-xs text-muted-foreground">
                        Estadísticas calculadas en base a los trámites de garantía con fechas registradas.
                      </p>
                    </div>
                  </div>
                  <div className="overflow-x-auto">
                    <table className="w-full text-left text-xs border-collapse">
                      <thead>
                        <tr className="bg-muted/40 border-b border-border text-muted-foreground uppercase text-[10px] tracking-wider font-semibold">
                          <th className="p-3">Marca</th>
                          <th className="p-3 text-center">Total Casos</th>
                          <th className="p-3 text-center">Resueltos</th>
                          <th className="p-3 text-center">Pendientes</th>
                          <th className="p-3 text-center">Tasa Éxito</th>
                          <th className="p-3 text-center">Días Promedio</th>
                          <th className="p-3 text-center">Mín. Días</th>
                          <th className="p-3 text-center">Máx. Días</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-border">
                        {statsData.por_marca.map((m: any) => {
                          const rate = m.total > 0 ? ((m.resueltos / m.total) * 100).toFixed(0) : 0;
                          return (
                            <tr key={m.marca} className="hover:bg-muted/30 transition-colors">
                              <td className="p-3 font-bold text-foreground">{m.marca}</td>
                              <td className="p-3 text-center font-mono font-medium">{m.total}</td>
                              <td className="p-3 text-center font-mono text-emerald-600 font-bold">{m.resueltos}</td>
                              <td className="p-3 text-center font-mono text-amber-600">{m.pendientes}</td>
                              <td className="p-3 text-center">
                                <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-blue-500/10 text-blue-600 border border-blue-500/20">
                                  {rate}%
                                </span>
                              </td>
                              <td className="p-3 text-center font-mono font-bold text-foreground">
                                {m.promedio_dias !== null ? `${m.promedio_dias} d` : "—"}
                              </td>
                              <td className="p-3 text-center font-mono text-muted-foreground">
                                {m.min_dias !== null ? `${m.min_dias} d` : "—"}
                              </td>
                              <td className="p-3 text-center font-mono text-muted-foreground">
                                {m.max_dias !== null ? `${m.max_dias} d` : "—"}
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </div>
              ) : (
                <div className="p-8 text-center text-muted-foreground bg-card rounded-xl border border-border">
                  <Clock className="h-6 w-6 mx-auto mb-2 text-muted-foreground/50" />
                  <p>Calculando estadísticas de marca...</p>
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* TAB 4: AUDITORÍA NC SIN DEV */}
      {activeTab === "auditoria" && (
        <div className="space-y-4">
          <div className="p-4 rounded-xl border border-rose-500/20 bg-rose-500/5 text-rose-700 dark:text-rose-400 flex items-start gap-3">
            <AlertTriangle className="h-5 w-5 shrink-0 mt-0.5" />
            <div className="text-xs">
              <p className="font-bold text-sm">Discrepancias de Auditoría: Notas de Crédito sin DEV</p>
              <p className="mt-0.5 text-rose-600/90 dark:text-rose-400/90">
                Estos registros corresponden a salidas por <strong>Nota de Crédito</strong> que aún no cuentan con su código
                autorizado <strong>DEV-XXXX</strong> del sistema administrativo o contable. Haga clic en{" "}
                <strong>Asignar DEV</strong> para regularizar el caso.
              </p>
            </div>
          </div>

          <div className="rounded-xl border border-border bg-card shadow-sm overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs border-collapse">
                <thead>
                  <tr className="bg-muted/40 border-b border-border text-muted-foreground uppercase text-[10px] tracking-wider font-semibold">
                    <th className="p-3">Boleta</th>
                    <th className="p-3">Fecha Creación</th>
                    <th className="p-3">Cliente</th>
                    <th className="p-3">Sede</th>
                    <th className="p-3">Marca / Artículo</th>
                    <th className="p-3">Tipo Salida</th>
                    <th className="p-3">Categoría</th>
                    <th className="p-3">Estado DEV</th>
                    <th className="p-3 text-right">Acción</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {paginatedRecords.length === 0 ? (
                    <tr>
                      <td colSpan={9} className="p-8 text-center text-emerald-600 dark:text-emerald-400">
                        <CheckCircle2 className="h-6 w-6 mx-auto mb-2" />
                        <span className="font-bold">¡Excelente! No hay Notas de Crédito pendientes de DEV</span>
                      </td>
                    </tr>
                  ) : (
                    paginatedRecords.map((r) => (
                      <tr key={r.id} className="hover:bg-muted/30 transition-colors">
                        <td className="p-3 font-mono font-bold text-foreground">{r.boleta || "—"}</td>
                        <td className="p-3 text-muted-foreground whitespace-nowrap">
                          {r.fecha_creacion ? r.fecha_creacion.slice(0, 10) : "—"}
                        </td>
                        <td className="p-3 font-medium text-foreground">{r.nombre || "—"}</td>
                        <td className="p-3 text-muted-foreground">{r.sede || "—"}</td>
                        <td className="p-3">
                          <span className="font-medium text-foreground">{r.serie || "—"}</span>
                          <div className="text-[10px] text-muted-foreground">{r.marca || "—"}</div>
                        </td>
                        <td className="p-3 text-muted-foreground">
                          {r.tipo === "salida_definitiva" ? "Definitiva" : "Temporal"}
                        </td>
                        <td className="p-3">
                          <span className="px-2 py-0.5 rounded text-[10px] bg-muted border border-border font-medium">
                            {CAT_LABELS[r.categoria || ""] || r.categoria || "—"}
                          </span>
                        </td>
                        <td className="p-3 whitespace-nowrap">
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-bold bg-rose-500/15 text-rose-600 border border-rose-500/25">
                            <AlertCircle className="h-3 w-3" />
                            Falta Asignar DEV
                          </span>
                        </td>
                        <td className="p-3 text-right whitespace-nowrap">
                          <button
                            onClick={() => setEditingRecord(r)}
                            className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-brand-500 hover:bg-brand-600 text-white font-bold text-xs transition-colors"
                          >
                            <Edit className="h-3 w-3" />
                            <span>Asignar DEV</span>
                          </button>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* TAB 5: CONTROL DE CALIDAD & KPIS */}
      {activeTab === "kpis" && (
        <div className="space-y-6">
          {/* Main KPI metric cards */}
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <div className="p-4 rounded-xl border border-border bg-card shadow-sm">
              <div className="flex items-center justify-between text-muted-foreground text-xs uppercase font-semibold">
                <span>Tiempo Promedio Resolución</span>
                <Clock className="h-4 w-4 text-brand-500" />
              </div>
              <div className="mt-3 flex items-baseline gap-2">
                <span className="text-3xl font-black text-foreground">
                  {statsData?.kpis_rma?.dias_promedio !== null && statsData?.kpis_rma?.dias_promedio !== undefined
                    ? `${statsData.kpis_rma.dias_promedio}`
                    : "—"}
                </span>
                <span className="text-xs text-muted-foreground font-semibold">días</span>
              </div>
              <p className="text-[11px] text-muted-foreground mt-1">Calculado en base a casos con fecha de cierre</p>
            </div>

            <div className="p-4 rounded-xl border border-border bg-card shadow-sm">
              <div className="flex items-center justify-between text-muted-foreground text-xs uppercase font-semibold">
                <span>Tasa de Resolución RMA</span>
                <Award className="h-4 w-4 text-emerald-500" />
              </div>
              <div className="mt-3 flex items-baseline gap-2">
                <span className="text-3xl font-black text-emerald-600">
                  {statsData?.kpis_rma?.tasa_resolucion !== undefined ? `${statsData.kpis_rma.tasa_resolucion}%` : "—"}
                </span>
                <span className="text-xs text-muted-foreground">
                  ({statsData?.kpis_rma?.resueltos || 0} / {statsData?.kpis_rma?.total || 0})
                </span>
              </div>
              <p className="text-[11px] text-muted-foreground mt-1">Trámites concluidos satisfactoriamente</p>
            </div>

            <div className="p-4 rounded-xl border border-border bg-card shadow-sm">
              <div className="flex items-center justify-between text-muted-foreground text-xs uppercase font-semibold">
                <span>Casos Críticos (&gt;14d)</span>
                <AlertTriangle className="h-4 w-4 text-amber-500" />
              </div>
              <div className="mt-3 flex items-baseline gap-2">
                <span className="text-3xl font-black text-amber-600">
                  {statsData?.kpis_rma?.casos_mas_14_dias || 0}
                </span>
                <span className="text-xs text-muted-foreground">trámites</span>
              </div>
              <p className="text-[11px] text-muted-foreground mt-1">Casos abiertos con más de 2 semanas</p>
            </div>

            <div className="p-4 rounded-xl border border-border bg-card shadow-sm">
              <div className="flex items-center justify-between text-muted-foreground text-xs uppercase font-semibold">
                <span>Casos Críticos (&gt;30d)</span>
                <AlertCircle className="h-4 w-4 text-rose-500" />
              </div>
              <div className="mt-3 flex items-baseline gap-2">
                <span className="text-3xl font-black text-rose-600">
                  {statsData?.kpis_rma?.casos_mas_30_dias || 0}
                </span>
                <span className="text-xs text-muted-foreground">trámites</span>
              </div>
              <p className="text-[11px] text-muted-foreground mt-1">Alerta máxima: trámites con más de 1 mes</p>
            </div>
          </div>

          {/* Breakdown by Sede and Categoría */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* Por Sede */}
            <div className="p-4 rounded-xl border border-border bg-card shadow-sm space-y-3">
              <h3 className="font-bold text-sm text-foreground flex items-center gap-2">
                <Building2 className="h-4 w-4 text-brand-500" />
                Distribución por Sede
              </h3>
              <div className="space-y-2">
                {statsData?.por_sede ? (
                  statsData.por_sede.map((s: any) => {
                    const pct = statsOverview.total > 0 ? ((s.total / statsOverview.total) * 100).toFixed(1) : 0;
                    return (
                      <div key={s.sede} className="p-2.5 rounded-lg bg-muted/30 border border-border/50 text-xs">
                        <div className="flex justify-between items-center mb-1">
                          <span className="font-bold text-foreground">{s.sede}</span>
                          <span className="font-mono text-muted-foreground">
                            {s.total} ({pct}%)
                          </span>
                        </div>
                        <div className="w-full h-1.5 rounded-full bg-muted overflow-hidden">
                          <div className="h-full bg-brand-500 rounded-full" style={{ width: `${pct}%` }} />
                        </div>
                        <div className="flex justify-between text-[10px] text-muted-foreground mt-1">
                          <span>{s.definitivas} definitivas</span>
                          <span>{s.temporales} temporales</span>
                        </div>
                      </div>
                    );
                  })
                ) : (
                  <p className="text-xs text-muted-foreground">Cargando sedes...</p>
                )}
              </div>
            </div>

            {/* Por Categoría */}
            <div className="p-4 rounded-xl border border-border bg-card shadow-sm space-y-3">
              <h3 className="font-bold text-sm text-foreground flex items-center gap-2">
                <Tag className="h-4 w-4 text-brand-500" />
                Distribución por Categoría
              </h3>
              <div className="space-y-2">
                {statsData?.por_categoria ? (
                  statsData.por_categoria.map((c: any) => {
                    const pct = statsOverview.total > 0 ? ((c.total / statsOverview.total) * 100).toFixed(1) : 0;
                    return (
                      <div key={c.categoria} className="p-2.5 rounded-lg bg-muted/30 border border-border/50 text-xs">
                        <div className="flex justify-between items-center mb-1">
                          <span className="font-bold text-foreground">
                            {CAT_LABELS[c.categoria] || c.categoria || "Sin categoría"}
                          </span>
                          <span className="font-mono text-muted-foreground">
                            {c.total} ({pct}%)
                          </span>
                        </div>
                        <div className="w-full h-1.5 rounded-full bg-muted overflow-hidden">
                          <div className="h-full bg-blue-500 rounded-full" style={{ width: `${pct}%` }} />
                        </div>
                      </div>
                    );
                  })
                ) : (
                  <p className="text-xs text-muted-foreground">Cargando categorías...</p>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* EDIT MODAL */}
      {editingRecord && (
        <GarantiasEditModal
          record={editingRecord}
          onClose={() => setEditingRecord(null)}
          onSaved={handleRecordSaved}
          canEditDev={isAdmin || isSuperadmin}
        />
      )}

      {/* DELETE CONFIRMATION DIALOG */}
      {deletingRecord && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="w-full max-w-md bg-card border border-border rounded-2xl p-6 shadow-2xl space-y-4">
            <div className="flex items-center gap-3 text-rose-600">
              <div className="p-2.5 rounded-full bg-rose-500/10 border border-rose-500/20">
                <Trash2 className="h-6 w-6" />
              </div>
              <div>
                <h3 className="text-base font-bold text-foreground">¿Eliminar garantía?</h3>
                <p className="text-xs text-muted-foreground">Esta acción no se puede deshacer.</p>
              </div>
            </div>

            <p className="text-xs text-muted-foreground">
              Estás a punto de eliminar permanentemente la boleta{" "}
              <strong className="text-foreground">{deletingRecord.boleta || `ID: ${deletingRecord.id}`}</strong> de{" "}
              <strong className="text-foreground">{deletingRecord.nombre || "Cliente"}</strong>.
            </p>

            <div className="flex justify-end gap-2 pt-2 border-t border-border">
              <button
                type="button"
                onClick={() => setDeletingRecord(null)}
                disabled={isDeleting}
                className="px-3.5 py-1.5 rounded-lg border border-border text-xs font-semibold hover:bg-muted transition-colors"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={handleDelete}
                disabled={isDeleting}
                className="px-4 py-1.5 rounded-lg bg-rose-600 hover:bg-rose-700 text-white text-xs font-bold transition-colors disabled:opacity-50 flex items-center gap-1.5"
              >
                {isDeleting ? "Eliminando..." : "Confirmar Eliminación"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
