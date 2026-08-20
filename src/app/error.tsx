"use client";

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <html>
      <body className="flex items-center justify-center min-h-screen bg-gray-950 text-gray-200 font-sans">
        <div className="text-center space-y-4 p-8 max-w-xl">
          <h1 className="text-xl font-semibold">Sekunet Chat</h1>
          <p className="text-gray-400">No se pudo cargar la aplicaci&oacute;n.</p>
          <pre className="text-left text-xs bg-gray-900 border border-gray-800 rounded p-3 overflow-auto max-h-60 whitespace-pre-wrap">
            {error?.message || "Error desconocido"}
            {error?.digest ? `\n\ndigest: ${error.digest}` : ""}
          </pre>
          <button
            onClick={reset}
            className="px-4 py-2 bg-blue-600 rounded hover:bg-blue-500 transition"
          >
            Reintentar
          </button>
        </div>
      </body>
    </html>
  );
}
