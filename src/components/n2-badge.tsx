"use client";

import * as React from "react";
import { createClient } from "@/lib/supabase/client";
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

  // Suscripción Realtime a cambios en sek_cases (con debounce)
  React.useEffect(() => {
    const fetchCount = async () => {
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
      debounceTimer = setTimeout(fetchCount, 1500);
    };

    const channel = supabase
      .channel("n2-badge-watch")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "sek_cases" },
        debouncedFetch
      )
      .subscribe();

    return () => {
      if (debounceTimer) clearTimeout(debounceTimer);
      supabase.removeChannel(channel);
    };
  }, [supabase]);

  if (!count || seen) return null;

  return (
    <span className="text-[10px] font-bold rounded-full bg-red-600 text-white px-2 py-0.5 animate-pulse">
      {count}
    </span>
  );
}
