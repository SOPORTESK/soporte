import { createClient } from "@supabase/supabase-js";

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SERVICE_KEY) {
  console.error("Faltan NEXT_PUBLIC_SUPABASE_URL o SUPABASE_SERVICE_ROLE_KEY");
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SERVICE_KEY);

const tagAProblemaKey = {
  reset: "reset_contrasena",
  reset_contrasena: "reset_contrasena",
  verificacion_pendiente: "reset_contrasena",
  imagen_pendiente: "reset_contrasena",
  xml_pendiente: "reset_contrasena",
  modelo_pendiente: "reset_contrasena",
  modelo_no_validado: "reset_contrasena",
  desvinculacion: "desvinculacion_cuenta",
  desvinculacion_cuenta: "desvinculacion_cuenta",
  sin_imagen: "sin_imagen",
  sin_grabacion: "sin_grabacion",
  sin_acceso_remoto: "sin_acceso_remoto",
  sin_energia: "sin_energia",
  error_configuracion: "error_configuracion",
  conectividad_red: "conectividad_red",
  dano_fisico: "dano_fisico",
  actualizacion_firmware: "actualizacion_firmware",
  instalacion_nueva: "instalacion_nueva",
  deteccion_incendio: "deteccion_incendio",
  control_acceso: "control_acceso",
  intrusion_alarma: "intrusion_alarma",
  configuraciones: "error_configuracion",
  firmware: "actualizacion_firmware",
  software: "error_configuracion",
  licencias: "error_configuracion",
  otro: "otro",
};

const tagsNoProblema = new Set(["saliente", "entrante", "urgente", "vip"]);

const temaAProblemaKey = {
  reset: "reset_contrasena",
  desvinculacion: "desvinculacion_cuenta",
  configuraciones: "error_configuracion",
  software: "error_configuracion",
  licencias: "error_configuracion",
  firmware: "actualizacion_firmware",
  acceso: "control_acceso",
  camara: "sin_imagen",
  nvr: "sin_grabacion",
  dvr: "sin_grabacion",
  alarma: "intrusion_alarma",
  incendio: "deteccion_incendio",
  red: "conectividad_red",
  soporte: "otro",
  otro: "otro",
};

function deriveProblemaKey(c) {
  // 1. Si ya tiene columna problema, no tocar
  if (c.problema) return null;

  // 2. Tags
  const tags = Array.isArray(c.tags) ? c.tags : [];
  for (const t of tags) {
    const tl = String(t).toLowerCase().trim();
    if (tagsNoProblema.has(tl)) continue;
    if (tagAProblemaKey[tl]) return tagAProblemaKey[tl];
  }

  // 3. Tema del title (antes del em-dash)
  const title = String(c.title || "").trim();
  const tema = title.split("\u2014")[0].trim().toLowerCase()
    .normalize("NFD").replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]/g, "");
  if (tema && temaAProblemaKey[tema]) return temaAProblemaKey[tema];

  return null;
}

async function main() {
  console.log("Obteniendo casos sin problema...");
  const { data: casos, error } = await supabase
    .from("sek_cases")
    .select("id, title, tags, problema")
    .is("problema", null)
    .limit(500);

  if (error) { console.error("Error:", error.message); process.exit(1); }

  console.log(`Casos sin problema: ${casos.length}`);

  let updated = 0;
  let skipped = 0;

  for (const c of casos) {
    const key = deriveProblemaKey(c);
    if (!key) { skipped++; continue; }

    const { error: updErr } = await supabase
      .from("sek_cases")
      .update({ problema: key })
      .eq("id", c.id);

    if (updErr) {
      console.error(`Error actualizando ${c.id}:`, updErr.message);
    } else {
      updated++;
    }
  }

  console.log(`\nResumen: ${updated} casos actualizados, ${skipped} sin clasificación posible`);
}

main().catch(console.error);
