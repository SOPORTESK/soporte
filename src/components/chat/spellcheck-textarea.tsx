"use client";

import * as React from "react";
import type { SpellError } from "./use-spellcheck";

interface SpellCheckTextareaProps {
  value: string;
  onChange: (value: string) => void;
  onKeyDown?: (e: React.KeyboardEvent<HTMLTextAreaElement>) => void;
  onPaste?: (e: React.ClipboardEvent<HTMLTextAreaElement>) => void;
  placeholder?: string;
  rows?: number;
  ariaLabel?: string;
  className?: string;
  disabled?: boolean;
  errors: SpellError[];
  loading: boolean;
}

/**
 * Colores colorblind-friendly:
 * - Ortografía: subrayado azul oscuro (#0066CC) — visible para deuteranopía/protanopía
 * - Gramática: subrayado naranja (#E67E22) — visible para tritanopía
 * - Estilo: subrayado púrpura (#8E44AD) — distinto de rojo/verde
 */
const ERROR_STYLES: Record<SpellError["type"], { bg: string; border: string; label: string }> = {
  spelling:   { bg: "rgba(0, 102, 204, 0.12)",  border: "#0066CC", label: "Ortografía" },
  grammar:    { bg: "rgba(230, 126, 34, 0.12)", border: "#E67E22", label: "Gramática" },
  style:      { bg: "rgba(142, 68, 173, 0.12)", border: "#8E44AD", label: "Estilo" },
  typography: { bg: "rgba(142, 68, 173, 0.12)", border: "#8E44AD", label: "Tipografía" },
};

function cn(...classes: (string | false | undefined | null)[]): string {
  return classes.filter(Boolean).join(" ");
}

export const SpellCheckTextarea = React.forwardRef<HTMLTextAreaElement, SpellCheckTextareaProps>(
  (
    { value, onChange, onKeyDown, onPaste, placeholder, rows, ariaLabel, className, disabled, errors, loading },
    _ref
  ) => {
    const [activeError, setActiveError] = React.useState<number | null>(null);
    const textareaRef = React.useRef<HTMLTextAreaElement | null>(null);

    const highlightedContent = React.useMemo(() => {
      if (errors.length === 0 || !value) return null;

      const parts: { text: string; errorIdx?: number }[] = [];
      let cursor = 0;
      const sorted = [...errors].sort((a, b) => a.offset - b.offset);

      for (const [i, err] of sorted.entries()) {
        if (err.offset < cursor) continue;
        if (err.offset > cursor) {
          parts.push({ text: value.slice(cursor, err.offset) });
        }
        parts.push({ text: value.slice(err.offset, err.offset + err.length), errorIdx: i });
        cursor = err.offset + err.length;
      }
      if (cursor < value.length) {
        parts.push({ text: value.slice(cursor) });
      }
      return { parts, sorted };
    }, [errors, value]);

    function applySuggestion(errorIdx: number, suggestion: string) {
      const err = highlightedContent?.sorted[errorIdx];
      if (!err) return;
      const newText = value.slice(0, err.offset) + suggestion + value.slice(err.offset + err.length);
      onChange(newText);
      setActiveError(null);
    }

    function handleTextareaClick(e: React.MouseEvent<HTMLTextAreaElement>) {
      const ta = e.currentTarget;
      const pos = ta.selectionStart;
      if (highlightedContent) {
        const idx = highlightedContent.sorted.findIndex(
          err => pos >= err.offset && pos <= err.offset + err.length
        );
        setActiveError(idx >= 0 ? idx : null);
      }
    }

    return (
      <div className={cn("relative flex-1 min-w-0", className)}>
        {/* Mirror div: muestra el texto con highlights detrás del textarea */}
        <div
          aria-hidden
          className="absolute inset-0 px-3 py-2 text-sm whitespace-pre-wrap break-words pointer-events-none overflow-hidden"
          style={{
            fontFamily: "inherit",
            fontSize: "inherit",
            lineHeight: "inherit",
            letterSpacing: "inherit",
            color: "transparent",
            zIndex: 0,
          }}
        >
          {highlightedContent ? (
            highlightedContent.parts.map((part, i) =>
              part.errorIdx !== undefined ? (
                <span
                  key={i}
                  style={{
                    backgroundColor: ERROR_STYLES[highlightedContent.sorted[part.errorIdx].type].bg,
                    borderBottom: `2px solid ${ERROR_STYLES[highlightedContent.sorted[part.errorIdx].type].border}`,
                    borderRadius: "2px",
                  }}
                >
                  {part.text}
                </span>
              ) : (
                <span key={i}>{part.text}</span>
              )
            )
          ) : (
            <span>{value}</span>
          )}
          {"\n"}
        </div>

        {/* Textarea transparente encima del mirror */}
        <textarea
          ref={textareaRef}
          value={value}
          onChange={e => {
            onChange(e.target.value);
            const el = e.target;
            el.style.height = "auto";
            el.style.height = Math.min(el.scrollHeight, 160) + "px";
          }}
          onKeyDown={onKeyDown}
          onPaste={onPaste}
          onClick={handleTextareaClick}
          onBlur={() => setTimeout(() => setActiveError(null), 200)}
          placeholder={placeholder}
          rows={rows}
          aria-label={ariaLabel}
          disabled={disabled}
          className={cn(
            "relative w-full min-h-[44px] max-h-40 overflow-y-auto rounded-lg border border-input bg-transparent px-3 py-2 text-sm",
            "placeholder:text-muted-foreground transition-colors resize-none",
            "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background",
            "disabled:cursor-not-allowed disabled:opacity-50",
            "z-10"
          )}
          style={{ background: "transparent" }}
        />

        {/* Indicador de carga */}
        {loading && (
          <div className="absolute -top-1 -right-1 z-20">
            <span className="block h-3 w-3 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
          </div>
        )}

        {/* Popover de sugerencias */}
        {activeError !== null && highlightedContent && highlightedContent.sorted[activeError] && (
          <SuggestionPopover
            error={highlightedContent.sorted[activeError]}
            fullText={value}
            onApply={(suggestion) => applySuggestion(activeError, suggestion)}
            onDismiss={() => setActiveError(null)}
          />
        )}
      </div>
    );
  }
);

