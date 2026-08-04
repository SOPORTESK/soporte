-- Nodos del flow relacionados con la encuesta de calificacion
select
  fc.activo,
  n->>'id'                          as node_id,
  left(coalesce(n->'data'->>'message', ''), 160) as mensaje
from public.sek_flow_configs fc,
     jsonb_array_elements(fc.flow_data->'nodes') as n
where n->>'id' in ('pedir_calificacion', 'agradecer_calificacion', 'calificacion_invalida')
order by fc.activo desc, node_id;
