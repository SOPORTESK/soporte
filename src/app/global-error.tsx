"use client";

import { useEffect, useState } from "react";
import { AlertTriangle, RefreshCw } from "lucide-react";

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  const [showDetails, setShowDetails] = useState(false);

  useEffect(() => {
    // Only auto-reload once if strictly a chunk load error
    const msg = error?.message || "";
    const name = error?.name || "";
    const isChunkError =
      name === "ChunkLoadError" ||
      msg.includes("Loading chunk") ||
      msg.includes("ChunkLoadError") ||
      msg.includes("Failed to fetch dynamically imported module");

    if (isChunkError && typeof window !== "undefined") {
      const STORAGE_KEY = "sekunet_chunk_reload_global_ts";
      const lastRecover = Number(sessionStorage.getItem(STORAGE_KEY) || 0);
      const now = Date.now();

      if (!lastRecover || now - lastRecover > 60000) {
        sessionStorage.setItem(STORAGE_KEY, String(now));
        window.location.reload();
      }
    }
  }, [error]);

  return (
    <html lang="es">
      <body className="flex items-center justify-center min-h-dvh bg-[#090d16] text-slate-100 font-sans p-4">
        <div className="bg-[#131b2e] border border-[#233152] rounded-3xl p-8 max-w-md w-full text-center shadow-2xl space-y-5">
          <div className="h-14 w-14 rounded-2xl bg-amber-500/15 border border-amber-500/30 text-amber-400 grid place-items-center mx-auto">
            <AlertTriangle className="h-7 w-7" />
          </div>
          <div className="space-y-1.5">
            <h2 className="text-lg font-black text-white">Inconveniente al cargar la aplicación</h2>
            <p className="text-xs text-slate-400 leading-relaxed">
              Ocurrió un error inesperado al procesar la aplicación. Puedes reintentar o recargar la página.
            </p>
          </div>

          <div className="flex flex-col gap-2 pt-2">
            <button
              onClick={() => reset()}
              className="w-full flex items-center justify-center gap-2 py-3 px-4 rounded-xl bg-violet-600 hover:bg-violet-700 text-white font-bold text-xs shadow-lg shadow-violet-600/25 transition-all cursor-pointer"
            >
              <RefreshCw className="h-4 w-4" />
              Reintentar renderizado
            </button>
            <button
              onClick={() => { window.location.href = "/inbox"; }}
              className="w-full py-2.5 px-4 rounded-xl border border-slate-700 hover:bg-slate-800 text-slate-300 font-semibold text-xs transition-colors cursor-pointer"
            >
              Ir a la Bandeja principal
            </button>
          </div>

          {error?.message && (
            <div className="pt-2 border-t border-slate-800 text-left">
              <button
                onClick={() => setShowDetails(v => !v)}
                className="text-[11px] text-slate-400 hover:text-slate-200 underline cursor-pointer"
              >
                {showDetails ? "Ocultar detalle técnico" : "Ver detalle técnico"}
              </button>
              {showDetails && (
                <pre className="mt-2 p-2 bg-slate-900/90 border border-slate-800 rounded-lg text-[10px] text-slate-400 font-mono overflow-x-auto whitespace-pre-wrap max-h-32">
                  {error.message}
                  {error.digest ? `\nDigest: ${error.digest}` : ""}
                </pre>
              )}
            </div>
          )}
        </div>
      </body>
    </html>
  );
}