-- Cron job para ejecutar auto-close cada minuto
-- Ejecutar UNA SOLA VEZ en el SQL Editor de Supabase Dashboard

-- 1. Asegurar extensiones
CREATE EXTENSION IF NOT EXISTS pg_cron;
CREATE EXTENSION IF NOT EXISTS pg_net;

-- 2. Función que invoca la Edge Function auto-close
CREATE OR REPLACE FUNCTION public.invoke_auto_close()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  PERFORM net.http_post(
    url := 'https://kzcyxeracvfxynddyjld.supabase.co/functions/v1/auto-close',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || current_setting('app.settings.service_role_key', true)
    ),
    body := '{}'::jsonb
  );
END;
$$;

-- 3. Eliminar job previo si existe (idempotente)
SELECT cron.unschedule('auto-close-runner') WHERE EXISTS (
  SELECT 1 FROM cron.job WHERE jobname = 'auto-close-runner'
);

-- 4. Programar cron cada minuto
SELECT cron.schedule(
  'auto-close-runner',
  '* * * * *',  -- cada minuto
  'SELECT public.invoke_auto_close();'
);

-- 5. Verificar
SELECT * FROM cron.job WHERE jobname = 'auto-close-runner';
