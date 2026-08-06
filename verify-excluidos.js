const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '.env.local' });

async function main() {
  const s = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
  const { data } = await s
    .from('sek_cases')
    .select('id, assigned_to, estado, canal, created_at, closed_at, accepted_at')
    .neq('canal', 'simulator');

  const humanos = data.filter(c => c.assigned_to && !c.assigned_to.includes('system_prompt'));
  
  const conRes = humanos.filter(c => c.accepted_at && c.closed_at && (c.estado === 'resuelto' || c.estado === 'cerrado' || c.closed_at));
  const tiempos = conRes.map(c => {
    const start = new Date(c.accepted_at);
    const end = new Date(c.closed_at);
    if (isNaN(start) || isNaN(end)) return null;
    return { min: Math.round((end - start) / 60000), mes: new Date(c.created_at).getMonth() + 1, year: new Date(c.created_at).getFullYear() };
  }).filter(t => t !== null && t.min > 0);

  const excluidos = tiempos.filter(t => t.min >= 10080);
  const validos = tiempos.filter(t => t.min < 10080);

  console.log('Total con resolucion:', tiempos.length);
  console.log('Validos (<7d):', validos.length);
  console.log('Excluidos (>=7d):', excluidos.length);
  
  // Por mes
  const porMes = {};
  excluidos.forEach(t => {
    const key = `${t.year}-${String(t.mes).padStart(2,'0')}`;
    porMes[key] = (porMes[key] || 0) + 1;
  });
  console.log('Excluidos por mes:', porMes);
  
  const validosPorMes = {};
  validos.forEach(t => {
    const key = `${t.year}-${String(t.mes).padStart(2,'0')}`;
    validosPorMes[key] = (validosPorMes[key] || 0) + 1;
  });
  console.log('Validos por mes:', validosPorMes);
}

main().catch(e => console.log('ERROR:', e.message));
