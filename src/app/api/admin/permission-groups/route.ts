import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

const DEFAULT_GROUPS = [
  {
    id: "superadmin",
    name: "Superadmin",
    description: "Acceso total y sin restricciones a todos los módulos y la plataforma.",
    isSystem: true,
    permissions: {
      inbox: { view: true, viewAll: true, reply: true, reassign: true, internalNotes: true, closeCase: true, delete: true },
      stats: { view: true, viewSLA: true, viewVolume: true, export: true },
      inventory: { view: true, create: true, edit: true, delete: true },
      manuals: { view: true, upload: true, delete: true },
      ai: { view: true, toggleMode: true, train: true, restorePrompt: true },
      settings: { view: true, manageChannels: true, qrConnect: true, dangerZone: true },
    },
  },
  {
    id: "admin",
    name: "Admin",
    description: "Gestión de equipo, métricas, inventario, manuales y canales.",
    isSystem: true,
    permissions: {
      inbox: { view: true, viewAll: true, reply: true, reassign: true, internalNotes: true, closeCase: true, delete: false },
      stats: { view: true, viewSLA: true, viewVolume: true, export: true },
      inventory: { view: true, create: true, edit: true, delete: true },
      manuals: { view: true, upload: true, delete: true },
      ai: { view: true, toggleMode: true, train: true, restorePrompt: true },
      settings: { view: true, manageChannels: true, qrConnect: true, dangerZone: false },
    },
  },
  {
    id: "tecnico",
    name: "Soporte Avanzado",
    description: "Técnicos de soporte para atender chats asignados y consultar inventario/manuales.",
    isSystem: true,
    permissions: {
      inbox: { view: true, viewAll: false, reply: true, reassign: false, internalNotes: true, closeCase: true, delete: false },
      stats: { view: false, viewSLA: false, viewVolume: false, export: false },
      inventory: { view: true, create: false, edit: false, delete: false },
      manuals: { view: true, upload: false, delete: false },
      ai: { view: false, toggleMode: false, train: false, restorePrompt: false },
      settings: { view: false, manageChannels: false, qrConnect: false, dangerZone: false },
    },
  },
];

export async function GET() {
  try {
    const supabase = createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: "No autorizado" }, { status: 401 });

    const { data } = await supabase
      .from("sek_app_settings")
      .select("value")
      .eq("key", "permission_groups")
      .maybeSingle();

    let groups = DEFAULT_GROUPS;
    if (data?.value) {
      try {
        groups = JSON.parse(data.value);
      } catch {}
    }

    return NextResponse.json({ groups });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const supabase = createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: "No autorizado" }, { status: 401 });

    const { data: caller } = await supabase
      .from("sek_agent_config")
      .select("rol")
      .ilike("email", user.email!)
      .single();

    if (!caller || !["admin", "superadmin"].includes(caller.rol)) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const { groups } = await req.json();
    if (!Array.isArray(groups)) {
      return NextResponse.json({ error: "Formato inválido" }, { status: 400 });
    }

    const { error } = await supabase
      .from("sek_app_settings")
      .upsert({
        key: "permission_groups",
        value: JSON.stringify(groups),
        updated_at: new Date().toISOString(),
      }, { onConflict: "key" });

    if (error) throw error;

    return NextResponse.json({ success: true, groups });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}