import { createClient as createSupabaseClient } from "@supabase/supabase-js";
import dns from "node:dns";

if (typeof window === "undefined" && dns?.setDefaultResultOrder) {
  try {
    dns.setDefaultResultOrder("ipv4first");
  } catch {}
}

/** Cliente con service_role — solo usar en server-side / API routes */
export function createServiceClient() {
  return createSupabaseClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );
}

