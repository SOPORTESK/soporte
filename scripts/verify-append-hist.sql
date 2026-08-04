-- Verificacion de sek_append_hist: crea un caso desechable, ejercita los casos
-- limite y lo borra en la misma llamada. No toca datos reales.
do $$
declare
  v_id text := 'zz-test-append-hist';
  r1 boolean; r2 boolean; r3 boolean; r4 boolean;
begin
  execute 'drop table if exists zz_res';
  delete from public.sek_cases where id = v_id;

  insert into public.sek_cases (id, canal, estado, prioridad, customer_phone, cliente, histcliente, histtecnico, title)
  values (v_id, 'whatsapp', 'cerrado', 'media', '50600000000', '{}'::jsonb, '[]'::jsonb, '[]'::jsonb, 'TEST sek_append_hist');

  -- dos mensajes nuevos
  r1 := public.sek_append_hist(v_id, '{"role":"user","content":"primero","time":"2026-08-04T10:00:00Z","messageId":"MSG_A"}'::jsonb, 'histcliente', 'primero', '50600000000');
  r2 := public.sek_append_hist(v_id, '{"role":"user","content":"segundo","time":"2026-08-04T10:00:05Z","messageId":"MSG_B"}'::jsonb, 'histcliente', 'segundo', '50600000000');
  -- mismo messageId que el primero: debe ignorarse
  r3 := public.sek_append_hist(v_id, '{"role":"user","content":"REPETIDO","time":"2026-08-04T10:00:07Z","messageId":"MSG_A"}'::jsonb, 'histcliente', 'repetido', '50600000000');
  -- mensaje mas viejo: debe guardarse pero sin mover last_message_at/preview
  r4 := public.sek_append_hist(v_id, '{"role":"user","content":"viejo","time":"2026-08-04T09:00:00Z","messageId":"MSG_C"}'::jsonb, 'histcliente', 'viejo', '50600000000');

  create temp table zz_res as
    select r1 as a1, r2 as a2, r3 as a3, r4 as a4;
end $$;

with v as (
  select histcliente, last_message_at, last_message_preview
  from public.sek_cases where id = 'zz-test-append-hist'
),
d as (
  delete from public.sek_cases where id = 'zz-test-append-hist' returning 1
)
select
  (select a1 from zz_res)                as ap1_nuevo_esperado_true,
  (select a2 from zz_res)                as ap2_nuevo_esperado_true,
  (select a3 from zz_res)                as ap3_duplicado_esperado_false,
  (select a4 from zz_res)                as ap4_viejo_esperado_true,
  jsonb_array_length(v.histcliente)      as total_esperado_3,
  v.histcliente->0->>'content'           as msg1,
  v.histcliente->1->>'content'           as msg2,
  v.histcliente->2->>'content'           as msg3,
  v.last_message_at                      as last_msg_esperado_10_00_05,
  v.last_message_preview                 as preview_esperado_segundo,
  (select count(*) from d)               as filas_borradas
from v;
