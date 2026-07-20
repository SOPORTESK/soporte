const fs = require('fs');
const lines = fs.readFileSync('.env.local', 'utf8').split('\n');
const vars = {};
lines.forEach(l => { const m = l.match(/^([A-Z_]+)=(.+)/); if (m) vars[m[1]] = m[2]; });
const { createClient } = require('@supabase/supabase-js');
const s = createClient(vars.NEXT_PUBLIC_SUPABASE_URL, vars.SUPABASE_SERVICE_ROLE_KEY);

(async () => {
  // 1. Check debug entry
  const { data: dbg } = await s.from('sek_app_settings').select('value, updated_at').eq('key', 'debug_last_notext').maybeSingle();
  if (dbg) {
    console.log('=== DEBUG last no-text payload ===');
    console.log('Time:', dbg.updated_at);
    console.log('Data:', dbg.value);
  } else {
    console.log('No debug entry found - webhook never received a no-text message');
  }

  // 2. Check all recent cases (last 20 min) from any phone
  const cutoff = new Date(Date.now() - 20 * 60 * 1000).toISOString();
  const { data: cases } = await s.from('sek_cases')
    .select('id, estado, created_at, customer_phone, histcliente')
    .gte('created_at', cutoff)
    .order('created_at', { ascending: false });

  console.log('\nCasos creados en últimos 20 min:', cases?.length || 0);
  cases?.forEach(c => {
    console.log('  ', c.id.slice(0,8), c.customer_phone, c.estado, c.created_at);
  });

  // 3. Check recent messages in ALL cases (not just new ones)
  const { data: allCases } = await s.from('sek_cases')
    .select('id, estado, created_at, customer_phone, histcliente')
    .order('created_at', { ascending: false })
    .limit(15);

  for (const c of allCases || []) {
    const msgs = c.histcliente || [];
    const recent = msgs.filter(m => new Date(m.time).getTime() > Date.now() - 20 * 60 * 1000);
    if (recent.length === 0) continue;
    console.log('\n=== Case:', c.id.slice(0,8), '| Estado:', c.estado, '| Phone:', c.customer_phone, '===');
    recent.forEach(m => {
      console.log(`  ${m.time} | mediaType:${m.mediaType || '-'} | mediaUrl:${m.mediaUrl ? 'YES' : 'NO'} | content:"${(m.content||'').substring(0,80)}"`);
    });
  }
})();
