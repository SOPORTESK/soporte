const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '.env.local' });

async function main() {
  const s = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
  const { data } = await s
    .from('sek_cases')
    .select('id, assigned_to, estado, canal, created_at, closed_at, accepted_at')
    .neq('canal', 'simulator');

  const humanos = data.filter(c => c.assigned_to && !c.assigned_to.includes('system_prompt'));
  
  const conAccepted = humanos.filter(c => c.accepted_at).length;
  const conClosed = humanos.filter(c => c.closed_at).length;
  const conAmbos = humanos.filter(c => c.accepted_at && c.closed_at).length;
  const sinAmbos = humanos.filter(c => !c.accepted_at || !c.closed_at).length;
  
  console.log('Total humanos:', humanos.length);
  console.log('Con accepted_at:', conAccepted);
  console.log('Con closed_at:', conClosed);
  console.log('Con ambos:', conAmbos);
  console.log('Sin accepted_at o closed_at:', sinAmbos);
  
  // Los que tienen ambos pero casosResolucion los filtra
  const conAmbosArr = humanos.filter(c => c.accepted_at && c.closed_at);
  const filtradosPorEstado = conAmbosArr.filter(c => !(c.estado === 'resuelto' || c.estado === 'cerrado' || c.closed_at));
  console.log('Con ambos pero sin estado resuelto/cerrado:', filtradosPorEstado.length);
  
  const conMinInvalido = conAmbosArr.filter(c => {
    const start = new Date(c.accepted_at);
    const end = new Date(c.closed_at);
    if (isNaN(start) || isNaN(end)) return true;
    return Math.round((end - start) / 60000) <= 0;
  });
  console.log('Con ambos pero fecha inválida o min <= 0:', conMinInvalido.length);
}

main().catch(e => console.log('ERROR:', e.message));
