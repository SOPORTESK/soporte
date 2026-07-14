-- =====================================================================
-- Backfill: poblar closed_at en casos cerrados/resueltos que aún no lo tengan.
-- Esto corrige el cálculo de SLA en el panel de Estadísticas de Atención.
-- Usa el último mensaje de histtecnico como mejor aproximación del cierre;
-- si no hay histtecnico, cae a updated_at.
-- =====================================================================

UPDATE public.sek_cases
SET closed_at = COALESCE(
  (
    SELECT (elem->>'time')::timestamptz
    FROM jsonb_array_elements(histtecnico) AS elem
    ORDER BY (elem->>'time')::timestamptz DESC
    LIMIT 1
  ),
  updated_at
)
WHERE estado IN ('cerrado', 'resuelto')
  AND closed_at IS NULL;
