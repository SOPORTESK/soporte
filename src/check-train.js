
const { createClient } = require("@supabase/supabase-js");

const SUPABASE_URL = "https://kzcyxeracvfxynddyjld.supabase.co";
const SERVICE_ROLE_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imt6Y3l4ZXJhY3ZmeHluZGR5amxkIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3NTUxMTk1NCwiZXhwIjoyMDkxMDg3OTU0fQ.GlF4Zieqqc1V1IAPshPFKb1QzKBBbO8n1RGK_wG_JuM";

async function checkTrain() {
  const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

  const { data, error } = await supabase
    .from("sek_train")
    .select("*")
    .limit(1);

  if (error) {
    console.error("Error:", error);
    return;
  }

  console.log("Columnas sek_train:", Object.keys(data[0] || {}));
}

checkTrain();
