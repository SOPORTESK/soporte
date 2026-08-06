"use client";

import * as React from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Calendar } from "lucide-react";

const MESES = [
  "Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio",
  "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre"
];

export function MonthSelector({ availableMonths }: { availableMonths: string[] }) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const current = searchParams.get("mes") || "all";

  function onChange(value: string) {
    const params = new URLSearchParams(searchParams.toString());
    if (value === "all") {
      params.delete("mes");
    } else {
      params.set("mes", value);
    }
    router.push(`/admin/estadisticas/atencion?${params.toString()}`);
  }

  return (
    <div className="flex items-center gap-2">
      <div className="relative">
        <Calendar className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground pointer-events-none" />
        <select
          value={current}
          onChange={(e) => onChange(e.target.value)}
          className="appearance-none pl-8 pr-8 py-2 rounded-xl border border-border bg-card text-sm font-bold hover:bg-muted transition-colors cursor-pointer focus:outline-none focus:ring-2 focus:ring-brand-500/40"
        >
          <option value="all">Todos los meses</option>
          {availableMonths.map(m => {
            const [y, mo] = m.split("-");
            const label = `${MESES[parseInt(mo) - 1]} ${y}`;
            return <option key={m} value={m}>{label}</option>;
          })}
        </select>
      </div>
    </div>
  );
}
