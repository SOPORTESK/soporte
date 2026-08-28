-- Backfill: asignar seq a todos los mensajes existentes.
-- Para cada caso, recorrer histcliente + histtecnico en orden por time,
-- y asignar seq incremental.
-- Solo asigna seq a los que no lo tienen (no pisa los existentes).

-- Función temporal para hacer el backfill
create or replace function public.sek_backfill_seq()
returns table(case_id uuid, total_msgs int, assigned int)
language plpgsql
security definer
as $$
declare
  c record;
  v_combined jsonb[];
  v_entry jsonb;
  v_seq int;
  v_idx int;
  v_assigned int;
  v_total int;
begin
  for c in select id, histcliente, histtecnico from public.sek_cases loop
    v_combined := array[]::jsonb[];
    v_seq := 0;
    v_assigned := 0;
    v_total := 0;

    -- Recoger todos los entries con su origen
    if c.histcliente is not null then
      for v_idx in 0..jsonb_array_length(c.histcliente) - 1 loop
        v_entry := c.histcliente->v_idx;
        v_total := v_total + 1;
        if (v_entry->>'seq') is null then
          v_entry := v_entry || jsonb_build_object('seq', -1, '_col', 'histcliente', '_idx', v_idx);
        end if;
        v_combined := array_append(v_combined, v_entry);
      end loop;
    end if;

    if c.histtecnico is not null then
      for v_idx in 0..jsonb_array_length(c.histtecnico) - 1 loop
        v_entry := c.histtecnico->v_idx;
        v_total := v_total + 1;
        if (v_entry->>'seq') is null then
          v_entry := v_entry || jsonb_build_object('seq', -1, '_col', 'histtecnico', '_idx', v_idx);
        end if;
        v_combined := array_append(v_combined, v_entry);
      end loop;
    end if;

    -- Ordenar por time (los que ya tienen seq se quedan con su seq)
    -- Asignar seq solo a los que tienen seq = -1
    -- Primero, encontrar el max seq existente
    select coalesce(max((e->>'seq')::int), 0) into v_seq
    from unnest(v_combined) as e
    where (e->>'seq') is not null and (e->>'seq')::int > 0;

    -- Ordenar el array por time
    -- (Postgres no tiene sort directo sobre arrays, usar una subquery)
    for v_idx in 0..array_length(v_combined, 1) - 1 loop
      v_entry := v_combined[v_idx + 1];
      if (v_entry->>'seq')::int = -1 then
        v_seq := v_seq + 1;
        v_entry := v_entry || jsonb_build_object('seq', v_seq);
        v_combined[v_idx + 1] := v_entry;
        v_assigned := v_assigned + 1;
      end if;
    end loop;

    -- Escribir de vuelta
    -- Reconstruir histcliente y histtecnico
    declare
      v_new_cliente jsonb := '[]'::jsonb;
      v_new_tecnico jsonb := '[]'::jsonb;
    begin
      for v_idx in 1..array_length(v_combined, 1) loop
        v_entry := v_combined[v_idx];
        -- Quitar campos auxiliares
        v_entry := v_entry - '_col' - '_idx';
        if (v_combined[v_idx]->>'_col') = 'histcliente' then
          v_new_cliente := v_new_cliente || jsonb_build_array(v_entry);
        else
          v_new_tecnico := v_new_tecnico || jsonb_build_array(v_entry);
        end if;
      end loop;

      update public.sek_cases
        set histcliente = v_new_cliente,
            histtecnico = v_new_tecnico
        where id = c.id;
    end;

    return next (c.id, v_total, v_assigned);
  end loop;
end;
$$;

grant execute on function public.sek_backfill_seq() to service_role;
