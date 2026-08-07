-- =====================================================================
-- Actualización atómica del messageId de un mensaje en el historial.
--
-- Problema que resuelve:
-- persistMessageId en /api/evolution/send hacía read-modify-write
-- desde JavaScript (leer histtecnico -> buscar por texto -> escribir
-- el array completo). Esto causaba:
-- 1. Race conditions: si el webhook agregaba un mensaje entre la
--    lectura y la escritura, ese mensaje se perdía.
-- 2. Text matching frágil: si el texto no coincidía exactamente
--    (espacios, encoding), el messageId nunca se guardaba.
-- 3. Para mensajes de Drive, el mensaje no existía aún en histtecnico
--    cuando persistMessageId intentaba buscarlo.
--
-- Esta función busca por contenido (desde el final) o por cercanía de
-- tiempo, dentro de una transacción con FOR UPDATE, y actualiza solo
-- el entry que coincide, sin pisar el resto del array.
-- =====================================================================

create or replace function public.sek_set_message_id(
  p_case_id    text,
  p_col        text,
  p_match_text text default null,
  p_match_time timestamptz default null,
  p_message_id text
)
returns boolean
language plpgsql
security definer
as $$
declare
  v_hist     jsonb;
  v_entry    jsonb;
  v_idx      int;
  v_content  text;
  v_time     timestamptz;
  v_found    boolean := false;
begin
  if p_col not in ('histcliente', 'histtecnico') then
    raise exception 'sek_set_message_id: columna invalida %', p_col;
  end if;

  -- Bloquear la fila
  perform 1 from public.sek_cases where id = p_case_id for update;
  if not found then
    return false;
  end if;

  -- Leer el historial actual
  if p_col = 'histcliente' then
    select coalesce(histcliente, '[]'::jsonb) into v_hist
    from public.sek_cases where id = p_case_id;
  else
    select coalesce(histtecnico, '[]'::jsonb) into v_hist
    from public.sek_cases where id = p_case_id;
  end if;

  -- Buscar desde el final: el mensaje recién enviado es el último sin messageId
  for v_idx in reverse jsonb_array_length(v_hist) - 1 .. 0 loop
    v_entry := v_hist->v_idx;

    -- Saltar si ya tiene messageId
    if coalesce(v_entry->>'messageId', '') <> '' then
      continue;
    end if;

    -- Solo actualizar mensajes del rol correcto (tecnico/ia, no user)
    v_content := coalesce(v_entry->>'content', '');
    v_time := nullif(v_entry->>'time', '')::timestamptz;

    -- Match por texto exacto (trim) o por cercanía de tiempo (±2 min)
    if p_match_text is not null and trim(p_match_text) = trim(v_content) then
      v_found := true;
      exit;
    end if;

    if p_match_time is not null and v_time is not null then
      if abs(extract(epoch from (v_time - p_match_time))) < 120 then
        v_found := true;
        exit;
      end if;
    end if;
  end loop;

  if not v_found then
    return false;
  end if;

  -- Actualizar solo el entry encontrado
  v_entry := jsonb_set(v_entry, '{messageId}', to_jsonb(p_message_id));
  v_entry := jsonb_set(v_entry, '{fromMe}', 'true'::jsonb);
  v_hist := jsonb_set(v_hist, to_jsonb(v_idx), v_entry);

  -- Escribir de vuelta
  if p_col = 'histcliente' then
    update public.sek_cases set histcliente = v_hist where id = p_case_id;
  else
    update public.sek_cases set histtecnico = v_hist where id = p_case_id;
  end if;

  return true;
end;
$$;

grant execute on function public.sek_set_message_id(text, text, text, timestamptz, text) to service_role;
