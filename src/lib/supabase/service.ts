import { createClient as createSupabaseClient } from "@supabase/supabase-js";

/** Cliente con service_role — solo usar en server-side / API routes */
export function createServiceClient() {
  return createSupabaseClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );
}
