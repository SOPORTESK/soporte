-- Backfill de PRUEBA: solo un caso para verificar.
do $$
declare
  v_all jsonb[];
  v_msg jsonb;
  v_seq int;
  v_sorted jsonb[];
  v_histcliente jsonb;
  v_histtecnico jsonb;
  v_entry jsonb;
  c record;
begin
  select id, histcliente, histtecnico into c
  from public.sek_cases
  where id = 'a9f825a9-0d18-47c9-bf7e-0cff46be1146';

  v_all := '{}';
  if c.histcliente is not null then
    for i in 0..jsonb_array_length(c.histcliente) - 1 loop
      v_all := array_append(v_all, c.histcliente->i || jsonb_build_object('_col', 'histcliente', '_idx', i));
    end loop;
  end if;
  if c.histtecnico is not null then
    for i in 0..jsonb_array_length(c.histtecnico) - 1 loop
      v_all := array_append(v_all, c.histtecnico->i || jsonb_build_object('_col', 'histtecnico', '_idx', i));
    end loop;
  end if;

  if array_length(v_all, 1) is null then return; end if;

  v_seq := 0;
  v_sorted := '{}';

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
    v_entry := v_msg - '_col' - '_idx';
    v_entry := v_entry || jsonb_build_object('seq', v_seq);
    if nullif(v_entry->>'messageId', '') is null then
      v_entry := v_entry || jsonb_build_object('messageId', gen_random_uuid()::text);
    end if;
    v_sorted := array_append(v_sorted, v_entry || jsonb_build_object('_col', v_msg->>'_col', '_idx', (v_msg->>'_idx')::int));
    v_seq := v_seq + 1;
  end loop;

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

  update public.sek_cases
     set histcliente = v_histcliente,
         histtecnico = v_histtecnico
   where id = c.id;
end;
$$;
