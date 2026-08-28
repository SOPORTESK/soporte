"use client";

import { useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

/**
 * Provider que escucha cambios de estado de auth de Supabase.
 *
 * Sin este listener, la app no se entera de que la sesión expiró hasta
 * que hace una petición al server y el middleware/layout la redirige.
 * Con el listener, podemos:
 *  - Refrescar el token proactivamente antes de que expire
 *  - Redirigir a login solo cuando la sesión REALMENTE expira (SIGNED_OUT)
 *  - Evitar redirecciones falsas por timeouts temporales
 */
export function AuthStateProvider({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const redirectingRef = useRef(false);

  useEffect(() => {
    const supabase = createClient();

    // 1. Listener para cambios de estado de auth
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      (event, session) => {
        if (redirectingRef.current) return;

        if (event === "SIGNED_OUT" && !session) {
          // La sesión expiró de verdad (token refresh falló o signOut explícito)
          redirectingRef.current = true;
          router.replace("/login");
        }
        // TOKEN_REFRESHED: no hacer nada, el token se renovó correctamente.
        // INITIAL_SESSION: no hacer nada, la sesión inicial ya se manejó.
      }
    );

    // 2. Refrescar el token cada 10 minutos para mantener la sesión viva.
    //    Supabase refresca automáticamente, pero en Electron a veces no
    //    dispara el refresh si la app está inactiva en segundo plano.
    const refreshInterval = setInterval(async () => {
      try {
        const { data: { session } } = await supabase.auth.getSession();
        if (session) {
          // Solo refrescar si el token expira en menos de 15 minutos
          const expiresAt = session.expires_at ?? 0;
          const now = Math.floor(Date.now() / 1000);
          if (expiresAt - now < 900) {
            await supabase.auth.refreshSession();
          }
        }
      } catch {
        // Error silencioso — el listener de onAuthStateChange maneja SIGNED_OUT
      }
    }, 10 * 60 * 1000); // 10 minutos

    return () => {
      subscription?.unsubscribe();
      clearInterval(refreshInterval);
    };
  }, [router]);

  return <>{children}</>;
}
