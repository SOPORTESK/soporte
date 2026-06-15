"use client";

import * as React from "react";
import { createClient } from "@/lib/supabase/client";
import { usePathname } from "next/navigation";

export function SmartInboxBadge({ initialCount }: { initialCount: number }) {
  const [count, setCount] = React.useState(initialCount);
  const [seen, setSeen] = React.useState(false);
  const pathname = usePathname();
  const supabase = createClient();

  React.useEffect(() => {
    if (pathname?.startsWith("/smart-inbox")) {
      setSeen(true);
    } else {
      setSeen(false);
    }
  }, [pathname]);

  React.useEffect(() => {
    const fetchCount = async () => {
      const { count: c } = await supabase
        .from("sek_cases")
        .select("*", { count: "exact", head: true })
        .eq("estado", "ia_atendiendo")
        .neq("canal", "simulator");
      setCount(c ?? 0);
    };

    fetchCount();

    const channel = supabase
      .channel("smart-inbox-badge-watch")
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
    <span className="text-[10px] font-bold rounded-full bg-violet-600 text-white px-2 py-0.5 animate-pulse">
      {count}
    </span>
  );
}
