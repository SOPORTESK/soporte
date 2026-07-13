-- =====================================================================
-- Funciones RPC para marcar mensajes como leídos de forma atómica,
-- evitando race conditions que sobrescriben mensajes recién llegados.
-- =====================================================================

-- Marcar mensajes del cliente (histcliente) como leídos.
-- Se lee la fila bloqueándola (FOR UPDATE), se actualizan solo las entradas
-- del cliente sin read_at y se guarda el array resultante. Si llegó un
-- mensaje nuevo durante el proceso, también se conserva porque se re-lee
-- la fila completa antes de escribir.
create or replace function public.mark_histcliente_read(p_case_id text, p_reader_email text default null)
returns void
language plpgsql
security definer
as $$
declare
  v_hist jsonb;
  v_updated jsonb;
  v_now timestamptz := now();
begin
  select histcliente into v_hist
  from public.sek_cases
  where id = p_case_id
  for update;

  if v_hist is null then
    return;
  end if;

  select coalesce(jsonb_agg(
    case
      when (elem->>'role' = 'user' or elem->>'role' is null) and (elem->>'read_at' is null)
      then elem || jsonb_build_object('read_at', v_now)
      else elem
    end
  ), '[]'::jsonb)
  into v_updated
  from jsonb_array_elements(v_hist) as elem;

  update public.sek_cases
  set histcliente = v_updated
  where id = p_case_id;
end;
$$;

-- Marcar mensajes del agente/técnico (histtecnico) como leídos (usado principalmente por el widget).
create or replace function public.mark_histtecnico_read(p_case_id text, p_reader_email text default null)
returns void
language plpgsql
security definer
as $$
declare
  v_hist jsonb;
  v_updated jsonb;
  v_now timestamptz := now();
begin
  select histtecnico into v_hist
  from public.sek_cases
  where id = p_case_id
  for update;

  if v_hist is null then
    return;
  end if;

  select coalesce(jsonb_agg(
    case
      when elem->>'role' <> 'nota' and (elem->>'read_at' is null)
      then elem || jsonb_build_object('read_at', v_now)
      else elem
    end
  ), '[]'::jsonb)
  into v_updated
  from jsonb_array_elements(v_hist) as elem;

  update public.sek_cases
  set histtecnico = v_updated
  where id = p_case_id;
end;
$$;
