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
        <div className="text-center space-y-4 p-8">
          <h1 className="text-xl font-semibold">Sekunet Chat</h1>
          <p className="text-gray-400">
            No se pudo cargar la aplicaci&oacute;n. La base de datos no est&aacute; disponible en este momento.
          </p>
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
