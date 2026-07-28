"use client";
import * as React from "react";
import Link from "next/link";
import { Award, Clock, Star, ChevronDown, ExternalLink, MessageSquare } from "lucide-react";

export type AgentCaseItem = {
  id: string | number;
  title: string;
  estado: string;
  created_at: string;
  cliente: string;
  canal: string;
};

export type AgentRankingItem = {
  email: string;
  nombre: string;
  score: number;
  scoreValido: boolean;
  totalAtendidos: number;
  activos: number;
  resueltos: number;
  tasa: number;
  avgEfectivo: number;
  avgResolucion: number;
  avgSLA: number;
  avgCalificacionCliente: string;
  calificacionesCount: number;
  casos7d: number;
  volumenDiario: number;
  casos: AgentCaseItem[];
};

const formatSLA = (m: number) => (m === 0 ? "—" : m < 60 ? `${m}m` : `${Math.floor(m / 60)}h${m % 60 > 0 ? ` ${m % 60}m` : ""}`);

const estadoColor: Record<string, string> = {
  cerrado: "text-emerald-500 bg-emerald-500/10",
  resuelto: "text-emerald-500 bg-emerald-500/10",
  abierto: "text-sky-500 bg-sky-500/10",
  escalado: "text-amber-500 bg-amber-500/10",
  ia_atendiendo: "text-violet-500 bg-violet-500/10",
};

function AgentCasesPanel({ casos }: { casos: AgentCaseItem[] }) {
  const ordenados = React.useMemo(
    () => [...casos].sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()),
    [casos]
  );
  if (ordenados.length === 0) {
    return <p className="text-xs text-muted-foreground italic px-4 py-3">Sin casos registrados.</p>;
  }
  return (
    <div className="max-h-72 overflow-y-auto px-4 py-3 space-y-1.5">
      {ordenados.map((c, i) => {
        const fecha = new Date(c.created_at).toLocaleDateString("es-CR", { day: "2-digit", month: "short", year: "numeric" });
        const badge = estadoColor[c.estado] || "text-muted-foreground bg-muted";
        return (
          <Link
            key={String(c.id)}
            href={`/inbox?c=${c.id}`}
            className="flex items-center gap-3 rounded-lg border border-border/60 bg-background/50 px-3 py-2 hover:bg-muted/40 hover:border-brand-500/40 transition-all group"
          >
            <span className="text-[10px] font-black text-muted-foreground/40 w-6 shrink-0">#{i + 1}</span>
            <MessageSquare className="h-3.5 w-3.5 text-brand-500 shrink-0" />
            <div className="min-w-0 flex-1">
              <p className="text-xs font-bold truncate">{c.title}</p>
              <p className="text-[10px] text-muted-foreground truncate">{c.cliente} · {c.canal} · {fecha}</p>
            </div>
            <span className={`text-[9px] font-black uppercase px-2 py-0.5 rounded-full shrink-0 ${badge}`}>{c.estado}</span>
            <ExternalLink className="h-3.5 w-3.5 text-muted-foreground/40 group-hover:text-brand-500 transition-colors shrink-0" />
          </Link>
        );
      })}
    </div>
  );
}

