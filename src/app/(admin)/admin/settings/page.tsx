import { createClient } from "@/lib/supabase/server";
import { ProfileForm } from "@/components/admin/profile-form";
import { DangerZonePanel } from "@/components/admin/danger-zone-panel";
import {
  Settings,
  Server,
  Database,
  Cloud,
  ShieldCheck,
  ShieldAlert,
  Webhook,
  Activity,
  CheckCircle2,
  Cpu,
  Layers,
} from "lucide-react";
import { Badge } from "@/components/ui/avatar";
import type { SekAgent } from "@/lib/types";
import { IaModeToggle } from "@/components/admin/ia-mode-toggle";
import { UnattendedModeToggle } from "@/components/admin/unattended-mode-toggle";
import { CompanySchedulePanel } from "@/components/admin/company-schedule-panel";
import { AutoCloseConfigPanel } from "@/components/admin/auto-close-config-panel";

export const dynamic = "force-dynamic";

export default async function AdminSettingsPage() {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const { data: agent } = await supabase
    .from("sek_agent_config")
    .select("*")
    .ilike("email", user!.email!)
    .maybeSingle();

  const isSuperadmin = agent?.rol === "superadmin";
  const isAdmin = agent?.rol === "admin" || isSuperadmin;

  const { data: allAgents } = isAdmin
    ? await supabase
        .from("sek_agent_config")
        .select("email, nombre, apellido, rol, status, last_login, created_at")
        .order("created_at")
    : { data: [] };

  const { data: iaConfig } = await supabase
    .from("sek_agent_config")
    .select("ia_activa")
    .eq("email", "system_prompt@sekunet.com")
    .maybeSingle();
  const iaActiva = iaConfig?.ia_activa ?? true;

  const { data: unattendedConfig } = await supabase
    .from("sek_agent_config")
    .select("modo_no_atendido")
    .eq("email", "system_prompt@sekunet.com")
    .maybeSingle();
  const modoNoAtendido = unattendedConfig?.modo_no_atendido ?? false;

  const { count: msgCount } = isSuperadmin
    ? await supabase.from("sek_messages").select("id", { count: "exact", head: true })
    : { count: null };

  const { count: caseCount } = await supabase
    .from("sek_cases")
    .select("id", { count: "exact", head: true });

  const nowStr = new Date().toLocaleString("es-CR", {
    timeZone: "America/Costa_Rica",
    dateStyle: "long",
    timeStyle: "short",
  });

  return (
    <div className="max-w-[1500px] mx-auto p-4 md:p-6 xl:p-8 space-y-6">
      {/* ── Header premium ── */}
      <header className="relative overflow-hidden rounded-3xl border border-border/60 bg-gradient-to-br from-card via-card to-muted/20 p-6 lg:p-8">
        <div className="absolute -top-20 -right-20 w-72 h-72 bg-brand-500/6 rounded-full blur-[80px] pointer-events-none" />
        <div className="relative flex flex-col lg:flex-row lg:items-end lg:justify-between gap-4">
          <div>
            <div className="flex items-center gap-2.5 mb-3">
              <div className="h-7 w-7 rounded-lg bg-gradient-to-br from-brand-500 to-brand-600 text-white grid place-items-center shadow-lg shadow-brand-500/25">
                <Settings className="h-3.5 w-3.5" />
              </div>
              <p className="text-[10px] font-black uppercase tracking-[0.3em] text-brand-500">
                Plataforma · Administración
              </p>
            </div>
            <h1 className="text-2xl lg:text-3xl font-black tracking-tight">Configuración del Sistema</h1>
            <p className="text-xs lg:text-sm text-muted-foreground mt-1 max-w-2xl">
              Gestión centralizada de jornadas laborales, auto-cierre, credenciales del operador e infraestructura en la nube.
            </p>
          </div>

          <div className="flex items-center gap-3 shrink-0 flex-wrap">
            <div className="px-3.5 py-2 rounded-xl border border-border/60 bg-card/70 text-center shadow-xs">
              <p className="text-lg font-black tabular-nums text-brand-500">
                {caseCount?.toLocaleString("es-CR") ?? "—"}
              </p>
              <p className="text-[9px] text-muted-foreground font-bold uppercase tracking-wider">Casos Totales</p>
            </div>
            {isSuperadmin && (
              <div className="px-3.5 py-2 rounded-xl border border-rose-500/20 bg-rose-500/5 text-center shadow-xs">
                <p className="text-lg font-black tabular-nums text-rose-500">
                  {msgCount?.toLocaleString("es-CR") ?? "—"}
                </p>
                <p className="text-[9px] text-muted-foreground font-bold uppercase tracking-wider">Mensajes en BD</p>
              </div>
            )}
            <div className="px-3.5 py-2 rounded-xl border border-border/60 bg-card/70 text-center shadow-xs">
              <p className="text-lg font-black tabular-nums text-violet-500">
                {allAgents?.length ?? "—"}
              </p>
              <p className="text-[9px] text-muted-foreground font-bold uppercase tracking-wider">Agentes Activos</p>
            </div>
            <div className="px-3.5 py-2 rounded-xl border border-border/60 bg-card/70 text-center shadow-xs hidden sm:block">
              <p className="text-xs font-mono font-bold text-foreground">Costa Rica (UTC-6)</p>
              <p className="text-[9px] text-muted-foreground font-bold uppercase tracking-wider">{nowStr}</p>
            </div>
          </div>
        </div>
      </header>

      {/* ── Controles Maestros de Operación (Side by Side en 2 Columnas) ── */}
      {isAdmin && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <IaModeToggle initialValue={iaActiva} />
          <UnattendedModeToggle initialValue={modoNoAtendido} />
        </div>
      )}

      {/* ── Cuadrícula Principal Balanceada en 2 Columnas (Aprovechamiento 100% de Espacio) ── */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 items-start">
        {/* ── Columna 1: Horarios de Jornada + Perfil del Operador ── */}
        <div className="space-y-6">
          {/* Horario y Jornada Laboral Oficial */}
          <CompanySchedulePanel />

          {/* Mi Perfil de Operador */}
          <ProfileForm agent={agent as SekAgent} />
        </div>

        {/* ── Columna 2: Políticas de Cierre + Infraestructura y Servicios ── */}
        <div className="space-y-6">
          {/* Auto-Cierre por Inactividad */}
          <AutoCloseConfigPanel />

          {/* Infraestructura y Servidores en Nube */}
          <section className="rounded-2xl border border-border/60 bg-card p-5 lg:p-6 shadow-xs space-y-4">
            <div className="flex items-center justify-between gap-3 border-b border-border/50 pb-3">
              <div className="flex items-center gap-3">
                <div className="h-9 w-9 rounded-xl bg-sky-500/15 border border-sky-500/30 text-sky-500 grid place-items-center shrink-0">
                  <Database className="h-4.5 w-4.5" />
                </div>
                <div>
                  <h2 className="text-sm font-black text-foreground">Infraestructura & Servidores en Nube</h2>
                  <p className="text-[11px] text-muted-foreground mt-0.5">
                    Servicios activos, instancias cloud y pasarelas de mensajería.
                  </p>
                </div>
              </div>
              <Badge variant="success" className="text-[10px] font-bold shrink-0">
                100% Operativo
              </Badge>
            </div>

            {/* Grid 2x2 de componentes de infraestructura */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {/* Oracle Cloud VPS */}
              <div className="p-3.5 rounded-xl bg-muted/25 border border-border/50 flex flex-col justify-between">
                <div>
                  <div className="flex items-center justify-between mb-1.5">
                    <div className="flex items-center gap-1.5">
                      <Cloud className="h-3.5 w-3.5 text-amber-500" />
                      <p className="text-xs font-bold">Oracle Cloud VPS</p>
                    </div>
                    <span className="text-[9px] font-mono font-bold text-amber-500 bg-amber-500/10 px-1.5 py-0.5 rounded">
                      129.146.7.74
                    </span>
                  </div>
                  <p className="text-[10px] text-muted-foreground leading-relaxed">
                    Instancia dedicada con Evolution API (puerto 7001) y Chatwoot (puerto 3000).
                  </p>
                </div>
                <div className="mt-2.5 pt-2 border-t border-border/40 flex items-center justify-between text-[10px]">
                  <span className="text-muted-foreground">Estado VPS:</span>
                  <span className="font-bold text-emerald-500 flex items-center gap-1">
                    <CheckCircle2 className="h-3 w-3" /> En línea
                  </span>
                </div>
              </div>

              {/* Supabase Database */}
              <div className="p-3.5 rounded-xl bg-muted/25 border border-border/50 flex flex-col justify-between">
                <div>
                  <div className="flex items-center justify-between mb-1.5">
                    <div className="flex items-center gap-1.5">
                      <Database className="h-3.5 w-3.5 text-emerald-500" />
                      <p className="text-xs font-bold">Supabase Cloud</p>
                    </div>
                    <span className="text-[9px] font-mono font-bold text-emerald-500 bg-emerald-500/10 px-1.5 py-0.5 rounded">
                      PostgreSQL
                    </span>
                  </div>
                  <p className="text-[10px] text-muted-foreground leading-relaxed">
                    Almacenamiento relacional, autenticación SSR y base de vectores para RAG.
                  </p>
                </div>
                <div className="mt-2.5 pt-2 border-t border-border/40 flex items-center justify-between text-[10px]">
                  <span className="text-muted-foreground">Realtime & Presencia:</span>
                  <span className="font-bold text-emerald-500 flex items-center gap-1">
                    <CheckCircle2 className="h-3 w-3" /> Conectado
                  </span>
                </div>
              </div>

              {/* Webhooks de Entrada */}
              <div className="p-3.5 rounded-xl bg-muted/25 border border-border/50 flex flex-col justify-between">
                <div>
                  <div className="flex items-center justify-between mb-1.5">
                    <div className="flex items-center gap-1.5">
                      <Webhook className="h-3.5 w-3.5 text-violet-500" />
                      <p className="text-xs font-bold">Pasarelas Webhooks</p>
                    </div>
                    <span className="text-[9px] font-bold text-violet-500 bg-violet-500/10 px-1.5 py-0.5 rounded">
                      Next.js API
                    </span>
                  </div>
                  <p className="text-[10px] text-muted-foreground leading-relaxed">
                    Endpoints activos para WhatsApp (Evolution), Chatwoot y Widget Web en tiempo real.
                  </p>
                </div>
                <div className="mt-2.5 pt-2 border-t border-border/40 flex items-center justify-between text-[10px]">
                  <span className="text-muted-foreground">Enrutador:</span>
                  <span className="font-mono font-bold text-foreground">/api/webhooks/*</span>
                </div>
              </div>

              {/* Edge & Background Workers */}
              <div className="p-3.5 rounded-xl bg-muted/25 border border-border/50 flex flex-col justify-between">
                <div>
                  <div className="flex items-center justify-between mb-1.5">
                    <div className="flex items-center gap-1.5">
                      <Cpu className="h-3.5 w-3.5 text-sky-500" />
                      <p className="text-xs font-bold">Procesos & IA</p>
                    </div>
                    <span className="text-[9px] font-bold text-sky-500 bg-sky-500/10 px-1.5 py-0.5 rounded">
                      Serverless
                    </span>
                  </div>
                  <p className="text-[10px] text-muted-foreground leading-relaxed">
                    Gemini Flash Lite para inferencia, auto-cierre periódico y extracción de datos.
                  </p>
                </div>
                <div className="mt-2.5 pt-2 border-t border-border/40 flex items-center justify-between text-[10px]">
                  <span className="text-muted-foreground">Motor IA:</span>
                  <span className="font-bold text-sky-500">Gemini 2.5 Flash</span>
                </div>
              </div>
            </div>
          </section>
        </div>
      </div>

      {/* ── Zona de Peligro — Solo Superadmin (Full Width al final) ── */}
      {isSuperadmin && (
        <section className="rounded-2xl border border-rose-500/30 bg-rose-500/5 p-5 lg:p-6 space-y-4 shadow-xs">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-rose-500/20 pb-3">
            <div className="flex items-center gap-3">
              <div className="h-9 w-9 rounded-xl bg-rose-500/15 border border-rose-500/30 text-rose-500 grid place-items-center shrink-0">
                <ShieldAlert className="h-4.5 w-4.5" />
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <h2 className="text-sm font-black text-rose-500">Zona de Peligro · Reset Operacional</h2>
                  <Badge variant="danger" className="text-[10px] font-black">
                    Acción Crítica
                  </Badge>
                </div>
                <p className="text-[11px] text-muted-foreground mt-0.5">
                  Elimina todos los chats, mensajes y clientes acumulados para arrancar en limpio en producción.
                </p>
              </div>
            </div>
            <span className="text-[10px] font-bold text-rose-500 bg-rose-500/10 px-2.5 py-1 rounded-lg border border-rose-500/20 self-start sm:self-auto">
              Solo Superadministrador
            </span>
          </div>

          <p className="text-xs text-muted-foreground border-l-2 border-rose-500/40 pl-3 leading-relaxed">
            Se conservan intactos: <strong className="text-foreground">prompt del sistema</strong>,{" "}
            <strong className="text-foreground">agentes</strong>,{" "}
            <strong className="text-foreground">inventario</strong>,{" "}
            <strong className="text-foreground">manuales técnicos</strong> y{" "}
            <strong className="text-foreground">vectores de conocimiento RAG</strong>.{" "}
            <strong className="text-rose-500">Esta acción es permanente e irreversible.</strong>
          </p>

          <DangerZonePanel />
        </section>
      )}
    </div>
  );
}
