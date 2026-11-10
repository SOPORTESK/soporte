"use client";

import * as React from "react";
import { createClient } from "@/lib/supabase/client";
import { subscribeCasesRealtime } from "@/lib/cases-realtime-bus";
import { usePathname } from "next/navigation";

export function N2Badge({ initialCount }: { initialCount: number }) {
  const [count, setCount] = React.useState(initialCount);
  const [seen, setSeen] = React.useState(false);
  const pathname = usePathname();
  const supabase = React.useMemo(() => createClient(), []);

  // Cuando el usuario entra a /soporte-avanzado, marcar como visto
  React.useEffect(() => {
    if (pathname?.startsWith("/soporte-avanzado")) {
      setSeen(true);
    } else {
      // Al salir, volver a mostrar si hay casos nuevos
      setSeen(false);
    }
  }, [pathname]);

  // Suscripción Realtime compartida a cambios en sek_cases (con debounce)
  React.useEffect(() => {
    const fetchCount = async () => {
      if (typeof document !== "undefined" && document.visibilityState === "hidden") return;
      const { count: c } = await supabase
        .from("sek_cases")
        .select("*", { count: "exact", head: true })
        .eq("estado", "escalado")
        .is("assigned_to", null)
        .neq("es_test", true)
        .neq("canal", "simulator");
      setCount(c ?? 0);
    };

    fetchCount();

    // Solo reconsultar si el evento involucra el estado "escalado"
    let debounceTimer: ReturnType<typeof setTimeout> | null = null;
    const debouncedFetch = (payload?: any) => {
      if (payload?.eventType === "UPDATE") {
        const newEst = String(payload.new?.estado || "").toLowerCase();
        const oldEst = String(payload.old?.estado || "").toLowerCase();
        if (newEst !== "escalado" && oldEst !== "escalado") return;
      } else if (payload?.eventType === "INSERT") {
        const newEst = String(payload.new?.estado || "").toLowerCase();
        if (newEst !== "escalado") return;
      }
      if (debounceTimer) clearTimeout(debounceTimer);
      debounceTimer = setTimeout(fetchCount, 3000);
    };

    const unsubscribe = subscribeCasesRealtime(supabase, debouncedFetch);

    return () => {
      if (debounceTimer) clearTimeout(debounceTimer);
      unsubscribe();
    };
  }, [supabase]);

  if (!count || seen) return null;

  return (
    <span className="text-[10px] font-bold rounded-full bg-red-600 text-white px-2 py-0.5 animate-pulse">
      {count}
    </span>
  );
}
