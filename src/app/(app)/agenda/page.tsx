import { createClient } from "@/lib/supabase/server";
import { getUserWithTimeout, queryWithFallback } from "@/lib/supabase/resilient";
import { getAgentGroupPermissions } from "@/lib/permissions";
import { redirect } from "next/navigation";
import { AgendaView } from "@/components/agenda/agenda-view";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Calendario & Agenda | Sekunet",
  description: "Calendario unificado, agenda de eventos y lista de tareas para todo el equipo",
};

export default async function AgendaPage() {
  const supabase = createClient();
  const { user } = await getUserWithTimeout(supabase);

  if (!user?.email) {
    redirect("/login");
  }

  const { data: agentConfig } = await queryWithFallback(
    "agent_config",
    async () => {
      const { data, error } = await supabase
        .from("sek_agent_config")
        .select("nombre, apellido, rol, avatar_url")
        .ilike("email", user.email)
        .maybeSingle();
      return { data, error };
    },
    null
  );

  const currentAgent = {
    email: user.email,
    nombre: agentConfig?.nombre || "",
    apellido: agentConfig?.apellido || "",
    rol: agentConfig?.rol || "agente",
    avatar_url: agentConfig?.avatar_url || null,
  };

  const isSuperadmin = currentAgent.rol === "superadmin";
  const userPerms = await getAgentGroupPermissions(currentAgent.rol);
  const canViewAgenda = isSuperadmin || (
    (userPerms as any).activity?.subcategories?.agenda_calendario ?? true
  );

  if (!canViewAgenda) {
    redirect("/inbox");
  }

  const canManageGlobal = isSuperadmin || (
    (userPerms as any).activity?.subcategories?.agenda_gestion_global ?? false
  );

  return <AgendaView currentAgent={currentAgent} canManageGlobal={canManageGlobal} />;
}
