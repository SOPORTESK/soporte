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
      <div className="text-center space-y-4 p-8 max-w-xl">
        <h2 className="text-lg font-semibold">Error al cargar la p&aacute;gina</h2>
        <pre className="text-left text-xs bg-gray-900 border border-gray-800 rounded p-3 overflow-auto max-h-60 whitespace-pre-wrap">
          {error?.message || "Error desconocido"}
          {error?.digest ? `\n\ndigest: ${error.digest}` : ""}
        </pre>
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
