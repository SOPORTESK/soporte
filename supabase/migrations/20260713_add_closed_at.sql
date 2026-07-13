-- Agregar campo closed_at a sek_cases: se marca UNA SOLA VEZ al momento del cierre
-- real del caso, y nunca se vuelve a tocar. Esto corrige el cálculo de SLA, que
-- antes usaba updated_at (se movía con CUALQUIER escritura posterior al cierre:
-- calificación tardía del cliente, adjuntar messageId de WhatsApp, tags, etc.),
-- inflando artificialmente el tiempo de resolución reportado.

ALTER TABLE public.sek_cases ADD COLUMN IF NOT EXISTS closed_at timestamptz;

CREATE INDEX IF NOT EXISTS sek_cases_closed_at_idx ON public.sek_cases (closed_at);

-- Backfill: para casos ya cerrados/resueltos, usar el timestamp del último mensaje
-- real (histtecnico) como mejor aproximación del momento real de cierre. Si no hay
-- histtecnico, caer a updated_at como último recurso.
UPDATE public.sek_cases
SET closed_at = COALESCE(
  (
    SELECT (elem->>'time')::timestamptz
    FROM jsonb_array_elements(histtecnico) AS elem
    WHERE elem->>'role' != 'nota'
    ORDER BY (elem->>'time')::timestamptz DESC
    LIMIT 1
  ),
  updated_at
)
WHERE estado IN ('cerrado', 'resuelto')
  AND closed_at IS NULL;
