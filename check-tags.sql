-- Verificar qué casos tienen etiquetas y cuáles son
SELECT id, title, tags, estado, created_at
FROM sek_cases
WHERE tags IS NOT NULL AND array_length(tags, 1) > 0
ORDER BY created_at DESC
LIMIT 20;

-- Contar cuántos tienen etiqueta n2
SELECT COUNT(*) as total_n2
FROM sek_cases
WHERE tags @> ARRAY['n2'] OR tags @> ARRAY['soporte-n2'];
