"use client";

import * as React from "react";
import { X, Copy, Check, Save } from "lucide-react";
import {
  GarantiaRecord,
  CAT_LABELS,
  MOT_LABELS,
  KPI_ESTATUS_LABELS,
  SEDES,
} from "./garantias-types";
import { toast } from "sonner";

interface GarantiasEditModalProps {
  record: GarantiaRecord | null;
  onClose: () => void;
  onSaved: (updated: GarantiaRecord) => void;
  canEditDev?: boolean;
}

interface HistorialEntry {
  id?: string;
  garantia_id?: string | number;
  fecha?: string;
  observaciones?: string;
  seguimiento?: string;
  modificado_por?: string;
}

function getStoredCustomEstatus(): Array<{ value: string; label: string }> {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem("custom_garantias_estatus");
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

function storeCustomEstatus(nombre: string) {
  if (!nombre || !nombre.trim()) return null;
  const cleanName = nombre.trim().toUpperCase();
  const slug = cleanName.toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "");
  const list = getStoredCustomEstatus();
  if (!list.find((x) => x.value === slug || x.label === cleanName)) {
    list.push({ value: slug, label: cleanName });
    try {
      localStorage.setItem("custom_garantias_estatus", JSON.stringify(list));
    } catch {}
  }
  return { value: slug, label: cleanName };
}

