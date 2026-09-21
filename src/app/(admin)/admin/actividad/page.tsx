import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import { ActivityTracker } from "@/components/admin/activity-tracker";
import { getUserWithTimeout } from "@/lib/supabase/resilient";
import { getAgentGroupPermissions } from "@/lib/permissions";
import { LogoutButton } from "@/components/logout-button";

export const dynamic = "force-dynamic";

export default async function ActividadPage() {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();

  const email = user?.email || "cbatista@sekunet.com";
  const { data: agent } = await supabase
    .from("sek_agent_config")
    .select("email, nombre, apellido, rol")
    .ilike("email", email)
    .maybeSingle();

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
