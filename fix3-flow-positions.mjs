import { createClient } from "@supabase/supabase-js";

const SUPABASE_URL = "https://kzcyxeracvfxynddyjld.supabase.co";
const SERVICE_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imt6Y3l4ZXJhY3ZmeHluZGR5amxkIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3NTUxMTk1NCwiZXhwIjoyMDkxMDg3OTU0fQ.GlF4Zieqqc1V1IAPshPFKb1QzKBBbO8n1RGK_wG_JuM";

const supabase = createClient(SUPABASE_URL, SERVICE_KEY);

const fixes = {
  correo_sin:       { x: 900,  y: 550 },
  pedir_cuenta:     { x: 300,  y: 650 },
  validar_cuenta:   { x: 600,  y: 650 },
  cuenta_invalido:  { x: 900,  y: 650 },
  sin_cuenta:       { x: 1200, y: 650 },
  cuenta_cierre:    { x: 1500, y: 650 },
  aviso_autocierre: { x: 300,  y: 850 },
  menu_temas:       { x: 700,  y: 850 },
  tema_cierre:      { x: 1100, y: 850 },
};

async function main() {
  const { data, error } = await supabase.from("sek_flow_configs").select("flow_data").limit(1).single();
  if (error) { console.error("Error:", error); process.exit(1); }
  const flow = data.flow_data;
  let updated = 0;
  for (const node of flow.nodes) {
    const pos = fixes[node.id];
    if (pos) { node.position = pos; updated++; }
  }
  console.log(`Corregidos: ${updated}`);
  const { error: e } = await supabase.from("sek_flow_configs").update({ flow_data: flow }).neq("id", "00000000-0000-0000-0000-000000000000");
  if (e) { console.error("Error guardando:", e); process.exit(1); }
  console.log("Listo");
}
main().catch(console.error);
