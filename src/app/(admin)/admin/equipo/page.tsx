import { createClient } from "@/lib/supabase/server";
import { Avatar, Badge } from "@/components/ui/avatar";
import { Users } from "lucide-react";

export const dynamic = "force-dynamic";

export default async function AdminEquipoPage() {
  const supabase = createClient();
  const { data } = await supabase
    .from("sek_agent_config").select("*").order("created_at", { ascending: false });

  return (
    <div className="max-w-5xl mx-auto p-6 lg:p-8 space-y-6">
      <header>
        <p className="text-xs font-bold uppercase tracking-[0.2em] text-brand-700 dark:text-brand-300">Gestión</p>
        <h1 className="text-3xl font-bold mt-1 flex items-center gap-3">
          <Users className="h-7 w-7" /> Equipo
        </h1>
        <p className="text-muted-foreground mt-1">Agentes registrados en <code className="rounded bg-muted px-1">sek_agent_config</code>.</p>
      </header>

      <section className="rounded-2xl border border-border bg-card overflow-hidden">
        <ul className="divide-y divide-border">
          {(data || []).map((a: any) => {
            const fullName = [a.nombre, a.apellido].filter(Boolean).join(" ") || a.email;
            const variant = a.rol === "superadmin" ? "danger" : a.rol === "admin" ? "warning" : "default";
            return (
              <li key={a.email} className="p-4 flex items-center gap-4 hover:bg-muted/30 transition-colors">
                <Avatar name={fullName} size={44} />
                <div className="flex-1 min-w-0">
                  <p className="font-semibold truncate">{fullName}</p>
                  <p className="text-sm text-muted-foreground truncate">{a.email}</p>
                </div>
                <Badge variant={variant} className="capitalize">{a.rol}</Badge>
              </li>
            );
          })}
          {(!data || data.length === 0) && (
            <li className="p-12 text-center text-muted-foreground">Sin agentes registrados.</li>
          )}
        </ul>
      </section>
    </div>
  );
}
