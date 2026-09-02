import { createClient } from "@/lib/supabase/server";

export interface GroupPermissions {
  view: boolean;
  edit: boolean;
  create: boolean;
  delete: boolean;
  subcategories?: Record<string, boolean>;
}

export interface PermissionGroup {
  id: string;
  name: string;
  description: string;
  isSystem?: boolean;
  permissions: {
    team: GroupPermissions;
    inbox: GroupPermissions;
    stats: GroupPermissions;
    inventory: GroupPermissions;
    manuals: GroupPermissions;
    ai: GroupPermissions;
    settings: GroupPermissions;
  };
}

export const DEFAULT_GROUPS: PermissionGroup[] = [
  {
    id: "superadmin",
    name: "Superadmin",
    description: "Acceso total y sin restricciones a todos los módulos y la plataforma.",
    isSystem: true,
    permissions: {
      team: { view: true, edit: true, create: true, delete: true, subcategories: { view_list: true, add_agent: true, edit_agent: true, reset_password: true, delete_agent: true, manage_groups: true } },
      inbox: { view: true, edit: true, create: true, delete: true, subcategories: { my_cases: true, all_cases: true, reply: true, reassign: true, internal_notes: true, close_case: true } },
      stats: { view: true, edit: true, create: true, delete: true, subcategories: { resumen_general: true, registro_actividad: true, auditoria_pantalla: true, ranking_apps_sitios: true, heatmap_intensidad: true, dictamen_ejecutivo_ia: true, sla_performance: true, message_volume: true, export_reports: true } },
      inventory: { view: true, edit: true, create: true, delete: true, subcategories: { view_catalog: true, edit_models: true, bulk_upload: true, delete_models: true } },
      manuals: { view: true, edit: true, create: true, delete: true, subcategories: { view_docs: true, upload_docs: true, delete_docs: true } },
      ai: { view: true, edit: true, create: true, delete: true, subcategories: { bot_status: true, toggle_modes: true, train_prompt: true, restore_prompt: true } },
      settings: { view: true, edit: true, create: true, delete: true, subcategories: { channels: true, qr_connect: true, evolution_config: true, danger_zone: true } },
    },
  },
  {
    id: "admin",
    name: "Admin",
    description: "Gestión de equipo, métricas, inventario, manuales y canales.",
    isSystem: true,
    permissions: {
      team: { view: true, edit: true, create: true, delete: true, subcategories: { view_list: true, add_agent: true, edit_agent: true, reset_password: true, delete_agent: true, manage_groups: true } },
      inbox: { view: true, edit: true, create: true, delete: false, subcategories: { my_cases: true, all_cases: true, reply: true, reassign: true, internal_notes: true, close_case: true } },
      stats: { view: true, edit: true, create: true, delete: false, subcategories: { resumen_general: true, registro_actividad: true, auditoria_pantalla: true, ranking_apps_sitios: true, heatmap_intensidad: true, dictamen_ejecutivo_ia: true, sla_performance: true, message_volume: true, export_reports: true } },
      inventory: { view: true, edit: true, create: true, delete: true, subcategories: { view_catalog: true, edit_models: true, bulk_upload: true, delete_models: true } },
      manuals: { view: true, edit: true, create: true, delete: true, subcategories: { view_docs: true, upload_docs: true, delete_docs: true } },
      ai: { view: true, edit: true, create: true, delete: false, subcategories: { bot_status: true, toggle_modes: true, train_prompt: true, restore_prompt: true } },
      settings: { view: true, edit: true, create: true, delete: false, subcategories: { channels: true, qr_connect: true, evolution_config: true, danger_zone: false } },
    },
  },
  {
    id: "tecnico",
    name: "Soporte Avanzado",
    description: "Técnicos de soporte para atender chats asignados y consultar inventario/manuales.",
    isSystem: true,
    permissions: {
      team: { view: false, edit: false, create: false, delete: false, subcategories: { view_list: false, add_agent: false, edit_agent: false, reset_password: false, delete_agent: false, manage_groups: false } },
      inbox: { view: true, edit: true, create: true, delete: false, subcategories: { my_cases: true, all_cases: false, reply: true, reassign: false, internal_notes: true, close_case: true } },
      stats: { view: false, edit: false, create: false, delete: false, subcategories: { resumen_general: false, registro_actividad: false, auditoria_pantalla: false, ranking_apps_sitios: false, heatmap_intensidad: false, dictamen_ejecutivo_ia: false, sla_performance: false, message_volume: false, export_reports: false } },
      inventory: { view: true, edit: false, create: false, delete: false, subcategories: { view_catalog: true, edit_models: false, bulk_upload: false, delete_models: false } },
      manuals: { view: true, edit: false, create: false, delete: false, subcategories: { view_docs: true, upload_docs: false, delete_docs: false } },
      ai: { view: false, edit: false, create: false, delete: false, subcategories: { bot_status: false, toggle_modes: false, train_prompt: false, restore_prompt: false } },
      settings: { view: false, edit: false, create: false, delete: false, subcategories: { channels: false, qr_connect: false, evolution_config: false, danger_zone: false } },
    },
  },
];

export async function getActiveGroups(): Promise<PermissionGroup[]> {
  try {
    const supabase = createClient();
    const { data } = await supabase
      .from("sek_app_settings")
      .select("value")
      .eq("key", "permission_groups")
      .maybeSingle();

    if (data?.value) {
      const parsed = JSON.parse(data.value);
      if (Array.isArray(parsed) && parsed.length > 0) return parsed;
    }
  } catch (e) {
    console.error("Error loading permission groups:", e);
  }
  return DEFAULT_GROUPS;
}

export async function getAgentGroupPermissions(agentRol: string): Promise<PermissionGroup["permissions"]> {
  if (agentRol === "superadmin") {
    return DEFAULT_GROUPS[0].permissions;
  }
  const groups = await getActiveGroups();
  const matched = groups.find(g => g.id === agentRol) || groups.find(g => g.id === "tecnico") || DEFAULT_GROUPS[2];
  return matched.permissions;
}