const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '.env.local' });

async function main() {
  const s = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
  const { data } = await s
    .from('sek_cases')
    .select('id, assigned_to, estado, canal, created_at, closed_at, accepted_at, title')
    .neq('canal', 'simulator');

  const humanos = data.filter(c => c.assigned_to && !c.assigned_to.includes('system_prompt'));
  
  // Casos con ambos campos pero min <= 0
  const conAmbos = humanos.filter(c => c.accepted_at && c.closed_at);
  const minInvalido = conAmbos.filter(c => {
    const start = new Date(c.accepted_at);
    const end = new Date(c.closed_at);
    if (isNaN(start) || isNaN(end)) return true;
    return Math.round((end - start) / 60000) <= 0;
  });

  console.log('=== CASOS CON FECHAS INVÁLIDAS ===');
  console.log('Total:', minInvalido.length);
  
  // Agrupar por tipo de problema
  let fechInvalida = 0, cierreAntesAcept = 0, mismoTiempo = 0;
  minInvalido.forEach(c => {
    const start = new Date(c.accepted_at);
    const end = new Date(c.closed_at);
    if (isNaN(start) || isNaN(end)) { fechInvalida++; return; }
    const diff = Math.round((end - start) / 60000);
    if (diff < 0) cierreAntesAcept++;
    if (diff === 0) mismoTiempo++;
  });
  
  console.log('Fecha inválida (NaN):', fechInvalida);
  console.log('Cierre antes que aceptación:', cierreAntesAcept);
  console.log('Mismo timestamp (diff = 0):', mismoTiempo);
  
  // Mostrar algunos ejemplos
  console.log('\n=== EJEMPLOS (primeros 10) ===');
  minInvalido.slice(0, 10).forEach(c => {
    const start = new Date(c.accepted_at);
    const end = new Date(c.closed_at);
    const diff = isNaN(start) || isNaN(end) ? 'NaN' : Math.round((end - start) / 60000);
    console.log(`ID ${c.id} | ${c.title?.slice(0,40)} | estado: ${c.estado} | accepted: ${c.accepted_at} | closed: ${c.closed_at} | diff_min: ${diff}`);
  });

  // Casos sin accepted_at o closed_at
  const sinCampos = humanos.filter(c => !c.accepted_at || !c.closed_at);
  console.log('\n=== SIN accepted_at O closed_at ===');
  console.log('Total:', sinCampos.length);
  let sinAccepted = 0, sinClosed = 0;
  sinCampos.forEach(c => {
    if (!c.accepted_at) sinAccepted++;
    if (!c.closed_at) sinClosed++;
  });
  console.log('Sin accepted_at:', sinAccepted);
  console.log('Sin closed_at:', sinClosed);
  sinCampos.slice(0, 5).forEach(c => {
    console.log(`ID ${c.id} | ${c.title?.slice(0,40)} | estado: ${c.estado} | accepted: ${c.accepted_at || 'NULL'} | closed: ${c.closed_at || 'NULL'}`);
  });
}

main().catch(e => console.log('ERROR:', e.message));
