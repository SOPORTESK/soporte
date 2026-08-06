const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '.env.local' });

async function main() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) {
    console.log('ERROR: No se encontraron las variables de entorno');
    return;
  }
  const s = createClient(url, key);

  const { data, error } = await s
    .from('sek_cases')
    .select('id, assigned_to, estado, canal, created_at, closed_at, accepted_at, escalado_at, cliente')
    .neq('canal', 'simulator');

  if (error) {
    console.log('ERROR:', error.message);
    return;
  }

  const humanos = data.filter(c => c.assigned_to && !c.assigned_to.includes('system_prompt'));
  const ahora = new Date();
  const hace7 = new Date(ahora - 7 * 86400000);
  const hace14 = new Date(ahora - 14 * 86400000);

  const c7 = humanos.filter(c => new Date(c.created_at) >= hace7).length;
  const c14 = humanos.filter(c => new Date(c.created_at) >= hace14 && new Date(c.created_at) < hace7).length;

  const resueltos = humanos.filter(c => c.estado === 'resuelto' || c.estado === 'cerrado' || c.closed_at).length;
  const activos = humanos.filter(c => c.estado === 'abierto').length;

  // SLA
  const slaData = humanos.filter(c => c.escalado_at && c.accepted_at);
  const slaVals = slaData.map(c => {
    const start = new Date(c.escalado_at);
    const end = new Date(c.accepted_at);
    return Math.round((end - start) / 60000);
  }).filter(t => t > 0 && t < 10080);
  const avgSla = slaVals.length > 0 ? Math.round(slaVals.reduce((a, b) => a + b, 0) / slaVals.length) : 0;

  // CSAT
  const cals = humanos.map(c => {
    const cl = typeof c.cliente === 'object' ? c.cliente : null;
    const v = cl?.calificacion_cliente;
    const n = Number(v);
    return v != null && !isNaN(n) && n >= 1 && n <= 5 ? n : null;
  }).filter(v => v !== null);

  console.log('=== VERIFICACIÓN ANALYTICS ===');
  console.log('Total casos humanos:', humanos.length);
  console.log('Resueltos:', resueltos);
  console.log('Activos:', activos);
  console.log('Tasa resolución:', humanos.length > 0 ? Math.round((resueltos / humanos.length) * 100) + '%' : 'N/A');
  console.log('Últimos 7d:', c7);
  console.log('7d anteriores:', c14);
  console.log('Tendencia:', c14 > 0 ? Math.round(((c7 - c14) / c14) * 100) + '%' : 'N/A');
  console.log('SLA promedio (min):', avgSla, '| casos con SLA:', slaVals.length);
  console.log('Calificaciones:', cals.length, '| promedio:', cals.length >= 20 ? (cals.reduce((a, b) => a + b, 0) / cals.length).toFixed(1) : 'Muestra insuficiente');
  
  // Por agente
  const porAgente = {};
  humanos.forEach(c => {
    const e = c.assigned_to.toLowerCase();
    if (!porAgente[e]) porAgente[e] = { total: 0, resueltos: 0, cals: [] };
    porAgente[e].total++;
    if (c.estado === 'resuelto' || c.estado === 'cerrado' || c.closed_at) porAgente[e].resueltos++;
    const cl = typeof c.cliente === 'object' ? c.cliente : null;
    const v = cl?.calificacion_cliente;
    const n = Number(v);
    if (v != null && !isNaN(n) && n >= 1 && n <= 5) porAgente[e].cals.push(n);
  });
  console.log('\n=== POR AGENTE ===');
  Object.entries(porAgente).forEach(([email, d]) => {
    console.log(`${email}: ${d.total} casos, ${d.resueltos} resueltos, ${d.cals.length} cals${d.cals.length >= 4 ? ' (avg ' + (d.cals.reduce((a,b)=>a+b,0)/d.cals.length).toFixed(1) + ')' : ''}`);
  });
}

main().catch(e => console.log('ERROR:', e.message));
