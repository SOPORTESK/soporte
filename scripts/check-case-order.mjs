import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "fs";

const env = {};
for (const line of readFileSync(".env.local", "utf8").split(/\r?\n/)) {
  const m = line.match(/^([^=]+)=(.*)$/);
  if (m) env[m[1]] = m[2].replace(/^["']|["']$/g, "").trim();
}

const supabase = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY);

const { data } = await supabase
  .from("sek_cases")
  .select("id,customer_phone,histcliente,histtecnico,estado,created_at")
  .ilike("customer_phone", "%50662239711%")
  .order("created_at", { ascending: false })
  .limit(3);

if (!data || !data.length) {
  console.log("No encontrado con 50662239711. Buscando casos activos...");
  const { data: active } = await supabase
    .from("sek_cases")
    .select("id,customer_phone,estado")
    .not("estado", "in", '("cerrado","resuelto")')
    .order("created_at", { ascending: false })
    .limit(20);
  active.forEach(c => console.log(c.id, c.customer_phone, c.estado));
  process.exit(0);
}

for (const c of data) {
  console.log("=".repeat(60));
  console.log("ID:", c.id, "| phone:", c.customer_phone, "| estado:", c.estado);

  const all = [
    ...(c.histcliente || []).map((m, i) => ({ ...m, _src: "hc", _idx: i })),
    ...(c.histtecnico || []).map((m, i) => ({ ...m, _src: "ht", _idx: i })),
  ].sort((a, b) => new Date(a.time).getTime() - new Date(b.time).getTime());

  all.forEach((m, i) => {
    console.log(
      `  [${i}] ${m._src}[${m._idx}] time=${m.time} role=${m.role} author=${m.author || "-"} txt=${(m.content || "").slice(0, 50)}`
    );
  });
}
