// Verificar seq y time de los mensajes de un caso reciente
const { createClient } = require('@supabase/supabase-js');
const URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const supabase = createClient(URL, KEY);

async function check() {
  // Buscar casos recientes con mensajes
  const { data: cases, error } = await supabase
    .from('sek_cases')
    .select('id, title, created_at, histcliente, histtecnico')
    .order('created_at', { ascending: false })
    .limit(5);

  if (error) { console.error(error); return; }

  for (const c of cases) {
    const hc = Array.isArray(c.histcliente) ? c.histcliente : [];
    const ht = Array.isArray(c.histtecnico) ? c.histtecnico : [];
    if (hc.length === 0 && ht.length === 0) continue;

    console.log(`\n=== CASO ${c.id} ===`);
    console.log(`Title: ${c.title || '(sin title)'}`);
    console.log(`Created: ${c.created_at}`);
    console.log(`histcliente: ${hc.length} msgs, histtecnico: ${ht.length} msgs`);

    const all = [
      ...hc.map(m => ({ ...m, _col: 'cliente' })),
      ...ht.map(m => ({ ...m, _col: 'tecnico' })),
    ];

    // Mostrar seq y time
    console.log('\nMensajes (orden por seq):');
    all.sort((a, b) => {
      const sa = a.seq ?? -1;
      const sb = b.seq ?? -1;
      return sa - sb;
    }).forEach((m, i) => {
      console.log(`  [${i}] seq=${m.seq ?? 'NULL'} time=${m.time || 'NONE'} col=${m._col} author=${m.author || m.role || '?'} content="${(m.content || '').slice(0, 50)}"`);
    });

    console.log('\nMensajes (orden por time):');
    all.sort((a, b) => {
      const ta = new Date(a.time || 0).getTime();
      const tb = new Date(b.time || 0).getTime();
      return ta - tb;
    }).forEach((m, i) => {
      console.log(`  [${i}] seq=${m.seq ?? 'NULL'} time=${m.time || 'NONE'} col=${m._col} author=${m.author || m.role || '?'} content="${(m.content || '').slice(0, 50)}"`);
    });
  }
}

check().catch(e => console.error(e));
