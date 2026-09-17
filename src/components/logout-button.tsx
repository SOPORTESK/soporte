"use client";
import { LogOut } from "lucide-react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";

export function LogoutButton() {
  const router = useRouter();
  async function handle() {
    const supabase = createClient();
    try {
      const { data } = await supabase.auth.getUser();
      if (data?.user?.email) {
        await fetch("/api/activity/log", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            agent_email: data.user.email,
            agent_name: data.user.user_metadata?.nombre || data.user.email.split("@")[0],
            action: "Cierre de sesión del sistema",
            category: "Control Administrativo",
            metadata: { type: "auth_logout", method: "logout_button", timestamp: new Date().toISOString() },
          }),
        }).catch(() => {});
      }
    } catch {}
    await supabase.auth.signOut();
    router.replace("/login");
    router.refresh();
  }
  return (
    <Button variant="ghost" size="icon" onClick={handle} aria-label="Cerrar sesión" title="Cerrar sesión">
      <LogOut className="h-4 w-4" />
    </Button>
  );
}
