const { createClient } = require('@supabase/supabase-js');
const sb = createClient(
  'https://kzcyxeracvfxynddyjld.supabase.co',
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imt6Y3l4ZXJhY3ZmeHluZGR5amxkIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3NTUxMTk1NCwiZXhwIjoyMDkxMDg3OTU0fQ.GlF4Zieqqc1V1IAPshPFKb1QzKBBbO8n1RGK_wG_JuM'
);

// Insertar un registro de prueba para verificar que podemos usar la tabla
sb.from('sek_impersonation').upsert({
  superadmin_email: 'test@test.com',
  target_email: 'test2@test.com',
  target_name: 'Test'
}).then(r => console.log(JSON.stringify(r)));
