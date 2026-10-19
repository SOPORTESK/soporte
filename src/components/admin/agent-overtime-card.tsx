"use client";

import React, { useState, useEffect, useCallback } from "react";
import {
  Clock,
  CheckCircle2,
  XCircle,
  AlertCircle,
  Plus,
  RefreshCw,
  Calendar,
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

  // Formulario para registro manual de horas extras del usuario actual del perfil
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

  const fetchOvertimeRecords = useCallback(async () => {
    if (!agentEmail) return;
    try {
      setRefreshing(true);
      const res = await fetch(`/api/activity/overtime?agent=${encodeURIComponent(agentEmail)}`);
      const data = await res.json();
      if (data?.success && Array.isArray(data.requests)) {
        const sorted = [...data.requests].sort((a, b) => (b.date || "").localeCompare(a.date || ""));
        setRecords(sorted);
      }
    } catch (err) {
      console.error("[AgentOvertimeCard] Error loading records:", err);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [agentEmail]);

  useEffect(() => {
    fetchOvertimeRecords();
  }, [fetchOvertimeRecords]);

  const handleReview = async (item: OvertimeItem, status: "approved" | "rejected", notes?: string) => {
    try {
      setProcessingId(item.id);
      const res = await fetch("/api/activity/overtime", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "review",
          id: item.id,
          status,
          reviewedBy: "Superadmin",
          notes: notes || (status === "approved" ? "Autorizado por la administración" : "Rechazado"),
          agentEmail: item.agent_email || agentEmail,
          agentName: item.agent_name || agentName || agentEmail,
          date: item.date,
          overtimeMinutes: item.overtime_minutes,
          totalActiveMinutes: item.total_active_minutes,
        }),
      });

      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.error || "Error al actualizar estado");
      }

      toast.success(
        status === "approved"
          ? "Tiempo extra AUTORIZADO y sumado a la jornada."
          : "Tiempo extra RECHAZADO (no se sumará a la jornada)."
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
      toast.error("Ingresa una fecha válida y minutos mayores a 0");
      return;
    }

    try {
      setSavingManual(true);
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

      toast.success("Tiempo extra registrado y aprobado.");
      setShowAddModal(false);
      await fetchOvertimeRecords();
    } catch (err: any) {
      toast.error(err.message || "Error al registrar");
    } finally {
      setSavingManual(false);
    }
  };

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
              Revisa, aprueba o rechaza el tiempo laborado fuera del horario asignado para{" "}
              <span className="font-semibold text-foreground">{agentName || agentEmail}</span>.
            </p>
          </div>
        </div>

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

        <div className="p-4 rounded-xl bg-amber-500/10 border border-amber-500/20 flex items-center justify-between">
          <div>
            <span className="text-[10px] font-black uppercase tracking-wider text-amber-400 block">
              Pendientes de Revisión
            </span>
            <span className="text-2xl font-black text-amber-300 font-mono tracking-tight mt-0.5 block">
              +{formatMin(totalPendingMinutes)}
            </span>
            <span className="text-[10.5px] text-amber-500/80 font-medium">Detectadas por actividad fuera de turno</span>
          </div>
          <div className="h-10 w-10 rounded-xl bg-amber-500/20 text-amber-400 grid place-items-center shrink-0">
            <Clock className="h-5 w-5" />
          </div>
        </div>

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
            Historial de Horas Extras ({records.length})
          </span>
        </div>

        {loading ? (
          <div className="p-8 text-center text-xs text-muted-foreground">
            Cargando registros de tiempo extra...
          </div>
        ) : records.length === 0 ? (
          <div className="p-8 text-center rounded-xl bg-muted/20 border border-border/60 space-y-1.5">
            <Clock className="h-6 w-6 text-muted-foreground/60 mx-auto" />
            <p className="text-xs font-bold text-foreground">Sin horas extras registradas</p>
            <p className="text-[11px] text-muted-foreground">
              Cuando el colaborador supere las horas de su jornada o puedes añadirlas manualmente con el botón superior.
            </p>
          </div>
        ) : (
          <div className="rounded-xl border border-border overflow-hidden bg-card">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="bg-muted/50 border-b border-border/80 text-[10px] uppercase font-black tracking-wider text-muted-foreground">
                  <tr>
                    <th className="py-3 px-4 whitespace-nowrap">Fecha</th>
                    <th className="py-3 px-4 whitespace-nowrap">Tiempo Extra</th>
                    <th className="py-3 px-4 whitespace-nowrap">Estado</th>
                    <th className="py-3 px-4 whitespace-nowrap">Detalle / Notas</th>
                    <th className="py-3 px-4 text-right whitespace-nowrap">Acciones</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border/60">
                  {records.map((r) => {
                    const isProcessing = processingId === r.id;
                    return (
                      <tr key={r.id} className="hover:bg-muted/30 transition-colors">
                        <td className="py-3 px-4 font-mono font-semibold text-foreground whitespace-nowrap">
                          <div className="flex items-center gap-2">
                            <Calendar className="h-3.5 w-3.5 text-muted-foreground" />
                            <span>{r.date}</span>
                          </div>
                        </td>

                        <td className="py-3 px-4 font-mono font-bold text-foreground whitespace-nowrap">
                          <span className="px-2 py-0.5 rounded-md bg-amber-500/10 text-amber-400 border border-amber-500/25">
                            +{formatMin(r.overtime_minutes)}
                          </span>
                        </td>

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

                        <td className="py-3 px-4 text-muted-foreground text-[11px] max-w-xs truncate" title={r.notes || ""}>
                          {r.reviewed_by ? (
                            <span>
                              <span className="font-semibold text-foreground">{r.reviewed_by}</span>
                              {r.notes ? ` — ${r.notes}` : ""}
                            </span>
                          ) : (
                            <span className="text-muted-foreground">
                              {r.notes || "Pendiente de revisión administrativa"}
                            </span>
                          )}
                        </td>

                        <td className="py-3 px-4 text-right whitespace-nowrap">
                          <div className="flex items-center justify-end gap-1.5">
                            {r.status !== "approved" && (
                              <button
                                type="button"
                                disabled={isProcessing}
                                onClick={() => handleReview(r, "approved")}
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
                                onClick={() => handleReview(r, "rejected")}
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

      {/* ── MODAL PARA AÑADIR TIEMPO EXTRA MANUAL ── */}
      {showAddModal && (
        <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="w-full max-w-md rounded-2xl border border-border bg-card p-6 shadow-2xl space-y-5">
            <div className="flex items-center justify-between border-b border-border pb-3">
              <div className="flex items-center gap-2.5">
                <div className="h-9 w-9 rounded-xl bg-violet-500/15 text-violet-400 grid place-items-center">
                  <Plus className="h-4.5 w-4.5" />
                </div>
                <div>
                  <h3 className="text-sm font-black text-foreground">
                    Añadir y Autorizar Tiempo Extra
                  </h3>
                  <p className="text-[11px] text-muted-foreground">
                    {agentName || agentEmail}
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setShowAddModal(false)}
                className="p-1.5 rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <form onSubmit={handleCreateManualOvertime} className="space-y-4">
              <div className="space-y-1.5">
                <label className="text-xs font-bold text-foreground block">Fecha de la Jornada</label>
                <input
                  type="date"
                  value={manualDate}
                  onChange={(e) => setManualDate(e.target.value)}
                  className="w-full px-3.5 py-2 rounded-xl border border-border bg-background text-sm font-mono text-foreground focus:outline-none focus:ring-2 focus:ring-violet-500/40"
                  required
                />
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-bold text-foreground block">
                  Minutos de Tiempo Extra
                </label>
                <div className="flex items-center gap-2">
                  <input
                    type="number"
                    min={15}
                    max={720}
                    step={15}
                    value={manualMinutes}
                    onChange={(e) => setManualMinutes(Number(e.target.value) || 0)}
                    className="flex-1 px-3.5 py-2 rounded-xl border border-border bg-background text-sm font-mono font-bold text-foreground focus:outline-none focus:ring-2 focus:ring-violet-500/40"
                    required
                  />
                  {[30, 60, 120, 180].map((m) => (
                    <button
                      key={m}
                      type="button"
                      onClick={() => setManualMinutes(m)}
                      className={`px-2.5 py-2 rounded-xl border text-xs font-mono font-bold transition-all cursor-pointer ${
                        manualMinutes === m
                          ? "bg-violet-600 text-white border-violet-500"
                          : "bg-muted/50 text-muted-foreground border-border hover:text-foreground"
                      }`}
                    >
                      {formatMin(m)}
                    </button>
                  ))}
                </div>
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-bold text-foreground block">Notas / Autorización</label>
                <input
                  type="text"
                  value={manualNotes}
                  onChange={(e) => setManualNotes(e.target.value)}
                  placeholder="Ej. Atención de soporte fuera de horario"
                  className="w-full px-3.5 py-2 rounded-xl border border-border bg-background text-xs text-foreground focus:outline-none focus:ring-2 focus:ring-violet-500/40"
                />
              </div>

              <div className="flex items-center justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setShowAddModal(false)}
                  className="px-4 py-2 rounded-xl border border-border text-xs font-bold text-muted-foreground hover:text-foreground"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={savingManual}
                  className="px-4 py-2 rounded-xl bg-violet-600 hover:bg-violet-700 text-white text-xs font-bold shadow-sm disabled:opacity-50 cursor-pointer"
                >
                  {savingManual ? "Guardando..." : "Registrar y Autorizar"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
