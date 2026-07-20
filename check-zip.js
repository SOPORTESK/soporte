const fs = require('fs');
const lines = fs.readFileSync('.env.local', 'utf8').split('\n');
const vars = {};
lines.forEach(l => { const m = l.match(/^([A-Z_]+)=(.+)/); if (m) vars[m[1]] = m[2]; });
const { createClient } = require('@supabase/supabase-js');
const s = createClient(vars.NEXT_PUBLIC_SUPABASE_URL, vars.SUPABASE_SERVICE_ROLE_KEY);

(async () => {
  // Check debug entry
  const { data: dbg } = await s.from('sek_app_settings').select('value, updated_at').eq('key', 'debug_last_notext').maybeSingle();
  if (dbg) {
    console.log('=== DEBUG last no-text payload ===');
    console.log('Time:', dbg.updated_at);
    console.log('Data:', dbg.value);
  } else {
    console.log('No debug entry found');
  }

  // Check recent cases with document messages
  const { data: cases } = await s.from('sek_cases')
    .select('id, estado, created_at, customer_phone, histcliente')
    .order('created_at', { ascending: false })
    .limit(10);

  for (const c of cases || []) {
    const msgs = c.histcliente || [];
    const recent = msgs.filter(m => new Date(m.time).getTime() > Date.now() - 60 * 60 * 1000);
    if (recent.length === 0) continue;
    console.log('\n=== Case:', c.id.slice(0,8), '| Estado:', c.estado, '| Phone:', c.customer_phone, '===');
    recent.forEach(m => {
      console.log(`  ${m.time} | mediaType:${m.mediaType || '-'} | mediaUrl:${m.mediaUrl ? 'YES' : 'NO'} | content:"${(m.content||'').substring(0,100)}"`);
    });
  }

  // Check recent files in storage
  const { data: files } = await s.storage.from('attachments').list('cases/evolution', {
    limit: 10,
    sortBy: { column: 'created_at', order: 'desc' }
  });
  console.log('\nArchivos recientes en Storage:');
  (files || []).forEach(f => {
    console.log('  ', f.name, f.metadata?.size, f.metadata?.mimetype, f.created_at);
  });
})();
