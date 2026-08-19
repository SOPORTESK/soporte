import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import { ActivityTracker } from "@/components/admin/activity-tracker";

export const dynamic = "force-dynamic";

export default async function ActividadPage() {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: agent } = await supabase
    .from("sek_agent_config")
    .select("*")
    .ilike("email", user.email!)
    .maybeSingle();

  if (!agent) redirect("/login");

  const isAdmin = ["admin", "superadmin"].includes(agent.rol);
  if (!isAdmin) redirect("/");

  const fullName = [agent.nombre, agent.apellido].filter(Boolean).join(" ") || agent.email;

  return (
    <div className="h-dvh">
      <ActivityTracker isAdmin agentEmail={agent.email} agentName={fullName} />
    </div>
  );
}
