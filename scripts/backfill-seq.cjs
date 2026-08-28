// Backfill de seq: asignar seq a todos los mensajes existentes que no lo tienen.
// Procesa en lotes de 50 casos con pausas de 2s entre lote para no saturar la BD.

const { createClient } = require('@supabase/supabase-js');

const URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const supabase = createClient(URL, KEY);

const BATCH_SIZE = 50;
const PAUSE_MS = 2000;

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

async function backfill() {
  console.log('Iniciando backfill de seq...');
  
  // Contar total de casos
  const { count } = await supabase.from('sek_cases').select('*', { count: 'exact', head: true });
  console.log(`Total de casos: ${count}`);
  
  let processed = 0;
  let totalAssigned = 0;
  let offset = 0;
  
  while (offset < count) {
    const { data: cases, error } = await supabase
      .from('sek_cases')
      .select('id, histcliente, histtecnico')
      .order('created_at', { ascending: true })
      .range(offset, offset + BATCH_SIZE - 1);
    
    if (error) {
      console.error('Error fetching batch:', error.message);
      break;
    }
    
    if (!cases || cases.length === 0) break;
    
    for (const c of cases) {
      const hc = Array.isArray(c.histcliente) ? c.histcliente : [];
      const ht = Array.isArray(c.histtecnico) ? c.histtecnico : [];
      
      // Verificar si ya tienen seq todos
      const allMsgs = [...hc, ...ht];
      const needsSeq = allMsgs.some(m => m.seq === undefined || m.seq === null);
      
      if (!needsSeq) {
        processed++;
        continue;
      }
      
      // Ordenar por time y asignar seq
      const combined = [
        ...hc.map((m, i) => ({ ...m, _col: 'hc', _idx: i })),
        ...ht.map((m, i) => ({ ...m, _col: 'ht', _idx: i })),
      ].sort((a, b) => {
        const ta = new Date(a.time || 0).getTime();
        const tb = new Date(b.time || 0).getTime();
        return ta - tb;
      });
      
      // Encontrar el max seq existente
      let maxSeq = 0;
      for (const m of combined) {
        if (m.seq && m.seq > maxSeq) maxSeq = m.seq;
      }
      
      // Asignar seq a los que no lo tienen
      let assigned = 0;
      for (const m of combined) {
        if (m.seq === undefined || m.seq === null) {
          maxSeq++;
          m.seq = maxSeq;
          assigned++;
        }
      }
      
      // Reconstruir histcliente y histtecnico sin campos auxiliares
      const newHc = combined.filter(m => m._col === 'hc').map(m => {
        const { _col, _idx, ...rest } = m;
        return rest;
      });
      const newHt = combined.filter(m => m._col === 'ht').map(m => {
        const { _col, _idx, ...rest } = m;
        return rest;
      });
      
      // Update
      const { error: updErr } = await supabase
        .from('sek_cases')
        .update({ histcliente: newHc, histtecnico: newHt })
        .eq('id', c.id);
      
      if (updErr) {
        console.error(`Error updating case ${c.id}:`, updErr.message);
      } else {
        totalAssigned += assigned;
      }
      
      processed++;
    }
    
    console.log(`Procesados: ${processed}/${count} — seq asignados: ${totalAssigned}`);
    offset += BATCH_SIZE;
    
    if (offset < count) {
      await sleep(PAUSE_MS);
    }
  }
  
  console.log(`\nBackfill completo. ${processed} casos procesados, ${totalAssigned} seq asignados.`);
}

backfill().catch(e => console.error('Error fatal:', e.message));
