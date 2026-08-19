// Medir tiempo de la query del timeline
import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "fs";
import { resolve } from "path";

const envPath = resolve(process.cwd(), ".env.local");
const envContent = readFileSync(envPath, "utf8");
const env = {};
for (const line of envContent.split(/\r?\n/)) {
  const m = line.match(/^([A-Za-z_]+)=(.*)$/);
  if (m) env[m[1]] = m[2].replace(/^["']|["']$/g, "").trim();
}

const supabase = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY);

async function timeIt(label, fn) {
  const t0 = Date.now();
  const { data, error } = await fn();
  const ms = Date.now() - t0;
  console.log(`${label}: ${ms}ms — ${error ? "ERROR: " + error.message : (data?.length ?? 0) + " filas"}`);
}

async function main() {
  const email = "cbatista@sekunet.com";
  const date = new Date().toISOString().slice(0, 10);

  // 1. Query tal cual la hace getActivityTimeline
  await timeIt("timeline (select * limit 200, agent+date)", () =>
    supabase
      .from("activity_log")
      .select("*")
      .eq("agent_email", email)
      .gte("created_at", `${date}T00:00:00`)
      .lte("created_at", `${date}T23:59:59`)
      .order("created_at", { ascending: false })
      .limit(200)
  );

  // 2. Sin select * (solo columnas necesarias)
  await timeIt("timeline (columnas específicas)", () =>
    supabase
      .from("activity_log")
      .select("id,agent_email,action,category,duration_ms,created_at")
      .eq("agent_email", email)
      .gte("created_at", `${date}T00:00:00`)
      .lte("created_at", `${date}T23:59:59`)
      .order("created_at", { ascending: false })
      .limit(200)
  );

  // 3. Count total de la tabla
  const t0 = Date.now();
  const { count, error } = await supabase
    .from("activity_log")
    .select("*", { count: "exact", head: true });
  console.log(`count total: ${Date.now() - t0}ms — ${error ? error.message : count + " filas"}`);
}

main().catch(console.error);
