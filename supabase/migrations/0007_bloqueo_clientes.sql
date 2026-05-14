-- Campos de bloqueo progresivo en sek_clientes
alter table public.sek_clientes
  add column if not exists bloqueado         boolean   not null default false,
  add column if not exists bloqueo_contador  integer   not null default 0,
  add column if not exists fecha_bloqueo     timestamptz,
  add column if not exists motivo_bloqueo    text;

create index if not exists sek_clientes_bloqueado_idx on public.sek_clientes(bloqueado);
