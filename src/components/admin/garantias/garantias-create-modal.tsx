"use client";

import * as React from "react";
import {
  X,
  Plus,
  Save,
  Printer,
  Mail,
  MessageCircle,
  Copy,
  Check,
  CheckCircle2,
  AlertCircle,
  Search,
  Sparkles,
  Lock,
  Layers,
  Building2,
  User,
  Package,
  FileText,
  RotateCcw,
  ExternalLink,
} from "lucide-react";
import {
  GarantiaRecord,
  CAT_LABELS,
  MOT_LABELS,
  SEDES,
} from "./garantias-types";
import { toast } from "sonner";

interface GarantiasCreateModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSaved: (record: GarantiaRecord) => void;
  defaultAgentName?: string;
}

type StepType = 1 | 2 | 3;

interface InventoryItem {
  id: string;
  articulo: string;
  marca?: string | null;
  descripcion?: string | null;
  bodega?: string | null;
  disponible?: string | number | null;
}

export function GarantiasCreateModal({
  isOpen,
  onClose,
  onSaved,
  defaultAgentName = "César Andrés Batista",
}: GarantiasCreateModalProps) {
  // Estado del formulario
  const [tipo, setTipo] = React.useState<"salida_definitiva" | "salida_temporal">("salida_definitiva");
  const [categoria, setCategoria] = React.useState<string>("nota_credito");
  const [motivo, setMotivo] = React.useState<string>("sin_existencias");
  const [ticket, setTicket] = React.useState<string>("");
  const [sede, setSede] = React.useState<string>("San José");
  const [factura, setFactura] = React.useState<string>("");
  const [nombre, setNombre] = React.useState<string>("");
  const [cantidad, setCantidad] = React.useState<number>(1);
  const [fechaCompra, setFechaCompra] = React.useState<string>(
    new Date().toISOString().split("T")[0]
  );
  const [articulo, setArticulo] = React.useState<string>("");
  const [marca, setMarca] = React.useState<string>("");
  const [numeroSerie, setNumeroSerie] = React.useState<string>("");
  const [boletaFisica, setBoletaFisica] = React.useState<string>("");
  const [descripcion, setDescripcion] = React.useState<string>("");
  const [falla, setFalla] = React.useState<string>("");
  const [facturaSalida, setFacturaSalida] = React.useState<string>("");
  const [articulosAdicionales, setArticulosAdicionales] = React.useState<string>("");
  const [observaciones, setObservaciones] = React.useState<string>("");
  const [seguimiento, setSeguimiento] = React.useState<string>("");
  const [excluirRma, setExcluirRma] = React.useState<boolean>(false);

  // Estado de sincronización de consecutivo
  const [boletaPreview, setBoletaPreview] = React.useState<string>("—");
  const [nextConsecutive, setNextConsecutive] = React.useState<number | null>(null);
  const [loadingConsecutive, setLoadingConsecutive] = React.useState(false);

  // Inventario y autocompletado
  const [inventoryResults, setInventoryResults] = React.useState<InventoryItem[]>([]);
  const [searchingInventory, setSearchingInventory] = React.useState(false);
  const [showDropdown, setShowDropdown] = React.useState(false);
  const [matchedInventoryItem, setMatchedInventoryItem] = React.useState<InventoryItem | null>(null);

  // Estados de proceso y guardado
  const [saving, setSaving] = React.useState(false);
  const [savedRecord, setSavedRecord] = React.useState<GarantiaRecord | null>(null);
  const [copiedText, setCopiedText] = React.useState(false);
  const [copiedMail, setCopiedMail] = React.useState(false);

  // Paso actual (1: Clasificación, 2: Cliente, 3: Producto)
  const [currentStep, setCurrentStep] = React.useState<StepType>(1);

  // 1. Sincronizar consecutivo en tiempo real al cambiar tipo o categoria
  const refreshConsecutive = React.useCallback(async () => {
    try {
      setLoadingConsecutive(true);
      const res = await fetch(
        `/api/admin/garantias/next-consecutive?tipo=${encodeURIComponent(tipo)}&categoria=${encodeURIComponent(categoria)}`
      );
      if (res.ok) {
        const data = await res.json();
        if (data.boletaPreview) setBoletaPreview(data.boletaPreview);
        if (data.nextConsecutive) setNextConsecutive(data.nextConsecutive);
      }
    } catch (e) {
      console.error("Error al refrescar consecutivo:", e);
    } finally {
      setLoadingConsecutive(false);
    }
  }, [tipo, categoria]);

  React.useEffect(() => {
    if (isOpen) {
      refreshConsecutive();
      const interval = setInterval(refreshConsecutive, 15000); // Polling de seguridad
      return () => clearInterval(interval);
    }
  }, [isOpen, refreshConsecutive]);

  // 2. Búsqueda en inventario con debounce
  React.useEffect(() => {
    if (!articulo || articulo.trim().length < 2) {
      setInventoryResults([]);
      setShowDropdown(false);
      return;
    }

    // Si ya seleccionamos un ítem y coincide exactamente, no volver a abrir
    if (matchedInventoryItem && matchedInventoryItem.articulo === articulo) {
      return;
    }

    const timer = setTimeout(async () => {
      try {
        setSearchingInventory(true);
        const res = await fetch(`/api/admin/garantias/inventario?q=${encodeURIComponent(articulo)}`);
        if (res.ok) {
          const data = await res.json();
          setInventoryResults(data.items || []);
          setShowDropdown((data.items || []).length > 0);
        }
      } catch (e) {
        console.error("Error buscando inventario:", e);
      } finally {
        setSearchingInventory(false);
      }
    }, 280);

    return () => clearTimeout(timer);
  }, [articulo, matchedInventoryItem]);

  const selectInventoryItem = (item: InventoryItem) => {
    setMatchedInventoryItem(item);
    setArticulo(item.articulo);
    if (item.marca) setMarca(item.marca);
    if (item.descripcion) setDescripcion(item.descripcion);
    setShowDropdown(false);
    toast.success(`Artículo vinculado: ${item.marca || ""} - ${item.articulo}`);
  };

  const clearInventoryMatch = () => {
    setMatchedInventoryItem(null);
    setMarca("");
    setDescripcion("");
  };

  // Validación de pasos
  const isStep1Valid = Boolean(tipo && categoria && motivo);
  const isStep2Valid = Boolean(ticket.trim() && sede && factura.trim() && nombre.trim());
  const isStep3Valid = Boolean(cantidad > 0 && fechaCompra && falla.trim());
  const isFormValid = isStep1Valid && isStep2Valid && isStep3Valid;

  // Limpiar formulario completo
  const handleReset = () => {
    setTipo("salida_definitiva");
    setCategoria("nota_credito");
    setMotivo("sin_existencias");
    setTicket("");
    setSede("San José");
    setFactura("");
    setNombre("");
    setCantidad(1);
    setFechaCompra(new Date().toISOString().split("T")[0]);
    setArticulo("");
    setMarca("");
    setNumeroSerie("");
    setBoletaFisica("");
    setDescripcion("");
    setFalla("");
    setFacturaSalida("");
    setArticulosAdicionales("");
    setObservaciones("");
    setSeguimiento("");
    setExcluirRma(false);
    setMatchedInventoryItem(null);
    setSavedRecord(null);
    setCurrentStep(1);
  };

  // Guardar registro
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!isFormValid) {
      toast.error("Por favor complete todos los campos obligatorios marcados");
      return;
    }

    setSaving(true);
    try {
      const payload = {
        tipo,
        categoria,
        motivo,
        ticket: ticket.trim(),
        sede,
        factura: factura.trim(),
        nombre: nombre.trim(),
        cantidad: Number(cantidad) || 1,
        fecha_compra: fechaCompra || null,
        marca: marca.trim() || null,
        serie: articulo.trim() || null,
        numero_serie: numeroSerie.trim() || null,
        boleta_fisica: boletaFisica.trim() || null,
        descripcion: descripcion.trim() || null,
        falla: falla.trim(),
        factura_salida: facturaSalida.trim() || null,
        articulos_adicionales: articulosAdicionales.trim() || null,
        observaciones: observaciones.trim() || null,
        seguimiento: seguimiento.trim() || null,
        excluir_rma: Boolean(excluirRma),
        registrado_por: defaultAgentName,
      };

      const res = await fetch("/api/admin/garantias", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      const data = await res.json();
      if (!res.ok || !data.ok) {
        throw new Error(data.error || "No se pudo registrar la salida");
      }

      const rec: GarantiaRecord = data.record;
      setSavedRecord(rec);
      toast.success(`Boleta ${rec.boleta} guardada exitosamente`);
      onSaved(rec);
      refreshConsecutive();
    } catch (err: any) {
      console.error("Error al registrar garantia:", err);
      toast.error(err.message || "Error al guardar el registro");
    } finally {
      setSaving(false);
    }
  };

  // 3. Funciones de Envío y Compartir
  const handlePrint = () => {
    if (!savedRecord) return;
    const r = savedRecord;
    const boletaStr = r.boleta || "—";
    const fechaActual = new Date().toLocaleDateString("es-CR", {
      day: "2-digit",
      month: "long",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
    const fechaComp = r.fecha_compra
      ? new Date(r.fecha_compra + "T12:00:00").toLocaleDateString("es-CR", {
          day: "2-digit",
          month: "2-digit",
          year: "numeric",
        })
      : "—";

    const printHtml = `<!DOCTYPE html><html lang="es"><head><meta charset="UTF-8"><title>Garantía ${boletaStr}</title>
<link href="https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;500;600;700;800&display=swap" rel="stylesheet">
<style>
*{box-sizing:border-box;margin:0;padding:0}
body{font-family:'Plus Jakarta Sans',sans-serif;font-size:11px;color:#1A1108;background:#fff;padding:28px 32px;min-width:680px}
.pf-header{display:flex;align-items:center;justify-content:space-between;border-bottom:2px solid #D1411E;padding-bottom:12px;margin-bottom:16px}
.pf-main-title{font-size:18px;font-weight:800;color:#D1411E;line-height:1}
.pf-boleta{font-size:13px;font-weight:800;color:#1A1108;margin-top:4px}
.pf-date{font-size:10px;color:#7A6E62;margin-top:2px}
.pf-section{margin-bottom:12px}
.pf-section-title{font-size:9px;font-weight:800;letter-spacing:.1em;text-transform:uppercase;color:#D1411E;border-bottom:1px solid #F2F0EC;padding-bottom:3px;margin-bottom:7px}
.pf-grid{display:grid;grid-template-columns:repeat(3,1fr);gap:8px}
.pf-grid-2{display:grid;grid-template-columns:1fr 1fr;gap:8px}
.pf-field{display:flex;flex-direction:column;gap:2px}
.pf-full{grid-column:1/-1}
.pf-label{font-size:7.5px;font-weight:700;letter-spacing:.08em;text-transform:uppercase;color:#A89E92}
.pf-value{font-size:11px;font-weight:600;color:#1A1108;border-bottom:1px solid #E8E5E0;padding-bottom:3px;min-height:16px}
.pf-text-area{min-height:36px;white-space:pre-wrap;line-height:1.4}
.pf-footer{margin-top:24px;border-top:1px solid #E8E5E0;padding-top:12px;display:grid;grid-template-columns:1fr 1fr;gap:30px}
.pf-sig-line{border-bottom:1px solid #1A1108;margin-top:35px}
.pf-sig-label{font-size:8px;color:#A89E92;margin-top:4px;text-align:center}
.no-print{text-align:center;padding:12px;margin-bottom:12px;background:#f8fafc;border-radius:8px}
.btn-print{font-family:inherit;background:#D1411E;color:#fff;border:none;padding:8px 20px;border-radius:6px;font-size:12px;font-weight:700;cursor:pointer;margin-right:8px}
.btn-close{font-family:inherit;background:#e2e8f0;color:#334155;border:none;padding:8px 16px;border-radius:6px;font-size:12px;font-weight:600;cursor:pointer}
@media print{.no-print{display:none}@page{size:A4;margin:1cm}}
</style></head>
<body>
<div class="no-print"><button class="btn-print" onclick="window.print()">Imprimir / Guardar PDF</button><button class="btn-close" onclick="window.close()">Cerrar</button></div>
<div class="pf-header">
  <div>
    <div class="pf-main-title">Garantías · Sekunet</div>
    <div style="font-size:10px;color:#7A6E62;margin-top:3px;">Comprobante Oficial de Salida</div>
  </div>
  <div style="text-align:right">
    <div class="pf-boleta">Boleta ${boletaStr}</div>
    <div class="pf-date">${fechaActual}</div>
    <div style="font-size:9px;color:#7A6E62;">Registrado por: ${r.registrado_por || defaultAgentName}</div>
  </div>
</div>
<div class="pf-section">
  <div class="pf-section-title">Clasificación</div>
  <div class="pf-grid">
    <div class="pf-field"><div class="pf-label">Tipo de Salida</div><div class="pf-value">${r.tipo === "salida_definitiva" ? "Salida Definitiva" : "Salida Temporal"}</div></div>
    <div class="pf-field"><div class="pf-label">Categoría</div><div class="pf-value">${CAT_LABELS[r.categoria || ""] || r.categoria || "—"}</div></div>
    <div class="pf-field"><div class="pf-label">Motivo</div><div class="pf-value">${MOT_LABELS[r.motivo || ""] || r.motivo || "—"}</div></div>
  </div>
</div>
<div class="pf-section">
  <div class="pf-section-title">Información del Cliente</div>
  <div class="pf-grid">
    <div class="pf-field"><div class="pf-label">Ticket Nº</div><div class="pf-value">${r.ticket || "—"}</div></div>
    <div class="pf-field"><div class="pf-label">Sede</div><div class="pf-value">${r.sede || "—"}</div></div>
    <div class="pf-field"><div class="pf-label">Factura Nº</div><div class="pf-value">${r.factura || "—"}</div></div>
  </div>
  <div class="pf-field pf-full" style="margin-top:8px;">
    <div class="pf-label">Nombre del Cliente</div><div class="pf-value">${r.nombre || "—"}</div>
  </div>
</div>
<div class="pf-section">
  <div class="pf-section-title">Información del Producto</div>
  <div class="pf-grid">
    <div class="pf-field"><div class="pf-label">Marca</div><div class="pf-value">${r.marca || "—"}</div></div>
    <div class="pf-field"><div class="pf-label">Artículo / Modelo</div><div class="pf-value">${r.serie || "—"}</div></div>
    <div class="pf-field"><div class="pf-label">Número de Serie</div><div class="pf-value">${r.numero_serie || "—"}</div></div>
    <div class="pf-field"><div class="pf-label">Cantidad</div><div class="pf-value">${r.cantidad || 1}</div></div>
    <div class="pf-field"><div class="pf-label">Fecha de Compra</div><div class="pf-value">${fechaComp}</div></div>
  </div>
</div>
<div class="pf-section">
  <div class="pf-section-title">Detalle de Operación</div>
  <div class="pf-grid-2">
    <div class="pf-field pf-full"><div class="pf-label">Descripción del Artículo</div><div class="pf-value pf-text-area">${r.descripcion || "—"}</div></div>
    <div class="pf-field pf-full"><div class="pf-label">Descripción de la Falla</div><div class="pf-value pf-text-area">${r.falla || "—"}</div></div>
  </div>
</div>
<div class="pf-footer">
  <div><div class="pf-sig-line"></div><div class="pf-sig-label">Firma Técnico Responsable</div></div>
  <div><div class="pf-sig-line"></div><div class="pf-sig-label">Firma Cliente / Recibido Conforme</div></div>
</div>
</body></html>`;

    const win = window.open("", "_blank");
    if (!win) {
      toast.error("Por favor permita las ventanas emergentes en su navegador para imprimir");
      return;
    }
    win.document.write(printHtml);
    win.document.close();
  };

  const handleSendEmail = async () => {
    if (!savedRecord) return;
    const r = savedRecord;
    const boletaStr = r.boleta || "—";
    const tipoLabel = r.tipo === "salida_definitiva" ? "Salida Definitiva" : "Salida Temporal";
    const catLabel = CAT_LABELS[r.categoria || ""] || r.categoria || "";
    const ticketStr = r.ticket ? `Ticket #${r.ticket}` : "";

    const subject = encodeURIComponent(`${tipoLabel} · ${catLabel} · ${ticketStr} · Boleta ${boletaStr}`);
    const body = encodeURIComponent(
      `Saludos.\n\nSe solicita la gestión de ${tipoLabel} (${catLabel}) para el dispositivo correspondiente al Ticket ${r.ticket}.\n\nBoleta: ${boletaStr}\nCliente: ${r.nombre}\nFactura: ${r.factura}\nEquipo: ${r.marca || ""} ${r.serie || ""}\nSerie: ${r.numero_serie || "N/A"}\nFalla: ${r.falla || ""}\n\nAtentamente,\n${defaultAgentName}`
    );

    // Copiar al portapapeles resumen formatted
    try {
      await navigator.clipboard.writeText(
        `BOLETA DE GARANTÍA: ${boletaStr}\nCliente: ${r.nombre}\nTicket: ${r.ticket}\nFactura: ${r.factura}\nTipo: ${tipoLabel}\nCategoría: ${catLabel}\nArtículo: ${r.marca || ""} ${r.serie || ""}\nSerie: ${r.numero_serie || "N/A"}\nFalla: ${r.falla}\nRegistrado por: ${defaultAgentName}`
      );
      setCopiedMail(true);
      setTimeout(() => setCopiedMail(false), 2500);
      toast.success("Detalle copiado al portapapeles. Abriendo cliente de correo...");
    } catch {}

    window.open(`mailto:?subject=${subject}&body=${body}`, "_self");
  };

  const handleWhatsApp = () => {
    if (!savedRecord) return;
    const r = savedRecord;
    const boletaStr = r.boleta || "—";
    const tipoLabel = r.tipo === "salida_definitiva" ? "Salida Definitiva" : "Salida Temporal";

    const text = encodeURIComponent(
      `*SEKUNET · COMPROBANTE DE GARANTÍA*\n\n` +
      `📋 *Boleta:* ${boletaStr}\n` +
      `👤 *Cliente:* ${r.nombre}\n` +
      `🎫 *Ticket:* ${r.ticket}\n` +
      `🧾 *Factura:* ${r.factura}\n` +
      `📍 *Sede:* ${r.sede}\n` +
      `⚙️ *Tipo:* ${tipoLabel} (${CAT_LABELS[r.categoria || ""] || r.categoria})\n` +
      `💻 *Equipo:* ${r.marca || ""} ${r.serie || ""}\n` +
      `🔢 *Serie:* ${r.numero_serie || "N/A"}\n` +
      `⚠️ *Falla:* ${r.falla}\n` +
      `👨‍💻 *Registrado por:* ${defaultAgentName}\n\n` +
      `_Trámite ingresado al sistema central de garantías._`
    );

    window.open(`https://api.whatsapp.com/send?text=${text}`, "_blank");
  };

  const handleCopySummary = async () => {
    if (!savedRecord) return;
    const r = savedRecord;
    const summary = `SEKUNET GARANTÍAS - BOLETA: ${r.boleta}\nCliente: ${r.nombre}\nTicket: ${r.ticket} | Factura: ${r.factura} | Sede: ${r.sede}\nTipo: ${r.tipo === "salida_definitiva" ? "Salida Definitiva" : "Salida Temporal"} (${CAT_LABELS[r.categoria || ""] || r.categoria})\nArtículo: ${r.marca || ""} ${r.serie || ""}\nSerie: ${r.numero_serie || "N/A"}\nFalla: ${r.falla}\nRegistrado por: ${defaultAgentName}`;
    try {
      await navigator.clipboard.writeText(summary);
      setCopiedText(true);
      setTimeout(() => setCopiedText(false), 2000);
      toast.success("Comprobante copiado al portapapeles");
    } catch {
      toast.error("No se pudo copiar al portapapeles");
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[75] flex items-center justify-center p-3 sm:p-5 bg-background/80 backdrop-blur-md animate-in fade-in duration-200">
      <div className="relative w-full max-w-4xl max-h-[92vh] flex flex-col bg-card border border-border shadow-2xl rounded-2xl overflow-hidden text-card-foreground">
        
        {/* HEADER MODAL */}
        <div className="px-6 py-4 border-b border-border/80 bg-muted/30 flex items-center justify-between shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-primary/10 border border-primary/20 text-primary flex items-center justify-center shadow-inner">
              <Plus className="w-5 h-5 stroke-[2.5]" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-base font-bold tracking-tight text-foreground">
                  Nuevo Registro de Garantía
                </h2>
                <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-semibold bg-primary/15 text-primary border border-primary/25">
                  <User className="w-3 h-3" />
                  {defaultAgentName}
                </span>
              </div>
              <p className="text-xs text-muted-foreground mt-0.5">
                Ingreso oficial sincronizado directamente con la base de datos central de Garantías
              </p>
            </div>
          </div>

          {/* CHIP DE BOLETA EN VIVO Y CERRAR */}
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-2 px-3 py-1.5 rounded-xl bg-background border border-border/80 shadow-sm">
              <div className="flex flex-col items-end">
                <span className="text-[9px] font-black uppercase tracking-wider text-muted-foreground">
                  Próxima Boleta
                </span>
                <span className="text-sm font-black text-primary font-mono tracking-tight flex items-center gap-1.5">
                  <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" title="Sincronizado en tiempo real" />
                  {loadingConsecutive ? "..." : boletaPreview}
                </span>
              </div>
            </div>

            <button
              onClick={onClose}
              className="p-2 rounded-xl text-muted-foreground hover:text-foreground hover:bg-muted/80 transition-colors"
              title="Cerrar ventana"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* CONTENIDO DEL MODAL */}
        <div className="flex-1 overflow-y-auto p-6 space-y-6">
          
          {/* SI EL REGISTRO YA FUE GUARDADO, MOSTRAR PANEL DE COMPROBANTE Y ENVÍO */}
          {savedRecord ? (
            <div className="space-y-6 animate-in fade-in zoom-in-95 duration-200">
              <div className="p-5 rounded-2xl bg-emerald-500/10 border border-emerald-500/30 flex items-center justify-between">
                <div className="flex items-center gap-3.5">
                  <div className="w-12 h-12 rounded-xl bg-emerald-500/20 text-emerald-400 grid place-items-center">
                    <CheckCircle2 className="w-6 h-6" />
                  </div>
                  <div>
                    <h3 className="text-base font-bold text-foreground">
                      ¡Registro guardado con éxito!
                    </h3>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      Boleta asignada: <strong className="text-emerald-400 font-mono text-sm">{savedRecord.boleta}</strong> · Consecutivo #{savedRecord.numero_consecutivo}
                    </p>
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  <button
                    onClick={handleCopySummary}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-background border border-border text-xs font-semibold hover:bg-muted transition-all"
                  >
                    {copiedText ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5 text-muted-foreground" />}
                    <span>{copiedText ? "Copiado" : "Copiar"}</span>
                  </button>
                </div>
              </div>

              {/* OPCIONES DE ENVÍO Y COMPROBANTE */}
              <div>
                <h4 className="text-xs font-black uppercase tracking-wider text-muted-foreground mb-3">
                  Funciones de Envío y Comprobante Oficial
                </h4>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3.5">
                  {/* IMPRIMIR / PDF */}
                  <button
                    onClick={handlePrint}
                    className="p-4 rounded-2xl bg-card border border-border/80 hover:border-primary/50 hover:bg-primary/5 transition-all text-left flex flex-col justify-between gap-3 shadow-sm group"
                  >
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-bold text-foreground">Guardar / Imprimir PDF</span>
                      <div className="w-8 h-8 rounded-lg bg-orange-500/15 text-orange-400 grid place-items-center group-hover:scale-110 transition-transform">
                        <Printer className="w-4 h-4" />
                      </div>
                    </div>
                    <p className="text-[11px] text-muted-foreground">
                      Abre el comprobante oficial maquetado listo para imprimir o guardar como PDF.
                    </p>
                  </button>

                  {/* ENVIAR POR CORREO */}
                  <button
                    onClick={handleSendEmail}
                    className="p-4 rounded-2xl bg-card border border-border/80 hover:border-primary/50 hover:bg-primary/5 transition-all text-left flex flex-col justify-between gap-3 shadow-sm group"
                  >
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-bold text-foreground">Enviar por Correo</span>
                      <div className="w-8 h-8 rounded-lg bg-red-500/15 text-red-400 grid place-items-center group-hover:scale-110 transition-transform">
                        <Mail className="w-4 h-4" />
                      </div>
                    </div>
                    <p className="text-[11px] text-muted-foreground">
                      Copia el formato al portapapeles y abre el cliente con asunto y cuerpo prellenados.
                    </p>
                  </button>

                  {/* ENVIAR POR WHATSAPP */}
                  <button
                    onClick={handleWhatsApp}
                    className="p-4 rounded-2xl bg-card border border-border/80 hover:border-primary/50 hover:bg-primary/5 transition-all text-left flex flex-col justify-between gap-3 shadow-sm group"
                  >
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-bold text-foreground">Enviar por WhatsApp</span>
                      <div className="w-8 h-8 rounded-lg bg-emerald-500/15 text-emerald-400 grid place-items-center group-hover:scale-110 transition-transform">
                        <MessageCircle className="w-4 h-4" />
                      </div>
                    </div>
                    <p className="text-[11px] text-muted-foreground">
                      Comparte el resumen estructurado de la boleta directamente por WhatsApp.
                    </p>
                  </button>
                </div>
              </div>

              {/* BOTONES FINALES TRAS GUARDAR */}
              <div className="flex items-center justify-end gap-3 pt-4 border-t border-border/80">
                <button
                  type="button"
                  onClick={handleReset}
                  className="px-4 py-2 rounded-xl bg-secondary text-secondary-foreground text-xs font-semibold hover:bg-secondary/80 transition-all flex items-center gap-2"
                >
                  <Plus className="w-4 h-4" />
                  <span>Crear otro registro</span>
                </button>
                <button
                  type="button"
                  onClick={onClose}
                  className="px-5 py-2 rounded-xl bg-primary text-primary-foreground text-xs font-bold shadow-md hover:bg-primary/90 transition-all"
                >
                  Finalizar y Cerrar
                </button>
              </div>
            </div>
          ) : (
            /* FORMULARIO DE 3 PASOS */
            <form onSubmit={handleSubmit} className="space-y-6">
              
              {/* BARRA DE PROGRESO DE 3 PASOS */}
              <div className="grid grid-cols-3 gap-3 p-1.5 rounded-2xl bg-muted/40 border border-border/60">
                <div
                  className={`flex items-center gap-2.5 px-3 py-2 rounded-xl text-xs font-semibold transition-all ${
                    isStep1Valid ? "bg-primary/10 text-primary border border-primary/20" : "text-muted-foreground"
                  }`}
                >
                  <span className={`w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-bold ${
                    isStep1Valid ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground"
                  }`}>
                    1
                  </span>
                  <span>Clasificación</span>
                </div>

                <div
                  className={`flex items-center gap-2.5 px-3 py-2 rounded-xl text-xs font-semibold transition-all ${
                    isStep2Valid ? "bg-primary/10 text-primary border border-primary/20" : "text-muted-foreground"
                  }`}
                >
                  <span className={`w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-bold ${
                    isStep2Valid ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground"
                  }`}>
                    2
                  </span>
                  <span>Cliente</span>
                </div>

                <div
                  className={`flex items-center gap-2.5 px-3 py-2 rounded-xl text-xs font-semibold transition-all ${
                    isStep3Valid ? "bg-primary/10 text-primary border border-primary/20" : "text-muted-foreground"
                  }`}
                >
                  <span className={`w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-bold ${
                    isStep3Valid ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground"
                  }`}>
                    3
                  </span>
                  <span>Producto</span>
                </div>
              </div>

              {/* SECCIÓN 1: CLASIFICACIÓN */}
              <div className="p-4 rounded-2xl bg-card border border-border/80 space-y-4">
                <div className="flex items-center justify-between border-b border-border/60 pb-3">
                  <div className="flex items-center gap-2">
                    <Layers className="w-4 h-4 text-primary" />
                    <h3 className="text-xs font-black uppercase tracking-wider text-foreground">
                      1. Clasificación del Trámite
                    </h3>
                  </div>
                  <span className="text-[10px] font-semibold text-primary px-2 py-0.5 rounded-full bg-primary/10">
                    Requerido
                  </span>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3.5">
                  <div>
                    <label className="block text-xs font-semibold text-muted-foreground mb-1">
                      Tipo de Salida *
                    </label>
                    <select
                      value={tipo}
                      onChange={(e) => setTipo(e.target.value as any)}
                      className="w-full h-9 px-3 rounded-xl bg-background border border-border text-xs text-foreground focus:outline-none focus:ring-2 focus:ring-primary/40 font-medium"
                      required
                    >
                      <option value="salida_definitiva">Salida Definitiva</option>
                      <option value="salida_temporal">Salida Temporal</option>
                    </select>
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-muted-foreground mb-1">
                      Categoría *
                    </label>
                    <select
                      value={categoria}
                      onChange={(e) => setCategoria(e.target.value)}
                      className="w-full h-9 px-3 rounded-xl bg-background border border-border text-xs text-foreground focus:outline-none focus:ring-2 focus:ring-primary/40 font-medium"
                      required
                    >
                      {tipo === "salida_definitiva" ? (
                        <>
                          <option value="nota_credito">Nota De Crédito</option>
                          <option value="garantia_1">Garantía 1%</option>
                          <option value="garantia_1_nota_credito">Garantía 1% con Nota de Crédito</option>
                          <option value="reparacion">Reparación</option>
                        </>
                      ) : (
                        <>
                          <option value="rma">RMA</option>
                          <option value="rma_nota_credito">RMA - Nota de Crédito</option>
                          <option value="reparacion">Reparación</option>
                        </>
                      )}
                    </select>
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-muted-foreground mb-1">
                      Motivo *
                    </label>
                    <select
                      value={motivo}
                      onChange={(e) => setMotivo(e.target.value)}
                      className="w-full h-9 px-3 rounded-xl bg-background border border-border text-xs text-foreground focus:outline-none focus:ring-2 focus:ring-primary/40 font-medium"
                      required
                    >
                      <option value="sin_existencias">Sin Existencias</option>
                      <option value="solicitud_cliente">Solicitud del Cliente</option>
                      <option value="reemplazo">Reemplazo</option>
                    </select>
                  </div>
                </div>
              </div>

              {/* SECCIÓN 2: INFORMACIÓN DEL CLIENTE */}
              <div className="p-4 rounded-2xl bg-card border border-border/80 space-y-4">
                <div className="flex items-center justify-between border-b border-border/60 pb-3">
                  <div className="flex items-center gap-2">
                    <Building2 className="w-4 h-4 text-amber-500" />
                    <h3 className="text-xs font-black uppercase tracking-wider text-foreground">
                      2. Información del Cliente y Facturación
                    </h3>
                  </div>
                  <span className="text-[10px] font-semibold text-amber-500 px-2 py-0.5 rounded-full bg-amber-500/10">
                    Requerido
                  </span>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3.5">
                  <div>
                    <label className="block text-xs font-semibold text-muted-foreground mb-1">
                      Ticket Nº *
                    </label>
                    <input
                      type="text"
                      value={ticket}
                      onChange={(e) => setTicket(e.target.value)}
                      placeholder="Ej: 54321"
                      className="w-full h-9 px-3 rounded-xl bg-background border border-border text-xs text-foreground focus:outline-none focus:ring-2 focus:ring-primary/40 font-medium"
                      required
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-muted-foreground mb-1">
                      Sede *
                    </label>
                    <select
                      value={sede}
                      onChange={(e) => setSede(e.target.value)}
                      className="w-full h-9 px-3 rounded-xl bg-background border border-border text-xs text-foreground focus:outline-none focus:ring-2 focus:ring-primary/40 font-medium"
                      required
                    >
                      {SEDES.map((s) => (
                        <option key={s} value={s}>{s}</option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-muted-foreground mb-1">
                      Factura Nº *
                    </label>
                    <input
                      type="text"
                      value={factura}
                      onChange={(e) => setFactura(e.target.value)}
                      placeholder="Ej: FAC-102938"
                      className="w-full h-9 px-3 rounded-xl bg-background border border-border text-xs text-foreground focus:outline-none focus:ring-2 focus:ring-primary/40 font-medium"
                      required
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-muted-foreground mb-1">
                    Nombre del Cliente / Razón Social *
                  </label>
                  <input
                    type="text"
                    value={nombre}
                    onChange={(e) => setNombre(e.target.value)}
                    placeholder="Nombre completo o empresa"
                    className="w-full h-9 px-3 rounded-xl bg-background border border-border text-xs text-foreground focus:outline-none focus:ring-2 focus:ring-primary/40 font-medium"
                    required
                  />
                </div>
              </div>

              {/* SECCIÓN 3: INFORMACIÓN DEL PRODUCTO */}
              <div className="p-4 rounded-2xl bg-card border border-border/80 space-y-4">
                <div className="flex items-center justify-between border-b border-border/60 pb-3">
                  <div className="flex items-center gap-2">
                    <Package className="w-4 h-4 text-emerald-500" />
                    <h3 className="text-xs font-black uppercase tracking-wider text-foreground">
                      3. Información del Producto e Inventario
                    </h3>
                  </div>
                  <span className="text-[10px] font-semibold text-emerald-500 px-2 py-0.5 rounded-full bg-emerald-500/10">
                    Requerido
                  </span>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3.5">
                  <div>
                    <label className="block text-xs font-semibold text-muted-foreground mb-1">
                      Cantidad *
                    </label>
                    <input
                      type="number"
                      min={1}
                      value={cantidad}
                      onChange={(e) => setCantidad(parseInt(e.target.value, 10) || 1)}
                      className="w-full h-9 px-3 rounded-xl bg-background border border-border text-xs text-foreground focus:outline-none focus:ring-2 focus:ring-primary/40 font-medium"
                      required
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-muted-foreground mb-1">
                      Fecha de Compra *
                    </label>
                    <input
                      type="date"
                      value={fechaCompra}
                      onChange={(e) => setFechaCompra(e.target.value)}
                      className="w-full h-9 px-3 rounded-xl bg-background border border-border text-xs text-foreground focus:outline-none focus:ring-2 focus:ring-primary/40 font-medium"
                      required
                    />
                  </div>

                  {/* ARTÍCULO CON BÚSQUEDA PREDICTIVA */}
                  <div className="relative">
                    <label className="block text-xs font-semibold text-muted-foreground mb-1 flex items-center justify-between">
                      <span>Artículo / Modelo</span>
                      {searchingInventory && (
                        <span className="text-[10px] text-primary flex items-center gap-1 font-normal">
                          <span className="w-1.5 h-1.5 rounded-full bg-primary animate-ping" />
                          Buscando...
                        </span>
                      )}
                    </label>
                    <div className="relative">
                      <input
                        type="text"
                        value={articulo}
                        onChange={(e) => {
                          setArticulo(e.target.value);
                          if (matchedInventoryItem && e.target.value !== matchedInventoryItem.articulo) {
                            setMatchedInventoryItem(null);
                          }
                        }}
                        placeholder="Buscar por código o descripción..."
                        className="w-full h-9 pl-3 pr-8 rounded-xl bg-background border border-border text-xs text-foreground focus:outline-none focus:ring-2 focus:ring-primary/40 font-medium"
                        autoComplete="off"
                      />
                      <Search className="w-3.5 h-3.5 text-muted-foreground absolute right-2.5 top-3 pointer-events-none" />
                    </div>

                    {/* DROPDOWN DE AUTOCOMPLETADO */}
                    {showDropdown && inventoryResults.length > 0 && (
                      <div className="absolute left-0 right-0 top-full mt-1 bg-popover border border-border rounded-xl shadow-xl max-h-48 overflow-y-auto z-50 p-1 divide-y divide-border/40">
                        {inventoryResults.map((item) => (
                          <button
                            key={item.id}
                            type="button"
                            onClick={() => selectInventoryItem(item)}
                            className="w-full text-left p-2 hover:bg-muted/80 rounded-lg transition-colors flex flex-col gap-0.5"
                          >
                            <div className="flex items-center justify-between">
                              <span className="text-xs font-bold text-foreground font-mono">
                                {item.articulo}
                              </span>
                              {item.marca && (
                                <span className="text-[10px] font-semibold text-primary px-1.5 py-0.5 rounded bg-primary/10">
                                  {item.marca}
                                </span>
                              )}
                            </div>
                            <span className="text-[11px] text-muted-foreground line-clamp-1">
                              {item.descripcion || "Sin descripción"}
                            </span>
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
                  <div>
                    <label className="block text-xs font-semibold text-muted-foreground mb-1 flex items-center justify-between">
                      <span>Marca</span>
                      {matchedInventoryItem && (
                        <span className="text-[10px] text-emerald-400 font-semibold flex items-center gap-1">
                          <Lock className="w-2.5 h-2.5" /> Bloqueado por Inventario
                        </span>
                      )}
                    </label>
                    <input
                      type="text"
                      value={marca}
                      onChange={(e) => setMarca(e.target.value)}
                      placeholder="Marca del equipo"
                      disabled={Boolean(matchedInventoryItem?.marca)}
                      className={`w-full h-9 px-3 rounded-xl border text-xs font-medium ${
                        matchedInventoryItem?.marca
                          ? "bg-muted/60 border-border/80 text-muted-foreground cursor-not-allowed"
                          : "bg-background border-border text-foreground focus:outline-none focus:ring-2 focus:ring-primary/40"
                      }`}
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-muted-foreground mb-1">
                      Número de Serie del Equipo
                    </label>
                    <input
                      type="text"
                      value={numeroSerie}
                      onChange={(e) => setNumeroSerie(e.target.value)}
                      placeholder="Ej: SN-4920491823"
                      className="w-full h-9 px-3 rounded-xl bg-background border border-border text-xs text-foreground focus:outline-none focus:ring-2 focus:ring-primary/40 font-medium"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-muted-foreground mb-1 flex items-center justify-between">
                    <span>Descripción del Artículo</span>
                    {matchedInventoryItem && (
                      <button
                        type="button"
                        onClick={clearInventoryMatch}
                        className="text-[10px] text-muted-foreground hover:text-foreground underline"
                      >
                        Desvincular de inventario
                      </button>
                    )}
                  </label>
                  <textarea
                    rows={2}
                    value={descripcion}
                    onChange={(e) => setDescripcion(e.target.value)}
                    placeholder="Descripción técnica del equipo..."
                    className="w-full p-2.5 rounded-xl bg-background border border-border text-xs text-foreground focus:outline-none focus:ring-2 focus:ring-primary/40 font-medium resize-none"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-muted-foreground mb-1">
                    Descripción de la Falla *
                  </label>
                  <textarea
                    rows={2}
                    value={falla}
                    onChange={(e) => setFalla(e.target.value)}
                    placeholder="Diagnóstico inicial del problema reportado..."
                    className="w-full p-2.5 rounded-xl bg-background border border-border text-xs text-foreground focus:outline-none focus:ring-2 focus:ring-primary/40 font-medium resize-none"
                    required
                  />
                </div>
              </div>

              {/* SECCIÓN 4: OBSERVACIONES Y SEGUIMIENTO */}
              <div className="p-4 rounded-2xl bg-card border border-border/80 space-y-4">
                <div className="flex items-center justify-between border-b border-border/60 pb-3">
                  <div className="flex items-center gap-2">
                    <FileText className="w-4 h-4 text-blue-500" />
                    <h3 className="text-xs font-black uppercase tracking-wider text-foreground">
                      4. Observaciones y Seguimiento
                    </h3>
                  </div>
                  <span className="text-[10px] font-semibold text-muted-foreground px-2 py-0.5 rounded-full bg-muted">
                    Opcional
                  </span>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
                  <div>
                    <label className="block text-xs font-semibold text-muted-foreground mb-1">
                      Factura Salida
                    </label>
                    <input
                      type="text"
                      value={facturaSalida}
                      onChange={(e) => setFacturaSalida(e.target.value)}
                      placeholder="Ej: 001-002-12345"
                      className="w-full h-9 px-3 rounded-xl bg-background border border-border text-xs text-foreground focus:outline-none focus:ring-2 focus:ring-primary/40 font-medium"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-muted-foreground mb-1">
                      Artículos Adicionales
                    </label>
                    <input
                      type="text"
                      value={articulosAdicionales}
                      onChange={(e) => setArticulosAdicionales(e.target.value)}
                      placeholder="Accesorios, cables, cargadores, etc."
                      className="w-full h-9 px-3 rounded-xl bg-background border border-border text-xs text-foreground focus:outline-none focus:ring-2 focus:ring-primary/40 font-medium"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
                  <div>
                    <label className="block text-xs font-semibold text-muted-foreground mb-1">
                      Observaciones
                    </label>
                    <textarea
                      rows={2}
                      value={observaciones}
                      onChange={(e) => setObservaciones(e.target.value)}
                      placeholder="Notas internas o aclaraciones del proceso..."
                      className="w-full p-2.5 rounded-xl bg-background border border-border text-xs text-foreground focus:outline-none focus:ring-2 focus:ring-primary/40 font-medium resize-none"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-muted-foreground mb-1">
                      Seguimiento
                    </label>
                    <textarea
                      rows={2}
                      value={seguimiento}
                      onChange={(e) => setSeguimiento(e.target.value)}
                      placeholder="Acciones realizadas o pasos pendientes..."
                      className="w-full p-2.5 rounded-xl bg-background border border-border text-xs text-foreground focus:outline-none focus:ring-2 focus:ring-primary/40 font-medium resize-none"
                    />
                  </div>
                </div>

                <div className="pt-2 border-t border-border/60">
                  <label className="inline-flex items-center gap-2 cursor-pointer select-none">
                    <input
                      type="checkbox"
                      checked={excluirRma}
                      onChange={(e) => setExcluirRma(e.target.checked)}
                      className="w-4 h-4 rounded border-border text-primary focus:ring-primary/40"
                    />
                    <span className="text-xs font-semibold text-foreground">
                      Excluir de Trámites con Marca (RMA)
                    </span>
                  </label>
                </div>
              </div>

              {/* ACCIONES DEL FORMULARIO */}
              <div className="flex items-center justify-between pt-3 border-t border-border/80">
                <button
                  type="button"
                  onClick={handleReset}
                  className="px-4 py-2 rounded-xl text-xs font-semibold text-muted-foreground hover:text-foreground hover:bg-muted transition-colors flex items-center gap-1.5"
                >
                  <RotateCcw className="w-3.5 h-3.5" />
                  <span>Limpiar</span>
                </button>

                <div className="flex items-center gap-3">
                  <button
                    type="button"
                    onClick={onClose}
                    className="px-4 py-2 rounded-xl text-xs font-semibold text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
                  >
                    Cancelar
                  </button>

                  <button
                    type="submit"
                    disabled={saving || !isFormValid}
                    className="px-6 py-2 rounded-xl bg-primary text-primary-foreground text-xs font-bold shadow-md hover:bg-primary/90 disabled:opacity-50 disabled:pointer-events-none transition-all flex items-center gap-2"
                  >
                    {saving ? (
                      <>
                        <span className="w-3.5 h-3.5 rounded-full border-2 border-primary-foreground border-t-transparent animate-spin" />
                        <span>Guardando registro...</span>
                      </>
                    ) : (
                      <>
                        <Save className="w-4 h-4" />
                        <span>Guardar Registro</span>
                      </>
                    )}
                  </button>
                </div>
              </div>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}
