// Buscar caso archivado por número de teléfono
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
  
  console.log("=== Buscando en sek_case_archives ===");
  
  // Buscar por customer_phone
  const { data, error } = await supabase
    .from("sek_case_archives")
    .select("id, customer_phone, estado, created_at, updated_at, closed_at")
    .ilike("customer_phone", `%${phone}%`)
    .limit(10);
  
  if (error) {
    console.error("Error:", error.message);
    
    // Si la tabla no existe o hay error, intentar sin ilike
    const { data: all, error: err2 } = await supabase
      .from("sek_case_archives")
      .select("id, customer_phone, estado, created_at")
      .limit(5);
    
    if (err2) {
      console.error("Error 2:", err2.message);
      console.log("La tabla sek_case_archives podría no existir");
    } else if (all) {
      console.log(`Tabla existe con ${all.length} filas. Buscando en todos...`);
      // Buscar en todos los archivados
      let offset = 0;
      const pageSize = 1000;
      let found = 0;
      while (true) {
        const { data: batch } = await supabase
          .from("sek_case_archives")
          .select("id, customer_phone, estado, created_at, updated_at, closed_at")
          .range(offset, offset + pageSize - 1);
        if (!batch || batch.length === 0) break;
        for (const c of batch) {
          const cp = String(c.customer_phone || "");
          if (cp.includes(phone) || cp.includes(short)) {
            console.log(`  id=${c.id} phone=${c.customer_phone} estado=${c.estado} created=${c.created_at} closed=${c.closed_at}`);
            found++;
          }
        }
        offset += pageSize;
        if (batch.length < pageSize) break;
      }
      console.log(`Encontrados: ${found}`);
    }
    return;
  }
  
  if (data && data.length > 0) {
    console.log(`Encontrados ${data.length}:`);
    data.forEach(c => console.log(`  id=${c.id} phone=${c.customer_phone} estado=${c.estado} created=${c.created_at} closed=${c.closed_at}`));
  } else {
    console.log("No encontrado con ilike. Buscando en todos...");
    let offset = 0;
    const pageSize = 1000;
    let found = 0;
    let total = 0;
    while (true) {
      const { data: batch } = await supabase
        .from("sek_case_archives")
        .select("id, customer_phone, estado, created_at, updated_at, closed_at")
        .range(offset, offset + pageSize - 1);
      if (!batch || batch.length === 0) break;
      for (const c of batch) {
        const cp = String(c.customer_phone || "");
        if (cp.includes(phone) || cp.includes(short)) {
          console.log(`  id=${c.id} phone=${c.customer_phone} estado=${c.estado} created=${c.created_at} closed=${c.closed_at}`);
          found++;
        }
      }
      total += batch.length;
      offset += pageSize;
      if (batch.length < pageSize) break;
    }
    console.log(`Total archivados: ${total}. Encontrados: ${found}`);
  }
}

main().catch(console.error);
