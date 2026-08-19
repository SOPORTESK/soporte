// Buscar todos los logs relacionados con 50663381153
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
  const phone = "50663381153";
  const short = "63381153";
  
  // Buscar TODOS los logs que mencionen el número
  console.log("=== Todos los logs relacionados ===");
  let offset = 0;
  const pageSize = 1000;
  let total = 0;
  const found = [];
  
  while (true) {
    const { data, error } = await supabase
      .from("activity_log")
      .select("*")
      .order("id", { ascending: true })
      .range(offset, offset + pageSize - 1);
    
    if (error || !data || data.length === 0) break;
    
    for (const r of data) {
      const blob = JSON.stringify(r);
      if (blob.includes(phone) || blob.includes(short)) {
        found.push(r);
      }
    }
    
    total += data.length;
    offset += pageSize;
    if (data.length < pageSize) break;
  }
  
  console.log(`Total logs revisados: ${total}. Encontrados: ${found.length}\n`);
  found.forEach(r => {
    console.log(`id=${r.id} ts=${r.created_at || r.timestamp}`);
    console.log(`  agent=${r.agent_email} action=${r.action}`);
    console.log(`  case_id=${r.case_id} category=${r.category}`);
    if (r.metadata) console.log(`  metadata=${JSON.stringify(r.metadata).slice(0, 300)}`);
    console.log("");
  });
}

main().catch(console.error);
