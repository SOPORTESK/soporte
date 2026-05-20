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
      // Contar casos escalados (esperando agente) + casos con último msg del usuario sin respuesta
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
        const hc = Array.isArray(c.histcliente) ? c.histcliente : [];
        const ht = Array.isArray(c.histtecnico) ? c.histtecnico : [];
        if (hc.length === 0) return;
        const lastMsg = hc[hc.length - 1];
        const lastRole = lastMsg?.role || "user";
        if (lastRole === "user") {
          const lastHcTime = new Date(lastMsg.time || 0).getTime();
          const hasNewerTech = ht.some((t: any) => new Date(t.time || 0).getTime() > lastHcTime);
          if (!hasNewerTech) unread++;
        }
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
