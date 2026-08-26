-- =====================================================================
-- sek_append_hist v2 — versión definitiva (reemplaza a la original).
--
-- Backup de la original: supabase/migrations/BACKUP_sek_append_hist_original.sql
-- Para restaurar: ejecutar ese archivo.
--
-- Mejoras sobre la versión original:
--   1. Genera messageId (uuid v4) si el entry no lo trae.
--   2. Asigna seq automáticamente: max(seq) + 1 sobre ambos historiales.
--   3. Deduplica por contenido (role + content + ventana de 60s) cuando
--      no hay messageId (mensajes sin ID de WhatsApp).
--
-- Mantiene:
--   - Bloqueo de fila (FOR UPDATE) para serializar appends concurrentes.
--   - Dedup por messageId sobre ambos historiales.
--   - last_message_at / last_message_preview solo se mueven si es el más reciente.
-- =====================================================================

create or replace function public.sek_append_hist(
  p_case_id        text,
  p_entry          jsonb,
  p_col            text,
  p_preview        text default null,
  p_customer_phone text default null
)
returns boolean
language plpgsql
security definer
as $$
declare
  v_msg_time  timestamptz;
  v_msg_id    text;
  v_entry     jsonb;
  v_dup       boolean;
  v_is_newest boolean;
  v_max_seq   int;
  v_new_seq   int;
  v_role      text;
  v_content   text;
begin
  if p_col not in ('histcliente', 'histtecnico') then
    raise exception 'sek_append_hist: columna invalida %', p_col;
  end if;

  -- Hora real del mensaje. Si falta o es inválida, ahora.
  begin
    v_msg_time := coalesce(nullif(p_entry->>'time', '')::timestamptz, now());
  exception when others then
    v_msg_time := now();
  end;

  v_msg_id := nullif(p_entry->>'messageId', '');

  -- 1. Si no hay messageId, generar uno (uuid v4).
  if v_msg_id is null then
    v_msg_id := gen_random_uuid()::text;
  end if;

  -- Construir el entry final con messageId garantizado.
  v_entry := p_entry || jsonb_build_object('messageId', v_msg_id);

  -- Bloquear la fila: serializa los appends concurrentes del mismo caso.
  perform 1 from public.sek_cases where id = p_case_id for update;
  if not found then
    return false;
  end if;

  -- 2. Calcular seq: max(seq) sobre ambos historiales + 1.
  select coalesce(max((e->>'seq')::int), 0)
    into v_max_seq
  from public.sek_cases c,
       jsonb_array_elements(
         coalesce(c.histcliente, '[]'::jsonb) || coalesce(c.histtecnico, '[]'::jsonb)
       ) as e
  where c.id = p_case_id
    and (e->>'seq') is not null
    and (e->>'seq') ~ '^[0-9]+$';

  v_new_seq := v_max_seq + 1;
  v_entry := v_entry || jsonb_build_object('seq', v_new_seq);

  -- 3. Deduplicación.
  -- 3a. Por messageId sobre ambos historiales.
  select exists (
    select 1
    from public.sek_cases c,
         jsonb_array_elements(
           coalesce(c.histcliente, '[]'::jsonb) || coalesce(c.histtecnico, '[]'::jsonb)
         ) as e
    where c.id = p_case_id
      and e->>'messageId' = v_msg_id
  ) into v_dup;

  if v_dup then
    return false;
  end if;

  -- 3b. Por contenido (role + content) en ventana de 60 segundos,
  --     solo cuando el messageId original era null (mensaje sin ID de WhatsApp).
  --     Si el messageId venía de WhatsApp, no aplicamos dedup por contenido
  --     porque dos mensajes con IDs distintos son mensajes distintos.
  if nullif(p_entry->>'messageId', '') is null then
    v_role := nullif(p_entry->>'role', '');
    v_content := nullif(p_entry->>'content', '');

    if v_role is not null and v_content is not null and length(v_content) > 0 then
      select exists (
        select 1
        from public.sek_cases c,
             jsonb_array_elements(
               coalesce(c.histcliente, '[]'::jsonb) || coalesce(c.histtecnico, '[]'::jsonb)
             ) as e
        where c.id = p_case_id
          and e->>'role' = v_role
          and e->>'content' = v_content
          and abs(
                extract(epoch from (e->>'time')::timestamptz - v_msg_time)
              ) <= 60
      ) into v_dup;

      if v_dup then
        return false;
      end if;
    end if;
  end if;

  -- Solo mover last_message_at/preview si este mensaje es el más reciente.
  select coalesce(last_message_at, '-infinity'::timestamptz) <= v_msg_time
    into v_is_newest
  from public.sek_cases
  where id = p_case_id;

  if p_col = 'histcliente' then
    update public.sek_cases
       set histcliente = coalesce(histcliente, '[]'::jsonb) || jsonb_build_array(v_entry),
           last_message_at = case when v_is_newest then v_msg_time else last_message_at end,
           last_message_preview = case
             when v_is_newest then coalesce(p_preview, last_message_preview)
             else last_message_preview end,
           customer_phone = coalesce(nullif(p_customer_phone, ''), customer_phone)
     where id = p_case_id;
  else
    update public.sek_cases
       set histtecnico = coalesce(histtecnico, '[]'::jsonb) || jsonb_build_array(v_entry),
           last_message_at = case when v_is_newest then v_msg_time else last_message_at end,
           last_message_preview = case
             when v_is_newest then coalesce(p_preview, last_message_preview)
             else last_message_preview end,
           customer_phone = coalesce(nullif(p_customer_phone, ''), customer_phone)
     where id = p_case_id;
  end if;

  return true;
end;
$$;

grant execute on function public.sek_append_hist(text, jsonb, text, text, text) to service_role;
