import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import { ActivityTracker } from "@/components/admin/activity-tracker";
import { getUserWithTimeout } from "@/lib/supabase/resilient";
import { LogoutButton } from "@/components/logout-button";

export const dynamic = "force-dynamic";

export default async function ActividadPage() {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();

  const email = user?.email || "";
  const { data: agent } = await supabase
    .from("sek_agent_config")
    .select("email, nombre, apellido, rol")
    .ilike("email", email)
    .maybeSingle();

  const fullName = [agent?.nombre, agent?.apellido].filter(Boolean).join(" ") || email;
  const isAdmin = ["admin", "superadmin"].includes(agent?.rol || "");

  return (
    <div className="h-full">
      <ActivityTracker isAdmin={isAdmin} agentEmail={email} agentName={fullName} />
    </div>
  );
}