export function AgentRankingTable({ agentes }: { agentes: AgentRankingItem[] }) {
  const [expanded, setExpanded] = React.useState<string | null>(null);

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm min-w-[1200px]">
        <thead>
          <tr className="border-b border-border bg-muted/10">
            <th className="px-2 py-3 text-left text-[10px] font-black uppercase tracking-wider text-muted-foreground w-10">#</th>
            <th className="px-2 py-3 text-left text-[10px] font-black uppercase tracking-wider text-muted-foreground">Agente</th>
            <th className="px-2 py-3 text-center text-[10px] font-black uppercase tracking-wider text-muted-foreground">Score</th>
            <th className="px-2 py-3 text-center text-[10px] font-black uppercase tracking-wider text-muted-foreground">Total</th>
            <th className="px-2 py-3 text-center text-[10px] font-black uppercase tracking-wider text-muted-foreground whitespace-nowrap">Tasa Res.</th>
            <th className="px-2 py-3 text-center text-[10px] font-black uppercase tracking-wider text-muted-foreground">AHT</th>
            <th className="px-2 py-3 text-center text-[10px] font-black uppercase tracking-wider text-muted-foreground whitespace-nowrap">T. Resol.</th>
            <th className="px-2 py-3 text-center text-[10px] font-black uppercase tracking-wider text-muted-foreground">SLA</th>
            <th className="px-2 py-3 text-center text-[10px] font-black uppercase tracking-wider text-muted-foreground">Calif.</th>
            <th className="px-2 py-3 text-center text-[10px] font-black uppercase tracking-wider text-muted-foreground whitespace-nowrap">Vol 7d</th>
            <th className="px-2 py-3 text-center text-[10px] font-black uppercase tracking-wider text-muted-foreground whitespace-nowrap">Vol Prom.</th>
            <th className="px-2 py-3 text-center text-[10px] font-black uppercase tracking-wider text-muted-foreground w-10" />
          </tr>
        </thead>
        <tbody className="divide-y divide-border/50">
          {agentes.length === 0 ? (
            <tr><td colSpan={12} className="py-16 text-center text-sm text-muted-foreground">Sin datos de atención registrados.</td></tr>
          ) : agentes.map((a, i) => {
            const isTop = i === 0 && agentes.length > 1;
            const initials = a.nombre.split(" ").filter(Boolean).map(n => n[0]).join("").substring(0, 2).toUpperCase();
            const scoreColor = a.score >= 75 ? "text-emerald-500" : a.score >= 50 ? "text-amber-400" : "text-rose-500";
            const scoreBg = a.score >= 75 ? "bg-emerald-500/10" : a.score >= 50 ? "bg-amber-400/10" : "bg-rose-500/10";
            const isOpen = expanded === a.email;
            return (
              <React.Fragment key={a.email}>
                <tr
                  className={`hover:bg-muted/20 transition-colors cursor-pointer ${isOpen ? "bg-muted/30" : ""}`}
                  onClick={() => setExpanded(isOpen ? null : a.email)}
                >
                  <td className="px-3 py-3.5">
                    {isTop
                      ? <div className="h-7 w-7 rounded-full bg-gradient-to-br from-amber-400 to-amber-600 grid place-items-center shadow-lg shadow-amber-500/30"><Award className="h-3.5 w-3.5 text-white" /></div>
                      : <span className="text-sm font-black text-muted-foreground/40">#{i + 1}</span>}
                  </td>
                  <td className="px-3 py-3.5">
                    <div className="flex items-center gap-2">
                      <div className="h-8 w-8 rounded-xl bg-gradient-to-br from-brand-500 to-brand-700 text-white text-[10px] font-black grid place-items-center shrink-0">
                        {initials}
                      </div>
                      <div>
                        <p className="font-black text-sm leading-tight">{a.nombre}</p>
                        <p className="text-[10px] text-muted-foreground">{a.activos} casos activos</p>
                      </div>
                    </div>
                  </td>
                  <td className="px-3 py-3 text-center">
                    {a.scoreValido ? (
                      <div className={`inline-flex flex-col items-center justify-center h-11 w-11 rounded-xl ${scoreBg} mx-auto`}>
                        <span className={`text-base font-black tabular-nums ${scoreColor}`}>{a.score}</span>
                        <span className="text-[8px] font-bold text-muted-foreground uppercase">pts</span>
                      </div>
                    ) : (
                      <div className="inline-flex flex-col items-center justify-center h-11 w-11 rounded-xl bg-muted mx-auto">
                        <span className="text-[10px] font-black tabular-nums text-muted-foreground">N/A</span>
                        <span className="text-[8px] font-bold text-muted-foreground uppercase">{a.totalAtendidos} casos</span>
                      </div>
                    )}
                  </td>
                  <td className="px-2 py-3 text-center">
                    <p className="font-black text-sky-500 tabular-nums text-base">{a.totalAtendidos}</p>
                    <p className="text-[10px] text-muted-foreground">{a.activos} activos</p>
                  </td>
                  <td className="px-2 py-3 text-center">
                    <p className="font-black text-emerald-500 tabular-nums text-base">{a.tasa}%</p>
                    <p className="text-[10px] text-muted-foreground">{a.resueltos} resueltos</p>
                  </td>
                  <td className="px-2 py-3 text-center">
                    {a.avgEfectivo > 0 ? (
                      <div className="flex items-center justify-center gap-1">
                        <Clock className="h-3 w-3 text-violet-500" />
                        <span className="font-black tabular-nums text-violet-500 text-sm">{formatSLA(a.avgEfectivo)}</span>
                      </div>
                    ) : <span className="text-muted-foreground/40 text-sm">—</span>}
                    <p className="text-[9px] text-muted-foreground">activo/caso</p>
                  </td>
                  <td className="px-2 py-3 text-center">
                    <div className="flex items-center justify-center gap-1">
                      <Clock className="h-3 w-3 text-emerald-500" />
                      <span className="font-black tabular-nums text-emerald-500 text-sm">{a.avgResolucion > 0 ? formatSLA(a.avgResolucion) : "—"}</span>
                    </div>
                    <p className="text-[9px] text-muted-foreground">acept. → cierre</p>
                  </td>
                  <td className="px-2 py-3 text-center">
                    <div className="flex items-center justify-center gap-1">
                      <Clock className="h-3 w-3 text-sky-500" />
                      <span className="font-black tabular-nums text-sky-500 text-sm">{formatSLA(a.avgSLA)}</span>
                    </div>
                    <p className="text-[9px] text-muted-foreground">espera IA → humano</p>
                  </td>
                  <td className="px-2 py-3 text-center">
                    {a.avgCalificacionCliente !== "N/A" ? (
                      <div className="flex items-center justify-center gap-0.5">
                        <Star className="h-3 w-3 text-amber-400 fill-amber-400" />
                        <span className="font-black text-amber-400 text-sm">{a.avgCalificacionCliente}</span>
                      </div>
                    ) : <span className="text-muted-foreground/40 text-sm">—</span>}
                    <p className="text-[9px] text-muted-foreground">{a.calificacionesCount} calif.</p>
                  </td>
                  <td className="px-2 py-3 text-center">
                    <span className="text-sm font-black tabular-nums text-violet-500">{a.casos7d}</span>
                    <p className="text-[10px] text-muted-foreground">esta semana</p>
                  </td>
                  <td className="px-2 py-3 text-center">
                    <span className="text-sm font-black tabular-nums text-cyan-500">{a.volumenDiario > 0 ? a.volumenDiario.toFixed(1) : "—"}</span>
                    <p className="text-[10px] text-muted-foreground">promedio/día</p>
                  </td>
                  <td className="px-2 py-3 text-center">
                    <ChevronDown className={`h-4 w-4 text-muted-foreground transition-transform mx-auto ${isOpen ? "rotate-180 text-brand-500" : ""}`} />
                  </td>
                </tr>
                {isOpen && (
                  <tr className="bg-muted/10">
                    <td colSpan={12} className="p-0">
                      <div className="border-l-2 border-brand-500/50 mx-3 my-2 rounded-r-lg bg-card/50">
                        <div className="flex items-center justify-between px-4 pt-3">
                          <p className="text-[11px] font-black uppercase tracking-widest text-brand-500">
                            Casos atendidos por {a.nombre}
                          </p>
                          <span className="text-[10px] font-bold text-muted-foreground">{a.casos.length} casos · clic para abrir la conversación</span>
                        </div>
                        <AgentCasesPanel casos={a.casos} />
                      </div>
                    </td>
                  </tr>
                )}
              </React.Fragment>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
