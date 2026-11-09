"use client";
import * as React from "react";
import { createPortal } from "react-dom";
import { X } from "lucide-react";
import { cn, initials as getInitials } from "@/lib/utils";

const clientProfilePicCache = new Map<string, string | null>();
const inflightPicRequests = new Map<string, Promise<string | null>>();

// Hidratar caché de fotos de perfil desde sessionStorage para evitar re-consultas al navegar
const SESSION_PIC_CACHE_KEY = "sek_profile_pics_v5";
let sessionCacheHydrated = false;
function ensureSessionPicCache() {
  if (sessionCacheHydrated || typeof window === "undefined") return;
  sessionCacheHydrated = true;
  try {
    sessionStorage.removeItem("sek_profile_pics_v1");
    sessionStorage.removeItem("sek_profile_pics_v2");
    sessionStorage.removeItem("sek_profile_pics_v3");
    sessionStorage.removeItem("sek_profile_pics_v4");
    const raw = sessionStorage.getItem(SESSION_PIC_CACHE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (parsed && typeof parsed === "object") {
        for (const [k, v] of Object.entries(parsed)) {
          clientProfilePicCache.set(k, typeof v === "string" && v.startsWith("http") ? v : null);
        }
      }
    }
  } catch {}
}

let persistTimer: ReturnType<typeof setTimeout> | null = null;
function schedulePersistPicCache() {
  if (typeof window === "undefined" || persistTimer) return;
  persistTimer = setTimeout(() => {
    persistTimer = null;
    try {
      const obj: Record<string, string | null> = {};
      // Guardar hasta 400 entradas recientes (incluyendo null para no re-consultar teléfonos sin foto al navegar)
      const entries = Array.from(clientProfilePicCache.entries()).slice(-400);
      for (const [k, v] of entries) {
        obj[k] = typeof v === "string" && v.startsWith("http") ? v : null;
      }
      sessionStorage.setItem(SESSION_PIC_CACHE_KEY, JSON.stringify(obj));
    } catch {}
  }, 500);
}

// Cola con límite estricto de concurrencia (máx 2 peticiones simultáneas) para NUNCA saturar
// las 6 conexiones TCP del navegador y dejar vía libre a la navegación entre menús y chats.
const MAX_CONCURRENT_PIC_FETCHES = 2;
let activePicFetches = 0;
const picFetchQueue: Array<() => void> = [];

function pumpPicFetchQueue() {
  while (activePicFetches < MAX_CONCURRENT_PIC_FETCHES && picFetchQueue.length > 0) {
    const next = picFetchQueue.shift();
    if (next) {
      activePicFetches++;
      next();
    }
  }
}

