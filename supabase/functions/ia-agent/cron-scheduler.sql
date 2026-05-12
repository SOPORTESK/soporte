-- Cron job para ejecutar ia-agent cada 5 minutos
-- Ejecutar esto en el SQL Editor de Supabase Dashboard

-- 1. Crear extensión pg_cron si no existe
CREATE EXTENSION IF NOT EXISTS pg_cron;

-- 2. Crear función que invoca la Edge Function
CREATE OR REPLACE FUNCTION public.process_ia_cases()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  case_record RECORD;
BEGIN
  -- Obtener casos en estado ia_atendiendo
  FOR case_record IN
    SELECT id 
    FROM public.sek_cases 
    WHERE estado = 'ia_atendiendo'
    AND updated_at < NOW() - INTERVAL '2 minutes'
    ORDER BY created_at ASC
    LIMIT 10
  LOOP
    -- Invocar la Edge Function para cada caso
    PERFORM net.http_post(
      url := 'https://kzcyxeracvfxynddyjld.supabase.co/functions/v1/ia-agent',
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'Authorization', 'Bearer ' || current_setting('app.settings.service_role_key', true)
      ),
      body := jsonb_build_object('case_id', case_record.id)
    );
    
    -- Pequeña pausa para no sobrecargar
    PERFORM pg_sleep(1);
  END LOOP;
END;
$$;

-- 3. Programar cron job cada 5 minutos
SELECT cron.schedule(
  'ia-agent-processor',  -- nombre del job
  '*/5 * * * *',         -- cada 5 minutos
  'SELECT public.process_ia_cases();'
);

-- 4. Verificar que esté programado
SELECT * FROM cron.job WHERE jobname = 'ia-agent-processor';
