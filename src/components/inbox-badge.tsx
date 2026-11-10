"use client";

import * as React from "react";
import { createClient } from "@/lib/supabase/client";
import { subscribeCasesRealtime } from "@/lib/cases-realtime-bus";
import { usePathname } from "next/navigation";

export function InboxBadge({ initialCount }: { initialCount: number }) {
  const [count, setCount] = React.useState(initialCount);
  const pathname = usePathname();
  const supabaseRef = React.useRef(createClient());
  const isInInbox = pathname?.startsWith("/inbox");

  React.useEffect(() => {
    const supabase = supabaseRef.current;
    const fetchCount = async () => {
      if (typeof document !== "undefined" && document.visibilityState === "hidden") return;
      const { data, error } = await supabase
        .from("sek_cases")
        .select("id, estado, unread_count")
        .in("estado", ["escalado", "abierto", "ia_atendiendo"])
        .neq("canal", "simulator")
        .neq("es_test", true)
        .order("created_at", { ascending: false })
        .limit(100);
      if (error || !data) { console.warn("[InboxBadge] error:", error); return; }
      let unread = 0;
      data.forEach((c: any) => {
        const estado = String(c.estado || "").toLowerCase();
        if (estado === "escalado" || (Number(c.unread_count) || 0) > 0) unread++;
      });
      setCount(unread);
    };

    fetchCount();

    let debounceTimer: ReturnType<typeof setTimeout> | null = null;
    const debouncedFetch = () => {
      if (debounceTimer) clearTimeout(debounceTimer);
      debounceTimer = setTimeout(fetchCount, 2000);
    };

    const unsubscribe = subscribeCasesRealtime(supabase, debouncedFetch);

    return () => {
      if (debounceTimer) clearTimeout(debounceTimer);
      unsubscribe();
    };
  }, []);

  if (!count) return null;

  return (
    <span className={`text-[10px] font-bold rounded-full px-2 py-0.5 ${isInInbox ? "bg-brand-600/30 text-brand-300" : "bg-red-600 text-white animate-pulse"}`}>
      {count}
    </span>
  );
}
