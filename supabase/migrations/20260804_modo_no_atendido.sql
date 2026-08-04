-- Agregar columna modo_no_atendido a sek_agent_config
-- Permite activar un modo donde WhatsApp funciona solo como buzón de mensajes
-- Sin IA, sin auto-close, sin encuestas, sin temporizadores
ALTER TABLE sek_agent_config
ADD COLUMN IF NOT EXISTS modo_no_atendido boolean DEFAULT false;
