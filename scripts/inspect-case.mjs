// Inspeccionar caso 50686064401 directo en BD
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

async function main() {
  const { data, error } = await supabase
    .from("sek_cases")
    .select("id, customer_phone, title, estado, histcliente, histtecnico")
    .ilike("customer_phone", "%50686064401%")
    .limit(10);
  
  if (error) {
    console.error("Error:", error.message);
    return;
  }
  
  if (!data || data.length === 0) {
    console.log("No se encontró el caso");
    return;
  }
  
  data.forEach((c, i) => {
    console.log(`\n=== CASO ${i} ===`);
    console.log(`id: ${c.id}`);
    console.log(`phone: ${c.customer_phone}`);
    console.log(`estado: ${c.estado}`);
    console.log(`\n--- histcliente ---`);
    (c.histcliente || []).forEach((m, j) => {
      console.log(`[${j}] time=${m.time} content=${(m.content || "").slice(0, 80).replace(/\n/g, "\\n")}`);
    });
    console.log(`\n--- histtecnico ---`);
    (c.histtecnico || []).forEach((m, j) => {
      console.log(`[${j}] time=${m.time} author=${m.author || m.from || ""} content=${(m.content || "").slice(0, 80).replace(/\n/g, "\\n")}`);
    });
  });
}

main().catch(console.error);
