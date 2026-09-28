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
  Upload,
  User,
  Users,
  Check,
  Flame,
  FileCheck2,
} from "lucide-react";
import * as XLSX from "xlsx";
import { jsPDF } from "jspdf";
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  BarElement,
  Title,
  Tooltip,
  Legend,
  ArcElement,
  PointElement,
  LineElement,
  BarController,
  DoughnutController,
} from "chart.js";
import { toast } from "sonner";
import {
  GarantiaRecord,
  CAT_LABELS,
  MOT_LABELS,
  KPI_ESTATUS_LABELS,
  ESTATUS_CERRADOS,
  SEDES,
  formatTimeElapsed,
  formatDateSafe,
} from "./garantias-types";
import { GarantiasEditModal } from "./garantias-edit-modal";
import { createGarantiasClient } from "@/lib/supabase-garantias";

// Register Chart.js components
ChartJS.register(
  CategoryScale,
  LinearScale,
  BarElement,
  Title,
  Tooltip,
  Legend,
  ArcElement,
  PointElement,
  LineElement,
  BarController,
  DoughnutController
);

interface GarantiasClientProps {
  initialRecords?: GarantiaRecord[];
  initialStats?: any;
  currentUser?: {
    email: string;
    nombre?: string;
    apellido?: string;
  };
  isAdmin?: boolean;
  isSuperadmin?: boolean;
}

const KPI_COLORS = [
  "#D1411E",
  "#2563EB",
  "#059669",
  "#D97706",
  "#7C3AED",
  "#DC2626",
  "#0891B2",
  "#EC4899",
  "#14B8A6",
  "#F59E0B",
];

