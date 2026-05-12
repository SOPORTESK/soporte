"use client";
import * as React from "react";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/avatar";
import { toast } from "sonner";
import { ShieldAlert, Smartphone, MessageCircle, Plus, Save, Copy } from "lucide-react";
import type { SekChannel } from "@/lib/types";

export function ChannelsClient({ channels: initial }: { channels: SekChannel[] }) {
  const [channels, setChannels] = React.useState(initial);

  return (
    <div className="max-w-5xl mx-auto p-6 lg:p-8 space-y-6">
      <header className="flex items-end justify-between gap-3">
        <div>
          <p className="text-xs font-bold uppercase tracking-[0.2em] text-brand-700 dark:text-brand-300">Plataforma</p>
          <h1 className="text-3xl font-bold mt-1 flex items-center gap-3">
            <MessageCircle className="h-7 w-7" /> Canales
          </h1>
          <p className="text-muted-foreground mt-1">WhatsApp, Messenger y más canales de atención.</p>
        </div>
        <NewChannelDialog onCreated={c => setChannels(prev => [...prev, c])} />
      </header>

      {channels.length === 0 && (
        <div className="rounded-2xl border border-dashed border-border p-12 text-center text-muted-foreground bg-card">
          No hay canales configurados. Crea uno para empezar a recibir mensajes.
        </div>
      )}

      <ul className="grid gap-3 sm:grid-cols-2">
        {channels.map(c => (
          <li key={c.id} className="rounded-2xl border border-border bg-card p-5 flex items-start gap-4 hover:shadow-lg transition-all">
            <div className="h-12 w-12 grid place-items-center rounded-xl bg-gradient-to-br from-emerald-500 to-emerald-600 text-white shrink-0 shadow-md">
              {c.kind === "whatsapp" ? <MessageCircle className="h-5 w-5" /> : <Smartphone className="h-5 w-5" />}
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center justify-between gap-2">
                <p className="font-semibold truncate">{c.name}</p>
                <Badge variant={c.is_active ? "success" : "muted"}>{c.is_active ? "Activo" : "Inactivo"}</Badge>
              </div>
              <p className="text-xs text-muted-foreground capitalize mt-0.5">{c.kind}</p>
              {c.kind === "whatsapp" && (
                <p className="text-xs text-muted-foreground mt-1 truncate">
                  Phone ID: <code className="rounded bg-muted px-1">{(c.config as any)?.phone_number_id || "—"}</code>
                </p>
              )}
            </div>
          </li>
        ))}
      </ul>

      <div className="rounded-2xl bg-[hsl(var(--warning)/.08)] border border-[hsl(var(--warning)/.4)] p-5 text-sm flex gap-3">
        <ShieldAlert className="h-5 w-5 mt-0.5 text-[hsl(var(--warning))] shrink-0" />
        <div className="min-w-0 flex-1">
          <p className="font-semibold mb-2">Webhook de WhatsApp Cloud API</p>
          <p className="text-muted-foreground">Configura este URL en Meta Developers → WhatsApp → Configuration:</p>
          <CopyableUrl url={`${process.env.NEXT_PUBLIC_SUPABASE_URL}/functions/v1/whatsapp-webhook`} />
          <p className="text-muted-foreground mt-2">Como <em>Verify Token</em>, usa el que guardes al crear el canal.</p>
        </div>
      </div>
    </div>
  );
}

function CopyableUrl({ url }: { url: string }) {
  return (
    <div className="mt-2 flex items-center gap-2 rounded-lg bg-muted p-2">
      <code className="text-xs flex-1 truncate">{url}</code>
      <button
        onClick={() => { navigator.clipboard.writeText(url); toast.success("Copiado"); }}
        className="p-1.5 rounded-md hover:bg-background transition-colors"
        aria-label="Copiar URL" title="Copiar"
      >
        <Copy className="h-3.5 w-3.5" />
      </button>
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

  if (!open) return <Button onClick={() => setOpen(true)}><Plus className="h-4 w-4" /> Nuevo canal</Button>;

  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-foreground/40 backdrop-blur-sm p-4" role="dialog" aria-modal="true">
      <div className="w-full max-w-md rounded-2xl bg-card border border-border p-6 space-y-4 shadow-2xl">
        <h3 className="text-lg font-semibold">Nuevo canal WhatsApp</h3>
        <p className="text-sm text-muted-foreground">Necesitas tu cuenta de WhatsApp Business Platform (Meta Cloud API).</p>
        <div className="space-y-3">
          <div>
            <label className="text-sm font-medium">Nombre interno</label>
            <Input value={name} onChange={e => setName(e.target.value)} className="mt-1" />
          </div>
          <div>
            <label className="text-sm font-medium">Phone Number ID</label>
            <Input value={phoneNumberId} onChange={e => setPhoneNumberId(e.target.value)} className="mt-1" placeholder="123456789012345" />
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
