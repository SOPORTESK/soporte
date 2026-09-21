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
    activity: GroupPermissions;
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
      team: { view: true, edit: true, create: true, delete: true, subcategories: { view_team_list: true, view_agent_profile: true, add_agent: true, edit_agent: true, reset_password: true, delete_agent: true, manage_groups: true } },
      inbox: { view: true, edit: true, create: true, delete: true, subcategories: { inbox_principal: true, smart_inbox: true, soporte_avanzado: true, mi_gestion: true, web_preview: true, ver_todos_casos: true, responder_mensajes: true, reasignar_casos: true, notas_internas: true, historial_cliente_drawer: true, cerrar_casos: true } },
      stats: { view: true, edit: true, create: true, delete: true, subcategories: { resumen_general: true, estadisticas_detalladas: true, estadisticas_atencion: true, volumen_mensajes: true, analitica_equipos_fallas: true, analitica_clientes: true, exportar_reportes: true } },
      activity: { view: true, edit: true, create: true, delete: true, subcategories: { registro_actividad: true, auditoria_pantalla: true, ranking_apps_sitios: true, heatmap_intensidad: true, dictamen_ejecutivo_ia: true, panel_externo_visibilidad: true, panel_externo_gestion: true, agenda_calendario: true, agenda_gestion_global: true, gestion_horas_extras: true, auditoria_pausas_inactividad: true } },
      inventory: { view: true, edit: true, create: true, delete: true, subcategories: { view_inventory: true, create_edit_models: true, bulk_upload: true, delete_models: true } },
      manuals: { view: true, edit: true, create: true, delete: true, subcategories: { view_manuals: true, upload_manuals: true, delete_manuals: true } },
      ai: { view: true, edit: true, create: true, delete: true, subcategories: { view_ai_panel: true, flujos_bot: true, toggle_ai_modes: true, train_prompt: true, restore_prompt_versions: true, ai_models_config: true } },
      settings: { view: true, edit: true, create: true, delete: true, subcategories: { view_settings: true, gestionar_categorias: true, horarios_jornada: true, google_drive_backup: true, manage_channels: true, whatsapp_qr_connect: true, evolution_api_config: true, edge_functions_status: true, danger_zone: true } },
    },
  },
  {
    id: "admin",
    name: "Admin",
    description: "Gestión de equipo, métricas, inventario, manuales y canales.",
    isSystem: true,
    permissions: {
      team: { view: true, edit: true, create: true, delete: true, subcategories: { view_team_list: true, view_agent_profile: true, add_agent: true, edit_agent: true, reset_password: true, delete_agent: true, manage_groups: true } },
      inbox: { view: true, edit: true, create: true, delete: false, subcategories: { inbox_principal: true, smart_inbox: true, soporte_avanzado: true, mi_gestion: true, web_preview: true, ver_todos_casos: true, responder_mensajes: true, reasignar_casos: true, notas_internas: true, historial_cliente_drawer: true, cerrar_casos: true } },
      stats: { view: true, edit: true, create: true, delete: false, subcategories: { resumen_general: true, estadisticas_detalladas: true, estadisticas_atencion: true, volumen_mensajes: true, analitica_equipos_fallas: true, analitica_clientes: true, exportar_reportes: true } },
      activity: { view: true, edit: true, create: true, delete: false, subcategories: { registro_actividad: true, auditoria_pantalla: true, ranking_apps_sitios: true, heatmap_intensidad: true, dictamen_ejecutivo_ia: true, panel_externo_visibilidad: true, panel_externo_gestion: true, agenda_calendario: true, agenda_gestion_global: true, gestion_horas_extras: true, auditoria_pausas_inactividad: true } },
      inventory: { view: true, edit: true, create: true, delete: true, subcategories: { view_inventory: true, create_edit_models: true, bulk_upload: true, delete_models: true } },
      manuals: { view: true, edit: true, create: true, delete: true, subcategories: { view_manuals: true, upload_manuals: true, delete_manuals: true } },
      ai: { view: true, edit: true, create: true, delete: false, subcategories: { view_ai_panel: true, flujos_bot: true, toggle_ai_modes: true, train_prompt: true, restore_prompt_versions: true, ai_models_config: true } },
      settings: { view: true, edit: true, create: true, delete: false, subcategories: { view_settings: true, gestionar_categorias: true, horarios_jornada: true, google_drive_backup: true, manage_channels: true, whatsapp_qr_connect: true, evolution_api_config: true, edge_functions_status: true, danger_zone: false } },
    },
  },
  {
    id: "tecnico",
    name: "Soporte Avanzado",
    description: "Técnicos de soporte para atender chats asignados y consultar inventario/manuales.",
    isSystem: true,
    permissions: {
      team: { view: false, edit: false, create: false, delete: false, subcategories: { view_team_list: false, view_agent_profile: false, add_agent: false, edit_agent: false, reset_password: false, delete_agent: false, manage_groups: false } },
      inbox: { view: true, edit: true, create: true, delete: false, subcategories: { inbox_principal: true, smart_inbox: false, soporte_avanzado: true, mi_gestion: true, web_preview: false, ver_todos_casos: false, responder_mensajes: true, reasignar_casos: false, notas_internas: true, historial_cliente_drawer: true, cerrar_casos: true } },
      stats: { view: false, edit: false, create: false, delete: false, subcategories: { resumen_general: false, estadisticas_detalladas: false, estadisticas_atencion: false, volumen_mensajes: false, analitica_equipos_fallas: false, analitica_clientes: false, exportar_reportes: false } },
      activity: { view: false, edit: false, create: false, delete: false, subcategories: { registro_actividad: false, auditoria_pantalla: false, ranking_apps_sitios: false, heatmap_intensidad: false, dictamen_ejecutivo_ia: false, panel_externo_visibilidad: true, panel_externo_gestion: false, agenda_calendario: true, agenda_gestion_global: false, gestion_horas_extras: false, auditoria_pausas_inactividad: false } },
      inventory: { view: true, edit: false, create: false, delete: false, subcategories: { view_inventory: true, create_edit_models: false, bulk_upload: false, delete_models: false } },
      manuals: { view: true, edit: false, create: false, delete: false, subcategories: { view_manuals: true, upload_manuals: false, delete_manuals: false } },
      ai: { view: false, edit: false, create: false, delete: false, subcategories: { view_ai_panel: false, flujos_bot: false, toggle_ai_modes: false, train_prompt: false, restore_prompt_versions: false, ai_models_config: false } },
      settings: { view: false, edit: false, create: false, delete: false, subcategories: { view_settings: false, gestionar_categorias: false, horarios_jornada: false, google_drive_backup: false, manage_channels: false, whatsapp_qr_connect: false, evolution_api_config: false, edge_functions_status: false, danger_zone: false } },
    },
  },
];

