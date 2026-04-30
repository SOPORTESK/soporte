"use client";
import * as React from "react";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Avatar, Badge } from "@/components/ui/avatar";
import { toast } from "sonner";
import { ShieldAlert, Smartphone, MessageCircle, Plus, Save, KeyRound, Users } from "lucide-react";
import type { SekAgent, SekChannel } from "@/lib/types";

export function SettingsClient({
  agent, agents: initialAgents, channels: initialChannels, isAdmin
}: { agent: SekAgent; agents: SekAgent[]; channels: SekChannel[]; isAdmin: boolean }) {
  const supabase = React.useMemo(() => createClient(), []);
  const [channels, setChannels] = React.useState(initialChannels);
  const [agents, setAgents] = React.useState(initialAgents);
  const [nombre, setNombre] = React.useState(agent?.nombre || "");
  const [apellido, setApellido] = React.useState(agent?.apellido || "");

  async function saveProfile() {
    const { error } = await supabase.from("sek_agent_config")
      .update({ nombre, apellido }).ilike("email", agent.email);
    if (error) toast.error(error.message); else toast.success("Perfil actualizado");
  }

  return (
    <div className="max-w-4xl mx-auto p-6 space-y-8">
      <header>
        <h1 className="text-3xl font-bold">Configuración</h1>
        <p className="text-muted-foreground mt-1">Tu perfil, agentes del equipo y canales de atención.</p>
      </header>

      {/* Mi perfil */}
      <section className="rounded-xl border border-border bg-card p-6 space-y-4">
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
        <Button onClick={saveProfile}><Save className="h-4 w-4" /> Guardar</Button>
      </section>

      {/* Agentes del equipo */}
      <section className="rounded-xl border border-border bg-card p-6 space-y-4">
        <h2 className="font-semibold flex items-center gap-2"><Users className="h-4 w-4" /> Equipo ({agents.length})</h2>
        <ul className="divide-y divide-border">
          {agents.map(a => {
            const fullName = [a.nombre, a.apellido].filter(Boolean).join(" ") || a.email;
            return (
              <li key={a.email} className="py-3 flex items-center gap-3">
                <Avatar name={fullName} size={36} />
                <div className="flex-1 min-w-0">
                  <p className="font-medium truncate">{fullName}</p>
                  <p className="text-xs text-muted-foreground truncate">{a.email}</p>
                </div>
                <Badge variant={a.rol === "superadmin" ? "danger" : a.rol === "admin" ? "warning" : "default"} className="capitalize">{a.rol}</Badge>
              </li>
            );
          })}
        </ul>
      </section>

      {/* Canales */}
      <section className="rounded-xl border border-border bg-card p-6 space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="font-semibold flex items-center gap-2"><Smartphone className="h-4 w-4" /> Canales</h2>
          {isAdmin && <NewChannelDialog onCreated={c => setChannels(prev => [...prev, c])} />}
        </div>

        {channels.length === 0 && (
          <div className="text-sm text-muted-foreground p-6 text-center border border-dashed border-border rounded-lg">
            No hay canales configurados. {isAdmin && "Crea uno para empezar."}
          </div>
        )}

        <ul className="divide-y divide-border">
          {channels.map(c => (
            <li key={c.id} className="py-3 flex items-center justify-between gap-3">
              <div className="flex items-center gap-3">
                <div className="h-10 w-10 grid place-items-center rounded-lg bg-brand-100 dark:bg-brand-900/40 text-brand-700 dark:text-brand-300">
                  {c.kind === "whatsapp" ? <MessageCircle className="h-4 w-4" /> : <Smartphone className="h-4 w-4" />}
                </div>
                <div>
                  <p className="font-medium">{c.name}</p>
                  <p className="text-xs text-muted-foreground capitalize">{c.kind}</p>
                </div>
              </div>
              <Badge variant={c.is_active ? "success" : "muted"}>{c.is_active ? "Activo" : "Inactivo"}</Badge>
            </li>
          ))}
        </ul>

        {isAdmin && (
          <div className="rounded-lg bg-[hsl(var(--warning)/.1)] border border-[hsl(var(--warning)/.4)] p-4 text-sm flex gap-2">
            <ShieldAlert className="h-4 w-4 mt-0.5 text-[hsl(var(--warning))] shrink-0" />
            <div>
              <p className="font-medium">Webhook de WhatsApp</p>
              <p className="text-muted-foreground break-all">
                <code className="px-1 rounded bg-muted">{process.env.NEXT_PUBLIC_SUPABASE_URL}/functions/v1/whatsapp-webhook</code>
              </p>
              <p className="text-muted-foreground mt-1">Usa el <em>Verify Token</em> que guardes al crear el canal.</p>
            </div>
          </div>
        )}
      </section>
    </div>
  );
}

function NewChannelDialog({ onCreated }: { onCreated: (c: SekChannel) => void }) {
  const supabase = React.useMemo(() => createClient(), []);
  const [open, setOpen] = React.useState(false);
  const [name, setName] = React.useState("WhatsApp principal");
  const [phoneNumberId, setPhoneNumberId] = React.useState("");
  const [accessToken, setAccessToken] = React.useState("");
  const [verifyToken, setVerifyToken] = React.useState("");
  const [saving, setSaving] = React.useState(false);

  async function save() {
    setSaving(true);
    try {
      const { data, error } = await supabase.from("sek_channels").insert({
        kind: "whatsapp", name, is_active: true,
        config: { phone_number_id: phoneNumberId, access_token: accessToken, verify_token: verifyToken }
      }).select().single();
      if (error) throw error;
      toast.success("Canal creado");
      onCreated(data as any);
      setOpen(false);
    } catch (e: any) { toast.error(e?.message || "Error al crear"); }
    finally { setSaving(false); }
  }

  if (!open) return <Button variant="outline" onClick={() => setOpen(true)}><Plus className="h-4 w-4" /> Nuevo canal WhatsApp</Button>;

  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-foreground/40 p-4" role="dialog" aria-modal="true">
      <div className="w-full max-w-md rounded-xl bg-card border border-border p-6 space-y-4 shadow-2xl">
        <h3 className="text-lg font-semibold">Nuevo canal WhatsApp</h3>
        <p className="text-sm text-muted-foreground">Necesitas tu cuenta de WhatsApp Business Platform (Meta Cloud API).</p>
        <div className="space-y-3">
          <div>
            <label className="text-sm font-medium">Nombre interno</label>
            <Input value={name} onChange={e => setName(e.target.value)} className="mt-1" />
          </div>
          <div>
            <label className="text-sm font-medium">Phone Number ID</label>
            <Input value={phoneNumberId} onChange={e => setPhoneNumberId(e.target.value)} className="mt-1" />
          </div>
          <div>
            <label className="text-sm font-medium">Access Token (permanente)</label>
            <Input type="password" value={accessToken} onChange={e => setAccessToken(e.target.value)} className="mt-1" />
          </div>
          <div>
            <label className="text-sm font-medium">Verify Token (lo eliges tú)</label>
            <Input value={verifyToken} onChange={e => setVerifyToken(e.target.value)} className="mt-1" placeholder="cadena_aleatoria_segura" />
          </div>
        </div>
        <div className="flex justify-end gap-2 pt-2">
          <Button variant="ghost" onClick={() => setOpen(false)}>Cancelar</Button>
          <Button onClick={save} loading={saving}><Save className="h-4 w-4" /> Guardar</Button>
        </div>
      </div>
    </div>
  );
}
