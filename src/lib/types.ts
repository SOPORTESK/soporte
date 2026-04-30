// Tipos alineados con el esquema sek_* en Supabase
export type AgentRol = "superadmin" | "admin" | "tecnico" | "agente" | string;
export type ChannelKind = "web" | "widget" | "whatsapp" | "messenger" | "email";
export type CaseEstado = "abierto" | "pendiente" | "asignado" | "resuelto" | "cerrado" | string;
export type CasePrioridad = "baja" | "media" | "alta" | "urgente" | string;

export interface SekAgent {
  email: string;
  nombre: string | null;
  apellido: string | null;
  rol: AgentRol;
  created_at: string;
  updated_at: string;
}

export interface SekChannel {
  id: string;
  kind: ChannelKind;
  name: string;
  is_active: boolean;
  config: Record<string, unknown>;
  created_at: string;
  updated_at: string;
}

export interface SekCliente {
  nombre?: string;
  telefono?: string;
  correo?: string;
  cuenta?: string;
  intentosDatos?: number;
  [key: string]: unknown;
}

export interface SekHistEntry {
  role: "user" | "assistant" | "tecnico" | string;
  time: string;
  content: string;
  author?: string;
  [key: string]: unknown;
}

export interface SekCase {
  id: number | string;
  title: string | null;
  cat: string | null;
  date: string | null;
  histcliente: SekHistEntry[] | null;
  histtecnico: SekHistEntry[] | null;
  created_at: string;
  canal: ChannelKind | string | null;
  estado: CaseEstado | null;
  prioridad: CasePrioridad | null;
  cliente: SekCliente | string | null;
  tags: string[] | null;
  notasInternas: string | null;
  last_message_at: string | null;
  last_message_preview: string | null;
  unread_count: number;
  assigned_to: string | null;
  channel_id: string | null;
  customer_phone: string | null;
  updated_at: string;
}

export interface SekMessage {
  id: number | string;
  channel: ChannelKind | string | null;
  external_id: string | null;
  from_number: string | null;
  from_name: string | null;
  content: string | null;
  media_url: string | null;
  raw_payload: any;
  status: string | null;
  case_id: number | string;
  agent_email: string | null;
  created_at: string;
  updated_at: string;
}

export interface SekDoc {
  id: number | string;
  name: string;
  content: string | null;
  size: number | null;
  date: string | null;
  created_at: string;
}

export interface SekPlantilla {
  id: number | string;
  nombre: string;
  cat: string | null;
  texto: string;
  date: string | null;
  created_at: string;
}
