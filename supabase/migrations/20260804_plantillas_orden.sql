-- Agregar columna orden a sek_plantillas para reordenar via drag-and-drop
ALTER TABLE sek_plantillas
ADD COLUMN IF NOT EXISTS orden integer DEFAULT 0;
