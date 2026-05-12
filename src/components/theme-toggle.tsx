"use client";
import { Moon, Sun, Monitor } from "lucide-react";
import { useTheme } from "next-themes";
import * as React from "react";
import { cn } from "@/lib/utils";

export function ThemeToggle() {
  const { theme, setTheme } = useTheme();
  const [mounted, setMounted] = React.useState(false);
  React.useEffect(() => setMounted(true), []);
  if (!mounted) return <div className="h-9 w-[120px]" aria-hidden />;

  const opts: { v: string; icon: React.ReactNode; label: string }[] = [
    { v: "light", icon: <Sun className="h-4 w-4" />, label: "Claro" },
    { v: "system", icon: <Monitor className="h-4 w-4" />, label: "Sistema" },
    { v: "dark", icon: <Moon className="h-4 w-4" />, label: "Oscuro" }
  ];

  return (
    <div role="radiogroup" aria-label="Tema" className="inline-flex items-center rounded-lg border border-border bg-card p-0.5">
      {opts.map(o => (
        <button
          key={o.v}
          role="radio"
          aria-checked={theme === o.v}
          aria-label={o.label}
          title={o.label}
          onClick={() => setTheme(o.v)}
          className={cn(
            "h-8 w-9 grid place-items-center rounded-md text-muted-foreground transition-colors",
            "hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring",
            theme === o.v && "bg-brand-700 text-white hover:text-white"
          )}
        >
          {o.icon}
        </button>
      ))}
    </div>
  );
}
