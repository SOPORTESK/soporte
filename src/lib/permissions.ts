import { createClient } from "@/lib/supabase/server";

export interface GroupPermissions {
  view: boolean;
  edit: boolean;
  create: boolean;
  delete: boolean;
}

export interface PermissionGroup {
  id: string;
  name: string;
  description: string;
  isSystem?: boolean;
  permissions: {
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
      inbox: { view: true, edit: true, create: true, delete: true },
      stats: { view: true, edit: true, create: true, delete: true },
      inventory: { view: true, edit: true, create: true, delete: true },
      manuals: { view: true, edit: true, create: true, delete: true },
      ai: { view: true, edit: true, create: true, delete: true },
      settings: { view: true, edit: true, create: true, delete: true },
    },
  },
  {
    id: "admin",
    name: "Admin",
    description: "Gestión de equipo, métricas, inventario, manuales y canales.",
    isSystem: true,
    permissions: {
      inbox: { view: true, edit: true, create: true, delete: false },
      stats: { view: true, edit: true, create: true, delete: false },
      inventory: { view: true, edit: true, create: true, delete: true },
      manuals: { view: true, edit: true, create: true, delete: true },
      ai: { view: true, edit: true, create: true, delete: false },
      settings: { view: true, edit: true, create: true, delete: false },
    },
  },
  {
    id: "tecnico",
    name: "Soporte Avanzado",
    description: "Técnicos de soporte para atender chats asignados y consultar inventario/manuales.",
    isSystem: true,
    permissions: {
      inbox: { view: true, edit: true, create: true, delete: false },
      stats: { view: false, edit: false, create: false, delete: false },
      inventory: { view: true, edit: false, create: false, delete: false },
      manuals: { view: true, edit: false, create: false, delete: false },
      ai: { view: false, edit: false, create: false, delete: false },
      settings: { view: false, edit: false, create: false, delete: false },
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