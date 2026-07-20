const fs = require('fs');
const lines = fs.readFileSync('.env.local', 'utf8').split('\n');
const vars = {};
lines.forEach(l => { const m = l.match(/^([A-Z_]+)=(.+)/); if (m) vars[m[1]] = m[2]; });
const { createClient } = require('@supabase/supabase-js');
const s = createClient(vars.NEXT_PUBLIC_SUPABASE_URL, vars.SUPABASE_SERVICE_ROLE_KEY);

(async () => {
  // Check ALL cases from this phone, full history
  const { data: cases } = await s.from('sek_cases')
    .select('id, estado, created_at, customer_phone, histcliente')
    .or('customer_phone.eq.50687043603,customer_phone.eq.50687043603@s.whatsapp.net')
    .order('created_at', { ascending: false })
    .limit(5);

  for (const c of cases || []) {
    const msgs = c.histcliente || [];
    console.log('\n=== Case:', c.id.slice(0,8), '| Estado:', c.estado, '| Created:', c.created_at, '===');
    msgs.forEach((m, i) => {
      console.log(`  [${i}] ${m.time} | mediaType:${m.mediaType || '-'} | mediaUrl:${m.mediaUrl ? 'YES' : 'NO'} | content:"${(m.content||'').substring(0,80)}"`);
    });
  }
})();
