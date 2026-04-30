"use client";
import * as React from "react";
import { Monitor, Code2, Copy, Check, ExternalLink } from "lucide-react";

export default function WebPreviewPage() {
  const [copied, setCopied] = React.useState(false);
  const [tab, setTab] = React.useState<"preview" | "code">("preview");

  const origin = typeof window !== "undefined" ? window.location.origin : "https://TU-DOMINIO";
  const snippet = `<!-- Sekunet Chat Widget -->
<script
  src="${origin}/widget.js"
  data-color="#1d4ed8"
  data-label="Contactar soporte"
  data-position="bottom-right"
  defer
></script>`;

  function copy() {
    navigator.clipboard.writeText(snippet).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  }

  return (
    <div className="flex flex-col h-full min-h-0 bg-muted/20">
      {/* Header */}
      <div className="px-6 py-4 border-b border-border bg-card flex items-center gap-3 flex-shrink-0">
        <div className="h-9 w-9 rounded-xl bg-brand-700/10 grid place-items-center">
          <Monitor className="h-5 w-5 text-brand-700" />
        </div>
        <div>
          <h1 className="font-semibold text-base">Widget Web — Canal de pruebas</h1>
          <p className="text-xs text-muted-foreground">Prueba el chat como lo vería un visitante de tu sitio</p>
        </div>
        <a
          href="/widget/chat"
          target="_blank"
          rel="noopener noreferrer"
          className="ml-auto inline-flex items-center gap-1.5 text-xs text-muted-foreground hover:text-brand-700 transition-colors"
        >
          <ExternalLink className="h-3.5 w-3.5" />
          Abrir en ventana
        </a>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 px-6 pt-4 flex-shrink-0">
        {(["preview", "code"] as const).map(t => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={[
              "px-4 py-1.5 rounded-lg text-sm font-medium transition-colors",
              tab === t
                ? "bg-brand-700 text-white"
                : "text-muted-foreground hover:bg-muted"
            ].join(" ")}
          >
            {t === "preview" ? "Vista previa" : "Código para incrustar"}
          </button>
        ))}
      </div>

      {/* Content */}
      <div className="flex-1 min-h-0 p-6 overflow-auto">
        {tab === "preview" ? (
          <div className="flex flex-col items-center gap-4">
            <p className="text-sm text-muted-foreground text-center max-w-md">
              Así verán el widget los visitantes de tu sitio. Puedes probarlo directamente aquí.
            </p>
            {/* Simulación de sitio web */}
            <div className="w-full max-w-3xl rounded-2xl border border-border overflow-hidden shadow-lg">
              {/* Barra de navegador falsa */}
              <div className="flex items-center gap-2 px-4 py-3 bg-zinc-100 dark:bg-zinc-800 border-b border-border">
                <div className="flex gap-1.5">
                  <span className="w-3 h-3 rounded-full bg-red-400" />
                  <span className="w-3 h-3 rounded-full bg-yellow-400" />
                  <span className="w-3 h-3 rounded-full bg-green-400" />
                </div>
                <div className="flex-1 mx-4 bg-white dark:bg-zinc-700 rounded-md px-3 py-1 text-xs text-muted-foreground border border-border">
                  www.tu-sitio-web.com
                </div>
              </div>

              {/* Contenido falso del sitio */}
              <div className="relative bg-white dark:bg-zinc-900" style={{ height: 480 }}>
                <div className="p-8">
                  <div className="h-6 w-40 rounded bg-zinc-200 dark:bg-zinc-700 mb-3" />
                  <div className="h-4 w-72 rounded bg-zinc-100 dark:bg-zinc-800 mb-2" />
                  <div className="h-4 w-56 rounded bg-zinc-100 dark:bg-zinc-800 mb-2" />
                  <div className="h-4 w-64 rounded bg-zinc-100 dark:bg-zinc-800" />
                  <div className="mt-6 grid grid-cols-3 gap-3">
                    {[1, 2, 3].map(i => (
                      <div key={i} className="h-24 rounded-xl bg-zinc-100 dark:bg-zinc-800" />
                    ))}
                  </div>
                </div>

                {/* iframe del widget anclado dentro */}
                <iframe
                  src="/widget/chat"
                  title="Sekunet Chat Widget Preview"
                  style={{
                    position: "absolute",
                    bottom: 0,
                    right: 0,
                    width: 350,
                    height: 480,
                    border: "none",
                    borderRadius: "18px 0 0 0",
                    boxShadow: "0 8px 48px rgba(0,0,0,.18)",
                  }}
                />
              </div>
            </div>
          </div>
        ) : (
          <div className="max-w-2xl mx-auto flex flex-col gap-6">
            <div className="rounded-2xl border border-border bg-card p-6">
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-2">
                  <Code2 className="h-4 w-4 text-muted-foreground" />
                  <span className="font-semibold text-sm">Código para incrustar</span>
                </div>
                <button
                  onClick={copy}
                  className="inline-flex items-center gap-1.5 text-xs text-muted-foreground hover:text-brand-700 transition-colors"
                >
                  {copied ? <Check className="h-3.5 w-3.5 text-green-500" /> : <Copy className="h-3.5 w-3.5" />}
                  {copied ? "¡Copiado!" : "Copiar"}
                </button>
              </div>
              <pre className="text-xs bg-zinc-950 text-green-400 p-4 rounded-xl overflow-x-auto leading-relaxed">
                <code>{snippet}</code>
              </pre>
            </div>

            {/* Instrucciones */}
            <div className="rounded-2xl border border-border bg-card p-6 space-y-4">
              <h2 className="font-semibold text-sm">¿Cómo instalarlo?</h2>
              <ol className="space-y-3 text-sm text-muted-foreground list-decimal list-inside">
                <li>Copia el código de arriba.</li>
                <li>
                  Pégalo justo antes de la etiqueta <code className="text-xs bg-muted px-1 py-0.5 rounded">&lt;/body&gt;</code> de tu sitio web.
                </li>
                <li>Aparecerá un botón flotante "Contactar soporte" en la esquina inferior derecha.</li>
                <li>Los mensajes de tus visitantes llegarán al <strong>Inbox</strong> como canal <strong>web</strong>.</li>
              </ol>

              <div className="mt-4 rounded-xl bg-muted/60 p-4 space-y-2 text-xs text-muted-foreground">
                <p><strong>data-color</strong> — Color del botón (hex, ej: <code>#1d4ed8</code>)</p>
                <p><strong>data-label</strong> — Texto del tooltip (ej: <code>Contactar soporte</code>)</p>
                <p><strong>data-position</strong> — Posición: <code>bottom-right</code>, <code>bottom-left</code>, <code>top-right</code>, <code>top-left</code></p>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
