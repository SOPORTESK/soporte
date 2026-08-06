const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '.env.local' });

async function main() {
  const s = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
  const { data } = await s
    .from('sek_cases')
    .select('id, assigned_to, estado, canal, created_at, closed_at, accepted_at')
    .neq('canal', 'simulator');

  const humanos = data.filter(c => c.assigned_to && !c.assigned_to.includes('system_prompt'));
  
  // Casos con accepted_at y closed_at
  const conResolucion = humanos.filter(c => 
    (c.estado === 'resuelto' || c.estado === 'cerrado' || c.closed_at) && 
    c.accepted_at && c.closed_at
  );

  const tiempos = conResolucion.map(c => {
    const start = new Date(c.accepted_at);
    const end = new Date(c.closed_at);
    if (isNaN(start) || isNaN(end)) return null;
    return Math.round((end - start) / 60000);
  }).filter(t => t !== null && t > 0 && t < 10080);

  const lt1h = tiempos.filter(t => t <= 60).length;
  const h1_4 = tiempos.filter(t => t > 60 && t <= 240).length;
  const h4_8 = tiempos.filter(t => t > 240 && t <= 480).length;
  const gt8h = tiempos.filter(t => t > 480).length;
  const total = tiempos.length;
  const excluidos = conResolucion.length - tiempos.length;

  console.log('=== RESOLUCIÓN HUMANA ===');
  console.log('Casos con accepted_at + closed_at:', conResolucion.length);
  console.log('Tiempos válidos (< 7 días):', total);
  console.log('Excluidos (> 7 días):', excluidos);
  console.log('< 1 hora:', lt1h, '(' + Math.round(lt1h/total*100) + '%)');
  console.log('1-4 horas:', h1_4, '(' + Math.round(h1_4/total*100) + '%)');
  console.log('4-8 horas:', h4_8, '(' + Math.round(h4_8/total*100) + '%)');
  console.log('+8 horas:', gt8h, '(' + Math.round(gt8h/total*100) + '%)');
}

main().catch(e => console.log('ERROR:', e.message));
