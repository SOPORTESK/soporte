"use client";

import React from "react";
import { ExternalLink, Globe, Play } from "lucide-react";
import { cn } from "@/lib/utils";

interface LinkPreviewData {
  ok: boolean;
  title?: string;
  description?: string | null;
  image?: string | null;
  siteName?: string;
  domain?: string;
  url?: string;
  isVideo?: boolean;
}

export function LinkPreviewCard({
  url,
  isCliente = false,
}: {
  url: string;
  isCliente?: boolean;
}) {
  const [data, setData] = React.useState<LinkPreviewData | null>(null);
  const [imgError, setImgError] = React.useState(false);

  React.useEffect(() => {
    let active = true;
    setImgError(false);

    fetch(`/api/link-preview?v=2&url=${encodeURIComponent(url)}`)
      .then((res) => res.json())
      .then((resData) => {
        if (active && resData?.ok) {
          setData(resData);
        }
      })
      .catch(() => {});

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
      onClick={(e) => e.stopPropagation()}
      className={cn(
        "block my-2 rounded-xl overflow-hidden border transition-all hover:opacity-95 text-left group max-w-[340px] shadow-xs",
        isCliente
          ? "bg-muted/70 border-border/80 text-foreground"
          : "bg-black/25 border-white/15 text-white hover:bg-black/35"
      )}
    >
      {data.image && !imgError && (
        <div className="w-full aspect-video bg-black/20 relative overflow-hidden flex items-center justify-center">
          <img
            src={data.image}
            alt={data.title || "Vista previa"}
            className="w-full h-full object-cover transition-transform duration-300 group-hover:scale-[1.03]"
            onError={() => setImgError(true)}
          />
          {data.isVideo && (
            <div className="absolute inset-0 flex items-center justify-center bg-black/15 group-hover:bg-black/25 transition-colors">
              <div className="h-11 w-11 rounded-full bg-black/65 backdrop-blur-xs border border-white/30 flex items-center justify-center text-white shadow-lg group-hover:scale-110 transition-transform">
                <Play className="h-5 w-5 fill-white ml-0.5" />
              </div>
            </div>
          )}
        </div>
      )}

      <div className="p-2.5 space-y-1">
        {data.title && (
          <h4 className="text-[13px] font-bold leading-snug line-clamp-2">
            {data.title}
          </h4>
        )}

        {data.description && (
          <p className="text-[11px] opacity-80 leading-snug line-clamp-2">
            {data.description}
          </p>
        )}

        <div className="flex items-center gap-1.5 opacity-70 text-[10px] font-medium pt-0.5">
          <Globe className="h-3 w-3 shrink-0" />
          <span className="truncate">{data.domain || new URL(url).hostname.replace(/^www\./i, "")}</span>
          <ExternalLink className="h-3 w-3 ml-auto opacity-0 group-hover:opacity-100 transition-opacity shrink-0" />
        </div>
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
