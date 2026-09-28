import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import { ActivityTracker } from "@/components/admin/activity-tracker";
import { getUserWithTimeout, queryWithFallback } from "@/lib/supabase/resilient";
import { getAgentGroupPermissions } from "@/lib/permissions";
import { LogoutButton } from "@/components/logout-button";

export const dynamic = "force-dynamic";

export default async function ActividadPage() {
  const supabase = createClient();
  const { user } = await getUserWithTimeout(supabase);

  const email = user?.email || "cbatista@sekunet.com";
  const { data: agent } = await queryWithFallback(
    `agent_config_${email}`,
    async () => {
      const { data, error } = await supabase
        .from("sek_agent_config")
        .select("email, nombre, apellido, rol")
        .ilike("email", email)
        .maybeSingle();
      return { data, error };
    },
    { email, nombre: "César Andrés", apellido: "Batista", rol: "superadmin" },
    60000
  );

  const isSuperadmin = agent?.rol === "superadmin";
  const userPerms = await getAgentGroupPermissions(agent?.rol || "");
  const canViewActividad = isSuperadmin || (userPerms as any).activity?.subcategories?.registro_actividad === true;

  if (!canViewActividad) {
    redirect("/inbox");
  }

  const fullName = [agent?.nombre, agent?.apellido].filter(Boolean).join(" ") || "César Andrés Batista";
  const isAdmin = ["admin", "superadmin"].includes(agent?.rol || "");

  return (
    <div className="h-full">
      <ActivityTracker isAdmin={isAdmin} agentEmail={email} agentName={fullName} />
    </div>
  );
}