import { cacheGetFresh, cacheSet } from "@/lib/supabase/cache";

export async function getActiveGroups(): Promise<PermissionGroup[]> {
  const cached = cacheGetFresh("app_permission_groups", 60000); // 1 minuto de cache ultra-rápido
  if (cached) return cached;

  try {
    const supabase = createClient();
    const { data } = await supabase
      .from("sek_app_settings")
      .select("value")
      .eq("key", "permission_groups")
      .maybeSingle();

    if (data?.value) {
      const parsed = JSON.parse(data.value);
      if (Array.isArray(parsed) && parsed.length > 0) {
        const allModuleKeys: (keyof PermissionGroup["permissions"])[] = [
          "team", "inbox", "stats", "activity", "inventory", "manuals", "ai", "settings"
        ];

        const groups = parsed.map((g: any) => {
          const defaultRef = DEFAULT_GROUPS.find(dg => dg.id === g.id) || DEFAULT_GROUPS[2];
          const mergedPermissions: any = {};

          for (const modKey of allModuleKeys) {
            const defMod = defaultRef.permissions[modKey];
            const userMod = g.permissions?.[modKey];
            if (!userMod) {
              mergedPermissions[modKey] = defMod;
            } else {
              mergedPermissions[modKey] = {
                ...defMod,
                ...userMod,
                subcategories: {
                  ...(defMod?.subcategories || {}),
                  ...(userMod?.subcategories || {}),
                },
              };
            }
          }

          return {
            ...g,
            permissions: mergedPermissions,
          };
        });
        cacheSet("app_permission_groups", groups);
        return groups;
      }
    }
  } catch (e) {
    console.error("Error loading permission groups:", e);
  }
  cacheSet("app_permission_groups", DEFAULT_GROUPS);
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