-- =====================================================================
-- Helper: leer el mensaje de un nodo del flow config activo.
-- Para que la encuesta de WhatsApp no dependa de que el bot esté ON/OFF.
-- =====================================================================

create or replace function public.sek_get_flow_message(p_node_id text, p_fallback text)
returns text
language plpgsql
security definer
as $$
declare
  v_msg text;
begin
  select (n->'data'->>'message')
  into v_msg
  from public.sek_flow_configs fc,
       jsonb_array_elements(fc.flow_data->'nodes') as n
  where fc.activo = true
    and n->>'id' = p_node_id
  limit 1;

  return coalesce(nullif(trim(v_msg), ''), p_fallback);
end;
$$;

grant execute on function public.sek_get_flow_message(text, text) to service_role;
