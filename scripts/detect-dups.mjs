// Detecta duplicados en un caso y muestra qué se eliminaría.
// No modifica nada — solo muestra el plan.
import { createClient } from '@supabase/supabase-js';
import fs from 'fs';

const url = fs.readFileSync('.env.local', 'utf8').match(/NEXT_PUBLIC_SUPABASE_URL="?(.+?)"?$/m)?.[1];
const key = fs.readFileSync('.env.local', 'utf8').match(/SUPABASE_SERVICE_ROLE_KEY="?(.+?)"?$/m)?.[1];
const supabase = createClient(url, key);

const CASE_ID = process.argv[2] || 'b131b418-9521-4ffe-8579-8e65f100edc8';

async function main() {
  const { data: c, error } = await supabase.from('sek_cases')
    .select('id,histcliente,histtecnico').eq('id', CASE_ID).single();
  if (error) { console.error(error); process.exit(1); }

  for (const col of ['histcliente', 'histtecnico']) {
    const arr = c[col] || [];
    console.log(`\n=== ${col} (${arr.length} mensajes) ===`);

    // Detectar duplicados: mismo content + mismo role + tiempos cercanos (<30s)
    const toRemove = new Set();
    for (let i = 0; i < arr.length; i++) {
      if (toRemove.has(i)) continue;
      for (let j = i + 1; j < arr.length; j++) {
        if (toRemove.has(j)) continue;
        const a = arr[i], b = arr[j];
        if (!a.content || !b.content) continue; // no comparar vacíos
        if (a.content !== b.content) continue;
        if (a.role !== b.role) continue;
        const ta = new Date(a.time).getTime();
        const tb = new Date(b.time).getTime();
        if (Math.abs(ta - tb) > 120000) continue; // más de 2min de diferencia = no es dup

        // Es duplicado. Decidir cuál mantener:
        // Preferir el que tiene messageId de WhatsApp (3EB0...) sobre uuid
        const aIsWA = a.messageId && a.messageId.startsWith('3EB0');
        const bIsWA = b.messageId && b.messageId.startsWith('3EB0');
        let keepIdx, removeIdx, reason;
        if (aIsWA && !bIsWA) { keepIdx = i; removeIdx = j; reason = 'a tiene WA msgId'; }
        else if (!aIsWA && bIsWA) { keepIdx = i; removeIdx = j; reason = 'b tiene WA msgId, eliminar a'; }
        else { keepIdx = i; removeIdx = j; reason = 'ambos iguales, eliminar el segundo'; }

        toRemove.add(removeIdx);
        console.log(`  DUP: idx ${i} (msgId: ${(a.messageId||'').substring(0,15)}) vs idx ${j} (msgId: ${(b.messageId||'').substring(0,15)})`);
        console.log(`    content: "${a.content.substring(0,40)}"`);
        console.log(`    times: ${a.time} vs ${b.time}`);
        console.log(`    MANTENER idx ${keepIdx}, ELIMINAR idx ${removeIdx} (${reason})`);
      }
    }
    console.log(`  Total a eliminar en ${col}: ${toRemove.size}`);
  }
}

main().catch(e => { console.error(e); process.exit(1); });
