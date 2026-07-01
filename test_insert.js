const { createClient } = require("@supabase/supabase-js");

const SUPABASE_URL = "https://kzcyxeracvfxynddyjld.supabase.co";
const SERVICE_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imt6Y3l4ZXJhY3ZmeHluZGR5amxkIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3NTUxMTk1NCwiZXhwIjoyMDkxMDg3OTU0fQ.GlF4Zieqqc1V1IAPshPFKb1QzKBBbO8n1RGK_wG_JuM";

const supabase = createClient(SUPABASE_URL, SERVICE_KEY);

async function test() {
  const { data, error } = await supabase.from("sek_cases").insert({
    canal: "whatsapp",
    estado: "ia_atendiendo",
    prioridad: "media",
    customer_phone: "50687095801",
    cliente: { 
      telefono: "50687095801",
      nombre: "Jefatura Técnica Sekunet",
      whatsapp_name: "Jefatura Técnica Sekunet",
      telefono_real: null
    },
    histcliente: [{
        role: "user",
        time: new Date().toISOString(),
        content: "HOLA TEST",
        mediaUrl: "",
        mediaType: "",
        fileName: "",
        messageId: "DEBUG123",
        fromMe: false
    }],
    histtecnico: [],
    title: "WhatsApp — Jefatura Técnica Sekunet",
    last_message_at: new Date().toISOString(),
    last_message_preview: "HOLA TEST"
  }).select("id").single();

  console.log("Error:", error);
  console.log("Data:", data);
}

test();
