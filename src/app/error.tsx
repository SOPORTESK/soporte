"use client";

import { useEffect, useState } from "react";
import { RefreshCw, ShieldAlert } from "lucide-react";

export default function ErrorPage({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  const [countdown, setCountdown] = useState(4);

  useEffect(() => {
    const msg = error?.message || "";
    if (
      msg.includes("Loading chunk") ||
      msg.includes("ChunkLoadError") ||
      msg.includes("Failed to fetch dynamically imported module") ||
      msg.includes("useContext")
    ) {
      window.location.reload();
      return;
    }

    const timer = setInterval(() => {
      setCountdown((prev) => {
        if (prev <= 1) {
          clearInterval(timer);
          window.location.reload();
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    return () => clearInterval(timer);
  }, [error]);

  return (
    <div className="flex items-center justify-center min-h-[70vh] p-4 font-sans">
      <div className="bg-card border border-border rounded-3xl p-8 max-w-md w-full text-center shadow-2xl space-y-5">
        <div className="h-14 w-14 rounded-2xl bg-violet-600/15 border border-violet-500/30 text-violet-400 grid place-items-center mx-auto">
          <ShieldAlert className="h-7 w-7" />
        </div>
        <div className="space-y-1.5">
          <h2 className="text-lg font-black text-foreground">Soporte Sekunet — Autorecuperación</h2>
          <p className="text-xs text-muted-foreground leading-relaxed">
            Se detectó un cambio de versión o actualización. Restaurando la vista automáticamente.
          </p>
        </div>

        <div className="flex flex-col gap-2 pt-2">
          <button
            onClick={() => window.location.reload()}
            className="w-full flex items-center justify-center gap-2 py-3 px-4 rounded-xl bg-violet-600 hover:bg-violet-700 text-white font-bold text-xs shadow-lg shadow-violet-600/25 transition-all"
          >
            <RefreshCw className="h-4 w-4 animate-spin" />
            Recargar ahora {countdown > 0 ? `(${countdown}s)` : ""}
          </button>
          <button
            onClick={() => reset()}
            className="w-full py-2.5 px-4 rounded-xl border border-border hover:bg-muted text-muted-foreground hover:text-foreground font-semibold text-xs transition-colors"
          >
            Reintentar componente
          </button>
        </div>
      </div>
    </div>
  );
}