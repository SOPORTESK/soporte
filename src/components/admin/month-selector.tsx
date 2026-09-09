"use client";

import * as React from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Calendar, X } from "lucide-react";

const MESES = [
  "Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio",
  "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre"
];

export function MonthSelector({ availableMonths }: { availableMonths: string[] }) {
  const router = useRouter();
  const searchParams = useSearchParams();

  const mesParam = searchParams.get("mes");
  const rangoParam = searchParams.get("rango");
  const diaParam = searchParams.get("dia");

  // Determinar valor actual del select
  let selectValue = "all";
  if (diaParam) {
    selectValue = `dia:${diaParam}`;
  } else if (rangoParam) {
    selectValue = `rango:${rangoParam}`;
  } else if (mesParam && mesParam !== "all") {
    selectValue = `mes:${mesParam}`;
  }

  function handleSelectChange(val: string) {
    const params = new URLSearchParams(searchParams.toString());
    params.delete("mes");
    params.delete("rango");
    params.delete("dia");

    if (val === "all") {
      // sin params de filtro
    } else if (val.startsWith("rango:")) {
      params.set("rango", val.replace("rango:", ""));
    } else if (val.startsWith("mes:")) {
      params.set("mes", val.replace("mes:", ""));
    }

    router.push(`/admin/estadisticas/atencion?${params.toString()}`);
  }

  function handleDateInput(e: React.ChangeEvent<HTMLInputElement>) {
    const val = e.target.value;
    const params = new URLSearchParams(searchParams.toString());
    params.delete("mes");
    params.delete("rango");
    if (val) {
      params.set("dia", val);
    } else {
      params.delete("dia");
    }
    router.push(`/admin/estadisticas/atencion?${params.toString()}`);
  }

  function handleClear() {
    const params = new URLSearchParams(searchParams.toString());
    params.delete("mes");
    params.delete("rango");
    params.delete("dia");
    router.push(`/admin/estadisticas/atencion?${params.toString()}`);
  }

  const hasFilter = Boolean(diaParam || rangoParam || (mesParam && mesParam !== "all"));

  return (
    <div className="flex items-center gap-2 flex-wrap">
      {/* Selector Desplegable */}
      <div className="relative">
        <Calendar className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground pointer-events-none" />
        <select
          value={selectValue.startsWith("dia:") ? "custom_dia" : selectValue}
          onChange={(e) => handleSelectChange(e.target.value)}
          className="appearance-none pl-8 pr-8 py-2 rounded-xl border border-border bg-card text-xs font-bold hover:bg-muted transition-colors cursor-pointer focus:outline-none focus:ring-2 focus:ring-brand-500/40 text-foreground"
        >
          <option value="all">Todo el historial</option>

          <optgroup label="Períodos rápidos">
            <option value="rango:hoy">📅 Hoy</option>
            <option value="rango:ayer">📅 Ayer</option>
            <option value="rango:7d">⚡ Últimos 7 días</option>
            <option value="rango:30d">📆 Últimos 30 días</option>
          </optgroup>

          <optgroup label="Por Mes">
            {availableMonths.map(m => {
              const [y, mo] = m.split("-");
              const label = `${MESES[parseInt(mo, 10) - 1] || mo} ${y}`;
              return <option key={m} value={`mes:${m}`}>{label}</option>;
            })}
          </optgroup>

          {diaParam && (
            <option value="custom_dia">Día: {diaParam}</option>
          )}
        </select>
      </div>

      {/* Selector de Día Exacto */}
      <div className="flex items-center gap-1.5" title="Elegir día exacto en el calendario">
        <input
          type="date"
          value={diaParam || ""}
          onChange={handleDateInput}
          className="px-2.5 py-1.5 rounded-xl border border-border bg-card text-xs font-bold hover:bg-muted transition-colors cursor-pointer focus:outline-none focus:ring-2 focus:ring-brand-500/40 text-foreground"
        />
      </div>

      {/* Botón para limpiar filtro */}
      {hasFilter && (
        <button
          onClick={handleClear}
          title="Restablecer filtro a todo el historial"
          className="p-2 rounded-xl border border-border bg-card hover:bg-rose-500/10 hover:text-rose-400 hover:border-rose-500/30 text-muted-foreground transition-colors text-xs flex items-center gap-1 font-bold"
        >
          <X className="h-3.5 w-3.5" />
          <span className="hidden sm:inline text-[11px]">Limpiar</span>
        </button>
      )}
    </div>
  );
}
