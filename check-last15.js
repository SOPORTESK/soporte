const fs = require('fs');
const lines = fs.readFileSync('.env.local', 'utf8').split('\n');
const vars = {};
lines.forEach(l => { const m = l.match(/^([A-Z_]+)=(.+)/); if (m) vars[m[1]] = m[2]; });
const { createClient } = require('@supabase/supabase-js');
const s = createClient(vars.NEXT_PUBLIC_SUPABASE_URL, vars.SUPABASE_SERVICE_ROLE_KEY);

(async () => {
  const fiveMinAgo = new Date(Date.now() - 10 * 60 * 1000).toISOString();
  const { data: cases, error } = await s.from('sek_cases')
    .select('id, estado, created_at, customer_phone, histcliente')
    .order('created_at', { ascending: false })
    .limit(10);

  if (error) { console.error(error); return; }

  for (const c of cases) {
    const msgs = c.histcliente || [];
    const recent = msgs.filter(m => new Date(m.time).getTime() > Date.now() - 15 * 60 * 1000);
    if (recent.length === 0) continue;
    
    console.log('\n=== Case:', c.id.slice(0,8), '| Phone:', c.customer_phone, '| Estado:', c.estado, '===');
    recent.forEach((m, i) => {
      console.log(`  ${m.time} | mediaType:${m.mediaType || '-'} | mediaUrl:${m.mediaUrl ? 'YES' : 'NO'} | content:"${(m.content||'').substring(0,120)}"`);
    });
  }
})();
