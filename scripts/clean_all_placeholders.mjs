import fs from "fs";
import { createClient } from "@supabase/supabase-js";

const envContent = fs.readFileSync(".env.local", "utf8");
const env = {};
for (const line of envContent.split("\n")) {
  const clean = line.replace("\r", "").trim();
  if (!clean || clean.startsWith("#")) continue;
  const idx = clean.indexOf("=");
  if (idx !== -1) {
    env[clean.slice(0, idx).trim()] = clean.slice(idx + 1).trim().replace(/^["']|["']$/g, "");
  }
}

const supabase = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY);

async function main() {
  const { data } = await supabase
    .from("sek_cases")
    .select("id, title, histcliente, last_message_preview")
    .order("updated_at", { ascending: false })
    .limit(100);

  console.log(`Analizando ${data?.length || 0} casos...`);
  for (const c of data || []) {
    const hist = c.histcliente || [];
    let modified = false;
    for (const m of hist) {
      if (m.content && (m.content.includes("Procesando") || m.content.includes("Archivo adjunto:"))) {
        console.log("Encontrado en caso:", c.id, c.title, "msg:", m.messageId, m.content);
        m.content = "";
        modified = true;
      }
    }
    let preview = c.last_message_preview;
    if (preview && (preview.includes("Procesando") || preview.includes("Archivo adjunto:"))) {
      preview = "📹 Video";
      modified = true;
    }
    if (modified) {
      await supabase.from("sek_cases").update({ histcliente: hist, last_message_preview: preview }).eq("id", c.id);
      console.log("Caso actualizado:", c.id);
    }
  }
  console.log("Busqueda y limpieza finalizada.");
}



main().catch(console.error);
