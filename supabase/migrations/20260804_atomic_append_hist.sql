-- =====================================================================
-- Append atomico de mensajes al historial de un caso.
--
-- Problema que resuelve:
-- El webhook de Evolution hacia read-modify-write desde JavaScript
-- (leer histcliente -> concatenar en memoria -> escribir el array completo).
-- Al correr en serverless hay varias invocaciones concurrentes, asi que dos
-- mensajes seguidos del mismo cliente leian el mismo array base y la segunda
-- escritura sobrescribia a la primera: el mensaje se perdia sin error ni log.
-- El mutex en memoria (dbMutexMap) no protegia nada porque no se comparte
-- entre instancias.
--
-- Aqui el append ocurre dentro de una sola transaccion que bloquea la fila
-- (FOR UPDATE) y concatena con el operador jsonb ||, asi que es seguro sin
-- importar cuantas instancias escriban al mismo tiempo.
--
-- Ademas deduplica por messageId (el id que WhatsApp asigna a cada mensaje)
-- en lugar de comparar el texto, que descartaba respuestas repetidas
-- legitimas como "1", "si" u "ok".
--
-- Devuelve true si el mensaje se agrego, false si se ignoro por duplicado
-- o porque el caso no existe.
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
  v_dup       boolean;
  v_is_newest boolean;
begin
  if p_col not in ('histcliente', 'histtecnico') then
    raise exception 'sek_append_hist: columna invalida %', p_col;
  end if;

  -- Hora real del mensaje segun WhatsApp (viene en el entry). Si falta, ahora.
  begin
    v_msg_time := coalesce(nullif(p_entry->>'time', '')::timestamptz, now());
  exception when others then
    v_msg_time := now();
  end;

  v_msg_id := nullif(p_entry->>'messageId', '');

  -- Bloquear la fila: serializa los appends concurrentes del mismo caso.
  perform 1 from public.sek_cases where id = p_case_id for update;
  if not found then
    return false;
  end if;

  -- Dedupe por messageId sobre ambos historiales.
  if v_msg_id is not null then
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
  end if;

  -- Solo mover last_message_at/preview si este mensaje es el mas reciente,
  -- para que uno que llegue fuera de orden no pise al ultimo.
  select coalesce(last_message_at, '-infinity'::timestamptz) <= v_msg_time
    into v_is_newest
  from public.sek_cases
  where id = p_case_id;

  if p_col = 'histcliente' then
    update public.sek_cases
       set histcliente = coalesce(histcliente, '[]'::jsonb) || jsonb_build_array(p_entry),
           last_message_at = case when v_is_newest then v_msg_time else last_message_at end,
           last_message_preview = case
             when v_is_newest then coalesce(p_preview, last_message_preview)
             else last_message_preview end,
           customer_phone = coalesce(nullif(p_customer_phone, ''), customer_phone)
     where id = p_case_id;
  else
    update public.sek_cases
       set histtecnico = coalesce(histtecnico, '[]'::jsonb) || jsonb_build_array(p_entry),
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
