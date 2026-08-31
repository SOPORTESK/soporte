"use client";

import React from "react";
import { ExternalLink, Globe } from "lucide-react";
import { cn } from "@/lib/utils";

interface LinkPreviewData {
  ok: boolean;
  title?: string;
  description?: string | null;
  image?: string | null;
  siteName?: string;
  domain?: string;
  url?: string;
}

export function LinkPreviewCard({
  url,
  isCliente = false,
}: {
  url: string;
  isCliente?: boolean;
}) {
  const [data, setData] = React.useState<LinkPreviewData | null>(null);
  const [loading, setLoading] = React.useState(true);

  React.useEffect(() => {
    let active = true;
    setLoading(true);

    fetch(`/api/link-preview?url=${encodeURIComponent(url)}`)
      .then((res) => res.json())
      .then((resData) => {
        if (active && resData?.ok) {
          setData(resData);
        }
      })
      .catch(() => {})
      .finally(() => {
        if (active) setLoading(false);
      });

    return () => {
      active = false;
    };
  }, [url]);

  if (!data || !data.ok) return null;

  return (
    <a
      href={url}
      target="_blank"
      rel="noopener noreferrer"
      className={cn(
        "block my-2 rounded-xl overflow-hidden border transition-all hover:opacity-95 text-left group max-w-sm",
        isCliente
          ? "bg-muted/60 border-border/80 text-foreground"
          : "bg-black/25 border-white/20 text-white hover:bg-black/35"
      )}
    >
      {data.image && (
        <div className="w-full h-36 bg-black/10 relative overflow-hidden flex items-center justify-center">
          <img
            src={data.image}
            alt={data.title || "Preview"}
            className="w-full h-full object-cover transition-transform duration-300 group-hover:scale-105"
            onError={(e) => {
              (e.currentTarget as HTMLElement).style.display = "none";
            }}
          />
        </div>
      )}

      <div className="p-3 space-y-1">
        <div className="flex items-center gap-1.5 opacity-75 text-[10px] font-semibold uppercase tracking-wider">
          <Globe className="h-3 w-3" />
          <span>{data.domain || new URL(url).hostname}</span>
          <ExternalLink className="h-3 w-3 ml-auto opacity-0 group-hover:opacity-100 transition-opacity" />
        </div>

        {data.title && (
          <h4 className="text-xs font-bold leading-snug line-clamp-2">
            {data.title}
          </h4>
        )}

        {data.description && (
          <p className="text-[11px] opacity-80 leading-relaxed line-clamp-2">
            {data.description}
          </p>
        )}
      </div>
    </a>
  );
}

export function extractFirstUrl(text?: string | null): string | null {
  if (!text) return null;
  const match = text.match(/https?:\/\/[^\s<>"']+/i);
  return match ? match[0] : null;
}

export function FormattedTextWithLinks({
  text,
  isCliente = false,
}: {
  text: string;
  isCliente?: boolean;
}) {
  if (!text) return null;

  const urlRegex = /(https?:\/\/[^\s<>"']+)/g;
  const parts = text.split(urlRegex);

  return (
    <span>
      {parts.map((part, i) => {
        if (part.match(/^https?:\/\//i)) {
          return (
            <a
              key={i}
              href={part}
              target="_blank"
              rel="noopener noreferrer"
              className={cn(
                "underline underline-offset-2 break-all hover:opacity-80 transition-opacity",
                isCliente
                  ? "text-blue-600 dark:text-blue-400 font-medium"
                  : "text-white font-semibold"
              )}
              onClick={(e) => e.stopPropagation()}
            >
              {part}
            </a>
          );
        }
        return <React.Fragment key={i}>{part}</React.Fragment>;
      })}
    </span>
  );
}