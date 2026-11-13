"use client";

import * as React from "react";
import { createClient } from "@/lib/supabase/client";
import { subscribeCasesRealtime } from "@/lib/cases-realtime-bus";
import { usePathname } from "next/navigation";

export function SmartInboxBadge({ initialCount }: { initialCount: number }) {
  const [count, setCount] = React.useState(initialCount);
  const [seen, setSeen] = React.useState(false);
  const pathname = usePathname();
  const supabase = React.useMemo(() => createClient(), []);

  React.useEffect(() => {
    if (pathname?.startsWith("/smart-inbox")) {
      setSeen(true);
    } else {
      setSeen(false);
    }
  }, [pathname]);

  React.useEffect(() => {
    let dirtyWhileHidden = false;
    const fetchCount = async () => {
      if (typeof document !== "undefined" && document.visibilityState === "hidden") {
        dirtyWhileHidden = true;
        return;
      }
      dirtyWhileHidden = false;
      const { count: c } = await supabase
        .from("sek_cases")
        .select("*", { count: "exact", head: true })
        .eq("estado", "ia_atendiendo")
        .neq("canal", "simulator")
        .neq("es_test", true);
      setCount(c ?? 0);
    };

    fetchCount();

    // Solo reconsultar si el evento involucra el estado "ia_atendiendo"
    let debounceTimer: ReturnType<typeof setTimeout> | null = null;
    const debouncedFetch = (payload?: any) => {
      if (payload?.action === "typing") return;
      if (payload?.eventType === "UPDATE") {
        if (payload.action === "deltaEntry" && String(payload.new?.estado || "").toLowerCase() !== "ia_atendiendo") return;
        const newEst = payload.new?.estado !== undefined ? String(payload.new.estado || "").toLowerCase() : null;
        const oldEst = payload.old?.estado !== undefined ? String(payload.old.estado || "").toLowerCase() : null;
        if (newEst !== null && oldEst !== null && newEst !== "ia_atendiendo" && oldEst !== "ia_atendiendo") return;
      } else if (payload?.eventType === "INSERT") {
        const newEst = String(payload.new?.estado || "").toLowerCase();
        if (newEst !== "ia_atendiendo") return;
      }
      if (debounceTimer) clearTimeout(debounceTimer);
      debounceTimer = setTimeout(fetchCount, 1000);
    };

    const onVisibility = () => {
      if (document.visibilityState === "visible" && dirtyWhileHidden) fetchCount();
    };
    const onReconnected = () => fetchCount();
    document.addEventListener("visibilitychange", onVisibility);
    window.addEventListener("cases_realtime_reconnected", onReconnected);

    const unsubscribe = subscribeCasesRealtime(supabase, debouncedFetch);

    return () => {
      if (debounceTimer) clearTimeout(debounceTimer);
      document.removeEventListener("visibilitychange", onVisibility);
      window.removeEventListener("cases_realtime_reconnected", onReconnected);
      unsubscribe();
    };
  }, [supabase]);

  if (!count || seen) return null;

  return (
    <span className="text-[10px] font-bold rounded-full bg-violet-600 text-white px-2 py-0.5 animate-pulse">
      {count}
    </span>
  );
}
