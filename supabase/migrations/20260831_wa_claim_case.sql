-- =====================================================================
-- Busqueda-o-creacion ATOMICA del caso de WhatsApp por telefono.
--
-- PROBLEMA QUE RESUELVE
-- Cuando llegan varios mensajes del mismo cliente casi simultaneos, el
-- webhook se ejecuta en paralelo (una invocacion por mensaje). Cada
-- invocacion consulta "existe un caso activo para este telefono?", todas
-- responden que no porque ninguna ha insertado todavia, y todas insertan.
-- La conversacion queda partida en varios casos y el agente ve solo un
-- fragmento.
--
-- Evidencia en produccion (telefono 50687043603, tres imagenes enviadas
-- juntas crearon tres casos en medio segundo):
--   9ed3c690  created 2026-08-27T21:06:40.027
--   0e1338bf  created 2026-08-27T21:06:40.031
--   0b5f9a3e  created 2026-08-27T21:06:40.493
-- Y con 50683443000, dos casos con 5 ms de diferencia.
--
-- COMO LO RESUELVE
-- pg_advisory_xact_lock serializa por telefono: la segunda invocacion
-- espera a que la primera termine su transaccion y entonces SI encuentra
-- el caso recien creado. El candado se libera solo al terminar la
-- transaccion, no hace falta limpiarlo.
--
-- SECCION 1 es la unica obligatoria. Las secciones 2 y 3 son opcionales
-- y estan comentadas a proposito; leer las advertencias antes de usarlas.
-- =====================================================================


-- ─────────────────────────────────────────────────────────────────────
-- SECCION 1 (OBLIGATORIA)
-- ─────────────────────────────────────────────────────────────────────

-- Normalizacion de telefono: quita el sufijo @s.whatsapp.net y todo lo
-- que no sea digito. IMMUTABLE para poder usarla en indices.
create or replace function public.sek_norm_phone(p text)
returns text
language sql
immutable
as $$
  select regexp_replace(split_part(coalesce(p, ''), '@', 1), '[^0-9]', '', 'g');
$$;


-- Reclama el caso activo de un telefono, o lo crea si no existe.
--
-- p_phone     telefono del cliente (con o sin @s.whatsapp.net)
-- p_new_case  jsonb con las columnas para el INSERT, solo se usa si hay
--             que crear el caso. Claves reconocidas: estado, prioridad,
--             customer_phone, cliente, histcliente, histtecnico, title,
--             last_message_at, last_message_preview, closed_at,
--             escalado_at, accepted_at, assigned_to, problema, marca,
--             modelo, tags.
--
-- Devuelve el id del caso y si fue creado en esta llamada (para que el
-- webhook sepa si debe mandar la bienvenida o no).
create or replace function public.sek_wa_claim_case(
  p_phone    text,
  p_new_case jsonb default '{}'::jsonb
)
returns table (case_id text, was_created boolean)
language plpgsql
security definer
-- search_path fijo: obligatorio en funciones security definer para que no
-- se pueda secuestrar la resolucion de nombres desde el caller.
set search_path = public, pg_temp
as $$
declare
  v_norm     text;
  v_last8    text;
  v_id       text;
  v_histcli  jsonb;
  v_histtec  jsonb;
  v_offset   int;