function fetchWhatsAppProfilePic(rawPhone: string, forceRefresh = false): Promise<string | null> {
  ensureSessionPicCache();
  const cleanPhone = rawPhone.replace(/\D/g, "");
  if (cleanPhone.length < 8) return Promise.resolve(null);
  const key = cleanPhone.length === 8 ? `506${cleanPhone}` : cleanPhone;

  if (!forceRefresh && clientProfilePicCache.has(key)) {
    return Promise.resolve(clientProfilePicCache.get(key) ?? null);
  }
  const existing = inflightPicRequests.get(key);
  if (existing && !forceRefresh) return existing;

  const p = new Promise<string | null>((resolve) => {
    picFetchQueue.push(() => {
      const qs = forceRefresh
        ? `phone=${encodeURIComponent(key)}&refresh=1`
        : `phone=${encodeURIComponent(key)}`;
      fetch(`/api/evolution/profile-pic?${qs}`, {
        priority: "low" as any,
      })
        .then((r) => (r.ok ? r.json() : { url: null }))
        .then((d) => {
          const url = typeof d?.url === "string" && d.url.startsWith("http") ? d.url : null;
          clientProfilePicCache.set(key, url);
          schedulePersistPicCache();
          resolve(url);
        })
        .catch(() => {
          resolve(null);
        })
        .finally(() => {
          inflightPicRequests.delete(key);
          activePicFetches = Math.max(0, activePicFetches - 1);
          pumpPicFetchQueue();
        });
    });
    pumpPicFetchQueue();
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
  zoomOnClick = false,
}: {
  src?: string | null;
  name?: string | null;
  phone?: string | null;
  size?: number;
  className?: string;
  channel?: "whatsapp" | "messenger" | "web" | "email";
  onClickPic?: (url: string) => void;
  zoomOnClick?: boolean;
}) {
  const [resolvedSrc, setResolvedSrc] = React.useState<string | null>(src || null);
  const [imgFailed, setImgFailed] = React.useState(false);
  const [retriedLive, setRetriedLive] = React.useState(false);
  const [zoomed, setZoomed] = React.useState(false);

  React.useEffect(() => {
    setImgFailed(false);
    setRetriedLive(false);
    if (src) {
      setResolvedSrc(src);
      return;
    }
    if (!phone) {
      setResolvedSrc(null);
      return;
    }
    ensureSessionPicCache();
    const cleanPhone = phone.replace(/\D/g, "");
    const key = cleanPhone.length === 8 ? `506${cleanPhone}` : cleanPhone;
    if (clientProfilePicCache.has(key)) {
      setResolvedSrc(clientProfilePicCache.get(key) ?? null);
      return;
    }
    let active = true;
    const timer = setTimeout(() => {
      if (!active) return;
      fetchWhatsAppProfilePic(phone).then((url) => {
        if (active) setResolvedSrc(url);
      });
    }, 80);
    return () => {
      active = false;
      clearTimeout(timer);
    };
  }, [src, phone]);

  const handleImgError = React.useCallback(() => {
    if (phone && !retriedLive) {
      setRetriedLive(true);
      const cleanPhone = phone.replace(/\D/g, "");
      const key = cleanPhone.length === 8 ? `506${cleanPhone}` : cleanPhone;
      clientProfilePicCache.delete(key);
      schedulePersistPicCache();
      fetchWhatsAppProfilePic(phone, true).then((freshUrl) => {
        if (freshUrl) {
          setResolvedSrc(freshUrl);
          setImgFailed(false);
        } else {
          setImgFailed(true);
        }
      });
      return;
    }
    setImgFailed(true);
  }, [phone, retriedLive]);

  const showImg = Boolean(resolvedSrc && !imgFailed);
  const canZoom = showImg && Boolean(onClickPic || zoomOnClick);
  const dim = { width: size, height: size };

  return (
    <>
      <div
        className={cn(
          "relative shrink-0",
          canZoom && "cursor-zoom-in hover:ring-2 hover:ring-violet-400/70 rounded-full transition-all",
          className
        )}
        style={dim}
        onClick={
          canZoom && resolvedSrc
            ? (e) => {
                e.stopPropagation();
                e.preventDefault();
                if (onClickPic) {
                  onClickPic(resolvedSrc);
                } else {
                  setZoomed(true);
                }
              }
            : undefined
        }
        title={canZoom ? "Clic para agrandar foto de perfil" : undefined}
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
              onError={handleImgError}
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

      {zoomed &&
        resolvedSrc &&
        typeof document !== "undefined" &&
        createPortal(
          <div
            onClick={(e) => {
              e.stopPropagation();
              setZoomed(false);
            }}
            className="fixed inset-0 z-[9999] bg-black/85 backdrop-blur-sm flex flex-col items-center justify-center p-4 animate-in fade-in duration-150"
          >
            <div
              onClick={(e) => e.stopPropagation()}
              className="relative max-w-md w-full bg-neutral-900 border border-white/15 rounded-2xl overflow-hidden shadow-2xl"
            >
              <div className="flex items-center justify-between px-4 py-3 border-b border-white/10 bg-neutral-950/60">
                <p className="text-sm font-semibold text-white truncate">
                  {name || "Foto de perfil"}
                </p>
                <button
                  type="button"
                  onClick={() => setZoomed(false)}
                  aria-label="Cerrar"
                  className="p-1.5 rounded-lg bg-white/10 hover:bg-white/20 text-white transition"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
              <div className="p-4 flex items-center justify-center bg-black">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={resolvedSrc}
                  alt={name || "Foto de perfil"}
                  className="max-h-[75vh] w-auto object-contain rounded-xl"
                />
              </div>
            </div>
          </div>,
          document.body
        )}
    </>
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
