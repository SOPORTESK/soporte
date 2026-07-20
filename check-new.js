const fs = require('fs');
const lines = fs.readFileSync('.env.local', 'utf8').split('\n');
const vars = {};
lines.forEach(l => { const m = l.match(/^([A-Z_]+)=(.+)/); if (m) vars[m[1]] = m[2]; });
const { createClient } = require('@supabase/supabase-js');
const s = createClient(vars.NEXT_PUBLIC_SUPABASE_URL, vars.SUPABASE_SERVICE_ROLE_KEY);

(async () => {
  // Check ALL cases created in last 30 min
  const cutoff = new Date(Date.now() - 30 * 60 * 1000).toISOString();
  const { data: cases, error } = await s.from('sek_cases')
    .select('id, estado, created_at, customer_phone, canal')
    .gte('created_at', cutoff)
    .order('created_at', { ascending: false });

  if (error) { console.error(error); return; }
  console.log('Casos creados en últimos 30 min:', cases?.length || 0);
  cases?.forEach(c => console.log('  ', c.id.slice(0,8), c.customer_phone, c.estado, c.canal, c.created_at));

  // Also check Storage for any new files in last 30 min
  const { data: files } = await s.storage.from('attachments').list('cases/evolution', {
    limit: 10,
    sortBy: { column: 'created_at', order: 'desc' }
  });
  console.log('\nArchivos recientes en Storage:');
  files?.forEach(f => {
    const fDate = new Date(f.created_at).getTime();
    if (fDate > Date.now() - 60 * 60 * 1000) {
      console.log('  ', f.name, f.metadata?.size, f.metadata?.mimetype, f.created_at);
    }
  });
})();
