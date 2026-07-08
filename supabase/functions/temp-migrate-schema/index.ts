@_ts-nocheck
import { createClient } from "npm:@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
const db = createClient(SUPABASE_URL, SERVICE_KEY);

Deno.serve(async () => {
  try {
    const { error } = await db.rpc("exec_sql", {
      sql: "ALTER TABLE sek_cases ADD COLUMN IF NOT EXISTS auto_close_paused BOOLEAN DEFAULT FALSE; CREATE INDEX IF NOT EXISTS idx_sek_cases_auto_close_paused ON sek_cases(auto_close_paused);"
    });
    if (error) throw error;
    return new Response(JSON.stringify({ success: true }), { status: 200, headers: { "Content-Type": "application/json" } });
  } catch (e: any) {
    return new Response(JSON.stringify({ error: e.message }), { status: 500, headers: { "Content-Type": "application/json" } });
  }
});
