// Verificar mensajes con time null/invalid en los ultimos 20 casos
const { createClient } = require('@supabase/supabase-js');
const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

async function check() {
  const { data: cases } = await supabase
    .from('sek_cases')
    .select('id, title, histcliente, histtecnico')
    .order('created_at', { ascending: false })
    .limit(20);

  let nullTime = 0, invalidTime = 0, validTime = 0;

  for (const c of cases) {
    const hc = Array.isArray(c.histcliente) ? c.histcliente : [];
    const ht = Array.isArray(c.histtecnico) ? c.histtecnico : [];
    const all = [...hc, ...ht];

    for (const m of all) {
      if (!m.time || m.time === null) {
        nullTime++;
        console.log(`NULL time in case ${c.id}: author=${m.author || m.role}, content="${(m.content||'').slice(0,40)}"`);
      } else {
        const t = new Date(m.time).getTime();
        if (isNaN(t)) {
          invalidTime++;
          console.log(`INVALID time "${m.time}" in case ${c.id}: author=${m.author || m.role}`);
        } else {
          validTime++;
        }
      }
    }
  }

  console.log(`\nResumen: valid=${validTime}, null=${nullTime}, invalid=${invalidTime}`);
}

check().catch(e => console.error(e));
