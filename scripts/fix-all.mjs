// 1. Elimina duplicados de TODOS los casos
// 2. Asigna seq a todos los mensajes (ordenados por time, sin reordenar los arrays)
import { createClient } from '@supabase/supabase-js';
import fs from 'fs';

const url = fs.readFileSync('.env.local', 'utf8').match(/NEXT_PUBLIC_SUPABASE_URL="?(.+?)"?$/m)?.[1];
const key = fs.readFileSync('.env.local', 'utf8').match(/SUPABASE_SERVICE_ROLE_KEY="?(.+?)"?$/m)?.[1];
const supabase = createClient(url, key);

async function processCase(caseId) {
  const { data: c, error } = await supabase.from('sek_cases')
    .select('id,histcliente,histtecnico').eq('id', caseId).single();
  if (error || !c) return { dups: 0, error: error?.message };

  let totalDups = 0;
  const updates = {};

  for (const col of ['histcliente', 'histtecnico']) {
    const arr = [...(c[col] || [])];
    if (arr.length === 0) continue;

    // 1. Detectar y marcar duplicados
    const toRemove = new Set();
    for (let i = 0; i < arr.length; i++) {
      if (toRemove.has(i) || arr[i].deleted) continue;
      for (let j = i + 1; j < arr.length; j++) {
        if (toRemove.has(j) || arr[j].deleted) continue;
        const a = arr[i], b = arr[j];
        if (!a.content || !b.content) continue;
        if (a.content !== b.content) continue;
        if (a.role !== b.role) continue;
        const ta = new Date(a.time).getTime();
        const tb = new Date(b.time).getTime();
        if (Math.abs(ta - tb) > 120000) continue;

        const aIsWA = a.messageId && a.messageId.startsWith('3EB0');
        const bIsWA = b.messageId && b.messageId.startsWith('3EB0');
        let removeIdx;
        if (aIsWA && !bIsWA) { removeIdx = j; }
        else if (!aIsWA && bIsWA) { removeIdx = i; }
        else { removeIdx = j; }
        toRemove.add(removeIdx);
      }
    }

    let newArr = arr;
    if (toRemove.size > 0) {
      newArr = arr.map((m, i) => toRemove.has(i) ? { ...m, deleted: true } : m);
      totalDups += toRemove.size;
    }

    updates[col] = newArr;
  }

  // 2. Asignar seq: ordenar todos los mensajes por time, asignar seq incremental,
  //    pero NO reordenar los arrays. Solo agregar el campo seq a cada mensaje.
  if (totalDups > 0 || true) {
    const hc = updates.histcliente || c.histcliente || [];
    const ht = updates.histtecnico || c.histtecnico || [];

    // Combinar con referencia al array de origen
    const all = [
      ...hc.map((m, i) => ({ msg: m, col: 'histcliente', idx: i })),
      ...ht.map((m, i) => ({ msg: m, col: 'histtecnico', idx: i })),
    ];

    // Ordenar por time para asignar seq
    all.sort((a, b) => {
      const ta = new Date(a.msg.time || 0).getTime();
      const tb = new Date(b.msg.time || 0).getTime();
      if (ta !== tb) return ta - tb;
      // Desempate: cliente antes que técnico si mismo timestamp
      if (a.col !== b.col) return a.col === 'histcliente' ? -1 : 1;
      return a.idx - b.idx;
    });

    // Asignar seq
    let seq = 0;
    const hcSeq = new Map();
    const htSeq = new Map();
    for (const item of all) {
      if (item.col === 'histcliente') {
        hcSeq.set(item.idx, seq);
      } else {
        htSeq.set(item.idx, seq);
      }
      seq++;
    }

    // Aplicar seq a los arrays SIN reordenar
    updates.histcliente = hc.map((m, i) => ({ ...m, seq: hcSeq.get(i) ?? m.seq }));
    updates.histtecnico = ht.map((m, i) => ({ ...m, seq: htSeq.get(i) ?? m.seq }));

    const { error: updateErr } = await supabase.from('sek_cases')
      .update(updates).eq('id', caseId);
    if (updateErr) return { dups: 0, error: updateErr.message };
  }

  return { dups: totalDups, error: null };
}

async function main() {
  const { data: cases, error } = await supabase.from('sek_cases')
    .select('id').order('created_at', { ascending: false }).limit(1000);
  if (error) { console.error(error); process.exit(1); }

  console.log(`Procesando ${cases.length} casos...`);
  let totalDups = 0;
  let casesWithDups = 0;
  let processed = 0;

  for (const c of cases) {
    processed++;
    const result = await processCase(c.id);
    if (result.error) {
      console.error(`[${processed}] Error en ${c.id.substring(0,8)}: ${result.error}`);
      continue;
    }
    if (result.dups > 0) {
      casesWithDups++;
      totalDups += result.dups;
      console.log(`[${processed}/${cases.length}] ${c.id.substring(0,8)} - ${result.dups} duplicados`);
    }
    if (processed % 100 === 0) {
      console.log(`[${processed}/${cases.length}] procesados...`);
    }
  }

  console.log(`\n=== RESUMEN ===`);
  console.log(`Casos: ${processed} | Con duplicados: ${casesWithDups} | Total eliminados: ${totalDups}`);
}

main().catch(e => { console.error(e); process.exit(1); });
