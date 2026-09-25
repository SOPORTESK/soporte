export type GarantiaRecord = {
  id: string | number;
  boleta?: string | null;
  numero_consecutivo?: number | null;
  tipo?: string | null; // "salida_definitiva" | "salida_temporal"
  categoria?: string | null;
  motivo?: string | null;
  ticket?: string | null;
  sede?: string | null;
  nombre?: string | null;
  factura?: string | null;
  cantidad?: number | null;
  fecha_compra?: string | null;
  marca?: string | null;
  serie?: string | null;
  numero_serie?: string | null;
  descripcion?: string | null;
  falla?: string | null;
  fecha_creacion?: string | null;
  fecha_modificacion?: string | null;
  registrado_por?: string | null;
  modificado_por?: string | null;
  estatus?: string | null;
  // Campos RMA
  ticket_rma?: string | null;
  fecha_rma?: string | null;
  serie_fabrica?: string | null;
  excluir_rma?: boolean | null;
  dev?: string | null;
  fecha_dev?: string | null;
  historial?: Array<{
    id?: string | number;
    fecha: string;
    usuario?: string;
    cambios?: Record<string, any>;
    nota?: string;
    estatus_anterior?: string;
    estatus_nuevo?: string;
  }> | null;
};

export const CAT_LABELS: Record<string, string> = {
  nota_credito: "Nota De Crédito",
  garantia_1: "Garantía 1%",
  rma: "RMA",
  reparacion: "Reparación",
  rma_nota_credito: "RMA - NC",
  garantia_1_nota_credito: "Garantía 1% + NC",
};

export const MOT_LABELS: Record<string, string> = {
  sin_existencias: "Sin Existencias",
  solicitud_cliente: "Solicitud del Cliente",
  reemplazo: "Reemplazo",
};

export const KPI_ESTATUS_LABELS: Record<string, string> = {
  reemplazo_total: "Reemplazo Total",
  repuesto_ingresado: "Repuesto Ingresado",
  nota_credito_marca: "NC Marca",
  en_proceso: "En Proceso",
  pendiente_tramite: "Pendiente Trámite",
  fuera_garantia: "Fuera de Garantía",
  compra_repuesto: "Compra Repuesto",
};

export const ESTATUS_CERRADOS = [
  "reemplazo_total",
  "repuesto_ingresado",
  "nota_credito_marca",
  "fuera_garantia",
  "compra_repuesto",
];

export const SEDES = ["San José", "Liberia", "Pérez Zeledón"];

export function formatTimeElapsed(fechaInicio?: string | null, fechaFin?: string | null, estatus?: string | null): string {
  if (!fechaInicio) return "—";
  const inicio = new Date(fechaInicio);
  const esCerrado = estatus && ESTATUS_CERRADOS.includes(estatus);
  const fin = esCerrado && fechaFin ? new Date(fechaFin) : new Date();

  const diffMs = fin.getTime() - inicio.getTime();
  if (diffMs < 0) return "0 min";

  const diffDias = Math.floor(diffMs / (1000 * 60 * 60 * 24));
  const diffHoras = Math.floor((diffMs % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
  const diffMinutos = Math.floor((diffMs % (1000 * 60 * 60)) / (1000 * 60));

  if (diffDias === 0 && diffHoras === 0) return `${diffMinutos}m`;
  if (diffDias === 0) return `${diffHoras}h ${diffMinutos}m`;
  return `${diffDias}d ${diffHoras}h`;
}