SpellCheckTextarea.displayName = "SpellCheckTextarea";

function SuggestionPopover({
  error,
  fullText,
  onApply,
  onDismiss,
}: {
  error: SpellError;
  fullText: string;
  onApply: (s: string) => void;
  onDismiss: () => void;
}) {
  const wrongText = fullText.slice(error.offset, error.offset + error.length);
  const style = ERROR_STYLES[error.type];

  return (
    <div
      className="absolute z-50 bottom-full mb-1 left-3 w-72 max-w-[90%] rounded-lg border border-border bg-card shadow-xl p-2"
      onMouseDown={(e) => e.preventDefault()}
    >
      <div className="flex items-center gap-1.5 mb-1.5">
        <span
          className="inline-block w-2.5 h-2.5 rounded-full flex-shrink-0"
          style={{ backgroundColor: style.border }}
        />
        <span className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
          {style.label}
        </span>
        <button
          onClick={onDismiss}
          className="ml-auto text-muted-foreground hover:text-foreground p-0.5"
          aria-label="Cerrar"
        >
          <span className="text-xs">✕</span>
        </button>
      </div>

      <p className="text-xs text-muted-foreground mb-1.5">
        <span className="font-medium text-foreground line-through opacity-60">{wrongText}</span>
      </p>
      <p className="text-xs text-muted-foreground mb-2 leading-snug">{error.message}</p>

      {error.suggestions.length > 0 ? (
        <div className="flex flex-col gap-1">
          {error.suggestions.map((s, i) => (
            <button
              key={i}
              onClick={() => onApply(s)}
              className="text-left text-xs px-2 py-1.5 rounded-md hover:bg-brand-500/10 hover:text-brand-700 transition-colors font-medium border border-transparent hover:border-brand-500/20"
            >
              {s}
            </button>
          ))}
        </div>
      ) : (
        <p className="text-xs text-muted-foreground italic">Sin sugerencias</p>
      )}
    </div>
  );
}
