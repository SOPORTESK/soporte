"use client";
import * as React from "react";
import { X, Save, Clock, History, AlertCircle, CheckCircle2, ShieldAlert } from "lucide-react";
import { GarantiaRecord, CAT_LABELS, MOT_LABELS, KPI_ESTATUS_LABELS, SEDES } from "./garantias-types";
import { toast } from "sonner";

interface GarantiasEditModalProps {
  record: GarantiaRecord | null;
  onClose: () => void;
  onSaved: (updated: GarantiaRecord) => void;
  canEditDev?: boolean;
}

function getStoredCustomEstatus(): Array<{ value: string; label: string }> {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem("custom_garantias_estatus");
    return raw ? JSON.parse(raw) : [];
  } catch { return []; }
}

function storeCustomEstatus(nombre: string) {
  if (!nombre || !nombre.trim()) return null;
  const cleanName = nombre.trim().toUpperCase();
  const slug = cleanName.toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "");
  const list = getStoredCustomEstatus();
  if (!list.find(x => x.value === slug || x.label === cleanName)) {
    list.push({ value: slug, label: cleanName });
    try { localStorage.setItem("custom_garantias_estatus", JSON.stringify(list)); } catch {}
  }
  return { value: slug, label: cleanName };
}

export function GarantiasEditModal({ record, onClose, onSaved, canEditDev = true }: GarantiasEditModalProps) {
  const [form, setForm] = React.useState<Partial<GarantiaRecord>>({});
  const [saving, setSaving] = React.useState(false);
  const [nota, setNota] = React.useState("");
  const [historialList, setHistorialList] = React.useState<any[]>([]);
  const [loadingHistorial, setLoadingHistorial] = React.useState(false);
  const [activeTab, setActiveTab] = React.useState<"datos" | "historial">("datos");
  const [customEstatuses, setCustomEstatuses] = React.useState<Array<{ value: string; label: string }>>([]);

  React.useEffect(() => {
    setCustomEstatuses(getStoredCustomEstatus());
  }, []);

  const handleAddCustomEstatus = () => {
    const nombre = prompt("Ingrese el nombre del nuevo estatus (ej. EN ESPERA DE REPUESTO):");
    if (!nombre || !nombre.trim()) return;
    const nuevo = storeCustomEstatus(nombre);
    if (nuevo) {
      setCustomEstatuses(prev => {
        if (!prev.find(x => x.value === nuevo.value)) return [...prev, nuevo];
        return prev;
      });
      setForm(prev => ({ ...prev, estatus: nuevo.value }));
      toast.success(`Estatus "${nuevo.label}" agregado`);
    }
  };

  React.useEffect(() => {
    if (record) {
      setForm({ ...record });
      setNota("");
      setLoadingHistorial(true);
      fetch(`/api/admin/garantias/${record.id}`)
        .then(r => r.json())
        .then(d => {
          if (d.historial) setHistorialList(d.historial);
        })
        .catch(console.error)
        .finally(() => setLoadingHistorial(false));
    }
  }, [record]);

  if (!record) return null;

  const handleChange = (field: keyof GarantiaRecord, value: any) => {
    setForm(prev => ({ ...prev, [field]: value }));
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      // Formatear DEV si se ingresó sin prefijo
      let devVal = form.dev ? String(form.dev).trim() : null;
      if (devVal && !devVal.toUpperCase().startsWith("DEV-")) {
        devVal = `DEV-${devVal}`;
      }

      const payload = {
        ...form,
        dev: devVal,
        nota: nota.trim() || undefined,
      };

      const res = await fetch(`/api/admin/garantias/${record.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Error al actualizar");

      toast.success("Registro actualizado exitosamente");
      onSaved(data.record);
      onClose();
    } catch (err: any) {
      toast.error("Error al guardar cambios", { description: err.message });
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center p-4 bg-background/80 backdrop-blur-sm overflow-y-auto">
      <div className="relative w-full max-w-4xl bg-card border border-border rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-border bg-muted/30">
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 rounded-xl bg-brand-500/10 text-brand-600 dark:text-brand-400 flex items-center justify-center font-bold">
              {form.boleta ? form.boleta.slice(0, 3) : "BOL"}
            </div>
            <div>
              <h2 className="text-lg font-bold">Editar Registro — {form.boleta || `#${record.id}`}</h2>
              <p className="text-xs text-muted-foreground">
                Registrado por: <strong>{record.registrado_por || "Sistema"}</strong> · {record.fecha_creacion ? new Date(record.fecha_creacion).toLocaleDateString("es-CR") : ""}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <div className="inline-flex rounded-lg bg-muted p-1 text-xs">
              <button
                type="button"
                onClick={() => setActiveTab("datos")}
                className={`px-3 py-1 rounded-md font-medium transition-all ${activeTab === "datos" ? "bg-card shadow-sm text-foreground" : "text-muted-foreground hover:text-foreground"}`}
              >
                Campos
              </button>
              <button
                type="button"
                onClick={() => setActiveTab("historial")}
                className={`px-3 py-1 rounded-md font-medium transition-all flex items-center gap-1.5 ${activeTab === "historial" ? "bg-card shadow-sm text-foreground" : "text-muted-foreground hover:text-foreground"}`}
              >
                <History className="h-3.5 w-3.5" />
                Historial ({historialList.length})
              </button>
            </div>
            <button
              onClick={onClose}
              className="p-1.5 rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted transition-colors ml-2"
            >
              <X className="h-5 w-5" />
            </button>
          </div>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-6">
          {activeTab === "datos" ? (
            <form id="editGarantiaForm" onSubmit={handleSave} className="space-y-6">
              {/* Sección 1: Identificación de Salida */}
              <div>
                <h3 className="text-xs font-bold uppercase tracking-wider text-muted-foreground mb-3 flex items-center gap-2">
                  <span className="h-2 w-2 rounded-full bg-brand-500" />
                  Datos de Salida y Boleta
                </h3>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <div>
                    <label className="block text-xs font-semibold text-muted-foreground mb-1">Nº Boleta</label>
                    <input
                      type="text"
                      value={form.boleta || ""}
                      onChange={e => handleChange("boleta", e.target.value)}
                      className="w-full px-3 py-2 text-sm bg-background border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-500 font-mono font-bold"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-muted-foreground mb-1">Tipo de Salida</label>
                    <select
                      value={form.tipo || ""}
                      onChange={e => handleChange("tipo", e.target.value)}
                      className="w-full px-3 py-2 text-sm bg-background border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-500"
                    >
                      <option value="salida_definitiva">Salida Definitiva</option>
                      <option value="salida_temporal">Salida Temporal</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-muted-foreground mb-1">Categoría</label>
                    <select
                      value={form.categoria || ""}
                      onChange={e => handleChange("categoria", e.target.value)}
                      className="w-full px-3 py-2 text-sm bg-background border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-500"
                    >
                      <option value="">Seleccionar</option>
                      {Object.entries(CAT_LABELS).map(([k, l]) => (
                        <option key={k} value={k}>{l}</option>
                      ))}
                    </select>
                  </div>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-3">
                  <div>
                    <label className="block text-xs font-semibold text-muted-foreground mb-1">Factura de Salida</label>
                    <input
                      type="text"
                      value={form.factura_salida || ""}
                      onChange={e => handleChange("factura_salida", e.target.value)}
                      placeholder="N° Factura de salida/entrega"
                      className="w-full px-3 py-2 text-sm bg-background border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-500 font-mono"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-muted-foreground mb-1">Registrado por (Técnico)</label>
                    <input
                      type="text"
                      value={form.registrado_por || ""}
                      onChange={e => handleChange("registrado_por", e.target.value)}
                      placeholder="Nombre del técnico responsable"
                      className="w-full px-3 py-2 text-sm bg-background border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-500"
                    />
                  </div>
                </div>
              </div>

              {/* Sección 2: Cliente y Facturación */}
              <div>
                <h3 className="text-xs font-bold uppercase tracking-wider text-muted-foreground mb-3 flex items-center gap-2">
                  <span className="h-2 w-2 rounded-full bg-blue-500" />
                  Cliente y Documentos
                </h3>
                <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                  <div className="md:col-span-2">
                    <label className="block text-xs font-semibold text-muted-foreground mb-1">Nombre del Cliente</label>
                    <input
                      type="text"
                      value={form.nombre || ""}
                      onChange={e => handleChange("nombre", e.target.value)}
                      className="w-full px-3 py-2 text-sm bg-background border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-500 font-semibold"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-muted-foreground mb-1">Ticket Nº</label>
                    <input
                      type="text"
                      value={form.ticket || ""}
                      onChange={e => handleChange("ticket", e.target.value)}
                      className="w-full px-3 py-2 text-sm bg-background border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-500 font-mono"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-muted-foreground mb-1">Factura Nº</label>
                    <input
                      type="text"
                      value={form.factura || ""}
                      onChange={e => handleChange("factura", e.target.value)}
                      className="w-full px-3 py-2 text-sm bg-background border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-500 font-mono"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mt-3">
                  <div>
                    <label className="block text-xs font-semibold text-muted-foreground mb-1">Sede</label>
                    <select
                      value={form.sede || ""}
                      onChange={e => handleChange("sede", e.target.value)}
                      className="w-full px-3 py-2 text-sm bg-background border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-500"
                    >
                      <option value="">Seleccionar</option>
                      {SEDES.map(s => <option key={s} value={s}>{s}</option>)}
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-muted-foreground mb-1">Motivo</label>
                    <select
                      value={form.motivo || ""}
                      onChange={e => handleChange("motivo", e.target.value)}
                      className="w-full px-3 py-2 text-sm bg-background border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-500"
                    >
                      <option value="">Seleccionar</option>
                      {Object.entries(MOT_LABELS).map(([k, l]) => <option key={k} value={k}>{l}</option>)}
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-muted-foreground mb-1">Cantidad</label>
                    <input
                      type="number"
                      value={form.cantidad || 1}
                      onChange={e => handleChange("cantidad", parseInt(e.target.value) || 1)}
                      className="w-full px-3 py-2 text-sm bg-background border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-500"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-muted-foreground mb-1">Fecha de Compra</label>
                    <input
                      type="date"
                      value={form.fecha_compra ? form.fecha_compra.slice(0, 10) : ""}
                      onChange={e => handleChange("fecha_compra", e.target.value)}
                      className="w-full px-3 py-2 text-sm bg-background border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-500"
                    />
                  </div>
                </div>
              </div>

              {/* Sección 3: Equipo / Artículo */}
              <div>
                <h3 className="text-xs font-bold uppercase tracking-wider text-muted-foreground mb-3 flex items-center gap-2">
                  <span className="h-2 w-2 rounded-full bg-emerald-500" />
                  Equipo y Falla
                </h3>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <div>
                    <label className="block text-xs font-semibold text-muted-foreground mb-1">Marca</label>
                    <input
                      type="text"
                      value={form.marca || ""}
                      onChange={e => handleChange("marca", e.target.value)}
                      className="w-full px-3 py-2 text-sm bg-background border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-500"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-muted-foreground mb-1">Artículo / Modelo</label>
                    <input
                      type="text"
                      value={form.serie || ""}
                      onChange={e => handleChange("serie", e.target.value)}
                      className="w-full px-3 py-2 text-sm bg-background border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-500 font-mono"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-muted-foreground mb-1">Número de Serie</label>
                    <input
                      type="text"
                      value={form.numero_serie || ""}
                      onChange={e => handleChange("numero_serie", e.target.value)}
                      className="w-full px-3 py-2 text-sm bg-background border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-500 font-mono"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-3">
                  <div>
                    <label className="block text-xs font-semibold text-muted-foreground mb-1">Descripción del Artículo</label>
                    <textarea
                      rows={2}
                      value={form.descripcion || ""}
                      onChange={e => handleChange("descripcion", e.target.value)}
                      className="w-full px-3 py-2 text-sm bg-background border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-500"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-muted-foreground mb-1">Descripción de la Falla</label>
                    <textarea
                      rows={2}
                      value={form.falla || ""}
                      onChange={e => handleChange("falla", e.target.value)}
                      className="w-full px-3 py-2 text-sm bg-background border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-500"
                    />
                  </div>
                </div>

                <div className="mt-3">
                  <label className="block text-xs font-semibold text-muted-foreground mb-1">Artículos Adicionales / Accesorios Entregados</label>
                  <textarea
                    rows={2}
                    value={form.articulos_adicionales || ""}
                    onChange={e => handleChange("articulos_adicionales", e.target.value)}
                    placeholder="Cables, fuentes de alimentación, cajas, adaptadores..."
                    className="w-full px-3 py-2 text-sm bg-background border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-500"
                  />
                </div>
              </div>

              {/* Sección 4: RMA (Trámites con Marca) */}
              <div className="border border-border/80 rounded-xl p-4 bg-muted/20">
                <div className="flex items-center justify-between mb-3">
                  <h3 className="text-xs font-bold uppercase tracking-wider text-muted-foreground flex items-center gap-2">
                    <span className="h-2 w-2 rounded-full bg-amber-500" />
                    Trámite RMA con Marca
                  </h3>
                  <label className="inline-flex items-center gap-2 text-xs cursor-pointer select-none">
                    <input
                      type="checkbox"
                      checked={!!form.excluir_rma}
                      onChange={e => handleChange("excluir_rma", e.target.checked)}
                      className="rounded border-border"
                    />
                    <span className="text-muted-foreground">Excluir de panel RMA</span>
                  </label>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                  <div>
                    <label className="block text-xs font-semibold text-muted-foreground mb-1">
                      {((form.estatus || "").toLowerCase() === "nota_credito_marca" || (form.estatus || "").toLowerCase().includes("nota_credito_marca"))
                        ? "Factura Marca"
                        : "Ticket RMA"}
                    </label>
                    <input
                      type="text"
                      value={form.ticket_rma || ""}
                      onChange={e => handleChange("ticket_rma", e.target.value)}
                      placeholder={((form.estatus || "").toLowerCase() === "nota_credito_marca" || (form.estatus || "").toLowerCase().includes("nota_credito_marca"))
                        ? "Factura Marca"
                        : "Ticket del proveedor"}
                      className="w-full px-3 py-2 text-sm bg-background border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-500 font-mono"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-muted-foreground mb-1">Fecha RMA</label>
                    <input
                      type="date"
                      value={form.fecha_rma ? form.fecha_rma.slice(0, 10) : ""}
                      onChange={e => handleChange("fecha_rma", e.target.value)}
                      className="w-full px-3 py-2 text-sm bg-background border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-500"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-muted-foreground mb-1">Serie de Fábrica</label>
                    <input
                      type="text"
                      value={form.serie_fabrica || ""}
                      onChange={e => handleChange("serie_fabrica", e.target.value)}
                      placeholder="Serie equipo nuevo"
                      className="w-full px-3 py-2 text-sm bg-background border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-500 font-mono"
                    />
                  </div>
                  <div>
                    <div className="flex items-center justify-between mb-1">
                      <label className="block text-xs font-semibold text-muted-foreground">Estatus</label>
                      <button
                        type="button"
                        onClick={handleAddCustomEstatus}
                        className="text-[11px] font-bold text-brand-600 dark:text-brand-400 hover:underline"
                        title="Agregar un nuevo estatus"
                      >
                        + Agregar Estatus
                      </button>
                    </div>
                    <select
                      value={form.estatus || ""}
                      onChange={e => {
                        if (e.target.value === "__ADD_NEW__") {
                          handleAddCustomEstatus();
                        } else {
                          handleChange("estatus", e.target.value);
                        }
                      }}
                      className="w-full px-3 py-2 text-sm bg-background border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-500 font-medium"
                    >
                      <option value="">Pendiente Trámite</option>
                      {Object.entries(KPI_ESTATUS_LABELS).map(([k, l]) => <option key={k} value={k}>{l}</option>)}
                      {customEstatuses
                        .filter(c => !KPI_ESTATUS_LABELS[c.value])
                        .map(c => <option key={c.value} value={c.value}>{c.label}</option>)}
                      {form.estatus && !KPI_ESTATUS_LABELS[form.estatus] && !customEstatuses.find(c => c.value === form.estatus) && (
                        <option value={form.estatus}>{String(form.estatus).toUpperCase().replace(/_/g, " ")}</option>
                      )}
                      <option value="__ADD_NEW__" className="text-brand-600 font-bold">➕ Agregar nuevo estatus...</option>
                    </select>
                  </div>
                </div>
              </div>

              {/* Sección 5: Auditoría NC (DEV) */}
              <div className="border border-purple-500/20 rounded-xl p-4 bg-purple-500/5">
                <h3 className="text-xs font-bold uppercase tracking-wider text-purple-700 dark:text-purple-300 mb-3 flex items-center gap-2">
                  <span className="h-2 w-2 rounded-full bg-purple-500" />
                  Auditoría NC / Devolución (DEV)
                </h3>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-semibold text-muted-foreground mb-1">
                      Nº Nota de Crédito (DEV)
                    </label>
                    <div className="relative">
                      <input
                        type="text"
                        disabled={!canEditDev}
                        value={form.dev ? String(form.dev).replace(/^DEV-/i, "") : ""}
                        onChange={e => handleChange("dev", e.target.value)}
                        placeholder="ej: 12345 (se guardará como DEV-12345)"
                        className="w-full px-3 py-2 text-sm bg-background border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-purple-500 font-mono font-bold pl-12 disabled:opacity-50"
                      />
                      <span className="absolute left-3 top-1/2 -translate-y-1/2 text-xs font-bold text-purple-600 dark:text-purple-400 select-none">
                        DEV-
                      </span>
                    </div>
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-muted-foreground mb-1">Fecha DEV / NC</label>
                    <input
                      type="date"
                      disabled={!canEditDev}
                      value={form.fecha_dev ? form.fecha_dev.slice(0, 10) : ""}
                      onChange={e => handleChange("fecha_dev", e.target.value)}
                      className="w-full px-3 py-2 text-sm bg-background border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-purple-500 disabled:opacity-50"
                    />
                  </div>
                </div>
              </div>

              {/* Sección 6: Observaciones y Seguimiento */}
              <div className="border border-border/80 rounded-xl p-4 bg-muted/10 space-y-3">
                <h3 className="text-xs font-bold uppercase tracking-wider text-muted-foreground flex items-center gap-2">
                  <span className="h-2 w-2 rounded-full bg-blue-500" />
                  Observaciones y Seguimiento (Histórico)
                </h3>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-semibold text-muted-foreground mb-1">Observaciones</label>
                    <textarea
                      rows={2}
                      value={form.observaciones || ""}
                      onChange={e => handleChange("observaciones", e.target.value)}
                      placeholder="Notas u observaciones sobre el trámite..."
                      className="w-full px-3 py-2 text-sm bg-background border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-500"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-muted-foreground mb-1">Seguimiento</label>
                    <textarea
                      rows={2}
                      value={form.seguimiento || ""}
                      onChange={e => handleChange("seguimiento", e.target.value)}
                      placeholder="Bitácora de seguimiento..."
                      className="w-full px-3 py-2 text-sm bg-background border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-500"
                    />
                  </div>
                </div>
              </div>

              {/* Nota de modificación */}
              <div>
                <label className="block text-xs font-semibold text-muted-foreground mb-1">
                  Nota del cambio (para el historial de auditoría)
                </label>
                <input
                  type="text"
                  value={nota}
                  onChange={e => setNota(e.target.value)}
                  placeholder="ej: Se ingresó número de guía de marca o actualización de estatus..."
                  className="w-full px-3 py-2 text-sm bg-background border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-500"
                />
              </div>
            </form>
          ) : (
            /* Tab Historial */
            <div className="space-y-4">
              {loadingHistorial ? (
                <div className="p-8 text-center text-sm text-muted-foreground">Cargando historial...</div>
              ) : historialList.length === 0 ? (
                <div className="p-8 text-center text-sm text-muted-foreground">
                  No hay modificaciones registradas para esta garantía.
                </div>
              ) : (
                <div className="space-y-3">
                  {historialList.map((h, i) => (
                    <div key={h.id || i} className="p-3.5 rounded-xl border border-border bg-muted/30 space-y-2">
                      <div className="flex items-center justify-between text-xs">
                        <span className="font-bold text-foreground">
                          {h.modificado_por || h.usuario || "Técnico"}
                        </span>
                        <span className="text-muted-foreground text-[11px] font-mono">
                          {h.fecha ? new Date(h.fecha).toLocaleString("es-CR") : "Fecha desc."}
                        </span>
                      </div>
                      {(h.observaciones || h.nota) && (
                        <div className="bg-background/60 p-2.5 rounded-lg border border-border/60">
                          <div className="text-[10px] font-black uppercase tracking-wider text-muted-foreground mb-0.5">
                            Observaciones:
                          </div>
                          <p className="text-xs text-foreground font-medium whitespace-pre-wrap">
                            {h.observaciones || h.nota}
                          </p>
                        </div>
                      )}
                      {h.seguimiento && (
                        <div className="bg-background/60 p-2.5 rounded-lg border border-border/60">
                          <div className="text-[10px] font-black uppercase tracking-wider text-muted-foreground mb-0.5">
                            Seguimiento:
                          </div>
                          <p className="text-xs text-muted-foreground whitespace-pre-wrap">
                            {h.seguimiento}
                          </p>
                        </div>
                      )}
                      {h.cambios && Object.keys(h.cambios).length > 0 && (
                        <div className="text-[11px] font-mono text-muted-foreground bg-background/50 p-2 rounded border border-border/50 space-y-0.5">
                          {Object.entries(h.cambios).map(([k, c]: [string, any]) => (
                            <div key={k}>
                              <span className="font-semibold">{k}:</span> {String(c?.anterior ?? "vacío")} ➔ <span className="text-foreground font-semibold">{String(c?.nuevo ?? "vacío")}</span>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between px-6 py-4 border-t border-border bg-muted/20">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 text-sm font-medium rounded-lg border border-border hover:bg-muted transition-colors"
          >
            Cancelar
          </button>
          {activeTab === "datos" && (
            <button
              type="submit"
              form="editGarantiaForm"
              disabled={saving}
              className="flex items-center gap-2 px-5 py-2 text-sm font-semibold rounded-lg bg-brand-600 hover:bg-brand-700 text-white shadow-sm disabled:opacity-50 transition-colors"
            >
              <Save className="h-4 w-4" />
              {saving ? "Guardando..." : "Guardar Cambios"}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
