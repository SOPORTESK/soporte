"use client";

import { useState, useMemo } from "react";
import { ChevronLeft, ChevronRight, ExternalLink } from "lucide-react";
import Link from "next/link";

interface EquipoData {
  marca: string;
  modelo: string | null;
  total: number;
  resueltos: number;
  clientesCount: number;
  ultimoCasoId: string | number;
}

export function EquiposTable({ equipos }: { equipos: EquipoData[] }) {
  const PAGE_SIZE = 8;
  const [currentPage, setCurrentPage] = useState(0);
  const [displayCount, setDisplayCount] = useState(PAGE_SIZE);

  const totalPages = Math.ceil(equipos.length / PAGE_SIZE);
  const pageStart = currentPage * PAGE_SIZE;
  const pageEnd = Math.min(pageStart + displayCount, equipos.length);
  const visible = equipos.slice(pageStart, pageEnd);
  const hasMore = pageEnd < equipos.length;

  return (
    <div className="rounded-2xl border border-border/60 bg-card overflow-hidden">
      <div className="flex items-center justify-between px-5 py-4 border-b border-border/50">
        <h3 className="font-black text-sm">Equipos Más Reportados</h3>
        <span className="text-[10px] font-black px-2 py-0.5 rounded-full bg-sky-500/10 text-sky-500">{equipos.length}</span>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-xs">
          <thead>
            <tr className="border-b border-border/30">
              <th className="px-4 py-2.5 text-left text-[9px] font-black uppercase tracking-widest text-muted-foreground/60">Equipo</th>
              <th className="px-3 py-2.5 text-center text-[9px] font-black uppercase tracking-widest text-muted-foreground/60">Casos</th>
              <th className="px-3 py-2.5 text-center text-[9px] font-black uppercase tracking-widest text-muted-foreground/60">Clientes</th>
              <th className="px-3 py-2.5 text-center text-[9px] font-black uppercase tracking-widest text-muted-foreground/60">Tasa</th>
              <th className="px-3 py-2.5 text-center text-[9px] font-black uppercase tracking-widest text-muted-foreground/60"></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border/30">
            {visible.length === 0 && (
              <tr><td colSpan={5} className="py-10 text-center text-muted-foreground">Sin datos de equipos aún.</td></tr>
            )}
            {visible.map((e, i) => {
              const tasa = e.total > 0 ? Math.round((e.resueltos / e.total) * 100) : 0;
              return (
                <tr key={i} className="hover:bg-muted/20 transition-colors">
                  <td className="px-4 py-2.5">
                    <p className="font-bold text-xs truncate">{e.marca}</p>
                    <p className="text-[9px] text-muted-foreground truncate">{e.modelo || "Sin modelo"}</p>
                  </td>
                  <td className="px-3 py-2.5 text-center">
                    <span className="font-black text-sm tabular-nums text-sky-500">{e.total}</span>
                  </td>
                  <td className="px-3 py-2.5 text-center">
                    <span className="text-[10px] font-bold tabular-nums text-muted-foreground">{e.clientesCount}</span>
                  </td>
                  <td className="px-3 py-2.5 text-center">
                    <span className="text-[9px] font-bold text-emerald-500">{tasa}%</span>
                  </td>
                  <td className="px-3 py-2.5 text-center">
                    <Link href={`/inbox?case=${e.ultimoCasoId}`} className="text-brand-500 hover:text-brand-600">
                      <ExternalLink className="h-3 w-3" />
                    </Link>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {equipos.length > 0 && (
        <div className="px-5 py-3 border-t border-border/30 bg-muted/5 flex flex-wrap items-center justify-between gap-3">
          <span className="text-[10px] text-muted-foreground font-bold">
            Mostrando {pageStart + 1}-{pageEnd} de {equipos.length}
          </span>
          <div className="flex items-center gap-2">
            {hasMore && (
              <button
                onClick={() => setDisplayCount(c => c + PAGE_SIZE)}
                className="px-3 py-1.5 rounded-lg text-[10px] font-black bg-sky-500/10 text-sky-500 hover:bg-sky-500/20 transition-colors"
              >
                Ver más (+{Math.min(PAGE_SIZE, equipos.length - pageEnd)})
              </button>
            )}
            {totalPages > 1 && (
              <div className="flex items-center gap-1">
                <button
                  onClick={() => { setCurrentPage(p => Math.max(0, p - 1)); setDisplayCount(PAGE_SIZE); }}
                  disabled={currentPage === 0}
                  className="p-1.5 rounded-lg text-muted-foreground hover:bg-muted disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
                >
                  <ChevronLeft className="h-3.5 w-3.5" />
                </button>
                <span className="text-[10px] font-black tabular-nums px-2">
                  {currentPage + 1} / {totalPages}
                </span>
                <button
                  onClick={() => { setCurrentPage(p => Math.min(totalPages - 1, p + 1)); setDisplayCount(PAGE_SIZE); }}
                  disabled={currentPage >= totalPages - 1}
                  className="p-1.5 rounded-lg text-muted-foreground hover:bg-muted disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
                >
                  <ChevronRight className="h-3.5 w-3.5" />
                </button>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
