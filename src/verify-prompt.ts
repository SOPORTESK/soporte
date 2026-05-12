
import { createClient } from "@supabase/supabase-js";

async function verifyPrompt() {
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );

  const { data, error } = await supabase
    .from("sek_agent_config")
    .select("system_prompt, updated_at")
    .eq("email", "system_prompt@sekunet.com")
    .maybeSingle();

  if (error) {
    console.error("Error al verificar el prompt:", error.message);
    return;
  }

  console.log("--- PROMPT ACTUAL EN BASE DE DATOS ---");
  console.log("Última actualización:", data?.updated_at);
  console.log("Contenido:");
  console.log(data?.system_prompt);
  console.log("---------------------------------------");
}

verifyPrompt();
