"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import * as React from "react";
import { cn } from "@/lib/utils";

export function SidebarLink({
  href, icon, children, disabled, badge
}: { href: string; icon: React.ReactNode; children: React.ReactNode; disabled?: boolean; badge?: string }) {
  const pathname = usePathname();
  const active = pathname === href || pathname.startsWith(href + "/");
  const cls = cn(
    "flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium transition-colors",
    active ? "bg-brand-700 text-white" : "text-muted-foreground hover:text-foreground hover:bg-muted",
    disabled && "pointer-events-none opacity-60"
  );
  const content = (
    <>
      <span className="shrink-0">{icon}</span>
      <span className="flex-1 truncate">{children}</span>
      {badge && (
        <span className="text-[10px] uppercase tracking-wide rounded-full bg-accent-100 text-accent-700 dark:bg-accent-700/30 dark:text-accent-300 px-2 py-0.5">
          {badge}
        </span>
      )}
    </>
  );
  if (disabled) return <span className={cls} aria-disabled>{content}</span>;
  return <Link href={href} className={cls} aria-current={active ? "page" : undefined}>{content}</Link>;
}
