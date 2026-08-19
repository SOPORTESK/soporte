// Buscar en activity_log acciones de eliminación
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
  
  // Buscar en activity_log cualquier acción que mencione el número o "eliminar"/"delete"
  console.log("=== activity_log: buscando menciones del número ===");
  let offset = 0;
  const pageSize = 1000;
  let total = 0;
  let found = 0;
  
  while (true) {
    const { data, error } = await supabase
      .from("activity_log")
      .select("*")
      .order("id", { ascending: false })
      .range(offset, offset + pageSize - 1);
    
    if (error || !data || data.length === 0) break;
    
    for (const r of data) {
      const blob = JSON.stringify(r);
      if (blob.includes(phone) || blob.includes(short)) {
        console.log(`  id=${r.id} action=${r.action?.slice(0, 150)}`);
        found++;
      }
    }
    
    total += data.length;
    offset += pageSize;
    if (data.length < pageSize) break;
  }
  console.log(`Total revisado: ${total}. Encontrados: ${found}`);
  
  // Buscar acciones de eliminación
  console.log("\n=== activity_log: acciones de eliminación ===");
  const { data: delActions } = await supabase
    .from("activity_log")
    .select("*")
    .ilike("action", "%elimin%")
    .order("id", { ascending: false })
    .limit(20);
  if (delActions && delActions.length > 0) {
    delActions.forEach(r => console.log(`  id=${r.id} agent=${r.agent_email} action=${r.action} case_id=${r.case_id} ts=${r.created_at || r.timestamp}`));
  } else {
    // Intentar con "delete"
    const { data: delActions2 } = await supabase
      .from("activity_log")
      .select("*")
      .ilike("action", "%delete%")
      .order("id", { ascending: false })
      .limit(20);
    if (delActions2 && delActions2.length > 0) {
      delActions2.forEach(r => console.log(`  id=${r.id} agent=${r.agent_email} action=${r.action} case_id=${r.case_id} ts=${r.created_at || r.timestamp}`));
    } else {
      console.log("Sin acciones de eliminación registradas");
    }
  }
}

main().catch(console.error);
