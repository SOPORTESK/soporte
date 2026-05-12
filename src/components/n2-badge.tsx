"use client";

import * as React from "react";
import { createClient } from "@/lib/supabase/client";
import { usePathname } from "next/navigation";

export function N2Badge({ initialCount }: { initialCount: number }) {
  const [count, setCount] = React.useState(initialCount);
  const [seen, setSeen] = React.useState(false);
  const pathname = usePathname();
  const supabase = createClient();

  // Cuando el usuario entra a /soporte-avanzado, marcar como visto
  React.useEffect(() => {
    if (pathname?.startsWith("/soporte-avanzado")) {
      setSeen(true);
    } else {
      // Al salir, volver a mostrar si hay casos nuevos
      setSeen(false);
    }
  }, [pathname]);

  // Suscripción Realtime a cambios en sek_cases
  React.useEffect(() => {
    const fetchCount = async () => {
      const { count: c } = await supabase
        .from("sek_cases")
        .select("*", { count: "exact", head: true })
        .eq("estado", "escalado")
        .contains("tags", ["n2"]);
      setCount(c ?? 0);
    };

    fetchCount();

    const channel = supabase
      .channel("n2-badge-watch")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "sek_cases" },
        () => { fetchCount(); }
      )
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [supabase]);

  if (!count || seen) return null;

  return (
    <span className="text-[10px] font-bold rounded-full bg-red-600 text-white px-2 py-0.5 animate-pulse">
      {count}
    </span>
  );
}
