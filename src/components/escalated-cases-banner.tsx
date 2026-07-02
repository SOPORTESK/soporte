"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { AlertTriangle } from "lucide-react";
import { toast } from "sonner";
import type { SekCase } from "@/lib/types";
import { clienteInfo, asText } from "@/lib/utils";

/**
 * Banner persistente que muestra casos escalados sin agente asignado.
 * Se renderiza en los layouts principales para estar visible en todos los paneles.
 */
export function EscalatedCasesBanner() {
  const router = useRouter();
  const supabase = React.useMemo(() => createClient(), []);
  const [escalated, setEscalated] = React.useState<SekCase[]>([]);

  React.useEffect(() => {
    const fetchEscalated = async () => {
      const { data, error } = await supabase
        .from("sek_cases")
        .select("*")
        .eq("estado", "escalado")
        .is("assigned_to", null)
        .order("escalado_at", { ascending: false });

      if (error) {
        console.error("[EscalatedCasesBanner] Error fetching escalated cases:", error);
        return;
      }
      setEscalated(data || []);
    };

    fetchEscalated();

    const channel = supabase
      .channel("escalated-cases-banner")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "sek_cases" },
        fetchEscalated
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [supabase]);

  if (escalated.length === 0) return null;

  const first = escalated[0];
  const cliente = clienteInfo(first.cliente);

  return (
    <div className="shrink-0 bg-orange-500/10 border-b border-orange-500/20 px-4 py-2.5 flex flex-col sm:flex-row sm:items-center justify-between gap-3 z-40 relative">
      <div className="flex items-center gap-3">
        <div className="h-8 w-8 rounded-full bg-orange-500/20 text-orange-500 flex items-center justify-center shrink-0">
          <AlertTriangle className="h-4 w-4" />
        </div>
        <div>
          <p className="text-sm font-bold text-orange-600 dark:text-orange-400">
            {escalated.length === 1
              ? `Caso sin atender: ${cliente.nombre || asText(first.title) || "Cliente"}`
              : `Hay ${escalated.length} casos sin atender esperando asignación`}
          </p>
          <p className="text-xs text-orange-600/80 dark:text-orange-400/80">
            {escalated.length === 1
              ? "Esperando asignación de agente"
              : "Varios clientes requieren atención inmediata de un agente"}
          </p>
        </div>
      </div>
      <button
        onClick={() => {
          if (first.id) {
            toast.info(`Abriendo caso ${first.id}`);
            router.push(`/soporte-avanzado?case=${first.id}`);
          } else {
            router.push("/soporte-avanzado");
          }
        }}
        className="shrink-0 px-4 py-2 bg-orange-500 hover:bg-orange-600 text-white text-xs font-bold rounded-lg transition-colors shadow-sm"
      >
        {escalated.length === 1 ? "Atender caso" : "Ver casos"}
      </button>
    </div>
  );
}
