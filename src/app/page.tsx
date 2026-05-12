"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

export default function Home() {
  const router = useRouter();

  useEffect(() => {
    const supabase = createClient();
    supabase.auth.getUser().then(({ data: { user } }) => {
      router.replace(user ? "/inbox" : "/login");
    });
  }, [router]);

  return (
    <div className="min-h-screen grid place-items-center">
      <p className="text-muted-foreground">Cargando...</p>
    </div>
  );
}
