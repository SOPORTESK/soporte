const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: 'C:\\Users\\Taller SK\\Documents\\PROYECTOS\\Chat de Atención Sekunet\\.env.local' });
const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

async function findNonClientCases() {
  const { data: allCases, error } = await supabase.from('sek_cases')
    .select('id, cliente, histcliente')
    .order('created_at', { ascending: false })
    .limit(600);

  if (error) { console.error(error); return; }

  const matches = new Map();
  for (const c of allCases || []) {
    const hist = Array.isArray(c.histcliente) ? c.histcliente : [];
    for (const m of hist) {
      if (m.role === 'tecnico' || m.role === 'assistant') {
        const text = m.content || '';
        const lower = text.toLowerCase();
        if (
          lower.includes('no es cliente') ||
          lower.includes('no son cliente') ||
          lower.includes('no figura como cliente') ||
          lower.includes('no aparece registrado') ||
          lower.includes('no se encuentra registrado') ||
          lower.includes('no cuenta con cuenta') ||
          lower.includes('no cuenta con registro') ||
          lower.includes('exclusivo para clientes') ||
          lower.includes('exclusivo de clientes') ||
          lower.includes('distribuidor autorizado') ||
          lower.includes('canal de distribución') ||
          (lower.includes('soporte') && lower.includes('únicamente a clientes'))
        ) {
          if (!matches.has(text.trim())) {
            matches.set(text.trim(), c.id);
          }
        }
      }
    }
  }

  console.log('Unique matches found:', matches.size);
  for (const [text, id] of matches.entries()) {
    console.log('-----------------------------------------');
    console.log('Case:', id);
    console.log(text);
  }
}
findNonClientCases();
