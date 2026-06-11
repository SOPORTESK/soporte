-- Configuración segura de la aplicación (Evolution API, etc.)
-- Accesible solo vía SERVICE_ROLE_KEY (sin RLS para evitar problemas de permisos en edge functions)
CREATE TABLE IF NOT EXISTS sek_app_settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL,        -- valor cifrado (AES-256-GCM + base64)
  iv TEXT NOT NULL,          -- initialization vector (base64)
  tag TEXT NOT NULL,         -- auth tag GCM (base64)
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Índice para búsquedas por clave
CREATE INDEX IF NOT EXISTS idx_app_settings_key ON sek_app_settings(key);
