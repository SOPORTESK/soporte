"use client";

import * as React from "react";
import { MessageSquare, BarChart3, Users, Bot, ArrowDownLeft, ArrowUpRight } from "lucide-react";
import { cn } from "@/lib/utils";

export interface MessageStatsData {
  totalClientes: number;
  totalTecnicos: number;
  totalIA: number;
  totalGlobal: number;
  agentStats: {
    email: string;
    nombre: string;
    enviados: number;
    recibidos: number;
    casos: number;
  }[];
  topClientes: {
    nombre: string;
    telefono: string;
    total: number;
  }[];
}

export function MessageVolumeTabs({
  stats,
  children,
}: {
  stats: MessageStatsData;
  children: React.ReactNode;
}) {
  const [activeTab, setActiveTab] = React.useState<"rendimiento" | "mensajeria">("rendimiento");
  const [searchClient, setSearchClient] = React.useState("");

  const filteredClients = React.useMemo(() => {
    if (!searchClient.trim()) return stats.topClientes.slice(0, 15);
    const q = searchClient.toLowerCase();
    return stats.topClientes.filter(c => c.nombre.toLowerCase().includes(q) || c.telefono.includes(q)).slice(0, 15);
  }, [stats.topClientes, searchClient]);

  const maxAgentMsgs = Math.max(...stats.agentStats.map(a => Math.max(a.enviados, a.recibidos)), 1);

  return (
    <div className="space-y-6">
      {/* Selector de Pestañas Superior */}
      <div className="flex items-center justify-between border-b border-border/60 pb-3">
        <div className="inline-flex p-1 rounded-2xl bg-muted/50 border border-border/60 gap-1">
          <button
            onClick={() => setActiveTab("rendimiento")}
            className={cn(
              "flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold transition-all",
              activeTab === "rendimiento"
                ? "bg-brand-600 text-white shadow-md shadow-brand-600/20"
                : "text-muted-foreground hover:text-foreground hover:bg-muted/40"
            )}
          >
            <BarChart3 className="h-4 w-4" />
            <span>Rendimiento y SLA</span>
          </button>

          <button
            onClick={() => setActiveTab("mensajeria")}
            className={cn(
              "flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold transition-all relative",
              activeTab === "mensajeria"
                ? "bg-brand-600 text-white shadow-md shadow-brand-600/20"
                : "text-muted-foreground hover:text-foreground hover:bg-muted/40"
            )}
          >
            <MessageSquare className="h-4 w-4" />
            <span>Volumen de Mensajes</span>
            <span className="ml-1 px-1.5 py-0.5 rounded-full text-[10px] bg-sky-500/20 text-sky-400 font-black">
              Nuevo
            </span>
          </button>
        </div>

        <div className="text-right hidden sm:block">
          <p className="text-[11px] font-medium text-muted-foreground">
            {activeTab === "rendimiento" ? "Métricas de resolución y tiempos de atención" : "Conteo exacto mensaje por mensaje"}
          </p>
        </div>
      </div>

      {/* Pestaña 1: Rendimiento y SLA (Contenido Actual Intacto) */}
      {activeTab === "rendimiento" && (
        <div className="space-y-6">
          {children}
        </div>
      )}

      {/* Pestaña 2: Volumen de Mensajes (Nueva Pestaña Separada) */}
      {activeTab === "mensajeria" && (
        <div className="space-y-6 animate-in fade-in-50 duration-200">
          {/* Tarjetas KPI de Mensajería */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {/* Mensajes Clientes */}
            <div className="rounded-2xl border border-sky-500/20 bg-gradient-to-br from-sky-500/10 via-background to-background p-4 relative overflow-hidden">
              <div className="flex items-center justify-between">
                <span className="text-[11px] font-black uppercase tracking-wider text-sky-400">Mensajes de Clientes</span>
                <div className="h-8 w-8 rounded-xl bg-sky-500/10 grid place-items-center text-sky-400">
                  <ArrowDownLeft className="h-4 w-4" />
                </div>
              </div>
              <p className="text-2xl font-black mt-2 text-foreground">{stats.totalClientes.toLocaleString()}</p>
              <p className="text-[10px] text-muted-foreground mt-1">Mensajes entrantes recibidos</p>
            </div>

            {/* Mensajes Técnicos */}
            <div className="rounded-2xl border border-emerald-500/20 bg-gradient-to-br from-emerald-500/10 via-background to-background p-4 relative overflow-hidden">
              <div className="flex items-center justify-between">
                <span className="text-[11px] font-black uppercase tracking-wider text-emerald-400">Mensajes de Técnicos</span>
                <div className="h-8 w-8 rounded-xl bg-emerald-500/10 grid place-items-center text-emerald-400">
                  <ArrowUpRight className="h-4 w-4" />
                </div>
              </div>
              <p className="text-2xl font-black mt-2 text-foreground">{stats.totalTecnicos.toLocaleString()}</p>
              <p className="text-[10px] text-muted-foreground mt-1">Respuestas humanas enviadas</p>
            </div>

            {/* Mensajes Asistente IA */}
            <div className="rounded-2xl border border-purple-500/20 bg-gradient-to-br from-purple-500/10 via-background to-background p-4 relative overflow-hidden">
              <div className="flex items-center justify-between">
                <span className="text-[11px] font-black uppercase tracking-wider text-purple-400">Mensajes de IA / Bot</span>
                <div className="h-8 w-8 rounded-xl bg-purple-500/10 grid place-items-center text-purple-400">
                  <Bot className="h-4 w-4" />
                </div>
              </div>
              <p className="text-2xl font-black mt-2 text-foreground">{stats.totalIA.toLocaleString()}</p>
              <p className="text-[10px] text-muted-foreground mt-1">Interacciones automáticas</p>
            </div>

            {/* Total Acumulado */}
            <div className="rounded-2xl border border-brand-500/20 bg-gradient-to-br from-brand-500/10 via-background to-background p-4 relative overflow-hidden">
              <div className="flex items-center justify-between">
                <span className="text-[11px] font-black uppercase tracking-wider text-brand-400">Total Mensajes</span>
                <div className="h-8 w-8 rounded-xl bg-brand-500/10 grid place-items-center text-brand-400">
                  <MessageSquare className="h-4 w-4" />
                </div>
              </div>
              <p className="text-2xl font-black mt-2 text-foreground">{stats.totalGlobal.toLocaleString()}</p>
              <p className="text-[10px] text-muted-foreground mt-1">Volumen total procesado</p>
            </div>
          </div>

          {/* Grillas de Técnicos y Top Clientes */}
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
            {/* Tabla / Comparativa por Técnico (7 columnas en desktop) */}
            <div className="lg:col-span-7 rounded-2xl border border-border/60 bg-card p-5 space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-sm font-black text-foreground">Interacción por Técnico</h3>
                  <p className="text-[11px] text-muted-foreground">Comparativa de mensajes atendidos vs. respondidos</p>
                </div>
                <div className="flex items-center gap-3 text-[10px] font-bold">
                  <span className="flex items-center gap-1.5 text-sky-400">
                    <span className="h-2 w-2 rounded-full bg-sky-400 inline-block" /> Recibidos
                  </span>
                  <span className="flex items-center gap-1.5 text-emerald-400">
                    <span className="h-2 w-2 rounded-full bg-emerald-400 inline-block" /> Enviados
                  </span>
                </div>
              </div>

              <div className="space-y-3 pt-2">
                {stats.agentStats.length === 0 ? (
                  <p className="text-xs text-muted-foreground py-6 text-center">No hay registros en este período.</p>
                ) : (
                  stats.agentStats.map((agent) => {
                    const pctEnviados = Math.round((agent.enviados / maxAgentMsgs) * 100);
                    const pctRecibidos = Math.round((agent.recibidos / maxAgentMsgs) * 100);
                    const ratio = agent.casos > 0 ? (agent.enviados / agent.casos).toFixed(1) : "0";

                    return (
                      <div key={agent.email} className="rounded-xl border border-border/50 bg-background/50 p-3.5 space-y-2 hover:border-border transition-colors">
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-2.5">
                            <div className="h-8 w-8 rounded-full bg-brand-600/20 text-brand-400 font-black text-xs grid place-items-center">
                              {agent.nombre.slice(0, 2).toUpperCase()}
                            </div>
                            <div>
                              <p className="text-xs font-bold text-foreground">{agent.nombre}</p>
                              <p className="text-[10px] text-muted-foreground">{agent.casos} casos atendidos · Promedio {ratio} msgs/caso</p>
                            </div>
                          </div>
                          <div className="text-right">
                            <span className="text-xs font-black text-emerald-400">{agent.enviados.toLocaleString()} enviados</span>
                            <p className="text-[10px] text-sky-400 font-semibold">{agent.recibidos.toLocaleString()} de clientes</p>
                          </div>
                        </div>

                        {/* Barras de progreso */}
                        <div className="space-y-1 pt-1">
                          <div className="flex items-center gap-2">
                            <span className="text-[9px] font-bold text-muted-foreground w-12 shrink-0">Enviados</span>
                            <div className="h-2 flex-1 rounded-full bg-muted/60 overflow-hidden">
                              <div className="h-full bg-emerald-500 rounded-full transition-all duration-500" style={{ width: `${Math.max(pctEnviados, 4)}%` }} />
                            </div>
                          </div>
                          <div className="flex items-center gap-2">
                            <span className="text-[9px] font-bold text-muted-foreground w-12 shrink-0">Recibidos</span>
                            <div className="h-2 flex-1 rounded-full bg-muted/60 overflow-hidden">
                              <div className="h-full bg-sky-500 rounded-full transition-all duration-500" style={{ width: `${Math.max(pctRecibidos, 4)}%` }} />
                            </div>
                          </div>
                        </div>
                      </div>
                    );
                  })
                )}
              </div>
            </div>

            {/* Top Clientes con Más Mensajes (5 columnas en desktop) */}
            <div className="lg:col-span-5 rounded-2xl border border-border/60 bg-card p-5 space-y-4">
              <div>
                <h3 className="text-sm font-black text-foreground">Top Clientes por Mensajes</h3>
                <p className="text-[11px] text-muted-foreground">Clientes con mayor cantidad de mensajes enviados</p>
              </div>

              <input
                type="text"
                placeholder="Buscar cliente..."
                value={searchClient}
                onChange={(e) => setSearchClient(e.target.value)}
                className="w-full px-3 py-1.5 text-xs rounded-xl border border-border bg-background text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-brand-500"
              />

              <div className="max-h-[380px] overflow-y-auto space-y-2 pr-1">
                {filteredClients.length === 0 ? (
                  <p className="text-xs text-muted-foreground py-6 text-center">No se encontraron clientes.</p>
                ) : (
                  filteredClients.map((client, idx) => (
                    <div key={idx} className="flex items-center justify-between p-2.5 rounded-xl bg-background/50 border border-border/40 hover:bg-muted/40 transition-colors">
                      <div className="min-w-0 flex-1 pr-2">
                        <p className="text-xs font-bold text-foreground truncate">{client.nombre}</p>
                        {client.telefono && (
                          <p className="text-[10px] text-muted-foreground truncate">{client.telefono}</p>
                        )}
                      </div>
                      <div className="text-right shrink-0">
                        <span className="px-2.5 py-1 rounded-lg text-xs font-black bg-sky-500/10 text-sky-400 border border-sky-500/20">
                          {client.total.toLocaleString()} msgs
                        </span>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}