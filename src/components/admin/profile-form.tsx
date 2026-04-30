"use client";
import * as React from "react";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Save, KeyRound } from "lucide-react";
import { toast } from "sonner";
import type { SekAgent } from "@/lib/types";

export function ProfileForm({ agent }: { agent: SekAgent }) {
  const supabase = React.useMemo(() => createClient(), []);
  const [nombre, setNombre] = React.useState(agent?.nombre || "");
  const [apellido, setApellido] = React.useState(agent?.apellido || "");
  const [saving, setSaving] = React.useState(false);

  async function save() {
    setSaving(true);
    const { error } = await supabase.from("sek_agent_config")
      .update({ nombre, apellido }).ilike("email", agent.email);
    if (error) toast.error(error.message); else toast.success("Perfil actualizado");
    setSaving(false);
  }

  return (
    <section className="rounded-2xl border border-border bg-card p-6 space-y-4">
      <h2 className="font-semibold flex items-center gap-2"><KeyRound className="h-4 w-4" /> Mi perfil</h2>
      <div className="grid sm:grid-cols-3 gap-4">
        <div>
          <label className="text-sm font-medium">Nombre</label>
          <Input value={nombre} onChange={e => setNombre(e.target.value)} className="mt-1" />
        </div>
        <div>
          <label className="text-sm font-medium">Apellido</label>
          <Input value={apellido} onChange={e => setApellido(e.target.value)} className="mt-1" />
        </div>
        <div>
          <label className="text-sm font-medium">Rol</label>
          <Input value={agent?.rol || ""} disabled className="mt-1 capitalize" />
        </div>
      </div>
      <div>
        <label className="text-sm font-medium">Email (no editable)</label>
        <Input value={agent?.email || ""} disabled className="mt-1" />
      </div>
      <Button onClick={save} loading={saving}><Save className="h-4 w-4" /> Guardar</Button>
    </section>
  );
}
