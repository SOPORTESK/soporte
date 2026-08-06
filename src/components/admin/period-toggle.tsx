"use client";

import * as React from "react";
import { useRouter, useSearchParams } from "next/navigation";

export function PeriodToggle() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const current = searchParams.get("periodo") || "semana";

  function onChange(value: string) {
    const params = new URLSearchParams(searchParams.toString());
    if (value === "semana") {
      params.delete("periodo");
    } else {
      params.set("periodo", value);
    }
    router.push(`/admin/estadisticas/atencion?${params.toString()}`);
  }

  return (
    <div className="inline-flex rounded-lg border border-border bg-muted/30 p-0.5">
      <button
        onClick={() => onChange("semana")}
        className={`px-2.5 py-1 text-[10px] font-black uppercase rounded-md transition-colors ${current === "semana" ? "bg-brand-600 text-white" : "text-muted-foreground hover:text-foreground"}`}
      >
        7 días
      </button>
      <button
        onClick={() => onChange("mes")}
        className={`px-2.5 py-1 text-[10px] font-black uppercase rounded-md transition-colors ${current === "mes" ? "bg-brand-600 text-white" : "text-muted-foreground hover:text-foreground"}`}
      >
        Mes
      </button>
    </div>
  );
}
