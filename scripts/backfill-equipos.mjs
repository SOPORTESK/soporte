import { createClient } from "@supabase/supabase-js";

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SERVICE_KEY) {
  console.error("Faltan env vars");
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SERVICE_KEY);

function asText(content) {
  if (typeof content === "string") return content;
  if (content?.text) return content.text;
  if (Array.isArray(content)) return content.map(c => typeof c === "string" ? c : c?.text || "").join(" ");
  return "";
}

async function main() {
  // 1. Get all brands from inventory
  const { data: inv } = await supabase.from("sek_inventario").select("marca,modelo").limit(1000);
  const marcasSet = new Set();
  const marcasLower = new Map(); // lowercase -> original
  (inv || []).forEach(r => {
    const m = (r.marca || "").trim();
    if (m.length < 2) return;
    marcasSet.add(m);
    const lower = m.toLowerCase().replace(/[^a-z0-9]/g, "");
    if (lower) marcasLower.set(lower, m);
  });
  console.log(`Marcas de inventario: ${marcasLower.size}`);

  // Also add common aliases
  const aliases = {
    hik: "HIKVISION",
    hikvision: "HIKVISION",
    hilook: "HILOOK",
    dahua: "DAHUA",
    ezviz: "EZVIZ",
    axis: "AXIS",
    pelco: "PELCO",
    ubiquiti: "UBIQUITI",
    mikrotik: "MIKROTIK",
    huawei: "HUAWEI",
    grandstream: "Grandstream",
    fanvil: "FANVIL",
    zkteco: "ZKTECO",
    kidde: "KIDDE",
    simplex: "SIMPLEX",
    edwards: "EDWARDS",
    ansul: "ANSUL",
    sangoma: "SANGOMA",
    avigilon: "AVIGILON",
    witek: "WITEK",
    cablix: "CABLIX",
    jfl: "JFL",
    lacme: "LACME",
    iflux: "IFLUX",
    secoalarm: "SECO-LARM",
    secoarm: "SECO-LARM",
  };
  for (const [alias, brand] of Object.entries(aliases)) {
    marcasLower.set(alias, brand);
  }

  // 2. Get cases without marca/modelo
  const { data: casos, error } = await supabase
    .from("sek_cases")
    .select("id, title, marca, modelo, histtecnico, histcliente, cliente")
    .or("marca.is.null,modelo.is.null")
    .limit(500);

  if (error) { console.error("Error:", error.message); process.exit(1); }
  console.log(`Casos sin marca/modelo: ${casos.length}`);

  let updated = 0;
  let skipped = 0;

  for (const c of casos) {
    // Combine all text from both histories
    const allText = [];

    if (Array.isArray(c.histtecnico)) {
      c.histtecnico.forEach((m) => {
        if (!m.deleted) allText.push(asText(m.content));
      });
    }
    if (Array.isArray(c.histcliente)) {
      c.histcliente.forEach((m) => {
        if (!m.deleted) allText.push(asText(m.content));
      });
    }

    const fullText = allText.join(" \n ").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
    const fullTextClean = fullText.replace(/[^a-z0-9\s]/g, " ");

    // Find first brand mention
    let foundMarca = null;
    let foundModelo = null;

    // Check each word sequence for brand matches
    for (const [lower, original] of marcasLower) {
      const idx = fullTextClean.indexOf(lower);
      if (idx >= 0) {
        foundMarca = original;
        // Extract model: text after brand, up to ~60 chars, stop at newline or period
        const after = fullTextClean.substring(idx + lower.length).trim();
        const modelMatch = after.match(/^[\s]*([a-z0-9][a-z0-9\s\-\/\.]{2,50}?)(?:\s|$|\.|,|y|con|para|de|la|el|en)/);
        if (modelMatch) {
          foundModelo = modelMatch[1].trim();
        }
        // Try to find a model code pattern like ABC-123 or similar
        if (!foundModelo) {
          const codeMatch = after.match(/([a-z]{2,}[-_][a-z0-9][-_a-z0-9]+)/);
          if (codeMatch) foundModelo = codeMatch[1];
        }
        break;
      }
    }

    if (!foundMarca) { skipped++; continue; }

    // Also check cliente.equipo
    const cli = typeof c.cliente === "object" ? c.cliente : {};
    if (cli?.equipo_match) {
      const parts = String(cli.equipo_match).split("(")[0].trim().split(/\s+/);
      if (parts.length >= 2) {
        foundMarca = parts[0];
        foundModelo = parts.slice(1).join(" ");
      }
    }

    const update = {};
    if (!c.marca && foundMarca) update.marca = foundMarca;
    if (!c.modelo && foundModelo) update.modelo = foundModelo.slice(0, 100);

    if (Object.keys(update).length === 0) { skipped++; continue; }

    const { error: updErr } = await supabase.from("sek_cases").update(update).eq("id", c.id);
    if (updErr) {
      console.error(`Error ${c.id}:`, updErr.message);
    } else {
      updated++;
      console.log(`  ${c.id}: ${update.marca || "(skip)"} | ${update.modelo || "(skip)"}`);
    }
  }

  console.log(`\nResumen: ${updated} casos actualizados, ${skipped} sin marca detectable`);
}

main().catch(console.error);
