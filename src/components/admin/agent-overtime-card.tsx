"use client";

import React, { useState, useEffect } from "react";
import {
  Clock,
  CheckCircle2,
  XCircle,
  AlertCircle,
  Plus,
  RefreshCw,
  Calendar,
  UserCheck,
  ShieldAlert,
  FileText,
  Check,
  X,
} from "lucide-react";
import { toast } from "sonner";

interface OvertimeItem {
  id: string;
  agent_email: string;
  agent_name?: string;
  date: string;
  overtime_minutes: number;
  total_active_minutes: number;
  status: "pending" | "approved" | "rejected";
  requested_at: string;
  reviewed_at: string | null;
  reviewed_by: string | null;
  notes: string | null;
}

interface AgentOvertimeCardProps {
  agentEmail: string;
  agentName?: string;
}

export function AgentOvertimeCard({ agentEmail, agentName }: AgentOvertimeCardProps) {
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [records, setRecords] = useState<OvertimeItem[]>([]);
  const [processingId, setProcessingId] = useState<string | null>(null);

  // Formulario para registro manual de horas extras
  const [showAddModal, setShowAddModal] = useState(false);
  const [manualDate, setManualDate] = useState(() => {
    const d = new Date();
    return d.toISOString().split("T")[0];
  });
  const [manualMinutes, setManualMinutes] = useState(60);
  const [manualNotes, setManualNotes] = useState("Autorizado por supervisor");
  const [savingManual, setSavingManual] = useState(false);

  const formatMin = (m: number) => {
    if (!m || m <= 0) return "0m";
    const h = Math.floor(m / 60);
    const rem = m % 60;
    if (h === 0) return `${rem}m`;
    return `${h}h ${rem > 0 ? `${rem}m` : ""}`.trim();
  };

  const fetchOvertimeRecords = async () => {
    try {
      setRefreshing(true);
      const res = await fetch(`/api/activity/overtime?agent=${encodeURIComponent(agentEmail)}`);
      const data = await res.json();
      if (data?.success && Array.isArray(data.requests)) {
        // Ordenar por fecha descendente
        const sorted = [...data.requests].sort((a, b) => (b.date || "").localeCompare(a.date || ""));
        setRecords(sorted);
      }
    } catch (err) {
      console.error("[AgentOvertimeCard] Error loading records:", err);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    fetchOvertimeRecords();
  }, [agentEmail]);

  const handleReview = async (id: string, status: "approved" | "rejected", notes?: string) => {
    try {
      setProcessingId(id);
      const res = await fetch("/api/activity/overtime", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "review",
          id,
          status,
          reviewedBy: "Superadmin",
          notes: notes || (status === "approved" ? "Autorizado por la administración" : "Rechazado"),
        }),
      });

      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.error || "Error al actualizar estado");
      }

      toast.success(
        status === "approved"
          ? "Tiempo extra AUTORIZADO con éxito."
          : "Tiempo extra RECHAZADO."
      );
      await fetchOvertimeRecords();
    } catch (err: any) {
      toast.error(err.message || "Error al procesar solicitud");
    } finally {
      setProcessingId(null);
    }
  };

  const handleCreateManualOvertime = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!manualDate || manualMinutes <= 0) {
      toast.error("Indica una fecha válida y minutos mayores a 0");
      return;
    }

    try {
      setSavingManual(true);
      // 1. Crear solicitud
      const resReq = await fetch("/api/activity/overtime", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "request",
          agentEmail,
          agentName: agentName || agentEmail,
          date: manualDate,
          overtimeMinutes: manualMinutes,
          totalActiveMinutes: manualMinutes,
        }),
      });
      const dataReq = await resReq.json();
      if (!resReq.ok || !dataReq.success) {
        throw new Error(dataReq.error || "Error al registrar tiempo extra");
      }

      // 2. Aprobar inmediatamente
      const reqId = dataReq.request.id;
      await fetch("/api/activity/overtime", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "review",
          id: reqId,
          status: "approved",
          reviewedBy: "Superadmin",
          notes: manualNotes.trim() || "Autorizado manualmente",
        }),
      });

      toast.success("Tiempo extra registrado y aprobado correctamente.");
      setShowAddModal(false);
      await fetchOvertimeRecords();
    } catch (err: any) {
      toast.error(err.message || "Error al registrar");
    } finally {
      setSavingManual(false);
    }
  };

  // Métricas agregadas
  const totalApprovedMinutes = records
    .filter((r) => r.status === "approved")
    .reduce((acc, r) => acc + (r.overtime_minutes || 0), 0);

  const totalPendingMinutes = records
    .filter((r) => r.status === "pending")
    .reduce((acc, r) => acc + (r.overtime_minutes || 0), 0);

  const totalRejectedMinutes = records
    .filter((r) => r.status === "rejected")
    .reduce((acc, r) => acc + (r.overtime_minutes || 0), 0);

  return (
    <div className="rounded-2xl border border-border bg-card p-6 lg:p-8 space-y-6 shadow-xs">
      {/* ── HEADER ── */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-border/70 pb-5">
        <div className="flex items-start sm:items-center gap-3.5">
          <div className="h-11 w-11 rounded-2xl bg-amber-500/10 border border-amber-500/20 text-amber-500 grid place-items-center shrink-0">
            <Clock className="h-5 w-5" />
          </div>
          <div>
            <div className="flex items-center gap-2.5 flex-wrap">
              <h2 className="text-lg font-black tracking-tight text-foreground">
                Control y Autorización de Horas Extras
              </h2>
              {totalPendingMinutes > 0 && (
                <span className="text-[10px] font-black uppercase px-2.5 py-0.5 rounded-full bg-amber-500/15 text-amber-400 border border-amber-500/30 animate-pulse flex items-center gap-1">
                  <AlertCircle className="h-3 w-3" /> {formatMin(totalPendingMinutes)} por revisar
                </span>
              )}
            </div>
            <p className="text-xs text-muted-foreground mt-1">
              Revisa, aprueba o rechaza el tiempo laborado fuera del horario para{" "}
              <span className="font-semibold text-foreground">{agentName || agentEmail}</span>.
            </p>
          </div>
        </div>

        {/* BOTONES DE ACCIÓN */}
        <div className="flex items-center gap-2 self-start sm:self-auto shrink-0">
          <button
            type="button"
            onClick={fetchOvertimeRecords}
            disabled={refreshing}
            className="p-2 rounded-xl border border-border bg-background hover:bg-muted text-muted-foreground hover:text-foreground transition-all cursor-pointer"
            title="Refrescar lista"
          >
            <RefreshCw className={`h-4 w-4 ${refreshing ? "animate-spin text-amber-400" : ""}`} />
          </button>
          <button
            type="button"
            onClick={() => setShowAddModal(true)}
            className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-violet-600 hover:bg-violet-700 text-white font-bold text-xs shadow-sm transition-all cursor-pointer active:scale-95"
          >
            <Plus className="h-3.5 w-3.5" />
            <span>Añadir Tiempo Extra</span>
          </button>
        </div>
      </div>

      {/* ── TARJETAS KPI DE RESUMEN ── */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        {/* Aprobadas */}
        <div className="p-4 rounded-xl bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-between">
          <div>
            <span className="text-[10px] font-black uppercase tracking-wider text-emerald-400 block">
              Tiempo Extra Aprobado
            </span>
            <span className="text-2xl font-black text-emerald-300 font-mono tracking-tight mt-0.5 block">
              +{formatMin(totalApprovedMinutes)}
            </span>
            <span className="text-[10.5px] text-emerald-500/80 font-medium">Autorizado en nómina/jornada</span>
          </div>
          <div className="h-10 w-10 rounded-xl bg-emerald-500/20 text-emerald-400 grid place-items-center shrink-0">
            <CheckCircle2 className="h-5 w-5" />
          </div>
        </div>

        {/* Pendientes */}
        <div className="p-4 rounded-xl bg-amber-500/10 border border-amber-500/20 flex items-center justify-between">
          <div>
            <span className="text-[10px] font-black uppercase tracking-wider text-amber-400 block">
              Pendientes de Revisión
            </span>
            <span className="text-2xl font-black text-amber-300 font-mono tracking-tight mt-0.5 block">
              +{formatMin(totalPendingMinutes)}
            </span>
            <span className="text-[10.5px] text-amber-500/80 font-medium">Detectadas por el sistema</span>
          </div>
          <div className="h-10 w-10 rounded-xl bg-amber-500/20 text-amber-400 grid place-items-center shrink-0">
            <Clock className="h-5 w-5" />
          </div>
        </div>

        {/* Rechazadas */}
        <div className="p-4 rounded-xl bg-rose-500/10 border border-rose-500/20 flex items-center justify-between">
          <div>
            <span className="text-[10px] font-black uppercase tracking-wider text-rose-400 block">
              Rechazadas / No Válidas
            </span>
            <span className="text-2xl font-black text-rose-300 font-mono tracking-tight mt-0.5 block">
              {formatMin(totalRejectedMinutes)}
            </span>
            <span className="text-[10.5px] text-rose-500/80 font-medium">Excluidas del cómputo</span>
          </div>
          <div className="h-10 w-10 rounded-xl bg-rose-500/20 text-rose-400 grid place-items-center shrink-0">
            <XCircle className="h-5 w-5" />
          </div>
        </div>
      </div>

      {/* ── TABLA / LISTA DE REGISTROS ── */}
      <div className="space-y-3">
        <div className="flex items-center justify-between px-1">
          <span className="text-xs font-black uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
            <FileText className="h-3.5 w-3.5" />
            Registros Históricos de Tiempo Extra ({records.length})
          </span>
        </div>

        {loading ? (
          <div className="p-8 text-center text-xs text-muted-foreground">
            Cargando solicitudes de tiempo extra...
          </div>
        ) : records.length === 0 ? (
          <div className="p-8 text-center rounded-xl bg-muted/20 border border-border/60 space-y-1.5">
            <Clock className="h-6 w-6 text-muted-foreground/60 mx-auto" />
            <p className="text-xs font-bold text-foreground">Sin horas extras registradas</p>
            <p className="text-[11px] text-muted-foreground">
              Este colaborador no tiene jornadas que hayan superado su meta de trabajo configurada.
            </p>
          </div>
        ) : (
          <div className="rounded-xl border border-border overflow-hidden bg-card">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="bg-muted/50 border-b border-border/80 text-[10px] uppercase font-black tracking-wider text-muted-foreground">
                  <tr>
                    <th className="py-3 px-4">Fecha</th>
                    <th className="py-3 px-4">Tiempo Extra</th>
                    <th className="py-3 px-4">Estado</th>
                    <th className="py-3 px-4">Revisado Por / Notas</th>
                    <th className="py-3 px-4 text-right">Acciones</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border/60">
                  {records.map((r) => {
                    const isProcessing = processingId === r.id;
                    return (
                      <tr key={r.id} className="hover:bg-muted/30 transition-colors">
                        {/* Fecha */}
                        <td className="py-3 px-4 font-mono font-semibold text-foreground whitespace-nowrap">
                          <div className="flex items-center gap-2">
                            <Calendar className="h-3.5 w-3.5 text-muted-foreground" />
                            <span>{r.date}</span>
                          </div>
                        </td>

                        {/* Tiempo Extra */}
                        <td className="py-3 px-4 font-mono font-bold text-foreground whitespace-nowrap">
                          <span className="px-2 py-0.5 rounded-md bg-amber-500/10 text-amber-400 border border-amber-500/25">
                            +{formatMin(r.overtime_minutes)}
                          </span>
                        </td>

                        {/* Estado */}
                        <td className="py-3 px-4 whitespace-nowrap">
                          {r.status === "approved" && (
                            <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-emerald-500/15 text-emerald-400 border border-emerald-500/30">
                              <CheckCircle2 className="h-3 w-3" /> Aprobada
                            </span>
                          )}
                          {r.status === "pending" && (
                            <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-amber-500/15 text-amber-400 border border-amber-500/30">
                              <Clock className="h-3 w-3 animate-pulse" /> En Revisión
                            </span>
                          )}
                          {r.status === "rejected" && (
                            <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-rose-500/15 text-rose-400 border border-rose-500/30">
                              <XCircle className="h-3 w-3" /> Rechazada
                            </span>
                          )}
                        </td>

                        {/* Notas */}
                        <td className="py-3 px-4 text-muted-foreground text-[11px] max-w-xs truncate" title={r.notes || ""}>
                          {r.reviewed_by ? (
                            <span>
                              <span className="font-semibold text-foreground">{r.reviewed_by}</span>
                              {r.notes ? ` — ${r.notes}` : ""}
                            </span>
                          ) : (
                            <span className="italic text-muted-foreground/70">Pendiente de revisión administrativa</span>
                          )}
                        </td>

                        {/* Botones de acción */}
                        <td className="py-3 px-4 text-right whitespace-nowrap">
                          <div className="flex items-center justify-end gap-1.5">
                            {r.status !== "approved" && (
                              <button
                                type="button"
                                disabled={isProcessing}
                                onClick={() => handleReview(r.id, "approved")}
                                className="px-2.5 py-1 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-[11px] transition-all flex items-center gap-1 cursor-pointer disabled:opacity-50"
                                title="Autorizar este tiempo extra"
                              >
                                <Check className="h-3 w-3" />
                                <span>Autorizar</span>
                              </button>
                            )}
                            {r.status !== "rejected" && (
                              <button
                                type="button"
                                disabled={isProcessing}
                                onClick={() => handleReview(r.id, "rejected")}
                                className="px-2 py-1 rounded-lg border border-border bg-background hover:bg-rose-500/10 text-muted-foreground hover:text-rose-400 font-semibold text-[11px] transition-all flex items-center gap-1 cursor-pointer disabled:opacity-50"
                                title="Rechazar este tiempo extra"
                              >
                                <X className="h-3 w-3" />
                                <span>Rechazar</span>
                              </button>
                            )}
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>

      {/* ── MODAL: AÑADIR TIEMPO EXTRA MANUAL ── */}
      {showAddModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs animate-in fade-in">
          <div className="w-full max-w-md rounded-2xl bg-card border border-border p-6 shadow-2xl space-y-4">
            <div className="flex items-center justify-between border-b border-border/70 pb-3">
              <div className="flex items-center gap-2">
                <Clock className="h-4 w-4 text-amber-400" />
                <h3 className="font-bold text-sm text-foreground">Registrar Tiempo Extra</h3>
              </div>
              <button
                type="button"
                onClick={() => setShowAddModal(false)}
                className="p-1 rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <form onSubmit={handleCreateManualOvertime} className="space-y-3.5 text-xs">
              <div>
                <label className="font-bold text-foreground block mb-1">Fecha</label>
                <input
                  type="date"
                  value={manualDate}
                  onChange={(e) => setManualDate(e.target.value)}
                  required
                  className="w-full px-3 py-2 rounded-xl border border-border bg-background text-foreground focus:outline-none focus:ring-1 focus:ring-amber-500 font-mono text-xs"
                />
              </div>

              <div>
                <label className="font-bold text-foreground block mb-1">Tiempo Extra (Minutos)</label>
                <div className="flex items-center gap-2">
                  <input
                    type="number"
                    min="5"
                    max="600"
                    step="5"
                    value={manualMinutes}
                    onChange={(e) => setManualMinutes(Number(e.target.value))}
                    required
                    className="w-full px-3 py-2 rounded-xl border border-border bg-background text-foreground focus:outline-none focus:ring-1 focus:ring-amber-500 font-mono text-xs font-bold"
                  />
                  <span className="font-mono text-muted-foreground font-bold shrink-0">
                    ≈ {formatMin(manualMinutes)}
                  </span>
                </div>
              </div>

              <div>
                <label className="font-bold text-foreground block mb-1">Notas / Motivo de Autorización</label>
                <input
                  type="text"
                  value={manualNotes}
                  onChange={(e) => setManualNotes(e.target.value)}
                  placeholder="Ej: Cobertura de turno o atención especial"
                  className="w-full px-3 py-2 rounded-xl border border-border bg-background text-foreground focus:outline-none focus:ring-1 focus:ring-amber-500 text-xs"
                />
              </div>

              <div className="flex justify-end gap-2 pt-2 border-t border-border/70">
                <button
                  type="button"
                  onClick={() => setShowAddModal(false)}
                  className="px-3.5 py-2 rounded-xl border border-border hover:bg-muted text-muted-foreground text-xs font-semibold cursor-pointer"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={savingManual}
                  className="px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs shadow-sm cursor-pointer disabled:opacity-50"
                >
                  {savingManual ? "Guardando..." : "Autorizar Tiempo Extra"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
