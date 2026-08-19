// Limpiar mensajes vacíos del caso 50686064401
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
  const caseId = "b026128c-5788-4084-be33-11953e3eeeaa";
  
  const { data, error } = await supabase
    .from("sek_cases")
    .select("histcliente, histtecnico")
    .eq("id", caseId)
    .maybeSingle();
  
  if (error) {
    console.error("Error:", error.message);
    return;
  }
  
  if (!data) {
    console.log("Caso no encontrado");
    return;
  }
  
  const clean = (arr) => {
    if (!Array.isArray(arr)) return arr;
    return arr.filter(e => e && typeof e.content === "string" && e.content.trim().length > 0);
  };
  
  const newHistcliente = clean(data.histcliente);
  const newHisttecnico = clean(data.histtecnico);
  
  console.log(`histcliente: ${data.histcliente.length} -> ${newHistcliente.length}`);
  console.log(`histtecnico: ${data.histtecnico.length} -> ${newHisttecnico.length}`);
  
  const { error: updateErr } = await supabase
    .from("sek_cases")
    .update({ histcliente: newHistcliente, histtecnico: newHisttecnico })
    .eq("id", caseId);
  
  if (updateErr) {
    console.error("Error actualizando:", updateErr.message);
  } else {
    console.log("Caso limpiado");
  }
}

main().catch(console.error);