begin
  v_norm := public.sek_norm_phone(p_phone);
  if v_norm = '' then
    raise exception 'sek_wa_claim_case: telefono vacio (%)', p_phone;
  end if;
  v_last8 := right(v_norm, 8);

  -- Candado por telefono. Serializa las invocaciones concurrentes del
  -- webhook para el mismo cliente y se libera al cerrar la transaccion.
  perform pg_advisory_xact_lock(hashtext('sek_wa:' || v_norm));

  -- Buscar caso activo. Se compara normalizado sobre customer_phone y
  -- sobre los telefonos guardados dentro de cliente, porque el formato
  -- guardado ha variado historicamente entre numero pelado y JID.
  select c.id::text
    into v_id
  from public.sek_cases c
  where c.canal = 'whatsapp'
    and c.estado in ('ia_atendiendo', 'pendiente', 'escalado', 'abierto', 'calificacion_pendiente')
    and (
      public.sek_norm_phone(c.customer_phone) = v_norm
      or public.sek_norm_phone(c.cliente->>'telefono') = v_norm
      or public.sek_norm_phone(c.cliente->>'telefono_real') = v_norm
      or right(public.sek_norm_phone(c.customer_phone), 8) = v_last8
      or right(public.sek_norm_phone(c.cliente->>'telefono'), 8) = v_last8
      or right(public.sek_norm_phone(c.cliente->>'telefono_real'), 8) = v_last8
    )
  order by c.created_at desc
  limit 1;

  if v_id is not null then
    return query select v_id, false;
    return;
  end if;

  -- No hay caso activo: crearlo. Se numeran los mensajes iniciales para
  -- que el seq sea coherente con los que agregue despues
  -- sek_append_hist (que calcula max(seq)+1 sobre ambos historiales).
  v_histcli := coalesce(p_new_case->'histcliente', '[]'::jsonb);
  v_histtec := coalesce(p_new_case->'histtecnico', '[]'::jsonb);

  select coalesce(jsonb_agg(e || jsonb_build_object('seq', ord) order by ord), '[]'::jsonb)
    into v_histcli
  from jsonb_array_elements(v_histcli) with ordinality as t(e, ord);

  v_offset := jsonb_array_length(v_histcli);

  select coalesce(jsonb_agg(e || jsonb_build_object('seq', ord + v_offset) order by ord), '[]'::jsonb)
    into v_histtec
  from jsonb_array_elements(v_histtec) with ordinality as t(e, ord);

  insert into public.sek_cases (
    canal, estado, prioridad, customer_phone, cliente,
    histcliente, histtecnico, title,
    last_message_at, last_message_preview,
    closed_at, escalado_at, accepted_at, assigned_to,
    problema, marca, modelo
  ) values (
    'whatsapp',
    coalesce(nullif(p_new_case->>'estado', ''), 'ia_atendiendo'),
    coalesce(nullif(p_new_case->>'prioridad', ''), 'media'),
    -- Siempre normalizado: guardar unas veces el JID y otras el numero
    -- pelado hacia divergir el formato entre casos del mismo cliente.
    coalesce(nullif(public.sek_norm_phone(p_new_case->>'customer_phone'), ''), v_norm),
    coalesce(p_new_case->'cliente', '{}'::jsonb),
    v_histcli,
    v_histtec,
    coalesce(nullif(p_new_case->>'title', ''), 'WhatsApp — ' || v_norm),
    coalesce((nullif(p_new_case->>'last_message_at', ''))::timestamptz, now()),
    nullif(p_new_case->>'last_message_preview', ''),
    (nullif(p_new_case->>'closed_at', ''))::timestamptz,
    (nullif(p_new_case->>'escalado_at', ''))::timestamptz,
    (nullif(p_new_case->>'accepted_at', ''))::timestamptz,
    nullif(p_new_case->>'assigned_to', ''),
    nullif(p_new_case->>'problema', ''),
    nullif(p_new_case->>'marca', ''),
    nullif(p_new_case->>'modelo', '')
  )
  returning id::text into v_id;

  return query select v_id, true;
end;
$$;

grant execute on function public.sek_norm_phone(text) to service_role, authenticated;
grant execute on function public.sek_wa_claim_case(text, jsonb) to service_role;


-- ─────────────────────────────────────────────────────────────────────
-- SECCION 2 (OPCIONAL) — revisar los duplicados que YA existen
--
-- Solo consulta, no modifica nada. Sirve para ver el tamano del
-- problema historico antes de decidir si consolidar.
-- ─────────────────────────────────────────────────────────────────────

-- select public.sek_norm_phone(customer_phone) as telefono,
--        count(*) as casos_activos,
--        array_agg(id order by created_at) as ids,
--        array_agg(created_at order by created_at) as creados
--   from public.sek_cases
--  where canal = 'whatsapp'
--    and estado in ('ia_atendiendo','pendiente','escalado','abierto','calificacion_pendiente')
--  group by 1
-- having count(*) > 1
--  order by 2 desc;


-- ─────────────────────────────────────────────────────────────────────
-- SECCION 3 (OPCIONAL, RIESGOSA) — indice unico como red de seguridad
--
-- ADVERTENCIA 1: falla al crearse si ya hay telefonos con mas de un
--   caso activo. Hay que consolidarlos primero (ver SECCION 2).
-- ADVERTENCIA 2: una vez creado, cualquier INSERT que intente abrir un
--   segundo caso activo para el mismo telefono lanza error en vez de
--   crear el duplicado. Eso es lo deseable en el webhook, pero puede
--   romper otros caminos que crean casos (p. ej. /api/cases/outbound)
--   si no manejan el error.
--
-- Con la SECCION 1 aplicada y el webhook usando sek_wa_claim_case, la
-- carrera ya esta cerrada y este indice no es necesario. Queda aqui
-- como defensa en profundidad para quien la quiera.
-- ─────────────────────────────────────────────────────────────────────

-- create unique index concurrently if not exists sek_cases_uniq_active_wa_phone
--   on public.sek_cases (public.sek_norm_phone(customer_phone))
--   where canal = 'whatsapp'
--     and estado in ('ia_atendiendo','pendiente','escalado','abierto','calificacion_pendiente');
