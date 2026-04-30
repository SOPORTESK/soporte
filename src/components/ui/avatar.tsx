import * as React from "react";
import { cn } from "@/lib/utils";
import { initials as getInitials } from "@/lib/utils";

export function Avatar({
  src, name, size = 40, className, channel
}: { src?: string | null; name?: string | null; size?: number; className?: string; channel?: "whatsapp" | "messenger" | "web" | "email" }) {
  const dim = { width: size, height: size };
  return (
    <div className={cn("relative shrink-0", className)} style={dim}>
      <div
        className="h-full w-full rounded-full overflow-hidden bg-gradient-to-br from-brand-500 to-accent-500 grid place-items-center text-white font-semibold"
        style={{ fontSize: size * 0.38 }}
        aria-hidden={!!src}
      >
        {src ? <img src={src} alt={name || "avatar"} className="h-full w-full object-cover" /> : getInitials(name || "?")}
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
