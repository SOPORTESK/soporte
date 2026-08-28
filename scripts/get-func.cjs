const { createClient } = require('@supabase/supabase-js');
const s = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

// Obtener la función sek_append_hist
s.rpc('sek_get_function_source', { p_name: 'sek_append_hist' })
  .then(({ data, error }) => {
    if (error) {
      // Intentar con query directa
      return s.from('sek_cases').select('id').limit(1).then(() => {
        console.log('No se pudo obtener la función via RPC');
      });
    }
    console.log(data);
  });
