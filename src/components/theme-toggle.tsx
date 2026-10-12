"use client";
import { Moon, Sun, Monitor, RotateCcw } from "lucide-react";
import { useTheme } from "next-themes";
import * as React from "react";
import { cn } from "@/lib/utils";

const FONT_SCALE_KEY = "sekunet_electron_font_scale";
const MIN_SCALE = 85;
const MAX_SCALE = 135;
const STEP_SCALE = 5;

export function ThemeToggle() {
  const { theme, setTheme } = useTheme();
  const [mounted, setMounted] = React.useState(false);
  const [isElectron, setIsElectron] = React.useState(false);
  const [fontScale, setFontScale] = React.useState<number>(100);

  React.useEffect(() => {
    setMounted(true);
    const checkElectron =
      typeof window !== "undefined" &&
      (Boolean((window as any).electronAPI?.isElectron) ||
        navigator.userAgent.toLowerCase().includes("electron"));

    setIsElectron(checkElectron);

    if (checkElectron) {
      const saved = localStorage.getItem(FONT_SCALE_KEY);
      const parsed = saved ? parseInt(saved, 10) : 100;
      const valid = !isNaN(parsed) ? Math.min(MAX_SCALE, Math.max(MIN_SCALE, parsed)) : 100;
      setFontScale(valid);
      document.documentElement.style.fontSize = `${valid}%`;
    }
  }, []);

  const applyScale = (next: number) => {
    const clamped = Math.min(MAX_SCALE, Math.max(MIN_SCALE, next));
    setFontScale(clamped);
    if (typeof window !== "undefined") {
      localStorage.setItem(FONT_SCALE_KEY, String(clamped));
      document.documentElement.style.fontSize = `${clamped}%`;
    }
  };

  if (!mounted) return <div className="h-9 w-[120px]" aria-hidden />;

  const opts: { v: string; icon: React.ReactNode; label: string }[] = [
    { v: "light", icon: <Sun className="h-4 w-4" />, label: "Claro" },
    { v: "system", icon: <Monitor className="h-4 w-4" />, label: "Sistema" },
    { v: "dark", icon: <Moon className="h-4 w-4" />, label: "Oscuro" }
  ];

  return (
    <div className="inline-flex items-center gap-1.5 flex-wrap">
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
              "h-8 w-8 grid place-items-center rounded-md text-muted-foreground transition-colors",
              "hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring",
              theme === o.v && "bg-brand-700 text-white hover:text-white"
            )}
          >
            {o.icon}
          </button>
        ))}
      </div>

      {/* Control de tamaño de letra EXCLUSIVO para Electron */}
      {isElectron && (
        <div
          role="group"
          aria-label="Tamaño de letra"
          className="inline-flex items-center rounded-lg border border-border bg-card p-0.5"
        >
          <button
            type="button"
            onClick={() => applyScale(fontScale - STEP_SCALE)}
            disabled={fontScale <= MIN_SCALE}
            title="Disminuir letra"
            aria-label="Disminuir letra"
            className="h-8 px-2 grid place-items-center rounded-md text-xs font-extrabold text-muted-foreground hover:text-foreground hover:bg-muted/60 disabled:opacity-35 disabled:pointer-events-none transition-colors"
          >
            A-
          </button>
          <button
            type="button"
            onClick={() => applyScale(100)}
            title="Restablecer tamaño normal (100%)"
            className={cn(
              "h-8 px-1.5 grid place-items-center rounded-md text-[10px] font-bold transition-colors",
              fontScale === 100
                ? "text-muted-foreground hover:text-foreground"
                : "text-brand-400 bg-brand-500/10 hover:bg-brand-500/20"
            )}
          >
            {fontScale}%
          </button>
          <button
            type="button"
            onClick={() => applyScale(fontScale + STEP_SCALE)}
            disabled={fontScale >= MAX_SCALE}
            title="Agrandar letra"
            aria-label="Agrandar letra"
            className="h-8 px-2 grid place-items-center rounded-md text-xs font-extrabold text-muted-foreground hover:text-foreground hover:bg-muted/60 disabled:opacity-35 disabled:pointer-events-none transition-colors"
          >
            A+
          </button>
        </div>
      )}
    </div>
  );
}
