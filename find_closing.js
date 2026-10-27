const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: 'C:\\Users\\Taller SK\\Documents\\PROYECTOS\\Chat de Atención Sekunet\\.env.local' });
const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

async function findClosingMessages() {
  const { data: allCases, error } = await supabase.from('sek_cases')
    .select('id, cliente, histcliente')
    .eq('estado', 'cerrado')
    .order('created_at', { ascending: false })
    .limit(800);

  if (error) { console.error(error); return; }

  const matches = new Map();
  for (const c of allCases || []) {
    const hist = Array.isArray(c.histcliente) ? c.histcliente : [];
    // Check last 2 messages
    for (const m of hist.slice(-3)) {
      if (m.role === 'tecnico') {
        const text = (m.content || '').trim();
        const lower = text.toLowerCase();
        if (
          lower.includes('cerramos') ||
          lower.includes('cerrar') ||
          lower.includes('cuenta') ||
          lower.includes('comercial') ||
          lower.includes('ventas') ||
          lower.includes('dispositivo')
        ) {
          if (!matches.has(text)) {
            matches.set(text, (matches.get(text) || 0) + 1);
          }
        }
      }
    }
  }

  console.log('Unique closing texts:', matches.size);
  const arr = [...matches.entries()].sort((a,b) => b[1] - a[1]);
  for (const [text, count] of arr.slice(0, 15)) {
    console.log(`[Used ${count} times]:\n${text}\n-------------------`);
  }
}
findClosingMessages();
