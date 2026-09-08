"use client";

import { useEffect, useState } from "react";
import { RefreshCw, ShieldAlert } from "lucide-react";

export default function AppError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  const [countdown, setCountdown] = useState(3);

  useEffect(() => {
    const msg = error?.message || "";
    // Si es un error de chunk o versión tras un deploy/build, forzar recarga inmediata
    if (
      msg.includes("Loading chunk") ||
      msg.includes("ChunkLoadError") ||
      msg.includes("Failed to fetch dynamically imported module") ||
      msg.includes("useContext") ||
      error?.name === "ChunkLoadError"
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
        <div className="h-14 w-14 rounded-2xl bg-brand-500/15 border border-brand-500/30 text-brand-500 grid place-items-center mx-auto">
          <ShieldAlert className="h-7 w-7" />
        </div>
        <div className="space-y-1.5">
          <h2 className="text-lg font-black text-foreground">Actualización detectada</h2>
          <p className="text-xs text-muted-foreground leading-relaxed">
            Se actualizaron los componentes del chat. Restaurando la vista automáticamente...
          </p>
        </div>

        <div className="flex flex-col gap-2 pt-2">
          <button
            onClick={() => window.location.reload()}
            className="w-full flex items-center justify-center gap-2 py-3 px-4 rounded-xl bg-brand-600 hover:bg-brand-700 text-white font-bold text-xs shadow-lg shadow-brand-600/25 transition-all"
          >
            <RefreshCw className="h-4 w-4 animate-spin" />
            Recargar ahora {countdown > 0 ? `(${countdown}s)` : ""}
          </button>
          <button
            onClick={() => window.location.reload()}
            className="w-full py-2.5 px-4 rounded-xl border border-border hover:bg-muted text-muted-foreground hover:text-foreground font-semibold text-xs transition-colors"
          >
            Reintentar
          </button>
        </div>
      </div>
    </div>
  );
}

