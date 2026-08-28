"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

export default function Home() {
  const router = useRouter();

  useEffect(() => {
    const supabase = createClient();
    let cancelled = false;
    // Retry hasta 3 veces con 2s entre cada intento — si Supabase Auth
    // está lento, no mandar al usuario a login sin haberlo intentado.
    async function check(retries = 3) {
      try {
        const { data: { user } } = await supabase.auth.getUser();
        if (cancelled) return;
        if (user) {
          router.replace("/inbox");
        } else if (retries > 0) {
          setTimeout(() => check(retries - 1), 2000);
        } else {
          router.replace("/login");
        }
      } catch {
        if (cancelled) return;
        if (retries > 0) {
          setTimeout(() => check(retries - 1), 2000);
        } else {
          router.replace("/login");
        }
      }
    }
    check();
    return () => { cancelled = true; };
  }, [router]);

  return (
    <div className="min-h-screen grid place-items-center">
      <p className="text-muted-foreground">Cargando...</p>
    </div>
  );
}
