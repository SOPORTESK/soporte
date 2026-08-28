const { createClient } = require('@supabase/supabase-js');
const s = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

async function main() {
  const { data, error } = await s
    .from('sek_cases')
    .select('id,title,histcliente,histtecnico,created_at,updated_at')
    .ilike('cliente->>nombre', '%Alejandro%')
    .order('created_at', { ascending: false })
    .limit(3);

  if (error) { console.error(error); return; }

  data.forEach(c => {
    console.log('===', c.id, c.title, 'created:', c.created_at, 'updated:', c.updated_at);
    const hc = Array.isArray(c.histcliente) ? c.histcliente : [];
    const ht = Array.isArray(c.histtecnico) ? c.histtecnico : [];
    const all = [
      ...hc.map(m => ({ ...m, _col: 'cliente' })),
      ...ht.map(m => ({ ...m, _col: 'tecnico' })),
    ];
    all.sort((a, b) => new Date(a.time || 0).getTime() - new Date(b.time || 0).getTime())
      .forEach((m, i) => console.log(`  [${i}] time=${m.time} col=${m._col} author=${m.author || m.role || '?'} seq=${m.seq ?? 'NULL'} content="${(m.content || '').slice(0, 60).replace(/\n/g, ' ')}"`));
  });
}

main().catch(e => console.error(e));
