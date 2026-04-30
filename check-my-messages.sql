-- Ver qué mensajes tienen el email cbatista@sekunet.com o un nombre similar
SELECT 
  id, 
  title,
  jsonb_array_length(histtecnico) as total_mensajes_agente,
  histtecnico->0->>'author' as primer_autor,
  histtecnico->0->>'content' as primer_mensaje
FROM sek_cases 
WHERE histtecnico IS NOT NULL 
  AND jsonb_array_length(histtecnico) > 0
  AND (
    histtecnico::text ILIKE '%cbatista%' 
    OR histtecnico::text ILIKE '%batista%'
  )
ORDER BY created_at DESC;
