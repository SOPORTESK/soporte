"use client";

import { useEffect } from "react";
import { createClient } from "@/lib/supabase/client";

export default function AuthConfirmPage() {
  useEffect(() => {
    const supabase = createClient();

    async function handleAuth() {
      // 1. Leer los tokens del hash ANTES del signOut
      const hash = window.location.hash.substring(1);
      const params = new URLSearchParams(hash);
      const accessToken = params.get("access_token");
      const refreshToken = params.get("refresh_token");

      if (!accessToken || !refreshToken) {
        window.location.replace("/login");
        return;
      }

      // Guardar datos de impersonación en localStorage desde la URL
      const searchParams = new URLSearchParams(window.location.search);
      const agentName = searchParams.get("name");
      const returnUrl = searchParams.get("returnUrl");
      if (agentName) localStorage.setItem("sek_impersonating", agentName);
      if (returnUrl) localStorage.setItem("sek_return_url", returnUrl);

      // 2. Cerrar sesión actual (César)
      await supabase.auth.signOut();

      // 3. Establecer la nueva sesión con los tokens del hash
      const { error } = await supabase.auth.setSession({
        access_token: accessToken,
        refresh_token: refreshToken,
      });

      if (error) {
        window.location.replace("/login?error=auth");
        return;
      }

      window.location.replace("/inbox");
    }

    handleAuth();
  }, []);

  return (
    <div className="min-h-dvh grid place-items-center">
      <p className="text-muted-foreground text-sm animate-pulse">Iniciando sesión...</p>
    </div>
  );
}
