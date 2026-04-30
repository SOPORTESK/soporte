import { createClient } from "@/lib/supabase/server";
import { ProfileForm } from "@/components/admin/profile-form";
import { Settings } from "lucide-react";
import type { SekAgent } from "@/lib/types";

export const dynamic = "force-dynamic";

export default async function AdminSettingsPage() {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  const { data: agent } = await supabase
    .from("sek_agent_config").select("*").ilike("email", user!.email!).maybeSingle();

  return (
    <div className="max-w-4xl mx-auto p-6 lg:p-8 space-y-6">
      <header>
        <p className="text-xs font-bold uppercase tracking-[0.2em] text-brand-700 dark:text-brand-300">Plataforma</p>
        <h1 className="text-3xl font-bold mt-1 flex items-center gap-3">
          <Settings className="h-7 w-7" /> Configuración
        </h1>
        <p className="text-muted-foreground mt-1">Tu perfil personal y ajustes generales del sistema.</p>
      </header>

      <ProfileForm agent={agent as SekAgent} />
    </div>
  );
}