export function GarantiasClient({
  initialRecords = [],
  initialStats,
  currentUser,
  isAdmin = true,
  isSuperadmin = false,
}: GarantiasClientProps) {
  // Navigation tabs: "def" | "temp" | "rma" | "calidad"
  const [activeTab, setActiveTab] = React.useState<"def" | "temp" | "rma" | "calidad">("def");
  const [rmaSubTab, setRmaSubTab] = React.useState<"registros" | "analisis">("registros");

  // State for records
  const [records, setRecords] = React.useState<GarantiaRecord[]>(initialRecords);
  const [loading, setLoading] = React.useState(false);
  const [lastUpdate, setLastUpdate] = React.useState<string>("");
  const [mounted, setMounted] = React.useState(false);

  // Filters state (General)
  const [search, setSearch] = React.useState("");
  const [filterSede, setFilterSede] = React.useState("");
  const [filterCategoria, setFilterCategoria] = React.useState("");
  const [filterDevStatus, setFilterDevStatus] = React.useState<"todos" | "aprobado" | "sin_dev" | "pendiente">("todos");
  const [filterOwner, setFilterOwner] = React.useState("");
  const [filterFechaDesde, setFilterFechaDesde] = React.useState("");
  const [filterFechaHasta, setFilterFechaHasta] = React.useState("");

  // RMA specific filters
  const [filterRmaMarca, setFilterRmaMarca] = React.useState("");
  const [filterRmaEstatus, setFilterRmaEstatus] = React.useState("");
  const [filterRmaFecha, setFilterRmaFecha] = React.useState("");
  const [onlyMyRma, setOnlyMyRma] = React.useState(false);
  const [onlyPendingRma, setOnlyPendingRma] = React.useState(false);

  // RMA Analysis Period filter
  const [rmaPeriodo, setRmaPeriodo] = React.useState<"all" | "7d" | "30d" | "90d" | "6m" | "1y" | "custom">("30d");
  const [rmaPeriodoDesde, setRmaPeriodoDesde] = React.useState("");
  const [rmaPeriodoHasta, setRmaPeriodoHasta] = React.useState("");
  const [rmaAnalisisMarca, setRmaAnalisisMarca] = React.useState("");

  // Pagination state
  const [currentPage, setCurrentPage] = React.useState(1);
  const pageSize = 15;
  const rmaPageSize = 20;

  // Expanded rows state
  const [expandedRows, setExpandedRows] = React.useState<Record<string | number, boolean>>({});

  // Modals state
  const [editingRecord, setEditingRecord] = React.useState<GarantiaRecord | null>(null);
  const [deletingRecord, setDeletingRecord] = React.useState<GarantiaRecord | null>(null);
  const [isDeleting, setIsDeleting] = React.useState(false);

  // Audit detail modal state
  const [auditModalData, setAuditModalData] = React.useState<{
    isOpen: boolean;
    title: string;
    type: string;
    records: GarantiaRecord[];
  }>({ isOpen: false, title: "", type: "", records: [] });

  // Compare Excel modal state
  const [compareModalData, setCompareModalData] = React.useState<{
    isOpen: boolean;
    missingInSystem: Array<{ boleta: string }>;
    missingInExcel: Array<{ boleta: string; cliente?: string; marca?: string }>;
  }>({ isOpen: false, missingInSystem: [], missingInExcel: [] });

  // Pendientes RMA modal state
  const [pendientesModalOpen, setPendientesModalOpen] = React.useState(false);

  // Canvas Refs for Charts
  const chartMesRef = React.useRef<HTMLCanvasElement | null>(null);
  const chartCatRef = React.useRef<HTMLCanvasElement | null>(null);
  const chartMotRef = React.useRef<HTMLCanvasElement | null>(null);
  const chartSedeRef = React.useRef<HTMLCanvasElement | null>(null);

  const chartRmaEstatusRef = React.useRef<HTMLCanvasElement | null>(null);
  const chartRmaVolumenRef = React.useRef<HTMLCanvasElement | null>(null);
  const chartRmaMarcasRef = React.useRef<HTMLCanvasElement | null>(null);
  const chartRmaTiempoMarcaRef = React.useRef<HTMLCanvasElement | null>(null);

  // Active chart instances
  const chartInstances = React.useRef<Record<string, ChartJS>>({});

  // State for silent refresh indicator
  const [isRefreshing, setIsRefreshing] = React.useState(false);
  const lastFetchRef = React.useRef<number>(Date.now());

  // Load all records with optional silent mode
  const loadRecords = React.useCallback(async (silent = false) => {
    if (!silent) setLoading(true);
    else setIsRefreshing(true);
    lastFetchRef.current = Date.now();
    try {
      const res = await fetch("/api/admin/garantias?limit=1000", { cache: "no-store" });
      if (!res.ok) throw new Error("Error al consultar las garantías");
      const data = await res.json();
      if (Array.isArray(data.records)) {
        setRecords(data.records);
        setLastUpdate(new Date().toLocaleTimeString("es-CR", { hour: "2-digit", minute: "2-digit", second: "2-digit" }));
      }
    } catch (err: any) {
      if (!silent) toast.error("Error al cargar garantías", { description: err.message });
    } finally {
      if (!silent) setLoading(false);
      else setIsRefreshing(false);
    }
  }, []);

  // Initial load + Supabase Realtime WebSocket listener (Sincronización instantánea en vivo)
  React.useEffect(() => {
    setMounted(true);
    setLastUpdate(new Date().toLocaleTimeString("es-CR", { hour: "2-digit", minute: "2-digit", second: "2-digit" }));

    if (!initialRecords || initialRecords.length === 0) {
      loadRecords();
    }

    // Suscripción Realtime directa a la BD de Garantías (sin sobrecargar el servidor ni hacer polling)
    const garantiasClient = createGarantiasClient();
    const channel = garantiasClient
      .channel("garantias_realtime_stream")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "garantias" },
        (payload: any) => {
          if (payload.eventType === "INSERT" && payload.new) {
            setRecords((prev) => {
              if (prev.some((r) => r.id === payload.new.id)) return prev;
              return [payload.new as GarantiaRecord, ...prev];
            });
            setLastUpdate(new Date().toLocaleTimeString("es-CR", { hour: "2-digit", minute: "2-digit", second: "2-digit" }));
          } else if (payload.eventType === "UPDATE" && payload.new) {
            setRecords((prev) =>
              prev.map((r) => (r.id === payload.new.id ? { ...r, ...(payload.new as GarantiaRecord) } : r))
            );
            setLastUpdate(new Date().toLocaleTimeString("es-CR", { hour: "2-digit", minute: "2-digit", second: "2-digit" }));
          } else if (payload.eventType === "DELETE" && payload.old) {
            setRecords((prev) => prev.filter((r) => r.id !== payload.old.id));
            setLastUpdate(new Date().toLocaleTimeString("es-CR", { hour: "2-digit", minute: "2-digit", second: "2-digit" }));
          }
        }
      )
      .subscribe();

    // Verificación pasiva solo si el usuario vuelve tras largo tiempo (> 5 min)
    const onFocus = () => {
      if (Date.now() - lastFetchRef.current >= 300000) {
        loadRecords(true);
      }
    };
    window.addEventListener("focus", onFocus);

    return () => {
      garantiasClient.removeChannel(channel);
      window.removeEventListener("focus", onFocus);
    };
  }, [loadRecords, initialRecords]);

  // Reset page when filters change
  React.useEffect(() => {
    setCurrentPage(1);
    setExpandedRows({});
  }, [
    activeTab,
    rmaSubTab,
    search,
    filterSede,
    filterCategoria,
    filterDevStatus,
    filterOwner,
    filterFechaDesde,
    filterFechaHasta,
    filterRmaMarca,
    filterRmaEstatus,
    filterRmaFecha,
    onlyMyRma,
    onlyPendingRma,
  ]);

  // Distinct Owners extracted from registrado_por
  const distinctOwners = React.useMemo(() => {
    return Array.from(
      new Set(
        records
          .map((r) => (r.registrado_por || "").trim())
          .filter(Boolean)
      )
    ).sort((a, b) => a.localeCompare(b));
  }, [records]);

  // Derived collections
  const rawDefinitivas = React.useMemo(() => {
    return records.filter((r) => r.tipo === "salida_definitiva");
  }, [records]);

  const rawTemporales = React.useMemo(() => {
    return records.filter((r) => r.tipo === "salida_temporal");
  }, [records]);

  // Approval requirements logic
  const requisitosAprobacion = (r: GarantiaRecord): string[] => {
    const b = String(r?.boleta || "").trim().toUpperCase();
    if (!/^(GNC|TNC|G|T|NC)/.test(b)) return [];
    const cat = (r.categoria || "").toLowerCase();
    const tipo = (r.tipo || "").toLowerCase();
    const esNC = cat.includes("nota") || cat.includes("credito") || cat.includes("nc");
    const esDefinitiva = tipo === "salida_definitiva";
    const esTemporal = tipo === "salida_temporal";

    // Salidas Definitivas: si tiene dev-, está aprobada.
    // Si es definitiva y es NC y no tiene dev-, requiere dev.
    if (esDefinitiva) {
      const devVal = (r.dev || "").toString().trim();
      const hasDev = devVal !== "" && devVal !== "—";
      if (hasDev) return [];
      if (esNC) return ["dev"];
      return [];
    }

    // Salidas Temporales: se mantienen intactas
    if (esNC && esTemporal) return ["dev"];
    return [];
  };

  const estaPorAprobar = (r: GarantiaRecord): boolean => {
    const tipo = (r.tipo || "").toLowerCase();
    if (tipo === "salida_definitiva") {
      const devVal = (r.dev || "").toString().trim();
      const hasDev = devVal !== "" && devVal !== "—";
      if (hasDev) return false;
    }
    const reqs = requisitosAprobacion(r);
    if (!reqs.length) return false;
    return reqs.some((k) => {
      const v = (r as any)[k];
      return v === null || v === undefined || String(v).trim() === "" || String(v) === "—";
    });
  };

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

  // Incomplete / Pending RMA items
  const rmaIncompletos = React.useMemo(() => {
    const clean = (v: any) => (v ? v.toString().trim().replace(/^[\-\s—]+$/, "") : "");
    return rmaPool.filter((r) => {
      return (
        clean(r.ticket_rma) === "" ||
        clean(r.fecha_rma) === "" ||
        clean(r.serie_fabrica) === "" ||
        clean(r.estatus) === ""
      );
    });
  }, [rmaPool]);

  // NC without DEV audit: records with NC category/motive/boleta that lack DEV
  const ncSinDevList = React.useMemo(() => {
    return records.filter((r) => estaPorAprobar(r));
  }, [records]);

  // Filtered lists based on active tab
  const activeRecords = React.useMemo(() => {
    let list: GarantiaRecord[] = [];
    if (activeTab === "def") list = rawDefinitivas;
    else if (activeTab === "temp") list = rawTemporales;
    else if (activeTab === "rma") list = rmaPool;
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
        const devVal = (r.dev || "").toString().trim().toLowerCase();
        const hasDev = devVal !== "" && devVal !== "—";
        if (filterDevStatus === "sin_dev" && hasDev) return false;
        if (filterDevStatus === "aprobado" && !hasDev) return false;
        if (filterDevStatus === "pendiente" && (hasDev || !estaPorAprobar(r))) {
          return false;
        }
      }

      // Propietario / Registrado Por filter
      if (filterOwner && (r.registrado_por || "").trim().toLowerCase() !== filterOwner.trim().toLowerCase()) {
        return false;
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
        if (filterRmaFecha && r.fecha_rma && r.fecha_rma.slice(0, 10) !== filterRmaFecha) {
          return false;
        }
        if (onlyMyRma) {
          const myFullName = [currentUser?.nombre, currentUser?.apellido].filter(Boolean).join(" ").toLowerCase();
          const myEmail = (currentUser?.email || "").toLowerCase();
          const regBy = (r.registrado_por || "").toLowerCase();
          const matches =
            (myFullName && regBy.includes(myFullName)) ||
            (myEmail && regBy.includes(myEmail)) ||
            (currentUser?.nombre && regBy.includes(currentUser.nombre.toLowerCase()));
          if (!matches) return false;
        }
        if (onlyPendingRma) {
          const clean = (v: any) => (v ? v.toString().trim().replace(/^[\-\s—]+$/, "") : "");
          const isPending =
            clean(r.ticket_rma) === "" ||
            clean(r.fecha_rma) === "" ||
            clean(r.serie_fabrica) === "" ||
            clean(r.estatus) === "";
          if (!isPending) return false;
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
    filterOwner,
    filterFechaDesde,
    filterFechaHasta,
    filterRmaMarca,
    filterRmaEstatus,
    filterRmaFecha,
    onlyMyRma,
    onlyPendingRma,
    currentUser,
  ]);

  // Paginated records
  const curPageSize = activeTab === "rma" ? rmaPageSize : pageSize;
  const totalPages = Math.max(1, Math.ceil(activeRecords.length / curPageSize));
  const paginatedRecords = React.useMemo(() => {
    const start = (currentPage - 1) * curPageSize;
    return activeRecords.slice(start, start + curPageSize);
  }, [activeRecords, currentPage, curPageSize]);

  // Distinct Brands for RMA
  const distinctRmaMarcas = React.useMemo(() => {
    return Array.from(
      new Set(rmaPool.map((r) => (r.marca || "").trim().toUpperCase()).filter(Boolean))
    ).sort();
  }, [rmaPool]);

  // Distinct RMA statuses
  const distinctRmaEstatus = React.useMemo(() => {
    return Array.from(new Set(rmaPool.map((r) => r.estatus).filter((s): s is string => Boolean(s)))).sort();
  }, [rmaPool]);

  // 8 Control de Calidad KPI Calculations
  const calidadMetrics = React.useMemo(() => {
    const all = records;
    const def = rawDefinitivas;
    const temp = rawTemporales;
    const today = new Date().toISOString().slice(0, 10);
    const hoyCount = all.filter((r) => r.fecha_creacion && r.fecha_creacion.startsWith(today)).length;
    const porAprobar = all.filter(estaPorAprobar);

    const esteMesPrefix = new Date().toISOString().slice(0, 7);
    const esteMesCount = all.filter((r) => r.fecha_creacion && r.fecha_creacion.startsWith(esteMesPrefix)).length;

    // Top Sede
    const sedeCounts: Record<string, number> = {};
    all.forEach((r) => {
      const s = (r.sede || "Sin Sede").trim().toUpperCase();
      sedeCounts[s] = (sedeCounts[s] || 0) + 1;
    });
    const topSedeEntry = Object.entries(sedeCounts).sort((a, b) => b[1] - a[1])[0] || ["—", 0];

    // Tiempo Aprobación
    const aprobados = all.filter((r) => r.fecha_creacion && r.fecha_dev);
    const diasAprob = aprobados
      .map((r) => {
        const ms = new Date(r.fecha_dev!).getTime() - new Date(r.fecha_creacion!).getTime();
        return Math.round(ms / 86400000);
      })
      .filter((d) => d >= 0);

    const avgAprob = diasAprob.length ? (diasAprob.reduce((a, b) => a + b, 0) / diasAprob.length).toFixed(1) : "—";
    const minAprob = diasAprob.length ? Math.min(...diasAprob) : "—";
    const maxAprob = diasAprob.length ? Math.max(...diasAprob) : "—";

    return {
      total: all.length,
      def: def.length,
      temp: temp.length,
      hoy: hoyCount,
      porAprobar: porAprobar.length,
      esteMes: esteMesCount,
      topSedeName: topSedeEntry[0],
      topSedeCount: topSedeEntry[1],
      avgAprob,
      minAprob,
      maxAprob,
      aprobadosCount: diasAprob.length,
    };
  }, [records, rawDefinitivas, rawTemporales]);

  // RENDER CONTROL DE CALIDAD CHARTS
  React.useEffect(() => {
    if (activeTab !== "calidad") return;

    const all = records;
    if (!all.length) return;

    // Clean previous instances
    ["mes", "cat", "mot", "sede"].forEach((k) => {
      if (chartInstances.current[k]) {
        chartInstances.current[k].destroy();
        delete chartInstances.current[k];
      }
    });

    // 1. Registros por Mes (Bar)
    if (chartMesRef.current) {
      const meses: Record<string, number> = {};
      all.forEach((r) => {
        if (!r.fecha_creacion) return;
        const m = r.fecha_creacion.slice(0, 7);
        meses[m] = (meses[m] || 0) + 1;
      });
      const mKeys = Object.keys(meses).sort().slice(-12);
      chartInstances.current["mes"] = new ChartJS(chartMesRef.current, {
        type: "bar",
        data: {
          labels: mKeys.map((m) => {
            const [y, mo] = m.split("-");
            return `${mo}/${y.slice(2)}`;
          }),
          datasets: [
            {
              label: "Registros",
              data: mKeys.map((k) => meses[k]),
              backgroundColor: "#D1411E",
              borderRadius: 6,
            },
          ],
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          plugins: { legend: { display: false } },
          scales: { y: { beginAtZero: true, ticks: { stepSize: 2 } } },
        },
      });
    }

    // 2. Por Categoría (Doughnut)
    if (chartCatRef.current) {
      const cats: Record<string, number> = {};
      all.forEach((r) => {
        const k = (CAT_LABELS[r.categoria || ""] || r.categoria || "Sin categoría").trim().toUpperCase();
        cats[k] = (cats[k] || 0) + 1;
      });
      const catKeys = Object.keys(cats);
      chartInstances.current["cat"] = new ChartJS(chartCatRef.current, {
        type: "doughnut",
        data: {
          labels: catKeys,
          datasets: [
            {
              data: catKeys.map((k) => cats[k]),
              backgroundColor: KPI_COLORS.slice(0, catKeys.length),
              borderWidth: 0,
            },
          ],
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          plugins: {
            legend: {
              position: "bottom",
              labels: { font: { size: 10 }, usePointStyle: true, padding: 10 },
            },
          },
          cutout: "60%",
        },
      });
    }

    // 3. Por Motivo (Bar)
    if (chartMotRef.current) {
      const mots: Record<string, number> = {};
      all.forEach((r) => {
        const k = (MOT_LABELS[r.motivo || ""] || r.motivo || "Sin motivo").trim().toUpperCase();
        mots[k] = (mots[k] || 0) + 1;
      });
      const motKeys = Object.keys(mots);
      chartInstances.current["mot"] = new ChartJS(chartMotRef.current, {
        type: "bar",
        data: {
          labels: motKeys,
          datasets: [
            {
              label: "Registros",
              data: motKeys.map((k) => mots[k]),
              backgroundColor: "#2563EB",
              borderRadius: 6,
            },
          ],
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          plugins: { legend: { display: false } },
          scales: { y: { beginAtZero: true, ticks: { stepSize: 2 } } },
        },
      });
    }

    // 4. Por Sede (Bar)
    if (chartSedeRef.current) {
      const sedes: Record<string, number> = {};
      all.forEach((r) => {
        const k = (r.sede || "Sin Sede").trim().toUpperCase();
        sedes[k] = (sedes[k] || 0) + 1;
      });
      const sedeKeys = Object.keys(sedes);
      chartInstances.current["sede"] = new ChartJS(chartSedeRef.current, {
        type: "bar",
        data: {
          labels: sedeKeys,
          datasets: [
            {
              label: "Registros",
              data: sedeKeys.map((k) => sedes[k]),
              backgroundColor: "#059669",
              borderRadius: 6,
            },
          ],
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          plugins: { legend: { display: false } },
          scales: { y: { beginAtZero: true, ticks: { stepSize: 5 } } },
        },
      });
    }

    return () => {
      ["mes", "cat", "mot", "sede"].forEach((k) => {
        if (chartInstances.current[k]) {
          chartInstances.current[k].destroy();
          delete chartInstances.current[k];
        }
      });
    };
  }, [activeTab, records]);

  // RENDER RMA ANALYSIS CHARTS
  React.useEffect(() => {
    if (activeTab !== "rma" || rmaSubTab !== "analisis") return;

    // Filter RMA data based on period & brand
    let rmaData = [...rmaPool];
    if (rmaAnalisisMarca) {
      rmaData = rmaData.filter((r) => (r.marca || "").toUpperCase() === rmaAnalisisMarca.toUpperCase());
    }

    const now = Date.now();
    if (rmaPeriodo === "7d") {
      rmaData = rmaData.filter(
        (r) => r.fecha_rma && now - new Date(r.fecha_rma).getTime() <= 7 * 864e5
      );
    } else if (rmaPeriodo === "30d") {
      rmaData = rmaData.filter(
        (r) => r.fecha_rma && now - new Date(r.fecha_rma).getTime() <= 30 * 864e5
      );
    } else if (rmaPeriodo === "90d") {
      rmaData = rmaData.filter(
        (r) => r.fecha_rma && now - new Date(r.fecha_rma).getTime() <= 90 * 864e5
      );
    } else if (rmaPeriodo === "6m") {
      rmaData = rmaData.filter(
        (r) => r.fecha_rma && now - new Date(r.fecha_rma).getTime() <= 180 * 864e5
      );
    } else if (rmaPeriodo === "1y") {
      rmaData = rmaData.filter(
        (r) => r.fecha_rma && now - new Date(r.fecha_rma).getTime() <= 365 * 864e5
      );
    } else if (rmaPeriodo === "custom") {
      if (rmaPeriodoDesde) {
        rmaData = rmaData.filter((r) => r.fecha_rma && r.fecha_rma.slice(0, 10) >= rmaPeriodoDesde);
      }
      if (rmaPeriodoHasta) {
        rmaData = rmaData.filter((r) => r.fecha_rma && r.fecha_rma.slice(0, 10) <= rmaPeriodoHasta);
      }
    }

    // Clean previous RMA chart instances
    ["rma-estatus", "rma-volumen", "rma-marcas", "rma-tiempo"].forEach((k) => {
      if (chartInstances.current[k]) {
        chartInstances.current[k].destroy();
        delete chartInstances.current[k];
      }
    });

    // 1. Distribución por Estatus (Doughnut)
    if (chartRmaEstatusRef.current) {
      const estCounts: Record<string, number> = {};
      rmaData.forEach((r) => {
        const e = r.estatus || "sin_estatus";
        estCounts[e] = (estCounts[e] || 0) + 1;
      });
      const eKeys = Object.keys(estCounts);
      chartInstances.current["rma-estatus"] = new ChartJS(chartRmaEstatusRef.current, {
        type: "doughnut",
        data: {
          labels: eKeys.map((k) => KPI_ESTATUS_LABELS[k] || k),
          datasets: [
            {
              data: eKeys.map((k) => estCounts[k]),
              backgroundColor: KPI_COLORS.slice(0, eKeys.length),
              borderWidth: 0,
            },
          ],
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          plugins: {
            legend: {
              position: "bottom",
              labels: { font: { size: 10 }, usePointStyle: true, padding: 8 },
            },
          },
          cutout: "60%",
        },
      });
    }

    // 2. Volumen por Mes (Bar)
    if (chartRmaVolumenRef.current) {
      const meses: Record<string, number> = {};
      rmaData.forEach((r) => {
        const f = r.fecha_rma || r.fecha_creacion;
        if (!f) return;
        const m = f.slice(0, 7);
        meses[m] = (meses[m] || 0) + 1;
      });
      const mKeys = Object.keys(meses).sort().slice(-8);
      chartInstances.current["rma-volumen"] = new ChartJS(chartRmaVolumenRef.current, {
        type: "bar",
        data: {
          labels: mKeys.map((m) => {
            const [y, mo] = m.split("-");
            return `${mo}/${y.slice(2)}`;
          }),
          datasets: [
            {
              label: "Trámites",
              data: mKeys.map((k) => meses[k]),
              backgroundColor: "#2563EB",
              borderRadius: 6,
            },
          ],
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          plugins: { legend: { display: false } },
          scales: { y: { beginAtZero: true, ticks: { stepSize: 1 } } },
        },
      });
    }

    // 3. Top Marcas (Bar)
    if (chartRmaMarcasRef.current) {
      const marcas: Record<string, number> = {};
      rmaData.forEach((r) => {
        const m = (r.marca || "Sin Marca").trim().toUpperCase();
        marcas[m] = (marcas[m] || 0) + 1;
      });
      const topMarcas = Object.entries(marcas)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 6);
      chartInstances.current["rma-marcas"] = new ChartJS(chartRmaMarcasRef.current, {
        type: "bar",
        data: {
          labels: topMarcas.map((x) => x[0]),
          datasets: [
            {
              label: "Casos",
              data: topMarcas.map((x) => x[1]),
              backgroundColor: "#059669",
              borderRadius: 6,
            },
          ],
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          plugins: { legend: { display: false } },
          scales: { y: { beginAtZero: true, ticks: { stepSize: 2 } } },
        },
      });
    }

    // 4. Tiempo Promedio por Marca (Horizontal Bar)
    if (chartRmaTiempoMarcaRef.current) {
      const marcasDias: Record<string, number[]> = {};
      rmaData.forEach((r) => {
        const m = (r.marca || "Sin Marca").trim().toUpperCase();
        const f = r.fecha_rma || r.fecha_creacion;
        if (!f) return;
        const fin = r.estatus && ESTATUS_CERRADOS.includes(r.estatus) && r.fecha_modificacion
          ? new Date(r.fecha_modificacion).getTime()
          : Date.now();
        const d = Math.max(0, Math.round((fin - new Date(f).getTime()) / 864e5));
        if (!marcasDias[m]) marcasDias[m] = [];
        marcasDias[m].push(d);
      });

      const avgMarcas = Object.entries(marcasDias)
        .map(([marca, list]) => ({
          marca,
          avg: Math.round(list.reduce((a, b) => a + b, 0) / list.length),
        }))
        .sort((a, b) => b.avg - a.avg)
        .slice(0, 6);

      chartInstances.current["rma-tiempo"] = new ChartJS(chartRmaTiempoMarcaRef.current, {
        type: "bar",
        data: {
          labels: avgMarcas.map((x) => x.marca),
          datasets: [
            {
              label: "Días Promedio",
              data: avgMarcas.map((x) => x.avg),
              backgroundColor: "#D97706",
              borderRadius: 6,
            },
          ],
        },
        options: {
          indexAxis: "y",
          responsive: true,
          maintainAspectRatio: false,
          plugins: { legend: { display: false } },
          scales: { x: { beginAtZero: true, ticks: { stepSize: 5 } } },
        },
      });
    }

    return () => {
      ["rma-estatus", "rma-volumen", "rma-marcas", "rma-tiempo"].forEach((k) => {
        if (chartInstances.current[k]) {
          chartInstances.current[k].destroy();
          delete chartInstances.current[k];
        }
      });
    };
  }, [activeTab, rmaSubTab, rmaPool, rmaPeriodo, rmaPeriodoDesde, rmaPeriodoHasta, rmaAnalisisMarca]);

  // Download chart canvas as PNG
  const downloadChartAsPng = (canvas: HTMLCanvasElement | null, filename: string) => {
    if (!canvas) return;
    const a = document.createElement("a");
    a.href = canvas.toDataURL("image/png");
    a.download = `${filename}_${new Date().toISOString().slice(0, 10)}.png`;
    a.click();
    toast.success("Gráfico descargado como imagen PNG");
  };

  // Open audit drill-down modal
  const openAuditDetailModal = (tipo: string) => {
    const all = records;
    const today = new Date().toISOString().slice(0, 10);
    const esteMes = new Date().toISOString().slice(0, 7);

    let filtrados: GarantiaRecord[] = [];
    let title = "";

    switch (tipo) {
      case "total":
        filtrados = all;
        title = `AUDITORÍA: Total de Registros (${all.length})`;
        break;
      case "def":
        filtrados = rawDefinitivas;
        title = `AUDITORÍA: Salidas Definitivas (${rawDefinitivas.length})`;
        break;
      case "temp":
        filtrados = rawTemporales;
        title = `AUDITORÍA: Salidas Temporales (${rawTemporales.length})`;
        break;
      case "hoy":
        filtrados = all.filter((r) => r.fecha_creacion && r.fecha_creacion.startsWith(today));
        title = `AUDITORÍA: Registros de Hoy (${filtrados.length})`;
        break;
      case "por_aprobar":
        filtrados = all.filter(estaPorAprobar);
        title = `AUDITORÍA: Por Aprobar - Sin DEV (${filtrados.length})`;
        break;
      case "este_mes":
        filtrados = all.filter((r) => r.fecha_creacion && r.fecha_creacion.startsWith(esteMes));
        title = `AUDITORÍA: Registros Este Mes (${filtrados.length})`;
        break;
      case "top_sede":
        filtrados = all.filter(
          (r) => (r.sede || "").toUpperCase().trim() === calidadMetrics.topSedeName.toUpperCase().trim()
        );
        title = `AUDITORÍA: Sede ${calidadMetrics.topSedeName} (${filtrados.length})`;
        break;
      case "tiempo_aprob":
        filtrados = all.filter((r) => r.fecha_creacion && r.fecha_dev);
        title = `AUDITORÍA: Registros con Fecha DEV (${filtrados.length})`;
        break;
      default:
        return;
    }

    setAuditModalData({
      isOpen: true,
      title,
      type: tipo,
      records: filtrados,
    });
  };

  // Compare Excel logic
  const handleCompareExcel = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    e.target.value = "";
    try {
      const buf = await file.arrayBuffer();
      const wb = XLSX.read(buf, { type: "array" });
      const ws = wb.Sheets[wb.SheetNames[0]];
      const rows: any[][] = XLSX.utils.sheet_to_json(ws, { header: 1 });
      if (!rows.length) {
        toast.error("El archivo Excel está vacío");
        return;
      }

      // Buscar columna de Boleta
      const header = rows[0].map((h) => String(h || "").toLowerCase());
      let bolCol = header.findIndex((h) => h.includes("boleta") || h.includes("consecutivo"));
      if (bolCol === -1) bolCol = 0;

      const norm = (v: any) => {
        const s = String(v || "").trim();
        const m = s.match(/(\d[\d\-]*\d|\d+)/);
        return m ? m[1].replace(/-/g, "") : s.replace(/[^0-9]/g, "");
      };

      const excelBoletas = rows
        .slice(1)
        .map((r) => String(r[bolCol] || "").trim())
        .filter((v) => v && v !== "—" && v !== "-")
        .map((v) => ({ orig: v, norm: norm(v) }))
        .filter((v) => v.norm);

      const sisRMA = rmaPool.map((r) => ({
        orig: r.boleta || "",
        norm: norm(r.boleta),
        cliente: r.nombre || "",
        marca: r.marca || "",
      }));

      const sisNorms = sisRMA.map((b) => b.norm);
      const excelNorms = excelBoletas.map((b) => b.norm);

      const noEnSistema = excelBoletas
        .filter((b) => !sisNorms.includes(b.norm))
        .map((b) => ({ boleta: b.orig }));
      const noEnExcel = sisRMA
        .filter((b) => !excelNorms.includes(b.norm))
        .map((b) => ({ boleta: b.orig, cliente: b.cliente, marca: b.marca }));

      setCompareModalData({
        isOpen: true,
        missingInSystem: noEnSistema,
        missingInExcel: noEnExcel,
      });

      toast.success("Comparación completada", {
        description: `${excelBoletas.length} filas analizadas en el Excel.`,
      });
    } catch (err: any) {
      toast.error("Error al procesar el Excel", { description: err.message });
    }
  };

  // Export RMA Analysis to PDF
  const exportRmaAnalysisPdf = () => {
    try {
      const doc = new jsPDF("p", "pt", "a4");
      doc.setFont("helvetica", "bold");
      doc.setFontSize(18);
      doc.text("Reporte Ejecutivo de Trámites RMA", 40, 50);

      doc.setFont("helvetica", "normal");
      doc.setFontSize(10);
      doc.text(`Fecha de emisión: ${new Date().toLocaleString("es-CR")}`, 40, 70);
      doc.text(`Período evaluado: ${rmaPeriodo.toUpperCase()}`, 40, 85);
      if (rmaAnalisisMarca) {
        doc.text(`Marca filtrada: ${rmaAnalisisMarca}`, 40, 100);
      }

      // Summary lines
      doc.setFont("helvetica", "bold");
      doc.setFontSize(12);
      doc.text("Resumen de Métricas Clave:", 40, 130);

      doc.setFont("helvetica", "normal");
      doc.setFontSize(10);
      const lineY = 150;
      doc.text(`• Total Trámites: ${rmaPool.length}`, 50, lineY);
      doc.text(`• Resueltos: ${rmaPool.filter((r) => r.estatus && ESTATUS_CERRADOS.includes(r.estatus)).length}`, 50, lineY + 18);
      doc.text(`• Pendientes: ${rmaIncompletos.length}`, 50, lineY + 36);

      doc.save(`Reporte_RMA_${new Date().toISOString().slice(0, 10)}.pdf`);
      toast.success("PDF generado exitosamente");
    } catch (err: any) {
      toast.error("Error al generar PDF", { description: err.message });
    }
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

  // Saved record handler
  const handleRecordSaved = (updated: GarantiaRecord) => {
    setRecords((prev) => prev.map((r) => (r.id === updated.id ? updated : r)));
    setEditingRecord(null);
    toast.success("Garantía actualizada", { description: updated.boleta || `ID: ${updated.id}` });
    loadRecords(true);
  };

  // Clear filters
  const handleClearFilters = () => {
    setSearch("");
    setFilterSede("");
    setFilterCategoria("");
    setFilterDevStatus("todos");
    setFilterOwner("");
    setFilterFechaDesde("");
    setFilterFechaHasta("");
    setFilterRmaMarca("");
    setFilterRmaEstatus("");
    setFilterRmaFecha("");
    setOnlyMyRma(false);
    setOnlyPendingRma(false);
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
      ["Total Registros en BD:", records.length],
      ["Salidas Definitivas:", rawDefinitivas.length],
      ["Salidas Temporales:", rawTemporales.length],
      ["Trámites RMA:", rmaPool.length],
      ["Por Aprobar (NC sin DEV):", ncSinDevList.length],
      [],
      ["Métrica", "Valor", "Detalle"],
      ["Total", records.length, "Todos los registros"],
      ["Definitivas", rawDefinitivas.length, "Tipo = salida_definitiva"],
      ["Temporales", rawTemporales.length, "Tipo = salida_temporal"],
      ["Por Aprobar", ncSinDevList.length, "Notas de crédito sin número DEV"],
      ["Promedio Aprobación", `${calidadMetrics.avgAprob} días`, "Basado en registros con fecha DEV"],
    ];
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(summary), "Resumen Auditoría");

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

    // Hoja 3: Por Aprobar (NC sin DEV)
    const porAprobarRows = ncSinDevList.map((r) => ({
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
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(porAprobarRows), "Por Aprobar");

    // Hoja 4: Trámites RMA
    const rmaRows = rmaPool.map((r) => ({
      Boleta: r.boleta || "—",
      Ticket: r.ticket || "—",
      Cliente: r.nombre || "—",
      Marca: r.marca || "—",
      Artículo: r.serie || "—",
      Serie: r.numero_serie || "—",
      "Ticket RMA": r.ticket_rma || "—",
      "Fecha RMA": r.fecha_rma ? r.fecha_rma.slice(0, 10) : "—",
      Estatus: KPI_ESTATUS_LABELS[r.estatus || ""] || r.estatus || "—",
      "Serie Reemplazo": r.serie_fabrica || "—",
      Falla: r.falla || "—",
    }));
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(rmaRows), "Trámites RMA");

    const filename = `AUDITORIA_COMPLETA_${today}.xlsx`;
    XLSX.writeFile(wb, filename);
    toast.success("Auditoría completa exportada", { description: `${records.length} registros incluidos` });
  };

  return (
    <div className="space-y-6">
      {/* HEADER PRINCIPAL */}
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
                Control integral de salidas definitivas, temporales, trámites de marca (RMA) y auditoría contable.
              </p>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          <div className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border border-border bg-card text-[11px] font-medium text-muted-foreground" title="Sincronización en vivo con Supabase">
            <span className="relative flex h-2 w-2">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
              <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
            </span>
            <span suppressHydrationWarning className="text-foreground font-mono font-bold">{lastUpdate || "—"}</span>
            <span className="text-[10px] text-emerald-600 dark:text-emerald-400 font-semibold">• En vivo</span>
          </div>

          <button
            onClick={() => loadRecords(false)}
            disabled={loading || isRefreshing}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-border bg-card hover:bg-muted text-xs font-medium text-foreground transition-colors disabled:opacity-50"
            title="Recargar datos desde Supabase ahora"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${loading || isRefreshing ? "animate-spin text-brand-500" : ""}`} />
            <span>Actualizar</span>
          </button>

          <button
            onClick={exportCurrentViewToExcel}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-emerald-500/30 bg-emerald-500/10 hover:bg-emerald-500/20 text-xs font-semibold text-emerald-600 dark:text-emerald-400 transition-colors"
            title="Exportar vista activa a Excel"
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

      {/* TOP TABS NAVIGATION */}
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
              activeTab === "def" ? "bg-brand-500 text-white font-bold" : "bg-muted text-muted-foreground"
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
              activeTab === "temp" ? "bg-brand-500 text-white font-bold" : "bg-muted text-muted-foreground"
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
          <span>Trámites con Marca (RMA)</span>
          <span
            className={`px-1.5 py-0.2 rounded-full text-[10px] ${
              activeTab === "rma" ? "bg-brand-500 text-white font-bold" : "bg-muted text-muted-foreground"
            }`}
          >
            {rmaPool.length}
          </span>
        </button>

        <button
          onClick={() => setActiveTab("calidad")}
          className={`flex items-center gap-2 px-4 py-2.5 text-xs font-semibold rounded-t-lg transition-all border-b-2 whitespace-nowrap ${
            activeTab === "calidad"
              ? "border-brand-500 text-brand-600 dark:text-brand-400 bg-brand-500/5 font-bold"
              : "border-transparent text-muted-foreground hover:text-foreground hover:bg-muted/50"
          }`}
        >
          <TrendingUp className="h-3.5 w-3.5" />
          <span>Control de Calidad (KPIs)</span>
        </button>


      </div>

      {/* VISTA 1 & 2: SALIDAS DEFINITIVAS Y TEMPORALES */}
      {(activeTab === "def" || activeTab === "temp") && (
        <div className="space-y-4">
          {/* BARRA DE FILTROS COMPLETA (Screenshot 2) */}
          <div className="p-3.5 rounded-xl border border-border bg-card shadow-sm space-y-3">
            <div className="flex items-center gap-2 flex-wrap">
              {/* Buscador */}
              <div className="relative min-w-[220px] flex-1">
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

              {/* Categorías */}
              <select
                value={filterCategoria}
                onChange={(e) => setFilterCategoria(e.target.value)}
                className="px-2.5 py-1.5 rounded-lg border border-border bg-background text-xs focus:outline-none focus:ring-1 focus:ring-brand-500"
              >
                <option value="">Todas las categorías</option>
                {Object.entries(CAT_LABELS).map(([k, label]) => (
                  <option key={k} value={k}>
                    {label}
                  </option>
                ))}
              </select>

              {/* DEV: Todos / Aprobado / Sin DEV / Pendiente */}
              <select
                value={filterDevStatus}
                onChange={(e) => setFilterDevStatus(e.target.value as any)}
                className="px-2.5 py-1.5 rounded-lg border border-border bg-background text-xs focus:outline-none focus:ring-1 focus:ring-brand-500 font-medium"
              >
                <option value="todos">DEV: Todos</option>
                <option value="aprobado">Aprobado (Con DEV)</option>
                <option value="sin_dev">Sin DEV</option>
                <option value="pendiente">Pendiente</option>
              </select>

              {/* Propietario: Todos (Screenshot 2) */}
              <select
                value={filterOwner}
                onChange={(e) => setFilterOwner(e.target.value)}
                className="px-2.5 py-1.5 rounded-lg border border-border bg-background text-xs focus:outline-none focus:ring-1 focus:ring-brand-500 font-medium"
              >
                <option value="">Propietario: Todos</option>
                {distinctOwners.map((owner) => (
                  <option key={owner} value={owner}>
                    {owner}
                  </option>
                ))}
              </select>

              {/* Sede */}
              <select
                value={filterSede}
                onChange={(e) => setFilterSede(e.target.value)}
                className="px-2.5 py-1.5 rounded-lg border border-border bg-background text-xs focus:outline-none focus:ring-1 focus:ring-brand-500"
              >
                <option value="">Todas las Sedes</option>
                {SEDES.map((s) => (
                  <option key={s} value={s}>
                    {s}
                  </option>
                ))}
              </select>

              {/* Rango Desde / Hasta */}
              <input
                type="date"
                value={filterFechaDesde}
                onChange={(e) => setFilterFechaDesde(e.target.value)}
                className="px-2 py-1.5 rounded-lg border border-border bg-background text-xs focus:outline-none focus:ring-1 focus:ring-brand-500"
                title="Fecha desde"
              />
              <input
                type="date"
                value={filterFechaHasta}
                onChange={(e) => setFilterFechaHasta(e.target.value)}
                className="px-2 py-1.5 rounded-lg border border-border bg-background text-xs focus:outline-none focus:ring-1 focus:ring-brand-500"
                title="Fecha hasta"
              />

              {/* Botón Limpiar */}
              <button
                onClick={handleClearFilters}
                className="px-3 py-1.5 rounded-lg border border-border bg-muted hover:bg-muted/80 text-xs font-semibold text-foreground transition-colors"
              >
                Limpiar
              </button>
            </div>

            {/* Contador de registros filtrados */}
            <div className="flex items-center justify-between text-xs pt-1 border-t border-border/50 text-muted-foreground">
              <span>
                Mostrando <strong>{activeRecords.length}</strong> de{" "}
                <strong>{activeTab === "def" ? rawDefinitivas.length : rawTemporales.length}</strong> registros
              </span>
            </div>
          </div>

          {/* TABLA DE SALIDAS */}
          <div className="rounded-xl border border-border bg-card shadow-sm overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs border-collapse">
                <thead>
                  <tr className="bg-muted/40 border-b border-border text-muted-foreground uppercase text-[10px] tracking-wider font-semibold">
                    <th className="p-3 w-8"></th>
                    <th className="p-3">Boleta</th>
                    <th className="p-3">Fecha</th>
                    <th className="p-3">Ticket</th>
                    <th className="p-3">Categoría</th>
                    <th className="p-3">Cliente</th>
                    <th className="p-3">Artículo / Serie</th>
                    <th className="p-3">Sede</th>
                    <th className="p-3">DEV / Estatus</th>
                    <th className="p-3 text-right">Acciones</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {loading && paginatedRecords.length === 0 ? (
                    <tr>
                      <td colSpan={10} className="p-8 text-center text-muted-foreground">
                        <RefreshCw className="h-6 w-6 animate-spin mx-auto mb-2 text-brand-500" />
                        <span>Cargando registros...</span>
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
                            onClick={() => setExpandedRows((prev) => ({ ...prev, [r.id]: !prev[r.id] }))}
                            className="hover:bg-muted/30 transition-colors cursor-pointer group"
                          >
                            <td className="p-3 text-muted-foreground">
                              {isExpanded ? (
                                <ChevronDown className="h-3.5 w-3.5 text-brand-500" />
                              ) : (
                                <ChevronRight className="h-3.5 w-3.5 group-hover:text-foreground" />
                              )}
                            </td>
                            <td className="p-3 font-mono font-bold whitespace-nowrap">
                              <span
                                className={`px-2 py-0.5 rounded text-[11px] font-mono border ${
                                  (r.boleta || "").startsWith("GNC") || (r.boleta || "").startsWith("TNC")
                                    ? "bg-purple-500/10 text-purple-600 border-purple-500/20"
                                    : (r.boleta || "").startsWith("G")
                                    ? "bg-brand-500/10 text-brand-600 border-brand-500/20"
                                    : "bg-emerald-500/10 text-emerald-600 border-emerald-500/20"
                                }`}
                              >
                                {r.boleta || "—"}
                              </span>
                            </td>
                            <td className="p-3 text-muted-foreground whitespace-nowrap">
                              {r.fecha_creacion ? r.fecha_creacion.slice(0, 10) : "—"}
                            </td>
                            <td className="p-3 font-mono font-medium whitespace-nowrap">
                              {r.ticket ? `#${r.ticket}` : "—"}
                            </td>
                            <td className="p-3 whitespace-nowrap">
                              <span className="px-2 py-0.5 rounded text-[10px] font-medium bg-muted border border-border">
                                {CAT_LABELS[r.categoria || ""] || r.categoria || "—"}
                              </span>
                            </td>
                            <td className="p-3 font-semibold text-foreground max-w-[170px] truncate" title={r.nombre || ""}>
                              {r.nombre || "—"}
                            </td>
                            <td className="p-3 max-w-[190px] truncate">
                              <div className="font-medium truncate">{r.serie || "—"}</div>
                              <div className="text-[10px] text-muted-foreground font-mono truncate">
                                {r.numero_serie || r.marca || "—"}
                              </div>
                            </td>
                            <td className="p-3 text-muted-foreground whitespace-nowrap">{r.sede || "—"}</td>
                            <td className="p-3 whitespace-nowrap">
                              {r.tipo === "salida_definitiva" ? (
                                hasDev ? (
                                  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-mono font-bold bg-emerald-500/10 text-emerald-600 border border-emerald-500/20">
                                    <Check className="h-3 w-3" />
                                    Aprobado • {r.dev}
                                  </span>
                                ) : estaPorAprobar(r) ? (
                                  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-medium bg-amber-500/10 text-amber-600 border border-amber-500/20">
                                    <Clock className="h-3 w-3" />
                                    Por Aprobar (Sin DEV)
                                  </span>
                                ) : (
                                  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-medium bg-muted text-muted-foreground border border-border">
                                    —
                                  </span>
                                )
                              ) : hasDev ? (
                                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-mono font-bold bg-emerald-500/10 text-emerald-600 border border-emerald-500/20">
                                  <Check className="h-3 w-3" />
                                  {r.dev}
                                </span>
                              ) : (
                                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-medium bg-amber-500/10 text-amber-600 border border-amber-500/20">
                                  <Clock className="h-3 w-3" />
                                  Sin DEV
                                </span>
                              )}
                            </td>
                            <td className="p-3 text-right whitespace-nowrap" onClick={(e) => e.stopPropagation()}>
                              <div className="flex items-center justify-end gap-1.5">
                                <button
                                  onClick={() => setEditingRecord(r)}
                                  className="px-2 py-1 rounded bg-amber-500/10 text-amber-600 hover:bg-amber-500/20 border border-amber-500/20 text-xs font-semibold"
                                >
                                  Editar
                                </button>
                                <button
                                  onClick={() => setDeletingRecord(r)}
                                  className="px-2 py-1 rounded bg-rose-500/10 text-rose-600 hover:bg-rose-500/20 border border-rose-500/20 text-xs font-semibold"
                                >
                                  Eliminar
                                </button>
                              </div>
                            </td>
                          </tr>

                          {/* Detalle expandido */}
                          {isExpanded && (
                            <tr className="bg-muted/15 border-b border-border">
                              <td colSpan={10} className="p-4 pl-11">
                                <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-xs">
                                  <div className="p-3 rounded-lg bg-card border border-border space-y-1.5">
                                    <p className="font-bold text-[11px] text-brand-600 uppercase tracking-wider">
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

                                  <div className="p-3 rounded-lg bg-card border border-border space-y-1.5">
                                    <p className="font-bold text-[11px] text-brand-600 uppercase tracking-wider">
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

                                  <div className="p-3 rounded-lg bg-card border border-border space-y-1.5">
                                    <p className="font-bold text-[11px] text-brand-600 uppercase tracking-wider">
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

                                {(r.falla || r.descripcion) && (
                                  <div className="mt-3 p-3 rounded-lg bg-card border border-border text-xs space-y-1">
                                    {r.falla && (
                                      <p>
                                        <strong className="text-foreground">Descripción de la falla:</strong>{" "}
                                        <span className="text-muted-foreground">{r.falla}</span>
                                      </p>
                                    )}
                                    {r.descripcion && (
                                      <p>
                                        <strong className="text-foreground">Descripción del artículo:</strong>{" "}
                                        <span className="text-muted-foreground">{r.descripcion}</span>
                                      </p>
                                    )}
                                  </div>
                                )}

                                <div className="mt-2 text-[10px] text-muted-foreground flex items-center justify-between">
                                  <span>
                                    Registrado por <strong>{r.registrado_por || "—"}</strong> el{" "}
                                    <span suppressHydrationWarning>{formatDateSafe(r.fecha_creacion)}</span>
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

            {/* Paginación */}
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
                  <span className="px-2 font-semibold">
                    {currentPage} / {totalPages}
                  </span>
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
        </div>
      )}

      {/* VISTA 3: TRÁMITES CON MARCA (RMA) (Screenshot 5) */}
      {activeTab === "rma" && (
        <div className="space-y-4">
          {/* Navegación Subtabs: Registros RMA vs Análisis de Procesos */}
          <div className="flex items-center gap-2 border-b border-border pb-2">
            <button
              onClick={() => setRmaSubTab("registros")}
              className={`px-4 py-2 rounded-lg text-xs font-bold transition-all ${
                rmaSubTab === "registros"
                  ? "bg-brand-500 text-white shadow-sm"
                  : "bg-muted text-muted-foreground hover:text-foreground"
              }`}
            >
              Registros RMA
            </button>
            <button
              onClick={() => setRmaSubTab("analisis")}
              className={`px-4 py-2 rounded-lg text-xs font-bold transition-all ${
                rmaSubTab === "analisis"
                  ? "bg-brand-500 text-white shadow-sm"
                  : "bg-muted text-muted-foreground hover:text-foreground"
              }`}
            >
              Análisis de Procesos
            </button>
          </div>

          {rmaSubTab === "registros" ? (
            <div className="space-y-4">
              {/* BANNER ROJO LLAMATIVO (Screenshot 5) */}
              <div className="py-2.5 px-4 rounded-lg bg-[#D1411E] text-white font-extrabold text-center uppercase tracking-wider text-sm shadow-md">
                REGISTROS RMA
              </div>

              {/* BARRA DE FILTROS RMA (Screenshot 5) */}
              <div className="p-3.5 rounded-xl border border-border bg-card shadow-sm space-y-3">
                <div className="flex items-center gap-2.5 flex-wrap">
                  {/* Marca */}
                  <div className="flex flex-col gap-1">
                    <span className="text-[10px] font-semibold text-muted-foreground uppercase">Marca</span>
                    <select
                      value={filterRmaMarca}
                      onChange={(e) => setFilterRmaMarca(e.target.value)}
                      className="px-2.5 py-1.5 rounded-lg border border-border bg-background text-xs focus:outline-none focus:ring-1 focus:ring-brand-500"
                    >
                      <option value="">Todas</option>
                      {distinctRmaMarcas.map((m) => (
                        <option key={m} value={m}>
                          {m}
                        </option>
                      ))}
                    </select>
                  </div>

                  {/* Estatus */}
                  <div className="flex flex-col gap-1">
                    <span className="text-[10px] font-semibold text-muted-foreground uppercase">Estatus</span>
                    <select
                      value={filterRmaEstatus}
                      onChange={(e) => setFilterRmaEstatus(e.target.value)}
                      className="px-2.5 py-1.5 rounded-lg border border-border bg-background text-xs focus:outline-none focus:ring-1 focus:ring-brand-500"
                    >
                      <option value="">Todos</option>
                      {distinctRmaEstatus.map((est) => (
                        <option key={est} value={est}>
                          {KPI_ESTATUS_LABELS[est] || est}
                        </option>
                      ))}
                    </select>
                  </div>

                  {/* Fecha Ticket RMA */}
                  <div className="flex flex-col gap-1">
                    <span className="text-[10px] font-semibold text-muted-foreground uppercase">Fecha Ticket RMA</span>
                    <input
                      type="date"
                      value={filterRmaFecha}
                      onChange={(e) => setFilterRmaFecha(e.target.value)}
                      className="px-2 py-1.5 rounded-lg border border-border bg-background text-xs focus:outline-none focus:ring-1 focus:ring-brand-500"
                    />
                  </div>

                  {/* Buscar */}
                  <div className="flex flex-col gap-1 flex-1 min-w-[200px]">
                    <span className="text-[10px] font-semibold text-muted-foreground uppercase">Buscar</span>
                    <div className="relative">
                      <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
                      <input
                        type="text"
                        value={search}
                        onChange={(e) => setSearch(e.target.value)}
                        placeholder="Ticket, cliente, serie..."
                        className="w-full pl-8 pr-3 py-1.5 rounded-lg border border-border bg-background text-xs focus:outline-none focus:ring-1 focus:ring-brand-500"
                      />
                    </div>
                  </div>

                  {/* Botones de acción derecha (Screenshot 5) */}
                  <div className="flex items-end gap-1.5 pt-4 flex-wrap">
                    <button
                      onClick={handleClearFilters}
                      className="px-3 py-1.5 rounded-lg border border-border bg-muted hover:bg-muted/80 text-xs font-semibold transition-colors"
                    >
                      Limpiar
                    </button>

                    <button
                      onClick={exportCurrentViewToExcel}
                      className="px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold transition-colors inline-flex items-center gap-1 shadow-sm"
                    >
                      <Download className="h-3.5 w-3.5" />
                      <span>Excel (Todo)</span>
                    </button>

                    <button
                      onClick={() => setOnlyMyRma((v) => !v)}
                      className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-colors inline-flex items-center gap-1 shadow-sm ${
                        onlyMyRma
                          ? "bg-blue-700 text-white ring-2 ring-blue-400"
                          : "bg-blue-600 hover:bg-blue-700 text-white"
                      }`}
                      title="Filtrar trámites registrados por el usuario actual"
                    >
                      <User className="h-3.5 w-3.5" />
                      <span>Mis RMAs</span>
                    </button>

                    <button
                      onClick={() => setPendientesModalOpen(true)}
                      className="px-3 py-1.5 rounded-lg bg-amber-600 hover:bg-amber-700 text-white text-xs font-bold transition-colors inline-flex items-center gap-1 shadow-sm"
                      title="Ver trámites con campos incompletos"
                    >
                      <AlertCircle className="h-3.5 w-3.5" />
                      <span>Pendientes ({rmaIncompletos.length})</span>
                    </button>

                    <label
                      className="px-3 py-1.5 rounded-lg bg-zinc-900 hover:bg-black text-white text-xs font-bold transition-colors inline-flex items-center gap-1 cursor-pointer shadow-sm"
                      title="Subir Excel para contrastar consecutivos y detectar faltantes"
                    >
                      <Upload className="h-3.5 w-3.5" />
                      <span>Comparar Excel</span>
                      <input
                        type="file"
                        accept=".xlsx,.xls"
                        className="hidden"
                        onChange={handleCompareExcel}
                      />
                    </label>
                  </div>
                </div>
              </div>

              {/* TABLA RMA PREMIUM CON LAS 13 COLUMNAS EXACTAS (Screenshot 5) */}
              <div className="rounded-xl border border-border bg-card shadow-sm overflow-hidden">
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-xs border-collapse">
                    <thead>
                      <tr className="bg-muted/40 border-b border-border text-muted-foreground uppercase text-[10px] tracking-wider font-bold">
                        <th className="p-2.5">Ticket</th>
                        <th className="p-2.5">Cliente</th>
                        <th className="p-2.5">Marca</th>
                        <th className="p-2.5">Ticket RMA</th>
                        <th className="p-2.5">Fecha RMA</th>
                        <th className="p-2.5">Tiempo</th>
                        <th className="p-2.5">Serie</th>
                        <th className="p-2.5">Serie Nvo.</th>
                        <th className="p-2.5">Estatus</th>
                        <th className="p-2.5">Boleta</th>
                        <th className="p-2.5">Registró</th>
                        <th className="p-2.5">Auditoría</th>
                        <th className="p-2.5 text-right">Acc.</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border">
                      {paginatedRecords.length === 0 ? (
                        <tr>
                          <td colSpan={13} className="p-8 text-center text-muted-foreground">
                            <AlertCircle className="h-6 w-6 mx-auto mb-2 opacity-50" />
                            <span>No hay registros RMA con estos filtros</span>
                          </td>
                        </tr>
                      ) : (
                        paginatedRecords.map((r) => {
                          const esCerrado = r.estatus && ESTATUS_CERRADOS.includes(r.estatus);
                          const fechaBase = r.fecha_rma || r.fecha_creacion;
                          const tiempoTranscurrido = formatTimeElapsed(fechaBase, r.fecha_modificacion, r.estatus);

                          // Check completeness for Auditoría column
                          const clean = (v: any) => (v ? v.toString().trim().replace(/^[\-\s—]+$/, "") : "");
                          const faltan: string[] = [];
                          if (!clean(r.ticket_rma)) faltan.push("Ticket RMA");
                          if (!clean(r.fecha_rma)) faltan.push("Fecha RMA");
                          if (!clean(r.serie_fabrica)) faltan.push("Serie Equipo Nuevo");
                          if (!clean(r.estatus)) faltan.push("Estatus");

                          const catLabel = CAT_LABELS[r.categoria || ""] || r.categoria || "RMA";

                          return (
                            <tr key={r.id} className="hover:bg-muted/30 transition-colors">
                              <td className="p-2.5 font-mono font-medium whitespace-nowrap">
                                {r.ticket ? `#${r.ticket}` : "—"}
                              </td>
                              <td className="p-2.5 font-bold text-foreground max-w-[140px] truncate" title={r.nombre || ""}>
                                {r.nombre || "—"}
                              </td>
                              <td className="p-2.5 font-semibold text-muted-foreground whitespace-nowrap">
                                {r.marca || "—"}
                              </td>
                              <td className="p-2.5 font-mono text-[11px] whitespace-nowrap">
                                {clean(r.ticket_rma) ? (
                                  <span className="font-semibold text-foreground">{r.ticket_rma}</span>
                                ) : (
                                  <span className="text-red-500 font-bold text-[10px]">PENDIENTE</span>
                                )}
                              </td>
                              <td className="p-2.5 whitespace-nowrap">
                                {clean(r.fecha_rma) ? (
                                  <span>{r.fecha_rma!.slice(0, 10)}</span>
                                ) : (
                                  <span className="text-red-500 font-bold text-[10px]">PENDIENTE</span>
                                )}
                              </td>
                              <td
                                suppressHydrationWarning
                                className={`p-2.5 font-mono font-semibold whitespace-nowrap ${
                                  esCerrado ? "text-emerald-500" : "text-foreground"
                                }`}
                              >
                                {tiempoTranscurrido}
                              </td>
                              <td className="p-2.5 font-mono text-[11px] max-w-[120px] truncate" title={r.serie || ""}>
                                {r.serie || "—"}
                              </td>
                              <td className="p-2.5 font-mono text-[11px] max-w-[110px] truncate">
                                {clean(r.serie_fabrica) ? (
                                  r.serie_fabrica
                                ) : (
                                  <span className="text-red-500 font-bold text-[10px]">PENDIENTE</span>
                                )}
                              </td>
                              <td className="p-2.5 whitespace-nowrap">
                                {r.estatus ? (
                                  <span
                                    className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                                      esCerrado
                                        ? "bg-emerald-500/10 text-emerald-600 border border-emerald-500/20"
                                        : "bg-blue-500/10 text-blue-600 border border-blue-500/20"
                                    }`}
                                  >
                                    {KPI_ESTATUS_LABELS[r.estatus] || r.estatus}
                                  </span>
                                ) : (
                                  <span className="text-red-500 font-bold text-[10px]">PENDIENTE</span>
                                )}
                              </td>
                              <td className="p-2.5 font-mono font-bold text-foreground whitespace-nowrap">
                                {r.boleta || "—"}
                              </td>
                              <td className="p-2.5 text-[11px] text-muted-foreground max-w-[110px] truncate" title={r.registrado_por || ""}>
                                {r.registrado_por || "—"}
                              </td>
                              <td className="p-2.5 whitespace-nowrap leading-tight">
                                {faltan.length === 0 ? (
                                  <div>
                                    <span className="px-1.5 py-0.5 rounded text-[9px] font-bold bg-emerald-500/15 text-emerald-600 border border-emerald-500/25">
                                      ✓ COMPLETO
                                    </span>
                                    <div className="text-[9px] text-muted-foreground font-semibold mt-0.5">
                                      {catLabel}
                                    </div>
                                  </div>
                                ) : (
                                  <div>
                                    <span
                                      className="px-1.5 py-0.5 rounded text-[9px] font-bold bg-amber-500/15 text-amber-600 border border-amber-500/25"
                                      title={`Faltan: ${faltan.join(", ")}`}
                                    >
                                      ⚠ {faltan.length} PEND
                                    </span>
                                    <div className="text-[9px] text-brand-600 font-semibold mt-0.5">
                                      {catLabel}
                                    </div>
                                  </div>
                                )}
                              </td>
                              <td className="p-2.5 text-right whitespace-nowrap">
                                <div className="flex items-center justify-end gap-1">
                                  <button
                                    onClick={() => setEditingRecord(r)}
                                    className="p-1 rounded hover:bg-muted text-muted-foreground hover:text-foreground"
                                    title="Editar registro RMA"
                                  >
                                    <Edit className="h-3.5 w-3.5" />
                                  </button>
                                  <button
                                    onClick={() => setDeletingRecord(r)}
                                    className="p-1 rounded hover:bg-rose-500/10 text-muted-foreground hover:text-rose-500"
                                    title="Eliminar registro"
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

                {/* Paginación RMA */}
                {totalPages > 1 && (
                  <div className="p-3 border-t border-border flex items-center justify-between text-xs text-muted-foreground">
                    <span>
                      Mostrando {(currentPage - 1) * rmaPageSize + 1} -{" "}
                      {Math.min(currentPage * rmaPageSize, activeRecords.length)} de {activeRecords.length}
                    </span>
                    <div className="flex items-center gap-1">
                      <button
                        onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                        disabled={currentPage <= 1}
                        className="px-2.5 py-1 rounded border border-border bg-card hover:bg-muted disabled:opacity-50"
                      >
                        Anterior
                      </button>
                      <span className="px-2 font-semibold">
                        {currentPage} / {totalPages}
                      </span>
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
            </div>
          ) : (
            /* SUBTAB: ANÁLISIS DE PROCESOS (RMA) */
            <div className="space-y-6">
              {/* Header de Análisis con botones de exportar */}
              <div className="flex items-center justify-between flex-wrap gap-2">
                <div>
                  <h2 className="text-base font-bold text-foreground">Análisis de Procesos RMA</h2>
                  <p className="text-xs text-muted-foreground">
                    Tiempos de respuesta, volúmenes mensuales y métricas de desempeño por marca.
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    onClick={exportCurrentViewToExcel}
                    className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg border border-border bg-card hover:bg-muted text-xs font-semibold text-foreground transition-colors"
                  >
                    <FileSpreadsheet className="h-3.5 w-3.5 text-emerald-600" />
                    <span>Excel</span>
                  </button>
                  <button
                    onClick={exportRmaAnalysisPdf}
                    className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg border border-border bg-card hover:bg-muted text-xs font-semibold text-foreground transition-colors"
                  >
                    <Download className="h-3.5 w-3.5 text-rose-600" />
                    <span>PDF</span>
                  </button>
                </div>
              </div>

              {/* Barra de Filtros de Período y Marca */}
              <div className="p-3.5 rounded-xl border border-border bg-card shadow-sm flex items-center gap-3 flex-wrap text-xs">
                <div className="flex items-center gap-1.5">
                  <span className="font-semibold text-muted-foreground">Período:</span>
                  <select
                    value={rmaPeriodo}
                    onChange={(e) => setRmaPeriodo(e.target.value as any)}
                    className="px-2.5 py-1.5 rounded-lg border border-border bg-background text-xs font-medium focus:ring-1 focus:ring-brand-500"
                  >
                    <option value="all">Todo el historial</option>
                    <option value="7d">Últimos 7 días</option>
                    <option value="30d">Últimos 30 días</option>
                    <option value="90d">Últimos 90 días</option>
                    <option value="6m">Últimos 6 meses</option>
                    <option value="1y">Último año</option>
                    <option value="custom">Rango personalizado</option>
                  </select>
                </div>

                {rmaPeriodo === "custom" && (
                  <>
                    <input
                      type="date"
                      value={rmaPeriodoDesde}
                      onChange={(e) => setRmaPeriodoDesde(e.target.value)}
                      className="px-2 py-1 rounded border border-border bg-background text-xs"
                      title="Desde"
                    />
                    <input
                      type="date"
                      value={rmaPeriodoHasta}
                      onChange={(e) => setRmaPeriodoHasta(e.target.value)}
                      className="px-2 py-1 rounded border border-border bg-background text-xs"
                      title="Hasta"
                    />
                  </>
                )}

                <div className="flex items-center gap-1.5">
                  <span className="font-semibold text-muted-foreground">Marca:</span>
                  <select
                    value={rmaAnalisisMarca}
                    onChange={(e) => setRmaAnalisisMarca(e.target.value)}
                    className="px-2.5 py-1.5 rounded-lg border border-border bg-background text-xs font-medium focus:ring-1 focus:ring-brand-500"
                  >
                    <option value="">Todas</option>
                    {distinctRmaMarcas.map((m) => (
                      <option key={m} value={m}>
                        {m}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              {/* Fila 1: Tarjetas Resumen */}
              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
                <div className="p-3.5 rounded-xl border border-brand-500/20 bg-brand-500/5 shadow-sm">
                  <span className="text-[10px] font-bold text-brand-600 uppercase">Total Trámites</span>
                  <div className="text-2xl font-black text-foreground mt-1">{rmaPool.length}</div>
                </div>

                <div className="p-3.5 rounded-xl border border-amber-500/20 bg-amber-500/5 shadow-sm">
                  <span className="text-[10px] font-bold text-amber-600 uppercase">En Proceso</span>
                  <div className="text-2xl font-black text-foreground mt-1">
                    {rmaPool.filter((r) => r.estatus === "en_proceso").length}
                  </div>
                </div>

                <div className="p-3.5 rounded-xl border border-emerald-500/20 bg-emerald-500/5 shadow-sm">
                  <span className="text-[10px] font-bold text-emerald-600 uppercase">Resueltos</span>
                  <div className="text-2xl font-black text-emerald-600 mt-1">
                    {rmaPool.filter((r) => r.estatus && ESTATUS_CERRADOS.includes(r.estatus)).length}
                  </div>
                </div>

                <div className="p-3.5 rounded-xl border border-rose-500/20 bg-rose-500/5 shadow-sm">
                  <span className="text-[10px] font-bold text-rose-600 uppercase">Pendientes</span>
                  <div className="text-2xl font-black text-rose-600 mt-1">{rmaIncompletos.length}</div>
                </div>

                <div className="p-3.5 rounded-xl border border-blue-500/20 bg-blue-500/5 shadow-sm col-span-2 sm:col-span-1">
                  <span className="text-[10px] font-bold text-blue-600 uppercase">Tasa de Resolución</span>
                  <div className="text-2xl font-black text-blue-600 mt-1">
                    {rmaPool.length
                      ? (
                          (rmaPool.filter((r) => r.estatus && ESTATUS_CERRADOS.includes(r.estatus)).length /
                            rmaPool.length) *
                          100
                        ).toFixed(1)
                      : "0"}
                    %
                  </div>
                </div>
              </div>

              {/* Fila 2: Métricas de Tiempo */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                <div className="p-4 rounded-xl border border-border bg-card shadow-sm">
                  <span className="text-xs font-semibold text-muted-foreground uppercase">
                    Tiempo Promedio de Resolución
                  </span>
                  <div className="text-3xl font-black text-foreground mt-2">
                    {calidadMetrics.avgAprob !== "—" ? `${calidadMetrics.avgAprob} días` : "—"}
                  </div>
                </div>

                <div className="p-4 rounded-xl border border-border bg-card shadow-sm">
                  <span className="text-xs font-semibold text-muted-foreground uppercase">Resolución Más Rápida</span>
                  <div className="text-3xl font-black text-emerald-600 mt-2">
                    {calidadMetrics.minAprob !== "—" ? `${calidadMetrics.minAprob} días` : "—"}
                  </div>
                </div>

                <div className="p-4 rounded-xl border border-border bg-card shadow-sm">
                  <span className="text-xs font-semibold text-muted-foreground uppercase">Resolución Más Lenta</span>
                  <div className="text-3xl font-black text-amber-600 mt-2">
                    {calidadMetrics.maxAprob !== "—" ? `${calidadMetrics.maxAprob} días` : "—"}
                  </div>
                </div>
              </div>

              {/* Fila 3: Gráficos de Análisis RMA */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {/* 1. Estatus */}
                <div className="p-4 rounded-xl border border-border bg-card shadow-sm">
                  <div className="flex items-center justify-between mb-3">
                    <span className="font-bold text-xs uppercase tracking-wide">Distribución por Estatus</span>
                    <button
                      onClick={() => downloadChartAsPng(chartRmaEstatusRef.current, "rma_estatus")}
                      className="text-xs text-muted-foreground hover:text-foreground font-semibold px-2 py-0.5 rounded border border-border"
                    >
                      ↓ PNG
                    </button>
                  </div>
                  <div className="h-64">
                    <canvas ref={chartRmaEstatusRef} />
                  </div>
                </div>

                {/* 2. Volumen Mensual */}
                <div className="p-4 rounded-xl border border-border bg-card shadow-sm">
                  <div className="flex items-center justify-between mb-3">
                    <span className="font-bold text-xs uppercase tracking-wide">Volumen por Mes</span>
                    <button
                      onClick={() => downloadChartAsPng(chartRmaVolumenRef.current, "rma_volumen")}
                      className="text-xs text-muted-foreground hover:text-foreground font-semibold px-2 py-0.5 rounded border border-border"
                    >
                      ↓ PNG
                    </button>
                  </div>
                  <div className="h-64">
                    <canvas ref={chartRmaVolumenRef} />
                  </div>
                </div>

                {/* 3. Top Marcas */}
                <div className="p-4 rounded-xl border border-border bg-card shadow-sm">
                  <div className="flex items-center justify-between mb-3">
                    <span className="font-bold text-xs uppercase tracking-wide">Top Marcas con más Trámites</span>
                    <button
                      onClick={() => downloadChartAsPng(chartRmaMarcasRef.current, "rma_marcas")}
                      className="text-xs text-muted-foreground hover:text-foreground font-semibold px-2 py-0.5 rounded border border-border"
                    >
                      ↓ PNG
                    </button>
                  </div>
                  <div className="h-64">
                    <canvas ref={chartRmaMarcasRef} />
                  </div>
                </div>

                {/* 4. Tiempo Promedio por Marca */}
                <div className="p-4 rounded-xl border border-border bg-card shadow-sm">
                  <div className="flex items-center justify-between mb-3">
                    <span className="font-bold text-xs uppercase tracking-wide">
                      Tiempo Promedio por Marca (días)
                    </span>
                    <button
                      onClick={() => downloadChartAsPng(chartRmaTiempoMarcaRef.current, "rma_tiempo_marca")}
                      className="text-xs text-muted-foreground hover:text-foreground font-semibold px-2 py-0.5 rounded border border-border"
                    >
                      ↓ PNG
                    </button>
                  </div>
                  <div className="h-64">
                    <canvas ref={chartRmaTiempoMarcaRef} />
                  </div>
                </div>
              </div>

              {/* Fila 4: Tabla Resumen Detallada por Marca */}
              <div className="rounded-xl border border-border bg-card shadow-sm overflow-hidden">
                <div className="p-3.5 border-b border-border bg-muted/30">
                  <h3 className="font-bold text-xs uppercase tracking-wide text-foreground">
                    Desempeño y Tiempos de Respuesta por Marca
                  </h3>
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
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border">
                      {distinctRmaMarcas.map((m) => {
                        const deMarca = rmaPool.filter((r) => (r.marca || "").trim().toUpperCase() === m);
                        const resueltos = deMarca.filter((r) => r.estatus && ESTATUS_CERRADOS.includes(r.estatus));
                        const pendientes = deMarca.length - resueltos.length;
                        const rate = deMarca.length ? ((resueltos.length / deMarca.length) * 100).toFixed(0) : "0";

                        const dias = deMarca
                          .filter((r) => r.estatus && ESTATUS_CERRADOS.includes(r.estatus))
                          .map((r) => {
                            const f = r.fecha_rma || r.fecha_creacion;
                            if (!f || !r.fecha_modificacion) return null;
                            return Math.max(
                              0,
                              Math.round(
                                (new Date(r.fecha_modificacion).getTime() - new Date(f).getTime()) / 864e5
                              )
                            );
                          })
                          .filter((d): d is number => d !== null);

                        const avgDias = dias.length ? (dias.reduce((a, b) => a + b, 0) / dias.length).toFixed(1) : "—";

                        return (
                          <tr key={m} className="hover:bg-muted/30 transition-colors">
                            <td className="p-3 font-bold text-foreground">{m}</td>
                            <td className="p-3 text-center font-mono">{deMarca.length}</td>
                            <td className="p-3 text-center font-mono font-bold text-emerald-600">
                              {resueltos.length}
                            </td>
                            <td className="p-3 text-center font-mono font-bold text-amber-600">{pendientes}</td>
                            <td className="p-3 text-center">
                              <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-blue-500/10 text-blue-600 border border-blue-500/20">
                                {rate}%
                              </span>
                            </td>
                            <td className="p-3 text-center font-mono font-bold">{avgDias}</td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {/* VISTA 4: CONTROL DE CALIDAD (KPIS & AUDITORÍA) (Screenshot 4) */}
      {activeTab === "calidad" && (
        <div className="space-y-6">
          {/* Header de Auditoría */}
          <div className="p-3.5 rounded-xl border border-border bg-card shadow-sm flex items-center justify-between flex-wrap gap-2">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-xs text-muted-foreground">Última actualización:</span>
              <span suppressHydrationWarning className="font-mono text-xs font-bold text-foreground">{lastUpdate || "—"}</span>
              <span className="px-2 py-0.5 rounded-full text-[10px] font-extrabold bg-emerald-500/15 text-emerald-600 border border-emerald-500/25 flex items-center gap-1.5">
                <span className="relative flex h-2 w-2">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                  <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
                </span>
                <span>✓ EN VIVO (Auto 30s)</span>
              </span>
              <button
                onClick={() => loadRecords(false)}
                disabled={loading || isRefreshing}
                className="p-1 rounded-md hover:bg-muted text-muted-foreground hover:text-foreground transition-colors"
                title="Actualizar datos ahora"
              >
                <RefreshCw className={`h-3 w-3 ${loading || isRefreshing ? "animate-spin text-brand-500" : ""}`} />
              </button>
            </div>
            <button
              onClick={exportFullAuditToExcel}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-brand-500/30 bg-brand-500/10 hover:bg-brand-500/20 text-xs font-bold text-brand-600 transition-colors"
            >
              <FileSpreadsheet className="h-3.5 w-3.5" />
              <span>Exportar Auditoría Completa</span>
            </button>
          </div>

          {/* LAS 8 TARJETAS DE AUDITORÍA CON BOTÓN AUDIT (Screenshot 4) */}
          <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-8 gap-2.5">
            {/* 1. Total */}
            <div
              onClick={() => openAuditDetailModal("total")}
              className="p-3 rounded-xl border border-border bg-card shadow-sm hover:border-brand-500/50 cursor-pointer transition-all flex flex-col justify-between"
              title="Clic para ver registros auditados"
            >
              <div className="flex items-center justify-between">
                <span className="text-[10px] font-bold text-muted-foreground uppercase">Total</span>
                <span className="px-1.5 py-0.2 rounded-full text-[9px] font-bold bg-brand-500/15 text-brand-600">
                  Audit
                </span>
              </div>
              <div className="text-2xl font-black text-brand-600 mt-2">{calidadMetrics.total}</div>
              <span className="text-[10px] text-muted-foreground">en la base</span>
            </div>

            {/* 2. Definitivas */}
            <div
              onClick={() => openAuditDetailModal("def")}
              className="p-3 rounded-xl border border-border bg-card shadow-sm hover:border-blue-500/50 cursor-pointer transition-all flex flex-col justify-between"
              title="Clic para ver registros auditados"
            >
              <div className="flex items-center justify-between">
                <span className="text-[10px] font-bold text-muted-foreground uppercase">Definitivas</span>
                <span className="px-1.5 py-0.2 rounded-full text-[9px] font-bold bg-blue-500/15 text-blue-600">
                  Audit
                </span>
              </div>
              <div className="text-2xl font-black text-blue-600 mt-2">{calidadMetrics.def}</div>
              <span className="text-[10px] text-muted-foreground">salida definitiva</span>
            </div>

            {/* 3. Temporales */}
            <div
              onClick={() => openAuditDetailModal("temp")}
              className="p-3 rounded-xl border border-border bg-card shadow-sm hover:border-emerald-500/50 cursor-pointer transition-all flex flex-col justify-between"
              title="Clic para ver registros auditados"
            >
              <div className="flex items-center justify-between">
                <span className="text-[10px] font-bold text-muted-foreground uppercase">Temporales</span>
                <span className="px-1.5 py-0.2 rounded-full text-[9px] font-bold bg-emerald-500/15 text-emerald-600">
                  Audit
                </span>
              </div>
              <div className="text-2xl font-black text-emerald-600 mt-2">{calidadMetrics.temp}</div>
              <span className="text-[10px] text-muted-foreground">salida temporal</span>
            </div>

            {/* 4. Hoy */}
            <div
              onClick={() => openAuditDetailModal("hoy")}
              className="p-3 rounded-xl border border-border bg-card shadow-sm hover:border-purple-500/50 cursor-pointer transition-all flex flex-col justify-between"
              title="Clic para ver registros auditados"
            >
              <div className="flex items-center justify-between">
                <span className="text-[10px] font-bold text-muted-foreground uppercase">Hoy</span>
                <span className="px-1.5 py-0.2 rounded-full text-[9px] font-bold bg-purple-500/15 text-purple-600">
                  Audit
                </span>
              </div>
              <div className="text-2xl font-black text-purple-600 mt-2">{calidadMetrics.hoy}</div>
              <span className="text-[10px] text-muted-foreground">registros del día</span>
            </div>

            {/* 5. Por Aprobar (Rojo) */}
            <div
              onClick={() => openAuditDetailModal("por_aprobar")}
              className="p-3 rounded-xl border-t-2 border-t-rose-500 border-border bg-card shadow-sm hover:border-rose-500/50 cursor-pointer transition-all flex flex-col justify-between"
              title="Clic para ver registros auditados"
            >
              <div className="flex items-center justify-between">
                <span className="text-[10px] font-bold text-rose-600 uppercase">Por Aprobar</span>
                <span className="px-1.5 py-0.2 rounded-full text-[9px] font-bold bg-rose-500/15 text-rose-600">
                  Audit
                </span>
              </div>
              <div className="text-2xl font-black text-rose-600 mt-2">{calidadMetrics.porAprobar}</div>
              <span className="text-[10px] text-muted-foreground">sin DEV</span>
            </div>

            {/* 6. Este Mes */}
            <div
              onClick={() => openAuditDetailModal("este_mes")}
              className="p-3 rounded-xl border border-border bg-card shadow-sm hover:border-emerald-500/50 cursor-pointer transition-all flex flex-col justify-between"
              title="Clic para ver registros auditados"
            >
              <div className="flex items-center justify-between">
                <span className="text-[10px] font-bold text-muted-foreground uppercase">Este Mes</span>
                <span className="px-1.5 py-0.2 rounded-full text-[9px] font-bold bg-emerald-500/15 text-emerald-600">
                  Audit
                </span>
              </div>
              <div className="text-2xl font-black text-foreground mt-2">{calidadMetrics.esteMes}</div>
              <span className="text-[10px] text-muted-foreground">vs mes ant.</span>
            </div>

            {/* 7. Top Sede */}
            <div
              onClick={() => openAuditDetailModal("top_sede")}
              className="p-3 rounded-xl border border-border bg-card shadow-sm hover:border-brand-500/50 cursor-pointer transition-all flex flex-col justify-between"
              title="Clic para ver registros auditados"
            >
              <div className="flex items-center justify-between">
                <span className="text-[10px] font-bold text-muted-foreground uppercase">Top Sede</span>
                <span className="px-1.5 py-0.2 rounded-full text-[9px] font-bold bg-brand-500/15 text-brand-600">
                  Audit
                </span>
              </div>
              <div className="text-sm font-black text-foreground mt-2 truncate">
                {calidadMetrics.topSedeName}
              </div>
              <span className="text-[10px] text-muted-foreground">{calidadMetrics.topSedeCount} registros</span>
            </div>

            {/* 8. Tiempo Aprobación */}
            <div
              onClick={() => openAuditDetailModal("tiempo_aprob")}
              className="p-3 rounded-xl border border-border bg-card shadow-sm hover:border-amber-500/50 cursor-pointer transition-all flex flex-col justify-between"
              title="Clic para ver registros auditados"
            >
              <div className="flex items-center justify-between">
                <span className="text-[10px] font-bold text-amber-600 uppercase">Tiempo Aprobación</span>
                <span className="px-1.5 py-0.2 rounded-full text-[9px] font-bold bg-amber-500/15 text-amber-600">
                  Audit
                </span>
              </div>
              <div className="text-lg font-black text-amber-600 mt-1">
                {calidadMetrics.avgAprob} <span className="text-[10px]">días prom.</span>
              </div>
              <span className="text-[9px] text-muted-foreground">
                Mín {calidadMetrics.minAprob}d · Máx {calidadMetrics.maxAprob}d · {calidadMetrics.aprobadosCount} aprob.
              </span>
            </div>
          </div>

          {/* LOS 4 GRÁFICOS DE CONTROL DE CALIDAD CON BOTÓN ↓ PNG (Screenshot 4) */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* Gráfico 1: Registros por mes */}
            <div className="p-4 rounded-xl border border-border bg-card shadow-sm">
              <div className="flex items-center justify-between mb-3">
                <h3 className="font-bold text-xs uppercase tracking-wide text-foreground">Registros por mes</h3>
                <button
                  onClick={() => downloadChartAsPng(chartMesRef.current, "registros_por_mes")}
                  className="px-2 py-0.5 rounded border border-border bg-muted/50 hover:bg-muted text-xs font-semibold text-foreground transition-colors"
                >
                  ↓ PNG
                </button>
              </div>
              <div className="h-64">
                <canvas ref={chartMesRef} />
              </div>
            </div>

            {/* Gráfico 2: Por categoría */}
            <div className="p-4 rounded-xl border border-border bg-card shadow-sm">
              <div className="flex items-center justify-between mb-3">
                <h3 className="font-bold text-xs uppercase tracking-wide text-foreground">Por categoría</h3>
                <button
                  onClick={() => downloadChartAsPng(chartCatRef.current, "por_categoria")}
                  className="px-2 py-0.5 rounded border border-border bg-muted/50 hover:bg-muted text-xs font-semibold text-foreground transition-colors"
                >
                  ↓ PNG
                </button>
              </div>
              <div className="h-64">
                <canvas ref={chartCatRef} />
              </div>
            </div>

            {/* Gráfico 3: Por motivo */}
            <div className="p-4 rounded-xl border border-border bg-card shadow-sm">
              <div className="flex items-center justify-between mb-3">
                <h3 className="font-bold text-xs uppercase tracking-wide text-foreground">Por motivo</h3>
                <button
                  onClick={() => downloadChartAsPng(chartMotRef.current, "por_motivo")}
                  className="px-2 py-0.5 rounded border border-border bg-muted/50 hover:bg-muted text-xs font-semibold text-foreground transition-colors"
                >
                  ↓ PNG
                </button>
              </div>
              <div className="h-64">
                <canvas ref={chartMotRef} />
              </div>
            </div>

            {/* Gráfico 4: Por sede */}
            <div className="p-4 rounded-xl border border-border bg-card shadow-sm">
              <div className="flex items-center justify-between mb-3">
                <h3 className="font-bold text-xs uppercase tracking-wide text-foreground">Por sede</h3>
                <button
                  onClick={() => downloadChartAsPng(chartSedeRef.current, "por_sede")}
                  className="px-2 py-0.5 rounded border border-border bg-muted/50 hover:bg-muted text-xs font-semibold text-foreground transition-colors"
                >
                  ↓ PNG
                </button>
              </div>
              <div className="h-64">
                <canvas ref={chartSedeRef} />
              </div>
            </div>
          </div>
        </div>
      )}



      {/* MODAL 1: AUDIT DETAIL MODAL (Al presionar Audit en Control de Calidad) */}
      {auditModalData.isOpen && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="w-full max-w-5xl bg-card border border-border rounded-2xl shadow-2xl flex flex-col max-h-[85vh] overflow-hidden">
            <div className="p-4 border-b border-border flex items-center justify-between">
              <div>
                <h3 className="text-sm font-bold text-foreground">{auditModalData.title}</h3>
                <p className="text-xs text-muted-foreground">
                  Registros filtrados según criterio de auditoría.
                </p>
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => {
                    const ws = XLSX.utils.json_to_sheet(
                      auditModalData.records.map((r) => ({
                        Boleta: r.boleta || "—",
                        Cliente: r.nombre || "—",
                        Ticket: r.ticket || "—",
                        Sede: r.sede || "—",
                        Fecha: r.fecha_creacion ? r.fecha_creacion.slice(0, 10) : "—",
                        DEV: r.dev || "PENDIENTE",
                        RegistradoPor: r.registrado_por || "—",
                      }))
                    );
                    const wb = XLSX.utils.book_new();
                    XLSX.utils.book_append_sheet(wb, ws, "Auditoria");
                    XLSX.writeFile(wb, `Auditoria_${auditModalData.type}.xlsx`);
                  }}
                  className="px-2.5 py-1 rounded border border-border hover:bg-muted text-xs font-semibold inline-flex items-center gap-1"
                >
                  <Download className="h-3 w-3" />
                  <span>Exportar</span>
                </button>
                <button
                  onClick={() => setAuditModalData((prev) => ({ ...prev, isOpen: false }))}
                  className="p-1 rounded hover:bg-muted text-muted-foreground"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
            </div>

            <div className="flex-1 overflow-auto p-4">
              <table className="w-full text-left text-xs border-collapse">
                <thead>
                  <tr className="bg-muted/40 border-b border-border text-muted-foreground uppercase text-[10px] font-bold">
                    <th className="p-2">Boleta / Ticket</th>
                    <th className="p-2">Cliente / Sede</th>
                    <th className="p-2">Tipo / Cat.</th>
                    <th className="p-2">Fecha Creación</th>
                    <th className="p-2">DEV</th>
                    <th className="p-2">Registrado Por</th>
                    <th className="p-2 text-right">Acción</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {auditModalData.records.slice(0, 100).map((r) => (
                    <tr key={r.id} className="hover:bg-muted/30">
                      <td className="p-2 font-mono font-bold">
                        <div>{r.boleta || "—"}</div>
                        {r.ticket && <div className="text-[10px] text-muted-foreground">#{r.ticket}</div>}
                      </td>
                      <td className="p-2">
                        <div className="font-semibold text-foreground">{r.nombre || "—"}</div>
                        <div className="text-[10px] text-muted-foreground">{r.sede || "—"}</div>
                      </td>
                      <td className="p-2">
                        <div className="text-[10px] font-medium">
                          {r.tipo === "salida_definitiva" ? "DEF" : "TEMP"}
                        </div>
                        <div className="text-[10px] text-muted-foreground">{r.categoria || "—"}</div>
                      </td>
                      <td className="p-2 text-muted-foreground">
                        {r.fecha_creacion ? r.fecha_creacion.slice(0, 10) : "—"}
                      </td>
                      <td className="p-2 font-mono">
                        {r.dev ? (
                          <span className="font-bold text-emerald-600">{r.dev}</span>
                        ) : (
                          <span className="text-red-500 font-bold text-[10px]">SIN DEV</span>
                        )}
                      </td>
                      <td className="p-2 text-muted-foreground">{r.registrado_por || "—"}</td>
                      <td className="p-2 text-right">
                        <button
                          onClick={() => {
                            setAuditModalData((prev) => ({ ...prev, isOpen: false }));
                            setEditingRecord(r);
                          }}
                          className="px-2 py-0.5 rounded bg-brand-500 text-white text-[10px] font-bold"
                        >
                          Editar
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* MODAL 2: COMPARAR EXCEL (Al presionar Comparar Excel en Registros RMA) */}
      {compareModalData.isOpen && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="w-full max-w-4xl bg-card border border-border rounded-2xl shadow-2xl flex flex-col max-h-[85vh] overflow-hidden">
            <div className="p-4 border-b border-border flex items-center justify-between">
              <div>
                <h3 className="text-sm font-bold text-foreground">Comparativa de Boletas Excel vs Sistema</h3>
                <p className="text-xs text-muted-foreground">
                  Resultados del contraste cruzado de consecutivos.
                </p>
              </div>
              <button
                onClick={() => setCompareModalData((prev) => ({ ...prev, isOpen: false }))}
                className="p-1 rounded hover:bg-muted text-muted-foreground"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="p-4 grid grid-cols-1 md:grid-cols-2 gap-4 flex-1 overflow-auto text-xs">
              {/* En Excel pero NO en el Sistema */}
              <div className="p-3 rounded-xl border border-rose-500/20 bg-rose-500/5 space-y-2">
                <div className="flex items-center justify-between">
                  <span className="font-bold text-rose-600 uppercase text-[11px]">
                    En Excel pero NO en el Sistema ({compareModalData.missingInSystem.length})
                  </span>
                </div>
                <div className="max-h-60 overflow-y-auto space-y-1">
                  {compareModalData.missingInSystem.length === 0 ? (
                    <p className="text-muted-foreground text-[11px]">Ninguno, todo coincide.</p>
                  ) : (
                    compareModalData.missingInSystem.map((b, idx) => (
                      <div key={idx} className="p-1.5 rounded bg-card border border-border font-mono text-[11px]">
                        {b.boleta}
                      </div>
                    ))
                  )}
                </div>
              </div>

              {/* En Sistema pero NO en el Excel */}
              <div className="p-3 rounded-xl border border-amber-500/20 bg-amber-500/5 space-y-2">
                <div className="flex items-center justify-between">
                  <span className="font-bold text-amber-600 uppercase text-[11px]">
                    En Sistema pero NO en el Excel ({compareModalData.missingInExcel.length})
                  </span>
                </div>
                <div className="max-h-60 overflow-y-auto space-y-1">
                  {compareModalData.missingInExcel.length === 0 ? (
                    <p className="text-muted-foreground text-[11px]">Ninguno, todo coincide.</p>
                  ) : (
                    compareModalData.missingInExcel.map((b, idx) => (
                      <div key={idx} className="p-1.5 rounded bg-card border border-border text-[11px]">
                        <span className="font-mono font-bold text-foreground">{b.boleta}</span>
                        {b.cliente && <span className="text-muted-foreground ml-2">({b.cliente})</span>}
                      </div>
                    ))
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* MODAL 3: PENDIENTES RMA (Al presionar Pendientes en RMA) */}
      {pendientesModalOpen && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="w-full max-w-4xl bg-card border border-border rounded-2xl shadow-2xl flex flex-col max-h-[85vh] overflow-hidden">
            <div className="p-4 border-b border-border flex items-center justify-between">
              <div>
                <h3 className="text-sm font-bold text-foreground">
                  Trámites RMA con Campos Incompletos ({rmaIncompletos.length})
                </h3>
                <p className="text-xs text-muted-foreground">
                  Trámites a los que les falta Ticket RMA, Fecha RMA, Serie Reemplazo o Estatus.
                </p>
              </div>
              <button
                onClick={() => setPendientesModalOpen(false)}
                className="p-1 rounded hover:bg-muted text-muted-foreground"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="flex-1 overflow-auto p-4">
              <table className="w-full text-left text-xs border-collapse">
                <thead>
                  <tr className="bg-muted/40 border-b border-border text-muted-foreground uppercase text-[10px] font-bold">
                    <th className="p-2">Boleta</th>
                    <th className="p-2">Cliente</th>
                    <th className="p-2">Marca</th>
                    <th className="p-2">Campos Faltantes</th>
                    <th className="p-2 text-right">Acción</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {rmaIncompletos.map((r) => {
                    const clean = (v: any) => (v ? v.toString().trim().replace(/^[\-\s—]+$/, "") : "");
                    const faltan: string[] = [];
                    if (!clean(r.ticket_rma)) faltan.push("Ticket RMA");
                    if (!clean(r.fecha_rma)) faltan.push("Fecha RMA");
                    if (!clean(r.serie_fabrica)) faltan.push("Serie Equipo Nuevo");
                    if (!clean(r.estatus)) faltan.push("Estatus");

                    return (
                      <tr key={r.id} className="hover:bg-muted/30">
                        <td className="p-2 font-mono font-bold text-foreground">{r.boleta || "—"}</td>
                        <td className="p-2 font-medium">{r.nombre || "—"}</td>
                        <td className="p-2">{r.marca || "—"}</td>
                        <td className="p-2">
                          <span className="text-rose-600 font-semibold">{faltan.join(", ")}</span>
                        </td>
                        <td className="p-2 text-right">
                          <button
                            onClick={() => {
                              setPendientesModalOpen(false);
                              setEditingRecord(r);
                            }}
                            className="px-2 py-0.5 rounded bg-brand-500 text-white text-[10px] font-bold"
                          >
                            Completar
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
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
