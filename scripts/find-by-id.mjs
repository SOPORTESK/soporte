// Buscar caso por ID exacto
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
  const caseId = "6ba22d26-1776-4987-845a-d900e76deefb";
  
  // 1. Buscar en sek_cases
  console.log("=== sek_cases ===");
  const { data: c1, error: e1 } = await supabase
    .from("sek_cases")
    .select("*")
    .eq("id", caseId)
    .maybeSingle();
  if (e1) console.log("Error:", e1.message);
  if (c1) {
    console.log("ENCONTRADO en sek_cases:");
    console.log(`  phone=${c1.customer_phone} estado=${c1.estado} title=${c1.title}`);
    console.log(`  histcliente: ${JSON.stringify(c1.histcliente).slice(0, 500)}`);
    console.log(`  histtecnico: ${JSON.stringify(c1.histtecnico).slice(0, 500)}`);
  } else {
    console.log("No está en sek_cases");
  }
  
  // 2. Buscar en sek_case_archives
  console.log("\n=== sek_case_archives ===");
  const { data: c2, error: e2 } = await supabase
    .from("sek_case_archives")
    .select("*")
    .eq("id", caseId)
    .maybeSingle();
  if (e2) console.log("Error:", e2.message);
  if (c2) {
    console.log("ENCONTRADO en sek_case_archives:");
    console.log(`  phone=${c2.customer_phone} estado=${c2.estado}`);
    console.log(`  data: ${JSON.stringify(c2.data).slice(0, 500)}`);
  } else {
    console.log("No está en sek_case_archives");
  }
  
  // 3. Buscar si hay otros casos con el mismo teléfono en sek_cases
  console.log("\n=== sek_cases con phone que contenga 63381153 ===");
  const { data: c3 } = await supabase
    .from("sek_cases")
    .select("id, customer_phone, estado, title, created_at")
    .ilike("customer_phone", "%63381153%")
    .limit(10);
  if (c3 && c3.length > 0) {
    c3.forEach(c => console.log(`  id=${c.id} phone=${c.customer_phone} estado=${c.estado} title=${c.title} created=${c.created_at}`));
  } else {
    console.log("Ninguno");
  }
}

main().catch(console.error);
