// Re-backfill: arreglar seq de mensajes iniciales (NULL) que fueron
// asignados con seq alto por el backfill anterior.
// Para cada caso, los mensajes sin seq (NULL) son los iniciales (creados
// con el caso) y deben tener seq MÁS BAJO que los mensajes con seq
// (que fueron insertados después via sek_append_hist).
//
// Estrategia: para cada caso, si hay mensajes sin seq Y mensajes con seq,
// asignar a los sin seq valores negativos (-N, -N+1, ..., -1) ordenados por time,
// así van primero en el sort.

const { createClient } = require('@supabase/supabase-js');
const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

const BATCH_SIZE = 50;
const PAUSE_MS = 2000;

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

async function fixbackfill() {
  console.log('Iniciando re-backfill...');
  
  const { count } = await supabase.from('sek_cases').select('*', { count: 'exact', head: true });
  console.log(`Total de casos: ${count}`);
  
  let processed = 0;
  let fixed = 0;
  let offset = 0;
  
  while (offset < count) {
    const { data: cases, error } = await supabase
      .from('sek_cases')
      .select('id, histcliente, histtecnico')
      .order('created_at', { ascending: true })
      .range(offset, offset + BATCH_SIZE - 1);
    
    if (error) { console.error('Error:', error.message); break; }
    if (!cases || cases.length === 0) break;
    
    for (const c of cases) {
      const hc = Array.isArray(c.histcliente) ? c.histcliente : [];
      const ht = Array.isArray(c.histtecnico) ? c.histtecnico : [];
      
      const nullMsgs = [...hc, ...ht].filter(m => m.seq === undefined || m.seq === null);
      if (nullMsgs.length === 0) { processed++; continue; }
      
      // Ordenar los NULL por time
      nullMsgs.sort((a, b) => {
        const ta = new Date(a.time || 0).getTime();
        const tb = new Date(b.time || 0).getTime();
        return ta - tb;
      });
      
      // Asignar seq negativo: -N, -N+1, ..., -1
      const N = nullMsgs.length;
      nullMsgs.forEach((m, i) => {
        m.seq = -(N - i); // -N, -N+1, ..., -1
      });
      
      // Reconstruir arrays
      const newHc = hc;
      const newHt = ht;
      
      const { error: updErr } = await supabase
        .from('sek_cases')
        .update({ histcliente: newHc, histtecnico: newHt })
        .eq('id', c.id);
      
      if (updErr) {
        console.error(`Error updating case ${c.id}:`, updErr.message);
      } else {
        fixed += N;
      }
      
      processed++;
    }
    
    console.log(`Procesados: ${processed}/${count} — seq arreglados: ${fixed}`);
    offset += BATCH_SIZE;
    
    if (offset < count) {
      await sleep(PAUSE_MS);
    }
  }
  
  console.log(`\nRe-backfill completo. ${processed} casos, ${fixed} seq arreglados.`);
}

fixbackfill().catch(e => console.error('Error fatal:', e.message));
