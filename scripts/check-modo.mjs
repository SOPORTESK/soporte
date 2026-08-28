import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "fs";
import { resolve } from "path";

const env = {};
for (const line of readFileSync(resolve(process.cwd(), ".env.local"), "utf8").split(/\r?\n/)) {
  const m = line.match(/^([A-Za-z_][A-Za-z0-9_]*)=(.*)$/);
  if (m) env[m[1]] = m[2].replace(/^["']|["']$/g, "").trim();
}

const db = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
});

const { data, error } = await db
  .from("sek_agent_config")
  .select("email, modo_no_atendido, updated_at")
  .eq("email", "system_prompt@sekunet.com")
  .maybeSingle();

console.log("modo_no_atendido:", JSON.stringify(data, null, 2));
if (error) console.log("error:", error.message);
