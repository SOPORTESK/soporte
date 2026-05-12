
const { createClient } = require("@supabase/supabase-js");

const SUPABASE_URL = "https://kzcyxeracvfxynddyjld.supabase.co";
const SERVICE_ROLE_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imt6Y3l4ZXJhY3ZmeHluZGR5amxkIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3NTUxMTk1NCwiZXhwIjoyMDkxMDg3OTU0fQ.GlF4Zieqqc1V1IAPshPFKb1QzKBBbO8n1RGK_wG_JuM";

async function listTables() {
  const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

  const { data, error } = await supabase.rpc("get_tables_info"); // If I have a helper RPC
  
  // Alternative: query public.sek_... tables
  const { data: tables, error: err2 } = await supabase.from("sek_agent_config").select("email").limit(1);

  console.log("Check if sek_agent_config exists:", !err2);
  
  // Try to find where system_prompt is
  const tablesToTry = ["sek_agent_config", "sek_settings", "sek_config", "sek_prompts"];
  for (const t of tablesToTry) {
    const { data: cols, error: e } = await supabase.from(t).select("*").limit(1);
    if (!e && cols.length > 0) {
        console.log(`Tabla ${t} columnas:`, Object.keys(cols[0]));
    }
  }
}

listTables();
