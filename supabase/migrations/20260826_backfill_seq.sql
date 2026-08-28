-- Backfill: asignar seq a todos los mensajes existentes, ordenados por time.
-- También genera messageId (uuid) para los mensajes que no lo tengan.
-- No borra ni marca duplicados — solo asigna seq y messageId.

-- Procesar caso por caso: para cada caso, ordenar todos los mensajes
-- (histcliente + histtecnico) por time, y asignar seq incremental.
-- Luego escribir de vuelta los arrays con seq asignado.

do $$
declare
  c record;
  v_all jsonb[];
  v_msg jsonb;
  v_seq int;
  v_sorted jsonb[];
  v_histcliente jsonb;
  v_histtecnico jsonb;
  v_entry jsonb;
begin
  for c in select id, histcliente, histtecnico from public.sek_cases
           where histcliente is not null or histtecnico is not null
  loop
    -- Combinar todos los mensajes en un array temporal
    v_all := '{}';
    -- histcliente
    if c.histcliente is not null then
      for i in 0..jsonb_array_length(c.histcliente) - 1 loop
        v_all := array_append(v_all, c.histcliente->i || jsonb_build_object('_col', 'histcliente', '_idx', i));
      end loop;
    end if;
    -- histtecnico
    if c.histtecnico is not null then
      for i in 0..jsonb_array_length(c.histtecnico) - 1 loop
        v_all := array_append(v_all, c.histtecnico->i || jsonb_build_object('_col', 'histtecnico', '_idx', i));
      end loop;
    end if;

    -- Si no hay mensajes, saltar
    if array_length(v_all, 1) is null then continue; end if;

    -- Ordenar por time (manejar nulls y formatos inválidos)
    -- Usar una subquery para ordenar
    v_seq := 0;
    v_sorted := '{}';

    -- Ordenar el array por time usando unnest + order by
    for v_msg in
      select elem
      from unnest(v_all) as elem
      order by
        case
          when elem->>'time' is not null and elem->>'time' <> '' then
            (elem->>'time')::timestamptz
          else '1970-01-01'::timestamptz
        end,
        case
          when (elem->>'_col') = 'histcliente' then 0
          else 1
        end
    loop
      -- Asignar seq
      v_entry := v_msg - '_col' - '_idx';
      v_entry := v_entry || jsonb_build_object('seq', v_seq);

      -- Generar messageId si no tiene
      if nullif(v_entry->>'messageId', '') is null then
        v_entry := v_entry || jsonb_build_object('messageId', gen_random_uuid()::text);
      end if;

      v_sorted := array_append(v_sorted, v_entry || jsonb_build_object('_col', v_msg->>'_col', '_idx', (v_msg->>'_idx')::int));
      v_seq := v_seq + 1;
    end loop;

    -- Reconstruir histcliente y histtecnico con los mensajes ordenados
    v_histcliente := '[]'::jsonb;
    v_histtecnico := '[]'::jsonb;

    for i in 1..array_length(v_sorted, 1) loop
      v_entry := v_sorted[i] - '_col' - '_idx';
      if v_sorted[i]->>'_col' = 'histcliente' then
        v_histcliente := v_histcliente || jsonb_build_array(v_entry);
      else
        v_histtecnico := v_histtecnico || jsonb_build_array(v_entry);
      end if;
    end loop;

    -- Actualizar el caso
    update public.sek_cases
       set histcliente = v_histcliente,
           histtecnico = v_histtecnico
     where id = c.id;
  end loop;
end;
$$;
