const fs = require('fs');
const lines = fs.readFileSync('.env.local', 'utf8').split('\n');
const vars = {};
lines.forEach(l => { const m = l.match(/^([A-Z_]+)=(.+)/); if (m) vars[m[1]] = m[2]; });
const { createClient } = require('@supabase/supabase-js');
const s = createClient(vars.NEXT_PUBLIC_SUPABASE_URL, vars.SUPABASE_SERVICE_ROLE_KEY);

(async () => {
  // Search ALL cases for video messages in last 30 min
  const cutoff = new Date(Date.now() - 30 * 60 * 1000).toISOString();
  const { data: cases } = await s.from('sek_cases')
    .select('id, estado, created_at, customer_phone, histcliente, histtecnico')
    .gte('created_at', new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString())
    .order('created_at', { ascending: false })
    .limit(30);

  for (const c of cases || []) {
    const allMsgs = [...(c.histcliente || []), ...(c.histtecnico || [])];
    const recent = allMsgs.filter(m => new Date(m.time).getTime() > Date.now() - 30 * 60 * 1000);
    if (recent.length === 0) continue;
    console.log('\n=== Case:', c.id.slice(0,8), '| Estado:', c.estado, '| Phone:', c.customer_phone, '===');
    recent.forEach(m => {
      const isVideo = (m.mediaType || '').includes('video');
      console.log(`  ${m.time} | mediaType:${m.mediaType || '-'} | mediaUrl:${m.mediaUrl ? 'YES' : 'NO'} | ${isVideo ? '>>> VIDEO <<<' : ''} | content:"${(m.content||'').substring(0,80)}"`);
    });
  }

  // Also check Storage for recent video files
  const { data: files } = await s.storage.from('attachments').list('cases/evolution', {
    limit: 20,
    sortBy: { column: 'created_at', order: 'desc' }
  });
  console.log('\nArchivos recientes en Storage:');
  (files || []).forEach(f => {
    const fDate = new Date(f.created_at).getTime();
    if (fDate > Date.now() - 60 * 60 * 1000) {
      console.log('  ', f.name, f.metadata?.size, f.metadata?.mimetype, f.created_at);
    }
  });
})();
