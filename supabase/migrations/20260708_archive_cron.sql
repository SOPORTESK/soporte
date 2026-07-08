-- =====================================================================
-- SEKUNET CHAT - Cron job: archivar casos antiguos cada semana
-- Requiere reemplazar <SERVICE_ROLE_KEY> por la clave real del proyecto.
-- =====================================================================

create extension if not exists pg_cron;
create extension if not exists pg_net;

-- Programar ejecución semanal: domingos a las 03:00 UTC
select cron.schedule(
  'archive-old-cases-weekly',
  '0 3 * * 0',
  $$
    select net.http_post(
      url := 'https://kzcyxeracvfxynddyjld.supabase.co/functions/v1/archive-old-cases',
      headers := '{"Authorization": "Bearer <SERVICE_ROLE_KEY>", "Content-Type": "application/json"}'::jsonb,
      body := '{}'::jsonb
    ) as request_id;
  $$
);
