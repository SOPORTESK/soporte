-- =====================================================================
-- Trigger: sek_auto_assign_seq
--
-- Asigna seq automáticamente a cualquier mensaje que se inserte en
-- histcliente o histtecnico sin importar cómo se inserte (RPC, update
-- directo, insert de caso nuevo, etc.).
--
-- El trigger se ejecuta BEFORE UPDATE y BEFORE INSERT en sek_cases.
-- Recorre histcliente e histtecnico, y a cualquier entry sin seq le
-- asigna max(seq en ambos arrays) + 1, en orden de aparición.
--
-- Esto garantiza que TODO mensaje tenga seq y el orden sea siempre
-- el de inserción, sin excepciones.
-- =====================================================================

create or replace function public.sek_auto_assign_seq()
returns trigger
language plpgsql
as $$
declare
  v_hc        jsonb;
  v_ht        jsonb;
  v_max_seq   int;
  v_entry     jsonb;
  v_seq       int;
  v_changed   boolean := false;
  v_new_hc    jsonb := '[]'::jsonb;
  v_new_ht    jsonb := '[]'::jsonb;
begin
  v_hc := coalesce(NEW.histcliente, '[]'::jsonb);
  v_ht := coalesce(NEW.histtecnico, '[]'::jsonb);

  -- Calcular el max seq actual sobre ambos arrays
  select coalesce(max(seq_val), 0)
    into v_max_seq
  from (
    select (e->>'seq')::int as seq_val
    from jsonb_array_elements(v_hc) as e
    where e->>'seq' is not null and (e->>'seq') ~ '^-?[0-9]+$'
    union all
    select (e->>'seq')::int as seq_val
    from jsonb_array_elements(v_ht) as e
    where e->>'seq' is not null and (e->>'seq') ~ '^-?[0-9]+$'
  ) sub;

  -- Procesar histcliente: asignar seq a entries sin seq
  v_new_hc := '[]'::jsonb;
  for i in 0..jsonb_array_length(v_hc) - 1 loop
    v_entry := v_hc->i;
    if v_entry->>'seq' is null or (v_entry->>'seq') !~ '^-?[0-9]+$' then
      v_max_seq := v_max_seq + 1;
      v_entry := v_entry || jsonb_build_object('seq', v_max_seq);
      v_changed := true;
    end if;
    v_new_hc := v_new_hc || jsonb_build_array(v_entry);
  end loop;

  -- Procesar histtecnico: asignar seq a entries sin seq
  v_new_ht := '[]'::jsonb;
  for i in 0..jsonb_array_length(v_ht) - 1 loop
    v_entry := v_ht->i;
    if v_entry->>'seq' is null or (v_entry->>'seq') !~ '^-?[0-9]+$' then
      v_max_seq := v_max_seq + 1;
      v_entry := v_entry || jsonb_build_object('seq', v_max_seq);
      v_changed := true;
    end if;
    v_new_ht := v_new_ht || jsonb_build_array(v_entry);
  end loop;

  -- Solo actualizar si hubo cambios
  if v_changed then
    NEW.histcliente := v_new_hc;
    NEW.histtecnico := v_new_ht;
  end if;

  return NEW;
end;
$$;

-- Eliminar triggers previos si existen
drop trigger if exists trg_sek_auto_seq_update on public.sek_cases;
drop trigger if exists trg_sek_auto_seq_insert on public.sek_cases;

-- Trigger BEFORE UPDATE: captura appends y updates directos
create trigger trg_sek_auto_seq_update
  before update on public.sek_cases
  for each row
  execute function public.sek_auto_assign_seq();

-- Trigger BEFORE INSERT: captura inserts de casos nuevos con mensajes iniciales
create trigger trg_sek_auto_seq_insert
  before insert on public.sek_cases
  for each row
  execute function public.sek_auto_assign_seq();

grant execute on function public.sek_auto_assign_seq() to service_role;
grant execute on function public.sek_auto_assign_seq() to anon;
