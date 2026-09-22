"use client";

import * as React from "react";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Save, UserCheck, Shield, Mail, CheckCircle2 } from "lucide-react";
import { toast } from "sonner";
import type { SekAgent } from "@/lib/types";

export function ProfileForm({ agent }: { agent: SekAgent }) {
  const supabase = React.useMemo(() => createClient(), []);
  const [nombre, setNombre] = React.useState(agent?.nombre || "");
  const [apellido, setApellido] = React.useState(agent?.apellido || "");
  const [saving, setSaving] = React.useState(false);
  const [savedSuccess, setSavedSuccess] = React.useState(false);

  const initial = (nombre?.[0] || agent?.email?.[0] || "U").toUpperCase();
  const fullName = [nombre, apellido].filter(Boolean).join(" ") || agent?.email || "Operador";

  const rolColor =
    agent?.rol === "superadmin"
      ? "text-rose-500 bg-rose-500/10 border-rose-500/20"
      : agent?.rol === "admin"
      ? "text-amber-500 bg-amber-500/10 border-amber-500/20"
      : "text-violet-500 bg-violet-500/10 border-violet-500/20";

  async function save() {
    if (!agent?.email) return;
    setSaving(true);
    const { error } = await supabase
      .from("sek_agent_config")
      .update({ nombre: nombre.trim(), apellido: apellido.trim() })
      .ilike("email", agent.email);

    if (error) {
      toast.error(error.message || "Error al actualizar perfil");
    } else {
      setSavedSuccess(true);
      toast.success("Perfil de operador actualizado con éxito");
      setTimeout(() => setSavedSuccess(false), 3000);
    }
    setSaving(false);
  }

  return (
    <section className="rounded-2xl border border-border/60 bg-card p-5 lg:p-6 shadow-xs space-y-5">
      {/* Encabezado */}
      <div className="flex items-center justify-between gap-3 border-b border-border/50 pb-4">
        <div className="flex items-center gap-3">
          <div className="h-9 w-9 rounded-xl bg-amber-500/15 border border-amber-500/30 text-amber-500 grid place-items-center shrink-0">
            <UserCheck className="h-4.5 w-4.5" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-sm font-black text-foreground">Mi Perfil y Credenciales</h2>
              <span className={`text-[10px] font-black uppercase px-2 py-0.5 rounded-full border ${rolColor}`}>
                {agent?.rol || "operador"}
              </span>
            </div>
            <p className="text-[11px] text-muted-foreground mt-0.5">
              Identidad del operador y parámetros de sesión en la plataforma.
            </p>
          </div>
        </div>

        {/* Avatar badge */}
        <div className="hidden sm:flex items-center gap-2 px-3 py-1.5 rounded-xl bg-muted/30 border border-border/50">
          <div className="h-7 w-7 rounded-lg bg-gradient-to-br from-brand-500 to-brand-600 text-white font-black text-xs grid place-items-center shadow-xs">
            {initial}
          </div>
          <div className="text-right">
            <p className="text-xs font-bold leading-none">{fullName}</p>
            <p className="text-[10px] text-muted-foreground font-mono">{agent?.email}</p>
          </div>
        </div>
      </div>

      {/* Cuadrícula balanceada de campos (2x2) */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div>
          <label className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground mb-1.5 block">
            Nombre
          </label>
          <Input
            value={nombre}
            onChange={(e) => setNombre(e.target.value)}
            placeholder="Tu nombre"
            className="h-9 text-xs font-medium"
          />
        </div>

        <div>
          <label className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground mb-1.5 block">
            Apellido
          </label>
          <Input
            value={apellido}
            onChange={(e) => setApellido(e.target.value)}
            placeholder="Tu apellido"
            className="h-9 text-xs font-medium"
          />
        </div>

        <div>
          <label className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground mb-1.5 flex items-center gap-1.5">
            <Mail className="h-3 w-3" /> Correo de Acceso (Inmutable)
          </label>
          <Input
            value={agent?.email || ""}
            disabled
            className="h-9 text-xs font-mono bg-muted/40 text-muted-foreground cursor-not-allowed"
          />
        </div>

        <div>
          <label className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground mb-1.5 flex items-center gap-1.5">
            <Shield className="h-3 w-3" /> Nivel de Permisos
          </label>
          <Input
            value={agent?.rol ? agent.rol.toUpperCase() : "OPERADOR"}
            disabled
            className="h-9 text-xs font-bold tracking-wider bg-muted/40 text-muted-foreground cursor-not-allowed"
          />
        </div>
      </div>

      {/* Barra de acción */}
      <div className="flex items-center justify-between pt-3 border-t border-border/40">
        <p className="text-[10px] text-muted-foreground">
          Los cambios se sincronizan en caliente con tu sesión actual.
        </p>
        <Button
          onClick={save}
          loading={saving}
          disabled={saving}
          className={`h-9 px-5 rounded-xl text-xs font-bold transition-all flex items-center gap-2 shadow-xs ${
            savedSuccess
              ? "bg-emerald-600 text-white shadow-emerald-600/20"
              : "bg-brand-600 hover:bg-brand-500 text-white shadow-brand-600/20"
          }`}
        >
          {savedSuccess ? (
            <>
              <CheckCircle2 className="h-4 w-4" />
              <span>Guardado</span>
            </>
          ) : (
            <>
              <Save className="h-4 w-4" />
              <span>Guardar Perfil</span>
            </>
          )}
        </Button>
      </div>
    </section>
  );
}
