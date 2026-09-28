import { createClient as createSupabaseClient } from "@supabase/supabase-js";

const GARANTIAS_URL = process.env.NEXT_PUBLIC_GARANTIAS_SUPABASE_URL || "https://syngvbgelcfyunjggpwo.supabase.co";
const GARANTIAS_ANON = process.env.NEXT_PUBLIC_GARANTIAS_SUPABASE_ANON_KEY || "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InN5bmd2YmdlbGNmeXVuamdncHdvIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODY3MDkyNDIsImV4cCI6MjEwMjI4NTI0Mn0.4_w_wLY1O-PSik2HfbiStDhLG_JFszZEwLgpXQ3GlVw";
const GARANTIAS_SERVICE_RAW = process.env.GARANTIAS_SUPABASE_SERVICE_ROLE_KEY;
// Validar que la llave no sea el token con firma inválida
const GARANTIAS_SERVICE = (GARANTIAS_SERVICE_RAW && !GARANTIAS_SERVICE_RAW.includes("fdjmyVDzTXRhxfsweYiHH9RN5DN0q5CKSZ5EEBJumOw"))
  ? GARANTIAS_SERVICE_RAW
  : GARANTIAS_ANON;

/** Cliente para operaciones de Garantías en servidor */
export function createGarantiasServiceClient() {
  return createSupabaseClient(GARANTIAS_URL, GARANTIAS_SERVICE || GARANTIAS_ANON);
}

/** Cliente público/anónimo para Garantías */
export function createGarantiasClient() {
  return createSupabaseClient(GARANTIAS_URL, GARANTIAS_ANON);
}

export type GarantiaRecord = {
  id: string | number;
  boleta?: string | null;
  numero_consecutivo?: number | null;
  tipo?: string | null; // "salida_definitiva" | "salida_temporal"
  categoria?: string | null;
  motivo?: string | null;
  ticket?: string | null;
  sede?: string | null;
  nombre?: string | null; // Nombre cliente
  factura?: string | null;
  cantidad?: number | null;
  fecha_compra?: string | null;
  marca?: string | null;
  serie?: string | null; // Código de artículo o modelo
  numero_serie?: string | null; // Número de serie del equipo
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
  factura_salida?: string | null;
  articulos_adicionales?: string | null;
  observaciones?: string | null;
  seguimiento?: string | null;
  usuario_id?: string | null;
  historial?: Array<{
    fecha: string;
    usuario?: string;
    cambios?: Record<string, unknown>;
    nota?: string;
    estatus_anterior?: string;
    estatus_nuevo?: string;
  }> | null;
};