export function GarantiasEditModal({
  record,
  onClose,
  onSaved,
  canEditDev = true,
}: GarantiasEditModalProps) {
  const [form, setForm] = React.useState<Partial<GarantiaRecord>>({});
  const [saving, setSaving] = React.useState(false);
  const [copying, setCopying] = React.useState(false);
  const [customEstatuses, setCustomEstatuses] = React.useState<Array<{ value: string; label: string }>>([]);

  // Historial
  const [historialList, setHistorialList] = React.useState<HistorialEntry[]>([]);
  const [loadingHistorial, setLoadingHistorial] = React.useState(false);
  const [selectedHistorialId, setSelectedHistorialId] = React.useState<string>("");

  React.useEffect(() => {
    setCustomEstatuses(getStoredCustomEstatus());
  }, []);

  const handleAddCustomEstatus = () => {
    const nombre = prompt("Ingrese el nombre del nuevo estatus (ej. EN ESPERA DE REPUESTO):");
    if (!nombre || !nombre.trim()) return;
    const nuevo = storeCustomEstatus(nombre);
    if (nuevo) {
      setCustomEstatuses((prev) => {
        if (!prev.find((x) => x.value === nuevo.value)) return [...prev, nuevo];
        return prev;
      });
      setForm((prev) => ({ ...prev, estatus: nuevo.value }));
      toast.success(`Estatus "${nuevo.label}" agregado`);
    }
  };

  React.useEffect(() => {
    if (record) {
      setForm({ ...record });
      setLoadingHistorial(true);

      const resolveFallback = (): HistorialEntry[] => {
        let list: HistorialEntry[] = [];
        if (record.usuario_id) {
          try {
            const parsed = JSON.parse(record.usuario_id);
            if (Array.isArray(parsed) && parsed.length > 0) list = parsed;
          } catch (_) {}
        }
        if (
          list.length === 0 &&
          ((record.observaciones && String(record.observaciones).trim()) ||
            (record.seguimiento && String(record.seguimiento).trim()) ||
            record.fecha_modificacion)
        ) {
          list = [
            {
              id: `hist_init_${record.id}`,
              garantia_id: record.id,
              fecha: record.fecha_modificacion || record.fecha_creacion || new Date().toISOString(),
              modificado_por: record.modificado_por || record.registrado_por || "Técnico",
              observaciones: record.observaciones || "(Sin observaciones registradas)",
              seguimiento: record.seguimiento || "(Sin seguimiento registrado)",
            },
          ];
        }
        return list;
      };

      fetch(`/api/admin/garantias/${record.id}`)
        .then((r) => r.json())
        .then((d) => {
          const list: HistorialEntry[] = Array.isArray(d.historial) && d.historial.length > 0 ? d.historial : resolveFallback();
          setHistorialList(list);
          if (list.length > 0) {
            setSelectedHistorialId(list[0].id || "0");
          }
        })
        .catch(() => {
          const list = resolveFallback();
          setHistorialList(list);
          if (list.length > 0) {
            setSelectedHistorialId(list[0].id || "0");
          }
        })
        .finally(() => setLoadingHistorial(false));
    }
  }, [record]);

  if (!record) return null;

  const handleChange = (field: keyof GarantiaRecord, value: any) => {
    setForm((prev) => ({ ...prev, [field]: value }));
  };

  const isNC =
    (form.estatus || "").toLowerCase() === "nota_credito_marca" ||
    (form.estatus || "").toLowerCase().includes("nota_credito_marca");

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      // Formatear DEV si se ingresó sin prefijo
      let devVal = form.dev ? String(form.dev).trim() : null;
      if (devVal && !devVal.toUpperCase().startsWith("DEV-")) {
        devVal = `DEV-${devVal}`;
      }

      // Preparar payload sin campos eliminados
      const payload: Record<string, any> = {
        tipo: form.tipo,
        categoria: form.categoria,
        motivo: form.motivo,
        ticket: form.ticket,
        sede: form.sede,
        nombre: form.nombre,
        factura: form.factura,
        cantidad: form.cantidad,
        fecha_compra: form.fecha_compra ? form.fecha_compra.slice(0, 10) : null,
        marca: form.marca,
        serie: form.serie,
        numero_serie: form.numero_serie,
        descripcion: form.descripcion,
        falla: form.falla,
        dev: devVal,
        fecha_dev: form.fecha_dev ? form.fecha_dev.slice(0, 10) : null,
        ticket_rma: form.ticket_rma,
        fecha_rma: form.fecha_rma ? form.fecha_rma.slice(0, 10) : null,
        serie_fabrica: form.serie_fabrica,
        estatus: form.estatus,
        observaciones: form.observaciones,
        seguimiento: form.seguimiento,
        excluir_rma: Boolean(form.excluir_rma),
      };

      const res = await fetch(`/api/admin/garantias/${record.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Error al actualizar");

      toast.success("Registro actualizado exitosamente");
      onSaved(data.record || { ...record, ...payload });
      onClose();
    } catch (err: any) {
      toast.error("Error al guardar cambios", { description: err.message });
    } finally {
      setSaving(false);
    }
  };

  const handleCopyComprobante = async () => {
    setCopying(true);
    try {
      const tipoLabel =
        form.tipo === "salida_definitiva" ? "Salida Definitiva" : "Salida Temporal";
      const catLabel = form.categoria ? CAT_LABELS[form.categoria] || form.categoria : "—";
      const motLabel = form.motivo ? MOT_LABELS[form.motivo] || form.motivo : "—";

      const text =
        `*SEKUNET — COMPROBANTE DE GARANTÍA*\n\n` +
        `*Boleta:* ${form.boleta || record.boleta || "—"}\n` +
        `*Tipo:* ${tipoLabel}\n` +
        `*Categoría:* ${catLabel}\n` +
        `*Motivo:* ${motLabel}\n` +
        `*Ticket:* ${form.ticket || "—"}\n` +
        `*Sede:* ${form.sede || "—"}\n` +
        `*Cliente:* ${form.nombre || "—"}\n` +
        `*Factura:* ${form.factura || "—"}\n` +
        `*Cantidad:* ${form.cantidad || 1}\n` +
        `*Fecha de Compra:* ${form.fecha_compra ? form.fecha_compra.slice(0, 10) : "—"}\n` +
        `*Marca:* ${form.marca || "—"}\n` +
        `*Artículo:* ${form.serie || "—"}\n` +
        `*Serie:* ${form.numero_serie || "—"}\n` +
        `*Descripción:* ${form.descripcion || "—"}\n` +
        `*Falla:* ${form.falla || "—"}\n` +
        (form.dev ? `*Nota de Crédito:* ${form.dev}\n` : "") +
        (form.ticket_rma ? `*Ticket RMA / Factura Marca:* ${form.ticket_rma}\n` : "") +
        (form.estatus ? `*Estatus:* ${form.estatus}\n` : "") +
        `\n*Registrado por:* ${record.registrado_por || "Técnico"}`;

      await navigator.clipboard.writeText(text);
      toast.success("Comprobante copiado al portapapeles");
    } catch (e) {
      toast.error("No se pudo copiar el comprobante");
    } finally {
      setTimeout(() => setCopying(false), 1500);
    }
  };

  const selectedHistorial = historialList.find(
    (h, idx) => (h.id || String(idx)) === selectedHistorialId
  ) || historialList[0];

  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center p-3 sm:p-4 bg-black/60 backdrop-blur-sm overflow-y-auto">
      <div className="relative w-full max-w-3xl bg-card border border-border rounded-xl shadow-2xl overflow-hidden flex flex-col my-auto max-h-[92vh]">
        {/* Header estilo Garantías */}
        <div className="flex items-center justify-between px-5 py-3.5 border-b border-border bg-card">
          <div className="flex items-center gap-2.5">
            <span className="text-lg">📝</span>
            <div>
              <h2 className="text-base font-bold text-foreground">
                Editar · {form.boleta || record.boleta || "Registro"}
              </h2>
              {record.registrado_por && (
                <p className="text-[11px] text-muted-foreground">
                  Registrado por: <strong>{record.registrado_por}</strong>
                  {record.fecha_creacion
                    ? ` · ${new Date(record.fecha_creacion).toLocaleDateString("es-CR")}`
                    : ""}
                </p>
              )}
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1 rounded-md text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
            aria-label="Cerrar"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Cuerpo del formulario en 2 columnas continuas */}
        <div className="flex-1 overflow-y-auto p-5 space-y-4">
          <form id="editGarantiaForm" onSubmit={handleSave} className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5">
              {/* Fila 1 */}
              <div>
                <label className="block text-[11px] font-bold uppercase tracking-wider text-muted-foreground mb-1">
                  Número de Boleta
                </label>
                <input
                  type="text"
                  value={form.boleta || record.boleta || ""}
                  disabled
                  className="w-full px-3 py-2 text-sm bg-muted/50 border border-border rounded-md font-mono font-bold text-muted-foreground cursor-not-allowed"
                />
              </div>
              <div>
                <label className="block text-[11px] font-bold uppercase tracking-wider text-muted-foreground mb-1">
                  Tipo de Salida
                </label>
                <select
                  value={form.tipo || "salida_definitiva"}
                  onChange={(e) => handleChange("tipo", e.target.value)}
                  className="w-full px-3 py-2 text-sm bg-background border border-border rounded-md focus:outline-none focus:ring-1 focus:ring-brand-500"
                >
                  <option value="salida_definitiva">Salida Definitiva</option>
                  <option value="salida_temporal">Salida Temporal</option>
                </select>
              </div>

              {/* Fila 2 */}
              <div>
                <label className="block text-[11px] font-bold uppercase tracking-wider text-muted-foreground mb-1">
                  Categoría
                </label>
                <select
                  value={form.categoria || "nota_credito"}
                  onChange={(e) => handleChange("categoria", e.target.value)}
                  className="w-full px-3 py-2 text-sm bg-background border border-border rounded-md focus:outline-none focus:ring-1 focus:ring-brand-500"
                >
                  <option value="">Seleccionar</option>
                  {Object.entries(CAT_LABELS).map(([k, l]) => (
                    <option key={k} value={k}>
                      {l}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-[11px] font-bold uppercase tracking-wider text-muted-foreground mb-1">
                  Motivo
                </label>
                <select
                  value={form.motivo || "sin_existencias"}
                  onChange={(e) => handleChange("motivo", e.target.value)}
                  className="w-full px-3 py-2 text-sm bg-background border border-border rounded-md focus:outline-none focus:ring-1 focus:ring-brand-500"
                >
                  <option value="">Seleccionar</option>
                  {Object.entries(MOT_LABELS).map(([k, l]) => (
                    <option key={k} value={k}>
                      {l}
                    </option>
                  ))}
                </select>
              </div>

              {/* Fila 3 */}
              <div>
                <label className="block text-[11px] font-bold uppercase tracking-wider text-muted-foreground mb-1">
                  Ticket N°
                </label>
                <input
                  type="text"
                  value={form.ticket || ""}
                  onChange={(e) => handleChange("ticket", e.target.value)}
                  className="w-full px-3 py-2 text-sm bg-background border border-border rounded-md focus:outline-none focus:ring-1 focus:ring-brand-500"
                />
              </div>
              <div>
                <label className="block text-[11px] font-bold uppercase tracking-wider text-muted-foreground mb-1">
                  Sede
                </label>
                <select
                  value={form.sede || "San José"}
                  onChange={(e) => handleChange("sede", e.target.value)}
                  className="w-full px-3 py-2 text-sm bg-background border border-border rounded-md focus:outline-none focus:ring-1 focus:ring-brand-500"
                >
                  <option value="">Seleccionar</option>
                  {SEDES.map((s) => (
                    <option key={s} value={s}>
                      {s}
                    </option>
                  ))}
                </select>
              </div>

              {/* Fila 4 */}
              <div>
                <label className="block text-[11px] font-bold uppercase tracking-wider text-muted-foreground mb-1">
                  Nombre del Cliente
                </label>
                <input
                  type="text"
                  value={form.nombre || ""}
                  onChange={(e) => handleChange("nombre", e.target.value)}
                  className="w-full px-3 py-2 text-sm bg-background border border-border rounded-md focus:outline-none focus:ring-1 focus:ring-brand-500 font-medium"
                />
              </div>
              <div>
                <label className="block text-[11px] font-bold uppercase tracking-wider text-muted-foreground mb-1">
                  Factura N°
                </label>
                <input
                  type="text"
                  value={form.factura || ""}
                  onChange={(e) => handleChange("factura", e.target.value)}
                  className="w-full px-3 py-2 text-sm bg-background border border-border rounded-md focus:outline-none focus:ring-1 focus:ring-brand-500 font-mono"
                />
              </div>

              {/* Fila 5 */}
              <div>
                <label className="block text-[11px] font-bold uppercase tracking-wider text-muted-foreground mb-1">
                  Cantidad
                </label>
                <input
                  type="number"
                  min="1"
                  value={form.cantidad || 1}
                  onChange={(e) => handleChange("cantidad", parseInt(e.target.value) || 1)}
                  className="w-full px-3 py-2 text-sm bg-background border border-border rounded-md focus:outline-none focus:ring-1 focus:ring-brand-500"
                />
              </div>
              <div>
                <label className="block text-[11px] font-bold uppercase tracking-wider text-muted-foreground mb-1">
                  Fecha de Compra
                </label>
                <input
                  type="date"
                  value={form.fecha_compra ? form.fecha_compra.slice(0, 10) : ""}
                  onChange={(e) => handleChange("fecha_compra", e.target.value)}
                  className="w-full px-3 py-2 text-sm bg-background border border-border rounded-md focus:outline-none focus:ring-1 focus:ring-brand-500"
                />
              </div>

              {/* Fila 6 */}
              <div>
                <label className="block text-[11px] font-bold uppercase tracking-wider text-muted-foreground mb-1">
                  Marca
                </label>
                <input
                  type="text"
                  value={form.marca || ""}
                  onChange={(e) => handleChange("marca", e.target.value)}
                  className="w-full px-3 py-2 text-sm bg-background border border-border rounded-md focus:outline-none focus:ring-1 focus:ring-brand-500"
                />
              </div>
              <div>
                <label className="block text-[11px] font-bold uppercase tracking-wider text-muted-foreground mb-1">
                  Artículo
                </label>
                <input
                  type="text"
                  value={form.serie || ""}
                  onChange={(e) => handleChange("serie", e.target.value)}
                  className="w-full px-3 py-2 text-sm bg-background border border-border rounded-md focus:outline-none focus:ring-1 focus:ring-brand-500"
                />
              </div>

              {/* Fila 7 */}
              <div>
                <label className="block text-[11px] font-bold uppercase tracking-wider text-muted-foreground mb-1">
                  Serie
                </label>
                <input
                  type="text"
                  value={form.numero_serie || ""}
                  onChange={(e) => handleChange("numero_serie", e.target.value)}
                  className="w-full px-3 py-2 text-sm bg-background border border-border rounded-md focus:outline-none focus:ring-1 focus:ring-brand-500 font-mono"
                />
              </div>
              <div>
                <label className="block text-[11px] font-bold uppercase tracking-wider text-muted-foreground mb-1">
                  Nota de Crédito
                </label>
                <div className="flex items-center">
                  <span className="px-2.5 py-2 text-xs font-mono font-bold bg-muted border border-r-0 border-border rounded-l-md text-muted-foreground select-none">
                    DEV-
                  </span>
                  <input
                    type="text"
                    disabled={!canEditDev}
                    value={form.dev ? String(form.dev).replace(/^DEV-/i, "") : ""}
                    onChange={(e) => handleChange("dev", e.target.value)}
                    placeholder="123456"
                    className="w-full px-3 py-2 text-sm bg-background border border-border rounded-r-md focus:outline-none focus:ring-1 focus:ring-brand-500 font-mono font-bold disabled:opacity-50 disabled:cursor-not-allowed"
                  />
                </div>
              </div>

              {/* Fila 8: Fecha DEV */}
              <div className="md:col-span-2">
                <label className="block text-[11px] font-bold uppercase tracking-wider text-muted-foreground mb-1">
                  Fecha DEV / NC
                </label>
                <input
                  type="date"
                  disabled={!canEditDev}
                  value={form.fecha_dev ? form.fecha_dev.slice(0, 10) : ""}
                  onChange={(e) => handleChange("fecha_dev", e.target.value)}
                  className="w-full md:w-1/2 px-3 py-2 text-sm bg-background border border-border rounded-md focus:outline-none focus:ring-1 focus:ring-brand-500 disabled:opacity-50 disabled:cursor-not-allowed"
                />
              </div>

              {/* Fila 9: Descripción (ancho completo) */}
              <div className="md:col-span-2">
                <label className="block text-[11px] font-bold uppercase tracking-wider text-muted-foreground mb-1">
                  Descripción
                </label>
                <textarea
                  rows={2}
                  value={form.descripcion || ""}
                  onChange={(e) => handleChange("descripcion", e.target.value)}
                  className="w-full px-3 py-2 text-sm bg-background border border-border rounded-md focus:outline-none focus:ring-1 focus:ring-brand-500"
                />
              </div>

              {/* Fila 10: Falla (ancho completo) */}
              <div className="md:col-span-2">
                <label className="block text-[11px] font-bold uppercase tracking-wider text-muted-foreground mb-1">
                  Falla
                </label>
                <textarea
                  rows={2}
                  value={form.falla || ""}
                  onChange={(e) => handleChange("falla", e.target.value)}
                  className="w-full px-3 py-2 text-sm bg-background border border-border rounded-md focus:outline-none focus:ring-1 focus:ring-brand-500"
                />
              </div>
            </div>

            {/* SEPARADOR: RMA / Trámites con Marca */}
            <div className="pt-3 border-t border-border">
              <div className="text-xs font-bold uppercase tracking-wider text-muted-foreground mb-3">
                RMA / Trámites con Marca
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5">
                <div>
                  <label className="block text-[11px] font-bold uppercase tracking-wider text-muted-foreground mb-1">
                    {isNC ? "Factura Marca" : "Ticket RMA"}
                  </label>
                  <input
                    type="text"
                    value={form.ticket_rma || ""}
                    onChange={(e) => {
                      const val = e.target.value;
                      handleChange("ticket_rma", val);
                      if (val && !form.fecha_rma) {
                        handleChange("fecha_rma", new Date().toISOString().split("T")[0]);
                      }
                    }}
                    placeholder={isNC ? "Factura Marca" : "Ticket RMA"}
                    className="w-full px-3 py-2 text-sm bg-background border border-border rounded-md focus:outline-none focus:ring-1 focus:ring-brand-500 font-mono"
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-bold uppercase tracking-wider text-muted-foreground mb-1">
                    Fecha RMA *
                  </label>
                  <input
                    type="date"
                    value={form.fecha_rma ? form.fecha_rma.slice(0, 10) : ""}
                    onChange={(e) => handleChange("fecha_rma", e.target.value)}
                    className="w-full px-3 py-2 text-sm bg-background border border-border rounded-md focus:outline-none focus:ring-1 focus:ring-brand-500"
                  />
                </div>

                <div>
                  <label className="block text-[11px] font-bold uppercase tracking-wider text-muted-foreground mb-1">
                    Serie Equipo Nuevo
                  </label>
                  <input
                    type="text"
                    value={form.serie_fabrica || ""}
                    onChange={(e) => handleChange("serie_fabrica", e.target.value)}
                    className="w-full px-3 py-2 text-sm bg-background border border-border rounded-md focus:outline-none focus:ring-1 focus:ring-brand-500 font-mono"
                  />
                </div>
                <div>
                  <div className="flex items-center justify-between mb-1">
                    <label className="block text-[11px] font-bold uppercase tracking-wider text-muted-foreground">
                      Estatus
                    </label>
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
                    onChange={(e) => {
                      if (e.target.value === "__ADD_NEW__") {
                        handleAddCustomEstatus();
                      } else {
                        handleChange("estatus", e.target.value);
                      }
                    }}
                    className="w-full px-3 py-2 text-sm bg-background border border-border rounded-md focus:outline-none focus:ring-1 focus:ring-brand-500"
                  >
                    <option value="">Seleccionar</option>
                    {Object.entries(KPI_ESTATUS_LABELS).map(([k, l]) => (
                      <option key={k} value={k}>
                        {l}
                      </option>
                    ))}
                    {customEstatuses
                      .filter((c) => !KPI_ESTATUS_LABELS[c.value])
                      .map((c) => (
                        <option key={c.value} value={c.value}>
                          {c.label}
                        </option>
                      ))}
                    {form.estatus &&
                      !KPI_ESTATUS_LABELS[form.estatus] &&
                      !customEstatuses.find((c) => c.value === form.estatus) && (
                        <option value={form.estatus}>
                          {String(form.estatus).toUpperCase().replace(/_/g, " ")}
                        </option>
                      )}
                    <option value="__ADD_NEW__" className="text-brand-600 font-bold">
                      ➕ Agregar nuevo estatus...
                    </option>
                  </select>
                </div>

                <div>
                  <label className="block text-[11px] font-bold uppercase tracking-wider text-muted-foreground mb-1">
                    Observaciones
                  </label>
                  <textarea
                    rows={2}
                    value={form.observaciones || ""}
                    onChange={(e) => handleChange("observaciones", e.target.value)}
                    className="w-full px-3 py-2 text-sm bg-background border border-border rounded-md focus:outline-none focus:ring-1 focus:ring-brand-500"
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-bold uppercase tracking-wider text-muted-foreground mb-1">
                    Seguimiento
                  </label>
                  <textarea
                    rows={2}
                    value={form.seguimiento || ""}
                    onChange={(e) => handleChange("seguimiento", e.target.value)}
                    className="w-full px-3 py-2 text-sm bg-background border border-border rounded-md focus:outline-none focus:ring-1 focus:ring-brand-500"
                  />
                </div>

                <div className="md:col-span-2 pt-1">
                  <label className="inline-flex items-center gap-2 cursor-pointer text-sm font-semibold text-foreground">
                    <input
                      type="checkbox"
                      checked={Boolean(form.excluir_rma)}
                      onChange={(e) => handleChange("excluir_rma", e.target.checked)}
                      className="rounded border-border h-4 w-4 text-brand-600 focus:ring-brand-500"
                    />
                    <span>Excluir de Trámites con Marca (RMA)</span>
                  </label>
                </div>
              </div>
            </div>

            {/* SECCIÓN FINAL: Historial de Cambios */}
            <div className="pt-4 border-t-2 border-brand-500 space-y-3">
              <div className="text-sm font-bold text-brand-600 dark:text-brand-400">
                📚 Historial de Cambios
              </div>
              <div>
                <label className="block text-[11px] font-semibold text-muted-foreground mb-1">
                  Seleccionar fecha
                </label>
                <select
                  value={selectedHistorialId}
                  onChange={(e) => setSelectedHistorialId(e.target.value)}
                  className="w-full px-3 py-2 text-sm bg-background border border-border rounded-md focus:outline-none focus:ring-1 focus:ring-brand-500"
                >
                  {loadingHistorial ? (
                    <option value="">Cargando historial...</option>
                  ) : historialList.length === 0 ? (
                    <option value="">(Sin historial registrado)</option>
                  ) : (
                    historialList.map((h, idx) => {
                      const idVal = h.id || String(idx);
                      const fechaStr = h.fecha
                        ? new Date(h.fecha).toLocaleString("es-CR", {
                            day: "2-digit",
                            month: "2-digit",
                            year: "numeric",
                            hour: "2-digit",
                            minute: "2-digit",
                          })
                        : "Fecha desconocida";
                      const autorStr = h.modificado_por ? ` - ${h.modificado_por}` : "";
                      return (
                        <option key={idVal} value={idVal}>
                          {fechaStr}
                          {autorStr}
                        </option>
                      );
                    })
                  )}
                </select>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <div className="p-3 bg-muted/40 border border-border rounded-md">
                  <div className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground mb-1">
                    Observaciones (histórico)
                  </div>
                  <div className="text-xs text-foreground whitespace-pre-wrap min-h-[50px]">
                    {selectedHistorial?.observaciones ||
                      "Seleccione una fecha para ver el historial"}
                  </div>
                </div>
                <div className="p-3 bg-muted/40 border border-border rounded-md">
                  <div className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground mb-1">
                    Seguimiento (histórico)
                  </div>
                  <div className="text-xs text-foreground whitespace-pre-wrap min-h-[50px]">
                    {selectedHistorial?.seguimiento || "(Sin seguimiento registrado)"}
                  </div>
                </div>
              </div>
            </div>
          </form>
        </div>

        {/* Footer estilo Garantías: Cancelar, Copiar comprobante (azul), Guardar Cambios */}
        <div className="flex items-center justify-end gap-2 px-5 py-3 border-t border-border bg-card">
          <button
            type="button"
            onClick={onClose}
            className="px-3.5 py-2 text-xs font-semibold rounded-md border border-border hover:bg-muted text-foreground transition-colors"
          >
            Cancelar
          </button>
          <button
            type="button"
            onClick={handleCopyComprobante}
            disabled={copying}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold rounded-md bg-blue-600 hover:bg-blue-700 text-white shadow-sm transition-colors disabled:opacity-50"
          >
            {copying ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
            {copying ? "Copiado" : "Copiar comprobante"}
          </button>
          <button
            type="submit"
            form="editGarantiaForm"
            disabled={saving}
            className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-bold rounded-md bg-brand-600 hover:bg-brand-700 text-white shadow-sm transition-colors disabled:opacity-50"
          >
            <Save className="h-3.5 w-3.5" />
            {saving ? "Guardando..." : "Guardar Cambios"}
          </button>
        </div>
      </div>
    </div>
  );
}
