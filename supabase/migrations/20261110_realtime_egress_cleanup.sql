-- Remove high-volume chat tables from Postgres WAL realtime (`postgres_changes`)
-- so full `histcliente` / `histtecnico` JSONB blobs are never serialized and pushed
-- to every connected client on every update.
-- All clients now consume lightweight Broadcast events on `sek_cases_live` and `sek_agents_live`.
-- `wa_outbox` intentionally stays in `supabase_realtime` for `tunnel-watchdog.cjs`.

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime'
      AND schemaname = 'public'
      AND tablename = 'sek_cases'
  ) THEN
    ALTER PUBLICATION supabase_realtime DROP TABLE public.sek_cases;
  END IF;
END $$;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime'
      AND schemaname = 'public'
      AND tablename = 'sek_agent_config'
  ) THEN
    ALTER PUBLICATION supabase_realtime DROP TABLE public.sek_agent_config;
  END IF;
END $$;
