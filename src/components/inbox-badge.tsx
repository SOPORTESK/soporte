"use client";

import * as React from "react";
import { createClient } from "@/lib/supabase/client";
import { usePathname } from "next/navigation";

export function InboxBadge({ initialCount }: { initialCount: number }) {
  const [count, setCount] = React.useState(initialCount);
  const pathname = usePathname();
  const supabase = createClient();
  const isInInbox = pathname?.startsWith("/inbox");

  React.useEffect(() => {
    const fetchCount = async () => {
      // Contar casos que necesitan atención del agente
      const { data } = await supabase
        .from("sek_cases")
        .select("id, histcliente, histtecnico, estado")
        .in("estado", ["escalado", "abierto", "ia_atendiendo"])
        .neq("canal", "simulator")
        .order("created_at", { ascending: false })
        .limit(100);
      if (!data) return;
      let unread = 0;
      data.forEach((c: any) => {
        const estado = String(c.estado || "").toLowerCase();
        // Caso escalado siempre cuenta como pendiente
        if (estado === "escalado") { unread++; return; }
        // Para casos abiertos: contar si el último mensaje del cliente (user) no tiene respuesta del agente
        const hc = Array.isArray(c.histcliente) ? c.histcliente : [];
        const ht = Array.isArray(c.histtecnico) ? c.histtecnico : [];
        if (hc.length === 0) return;
        // Buscar el último mensaje del usuario (no IA)
        const lastUserMsg = [...hc].reverse().find((m: any) => m.role === "user");
        if (!lastUserMsg) return;
        const lastUserTime = new Date(lastUserMsg.time || 0).getTime();
        // Verificar si hay respuesta del agente posterior en histtecnico
        const hasAgentReply = ht.some((t: any) => {
          const tTime = new Date(t.time || 0).getTime();
          return tTime > lastUserTime && t.role !== "nota";
        });
        if (!hasAgentReply) unread++;
      });
      setCount(unread);
    };

    fetchCount();

    const channel = supabase
      .channel("inbox-badge-watch")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "sek_cases" },
        () => { fetchCount(); }
      )
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [supabase]);

  if (!count) return null;

  return (
    <span className={`text-[10px] font-bold rounded-full px-2 py-0.5 ${isInInbox ? "bg-brand-600/30 text-brand-300" : "bg-red-600 text-white animate-pulse"}`}>
      {count}
    </span>
  );
}
