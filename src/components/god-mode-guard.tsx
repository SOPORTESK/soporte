"use client";

import { useEffect, useState } from "react";

export function GodModeGuard({ children }: { children: React.ReactNode }) {
  const [hide, setHide] = useState(false);
  useEffect(() => {
    if (localStorage.getItem("god_mode_active") === "true") {
      setHide(true);
    }
  }, []);
  if (hide) return null;
  return <>{children}</>;
}
