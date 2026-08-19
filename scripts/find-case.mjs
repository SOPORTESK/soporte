// Buscar caso por número de teléfono - búsqueda total
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
  const shortPhone = "63381153";
  
  // Buscar en TODOS los casos por customer_phone
  console.log("=== Búsqueda total en customer_phone (paginada) ===");
  let offset = 0;
  const pageSize = 1000;
  let total = 0;
  let found = 0;
  
  while (true) {
    const { data, error } = await supabase
      .from("sek_cases")
      .select("id, customer_phone, title, estado, created_at, closed_at")
      .order("created_at", { ascending: false })
      .range(offset, offset + pageSize - 1);
    
    if (error) {
      console.error("Error:", error);
      break;
    }
    if (!data || data.length === 0) break;
    
    for (const c of data) {
      const cp = String(c.customer_phone || "");
      if (cp.includes(phone) || cp.includes(shortPhone)) {
        console.log(`  id=${c.id} phone=${c.customer_phone} estado=${c.estado} title=${c.title} created=${c.created_at} closed=${c.closed_at}`);
        found++;
      }
    }
    
    total += data.length;
    offset += pageSize;
    
    if (data.length < pageSize) break;
  }
  
  console.log(`Total casos revisados: ${total}. Encontrados: ${found}`);
  
  if (found === 0) {
    // Buscar también en cliente->telefono
    console.log("\n=== Búsqueda en cliente.telefono (JSON) ===");
    let offset2 = 0;
    let found2 = 0;
    let total2 = 0;
    
    while (true) {
      const { data, error } = await supabase
        .from("sek_cases")
        .select("id, customer_phone, cliente, title, estado, created_at")
        .order("created_at", { ascending: false })
        .range(offset2, offset2 + pageSize - 1);
      
      if (error || !data || data.length === 0) break;
      
      for (const c of data) {
        const clienteStr = JSON.stringify(c.cliente || {});
        if (clienteStr.includes(phone) || clienteStr.includes(shortPhone)) {
          console.log(`  id=${c.id} phone=${c.customer_phone} cliente=${clienteStr.slice(0, 200)} estado=${c.estado} title=${c.title} created=${c.created_at}`);
          found2++;
        }
      }
      
      total2 += data.length;
      offset2 += pageSize;
      if (data.length < pageSize) break;
    }
    
    console.log(`Total casos revisados: ${total2}. Encontrados en cliente: ${found2}`);
  }
}

main().catch(console.error);
