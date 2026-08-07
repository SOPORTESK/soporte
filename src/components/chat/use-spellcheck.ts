"use client";

import * as React from "react";

export interface SpellError {
  offset: number;
  length: number;
  message: string;
  suggestions: string[];
  type: "spelling" | "grammar" | "style" | "typography";
}

export interface SpellCheckResult {
  errors: SpellError[];
  loading: boolean;
}

const LANGUAGE_TOOL_URL = "https://api.languagetool.org/v2/check";

export function useSpellCheck(text: string, debounceMs = 800): SpellCheckResult {
  const [errors, setErrors] = React.useState<SpellError[]>([]);
  const [loading, setLoading] = React.useState(false);
  const reqIdRef = React.useRef(0);

  React.useEffect(() => {
    const trimmed = text.trim();
    if (trimmed.length < 2) {
      setErrors([]);
      setLoading(false);
      return;
    }

    const reqId = ++reqIdRef.current;
    setLoading(true);

    const timer = setTimeout(async () => {
      try {
        const body = new URLSearchParams({
          text: text,
          language: "es",
          enabledOnly: "false",
        });

        const res = await fetch(LANGUAGE_TOOL_URL, {
          method: "POST",
          headers: { "Content-Type": "application/x-www-form-urlencoded" },
          body: body.toString(),
          signal: AbortSignal.timeout(5000),
        });

        if (!res.ok) return;
        const data = await res.json();

        if (reqId !== reqIdRef.current) return;

        const matches = Array.isArray(data?.matches) ? data.matches : [];
        const mapped: SpellError[] = matches.map((m: any) => ({
          offset: m.offset ?? 0,
          length: m.length ?? 0,
          message: m.message ?? "",
          suggestions: Array.isArray(m.replacements)
            ? m.replacements.slice(0, 4).map((r: any) => r.value).filter(Boolean)
            : [],
          type: mapRuleType(m.rule?.category?.id || ""),
        }));

        setErrors(mapped);
      } catch {
        if (reqId === reqIdRef.current) setErrors([]);
      } finally {
        if (reqId === reqIdRef.current) setLoading(false);
      }
    }, debounceMs);

    return () => clearTimeout(timer);
  }, [text, debounceMs]);

  return { errors, loading };
}

function mapRuleType(categoryId: string): SpellError["type"] {
  const id = categoryId.toUpperCase();
  if (id.includes("TYPOGRAPHY")) return "typography";
  if (id.includes("GRAMMAR")) return "grammar";
  if (id.includes("STYLE") || id.includes("REDUNDANCY")) return "style";
  return "spelling";
}
