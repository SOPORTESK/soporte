// Elimina duplicados de un caso: mismo content + mismo role + <2min de diferencia.
// Mantiene el que tiene messageId de WhatsApp (3EB0...), elimina el uuid.
// Si ambos tienen el mismo tipo de messageId, mantiene el primero.
// NO elimina definitivamente — marca el duplicado como deleted: true.
import { createClient } from '@supabase/supabase-js';
import fs from 'fs';

const url = fs.readFileSync('.env.local', 'utf8').match(/NEXT_PUBLIC_SUPABASE_URL="?(.+?)"?$/m)?.[1];
const key = fs.readFileSync('.env.local', 'utf8').match(/SUPABASE_SERVICE_ROLE_KEY="?(.+?)"?$/m)?.[1];
const supabase = createClient(url, key);

const CASE_ID = process.argv[2];
const DRY_RUN = !process.argv.includes('--apply');

async function main() {
  if (!CASE_ID) { console.error('Uso: node scripts/remove-dups.mjs <case_id> [--apply]'); process.exit(1); }
  console.log(DRY_RUN ? 'MODO DRY RUN (no modifica nada)' : 'MODO APLICAR');

  const { data: c, error } = await supabase.from('sek_cases')
    .select('id,histcliente,histtecnico').eq('id', CASE_ID).single();
  if (error) { console.error(error); process.exit(1); }

  for (const col of ['histcliente', 'histtecnico']) {
    const arr = [...(c[col] || [])];
    if (arr.length === 0) continue;

    const toRemove = new Set();
    for (let i = 0; i < arr.length; i++) {
      if (toRemove.has(i)) continue;
      for (let j = i + 1; j < arr.length; j++) {
        if (toRemove.has(j)) continue;
        const a = arr[i], b = arr[j];
        if (!a.content || !b.content) continue;
        if (a.content !== b.content) continue;
        if (a.role !== b.role) continue;
        const ta = new Date(a.time).getTime();
        const tb = new Date(b.time).getTime();
        if (Math.abs(ta - tb) > 120000) continue;

        // Es duplicado. Decidir cuál mantener:
        // Preferir el que tiene messageId de WhatsApp (3EB0...) sobre uuid
        const aIsWA = a.messageId && a.messageId.startsWith('3EB0');
        const bIsWA = b.messageId && b.messageId.startsWith('3EB0');
        let removeIdx;
        if (aIsWA && !bIsWA) { removeIdx = j; } // mantener a (WA), eliminar b (uuid)
        else if (!aIsWA && bIsWA) { removeIdx = i; } // mantener b (WA), eliminar a (uuid)
        else { removeIdx = j; } // ambos iguales, eliminar el segundo

        toRemove.add(removeIdx);
        const kept = removeIdx === i ? j : i;
        console.log(`  ${col}: ELIMINAR idx ${removeIdx}, MANTENER idx ${kept} | content: "${a.content.substring(0,40)}"`);
      }
    }

    if (toRemove.size === 0) {
      console.log(`${col}: sin duplicados`);
      continue;
    }

    // Marcar como deleted: true (no eliminar definitivamente)
    const newArr = arr.map((m, i) => {
      if (toRemove.has(i)) {
        return { ...m, deleted: true };
      }
      return m;
    });

    console.log(`${col}: ${toRemove.size} duplicados marcados como deleted:true`);

    if (!DRY_RUN) {
      const { error: updateErr } = await supabase.from('sek_cases')
        .update({ [col]: newArr }).eq('id', CASE_ID);
      if (updateErr) { console.error(`Error actualizando ${col}:`, updateErr); }
      else { console.log(`${col}: actualizado en BD`); }
    }
  }

  if (DRY_RUN) {
    console.log('\nEjecute con --apply para aplicar los cambios');
  } else {
    console.log('\nListo. Los duplicados están marcados como deleted:true (no se eliminaron definitivamente)');
  }
}

main().catch(e => { console.error(e); process.exit(1); });
