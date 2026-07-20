const fs = require('fs');
const lines = fs.readFileSync('.env.local', 'utf8').split('\n');
const vars = {};
lines.forEach(l => { const m = l.match(/^([A-Z_]+)=(.+)/); if (m) vars[m[1]] = m[2]; });
const { createClient } = require('@supabase/supabase-js');
const s = createClient(vars.NEXT_PUBLIC_SUPABASE_URL, vars.SUPABASE_SERVICE_ROLE_KEY);

(async () => {
  const { data: cases, error } = await s.from('sek_cases')
    .select('id, estado, created_at, customer_phone, histcliente, histtecnico')
    .order('created_at', { ascending: false })
    .limit(20);

  if (error) { console.error(error); return; }

  const cutoff = Date.now() - 30 * 60 * 1000;
  for (const c of cases) {
    const allMsgs = [...(c.histcliente || []).map(m => ({...m, dir:'IN'})), ...(c.histtecnico || []).map(m => ({...m, dir:'OUT'}))];
    const recent = allMsgs.filter(m => new Date(m.time).getTime() > cutoff);
    if (recent.length === 0) continue;
    
    console.log('\n=== Case:', c.id.slice(0,8), '| Phone:', c.customer_phone, '| Estado:', c.estado, '===');
    recent.sort((a,b) => new Date(a.time) - new Date(b.time));
    recent.forEach(m => {
      console.log(`  ${m.dir} ${m.time} | mediaType:${m.mediaType || '-'} | mediaUrl:${m.mediaUrl ? 'YES' : 'NO'} | content:"${(m.content||'').substring(0,120)}"`);
    });
  }
})();
