import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import { ActivityTracker } from "@/components/admin/activity-tracker";
import { getUserWithTimeout } from "@/lib/supabase/resilient";
import { LogoutButton } from "@/components/logout-button";

export const dynamic = "force-dynamic";

export default async function ActividadPage() {
  const supabase = createClient();
  const { user, timedOut } = await getUserWithTimeout(supabase);
  if (!user) {
    if (timedOut) {
      return (
        <div className="min-h-dvh grid place-items-center p-6 px-safe">
          <div className="max-w-md text-center space-y-4">
            <h1 className="text-2xl font-bold">Reconectando...</h1>
            <p className="text-muted-foreground">
              No se pudo conectar con el servidor. Reintentando autom&aacute;ticamente.
            </p>
            <script dangerouslySetInnerHTML={{ __html: `
              setTimeout(function() { window.location.reload(); }, 5000);
            `}} />
            <LogoutButton />
          </div>
        </div>
      );
    }
    redirect("/login");
  }

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
