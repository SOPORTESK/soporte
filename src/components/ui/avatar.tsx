"use client";
import * as React from "react";
import { cn, initials as getInitials } from "@/lib/utils";

const clientProfilePicCache = new Map<string, string | null>();
const inflightPicRequests = new Map<string, Promise<string | null>>();

function fetchWhatsAppProfilePic(rawPhone: string): Promise<string | null> {
  const cleanPhone = rawPhone.replace(/\D/g, "");
  if (cleanPhone.length < 8) return Promise.resolve(null);
  const key = cleanPhone.length === 8 ? `506${cleanPhone}` : cleanPhone;

  if (clientProfilePicCache.has(key)) {
    return Promise.resolve(clientProfilePicCache.get(key) ?? null);
  }
  const existing = inflightPicRequests.get(key);
  if (existing) return existing;

  const p = fetch(`/api/evolution/profile-pic?phone=${encodeURIComponent(key)}`)
    .then((r) => (r.ok ? r.json() : { url: null }))
    .then((d) => {
      const url = typeof d?.url === "string" && d.url.startsWith("http") ? d.url : null;
      clientProfilePicCache.set(key, url);
      return url;
    })
    .catch(() => {
      clientProfilePicCache.set(key, null);
      return null;
    })
    .finally(() => {
      inflightPicRequests.delete(key);
    });

  inflightPicRequests.set(key, p);
  return p;
}

export function Avatar({
  src,
  name,
  phone,
  size = 40,
  className,
  channel,
  onClickPic,
}: {
  src?: string | null;
  name?: string | null;
  phone?: string | null;
  size?: number;
  className?: string;
  channel?: "whatsapp" | "messenger" | "web" | "email";
  onClickPic?: (url: string) => void;
}) {
  const [resolvedSrc, setResolvedSrc] = React.useState<string | null>(src || null);
  const [imgFailed, setImgFailed] = React.useState(false);

  React.useEffect(() => {
    setImgFailed(false);
    if (src) {
      setResolvedSrc(src);
      return;
    }
    if (!phone) {
      setResolvedSrc(null);
      return;
    }
    const cleanPhone = phone.replace(/\D/g, "");
    const key = cleanPhone.length === 8 ? `506${cleanPhone}` : cleanPhone;
    if (clientProfilePicCache.has(key)) {
      setResolvedSrc(clientProfilePicCache.get(key) ?? null);
      return;
    }
    let active = true;
    fetchWhatsAppProfilePic(phone).then((url) => {
      if (active) setResolvedSrc(url);
    });
    return () => {
      active = false;
    };
  }, [src, phone]);

  const showImg = Boolean(resolvedSrc && !imgFailed);
  const dim = { width: size, height: size };

  return (
    <div
      className={cn("relative shrink-0", showImg && onClickPic && "cursor-pointer", className)}
      style={dim}
      onClick={
        showImg && onClickPic && resolvedSrc
          ? (e) => {
              e.stopPropagation();
              onClickPic(resolvedSrc);
            }
          : undefined
      }
      title={showImg && onClickPic ? "Ver foto de perfil" : undefined}
    >
      <div
        className="h-full w-full rounded-full overflow-hidden bg-gradient-to-br from-brand-500 to-accent-500 grid place-items-center text-white font-semibold"
        style={{ fontSize: size * 0.38 }}
        aria-hidden={showImg}
        suppressHydrationWarning
      >
        {showImg && resolvedSrc ? (
          /* eslint-disable-next-line @next/next/no-img-element */
          <img
            src={resolvedSrc}
            alt={name || "avatar"}
            loading="lazy"
            onError={() => setImgFailed(true)}
            className="h-full w-full object-cover"
          />
        ) : (
          getInitials(name || "?")
        )}
      </div>
      {channel && (
        <span
          className={cn(
            "absolute -bottom-0.5 -right-0.5 h-4 w-4 rounded-full border-2 border-card grid place-items-center text-[8px] font-bold text-white",
            channel === "whatsapp" && "bg-[#25D366]",
            channel === "messenger" && "bg-[#0084FF]",
            channel === "web" && "bg-brand-700",
            channel === "email" && "bg-accent-600"
          )}
          aria-label={`canal ${channel}`}
        >
          {channel === "whatsapp" ? "W" : channel === "messenger" ? "M" : channel === "web" ? "C" : "@"}
        </span>
      )}
    </div>
  );
}

export function Badge({ children, variant = "default", className }: { children: React.ReactNode; variant?: "default" | "success" | "warning" | "danger" | "muted"; className?: string }) {
  const variants: Record<string, string> = {
    default: "bg-brand-100 text-brand-800 dark:bg-brand-900/40 dark:text-brand-200",
    success: "bg-[hsl(var(--success)/.15)] text-[hsl(var(--success))]",
    warning: "bg-[hsl(var(--warning)/.18)] text-[hsl(var(--warning))]",
    danger:  "bg-[hsl(var(--danger)/.15)] text-[hsl(var(--danger))]",
    muted:   "bg-muted text-muted-foreground"
  };
  return (
    <span className={cn("inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium", variants[variant], className)}>
      {children}
    </span>
  );
}
