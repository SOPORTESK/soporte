"use client";

export default function AppError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <div className="flex items-center justify-center min-h-screen bg-gray-950 text-gray-200">
      <div className="text-center space-y-4 p-8">
        <h2 className="text-lg font-semibold">Error al cargar la p&aacute;gina</h2>
        <p className="text-sm text-gray-400">
          La base de datos no est&aacute; disponible. Reintente en unos segundos.
        </p>
        <button
          onClick={reset}
          className="px-4 py-2 bg-blue-600 rounded text-sm hover:bg-blue-500 transition"
        >
          Reintentar
        </button>
      </div>
    </div>
  );
}
