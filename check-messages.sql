-- Verificar qué casos tienen mensajes de un agente específico
-- Reemplaza 'tu-email@ejemplo.com' con tu email real
SELECT id, title, 
       (SELECT COUNT(*) 
        FROM unnest(histtecnico) AS msg 
        WHERE msg->>'author' ILIKE '%tu-email@ejemplo.com%') as mensajes_mios
FROM sek_cases
WHERE histtecnico IS NOT NULL AND array_length(histtecnico, 1) > 0
ORDER BY mensajes_mios DESC
LIMIT 20;
