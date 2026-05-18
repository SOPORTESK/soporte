"use client";

import { useState, useEffect } from "react";

export function SplashScreen() {
  const [phase, setPhase] = useState<"visible" | "exiting" | "gone">("visible");

  useEffect(() => {
    // Solo mostrar splash una vez por sesión
    if (typeof window !== "undefined" && sessionStorage.getItem("splash_shown") === "1") {
      setPhase("gone");
      return;
    }
    const t1 = setTimeout(() => setPhase("exiting"), 2800);
    const t2 = setTimeout(() => {
      setPhase("gone");
      try { sessionStorage.setItem("splash_shown", "1"); } catch {}
    }, 3500);
    return () => { clearTimeout(t1); clearTimeout(t2); };
  }, []);

  if (phase === "gone") return null;

  return (
    <div className={`splash-root ${phase === "exiting" ? "splash-exit" : ""}`}>
      {/* Shimmer lines */}
      <div className="splash-shimmer" />
      <div className="splash-shimmer-bottom" />

      {/* Background orbs */}
      <div className="splash-orb splash-orb-1" />
      <div className="splash-orb splash-orb-2" />
      <div className="splash-orb splash-orb-3" />

      {/* Floating particles */}
      <div className="splash-particles">
        {Array.from({ length: 20 }).map((_, i) => (
          <div
            key={i}
            className="splash-particle"
            style={{
              left: `${(i * 37 + 11) % 100}%`,
              width: `${2 + (i % 4) * 1.5}px`,
              height: `${2 + (i % 4) * 1.5}px`,
              animationDelay: `${(i * 0.7) % 5}s`,
              animationDuration: `${4 + (i % 4) * 2}s`,
              opacity: 0.3 + (i % 3) * 0.2,
            }}
          />
        ))}
      </div>

      {/* Pulse rings */}
      <div className="splash-ring" />
      <div className="splash-ring" />
      <div className="splash-ring" />

      {/* Logo */}
      <div className="splash-logo-wrap">
        <img src="/icon-app-512.png" alt="Sekunet" className="splash-logo-img" />
      </div>
      <div className="splash-logo-reflection" />

      {/* Brand text */}
      <div className="splash-brand">
        <div className="splash-brand-name">Sekunet</div>
      </div>
      <div className="splash-tagline">Soporte Inteligente</div>
      <div className="splash-line" />

      {/* Loading dots */}
      <div className="splash-loader">
        <div className="splash-loader-dot" />
        <div className="splash-loader-dot" />
        <div className="splash-loader-dot" />
      </div>

      {/* Bottom text */}
      <div className="splash-bottom">
        <span className="splash-bottom-text">Experiencia Premium</span>
      </div>
    </div>
  );
}
