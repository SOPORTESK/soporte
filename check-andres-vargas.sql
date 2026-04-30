-- Ver todos los casos de Andrés Vargas por su correo o teléfono
SELECT 
  id,
  title,
  created_at,
  cliente->>'correo' as correo,
  cliente->>'telefono' as telefono,
  cliente->>'nombre' as nombre,
  customer_phone,
  jsonb_array_length(histtecnico) as msgs_agente
FROM sek_cases 
WHERE cliente->>'nombre' ILIKE '%andres%' 
   OR cliente->>'correo' ILIKE '%andres%'
   OR customer_phone ILIKE '%87043603%'
ORDER BY created_at DESC;
