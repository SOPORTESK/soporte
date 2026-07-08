-- Agregar campo auto_close_paused a sek_cases
ALTER TABLE sek_cases ADD COLUMN IF NOT EXISTS auto_close_paused BOOLEAN DEFAULT FALSE;

-- Crear índice para consultas más rápidas
CREATE INDEX IF NOT EXISTS idx_sek_cases_auto_close_paused ON sek_cases(auto_close_paused);
