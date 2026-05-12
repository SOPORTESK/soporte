"use client";

import { Download, FileSpreadsheet, FileText } from "lucide-react";
import { exportToExcel, exportToCSV } from "@/lib/export-utils";

interface StatsExportButtonProps {
  data: any[];
  fileName: string;
}

export function StatsExportButton({ data, fileName }: StatsExportButtonProps) {
  return (
    <div className="flex gap-2">
      <button
        onClick={() => exportToExcel(data, fileName)}
        className="flex items-center gap-2 px-3 py-1.5 text-xs font-medium bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg transition-colors"
      >
        <FileSpreadsheet className="h-4 w-4" /> Excel
      </button>
      <button
        onClick={() => exportToCSV(data, fileName)}
        className="flex items-center gap-2 px-3 py-1.5 text-xs font-medium bg-brand-600 hover:bg-brand-700 text-white rounded-lg transition-colors"
      >
        <FileText className="h-4 w-4" /> CSV
      </button>
      <button
        onClick={() => window.print()}
        className="flex items-center gap-2 px-3 py-1.5 text-xs font-medium border border-border hover:bg-muted rounded-lg transition-colors print:hidden"
      >
        <Download className="h-4 w-4" /> Imprimir PDF
      </button>
    </div>
  );
}
