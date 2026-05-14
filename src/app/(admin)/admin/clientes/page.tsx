"use client";
import * as React from "react";
import { createClient } from "@/lib/supabase/client";
import { ShieldBan, ShieldCheck, AlertTriangle, User } from "lucide-react";
import { toast } from "sonner";

interface ClienteBloqueado {
  id: string;
  cedula: string;
  nombre: string;
  correo: string | null;
  telefono: string | null;
  bloqueo_contador: number;
  fecha_bloqueo: string | null;
  motivo_bloqueo: string | null;
}

export default function ClientesBloqueadosPage() {
  const supabase = React.useMemo(() => createClient(), []);
  const [clientes, setClientes] = React.useState<ClienteBloqueado[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [rol, setRol] = React.useState<string | null>(null);
  const [desbloqueando, setDesbloqueando] = React.useState<string | null>(null);

  React.useEffect(() => {
    (async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user?.email) return;

      const { data: agent } = await supabase
        .from("sek_agent_config")
        .select("rol")
        .ilike("email", user.email)
        .maybeSingle();
      setRol(agent?.rol ?? null);

      const { data } = await supabase
        .from("sek_clientes")
        .select("id, cedula, nombre, correo, telefono, bloqueo_contador, fecha_bloqueo, motivo_bloqueo")
        .eq("bloqueado", true)
        .order("fecha_bloqueo", { ascending: false });

      setClientes((data as ClienteBloqueado[]) ?? []);
      setLoading(false);
    })();
  }, [supabase]);

  const puedeDesbloquear = rol === "admin" || rol === "superadmin";

  async function desbloquear(cedula: string) {
    setDesbloqueando(cedula);
    try {
      const res = await fetch("/api/admin/clientes/desbloquear", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ cedula }),
      });
      if (!res.ok) {
        const d = await res.json();
        throw new Error(d.error || "Error al desbloquear");
      }
      setClientes(prev => prev.filter(c => c.cedula !== cedula));
      toast.success("Cliente desbloqueado correctamente");
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setDesbloqueando(null);
    }
  }

  return (
    <div className="p-4 sm:p-6 max-w-4xl mx-auto space-y-6">
      <div className="flex items-center gap-3">
        <div className="h-10 w-10 rounded-xl bg-red-500/10 flex items-center justify-center">
          <ShieldBan className="h-5 w-5 text-red-500" />
        </div>
        <div>
          <h1 className="text-xl font-bold">Clientes Bloqueados</h1>
          <p className="text-sm text-muted-foreground">Bloqueo automático por 5 calificaciones menores a 2 estrellas</p>
        </div>
      </div>

      {!puedeDesbloquear && (
        <div className="flex items-center gap-2 rounded-lg bg-amber-500/10 border border-amber-500/20 px-4 py-3 text-sm text-amber-700 dark:text-amber-400">
          <AlertTriangle className="h-4 w-4 shrink-0" />
          Solo administradores pueden desbloquear clientes.
        </div>
      )}

      {loading ? (
        <div className="text-sm text-muted-foreground py-8 text-center">Cargando...</div>
      ) : clientes.length === 0 ? (
        <div className="flex flex-col items-center gap-3 py-16 text-center">
          <ShieldCheck className="h-10 w-10 text-emerald-500" />
          <p className="font-semibold">No hay clientes bloqueados</p>
          <p className="text-sm text-muted-foreground">Todos los clientes tienen acceso activo al soporte.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {clientes.map(c => (
            <div key={c.id} className="rounded-xl border border-border bg-card p-4 flex items-start gap-4">
              <div className="h-10 w-10 rounded-full bg-red-500/10 flex items-center justify-center shrink-0">
                <User className="h-5 w-5 text-red-500" />
              </div>
              <div className="flex-1 min-w-0 space-y-1">
                <p className="font-semibold truncate">{c.nombre}</p>
                <p className="text-xs text-muted-foreground">Cédula: {c.cedula}</p>
                {c.correo && <p className="text-xs text-muted-foreground">Correo: {c.correo}</p>}
                {c.telefono && <p className="text-xs text-muted-foreground">Teléfono: {c.telefono}</p>}
                <div className="flex flex-wrap gap-2 pt-1">
                  <span className="inline-flex items-center gap-1 rounded-full bg-red-500/10 px-2 py-0.5 text-[11px] font-medium text-red-600 dark:text-red-400">
                    <ShieldBan className="h-3 w-3" /> {c.bloqueo_contador} calif. negativas
                  </span>
                  {c.fecha_bloqueo && (
                    <span className="rounded-full bg-muted px-2 py-0.5 text-[11px] text-muted-foreground">
                      {new Date(c.fecha_bloqueo).toLocaleDateString("es-CR", { day: "2-digit", month: "short", year: "numeric" })}
                    </span>
                  )}
                </div>
                {c.motivo_bloqueo && (
                  <p className="text-xs text-muted-foreground italic mt-1">{c.motivo_bloqueo}</p>
                )}
              </div>
              {puedeDesbloquear && (
                <button
                  onClick={() => desbloquear(c.cedula)}
                  disabled={desbloqueando === c.cedula}
                  className="shrink-0 flex items-center gap-1.5 rounded-lg bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-700 dark:text-emerald-400 border border-emerald-500/20 px-3 py-1.5 text-xs font-semibold transition-colors disabled:opacity-50"
                >
                  <ShieldCheck className="h-3.5 w-3.5" />
                  {desbloqueando === c.cedula ? "Desbloqueando..." : "Desbloquear"}
                </button>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
