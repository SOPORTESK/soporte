import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "fs";

const env = {};
for (const line of readFileSync(".env.local", "utf8").split(/\r?\n/)) {
  const m = line.match(/^([^=]+)=(.*)$/);
  if (m) env[m[1]] = m[2].replace(/^["']|["']$/g, "").trim();
}

const supabase = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY);
const email = "cbatista@sekunet.com";

for (const label of ["explicit", "star"]) {
  const start = Date.now();
  const query = supabase.from("sek_cases");
  const fields = label === "explicit"
    ? "id,title,cat,date,created_at,canal,estado,prioridad,cliente,tags,notasInternas,last_message_at,last_message_preview,unread_count,assigned_to,channel_id,customer_phone,updated_at,escalado_at,accepted_at,histcliente,histtecnico"
    : "*";
  const { data, error } = await query
    .select(fields)
    .neq("canal", "simulator")
    .neq("es_test", true)
    .eq("assigned_to", email)
    .order("last_message_at", { ascending: false, nullsFirst: false })
    .order("created_at", { ascending: false })
    .limit(1000);
  console.log(`${label}: ${Date.now() - start}ms, filas=${data?.length ?? 0}, error=${error?.message ?? "none"}`);
}
