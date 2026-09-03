import { createClient as createSupabaseClient, SupabaseClient } from "@supabase/supabase-js";

let _serviceClient: SupabaseClient | null = null;

/** Cliente con service_role — solo usar en server-side / API routes */
export function createServiceClient(): SupabaseClient {
  if (!_serviceClient) {
    _serviceClient = createSupabaseClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
      {
        auth: {
          persistSession: false,
          autoRefreshToken: false,
        },
      }
    );
  }
  return _serviceClient;
}
