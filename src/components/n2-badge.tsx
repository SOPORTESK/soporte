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

    // Debounce para no disparar múltiples queries si llegan ráfagas de cambios
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
  }, [supabase]);

  if (!count || seen) return null;

  return (
    <span className="text-[10px] font-bold rounded-full bg-red-600 text-white px-2 py-0.5 animate-pulse">
      {count}
    </span>
  );
}
