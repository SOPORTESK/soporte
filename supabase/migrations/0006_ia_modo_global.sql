-- =====================================================================
-- SEKUNET CHAT - Migración 0006
-- Agrega flag global ia_activa para activar/desactivar el agente IA
-- en todos los chats. Cuando ia_activa = false, todos los chats nuevos
-- van directamente a agentes humanos.
-- Ejecutar en Supabase SQL Editor.
-- =====================================================================

ALTER TABLE public.sek_agent_config
  ADD COLUMN IF NOT EXISTS ia_activa BOOLEAN NOT NULL DEFAULT true;

-- Asegurarse que la fila de configuración global tenga ia_activa = true por defecto
UPDATE public.sek_agent_config
SET ia_activa = true
WHERE email = 'system_prompt@sekunet.com';
