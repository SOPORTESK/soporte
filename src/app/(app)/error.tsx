"use client";

import { useEffect, useState } from "react";
import { AlertTriangle, RefreshCw, Home } from "lucide-react";
import Link from "next/link";

export default function AppError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  const [showDetails, setShowDetails] = useState(false);

  useEffect(() => {
    const msg = error?.message || "";
    const name = error?.name || "";
    const isChunkError =
      name === "ChunkLoadError" ||
      msg.includes("Loading chunk") ||
      msg.includes("ChunkLoadError") ||
      msg.includes("Failed to fetch dynamically imported module");

    if (isChunkError && typeof window !== "undefined") {
      const STORAGE_KEY = "sekunet_chunk_reload_app_ts";
      const lastRecover = Number(sessionStorage.getItem(STORAGE_KEY) || 0);
      const now = Date.now();

      if (!lastRecover || now - lastRecover > 60000) {
        sessionStorage.setItem(STORAGE_KEY, String(now));
        window.location.reload();
      }
    }
  }, [error]);

  return (
    <div className="flex items-center justify-center min-h-[70vh] p-4 font-sans">
      <div className="bg-card border border-border rounded-2xl p-6 sm:p-8 max-w-md w-full text-center shadow-xl space-y-4">
        <div className="h-12 w-12 rounded-xl bg-amber-500/10 border border-amber-500/30 text-amber-400 grid place-items-center mx-auto">
          <AlertTriangle className="h-6 w-6" />
        </div>
        <div className="space-y-1">
          <h2 className="text-base font-bold text-foreground">Inconveniente al cargar el módulo</h2>
          <p className="text-xs text-muted-foreground leading-relaxed">
            Se produjo un error al procesar este módulo. Puedes reintentar o volver a la vista principal.
          </p>
        </div>

        <div className="flex flex-col gap-2 pt-2">
          <button
            onClick={() => reset()}
            className="w-full flex items-center justify-center gap-2 py-2.5 px-4 rounded-xl bg-violet-600 hover:bg-violet-700 text-white font-semibold text-xs shadow-md shadow-violet-600/20 transition-all cursor-pointer"
          >
            <RefreshCw className="h-3.5 w-3.5" />
            Reintentar componente
          </button>
          <button
            onClick={() => { window.location.reload(); }}
            className="w-full py-2.5 px-4 rounded-xl border border-border hover:bg-muted text-foreground font-semibold text-xs transition-colors cursor-pointer"
          >
            Recargar página
          </button>
          <Link
            href="/inbox"
            className="w-full py-2 px-4 rounded-xl text-muted-foreground hover:text-foreground font-medium text-xs transition-colors flex items-center justify-center gap-1.5"
          >
            <Home className="h-3.5 w-3.5" />
            Ir a Bandeja
          </Link>
        </div>

        {error?.message && (
          <div className="pt-2 border-t border-border/40 text-left">
            <button
              onClick={() => setShowDetails(v => !v)}
              className="text-[11px] text-muted-foreground hover:text-foreground underline cursor-pointer"
            >
              {showDetails ? "Ocultar detalle técnico" : "Ver detalle técnico"}
            </button>
            {showDetails && (
              <pre className="mt-2 p-2 bg-muted/60 rounded-lg text-[10px] text-muted-foreground font-mono overflow-x-auto whitespace-pre-wrap max-h-32">
                {error.message}
                {error.digest ? `\nDigest: ${error.digest}` : ""}
              </pre>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
