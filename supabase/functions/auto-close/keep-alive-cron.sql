-- Keep-alive para Evolution API en Render (evitar cold start)
-- Ejecutar UNA SOLA VEZ en el SQL Editor de Supabase Dashboard

-- 1. Asegurar extensiones
CREATE EXTENSION IF NOT EXISTS pg_cron;
CREATE EXTENSION IF NOT EXISTS pg_net;

-- 2. Función que hace ping a Evolution API
CREATE OR REPLACE FUNCTION public.ping_evolution_api()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  PERFORM net.http_get(
    url := 'https://sekunet-evolution-api.onrender.com/',
    headers := '{}'::jsonb
  );
END;
$$;

-- 3. Eliminar job previo si existe
SELECT cron.unschedule('evolution-keep-alive') WHERE EXISTS (
  SELECT 1 FROM cron.job WHERE jobname = 'evolution-keep-alive'
);

-- 4. Programar ping cada 4 minutos (Render duerme tras 15 min inactividad)
SELECT cron.schedule(
  'evolution-keep-alive',
  '*/4 * * * *',
  'SELECT public.ping_evolution_api();'
);

-- 5. Verificar
SELECT * FROM cron.job WHERE jobname = 'evolution-keep-alive';
