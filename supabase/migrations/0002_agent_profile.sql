-- Columnas de perfil para agentes
ALTER TABLE sek_agent_config
  ADD COLUMN IF NOT EXISTS avatar_url    TEXT,
  ADD COLUMN IF NOT EXISTS phone         TEXT,
  ADD COLUMN IF NOT EXISTS status        TEXT DEFAULT 'offline' CHECK (status IN ('online','away','busy','offline')),
  ADD COLUMN IF NOT EXISTS last_seen_at  TIMESTAMPTZ;

-- Bucket para avatares (ejecutar en Supabase Dashboard > Storage si no existe)
-- INSERT INTO storage.buckets (id, name, public) VALUES ('avatars', 'avatars', true) ON CONFLICT DO NOTHING;
