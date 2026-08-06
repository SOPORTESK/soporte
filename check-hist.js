require('dotenv').config({ path: '.env.local' });
const { createClient } = require('@supabase/supabase-js');
const s = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

(async () => {
  const { data, error } = await s
    .from('sek_cases')
    .select('id, estado, created_at, customer_phone, histcliente, histtecnico')
    .eq('customer_phone', '50661063637')
    .order('created_at', { ascending: false })
    .limit(20);

  if (error) { console.error(error); return; }
  if (!data || data.length === 0) { console.log('No se encontraron casos'); return; }

  data.forEach(c => {
    const hc = Array.isArray(c.histcliente) ? c.histcliente.length : 0;
    const ht = Array.isArray(c.histtecnico) ? c.histtecnico.length : 0;
    console.log(`${c.id} | ${c.estado} | ${c.created_at} | hc=${hc} ht=${ht}`);
  });
})();
